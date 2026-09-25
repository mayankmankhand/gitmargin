// gitmargin-publish (plugin/scripts/publish-branch.mjs): one attached copy to
// GitHub Pages from a branch of its own, without touching the author's
// checkout (issue #16, decisions D8 and D9).
//
// Nothing here reaches GitHub, the network, or the real gh:
// - The "GitHub" remote is a bare repository in a scratch folder. git's own
//   url.<base>.insteadOf rewrites https://github.com/acme/site.git to it, so
//   the script sees a real github.com remote while every fetch and push stays
//   on disk. GIT_ALLOW_PROTOCOL=file makes git refuse any other transport, so
//   a rewrite that missed would fail the test instead of going online.
// - `gh` is a stand-in put first on PATH. It answers the four API calls from a
//   JSON state file, records every call, and refuses anything else. Like the
//   fakes in tests/helpers, it is no kinder than the real thing: it will not
//   switch Pages on for a branch that is not there yet.
// - git reads a scratch global config (GIT_CONFIG_GLOBAL, GIT_CONFIG_NOSYSTEM),
//   and HOME, TMPDIR and GH_CONFIG_DIR point into the test's own folder, with
//   every GIT_, GH_ and GITHUB_ variable of the caller removed. So even a real
//   gh found by mistake would have no login to use.
// - A pre-receive hook on the bare repository logs every push that arrives, so
//   "refused before any push" is checked by what reached the remote, and can
//   refuse pushes on demand.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSafeFolder, pageLink, parseGitHubRemote, readStamp } from '../plugin/scripts/publish-branch.mjs';
import { secretSpies } from './helpers/secret-spy.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = path.join(ROOT, 'plugin', 'scripts', 'publish-branch.mjs');
const LAUNCHER = path.join(ROOT, 'plugin', 'bin', 'gitmargin-publish');
const CLI = path.join(ROOT, 'bin', 'gitmargin.js');
const REMOTE_URL = 'https://github.com/acme/site.git';
const SITE = 'https://acme.github.io/site/';
const BRANCH = 'gitmargin-pages';

/**
 * The stand-in gh. Written out as its own CommonJS file, so it runs the same
 * whatever the scratch folder's surroundings say about modules.
 */
function fakeGh() {
  const fs = require('fs');
  const { execFileSync: run } = require('child_process');
  const args = process.argv.slice(2);
  fs.appendFileSync(process.env.FAKE_GH_LOG, `${JSON.stringify(args)}\n`);
  const file = process.env.FAKE_GH_STATE;
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  const save = () => fs.writeFileSync(file, JSON.stringify(state, null, 2));
  const answer = (body) => {
    process.stdout.write(JSON.stringify(body));
    process.exit(0);
  };
  // What the real gh does with a refusal: GitHub's JSON on stdout, a one-line
  // summary on stderr, exit 1.
  const refuse = (code, message) => {
    process.stdout.write(JSON.stringify({ message, status: String(code) }));
    process.stderr.write(`gh: ${message} (HTTP ${code})\n`);
    process.exit(1);
  };
  const unknown = () => {
    process.stderr.write(`fake gh: no answer for ${JSON.stringify(args)}\n`);
    process.exit(3);
  };
  const tip = (branch) => {
    try {
      return run('git', ['--git-dir', process.env.FAKE_GH_BARE, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { encoding: 'utf8' }).trim();
    } catch {
      return null;
    }
  };

  if (args[0] === 'auth' && args[1] === 'status') {
    if (state.loggedIn) {
      process.stderr.write('github.com\n  Logged in to github.com account acme\n');
      process.exit(0);
    }
    process.stderr.write('You are not logged into any GitHub hosts. To log in, run: gh auth login\n');
    process.exit(1);
  }
  if (args[0] !== 'api') unknown();
  let method = null;
  let endpoint = null;
  let host = null;
  const fields = {};
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '-X' || a === '--method') method = args[++i];
    else if (a === '--hostname') host = args[++i];
    else if (a === '-f' || a === '--raw-field') {
      const [key, ...rest] = args[++i].split('=');
      fields[key] = rest.join('=');
    } else if (a.startsWith('-')) unknown();
    else if (endpoint === null) endpoint = a;
    else unknown();
  }
  // gh's own rule: a request with fields is a POST unless told otherwise.
  if (method === null) method = Object.keys(fields).length ? 'POST' : 'GET';
  if (host !== 'github.com') unknown();
  const repo = 'repos/acme/site';
  if (method === 'GET' && endpoint === repo) return state.repo ? answer(state.repo) : refuse(404, 'Not Found');
  if (method === 'GET' && endpoint === `${repo}/pages`) return state.pages ? answer(state.pages) : refuse(404, 'Not Found');
  if (method === 'POST' && endpoint === `${repo}/pages`) {
    if (state.pages) return refuse(409, 'GitHub Pages is already enabled.');
    const branch = fields['source[branch]'];
    // Like GitHub: Pages cannot point at a branch that does not exist yet.
    if (!branch || !tip(branch)) return refuse(422, 'The source branch does not exist.');
    state.pages = { html_url: state.siteUrl, build_type: 'legacy', source: { branch, path: fields['source[path]'] }, status: null };
    save();
    return answer(state.pages);
  }
  if (method === 'GET' && endpoint === `${repo}/pages/builds/latest`) {
    const builds = state.builds || [];
    if (!builds.length) return refuse(404, 'Not Found');
    const build = builds.length > 1 ? builds.shift() : builds[0];
    save();
    if (!build) return refuse(404, 'Not Found');
    const commit = build.commit === 'TIP' ? tip('gitmargin-pages') : build.commit;
    return answer({ status: build.status, commit, error: { message: build.error || null } });
  }
  return unknown();
}

const GH_DEFAULTS = {
  loggedIn: true,
  siteUrl: SITE,
  repo: { full_name: 'acme/site', visibility: 'public', private: false, permissions: { admin: true, push: true } },
  pages: { html_url: SITE, build_type: 'legacy', source: { branch: BRANCH, path: '/' }, status: 'built' },
  builds: [{ status: 'built', commit: 'TIP' }],
};

const setGh = (w, overrides) => writeFileSync(w.state, JSON.stringify({ ...GH_DEFAULTS, ...overrides }, null, 2));

function cleanEnv(extra) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!/^(GIT_|GH_|GITHUB_)/.test(key)) env[key] = value;
  }
  return { ...env, ...extra };
}

/**
 * A scratch world: an author repository whose origin "is" github.com/acme/site,
 * the bare repository standing in for it, and the stand-in gh.
 */
function world(t, { gh = {}, identity = true } = {}) {
  const base = mkdtempSync(path.join(tmpdir(), 'gitmargin-publish-test-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const w = {
    base,
    bare: path.join(base, 'remote.git'),
    author: path.join(base, 'author'),
    bin: path.join(base, 'bin'),
    home: path.join(base, 'home'),
    tmp: path.join(base, 'tmp'),
    gitconfig: path.join(base, 'gitconfig'),
    state: path.join(base, 'gh-state.json'),
    log: path.join(base, 'gh-calls.jsonl'),
    pushes: path.join(base, 'pushes.log'),
    refuseFlag: path.join(base, 'refuse-pushes'),
  };
  for (const dir of [w.bin, w.home, w.tmp]) mkdirSync(dir);
  writeFileSync(
    w.gitconfig,
    [
      '[init]',
      '\tdefaultBranch = main',
      '[commit]',
      '\tgpgsign = false',
      ...(identity ? ['[user]', '\tname = Test Author', '\temail = author@example.com'] : []),
      `[url "${w.bare}"]`,
      `\tinsteadOf = ${REMOTE_URL}`,
      '',
    ].join('\n')
  );
  const fake = path.join(w.bin, 'fake-gh.cjs');
  writeFileSync(fake, `'use strict';\n(${fakeGh.toString()})();\n`);
  writeFileSync(path.join(w.bin, 'gh'), `#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`);
  chmodSync(path.join(w.bin, 'gh'), 0o755);
  setGh(w, gh);
  w.env = cleanEnv({
    GIT_CONFIG_GLOBAL: w.gitconfig,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_ALLOW_PROTOCOL: 'file',
    HOME: w.home,
    XDG_CONFIG_HOME: path.join(w.home, '.config'),
    GH_CONFIG_DIR: path.join(w.home, 'gh'),
    TMPDIR: w.tmp,
    PATH: [w.bin, path.dirname(process.execPath), process.env.PATH].join(path.delimiter),
    FAKE_GH_STATE: w.state,
    FAKE_GH_LOG: w.log,
    FAKE_GH_BARE: w.bare,
    GITMARGIN_PUBLISH_POLL_MS: '5',
    GITMARGIN_CONFIG_DIR: path.join(w.home, 'gitmargin'),
  });
  w.git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { env: w.env, encoding: 'utf8' });

  execFileSync('git', ['init', '-q', '--bare', w.bare], { env: w.env });
  const hook = path.join(w.bare, 'hooks', 'pre-receive');
  writeFileSync(
    hook,
    `#!/bin/sh\ncat >> "${w.pushes}"\nif [ -f "${w.refuseFlag}" ]; then\n  echo "pre-receive: pushes to this repository are closed" >&2\n  exit 1\nfi\nexit 0\n`
  );
  chmodSync(hook, 0o755);

  execFileSync('git', ['init', '-q', w.author], { env: w.env });
  writeFileSync(path.join(w.author, 'README.md'), '# site\n');
  w.git(w.author, 'add', 'README.md');
  w.git(w.author, '-c', 'user.name=Setup', '-c', 'user.email=setup@example.com', 'commit', '-q', '-m', 'Start');
  w.git(w.author, 'remote', 'add', 'origin', REMOTE_URL);
  w.git(w.author, 'push', '-q', 'origin', 'main');
  // The setup push is not the script's.
  writeFileSync(w.pushes, '');
  writeFileSync(w.log, '');
  return w;
}

/** An attached copy as `gitmargin attach --service` writes it (src/cli/attach.js). */
function attached(w, name, body, { version = 'v1-abc123', service = true } = {}) {
  const file = path.join(w.base, `${name}.gitmargin.html`);
  writeFileSync(
    file,
    '<!doctype html>\n<html><head><meta charset="utf-8"><title>t</title>\n' +
      `<meta name="gitmargin-version" content="${version}">\n<meta name="gitmargin-file" content="${name}.html">\n` +
      (service
        ? '<meta name="gitmargin-service" content="https://comments.example.test">\n<meta name="gitmargin-key" content="gm_testkey0123456789">\n'
        : '') +
      `</head>\n<body><p>${body}</p>\n</body></html>\n`
  );
  return file;
}

function run(w, args, { env = {}, cwd = w.author, launcher = false } = {}) {
  const [command, argv] = launcher ? [LAUNCHER, args] : [process.execPath, [SCRIPT, ...args]];
  const result = spawnSync(command, argv, { cwd, env: { ...w.env, ...env }, encoding: 'utf8' });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

const calls = (w) => readFileSync(w.log, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
const posts = (w) => calls(w).filter((c) => c.includes('POST'));
const buildCalls = (w) => calls(w).filter((c) => c.includes('repos/acme/site/pages/builds/latest'));
const ghState = (w) => JSON.parse(readFileSync(w.state, 'utf8'));
const pushAttempts = (w) => readFileSync(w.pushes, 'utf8').split('\n').filter(Boolean).length;
const tipOf = (w) => {
  try {
    return w.git(w.bare, 'rev-parse', '--verify', '--quiet', `refs/heads/${BRANCH}`).trim();
  } catch {
    return null;
  }
};
const filesOn = (w, ref = BRANCH) => w.git(w.bare, 'ls-tree', '-r', '--name-only', ref).split('\n').filter(Boolean).sort();
const bytesOn = (w, file, ref = BRANCH) => execFileSync('git', ['-C', w.bare, 'cat-file', 'blob', `${ref}:${file}`], { env: w.env });
const worktreeCount = (w) => w.git(w.author, 'worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).length;
const localBranches = (w) => w.git(w.author, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads');

/** Nothing left behind: no temporary worktree, no temporary folder, no new local branch. */
function assertClean(w, branchesBefore) {
  assert.equal(worktreeCount(w), 1, 'only the author own worktree is left');
  assert.deepEqual(readdirSync(w.tmp), [], 'the temporary folder is gone');
  assert.equal(localBranches(w), branchesBefore, 'no local branch was added or moved');
}

/** Refused before any push: nothing reached the remote and GitHub was not changed. */
function assertNothingPublished(w) {
  assert.equal(pushAttempts(w), 0, 'no push reached the remote');
  assert.equal(tipOf(w), null, 'the branch was not created');
  assert.deepEqual(posts(w), [], 'Pages was not switched on');
  assert.equal(worktreeCount(w), 1, 'no worktree was left');
  assert.deepEqual(readdirSync(w.tmp), [], 'no temporary folder was left');
}

/** Everything about the author's checkout that a publish must not change. */
function snapshot(w) {
  const g = (...args) => w.git(w.author, ...args);
  const read = (name) => (existsSync(path.join(w.author, name)) ? readFileSync(path.join(w.author, name), 'utf8') : null);
  return {
    head: g('rev-parse', 'HEAD'),
    symbolic: g('symbolic-ref', 'HEAD'),
    refs: g('for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads', 'refs/tags', 'refs/stash', 'refs/remotes/origin/main'),
    status: g('status', '--porcelain=v1', '--branch', '-uall'),
    staged: g('diff', '--cached'),
    unstaged: g('diff'),
    index: g('ls-files', '--stage'),
    worktrees: g('worktree', 'list', '--porcelain'),
    files: ['README.md', 'staged.txt', 'untracked.txt'].map(read),
    config: readFileSync(path.join(w.author, '.git', 'config'), 'utf8'),
    fetchHead: read('.git/FETCH_HEAD'),
  };
}

// ---------------------------------------------------------------------------
// The rules on their own

test('only github.com remotes give an owner and a repository', () => {
  const good = {
    'https://github.com/acme/site.git': 'acme/site',
    'https://github.com/acme/site': 'acme/site',
    'https://github.com/acme/site/': 'acme/site',
    'https://someone:token@github.com/acme/site.git': 'acme/site',
    'git@github.com:acme/site.git': 'acme/site',
    'github.com:acme/site': 'acme/site',
    'ssh://git@github.com/acme/site.git': 'acme/site',
    'ssh://git@github.com:22/acme/site.git': 'acme/site',
    'https://GitHub.com/Acme/my.site.git': 'Acme/my.site',
  };
  for (const [url, full] of Object.entries(good)) {
    const parsed = parseGitHubRemote(url);
    assert.ok(parsed, url);
    assert.equal(`${parsed.owner}/${parsed.repo}`, full, url);
  }
  for (const url of [
    'https://gitlab.com/acme/site.git',
    'https://github.com.evil.example/acme/site.git',
    'https://evil.example/github.com/acme/site.git',
    'git@evil.example:github.com/acme/site.git',
    'https://github.com/acme',
    'https://github.com/acme/site/extra',
    'https://github.com/ac_me/site',
    '/some/local/path.git',
    '',
  ]) {
    assert.equal(parseGitHubRemote(url), null, url);
  }
});

test('a folder is one plain path segment', () => {
  for (const name of ['onboarding', 'v2.1', 'my_proto-3', 'A1']) assert.ok(isSafeFolder(name), name);
  for (const name of ['', '.', '..', '../x', 'x/..', 'a/b', 'a\\b', 'a..b', '.hidden', '.nojekyll', '-x', 'a b', 'caf\u00e9', 'x'.repeat(101), null]) {
    assert.equal(isSafeFolder(name), false, String(name));
  }
});

test('the link is the site address, the folder and a slash', () => {
  assert.equal(pageLink('https://acme.github.io/site/', 'one'), 'https://acme.github.io/site/one/');
  assert.equal(pageLink('https://docs.acme.dev', 'one'), 'https://docs.acme.dev/one/');
  assert.equal(pageLink('https://acme.github.io/site', 'one'), 'https://acme.github.io/site/one/');
  assert.equal(pageLink('javascript:alert(1)', 'one'), null);
  assert.equal(pageLink(undefined, 'one'), null);
});

test('the stamp is the one attach writes', () => {
  assert.equal(readStamp('<meta name="gitmargin-version" content="v1-abc123">').versionId, 'v1-abc123');
  assert.equal(readStamp('<meta name="gitmargin-version" content="">').versionId, null);
  assert.equal(readStamp('<meta name="version" content="v1">').versionId, null);
  assert.equal(readStamp('<meta name="gitmargin-service" content="https://x.test">').service, 'https://x.test');
});

// ---------------------------------------------------------------------------
// Publishing

test('a first publish creates the branch with <folder>/index.html and .nojekyll, and prints the link', (t) => {
  const w = world(t);
  const branches = localBranches(w);
  const file = attached(w, 'one', 'first');
  const r = run(w, [file, '--folder', 'one'], { launcher: true });
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, `${SITE}one/\n`, 'stdout carries the link and nothing else');
  assert.deepEqual(filesOn(w), ['.nojekyll', 'one/index.html']);
  assert.deepEqual(bytesOn(w, 'one/index.html'), readFileSync(file), 'the exact bytes of the attached copy');
  assert.equal(bytesOn(w, '.nojekyll').length, 0);
  assert.equal(w.git(w.bare, 'rev-list', '--count', BRANCH).trim(), '1', 'a branch of its own, with no history from the project');
  assert.equal(w.git(w.bare, 'log', '-1', '--format=%s', BRANCH).trim(), 'Publish one for review (v1-abc123)');
  assert.equal(w.git(w.bare, 'log', '-1', '--format=%an <%ae>', BRANCH).trim(), 'Test Author <author@example.com>');
  assert.match(r.err, /Published one to the gitmargin-pages branch of acme\/site/);
  assert.match(r.err, /Anyone on the internet/);
  assert.doesNotMatch(r.err, /without --service/, 'a shared copy gets no note about local comments');
  assert.equal(pushAttempts(w), 1);
  assert.deepEqual(posts(w), [], 'Pages already served this branch, so nothing was switched on');
  assert.ok(calls(w).length > 0, 'the stand-in gh answered');
  for (const call of calls(w)) assert.ok(call.join(' ').includes('github.com'), `every gh call names github.com: ${call.join(' ')}`);
  assertClean(w, branches);
});

test('a branch that only ends in the same name does not count as the pages branch', (t) => {
  const w = world(t);
  // ls-remote matches a pattern against the END of each ref name, so the
  // second of these matches refs/heads/gitmargin-pages as a pattern.
  w.git(w.author, 'push', '-q', 'origin', `main:refs/heads/old/${BRANCH}`, `main:refs/heads/x/refs/heads/${BRANCH}`);
  writeFileSync(w.pushes, '');
  const r = run(w, [attached(w, 'one', 'first'), '--folder', 'one']);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(filesOn(w), ['.nojekyll', 'one/index.html'], 'a fresh branch, not a copy of old/gitmargin-pages');
});

test('a second prototype adds a second folder and keeps the first', (t) => {
  const w = world(t);
  const one = attached(w, 'one', 'first');
  const two = attached(w, 'two', 'second');
  assert.equal(run(w, [one, '--folder', 'one']).code, 0);
  const first = tipOf(w);
  const r = run(w, [two, '--folder', 'two']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, `${SITE}two/\n`);
  assert.deepEqual(filesOn(w), ['.nojekyll', 'one/index.html', 'two/index.html']);
  assert.deepEqual(bytesOn(w, 'one/index.html'), readFileSync(one));
  assert.deepEqual(bytesOn(w, 'two/index.html'), readFileSync(two));
  assert.equal(w.git(w.bare, 'rev-parse', `${BRANCH}^`).trim(), first, 'the new commit follows the first');
});

test('a republish replaces only that file, and the same bytes again change nothing', (t) => {
  const w = world(t);
  assert.equal(run(w, [attached(w, 'one', 'first'), '--folder', 'one']).code, 0);
  assert.equal(run(w, [attached(w, 'two', 'second'), '--folder', 'two']).code, 0);
  const before = tipOf(w);
  const v2 = attached(w, 'one', 'first, changed', { version: 'v2-def456' });
  const r = run(w, [v2, '--folder', 'one']);
  assert.equal(r.code, 0, r.err);
  const after = tipOf(w);
  assert.equal(w.git(w.bare, 'diff', '--name-only', before, after).trim(), 'one/index.html');
  assert.deepEqual(bytesOn(w, 'one/index.html'), readFileSync(v2));
  assert.equal(w.git(w.bare, 'log', '-1', '--format=%s', BRANCH).trim(), 'Publish one for review (v2-def456)');

  const buildsBefore = buildCalls(w).length;
  const again = run(w, [v2, '--folder', 'one']);
  assert.equal(again.code, 0, again.err);
  assert.equal(again.out, `${SITE}one/\n`);
  assert.match(again.err, /Nothing changed/);
  assert.equal(tipOf(w), after, 'no empty commit');
  assert.equal(buildCalls(w).length, buildsBefore, 'nothing to wait for');
});

test('the author checkout is exactly as it was: working tree, index, HEAD and branches', (t) => {
  const w = world(t);
  w.git(w.author, 'checkout', '-q', '-b', 'feature');
  writeFileSync(path.join(w.author, 'README.md'), '# site\nwork in progress\n');
  writeFileSync(path.join(w.author, 'staged.txt'), 'staged\n');
  w.git(w.author, 'add', 'staged.txt');
  writeFileSync(path.join(w.author, 'staged.txt'), 'staged, then edited again\n');
  writeFileSync(path.join(w.author, 'untracked.txt'), 'not in git\n');
  const before = snapshot(w);
  // A first publish (the branch starts empty) and a republish (it is fetched).
  const first = run(w, [attached(w, 'one', 'first'), '--folder', 'one']);
  assert.equal(first.code, 0, first.err);
  const second = run(w, [attached(w, 'one', 'again', { version: 'v2-def456' }), '--folder', 'one']);
  assert.equal(second.code, 0, second.err);
  assert.deepEqual(snapshot(w), before);
});

test('git variables pointing at the author repository cannot turn the commit onto it', (t) => {
  // What a caller inside a git hook would pass on.
  const w = world(t);
  writeFileSync(path.join(w.author, 'staged.txt'), 'staged\n');
  w.git(w.author, 'add', 'staged.txt');
  const before = snapshot(w);
  const gitDir = path.join(w.author, '.git');
  const r = run(w, [attached(w, 'one', 'first'), '--folder', 'one'], {
    env: { GIT_DIR: gitDir, GIT_WORK_TREE: w.author, GIT_INDEX_FILE: path.join(gitDir, 'index') },
  });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(snapshot(w), before);
  assert.deepEqual(filesOn(w), ['.nojekyll', 'one/index.html']);
});

test('a refused push exits non-zero and leaves no worktree, temporary folder or branch behind', (t) => {
  const w = world(t);
  const branches = localBranches(w);
  const file = attached(w, 'one', 'first');

  writeFileSync(w.refuseFlag, '');
  const first = run(w, [file, '--folder', 'one']);
  assert.equal(first.code, 2);
  assert.equal(first.out, '', 'no link for a page that was not published');
  assert.match(first.err, /refused, so nothing was published/);
  assert.match(first.err, /pushes to this repository are closed/, "the remote's own reason is passed on");
  assert.equal(tipOf(w), null);
  assertClean(w, branches);

  // The same on the republish path, where the branch is fetched first.
  rmSync(w.refuseFlag);
  assert.equal(run(w, [file, '--folder', 'one']).code, 0);
  const published = tipOf(w);
  writeFileSync(w.refuseFlag, '');
  const again = run(w, [attached(w, 'one', 'changed', { version: 'v2-def456' }), '--folder', 'one']);
  assert.equal(again.code, 2);
  assert.equal(tipOf(w), published, 'the published page is unchanged');
  assertClean(w, branches);
});

test('with no git identity the commit is signed gitmargin, and stderr says so', (t) => {
  const w = world(t, { identity: false });
  const r = run(w, [attached(w, 'one', 'first'), '--folder', 'one']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /signed gitmargin/);
  assert.equal(w.git(w.bare, 'log', '-1', '--format=%an <%ae>', BRANCH).trim(), 'gitmargin <gitmargin@localhost>');
});

test('a copy from the real attach command is accepted, with a note when it has no service', (t) => {
  const w = world(t);
  const source = path.join(w.base, 'onboarding.html');
  copyFileSync(path.join(ROOT, 'fixtures', 'onboarding.html'), source);
  const copy = execFileSync(process.execPath, [CLI, 'attach', source], { env: w.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const r = run(w, [copy, '--folder', 'onboarding']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, `${SITE}onboarding/\n`);
  assert.match(r.err, /without --service/);
  assert.deepEqual(bytesOn(w, 'onboarding/index.html'), readFileSync(copy));
});

// ---------------------------------------------------------------------------
// Refusals, all before any push

test('a file without the gitmargin stamp is refused', (t) => {
  const w = world(t);
  const plain = path.join(w.base, 'plain.html');
  writeFileSync(plain, '<!doctype html><html><head><title>t</title></head><body>hi</body></html>\n');
  const empty = path.join(w.base, 'empty-stamp.html');
  writeFileSync(empty, '<html><head><meta name="gitmargin-version" content=""></head><body></body></html>\n');
  for (const file of [plain, empty]) {
    const r = run(w, [file, '--folder', 'one']);
    assert.equal(r.code, 2, file);
    assert.match(r.err, /not an attached copy/);
  }
  const missing = run(w, [path.join(w.base, 'nope.html'), '--folder', 'one']);
  assert.equal(missing.code, 1);
  assertNothingPublished(w);
});

test('an unsafe --folder is refused', (t) => {
  const w = world(t);
  const file = attached(w, 'one', 'first');
  for (const folder of ['../x', 'a/b', '..', '.', '.hidden', '.nojekyll', '-x', 'a b', 'x/..', '']) {
    const r = run(w, [file, `--folder=${folder}`]);
    assert.equal(r.code, 2, `--folder=${folder}`);
    assert.match(r.err, /Not a safe folder name/);
  }
  assertNothingPublished(w);
});

test('odd remote and branch names are usage errors, and a missing remote is refused', (t) => {
  const w = world(t);
  const file = attached(w, 'one', 'first');
  for (const args of [['--remote', '-x'], ['--remote', 'a/b'], ['--branch', '../x'], ['--branch', '-x'], ['--branch', 'pages.lock'], ['--wait', 'soon']]) {
    assert.equal(run(w, [file, '--folder', 'one', ...args]).code, 1, args.join(' '));
  }
  const r = run(w, [file, '--folder', 'one', '--remote', 'upstream']);
  assert.equal(r.code, 2);
  assert.match(r.err, /no remote named upstream/);
  assertNothingPublished(w);
});

test('a remote on neither github.com nor gitlab.com is refused before gh is asked anything', (t) => {
  // A gitlab.com remote goes to the GitLab half since issue #37
  // (tests/publish-gitlab.test.js); these are hosts neither half publishes to.
  const w = world(t);
  const file = attached(w, 'one', 'first');
  for (const url of ['https://bitbucket.org/acme/site.git', 'https://github.com.evil.example/acme/site.git', 'https://gitlab.com.evil.example/acme/site.git']) {
    w.git(w.author, 'remote', 'set-url', 'origin', url);
    const r = run(w, [file, '--folder', 'one']);
    assert.equal(r.code, 2, url);
    assert.match(r.err, /not a GitHub repository/);
  }
  assert.deepEqual(calls(w), []);
  assertNothingPublished(w);
});

test('a repository with no commits yet is refused', (t) => {
  const w = world(t);
  const empty = path.join(w.base, 'empty');
  execFileSync('git', ['init', '-q', empty], { env: w.env });
  w.git(empty, 'remote', 'add', 'origin', REMOTE_URL);
  const r = run(w, [attached(w, 'one', 'first'), '--folder', 'one', '--repo', empty]);
  assert.equal(r.code, 2);
  assert.match(r.err, /no commits yet/);
  assertNothingPublished(w);
});

test('a remote that cannot be read is an error, not a first publish over the old branch', (t) => {
  const w = world(t);
  const file = attached(w, 'one', 'first');
  // Out of reach for git only: gh still answers, so the guards all pass.
  const away = `${w.bare}.away`;
  renameSync(w.bare, away);
  const r = run(w, [file, '--folder', 'one']);
  renameSync(away, w.bare);
  assert.equal(r.code, 2);
  assert.match(r.err, /Could not read the origin remote/);
  assertNothingPublished(w);
});

test('gh missing, or not logged in, is refused', (t) => {
  const w = world(t);
  const file = attached(w, 'one', 'first');
  // A PATH with git on it and no gh at all.
  const noGh = path.join(w.base, 'no-gh');
  mkdirSync(noGh);
  symlinkSync(execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim(), path.join(noGh, 'git'));
  const missing = run(w, [file, '--folder', 'one'], { env: { PATH: noGh } });
  assert.equal(missing.code, 2, missing.err);
  assert.match(missing.err, /\(gh\) is not installed/);
  assert.match(missing.err, /cli\.github\.com/);

  setGh(w, { loggedIn: false });
  const loggedOut = run(w, [file, '--folder', 'one']);
  assert.equal(loggedOut.code, 2);
  assert.match(loggedOut.err, /gh auth login/);
  assertNothingPublished(w);
});

test('a private or internal repository is refused', (t) => {
  const w = world(t);
  const file = attached(w, 'one', 'first');
  for (const repo of [
    { visibility: 'private', private: true, permissions: { admin: true, push: true } },
    { visibility: 'internal', private: true, permissions: { admin: true, push: true } },
    { private: true },
  ]) {
    setGh(w, { repo });
    const r = run(w, [file, '--folder', 'one', '--enable']);
    assert.equal(r.code, 2, JSON.stringify(repo));
    assert.match(r.err, /(private|internal) repository/);
    assert.match(r.err, /public to the whole internet/);
  }
  assertNothingPublished(w);
});

test('a Pages site serving another source is left alone', (t) => {
  const w = world(t);
  const file = attached(w, 'one', 'first');
  for (const pages of [
    { html_url: SITE, build_type: 'legacy', source: { branch: 'main', path: '/' } },
    { html_url: SITE, build_type: 'legacy', source: { branch: BRANCH, path: '/docs' } },
    { html_url: SITE, build_type: 'workflow', source: { branch: BRANCH, path: '/' } },
  ]) {
    setGh(w, { pages });
    const r = run(w, [file, '--folder', 'one', '--enable']);
    assert.equal(r.code, 2, JSON.stringify(pages));
    assert.match(r.err, /leaves an existing site alone/);
    assert.deepEqual(ghState(w).pages, pages, 'the site is unchanged');
  }
  assertNothingPublished(w);
});

test('Pages off: refused without --enable; with it, the branch is pushed first, then Pages is switched on', (t) => {
  const w = world(t, { gh: { pages: null } });
  const file = attached(w, 'one', 'first');
  const refused = run(w, [file, '--folder', 'one']);
  assert.equal(refused.code, 2);
  assert.match(refused.err, /change the repository's settings/);
  assert.match(refused.err, /--enable/);
  assertNothingPublished(w);

  // The stand-in refuses a POST for a branch that is not there yet, as GitHub
  // does, so a success here also proves the push came first.
  const r = run(w, [file, '--folder', 'one', '--enable']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, `${SITE}one/\n`);
  assert.match(r.err, /Switched GitHub Pages on/);
  const [post, ...more] = posts(w);
  assert.equal(more.length, 0, 'one POST');
  assert.ok(post.includes('repos/acme/site/pages'));
  assert.ok(post.includes(`source[branch]=${BRANCH}`));
  assert.ok(post.includes('source[path]=/'));
  assert.deepEqual(ghState(w).pages.source, { branch: BRANCH, path: '/' });
});

test('switching Pages on needs admin rights, and publishing needs push rights, checked before the push', (t) => {
  const w = world(t);
  const file = attached(w, 'one', 'first');
  setGh(w, { pages: null, repo: { visibility: 'public', private: false, permissions: { admin: false, push: true } } });
  const noAdmin = run(w, [file, '--folder', 'one', '--enable']);
  assert.equal(noAdmin.code, 2);
  assert.match(noAdmin.err, /needs admin rights/);
  setGh(w, { repo: { visibility: 'public', private: false, permissions: { admin: false, push: false } } });
  const noPush = run(w, [file, '--folder', 'one']);
  assert.equal(noPush.code, 2);
  assert.match(noPush.err, /cannot push/);
  assertNothingPublished(w);
});

// ---------------------------------------------------------------------------
// --status, the link, and the build

test('--status reports the state and changes nothing', (t) => {
  const w = world(t, { gh: { pages: null } });
  const before = snapshot(w);
  const plain = run(w, ['--status']);
  assert.equal(plain.code, 0, plain.err);
  assert.match(plain.out, /acme\/site \(public\)/);
  assert.match(plain.out, /pages\s+off/);
  assert.match(plain.out, /gitmargin-pages is not on origin yet/);
  assert.match(plain.out, /ready once Pages is switched on/);

  setGh(w, {});
  const json = run(w, ['--status', '--folder', 'one', '--json']);
  assert.equal(json.code, 0, json.err);
  const state = JSON.parse(json.out);
  assert.equal(state.repo, 'acme/site');
  assert.equal(state.visibility, 'public');
  assert.deepEqual(state.pages, { branch: BRANCH, path: '/', buildType: 'legacy', url: SITE });
  assert.equal(state.link, `${SITE}one/`);
  assert.equal(state.publish, 'ready');
  assert.equal(state.branchOnRemote, 'absent');

  setGh(w, { repo: { visibility: 'private', private: true } });
  const refused = JSON.parse(run(w, ['--status', '--json']).out);
  assert.equal(refused.publish, 'refused');
  assert.match(refused.reason, /private repository/);

  assert.deepEqual(posts(w), []);
  assert.deepEqual(snapshot(w), before);
  assertNothingPublished(w);
});

test('the link is the address GitHub gives for the site, plus the folder', (t) => {
  // A custom domain with a path and no closing slash, the case where joining
  // the two by hand goes wrong.
  const w = world(t, { gh: { pages: { html_url: 'https://docs.acme.dev/prototypes', build_type: 'legacy', source: { branch: BRANCH, path: '/' } } } });
  const r = run(w, [attached(w, 'one', 'first'), '--folder', 'one']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, 'https://docs.acme.dev/prototypes/one/\n');
});

test('the build is followed until GitHub reports THIS commit built', (t) => {
  const w = world(t, {
    gh: {
      builds: [
        { status: 'built', commit: 'the-previous-publish' },
        { status: 'building', commit: 'TIP' },
        { status: 'built', commit: 'TIP' },
      ],
    },
  });
  const r = run(w, [attached(w, 'one', 'first'), '--folder', 'one', '--json']);
  assert.equal(r.code, 0, r.err);
  const out = JSON.parse(r.out);
  assert.equal(out.build, 'built');
  assert.equal(out.link, `${SITE}one/`);
  assert.equal(out.commit, tipOf(w));
  assert.equal(out.pushed, true);
  assert.equal(buildCalls(w).length, 3, 'an older build of another commit does not count');
  assert.match(r.err, /can show a 404/);
});

test('an errored build is an error, a timeout is not, and --wait 0 does not wait', (t) => {
  const w = world(t, { gh: { builds: [{ status: 'errored', commit: 'TIP', error: 'Page build failed.' }] } });
  const errored = run(w, [attached(w, 'one', 'first'), '--folder', 'one']);
  assert.equal(errored.code, 2);
  assert.equal(errored.out, '', 'no link to a page that did not build');
  assert.match(errored.err, /Page build failed/);

  setGh(w, { builds: [{ status: 'building', commit: 'TIP' }] });
  const slow = run(w, [attached(w, 'two', 'second'), '--folder', 'two', '--wait', '1'], { env: { GITMARGIN_PUBLISH_POLL_MS: '100' } });
  assert.equal(slow.code, 0, slow.err);
  assert.equal(slow.out, `${SITE}two/\n`);
  assert.match(slow.err, /not finished building/);

  const callsBefore = buildCalls(w).length;
  const quick = run(w, [attached(w, 'three', 'third'), '--folder', 'three', '--wait', '0', '--json']);
  assert.equal(quick.code, 0, quick.err);
  assert.equal(JSON.parse(quick.out).build, 'pending');
  assert.equal(buildCalls(w).length, callsBefore, 'no build call at all');
  assert.match(quick.err, /can show a 404/);
});


test('git and gh never receive the author secret or the Vercel bypass, and the spies did run (#33)', (t) => {
  const w = world(t);
  const spies = path.join(w.base, 'spies');
  const seen = secretSpies(spies, ["git","gh"], path.join(w.base, 'spies.log'), w.env.PATH);
  const r = run(w, [attached(w, 'one', 'first'), '--folder', 'one'], {
    env: {
      PATH: [spies, w.env.PATH].join(path.delimiter),
      GITMARGIN_SECRET: 'an-author-secret-that-must-stay-home-0123',
      GITMARGIN_VERCEL_BYPASS: 'a-bypass-value-that-must-stay-home',
    },
  });
  assert.equal(r.code, 0, r.err);
  const lines = seen();
  for (const name of ["git","gh"]) assert.ok(lines.includes(`${name} clean`), `${name} ran through its spy: ${lines.join(', ')}`);
  assert.deepEqual(lines.filter((line) => line.endsWith(' leaked')), []);
});
