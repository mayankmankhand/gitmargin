// The service, tested through `route` with an in-process Postgres and a clock
// the test moves. Each refusal in API.md has a test that asserts the refusal.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route } from '../src/router.js';
import { LIMITS } from '../src/validate.js';
import { memoryDatabase, testClock } from '../../tests/helpers/service-server.js';

const SECRET = 'an-author-secret-for-the-router-tests';
const ALICE = 'alice-token-0123456789';
const BOB = 'bob-token-0123456789abc';

/** A fresh service with one prototype and one registered version. */
async function fresh(options = {}) {
  const database = memoryDatabase();
  const clock = testClock();
  const deps = { query: options.query || database.query, now: clock.now, secret: options.secret ?? SECRET };
  const call = async (method, path, { body, token, secret, query } = {}) => {
    const headers = {};
    if (token) headers['x-gitmargin-token'] = token;
    if (secret) headers.authorization = `Bearer ${secret}`;
    const answer = await route({ method, path, query, headers, body }, deps);
    return { status: answer.status, headers: answer.headers, json: answer.body ? JSON.parse(answer.body) : null };
  };
  if (options.bare) return { call, clock, database };
  const { json: made } = await call('POST', '/api/prototypes', { secret: SECRET, body: { name: 'wizard.html' } });
  const { json: version } = await call('POST', `/api/prototypes/${made.key}/versions`, {
    secret: SECRET,
    body: { hash: 'aaaaaa', file: 'wizard.html' },
  });
  return { call, clock, database, key: made.key, version: version.version_id };
}

const comment = (id, text = 'I expected this to stay disabled.') => ({
  id,
  time: '2026-09-18T12:00:00Z',
  intent: { text, tag: 'bug' },
  anchor: { selector: '#next', quote: { prefix: '', exact: 'Next', suffix: '' }, point: { x: 0.5, y: 0.5 } },
  state: { hash: '#step-2', title: 'Wizard', screen: { name: 'Address', source: 'heading' }, trail: [], screenshot: null },
});

const add = (s, id, token = ALICE, name = 'Alice', extra = {}) =>
  s.call('POST', `/api/p/${s.key}/comments`, {
    token,
    body: { version_id: s.version, author: { name }, comment: { ...comment(id), ...extra } },
  });

test('OPTIONS answers 204 with open CORS on any path', async () => {
  const s = await fresh({ bare: true });
  const r = await s.call('OPTIONS', '/p/anything/at/all');
  assert.equal(r.status, 204);
  assert.equal(r.headers['access-control-allow-origin'], '*');
  assert.match(r.headers['access-control-allow-headers'], /x-gitmargin-token/);
});

test('author routes refuse a missing, wrong, or unconfigured secret', async () => {
  const s = await fresh({ bare: true });
  assert.equal((await s.call('POST', '/api/prototypes', { body: { name: 'x' } })).status, 401);
  assert.equal((await s.call('POST', '/api/prototypes', { secret: 'wrong', body: { name: 'x' } })).status, 401);
  // A deployment that forgot the variable must not hand author rights to an empty header.
  const unset = await fresh({ bare: true, secret: '' });
  const r = await unset.call('POST', '/api/prototypes', { body: { name: 'x' } });
  assert.equal(r.status, 401);
  const blank = await route(
    { method: 'POST', path: '/api/prototypes', headers: { authorization: 'Bearer ' }, body: {} },
    { query: unset.database.query, now: () => new Date(), secret: '' },
  );
  assert.equal(blank.status, 401);
});

test('a wrong secret learns nothing about which prototypes exist', async () => {
  const s = await fresh();
  const real = await s.call('POST', `/api/prototypes/${s.key}/versions`, { secret: 'wrong', body: { hash: 'bbbbbb' } });
  const made = await s.call('POST', '/api/prototypes/gm_doesnotexist0000/versions', { secret: 'wrong', body: { hash: 'bbbbbb' } });
  assert.deepEqual([real.status, real.json], [made.status, made.json]);
});

test('an unknown key is the same 404 as an unknown path', async () => {
  const s = await fresh();
  const a = await s.call('GET', '/api/p/gm_doesnotexist0000/comments');
  const b = await s.call('GET', '/api/nothing-here');
  assert.deepEqual([a.status, a.json], [404, { error: 'not_found' }]);
  assert.deepEqual([b.status, b.json], [404, { error: 'not_found' }]);
});

test('the service assigns the round; unchanged content keeps its version', async () => {
  const s = await fresh();
  assert.equal(s.version, 'v1-aaaaaa');
  const same = await s.call('POST', `/api/prototypes/${s.key}/versions`, { secret: SECRET, body: { hash: 'aaaaaa' } });
  assert.deepEqual([same.status, same.json.version_id, same.json.created], [200, 'v1-aaaaaa', false]);
  const next = await s.call('POST', `/api/prototypes/${s.key}/versions`, { secret: SECRET, body: { hash: 'bbbbbb' } });
  assert.deepEqual([next.status, next.json.version_id, next.json.round], [201, 'v2-bbbbbb', 2]);
  assert.equal((await s.call('POST', `/api/prototypes/${s.key}/versions`, { secret: SECRET, body: { hash: 'nothex' } })).status, 400);
});

test('add, list, and the wire shape: whitelisted body plus author, status, replies', async () => {
  const s = await fresh();
  const r = await add(s, 'c_000001', ALICE, '  Alice   Smith ', { status: 'applied', replies: [{ text: 'forged' }], evil: '<script>' });
  assert.equal(r.status, 201);
  const list = await s.call('GET', `/api/p/${s.key}/comments`);
  assert.equal(list.status, 200);
  const [c] = list.json.comments;
  assert.equal(c.author.name, 'Alice Smith');
  assert.equal(c.status, 'open', 'status is never taken from the sender');
  assert.deepEqual(c.replies, [], 'replies are never taken from the sender');
  assert.equal(c.evil, undefined, 'unknown fields are dropped');
  assert.equal(c.state.screen.name, 'Address');
  assert.equal(c.version_id, s.version);
  assert.equal(list.json.latest, s.version);
  assert.deepEqual(list.json.versions.map((v) => [v.version_id, v.comments, v.has_page]), [['v1-aaaaaa', 1, false]]);
});

test('the same add sent twice yields one comment; another token cannot take the id', async () => {
  const s = await fresh();
  assert.equal((await add(s, 'c_000002')).status, 201);
  const again = await add(s, 'c_000002');
  assert.equal(again.status, 200);
  assert.equal(again.json.id, 'c_000002');
  assert.equal((await add(s, 'c_000002', BOB, 'Bob')).status, 409);
  const list = await s.call('GET', `/api/p/${s.key}/comments`);
  assert.equal(list.json.comments.length, 1);
});

test('shape refusals: bad id, missing text, long text, unknown version, missing token', async () => {
  const s = await fresh();
  assert.equal((await add(s, 'not-an-id')).status, 400);
  assert.equal((await add(s, 'c_000003', ALICE, 'A', { intent: { text: '   ' } })).status, 400);
  const long = await add(s, 'c_000003', ALICE, 'A', { intent: { text: 'x'.repeat(LIMITS.text + 1) } });
  assert.deepEqual([long.status, long.json.error], [400, 'too_long']);
  const big = await add(s, 'c_000003', ALICE, 'A', { state: { screen: { name: 'y'.repeat(LIMITS.commentBytes) } } });
  assert.deepEqual([big.status, big.json.error], [400, 'too_long']);
  const elsewhere = await s.call('POST', `/api/p/${s.key}/comments`, {
    token: ALICE,
    body: { version_id: 'v9-ffffff', author: { name: 'A' }, comment: comment('c_000003') },
  });
  assert.deepEqual([elsewhere.status, elsewhere.json.error], [400, 'unknown_version']);
  const noToken = await s.call('POST', `/api/p/${s.key}/comments`, { body: { version_id: s.version, comment: comment('c_000003') } });
  assert.equal(noToken.status, 400);
});

test('edit and delete need the token that wrote the comment', async () => {
  const s = await fresh();
  await add(s, 'c_000004');
  const path = `/api/p/${s.key}/comments/c_000004`;
  assert.equal((await s.call('PATCH', path, { token: BOB, body: { intent: { text: 'hijack' } } })).status, 403);
  assert.equal((await s.call('DELETE', path, { token: BOB })).status, 403);
  const edited = await s.call('PATCH', path, { token: ALICE, body: { intent: { text: 'Clearer now.', tag: 'nonsense' } } });
  assert.deepEqual([edited.status, edited.json.intent], [200, { text: 'Clearer now.', tag: null }]);
  assert.equal(edited.json.anchor.selector, '#next', 'only intent changes');
  assert.equal((await s.call('DELETE', path, { token: ALICE })).status, 200);
  assert.equal((await s.call('PATCH', path, { token: ALICE, body: { intent: { text: 'too late' } } })).status, 404);
});

test('a delete shows up as a tombstone in "changed since", and not in a full list', async () => {
  const s = await fresh();
  await add(s, 'c_000005');
  await add(s, 'c_000006');
  // Time passes between writing and the first poll; without it the writes sit
  // in the same instant as `server_time` and rightly arrive again (next test).
  s.clock.advance(5000);
  const first = await s.call('GET', `/api/p/${s.key}/comments`);
  s.clock.advance(5000);
  await s.call('DELETE', `/api/p/${s.key}/comments/c_000005`, { token: ALICE });
  const since = await s.call('GET', `/api/p/${s.key}/comments`, { query: { since: first.json.server_time } });
  assert.deepEqual(since.json.comments.map((c) => [c.id, c.deleted === true]), [['c_000005', true]]);
  assert.equal(since.json.comments[0].intent, undefined, 'a tombstone carries no content');
  const full = await s.call('GET', `/api/p/${s.key}/comments`);
  assert.deepEqual(full.json.comments.map((c) => c.id), ['c_000006']);
  assert.equal((await s.call('GET', `/api/p/${s.key}/comments`, { query: { since: 'yesterday-ish' } })).status, 400);
});

test('"changed since" is at-or-after, so a write in the same instant is not lost', async () => {
  const s = await fresh();
  const before = await s.call('GET', `/api/p/${s.key}/comments`);
  await add(s, 'c_000007'); // the clock has not moved: updated === server_time
  const since = await s.call('GET', `/api/p/${s.key}/comments`, { query: { since: before.json.server_time } });
  assert.deepEqual(since.json.comments.map((c) => c.id), ['c_000007']);
});

test('replies: idempotent add, own-token edit and delete, and they move the parent', async () => {
  const s = await fresh();
  await add(s, 'c_000008');
  const base = `/api/p/${s.key}/comments/c_000008/replies`;
  const first = await s.call('GET', `/api/p/${s.key}/comments`);
  s.clock.advance(5000);

  const made = await s.call('POST', base, { token: BOB, body: { id: 'r_000001', text: 'Agreed.', author: { name: 'Bob' } } });
  assert.equal(made.status, 201);
  assert.deepEqual(made.json.replies.map((r) => [r.id, r.text, r.author.name]), [['r_000001', 'Agreed.', 'Bob']]);
  const again = await s.call('POST', base, { token: BOB, body: { id: 'r_000001', text: 'Agreed.', author: { name: 'Bob' } } });
  assert.deepEqual([again.status, again.json.replies.length], [200, 1]);
  assert.equal((await s.call('POST', base, { token: ALICE, body: { id: 'r_000001', text: 'mine now' } })).status, 409);

  const since = await s.call('GET', `/api/p/${s.key}/comments`, { query: { since: first.json.server_time } });
  assert.deepEqual(since.json.comments.map((c) => c.id), ['c_000008'], 'a reply moves the parent into "changed since"');

  assert.equal((await s.call('PATCH', `${base}/r_000001`, { token: ALICE, body: { text: 'hijack' } })).status, 403);
  const edited = await s.call('PATCH', `${base}/r_000001`, { token: BOB, body: { text: 'Agreed, mostly.' } });
  assert.equal(edited.json.replies[0].text, 'Agreed, mostly.');
  assert.equal((await s.call('DELETE', `${base}/r_000001`, { token: ALICE })).status, 403);
  const gone = await s.call('DELETE', `${base}/r_000001`, { token: BOB });
  assert.deepEqual([gone.status, gone.json.replies], [200, []]);

  assert.equal((await s.call('POST', base, { token: BOB, body: { id: 'bad', text: 'x' } })).status, 400);
  assert.equal((await s.call('POST', base, { token: BOB, body: { id: 'r_000002', text: 'x'.repeat(LIMITS.text + 1) } })).status, 400);
  assert.equal((await s.call('POST', `/api/p/${s.key}/comments/c_ffffff/replies`, { token: BOB, body: { id: 'r_000002', text: 'x' } })).status, 404);
});

test('status and remove are the author\'s alone', async () => {
  const s = await fresh();
  await add(s, 'c_000009');
  const status = `/api/prototypes/${s.key}/comments/c_000009/status`;
  assert.equal((await s.call('PATCH', status, { token: ALICE, body: { status: 'applied' } })).status, 401);
  assert.equal((await s.call('PATCH', status, { secret: SECRET, body: { status: 'done-ish' } })).status, 400);
  const set = await s.call('PATCH', status, { secret: SECRET, body: { status: 'applied' } });
  assert.deepEqual([set.status, set.json.status], [200, 'applied']);

  const remove = `/api/prototypes/${s.key}/comments/c_000009`;
  assert.equal((await s.call('DELETE', remove, { token: ALICE })).status, 401);
  assert.equal((await s.call('DELETE', remove, { secret: SECRET })).status, 200);
  assert.equal((await s.call('DELETE', remove, { secret: SECRET })).status, 404);
  assert.equal((await s.call('GET', `/api/p/${s.key}/comments`)).json.comments.length, 0);
});

test('the write limit: 60 in a minute, then 429, then free again as the minute passes', async () => {
  const s = await fresh();
  await add(s, 'c_00000a');
  const path = `/api/p/${s.key}/comments/c_00000a`;
  for (let i = 1; i < LIMITS.writesPerMinute; i += 1) {
    const r = await s.call('PATCH', path, { token: ALICE, body: { intent: { text: `edit ${i}` } } });
    assert.equal(r.status, 200, `write ${i + 1} of the minute`);
  }
  const over = await s.call('PATCH', path, { token: ALICE, body: { intent: { text: 'one too many' } } });
  assert.deepEqual([over.status, over.json.error], [429, 'slow_down']);
  assert.equal((await s.call('GET', `/api/p/${s.key}/comments`)).status, 200, 'reads are not limited');
  s.clock.advance(61_000);
  assert.equal((await s.call('PATCH', path, { token: ALICE, body: { intent: { text: 'fine again' } } })).status, 200);
});

test('caps: comments per prototype, recoverable by the author; versions per prototype', async () => {
  const s = await fresh();
  // Seed straight into the table: 500 HTTP-shaped adds would trip the write limit first.
  await s.database.query(
    `insert into comments (prototype_key, id, version_id, author_name, body, status, token_hash, created, updated)
     select $1, 'c_' || lpad(to_hex(g), 6, '0'), $2, 'Seed', '{}'::jsonb, 'open', 'x', now(), now()
       from generate_series(1, ${LIMITS.comments}) g`,
    [s.key, s.version],
  );
  const full = await add(s, 'c_ffffff');
  assert.deepEqual([full.status, full.json.error], [409, 'full']);
  assert.equal((await s.call('DELETE', `/api/prototypes/${s.key}/comments/c_000001`, { secret: SECRET })).status, 200);
  assert.equal((await add(s, 'c_ffffff')).status, 201, 'one removal makes room: the cap is not a lockout');

  await s.database.query(
    `insert into versions (prototype_key, version_id, round, hash, created)
     select $1, 'v' || g || '-cccccc', g, 'cccccc', now() from generate_series(2, ${LIMITS.versions}) g`,
    [s.key],
  );
  const tooMany = await s.call('POST', `/api/prototypes/${s.key}/versions`, { secret: SECRET, body: { hash: 'dddddd' } });
  assert.deepEqual([tooMany.status, tooMany.json.error], [409, 'full']);
});

test('stored pages: kept under the cap, skipped over it, pruned beyond the newest ten', async () => {
  const s = await fresh();
  const register = (hash, html) => s.call('POST', `/api/prototypes/${s.key}/versions`, { secret: SECRET, body: { hash, html } });
  const late = await register('aaaaaa', '<p>v1, arriving after the version was registered</p>');
  assert.deepEqual([late.json.created, late.json.page_stored], [false, true]);
  const huge = await register('bbbbbb', 'x'.repeat(LIMITS.pageBytes + 1));
  assert.deepEqual([huge.status, huge.json.page_stored], [201, false]);
  for (let i = 3; i <= 12; i += 1) await register(`0000${String(i).padStart(2, '0')}`, `<p>v${i}</p>`);
  const list = await s.call('GET', `/api/p/${s.key}/comments`);
  const withPage = list.json.versions.filter((v) => v.has_page).map((v) => v.round);
  assert.deepEqual(withPage, [12, 11, 10, 9, 8, 7, 6, 5, 4, 3], 'v1 lost its page; its comments are untouched');
});

test('a database failure is a plain 503, never the raw error', async () => {
  const s = await fresh({
    bare: true,
    query: async () => {
      throw new Error('connect ECONNREFUSED ep-secret-host.neon.tech table "comments"');
    },
  });
  const r = await s.call('GET', '/api/p/gm_anykeyatall000000/comments');
  assert.deepEqual([r.status, r.json], [503, { error: 'service_unavailable' }]);
  const ping = await s.call('GET', '/api/ping');
  assert.deepEqual([ping.status, ping.json], [503, { error: 'service_unavailable' }]);
});

test('a stored page is served sandboxed, never with same-origin rights, and unknowns are one 404', async () => {
  const s = await fresh();
  const html = '<!doctype html><title>v1</title><p>stored</p>';
  await s.call('POST', `/api/prototypes/${s.key}/versions`, { secret: SECRET, body: { hash: 'aaaaaa', html } });

  const raw = (path) => route({ method: 'GET', path, headers: {} }, { query: s.database.query, now: s.clock.now, secret: SECRET });
  for (const which of [s.version, 'latest']) {
    const page = await raw(`/p/${s.key}/${which}`);
    assert.equal(page.status, 200);
    assert.equal(page.body, html);
    assert.match(page.headers['content-type'], /^text\/html/);
    const csp = page.headers['content-security-policy'];
    assert.match(csp, /^sandbox /);
    assert.ok(!csp.includes('allow-same-origin'), 'the one flag that would undo the sandbox');
    for (const needed of ['allow-scripts', 'allow-downloads', 'allow-popups']) assert.ok(csp.includes(needed), needed);
    assert.equal(page.headers['referrer-policy'], 'no-referrer');
    assert.equal(page.headers['access-control-allow-origin'], undefined, 'a page is not an API answer');
  }

  // A newer version with no page: /latest has nothing to serve, the older one still does.
  await s.call('POST', `/api/prototypes/${s.key}/versions`, { secret: SECRET, body: { hash: 'bbbbbb' } });
  const answers = await Promise.all(
    [`/p/${s.key}/latest`, `/p/${s.key}/v2-bbbbbb`, `/p/${s.key}/v9-ffffff`, '/p/gm_doesnotexist0000/latest', `/p/${s.key}/../secrets`].map(raw)
  );
  for (const a of answers) assert.deepEqual([a.status, JSON.parse(a.body)], [404, { error: 'not_found' }]);
  assert.equal((await raw(`/p/${s.key}/${s.version}`)).status, 200);

  // Re-attaching unchanged content replaces the page: a stored copy must not keep an old overlay.
  await s.call('POST', `/api/prototypes/${s.key}/versions`, { secret: SECRET, body: { hash: 'bbbbbb', html: '<p>first</p>' } });
  await s.call('POST', `/api/prototypes/${s.key}/versions`, { secret: SECRET, body: { hash: 'bbbbbb', html: '<p>second</p>' } });
  assert.equal((await raw(`/p/${s.key}/latest`)).body, '<p>second</p>');
});

test('a removed comment keeps its row but none of its content, and old tombstones are cleared (review R2)', async () => {
  const s = await fresh();
  await add(s, 'c_0000a1', ALICE, 'Alice', { intent: { text: 'z'.repeat(3000) } });
  await s.call('POST', `/api/p/${s.key}/comments/c_0000a1/replies`, { token: BOB, body: { id: 'r_0000a1', text: 'y'.repeat(3000), author: { name: 'Bob' } } });
  await s.call('DELETE', `/api/p/${s.key}/comments/c_0000a1`, { token: ALICE });

  const [row] = await s.database.query("select body::text as body, author_name from comments where id = 'c_0000a1'");
  assert.deepEqual([row.body, row.author_name], ['{}', ''], 'a tombstone is not free storage for a key holder');
  const [reply] = await s.database.query("select text, deleted_at from replies where id = 'r_0000a1'");
  assert.equal(reply.text, '');
  assert.notEqual(reply.deleted_at, null);

  // Eight days on, another removal sweeps the old tombstone away.
  s.clock.advance(8 * 24 * 3_600_000);
  await add(s, 'c_0000a2');
  await s.call('DELETE', `/api/p/${s.key}/comments/c_0000a2`, { token: ALICE });
  const left = await s.database.query('select id from comments order by id');
  assert.deepEqual(left.map((r) => r.id), ['c_0000a2']);
});

test('a parallel burst cannot beat the write limit (review R3)', async () => {
  const s = await fresh();
  await add(s, 'c_0000b1');
  const path = `/api/p/${s.key}/comments/c_0000b1`;
  const burst = await Promise.all(
    Array.from({ length: 90 }, (_, i) => s.call('PATCH', path, { token: ALICE, body: { intent: { text: `burst ${i}` } } })),
  );
  const passed = burst.filter((r) => r.status === 200).length;
  const held = burst.filter((r) => r.status === 429).length;
  assert.equal(passed, LIMITS.writesPerMinute - 1, 'the add used one of the sixty');
  assert.equal(held, 90 - passed);
});

test('nested values of the wrong type are never stored, since other browsers read them (review R4)', async () => {
  const s = await fresh();
  const r = await add(s, 'c_0000c1', ALICE, 'Alice', {
    anchor: { selector: '#next', quote: { prefix: 1, exact: 7, suffix: ['x'], extra: 'dropped' }, point: { x: 'left', y: 0.5 } },
    state: { screen: { name: { toString: 'x' }, source: 'heading' }, trail: [{ seconds_before: '3', selector: '#a', text: { evil: true } }, 'not a step'], scroll: { x: 0, y: Infinity }, viewport: { width: 1440, height: '900' } },
  });
  assert.equal(r.status, 201);
  assert.deepEqual(r.json.anchor.quote, { prefix: null, exact: null, suffix: null });
  assert.deepEqual(r.json.anchor.point, { x: null, y: 0.5 });
  assert.deepEqual(r.json.state.screen, { name: null, source: 'heading' });
  assert.deepEqual(r.json.state.trail, [{ seconds_before: null, selector: '#a', text: null }]);
  assert.deepEqual(r.json.state.scroll, { x: 0, y: null });
  assert.deepEqual(r.json.state.viewport, { width: 1440, height: null });
});

test('the reply cap: a hundred live replies per comment, recoverable by removing one (review R9)', async () => {
  const s = await fresh();
  await add(s, 'c_0000d1');
  await s.database.query(
    `insert into replies (prototype_key, comment_id, id, author_name, text, token_hash, created, updated)
     select $1, 'c_0000d1', 'r_' || lpad(to_hex(g), 6, '0'), 'Seed', 'x', $2, now(), now() from generate_series(1, ${LIMITS.replies}) g`,
    [s.key, 'not-a-real-hash'],
  );
  const base = `/api/p/${s.key}/comments/c_0000d1/replies`;
  const full = await s.call('POST', base, { token: BOB, body: { id: 'r_ffffff', text: 'One too many.' } });
  assert.deepEqual([full.status, full.json.error], [409, 'full']);
  await s.database.query("update replies set deleted_at = now() where id = 'r_000001'");
  assert.equal((await s.call('POST', base, { token: BOB, body: { id: 'r_ffffff', text: 'Room now.' } })).status, 201);
});
