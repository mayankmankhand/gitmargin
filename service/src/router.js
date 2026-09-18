// Every request the service answers goes through `route`. `API.md` is the
// contract this file implements; read that first.
//
// `route` takes a plain object and returns a plain object, and depends on no
// npm package. That is deliberate: Vercel calls it through `api/index.js`, the
// tests call it through `tests/helpers/service-server.js`, and because neither
// wrapper holds any logic the two can never drift apart. The database arrives
// as one function, `query(sql, params) -> rows`, and the clock as `now()`, so
// production hands in Neon and real time while the tests hand in an in-process
// Postgres and a clock they control.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ensureSchema } from './schema.js';
import {
  LIMITS,
  STATUSES,
  cleanComment,
  cleanIntent,
  cleanName,
  cleanText,
  isCommentId,
  isHash,
  isReplyId,
  isToken,
  isVersionId,
} from './validate.js';

/**
 * A page opened from disk has the origin "null", and a stored page is served
 * sandboxed, which gives it an opaque origin too. Neither can be named in an
 * allow-list, so the service answers any origin and relies on the page key
 * (and, for the author, the secret) instead. No cookies are ever used, so an
 * open origin exposes nothing a caller could not already reach with curl.
 */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization, x-gitmargin-token',
  'access-control-max-age': '86400',
};

const json = (status, body) => ({
  status,
  headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});
const refuse = (status, error) => json(status, { error });

const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');
const iso = (value) => new Date(value).toISOString();

/** Compared as digests so the comparison takes the same time for any guess. */
function secretMatches(headers, secret) {
  // An unset secret must never match an empty header: a deployment that
  // forgot the variable would otherwise hand author rights to everyone.
  if (!secret) return false;
  const sent = /^Bearer (.+)$/i.exec(String(headers.authorization || ''));
  if (!sent) return false;
  return timingSafeEqual(Buffer.from(sha256(sent[1]), 'hex'), Buffer.from(sha256(secret), 'hex'));
}

// ---- reads ----------------------------------------------------------------

function replyOnWire(row) {
  return {
    id: row.id,
    time: iso(row.created),
    updated: iso(row.updated),
    author: { name: row.author_name },
    text: row.text,
  };
}

function commentOnWire(row, replies) {
  if (row.deleted_at) return { id: row.id, deleted: true, updated: iso(row.updated) };
  return {
    ...row.body,
    id: row.id,
    version_id: row.version_id,
    author: { name: row.author_name },
    status: row.status,
    updated: iso(row.updated),
    replies: replies.filter((r) => r.comment_id === row.id).map(replyOnWire),
  };
}

async function liveReplies(query, key, commentIds) {
  if (!commentIds.length) return [];
  return query(
    `select * from replies
      where prototype_key = $1 and comment_id = any($2::text[]) and deleted_at is null
      order by created, id`,
    [key, commentIds],
  );
}

async function oneComment(query, key, id) {
  const rows = await query('select * from comments where prototype_key = $1 and id = $2', [key, id]);
  if (!rows[0]) return null;
  return commentOnWire(rows[0], await liveReplies(query, key, [id]));
}

async function listComments({ query, now }, prototype, params) {
  const versions = await query(
    `select v.version_id, v.round, v.created, (v.html is not null) as has_page,
            (select count(*) from comments c
              where c.prototype_key = v.prototype_key and c.version_id = v.version_id
                and c.deleted_at is null)::int as comments
       from versions v where v.prototype_key = $1 order by v.round desc`,
    [prototype.key],
  );
  const latest = versions[0] ? versions[0].version_id : null;
  const version = params.version || latest;
  if (version && !versions.some((v) => v.version_id === version)) return refuse(400, 'unknown_version');

  let since = null;
  if (params.since) {
    since = new Date(params.since);
    if (Number.isNaN(since.getTime())) return refuse(400, 'invalid');
  }
  // Read the clock BEFORE the rows. A comment written between the two reads is
  // then at or after `server_time` and arrives on the next poll; read the other
  // way round, it could fall in the gap and never arrive.
  const serverTime = now();
  const rows = version
    ? await query(
        `select * from comments
          where prototype_key = $1 and version_id = $2
            and ($3::timestamptz is null and deleted_at is null or updated >= $3::timestamptz)
          order by created, id`,
        [prototype.key, version, since ? since.toISOString() : null],
      )
    : [];
  const replies = await liveReplies(query, prototype.key, rows.filter((r) => !r.deleted_at).map((r) => r.id));

  return json(200, {
    prototype: { name: prototype.name },
    latest,
    version,
    versions: versions.map((v) => ({
      version_id: v.version_id,
      round: v.round,
      created: iso(v.created),
      comments: v.comments,
      has_page: v.has_page,
    })),
    comments: rows.map((row) => commentOnWire(row, replies)),
    server_time: serverTime.toISOString(),
  });
}

// ---- writes ---------------------------------------------------------------

/**
 * At most 60 writes per prototype in any 60 seconds. The key can be public, so
 * without this one script could fill the author's database in a minute.
 */
async function overWriteLimit({ query, now }, key) {
  const at = now();
  const windowStart = new Date(at.getTime() - 60_000).toISOString();
  const [{ n }] = await query('select count(*)::int as n from writes where prototype_key = $1 and at > $2', [
    key,
    windowStart,
  ]);
  if (n >= LIMITS.writesPerMinute) return true;
  await query('insert into writes (prototype_key, at) values ($1, $2)', [key, at.toISOString()]);
  // Housekeeping rides along with the write it follows; an hour is far outside the window.
  await query('delete from writes where prototype_key = $1 and at < $2', [
    key,
    new Date(at.getTime() - 3_600_000).toISOString(),
  ]);
  return false;
}

async function addComment(deps, key, token, body) {
  const { query, now } = deps;
  const cleaned = cleanComment(body && body.comment);
  if (cleaned.error) return refuse(400, cleaned.error);
  if (!isVersionId(body.version_id)) return refuse(400, 'invalid');
  const known = await query('select 1 from versions where prototype_key = $1 and version_id = $2', [
    key,
    body.version_id,
  ]);
  if (!known[0]) return refuse(400, 'unknown_version');

  const id = cleaned.body.id;
  const before = await query('select token_hash from comments where prototype_key = $1 and id = $2', [key, id]);
  if (!before[0]) {
    const [{ n }] = await query(
      'select count(*)::int as n from comments where prototype_key = $1 and deleted_at is null',
      [key],
    );
    if (n >= LIMITS.comments) return refuse(409, 'full');
  }

  const at = now().toISOString();
  // `on conflict do nothing` rather than check-then-insert: a retry racing the
  // request it is retrying must end as one row, not as a constraint error.
  const inserted = await query(
    `insert into comments (prototype_key, id, version_id, author_name, body, status, token_hash, created, updated)
     values ($1, $2, $3, $4, $5::jsonb, 'open', $6, $7, $7)
     on conflict (prototype_key, id) do nothing returning id`,
    [key, id, body.version_id, cleanName(body.author && body.author.name), JSON.stringify(cleaned.body), sha256(token), at],
  );
  if (!inserted[0]) {
    const held = await query('select token_hash from comments where prototype_key = $1 and id = $2', [key, id]);
    if (held[0].token_hash !== sha256(token)) return refuse(409, 'id_taken');
  }
  return json(inserted[0] ? 201 : 200, await oneComment(query, key, id));
}

/** The live comment, only when `token` created it. Otherwise the refusal to send. */
async function ownComment(query, key, id, token) {
  const rows = await query('select token_hash, deleted_at from comments where prototype_key = $1 and id = $2', [key, id]);
  if (!rows[0] || rows[0].deleted_at) return { refusal: refuse(404, 'not_found') };
  if (rows[0].token_hash !== sha256(token)) return { refusal: refuse(403, 'not_yours') };
  return {};
}

async function editComment({ query, now }, key, id, token, body) {
  const own = await ownComment(query, key, id, token);
  if (own.refusal) return own.refusal;
  const cleaned = cleanIntent(body && body.intent);
  if (cleaned.error) return refuse(400, cleaned.error);
  await query(
    `update comments set body = jsonb_set(body, '{intent}', $3::jsonb), updated = $4
      where prototype_key = $1 and id = $2`,
    [key, id, JSON.stringify(cleaned.intent), now().toISOString()],
  );
  return json(200, await oneComment(query, key, id));
}

async function removeComment({ query, now }, key, id) {
  const at = now().toISOString();
  const rows = await query(
    `update comments set deleted_at = $3, updated = $3
      where prototype_key = $1 and id = $2 and deleted_at is null returning id`,
    [key, id, at],
  );
  if (!rows[0]) return refuse(404, 'not_found');
  return json(200, { id, deleted: true, updated: at });
}

/** Any reply write moves the parent, because "changed since" reads the parent. */
const touchComment = (query, key, id, at) =>
  query('update comments set updated = $3 where prototype_key = $1 and id = $2', [key, id, at]);

async function addReply({ query, now }, key, commentId, token, body) {
  if (!body || !isReplyId(body.id)) return refuse(400, 'invalid');
  const text = cleanText(body.text);
  if (text.error) return refuse(400, text.error);
  const parent = await query('select deleted_at from comments where prototype_key = $1 and id = $2', [key, commentId]);
  if (!parent[0] || parent[0].deleted_at) return refuse(404, 'not_found');

  const before = await query(
    'select 1 from replies where prototype_key = $1 and comment_id = $2 and id = $3',
    [key, commentId, body.id],
  );
  if (!before[0]) {
    const [{ n }] = await query(
      'select count(*)::int as n from replies where prototype_key = $1 and comment_id = $2 and deleted_at is null',
      [key, commentId],
    );
    if (n >= LIMITS.replies) return refuse(409, 'full');
  }

  const at = now().toISOString();
  const inserted = await query(
    `insert into replies (prototype_key, comment_id, id, author_name, text, token_hash, created, updated)
     values ($1, $2, $3, $4, $5, $6, $7, $7)
     on conflict (prototype_key, comment_id, id) do nothing returning id`,
    [key, commentId, body.id, cleanName(body.author && body.author.name), text.text, sha256(token), at],
  );
  if (inserted[0]) {
    await touchComment(query, key, commentId, at);
  } else {
    const held = await query(
      'select token_hash from replies where prototype_key = $1 and comment_id = $2 and id = $3',
      [key, commentId, body.id],
    );
    if (held[0].token_hash !== sha256(token)) return refuse(409, 'id_taken');
  }
  return json(inserted[0] ? 201 : 200, await oneComment(query, key, commentId));
}

async function changeReply({ query, now }, key, commentId, replyId, token, body, remove) {
  const rows = await query(
    `select r.token_hash from replies r join comments c
        on c.prototype_key = r.prototype_key and c.id = r.comment_id
      where r.prototype_key = $1 and r.comment_id = $2 and r.id = $3
        and r.deleted_at is null and c.deleted_at is null`,
    [key, commentId, replyId],
  );
  if (!rows[0]) return refuse(404, 'not_found');
  if (rows[0].token_hash !== sha256(token)) return refuse(403, 'not_yours');

  const at = now().toISOString();
  if (remove) {
    await query(
      'update replies set deleted_at = $4, updated = $4 where prototype_key = $1 and comment_id = $2 and id = $3',
      [key, commentId, replyId, at],
    );
  } else {
    const text = cleanText(body && body.text);
    if (text.error) return refuse(400, text.error);
    await query(
      'update replies set text = $4, updated = $5 where prototype_key = $1 and comment_id = $2 and id = $3',
      [key, commentId, replyId, text.text, at],
    );
  }
  await touchComment(query, key, commentId, at);
  return json(200, await oneComment(query, key, commentId));
}

// ---- author ---------------------------------------------------------------

async function createPrototype({ query, now }, body) {
  const name = cleanName(body && body.name) || 'prototype';
  const key = `gm_${randomBytes(16).toString('base64url')}`;
  await query('insert into prototypes (key, name, created) values ($1, $2, $3)', [key, name, now().toISOString()]);
  return json(201, { key });
}

async function registerVersion({ query, now }, key, body) {
  if (!body || !isHash(body.hash)) return refuse(400, 'invalid');
  if (body.html !== undefined && typeof body.html !== 'string') return refuse(400, 'invalid');
  const fits = typeof body.html === 'string' && Buffer.byteLength(body.html, 'utf8') <= LIMITS.pageBytes;
  const html = fits ? body.html : null;

  const versions = await query(
    'select version_id, round, hash, (html is not null) as has_page from versions where prototype_key = $1 order by round desc',
    [key],
  );
  const newest = versions[0];
  if (newest && newest.hash === body.hash) {
    // Unchanged content is the same version. A page that arrives late (the
    // first attempt was too large, or predates stored pages) is still kept.
    if (html && !newest.has_page) {
      await query('update versions set html = $3 where prototype_key = $1 and version_id = $2', [key, newest.version_id, html]);
    }
    return json(200, {
      version_id: newest.version_id,
      round: newest.round,
      created: false,
      page_stored: newest.has_page || Boolean(html),
    });
  }
  if (versions.length >= LIMITS.versions) return refuse(409, 'full');

  const round = (newest ? newest.round : 0) + 1;
  const versionId = `v${round}-${body.hash}`;
  await query(
    'insert into versions (prototype_key, version_id, round, hash, file, html, created) values ($1, $2, $3, $4, $5, $6, $7)',
    [key, versionId, round, body.hash, cleanName(body.file) || null, html, now().toISOString()],
  );
  // Pages are the bulk of the storage, and Neon's free tier is about half a
  // gigabyte. Older versions keep every comment and lose only the page.
  await query('update versions set html = null where prototype_key = $1 and html is not null and round <= $2', [
    key,
    round - LIMITS.pagesKept,
  ]);
  return json(201, { version_id: versionId, round, created: true, page_stored: Boolean(html) });
}

async function setStatus({ query, now }, key, id, body) {
  if (!body || !STATUSES.includes(body.status)) return refuse(400, 'invalid');
  const rows = await query(
    `update comments set status = $3, updated = $4
      where prototype_key = $1 and id = $2 and deleted_at is null returning id`,
    [key, id, body.status, now().toISOString()],
  );
  if (!rows[0]) return refuse(404, 'not_found');
  return json(200, await oneComment(query, key, id));
}

// ---- dispatch -------------------------------------------------------------

const KEY = '(gm_[A-Za-z0-9_-]{10,40})';
const AUTHOR_VERSIONS = new RegExp(`^/api/prototypes/${KEY}/versions$`);
const AUTHOR_COMMENT = new RegExp(`^/api/prototypes/${KEY}/comments/([^/]+)(/status)?$`);
const COMMENTS = new RegExp(`^/api/p/${KEY}/comments$`);
const COMMENT = new RegExp(`^/api/p/${KEY}/comments/([^/]+)$`);
const REPLIES = new RegExp(`^/api/p/${KEY}/comments/([^/]+)/replies$`);
const REPLY = new RegExp(`^/api/p/${KEY}/comments/([^/]+)/replies/([^/]+)$`);

async function findPrototype(query, key) {
  const rows = await query('select key, name from prototypes where key = $1', [key]);
  return rows[0] || null;
}

async function dispatch(request, deps) {
  const { query } = deps;
  const method = String(request.method || 'GET').toUpperCase();
  const path = String(request.path || '/').replace(/\/+$/, '') || '/';
  const headers = request.headers || {};
  const body = request.body && typeof request.body === 'object' ? request.body : null;
  let m;

  if (method === 'GET' && path === '/api/ping') {
    const rows = await query('select 1 as ok');
    return json(200, { ok: rows[0] && rows[0].ok === 1, time: deps.now().toISOString() });
  }

  // Author routes. The secret is checked before anything is looked up, so a
  // wrong secret learns nothing about which prototypes exist.
  if (path.startsWith('/api/prototypes')) {
    if (!secretMatches(headers, deps.secret)) return refuse(401, 'unauthorized');
    await ensureSchema(query);
    if (method === 'POST' && path === '/api/prototypes') return createPrototype(deps, body);
    if ((m = AUTHOR_VERSIONS.exec(path)) && method === 'POST') {
      if (!(await findPrototype(query, m[1]))) return refuse(404, 'not_found');
      return registerVersion(deps, m[1], body);
    }
    if ((m = AUTHOR_COMMENT.exec(path)) && isCommentId(m[2])) {
      if (!(await findPrototype(query, m[1]))) return refuse(404, 'not_found');
      if (m[3] && method === 'PATCH') return setStatus(deps, m[1], m[2], body);
      if (!m[3] && method === 'DELETE') return removeComment(deps, m[1], m[2]);
    }
    return refuse(404, 'not_found');
  }

  // Key routes.
  m = COMMENTS.exec(path) || COMMENT.exec(path) || REPLIES.exec(path) || REPLY.exec(path);
  if (!m) return refuse(404, 'not_found');
  await ensureSchema(query);
  const prototype = await findPrototype(query, m[1]);
  if (!prototype) return refuse(404, 'not_found');
  const key = prototype.key;

  if (method === 'GET' && COMMENTS.test(path)) return listComments(deps, prototype, request.query || {});
  if (method === 'GET') return refuse(404, 'not_found');

  // Everything below changes something, so it needs a token and a free slot in the minute.
  const token = headers['x-gitmargin-token'];
  if (!isToken(token)) return refuse(400, 'invalid');
  if (await overWriteLimit(deps, key)) return refuse(429, 'slow_down');

  if (COMMENTS.test(path) && method === 'POST') return addComment(deps, key, token, body);
  if ((m = COMMENT.exec(path)) && isCommentId(m[2])) {
    if (method === 'PATCH') return editComment(deps, key, m[2], token, body);
    if (method === 'DELETE') {
      const own = await ownComment(query, key, m[2], token);
      return own.refusal || removeComment(deps, key, m[2]);
    }
  }
  if ((m = REPLIES.exec(path)) && isCommentId(m[2]) && method === 'POST') return addReply(deps, key, m[2], token, body);
  if ((m = REPLY.exec(path)) && isCommentId(m[2]) && isReplyId(m[3])) {
    if (method === 'PATCH') return changeReply(deps, key, m[2], m[3], token, body, false);
    if (method === 'DELETE') return changeReply(deps, key, m[2], m[3], token, null, true);
  }
  return refuse(404, 'not_found');
}

/**
 * @param {{method: string, path: string, query?: Record<string,string>, headers: Record<string,string>, body: unknown}} request
 * @param {{query: (sql: string, params?: unknown[]) => Promise<object[]>, now: () => Date, secret: string}} deps
 * @returns {Promise<{status: number, headers: Record<string,string>, body: string}>}
 */
export async function route(request, deps) {
  // The browser asks permission before any request that carries a JSON body or
  // a custom header. Answer it for every path, or nothing else is reachable.
  if (String(request.method || '').toUpperCase() === 'OPTIONS') return { status: 204, headers: CORS, body: '' };
  try {
    return await dispatch(request, deps);
  } catch (error) {
    // A raw database error names tables and hosts. The caller gets a plain
    // refusal it can show; the detail goes to the function's own log only.
    if (deps.log) deps.log(error);
    return refuse(503, 'service_unavailable');
  }
}
