#!/usr/bin/env node
// gitmargin-publish: put ONE attached prototype on GitHub Pages (issue #16,
// decisions D8 and D9 in plans/PLAN-issue-16.md).
//
//   gitmargin-publish <attached.html> --folder <name> [--repo <dir>] [--remote origin]
//                     [--branch gitmargin-pages] [--enable] [--wait <seconds>] [--json]
//   gitmargin-publish --status [--folder <name>] [--repo <dir>] [--remote origin]
//                     [--branch gitmargin-pages] [--json]
//
// The page goes to <folder>/index.html on a branch of its own, so every
// prototype in a project gets its own address under one Pages site and the
// author's own branches never carry a page key.
//
// Three promises shape this file.
//
// 1. Everything that can refuse runs BEFORE the push. A publish that stops
//    halfway (branch pushed, Pages not switched on) leaves the author with a
//    public branch and no link, which is the worst of both.
//
// 2. The author's checkout is never touched: not the working tree, not the
//    index, not HEAD, not a branch, uncommitted work included. The commit is
//    built in a temporary git worktree. That worktree has its own index and its
//    own FETCH_HEAD, which is the whole point of it: the author's index and
//    FETCH_HEAD are never written. The file goes in with plumbing (hash-object,
//    update-index, write-tree, commit-tree) rather than `git add` and
//    `git commit`, for two reasons. The bytes stay exactly the attached copy's,
//    whatever line-ending or filter settings the author's git has. And no commit
//    hook of the author's runs: their hooks lint their own code, which is not in
//    this commit, and a commit-message rule could refuse "Publish x for review".
//    The one mark left in the author's repository is git's own record of the
//    remote branch (refs/remotes/<remote>/gitmargin-pages), which every push
//    to a remote updates, plus the objects the commit is made of.
//
// 3. Nothing is changed on GitHub that the author did not agree to. A Pages
//    site that already serves something else is left alone, and Pages is only
//    switched on with --enable.
//
// It imports node: built-ins only. It runs from the plugin's folder on a
// machine where nothing was installed, and it must not lean on the generated
// copy of the CLI in plugin/src (plans/PLAN-issue-16.md, D1 and D3). Node 18 or
// later, like the rest of gitmargin.
//
// stdout carries the answer only (the link, the --status report, or the --json
// object); every note and error goes to stderr. Exit 0 ok, 1 usage, 2 refused,
// the same codes as src/cli/errors.js.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXIT_OK = 0;
export const EXIT_USAGE = 1;
export const EXIT_REFUSED = 2;

const DEFAULT_REMOTE = 'origin';
const DEFAULT_BRANCH = 'gitmargin-pages';
const DEFAULT_WAIT_SECONDS = 120;
const DEFAULT_POLL_MS = 5000;
// Used only when the repository has no git identity at all, so a first-time
// author is not stopped by "please tell me who you are". Not a GitHub noreply
// address on purpose: one of those could credit a stranger's account.
const FALLBACK_NAME = 'gitmargin';
const FALLBACK_EMAIL = 'gitmargin@localhost';

const USAGE = `gitmargin-publish - put one attached prototype on GitHub Pages

Usage
  gitmargin-publish <attached.html> --folder <name> [options]
      Commits the attached copy as <name>/index.html on the gitmargin-pages
      branch and pushes it, without touching your checkout. Prints the link.
  gitmargin-publish --status [--folder <name>] [options]
      Prints the repository's visibility, what Pages serves, and whether a
      publish would go ahead. Changes nothing.

Options
  --repo <dir>        the repository (default: the current directory)
  --remote <name>     the GitHub remote (default: origin)
  --branch <name>     the branch Pages serves (default: gitmargin-pages)
  --enable            switch GitHub Pages on for that branch when it is off.
                      This changes the repository's settings: only with the
                      author's agreement.
  --wait <seconds>    how long to follow GitHub's build (default: 120, 0 skips)
  --json              print a JSON object instead of the link

Needs git, and the GitHub CLI (gh) logged in with gh auth login. Only public
repositories: a Pages site is public to the whole internet even from a private
repository, and private repositories need a paid plan for it.

Exit codes
  0  success
  1  usage error
  2  refused, or GitHub refused`;

/** A message for a human, not a crash: printed without a stack trace. */
export class PublishError extends Error {
  constructor(message, code = EXIT_REFUSED, hint = '') {
    super(message);
    this.name = 'PublishError';
    this.code = code;
    this.hint = hint;
  }
}

// ---------------------------------------------------------------------------
// Pure rules, exported so the tests can check them without a repository.

/**
 * A folder name that is exactly one safe path segment.
 *
 * It becomes part of a path inside the branch and part of a public address,
 * so only letters, digits, dot, dash and underscore. It must start with a
 * letter or digit: a leading dot would make ".." or ".nojekyll" (the file this
 * script writes at the branch root) possible, and a leading dash could be read
 * as an option. No ".." anywhere, so no reading of it can climb out.
 */
export function isSafeFolder(name) {
  return typeof name === 'string' && name.length <= 100 && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && !name.includes('..');
}

/**
 * Branch and remote names reach git as arguments. One starting with a dash
 * would be read as an option (`--receive-pack=...` runs a program), so the
 * names are held to a plain shape before git ever sees them.
 */
const isPlainRemote = (name) => typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name);
const isPlainBranch = (name) =>
  typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name) && !name.includes('..') && !name.endsWith('/') && !name.endsWith('.lock');

/**
 * Owner and repository from a github.com remote, or null.
 *
 * Only github.com: the host must follow the scheme (and an optional user part)
 * directly, so github.com.example.net or example.net/github.com do not pass.
 * The remote URL itself is never printed anywhere, because an https remote can
 * carry a token in its user part.
 */
export function parseGitHubRemote(url) {
  const value = String(url || '').trim();
  const match =
    /^(?:https?|ssh|git):\/\/(?:[^@/]*@)?github\.com(?::\d+)?\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(value) ||
    /^(?:[^@/:]+@)?github\.com:\/?([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(value);
  if (!match) return null;
  const [, owner, repo] = match;
  if (!/^[A-Za-z0-9-]+$/.test(owner)) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(repo) || repo === '.' || repo === '..') return null;
  return { owner, repo };
}

/** The page's address: the site's address, then the folder, then a slash. */
export function pageLink(siteUrl, folder) {
  let url;
  try {
    url = new URL(String(siteUrl));
  } catch {
    return null;
  }
  // The address comes from GitHub's answer, and it is printed for the author
  // to open, so anything but a web address is not passed on.
  if (!/^https?:$/.test(url.protocol)) return null;
  const base = url.href.endsWith('/') ? url.href : `${url.href}/`;
  return `${base}${folder}/`;
}

/** The version stamp `gitmargin attach` writes into <head> (src/cli/attach.js). */
export function readStamp(html) {
  const tag = (name) =>
    (new RegExp(`<meta\\s+name=["']gitmargin-${name}["']\\s+content=(?:"([^"]*)"|'([^']*)')`, 'i').exec(html) || [])
      .slice(1)
      .find((v) => v) || null;
  return { versionId: tag('version'), service: tag('service') };
}

/** public, private or internal, from GitHub's answer about the repository. */
function visibilityOf(repo) {
  if (repo && typeof repo.visibility === 'string') return repo.visibility.toLowerCase();
  return repo && repo.private === false ? 'public' : 'private';
}

/**
 * Whether a publish may go ahead, decided from what GitHub said. Every refusal
 * here happens before the push (promise 1 at the top of this file).
 */
export function assess({ full, repo, pages }, { branch, enable }) {
  const visibility = visibilityOf(repo);
  if (visibility !== 'public') {
    return {
      blocked:
        `${full} is ${/^[aeiou]/.test(visibility) ? 'an' : 'a'} ${visibility} repository. A GitHub Pages site is public to the whole internet even from a ` +
        'private repository, and private repositories need a paid plan for it, so gitmargin publishes only from public ones.',
      hint: 'Share it with the service link or as a file instead.',
    };
  }
  if (pages && pages.build_type === 'workflow') {
    return {
      blocked: `GitHub Pages for ${full} is deployed by a GitHub Actions workflow. gitmargin leaves an existing site alone.`,
      hint: 'Share it with the service link or as a file instead.',
    };
  }
  if (pages && !servesBranch(pages, branch)) {
    return {
      blocked: `GitHub Pages for ${full} already serves ${describeSource(pages)}. gitmargin leaves an existing site alone.`,
      hint: 'Share it with the service link or as a file instead.',
    };
  }
  if (!pages && !enable) {
    return {
      blocked: `GitHub Pages is off for ${full}. Switching it on would change the repository's settings.`,
      hint: 'Rerun with --enable once the author agrees.',
    };
  }
  // `permissions` is in the answer only for a logged-in caller. When it is
  // there, a missing right is caught now rather than after a public push.
  const rights = repo && repo.permissions;
  if (!pages && rights && rights.admin === false) {
    return {
      blocked: `Switching GitHub Pages on needs admin rights on ${full}, and this gh login does not have them.`,
      hint: 'Ask an admin of the repository to switch Pages on for the branch, or share another way.',
    };
  }
  if (rights && rights.push === false) {
    return {
      blocked: `This gh login cannot push to ${full}.`,
      hint: 'Publish from a repository you can push to, or share another way.',
    };
  }
  return { blocked: null, hint: '', enableNow: !pages };
}

function servesBranch(pages, branch) {
  const source = pages && pages.source;
  return Boolean(source && source.branch === branch && (source.path || '/') === '/');
}

function describeSource(pages) {
  const source = pages && pages.source;
  if (!source || !source.branch) return 'another source';
  return `the ${source.branch} branch at ${source.path || '/'}`;
}

// ---------------------------------------------------------------------------
// Arguments

export function parseArgs(argv) {
  const opts = {
    file: null,
    folder: null,
    repo: process.cwd(),
    remote: DEFAULT_REMOTE,
    branch: DEFAULT_BRANCH,
    enable: false,
    status: false,
    wait: DEFAULT_WAIT_SECONDS,
    json: false,
    help: false,
  };
  const valued = { '--folder': 'folder', '--repo': 'repo', '--remote': 'remote', '--branch': 'branch', '--wait': 'wait' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const flag = eq > 0 ? arg.slice(0, eq) : arg;
    if (valued[flag]) {
      const value = eq > 0 ? arg.slice(eq + 1) : argv[++i];
      if (value === undefined) throw new PublishError(`${flag} needs a value.`, EXIT_USAGE, 'Try: gitmargin-publish --help');
      opts[valued[flag]] = value;
    } else if (flag === '--enable' || flag === '--status' || flag === '--json') {
      opts[flag.slice(2)] = true;
    } else if (flag === '--help' || flag === '-h') {
      opts.help = true;
    } else if (arg.startsWith('-') && arg !== '-') {
      throw new PublishError(`Unknown option: ${arg}`, EXIT_USAGE, 'Try: gitmargin-publish --help');
    } else if (opts.file === null) {
      opts.file = arg;
    } else {
      throw new PublishError('Give one attached file at a time.', EXIT_USAGE, 'Try: gitmargin-publish --help');
    }
  }
  if (!/^\d+$/.test(String(opts.wait))) {
    throw new PublishError(`--wait takes a whole number of seconds, not ${opts.wait}.`, EXIT_USAGE);
  }
  opts.wait = Number(opts.wait);
  if (!isPlainRemote(opts.remote)) throw new PublishError(`Not a remote name: ${opts.remote}`, EXIT_USAGE);
  if (!isPlainBranch(opts.branch)) throw new PublishError(`Not a branch name this command will use: ${opts.branch}`, EXIT_USAGE);
  return opts;
}

// ---------------------------------------------------------------------------
// Running git and gh

// Variables that tell git which repository, index or object store to use. A
// caller running inside a git hook has them set to the AUTHOR's repository,
// and `git -C <temporary worktree>` would then read and write the author's
// index after all. Everything this script runs names its folder with -C.
const GIT_LOCATION_VARS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_PREFIX',
  'GIT_NAMESPACE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_QUARANTINE_PATH',
];

function gitEnv() {
  const env = { ...process.env };
  for (const name of GIT_LOCATION_VARS) delete env[name];
  // Claude Code runs this without a terminal, where a username prompt would
  // wait forever. Credential helpers (gh auth setup-git, a keychain) still work.
  env.GIT_TERMINAL_PROMPT = '0';
  return env;
}

function git(cwd, args, { input, allowFail = false } = {}) {
  const result = spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    input,
    env: gitEnv(),
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    if (result.error.code === 'ENOENT') {
      throw new PublishError('git is not installed, or not on PATH.', EXIT_REFUSED, 'Install git and try again.');
    }
    throw new PublishError(`Could not run git: ${result.error.message}`, EXIT_REFUSED);
  }
  const answer = { code: result.status, out: result.stdout || '', err: result.stderr || '' };
  if (answer.code !== 0 && !allowFail) {
    // Named by its subcommand, not by a leading `-c user.name=...`.
    const command = args.find((arg, i) => !arg.startsWith('-') && args[i - 1] !== '-c') || 'command';
    throw new PublishError(`git ${command} failed: ${firstLines(answer.err) || `exit ${answer.code}`}`, EXIT_REFUSED);
  }
  return answer;
}

const firstLines = (text, n = 4) =>
  String(text || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(0, n)
    .join('\n');

function gh(args) {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    // No prompts, no pager and no "a new version is out" line mixed into the
    // JSON: this is read by a program, not a person at a terminal.
    env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', GH_PAGER: 'cat', NO_COLOR: '1' },
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) {
    if (result.error.code === 'ENOENT') {
      throw new PublishError(
        'The GitHub command line tool (gh) is not installed, or not on PATH.',
        EXIT_REFUSED,
        'Install it from https://cli.github.com, then run: gh auth login'
      );
    }
    throw new PublishError(`Could not run gh: ${result.error.message}`, EXIT_REFUSED);
  }
  return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}

/**
 * One GitHub API call through gh. Always names github.com, so a GH_HOST set for
 * a company's GitHub Enterprise cannot send these questions somewhere else.
 * Returns the parsed answer, or null for a 404 when `notFoundOk`.
 */
function api(endpoint, { method = 'GET', fields = [], notFoundOk = false } = {}) {
  const args = ['api', endpoint, '--hostname', 'github.com'];
  if (method !== 'GET') args.push('-X', method);
  for (const [key, value] of fields) args.push('-f', `${key}=${value}`);
  const result = gh(args);
  if (result.code === 0) {
    try {
      return JSON.parse(result.out);
    } catch {
      throw new PublishError(`gh gave an answer that is not JSON for ${endpoint}.`, EXIT_REFUSED);
    }
  }
  if (notFoundOk && isNotFound(result)) return null;
  const error = new PublishError(`GitHub said no to ${method} ${endpoint}: ${firstLines(result.err, 2) || `exit ${result.code}`}`, EXIT_REFUSED);
  error.notFound = isNotFound(result);
  throw error;
}

/** gh reports a 404 as "gh: Not Found (HTTP 404)", with GitHub's JSON on stdout. */
function isNotFound(result) {
  if (/\(HTTP 404\)/.test(result.err)) return true;
  try {
    return String(JSON.parse(result.out).status) === '404';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Reading the state, before anything changes

function readAttached(file) {
  let bytes;
  try {
    bytes = readFileSync(file);
  } catch {
    throw new PublishError(`Cannot read ${file}.`, EXIT_USAGE);
  }
  const stamp = readStamp(bytes.toString('utf8'));
  if (!stamp.versionId) {
    throw new PublishError(
      `${file} is not an attached copy: it has no gitmargin version stamp.`,
      EXIT_REFUSED,
      'Run gitmargin attach on the prototype first, and publish the .gitmargin.html copy it writes.'
    );
  }
  return { bytes, ...stamp };
}

function repoRoot(dir) {
  const result = git(dir, ['rev-parse', '--show-toplevel'], { allowFail: true });
  if (result.code !== 0) {
    throw new PublishError(`${dir} is not inside a git repository.`, EXIT_REFUSED, 'Use --repo <dir> to name the repository.');
  }
  return result.out.trim();
}

function githubTarget(root, remote) {
  // The URL as the author configured it, before git's own rewriting
  // (url.<base>.insteadOf), which `git remote get-url` would apply. If that is
  // not a github.com address, the rewritten one gets a second look, for authors
  // who use a short alias that expands to github.com.
  const raw = git(root, ['config', '--get', `remote.${remote}.url`], { allowFail: true });
  if (raw.code !== 0 || !raw.out.trim()) {
    throw new PublishError(`This repository has no remote named ${remote}.`, EXIT_REFUSED, 'Use --remote <name> to name the GitHub one.');
  }
  let target = parseGitHubRemote(raw.out.trim());
  if (!target) {
    const expanded = git(root, ['remote', 'get-url', remote], { allowFail: true });
    target = expanded.code === 0 ? parseGitHubRemote(expanded.out.trim()) : null;
  }
  if (!target) {
    throw new PublishError(
      `The ${remote} remote is not a GitHub repository, so there is no GitHub Pages site to publish to.`,
      EXIT_REFUSED,
      'Share it with the service link or as a file instead.'
    );
  }
  return { ...target, full: `${target.owner}/${target.repo}` };
}

function requireLogin() {
  const result = gh(['auth', 'status', '--hostname', 'github.com']);
  if (result.code !== 0) {
    throw new PublishError('The GitHub CLI (gh) is not logged in to github.com.', EXIT_REFUSED, 'Run: gh auth login');
  }
}

function readRepo(target) {
  try {
    return api(`repos/${target.full}`);
  } catch (error) {
    if (error.notFound) {
      throw new PublishError(`GitHub cannot find ${target.full}, or this gh login cannot see it.`, EXIT_REFUSED);
    }
    throw error;
  }
}

/** The commit the branch points at on the remote, or null when it is not there yet. */
function remoteTip(root, remote, branch) {
  const ref = `refs/heads/${branch}`;
  const result = git(root, ['ls-remote', '--exit-code', remote, ref], { allowFail: true });
  // --exit-code makes "no such ref" exit 2 and keeps a real failure (no
  // network, no access) apart from it: a failure must not read as "first
  // publish" and start a new branch over the old one.
  if (result.code === 2) return null;
  if (result.code !== 0) {
    throw new PublishError(`Could not read the ${remote} remote: ${firstLines(result.err, 2) || `exit ${result.code}`}`, EXIT_REFUSED);
  }
  // A pattern matches the END of a ref name, so a branch called
  // x/refs/heads/gitmargin-pages would match too. Only the exact name counts.
  const line = result.out.split('\n').find((l) => l.split('\t')[1] === ref);
  return line ? line.split('\t')[0] : null;
}

// ---------------------------------------------------------------------------
// The commit and the push, in a temporary worktree

function gitIdentity(root) {
  const has = (key) => {
    const r = git(root, ['config', '--get', key], { allowFail: true });
    return r.code === 0 && r.out.trim() !== '';
  };
  const args = [];
  if (!has('user.name')) args.push('-c', `user.name=${FALLBACK_NAME}`);
  if (!has('user.email')) args.push('-c', `user.email=${FALLBACK_EMAIL}`);
  if (args.length) {
    process.stderr.write(
      `No git user.name or user.email is set for this repository, so the publish commit is signed ${FALLBACK_NAME} <${FALLBACK_EMAIL}>.\n`
    );
  }
  return args;
}

/**
 * Build the commit in a temporary worktree and push it. Returns the commit the
 * branch now points at and whether anything was pushed.
 *
 * Synchronous from start to finish, so the cleanup in `finally` runs before
 * anything else can: the worktree and its folder are gone again whether the
 * push worked, GitHub refused it, or a git step failed.
 */
function publishCommit(root, opts, page, target, tip) {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'gitmargin-publish-'));
  const tree = path.join(temp, 'pages');
  let added = false;
  try {
    // --no-checkout: the author's files are not copied out; this worktree only
    // lends its private index. HEAD is just a place to stand, never a parent.
    git(root, ['worktree', 'add', '--detach', '--no-checkout', tree, 'HEAD']);
    added = true;

    let base = null;
    if (tip) {
      // Fetched from inside the worktree, so FETCH_HEAD is the worktree's own.
      git(tree, ['fetch', '--quiet', '--no-tags', opts.remote, `refs/heads/${opts.branch}`]);
      base = git(tree, ['rev-parse', '--verify', 'FETCH_HEAD^{commit}']).out.trim();
      git(tree, ['read-tree', base]);
    } else {
      // A first publish starts from nothing: the branch holds pages only,
      // never a copy of the author's project.
      git(tree, ['read-tree', '--empty']);
    }

    // --no-filters: the attached copy's exact bytes, whatever autocrlf or
    // attribute filters the author's git applies to their own files.
    const blob = git(tree, ['hash-object', '-w', '--no-filters', '--stdin'], { input: page.bytes }).out.trim();
    git(tree, ['update-index', '--add', '--cacheinfo', `100644,${blob},${opts.folder}/index.html`]);
    // .nojekyll tells GitHub to serve the files as they are, without a Jekyll
    // build. Always the same empty file, so a republish never shows it changed.
    const empty = git(tree, ['hash-object', '-w', '--no-filters', '--stdin'], { input: '' }).out.trim();
    git(tree, ['update-index', '--add', '--cacheinfo', `100644,${empty},.nojekyll`]);

    const treeId = git(tree, ['write-tree']).out.trim();
    if (base && treeId === git(tree, ['rev-parse', `${base}^{tree}`]).out.trim()) {
      return { commit: base, pushed: false };
    }

    const message = `Publish ${opts.folder} for review (${page.versionId})`;
    const commit = git(tree, [...gitIdentity(root), 'commit-tree', treeId, ...(base ? ['-p', base] : []), '-m', message]).out.trim();

    // Never forced: if someone else moved the branch since the fetch, GitHub
    // refuses and nothing of theirs is lost. --no-verify because the author's
    // pre-push hooks are written for their project, and would run here against
    // a branch that holds none of its files.
    const push = git(tree, ['push', '--quiet', '--no-verify', opts.remote, `${commit}:refs/heads/${opts.branch}`], { allowFail: true });
    if (push.code !== 0) {
      throw new PublishError(
        `The push to the ${opts.branch} branch of ${target.full} was refused, so nothing was published.\n${firstLines(push.err, 6)}`,
        EXIT_REFUSED,
        'Your own checkout is untouched. If someone else published at the same moment, run this again.'
      );
    }
    return { commit, pushed: true };
  } finally {
    if (added) {
      const removed = git(root, ['worktree', 'remove', '--force', tree], { allowFail: true });
      if (removed.code !== 0) {
        process.stderr.write(`Could not remove the temporary worktree ${tree}; git worktree prune clears it.\n`);
      }
    }
    try {
      rmSync(temp, { recursive: true, force: true });
    } catch {
      // A leftover empty folder in the system's temp area is not worth
      // replacing the real outcome with an error.
    }
  }
}

// ---------------------------------------------------------------------------
// After the push

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function pollInterval() {
  const value = Number(process.env.GITMARGIN_PUBLISH_POLL_MS);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_POLL_MS;
}

/**
 * Follow GitHub's build of THIS commit until it is built or errored, or the
 * time is up. "Latest build" can still be the previous publish's, already
 * built, for a few seconds after a push; taking that as done would hand out a
 * link that shows the old page, or a 404 on a first publish.
 */
async function waitForBuild(target, commit, seconds) {
  if (seconds <= 0) return { status: 'pending', error: null };
  const interval = pollInterval();
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    let build = null;
    try {
      build = api(`repos/${target.full}/pages/builds/latest`, { notFoundOk: true });
    } catch {
      // The page is already pushed; a failed look at the build is not a
      // failed publish. Try again on the next round.
    }
    if (build && (!build.commit || build.commit === commit)) {
      if (build.status === 'built') return { status: 'built', error: null };
      if (build.status === 'errored') {
        return { status: 'errored', error: (build.error && build.error.message) || 'GitHub did not say why.' };
      }
    }
    if (Date.now() + interval > deadline) return { status: 'pending', error: null };
    await sleep(interval);
  }
}

// ---------------------------------------------------------------------------
// The two modes

async function status(opts) {
  if (opts.folder !== null && !isSafeFolder(opts.folder)) throw unsafeFolder(opts.folder);
  const root = repoRoot(opts.repo);
  const target = githubTarget(root, opts.remote);
  requireLogin();
  const repo = readRepo(target);
  const pages = api(`repos/${target.full}/pages`, { notFoundOk: true });
  let branchState = 'unknown';
  try {
    branchState = remoteTip(root, opts.remote, opts.branch) ? 'exists' : 'absent';
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
  }
  let build = null;
  if (pages) {
    try {
      const latest = api(`repos/${target.full}/pages/builds/latest`, { notFoundOk: true });
      build = latest ? latest.status || null : null;
    } catch {
      // Status is a look, not a check: a missing build answer is left out.
    }
  }
  // Asked as if --enable were given, so "Pages is off" reads as "ready once it
  // is switched on" rather than as a refusal, while every other refusal
  // (visibility, another source, missing rights) still shows.
  const verdict = assess({ full: target.full, repo, pages }, { branch: opts.branch, enable: true });
  const ours = Boolean(pages) && servesBranch(pages, opts.branch);
  const report = {
    repo: target.full,
    visibility: visibilityOf(repo),
    remote: opts.remote,
    branch: opts.branch,
    branchOnRemote: branchState,
    pages: pages ? { branch: (pages.source && pages.source.branch) || null, path: (pages.source && pages.source.path) || null, buildType: pages.build_type || null, url: pages.html_url || null } : null,
    build,
    link: ours && opts.folder !== null ? pageLink(pages.html_url, opts.folder) : null,
    publish: verdict.blocked ? 'refused' : verdict.enableNow ? 'needs-enable' : 'ready',
    reason: verdict.blocked || null,
  };
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return EXIT_OK;
  }
  const lines = [
    `repository  ${report.repo} (${report.visibility})`,
    `pages       ${pages ? `serves ${describeSource(pages)}${report.pages.buildType === 'workflow' ? ' (through a GitHub Actions workflow)' : ''}${report.pages.url ? `, at ${report.pages.url}` : ''}` : 'off'}`,
    `branch      ${opts.branch} ${branchState === 'exists' ? `exists on ${opts.remote}` : branchState === 'absent' ? `is not on ${opts.remote} yet` : 'unknown'}`,
  ];
  if (build) lines.push(`build       ${build}`);
  if (report.link) lines.push(`link        ${report.link}`);
  lines.push(
    `publish     ${report.publish === 'ready' ? 'ready' : report.publish === 'needs-enable' ? 'ready once Pages is switched on (--enable)' : `refused: ${report.reason}`}`
  );
  process.stdout.write(`${lines.join('\n')}\n`);
  return EXIT_OK;
}

const unsafeFolder = (name) =>
  new PublishError(
    `Not a safe folder name: ${JSON.stringify(name)}.`,
    EXIT_REFUSED,
    'Use one name made of letters, digits, dot, dash and underscore, starting with a letter or digit, with no slash and no "..".'
  );

async function publish(opts) {
  if (opts.file === null) throw new PublishError('Name the attached copy to publish.', EXIT_USAGE, 'Try: gitmargin-publish <attached.html> --folder <name>');
  if (opts.folder === null) throw new PublishError('Name the folder it goes in with --folder <name>.', EXIT_USAGE);

  // Local checks first: they cost nothing and need no network.
  if (!isSafeFolder(opts.folder)) throw unsafeFolder(opts.folder);
  const page = readAttached(opts.file);
  const root = repoRoot(opts.repo);
  const target = githubTarget(root, opts.remote);
  if (git(root, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], { allowFail: true }).code !== 0) {
    // The temporary worktree needs a commit to stand on (it never becomes a
    // parent of the published commit).
    throw new PublishError('This repository has no commits yet.', EXIT_REFUSED, 'Commit once, then publish again.');
  }

  // Then GitHub's side: every refusal still comes before the push.
  requireLogin();
  const repo = readRepo(target);
  const pages = api(`repos/${target.full}/pages`, { notFoundOk: true });
  const verdict = assess({ full: target.full, repo, pages }, opts);
  if (verdict.blocked) throw new PublishError(verdict.blocked, EXIT_REFUSED, verdict.hint);

  if (!page.service) {
    process.stderr.write(
      "This copy was attached without --service, so each reviewer's comments stay in their own browser until they send the file back.\n"
    );
  }

  const tip = remoteTip(root, opts.remote, opts.branch);
  const { commit, pushed } = publishCommit(root, opts, page, target, tip);
  process.stderr.write(
    pushed
      ? `Published ${opts.folder} to the ${opts.branch} branch of ${target.full} (commit ${commit.slice(0, 7)}).\n`
      : `Nothing changed: ${opts.folder} on the ${opts.branch} branch already has these exact bytes.\n`
  );

  let site = pages;
  let enabled = false;
  if (verdict.enableNow) {
    // After the push, because GitHub will not point Pages at a branch that
    // does not exist yet.
    try {
      api(`repos/${target.full}/pages`, { method: 'POST', fields: [['source[branch]', opts.branch], ['source[path]', '/']] });
    } catch (error) {
      throw new PublishError(
        `The branch was pushed, but GitHub did not switch Pages on: ${error.message}`,
        EXIT_REFUSED,
        `Switch it on in the repository's Settings, Pages, for the ${opts.branch} branch, or rerun with --enable.`
      );
    }
    enabled = true;
    process.stderr.write(`Switched GitHub Pages on for ${target.full}, serving the ${opts.branch} branch.\n`);
    site = api(`repos/${target.full}/pages`, { notFoundOk: true });
  }
  const link = site ? pageLink(site.html_url, opts.folder) : null;
  if (!link) {
    throw new PublishError(`The page is pushed, but GitHub gave no address for the Pages site of ${target.full}.`, EXIT_REFUSED, 'Check again with --status in a minute.');
  }
  process.stderr.write(`Anyone on the internet can open this page: ${target.full} is a public repository.\n`);

  let build = { status: 'unchanged', error: null };
  if (pushed || enabled) {
    if (opts.wait > 0) {
      process.stderr.write(`Waiting up to ${opts.wait} seconds for GitHub to build the page. Until the first build finishes, the link can show a 404.\n`);
    } else {
      process.stderr.write('Not waiting for GitHub to build the page. Until the first build finishes, the link can show a 404.\n');
    }
    build = await waitForBuild(target, commit, opts.wait);
    if (build.status === 'built') process.stderr.write('GitHub has built the page.\n');
    if (build.status === 'pending' && opts.wait > 0) {
      process.stderr.write('GitHub has not finished building yet. The link can show a 404 for a few more minutes.\n');
    }
  }

  const result = {
    repo: target.full,
    branch: opts.branch,
    folder: opts.folder,
    commit,
    pushed,
    enabled,
    link,
    build: build.status,
    buildError: build.error,
  };
  if (build.status === 'errored') {
    // The branch is pushed but the site did not build: the link would not show
    // this page, so it is not printed as the answer. --json still reports the
    // state, so a caller can see what happened.
    if (opts.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    throw new PublishError(`GitHub could not build the Pages site: ${build.error}`, EXIT_REFUSED, 'The branch was pushed; fix the build on GitHub, then publish again.');
  }
  process.stdout.write(opts.json ? `${JSON.stringify(result, null, 2)}\n` : `${link}\n`);
  return EXIT_OK;
}

export async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    process.stdout.write(`${USAGE}\n`);
    return EXIT_OK;
  }
  return opts.status ? status(opts) : publish(opts);
}

// Run only when started as a program, so the tests can import the pure rules
// above without publishing anything.
const startedDirectly = (() => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (startedDirectly) {
  try {
    process.exitCode = (await main(process.argv.slice(2))) ?? EXIT_OK;
  } catch (error) {
    if (error instanceof PublishError) {
      process.stderr.write(`gitmargin-publish: ${error.message}\n`);
      if (error.hint) process.stderr.write(`${error.hint}\n`);
      process.exitCode = error.code;
    } else {
      throw error;
    }
  }
}
