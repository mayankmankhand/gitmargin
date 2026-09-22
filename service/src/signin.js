// Sign-in for the comment service (issue #18). `API.md`, section "Sign-in", is
// the contract this file implements; `docs/part-2-design.md` has the reasons.
//
// The shape, in one paragraph: a page opens a pop-up to `/auth/start` carrying
// only the HASH of a one-time code it made. The pop-up goes to the provider and
// comes back to `/auth/callback`, where this service, which alone holds the
// application's secret, learns who the person is. It then shows a confirm page,
// and only a Continue press makes the sign-in claimable. The page, which has
// been asking `/auth/claim` with the code itself, receives a pass: random,
// stored here as a hash, valid for one prototype.
//
// Like the router, this file imports no npm package. The provider's settings,
// the network call and this service's own address all arrive through `deps`, so
// production talks to gitlab.com and the tests talk to a fake on loopback.
//
// Never stored, never logged, never sent to a browser: the provider's code, its
// tokens, the application's secret. The tokens live for the length of
// `identify` and are dropped.

import { createHash, randomBytes } from 'node:crypto';
import { cleanName } from './validate.js';

export const SIGNIN = {
  startsPerMinute: 30,
  minutesToFinish: 10,
  passDays: 7,
  groupPath: 255,
  ticketSeconds: 60,
};

const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');
const sha256url = (text) => createHash('sha256').update(String(text), 'utf8').digest('base64url');
const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const isCodeHash = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
export const isCode = (v) => typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);
export const isPass = (v) => typeof v === 'string' && /^gp_[A-Za-z0-9_-]{20,60}$/.test(v);
export const isTicket = (v) => typeof v === 'string' && /^gt_[A-Za-z0-9_-]{20,60}$/.test(v);
/** Where a sign-in may return to: one of this prototype's own stored pages, by name. Never an address. */
export const isReturn = (v) => v === 'latest' || (typeof v === 'string' && /^v\d{1,4}-[0-9a-f]{6}$/.test(v));

/** The four digits both the panel and the confirm page show, written `48-21`. */
export function shortCode(codeHash) {
  const digits = String(parseInt(String(codeHash).slice(0, 8), 16) % 10000).padStart(4, '0');
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

/** A group path as the author typed it: trimmed, no edge slashes. Null when there is none. */
export function cleanGroup(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const path = value.trim().replace(/^\/+|\/+$/g, '');
  if (!path || path.length > SIGNIN.groupPath || /\s/.test(path)) return undefined;
  return path;
}

/**
 * The members rule. Exact and whole, without regard to case. Never a prefix:
 * `acme` must not match `acme-design`. With no rule, anyone who signs in is in.
 * With a rule and no usable claim, nobody is: the rule fails closed.
 */
export function isMember(rule, groups) {
  if (!rule) return true;
  if (!Array.isArray(groups)) return false;
  const wanted = rule.toLowerCase();
  return groups.some((g) => typeof g === 'string' && g.toLowerCase() === wanted);
}

// ---- providers ------------------------------------------------------------

/** Plain http is for the tests' loopback provider only. */
function providerAddressOk(address) {
  try {
    const url = new URL(address);
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

/**
 * A setting as a person pasted it. Pasting `'abc'` (or just `'abc`) into a
 * hosting dashboard is an easy slip, and the provider then answers "unknown
 * client" with no hint why: it happened on the first real deployment (plan
 * step 8). No real id or secret starts or ends with a quote or a space.
 */
export const cleanSetting = (value) => String(value || '').trim().replace(/^['"\s]+|['"\s]+$/g, '');

export function providerSettings(deps, name) {
  const settings = deps.providers && deps.providers[name];
  if (!settings || !deps.origin || !deps.fetch) return null;
  const id = cleanSetting(settings.id);
  const secret = cleanSetting(settings.secret);
  if (!id || !secret) return null;
  const url = (cleanSetting(settings.url) || 'https://gitlab.com').replace(/\/+$/, '');
  if (!providerAddressOk(url)) return null;
  return { url, id, secret };
}

/** One discovery per provider address per warm function. A failure is not remembered. */
const discovered = new Map();
function discover(deps, settings) {
  if (!discovered.has(settings.url)) {
    const found = (async () => {
      const answer = await deps.fetch(`${settings.url}/.well-known/openid-configuration`);
      if (!answer.ok) throw new Error(`discovery answered ${answer.status}`);
      const meta = await answer.json();
      for (const field of ['authorization_endpoint', 'token_endpoint', 'userinfo_endpoint']) {
        if (!providerAddressOk(meta[field])) throw new Error(`discovery has no usable ${field}`);
      }
      return meta;
    })();
    found.catch(() => discovered.delete(settings.url));
    discovered.set(settings.url, found);
  }
  return discovered.get(settings.url);
}

/**
 * Providers are adapters with two jobs, so GitHub is a second entry here and
 * not a second flow. `openid` is the only permission ever asked for.
 */
const PROVIDERS = {
  gitlab: {
    label: 'GitLab',
    async authorizeUrl(deps, settings, { redirectUri, state, challenge }) {
      const meta = await discover(deps, settings);
      const go = new URL(meta.authorization_endpoint);
      go.search = new URLSearchParams({
        client_id: settings.id,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }).toString();
      return go.toString();
    },
    /** Who is this? The one place membership data comes from. Tokens do not leave this function. */
    async identify(deps, settings, { code, verifier, redirectUri }) {
      const meta = await discover(deps, settings);
      const tokenAnswer = await deps.fetch(meta.token_endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: settings.id,
          client_secret: settings.secret,
          code_verifier: verifier,
        }).toString(),
      });
      const token = await tokenAnswer.json().catch(() => ({}));
      // The error NAME only: a provider's error body can echo what it was sent.
      if (!tokenAnswer.ok || typeof token.access_token !== 'string') {
        throw new Error(`token call refused: ${typeof token.error === 'string' ? token.error.slice(0, 40) : tokenAnswer.status}`);
      }
      const whoAnswer = await deps.fetch(meta.userinfo_endpoint, { headers: { authorization: `Bearer ${token.access_token}` } });
      if (!whoAnswer.ok) throw new Error(`userinfo answered ${whoAnswer.status}`);
      const who = await whoAnswer.json();
      if (typeof who.sub !== 'string' && typeof who.sub !== 'number') throw new Error('userinfo has no sub');
      const username = cleanName(who.nickname || who.preferred_username || '');
      return {
        subject: String(who.sub).slice(0, 200),
        username,
        name: cleanName(who.name) || username || 'Someone',
        groups: Array.isArray(who.groups) ? who.groups.filter((g) => typeof g === 'string').slice(0, 2000) : null,
      };
    },
  },
};

export const providerNames = () => Object.keys(PROVIDERS);
export const providerLabel = (name) => (PROVIDERS[name] ? PROVIDERS[name].label : name);

// ---- the service's own small pages ----------------------------------------

/**
 * Drawn with the overlay's Hairline tokens: one accent, one-pixel strokes, 13px
 * system type, no shadows. No outside resource is loaded, the one script is
 * allowed by a nonce, and the page refuses to be framed, so Continue cannot be
 * pressed through someone else's page.
 */
function htmlPage(status, title, bodyHtml, { closes = false } = {}) {
  const nonce = randomBytes(12).toString('base64');
  const script = closes ? `<script nonce="${nonce}">setTimeout(function () { window.close(); }, 600);</script>` : '';
  const body =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${escapeHtml(title)}</title><style>` +
    'body{font:13px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1c1d2b;background:#fff;margin:0;padding:32px 24px;}' +
    'main{max-width:420px;margin:0 auto;border:1px solid #c9cbe0;padding:20px 20px 16px;}' +
    'h1{font-size:15px;font-weight:600;margin:0 0 8px;}p{margin:0 0 10px;}.muted{color:#5b5d75;}' +
    '.code{font:600 15px ui-monospace,Consolas,monospace;letter-spacing:.06em;}' +
    'form{display:flex;gap:8px;margin-top:14px;}' +
    'button{font:inherit;padding:6px 14px;border:1px solid #767a9c;background:#fff;color:#1c1d2b;cursor:pointer;}' +
    'a.button{display:inline-block;padding:6px 14px;border:1px solid #767a9c;text-decoration:none;}' +
    'button.primary,a.button.primary{background:#363a9c;border-color:#363a9c;color:#fff;}' +
    'a.button:focus-visible{outline:2px solid #363a9c;outline-offset:2px;}' +
    'button:focus-visible{outline:2px solid #363a9c;outline-offset:2px;}' +
    `</style></head><body><main>${bodyHtml}</main>${script}</body></html>`;
  return {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
    body,
  };
}

/**
 * Where a person goes after a refusal depends on how they got here. From the
 * panel's pop-up: close it, the panel is still there. From the sign-in page in
 * front of a stored copy (strict reading) this IS their tab, so "close this
 * window" is a dead end (review of the #18 cycle, R2): they get a link back.
 * `back` is that page's address when it is known, and null before the
 * sign-in row has been read.
 */
function nextStep(back) {
  if (back) return `<p class="muted"><a id="gm-back" href="${escapeHtml(back)}">Go back to the page</a> and try again.</p>`;
  return '<p class="muted">Try again from where you started: the comment panel, or the sign-in link on the page.</p>';
}
const returnAddress = (signin) => (signin && signin.return_version ? `/p/${signin.prototype_key}/${signin.return_version}` : null);
const problemPage = (status, text, back = null) =>
  htmlPage(status, 'Sign-in did not finish', `<h1>Sign-in did not finish</h1><p>${escapeHtml(text)}</p>${nextStep(back)}`);

// ---- reads used by the router ----------------------------------------------

/** The live session a pass belongs to, for this prototype only. Null otherwise. */
export async function passSession({ query, now }, key, pass) {
  if (!isPass(pass)) return null;
  const rows = await query(
    'select provider, subject, username, name from sessions where pass_hash = $1 and prototype_key = $2 and expires > $3',
    [sha256(pass), key, now().toISOString()],
  );
  return rows[0] || null;
}

// ---- the author's settings route --------------------------------------------

export async function setIdentity(deps, key, body, { json, refuse }) {
  const { query, now } = deps;
  const identity = body && body.identity;
  if (identity !== 'none' && !PROVIDERS[identity]) return refuse(400, 'invalid');
  const members = cleanGroup(body.members);
  const read = body.read === undefined ? 'open' : body.read;
  if (members === undefined || !['open', 'members'].includes(read)) return refuse(400, 'invalid');
  if (identity === 'none' && (members || read !== 'open')) return refuse(400, 'invalid');
  if (identity !== 'none' && !providerSettings(deps, identity)) return refuse(409, 'provider_not_configured');

  await query('update prototypes set identity = $2, members = $3, read_rule = $4 where key = $1', [key, identity, members, read]);
  // Whatever changed, every pass ends. This is the author's "stop them now".
  const ended = await query('delete from sessions where prototype_key = $1 returning 1 as gone', [key]);
  await query('update signins set ended_at = $2 where prototype_key = $1 and ended_at is null', [key, now().toISOString()]);
  return json(200, { identity, members, read, passes_ended: ended.length });
}

// ---- the sign-in itself -----------------------------------------------------

export async function start(deps, prototype, params) {
  const { query, now } = deps;
  if (!prototype || prototype.identity === 'none') return problemPage(404, 'This prototype does not use sign-in.');
  // Two ways in. The panel's pop-up brings the hash of a code the page made. The
  // page in front of a stored copy (strict reading) brings `return` instead: no
  // page is waiting with a code, so none exists until Continue makes one. The
  // placeholder below is the hash of bytes nobody keeps, so it can never be claimed.
  const returns = params.return !== undefined;
  if (returns ? !isReturn(params.return) || prototype.read_rule !== 'members' : !isCodeHash(params.code_hash)) {
    return problemPage(400, 'The sign-in request was incomplete.');
  }
  const codeHash = returns ? sha256(randomBytes(32).toString('hex')) : params.code_hash;
  const provider = PROVIDERS[prototype.identity];
  const settings = providerSettings(deps, prototype.identity);
  if (!provider || !settings) return problemPage(409, `The author's comment service is not set up for ${providerLabel(prototype.identity)} sign-in yet.`);

  const at = now();
  const state = randomBytes(24).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  // Housekeeping rides along, as it does with writes.
  await query('delete from sessions where expires < $1', [at.toISOString()]);
  await query('delete from signins where expires < $1', [new Date(at.getTime() - 3_600_000).toISOString()]);
  await query('delete from tickets where expires < $1', [at.toISOString()]);
  // The limit is a condition of the insert, for the reason the write limit is (review of #15, R3).
  const recorded = await query(
    `insert into signins (state, prototype_key, provider, code_hash, verifier, created, expires, return_version)
     select $1::text, $2::text, $3::text, $4::text, $5::text, $6::timestamptz, $7::timestamptz, $10::text
      where (select count(*) from signins where prototype_key = $2 and created > $8::timestamptz) < $9
     returning state`,
    [
      state,
      prototype.key,
      prototype.identity,
      codeHash,
      verifier,
      at.toISOString(),
      new Date(at.getTime() + SIGNIN.minutesToFinish * 60_000).toISOString(),
      new Date(at.getTime() - 60_000).toISOString(),
      SIGNIN.startsPerMinute,
      returns ? params.return : null,
    ],
  );
  if (!recorded[0]) return problemPage(429, 'Too many sign-ins were started for this prototype just now. Wait a minute and try again.');

  let location;
  try {
    location = await provider.authorizeUrl(deps, settings, { redirectUri: `${deps.origin}/auth/callback`, state, challenge: sha256url(verifier) });
  } catch (error) {
    if (deps.log) deps.log(error);
    await query('update signins set ended_at = $2 where state = $1', [state, at.toISOString()]);
    return problemPage(502, `${provider.label} could not be reached.`);
  }
  return { status: 302, headers: { location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }, body: '' };
}

export async function callback(deps, params) {
  const { query, now } = deps;
  const at = now().toISOString();
  const state = typeof params.state === 'string' ? params.state : '';
  // `used_at` is what makes a `state` work once: a second arrival updates nothing.
  const rows = await query(
    `update signins set used_at = $2
      where state = $1 and used_at is null and ended_at is null and expires > $2
      returning prototype_key, provider, code_hash, verifier, return_version`,
    [state, at],
  );
  const signin = rows[0];
  if (!signin) return problemPage(400, 'This sign-in is unknown, was already used, or took longer than 10 minutes.');
  const end = () => query('update signins set ended_at = $2 where state = $1', [state, at]);

  if (typeof params.error === 'string' || typeof params.code !== 'string') {
    await end();
    return problemPage(400, 'The sign-in was not approved.', returnAddress(signin));
  }
  const provider = PROVIDERS[signin.provider];
  const settings = providerSettings(deps, signin.provider);
  const found = await query('select key, name, identity, members from prototypes where key = $1', [signin.prototype_key]);
  const prototype = found[0];
  if (!provider || !settings || !prototype || prototype.identity !== signin.provider) {
    await end();
    return problemPage(409, 'Sign-in is no longer switched on for this prototype.', returnAddress(signin));
  }

  let person;
  try {
    person = await provider.identify(deps, settings, { code: params.code, verifier: signin.verifier, redirectUri: `${deps.origin}/auth/callback` });
  } catch (error) {
    // The message carries an error name or a status, never a token or the secret.
    if (deps.log) deps.log(error);
    await end();
    return problemPage(502, `${provider.label} did not confirm the sign-in.`, returnAddress(signin));
  }

  const member = isMember(prototype.members, person.groups);
  const confirmToken = randomBytes(24).toString('base64url');
  await query(
    `update signins set subject = $2, username = $3, name = $4, member = $5, confirm_hash = $6,
            confirmed_at = case when $5 then null else $7::timestamptz end
      where state = $1`,
    [state, person.subject, person.username, person.name, member, member ? sha256(confirmToken) : null, at],
  );

  if (!member) {
    // Nothing to grant, so nothing to confirm. The panel learns of it through the
    // claim. The verdict comes first: the owner read the earlier wording ("Signed
    // in as ...", then a rule) as a failure of the software (review of #18, R1).
    const back = returnAddress(signin);
    return htmlPage(
      200,
      'Not a member',
      `<h1>Your account is not in ${escapeHtml(prototype.members)}</h1>` +
        `<p>You are signed in to ${escapeHtml(provider.label)} as <strong>${escapeHtml(person.name)}</strong>, and this prototype ${signin.return_version ? 'can only be opened by' : 'only takes comments from'} members of that group. Nothing went wrong; this account is not one of them.</p>` +
        `<p>Ask the prototype's author for access. To use a different ${escapeHtml(provider.label)} account, sign out of ${escapeHtml(provider.label)} first, then sign in here again.</p>` +
        (back ? `<p class="muted"><a id="gm-back" href="${escapeHtml(back)}">Go back to the page</a></p>` : '<p class="muted">You can close this window.</p>'),
    );
  }
  const confirmForm =
    `<form method="post" action="/auth/confirm"><input type="hidden" name="state" value="${escapeHtml(state)}"><input type="hidden" name="token" value="${escapeHtml(confirmToken)}">` +
    '<button class="primary" id="gm-continue" name="decision" value="continue" type="submit">Continue</button>' +
    '<button id="gm-cancel" name="decision" value="cancel" type="submit">Cancel</button></form>';
  if (signin.return_version) {
    // No panel is waiting, so there is no code to compare: the person is about to
    // land on the page themselves, in this window.
    return htmlPage(
      200,
      'Confirm sign-in',
      `<h1>Open ${escapeHtml(prototype.name)} as ${escapeHtml(person.name)}?</h1>` +
        '<p>You will be able to read and leave comments on it.</p>' +
        confirmForm,
    );
  }
  return htmlPage(
    200,
    'Confirm sign-in',
    `<h1>Sign in to comment on ${escapeHtml(prototype.name)} as ${escapeHtml(person.name)}?</h1>` +
      `<p>Only continue if you pressed Sign in yourself, just now, and your comment panel shows this code:</p><p class="code">${escapeHtml(shortCode(signin.code_hash))}</p>` +
      '<p class="muted">If someone sent you a link that led here, press Cancel.</p>' +
      confirmForm,
  );
}

export async function confirm(deps, body) {
  const { query, now } = deps;
  const at = now().toISOString();
  const state = body && typeof body.state === 'string' ? body.state : '';
  const token = body && typeof body.token === 'string' ? body.token : '';
  if (!state || !token) return problemPage(400, 'The confirmation was incomplete.');

  if (body.decision !== 'continue') {
    await query('update signins set ended_at = $3, confirm_hash = null where state = $1 and confirm_hash = $2 and ended_at is null', [state, sha256(token), at]);
    return htmlPage(200, 'Cancelled', '<h1>Cancelled</h1><p>Nothing was signed in. You can close this window.</p>', { closes: true });
  }
  // The token works once: a match clears it in the same statement. A sign-in
  // that returns to a stored copy gets its one-time code only now, in that same
  // statement, so there is no moment at which it is claimable under a code
  // anyone else could hold.
  const code = randomBytes(16).toString('hex');
  const rows = await query(
    `update signins set confirmed_at = $3, confirm_hash = null,
            code_hash = case when return_version is null then code_hash else $4 end
      where state = $1 and confirm_hash = $2 and ended_at is null and confirmed_at is null and expires > $3
      returning name, prototype_key, return_version`,
    [state, sha256(token), at, sha256(code)],
  );
  if (!rows[0]) return problemPage(400, 'This confirmation is unknown, was already used, or took too long.');
  if (rows[0].return_version) {
    // Strict reading: send the person to the stored copy they asked for, with a
    // ticket that opens it once and the code their panel will swap for a pass.
    // The code rides after the `#`, which no server ever sees, this one included.
    const ticket = `gt_${randomBytes(30).toString('base64url')}`;
    await query('insert into tickets (ticket_hash, prototype_key, version_id, expires) values ($1, $2, $3, $4)', [
      sha256(ticket),
      rows[0].prototype_key,
      rows[0].return_version,
      new Date(now().getTime() + SIGNIN.ticketSeconds * 1000).toISOString(),
    ]);
    const location = `/p/${rows[0].prototype_key}/${rows[0].return_version}?ticket=${ticket}#gm_claim=${code}`;
    return { status: 303, headers: { location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }, body: '' };
  }
  return htmlPage(200, 'Signed in', `<h1>You are signed in as ${escapeHtml(rows[0].name)}</h1><p class="muted">You can close this window.</p>`, { closes: true });
}

export async function claim(deps, key, body, { json, refuse }) {
  const { query, now } = deps;
  if (!body || !isCode(body.code)) return refuse(400, 'invalid');
  const at = now();
  const hash = sha256(body.code);
  // Claimed in one statement, so two askers cannot both be answered.
  const taken = await query(
    `update signins set ended_at = $3
      where prototype_key = $1 and code_hash = $2 and ended_at is null and confirmed_at is not null and expires > $3
      returning provider, subject, username, name, member`,
    [key, hash, at.toISOString()],
  );
  const signin = taken[0];
  if (!signin) {
    const waiting = await query(
      'select 1 from signins where prototype_key = $1 and code_hash = $2 and ended_at is null and confirmed_at is null and expires > $3',
      [key, hash, at.toISOString()],
    );
    return waiting[0] ? json(202, { pending: true }) : refuse(404, 'not_found');
  }
  const identity = { provider: signin.provider, name: signin.name, username: signin.username };
  if (!signin.member) {
    const rule = await query('select members from prototypes where key = $1', [key]);
    return json(200, { member: false, members: rule[0] ? rule[0].members : null, identity });
  }
  const pass = `gp_${randomBytes(30).toString('base64url')}`;
  const expires = new Date(at.getTime() + SIGNIN.passDays * 24 * 3_600_000).toISOString();
  await query(
    'insert into sessions (pass_hash, prototype_key, provider, subject, username, name, created, expires) values ($1, $2, $3, $4, $5, $6, $7, $8)',
    [sha256(pass), key, signin.provider, signin.subject, signin.username, signin.name, at.toISOString(), expires],
  );
  return json(200, { pass, expires, member: true, identity });
}

// ---- strict reading: stored copies ------------------------------------------

/** Use a ticket. True once, for the prototype and the address it was made for, within its minute. */
export async function takeTicket({ query, now }, key, which, ticket) {
  if (!isTicket(ticket)) return false;
  const rows = await query(
    'delete from tickets where ticket_hash = $1 and prototype_key = $2 and version_id = $3 and expires > $4 returning 1 as ok',
    [sha256(ticket), key, which, now().toISOString()],
  );
  return Boolean(rows[0]);
}

/**
 * What a stored copy's address answers when reading is for members and no valid
 * ticket came with it. It says nothing about the prototype, not even its name
 * or whether that version exists. A plain link, not a form: browsers apply
 * `form-action` to the redirects that follow a form, and this one leaves for
 * the provider.
 */
export function gatePage(prototype, which) {
  const label = providerLabel(prototype.identity);
  const go = `/auth/start?key=${encodeURIComponent(prototype.key)}&return=${encodeURIComponent(which)}`;
  return htmlPage(
    401,
    'Sign in to open this page',
    `<h1>Sign in to open this page</h1><p>Its author shares it with members of one ${escapeHtml(label)} group only.</p>` +
      `<p style="margin-top:14px"><a id="gm-signin" class="button primary" href="${escapeHtml(go)}">Sign in with ${escapeHtml(label)}</a></p>`,
  );
}

export async function signOut({ query }, key, pass, { json }) {
  if (isPass(pass)) await query('delete from sessions where pass_hash = $1 and prototype_key = $2', [sha256(pass), key]);
  return json(200, { signed_out: true });
}

