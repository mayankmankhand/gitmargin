// Sign-in (issue #18), route by route and refusal by refusal, against the fake
// GitLab in tests/helpers/fake-gitlab.js. The real router runs over an
// in-process Postgres, so none of this needs a network or an account.
//
// Every rule `service/API.md` states under "Sign-in" has a test here that
// asserts the refusal, not just the happy path.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { startService, testClock, memoryDatabase } from '../../tests/helpers/service-server.js';
import { startFakeGitlab } from '../../tests/helpers/fake-gitlab.js';
import { ensureSchema } from '../src/schema.js';
import { isMember, shortCode, cleanGroup, cleanSetting } from '../src/signin.js';

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const newCode = () => randomBytes(16).toString('hex');
const TOKEN = 'a-browser-token-0123456789';
const OTHER_TOKEN = 'another-browser-token-98765';
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

async function setUp(t, { person = 'priya', identity = 'gitlab', members = 'gitmargin-test', read, gitlab } = {}) {
  const fake = await startFakeGitlab({ person });
  const clock = testClock();
  const logged = [];
  const service = await startService({ clock, gitlab: gitlab || fake, log: (error) => logged.push(String(error && error.message)) });
  fake.allowRedirect(`${service.url}/auth/callback`);
  t.after(async () => {
    await service.close();
    await fake.close();
  });
  const ctx = { fake, clock, service, logged };
  ctx.author = (method, path, body) => call(ctx, method, path, { body, headers: { authorization: `Bearer ${service.secret}` } });
  ctx.key = (await ctx.author('POST', '/api/prototypes', { name: 'onboarding.html' })).answer.key;
  ctx.version = (await ctx.author('POST', `/api/prototypes/${ctx.key}/versions`, { hash: 'abc123' })).answer.version_id;
  if (identity !== 'none') {
    const set = await ctx.author('PATCH', `/api/prototypes/${ctx.key}`, { identity, members, ...(read ? { read } : {}) });
    assert.equal(set.status, 200, JSON.stringify(set.answer));
  }
  return ctx;
}

async function call(ctx, method, path, { body, headers = {}, form } = {}) {
  const response = await fetch(`${ctx.service.url}${path}`, {
    method,
    redirect: 'manual',
    headers: form ? { 'content-type': 'application/x-www-form-urlencoded', ...headers } : { 'content-type': 'application/json', ...headers },
    body: form ? new URLSearchParams(form).toString() : body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let answer = null;
  try {
    answer = JSON.parse(text);
  } catch {
    /* an HTML page */
  }
  return { status: response.status, headers: response.headers, text, answer };
}

/** /auth/start, then what the person does at the provider. Returns the callback's answer. */
async function toCallback(ctx, code, key = ctx.key) {
  const started = await call(ctx, 'GET', `/auth/start?key=${key}&code_hash=${sha256(code)}`);
  assert.equal(started.status, 302, started.text);
  const landed = new URL(ctx.fake.approve(started.headers.get('location')));
  return { landed, page: await call(ctx, 'GET', `${landed.pathname}${landed.search}`) };
}

const formField = (html, name) => (new RegExp(`name="${name}" value="([^"]*)"`).exec(html) || [])[1];

/** The whole sign-in, Continue included. Returns the claim's answer. */
async function signIn(ctx, { key = ctx.key, decision = 'continue' } = {}) {
  const code = newCode();
  const { page } = await toCallback(ctx, code, key);
  assert.equal(page.status, 200, page.text);
  const state = formField(page.text, 'state');
  if (state) await call(ctx, 'POST', '/auth/confirm', { form: { state, token: formField(page.text, 'token'), decision } });
  return (await call(ctx, 'POST', `/api/p/${key}/auth/claim`, { body: { code } })).answer;
}

const comment = (id, text = 'Why is this here?') => ({ id, time: '2026-09-21T10:00:00Z', intent: { text, tag: null }, anchor: {}, state: {} });
const write = (ctx, id, { pass, token = TOKEN, name = 'Typed Name', key = ctx.key } = {}) =>
  call(ctx, 'POST', `/api/p/${key}/comments`, {
    body: { version_id: ctx.version, author: { name }, comment: comment(id) },
    headers: { 'x-gitmargin-token': token, ...(pass ? { 'x-gitmargin-pass': pass } : {}) },
  });
const edit = (ctx, id, { pass, token = TOKEN } = {}) =>
  call(ctx, 'PATCH', `/api/p/${ctx.key}/comments/${id}`, {
    body: { intent: { text: 'Edited.', tag: null } },
    headers: { 'x-gitmargin-token': token, ...(pass ? { 'x-gitmargin-pass': pass } : {}) },
  });

// ---- the rule in isolation --------------------------------------------------

test('the members rule is exact and whole, in any case, and fails closed', () => {
  assert.equal(isMember('acme/design', ['acme/design']), true);
  assert.equal(isMember('ACME/Design', ['acme/design']), true);
  assert.equal(isMember('acme', ['acme-design']), false);
  assert.equal(isMember('acme/design', ['acme/design-team']), false);
  assert.equal(isMember('acme/design', ['acme/design/interns']), false);
  assert.equal(isMember('acme/design', []), false);
  assert.equal(isMember('acme/design', null), false, 'no usable claim means nobody is a member');
  assert.equal(isMember(null, null), true, 'no rule means anyone who signs in');
  assert.equal(cleanGroup(' /acme/design/ '), 'acme/design');
  assert.equal(cleanGroup('has space'), undefined);
  assert.match(shortCode(sha256('x')), /^\d\d-\d\d$/);
});

// ---- the happy path, and what it stores --------------------------------------

test('a member signs in, presses Continue, and comments under a verified name the body cannot choose', async (t) => {
  const ctx = await setUp(t);
  const claimed = await signIn(ctx);
  assert.equal(claimed.member, true);
  assert.match(claimed.pass, /^gp_/);
  assert.deepEqual(claimed.identity, { provider: 'gitlab', name: 'Priya Shah', username: 'priya' });

  const written = await write(ctx, 'c_aaaaaa', { pass: claimed.pass, name: 'Mallory Pretending' });
  assert.equal(written.status, 201);
  assert.deepEqual(written.answer.author, { name: 'Priya Shah', provider: 'gitlab', username: 'priya', verified: true });

  const list = (await call(ctx, 'GET', `/api/p/${ctx.key}/comments`)).answer;
  assert.deepEqual(list.prototype, { name: 'onboarding.html', identity: 'gitlab', read: 'open', members: 'gitmargin-test' });
});

test('nothing GitLab handed over is kept: no code, no token, no secret, in any table or log line', async (t) => {
  const ctx = await setUp(t);
  await signIn(ctx);
  const dump = JSON.stringify([await ctx.service.query('select * from signins'), await ctx.service.query('select * from sessions')]);
  for (const secret of [...ctx.fake.handedOut(), ctx.fake.clientSecret]) assert.ok(!dump.includes(secret), 'a provider secret reached the database');
  assert.ok(ctx.fake.handedOut().length >= 2, 'the fake did hand out a code and a token');

  ctx.fake.set({ failToken: true });
  const { page } = await toCallback(ctx, newCode());
  assert.equal(page.status, 502);
  for (const secret of [...ctx.fake.handedOut(), ctx.fake.clientSecret]) assert.ok(!ctx.logged.join('\n').includes(secret), 'a provider secret reached the log');
  assert.ok(ctx.logged.join('\n').includes('invalid_grant'), 'the refusal is logged by name');
});

test('the confirm page names the prototype and the person, shows the short code, and cannot be framed', async (t) => {
  const ctx = await setUp(t);
  const code = newCode();
  const { page } = await toCallback(ctx, code);
  assert.ok(page.text.includes('onboarding.html') && page.text.includes('Priya Shah'));
  assert.ok(page.text.includes(shortCode(sha256(code))));
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});

test('a name that is markup at the provider is text everywhere here', async (t) => {
  const ctx = await setUp(t, { person: 'mallory' });
  const code = newCode();
  const { page } = await toCallback(ctx, code);
  assert.ok(!page.text.includes('<img'), 'the confirm page rendered a provider string as markup');
  assert.ok(page.text.includes('&lt;img'));
});

// ---- sign-in refusals ---------------------------------------------------------

test('a finished round trip WITHOUT Continue leaves the claim pending, and grants nothing', async (t) => {
  const ctx = await setUp(t);
  const code = newCode();
  await toCallback(ctx, code);
  const asked = await call(ctx, 'POST', `/api/p/${ctx.key}/auth/claim`, { body: { code } });
  assert.equal(asked.status, 202);
  assert.deepEqual(asked.answer, { pending: true });
  assert.equal((await ctx.service.query('select 1 from sessions')).length, 0);
});

test('the confirm token works once, a wrong one never, and Cancel ends the sign-in', async (t) => {
  const ctx = await setUp(t);
  const code = newCode();
  const { page } = await toCallback(ctx, code);
  const state = formField(page.text, 'state');
  const token = formField(page.text, 'token');
  assert.equal((await call(ctx, 'POST', '/auth/confirm', { form: { state, token: 'not-the-token', decision: 'continue' } })).status, 400);
  assert.equal((await call(ctx, 'POST', '/auth/confirm', { form: { state, token, decision: 'continue' } })).status, 200);
  assert.equal((await call(ctx, 'POST', '/auth/confirm', { form: { state, token, decision: 'continue' } })).status, 400, 'a used token worked again');

  const cancelled = newCode();
  const second = (await toCallback(ctx, cancelled)).page;
  await call(ctx, 'POST', '/auth/confirm', { form: { state: formField(second.text, 'state'), token: formField(second.text, 'token'), decision: 'cancel' } });
  assert.equal((await call(ctx, 'POST', `/api/p/${ctx.key}/auth/claim`, { body: { code: cancelled } })).status, 404);
});

test('a pass is claimed once; a wrong, malformed or repeated claim gets nothing', async (t) => {
  const ctx = await setUp(t);
  const code = newCode();
  const { page } = await toCallback(ctx, code);
  await call(ctx, 'POST', '/auth/confirm', { form: { state: formField(page.text, 'state'), token: formField(page.text, 'token'), decision: 'continue' } });
  const claim = (body) => call(ctx, 'POST', `/api/p/${ctx.key}/auth/claim`, { body });
  assert.equal((await claim({ code: newCode() })).status, 404, 'someone else\'s code');
  assert.equal((await claim({ code: sha256(code) })).status, 400, 'the hash from the address is not the code');
  assert.equal((await claim({ code })).status, 200);
  assert.equal((await claim({ code })).status, 404, 'a second claim was answered');
  assert.equal((await ctx.service.query('select 1 from sessions')).length, 1);
});

test('an unknown, reused or expired state is refused, and so is a denial at the provider', async (t) => {
  const ctx = await setUp(t);
  assert.equal((await call(ctx, 'GET', '/auth/callback?code=x&state=never-issued')).status, 400);

  const { landed } = await toCallback(ctx, newCode());
  assert.equal((await call(ctx, 'GET', `${landed.pathname}${landed.search}`)).status, 400, 'the same state worked twice');

  const late = newCode();
  const started = await call(ctx, 'GET', `/auth/start?key=${ctx.key}&code_hash=${sha256(late)}`);
  ctx.clock.advance(11 * MINUTE);
  const back = new URL(ctx.fake.approve(started.headers.get('location')));
  assert.equal((await call(ctx, 'GET', `${back.pathname}${back.search}`)).status, 400, 'a sign-in older than 10 minutes finished');
  assert.equal((await call(ctx, 'POST', `/api/p/${ctx.key}/auth/claim`, { body: { code: late } })).status, 404);

  ctx.fake.set({ deny: true });
  const denied = await toCallback(ctx, newCode());
  assert.equal(denied.page.status, 400);
  assert.equal((await ctx.service.query('select 1 from sessions')).length, 0);
});

test('a refused token call stores nothing and the claim finds nothing', async (t) => {
  const ctx = await setUp(t);
  ctx.fake.set({ failToken: true });
  const code = newCode();
  const { page } = await toCallback(ctx, code);
  assert.equal(page.status, 502);
  assert.equal((await ctx.service.query('select 1 from sessions')).length, 0);
  assert.equal((await ctx.service.query('select 1 from signins where subject is not null')).length, 0);
  assert.equal((await call(ctx, 'POST', `/api/p/${ctx.key}/auth/claim`, { body: { code } })).status, 404);
});

test('sign-in starts are limited per prototype per minute, and bad starts are refused', async (t) => {
  const ctx = await setUp(t);
  for (let i = 0; i < 30; i += 1) assert.equal((await call(ctx, 'GET', `/auth/start?key=${ctx.key}&code_hash=${sha256(newCode())}`)).status, 302);
  assert.equal((await call(ctx, 'GET', `/auth/start?key=${ctx.key}&code_hash=${sha256(newCode())}`)).status, 429);
  ctx.clock.advance(MINUTE + 1000);
  assert.equal((await call(ctx, 'GET', `/auth/start?key=${ctx.key}&code_hash=${sha256(newCode())}`)).status, 302);

  assert.equal((await call(ctx, 'GET', `/auth/start?key=${ctx.key}&code_hash=short`)).status, 400);
  assert.equal((await call(ctx, 'GET', `/auth/start?key=gm_doesnotexist0000&code_hash=${sha256(newCode())}`)).status, 404);
});

// ---- the members rule, end to end ---------------------------------------------

for (const [person, rule, why] of [
  ['sam', 'gitmargin-test', 'a member of some other group'],
  ['ines', 'acme/design', 'a member of a subgroup only'],
  ['dana', 'gitmargin-test', 'a group whose path only starts the same'],
  ['dana', 'acme/design', 'a subgroup-looking path that only starts the same'],
  ['noor', 'gitmargin-test', 'no groups at all'],
]) {
  test(`${why} gets no pass and cannot comment`, async (t) => {
    const ctx = await setUp(t, { person, members: rule });
    const claimed = await signIn(ctx);
    assert.equal(claimed.member, false);
    assert.equal(claimed.pass, undefined);
    assert.equal(claimed.members, rule);
    assert.equal((await ctx.service.query('select 1 from sessions')).length, 0);
    assert.equal((await write(ctx, 'c_bbbbbb')).status, 401);
  });
}

test('the not-a-member page leads with the verdict, names the account, and says what to do (review of #18, R1)', async (t) => {
  const ctx = await setUp(t, { person: 'sam' });
  const { page } = await toCallback(ctx, newCode());
  assert.equal(page.status, 200);
  assert.match(page.text, /<h1>Your account is not in gitmargin-test<\/h1>/);
  assert.match(page.text, /signed in to GitLab as <strong>Sam Lee<\/strong>/);
  assert.match(page.text, /Nothing went wrong/);
  assert.match(page.text, /sign out of GitLab first/);
  assert.match(page.text, /close this window/, 'the pop-up flow may still say close this window');
  assert.equal(formField(page.text, 'token'), undefined, 'nothing to confirm');
});

test('the rule matches in any case, and with no rule anyone who signs in may comment', async (t) => {
  const upper = await setUp(t, { members: 'GitMargin-TEST' });
  assert.equal((await signIn(upper)).member, true);
  const open = await setUp(t, { person: 'noor', members: null });
  assert.equal((await signIn(open)).member, true);
});

// ---- passes --------------------------------------------------------------------

test('without a pass a write is refused by name of the provider, and nothing is stored', async (t) => {
  const ctx = await setUp(t);
  const refused = await write(ctx, 'c_cccccc');
  assert.equal(refused.status, 401);
  assert.deepEqual(refused.answer, { error: 'sign_in', provider: 'gitlab' });
  assert.equal((await write(ctx, 'c_cccccc', { pass: 'gp_made-up-made-up-made-up-made-up' })).status, 401);
  assert.equal((await ctx.service.query('select 1 from comments')).length, 0);
});

test('a pass works for its own prototype only, and for 7 days only', async (t) => {
  const ctx = await setUp(t);
  const { pass } = await signIn(ctx);
  const otherKey = (await ctx.author('POST', '/api/prototypes', { name: 'other.html' })).answer.key;
  await ctx.author('POST', `/api/prototypes/${otherKey}/versions`, { hash: 'abc123' });
  await ctx.author('PATCH', `/api/prototypes/${otherKey}`, { identity: 'gitlab', members: 'gitmargin-test' });
  assert.equal((await write(ctx, 'c_dddddd', { pass, key: otherKey })).status, 401, 'a pass opened another prototype');

  assert.equal((await write(ctx, 'c_dddddd', { pass })).status, 201);
  ctx.clock.advance(7 * DAY + MINUTE);
  assert.equal((await write(ctx, 'c_eeeeee', { pass })).status, 401, 'a pass outlived 7 days');
});

test('sign-out really ends the pass, and any settings change ends every pass', async (t) => {
  const ctx = await setUp(t);
  const first = await signIn(ctx);
  await call(ctx, 'DELETE', `/api/p/${ctx.key}/auth/session`, { headers: { 'x-gitmargin-pass': first.pass } });
  assert.equal((await write(ctx, 'c_ffffff', { pass: first.pass })).status, 401);

  const second = await signIn(ctx);
  assert.equal((await write(ctx, 'c_ffffff', { pass: second.pass })).status, 201);
  const changed = await ctx.author('PATCH', `/api/prototypes/${ctx.key}`, { identity: 'gitlab', members: 'gitmargin-test' });
  assert.equal(changed.answer.passes_ended, 1);
  assert.equal((await write(ctx, 'c_abcdef', { pass: second.pass })).status, 401);
});

// ---- "your own" ------------------------------------------------------------------

test('a verified comment belongs to the person: editable from another browser, by no other member, by no bare token', async (t) => {
  const ctx = await setUp(t);
  const laptop = await signIn(ctx);
  assert.equal((await write(ctx, 'c_111111', { pass: laptop.pass, token: TOKEN })).status, 201);

  const desktop = await signIn(ctx); // the same person, a second pass, a different browser token
  assert.equal((await edit(ctx, 'c_111111', { pass: desktop.pass, token: OTHER_TOKEN })).status, 200);

  ctx.fake.set({ person: 'mallory' });
  const other = await signIn(ctx);
  assert.equal((await edit(ctx, 'c_111111', { pass: other.pass, token: TOKEN })).status, 403, 'another member edited it, holding the original token');
  assert.equal((await edit(ctx, 'c_111111', { token: TOKEN })).status, 401, 'the token alone opened it');
});

test('a typed-name comment from before the switch keeps its token rule, plus a pass like every write', async (t) => {
  const ctx = await setUp(t, { identity: 'none' });
  assert.equal((await write(ctx, 'c_222222', { name: 'Sam, typed' })).status, 201);
  await ctx.author('PATCH', `/api/prototypes/${ctx.key}`, { identity: 'gitlab', members: 'gitmargin-test' });

  const listed = (await call(ctx, 'GET', `/api/p/${ctx.key}/comments`)).answer.comments[0];
  assert.deepEqual(listed.author, { name: 'Sam, typed' }, 'an old typed name gained a verified mark');

  const { pass } = await signIn(ctx);
  assert.equal((await edit(ctx, 'c_222222', { token: TOKEN })).status, 401);
  assert.equal((await edit(ctx, 'c_222222', { pass, token: OTHER_TOKEN })).status, 403);
  assert.equal((await edit(ctx, 'c_222222', { pass, token: TOKEN })).status, 200);
});

test('replies follow the same two rules', async (t) => {
  const ctx = await setUp(t);
  const priya = await signIn(ctx);
  await write(ctx, 'c_333333', { pass: priya.pass });
  const reply = (pass, token, method = 'POST', path = '') =>
    call(ctx, method, `/api/p/${ctx.key}/comments/c_333333/replies${path}`, {
      body: { id: 'r_123456', text: 'Agreed.', author: { name: 'Body Name' } },
      headers: { 'x-gitmargin-token': token, ...(pass ? { 'x-gitmargin-pass': pass } : {}) },
    });
  const added = await reply(priya.pass, TOKEN);
  assert.equal(added.status, 201);
  assert.deepEqual(added.answer.replies[0].author, { name: 'Priya Shah', provider: 'gitlab', username: 'priya', verified: true });
  assert.equal((await reply(null, TOKEN)).status, 401);

  ctx.fake.set({ person: 'mallory' });
  const other = await signIn(ctx);
  assert.equal((await reply(other.pass, TOKEN, 'PATCH', '/r_123456')).status, 403);
  assert.equal((await reply(priya.pass, OTHER_TOKEN, 'PATCH', '/r_123456')).status, 200);
});

// ---- settings --------------------------------------------------------------------

test('the settings route needs the secret, refuses nonsense, and says when the service has no provider settings', async (t) => {
  const ctx = await setUp(t, { identity: 'none' });
  const path = `/api/prototypes/${ctx.key}`;
  assert.equal((await call(ctx, 'PATCH', path, { body: { identity: 'gitlab' } })).status, 401);
  for (const body of [{ identity: 'facebook' }, { identity: 'none', members: 'acme' }, { identity: 'none', read: 'members' }, { identity: 'gitlab', read: 'everyone' }, { identity: 'gitlab', members: 'has space' }]) {
    assert.equal((await ctx.author('PATCH', path, body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await ctx.author('PATCH', '/api/prototypes/gm_doesnotexist0000', { identity: 'gitlab' })).status, 404);

  const bare = await setUp(t, { identity: 'none', gitlab: { url: 'https://gitlab.example', clientId: '', clientSecret: '' } });
  assert.equal((await bare.author('PATCH', `/api/prototypes/${bare.key}`, { identity: 'gitlab' })).answer.error, 'provider_not_configured');
});

test('a provider address on plain http that is not loopback is refused', async (t) => {
  const ctx = await setUp(t, { identity: 'none', gitlab: { url: 'http://gitlab.example', clientId: 'id', clientSecret: 'made-up-value-for-this-test' } });
  assert.equal((await ctx.author('PATCH', `/api/prototypes/${ctx.key}`, { identity: 'gitlab' })).answer.error, 'provider_not_configured');
});

test('an id or secret pasted with stray quotes or spaces still signs people in', async (t) => {
  assert.equal(cleanSetting(" 'abc123' "), 'abc123');
  assert.equal(cleanSetting("'abc123"), 'abc123', 'the slip that happened on the first real deployment: one leading quote');
  assert.equal(cleanSetting('"gloas-x"\n'), 'gloas-x');
  assert.equal(cleanSetting(undefined), '');

  const fake = await startFakeGitlab();
  t.after(() => fake.close());
  const ctx = await setUp(t, { gitlab: { url: ` ${fake.url} `, clientId: `'${fake.clientId}`, clientSecret: `'${fake.clientSecret}'` } });
  fake.allowRedirect(`${ctx.service.url}/auth/callback`);
  ctx.fake = fake;
  assert.equal((await signIn(ctx)).member, true);
});

// ---- nothing changes when it is off -------------------------------------------------

test('with sign-in off every answer is what it was: same prototype block, typed names, no pass wanted', async (t) => {
  const ctx = await setUp(t, { identity: 'none' });
  assert.equal((await write(ctx, 'c_444444', { name: 'Priya' })).status, 201);
  const list = (await call(ctx, 'GET', `/api/p/${ctx.key}/comments`)).answer;
  assert.deepEqual(list.prototype, { name: 'onboarding.html' });
  assert.deepEqual(list.comments[0].author, { name: 'Priya' });
  assert.equal((await call(ctx, 'GET', `/auth/start?key=${ctx.key}&code_hash=${sha256(newCode())}`)).status, 404);

  await ctx.author('PATCH', `/api/prototypes/${ctx.key}`, { identity: 'gitlab' });
  await ctx.author('PATCH', `/api/prototypes/${ctx.key}`, { identity: 'none' });
  assert.deepEqual((await call(ctx, 'GET', `/api/p/${ctx.key}/comments`)).answer.prototype, { name: 'onboarding.html' });
  assert.equal((await write(ctx, 'c_555555')).status, 201, 'switching back off did not restore typed names');
});

test('the browser is told it may send the pass header', async (t) => {
  const ctx = await setUp(t, { identity: 'none' });
  const preflight = await call(ctx, 'OPTIONS', `/api/p/${ctx.key}/comments`);
  assert.match(preflight.headers.get('access-control-allow-headers'), /x-gitmargin-pass/);
});

// ---- a database made by the code before this ---------------------------------------

// ---- strict reading (plan step 9) ------------------------------------------

const PAGE_HTML = '<!doctype html><title>secret roadmap</title><h1>Secret roadmap</h1>';

/** A strict prototype with one stored page and one comment on it. */
async function setUpStrict(t, options = {}) {
  const ctx = await setUp(t, { read: 'members', ...options });
  const stored = await ctx.author('POST', `/api/prototypes/${ctx.key}/versions`, { hash: 'abc123', html: PAGE_HTML });
  assert.equal(stored.answer.page_stored, true);
  return ctx;
}

/** Open a stored copy the way a person does: the gate's link, the provider, then the confirm page. */
async function toReturnConfirm(ctx, which = 'latest') {
  const started = await call(ctx, 'GET', `/auth/start?key=${ctx.key}&return=${which}`);
  assert.equal(started.status, 302, started.text);
  const landed = new URL(ctx.fake.approve(started.headers.get('location')));
  return call(ctx, 'GET', `${landed.pathname}${landed.search}`);
}

async function pressContinue(ctx, page, decision = 'continue') {
  return call(ctx, 'POST', '/auth/confirm', { form: { state: formField(page.text, 'state'), token: formField(page.text, 'token'), decision } });
}

test('strict reading: the comments list needs a member or the author', async (t) => {
  const ctx = await setUpStrict(t);
  const list = `/api/p/${ctx.key}/comments`;

  const stranger = await call(ctx, 'GET', list);
  assert.equal(stranger.status, 401);
  assert.deepEqual(stranger.answer, { error: 'sign_in', provider: 'gitlab', read: 'members' });

  const madeUp = await call(ctx, 'GET', list, { headers: { 'x-gitmargin-pass': `gp_${'x'.repeat(40)}` } });
  assert.equal(madeUp.status, 401);

  const { pass } = await signIn(ctx);
  const member = await call(ctx, 'GET', list, { headers: { 'x-gitmargin-pass': pass } });
  assert.equal(member.status, 200);
  assert.deepEqual(member.answer.prototype, { name: 'onboarding.html', identity: 'gitlab', read: 'members', members: 'gitmargin-test' });

  const author = await call(ctx, 'GET', list, { headers: { authorization: `Bearer ${ctx.service.secret}` } });
  assert.equal(author.status, 200);
  const wrongSecret = await call(ctx, 'GET', list, { headers: { authorization: 'Bearer not-the-secret' } });
  assert.equal(wrongSecret.status, 401);

  // Ending the passes (the author's "stop them now") closes reading too.
  await ctx.author('PATCH', `/api/prototypes/${ctx.key}`, { identity: 'gitlab', members: 'gitmargin-test', read: 'members' });
  assert.equal((await call(ctx, 'GET', list, { headers: { 'x-gitmargin-pass': pass } })).status, 401);
});

test('strict reading: a non-member who signs in still reads nothing', async (t) => {
  const ctx = await setUpStrict(t, { person: 'sam' });
  const claimed = await signIn(ctx);
  assert.equal(claimed.member, false);
  assert.equal(claimed.pass, undefined);
  assert.equal((await call(ctx, 'GET', `/api/p/${ctx.key}/comments`)).status, 401);
});

test('with reading open, sign-in mode still lets anyone read', async (t) => {
  const ctx = await setUp(t);
  await ctx.author('POST', `/api/prototypes/${ctx.key}/versions`, { hash: 'abc123', html: PAGE_HTML });
  const listed = await call(ctx, 'GET', `/api/p/${ctx.key}/comments`);
  assert.equal(listed.status, 200);
  const page = await call(ctx, 'GET', `/p/${ctx.key}/latest`);
  assert.equal(page.status, 200);
  assert.equal(page.text, PAGE_HTML);
  // And `return` is not a way to start a sign-in there: there is nothing to return to.
  assert.equal((await call(ctx, 'GET', `/auth/start?key=${ctx.key}&return=latest`)).status, 400);
});

test('strict reading: a stored copy without a ticket answers the sign-in page and nothing about the prototype', async (t) => {
  const ctx = await setUpStrict(t);
  for (const address of [`/p/${ctx.key}/latest`, `/p/${ctx.key}/${ctx.version}`, `/p/${ctx.key}/v9-ffffff`, `/p/${ctx.key}/latest?ticket=gt_${'x'.repeat(40)}`]) {
    const gate = await call(ctx, 'GET', address);
    assert.equal(gate.status, 401, address);
    assert.match(gate.text, /Sign in with GitLab/);
    assert.ok(!gate.text.includes('Secret roadmap') && !gate.text.includes('onboarding'), 'the gate must not name or show the prototype');
    assert.equal(gate.headers.get('x-frame-options'), 'DENY');
  }
});

test('strict reading: sign in, Continue, and the copy opens once, with a code the panel swaps for a pass', async (t) => {
  const ctx = await setUpStrict(t);
  const page = await toReturnConfirm(ctx);
  assert.match(page.text, /Open onboarding\.html as Priya Shah\?/);
  assert.equal((await ctx.service.query('select 1 from tickets')).length, 0, 'nothing exists before Continue');

  const sent = await pressContinue(ctx, page);
  assert.equal(sent.status, 303);
  const location = sent.headers.get('location');
  const m = /^\/p\/(gm_[\w-]+)\/latest\?ticket=(gt_[\w-]+)#gm_claim=([0-9a-f]{32})$/.exec(location);
  assert.ok(m, location);
  assert.equal(m[1], ctx.key);
  // Hashes only: neither the ticket nor the code is in the database.
  const dump = JSON.stringify([await ctx.service.query('select * from tickets'), await ctx.service.query('select * from signins')]);
  assert.ok(!dump.includes(m[2]) && !dump.includes(m[3]));

  const opened = await call(ctx, 'GET', location.split('#')[0]);
  assert.equal(opened.status, 200);
  assert.equal(opened.text, PAGE_HTML);
  assert.match(opened.headers.get('content-security-policy'), /^sandbox /);
  assert.equal((await call(ctx, 'GET', location.split('#')[0])).status, 401, 'a ticket works once');

  const claimed = (await call(ctx, 'POST', `/api/p/${ctx.key}/auth/claim`, { body: { code: m[3] } })).answer;
  assert.equal(claimed.member, true);
  assert.equal((await call(ctx, 'GET', `/api/p/${ctx.key}/comments`, { headers: { 'x-gitmargin-pass': claimed.pass } })).status, 200);
  assert.equal((await call(ctx, 'POST', `/api/p/${ctx.key}/auth/claim`, { body: { code: m[3] } })).status, 404, 'and so does the code');
});

test('strict reading: a ticket opens only the address it was made for, and only for a minute', async (t) => {
  const ctx = await setUpStrict(t);
  const forLatest = (await pressContinue(ctx, await toReturnConfirm(ctx, 'latest'))).headers.get('location');
  const ticket = /ticket=(gt_[\w-]+)/.exec(forLatest)[1];
  assert.equal((await call(ctx, 'GET', `/p/${ctx.key}/${ctx.version}?ticket=${ticket}`)).status, 401, 'another version');

  // The same ticket on another prototype of the same author.
  const otherKey = (await ctx.author('POST', '/api/prototypes', { name: 'other.html' })).answer.key;
  await ctx.author('POST', `/api/prototypes/${otherKey}/versions`, { hash: 'abc123', html: PAGE_HTML });
  await ctx.author('PATCH', `/api/prototypes/${otherKey}`, { identity: 'gitlab', members: 'gitmargin-test', read: 'members' });
  assert.equal((await call(ctx, 'GET', `/p/${otherKey}/latest?ticket=${ticket}`)).status, 401, 'another prototype');
  assert.equal((await call(ctx, 'GET', `/p/${ctx.key}/latest?ticket=${ticket}`)).status, 200, 'still good where it belongs');

  const slow = (await pressContinue(ctx, await toReturnConfirm(ctx, ctx.version))).headers.get('location');
  ctx.clock.advance(MINUTE + 1000);
  assert.equal((await call(ctx, 'GET', slow.split('#')[0])).status, 401, 'older than a minute');
});

test('strict reading: the return address is one of this prototype\'s stored pages, by name, and nothing else', async (t) => {
  const ctx = await setUpStrict(t);
  for (const bad of ['https://evil.example/', '//evil.example', '../../api/ping', 'latest/../x', 'v1-abc123?x=1', '']) {
    const started = await call(ctx, 'GET', `/auth/start?key=${ctx.key}&return=${encodeURIComponent(bad)}`);
    assert.equal(started.status, 400, bad);
    assert.equal(started.headers.get('location'), null);
  }
  assert.equal((await ctx.service.query('select 1 from signins')).length, 0);
});

test('strict reading: Cancel, and a non-member, get no ticket', async (t) => {
  const ctx = await setUpStrict(t);
  const cancelled = await pressContinue(ctx, await toReturnConfirm(ctx), 'cancel');
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.headers.get('location'), null);
  // This is the person's own tab in the strict flow: a way back, no self-close (review of #18, follow-up to R2).
  assert.match(cancelled.text, new RegExp(`href="/p/${ctx.key}/latest"`));
  assert.ok(!cancelled.text.includes('window.close'));
  // And a refusal at the start of that flow also points back (here: the start limit).
  for (let i = 0; i < 30; i += 1) await call(ctx, 'GET', `/auth/start?key=${ctx.key}&return=latest`);
  const limited = await call(ctx, 'GET', `/auth/start?key=${ctx.key}&return=latest`);
  assert.equal(limited.status, 429);
  assert.match(limited.text, new RegExp(`href="/p/${ctx.key}/latest"`));
  ctx.clock.advance(MINUTE + 1000); // the limit is per minute; the rest of this test starts sign-ins too

  ctx.fake.set({ person: 'sam' });
  const outsider = await toReturnConfirm(ctx);
  assert.match(outsider.text, /<h1>Your account is not in gitmargin-test<\/h1>/);
  assert.match(outsider.text, /can only be opened by members of that group/);
  assert.match(outsider.text, new RegExp(`href="/p/${ctx.key}/latest"`), 'the strict flow gets a way back to the page, not "close this window"');
  assert.ok(!outsider.text.includes('close this window'));
  assert.equal(formField(outsider.text, 'token'), undefined);
  assert.equal((await ctx.service.query('select 1 from tickets')).length, 0);
});

// Frozen on purpose: these are the statements the #15 service ran (commit 73fc4c9).
// The owner's real deployment holds exactly these tables, with real rows in them.
const OLD_SCHEMA = [
  'create table if not exists prototypes (key text primary key, name text not null, created timestamptz not null)',
  `create table if not exists versions (prototype_key text not null references prototypes(key), version_id text not null, round integer not null,
     hash text not null, file text, html text, created timestamptz not null, primary key (prototype_key, version_id))`,
  `create table if not exists comments (prototype_key text not null references prototypes(key), id text not null, version_id text not null,
     author_name text not null, body jsonb not null, status text not null, token_hash text not null, created timestamptz not null,
     updated timestamptz not null, deleted_at timestamptz, primary key (prototype_key, id))`,
  'create index if not exists comments_by_version on comments (prototype_key, version_id, updated)',
  `create table if not exists replies (prototype_key text not null, comment_id text not null, id text not null, author_name text not null,
     text text not null, token_hash text not null, created timestamptz not null, updated timestamptz not null, deleted_at timestamptz,
     primary key (prototype_key, comment_id, id))`,
  'create table if not exists writes (prototype_key text not null, at timestamptz not null)',
  'create index if not exists writes_by_time on writes (prototype_key, at)',
];

test('a database made by the old code is upgraded in place and keeps its rows', async (t) => {
  const db = memoryDatabase();
  t.after(() => db.close());
  for (const statement of OLD_SCHEMA) await db.query(statement);
  await db.query("insert into prototypes (key, name, created) values ('gm_oldoldoldoldold', 'old.html', now())");
  await db.query(
    `insert into comments (prototype_key, id, version_id, author_name, body, status, token_hash, created, updated)
     values ('gm_oldoldoldoldold', 'c_0ddc0d', 'v1-abc123', 'Typed before the upgrade', '{"id":"c_0ddc0d"}', 'open', 'x', now(), now())`,
  );

  await ensureSchema(db.query);
  await ensureSchema(db.query); // and again: every statement is safe to repeat

  const prototype = (await db.query("select identity, members, read_rule from prototypes where key = 'gm_oldoldoldoldold'"))[0];
  assert.deepEqual(prototype, { identity: 'none', members: null, read_rule: 'open' });
  const kept = (await db.query("select author_name, author_provider, author_subject from comments where id = 'c_0ddc0d'"))[0];
  assert.deepEqual(kept, { author_name: 'Typed before the upgrade', author_provider: null, author_subject: null });
  assert.equal((await db.query('select 1 from sessions')).length, 0);
});
