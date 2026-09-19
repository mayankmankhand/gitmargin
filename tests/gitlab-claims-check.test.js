// scripts/gitlab-claims-check.mjs is the tool the owner runs by hand against
// the real gitlab.com (plan for issue #18, step 3). A tool used to inspect the
// work is code too, and it gets the least review, so it is tested here against
// the fake GitLab before anyone relies on what it prints.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCheck, STORED_PAGE_SANDBOX } from '../scripts/gitlab-claims-check.mjs';
import { startFakeGitlab } from './helpers/fake-gitlab.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** One check against one fake, both closed when the test ends. */
async function setUp(t, { person = 'priya', group = 'gitmargin-test' } = {}) {
  const fake = await startFakeGitlab({ person });
  const lines = [];
  const check = await startCheck({
    issuer: fake.url,
    clientId: fake.clientId,
    clientSecret: fake.clientSecret,
    group,
    port: 0,
    diskFolder: mkdtempSync(path.join(tmpdir(), 'gitmargin-check-')),
    log: (line) => lines.push(String(line)),
  });
  fake.allowRedirect(`${check.url}/callback`);
  t.after(async () => {
    await check.close();
    await fake.close();
  });
  return { fake, check, lines };
}

/** What a browser does: follow /start to the provider, sign in, land on the callback. */
async function signIn(fake, check) {
  const start = await fetch(`${check.url}/start?from=test`, { redirect: 'manual' });
  assert.equal(start.status, 302);
  return fetch(fake.approve(start.headers.get('location')));
}

test('the sandbox policy it serves is the one the service puts on stored pages', () => {
  const router = readFileSync(path.join(ROOT, 'service', 'src', 'router.js'), 'utf8');
  assert.ok(router.includes(`'${STORED_PAGE_SANDBOX}'`), 'router.js and the check script disagree about the stored-page policy');
});

test('asks for openid and nothing else', async (t) => {
  const { check } = await setUp(t);
  const url = new URL(check.authorizeUrl());
  assert.equal(url.searchParams.get('scope'), 'openid');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
});

test('reports that the groups claim lists the group, without regard to case', async (t) => {
  const { fake, check } = await setUp(t, { group: 'GitMargin-Test' });
  const answer = await signIn(fake, check);
  assert.equal(answer.status, 200);
  assert.equal(check.results.length, 1);
  assert.equal(check.results[0].groupsClaimPresent, true);
  assert.equal(check.results[0].listsTheGroup, true);
  assert.ok(check.results[0].userinfoClaims.includes('groups'));
});

test('reports NO for a person who is not in the group', async (t) => {
  const { fake, check } = await setUp(t, { person: 'sam' });
  await signIn(fake, check);
  assert.equal(check.results[0].groupsClaimPresent, true);
  assert.equal(check.results[0].listsTheGroup, false);
});

test('a path that only starts like the group is not the group', async (t) => {
  const { fake, check } = await setUp(t, { person: 'dana' });
  await signIn(fake, check);
  assert.equal(check.results[0].listsTheGroup, false);
});

test('prints claim names and yes or no, never the secret, a code or a token', async (t) => {
  const { fake, check, lines } = await setUp(t);
  const start = await fetch(`${check.url}/start`, { redirect: 'manual' });
  const landed = fake.approve(start.headers.get('location'));
  const code = new URL(landed).searchParams.get('code');
  const page = await (await fetch(landed)).text();
  const printed = lines.join('\n') + page;
  assert.ok(printed.includes('groups claim present'));
  assert.ok(!printed.includes(fake.clientSecret), 'the secret was printed');
  assert.ok(!printed.includes(code), 'the one-time code was printed');
  assert.ok(!/access_token|Bearer/i.test(printed), 'something token-shaped was printed');
  assert.ok(!printed.includes('Priya'), 'a person\'s name was printed: names and values stay out, only claim NAMES go in');
});

test('a refused token call is reported by name, and nothing is recorded', async (t) => {
  const { fake, check, lines } = await setUp(t);
  fake.set({ failToken: true });
  const answer = await signIn(fake, check);
  assert.equal(answer.status, 400);
  assert.equal(check.results.length, 0);
  assert.ok(lines.join('\n').includes('invalid_grant'));
  assert.ok(!lines.join('\n').includes(fake.clientSecret));
});

test('an address from some other sign-in is refused', async (t) => {
  const { check } = await setUp(t);
  await assert.rejects(() => check.finish(`${check.url}/callback?code=x&state=not-ours`), /does not belong/);
});

test('the three test pages exist: web, locked-down, and a copy on disk that points back here', async (t) => {
  const { check } = await setUp(t);
  const web = await fetch(`${check.url}/`);
  assert.equal(web.headers.get('content-security-policy'), null);
  const locked = await fetch(`${check.url}/sandboxed`);
  assert.equal(locked.headers.get('content-security-policy'), STORED_PAGE_SANDBOX);
  assert.ok(readFileSync(check.diskPage, 'utf8').includes(`${check.url}/start`));
});
