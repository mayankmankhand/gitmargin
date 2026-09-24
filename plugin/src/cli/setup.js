// gitmargin's setup command (issue #36): the one command an author runs in
// their own terminal to set up their comment service, or to deploy a newer one
// after a plugin update. It replaces four hand-over moments, about nine
// permission prompts and a restart.
//
// It runs as `node "<plugin>/scripts/setup.mjs"`, never as a `gitmargin`
// subcommand: the share skill lets Claude run any `gitmargin ...` command
// without asking, and this one deploys to a live address and writes a secret,
// which Claude Code does not do on its own. For the same reason it refuses to
// run without a terminal, or with Claude Code's own marker in the environment.
// Both checks are speed bumps, not locks (`script` can fake a terminal,
// measured 2026-09-24). What protects the author secret is the proof of trust
// in live.js, which no terminal trick can answer.
//
// It never destroys a secret. The secret file is written only where there is
// none, the service is given one only when it has none, and a new secret
// replaces either only after the author says yes, with the old file kept.

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { CliError, EXIT_OK, EXIT_REFUSED, EXIT_USAGE } from './errors.js';
import { cleanAddress, configDir, proveService, readSecretFile, secretFile, secretShapeProblem, serviceFiles } from './live.js';

/** Set when an agent, not a person, is at the keyboard. Claude Code sets CLAUDECODE; Vercel's tool reads all three. */
const AGENT_VARS = ['CLAUDECODE', 'CLAUDE_CODE', 'AI_AGENT'];
/** Each makes Vercel's tool use something other than the author's own login and choices. */
const VERCEL_OVERRIDES = {
  VERCEL_TOKEN: 'Vercel would use that token instead of your own login, which could be another account.',
  VERCEL_ORG_ID: 'Vercel would use that team instead of asking.',
  VERCEL_PROJECT_ID: 'Vercel would use that project instead of your comment service.',
  CI: 'Vercel would not show its login or its questions.',
};
const PROJECT = 'gitmargin-comments';
const VERCEL_PINNED = 'vercel@59';
const PROFILES = ['.bashrc', '.zshrc', '.profile', '.bash_profile'];

// ---------------------------------------------------------------------------
// Running programs

/**
 * Run a program and wait for it. `interactive` hands it the terminal (a login,
 * a team choice, Neon's terms); `progress` keeps what it prints on standard
 * output and shows the rest; `capture` keeps both; `stdin-file` feeds it a
 * file on standard input, so a secret never appears in a command line.
 * Answers { code, missing, out, err }; `missing` means no such program.
 */
export function runProgram(command, args, { cwd, env, mode = 'capture', stdinFile, interactiveStdio = 'inherit' } = {}) {
  return new Promise((resolve) => {
    let fd = null;
    let stdio;
    if (mode === 'interactive') stdio = interactiveStdio;
    else if (mode === 'progress') stdio = ['ignore', 'pipe', interactiveStdio === 'inherit' ? 'inherit' : 'pipe'];
    else if (mode === 'stdin-file') {
      fd = openSync(stdinFile, 'r');
      stdio = [fd, 'pipe', 'pipe'];
    } else stdio = ['ignore', 'pipe', 'pipe'];
    let out = '';
    let err = '';
    let settled = false;
    const finish = (answer) => {
      if (settled) return;
      settled = true;
      if (fd !== null) closeSync(fd);
      resolve({ out, err, ...answer });
    };
    const child = spawn(command, args, { cwd, env, stdio });
    if (child.stdout) child.stdout.on('data', (chunk) => (out += chunk));
    if (child.stderr) child.stderr.on('data', (chunk) => (err += chunk));
    child.on('error', (error) => finish({ code: null, missing: error.code === 'ENOENT' }));
    child.on('close', (code) => finish({ code, missing: false }));
  });
}

/** Yes or no, in the author's terminal. Anything but y or yes is no. */
export async function askInTerminal(question) {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await prompt.question(`${question} [y/N] `)).trim());
  } finally {
    prompt.close();
  }
}

/** The environment Vercel's tool runs in: without agent markers, and without gitmargin's own secrets. */
function childEnv(env) {
  const clean = {};
  for (const [name, value] of Object.entries(env)) {
    if (AGENT_VARS.includes(name) || name.startsWith('GITMARGIN_')) continue;
    clean[name] = value;
  }
  return clean;
}

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Pieces

/** The project this folder is already linked to, from Vercel's own link file. */
function linkedProject(folder) {
  const link = parseJson(existsSync(path.join(folder, '.vercel', 'project.json')) ? readFileSync(path.join(folder, '.vercel', 'project.json'), 'utf8') : '');
  return link && typeof link.projectName === 'string' ? link.projectName : null;
}

/**
 * Make the deployed copy exactly the service that came with this command:
 * every file copied fresh, and any file the service no longer has removed, so
 * an edit made in the copy never reaches the live address. Vercel's link, the
 * environment files and the Neon installer's guide files are left alone
 * (serviceFiles in live.js skips them).
 */
function syncService(source, dest) {
  mkdirSync(dest, { recursive: true, mode: 0o700 });
  const wanted = new Set(serviceFiles(source));
  for (const rel of wanted) {
    mkdirSync(path.dirname(path.join(dest, rel)), { recursive: true });
    copyFileSync(path.join(source, rel), path.join(dest, rel));
  }
  for (const rel of serviceFiles(dest)) if (!wanted.has(rel)) rmSync(path.join(dest, rel));
}

/**
 * A new secret in a new file: 32 random bytes, 43 characters, readable by the
 * author alone. Never over an existing file: the flow only calls this where
 * there is none, and the 'wx' flag keeps that true if the flow ever changes.
 */
export function makeSecret(file) {
  const value = randomBytes(32).toString('base64url');
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, value, { flag: 'wx', mode: 0o600 });
  chmodSync(file, 0o600);
  return value;
}

/** A secret from GITMARGIN_SECRET that has the shape of one (the command line's own rule), or null. */
function envSecret(env) {
  const value = env.GITMARGIN_SECRET;
  return value && !secretShapeProblem(value, 'GITMARGIN_SECRET') ? value : null;
}

/** A profile file that still exports GITMARGIN_SECRET, the way the old setup told authors to. */
function oldExportLine(home) {
  for (const name of PROFILES) {
    try {
      if (/GITMARGIN_SECRET=/.test(readFileSync(path.join(home, name), 'utf8'))) return path.join(home, name);
    } catch {
      // No such file: nothing to say.
    }
  }
  return null;
}

async function ping(address) {
  let response;
  try {
    response = await fetch(`${address}/api/ping`, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  } catch {
    throw new CliError(`Could not reach ${address}.`, EXIT_REFUSED, 'A new deployment can take a moment. Run this command again: it skips what is already done.');
  }
  const body = parseJson(await response.text());
  if (response.status === 200 && body && body.ok) return;
  if (response.status === 503) {
    throw new CliError('The service is up, but its database is not connected yet.', EXIT_REFUSED, 'Run this command again: it connects the database if it is missing.');
  }
  throw new CliError(
    `${address} did not answer as a comment service (it answered ${response.status}).`,
    EXIT_REFUSED,
    "Open the project in Vercel: its protection may be on for this address, or the deploy did not finish. Then run this command again."
  );
}

// ---------------------------------------------------------------------------
// The command

/**
 * @param {object} io everything the command touches, so a test can stand in for it:
 *   env, stdinIsTTY, stdoutIsTTY, say(line), ask(question) -> boolean,
 *   run(command, args, options) -> {code, missing, out, err} (runProgram),
 *   serviceSource (the service folder that came with this command), home.
 */
export async function runSetup(io) {
  const { env, say, ask, run, serviceSource } = io;
  const home = io.home || os.homedir();
  const platform = io.platform || process.platform;

  // -- Who is at the keyboard, and what Vercel would use
  if (!io.stdinIsTTY || !io.stdoutIsTTY) {
    throw new CliError(
      'Run this in your own terminal window, not through Claude Code or a script.',
      EXIT_USAGE,
      'It deploys your comment service and handles its secret, which Claude Code does not do on its own.\n' +
        (platform === 'win32'
          ? 'Run it in PowerShell or Windows Terminal: Git Bash does not show it a terminal.'
          : 'Open a terminal window of the same kind Claude Code runs in (on Windows with WSL, the WSL Ubuntu terminal) and run it there.')
    );
  }
  const agent = AGENT_VARS.find((name) => env[name]);
  if (agent) {
    throw new CliError(
      `This terminal is running inside an agent (${agent} is set).`,
      EXIT_USAGE,
      'Open your own terminal window and run the same line there.'
    );
  }
  const override = Object.keys(VERCEL_OVERRIDES).find((name) => env[name]);
  if (override) {
    throw new CliError(`${override} is set in this terminal. ${VERCEL_OVERRIDES[override]}`, EXIT_USAGE, `Run: unset ${override}\nThen run this again. Nothing was changed.`);
  }
  if (!existsSync(path.join(serviceSource, 'api', 'index.js'))) {
    throw new CliError(`The comment service that came with this command is missing from ${serviceSource}.`, EXIT_REFUSED, 'Reinstall the gitmargin plugin, then run this again.');
  }
  const dir = configDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const repo = await run('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { env: childEnv(env) });
  if (repo.code === 0) {
    throw new CliError(
      `gitmargin's settings folder, ${dir}, is inside a git repository (${repo.out.trim()}).`,
      EXIT_REFUSED,
      'Vercel would connect that repository to your comment service and deploy it on every push.\n' +
        'Point GITMARGIN_CONFIG_DIR at a folder outside any repository, and run this again. Nothing was changed.'
    );
  }

  // -- Vercel's own tool: installed, or fetched for this run
  const base = childEnv(env);
  const installed = await run('vercel', ['--version'], { env: base });
  const [command, prefix] = installed.missing ? ['npx', ['--yes', VERCEL_PINNED]] : ['vercel', []];
  if (installed.missing) say(`Vercel's command-line tool is not installed, so this uses it through npx (${VERCEL_PINNED}).`);
  const vercel = async (args, options = {}) => {
    const answer = await run(command, [...prefix, ...args], { env: base, ...options });
    if (answer.missing) throw new CliError('Neither vercel nor npx is installed.', EXIT_REFUSED, 'Install Node.js 18 or newer (it brings npx), then run this again.');
    return answer;
  };

  // -- The account
  let who = await vercel(['whoami', '--json']);
  if (who.code !== 0) {
    say('Logging in to Vercel: a page opens in your browser (or open the address shown below).');
    await vercel(['login'], { mode: 'interactive' });
    who = await vercel(['whoami', '--json']);
    if (who.code !== 0) throw new CliError('The Vercel login did not finish.', EXIT_REFUSED, 'Its code expires after a few minutes. Run this command again.');
  }
  const account = parseJson(who.out) || {};
  const team = account.team && account.team.slug ? `, team ${account.team.slug}` : '';
  say(
    'gitmargin sets up your comment service in your own Vercel account: a project, a free Neon database, and a deploy.\n' +
      "Vercel's free plan (Hobby) is for non-commercial use. For company work, use a paid or team Vercel account.\n" +
      `Vercel account: ${account.username || 'the one this terminal is logged in to'}${team}`
  );
  if (!(await ask('Set up your comment service in this account?'))) {
    say('Nothing was changed.');
    return EXIT_OK;
  }

  // -- The project
  const serviceDir = path.join(dir, 'service');
  let name = linkedProject(serviceDir);
  const firstTime = !name;
  if (firstTime) {
    const listed = await vercel(['project', 'ls', '--json', '--limit', '100', '--filter', PROJECT]);
    if (listed.code !== 0) throw new CliError('Could not list your Vercel projects.', EXIT_REFUSED, `${listed.err.trim()}\nRun this command again.`);
    const projects = ((parseJson(listed.out) || {}).projects || []).filter((p) => p && typeof p.name === 'string');
    const taken = new Set(projects.map((p) => p.name));
    const existing = projects.find((p) => p.name === PROJECT);
    const where = existing && existing.latestProductionUrl ? ` (${existing.latestProductionUrl})` : '';
    if (existing && (await ask(`You already have a Vercel project named ${PROJECT}${where}. Is it your gitmargin comment service?`))) {
      name = PROJECT;
    } else {
      name = PROJECT;
      for (let n = 2; taken.has(name); n += 1) name = `${PROJECT}-${n}`;
    }
  }
  syncService(serviceSource, serviceDir);
  if (firstTime) {
    const link = await vercel(['link', '--yes', '--project', name], { cwd: serviceDir, mode: 'interactive' });
    if (link.code !== 0) throw new CliError(`Could not link the service to the Vercel project ${name}.`, EXIT_REFUSED, "Vercel's message is above. Run this command again.");
  }
  say(`Vercel project: ${name}`);

  // -- The database
  const listedNeon = await vercel(['integration', 'list', '--json', '--integration', 'neon'], { cwd: serviceDir });
  if (listedNeon.code !== 0) throw new CliError('Could not check for the Neon database.', EXIT_REFUSED, `${listedNeon.err.trim()}\nRun this command again.`);
  const resources = (parseJson(listedNeon.out) || {}).resources || [];
  if (!resources.some((r) => r && Array.isArray(r.projects) && r.projects.includes(name))) {
    say("Adding a free Neon database. If Vercel asks you to accept Neon's terms, answer y.");
    // --no-env-pull: the database password stays in Vercel, not in a file here.
    const added = await vercel(['integration', 'add', 'neon', '--plan', 'free_v3', '-m', 'region=iad1', '-m', 'auth=false', '--no-env-pull'], { cwd: serviceDir, mode: 'interactive' });
    if (added.code !== 0) throw new CliError('The database step did not finish.', EXIT_REFUSED, "Vercel's message is above. Run this command again: it skips what is already done.");
  }

  // -- The secret
  const file = secretFile();
  const local = readSecretFile(file);
  if (local.problem && !local.short) throw new CliError(`The secret file cannot be used. ${local.problem}`, EXIT_REFUSED, 'Nothing was changed on Vercel.');
  const envs = await vercel(['env', 'ls', 'production', '--json', '--project', name], { cwd: serviceDir });
  if (envs.code !== 0) throw new CliError("Could not read the names of the service's settings.", EXIT_REFUSED, `${envs.err.trim()}\nRun this command again.`);
  // Keys only: Vercel leaves out a sensitive value, and nothing here reads one.
  const onVercel = ((parseJson(envs.out) || {}).envs || []).some((e) => e && e.key === 'GITMARGIN_SECRET');

  const giveVercel = async (force) => {
    const args = ['env', 'add', 'GITMARGIN_SECRET', 'production', '--sensitive', ...(force ? ['--force'] : [])];
    const added = await vercel(args, { cwd: serviceDir, mode: 'stdin-file', stdinFile: file });
    if (added.code !== 0) throw new CliError('Could not give the secret to Vercel.', EXIT_REFUSED, `${added.err.trim()}\nRun this command again.`);
  };
  let rotated = false;
  const rotate = async (why) => {
    say(
      `${why}\nA new secret would replace it, on this computer and on the service. Review pages you already shared keep\n` +
        'working, and the old secret file is kept beside the new one.'
    );
    if (!(await ask('Make a new secret?'))) {
      throw new CliError('The service was left with the secret it has.', EXIT_REFUSED, 'Run this command again when you want the new one.');
    }
    if (existsSync(file)) {
      const aside = `${file}.old-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      renameSync(file, aside);
      say(`Kept the old secret file as ${aside}`);
    }
    const value = makeSecret(file);
    await giveVercel(true);
    rotated = true;
    return value;
  };

  let secret = local.value;
  let fromEnvironment = false;
  if (local.short) secret = await rotate('The secret file holds a secret shorter than 32 characters.');
  else if (!secret && !onVercel) {
    secret = makeSecret(file);
    say(`Made your author secret in ${file} (only you can read it).`);
  } else if (!secret && onVercel) {
    // The service has a secret this computer keeps no file for, as on the
    // clone route, where it lived in GITMARGIN_SECRET. That value is written
    // to the file only once the service proves it holds the same one.
    secret = envSecret(env);
    fromEnvironment = Boolean(secret);
    if (!secret) secret = await rotate('Your comment service has a secret, but this computer has no copy of it.');
  }
  if (!onVercel && !rotated) await giveVercel(false);

  // -- Deploy, find the address, check it answers, and prove it
  const deployAndCheck = async () => {
    say('Deploying your comment service...');
    const deployed = await vercel(['deploy', '--prod', '--yes'], { cwd: serviceDir, mode: 'progress' });
    if (deployed.code !== 0) throw new CliError('The deploy failed.', EXIT_REFUSED, "Vercel's message is above. Nothing was trusted. Run this command again.");
    const url = deployed.out.trim().split('\n').pop().trim();
    const inspected = await vercel(['inspect', url, '--json'], { cwd: serviceDir });
    // The first alias is what Vercel prints as "Aliased": the project's main address.
    const alias = ((parseJson(inspected.out) || {}).aliases || [])[0];
    if (inspected.code !== 0 || typeof alias !== 'string' || !alias) {
      throw new CliError('Vercel did not give the service a public address.', EXIT_REFUSED, "Open the project's Domains page in Vercel, then run this command again.");
    }
    const address = cleanAddress(/^https?:\/\//.test(alias) ? alias : `https://${alias}`);
    await ping(address);
    return address;
  };
  let address = await deployAndCheck();
  try {
    await proveService(address, secret, { again: true });
  } catch (refusal) {
    const fixable = { mismatch: 'Your comment service holds a different secret from this computer.', weak_secret: "Your comment service's secret is shorter than 32 characters.", no_secret: 'Your comment service has no secret.' }[refusal.proof];
    if (!fixable || rotated) throw refusal;
    fromEnvironment = false;
    secret = await rotate(fixable);
    address = await deployAndCheck();
    await proveService(address, secret, { again: true });
  }
  if (fromEnvironment && !existsSync(file)) {
    writeFileSync(file, secret, { flag: 'wx', mode: 0o600 });
    chmodSync(file, 0o600);
    say(`Saved the secret from GITMARGIN_SECRET in ${file}, now that the service has proved it holds the same one.`);
  }

  const profile = oldExportLine(home);
  // GITMARGIN_SECRET wins over the file in every gitmargin command. A different
  // one in this terminal (an old profile line, or one set by hand) is almost
  // certainly in Claude Code's environment too, and every command there would
  // be refused, so the job is not done until it is gone.
  if (env.GITMARGIN_SECRET && env.GITMARGIN_SECRET !== secret) {
    say(
      `\nYour comment service is at ${address}, and it proved it holds the secret in ${file}.\n` +
        'One thing is left: this terminal also sets GITMARGIN_SECRET, to a different secret, and gitmargin uses that one first,\n' +
        'so its commands would be refused. Remove the line that sets it' +
        (profile ? ` (it is in ${profile})` : '') +
        ', then open a new terminal, start Claude Code again, and type /gitmargin:share'
    );
    return EXIT_OK;
  }
  say(
    `\nDone. Your comment service is at ${address}, and it proved it holds your secret.\n` +
      `Settings folder: ${dir}\n` +
      (profile ? `${profile} still exports GITMARGIN_SECRET. gitmargin reads the secret file now, so that line can go.\n` : '') +
      'Go back to Claude Code and type /gitmargin:share'
  );
  return EXIT_OK;
}

/** The command as the author runs it: the real terminal, the real programs, and plain messages on failure. */
export async function main({ serviceSource }) {
  try {
    return await runSetup({
      env: process.env,
      stdinIsTTY: Boolean(process.stdin.isTTY),
      stdoutIsTTY: Boolean(process.stdout.isTTY),
      say: (text) => process.stdout.write(`${text}\n`),
      ask: askInTerminal,
      run: runProgram,
      serviceSource,
    });
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    process.stderr.write(`gitmargin setup: ${error.message}\n${error.hint ? `${error.hint}\n` : ''}`);
    return error.code;
  }
}
