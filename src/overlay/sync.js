// Shared comments (issue #15): keeps the local store and the author's comment
// service in step. `service/API.md` is the contract, "Merge rules for a client"
// in particular.
//
// Three rules shape everything here.
//
// 1. The page decides. `startSync` returns null unless the page carries the
//    sharing tags `attach --service` writes, and then nothing in this file
//    runs: no timer, no request. A prototype sent as a plain file behaves
//    exactly as it did before this file existed.
// 2. Local first. Every change goes into the store the way it always has, and
//    only then onto a queue for the service. A service that is slow, down, or
//    refusing can delay sharing; it can never lose a comment or block typing.
// 3. Once reached, the service is the truth, except for what has not been sent
//    yet: unsent local changes survive an incoming answer and are sent again.
//
// Nothing here touches `document`, `window` or `localStorage` at module scope,
// and the clock, the timers, `fetch`, storage and the visibility signal all
// arrive as arguments. That is what lets tests/sync.test.js drive this file in
// plain Node against the real router, with a clock it moves by hand.

const POLL_MS = 5_000;
const QUIET_POLL_MS = 30_000;
const QUIET_AFTER_MS = 5 * 60_000;
const MAX_BACKOFF_MS = 60_000;
// Each poll asks for changes since a little BEFORE the last answer's clock. A
// write is stamped first and stored a query or two later, so a poll landing in
// that gap got a server time later than a change it could not yet see, and
// never asked for it again. Repeats are harmless: applying one twice changes
// nothing (review of the #15 cycle, R8).
const SINCE_OVERLAP_MS = 5_000;

/** What a refusal means to the person looking at the panel. */
import { sha256hex } from './sha256.js';

const PROBLEMS = {
  full: 'This prototype has reached its comment limit. Your comment is saved here but not shared.',
  replies_full: 'This comment has reached its reply limit. Your reply is saved here but not shared.',
  slow_down: 'Too many comments are arriving at once. Yours will be shared in a minute.',
  too_long: 'A comment is too long to share. It is saved here; shorten it to share it.',
  invalid: 'A comment could not be shared. It is saved here.',
  unknown_version: 'The comment service does not know this version of the page. Comments are saved here only.',
  not_found: 'The comment service does not know this prototype. Comments are saved here only.',
};

const randomHex = (bytes) => {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (b) => b.toString(16).padStart(2, '0')).join('');
};

/** `r_` plus six hex: a reply id, made here so a retried send cannot duplicate. */
export const newReplyId = () => `r_${randomHex(3)}`;

const isoSeconds = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * Storage that may not exist. A stored page is served sandboxed, where touching
 * `localStorage` throws, and a disk page may be refused it too. Then the token
 * and the queue live for this tab only, which the close-tab warning covers.
 *
 * Takes a function, not the object: in such a browser merely NAMING
 * `localStorage` throws, so it must only ever be named inside a try. It once
 * sat in `startSync`'s default arguments, which run before the is-this-page-
 * shared check, and took the whole overlay down on a plain file
 * (tests/roundtrip.spec.js, 'the reviewer is told whether...').
 */
function safeStorage(getStorage) {
  const memory = new Map();
  return {
    read(key) {
      try {
        const raw = getStorage().getItem(key);
        return raw ? JSON.parse(raw) : memory.get(key) ?? null;
      } catch {
        return memory.get(key) ?? null;
      }
    },
    write(key, value) {
      memory.set(key, value);
      try {
        getStorage().setItem(key, JSON.stringify(value));
      } catch {
        /* this tab only */
      }
    },
  };
}

/**
 * The code a strict stored copy arrives with, taken OUT of the address at once:
 * it works once, and a prototype's own script that reads the hash for its
 * screens should not find ours in it. Null anywhere else.
 */
function arrivalCodeFromAddress() {
  try {
    const found = /(?:^#|&)gm_claim=([0-9a-f]{32})(?:&|$)/.exec(window.location.hash);
    if (!found) return null;
    const rest = window.location.hash.replace(/(^#|&)gm_claim=[0-9a-f]{32}/, '$1').replace(/^#&?$/, '');
    try {
      window.history.replaceState(null, '', window.location.pathname + window.location.search + rest);
    } catch {
      /* the code is spent on first use either way */
    }
    return found[1];
  } catch {
    return null;
  }
}

/**
 * Which address the page talks to (issue #19, API.md "Same-project mode").
 * A page the comment service serves as its own site, at
 * `<origin>/p/<its own key>/<latest or a version>`, talks to `<origin>`: the
 * address it was opened from, because a host's login (Vercel's, in
 * same-project mode) is kept per address and must ride along on every call.
 * Anything else talks to the address written into the page, as before. A
 * sandboxed stored copy has the origin "null", so the rule never fires there.
 * `where.origin` must be the DOCUMENT's origin: a sandboxed page's `location`
 * still reports its host, and only `self.origin` says "null" (measured in
 * Chromium and Firefox, review of #19, R2).
 *
 * @param {{service: string, key: string}} stamp
 * @param {?{protocol: string, origin: string, pathname: string}} where the page's address, with the document's own origin
 */
export function serviceAddress(stamp, where) {
  const written = new URL(stamp.service).origin;
  try {
    if (!where || !/^https?:$/.test(where.protocol) || !where.origin || where.origin === 'null') return written;
    const found = /^\/p\/([^/]+)\/(latest|v\d{1,4}-[0-9a-f]{6})$/.exec(where.pathname);
    if (found && decodeURIComponent(found[1]) === stamp.key) return where.origin;
  } catch {
    /* an address that cannot be read is not the service's own page */
  }
  return written;
}

/**
 * @param {object} deps
 * @param {{service: ?string, key: ?string, versionId: ?string}} deps.stamp
 * @param {object} deps.store  src/overlay/store.js
 * @returns {null | object} null when the page is not shared.
 */
/**
 * Hosts where every site of one owner shares one origin, so browser storage is
 * shared with pages other people publish there: `owner.github.io/<repo>`, and
 * GitLab Pages without a unique domain, `group.gitlab.io/<project>`. A GitLab
 * project with a unique domain (`<name>-<six hex>.gitlab.io`, the default for
 * new projects) has an origin of its own. A pass stored on a shared origin could
 * be read by any of those pages (security audit of #30, R3).
 */
export function sharedOriginHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (host.endsWith('.github.io')) return true;
  if (host.endsWith('.gitlab.io')) return !/-[0-9a-f]{6}\.gitlab\.io$/.test(host);
  return false;
}

export function startSync({
  stamp,
  store,
  fetchImpl = (...args) => fetch(...args),
  now = () => Date.now(),
  timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) },
  isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
  onVisible = (fn) => typeof document !== 'undefined' && document.addEventListener('visibilitychange', fn),
  storage = null,
  // Sign-in (issue #18). Opening the pop-up is injectable so the node tests can
  // play the person; in a browser it must run inside the click, which is why
  // everything before it in `signIn` is synchronous.
  openWindow = (url) => window.open(url, 'gitmargin-signin', 'popup,width=520,height=680'),
  // Strict reading: a stored copy opened through the service's sign-in page
  // arrives with a one-time code after the `#` (API.md, "Strict reading").
  takeArrivalCode = arrivalCodeFromAddress,
  // A page opened from disk shares one storage area with EVERY other local file
  // in Chromium, so a pass written there could be read by any HTML file opened
  // later. The pass then lives in memory for this tab only, as the design says
  // (review of the #18 cycle, R7). The edit token was always shared this way;
  // it opens only what this browser wrote, a pass opens a person's name. A page
  // on a host where one owner's sites share an origin is shared the same way
  // (sharedOriginHost, security audit of #30, R3).
  sharedStorage = () =>
    typeof location !== 'undefined' && (location.protocol === 'file:' || sharedOriginHost(location.hostname)),
  // The page's own address, for the same-project rule above, with the
  // document's origin rather than the address's (see serviceAddress). A
  // function, read after the is-this-page-shared check, like everything that
  // touches the page.
  pageLocation = () =>
    typeof location === 'undefined'
      ? null
      : {
          protocol: location.protocol,
          pathname: location.pathname,
          origin: typeof self !== 'undefined' && typeof self.origin === 'string' ? self.origin : 'null',
        },
}) {
  if (!stamp || !stamp.service || !stamp.key || !stamp.versionId) return null;

  let base;
  let origin; // the comment service, as this page reaches it
  try {
    const url = new URL(stamp.service);
    if (!/^https?:$/.test(url.protocol)) return null;
    origin = serviceAddress(stamp, pageLocation());
    base = `${origin}/api/p/${encodeURIComponent(stamp.key)}/comments`;
  } catch {
    return null;
  }

  const disk = safeStorage(() => storage || localStorage);
  const tokenKey = `gitmargin:token:${stamp.key}`;
  const stateKey = `gitmargin:sync:${stamp.key}:${stamp.versionId}`;

  let token = disk.read(tokenKey);
  if (typeof token !== 'string' || token.length < 16) {
    token = randomHex(16);
    disk.write(tokenKey, token);
  }

  // Sign-in. The MODE comes from the service's answers, never from the page, so
  // an author can switch it without re-attaching. The PASS is kept like the edit
  // token: in browser storage when there is some, for this tab only on a disk
  // page that is refused it and inside every stored page.
  const passKey = `gitmargin:pass:${stamp.key}`;
  const identity = { mode: 'none', read: 'open', members: null };
  const passDisk = sharedStorage() ? safeStorage(() => { throw new Error('tab only'); }) : disk;
  let session = passDisk.read(passKey);
  if (!session || typeof session.pass !== 'string' || !(Date.parse(session.expires) > now())) session = null;
  // state: idle | waiting | blocked | not_member | failed
  const signin = { state: 'idle', code: null, shortCode: null, who: null, timer: null, started: 0 };
  const needsSignIn = () => identity.mode !== 'none' && !session;

  function setIdentity(block) {
    const mode = block && typeof block.identity === 'string' ? block.identity : 'none';
    const next = { mode, read: block && block.read === 'members' ? 'members' : 'open', members: block && typeof block.members === 'string' ? block.members : null };
    if (next.mode === identity.mode && next.read === identity.read && next.members === identity.members) return;
    Object.assign(identity, next);
    announce();
  }
  function endSession() {
    if (!session) return;
    session = null;
    passDisk.write(passKey, null);
    announce();
  }

  // `ops` is the queue of changes not yet acknowledged, oldest first.
  // `synced` holds ids the service has acknowledged: a synced comment missing
  // from a full answer was removed while we were away. `mine` holds the ids of
  // comments and replies written in this browser: without sign-in, that is all
  // "your own" can mean. `rejected` maps an id to why it will never be shared.
  const saved = disk.read(stateKey) || {};
  const ops = Array.isArray(saved.ops) ? saved.ops : [];
  const synced = new Set(Array.isArray(saved.synced) ? saved.synced : []);
  const mine = new Set(Array.isArray(saved.mine) ? saved.mine : []);
  const rejected = saved.rejected && typeof saved.rejected === 'object' ? saved.rejected : {};
  const save = () => disk.write(stateKey, { ops, synced: [...synced], mine: [...mine], rejected });

  const listeners = new Set();
  const view = { state: 'connecting', problem: null, versions: [], latest: null };
  const announce = () => listeners.forEach((fn) => fn());
  function setView(fields) {
    const before = JSON.stringify(view);
    Object.assign(view, fields);
    if (JSON.stringify(view) !== before) announce();
  }

  let since = null;
  let timer = null;
  let busy = false;
  let again = false;
  let failures = 0;
  let lastActivity = now();

  const find = (id) => store.comments().find((c) => c.id === id) || null;
  /** The author of a comment OR a reply with this id. */
  function authorOf(id) {
    for (const c of store.comments()) {
      if (c.id === id) return c.author || null;
      const reply = (c.replies || []).find((r) => r.id === id);
      if (reply) return reply.author || null;
    }
    return null;
  }
  /** What a new comment or reply shows locally until the service answers with the truth. */
  const writer = () => (session ? { name: session.identity.name, provider: session.identity.provider, username: session.identity.username, verified: true } : { name: store.reviewer() || '' });

  const SIGNIN_ASK_MS = 1000;
  // The same 10 minutes the service gives an unfinished sign-in (API.md, "Limits
  // and lifetimes"): a slower limit here left a person whose Continue landed in
  // minute four "signed in" in the pop-up and "failed" in the panel (review of
  // the #18 cycle, R9).
  const SIGNIN_GIVE_UP_MS = 10 * 60 * 1000;
  const SIGNIN_UNKNOWN_GRACE_MS = 20 * 1000;
  function stopAsking(state, who = null) {
    if (signin.timer !== null) timers.clear(signin.timer);
    Object.assign(signin, { timer: null, code: null, state, who, shortCode: state === 'waiting' ? signin.shortCode : null });
    announce();
  }
  /** Ask the service whether Continue has been pressed. The answer comes once. */
  function askForPass() {
    const code = signin.code;
    signin.timer = timers.set(async () => {
      signin.timer = null;
      if (signin.code !== code) return; // cancelled, or a newer sign-in took over
      if (now() - signin.started > SIGNIN_GIVE_UP_MS) return stopAsking('failed');
      let answer = null;
      let status = 0;
      try {
        const response = await fetchImpl(`${base.replace(/\/comments$/, '')}/auth/claim`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        status = response.status;
        answer = await response.json();
      } catch {
        /* offline for a moment: keep asking until the time limit */
      }
      if (signin.code !== code) return;
      if (status === 200 && answer && answer.member === true && typeof answer.pass === 'string') {
        session = { pass: answer.pass, expires: answer.expires, identity: answer.identity || {} };
        passDisk.write(passKey, session);
        stopAsking('idle');
        kick(); // whatever was waiting for a pass goes now
        return undefined;
      }
      if (status === 200 && answer && answer.member === false) return stopAsking('not_member', { ...(answer.identity || {}), members: answer.members || null });
      // "Unknown code" in the first moments only means the pop-up has not reached
      // the service yet (a slow network); after that it means the sign-in was
      // cancelled, refused at the start (the service's page says why), or is
      // gone, and the panel says it did not finish (review of #18, R20).
      if (status === 404 && now() - signin.started < SIGNIN_UNKNOWN_GRACE_MS) return askForPass();
      if (status === 404 || status === 400) return stopAsking('failed');
      return askForPass();
    }, SIGNIN_ASK_MS);
  }
  const pendingFor = (id) => ops.filter((o) => o.id === id);
  const hasPending = (id, op) => ops.some((o) => o.id === id && o.op === op);

  function enqueue(entry) {
    ops.push(entry);
    lastActivity = now();
    save();
    kick();
  }

  async function request(method, url, body) {
    // Remembered so a refusal can end THIS pass and not one that arrived while
    // the request was in flight (review of the #18 cycle, R8).
    const carried = session ? session.pass : null;
    const response = await fetchImpl(url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(method === 'GET' ? {} : { 'x-gitmargin-token': token }),
        ...(carried ? { 'x-gitmargin-pass': carried } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let answer = null;
    try {
      answer = await response.json();
    } catch {
      /* not JSON: treated as a failure of the service, below */
    }
    if (!response.ok && !(answer && typeof answer.error === 'string')) throw new Error('unreadable answer');
    return { ok: response.ok, status: response.status, answer, carried };
  }
  /** A `sign_in` refusal ends the pass it was refused WITH; a newer pass stays. */
  function endRefused(result) {
    if (session && session.pass === result.carried) endSession();
  }

  /** The comment as the service should hold it, built from the local copy now. */
  function outgoing(comment) {
    return {
      version_id: stamp.versionId,
      author: { name: (comment.author && comment.author.name) || store.reviewer() || '' },
      comment: { id: comment.id, time: comment.time, intent: comment.intent, anchor: comment.anchor, state: comment.state },
    };
  }

  /** Send one queued change. Returns 'done', 'later' (keep it, stop), or 'drop'. */
  async function send(entry) {
    const local = find(entry.id);
    const one = `${base}/${entry.id}`;
    let result;

    if (entry.op === 'add') {
      if (!local) return 'drop';
      result = await request('POST', base, outgoing(local));
    } else if (entry.op === 'edit') {
      if (!local) return 'drop';
      result = await request('PATCH', one, { intent: local.intent });
    } else if (entry.op === 'delete') {
      result = await request('DELETE', one);
    } else if (entry.op === 'reply-add') {
      result = await request('POST', `${one}/replies`, entry.reply);
    } else if (entry.op === 'reply-edit') {
      const reply = local && (local.replies || []).find((r) => r.id === entry.rid);
      if (!reply) return 'drop';
      result = await request('PATCH', `${one}/replies/${entry.rid}`, { text: reply.text });
    } else if (entry.op === 'reply-delete') {
      result = await request('DELETE', `${one}/replies/${entry.rid}`);
    } else {
      return 'drop';
    }

    if (result.ok) {
      synced.add(entry.id);
      return 'done';
    }
    const code = result.answer.error;
    // Sign-in is on and this browser has no pass the service accepts. Keep the
    // change and wait: it is sent the moment someone signs in. Never dropped.
    if (code === 'sign_in') {
      setIdentity({ identity: result.answer.provider, read: identity.read, members: identity.members });
      endRefused(result);
      return 'later';
    }
    // The service already holds this id under someone else's token. That is
    // what a reviewer's returned file looks like when the author opens it in a
    // shared copy: the comments inside are other people's, already shared, and
    // not this browser's to send or to claim (review R5).
    if (code === 'id_taken' && (entry.op === 'add' || entry.op === 'reply-add')) {
      synced.add(entry.id);
      mine.delete(entry.op === 'add' ? entry.id : entry.rid);
      return 'drop';
    }
    // Worth another try later: the service may have room or patience by then.
    if (code === 'slow_down' || code === 'service_unavailable') {
      setView({ problem: PROBLEMS[code] || null });
      return 'later';
    }
    // Gone for everyone: a delete or an edit aimed at it has nothing to do.
    if (code === 'not_found' && entry.op !== 'add' && entry.op !== 'reply-add') return 'drop';
    // Never going to succeed as it stands. The text stays in the store, so it
    // still leaves by file or clipboard; it is only not shared. Recorded for
    // edits and replies too, not only new comments: a refused edit used to clear
    // its own warning in the same cycle, and a refused reply vanished on the
    // next load with no mark on it (review R12, R19).
    if (entry.op !== 'delete' && entry.op !== 'reply-delete') rejected[entry.rid || entry.id] = code;
    const isReply = entry.op === 'reply-add' || entry.op === 'reply-edit';
    setView({ problem: (isReply && code === 'full' ? PROBLEMS.replies_full : PROBLEMS[code]) || PROBLEMS.invalid });
    return 'drop';
  }

  async function flush() {
    // Nothing can be accepted without a pass, so do not knock every five seconds.
    if (needsSignIn()) return ops.length === 0;
    while (ops.length) {
      const entry = ops[0];
      // From here the service may hold it, whatever answer comes back. remove()
      // and update() read this to tell 'never sent' from 'on the wire'.
      entry.tried = true;
      const outcome = await send(entry);
      if (outcome === 'later') return false;
      // Remove THIS entry, not whatever is now first. remove() can splice the
      // queue while the send is awaited, and a blind shift() then threw away
      // the next change instead (review R6).
      const at = ops.indexOf(entry);
      if (at >= 0) ops.splice(at, 1);
      save();
    }
    return true;
  }

  /** Apply one answer from the list route. `full` means it had no `since`. */
  function take(answer, full) {
    const upsert = [];
    const drop = [];
    const seen = new Set();

    for (const remote of answer.comments || []) {
      if (!remote || typeof remote.id !== 'string') continue;
      seen.add(remote.id);
      if (remote.deleted) {
        // Gone for everyone, unsent local edits to it included (API.md rule 3).
        drop.push(remote.id);
        synced.delete(remote.id);
        for (let i = ops.length - 1; i >= 0; i -= 1) if (ops[i].id === remote.id) ops.splice(i, 1);
        continue;
      }
      synced.add(remote.id);
      const local = find(remote.id);
      const merged = { ...remote };
      // Unsent local changes win until they are acknowledged (rule 2). A refused
      // edit counts as unsent: the local text is the newer one, and is flagged.
      if (local && (hasPending(remote.id, 'edit') || rejected[remote.id])) merged.intent = local.intent;
      const replies = Array.isArray(remote.replies) ? [...remote.replies] : [];
      for (const entry of pendingFor(remote.id)) {
        if (entry.op === 'reply-add' && !replies.some((r) => r.id === entry.rid)) {
          replies.push({ ...entry.reply, time: entry.time, updated: entry.time });
        }
        if (entry.op === 'reply-delete') {
          const at = replies.findIndex((r) => r.id === entry.rid);
          if (at >= 0) replies.splice(at, 1);
        }
        if (entry.op === 'reply-edit' && local) {
          const mineNow = (local.replies || []).find((r) => r.id === entry.rid);
          const theirs = replies.find((r) => r.id === entry.rid);
          if (mineNow && theirs) theirs.text = mineNow.text;
        }
      }
      // Replies the service refused stay where their writer can see and fix them.
      for (const mineNow of (local && local.replies) || []) {
        if (!rejected[mineNow.id]) continue;
        const theirs = replies.find((r) => r.id === mineNow.id);
        if (theirs) theirs.text = mineNow.text;
        else replies.push(mineNow);
      }
      merged.replies = replies;
      // Polls overlap (SINCE_OVERLAP_MS), so the same comment arrives several times
      // running. Identical to what is held means nothing to apply: every apply
      // redraws the panel, and a redraw costs a keyboard user their place.
      const unchanged = local && JSON.stringify(local) === JSON.stringify(merged);
      if (!unchanged && !hasPending(remote.id, 'delete')) upsert.push(merged);
    }

    if (full) {
      // Present here, acknowledged once, absent now: removed while away (rule 4).
      for (const local of store.comments()) {
        if (synced.has(local.id) && !seen.has(local.id)) {
          drop.push(local.id);
          synced.delete(local.id);
        }
      }
      // Comments in the store that the service has never heard of: written
      // offline in an earlier sitting, or carried in by a returned file. Queued
      // only now, after the first full answer, so a comment the service already
      // holds is never re-sent as if it were new (review R5).
      for (const local of store.comments()) {
        if (seen.has(local.id) || synced.has(local.id) || rejected[local.id] || hasPending(local.id, 'add')) continue;
        mine.add(local.id);
        ops.push({ op: 'add', id: local.id });
        again = true; // send them now rather than at the next tick
      }
    }

    if (upsert.length || drop.length) lastActivity = now();
    store.applyRemote({ upsert, drop });
    const answered = Date.parse(answer.server_time);
    if (!Number.isNaN(answered)) since = new Date(answered - SINCE_OVERLAP_MS).toISOString();
    save();
    setIdentity(answer.prototype);
    setView({
      versions: Array.isArray(answer.versions) ? answer.versions : [],
      latest: answer.latest || null,
    });
  }

  async function cycle() {
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    try {
      const sent = await flush();
      const full = since === null;
      const url = `${base}?version=${encodeURIComponent(stamp.versionId)}${full ? '' : `&since=${encodeURIComponent(since)}`}`;
      const listed = await request('GET', url);
      if (!listed.ok && listed.answer.error === 'sign_in') {
        // Strict reading, and this browser holds no pass the service accepts.
        // Not a failure: the service is fine and said exactly what it wants. The
        // next answer that does come must be a full one, whoever signs in.
        setIdentity({ identity: listed.answer.provider, read: 'members', members: identity.members });
        endRefused(listed);
        since = null;
        failures = 0;
        // A pass that arrived meanwhile is about to be used by the cycle `kick()` queued: not locked yet.
        if (!session) setView({ state: 'locked', problem: null });
      } else if (!listed.ok) {
        // The service answered, and the answer is "not this page". Polling on
        // would only repeat it; the comments stay local and say why.
        failures += 1;
        setView({ state: 'offline', problem: PROBLEMS[listed.answer.error] || PROBLEMS.not_found });
      } else {
        take(listed.answer, full);
        failures = 0;
        setView({ state: 'shared', problem: sent ? (Object.keys(rejected).length ? view.problem : null) : view.problem });
      }
    } catch {
      // No answer at all. Everything stays queued and local.
      failures += 1;
      setView({ state: 'offline' });
    } finally {
      busy = false;
      schedule();
      if (again) {
        again = false;
        kick();
      }
    }
  }

  function delay() {
    if (failures > 0) return Math.min(POLL_MS * 2 ** failures, MAX_BACKOFF_MS);
    // Locked out of reading: only a sign-in (which kicks) or the author changing
    // the rule can change the answer, so ask rarely.
    if (view.state === 'locked') return QUIET_POLL_MS;
    return now() - lastActivity >= QUIET_AFTER_MS ? QUIET_POLL_MS : POLL_MS;
  }

  function schedule() {
    if (timer !== null) timers.clear(timer);
    timer = null;
    // A hidden tab does not poll at all: `onVisible` below starts it again.
    if (isHidden()) return;
    timer = timers.set(() => {
      timer = null;
      cycle();
    }, delay());
  }

  /** Run a cycle now: a local write, or the tab coming back. */
  function kick() {
    if (timer !== null) timers.clear(timer);
    timer = null;
    cycle();
  }

  onVisible(() => {
    if (isHidden()) {
      if (timer !== null) timers.clear(timer);
      timer = null;
    } else {
      kick();
    }
  });

  /** Swap an arrival code for a pass, once, before the first list is asked for. */
  async function claimArrival(code) {
    try {
      const response = await fetchImpl(`${base.replace(/\/comments$/, '')}/auth/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const answer = await response.json();
      if (response.status === 200 && answer && answer.member === true && typeof answer.pass === 'string') {
        session = { pass: answer.pass, expires: answer.expires, identity: answer.identity || {} };
        passDisk.write(passKey, session);
      }
    } catch {
      /* no pass: the panel offers its own sign-in, as it would have anyway */
    }
  }

  save();
  const arrival = takeArrivalCode();
  if (arrival) claimArrival(arrival).then(kick);
  else kick();

  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** `{ state: 'connecting'|'shared'|'offline'|'locked', problem, versions, latest }` */
    view: () => ({
      ...view,
      unsent: ops.length,
      isLatest: !view.latest || view.latest === stamp.versionId,
      // Sign-in: the mode the service reported, who this browser is signed in as, and where a sign-in stands.
      identity: { ...identity },
      session: session ? { ...session.identity } : null,
      signin: { state: signin.state, shortCode: signin.shortCode, who: signin.who },
    }),
    /**
     * "Your own". A comment written under sign-in belongs to a person, so it is
     * yours on any browser you are signed in on; a typed-name one belongs to the
     * browser that wrote it. The service enforces both; this only decides
     * whether Edit and Delete are drawn.
     */
    isMine(id) {
      const author = authorOf(id);
      if (author && author.verified === true) {
        // By person first; failing that, by this browser having written it. The
        // service compares a permanent id the wire does not carry, so after a
        // username change the two can disagree on another browser (review of #18,
        // R17, a stated limit in API.md); on this browser they cannot.
        return mine.has(id) || Boolean(session && session.identity.provider === author.provider && session.identity.username === author.username);
      }
      return mine.has(id);
    },

    /**
     * Start a sign-in. MUST be called from inside a click: everything up to
     * `openWindow` is synchronous so the browser still counts the pop-up as the
     * person's own doing (measured in plan step 1).
     */
    signIn() {
      if (identity.mode === 'none' || signin.state === 'waiting') return;
      const code = randomHex(16);
      const hash = sha256hex(code);
      const popup = openWindow(`${origin}/auth/start?key=${encodeURIComponent(stamp.key)}&code_hash=${hash}`);
      const digits = String(parseInt(hash.slice(0, 8), 16) % 10000).padStart(4, '0');
      Object.assign(signin, { code, shortCode: `${digits.slice(0, 2)}-${digits.slice(2)}`, who: null, started: now() });
      // A blocked pop-up is the one thing the window reference can tell us. Once
      // open it reads as closed at once (the provider cuts the link), so the
      // wait below never looks at it: it has Cancel and a time limit instead.
      signin.state = popup ? 'waiting' : 'blocked';
      announce();
      if (popup) askForPass();
    },
    cancelSignIn() {
      stopAsking('idle');
    },
    async signOut() {
      if (!session) return;
      const pass = session.pass;
      endSession();
      try {
        await fetchImpl(`${base.replace(/\/comments$/, '')}/auth/session`, { method: 'DELETE', headers: { 'x-gitmargin-pass': pass } });
      } catch {
        /* the pass is gone from this browser either way, and it expires on the service */
      }
    },
    /** A comment or reply id that other people cannot see yet, or cannot see the latest text of. */
    isUnshared: (id) => Boolean(rejected[id]) || ops.some((o) => (o.op === 'add' && o.id === id) || (o.op === 'reply-add' && o.rid === id)),
    versionId: stamp.versionId,
    /**
     * An older version's comments, for the read-only list under the Version
     * accordion. Never enters the store: those comments are about another page.
     * Resolves to null when the service cannot be reached.
     */
    async loadVersion(versionId) {
      try {
        const listed = await request('GET', `${base}?version=${encodeURIComponent(versionId)}`);
        return listed.ok ? (listed.answer.comments || []).filter((c) => c && !c.deleted) : null;
      } catch {
        return null;
      }
    },
    /** Where a stored copy of a version lives (plan step 6). */
    pageUrl: (versionId) => `${origin}/p/${encodeURIComponent(stamp.key)}/${encodeURIComponent(versionId)}`,

    // The store's three writes, local first and then queued.
    add(comment) {
      const added = store.add({ ...comment, author: writer(), replies: [], version_id: stamp.versionId });
      mine.add(added.id);
      enqueue({ op: 'add', id: added.id });
      return added;
    },
    update(id, fields) {
      const updated = store.update(id, fields);
      if (!updated) return updated;
      const add = ops.find((o) => o.op === 'add' && o.id === id);
      delete rejected[id]; // the writer changed it, so it gets another chance
      if (!add && !synced.has(id)) {
        enqueue({ op: 'add', id }); // a refused comment, now rewritten
      } else if (!add || add.tried) {
        // An add that has not left yet will carry the new text itself. One that
        // is on the wire, or was sent and never answered, will not: the service
        // keeps the FIRST text it saw and answers a retry with it, so without an
        // edit behind it the old text came back and replaced this one (review R7).
        enqueue({ op: 'edit', id });
      } else {
        save();
      }
      return updated;
    },
    remove(id) {
      const removed = store.remove(id);
      if (!removed) return false;
      // 'Never sent' means the add has not left. One that is on the wire may
      // already be stored, so it needs a delete behind it or the comment comes
      // back on the next list (review R6).
      const add = ops.find((o) => o.op === 'add' && o.id === id);
      const neverSent = Boolean(add) && !add.tried;
      for (let i = ops.length - 1; i >= 0; i -= 1) if (ops[i].id === id) ops.splice(i, 1);
      delete rejected[id];
      if (neverSent) save();
      else enqueue({ op: 'delete', id });
      return true;
    },

    addReply(commentId, text) {
      const comment = find(commentId);
      if (!comment) return null;
      const time = isoSeconds(now());
      const reply = { id: newReplyId(), text: String(text), author: writer() };
      store.applyRemote({ upsert: [{ ...comment, replies: [...(comment.replies || []), { ...reply, time, updated: time }] }] });
      mine.add(reply.id);
      enqueue({ op: 'reply-add', id: commentId, rid: reply.id, reply, time });
      return reply;
    },
    editReply(commentId, replyId, text) {
      const comment = find(commentId);
      if (!comment) return false;
      const replies = (comment.replies || []).map((r) => (r.id === replyId ? { ...r, text: String(text) } : r));
      store.applyRemote({ upsert: [{ ...comment, replies }] });
      const waiting = ops.find((o) => o.op === 'reply-add' && o.rid === replyId);
      const refused = Boolean(rejected[replyId]);
      delete rejected[replyId];
      if (waiting) waiting.reply = { ...waiting.reply, text: String(text) };
      if (waiting && !waiting.tried) {
        save();
        kick();
      } else if (!waiting && refused) {
        // A refused reply, rewritten: send it again as the reply it never became.
        const reply = replies.find((r) => r.id === replyId);
        enqueue({ op: 'reply-add', id: commentId, rid: replyId, reply: { id: replyId, text: String(text), author: reply.author }, time: reply.time });
      } else {
        enqueue({ op: 'reply-edit', id: commentId, rid: replyId }); // same reasoning as update(), review R7
      }
      return true;
    },
    removeReply(commentId, replyId) {
      const comment = find(commentId);
      if (!comment) return false;
      store.applyRemote({ upsert: [{ ...comment, replies: (comment.replies || []).filter((r) => r.id !== replyId) }] });
      const at = ops.findIndex((o) => o.op === 'reply-add' && o.rid === replyId);
      const wasRefused = Boolean(rejected[replyId]);
      delete rejected[replyId];
      if (at >= 0 && !ops[at].tried) {
        ops.splice(at, 1);
        save();
      } else if (wasRefused && at < 0) {
        save(); // the service never took it, so there is nothing to delete there
      } else {
        if (at >= 0) ops.splice(at, 1);
        enqueue({ op: 'reply-delete', id: commentId, rid: replyId });
      }
      return true;
    },

    /** Test seam: the pacing the next poll would use, and the queue. */
    debug: () => ({ delay: delay(), ops: ops.map((o) => ({ ...o })), since, token }),
    stop() {
      if (timer !== null) timers.clear(timer);
      timer = null;
    },
  };
}
