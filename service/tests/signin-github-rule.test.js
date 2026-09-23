// The GitHub repository rule (issue #17, plan step 6): "only people GitHub
// lets open owner/repo may comment". It is the plan's cut line: it needs the
// author's GitHub App to hold one repository permission (Metadata, read), and
// GitHub's permission screen may then say more than "verify your identity".
// Everything about the rule is in this file, so dropping it is one revert.
//
// The fake GitHub (tests/helpers/fake-github.js) plays the author's App
// installed on `acme` (acme/app, acme/app-two, acme/site) and on `octopriya`
// (octopriya/notes), and people with different access to them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { startService } from '../../tests/helpers/service-server.js';
import { startFakeGithub } from '../../tests/helpers/fake-github.js';
import { isMember, isRepoPath } from '../src/signin.js';

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const newCode = () => randomBytes(16).toString('hex');
const TOKEN = 'a-browser-token-0123456789';

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

async function setUp(t, { person = 'octo', members = 'acme/app', read } = {}) {
  const github = await startFakeGithub({ person });
  const logged = [];
  const service = await startService({ github, log: (error) => logged.push(String(error && error.message)) });
  github.allowRedirect(`${service.url}/auth/callback`);
  t.after(async () => {
    await service.close();
    await github.close();
  });
  const ctx = { github, service, logged };
  ctx.author = (method, path, body) => call(ctx, method, path, { body, headers: { authorization: `Bearer ${service.secret}` } });
  ctx.key = (await ctx.author('POST', '/api/prototypes', { name: 'onboarding.html' })).answer.key;
  ctx.version = (await ctx.author('POST', `/api/prototypes/${ctx.key}/versions`, { hash: 'abc123' })).answer.version_id;
  const set = await ctx.author('PATCH', `/api/prototypes/${ctx.key}`, { identity: 'github', members, ...(read ? { read } : {}) });
  assert.equal(set.status, 200, JSON.stringify(set.answer));
  return ctx;
}

const formField = (html, name) => (new RegExp(`name="${name}" value="([^"]*)"`).exec(html) || [])[1];

/** The whole sign-in. Returns the callback page and the claim's answer. */
async function signIn(ctx) {
  const code = newCode();
  const started = await call(ctx, 'GET', `/auth/start?key=${ctx.key}&code_hash=${sha256(code)}`);
  assert.equal(started.status, 302, started.text);
  const landed = new URL(ctx.github.approve(started.headers.get('location')));
  const page = await call(ctx, 'GET', `${landed.pathname}${landed.search}`);
  const state = formField(page.text, 'state');
  if (state) await call(ctx, 'POST', '/auth/confirm', { form: { state, token: formField(page.text, 'token'), decision: 'continue' } });
  const claim = await call(ctx, 'POST', `/api/p/${ctx.key}/auth/claim`, { body: { code } });
  return { page, claim: claim.answer, claimStatus: claim.status };
}

const listingCalls = (ctx) => ctx.github.requests.filter((r) => /\/repositories$/.test(r.path));
const installationCalls = (ctx) => ctx.github.requests.filter((r) => r.path === '/api/v3/user/installations');

// ---- the rule's shape ---------------------------------------------------------

test('a GitHub rule is exactly owner/repo in GitHub characters, and compares whole and in any case', () => {
  for (const good of ['acme/app', 'Acme-Co/app.v2', 'o/r_1']) assert.equal(isRepoPath(good), true, good);
  for (const bad of ['acme', 'acme/app/extra', '-acme/app', 'has space/app', 'acme/', '/app', '']) assert.equal(isRepoPath(bad), false, bad);
  assert.equal(isMember('ACME/App', ['acme/app']), true);
  assert.equal(isMember('acme/app', ['acme/app-two']), false);
});

test('the settings route takes owner/repo with github and nothing else', async (t) => {
  const ctx = await setUp(t);
  const path = `/api/prototypes/${ctx.key}`;
  for (const members of ['acme', 'acme/app/extra', 'has space/app']) {
    assert.equal((await ctx.author('PATCH', path, { identity: 'github', members })).status, 400, members);
  }
  const ok = await ctx.author('PATCH', path, { identity: 'github', members: ' acme/app ', read: 'members' });
  assert.deepEqual(ok.answer, { identity: 'github', members: 'acme/app', read: 'members', passes_ended: 0 });
});

// ---- who gets in ----------------------------------------------------------------

test('someone GitHub lets open the repository is a member, whatever the case of the rule', async (t) => {
  const ctx = await setUp(t, { members: 'ACME/App' });
  const { claim } = await signIn(ctx);
  assert.equal(claim.member, true);
  const written = await call(ctx, 'POST', `/api/p/${ctx.key}/comments`, {
    body: { version_id: ctx.version, author: { name: 'x' }, comment: { id: 'c_aaaaaa', time: '2026-09-23T10:00:00Z', intent: { text: 'hi', tag: null }, anchor: {}, state: {} } },
    headers: { 'x-gitmargin-token': TOKEN, 'x-gitmargin-pass': claim.pass },
  });
  assert.equal(written.status, 201);
  // Only the installation on the rule's owner was asked for its repositories.
  assert.deepEqual(listingCalls(ctx).map((r) => r.path), ['/api/v3/user/installations/71/repositories']);
});

test('someone who can open the lookalike AND the repository is a member: the lookalike does not stop the search', async (t) => {
  const ctx = await setUp(t, { person: 'lee' });
  assert.equal((await signIn(ctx)).claim.member, true);
});

test('access to a repository whose name merely starts the same is not access', async (t) => {
  const ctx = await setUp(t, { person: 'dana' }); // dana can open acme/app-two only
  const { page, claim } = await signIn(ctx);
  assert.equal(claim.member, false);
  assert.equal(claim.members, 'acme/app');
  assert.ok(!claim.pass, 'a non-member got a pass');
  assert.ok(page.text.includes('Your account has no access to acme/app'), page.text);
  assert.ok(page.text.includes('people who can open that repository'));
  assert.ok(!/group/i.test(page.text), 'the GitHub verdict talked about a group');
});

test('a repository on another owner, or no installation at all, means not a member', async (t) => {
  const otherOwner = await setUp(t, { members: 'octopriya/app' }); // octopriya's installation holds notes, not app
  assert.equal((await signIn(otherOwner)).claim.member, false);

  // The installation asked is the one on the rule's owner, not simply the first one listed.
  const second = await setUp(t, { members: 'octopriya/notes' });
  assert.equal((await signIn(second)).claim.member, true);
  assert.deepEqual(listingCalls(second).map((r) => r.path), ['/api/v3/user/installations/72/repositories']);

  const none = await setUp(t, { person: 'noor' }); // noor sees no installation
  assert.equal((await signIn(none)).claim.member, false);
  assert.equal(listingCalls(none).length, 0, 'repositories were listed with no installation on the owner');
});

test('the repository is found on page 3, and past 1,000 repositories the rule fails closed', async (t) => {
  const deep = await setUp(t);
  deep.github.set({ extraRepos: 250 });
  assert.equal((await signIn(deep)).claim.member, true);
  assert.equal(listingCalls(deep).length, 3);

  const past = await setUp(t);
  past.github.set({ extraRepos: 1000 });
  assert.equal((await signIn(past)).claim.member, false);
  assert.equal(listingCalls(past).length, 10, 'the listing did not stop at its bound');
});

// ---- failures are never a verdict ------------------------------------------------

test('an App without the Metadata permission is a named problem, never "not a member"', async (t) => {
  const ctx = await setUp(t);
  ctx.github.set({ noMetadata: true });
  const { page, claimStatus } = await signIn(ctx);
  assert.equal(page.status, 502);
  assert.ok(page.text.includes('GitHub App cannot check who can open acme/app'), page.text);
  assert.ok(!page.text.includes('no access to'), 'a refused listing was read as a verdict');
  assert.equal(claimStatus, 404, 'something was claimable');
  assert.ok(ctx.logged.some((l) => l.includes('repositories refused')));
});

test('a refusal for any other reason is not blamed on the permission (review of #17, R13)', async (t) => {
  const ctx = await setUp(t);
  ctx.github.set({ samlBlocked: true });
  const { page, claimStatus } = await signIn(ctx);
  assert.equal(page.status, 502);
  assert.ok(page.text.includes('GitHub did not confirm the sign-in'), page.text);
  assert.ok(!page.text.includes('metadata'), 'a single sign-on refusal was blamed on the missing permission');
  assert.equal(claimStatus, 404);
  assert.ok(ctx.logged.some((l) => l.includes('repositories refused: Resource protected by organization SAML enforcement')));
});

test('GitHub down after the token is "did not confirm", and grants nothing', async (t) => {
  const ctx = await setUp(t);
  ctx.github.set({ failApi: true });
  const { page, claimStatus } = await signIn(ctx);
  assert.equal(page.status, 502);
  assert.ok(page.text.includes('GitHub did not confirm the sign-in'));
  assert.equal(claimStatus, 404);
});

test('with no rule, GitHub is asked who someone is and nothing else', async (t) => {
  const ctx = await setUp(t, { members: null });
  assert.equal((await signIn(ctx)).claim.member, true);
  assert.equal(installationCalls(ctx).length, 0);
  assert.equal(listingCalls(ctx).length, 0);
});

test('strict reading with a rule: the gate names a repository, not a group', async (t) => {
  const ctx = await setUp(t, { read: 'members' });
  const gate = await call(ctx, 'GET', `/p/${ctx.key}/latest`);
  assert.equal(gate.status, 401);
  assert.ok(gate.text.includes('Its author shares it only with people who can open one GitHub repository.'));
  assert.ok(!gate.text.includes('acme/app'), 'the gate named the repository to a stranger');
});
