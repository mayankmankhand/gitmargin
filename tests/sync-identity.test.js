// Sign-in inside src/overlay/sync.js (issue #18), in plain Node: the real store,
// the real sync, the real router on an in-process Postgres, and the fake GitLab
// as the provider. The pop-up is played by a function: it does what a person's
// browser would do (start, provider, callback, Continue) and reports what the
// confirm page showed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { route } from '../service/src/router.js';
import { memoryDatabase } from './helpers/service-server.js';
import { startFakeGitlab } from './helpers/fake-gitlab.js';

globalThis.location = { pathname: '/proto.gitmargin.html' };

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SECRET = 'sync-identity-test-value-0123';
const SERVICE = 'https://comments.example';
let instance = 0;

async function world(t, { person = 'priya', members = 'gitmargin-test' } = {}) {
  const database = memoryDatabase();
  const fake = await startFakeGitlab({ person });
  fake.allowRedirect(`${SERVICE}/auth/callback`);
  t.after(async () => {
    await database.close();
    await fake.close();
  });
  let at = Date.parse('2026-09-21T12:00:00.000Z');
  const clock = { now: () => at, advance: (ms) => (at += ms) };
  const deps = {
    query: database.query,
    now: () => new Date(at),
    secret: SECRET,
    fetch: (...args) => fetch(...args),
    origin: SERVICE,
    providers: { gitlab: { url: fake.url, id: fake.clientId, secret: fake.clientSecret } },
  };
  const call = async (method, url, { headers = {}, body = null } = {}) => {
    const u = new URL(url, SERVICE);
    return route({ method, path: u.pathname, query: Object.fromEntries(u.searchParams), headers, body }, deps);
  };
  const author = async (method, p, body) => JSON.parse((await call(method, p, { headers: { authorization: `Bearer ${SECRET}` }, body })).body);
  const { key } = await author('POST', '/api/prototypes', { name: 'proto.html' });
  const { version_id: versionId } = await author('POST', `/api/prototypes/${key}/versions`, { hash: 'aaaaaa' });
  if (members !== false) await author('PATCH', `/api/prototypes/${key}`, { identity: 'gitlab', members });
  const held = () => database.query('select id, author_name, author_provider from comments where deleted_at is null order by id');
  return { fake, deps, clock, key, versionId, author, call, held };
}

/** What the person's browser does in the pop-up. Returns the code the confirm page showed. */
async function popup(w, url, { press = 'continue' } = {}) {
  const started = await w.call('GET', url);
  assert.equal(started.status, 302, started.body);
  const landed = await w.call('GET', w.fake.approve(started.headers.location));
  const field = (name) => (new RegExp(`name="${name}" value="([^"]*)"`).exec(landed.body) || [])[1];
  const shown = (/class="code">([^<]+)</.exec(landed.body) || [])[1] || null;
  if (press && field('state')) await w.call('POST', '/auth/confirm', { body: { state: field('state'), token: field('token'), decision: press } });
  return shown;
}

async function client(w, { storage = new Map(), syncModule = '../src/overlay/sync.js', blocked = false } = {}) {
  instance += 1;
  const store = await import(`../src/overlay/store.js?identity=${instance}`);
  const { startSync } = await import(syncModule);
  store.load(w.versionId);

  const net = { inflight: 0, calls: [] };
  const fetchImpl = async (url, init = {}) => {
    net.inflight += 1;
    try {
      const u = new URL(url);
      const method = init.method || 'GET';
      net.calls.push(`${method} ${u.pathname}`);
      const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
      const answer = await w.call(method, url, { headers, body: init.body ? JSON.parse(init.body) : null });
      return { ok: answer.status < 400, status: answer.status, json: async () => JSON.parse(answer.body) };
    } finally {
      net.inflight -= 1;
    }
  };

  // Several timers at once here: the poll and the sign-in's asking run side by side.
  const timers = new Map();
  let nextId = 0;
  const opened = [];
  const sync = startSync({
    stamp: { service: SERVICE, key: w.key, versionId: w.versionId },
    store,
    fetchImpl,
    now: w.clock.now,
    timers: {
      set: (fn, ms) => {
        nextId += 1;
        timers.set(nextId, { fn, ms });
        return nextId;
      },
      clear: (id) => timers.delete(id),
    },
    isHidden: () => false,
    onVisible: () => {},
    storage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    openWindow: (url) => {
      opened.push(url);
      return blocked ? null : { closed: true }; // reads as closed at once, as measured
    },
  });

  const idle = async () => {
    for (let calm = 0; calm < 8; ) {
      await new Promise((resolve) => setImmediate(resolve));
      calm = net.inflight === 0 ? calm + 1 : 0;
    }
  };
  /** Fire every timer that is set right now, once. */
  const tick = async () => {
    const due = [...timers.entries()];
    for (const [id, timer] of due) {
      timers.delete(id);
      timer.fn();
    }
    await idle();
  };
  await idle();
  return { sync, store, net, opened, storage, tick, idle, timers };
}

const draft = (id) => ({ id, time: '2026-09-21T12:00:00Z', intent: { text: 'Why here?', tag: null }, anchor: {}, state: {}, status: 'open' });

test('the mode comes from the service; a comment written signed out is kept, and goes the moment a pass arrives', async (t) => {
  const w = await world(t);
  const c = await client(w);
  assert.deepEqual(c.sync.view().identity, { mode: 'gitlab', read: 'open', members: 'gitmargin-test' });
  assert.equal(c.sync.view().session, null);

  const added = c.sync.add(draft('c_aaaaaa'));
  await c.idle();
  await c.tick();
  assert.equal((await w.held()).length, 0);
  assert.equal(c.sync.view().unsent, 1, 'the comment was dropped instead of kept');
  assert.ok(c.sync.isUnshared(added.id));
  const knocks = c.net.calls.filter((line) => line.startsWith('POST') && line.endsWith('/comments')).length;
  await c.tick();
  await c.tick();
  assert.equal(c.net.calls.filter((line) => line.startsWith('POST') && line.endsWith('/comments')).length, knocks, 'it kept knocking without a pass');

  c.sync.signIn();
  assert.equal(c.sync.view().signin.state, 'waiting');
  assert.match(c.opened[0], /\/auth\/start\?key=gm_[^&]+&code_hash=[0-9a-f]{64}$/);
  const shown = await popup(w, c.opened[0]);
  assert.equal(shown, c.sync.view().signin.shortCode, 'the panel and the confirm page show different codes');

  await c.tick();
  assert.deepEqual(c.sync.view().session, { provider: 'gitlab', name: 'Priya Shah', username: 'priya' });
  assert.equal(c.sync.view().signin.state, 'idle');
  const held = await w.held();
  assert.deepEqual(held.map((r) => [r.id, r.author_name, r.author_provider]), [['c_aaaaaa', 'Priya Shah', 'gitlab']]);
  assert.equal(c.sync.view().unsent, 0);
  assert.equal(c.store.comments()[0].author.verified, true);
});

test('only the hash of the code is ever in the pop-up address', async (t) => {
  const w = await world(t);
  const c = await client(w);
  c.sync.signIn();
  const hash = new URL(c.opened[0]).searchParams.get('code_hash');
  const claimed = c.net.calls; // the code itself goes only in a claim's body, never in an address
  assert.ok(!c.opened[0].includes('code='));
  assert.equal(hash.length, 64);
  assert.ok(claimed.every((line) => !line.includes(hash)));
});

test('nothing is granted until Continue: asking before it changes nothing', async (t) => {
  const w = await world(t);
  const c = await client(w);
  c.sync.signIn();
  await popup(w, c.opened[0], { press: null });
  await c.tick();
  await c.tick();
  assert.equal(c.sync.view().session, null);
  assert.equal(c.sync.view().signin.state, 'waiting');
});

test('a blocked pop-up says so and asks the service nothing', async (t) => {
  const w = await world(t);
  const c = await client(w, { blocked: true });
  c.sync.signIn();
  assert.equal(c.sync.view().signin.state, 'blocked');
  await c.tick();
  assert.ok(!c.net.calls.some((line) => line.includes('/auth/claim')));
});

test('someone outside the group is told so by name, and gets no pass', async (t) => {
  const w = await world(t, { person: 'sam' });
  const c = await client(w);
  c.sync.signIn();
  await popup(w, c.opened[0]);
  await c.tick();
  const view = c.sync.view();
  assert.equal(view.signin.state, 'not_member');
  assert.equal(view.signin.who.name, 'Sam Lee');
  assert.equal(view.signin.who.members, 'gitmargin-test');
  assert.equal(view.session, null);
});

test('Cancel stops the asking, Cancel on the confirm page ends it, and three minutes is the limit', async (t) => {
  const w = await world(t);
  const c = await client(w);
  c.sync.signIn();
  c.sync.cancelSignIn();
  const before = c.net.calls.filter((line) => line.includes('/auth/claim')).length;
  await c.tick();
  assert.equal(c.net.calls.filter((line) => line.includes('/auth/claim')).length, before);
  assert.equal(c.sync.view().signin.state, 'idle');

  c.sync.signIn();
  await popup(w, c.opened[1], { press: 'cancel' });
  await c.tick();
  assert.equal(c.sync.view().signin.state, 'failed');

  c.sync.signIn();
  w.clock.advance(3 * 60 * 1000 + 1000);
  await c.tick();
  assert.equal(c.sync.view().signin.state, 'failed');
});

test('the pass is remembered by the browser, sign-out ends it on the service too, and an ended pass is noticed', async (t) => {
  const w = await world(t);
  const storage = new Map();
  const first = await client(w, { storage });
  first.sync.signIn();
  await popup(w, first.opened[0]);
  await first.tick();
  assert.ok(first.sync.view().session);

  const again = await client(w, { storage }); // the same browser, another visit
  assert.deepEqual(again.sync.view().session, { provider: 'gitlab', name: 'Priya Shah', username: 'priya' });
  again.sync.add(draft('c_bbbbbb'));
  await again.idle();
  assert.equal((await w.held()).length, 1);

  await again.sync.signOut();
  assert.equal(again.sync.view().session, null);
  assert.equal(JSON.parse(storage.get(`gitmargin:pass:${w.key}`)), null);

  // The author ends every pass: a browser that still holds one learns of it on its next write.
  const held = await client(w, { storage: new Map() });
  held.sync.signIn();
  await popup(w, held.opened[0]);
  await held.tick();
  await w.author('PATCH', `/api/prototypes/${w.key}`, { identity: 'gitlab', members: 'gitmargin-test' });
  held.sync.add(draft('c_cccccc'));
  await held.idle();
  assert.equal(held.sync.view().session, null, 'an ended pass was not noticed');
  assert.equal(held.sync.view().unsent, 1, 'the comment written on an ended pass was dropped');
});

test('"your own" follows the person to another browser, and stops at another member', async (t) => {
  const w = await world(t);
  const laptop = await client(w);
  laptop.sync.signIn();
  await popup(w, laptop.opened[0]);
  await laptop.tick();
  laptop.sync.add(draft('c_dddddd'));
  await laptop.idle();

  const desktop = await client(w); // the same person, a different browser and edit token
  assert.equal(desktop.sync.isMine('c_dddddd'), false, 'signed out, nothing verified is yours');
  desktop.sync.signIn();
  await popup(w, desktop.opened[0]);
  await desktop.tick();
  assert.equal(desktop.sync.isMine('c_dddddd'), true);

  w.fake.set({ person: 'mallory' });
  const other = await client(w);
  other.sync.signIn();
  await popup(w, other.opened[0]);
  await other.tick();
  assert.equal(other.sync.isMine('c_dddddd'), false);
});

test('with sign-in off nothing here is reachable: no mode, no pass header, typed names as before', async (t) => {
  const w = await world(t, { members: false });
  const c = await client(w);
  assert.equal(c.sync.view().identity.mode, 'none');
  c.sync.signIn();
  assert.equal(c.opened.length, 0, 'a pop-up opened on a prototype without sign-in');
  c.store.setReviewer('Sam');
  c.sync.add(draft('c_eeeeee'));
  await c.idle();
  assert.deepEqual((await w.held()).map((r) => [r.author_name, r.author_provider]), [['Sam', null]]);
  assert.ok(!c.net.calls.some((line) => line.includes('/auth/')));
});

test('a copy shared before the switch, still running the #15 overlay, fails safely', async (t) => {
  const w = await world(t);
  // The overlay's sync module exactly as it shipped in #15.
  const old = execFileSync('git', ['show', '73fc4c9:src/overlay/sync.js'], { cwd: ROOT, encoding: 'utf8' });
  const folder = mkdtempSync(path.join(tmpdir(), 'gitmargin-old-sync-'));
  writeFileSync(path.join(folder, 'package.json'), '{"type":"module"}');
  writeFileSync(path.join(folder, 'sync.js'), old);
  const c = await client(w, { syncModule: pathToFileURL(path.join(folder, 'sync.js')).toString() });

  c.store.setReviewer('Old Copy');
  const added = c.sync.add(draft('c_ffffff'));
  await c.idle();
  assert.equal((await w.held()).length, 0, 'an old copy wrote past the sign-in');
  assert.equal(c.store.comments().length, 1, 'the comment was lost locally');
  assert.ok(c.sync.isUnshared(added.id), 'the comment is not marked as unshared');
  const writes = c.net.calls.filter((line) => line.startsWith('POST')).length;
  await c.tick();
  await c.tick();
  assert.equal(c.net.calls.filter((line) => line.startsWith('POST')).length, writes, 'an old copy retries a refused write in a loop');
});
