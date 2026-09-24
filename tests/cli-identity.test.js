// `gitmargin identity`, and verified authors coming back through `pull`
// (issue #18). The real CLI runs as a separate process against the real router
// on an in-process Postgres, with the fake GitLab as the sign-in provider.
//
// Attached copies go into a scratch directory, never into the repo.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startService } from './helpers/service-server.js';
import { startFakeGitlab } from './helpers/fake-gitlab.js';
import { startFakeGithub } from './helpers/fake-github.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI = path.join(ROOT, 'bin', 'gitmargin.js');
const PAGE = '<!doctype html>\n<html><head><meta charset="utf-8"><title>t</title></head>\n<body><p>hi</p>\n</body></html>\n';
const TOKEN = 'a-reviewer-token-0123456789';
// One config folder per test process, so the trusted-address list is never the real one.
const CONFIG = mkdtempSync(path.join(tmpdir(), 'gitmargin-config-'));
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

function run(args, env = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { env: { ...process.env, GITMARGIN_SECRET: '', GITMARGIN_SERVICE: '', GITMARGIN_CONFIG_DIR: CONFIG, ...env } }, (error, out, err) =>
      resolve({ code: error ? error.code : 0, out, err })
    );
  });
}

async function setup(t, { gitlab = true, provider = 'gitlab' } = {}) {
  // `gitlab: false` means the service has no application for the provider at all.
  const fake = provider === 'github' ? await startFakeGithub() : await startFakeGitlab();
  const service = await startService(gitlab ? { [provider]: fake } : {});
  fake.allowRedirect(`${service.url}/auth/callback`);
  const dir = mkdtempSync(path.join(tmpdir(), 'gitmargin-identity-'));
  t.after(async () => {
    await service.close();
    await fake.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const source = path.join(dir, 'proto.html');
  const copy = path.join(dir, 'proto.gitmargin.html');
  writeFileSync(source, PAGE);
  const env = { GITMARGIN_SECRET: service.secret };
  const attached = await run(['attach', source, '--service', service.url], env);
  assert.equal(attached.code, 0, attached.err);
  const tag = (name) => (new RegExp(`<meta name="gitmargin-${name}" content="([^"]+)">`).exec(readFileSync(copy, 'utf8')) || [])[1];
  return { fake, service, dir, copy, env, key: tag('key'), version: tag('version') };
}

/** A whole sign-in as the fake's current person. Returns the pass. */
async function signIn(s) {
  const code = randomBytes(16).toString('hex');
  const started = await fetch(`${s.service.url}/auth/start?key=${s.key}&code_hash=${sha256(code)}`, { redirect: 'manual' });
  const page = await (await fetch(s.fake.approve(started.headers.get('location')))).text();
  const field = (name) => new RegExp(`name="${name}" value="([^"]*)"`).exec(page)[1];
  await fetch(`${s.service.url}/auth/confirm`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ state: field('state'), token: field('token'), decision: 'continue' }).toString(),
  });
  const claimed = await (await fetch(`${s.service.url}/api/p/${s.key}/auth/claim`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) })).json();
  return claimed.pass;
}

const post = (s, id, text, { pass, name = 'Sam, typed' } = {}) =>
  fetch(`${s.service.url}/api/p/${s.key}/comments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-gitmargin-token': TOKEN, ...(pass ? { 'x-gitmargin-pass': pass } : {}) },
    body: JSON.stringify({ version_id: s.version, author: { name }, comment: { id, time: '2026-09-21T12:00:00Z', intent: { text, tag: 'bug' }, anchor: { selector: '#next' }, state: {} } }),
  });

test('identity gitlab --members switches sign-in on and says in plain words who can do what', async (t) => {
  const s = await setup(t);
  const r = await run(['identity', s.copy, 'gitlab', '--members', 'gitmargin-test'], s.env);
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /Sign-in is ON/);
  assert.match(r.err, /members of the GitLab group "gitmargin-test" only/);
  assert.match(r.err, /Who can read the comments: anyone who can open the page/);
  assert.match(r.err, /rename or delete/);
  assert.match(r.err, /Passes ended: 0/);
  assert.equal((await post(s, 'c_aaaaaa', 'no pass')).status, 401, 'the service did not start asking for a pass');

  const strict = await run(['identity', s.copy, 'gitlab', '--members', 'gitmargin-test', '--read', 'members'], s.env);
  assert.match(strict.err, /signed-in members only/);

  const off = await run(['identity', s.copy, 'none'], s.env);
  assert.match(off.err, /Sign-in is OFF/);
  assert.equal((await post(s, 'c_aaaaaa', 'typed again')).status, 201);
});

test('identity refuses: a bad mode, options that mean nothing, no secret, and an address it was never given', async (t) => {
  const s = await setup(t);
  assert.equal((await run(['identity', s.copy, 'facebook'], s.env)).code, 1);
  assert.equal((await run(['identity', s.copy], s.env)).code, 1);
  assert.equal((await run(['identity', s.copy, 'none', '--members', 'acme'], s.env)).code, 1);
  assert.equal((await run(['identity', s.copy, 'gitlab', '--read', 'everyone'], s.env)).code, 1);

  const noSecret = await run(['identity', s.copy, 'gitlab']);
  assert.notEqual(noSecret.code, 0);
  assert.match(noSecret.err, /GITMARGIN_SECRET/);

  // A copy that came back naming some other address: the secret must not follow it.
  const elsewhere = await startService({ secret: 'never-sent-here-never-sent-never-sent-here' });
  t.after(() => elsewhere.close());
  const forged = path.join(s.dir, 'forged.gitmargin.html');
  writeFileSync(forged, readFileSync(s.copy, 'utf8').replace(s.service.url, elsewhere.url));
  const refused = await run(['identity', forged, 'gitlab'], s.env);
  assert.notEqual(refused.code, 0);
  assert.match(refused.err, /attach <prototype\.html> --service|GITMARGIN_SERVICE/);
  // An author route makes the tables on first use, so no table means no author call ever arrived.
  assert.equal((await elsewhere.query("select to_regclass('prototypes') as made"))[0].made, null, 'the other service was reached');
});

test('identity says so when the service has no GitLab application set up', async (t) => {
  const s = await setup(t, { gitlab: false });
  const r = await run(['identity', s.copy, 'gitlab'], s.env);
  assert.notEqual(r.code, 0);
  assert.match(r.err, /no GitLab application set up/);
  assert.match(r.err, /GITMARGIN_GITLAB_ID/);
});

test('a thread that mixes a typed and a verified author comes through pull with each marked truthfully', async (t) => {
  const s = await setup(t);
  assert.equal((await post(s, 'c_111111', 'Written before sign-in was on.')).status, 201);
  await run(['identity', s.copy, 'gitlab', '--members', 'gitmargin-test'], s.env);
  const pass = await signIn(s);
  assert.equal((await post(s, 'c_222222', 'Written under sign-in.', { pass, name: 'Not My Real Name' })).status, 201);

  const pulled = await run(['pull', s.copy, '--live'], s.env);
  assert.equal(pulled.code, 0, pulled.err);
  const batch = JSON.parse(pulled.out);
  assert.equal(batch.gitmargin, '0.1', 'the wire format moved');
  const byId = Object.fromEntries(batch.comments.map((c) => [c.id, c.author]));
  assert.deepEqual(byId.c_111111, { name: 'Sam, typed' });
  assert.deepEqual(byId.c_222222, { name: 'Priya Shah', provider: 'gitlab', username: 'priya', verified: true });

  const markdown = (await run(['pull', s.copy, '--live', '--markdown'], s.env)).out;
  assert.match(markdown, /From Priya Shah \(GitLab, verified\)\./);
  assert.match(markdown, /From Sam, typed\./);
  assert.ok(!/Sam, typed \(/.test(markdown), 'a typed name was shown as verified');
});

test('a returned file cannot promote a typed name by adding the word verified', async (t) => {
  const s = await setup(t);
  const reviewed = path.join(s.dir, 'proto.reviewed.html');
  const envelope = {
    gitmargin: '0.1',
    file: 'proto.html',
    version_id: s.version,
    reviewer: { name: 'Mallory' },
    comments: [
      { id: 'c_333333', time: '2026-09-21T12:00:00Z', intent: { text: 'x', tag: null }, anchor: {}, state: {}, status: 'open', replies: [], author: { name: 'The CEO', verified: true } },
      { id: 'c_444444', time: '2026-09-21T12:00:00Z', intent: { text: 'y', tag: null }, anchor: {}, state: {}, status: 'open', replies: [], author: { name: 'The CEO', verified: 'true', provider: 'gitlab' } },
      // The exact shape the service writes, but coming from a file: still a typed name (review of #18, R6).
      { id: 'c_555555', time: '2026-09-21T12:00:00Z', intent: { text: 'z', tag: null }, anchor: {}, state: {}, status: 'open', replies: [{ id: 'r_555555', time: '2026-09-21T12:00:00Z', author: { name: 'The CEO', provider: 'gitlab', username: 'ceo', verified: true }, text: 'me too' }], author: { name: 'The CEO', provider: 'gitlab', username: 'ceo', verified: true } },
    ],
  };
  const html = readFileSync(s.copy, 'utf8').replace('</body>', `<script type="application/json" id="gitmargin-comments">${JSON.stringify(envelope).replace(/</g, '\\u003c')}</script></body>`);
  writeFileSync(reviewed, html);
  const pulled = await run(['pull', reviewed], s.env);
  assert.equal(pulled.code, 0, pulled.err);
  const comments = JSON.parse(pulled.out).comments;
  assert.equal(comments.length, 3);
  for (const c of comments) assert.deepEqual(c.author, { name: 'The CEO' }, 'a file promoted its own author');
  assert.deepEqual(comments[2].replies[0].author, { name: 'The CEO' }, 'a file promoted a reply author');
  // And the same file merged BEHIND the service's answer still cannot: only the service source vouches.
  const merged = await run(['pull', s.copy, '--live', reviewed], s.env);
  assert.equal(merged.code, 0, merged.err);
  const forged = JSON.parse(merged.out).comments.find((c) => c.id === 'c_555555');
  assert.deepEqual(forged.author, { name: 'The CEO' });
});

test('pull --live under strict reading: the secret goes only when reading needs it, and only where the author chose', async (t) => {
  const s = await setup(t);
  assert.equal((await run(['identity', s.copy, 'gitlab', '--members', 'gitmargin-test', '--read', 'members'], s.env)).code, 0);
  assert.equal((await post(s, 'c_aaaaaa', 'Members only', { pass: await signIn(s) })).status, 201);

  // Without the secret: refused, in words that say what to do.
  const bare = await run(['pull', s.copy, '--live']);
  assert.notEqual(bare.code, 0);
  assert.match(bare.err, /members only/);
  assert.match(bare.err, /GITMARGIN_SECRET/);

  // With it: the author reads, and the verified author comes through.
  const read = await run(['pull', s.copy, '--live'], s.env);
  assert.equal(read.code, 0, read.err);
  assert.equal(JSON.parse(read.out).comments[0].author.verified, true);

  // A copy that names an address the author never typed gets no secret, whatever it answers.
  const seen = [];
  const { createServer } = await import('node:http');
  const thief = createServer((req, res) => {
    seen.push(req.headers.authorization || null);
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'sign_in', provider: 'gitlab', read: 'members' }));
  });
  await new Promise((resolve) => thief.listen(0, '127.0.0.1', resolve));
  t.after(() => thief.close());
  const forged = path.join(s.dir, 'forged.gitmargin.html');
  writeFileSync(forged, readFileSync(s.copy, 'utf8').replace(s.service.url, `http://127.0.0.1:${thief.address().port}`));
  const refused = await run(['pull', forged, '--live'], s.env);
  assert.notEqual(refused.code, 0);
  assert.match(refused.err, /Refusing to send your author secret/);
  assert.deepEqual(seen, [null], 'the secret followed an address that only a file named');
});

test('pull --live with reading open never sends the secret, even when it is set', async (t) => {
  const s = await setup(t);
  assert.equal((await run(['identity', s.copy, 'gitlab', '--members', 'gitmargin-test'], s.env)).code, 0);
  const seen = [];
  const original = s.service.url;
  const { createServer } = await import('node:http');
  const relay = createServer(async (req, res) => {
    seen.push(req.headers.authorization || null);
    const answer = await fetch(`${original}${req.url}`);
    res.writeHead(answer.status, { 'content-type': 'application/json' });
    res.end(await answer.text());
  });
  await new Promise((resolve) => relay.listen(0, '127.0.0.1', resolve));
  t.after(() => relay.close());
  const through = path.join(s.dir, 'relay.gitmargin.html');
  writeFileSync(through, readFileSync(s.copy, 'utf8').replace(original, `http://127.0.0.1:${relay.address().port}`));
  const read = await run(['pull', through, '--live'], s.env);
  assert.equal(read.code, 0, read.err);
  assert.deepEqual(seen, [null]);
});

// ---- GitHub (issue #17) ---------------------------------------------------------

test('identity github switches GitHub sign-in on and says who can do what, in GitHub words', async (t) => {
  const s = await setup(t, { provider: 'github' });
  const r = await run(['identity', s.copy, 'github'], s.env);
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /people comment under their GitHub name/);
  assert.match(r.err, /anyone with a GitHub account who can open the page/);
  assert.ok(!/group/i.test(r.err), 'the GitHub printout talked about a group');
  assert.equal((await post(s, 'c_aaaaaa', 'no pass')).status, 401, 'the service did not start asking for a pass');

  const strict = await run(['identity', s.copy, 'github', '--read', 'members'], s.env);
  assert.equal(strict.code, 0, strict.err);
  assert.match(strict.err, /signed-in members only/);
});

test('identity github --members names one repository, says the App must be on it, and refuses anything else before sending', async (t) => {
  const s = await setup(t, { provider: 'github' });
  for (const bad of ['acme', 'acme/app/extra', 'has space/app']) {
    const r = await run(['identity', s.copy, 'github', '--members', bad], s.env);
    assert.equal(r.code, 1, bad);
    assert.match(r.err, /names one repository as owner\/repo/);
  }
  const listed = await (await fetch(`${s.service.url}/api/p/${s.key}/comments`)).json();
  assert.deepEqual(listed.prototype, { name: 'proto.html' }, 'a refused command still changed the setting');

  const r = await run(['identity', s.copy, 'github', '--members', 'acme/app'], s.env);
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /people GitHub lets open the repository "acme\/app" only/);
  assert.match(r.err, /must be installed on acme\/app, with read access to repository metadata/);
  assert.match(r.err, /a freed name can be registered by someone else/);
});

test('identity github says so when the service has no GitHub App set up', async (t) => {
  const s = await setup(t, { provider: 'github', gitlab: false });
  const r = await run(['identity', s.copy, 'github'], s.env);
  assert.equal(r.code, 2);
  assert.match(r.err, /no GitHub App set up/);
  assert.match(r.err, /GITMARGIN_GITHUB_ID and GITMARGIN_GITHUB_SECRET/);
  assert.ok(!/GitLab/.test(r.err), 'the GitHub refusal named GitLab');
});

test('pull --live marks a GitHub author as verified, and a typed one as typed', async (t) => {
  const s = await setup(t, { provider: 'github' });
  assert.equal((await post(s, 'c_111111', 'Written before sign-in was on.')).status, 201);
  assert.equal((await run(['identity', s.copy, 'github'], s.env)).code, 0);
  const pass = await signIn(s);
  assert.equal((await post(s, 'c_222222', 'Written under GitHub sign-in.', { pass, name: 'Not My Real Name' })).status, 201);

  const pulled = await run(['pull', s.copy, '--live'], s.env);
  assert.equal(pulled.code, 0, pulled.err);
  const byId = Object.fromEntries(JSON.parse(pulled.out).comments.map((c) => [c.id, c.author]));
  assert.deepEqual(byId.c_111111, { name: 'Sam, typed' });
  assert.deepEqual(byId.c_222222, { name: 'Priya Shah', provider: 'github', username: 'octopriya', verified: true });

  const markdown = (await run(['pull', s.copy, '--live', '--markdown'], s.env)).out;
  assert.match(markdown, /From Priya Shah \(GitHub, verified\)\./);
});
