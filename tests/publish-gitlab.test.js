// gitmargin-publish on GitLab (plugin/scripts/publish-gitlab.mjs, issue #37):
// one attached copy to the GitLab Pages site of a private gitlab.com project,
// from a branch of its own, without touching the author's checkout.
//
// Built like tests/publish-branch.test.js, and nothing here reaches GitLab,
// the network, or a real glab:
// - The "GitLab" remote is a bare repository in a scratch folder. git's own
//   url.<base>.insteadOf rewrites https://gitlab.com/acme/team/site.git to it,
//   so the script sees a real gitlab.com remote while every fetch and push
//   stays on disk. GIT_ALLOW_PROTOCOL=file makes git refuse any other
//   transport, so a rewrite that missed would fail the test instead.
// - `glab` is a stand-in put first on PATH (tests/helpers/fake-glab.cjs). It
//   answers the API calls from a JSON state file, records every call, and
//   refuses anything else. Its refusals copy what glab 1.119.0 really printed (plans/PLAN-issue-37.md,
//   Outcomes, Step 1): GitLab's JSON on stdout with no newline, one
//   "glab: <message> (HTTP <code>)" line on stderr, exit 1. Like the real
//   thing it counts a GITLAB_TOKEN in its environment as a login, and filters
//   pipelines by commit only when asked to, so a publisher that forgot to
//   strip the token or to ask for its own commit fails here.
// - Every test runs the command the way the plugin does, through the
//   gitmargin-publish entry point, so putting main's publish-branch.mjs back
//   makes these tests fail (plan Step 7).

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLAB_STRIPPED, ciFile, parseGitLabRemote, publishesPages } from '../plugin/scripts/publish-gitlab.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = path.join(ROOT, 'plugin', 'scripts', 'publish-branch.mjs');
const LAUNCHER = path.join(ROOT, 'plugin', 'bin', 'gitmargin-publish');
const REMOTE_URL = 'https://gitlab.com/acme/team/site.git';
const PROJECT = 'acme/team/site';
const SITE = 'https://site-a1b2c3.gitlab.io';
const BRANCH = 'gitmargin-pages';

// The stand-in glab lives in tests/helpers/fake-glab.cjs, shared with the
// headless rehearsals of the share skill.
const FAKE_GLAB = path.join(ROOT, 'tests', 'helpers', 'fake-glab.cjs');

const PROJECT_DEFAULTS = {
  id: 4242,
  path_with_namespace: PROJECT,
  visibility: 'private',
  default_branch: 'main',
  empty_repo: false,
  pages_access_level: 'private',
  ci_config_path: '',
  builds_access_level: 'enabled',
  shared_runners_enabled: true,
  // Access through a group higher up: GitLab names only direct memberships here.
  permissions: { project_access: null, group_access: null },
};

const GLAB_DEFAULTS = {
  loggedIn: true,
  role: 50,
  siteUrl: SITE,
  pages: null,
  defaultCi: null,
  pipelines: [{ id: 900, sha: 'TIP', ref: BRANCH, statuses: ['running', 'success'] }],
  failedJob: null,
};

function setGlab(w, overrides = {}) {
  const { project = {}, ...rest } = overrides;
  writeFileSync(w.state, JSON.stringify({ ...GLAB_DEFAULTS, ...rest, project: { ...PROJECT_DEFAULTS, ...project } }, null, 2));
}

/** A deployed site, as GitLab reports it once a Pages build has run. */
const deployedSite = { url: SITE, is_unique_domain_enabled: true, deployments: [{ created_at: '2026-09-20T10:00:00Z', url: SITE, path_prefix: null, root_directory: 'public' }] };

// Every variable name the stand-in reports seeing: the publisher's own list of
// what it strips, plus two it must pass through untouched.
const WATCHED = [...GLAB_STRIPPED, 'HTTPS_PROXY'];

function cleanEnv(extra) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!/^(GIT_|GH_|GITHUB_|GITLAB_|GLAB_|GL_|CI_)/.test(key) && !WATCHED.includes(key)) env[key] = value;
  }
  return { ...env, ...extra };
}

/**
 * A scratch world: an author repository whose origin "is" gitlab.com/acme/team/site,
 * the bare repository standing in for it, and the stand-in glab.
 */
function world(t, glab = {}) {
  const base = mkdtempSync(path.join(tmpdir(), 'gitmargin-publish-gitlab-test-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const w = {
    base,
    bare: path.join(base, 'remote.git'),
    author: path.join(base, 'author'),
    bin: path.join(base, 'bin'),
    home: path.join(base, 'home'),
    tmp: path.join(base, 'tmp'),
    gitconfig: path.join(base, 'gitconfig'),
    state: path.join(base, 'glab-state.json'),
    log: path.join(base, 'glab-calls.jsonl'),
    pushes: path.join(base, 'pushes.log'),
  };
  for (const dir of [w.bin, w.home, w.tmp]) mkdirSync(dir);
  writeFileSync(
    w.gitconfig,
    [
      '[init]',
      '\tdefaultBranch = main',
      '[commit]',
      '\tgpgsign = false',
      '[user]',
      '\tname = Test Author',
      '\temail = author@example.com',
      `[url "${w.bare}"]`,
      `\tinsteadOf = ${REMOTE_URL}`,
      '',
    ].join('\n')
  );
  writeFileSync(path.join(w.bin, 'glab'), `#!/bin/sh\nexec "${process.execPath}" "${FAKE_GLAB}" "$@"\n`);
  chmodSync(path.join(w.bin, 'glab'), 0o755);
  setGlab(w, glab);
  w.env = cleanEnv({
    GIT_CONFIG_GLOBAL: w.gitconfig,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_ALLOW_PROTOCOL: 'file',
    HOME: w.home,
    XDG_CONFIG_HOME: path.join(w.home, '.config'),
    TMPDIR: w.tmp,
    PATH: [w.bin, path.dirname(process.execPath), process.env.PATH].join(path.delimiter),
    FAKE_GLAB_STATE: w.state,
    FAKE_GLAB_LOG: w.log,
    FAKE_GLAB_BARE: w.bare,
    FAKE_GLAB_PUSHES: w.pushes,
    FAKE_GLAB_WATCH: JSON.stringify(WATCHED),
    GITMARGIN_PUBLISH_POLL_MS: '5',
  });
  w.git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { env: w.env, encoding: 'utf8' });

  execFileSync('git', ['init', '-q', '--bare', w.bare], { env: w.env });
  const hook = path.join(w.bare, 'hooks', 'pre-receive');
  writeFileSync(hook, `#!/bin/sh\ncat >> "${w.pushes}"\nexit 0\n`);
  chmodSync(hook, 0o755);

  execFileSync('git', ['init', '-q', w.author], { env: w.env });
  writeFileSync(path.join(w.author, 'README.md'), '# site\n');
  w.git(w.author, 'add', 'README.md');
  w.git(w.author, 'commit', '-q', '-m', 'Start');
  w.git(w.author, 'remote', 'add', 'origin', REMOTE_URL);
  w.git(w.author, 'push', '-q', 'origin', 'main');
  // The setup push is not the script's.
  writeFileSync(w.pushes, '');
  writeFileSync(w.log, '');
  return w;
}

/** An attached copy as `gitmargin attach --service` writes it (src/cli/attach.js). */
function attached(w, name, body, { version = 'v1-abc123' } = {}) {
  const file = path.join(w.base, `${name}.gitmargin.html`);
  writeFileSync(
    file,
    '<!doctype html>\n<html><head><meta charset="utf-8"><title>t</title>\n' +
      `<meta name="gitmargin-version" content="${version}">\n<meta name="gitmargin-file" content="${name}.html">\n` +
      '<meta name="gitmargin-service" content="https://comments.example.test">\n<meta name="gitmargin-key" content="gm_testkey0123456789">\n' +
      `</head>\n<body><p>${body}</p>\n</body></html>\n`
  );
  return file;
}

function run(w, args, { env = {}, launcher = false } = {}) {
  const [command, argv] = launcher ? [LAUNCHER, args] : [process.execPath, [SCRIPT, ...args]];
  const result = spawnSync(command, argv, { cwd: w.author, env: { ...w.env, ...env }, encoding: 'utf8' });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

const calls = (w) => readFileSync(w.log, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
const puts = (w) => calls(w).filter((c) => c.args.includes('PUT'));
const pipelineLooks = (w) => calls(w).filter((c) => /\/pipelines\?/.test(c.args[1] || ''));
const glabState = (w) => JSON.parse(readFileSync(w.state, 'utf8'));
const pushAttempts = (w) => readFileSync(w.pushes, 'utf8').split('\n').filter(Boolean).length;
const tipOf = (w) => {
  try {
    return w.git(w.bare, 'rev-parse', '--verify', '--quiet', `refs/heads/${BRANCH}`).trim();
  } catch {
    return null;
  }
};
const filesOn = (w) => w.git(w.bare, 'ls-tree', '-r', '--name-only', BRANCH).split('\n').filter(Boolean).sort();
const bytesOn = (w, file) => execFileSync('git', ['-C', w.bare, 'cat-file', 'blob', `${BRANCH}:${file}`], { env: w.env });
const worktreeCount = (w) => w.git(w.author, 'worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).length;

/** Refused before any change: nothing reached the remote and no GitLab setting was changed. */
function assertNothingChanged(w) {
  assert.equal(pushAttempts(w), 0, 'no push reached the remote');
  assert.equal(tipOf(w), null, 'the branch was not created');
  assert.deepEqual(puts(w), [], "the project's settings were not changed");
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
    refs: g('for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads', 'refs/tags', 'refs/remotes/origin/main'),
    status: g('status', '--porcelain=v1', '--branch', '-uall'),
    index: g('ls-files', '--stage'),
    worktrees: g('worktree', 'list', '--porcelain'),
    files: ['README.md', '.gitlab-ci.yml', 'untracked.txt'].map(read),
    config: readFileSync(path.join(w.author, '.git', 'config'), 'utf8'),
  };
}

// ---------------------------------------------------------------------------
// The rules on their own

test('only gitlab.com remotes give a project path, nested groups included', () => {
  const good = {
    'https://gitlab.com/acme/site.git': 'acme/site',
    'https://gitlab.com/acme/team/site': 'acme/team/site',
    'https://gitlab.com/acme/team/site/': 'acme/team/site',
    'https://oauth2:glpat-secret@gitlab.com/acme/site.git': 'acme/site',
    'git@gitlab.com:acme/team/site.git': 'acme/team/site',
    'gitlab.com:acme/site': 'acme/site',
    'ssh://git@gitlab.com/acme/site.git': 'acme/site',
    'ssh://git@gitlab.com:22/acme/site.git': 'acme/site',
    'https://GitLab.com/Acme/my.site_2.git': 'Acme/my.site_2',
  };
  for (const [url, full] of Object.entries(good)) {
    const parsed = parseGitLabRemote(url);
    assert.ok(parsed, url);
    assert.equal(parsed.path, full, url);
  }
  for (const url of [
    'https://github.com/acme/site.git',
    'https://gitlab.com.evil.example/acme/site.git',
    'https://evil.example/gitlab.com/acme/site.git',
    'git@evil.example:gitlab.com/acme/site.git',
    'https://gitlab.example.com/acme/site.git',
    'https://gitlab.com/acme',
    'https://gitlab.com/acme/../site',
    'https://gitlab.com/acme/-x',
    'https://gitlab.com/acme//site',
    '/some/local/path.git',
    '',
  ]) {
    assert.equal(parseGitLabRemote(url), null, url);
  }
});

test('the build file runs one pages job on its own branch only, and a Pages job is recognised in either form', () => {
  const file = ciFile(BRANCH);
  assert.match(file, /^pages:$/m, 'the job GitLab requires is named pages');
  assert.match(file, /^ {6}- public$/m, 'it publishes public/');
  assert.match(file, /^ {4}- if: \$CI_COMMIT_BRANCH == "gitmargin-pages"$/m, 'it runs on this branch alone');
  assert.doesNotMatch(file, /^\s*image:/m, 'no image line: the runner default, as the #18 walk ran');
  assert.ok(publishesPages(file));
  assert.ok(publishesPages('stages: [build]\npages:\n  script: make\n'), 'a job named pages');
  assert.ok(publishesPages('docs:\n  script: make\n  pages:\n    publish: dist\n'), 'the pages: keyword in a job of another name');
  assert.ok(publishesPages('docs:\n\tpages: true\n'));
  assert.ok(!publishesPages('test:\n  script: echo pages\n'), 'the word alone is not a job');
  assert.ok(!publishesPages('mypages:\n  script: make\n'));
  assert.ok(!publishesPages(''));
});

// ---------------------------------------------------------------------------
// Publishing

test('a first publish writes the page and the build file, waits for the build, and prints the link and the time', (t) => {
  const w = world(t);
  const file = attached(w, 'one', 'first');
  const r = run(w, [file, '--folder', 'one']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, `${SITE}/one/\n`, 'the link comes from GitLab, after the build');
  assert.deepEqual(filesOn(w), ['.gitlab-ci.yml', 'public/one/index.html']);
  assert.deepEqual(bytesOn(w, 'public/one/index.html'), readFileSync(file), 'the exact bytes of the attached copy');
  assert.equal(bytesOn(w, '.gitlab-ci.yml').toString(), ciFile(BRANCH));
  assert.match(r.err, /Only members of acme\/team\/site can open this page, after GitLab's login\./);
  assert.match(r.err, /GitLab built the page \d+ seconds after the push \(the build waited 4 seconds for a runner and ran for 20\)\./);
  assert.equal(pushAttempts(w), 1);
  assert.equal(worktreeCount(w), 1);
  assert.deepEqual(readdirSync(w.tmp), []);
});

test('--json reports the commit, the build, the seconds and GitLab\'s own timings', (t) => {
  const w = world(t);
  const r = run(w, [attached(w, 'one', 'first'), '--folder', 'one', '--json']);
  assert.equal(r.code, 0, r.err);
  const result = JSON.parse(r.out);
  assert.equal(result.host, 'gitlab');
  assert.equal(result.project, PROJECT);
  assert.equal(result.commit, tipOf(w));
  assert.equal(result.pushed, true);
  assert.equal(result.enabled, false);
  assert.equal(result.link, `${SITE}/one/`);
  assert.equal(result.build, 'built');
  assert.ok(Number.isInteger(result.seconds) && result.seconds >= 0, 'seconds from the push to the build');
  assert.deepEqual(result.pipeline, { id: 900, url: `https://gitlab.com/${PROJECT}/-/pipelines/900`, duration: 20.4, queuedDuration: 3.6 });
});

test('every glab call names gitlab.com, runs quiet, and never sees a host or token variable of the caller', (t) => {
  const w = world(t);
  const env = { GITLAB_HOST: 'gitlab.corp.example', GITLAB_TOKEN: 'corp-token', OAUTH_TOKEN: 'x', GITLAB_API_HOST: 'api.corp.example', GL_HOST: 'corp', HTTPS_PROXY: 'http://proxy.corp.example:3128' };
  const r = run(w, [attached(w, 'one', 'first'), '--folder', 'one'], { env });
  assert.equal(r.code, 0, r.err);
  const all = calls(w);
  assert.ok(all.length > 5);
  for (const call of all) {
    const at = call.args.indexOf('--hostname');
    assert.ok(at > 0 && call.args[at + 1] === 'gitlab.com', JSON.stringify(call.args));
    assert.deepEqual(call.seen, ['HTTPS_PROXY'], 'only the proxy reaches glab');
    assert.equal(call.quiet, 'false', 'telemetry off');
  }
});

test('a token only in the environment is not a login here', (t) => {
  const w = world(t, { loggedIn: false });
  const r = run(w, [attached(w, 'one', 'first'), '--folder', 'one'], { env: { GITLAB_TOKEN: 'glpat-somewhere' } });
  assert.equal(r.code, 2);
  assert.match(r.err, /glab\) is not logged in to gitlab\.com/);
  assert.match(r.err, /glab auth login --hostname gitlab\.com/);
  assertNothingChanged(w);
});

test('a second prototype adds a second folder, and the same bytes again change nothing and wait for nothing', (t) => {
  const w = world(t);
  assert.equal(run(w, [attached(w, 'one', 'first'), '--folder', 'one']).code, 0);
  setGlab(w, { pages: deployedSite, pipelines: [{ id: 901, sha: 'TIP', ref: BRANCH, statuses: ['success'] }] });
  const two = run(w, [attached(w, 'two', 'second'), '--folder', 'two']);
  assert.equal(two.code, 0, two.err);
  assert.equal(two.out, `${SITE}/two/\n`);
  assert.deepEqual(filesOn(w), ['.gitlab-ci.yml', 'public/one/index.html', 'public/two/index.html']);

  const tipBefore = tipOf(w);
  const looksBefore = pipelineLooks(w).length;
  const again = run(w, [attached(w, 'two', 'second'), '--folder', 'two']);
  assert.equal(again.code, 0, again.err);
  assert.equal(again.out, `${SITE}/two/\n`);
  assert.match(again.err, /Nothing changed/);
  assert.equal(tipOf(w), tipBefore);
  assert.equal(pushAttempts(w), 2);
  assert.ok(pipelineLooks(w).length - looksBefore <= 1, 'one look, no wait');
});

test('the same bytes while the last build still runs: one look, the link, and a note', (t) => {
  const w = world(t);
  assert.equal(run(w, [attached(w, 'one', 'first'), '--folder', 'one']).code, 0);
  setGlab(w, { pages: deployedSite, pipelines: [{ id: 901, sha: 'TIP', ref: BRANCH, statuses: ['running'] }] });
  const looksBefore = pipelineLooks(w).length;
  const r = run(w, [attached(w, 'one', 'first'), '--folder', 'one', '--wait', '2']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, `${SITE}/one/\n`);
  assert.match(r.err, /Nothing changed/);
  assert.match(r.err, /GitLab is still building the page\. Until it finishes, the link shows the previous version, or a 404 if this is the first\./);
  assert.equal(pipelineLooks(w).length - looksBefore, 1, 'nothing was pushed, so nothing is waited for');
});

test("the author's checkout is exactly as it was, their own build file included", (t) => {
  const w = world(t);
  writeFileSync(path.join(w.author, '.gitlab-ci.yml'), 'test:\n  script: npm test\n');
  w.git(w.author, 'add', '.gitlab-ci.yml');
  w.git(w.author, 'commit', '-q', '-m', 'CI');
  writeFileSync(path.join(w.author, 'untracked.txt'), 'draft\n');
  writeFileSync(path.join(w.author, 'README.md'), '# site, edited\n');
  const before = snapshot(w);
  const r = run(w, [attached(w, 'one', 'first'), '--folder', 'one']);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(snapshot(w), before);
  assert.deepEqual(filesOn(w), ['.gitlab-ci.yml', 'public/one/index.html'], 'the branch holds pages only');
});

test('the launcher runs the same command', (t) => {
  const w = world(t);
  const r = run(w, [attached(w, 'one', 'first'), '--folder', 'one'], { launcher: true });
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, `${SITE}/one/\n`);
});

// ---------------------------------------------------------------------------
// Refusals, each before any change

test('a public or internal project is refused', (t) => {
  for (const visibility of ['public', 'internal']) {
    const w = world(t, { project: { visibility } });
    const r = run(w, [attached(w, 'one', 'first'), '--folder', 'one']);
    assert.equal(r.code, 2, visibility);
    assert.match(r.err, new RegExp(`is an? ${visibility} project\\. gitmargin publishes to GitLab Pages only from private projects`));
    assert.match(r.err, /service link/);
    assertNothingChanged(w);
  }
});

test('the role counts through groups: a Maintainer passes, a Developer is refused', (t) => {
  const maintainer = world(t, { role: 40 });
  assert.equal(run(maintainer, [attached(maintainer, 'one', 'first'), '--folder', 'one']).code, 0);

  const developer = world(t, { role: 30 });
  const r = run(developer, [attached(developer, 'one', 'first'), '--folder', 'one']);
  assert.equal(r.code, 2);
  assert.match(r.err, /needs the Maintainer or Owner role on acme\/team\/site, and this glab login is Developer/);
  assertNothingChanged(developer);
  assert.ok(!calls(developer).some((c) => /\/pages$/.test(c.args[1] || '')), 'Pages is not asked about below Maintainer');
});

test('CI off, or a build file read from somewhere else, is refused', (t) => {
  const off = world(t, { project: { builds_access_level: 'disabled' } });
  const a = run(off, [attached(off, 'one', 'first'), '--folder', 'one']);
  assert.equal(a.code, 2);
  assert.match(a.err, /CI\/CD is off for acme\/team\/site/);
  assertNothingChanged(off);

  const elsewhere = world(t, { project: { ci_config_path: 'ci/pipeline.yml' } });
  const b = run(elsewhere, [attached(elsewhere, 'one', 'first'), '--folder', 'one']);
  assert.equal(b.code, 2);
  assert.match(b.err, /reads its build file from ci\/pipeline\.yml/);
  assertNothingChanged(elsewhere);

  const standard = world(t, { project: { ci_config_path: '.gitlab-ci.yml' } });
  assert.equal(run(standard, [attached(standard, 'one', 'first'), '--folder', 'one']).code, 0, 'the standard path is fine');
});

test('a site the project already serves is left alone', (t) => {
  const w = world(t, { pages: deployedSite });
  const r = run(w, [attached(w, 'one', 'first'), '--folder', 'one']);
  assert.equal(r.code, 2);
  assert.match(r.err, /GitLab Pages for acme\/team\/site already serves a site\. gitmargin leaves an existing site alone/);
  assertNothingChanged(w);
});

test('a Pages job on the default branch is refused, and no build file there is fine', (t) => {
  for (const defaultCi of ['pages:\n  script: make\n  artifacts:\n    paths: [public]\n', 'docs:\n  script: make\n  pages:\n    publish: dist\n']) {
    const w = world(t, { defaultCi });
    const r = run(w, [attached(w, 'one', 'first'), '--folder', 'one']);
    assert.equal(r.code, 2);
    assert.match(r.err, /build file on acme\/team\/site's main branch has a Pages job/);
    assertNothingChanged(w);
  }
  const other = world(t, { defaultCi: 'test:\n  script: npm test\n' });
  assert.equal(run(other, [attached(other, 'one', 'first'), '--folder', 'one']).code, 0, 'a build file without Pages is fine');
  const none = world(t, { defaultCi: null });
  assert.equal(run(none, [attached(none, 'one', 'first'), '--folder', 'one']).code, 0, 'no build file (a 404) is fine');
});

test('an empty project is not asked for a build file', (t) => {
  const w = world(t, { project: { default_branch: null, empty_repo: true } });
  const r = run(w, [attached(w, 'one', 'first'), '--folder', 'one']);
  assert.equal(r.code, 0, r.err);
  assert.ok(!calls(w).some((c) => /repository\/files/.test(c.args[1] || '')));
});

test('glab missing, glab logged out, or a project glab cannot see is refused', (t) => {
  const w = world(t);
  const file = attached(w, 'one', 'first');
  const noGlab = path.join(w.base, 'no-glab');
  mkdirSync(noGlab);
  symlinkSync(execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim(), path.join(noGlab, 'git'));
  const missing = run(w, [file, '--folder', 'one'], { env: { PATH: [noGlab, path.dirname(process.execPath)].join(path.delimiter) } });
  assert.equal(missing.code, 2);
  assert.match(missing.err, /\(glab\) is not installed, or not on PATH/);

  setGlab(w, { loggedIn: false });
  const out = run(w, [file, '--folder', 'one']);
  assert.equal(out.code, 2);
  assert.match(out.err, /not logged in to gitlab\.com/);

  setGlab(w, { projectMissing: true });
  const gone = run(w, [file, '--folder', 'one']);
  assert.equal(gone.code, 2);
  assert.match(gone.err, /GitLab cannot find acme\/team\/site, or this glab login cannot see it/);
  assertNothingChanged(w);
});

test('a remote git cannot read stops the publish before any setting changes', (t) => {
  const w = world(t, { project: { pages_access_level: 'enabled' } });
  // git's rewrite now points at a folder that is not there: what a missing git
  // login to a private project looks like from here, a remote that will not answer.
  writeFileSync(w.gitconfig, readFileSync(w.gitconfig, 'utf8').replace(`[url "${w.bare}"]`, `[url "${w.bare}-gone"]`));
  const r = run(w, [attached(w, 'one', 'first'), '--folder', 'one', '--enable']);
  assert.equal(r.code, 2);
  assert.match(r.err, /git could not read acme\/team\/site from the origin remote, so nothing was changed/);
  assert.match(r.err, /git uses its own login for gitlab\.com/);
  assert.deepEqual(puts(w), []);
});

// ---------------------------------------------------------------------------
// Who can open it

test('Pages not set to members only: refused without --enable; with it, set before the push', (t) => {
  for (const level of ['enabled', 'public', 'disabled']) {
    const w = world(t, { project: { pages_access_level: level } });
    const file = attached(w, 'one', 'first');
    const refused = run(w, [file, '--folder', 'one']);
    assert.equal(refused.code, 2, level);
    assert.match(refused.err, /Setting it to "Only project members" would change the project's settings/);
    assert.match(refused.err, /Rerun with --enable once the author agrees/);
    assertNothingChanged(w);

    const r = run(w, [file, '--folder', 'one', '--enable']);
    assert.equal(r.code, 0, r.err);
    const [put, ...more] = puts(w);
    assert.equal(more.length, 0);
    assert.ok(put.args.includes('pages_access_level=private'), JSON.stringify(put.args));
    assert.equal(put.pushes, 0, 'the setting changed before anything was pushed');
    assert.equal(glabState(w).project.pages_access_level, 'private');
    assert.match(r.err, /Set GitLab Pages for acme\/team\/site to "Only project members"\./);
  }
});

test('--enable when Pages is already members only changes nothing', (t) => {
  const w = world(t);
  assert.equal(run(w, [attached(w, 'one', 'first'), '--folder', 'one', '--enable']).code, 0);
  assert.deepEqual(puts(w), []);
});

test('a setting GitLab refuses, or does not keep, stops the publish before the push', (t) => {
  const refused = world(t, { project: { pages_access_level: 'public' }, putRefused: true });
  const a = run(refused, [attached(refused, 'one', 'first'), '--folder', 'one', '--enable']);
  assert.equal(a.code, 2);
  assert.match(a.err, /GitLab did not set Pages to "Only project members", so nothing was published/);
  assert.equal(pushAttempts(refused), 0);

  const ignored = world(t, { project: { pages_access_level: 'public' }, putIgnored: true });
  const b = run(ignored, [attached(ignored, 'one', 'first'), '--folder', 'one', '--enable']);
  assert.equal(b.code, 2);
  assert.match(b.err, /GitLab still reports Pages for acme\/team\/site as open to everyone on the internet, so nothing was published/);
  assert.equal(pushAttempts(ignored), 0);
});

// ---------------------------------------------------------------------------
// The build

test("the build followed is THIS commit's on this branch, even when another pipeline already passed", (t) => {
  const w = world(t, {
    pipelines: [
      { id: 800, sha: '0000000000000000000000000000000000000000', ref: BRANCH, statuses: ['success'] },
      { id: 801, sha: 'TIP', ref: 'main', statuses: ['success'] },
      { id: 900, sha: 'TIP', ref: BRANCH, statuses: ['none', 'none', 'pending', 'running', 'success'] },
    ],
  });
  const r = run(w, [attached(w, 'one', 'first'), '--folder', 'one', '--json']);
  assert.equal(r.code, 0, r.err);
  const result = JSON.parse(r.out);
  assert.equal(result.pipeline.id, 900);
  assert.ok(pipelineLooks(w).length >= 5, 'it kept looking while no pipeline was there yet');
  for (const look of pipelineLooks(w)) {
    assert.match(look.args[1], new RegExp(`sha=${tipOf(w)}&ref=gitmargin-pages$`));
  }
});

test('a failed build says GitLab\'s reason, and names account verification when that may be it', (t) => {
  const cases = [
    { failedJob: { reason: 'script_failure', log: '$ echo hi\nERROR: Job failed: exit code 1\n' }, verify: false },
    { failedJob: { reason: 'script_failure', log: 'Identity verification is required in order to run CI jobs\n' }, verify: true },
    // Stopped before the job starts: an empty log, and a reason of GitLab's own.
    { failedJob: { reason: 'user_blocked', log: '' }, verify: true },
  ];
  for (const { failedJob, verify } of cases) {
    const w = world(t, { failedJob, pipelines: [{ id: 900, sha: 'TIP', ref: BRANCH, statuses: ['running', 'failed'] }] });
    // A short wait, so a publisher that kept waiting on a failed build fails here in seconds.
    const r = run(w, [attached(w, 'one', 'first'), '--folder', 'one', '--wait', '5']);
    assert.equal(r.code, 2, failedJob.reason);
    assert.equal(r.out, '', 'no link for a page that did not build');
    assert.match(r.err, new RegExp(`GitLab's build of the page failed \\(pages: ${failedJob.reason}\\)\\. https://gitlab\\.com/${PROJECT}/-/pipelines/900`));
    assert[verify ? 'match' : 'doesNotMatch'](r.err, /may have to verify itself/);
  }
});

test('a retried build counts: the newest pipeline for the commit is the one reported', (t) => {
  // An older run of the same commit failed; the retry passed.
  const w = world(t, {
    pipelines: [
      { id: 900, sha: 'TIP', ref: BRANCH, statuses: ['failed'] },
      { id: 905, sha: 'TIP', ref: BRANCH, statuses: ['running', 'success'] },
    ],
  });
  const r = run(w, [attached(w, 'one', 'first'), '--folder', 'one', '--json', '--wait', '5']);
  assert.equal(r.code, 0, r.err);
  assert.equal(JSON.parse(r.out).pipeline.id, 905);
});

test('a build GitLab did not run is an error with its status', (t) => {
  const w = world(t, { pipelines: [{ id: 900, sha: 'TIP', ref: BRANCH, statuses: ['canceled'] }] });
  const r = run(w, [attached(w, 'one', 'first'), '--folder', 'one']);
  assert.equal(r.code, 2);
  assert.match(r.err, /GitLab did not run the build \(the pipeline is canceled\)/);
});

test('a first publish still building exits without a link and says what it waits for', (t) => {
  const cases = [
    { pipelines: [], says: /GitLab has not started a build for this commit yet\./ },
    { pipelines: [{ id: 900, sha: 'TIP', ref: BRANCH, statuses: ['pending'] }], says: /The build is waiting for a runner to pick it up\./ },
    { pipelines: [{ id: 900, sha: 'TIP', ref: BRANCH, statuses: ['pending'] }], project: { shared_runners_enabled: false }, says: /waiting for a runner, and shared runners are off for this project/ },
    { pipelines: [{ id: 900, sha: 'TIP', ref: BRANCH, statuses: ['running'] }], says: /GitLab is still building the page\./ },
  ];
  for (const { says, ...glab } of cases) {
    const w = world(t, glab);
    const r = run(w, [attached(w, 'one', 'first'), '--folder', 'one', '--wait', '1']);
    assert.equal(r.code, 2, String(says));
    assert.equal(r.out, '');
    assert.match(r.err, says);
    assert.match(r.err, /Run gitmargin-publish --status --folder one in a minute for the link/);
    assert.ok(tipOf(w), 'the page is pushed');
  }
});

test('a republish still building prints the known link and says the old version shows meanwhile', (t) => {
  const w = world(t);
  assert.equal(run(w, [attached(w, 'one', 'first'), '--folder', 'one']).code, 0);
  setGlab(w, { pages: deployedSite, pipelines: [{ id: 902, sha: 'TIP', ref: BRANCH, statuses: ['running'] }] });
  const r = run(w, [attached(w, 'one', 'changed', { version: 'v2-def456' }), '--folder', 'one', '--wait', '1']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, `${SITE}/one/\n`);
  assert.match(r.err, /GitLab is still building the page\. Until it finishes, the link shows the previous version, or a 404 if this is the first\./);
});

test('a failed build shared again with the same bytes is built again, and gives the link', (t) => {
  const w = world(t, {
    failedJob: { reason: 'script_failure', log: 'Identity verification is required in order to run CI jobs\n' },
    pipelines: [{ id: 900, sha: 'TIP', ref: BRANCH, statuses: ['failed'] }],
  });
  const file = attached(w, 'one', 'first');
  const first = run(w, [file, '--folder', 'one', '--wait', '5']);
  assert.equal(first.code, 2);
  assert.match(first.err, /may have to verify itself/);
  // The author verifies the account, then shares the same page again, as the hint says.
  const again = run(w, [file, '--folder', 'one', '--wait', '5', '--json']);
  assert.equal(again.code, 0, again.err);
  assert.match(again.err, /Nothing changed/);
  assert.match(again.err, /The last build of this page did not finish, so GitLab is building it again\./);
  assert.match(again.err, /GitLab built the page \d+ seconds after the new build started/);
  const result = JSON.parse(again.out);
  assert.equal(result.link, `${SITE}/one/`);
  assert.equal(result.pipeline.id, 901);
  const starts = calls(w).filter((c) => c.args.includes('POST'));
  assert.equal(starts.length, 1, 'one new build, for the branch');
  assert.ok(starts[0].args.includes('ref=gitmargin-pages'), JSON.stringify(starts[0].args));
});

test('an empty project takes the pages branch as its default, and the next share is not refused', (t) => {
  const w = world(t, { project: { default_branch: null, empty_repo: true } });
  assert.equal(run(w, [attached(w, 'one', 'first'), '--folder', 'one']).code, 0);
  assert.equal(glabState(w).project.default_branch, BRANCH, 'GitLab made the first pushed branch the default');
  const r = run(w, [attached(w, 'one', 'changed', { version: 'v2-def456' }), '--folder', 'one']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /The gitmargin-pages branch is acme\/team\/site's default branch, because the project was empty when it was first published\./);
  assert.ok(!calls(w).some((c) => /repository\/files/.test(c.args[1] || '')), "gitmargin's own build file is not read as the author's");
});

test('addresses from GitLab are passed on only when they are web addresses', (t) => {
  const w = world(t, {
    failedJob: { reason: 'script_failure', log: 'ERROR\n' },
    pipelines: [{ id: 900, sha: 'TIP', ref: BRANCH, statuses: ['failed'], webUrl: 'javascript:alert(1)' }],
  });
  const r = run(w, [attached(w, 'one', 'first'), '--folder', 'one', '--json', '--wait', '5']);
  assert.equal(r.code, 2);
  assert.doesNotMatch(r.err, /javascript:/);
  assert.equal(JSON.parse(r.out).pipeline.url, null);
  setGlab(w, { pages: { url: 'file:///etc/passwd', deployments: [] } });
  const state = JSON.parse(run(w, ['--status', '--json']).out);
  assert.equal(state.pages.url, null);
});

test('a republish with --wait 0 prints the link and says it is not waiting', (t) => {
  const w = world(t);
  assert.equal(run(w, [attached(w, 'one', 'first'), '--folder', 'one']).code, 0);
  const r = run(w, [attached(w, 'one', 'changed', { version: 'v2-def456' }), '--folder', 'one', '--wait', '0']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, `${SITE}/one/\n`);
  assert.match(r.err, /Not waiting for GitLab to build the page\./);
});

// ---------------------------------------------------------------------------
// --status

test('--status reports the state, gives the verdict, and changes nothing', (t) => {
  const w = world(t, { project: { pages_access_level: 'enabled', shared_runners_enabled: false } });
  const needs = JSON.parse(run(w, ['--status', '--folder', 'one', '--json']).out);
  assert.equal(needs.host, 'gitlab');
  assert.equal(needs.project, PROJECT);
  assert.equal(needs.visibility, 'private');
  assert.equal(needs.role, 'Owner');
  assert.equal(needs.branchOnRemote, 'absent');
  // GitLab gives the address before anything is deployed; deployed says whether a site is up.
  assert.deepEqual(needs.pages, { access: 'enabled', deployed: false, url: SITE });
  assert.equal(needs.sharedRunners, false);
  assert.equal(needs.link, null);
  assert.equal(needs.publish, 'needs-enable');
  const plain = run(w, ['--status']);
  assert.equal(plain.code, 0, plain.err);
  assert.match(plain.out, /acme\/team\/site \(private\), you are Owner/);
  assert.match(plain.out, /ready once Pages is set to Only project members \(--enable\)/);
  assert.match(plain.out, /shared runners are off/);
  assertNothingChanged(w);

  setGlab(w, {});
  assert.equal(JSON.parse(run(w, ['--status', '--json']).out).publish, 'ready');
  setGlab(w, { project: { visibility: 'public' } });
  const refused = JSON.parse(run(w, ['--status', '--json']).out);
  assert.equal(refused.publish, 'refused');
  assert.match(refused.reason, /public project/);
  assertNothingChanged(w);
});

test('--status after a publish gives the link', (t) => {
  const w = world(t);
  assert.equal(run(w, [attached(w, 'one', 'first'), '--folder', 'one']).code, 0);
  const state = JSON.parse(run(w, ['--status', '--folder', 'one', '--json']).out);
  assert.equal(state.branchOnRemote, 'exists');
  assert.equal(state.pages.deployed, true);
  assert.equal(state.link, `${SITE}/one/`);
  assert.equal(state.publish, 'ready');
});
