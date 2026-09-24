// The host-free half of gitmargin-publish (issue #37): everything that is the
// same whether the page goes to GitHub Pages or GitLab Pages. Moved here from
// publish-branch.mjs when GitLab arrived, not rewritten; the GitHub half lives
// in publish-branch.mjs and the GitLab half in publish-gitlab.mjs.
//
// What lives here:
// - the errors and exit codes every host shares,
// - the name guards (folder, remote, branch) and argument parsing,
// - running git with the author's repository variables removed,
// - reading the attached copy and the remote's current tip,
// - building the publish commit in a temporary git worktree and pushing it.
//
// The commit is the part both hosts most depend on, and its promises are the
// ones at the top of publish-branch.mjs: the author's checkout is never
// touched (working tree, index, HEAD, branches, hooks), the files go in with
// plumbing so their bytes stay exact, and the push is never forced. Each host
// hands it its own list of files: GitHub `<folder>/index.html` and `.nojekyll`,
// GitLab `public/<folder>/index.html` and `.gitlab-ci.yml`.
//
// It imports node: built-ins only, like the rest of the publisher: it runs from
// the plugin's folder on a machine where nothing was installed.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const EXIT_OK = 0;
export const EXIT_USAGE = 1;
export const EXIT_REFUSED = 2;

export const DEFAULT_REMOTE = 'origin';
export const DEFAULT_BRANCH = 'gitmargin-pages';
const DEFAULT_POLL_MS = 5000;
// Used only when the repository has no git identity at all, so a first-time
// author is not stopped by "please tell me who you are". Not a GitHub noreply
// address on purpose: one of those could credit a stranger's account.
const FALLBACK_NAME = 'gitmargin';
const FALLBACK_EMAIL = 'gitmargin@localhost';

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

/** The version stamp `gitmargin attach` writes into <head> (src/cli/attach.js). */
export function readStamp(html) {
  const tag = (name) =>
    (new RegExp(`<meta\\s+name=["']gitmargin-${name}["']\\s+content=(?:"([^"]*)"|'([^']*)')`, 'i').exec(html) || [])
      .slice(1)
      .find((v) => v) || null;
  return { versionId: tag('version'), service: tag('service') };
}

export const unsafeFolder = (name) =>
  new PublishError(
    `Not a safe folder name: ${JSON.stringify(name)}.`,
    EXIT_REFUSED,
    'Use one name made of letters, digits, dot, dash and underscore, starting with a letter or digit, with no slash and no "..".'
  );

// ---------------------------------------------------------------------------
// Arguments

/**
 * The options, the same for both hosts. `wait` stays null when not given, so
 * each host applies its own default: GitHub's build is quick, GitLab's build
 * runs a pipeline and gets longer.
 */
export function parseArgs(argv) {
  const opts = {
    file: null,
    folder: null,
    repo: process.cwd(),
    remote: DEFAULT_REMOTE,
    branch: DEFAULT_BRANCH,
    enable: false,
    status: false,
    wait: null,
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
  if (opts.wait !== null) {
    if (!/^\d+$/.test(String(opts.wait))) {
      throw new PublishError(`--wait takes a whole number of seconds, not ${opts.wait}.`, EXIT_USAGE);
    }
    opts.wait = Number(opts.wait);
  }
  if (!isPlainRemote(opts.remote)) throw new PublishError(`Not a remote name: ${opts.remote}`, EXIT_USAGE);
  if (!isPlainBranch(opts.branch)) throw new PublishError(`Not a branch name this command will use: ${opts.branch}`, EXIT_USAGE);
  return opts;
}

// ---------------------------------------------------------------------------
// Running git

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

export function git(cwd, args, { input, allowFail = false } = {}) {
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

export const firstLines = (text, n = 4) =>
  String(text || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(0, n)
    .join('\n');

// ---------------------------------------------------------------------------
// Reading the state, before anything changes

export function readAttached(file) {
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

export function repoRoot(dir) {
  const result = git(dir, ['rev-parse', '--show-toplevel'], { allowFail: true });
  if (result.code !== 0) {
    throw new PublishError(`${dir} is not inside a git repository.`, EXIT_REFUSED, 'Use --repo <dir> to name the repository.');
  }
  return result.out.trim();
}

/**
 * The remote's address two ways: as the author configured it, and after git's
 * own rewriting (url.<base>.insteadOf), which `git remote get-url` applies.
 * Each host's parser tries the first, then the second, for authors who use a
 * short alias that expands to the host. Null when there is no such remote.
 * Neither address is ever printed: an https remote can carry a token.
 */
export function remoteUrls(root, remote) {
  const raw = git(root, ['config', '--get', `remote.${remote}.url`], { allowFail: true });
  if (raw.code !== 0 || !raw.out.trim()) return null;
  const expanded = git(root, ['remote', 'get-url', remote], { allowFail: true });
  return { raw: raw.out.trim(), expanded: expanded.code === 0 ? expanded.out.trim() : '' };
}

/** The commit the branch points at on the remote, or null when it is not there yet. */
export function remoteTip(root, remote, branch) {
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

/** The temporary worktree needs a commit to stand on (it never becomes a parent). */
export function requireCommits(root) {
  if (git(root, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], { allowFail: true }).code !== 0) {
    throw new PublishError('This repository has no commits yet.', EXIT_REFUSED, 'Commit once, then publish again.');
  }
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
 * `files` is the host's list of `{ path, bytes }` to write on top of the
 * branch's current tree (every other file on the branch stays, so a second
 * prototype keeps the first). `label` names the repository in messages.
 *
 * Synchronous from start to finish, so the cleanup in `finally` runs before
 * anything else can: the worktree and its folder are gone again whether the
 * push worked, the host refused it, or a git step failed.
 */
export function publishCommit(root, opts, { files, message, label }, tip) {
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

    // --no-filters: the exact bytes, whatever autocrlf or attribute filters
    // the author's git applies to their own files.
    for (const file of files) {
      const blob = git(tree, ['hash-object', '-w', '--no-filters', '--stdin'], { input: file.bytes }).out.trim();
      git(tree, ['update-index', '--add', '--cacheinfo', `100644,${blob},${file.path}`]);
    }

    const treeId = git(tree, ['write-tree']).out.trim();
    if (base && treeId === git(tree, ['rev-parse', `${base}^{tree}`]).out.trim()) {
      return { commit: base, pushed: false };
    }

    const commit = git(tree, [...gitIdentity(root), 'commit-tree', treeId, ...(base ? ['-p', base] : []), '-m', message]).out.trim();

    // Never forced: if someone else moved the branch since the fetch, the host
    // refuses and nothing of theirs is lost. --no-verify because the author's
    // pre-push hooks are written for their project, and would run here against
    // a branch that holds none of its files.
    const push = git(tree, ['push', '--quiet', '--no-verify', opts.remote, `${commit}:refs/heads/${opts.branch}`], { allowFail: true });
    if (push.code !== 0) {
      throw new PublishError(
        `The push to the ${opts.branch} branch of ${label} was refused, so nothing was published.\n${firstLines(push.err, 6)}`,
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
// Waiting on the host's build

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function pollInterval() {
  const value = Number(process.env.GITMARGIN_PUBLISH_POLL_MS);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_POLL_MS;
}
