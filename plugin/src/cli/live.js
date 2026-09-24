// The commands that talk to a comment service (issue #15).
//
//   attach <file> --service [address] [--key <key>] [--require-trusted]
//   pull <attached-file> --live [--version <id> | --all] [more sources...]
//   status <attached-file> <comment-id> <open|accepted|rejected|applied>
//   remove <attached-file> <comment-id>
//
// They live apart from attach.js and pull.js on purpose. A plain `attach` and a
// plain `pull` never reach the network, and the simplest way to keep that true
// is for the code that can reach it to be in a file those paths do not run.
// `service/API.md` is the contract every call here is written against.
//
// Node and nothing else: `fetch` is built in from Node 18.

import { closeSync, constants as fsConstants, existsSync, fstatSync, mkdirSync, openSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError, EXIT_OK, EXIT_REFUSED, EXIT_USAGE } from './errors.js';
import { attachToHtml, hashOf, prepareAttach, readStamp } from './attach.js';
import { pull } from './pull.js';

const STATUSES = ['open', 'accepted', 'rejected', 'applied'];
/** Under Vercel's 4.5 MB request limit, with room for headers. */
const MAX_UPLOAD_BYTES = 4_400_000;

/** gitmargin's settings folder: GITMARGIN_CONFIG_DIR, or ~/.config/gitmargin. */
export const configDir = () => process.env.GITMARGIN_CONFIG_DIR || path.join(os.homedir(), '.config', 'gitmargin');

/** Where the author secret is kept when GITMARGIN_SECRET is not set (issue #36). */
export const secretFile = () => path.join(configDir(), 'secret');

/**
 * The author secret's bounds (issue #33). The service signs a proof with it
 * for anyone who asks, so a short one could be guessed offline from a proof;
 * the setup command makes 43 characters.
 */
export const MIN_SECRET_LENGTH = 32;
const MAX_SECRET_LENGTH = 256;
const MAX_SECRET_FILE_BYTES = 4096;

/** Why a secret cannot be used, or null. Names where it came from, never the value. */
function secretShapeProblem(value, where) {
  if (/\s/.test(value)) return `${where} has a space or a line break inside the secret.`;
  if (value.length < MIN_SECRET_LENGTH) return `${where} holds a secret shorter than ${MIN_SECRET_LENGTH} characters.`;
  if (value.length > MAX_SECRET_LENGTH) return `${where} holds more than ${MAX_SECRET_LENGTH} characters, more than a secret.`;
  return null;
}

/**
 * Read the secret file, or say why not. It is opened without blocking and
 * checked through the open handle, so a pipe or a device put in its place is
 * refused instead of waited on, and nothing can be swapped in between the
 * check and the read.
 */
function readSecretFile(file) {
  let fd;
  try {
    fd = openSync(file, fsConstants.O_RDONLY | (fsConstants.O_NONBLOCK || 0));
  } catch (error) {
    if (error.code === 'ENOENT') return { value: null, problem: null };
    return { value: null, problem: `${file} cannot be read (${error.code || error.message}).` };
  }
  try {
    const info = fstatSync(fd);
    if (!info.isFile()) return { value: null, problem: `${file} is not a plain file.` };
    if (info.size > MAX_SECRET_FILE_BYTES) return { value: null, problem: `${file} is larger than a secret can be.` };
    // Mode bits mean nothing on Windows. Elsewhere, a secret the other users
    // of the computer can read is not a secret.
    if (process.platform !== 'win32' && info.mode & 0o077) {
      return { value: null, problem: `${file} can be read by other users of this computer. Fix it with: chmod 600 ${file}` };
    }
    // A BOM and one final line break are what an editor or `echo` adds, and
    // Vercel strips the same line break when it stores a value. Nothing else
    // is trimmed: the value must stay the exact characters the service holds.
    const value = readFileSync(fd, 'utf8').replace(/^\uFEFF/, '').replace(/\r?\n$/, '');
    if (!value) return { value: null, problem: `${file} is empty.` };
    const problem = secretShapeProblem(value, file);
    return problem ? { value: null, problem } : { value, problem: null };
  } finally {
    closeSync(fd);
  }
}

/**
 * The author secret and where it came from: GITMARGIN_SECRET when it is set
 * and not empty, otherwise the secret file. A file needs no profile line, so
 * nothing has to restart after setup (issue #36). Answers
 * { value, from: 'environment' | 'file', problem: null }, or
 * { value: null, from: null, problem } where problem is null when there is
 * simply no secret yet. The value is never printed anywhere.
 */
export function resolveSecret() {
  const env = process.env.GITMARGIN_SECRET;
  if (env) {
    const problem = secretShapeProblem(env, 'GITMARGIN_SECRET');
    return problem ? { value: null, from: null, problem } : { value: env, from: 'environment', problem: null };
  }
  const file = readSecretFile(secretFile());
  return file.value ? { value: file.value, from: 'file', problem: null } : { value: null, from: null, problem: file.problem };
}

let warnedTwoSecrets = false;

/** The author secret for a command that needs it, or a refusal before anything is sent. */
function secret() {
  const found = resolveSecret();
  if (!found.value) {
    throw new CliError(
      found.problem ? `The author secret cannot be used: ${found.problem}` : 'This command needs the author secret of your comment service.',
      EXIT_USAGE,
      `It is read from GITMARGIN_SECRET, or when that is not set, from ${secretFile()}. Nothing was sent.`
    );
  }
  if (found.from === 'environment' && !warnedTwoSecrets) {
    // An old profile line can keep exporting a secret the file has moved on
    // from. The environment still wins; say so, without either value.
    const file = readSecretFile(secretFile());
    if (file.value && file.value !== found.value) {
      warnedTwoSecrets = true;
      process.stderr.write(`Note: GITMARGIN_SECRET and ${secretFile()} hold different secrets; using GITMARGIN_SECRET.\n`);
    }
  }
  return found.value;
}

function cleanAddress(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new CliError(`Not a web address: ${value}`, EXIT_USAGE, 'Try: --service https://your-service.vercel.app');
  }
  if (!/^https?:$/.test(url.protocol)) throw new CliError(`Not a web address: ${value}`, EXIT_USAGE);
  return url.origin;
}

/**
 * Where the author secret may go.
 *
 * `status`, `remove` and a bare `attach --service` learn the service's address
 * from a FILE: the attached copy. A copy that came back from a reviewer can name
 * any address, and the secret used to follow it there (review of the #15 cycle,
 * R1). So the secret goes only to an address the author has typed on a command
 * line themselves, which `attach --service <address>` remembers here, or named
 * in GITMARGIN_SERVICE. The list lives outside the repo and holds no secret.
 */
const trustFile = () => path.join(configDir(), 'trusted-services.json');

function trustedAddresses() {
  const named = process.env.GITMARGIN_SERVICE ? [cleanAddress(process.env.GITMARGIN_SERVICE)] : [];
  try {
    const saved = JSON.parse(readFileSync(trustFile(), 'utf8'));
    return named.concat(Array.isArray(saved) ? saved.filter((a) => typeof a === 'string') : []);
  } catch {
    return named;
  }
}

/**
 * The service this command line came with: `service/` beside `src/`, in a clone
 * and in the Claude Code plugin alike (issue #16).
 */
const SERVICE_SOURCE = fileURLToPath(new URL('../../service', import.meta.url));
/** Never compared and never read: Vercel's link, installs, tests, the Neon installer's guide files, and (by prefix) every .env file. */
const SERVICE_SKIP = new Set(['.vercel', 'node_modules', 'tests', '.agents', '.claude', 'skills-lock.json']);

function serviceFiles(root, rel = '') {
  const found = [];
  for (const entry of readdirSync(path.join(root, rel), { withFileTypes: true })) {
    if (SERVICE_SKIP.has(entry.name) || entry.name.startsWith('.env')) continue;
    const child = path.join(rel, entry.name);
    if (entry.isDirectory()) found.push(...serviceFiles(root, child));
    else if (entry.isFile()) found.push(child);
  }
  return found;
}

/**
 * Is the copy of the service this machine deploys from the one this command
 * line came with? `none` (no copy yet), `same`, `differs` (a plugin update
 * brought a newer service, so it wants redeploying), or `unknown` (nothing to
 * compare with). A plugin update replaces the command line but not the
 * deployed service, and nothing else would notice (review of #16, R5).
 * Contents only; .env files are skipped by name, so a secret is never read.
 */
function serviceCopyState(configDir) {
  const copy = path.join(configDir, 'service');
  if (!existsSync(copy)) return 'none';
  if (!existsSync(SERVICE_SOURCE)) return 'unknown';
  try {
    for (const rel of serviceFiles(SERVICE_SOURCE)) {
      const deployed = path.join(copy, rel);
      if (!existsSync(deployed) || !readFileSync(deployed).equals(readFileSync(path.join(SERVICE_SOURCE, rel)))) return 'differs';
    }
  } catch {
    return 'unknown';
  }
  return 'same';
}

/**
 * `gitmargin services [--json]`: what this machine knows about comment
 * services, read-only (issue #16). The Claude Code plugin asks this before a
 * first share: to propose the service link when the author already has a
 * service, and to learn the settings folder without a shell expansion, which
 * Claude Code would stop to ask about. It sends nothing, and says whether the
 * author secret is set, never what it is.
 */
export function listServices(args) {
  const unknown = args.filter((a) => a !== '--json');
  if (unknown.length) throw new CliError(`Unknown option: ${unknown[0]}`, EXIT_USAGE, 'Try: gitmargin services --json');
  const found = resolveSecret();
  const answer = {
    configDir: configDir(),
    trusted: [...new Set(trustedAddresses())],
    fromEnvironment: process.env.GITMARGIN_SERVICE ? cleanAddress(process.env.GITMARGIN_SERVICE) : null,
    secretSet: Boolean(found.value),
    // Where the secret came from, and why it cannot be used when it cannot.
    secretFrom: found.from,
    secretProblem: found.problem,
  };
  answer.serviceCopy = serviceCopyState(answer.configDir);
  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(answer, null, 2)}\n`);
    return EXIT_OK;
  }
  process.stdout.write(
    `Settings folder: ${answer.configDir}\n` +
      'Comment services this machine trusts:\n' +
      (answer.trusted.length ? answer.trusted.map((a) => `  ${a}\n`).join('') : '  (none)\n') +
      `GITMARGIN_SERVICE: ${answer.fromEnvironment || 'not set'}\n` +
      (answer.secretFrom === 'environment'
        ? 'Author secret (GITMARGIN_SECRET): set\n'
        : answer.secretFrom === 'file'
          ? `Author secret (${secretFile()}): set\n`
          : answer.secretProblem
            ? `Author secret: cannot be used. ${answer.secretProblem}\n`
            : `Author secret (GITMARGIN_SECRET or ${secretFile()}): not set\n`) +
      `Service copy in ${path.join(answer.configDir, 'service')}: ${
        {
          none: 'none yet',
          same: 'the same as the one that came with this command line',
          differs: 'different from the one that came with this command line: deploy it again',
          unknown: 'cannot be compared',
        }[answer.serviceCopy]
      }\n`
  );
  return EXIT_OK;
}

function rememberAddress(address) {
  if (trustedAddresses().includes(address)) return;
  try {
    mkdirSync(path.dirname(trustFile()), { recursive: true, mode: 0o700 });
    writeFileSync(trustFile(), `${JSON.stringify(trustedAddresses().concat(address), null, 2)}\n`, { mode: 0o600 });
  } catch {
    // Not being able to remember costs a retyped address later, nothing more.
  }
}

/** Refuse to send the secret anywhere the author did not choose, or in the clear. */
function assertSecretMayGo(address, { typed }) {
  const { protocol, hostname } = new URL(address);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  if (protocol !== 'https:' && !loopback) {
    throw new CliError(
      `Refusing to send your author secret to ${address}: it is not https, so anyone on the network could read it.`,
      EXIT_REFUSED,
      'Nothing was sent.'
    );
  }
  if (typed || trustedAddresses().includes(address)) return;
  throw new CliError(
    `Refusing to send your author secret to ${address}: that address came from the file, and you have never attached to it yourself.`,
    EXIT_REFUSED,
    'Nothing was sent. If a reviewer sent this file back, use your own attached copy instead.\n' +
      `If the address is right: gitmargin attach <prototype.html> --service ${address}, or set GITMARGIN_SERVICE=${address}`
  );
}

/** Addresses the author typed on this command line, this run. */
const typedNow = new Set();

/**
 * Vercel's Protection Bypass for Automation (issue #19): how the command line
 * reaches a same-project deployment behind Vercel's login. It opens every
 * deployment of that project, so it follows the author secret's rule: only to
 * an address the author typed or named in GITMARGIN_SERVICE, never in the clear
 * except to loopback. It is never written into a page.
 */
function bypassFor(address) {
  const value = process.env.GITMARGIN_VERCEL_BYPASS;
  if (!value) return {};
  const { protocol, hostname } = new URL(address);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  if (protocol !== 'https:' && !loopback) return {};
  if (!typedNow.has(address) && !trustedAddresses().includes(address)) return {};
  return { 'x-vercel-protection-bypass': value };
}

/** What each refusal in API.md means to the person at the terminal. */
const REFUSALS = {
  unauthorized: 'The comment service refused the author secret. Check that GITMARGIN_SECRET, or the secret file, holds the one the deployment has.',
  not_found: 'The comment service does not know that prototype key or comment.',
  full:
    'The comment service is at its limit for this prototype. At 500 comments, remove some (gitmargin remove). ' +
    'At 50 versions nothing can be removed: attach from a folder with no previous copy, without --key, to start a new prototype.',
  slow_down: 'The comment service is limiting writes for this prototype. Wait a minute and try again.',
  service_unavailable: 'The comment service could not reach its database.',
  unknown_version: 'The comment service has no such version of this prototype.',
  invalid: 'The comment service did not accept that request.',
  sign_in: 'Only signed-in members can read the comments on this prototype, and the author.',
  one_prototype: 'This address serves one prototype, and it already holds one.',
  provider_not_configured:
    'The comment service has no GitLab application set up yet. Add GITMARGIN_GITLAB_ID and GITMARGIN_GITLAB_SECRET to its\n' +
    'deployment (service/README.md, "Sign-in"), redeploy, and run this again.',
};

/** What "not set up" means for each provider: which application, which two values (issue #17). */
const NOT_CONFIGURED = {
  gitlab: REFUSALS.provider_not_configured,
  github:
    'The comment service has no GitHub App set up yet. Add GITMARGIN_GITHUB_ID and GITMARGIN_GITHUB_SECRET to its\n' +
    'deployment (service/README.md, "Sign-in with GitHub"), redeploy, and run this again.',
};

/**
 * What stands in front of the service answered, not the service: a redirect to
 * Vercel's login, or a 401 or 403 that is not the service's own JSON (issue
 * #19). Said by name, and never followed. Vercel's login lives at `/sso-api`
 * (measured 2026-09-23); any other redirect is named with where it points, so
 * a moved address is not blamed on a correct bypass secret (review of #19, R18).
 */
function walled(address, response, answer, bypass) {
  const redirect = response.status >= 300 && response.status < 400;
  const location = redirect ? String(response.headers.get('location') || '') : '';
  const toLogin = redirect && /\/sso-api(?:[/?#]|$)/.test(location);
  const refusedPage = (response.status === 401 || response.status === 403) && !(answer && typeof answer.error === 'string');
  if (redirect && !toLogin) {
    return new CliError(
      `${address} answered with a redirect to ${location || 'another address'}, not with the comment service.`,
      EXIT_REFUSED,
      'Check the address: use the one the service itself answers on.\nNothing was written.'
    );
  }
  if (!toLogin && !refusedPage) return null;
  if (bypass['x-vercel-protection-bypass']) {
    return new CliError(
      `Vercel's protection refused the bypass secret at ${address}.`,
      EXIT_REFUSED,
      "Check GITMARGIN_VERCEL_BYPASS against the project's Protection Bypass for Automation (Vercel: the project, Settings, Deployment Protection).\nNothing was written."
    );
  }
  return new CliError(
    `${address} is behind Vercel's protection, so the command line cannot reach the comment service there.`,
    EXIT_REFUSED,
    process.env.GITMARGIN_VERCEL_BYPASS
      ? 'GITMARGIN_VERCEL_BYPASS is set, but it only goes to an address you typed with attach --service, or named in GITMARGIN_SERVICE.\nNothing was written.'
      : "Set GITMARGIN_VERCEL_BYPASS to the project's Protection Bypass for Automation (Vercel: the project, Settings, Deployment Protection), and run this again.\nNothing was written."
  );
}

/**
 * Same-project mode is only private if Vercel's protection covers the address,
 * and a new project's default leaves its main address open (measured
 * 2026-09-23). So after publishing there, ask once without the bypass, and say
 * so plainly if the service answers (review of #19, R16). Never a refusal: the
 * author may be testing on purpose.
 */
async function warnIfOpen(address) {
  let status = 0;
  try {
    status = (await fetch(`${address}/api/ping`, { redirect: 'manual' })).status;
  } catch {
    return;
  }
  if (status !== 200) return;
  process.stderr.write(
    `Warning: ${address} answers without Vercel's login, so anyone with the address reaches this prototype and its comments.\n` +
      'In Vercel: the project, Settings, Deployment Protection, Vercel Authentication, choose All Deployments.\n'
  );
}

async function call(address, method, route, { body, auth } = {}) {
  const bypass = bypassFor(address);
  let response;
  try {
    response = await fetch(`${address}${route}`, {
      method,
      headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${auth}` } : {}), ...bypass },
      body: body === undefined ? undefined : JSON.stringify(body),
      // A redirect here is a login wall in front of the service; the service's
      // own routes never redirect. Following it would read a login page as an answer.
      redirect: 'manual',
    });
  } catch {
    throw new CliError(`Could not reach the comment service at ${address}.`, EXIT_REFUSED, 'Nothing was written.');
  }
  let answer = null;
  try {
    answer = await response.json();
  } catch {
    // Not JSON: not our service, or a proxy in front of it. Reported below.
  }
  const wall = walled(address, response, answer, bypass);
  if (wall) throw wall;
  if (!response.ok) {
    const code = answer && typeof answer.error === 'string' ? answer.error : null;
    const refusal = new CliError(
      REFUSALS[code] || `The comment service at ${address} answered ${response.status}.`,
      EXIT_REFUSED,
      'Nothing was written.'
    );
    refusal.refusal = code; // so a caller can tell one refusal from another (`code` is the exit code)
    refusal.answer = answer;
    throw refusal;
  }
  return answer;
}

/** Pull `--name value` out of an argument list. `optional` allows a bare flag. */
function takeOption(args, name, { optional = false } = {}) {
  const at = args.indexOf(name);
  if (at < 0) return { present: false, value: null, rest: args };
  const next = args[at + 1];
  const hasValue = next !== undefined && !next.startsWith('-') && !(optional && /\.x?html?$/i.test(next));
  if (!hasValue && !optional) throw new CliError(`${name} needs a value.`, EXIT_USAGE, 'Try: gitmargin help');
  return {
    present: true,
    value: hasValue ? next : null,
    rest: [...args.slice(0, at), ...args.slice(at + (hasValue ? 2 : 1))],
  };
}

/** The attached copy a `pull --live`, `status` or `remove` is pointed at. */
function sharedStamp(file) {
  let html;
  try {
    html = readFileSync(file, 'utf8');
  } catch {
    throw new CliError(`Cannot read ${file}`, EXIT_USAGE);
  }
  const stamp = readStamp(html);
  if (!stamp.service || !stamp.key) {
    throw new CliError(
      `${path.basename(file)} is not shared through a comment service.`,
      EXIT_USAGE,
      'Pass the copy that `gitmargin attach <file> --service` wrote.'
    );
  }
  return { ...stamp, service: cleanAddress(stamp.service) };
}

export async function attachLive(args) {
  const service = takeOption(args, '--service', { optional: true });
  const keyOption = takeOption(service.rest, '--key');
  // For an address read from a file someone else could have written, such as a
  // project's .gitmargin.json in a cloned repo (issue #16, plan D10): the
  // plain `--service <address>` trusts whatever it is given, so a script that
  // did not hear the author type the address asks for this instead.
  const requireTrusted = keyOption.rest.includes('--require-trusted');
  const remaining = keyOption.rest.filter((a) => a !== '--require-trusted');
  const files = remaining.filter((a) => !a.startsWith('-'));
  const unknown = remaining.filter((a) => a.startsWith('-'));
  if (unknown.length) throw new CliError(`Unknown option: ${unknown[0]}`, EXIT_USAGE, 'Try: gitmargin help');
  if (files.length !== 1) {
    throw new CliError('attach takes exactly one file.', EXIT_USAGE, 'Try: gitmargin attach prototype.html --service https://...');
  }

  const source = files[0];
  const { bundle, bytes, html, outPath, previous, originalName } = prepareAttach(source);

  const given = service.value || previous.service;
  if (!given) {
    throw new CliError(
      '--service needs the address of your comment service the first time.',
      EXIT_USAGE,
      'Try: gitmargin attach prototype.html --service https://your-service.vercel.app'
    );
  }
  const address = cleanAddress(given);
  // Before the secret is even looked up, and so before any request or write.
  // Only an address on this command line needs it: a bare --service reads the
  // previous copy's address, which assertSecretMayGo already holds to the
  // trusted list.
  if (requireTrusted && service.value && !trustedAddresses().includes(address)) {
    throw new CliError(
      `Refusing to use ${address}: this machine has not used that comment service before.`,
      EXIT_REFUSED,
      'Nothing was sent and nothing was written. If it is your own service, confirm that, then attach once\n' +
        `without --require-trusted, which remembers it: gitmargin attach ${source} --service ${address}`
    );
  }
  const auth = secret();
  assertSecretMayGo(address, { typed: Boolean(service.value) });
  if (service.value) typedNow.add(address);

  // Which prototype this is. A key given by hand wins; otherwise the previous
  // copy's key, but only when it was for this same service.
  const samePlace = previous.service && cleanAddress(previous.service) === address;
  let key = keyOption.value || (samePlace ? previous.key : null);
  let createdNow = false;
  if (!key) {
    // Said BEFORE it happens, and naming the way out: a second machine or a
    // deleted copy would otherwise start a new prototype silently and leave
    // every existing comment behind on the old one.
    process.stderr.write(
      `No previous copy of ${path.basename(outPath)} and no --key, so this creates a NEW prototype on the service.\n` +
        'If this prototype is already shared, stop and run again with: --key <its key>\n'
    );
    try {
      key = (await call(address, 'POST', '/api/prototypes', { auth, body: { name: originalName } })).key;
    } catch (refusal) {
      // A same-project deployment holds one prototype (issue #19). Say which, and
      // how to publish a new version of it; never reuse the key on our own.
      const held = refusal.refusal === 'one_prototype' && refusal.answer && refusal.answer.key;
      if (!held) throw refusal;
      throw new CliError(
        `${address} serves one prototype, and it already holds one (key ${held}).`,
        EXIT_REFUSED,
        `To publish a new version of it: gitmargin attach ${source} --service ${address} --key ${held}\nNothing was written.`
      );
    }
    createdNow = true;
    // Printed the moment it exists. Two more calls follow and either can fail;
    // printed only at the end, a failure lost the key, and every retry made
    // another prototype nobody could find again (review R20).
    process.stderr.write(`Prototype key (the page key): ${key}\nKeep it: --key <key> is how another machine, or a retry, finds this prototype again.\n`);
  }
  // The service took the secret, so this is the author's service: remember it.
  if (service.value) rememberAddress(address);

  // The service owns the round number, so a fresh checkout cannot disagree
  // with it about which version is v3 (API.md, "versions").
  const version = await call(address, 'POST', `/api/prototypes/${key}/versions`, {
    auth,
    body: { hash: hashOf(bytes), file: originalName },
  });
  if (version.same_project) await warnIfOpen(address);

  const out = attachToHtml(html, {
    bundle,
    versionId: version.version_id,
    originalName,
    service: { address, key },
  });
  // The finished page goes to the service too, so an older version can still be
  // opened with its comments in place after this address moves on. It can only
  // be sent now: the page carries its version id, and the service chose that.
  // Vercel takes about 4.5 MB per request, so a page near the service's 4 MB cap
  // is measured as the request it would be, and skipped rather than refused.
  const upload = { hash: hashOf(bytes), file: originalName, html: out };
  let pageStored = false;
  if (Buffer.byteLength(JSON.stringify(upload), 'utf8') <= MAX_UPLOAD_BYTES) {
    pageStored = (await call(address, 'POST', `/api/prototypes/${key}/versions`, { auth, body: upload })).page_stored === true;
  }

  // Only now, with every service call answered, is anything written.
  writeFileSync(outPath, out, 'utf8');

  process.stdout.write(`${outPath}\n`);
  process.stderr.write(
    `Attached the overlay to ${originalName} as version ${version.version_id}` +
      `${version.created ? '' : ' (unchanged since the last attach)'}.\n` +
      `Comments are shared through ${address}.\n` +
      (pageStored
        ? `A copy of this version is stored at ${address}/p/${key}/${version.version_id}\n` +
          // The address to hand reviewers (issue #16): it always opens the newest
          // version, so it survives the next share. A plugin that built it from
          // the line above handed out a version's address, which went stale.
          `Review link (always the newest version): ${address}/p/${key}/latest\n`
        : 'This page is too large to store a copy of (over 4 MB). Its comments are shared as usual; once a newer\n' +
          'version exists, people will read this version\'s comments as a list rather than on the page.\n') +
      `Send or publish ${path.basename(outPath)}. ${path.basename(source)} is untouched.\n`
  );
  if (createdNow) {
    process.stderr.write(
      '\nThe key is inside the page, and it is the only gate. Anyone who can open the page can read and\n' +
        'write its comments, and open the stored copies of it. If the page is public, so are they. If the\n' +
        'page sits behind a password, the key and the stored copies still work from anywhere, for whoever\n' +
        'has seen the page: the stored copy is not behind that password.\n'
    );
  }
  return EXIT_OK;
}

export async function pullLive(args) {
  const version = takeOption(args, '--version');
  const rest = version.rest.filter((a) => a !== '--live' && a !== '--all');
  const wantsAll = version.rest.includes('--all');
  if (version.present && wantsAll) throw new CliError('Use --version or --all, not both.', EXIT_USAGE);

  const positional = rest.filter((a) => a === '-' || !a.startsWith('-'));
  if (positional.length === 0 || positional[0] === '-') {
    throw new CliError('pull --live needs the attached copy, to know which service and prototype to read.', EXIT_USAGE, 'Try: gitmargin pull prototype.gitmargin.html --live');
  }
  const attached = positional[0];
  const stamp = sharedStamp(attached);
  const route = `/api/p/${stamp.key}/comments`;

  // The version the author is about to edit is the one in the copy in hand,
  // so that is the default, not whatever is newest on the service.
  const wanted = version.value || stamp.versionId;
  // Reading needs no secret unless the author limited it to members (strict
  // reading). So ask without one first, and send the secret only when the
  // service says reading needs it, under the same rule as every other command:
  // never to an address that only the file names.
  let auth;
  const read = async (query) => {
    try {
      return await call(stamp.service, 'GET', `${route}${query}`, { auth });
    } catch (refusal) {
      if (refusal.refusal !== 'sign_in' || auth) throw refusal;
      assertSecretMayGo(stamp.service, { typed: false });
      const found = resolveSecret();
      if (!found.value && !found.problem) {
        throw new CliError(
          'The comments on this prototype are for members only, so reading them here needs your author secret.',
          EXIT_USAGE,
          `Set GITMARGIN_SECRET, or keep the secret in ${secretFile()}, and run this again.`
        );
      }
      auth = secret();
      return call(stamp.service, 'GET', `${route}${query}`, { auth });
    }
  };
  const first = await read(wanted ? `?version=${encodeURIComponent(wanted)}` : '');
  const answers = [first];
  if (wantsAll) {
    for (const v of first.versions) {
      if (v.version_id !== first.version) answers.push(await read(`?version=${encodeURIComponent(v.version_id)}`));
    }
  }

  const fetched = answers.map((answer) => ({
    label: `${stamp.service} ${answer.version || ''}`.trim(),
    carrier: 'service',
    lossy: false,
    envelope: {
      gitmargin: '0.1',
      file: stamp.file,
      version_id: answer.version,
      exported_at: answer.server_time,
      reviewer: { name: null },
      viewport: null,
      overall_note: null,
      comments: answer.comments,
    },
  }));

  // Everything after the attached copy is an ordinary source: a returned file
  // or a pasted block, merged by id with what the service holds.
  const others = rest.filter((a) => a !== attached);
  return pull(others, fetched);
}

function commentArgs(args, usage) {
  const positional = args.filter((a) => !a.startsWith('-'));
  if (positional.length < 2) throw new CliError(usage, EXIT_USAGE, 'Try: gitmargin help');
  if (!/^c_[0-9a-f]{6}$/.test(positional[1])) throw new CliError(`Not a comment id: ${positional[1]}`, EXIT_USAGE, 'A comment id looks like c_7f3a9b.');
  return { stamp: sharedStamp(positional[0]), id: positional[1], rest: positional.slice(2) };
}

export async function setStatus(args) {
  const { stamp, id, rest } = commentArgs(args, 'status needs the attached copy, a comment id, and a status.');
  if (!STATUSES.includes(rest[0])) {
    throw new CliError(`Not a status: ${rest[0] ?? '(nothing)'}`, EXIT_USAGE, `One of: ${STATUSES.join(', ')}`);
  }
  const auth = secret();
  assertSecretMayGo(stamp.service, { typed: false });
  await call(stamp.service, 'PATCH', `/api/prototypes/${stamp.key}/comments/${id}/status`, {
    auth,
    body: { status: rest[0] },
  });
  process.stderr.write(`${id} is now ${rest[0]}. Reviewers see it the next time their page checks in.\n`);
  return EXIT_OK;
}

export async function removeComment(args) {
  const { stamp, id } = commentArgs(args, 'remove needs the attached copy and a comment id.');
  const auth = secret();
  assertSecretMayGo(stamp.service, { typed: false });
  await call(stamp.service, 'DELETE', `/api/prototypes/${stamp.key}/comments/${id}`, { auth });
  process.stderr.write(`${id} is removed for everyone.\n`);
  return EXIT_OK;
}

const IDENTITIES = ['none', 'gitlab', 'github'];
const PROVIDER_NAMES = { gitlab: 'GitLab', github: 'GitHub' };

/**
 * `gitmargin identity <attached copy> <none|gitlab|github> [--members <group>] [--read open|members]`
 *
 * Who may comment on a shared prototype (issue #18). The setting lives on the
 * comment service, not in the page, so nothing is re-attached and the copies
 * people already hold pick it up the next time they check in. The secret goes
 * only where `status` and `remove` would send it: an address the author typed.
 */
export async function setIdentityMode(args) {
  const members = takeOption(args, '--members');
  const read = takeOption(members.rest, '--read');
  const positional = read.rest.filter((a) => !a.startsWith('-'));
  const usage = 'identity needs the attached copy and a mode: none, gitlab or github.';
  if (positional.length !== 2) throw new CliError(usage, EXIT_USAGE, 'Try: gitmargin identity prototype.gitmargin.html gitlab --members your-group');
  const [file, mode] = positional;
  if (!IDENTITIES.includes(mode)) throw new CliError(`Not a sign-in mode: ${mode}`, EXIT_USAGE, `One of: ${IDENTITIES.join(', ')}`);
  if (read.present && !['open', 'members'].includes(read.value)) throw new CliError(`--read takes open or members, not ${read.value}`, EXIT_USAGE);
  if (mode === 'none' && (members.present || read.present)) {
    throw new CliError('--members and --read only mean something with a sign-in mode.', EXIT_USAGE, 'Try: gitmargin identity <copy> none');
  }
  // A GitHub rule names one repository (issue #17): said here, before anything is sent.
  if (mode === 'github' && members.present && !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/.test(String(members.value).trim())) {
    throw new CliError(
      `--members for GitHub names one repository as owner/repo, not ${members.value}.`,
      EXIT_USAGE,
      'Try: gitmargin identity <copy> github --members your-org/your-repo'
    );
  }

  const stamp = sharedStamp(file);
  const auth = secret();
  assertSecretMayGo(stamp.service, { typed: false });
  let set;
  try {
    set = await call(stamp.service, 'PATCH', `/api/prototypes/${stamp.key}`, {
      auth,
      body: { identity: mode, members: members.value, ...(read.present ? { read: read.value } : {}) },
    });
  } catch (refusal) {
    // The service says only "not configured"; the CLI knows which provider was asked for.
    if (refusal.refusal === 'provider_not_configured' && NOT_CONFIGURED[mode]) throw new CliError(NOT_CONFIGURED[mode], EXIT_REFUSED, 'Nothing was changed.');
    throw refusal;
  }

  const name = path.basename(file);
  const lines = [];
  if (set.identity === 'none') {
    lines.push(`Sign-in is OFF for ${name}. Anyone who can open the page comments under a name they type.`);
  } else {
    const provider = PROVIDER_NAMES[set.identity] || set.identity;
    const repo = set.identity === 'github';
    lines.push(`Sign-in is ON for ${name}: people comment under their ${provider} name.`);
    lines.push(
      set.members
        ? repo
          ? `Who can comment: people GitHub lets open the repository "${set.members}" only.`
          : `Who can comment: members of the ${provider} group "${set.members}" only.`
        : `Who can comment: anyone with a ${provider} account who can open the page.`
    );
    if (repo && set.members) {
      lines.push(
        `Your GitHub App must be installed on ${set.members}, with read access to repository metadata, or nobody gets in.`
      );
    }
    lines.push(
      set.read === 'members'
        ? 'Who can read the comments: signed-in members only. The copies stored on the service open only after sign-in too.'
        : 'Who can read the comments: anyone who can open the page.'
    );
    if (set.members) {
      lines.push(
        repo
          ? `If you rename or delete "${set.members}", or its owner is renamed, run this again: a freed name can be registered by someone else.`
          : `If you rename or delete "${set.members}", run this again: a freed group path can be registered by someone else.`
      );
    }
    lines.push('A copy you shared before switching this on can still read, but its comments are refused until you attach and share it again.');
  }
  lines.push(`Passes ended: ${set.passes_ended}. Everyone signs in again the next time they comment.`);
  lines.push('This run replaced the whole setting: next time, repeat every flag you still want.');
  process.stderr.write(`${lines.join('\n')}\n`);
  return EXIT_OK;
}

