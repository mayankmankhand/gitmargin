// The setup command (issue #36): src/cli/setup.js, which plugin/scripts/setup.mjs
// runs in the author's own terminal.
//
// Run in this process through runSetup, with the terminal, the answers and the
// messages stood in for, and with the real program runner against a stand-in
// `vercel` (tests/helpers/fake-vercel.cjs) first on a PATH built for the test.
// That PATH holds the stand-ins and git, and nothing else: this machine has a
// real vercel and a real npx, and a test must never reach a real account, so
// every world checks where `vercel` and `npx` resolve before it runs.
//
// The "deployed" service is the in-process comment service. Its secret is
// whatever the stand-in's last deploy took from the project's settings, so a
// passing proof here means what it means for real: the service holds the
// secret this computer has.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeSecret, runProgram, runSetup } from '../src/cli/setup.js';
import { CliError } from '../src/cli/errors.js';
import { startService } from './helpers/service-server.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FAKE = path.join(ROOT, 'tests', 'helpers', 'fake-vercel.cjs');
const GIT_DIR = path.dirname(execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim());
const RIGHT = 'a-secret-the-service-already-holds-0123456';
const OTHER = 'a-different-secret-this-computer-holds-0123';

const where = (name, PATH) => {
  try {
    return execFileSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8', env: { PATH } }).trim();
  } catch {
    return null;
  }
};

/**
 * A scratch world: a settings folder, the stand-in vercel (or only npx), the
 * in-process service, and an io whose answers are scripted.
 */
async function world(t, { state = {}, answers = [], env = {}, vercel = 'direct', secret, profile } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gitmargin-setup-'));
  const config = path.join(dir, 'config');
  const bin = path.join(dir, 'bin');
  const home = path.join(dir, 'home');
  for (const folder of [bin, home]) mkdirSync(folder);
  const stateFile = path.join(dir, 'vercel-state.json');
  const service = await startService({ secret: () => JSON.parse(readFileSync(stateFile, 'utf8')).live || '' });
  const before = process.env.GITMARGIN_CONFIG_DIR;
  process.env.GITMARGIN_CONFIG_DIR = config;
  t.after(async () => {
    if (before === undefined) delete process.env.GITMARGIN_CONFIG_DIR;
    else process.env.GITMARGIN_CONFIG_DIR = before;
    await service.close();
    rmSync(dir, { recursive: true, force: true });
  });

  if (vercel === 'direct') writeFileSync(path.join(bin, 'vercel'), `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" "$@"\n`);
  else writeFileSync(path.join(bin, 'npx'), `#!/bin/sh\n[ "$1" = "--yes" ] && shift\n[ "$1" = "vercel@59" ] && shift\nFAKE_VERCEL_VIA=npx exec "${process.execPath}" "${FAKE}" "$@"\n`);
  for (const name of readdirSync(bin)) chmodSync(path.join(bin, name), 0o755);
  const PATH = [bin, GIT_DIR].join(path.delimiter);
  // The stand-ins are the only vercel and npx this world can reach.
  for (const name of ['vercel', 'npx']) {
    const found = where(name, PATH);
    assert.ok(found === null || found.startsWith(bin), `${name} resolves outside the stand-ins: ${found}`);
  }

  writeFileSync(stateFile, JSON.stringify({ loggedIn: true, username: 'author', team: null, projects: [], neon: [], env: {}, live: '', alias: service.url, calls: [], ...state }));
  if (secret !== undefined) {
    mkdirSync(config, { recursive: true, mode: 0o700 });
    writeFileSync(path.join(config, 'secret'), secret, { mode: 0o600 });
  }
  if (profile) writeFileSync(path.join(home, '.bashrc'), profile);

  const said = [];
  const asked = [];
  const io = {
    env: { PATH, HOME: home, FAKE_VERCEL_STATE: stateFile, ...env },
    stdinIsTTY: true,
    stdoutIsTTY: true,
    say: (text) => said.push(text),
    ask: async (question) => {
      asked.push(question);
      return answers.length ? answers.shift() : false;
    },
    // 'pipe' keeps the stand-in's "interactive" output out of the test report.
    run: (command, args, options) => runProgram(command, args, { ...options, interactiveStdio: 'pipe' }),
    serviceSource: path.join(ROOT, 'plugin', 'service'),
    home,
  };
  const vercelState = () => JSON.parse(readFileSync(stateFile, 'utf8'));
  const secretPath = path.join(config, 'secret');
  return {
    dir,
    config,
    service,
    io,
    said,
    asked,
    vercelState,
    calls: () => vercelState().calls.map((c) => c.args.slice(0, 2).join(' ')),
    secretPath,
    secretText: () => readFileSync(secretPath, 'utf8'),
    trusted: () => {
      const file = path.join(config, 'trusted-services.json');
      return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
    },
  };
}

/** runSetup's refusal, or a failure if it did not refuse. */
async function refusal(io) {
  try {
    await runSetup(io);
  } catch (error) {
    assert.ok(error instanceof CliError, `not a CliError: ${error && error.stack}`);
    return error;
  }
  assert.fail('setup ran where it had to refuse');
}

// ---------------------------------------------------------------------------
// Who may run it

test('without a terminal, or with an agent marker, it refuses before running anything', async (t) => {
  const w = await world(t);
  for (const io of [
    { ...w.io, stdinIsTTY: false },
    { ...w.io, stdoutIsTTY: false },
    ...['CLAUDECODE', 'CLAUDE_CODE', 'AI_AGENT'].map((name) => ({ ...w.io, env: { ...w.io.env, [name]: '1' } })),
  ]) {
    const error = await refusal(io);
    assert.equal(error.code, 1);
    assert.match(`${error.message}\n${error.hint}`, /own terminal/);
  }
  assert.deepEqual(w.vercelState().calls, [], 'Vercel was run');
  assert.equal(existsSync(w.secretPath), false);
});

test('the no-terminal refusal names PowerShell only on Windows itself, never to a WSL or Mac author', async (t) => {
  const w = await world(t);
  const elsewhere = await refusal({ ...w.io, stdinIsTTY: false, platform: 'linux' });
  assert.doesNotMatch(elsewhere.hint, /PowerShell/);
  assert.match(elsewhere.hint, /same kind Claude Code runs in \(on Windows with WSL, the WSL Ubuntu terminal\)/);
  const windows = await refusal({ ...w.io, stdinIsTTY: false, platform: 'win32' });
  assert.match(windows.hint, /PowerShell or Windows Terminal/);
});

test("a variable that would steer Vercel's tool elsewhere is refused by name", async (t) => {
  const w = await world(t);
  for (const name of ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID', 'CI']) {
    const error = await refusal({ ...w.io, env: { ...w.io.env, [name]: 'x' } });
    assert.equal(error.code, 1);
    assert.match(error.message, new RegExp(`^${name} is set`));
    assert.match(error.hint, new RegExp(`unset ${name}`));
  }
  assert.deepEqual(w.vercelState().calls, []);
});

test('a settings folder inside a git repository is refused, since Vercel would connect it', async (t) => {
  const w = await world(t);
  const repo = path.join(w.dir, 'repo');
  execFileSync('git', ['init', '-q', repo]);
  process.env.GITMARGIN_CONFIG_DIR = path.join(repo, 'gitmargin');
  const error = await refusal(w.io);
  assert.match(error.message, /inside a git repository/);
  assert.deepEqual(w.vercelState().calls, []);
});

// ---------------------------------------------------------------------------
// A first-time author

test('a first-time author: login, one yes, and the service is set up, deployed and proven', async (t) => {
  const w = await world(t, {
    state: { loggedIn: false },
    answers: [true],
    // gitmargin's own variables must not reach Vercel's tool (the Neon step runs downloaded code).
    env: { GITMARGIN_SERVICE: 'https://elsewhere.example', GITMARGIN_VERCEL_BYPASS: 'not-for-vercel' },
  });
  assert.equal(await runSetup(w.io), 0);

  const state = w.vercelState();
  assert.deepEqual(w.calls().slice(0, 4), ['--version', 'whoami --json', 'login', 'whoami --json']);
  assert.equal(w.asked.length, 1, `one question: ${w.asked.join(' | ')}`);
  assert.match(w.said.join('\n'), /non-commercial use/);

  // The secret: made here, private, 43 characters, and handed to Vercel once, from standard input.
  assert.equal(statSync(w.secretPath).mode & 0o777, 0o600);
  assert.match(w.secretText(), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(state.env['gitmargin-comments'].GITMARGIN_SECRET, w.secretText());
  const adds = state.calls.filter((c) => c.args[0] === 'env' && c.args[1] === 'add');
  assert.equal(adds.length, 1);
  assert.ok(!adds[0].args.includes(w.secretText()), 'the secret was on a command line');

  // The project, the database without its password pulled into a file, and the deploy from the fresh copy.
  const link = state.calls.find((c) => c.args[0] === 'link');
  assert.deepEqual(link.args, ['link', '--yes', '--project', 'gitmargin-comments']);
  const neon = state.calls.find((c) => c.args[0] === 'integration' && c.args[1] === 'add');
  assert.ok(neon.args.includes('--no-env-pull'));
  assert.ok(!neon.args.includes('-n'), 'no name given, so no name can collide');
  assert.equal(state.deployedFrom, path.join(w.config, 'service'));
  assert.ok(existsSync(path.join(w.config, 'service', 'api', 'index.js')));

  // Proven and remembered, and nothing of gitmargin's reached Vercel's tool.
  assert.deepEqual(w.trusted(), [w.service.url]);
  for (const call of state.calls) assert.deepEqual(call.seen, [], `${call.args.join(' ')} saw ${call.seen.join(', ')}`);
  // Vercel's own "upgrade now?" question never interrupts the setup (it appeared in the #36 walk, answered yes by Enter).
  for (const call of state.calls) assert.equal(call.quiet, true, `${call.args.join(' ')} could ask to upgrade Vercel's tool`);
  assert.match(w.said.at(-1), /Done\. Your comment service is at http:\/\/127\.0\.0\.1:\d+/);
  assert.match(w.said.at(-1), /type \/gitmargin:share/);
});

test('saying no to the account changes nothing', async (t) => {
  const w = await world(t, { answers: [false] });
  assert.equal(await runSetup(w.io), 0);
  assert.deepEqual(w.calls(), ['--version', 'whoami --json']);
  assert.equal(existsSync(w.secretPath), false);
  assert.match(w.said.at(-1), /Nothing was changed/);
});

test('running it again touches no secret, keeps the project and the database, and deploys the fresh service', async (t) => {
  const w = await world(t, { answers: [true, true] });
  assert.equal(await runSetup(w.io), 0);
  const secret = w.secretText();
  const changed = statSync(w.secretPath).mtimeMs;

  // An edit in the deployed copy, and a file the service does not have: neither may reach the live address.
  const copy = path.join(w.config, 'service');
  writeFileSync(path.join(copy, 'api', 'index.js'), '// edited by someone\n');
  writeFileSync(path.join(copy, 'api', 'extra.js'), '// not part of the service\n');

  assert.equal(await runSetup(w.io), 0);
  const state = w.vercelState();
  assert.equal(w.secretText(), secret);
  assert.equal(statSync(w.secretPath).mtimeMs, changed, 'the secret file was rewritten');
  assert.equal(state.calls.filter((c) => c.args[0] === 'env' && c.args[1] === 'add').length, 1, 'the secret was given twice');
  assert.equal(state.calls.filter((c) => c.args[0] === 'link').length, 1);
  assert.equal(state.calls.filter((c) => c.args[0] === 'integration' && c.args[1] === 'add').length, 1);
  assert.equal(state.deploys, 2);
  assert.deepEqual(readFileSync(path.join(copy, 'api', 'index.js')), readFileSync(path.join(ROOT, 'plugin', 'service', 'api', 'index.js')));
  assert.equal(existsSync(path.join(copy, 'api', 'extra.js')), false);
  assert.ok(existsSync(path.join(copy, '.vercel', 'project.json')), "Vercel's link was kept");
  assert.equal(w.asked.length, 2, 'a re-run asks only about the account');
});

test('an existing project is reused only on a yes; otherwise the next free name is taken', async (t) => {
  const listed = [{ name: 'gitmargin-comments', latestProductionUrl: 'https://gitmargin-comments-example.vercel.app' }, { name: 'gitmargin-comments-2' }];
  const no = await world(t, { state: { projects: listed }, answers: [true, false] });
  assert.equal(await runSetup(no.io), 0);
  assert.match(no.asked[1], /already have a Vercel project named gitmargin-comments \(https:\/\/gitmargin-comments-example\.vercel\.app\)/);
  assert.deepEqual(no.vercelState().calls.find((c) => c.args[0] === 'link').args.slice(-1), ['gitmargin-comments-3']);

  const yes = await world(t, { state: { projects: listed, env: { 'gitmargin-comments': {} } }, answers: [true, true] });
  assert.equal(await runSetup(yes.io), 0);
  assert.deepEqual(yes.vercelState().calls.find((c) => c.args[0] === 'link').args.slice(-1), ['gitmargin-comments']);
});

// ---------------------------------------------------------------------------
// Secrets that do not match

test('a service holding another secret: "no" changes nothing, "yes" keeps the old file and makes a new one', async (t) => {
  const existing = { projects: [{ name: 'gitmargin-comments' }], env: { 'gitmargin-comments': { GITMARGIN_SECRET: RIGHT } } };
  const no = await world(t, { state: existing, answers: [true, true, false], secret: OTHER });
  const error = await refusal(no.io);
  assert.match(error.message, /left with the secret it has/);
  assert.match(no.asked[2], /Make a new secret\?/);
  assert.equal(no.secretText(), OTHER, 'the secret file was changed');
  assert.equal(no.vercelState().env['gitmargin-comments'].GITMARGIN_SECRET, RIGHT, "the service's secret was changed");
  assert.deepEqual(no.trusted(), []);

  const yes = await world(t, { state: existing, answers: [true, true, true], secret: OTHER });
  assert.equal(await runSetup(yes.io), 0);
  const aside = readdirSync(yes.config).filter((n) => n.startsWith('secret.old-'));
  assert.equal(aside.length, 1, 'the old secret file was not kept');
  assert.equal(readFileSync(path.join(yes.config, aside[0]), 'utf8'), OTHER);
  assert.notEqual(yes.secretText(), OTHER);
  assert.equal(yes.vercelState().env['gitmargin-comments'].GITMARGIN_SECRET, yes.secretText());
  assert.ok(yes.vercelState().calls.some((c) => c.args[0] === 'env' && c.args.includes('--force')));
  assert.deepEqual(yes.trusted(), [yes.service.url]);
});

test("a service whose secret is too short, or a short secret file, is offered a new one", async (t) => {
  const weak = await world(t, {
    state: { projects: [{ name: 'gitmargin-comments' }], env: { 'gitmargin-comments': { GITMARGIN_SECRET: 'short-hand-typed-secret' } } },
    answers: [true, true, true],
    secret: RIGHT,
  });
  assert.equal(await runSetup(weak.io), 0);
  assert.match(weak.said.join('\n'), /secret is shorter than 32 characters/);
  assert.equal(weak.vercelState().env['gitmargin-comments'].GITMARGIN_SECRET, weak.secretText());

  const shortFile = await world(t, { answers: [true, true], secret: 'only-twenty-chars-xx' });
  assert.equal(await runSetup(shortFile.io), 0);
  assert.match(shortFile.said.join('\n'), /secret file holds a secret shorter than 32 characters/);
  assert.match(shortFile.secretText(), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(readdirSync(shortFile.config).filter((n) => n.startsWith('secret.old-')).length, 1);
});

test('a secret file this computer already has is what the new service is given, unchanged', async (t) => {
  const w = await world(t, { answers: [true], secret: RIGHT });
  assert.equal(await runSetup(w.io), 0);
  assert.equal(w.secretText(), RIGHT);
  assert.equal(w.vercelState().env['gitmargin-comments'].GITMARGIN_SECRET, RIGHT);
  assert.deepEqual(w.trusted(), [w.service.url]);
});

test('a different GITMARGIN_SECRET in this terminal is not "Done": it says the line must go, and to restart once', async (t) => {
  const w = await world(t, { answers: [true], secret: RIGHT, env: { GITMARGIN_SECRET: OTHER }, profile: 'export GITMARGIN_SECRET="an-old-value-typed-long-ago-0123456789"\n' });
  assert.equal(await runSetup(w.io), 0);
  assert.equal(w.vercelState().env['gitmargin-comments'].GITMARGIN_SECRET, RIGHT, 'the service got the file, not the terminal');
  const last = w.said.at(-1);
  assert.doesNotMatch(last, /^\s*Done\./m);
  assert.match(last, /this terminal also sets GITMARGIN_SECRET, to a different secret/);
  assert.match(last, /it is in .*\.bashrc/);
  assert.match(last, /start Claude Code again/);
  assert.ok(!last.includes(OTHER) && !last.includes(RIGHT), 'no secret is printed');

  // The same value in the terminal and the file is no reason to stop.
  const same = await world(t, { answers: [true], secret: RIGHT, env: { GITMARGIN_SECRET: RIGHT } });
  assert.equal(await runSetup(same.io), 0);
  assert.match(same.said.at(-1), /Done\./);
});

test('a new secret is never written over an existing file', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gitmargin-make-secret-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'secret');
  writeFileSync(file, RIGHT, { mode: 0o600 });
  assert.throws(() => makeSecret(file), { code: 'EEXIST' });
  assert.equal(readFileSync(file, 'utf8'), RIGHT);
  const fresh = path.join(dir, 'fresh', 'secret');
  assert.match(makeSecret(fresh), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(statSync(fresh).mode & 0o777, 0o600);
});

test('a secret file other people can read is refused, with the fix, before Vercel is given anything', async (t) => {
  const w = await world(t, { answers: [true] });
  mkdirSync(w.config, { recursive: true });
  writeFileSync(w.secretPath, RIGHT, { mode: 0o644 });
  chmodSync(w.secretPath, 0o644);
  const error = await refusal(w.io);
  assert.match(error.message, /chmod 600/);
  assert.equal(w.vercelState().calls.filter((c) => c.args[0] === 'env' || c.args[0] === 'deploy').length, 0);
});

test('the clone route: a secret only in GITMARGIN_SECRET is saved to the file once the service proves it holds it', async (t) => {
  const existing = { projects: [{ name: 'gitmargin-comments' }], env: { 'gitmargin-comments': { GITMARGIN_SECRET: RIGHT } } };
  const right = await world(t, { state: existing, answers: [true, true], env: { GITMARGIN_SECRET: RIGHT }, profile: 'export GITMARGIN_SECRET="$(cat ~/.config/gitmargin/secret)"\n' });
  assert.equal(await runSetup(right.io), 0);
  assert.equal(right.secretText(), RIGHT);
  assert.equal(statSync(right.secretPath).mode & 0o777, 0o600);
  assert.match(right.said.at(-1), /\.bashrc still exports GITMARGIN_SECRET/);

  const wrong = await world(t, { state: existing, answers: [true, true, false], env: { GITMARGIN_SECRET: OTHER } });
  await refusal(wrong.io);
  assert.equal(existsSync(wrong.secretPath), false, 'a value the service did not prove was saved');
});

// ---------------------------------------------------------------------------
// The database, and Vercel's tool itself

test('the database is added once, and a failure there says what to do', async (t) => {
  const attached = await world(t, { state: { neon: [{ name: 'neon-1', projects: ['gitmargin-comments'] }] }, answers: [true] });
  assert.equal(await runSetup(attached.io), 0);
  assert.equal(attached.vercelState().calls.filter((c) => c.args[0] === 'integration' && c.args[1] === 'add').length, 0);

  const failing = await world(t, { state: { neonFails: true }, answers: [true] });
  const error = await refusal(failing.io);
  assert.match(error.message, /database step did not finish/);
  assert.match(error.hint, /Run this command again/);
  assert.equal(failing.vercelState().deploys, undefined, 'it deployed without a database');
});

test("with Vercel's tool not installed, it is fetched through npx, pinned", async (t) => {
  const w = await world(t, { vercel: 'npx', answers: [true] });
  assert.equal(where('vercel', w.io.env.PATH), null, 'this proves nothing if vercel is on the PATH');
  assert.equal(await runSetup(w.io), 0);
  const calls = w.vercelState().calls;
  assert.ok(calls.length > 5);
  assert.ok(calls.every((c) => c.via === 'npx'));
  assert.match(w.said.join('\n'), /through npx \(vercel@59\)/);
});

// ---------------------------------------------------------------------------
// The line the share skill hands over

test('services prints the setup line, pointing at a file that exists, in a clone and in an installed plugin', async (t) => {
  const run = (cli, config) =>
    new Promise((resolve) =>
      execFile(process.execPath, [cli, 'services', '--json'], { env: { ...process.env, GITMARGIN_CONFIG_DIR: config } }, (error, out) =>
        resolve(JSON.parse(out))
      )
    );
  const scratch = mkdtempSync(path.join(tmpdir(), 'gitmargin-setup-line-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));

  const clone = await run(path.join(ROOT, 'bin', 'gitmargin.js'), scratch);
  assert.equal(clone.setupCommand, `node "${path.join(ROOT, 'plugin', 'scripts', 'setup.mjs')}"`);

  // The plugin as an author gets it: a folder of its own, somewhere else.
  const installed = path.join(scratch, 'plugin cache', 'gitmargin', '0.2.0');
  cpSync(path.join(ROOT, 'plugin'), installed, { recursive: true });
  const plugin = await run(path.join(installed, 'bin', 'gitmargin.js'), scratch);
  const script = path.join(installed, 'scripts', 'setup.mjs');
  assert.equal(plugin.setupCommand, `node "${script}"`, 'a path with a space stays one argument in double quotes');
  assert.ok(existsSync(script));

  // Run as the author would, from a shell with no terminal: it refuses, and says where to run it.
  const refused = await runProgram(process.execPath, [script], { env: { PATH: process.env.PATH, HOME: scratch, GITMARGIN_CONFIG_DIR: scratch } });
  assert.equal(refused.code, 1);
  assert.match(refused.err, /Run this in your own terminal window/);
});
