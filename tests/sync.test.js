// src/overlay/sync.js, driven in plain Node: the real store, the real sync, and
// the real service router on an in-process Postgres, joined by a `fetch` the
// test can break on demand, with a clock and timers it moves by hand. No
// browser and no waiting, so pacing and retry rules are asserted exactly.

import test from 'node:test';
import assert from 'node:assert/strict';
import { route } from '../service/src/router.js';
import { memoryDatabase } from './helpers/service-server.js';

// store.js reads `location.pathname` for its storage key; Node has no location.
globalThis.location = { pathname: '/proto.gitmargin.html' };

const SECRET = 'sync-test-secret-0123456789-abcdefghij';
const SERVICE = 'https://comments.example';
let instance = 0;

/** One service with one prototype and one registered version, plus a shared clock. */
async function world(t) {
  const database = memoryDatabase();
  t.after(() => database.close());
  let at = Date.parse('2026-09-18T12:00:00.000Z');
  const clock = { now: () => at, advance: (ms) => (at += ms) };
  const deps = { query: database.query, now: () => new Date(at), secret: SECRET };
  const author = async (method, path, body) =>
    JSON.parse((await route({ method, path, headers: { authorization: `Bearer ${SECRET}` }, body }, deps)).body);
  const { key } = await author('POST', '/api/prototypes', { name: 'proto.html' });
  const { version_id: versionId } = await author('POST', `/api/prototypes/${key}/versions`, { hash: 'aaaaaa' });
  const held = async () => (await database.query('select id, body, deleted_at from comments order by id')).map((r) => ({ ...r }));
  return { deps, clock, key, versionId, author, held, database };
}

/** One browser: its own store instance, its own storage, its own timers. */
async function client(w, { storage = new Map(), stamp, seed = [] } = {}) {
  instance += 1;
  // A query string makes this a separate module instance, so two clients in one
  // process do not share one store the way two tabs never would.
  const store = await import(`../src/overlay/store.js?client=${instance}`);
  const { startSync } = await import('../src/overlay/sync.js');
  store.load(w.versionId);
  // What this browser still holds from an earlier sitting (Node has no localStorage to keep it).
  if (seed.length) store.seed(seed, '', '');

  // `hold` lets a test keep one request on the wire while it does something else,
  // which is where the queue bugs of the #15 review lived (R6, R7).
  const net = { inflight: 0, calls: [], fail: null, hold: null };
  const fetchImpl = async (url, init = {}) => {
    net.inflight += 1;
    try {
      const u = new URL(url);
      const method = init.method || 'GET';
      net.calls.push(`${method} ${u.pathname}${u.search}`);
      const broken = net.fail && net.fail(method, u);
      if (net.hold) await net.hold(method, u);
      if (broken === 'before') throw new TypeError('network down');
      // A refusal happens INSTEAD of the request, not after it. This once ran the
      // request first, so a 'refused' edit had in fact reached the service and the
      // test below could not fail (found by mutation testing, plan step 8).
      if (typeof broken === 'object' && broken) return { ok: false, status: broken.status, json: async () => ({ error: broken.error }) };
      const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
      const answer = await route(
        { method, path: u.pathname, query: Object.fromEntries(u.searchParams), headers, body: init.body ? JSON.parse(init.body) : null },
        w.deps,
      );
      // The request landed and the answer was lost on the way back: a timeout.
      if (broken === 'after') throw new TypeError('timed out');
      return { ok: answer.status < 400, status: answer.status, json: async () => JSON.parse(answer.body) };
    } finally {
      net.inflight -= 1;
    }
  };

  const timer = { next: null, id: 0 };
  let hidden = false;
  let visibleHandler = () => {};
  const sync = startSync({
    stamp: stamp === undefined ? { service: SERVICE, key: w.key, versionId: w.versionId } : stamp,
    store,
    fetchImpl,
    now: w.clock.now,
    timers: {
      set: (fn, ms) => {
        timer.id += 1;
        timer.next = { fn, ms, id: timer.id };
        return timer.id;
      },
      clear: (id) => {
        if (timer.next && timer.next.id === id) timer.next = null;
      },
    },
    isHidden: () => hidden,
    onVisible: (fn) => {
      visibleHandler = fn;
    },
    storage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
  });

  /** Wait until nothing is in flight and nothing new has started for a few turns. */
  const idle = async () => {
    for (let calm = 0; calm < 5; ) {
      await new Promise((resolve) => setImmediate(resolve));
      calm = net.inflight === 0 ? calm + 1 : 0;
    }
  };
  /** Fire the scheduled poll, as the timer would. */
  const tick = async () => {
    const due = timer.next;
    timer.next = null;
    if (due) due.fn();
    await idle();
  };
  const setHidden = async (value) => {
    hidden = value;
    visibleHandler();
    await idle();
  };
  return { store, sync, net, timer, idle, tick, setHidden, storage };
}

const draft = (id, text, time = '2026-09-18T12:00:00Z') => ({
  id,
  time,
  intent: { text, tag: null },
  anchor: { selector: '#next', quote: null, point: null },
  state: { hash: null, title: 't', screen: { name: 'Address', source: 'heading' }, trail: [], screenshot: null },
  status: 'open',
});

test('a page without the sharing tags gets no sync and makes no request', async (t) => {
  const w = await world(t);
  for (const stamp of [{ versionId: w.versionId }, { service: SERVICE, key: null, versionId: w.versionId }, { service: 'javascript:alert(1)', key: w.key, versionId: w.versionId }]) {
    const c = await client(w, { stamp });
    assert.equal(c.sync, null);
    await c.idle();
    assert.deepEqual(c.net.calls, []);
    assert.equal(c.timer.next, null, 'and no timer is left running');
  }
});

test('a comment is saved locally first, then shared, and the other person sees it with its author', async (t) => {
  const w = await world(t);
  const a = await client(w);
  const b = await client(w);
  await a.idle();
  await b.idle();
  a.store.setReviewer('Priya');

  a.sync.add(draft('c_00000a', 'I expected this to stay disabled.'));
  assert.equal(a.store.comments().length, 1, 'in the store before any request is made');
  await a.idle();
  assert.equal(a.sync.view().state, 'shared');
  assert.equal(a.sync.view().unsent, 0);

  await b.tick();
  assert.deepEqual(b.store.comments().map((c) => [c.id, c.author.name, c.intent.text]), [['c_00000a', 'Priya', 'I expected this to stay disabled.']]);
  assert.equal(b.sync.isMine('c_00000a'), false);
  assert.equal(a.sync.isMine('c_00000a'), true);
});

test('an add retried after a timeout that really landed makes one comment, not two', async (t) => {
  const w = await world(t);
  const a = await client(w);
  await a.idle();
  let first = true;
  a.net.fail = (method) => {
    if (method === 'POST' && first) {
      first = false;
      return 'after';
    }
    return null;
  };
  a.sync.add(draft('c_00000b', 'Once.'));
  await a.idle();
  assert.equal(a.sync.view().state, 'offline');
  assert.equal(a.sync.view().unsent, 1, 'the client cannot know it landed, so it keeps it');
  await a.tick();
  assert.equal(a.sync.view().unsent, 0);
  assert.equal((await w.held()).length, 1);
  assert.equal(a.store.comments().length, 1);
});

test('the service going away loses nothing: the comment waits, and arrives when it is back', async (t) => {
  const w = await world(t);
  const a = await client(w);
  const b = await client(w);
  await a.idle();
  a.net.fail = () => 'before';
  a.sync.add(draft('c_00000c', 'Written while the service was down.'));
  await a.idle();
  assert.equal(a.sync.view().state, 'offline');
  assert.equal(a.store.comments().length, 1);
  assert.equal((await w.held()).length, 0);

  a.net.fail = null;
  await a.tick();
  assert.equal(a.sync.view().state, 'shared');
  await b.tick();
  assert.deepEqual(b.store.comments().map((c) => c.id), ['c_00000c']);
});

test('someone else\'s removal takes the local pin away, through "changed since"', async (t) => {
  const w = await world(t);
  const a = await client(w);
  const b = await client(w);
  a.sync.add(draft('c_00000d', 'To be removed.'));
  a.sync.add(draft('c_00000e', 'To stay.', '2026-09-18T12:00:01Z'));
  await a.idle();
  w.clock.advance(5000);
  await b.tick();
  assert.equal(b.store.comments().length, 2);

  w.clock.advance(5000);
  await w.author('DELETE', `/api/prototypes/${w.key}/comments/c_00000d`);
  await b.tick();
  assert.deepEqual(b.store.comments().map((c) => c.id), ['c_00000e']);
  assert.ok(b.net.calls.at(-1).includes('since='), 'a poll after the first asks only for changes');
});

test('an edit the service has not accepted yet survives a poll, and is sent after', async (t) => {
  const w = await world(t);
  const a = await client(w);
  a.sync.add(draft('c_00000f', 'First wording.'));
  await a.idle();

  a.net.fail = (method) => (method === 'PATCH' ? { status: 429, error: 'slow_down' } : null);
  a.sync.update('c_00000f', { intent: { text: 'Second wording.', tag: null } });
  await a.idle();
  await a.tick(); // a poll arrives carrying the service's older text
  assert.equal((await w.held())[0].body.intent.text, 'First wording.', 'the service really has not got it yet');
  assert.equal(a.store.comments()[0].intent.text, 'Second wording.', 'the unsent edit is not overwritten');
  assert.match(a.sync.view().problem, /shared in a minute/);

  a.net.fail = null;
  await a.tick();
  assert.equal(a.sync.view().unsent, 0);
  assert.equal((await w.held())[0].body.intent.text, 'Second wording.');
  assert.equal(a.sync.view().problem, null);
});

test('a comment removed while this browser was away is dropped on the next full load', async (t) => {
  const w = await world(t);
  const storage = new Map();
  const first = await client(w, { storage });
  first.sync.add(draft('c_000010', 'Here today.'));
  await first.idle();
  first.sync.stop();
  await w.author('DELETE', `/api/prototypes/${w.key}/comments/c_000010`);

  // A new sitting: same browser storage, and the comment still in the store.
  const second = await client(w, { storage, seed: [draft('c_000010', 'Here today.')] });
  await second.idle();
  assert.deepEqual(second.store.comments(), [], 'acknowledged once, absent now: removed while away');
  assert.ok(!second.net.calls.some((c) => c.startsWith('POST')), 'and it is not sent back up as if it were new');
  assert.equal(second.sync.debug().token, first.sync.debug().token, 'the edit token outlives the sitting');
});

test('pacing: 5 s, 30 s after five quiet minutes, doubling to 60 s on errors, and back', async (t) => {
  const w = await world(t);
  const a = await client(w);
  await a.idle();
  assert.equal(a.timer.next.ms, 5_000);

  w.clock.advance(5 * 60_000);
  await a.tick();
  assert.equal(a.timer.next.ms, 30_000, 'nothing has changed for five minutes');

  a.sync.add(draft('c_000011', 'Activity.'));
  await a.idle();
  assert.equal(a.timer.next.ms, 5_000, 'a write makes it lively again');

  a.net.fail = () => 'before';
  const seen = [];
  for (let i = 0; i < 5; i += 1) {
    await a.tick();
    seen.push(a.timer.next.ms);
  }
  assert.deepEqual(seen, [10_000, 20_000, 40_000, 60_000, 60_000]);

  a.net.fail = null;
  await a.tick();
  assert.equal(a.timer.next.ms, 5_000, 'one success clears the back-off');
});

test('a hidden tab does not poll, and polls at once when it comes back', async (t) => {
  const w = await world(t);
  const a = await client(w);
  await a.idle();
  await a.setHidden(true);
  assert.equal(a.timer.next, null);
  const before = a.net.calls.length;
  await a.idle();
  assert.equal(a.net.calls.length, before);

  await a.setHidden(false);
  assert.equal(a.net.calls.length, before + 1, 'coming back is a poll, not a wait for the next one');
  assert.equal(a.timer.next.ms, 5_000);
});

test('a comment the service will never take stays local, says why, and is not retried forever', async (t) => {
  const w = await world(t);
  const storage = new Map();
  const a = await client(w, { storage });
  a.sync.add(draft('c_000012', 'x'.repeat(4001)));
  await a.idle();
  assert.equal(a.store.comments().length, 1, 'still here, so it still leaves by file or clipboard');
  assert.equal(a.sync.isUnshared('c_000012'), true);
  assert.match(a.sync.view().problem, /too long/);
  assert.equal(a.sync.view().unsent, 0);
  const posts = () => a.net.calls.filter((c) => c.startsWith('POST')).length;
  const sent = posts();
  await a.tick();
  await a.tick();
  assert.equal(posts(), sent);
  assert.equal((await w.held()).length, 0);
});

test('replies: shared, not duplicated by a retry, and an unsent one survives a poll', async (t) => {
  const w = await world(t);
  const a = await client(w);
  const b = await client(w);
  a.store.setReviewer('Priya');
  b.store.setReviewer('Sam');
  a.sync.add(draft('c_000013', 'What do you think?'));
  await a.idle();
  await b.tick();

  let first = true;
  b.net.fail = (method, u) => {
    if (method === 'POST' && u.pathname.endsWith('/replies') && first) {
      first = false;
      return 'after';
    }
    return null;
  };
  const reply = b.sync.addReply('c_000013', 'Agreed.');
  assert.equal(b.store.comments()[0].replies.length, 1, 'visible at once');
  await b.idle();
  await b.tick();
  assert.equal(b.store.comments()[0].replies.length, 1, 'the retry did not double it');

  w.clock.advance(5000);
  await a.tick();
  assert.deepEqual(a.store.comments()[0].replies.map((r) => [r.text, r.author.name]), [['Agreed.', 'Sam']]);
  assert.equal(b.sync.isMine(reply.id), true);
  assert.equal(a.sync.isMine(reply.id), false);

  b.sync.removeReply('c_000013', reply.id);
  await b.idle();
  w.clock.advance(5000);
  await a.tick();
  assert.deepEqual(a.store.comments()[0].replies, []);
});

test('sync state never leaks into what a reviewer sends: exported comments carry only format fields', async (t) => {
  const w = await world(t);
  const a = await client(w);
  a.sync.add(draft('c_000014', 'Check my shape.'));
  await a.idle();
  await a.tick();
  const held = a.store.comments()[0];
  assert.ok('updated' in held && 'version_id' in held, 'the store keeps what the service sent');
  assert.ok(!Object.keys(held).some((k) => k.startsWith('_') || k === 'pending' || k === 'token'));
});

/** A gate a test opens by hand, plus a way to wait until a request is parked at it. */
function gateOn(client, match) {
  let open;
  let parked;
  const opened = new Promise((resolve) => (open = resolve));
  const arrived = new Promise((resolve) => (parked = resolve));
  client.net.hold = (method, u) => {
    if (!match(method, u)) return null;
    client.net.hold = null;
    parked();
    return opened;
  };
  return { open, arrived };
}

test('a returned file opened in a shared copy does not re-send other people\'s comments or claim them (review R5)', async (t) => {
  const w = await world(t);
  const priya = await client(w);
  priya.store.setReviewer('Priya');
  priya.sync.add(draft('c_000020', 'Priya wrote this.'));
  await priya.idle();

  // The author opens the file Priya sent back: her comment is inside it.
  const author = await client(w, { seed: [draft('c_000020', 'Priya wrote this.')] });
  await author.idle();
  await author.tick();
  assert.ok(!author.net.calls.some((c) => c.startsWith('POST')), 'nothing the service already holds is sent again');
  assert.equal(author.sync.isMine('c_000020'), false);
  assert.equal(author.sync.isUnshared('c_000020'), false);
  assert.equal(author.sync.view().problem, null);
  assert.equal(author.store.comments()[0].author.name, 'Priya');
});

test('deleting a comment while it is on the wire loses nothing else, and the comment stays deleted (review R6)', async (t) => {
  const w = await world(t);
  const a = await client(w);
  await a.idle();
  const gate = gateOn(a, (method) => method === 'POST');
  a.sync.add(draft('c_000021', 'Deleted while being sent.'));
  await gate.arrived;
  a.sync.remove('c_000021');
  a.sync.add(draft('c_000022', 'The change that used to be thrown away.', '2026-09-18T12:00:01Z'));
  gate.open();
  await a.idle();
  await a.tick();

  const held = await w.held();
  assert.deepEqual(held.map((r) => [r.id, r.deleted_at !== null]), [['c_000021', true], ['c_000022', false]]);
  assert.deepEqual(a.store.comments().map((c) => c.id), ['c_000022'], 'and it does not come back on the next list');
  assert.equal(a.sync.view().unsent, 0);
});

test('an edit made while the first send is unanswered is not overwritten by the first text (review R7)', async (t) => {
  const w = await world(t);
  const a = await client(w);
  await a.idle();
  let first = true;
  a.net.fail = (method) => {
    if (method === 'POST' && first) {
      first = false;
      return 'after'; // it landed; the answer was lost
    }
    return null;
  };
  a.sync.add(draft('c_000023', 'First text.'));
  await a.idle();
  a.sync.update('c_000023', { intent: { text: 'Second text.', tag: null } });
  await a.idle();
  await a.tick();
  await a.tick();
  assert.equal((await w.held())[0].body.intent.text, 'Second text.');
  assert.equal(a.store.comments()[0].intent.text, 'Second text.');
  assert.equal(a.sync.view().unsent, 0);
});

test('a change stamped just before the last answer, and stored just after it, still arrives (review R8)', async (t) => {
  const w = await world(t);
  const a = await client(w);
  const b = await client(w);
  a.sync.add(draft('c_000024', 'Seen in time.'));
  await a.idle();
  w.clock.advance(10_000);
  await b.tick();
  const polledAt = w.clock.now();

  // A write whose timestamp was taken two seconds BEFORE that poll, but whose row landed after it.
  w.clock.advance(1_000);
  await w.database.query(
    `insert into comments (prototype_key, id, version_id, author_name, body, status, token_hash, created, updated)
     values ($1, 'c_000025', $2, 'Late', $3::jsonb, 'open', 'x', $4, $4)`,
    [w.key, w.versionId, JSON.stringify(draft('c_000025', 'Stamped early, stored late.')), new Date(polledAt - 2_000).toISOString()],
  );
  await b.tick();
  assert.deepEqual(b.store.comments().map((c) => c.id).sort(), ['c_000024', 'c_000025']);
});

test('a refused reply stays, is marked, and is shared once its writer shortens it (review R12)', async (t) => {
  const w = await world(t);
  const a = await client(w);
  const b = await client(w);
  a.sync.add(draft('c_000026', 'Reply to me.'));
  await a.idle();
  await b.tick();

  const reply = b.sync.addReply('c_000026', 'x'.repeat(4001));
  await b.idle();
  await b.tick();
  assert.equal(b.store.comments()[0].replies.length, 1, 'still in the list after a poll');
  assert.equal(b.sync.isUnshared(reply.id), true);
  assert.match(b.sync.view().problem, /too long/);

  b.sync.editReply('c_000026', reply.id, 'Short now.');
  await b.idle();
  w.clock.advance(6_000);
  await a.tick();
  assert.deepEqual(a.store.comments()[0].replies.map((r) => r.text), ['Short now.']);
  assert.equal(b.sync.isUnshared(reply.id), false);
});

test('a refused edit keeps its warning and its text until the writer fixes it (review R19)', async (t) => {
  const w = await world(t);
  const a = await client(w);
  a.sync.add(draft('c_000027', 'Fine as it is.'));
  await a.idle();
  a.sync.update('c_000027', { intent: { text: 'y'.repeat(4001), tag: null } });
  await a.idle();
  await a.tick();
  await a.tick();
  assert.match(a.sync.view().problem, /too long/, 'the same cycle used to clear this');
  assert.equal(a.sync.isUnshared('c_000027'), true);
  assert.equal(a.store.comments()[0].intent.text.length, 4001, 'a poll does not swap the old text back in');

  a.sync.update('c_000027', { intent: { text: 'Shorter.', tag: null } });
  await a.idle();
  await a.tick();
  assert.equal(a.sync.view().problem, null);
  assert.equal(a.sync.isUnshared('c_000027'), false);
  assert.equal((await w.held())[0].body.intent.text, 'Shorter.');
});
