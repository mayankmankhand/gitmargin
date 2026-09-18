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

/** What a refusal means to the person looking at the panel. */
const PROBLEMS = {
  full: 'This prototype has reached its comment limit. Your comment is saved here but not shared.',
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
 * @param {object} deps
 * @param {{service: ?string, key: ?string, versionId: ?string}} deps.stamp
 * @param {object} deps.store  src/overlay/store.js
 * @returns {null | object} null when the page is not shared.
 */
export function startSync({
  stamp,
  store,
  fetchImpl = (...args) => fetch(...args),
  now = () => Date.now(),
  timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) },
  isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
  onVisible = (fn) => typeof document !== 'undefined' && document.addEventListener('visibilitychange', fn),
  storage = null,
}) {
  if (!stamp || !stamp.service || !stamp.key || !stamp.versionId) return null;

  let base;
  try {
    const url = new URL(stamp.service);
    if (!/^https?:$/.test(url.protocol)) return null;
    base = `${url.origin}/api/p/${encodeURIComponent(stamp.key)}/comments`;
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
  const pendingFor = (id) => ops.filter((o) => o.id === id);
  const hasPending = (id, op) => ops.some((o) => o.id === id && o.op === op);

  function enqueue(entry) {
    ops.push(entry);
    lastActivity = now();
    save();
    kick();
  }

  async function request(method, url, body) {
    const response = await fetchImpl(url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(method === 'GET' ? {} : { 'x-gitmargin-token': token }),
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
    return { ok: response.ok, status: response.status, answer };
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
    // Worth another try later: the service may have room or patience by then.
    if (code === 'slow_down' || code === 'service_unavailable') {
      setView({ problem: PROBLEMS[code] || null });
      return 'later';
    }
    // Gone for everyone: a delete or an edit aimed at it has nothing to do.
    if (code === 'not_found' && entry.op !== 'add' && entry.op !== 'reply-add') return 'drop';
    // Never going to succeed as it stands. The comment stays in the store, so
    // it still leaves by file or clipboard; it is only not shared.
    if (entry.op === 'add') rejected[entry.id] = code;
    setView({ problem: PROBLEMS[code] || PROBLEMS.invalid });
    return 'drop';
  }

  async function flush() {
    while (ops.length) {
      const outcome = await send(ops[0]);
      if (outcome === 'later') return false;
      ops.shift();
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
      // Unsent local changes win until they are acknowledged (rule 2).
      if (local && hasPending(remote.id, 'edit')) merged.intent = local.intent;
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
      merged.replies = replies;
      if (!hasPending(remote.id, 'delete')) upsert.push(merged);
    }

    if (full) {
      // Present here, acknowledged once, absent now: removed while away (rule 4).
      for (const local of store.comments()) {
        if (synced.has(local.id) && !seen.has(local.id)) {
          drop.push(local.id);
          synced.delete(local.id);
        }
      }
    }

    if (upsert.length || drop.length) lastActivity = now();
    store.applyRemote({ upsert, drop });
    since = answer.server_time || since;
    save();
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
      if (!listed.ok) {
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

  // Comments already in the store that the service never acknowledged: written
  // offline in an earlier sitting, or carried in by a returned file. They are
  // this browser's to send ("offline comments upload when the service is back").
  for (const comment of store.comments()) {
    if (!synced.has(comment.id) && !rejected[comment.id] && !hasPending(comment.id, 'add')) {
      mine.add(comment.id);
      ops.push({ op: 'add', id: comment.id });
    }
  }
  save();
  kick();

  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** `{ state: 'connecting'|'shared'|'offline', problem, versions, latest }` */
    view: () => ({ ...view, unsent: ops.length, isLatest: !view.latest || view.latest === stamp.versionId }),
    isMine: (id) => mine.has(id),
    isUnshared: (id) => Boolean(rejected[id]) || hasPending(id, 'add'),
    /** Where a stored copy of a version lives (plan step 6). */
    pageUrl: (versionId) => `${new URL(stamp.service).origin}/p/${encodeURIComponent(stamp.key)}/${encodeURIComponent(versionId)}`,

    // The store's three writes, local first and then queued.
    add(comment) {
      const added = store.add({ ...comment, author: { name: store.reviewer() || '' }, replies: [], version_id: stamp.versionId });
      mine.add(added.id);
      enqueue({ op: 'add', id: added.id });
      return added;
    },
    update(id, fields) {
      const updated = store.update(id, fields);
      // An add still waiting will carry the new text itself.
      if (updated && !hasPending(id, 'add')) enqueue({ op: 'edit', id });
      return updated;
    },
    remove(id) {
      const removed = store.remove(id);
      if (!removed) return false;
      const neverSent = hasPending(id, 'add');
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
      const reply = { id: newReplyId(), text: String(text), author: { name: store.reviewer() || '' } };
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
      if (waiting) {
        waiting.reply = { ...waiting.reply, text: String(text) };
        save();
        kick();
      } else {
        enqueue({ op: 'reply-edit', id: commentId, rid: replyId });
      }
      return true;
    },
    removeReply(commentId, replyId) {
      const comment = find(commentId);
      if (!comment) return false;
      store.applyRemote({ upsert: [{ ...comment, replies: (comment.replies || []).filter((r) => r.id !== replyId) }] });
      const at = ops.findIndex((o) => o.op === 'reply-add' && o.rid === replyId);
      if (at >= 0) {
        ops.splice(at, 1);
        save();
      } else {
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
