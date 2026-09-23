// Sign-in with GitHub (issue #17), against the fake GitHub in
// tests/helpers/fake-github.js. GitHub is the second plug in the socket cycle 1
// built, so these tests are about what is GitHub's own: the token call's
// quirks, the API's demands, who someone is, and a GitLab prototype and a
// GitHub prototype living side by side. The flow around them (confirm page,
// claim, pass, strict reading) is tested once, in signin.test.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { startService, testClock } from '../../tests/helpers/service-server.js';
import { startFakeGithub } from '../../tests/helpers/fake-github.js';
import { startFakeGitlab } from '../../tests/helpers/fake-gitlab.js';
import { githubApi, providerSettings } from '../src/signin.js';

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const newCode = () => randomBytes(16).toString('hex');
const TOKEN = 'a-browser-token-0123456789';
const OTHER_TOKEN = 'another-browser-token-98765';

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

/** A service with GitHub (and, when asked, GitLab) set up, and one prototype on each mode asked for. */
async function setUp(t, { person = 'octo', identity = 'github', read, gitlab = false } = {}) {
  const github = await startFakeGithub({ person });
  const lab = gitlab ? await startFakeGitlab() : null;
  const clock = testClock();
  const logged = [];
  const service = await startService({ clock, github, gitlab: lab || undefined, log: (error) => logged.push(String(error && error.message)) });
  github.allowRedirect(`${service.url}/auth/callback`);
  if (lab) lab.allowRedirect(`${service.url}/auth/callback`);
  t.after(async () => {
    await service.close();
    await github.close();
    if (lab) await lab.close();
  });
  const ctx = { github, gitlab: lab, clock, service, logged };
  ctx.author = (method, path, body) => call(ctx, method, path, { body, headers: { authorization: `Bearer ${service.secret}` } });
  ctx.prototype = async (name, mode, extra = {}) => {
    const key = (await ctx.author('POST', '/api/prototypes', { name })).answer.key;
    const version = (await ctx.author('POST', `/api/prototypes/${key}/versions`, { hash: 'abc123' })).answer.version_id;
    if (mode !== 'none') {
      const set = await ctx.author('PATCH', `/api/prototypes/${key}`, { identity: mode, ...extra });
      assert.equal(set.status, 200, JSON.stringify(set.answer));
    }
    return { key, version };
  };
  const first = await ctx.prototype('onboarding.html', identity, read ? { read } : {});
  ctx.key = first.key;
  ctx.version = first.version;
  return ctx;
}

const formField = (html, name) => (new RegExp(`name="${name}" value="([^"]*)"`).exec(html) || [])[1];

/** /auth/start, then what the person does at the provider. Returns where the provider sent them and the callback's answer. */
async function toCallback(ctx, code, { key = ctx.key, provider = ctx.github } = {}) {
  const started = await call(ctx, 'GET', `/auth/start?key=${key}&code_hash=${sha256(code)}`);
  assert.equal(started.status, 302, started.text);
  const authorize = started.headers.get('location');
  const landed = new URL(provider.approve(authorize));
  return { authorize, landed, page: await call(ctx, 'GET', `${landed.pathname}${landed.search}`) };
}

/** The whole sign-in, Continue included. Returns the claim's answer. */
async function signIn(ctx, options = {}) {
  const code = newCode();
  const { page } = await toCallback(ctx, code, options);
  assert.equal(page.status, 200, page.text);
  const state = formField(page.text, 'state');
  if (state) await call(ctx, 'POST', '/auth/confirm', { form: { state, token: formField(page.text, 'token'), decision: 'continue' } });
  return (await call(ctx, 'POST', `/api/p/${options.key || ctx.key}/auth/claim`, { body: { code } })).answer;
}

const comment = (id) => ({ id, time: '2026-09-23T10:00:00Z', intent: { text: 'Why is this here?', tag: null }, anchor: {}, state: {} });
const write = (ctx, id, { pass, token = TOKEN, name = 'Typed Name', key = ctx.key, version = ctx.version } = {}) =>
  call(ctx, 'POST', `/api/p/${key}/comments`, {
    body: { version_id: version, author: { name }, comment: comment(id) },
    headers: { 'x-gitmargin-token': token, ...(pass ? { 'x-gitmargin-pass': pass } : {}) },
  });
const edit = (ctx, id, { pass, token = TOKEN, key = ctx.key } = {}) =>
  call(ctx, 'PATCH', `/api/p/${key}/comments/${id}`, {
    body: { intent: { text: 'Edited.', tag: null } },
    headers: { 'x-gitmargin-token': token, ...(pass ? { 'x-gitmargin-pass': pass } : {}) },
  });

// ---- where GitHub is --------------------------------------------------------

test('github.com keeps its API on its own host; any other GitHub keeps it under /api/v3', () => {
  assert.equal(githubApi('https://github.com'), 'https://api.github.com');
  assert.equal(githubApi('https://GitHub.com'), 'https://api.github.com');
  assert.equal(githubApi('https://github.acme.test'), 'https://github.acme.test/api/v3');
  assert.equal(githubApi('http://127.0.0.1:4000'), 'http://127.0.0.1:4000/api/v3');

  const deps = { origin: 'https://service.test', fetch: () => {}, providers: { github: { id: 'Iv23abc', secret: 'made-up-value' } } };
  assert.equal(providerSettings(deps, 'github').url, 'https://github.com', 'GitHub with no address set is github.com, not gitlab.com');
  assert.equal(providerSettings({ ...deps, providers: { gitlab: { id: 'x', secret: 'y' } } }, 'gitlab').url, 'https://gitlab.com');
  assert.equal(providerSettings({ ...deps, providers: { github: { url: 'http://github.example', id: 'x', secret: 'y' } } }, 'github'), null, 'plain http off loopback');
});

// ---- the happy path, and what it stores --------------------------------------

test('a person signs in with GitHub, presses Continue, and comments under a verified name the body cannot choose', async (t) => {
  const ctx = await setUp(t);
  const code = newCode();
  const { authorize, page } = await toCallback(ctx, code);

  const asked = new URL(authorize);
  assert.equal(asked.origin + asked.pathname, `${ctx.github.url}/login/oauth/authorize`);
  assert.equal(asked.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(asked.searchParams.get('redirect_uri'), `${ctx.service.url}/auth/callback`);
  assert.equal(asked.searchParams.get('scope'), null, 'a GitHub App asks for nothing in the address');

  assert.ok(page.text.includes('Sign in to comment on onboarding.html as Priya Shah?'), page.text);
  await call(ctx, 'POST', '/auth/confirm', { form: { state: formField(page.text, 'state'), token: formField(page.text, 'token'), decision: 'continue' } });
  const claimed = (await call(ctx, 'POST', `/api/p/${ctx.key}/auth/claim`, { body: { code } })).answer;
  assert.equal(claimed.member, true);
  assert.deepEqual(claimed.identity, { provider: 'github', name: 'Priya Shah', username: 'octopriya' });

  const written = await write(ctx, 'c_aaaaaa', { pass: claimed.pass, name: 'Mallory Pretending' });
  assert.equal(written.status, 201);
  assert.deepEqual(written.answer.author, { name: 'Priya Shah', provider: 'github', username: 'octopriya', verified: true });

  const list = (await call(ctx, 'GET', `/api/p/${ctx.key}/comments`)).answer;
  assert.deepEqual(list.prototype, { name: 'onboarding.html', identity: 'github', read: 'open', members: null });
  assert.equal(list.comments[0].author.provider, 'github');

  // The subject is GitHub's permanent numeric id, not the login.
  const [session] = await ctx.service.query('select provider, subject, username from sessions');
  assert.deepEqual(session, { provider: 'github', subject: '5001', username: 'octopriya' });
});

test('with no display name on GitHub, the login is the name', async (t) => {
  const ctx = await setUp(t, { person: 'sam' });
  const claimed = await signIn(ctx);
  assert.deepEqual(claimed.identity, { provider: 'github', name: 'samlee', username: 'samlee' });
});

test('nothing GitHub handed over is kept: no code, no token, no secret, in any table or log line', async (t) => {
  const ctx = await setUp(t);
  await signIn(ctx);
  const dump = JSON.stringify([
    await ctx.service.query('select * from signins'),
    await ctx.service.query('select * from sessions'),
    await ctx.service.query('select * from comments'),
  ]);
  assert.ok(ctx.github.handedOut().length >= 2, 'the fake did hand out a code and a token');
  for (const secret of [...ctx.github.handedOut(), ctx.github.clientSecret]) assert.ok(!dump.includes(secret), 'a GitHub secret reached the database');

  ctx.github.set({ failApi: true }); // the token is issued, then the API refuses: the token must not be logged
  const { page } = await toCallback(ctx, newCode());
  assert.equal(page.status, 502);
  assert.ok(page.text.includes('GitHub did not confirm the sign-in'));
  for (const secret of [...ctx.github.handedOut(), ctx.github.clientSecret]) assert.ok(!ctx.logged.join('\n').includes(secret), 'a GitHub secret reached the log');
  assert.ok(ctx.logged.join('\n').includes('user answered 503'));
});

test('a token refusal carried as a 200 with an error field grants nothing and is logged by name', async (t) => {
  const ctx = await setUp(t);
  ctx.github.set({ failToken: true });
  const code = newCode();
  const { page } = await toCallback(ctx, code);
  assert.equal(page.status, 502);
  assert.ok(!page.text.includes('name="token"'), 'a confirm page was offered after a refused token call');
  assert.ok(ctx.logged.join('\n').includes('token call refused: bad_verification_code'));
  assert.equal((await call(ctx, 'POST', `/api/p/${ctx.key}/auth/claim`, { body: { code } })).status, 404);
});

test('a wrong secret is refused at the token call and logged by name', async (t) => {
  const wrongSecret = await setUp(t);
  const settings = { ...wrongSecret.github, clientSecret: 'not-the-real-one-at-all' };
  const service = await startService({ github: settings, log: (e) => wrongSecret.logged.push(String(e.message)) });
  t.after(() => service.close());
  wrongSecret.github.allowRedirect(`${service.url}/auth/callback`);
  const ctx = { ...wrongSecret, service };
  ctx.author = (method, path, body) => call(ctx, method, path, { body, headers: { authorization: `Bearer ${service.secret}` } });
  const { key } = await (async () => {
    const k = (await ctx.author('POST', '/api/prototypes', { name: 'x.html' })).answer.key;
    await ctx.author('PATCH', `/api/prototypes/${k}`, { identity: 'github' });
    return { key: k };
  })();
  const { page } = await toCallback(ctx, newCode(), { key });
  assert.equal(page.status, 502);
  assert.ok(ctx.logged.join('\n').includes('token call refused: incorrect_client_credentials'));
});

test('every call to the API carries a User-Agent, as GitHub demands', async (t) => {
  const ctx = await setUp(t);
  const claimed = await signIn(ctx);
  assert.equal(claimed.member, true, 'the fake refuses API calls with no User-Agent, so a missing one fails the sign-in');
  assert.ok(ctx.github.requests.some((r) => r.path === '/api/v3/user'));
});

test('the verifier travels to the token call: a code cannot be swapped without it', async (t) => {
  const ctx = await setUp(t);
  const code = newCode();
  const started = await call(ctx, 'GET', `/auth/start?key=${ctx.key}&code_hash=${sha256(code)}`);
  const authorize = new URL(started.headers.get('location'));
  // A code issued for someone else's challenge: the service's verifier cannot match it.
  authorize.searchParams.set('code_challenge', 'a-challenge-the-service-never-made-0000000000');
  const landed = new URL(ctx.github.approve(authorize.toString()));
  const page = await call(ctx, 'GET', `${landed.pathname}${landed.search}`);
  assert.equal(page.status, 502);
  assert.ok(ctx.logged.join('\n').includes('token call refused: bad_verification_code'));
});

test('a markup display name is text on every page', async (t) => {
  const ctx = await setUp(t, { person: 'mallory' });
  const { page } = await toCallback(ctx, newCode());
  assert.ok(!page.text.includes('<img'), 'the confirm page rendered a GitHub string as markup');
  assert.ok(page.text.includes('&lt;img'));
});

// ---- settings --------------------------------------------------------------------

test('github takes no members rule yet, and a service with no GitHub App says so', async (t) => {
  const ctx = await setUp(t, { identity: 'none' });
  const path = `/api/prototypes/${ctx.key}`;
  assert.equal((await ctx.author('PATCH', path, { identity: 'github', members: 'acme/app' })).status, 400);
  assert.equal((await ctx.author('PATCH', path, { identity: 'github', members: 'acme' })).status, 400);
  const on = await ctx.author('PATCH', path, { identity: 'github', read: 'members' });
  assert.deepEqual(on.answer, { identity: 'github', members: null, read: 'members', passes_ended: 0 });

  const bare = await startService({});
  t.after(() => bare.close());
  const key = (await fetch(`${bare.url}/api/prototypes`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${bare.secret}` }, body: '{"name":"x.html"}' }).then((r) => r.json())).key;
  const refused = await fetch(`${bare.url}/api/prototypes/${key}`, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: `Bearer ${bare.secret}` }, body: '{"identity":"github"}' }).then((r) => r.json());
  assert.equal(refused.error, 'provider_not_configured');
});

test('strict reading on a GitHub prototype: the gate names GitHub, not a group', async (t) => {
  const ctx = await setUp(t, { read: 'members' });
  const gate = await call(ctx, 'GET', `/p/${ctx.key}/latest`);
  assert.equal(gate.status, 401);
  assert.ok(gate.text.includes('Its author shares it only with people who sign in with GitHub.'), gate.text);
  assert.ok(!/group/i.test(gate.text), 'the GitHub gate talked about a group');
  assert.ok(gate.text.includes('Sign in with GitHub'));
  const listed = await call(ctx, 'GET', `/api/p/${ctx.key}/comments`);
  assert.deepEqual(listed.answer, { error: 'sign_in', provider: 'github', read: 'members' });
});

// ---- side by side -------------------------------------------------------------------

test('a GitLab prototype and a GitHub prototype live side by side on one service', async (t) => {
  const ctx = await setUp(t, { gitlab: true });
  const lab = await ctx.prototype('wizard.html', 'gitlab');

  const hub = await signIn(ctx);
  const labbed = await signIn(ctx, { key: lab.key, provider: ctx.gitlab });
  assert.equal(hub.identity.provider, 'github');
  assert.equal(labbed.identity.provider, 'gitlab');

  // Each pass opens its own prototype only.
  assert.equal((await write(ctx, 'c_bbbbbb', { pass: hub.pass })).status, 201);
  assert.equal((await write(ctx, 'c_cccccc', { pass: labbed.pass, key: lab.key, version: lab.version })).status, 201);
  assert.equal((await write(ctx, 'c_dddddd', { pass: hub.pass, key: lab.key, version: lab.version })).status, 401, 'a GitHub pass opened the GitLab prototype');
  assert.equal((await write(ctx, 'c_eeeeee', { pass: labbed.pass })).status, 401, 'a GitLab pass opened the GitHub prototype');

  // A GitHub start on the GitLab prototype goes to GitLab, and the other way round.
  const toLab = await call(ctx, 'GET', `/auth/start?key=${lab.key}&code_hash=${sha256(newCode())}`);
  assert.ok(toLab.headers.get('location').startsWith(`${ctx.gitlab.url}/`));
  const toHub = await call(ctx, 'GET', `/auth/start?key=${ctx.key}&code_hash=${sha256(newCode())}`);
  assert.ok(toHub.headers.get('location').startsWith(`${ctx.github.url}/login/oauth/authorize`));
});

test('switching a prototype from GitLab to GitHub ends its passes and any unfinished GitLab sign-in', async (t) => {
  const ctx = await setUp(t, { gitlab: true, identity: 'none' });
  const { key, version } = await ctx.prototype('switch.html', 'gitlab');
  const before = await signIn(ctx, { key, provider: ctx.gitlab });
  assert.equal((await write(ctx, 'c_111111', { pass: before.pass, key, version })).status, 201);

  // A GitLab sign-in that reached GitLab but not the callback yet.
  const pending = newCode();
  const started = await call(ctx, 'GET', `/auth/start?key=${key}&code_hash=${sha256(pending)}`);
  const landed = new URL(ctx.gitlab.approve(started.headers.get('location')));

  const switched = await ctx.author('PATCH', `/api/prototypes/${key}`, { identity: 'github' });
  assert.equal(switched.answer.passes_ended, 1);
  assert.equal((await write(ctx, 'c_222222', { pass: before.pass, key, version })).status, 401, 'a GitLab pass outlived the switch');
  const late = await call(ctx, 'GET', `${landed.pathname}${landed.search}`);
  assert.equal(late.status, 400, 'an unfinished GitLab sign-in finished after the switch');
  assert.equal((await call(ctx, 'POST', `/api/p/${key}/auth/claim`, { body: { code: pending } })).status, 404);

  const after = await signIn(ctx, { key });
  assert.equal(after.identity.provider, 'github');
  // The GitLab comment keeps its provider, and a GitHub person cannot edit it.
  const listed = (await call(ctx, 'GET', `/api/p/${key}/comments`)).answer.comments[0];
  assert.equal(listed.author.provider, 'gitlab');
  assert.equal((await edit(ctx, 'c_111111', { pass: after.pass, token: TOKEN, key })).status, 403, 'a GitHub person edited a GitLab-verified comment');
  assert.equal((await edit(ctx, 'c_111111', { pass: after.pass, token: OTHER_TOKEN, key })).status, 403);
});
