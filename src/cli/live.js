// The commands that talk to a comment service (issue #15).
//
//   attach <file> --service [address] [--key <key>]
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

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CliError, EXIT_OK, EXIT_REFUSED, EXIT_USAGE } from './errors.js';
import { attachToHtml, hashOf, prepareAttach, readStamp } from './attach.js';
import { pull } from './pull.js';

const STATUSES = ['open', 'accepted', 'rejected', 'applied'];
/** Under Vercel's 4.5 MB request limit, with room for headers. */
const MAX_UPLOAD_BYTES = 4_400_000;

/** The author secret comes from the environment and from nowhere else. */
function secret() {
  const value = process.env.GITMARGIN_SECRET;
  if (!value) {
    throw new CliError(
      'This command needs the author secret of your comment service.',
      EXIT_USAGE,
      'Set GITMARGIN_SECRET to the value you gave the service when you deployed it.'
    );
  }
  return value;
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
const trustFile = () =>
  path.join(process.env.GITMARGIN_CONFIG_DIR || path.join(os.homedir(), '.config', 'gitmargin'), 'trusted-services.json');

function trustedAddresses() {
  const named = process.env.GITMARGIN_SERVICE ? [cleanAddress(process.env.GITMARGIN_SERVICE)] : [];
  try {
    const saved = JSON.parse(readFileSync(trustFile(), 'utf8'));
    return named.concat(Array.isArray(saved) ? saved.filter((a) => typeof a === 'string') : []);
  } catch {
    return named;
  }
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

/** What each refusal in API.md means to the person at the terminal. */
const REFUSALS = {
  unauthorized: 'The comment service refused the author secret. Check GITMARGIN_SECRET against the deployment.',
  not_found: 'The comment service does not know that prototype key or comment.',
  full:
    'The comment service is at its limit for this prototype. At 500 comments, remove some (gitmargin remove). ' +
    'At 50 versions nothing can be removed: attach from a folder with no previous copy, without --key, to start a new prototype.',
  slow_down: 'The comment service is limiting writes for this prototype. Wait a minute and try again.',
  service_unavailable: 'The comment service could not reach its database.',
  unknown_version: 'The comment service has no such version of this prototype.',
  invalid: 'The comment service did not accept that request.',
};

async function call(address, method, route, { body, auth } = {}) {
  let response;
  try {
    response = await fetch(`${address}${route}`, {
      method,
      headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
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
  if (!response.ok) {
    const code = answer && typeof answer.error === 'string' ? answer.error : null;
    throw new CliError(
      REFUSALS[code] || `The comment service at ${address} answered ${response.status}.`,
      EXIT_REFUSED,
      'Nothing was written.'
    );
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
  const files = keyOption.rest.filter((a) => !a.startsWith('-'));
  const unknown = keyOption.rest.filter((a) => a.startsWith('-'));
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
  const auth = secret();
  assertSecretMayGo(address, { typed: Boolean(service.value) });

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
    key = (await call(address, 'POST', '/api/prototypes', { auth, body: { name: originalName } })).key;
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
        ? `A copy of this version is stored at ${address}/p/${key}/${version.version_id}\n`
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
  const first = await call(stamp.service, 'GET', wanted ? `${route}?version=${encodeURIComponent(wanted)}` : route);
  const answers = [first];
  if (wantsAll) {
    for (const v of first.versions) {
      if (v.version_id !== first.version) answers.push(await call(stamp.service, 'GET', `${route}?version=${encodeURIComponent(v.version_id)}`));
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
