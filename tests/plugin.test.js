// The Claude Code plugin (issue #16): scripts/sync-plugin.js and the package it
// builds in plugin/.
//
// Run by node:test. Three groups:
//   - the build and its --check, on this repo's real sources, built into temp
//     folders so the committed plugin/ is never touched;
//   - the build's safety rules, on small fake repos made per test, because
//     only a fake repo can hold a planted secret, a link or a missing overlay
//     without putting the real ones at risk;
//   - the plugin as an author gets it: copied to a folder outside the repo and
//     run by name through its sh launcher.
// And one test on the committed plugin/ itself, marked where it is.
//
// Every CLI run sets GITMARGIN_CONFIG_DIR to a temp folder, as the other CLI
// tests do, so nothing here reads or writes ~/.config/gitmargin.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BuildError, checkPlugin, expectedFiles, writePlugin } from '../scripts/sync-plugin.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SCRIPT = path.join(ROOT, 'scripts', 'sync-plugin.js');
const PLUGIN = path.join(ROOT, 'plugin');
const LAUNCHER = path.join(PLUGIN, 'bin', 'gitmargin');

/** Run the build script and hand back everything a caller might assert on. */
function build(args, options = {}) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: ROOT, ...options });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

/** A scratch directory that cleans itself up. */
function scratch(t, prefix = 'gitmargin-plugin-') {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Write a file, making its folders. */
function put(root, rel, text) {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
}

/** Every file under `dir`, as slash paths relative to it. */
function filesUnder(dir) {
  const found = [];
  const walk = (rel) => {
    for (const entry of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(child);
      else found.push(child);
    }
  };
  walk('');
  return found.sort();
}

/**
 * True for a path that must never reach the plugin: an .env file, the .vercel
 * folder (a project link) or node_modules. Whole path segments only, because
 * service/.vercelignore is a real file the deploy needs.
 */
const isPrivatePath = (rel) =>
  rel.split('/').some((segment) => segment.startsWith('.env') || segment === '.vercel' || segment === 'node_modules');

/** A fresh plugin build of this repo's sources, in a temp folder outside it. */
function freshBuild(t) {
  const out = path.join(scratch(t), 'plugin');
  const result = build(['--out', out]);
  assert.equal(result.code, 0, `the build failed:\n${result.err}`);
  return out;
}

// ------------------------------------------------ build and --check, real sources

test('a fresh build passes --check, and prints nothing on stdout', (t) => {
  const out = freshBuild(t);
  const result = build(['--check', '--out', out]);
  assert.equal(result.code, 0, result.out + result.err);
  assert.equal(result.out, '');
  // The four generated paths, and only those, were written.
  const top = new Set(filesUnder(out).map((rel) => rel.split('/')[0]));
  assert.deepEqual([...top].sort(), ['bin', 'dist', 'service', 'src']);
  assert.deepEqual(filesUnder(path.join(out, 'bin')), ['gitmargin.js']);
  assert.deepEqual(filesUnder(path.join(out, 'dist')), ['gitmargin.js']);
});

test('--check names a changed generated file, and repairs nothing', (t) => {
  const out = freshBuild(t);
  const file = path.join(out, 'src', 'cli', 'errors.js');
  writeFileSync(file, `${readFileSync(file, 'utf8')}\n// edited by hand\n`);
  const result = build(['--check', '--out', out]);
  assert.equal(result.code, 1);
  assert.match(result.out, /^changed\s+\S*src\/cli\/errors\.js$/m);
  assert.match(readFileSync(file, 'utf8'), /edited by hand/, '--check must change nothing');
});

test('--check names a missing generated file', (t) => {
  const out = freshBuild(t);
  rmSync(path.join(out, 'dist', 'gitmargin.js'));
  const result = build(['--check', '--out', out]);
  assert.equal(result.code, 1);
  assert.match(result.out, /^missing\s+\S*dist\/gitmargin\.js$/m);
});

test('--check names an extra file inside any generated path', (t) => {
  const out = freshBuild(t);
  put(out, 'src/cli/old-command.js', 'export {};\n');
  put(out, 'service/stray.txt', 'left behind\n');
  put(out, 'dist/old.js', '\n');
  const result = build(['--check', '--out', out]);
  assert.equal(result.code, 1);
  assert.match(result.out, /^extra\s+\S*src\/cli\/old-command\.js$/m);
  assert.match(result.out, /^extra\s+\S*service\/stray\.txt$/m);
  assert.match(result.out, /^extra\s+\S*dist\/old\.js$/m);
});

test('hand-written files are never checked or touched, and a rebuild clears stale generated files', (t) => {
  const out = freshBuild(t);
  const handWritten = {
    '.claude-plugin/plugin.json': '{"name":"gitmargin"}\n',
    'package.json': '{"type":"module"}\n',
    'bin/gitmargin': '#!/bin/sh\n',
    'bin/gitmargin-publish': '#!/bin/sh\n',
    'skills/share/SKILL.md': '# share\n',
    'scripts/publish-branch.mjs': '// hand-written\n',
  };
  for (const [rel, text] of Object.entries(handWritten)) put(out, rel, text);
  assert.equal(build(['--check', '--out', out]).code, 0, 'a hand-written file is not drift');

  put(out, 'src/cli/old-command.js', 'export {};\n');
  const rebuilt = build(['--out', out]);
  assert.equal(rebuilt.code, 0, rebuilt.err);
  assert.equal(existsSync(path.join(out, 'src', 'cli', 'old-command.js')), false, 'a rebuild starts the generated paths clean');
  for (const [rel, text] of Object.entries(handWritten)) {
    assert.equal(readFileSync(path.join(out, rel), 'utf8'), text, `${rel} must survive a rebuild untouched`);
  }
});

test('a build of this repo copies no .env, .vercel or node_modules path, and no service tests', (t) => {
  const out = freshBuild(t);
  const files = filesUnder(out);
  assert.deepEqual(files.filter(isPrivatePath), []);
  assert.deepEqual(files.filter((rel) => rel.startsWith('service/tests/')), []);
  // The service still has what a deploy needs.
  for (const rel of ['service/package.json', 'service/vercel.json', 'service/.vercelignore', 'service/api/index.js']) {
    assert.ok(files.includes(rel), `${rel} should be in the plugin`);
  }
});

test('an unknown option is a usage error', () => {
  const result = build(['--chek']);
  assert.equal(result.code, 1);
  assert.match(result.err, /Unknown option: --chek/);
});

// ---------------------------------------------- the build's rules, on fake repos

/**
 * A small repo shaped like this one, with the files a careless copy would
 * pick up: a secret, a Vercel link, installed packages and the service tests.
 */
function fakeRepo(t, { bundle = true, gitignore = 'node_modules/\n.env*\n.vercel/\ndist/\n!plugin/dist/\n' } = {}) {
  const root = scratch(t, 'gitmargin-fake-repo-');
  execFileSync('git', ['-c', 'init.defaultBranch=main', 'init', '-q', root]);
  put(root, '.gitignore', gitignore);
  put(root, 'bin/gitmargin.js', "import '../src/cli/a.js';\n");
  put(root, 'src/cli/a.js', 'export const a = 1;\n');
  put(root, 'service/package.json', '{}\n');
  put(root, 'service/src/router.js', 'export {};\n');
  put(root, 'service/tests/router.test.js', '// needs the repo test helpers\n');
  put(root, 'service/.env.local', 'GITMARGIN_SECRET=not-a-real-secret\n');
  put(root, 'service/.vercel/project.json', '{}\n');
  put(root, 'service/node_modules/pkg/index.js', '\n');
  if (bundle) put(root, 'dist/gitmargin.js', '/* overlay */\n');
  execFileSync('git', ['-C', root, 'add', '-A']);
  // Written after the add, so git sees it as new and not yet tracked.
  put(root, 'src/cli/new-command.js', 'export const b = 2;\n');
  return root;
}

/** An existing plugin folder with one earlier generated file in it. */
function earlierPlugin(t) {
  const out = path.join(scratch(t), 'plugin');
  put(out, '.claude-plugin/plugin.json', '{"name":"gitmargin"}\n');
  put(out, 'src/cli/earlier.js', '// from an earlier build\n');
  return out;
}

test('fake repo: only files git would commit are copied, new ones included, ignored ones and service tests never', (t) => {
  const root = fakeRepo(t);
  const out = path.join(scratch(t), 'plugin');
  writePlugin(root, out);
  assert.deepEqual(filesUnder(out), [
    'bin/gitmargin.js',
    'dist/gitmargin.js',
    'service/package.json',
    'service/src/router.js',
    'src/cli/a.js',
    'src/cli/new-command.js',
  ]);
  assert.deepEqual(checkPlugin(root, out), []);
});

test('fake repo: a link among the sources is refused, and the plugin folder is left as it was', (t) => {
  const root = fakeRepo(t);
  const outside = put(scratch(t), 'private-key', 'not for the plugin\n');
  symlinkSync(outside, path.join(root, 'src', 'cli', 'linked.js'));
  const out = earlierPlugin(t);
  assert.throws(() => writePlugin(root, out), (error) => {
    assert.ok(error instanceof BuildError, String(error));
    assert.equal(error.code, 2);
    assert.match(error.message, /src\/cli\/linked\.js is not a plain file/);
    return true;
  });
  assert.equal(existsSync(path.join(out, 'src', 'cli', 'earlier.js')), true, 'a refusal deletes nothing');
});

test('fake repo: a build refuses when the overlay has not been built, and deletes nothing', (t) => {
  const root = fakeRepo(t, { bundle: false });
  const out = earlierPlugin(t);
  assert.throws(() => writePlugin(root, out), (error) => {
    assert.ok(error instanceof BuildError, String(error));
    assert.equal(error.code, 2);
    assert.match(error.message, /dist\/gitmargin\.js is missing/);
    assert.match(error.hint, /npm run build/);
    return true;
  });
  assert.equal(existsSync(path.join(out, 'src', 'cli', 'earlier.js')), true);
  assert.throws(() => expectedFiles(root), BuildError, '--check refuses the same way');
});

test('fake repo: a build refuses to clear a folder that is not a plugin folder', (t) => {
  const root = fakeRepo(t);
  // `--out .` from the repo root: src/, dist/ and service/ there are the real source.
  assert.throws(() => writePlugin(root, root), (error) => error instanceof BuildError && error.code === 2);
  assert.equal(existsSync(path.join(root, 'src', 'cli', 'a.js')), true, 'the source must survive');
  assert.equal(existsSync(path.join(root, 'service', '.env.local')), true, 'and the secret next to it');

  const someFolder = scratch(t);
  put(someFolder, 'src/notes.txt', 'mine\n');
  assert.throws(() => writePlugin(root, someFolder), BuildError);
  assert.equal(existsSync(path.join(someFolder, 'src', 'notes.txt')), true);
});

test('fake repo: a generated file that git would ignore inside the checkout is reported', (t) => {
  // Without the !plugin/dist/ exception, dist/ ignores the plugin's overlay
  // too: it would never be committed, and no install would have it.
  const without = fakeRepo(t, { gitignore: 'node_modules/\n.env*\n.vercel/\ndist/\n' });
  writePlugin(without, path.join(without, 'plugin'));
  assert.deepEqual(checkPlugin(without, path.join(without, 'plugin')), [{ kind: 'ignored', file: path.join('dist', 'gitmargin.js') }]);

  const withException = fakeRepo(t);
  writePlugin(withException, path.join(withException, 'plugin'));
  assert.deepEqual(checkPlugin(withException, path.join(withException, 'plugin')), []);
});

// ------------------------------------------------ the plugin as an author gets it

/**
 * Whether this Node can switch off its guess that a .js file with `import` is
 * ESM. Node 22 and later guess; Node 18 and 20 do not, and read .js as
 * CommonJS unless package.json says "type": "module". Switching the guess off
 * makes this machine behave like the oldest Node the plugin promises to run on.
 */
const NO_ESM_GUESS = spawnSync(process.execPath, ['--no-experimental-detect-module', '-e', '0']).status === 0
  ? '--no-experimental-detect-module'
  : '';

test('the plugin runs from a folder outside the repo, by name, through its sh launcher', (t) => {
  const base = scratch(t);
  assert.ok(path.relative(ROOT, base).startsWith('..'), 'the temp folder must be outside the repo');

  const plugin = path.join(base, 'plugin');
  const built = build(['--out', plugin]);
  assert.equal(built.code, 0, built.err);
  // The hand-written half an install also carries.
  copyFileSync(path.join(PLUGIN, 'package.json'), path.join(plugin, 'package.json'));
  copyFileSync(LAUNCHER, path.join(plugin, 'bin', 'gitmargin'));

  const work = path.join(base, 'project');
  mkdirSync(work);
  const original = readFileSync(path.join(ROOT, 'fixtures', 'onboarding.html'));
  writeFileSync(path.join(work, 'onboarding.html'), original);

  const env = {
    ...process.env,
    PATH: `${path.join(plugin, 'bin')}${path.delimiter}${process.env.PATH}`,
    GITMARGIN_CONFIG_DIR: path.join(base, 'config'),
    NODE_OPTIONS: NO_ESM_GUESS,
  };
  // By bare name, from the author's project folder: PATH finds the launcher.
  const gitmargin = (args, pathValue = env.PATH) => {
    const result = spawnSync('gitmargin', args, { cwd: work, env: { ...env, PATH: pathValue }, encoding: 'utf8' });
    return { code: result.status, out: result.stdout, err: result.stderr, error: result.error };
  };

  const help = gitmargin(['help']);
  assert.equal(help.error, undefined, String(help.error));
  assert.equal(help.code, 0, help.err);
  assert.match(help.out, /gitmargin/);

  const attached = gitmargin(['attach', 'onboarding.html']);
  assert.equal(attached.code, 0, attached.err);
  const copy = path.join(work, 'onboarding.gitmargin.html');
  assert.equal(existsSync(copy), true, 'the attached copy is written next to the original');
  assert.match(attached.out, /onboarding\.gitmargin\.html/);
  assert.ok(readFileSync(path.join(work, 'onboarding.html')).equals(original), 'the original is untouched');

  // A copy nobody has commented on has nothing to pull (pull says so, exit 1),
  // so add the comment block a reviewer's "Send to author" writes into it.
  const envelope = {
    gitmargin: '0.1',
    file: 'onboarding.html',
    version_id: 'v1-aaa111',
    exported_at: '2026-09-23T10:00:00Z',
    reviewer: { name: 'Priya' },
    viewport: { width: 1440, height: 900 },
    comments: [{ id: 'c_plugin', intent: { text: 'Expected a back button.', tag: 'bug' }, anchor: {}, state: {}, status: 'open' }],
  };
  const block = `<script type="application/json" id="gitmargin-comments">\n${JSON.stringify(envelope).replace(/</g, () => '\\u003c')}\n</script>\n`;
  const html = readFileSync(copy, 'utf8');
  const end = html.lastIndexOf('</body>');
  assert.ok(end > 0, 'the attached copy has a </body>');
  writeFileSync(copy, html.slice(0, end) + block + html.slice(end));

  const pulled = gitmargin(['pull', 'onboarding.gitmargin.html']);
  assert.equal(pulled.code, 0, pulled.err);
  const batch = JSON.parse(pulled.out);
  assert.deepEqual(batch.comments.map((c) => c.id), ['c_plugin']);

  // Reached through a link, absolute or relative, the launcher still finds
  // the gitmargin.js beside the real file, not beside the link. A relative
  // link resolves from the link's own folder: base/links-xxx/../plugin.
  for (const target of [path.join(plugin, 'bin', 'gitmargin'), path.join('..', 'plugin', 'bin', 'gitmargin')]) {
    const links = mkdtempSync(path.join(base, 'links-'));
    symlinkSync(target, path.join(links, 'gitmargin'));
    const viaLink = gitmargin(['help'], `${links}${path.delimiter}${process.env.PATH}`);
    assert.equal(viaLink.code, 0, `through a link to ${target}: ${viaLink.err}`);
  }
});

test('the launcher says what it needs when node is not on PATH', (t) => {
  const bin = path.join(scratch(t), 'bin');
  mkdirSync(bin);
  // Only the one outside tool the launcher calls, so node cannot be found.
  const dirnameTool = execFileSync('/bin/sh', ['-c', 'command -v dirname'], { encoding: 'utf8' }).trim();
  symlinkSync(dirnameTool, path.join(bin, 'dirname'));
  const result = spawnSync('/bin/sh', [LAUNCHER, 'help'], { env: { PATH: bin }, encoding: 'utf8' });
  assert.equal(result.status, 127);
  assert.match(result.stderr, /needs Node\.js 18 or later/);
});

// --------------------------------------------------- the hand-written files

test('the launcher is a POSIX sh script git records as executable', () => {
  const text = readFileSync(LAUNCHER, 'utf8');
  assert.equal(text.split('\n')[0], '#!/bin/sh');
  assert.equal(text.includes('\r'), false, 'a carriage return breaks sh');
  assert.ok(statSync(LAUNCHER).mode & 0o111, 'executable on disk');
  const staged = execFileSync('git', ['-C', ROOT, 'ls-files', '-s', '--', 'plugin/bin/gitmargin'], { encoding: 'utf8' });
  // Before its first `git add` there is no recorded mode to read; from then on
  // it must be 100755, or an install gets a launcher that cannot run.
  if (staged) assert.match(staged, /^100755 /, 'git must record the launcher as executable');
});

test('the plugin root has package.json with "type": "module" and no lockfile', () => {
  // "type": "module" is what lets Node 18 and 20 read the CLI's import syntax.
  // No lockfile: Claude Code runs npm ci at install only when the plugin root
  // holds one, and the plugin must install nothing.
  assert.deepEqual(JSON.parse(readFileSync(path.join(PLUGIN, 'package.json'), 'utf8')), {
    name: 'gitmargin-plugin',
    private: true,
    type: 'module',
  });
  for (const lockfile of ['package-lock.json', 'npm-shrinkwrap.json', 'bun.lock', 'bun.lockb', 'yarn.lock', 'pnpm-lock.yaml']) {
    assert.equal(existsSync(path.join(PLUGIN, lockfile)), false, `plugin/${lockfile} would make Claude Code install packages`);
  }
});

test('the marketplace lists the plugin by the name its manifest gives', () => {
  const manifest = JSON.parse(readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'));
  const marketplace = JSON.parse(readFileSync(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.equal(manifest.name, 'gitmargin');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(marketplace.name, 'gitmargin');
  assert.deepEqual(
    marketplace.plugins.map((p) => [p.name, p.source]),
    [['gitmargin', './plugin']],
  );
});

// -------------------------------------------- THE COMMITTED plugin/ IS IN SYNC
//
// This one reads the real plugin/ folder, not a temp build. It compares it with
// a build of the current tree, so it passes whenever plugin/ was regenerated
// after the last edit to bin/, src/cli/, service/ or the overlay, and fails the
// moment a source changes without `npm run build:plugin`. It also fails when git
// would ignore a generated file, as it would plugin/dist/ without the exception
// in .gitignore. The message names every file and says what to run.

test('the committed plugin/ matches a build of the current tree (run npm run build:plugin if not)', () => {
  const result = build(['--check']);
  assert.equal(result.code, 0, `plugin/ is out of step with its sources:\n${result.out}${result.err}`);
});
