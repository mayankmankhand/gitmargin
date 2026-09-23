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
import * as signin from './signin.js';
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
 * open origin exposes nothing a caller could not already reach with curl. Sign-in
 * (issue #18) keeps that true: a pass travels in a header, never in a cookie.
 */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization, x-gitmargin-token, x-gitmargin-pass',
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

/** A typed name is just a name. One written under sign-in says who vouched for it. */
function authorOnWire(row) {
  if (!row.author_provider) return { name: row.author_name };
  return { name: row.author_name, provider: row.author_provider, username: row.author_username || '', verified: true };
}

function replyOnWire(row) {
  return {
    id: row.id,
    time: iso(row.created),
    updated: iso(row.updated),
    author: authorOnWire(row),
    text: row.text,
  };
}

function commentOnWire(row, replies) {
  if (row.deleted_at) return { id: row.id, deleted: true, updated: iso(row.updated) };
  return {
    ...row.body,
    id: row.id,
    version_id: row.version_id,
    author: authorOnWire(row),
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
    // The new fields appear only when sign-in is on, so a prototype without it answers byte for byte as before.
    prototype:
      prototype.identity && prototype.identity !== 'none'
        ? { name: prototype.name, identity: prototype.identity, read: prototype.read_rule, members: prototype.members }
        : { name: prototype.name },
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
  // Counted and recorded in ONE statement. As two, every request of a parallel
  // burst read the same low count before any of them had recorded itself, and
  // the limit did nothing against exactly the scripted sender it exists for
  // (review of the #15 cycle, R3). Still a soft limit at the edge: two statements
  // that truly overlap can each see the other's row missing, so a burst can
  // overshoot by its own width, once, and is then held.
  const recorded = await query(
    `insert into writes (prototype_key, at)
     select $1::text, $2::timestamptz
      where (select count(*) from writes where prototype_key = $1 and at > $3::timestamptz) < $4
     returning 1 as ok`,
    [key, at.toISOString(), windowStart, LIMITS.writesPerMinute],
  );
  if (!recorded[0]) return true;
  // Housekeeping rides along with the write it follows; an hour is far outside the window.
  await query('delete from writes where prototype_key = $1 and at < $2', [
    key,
    new Date(at.getTime() - 3_600_000).toISOString(),
  ]);
  return false;
}

async function addComment(deps, key, token, body, session) {
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
  const at = now().toISOString();
  // One statement does three jobs. `on conflict do nothing` rather than
  // check-then-insert: a retry racing the request it is retrying must end as
  // one row, not as a constraint error. The cap is a condition of the insert
  // rather than a count taken beforehand, for the reason the write limit is
  // (review R3). Only live comments count, so the author removing one makes room:
  // the cap is recoverable by design. What stops add-then-remove from filling the
  // database is that a removed comment keeps no text (removeComment, review R2).
  const inserted = await query(
    `insert into comments (prototype_key, id, version_id, author_name, body, status, token_hash, created, updated,
                           author_provider, author_subject, author_username)
     select $1::text, $2::text, $3::text, $4::text, $5::jsonb, 'open', $6::text, $7::timestamptz, $7::timestamptz,
            $9::text, $10::text, $11::text
      where (select count(*) from comments where prototype_key = $1 and deleted_at is null) < $8
     on conflict (prototype_key, id) do nothing returning id`,
    [key, id, body.version_id, writerName(session, body), JSON.stringify(cleaned.body), sha256(token), at, LIMITS.comments, ...writerIdentity(session)],
  );
  if (!inserted[0]) {
    const held = await query('select token_hash from comments where prototype_key = $1 and id = $2', [key, id]);
    if (!held[0]) return refuse(409, 'full'); // nothing was there to conflict with, so the cap said no
    if (held[0].token_hash !== sha256(token)) return refuse(409, 'id_taken');
  }
  return json(inserted[0] ? 201 : 200, await oneComment(query, key, id));
}

/**
 * The name and identity a write is stored under. With a pass, both come from the
 * pass and whatever the request body claims is ignored.
 */
const writerName = (session, body) => (session ? cleanName(session.name) : cleanName(body && body.author && body.author.name));
const writerIdentity = (session) => (session ? [session.provider, session.subject, session.username || ''] : [null, null, null]);

/**
 * "Your own", for both kinds of row. A comment or reply keeps the rule it was
 * created under: written under sign-in it belongs to that verified person, on
 * any browser, and no token opens it; written under a typed name it belongs to
 * the token that made it.
 */
function isOwn(row, token, session) {
  if (row.author_subject) return Boolean(session && session.provider === row.author_provider && session.subject === row.author_subject);
  return row.token_hash === sha256(token);
}

/** The live comment, only when the writer owns it. Otherwise the refusal to send. */
async function ownComment(query, key, id, token, session) {
  const rows = await query(
    'select token_hash, deleted_at, author_provider, author_subject from comments where prototype_key = $1 and id = $2',
    [key, id],
  );
  if (!rows[0] || rows[0].deleted_at) return { refusal: refuse(404, 'not_found') };
  if (!isOwn(rows[0], token, session)) return { refusal: refuse(403, 'not_yours') };
  return {};
}

async function editComment({ query, now }, key, id, token, body, session) {
  const own = await ownComment(query, key, id, token, session);
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
  // The row stays, because other people's open panels learn of the removal from
  // it. Its content does not: a tombstone that kept a 32 KB body was free storage
  // for anyone with the key, since removed rows do not count toward the cap
  // (review of the #15 cycle, R2).
  const rows = await query(
    `update comments set deleted_at = $3, updated = $3, body = '{}'::jsonb, author_name = '',
            author_provider = null, author_subject = null, author_username = null
      where prototype_key = $1 and id = $2 and deleted_at is null returning id`,
    [key, id, at],
  );
  if (!rows[0]) return refuse(404, 'not_found');
  await query("update replies set deleted_at = coalesce(deleted_at, $3), updated = $3, text = '', author_name = '' where prototype_key = $1 and comment_id = $2", [key, id, at]);
  // Every page load starts with a full list, so a tombstone only ever matters to
  // a panel that was open when it happened. A week is far longer than that.
  const stale = new Date(now().getTime() - 7 * 24 * 3_600_000).toISOString();
  await query('delete from replies where prototype_key = $1 and deleted_at < $2', [key, stale]);
  await query('delete from comments where prototype_key = $1 and deleted_at < $2', [key, stale]);
  return json(200, { id, deleted: true, updated: at });
}

/** Any reply write moves the parent, because "changed since" reads the parent. */
const touchComment = (query, key, id, at) =>
  query('update comments set updated = $3 where prototype_key = $1 and id = $2', [key, id, at]);

async function addReply({ query, now }, key, commentId, token, body, session) {
  if (!body || !isReplyId(body.id)) return refuse(400, 'invalid');
  const text = cleanText(body.text);
  if (text.error) return refuse(400, text.error);
  const parent = await query('select deleted_at from comments where prototype_key = $1 and id = $2', [key, commentId]);
  if (!parent[0] || parent[0].deleted_at) return refuse(404, 'not_found');

  const at = now().toISOString();
  const inserted = await query(
    `insert into replies (prototype_key, comment_id, id, author_name, text, token_hash, created, updated,
                          author_provider, author_subject, author_username)
     select $1::text, $2::text, $3::text, $4::text, $5::text, $6::text, $7::timestamptz, $7::timestamptz,
            $9::text, $10::text, $11::text
      where (select count(*) from replies where prototype_key = $1 and comment_id = $2 and deleted_at is null) < $8
     on conflict (prototype_key, comment_id, id) do nothing returning id`,
    [key, commentId, body.id, writerName(session, body), text.text, sha256(token), at, LIMITS.replies, ...writerIdentity(session)],
  );
  if (inserted[0]) {
    await touchComment(query, key, commentId, at);
  } else {
    const held = await query(
      'select token_hash from replies where prototype_key = $1 and comment_id = $2 and id = $3',
      [key, commentId, body.id],
    );
    if (!held[0]) return refuse(409, 'full'); // nothing to conflict with, so the reply cap said no
    if (held[0].token_hash !== sha256(token)) return refuse(409, 'id_taken');
  }
  return json(inserted[0] ? 201 : 200, await oneComment(query, key, commentId));
}

async function changeReply({ query, now }, key, commentId, replyId, token, body, remove, session) {
  const rows = await query(
    `select r.token_hash, r.author_provider, r.author_subject from replies r join comments c
        on c.prototype_key = r.prototype_key and c.id = r.comment_id
      where r.prototype_key = $1 and r.comment_id = $2 and r.id = $3
        and r.deleted_at is null and c.deleted_at is null`,
    [key, commentId, replyId],
  );
  if (!rows[0]) return refuse(404, 'not_found');
  if (!isOwn(rows[0], token, session)) return refuse(403, 'not_yours');

  const at = now().toISOString();
  if (remove) {
    await query(
      "update replies set deleted_at = $4, updated = $4, text = '', author_name = '', author_provider = null, author_subject = null, author_username = null where prototype_key = $1 and comment_id = $2 and id = $3",
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

async function createPrototype({ query, now, sameProject }, body) {
  const name = cleanName(body && body.name) || 'prototype';
  const key = `gm_${randomBytes(16).toString('base64url')}`;
  if (sameProject) {
    // Same-project mode (issue #19): one prototype per deployment. The check is
    // part of the insert, like every limit, and soft at the edge like them: two
    // statements that truly overlap can each miss the other's row (review of
    // #19, R17). Only the author, who holds the secret, can race it. A second
    // one that slips through is served like the first, on the same address;
    // this refusal and the front door both name the oldest.
    const made = await query(
      'insert into prototypes (key, name, created) select $1::text, $2::text, $3::timestamptz where not exists (select 1 from prototypes) returning key',
      [key, name, now().toISOString()],
    );
    if (made[0]) return json(201, { key });
    const held = await query('select key from prototypes order by created, key limit 1');
    return json(409, { error: 'one_prototype', key: held[0] ? held[0].key : null });
  }
  await query('insert into prototypes (key, name, created) values ($1, $2, $3)', [key, name, now().toISOString()]);
  return json(201, { key });
}

async function registerVersion(deps, key, body) {
  const { query, now } = deps;
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
    // Unchanged content is the same version, but the page is still replaced:
    // `attach` registers first to learn the version id, then sends the finished
    // page, and a re-attach after an overlay fix must not leave the stored copy
    // running the old overlay.
    if (html) {
      await query('update versions set html = $3 where prototype_key = $1 and version_id = $2', [key, newest.version_id, html]);
    }
    return json(200, {
      version_id: newest.version_id,
      round: newest.round,
      created: false,
      page_stored: newest.has_page || Boolean(html),
      ...(deps.sameProject ? { same_project: true } : {}),
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
  return json(201, {
    version_id: versionId,
    round,
    created: true,
    page_stored: Boolean(html),
    ...(deps.sameProject ? { same_project: true } : {}),
  });
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

// ---- stored pages ---------------------------------------------------------

/**
 * A stored page runs the prototype's own scripts, on this service's address.
 * `sandbox` without `allow-same-origin` gives it an opaque origin, so it behaves
 * like a file opened from disk (the case the overlay is tested against) and can
 * never read anything this origin holds. There is nothing to read today; the
 * header is here from day one so that sign-in (issues #17, #18) does not
 * inherit a hole. Measured in plan step 1: fetch, downloads and new-tab links
 * work inside it; browser storage does not.
 */
const PAGE_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': 'sandbox allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads',
  // The key is in the address. It must not travel to whatever the prototype links to.
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store',
};

/**
 * Same-project mode (issue #19): the deployment holds one prototype behind the
 * host's own protection, and its pages must call this address with the host's
 * login cookie. A sandboxed page has the origin "null" and sends no cookie, so
 * here the page is served as an ordinary page of the site. It shares the
 * address only with itself. Everything else about the headers stays.
 */
const OWN_SITE_PAGE_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store',
};

async function servePage(deps, key, which, params) {
  const { query } = deps;
  // Strict reading (plan step 9): the copy opens only with a ticket, which the
  // service hands out at the end of a member's sign-in. Checked before anything
  // about the page is looked up, so the refusal tells a stranger nothing.
  const prototype = await findPrototype(query, key);
  if (prototype && readIsForMembers(prototype) && !(await signin.takeTicket(deps, key, which, params.ticket))) {
    return signin.gatePage(prototype, which);
  }
  const rows =
    which === 'latest'
      ? await query('select html from versions where prototype_key = $1 order by round desc limit 1', [key])
      : await query('select html from versions where prototype_key = $1 and version_id = $2', [key, which]);
  // No such key, no such version, or a version whose page was too large or has
  // been pruned: one answer for all of them.
  if (!rows[0] || !rows[0].html) return refuse(404, 'not_found');
  return { status: 200, headers: deps.sameProject ? OWN_SITE_PAGE_HEADERS : PAGE_HEADERS, body: rows[0].html };
}

/**
 * Same-project mode: the site's front door opens its one prototype, or the
 * oldest if a race left two, ties broken by key so every request picks the same.
 */
async function frontDoor({ query }) {
  const rows = await query('select key from prototypes order by created, key limit 1');
  if (!rows[0]) {
    return signin.htmlPage(404, 'Nothing published yet', '<h1>Nothing is published here yet</h1><p>The author has not attached a prototype to this address.</p>');
  }
  return { status: 302, headers: { location: `/p/${rows[0].key}/latest`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }, body: '' };
}

// ---- dispatch -------------------------------------------------------------

const KEY = '(gm_[A-Za-z0-9_-]{10,40})';
const AUTHOR_VERSIONS = new RegExp(`^/api/prototypes/${KEY}/versions$`);
const AUTHOR_COMMENT = new RegExp(`^/api/prototypes/${KEY}/comments/([^/]+)(/status)?$`);
const COMMENTS = new RegExp(`^/api/p/${KEY}/comments$`);
const COMMENT = new RegExp(`^/api/p/${KEY}/comments/([^/]+)$`);
const REPLIES = new RegExp(`^/api/p/${KEY}/comments/([^/]+)/replies$`);
const REPLY = new RegExp(`^/api/p/${KEY}/comments/([^/]+)/replies/([^/]+)$`);
const PAGE = new RegExp(`^/p/${KEY}/(latest|v\\d{1,4}-[0-9a-f]{6})$`);
const ONLY_KEY = new RegExp(`^${KEY}$`);
const AUTHOR_PROTOTYPE = new RegExp(`^/api/prototypes/${KEY}$`);
const CLAIM = new RegExp(`^/api/p/${KEY}/auth/claim$`);
const SESSION = new RegExp(`^/api/p/${KEY}/auth/session$`);

/** Strict reading is on: sign-in is switched on AND the author limited reading to members. */
const readIsForMembers = (prototype) => prototype.identity !== 'none' && prototype.read_rule === 'members';

async function findPrototype(query, key) {
  const rows = await query('select key, name, identity, members, read_rule from prototypes where key = $1', [key]);
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

  if (method === 'GET' && (m = PAGE.exec(path))) {
    await ensureSchema(query);
    return servePage(deps, m[1], m[2], request.query || {});
  }

  // Same-project mode only (issue #19); anywhere else `/` is not a route.
  if (method === 'GET' && path === '/' && deps.sameProject) {
    await ensureSchema(query);
    return frontDoor(deps);
  }

  // Sign-in (issue #18). These answer small HTML pages in a pop-up, not JSON.
  if (path === '/auth/start' && method === 'GET') {
    await ensureSchema(query);
    const params = request.query || {};
    const found = typeof params.key === 'string' && ONLY_KEY.test(params.key) ? await findPrototype(query, params.key) : null;
    return signin.start(deps, found, params);
  }
  if (path === '/auth/callback' && method === 'GET') {
    await ensureSchema(query);
    return signin.callback(deps, request.query || {});
  }
  if (path === '/auth/confirm' && method === 'POST') {
    await ensureSchema(query);
    return signin.confirm(deps, body);
  }

  // Author routes. The secret is checked before anything is looked up, so a
  // wrong secret learns nothing about which prototypes exist.
  if (path.startsWith('/api/prototypes')) {
    if (!secretMatches(headers, deps.secret)) return refuse(401, 'unauthorized');
    await ensureSchema(query);
    if (method === 'POST' && path === '/api/prototypes') return createPrototype(deps, body);
    if ((m = AUTHOR_PROTOTYPE.exec(path)) && method === 'PATCH') {
      if (!(await findPrototype(query, m[1]))) return refuse(404, 'not_found');
      return signin.setIdentity(deps, m[1], body || {}, { json, refuse });
    }
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
  m = COMMENTS.exec(path) || COMMENT.exec(path) || REPLIES.exec(path) || REPLY.exec(path) || CLAIM.exec(path) || SESSION.exec(path);
  if (!m) return refuse(404, 'not_found');
  await ensureSchema(query);
  const prototype = await findPrototype(query, m[1]);
  if (!prototype) return refuse(404, 'not_found');
  const key = prototype.key;

  if (method === 'GET' && COMMENTS.test(path)) {
    // Strict reading: a member's pass, or the author (`pull --live`). The refusal
    // says which provider and that it is about reading, so a panel can say so.
    if (readIsForMembers(prototype) && !secretMatches(headers, deps.secret) && !(await signin.passSession(deps, key, headers['x-gitmargin-pass']))) {
      return json(401, { error: 'sign_in', provider: prototype.identity, read: 'members' });
    }
    return listComments(deps, prototype, request.query || {});
  }
  if (method === 'GET') return refuse(404, 'not_found');

  // The two sign-in calls a page makes. Neither is a comment write: no token, no write slot.
  if (CLAIM.test(path)) return method === 'POST' ? signin.claim(deps, key, body, { json, refuse }) : refuse(404, 'not_found');
  if (SESSION.test(path)) return method === 'DELETE' ? signin.signOut(deps, key, headers['x-gitmargin-pass'], { json }) : refuse(404, 'not_found');

  // Everything below changes something, so it needs a token and a free slot in the minute.
  const token = headers['x-gitmargin-token'];
  if (!isToken(token)) return refuse(400, 'invalid');
  // With sign-in on, every write needs a pass issued for THIS prototype. The
  // refusal names the provider so an overlay knows which button to show.
  let session = null;
  if (prototype.identity !== 'none') {
    session = await signin.passSession(deps, key, headers['x-gitmargin-pass']);
    if (!session) return json(401, { error: 'sign_in', provider: prototype.identity });
  }
  if (await overWriteLimit(deps, key)) return refuse(429, 'slow_down');

  if (COMMENTS.test(path) && method === 'POST') return addComment(deps, key, token, body, session);
  if ((m = COMMENT.exec(path)) && isCommentId(m[2])) {
    if (method === 'PATCH') return editComment(deps, key, m[2], token, body, session);
    if (method === 'DELETE') {
      const own = await ownComment(query, key, m[2], token, session);
      return own.refusal || removeComment(deps, key, m[2]);
    }
  }
  if ((m = REPLIES.exec(path)) && isCommentId(m[2]) && method === 'POST') return addReply(deps, key, m[2], token, body, session);
  if ((m = REPLY.exec(path)) && isCommentId(m[2]) && isReplyId(m[3])) {
    if (method === 'PATCH') return changeReply(deps, key, m[2], m[3], token, body, false, session);
    if (method === 'DELETE') return changeReply(deps, key, m[2], m[3], token, null, true, session);
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
