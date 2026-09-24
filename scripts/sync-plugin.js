#!/usr/bin/env node
// Build the generated half of the Claude Code plugin in plugin/.
//
// Named sync-plugin, not build-plugin, on purpose: the toolkit's pre-push check
// treats any repository holding both .claude-plugin/marketplace.json and
// scripts/build-plugin.js as the toolkit itself, and runs that script its own
// way on every push, which fails here (review of #16, found at the push).
//
// Why the plugin carries copies at all: Claude Code copies an installed plugin
// into its own cache and does not let a plugin reach a file outside its own
// folder, so plugin/ cannot import ../bin/gitmargin.js or ../dist/gitmargin.js
// from this repo. And dist/ is ignored by git, so a clone has no built overlay
// until someone builds it. So the plugin carries its own copies, committed.
//
// The copies are NEVER edited by hand. Edit the source, then run
//
//   npm run build:plugin
//
// which builds the overlay and rewrites these four paths, and nothing else:
//
//   plugin/bin/gitmargin.js   <- bin/gitmargin.js
//   plugin/src/               <- src/cli/
//   plugin/dist/gitmargin.js  <- dist/gitmargin.js (the built overlay)
//   plugin/service/           <- service/, without service/tests/
//
// Everything else in plugin/ is hand-written: the manifest, package.json, the
// two launchers, skills/ and scripts/. This script never reads or touches them.
//
// Which files get copied comes from git, never from walking the folder: the
// files git tracks, plus new files git would pick up on the next `git add`,
// and never an ignored one. service/ sits next to service/.env.local (the real
// secrets), service/.vercel and node_modules, and whatever lands in plugin/
// is committed and installed on other people's machines. Asking git is the
// one list that already knows what must stay private.
//
// Usage
//   node scripts/sync-plugin.js              write the four generated paths
//   node scripts/sync-plugin.js --check      change nothing; exit 1 and list
//                                             every generated file that is
//                                             missing, changed, extra or ignored
//   --out <dir>                               build or check another folder
//                                             (the tests build into a temp one)
//
// Exit codes, as in src/cli/errors.js: 0 fine, 1 drift found or a usage
// mistake, 2 refused (no built overlay, not a git checkout, an unsafe --out).

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

export const EXIT_OK = 0;
export const EXIT_DRIFT = 1;
export const EXIT_USAGE = 1;
export const EXIT_REFUSED = 2;

/** The four paths inside the plugin folder this script owns, and only these. */
export const GENERATED = ['bin/gitmargin.js', 'src', 'dist', 'service'];

/** The overlay bundle: a build output, so git does not list it. */
const BUNDLE = 'dist/gitmargin.js';

export class BuildError extends Error {
  constructor(message, code = EXIT_REFUSED, hint = '') {
    super(message);
    this.name = 'BuildError';
    this.code = code;
    this.hint = hint;
  }
}

/** A git path ('a/b.js') as a path on this machine. */
const local = (gitPath) => gitPath.split('/').join(path.sep);

/** A path inside the plugin folder as git and humans write it ('src/cli/a.js'). */
const slashed = (rel) => rel.split(path.sep).join('/');

/**
 * The files git would commit under the source paths: tracked ones plus new
 * ones not yet added, never an ignored one.
 *
 * Why untracked files count: a new CLI file (src/cli/check.js, say) exists for
 * a while before its first commit, and bin/gitmargin.js already imports it.
 * Copying tracked files only would build a plugin whose command crashes on
 * start, with nothing saying why. What must stay out is what git ignores.
 */
function gitFiles(root, pathspecs) {
  let listing;
  try {
    listing = execFileSync(
      'git',
      ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...pathspecs],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (error) {
    const why = String(error.stderr || error.message).trim().split('\n')[0];
    throw new BuildError(`Could not list the source files with git: ${why}`, EXIT_REFUSED,
      'Run this from a git checkout of gitmargin; the file list has to come from git.');
  }
  return [...new Set(listing.split('\0').filter(Boolean))].sort();
}

/**
 * The source file behind one generated file, or null when git lists a file
 * that was deleted from disk and not yet committed (it should not ship).
 */
function sourceFile(root, gitPath) {
  const abs = path.join(root, local(gitPath));
  let stat;
  try {
    stat = lstatSync(abs);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  // A link could point anywhere on this machine, a home folder's keys
  // included, and reading it would copy the target into a folder that gets
  // committed. A directory here is a submodule. Neither belongs in a plugin.
  if (!stat.isFile()) {
    throw new BuildError(`${gitPath} is not a plain file (a link or a folder), so it is not copied into the plugin.`,
      EXIT_REFUSED, 'Replace it with a plain file, or move it out of the folders the plugin copies.');
  }
  return abs;
}

/**
 * Every generated file the plugin should hold, as a map from its path inside
 * the plugin folder to the source file it is a copy of. Sorted, so a build and
 * a check always walk the same list in the same order.
 */
export function expectedFiles(root = REPO) {
  const expected = new Map();
  for (const gitPath of gitFiles(root, ['bin/gitmargin.js', 'src/cli', 'service'])) {
    // The service's tests need the repo's dev dependencies and test helpers,
    // which the plugin does not carry, so a copy of them could never run.
    if (gitPath.startsWith('service/tests/')) continue;
    const abs = sourceFile(root, gitPath);
    if (abs) expected.set(local(gitPath), abs);
  }
  if (!expected.has(local('bin/gitmargin.js'))) {
    throw new BuildError('bin/gitmargin.js is missing, so the plugin would have no command to run.');
  }

  const bundle = path.join(root, local(BUNDLE));
  if (!existsSync(bundle)) {
    throw new BuildError(`${BUNDLE} is missing: the overlay has not been built.`, EXIT_REFUSED,
      'Run npm run build first, or npm run build:plugin, which does both.');
  }
  expected.set(local(BUNDLE), sourceFile(root, BUNDLE));

  return new Map([...expected].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** Every file now sitting inside the generated paths of `out`, as paths inside it. */
function presentFiles(out) {
  const found = [];
  const walk = (rel) => {
    const abs = path.join(out, rel);
    let stat;
    try {
      stat = lstatSync(abs);
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    if (stat.isDirectory()) {
      for (const name of readdirSync(abs)) walk(path.join(rel, name));
    } else {
      found.push(rel);
    }
  };
  for (const generated of GENERATED) walk(local(generated));
  return found.sort();
}

/**
 * The generated files git would ignore, when `out` is inside this checkout.
 *
 * A generated file git ignores is never committed, so a clone, and every
 * plugin install made from it, silently lacks it. dist/ is the case that
 * matters: the root .gitignore ignores every dist/ folder, and only the
 * `!plugin/dist/` exception keeps the plugin's overlay in git. Outside the
 * checkout (the tests' temp folders) git has no say, so nothing is reported.
 */
function ignoredFiles(root, out, rels) {
  const fromRoot = path.relative(root, out);
  if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) return [];
  const asGit = rels.map((rel) => slashed(path.join(fromRoot, rel)));
  // --no-index: judge by the ignore rules alone, so the answer does not depend
  // on what happens to be staged at the moment.
  const result = spawnSync('git', ['-C', root, 'check-ignore', '--no-index', '-z', '--stdin'], {
    input: asGit.map((p) => `${p}\0`).join(''),
    encoding: 'utf8',
  });
  if (result.status === 1) return []; // git's way of saying "none of them"
  if (result.status !== 0) {
    throw new BuildError(`git check-ignore failed: ${String(result.stderr).trim().split('\n')[0]}`);
  }
  const ignored = new Set(result.stdout.split('\0').filter(Boolean));
  return rels.filter((_, i) => ignored.has(asGit[i]));
}

/**
 * Compare `out` with what a build would write. Changes nothing.
 * @returns {{kind: 'missing'|'changed'|'extra'|'ignored', file: string}[]}
 */
export function checkPlugin(root = REPO, out = path.join(REPO, 'plugin')) {
  const expected = expectedFiles(root);
  const problems = [];
  for (const [rel, source] of expected) {
    const target = path.join(out, rel);
    let stat;
    try {
      stat = lstatSync(target);
    } catch (error) {
      if (error.code === 'ENOENT') {
        problems.push({ kind: 'missing', file: rel });
        continue;
      }
      throw error;
    }
    // A link or folder where a copy should be is drift too, even if what it
    // points at happens to hold the same bytes.
    if (!stat.isFile() || !readFileSync(target).equals(readFileSync(source))) {
      problems.push({ kind: 'changed', file: rel });
    }
  }
  for (const rel of presentFiles(out)) {
    if (!expected.has(rel)) problems.push({ kind: 'extra', file: rel });
  }
  for (const rel of ignoredFiles(root, out, [...expected.keys()])) {
    problems.push({ kind: 'ignored', file: rel });
  }
  return problems;
}

/**
 * Refuse to clear the generated paths of a folder that is not a plugin folder.
 *
 * A build deletes <out>/src, <out>/dist and <out>/service before copying. A
 * mistyped --out (`.`, `service`, a home folder) would therefore delete real
 * source, and service/ sits next to its .env.local. So the folder must be new,
 * empty, or already a plugin (it has .claude-plugin/plugin.json). The repo
 * root has only a marketplace file there, so `--out .` is refused.
 */
function assertSafeOut(out) {
  if (!existsSync(out)) return;
  if (!lstatSync(out).isDirectory()) {
    throw new BuildError(`${out} is a file, not a folder.`, EXIT_USAGE);
  }
  if (readdirSync(out).length === 0) return;
  if (existsSync(path.join(out, '.claude-plugin', 'plugin.json'))) return;
  throw new BuildError(
    `${out} is not a plugin folder (no .claude-plugin/plugin.json), so its src/, dist/ and service/ are not cleared.`,
    EXIT_REFUSED,
    'Build into plugin/ (the default), an empty folder, or a folder that already holds a plugin.',
  );
}

/**
 * Clear the four generated paths of `out` and copy them fresh.
 * @returns {number} how many files were written
 */
export function writePlugin(root = REPO, out = path.join(REPO, 'plugin')) {
  assertSafeOut(out);
  // Work out the whole list before deleting anything, so a refusal (no built
  // overlay, a link among the sources) leaves the folder exactly as it was.
  const expected = expectedFiles(root);
  for (const generated of GENERATED) rmSync(path.join(out, local(generated)), { recursive: true, force: true });
  for (const [rel, source] of expected) {
    const target = path.join(out, rel);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(source));
  }
  return expected.size;
}

/** How a problem's file is shown: relative to where the command was run. */
function shown(out, rel) {
  const abs = path.join(out, rel);
  const fromHere = path.relative(process.cwd(), abs);
  return slashed(fromHere.startsWith('..') ? abs : fromHere);
}

const USAGE = `sync-plugin - copy the CLI, the overlay and the service into plugin/

Usage
  node scripts/sync-plugin.js            write plugin/bin/gitmargin.js, plugin/src/,
                                          plugin/dist/ and plugin/service/
  node scripts/sync-plugin.js --check    change nothing; list drift and exit 1
    --out <dir>                           another plugin folder instead of plugin/

npm run build:plugin builds the overlay first, then runs this.`;

export function main(argv) {
  let check = false;
  let out = path.join(REPO, 'plugin');
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') check = true;
    else if (arg === '--out') {
      if (!argv[i + 1]) throw new BuildError('--out needs a folder.', EXIT_USAGE, USAGE);
      out = path.resolve(argv[(i += 1)]);
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${USAGE}\n`);
      return EXIT_OK;
    } else {
      throw new BuildError(`Unknown option: ${arg}`, EXIT_USAGE, USAGE);
    }
  }

  if (check) {
    const problems = checkPlugin(REPO, out);
    if (problems.length === 0) {
      process.stderr.write(`sync-plugin: ${shown(out, '.')} is in sync with its sources.\n`);
      return EXIT_OK;
    }
    // The drift list is the answer, so it goes to stdout, one file a line.
    for (const { kind, file } of problems) process.stdout.write(`${kind.padEnd(8)} ${shown(out, file)}\n`);
    const ignored = problems.some((p) => p.kind === 'ignored');
    process.stderr.write(
      `sync-plugin: ${problems.length} generated file(s) out of step. Run npm run build:plugin, then commit plugin/.\n` +
        (ignored ? 'An "ignored" file is one git would never commit: add an exception for it to .gitignore.\n' : ''),
    );
    return EXIT_DRIFT;
  }

  const count = writePlugin(REPO, out);
  process.stderr.write(`sync-plugin: wrote ${count} generated files into ${shown(out, '.')}.\n`);
  // A file git ignores would be written here and then never reach a clone,
  // so a build that produces one is not a success.
  const ignored = ignoredFiles(REPO, out, [...expectedFiles(REPO).keys()]);
  if (ignored.length > 0) {
    for (const file of ignored) process.stderr.write(`ignored  ${shown(out, file)}\n`);
    process.stderr.write('sync-plugin: git ignores the files above, so no clone would get them: add an exception to .gitignore.\n');
    return EXIT_DRIFT;
  }
  return EXIT_OK;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof BuildError)) throw error;
    process.stderr.write(`sync-plugin: ${error.message}\n`);
    if (error.hint) process.stderr.write(`${error.hint}\n`);
    process.exitCode = error.code;
  }
}
