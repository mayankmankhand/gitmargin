#!/usr/bin/env node
// Measures two things about a real GitLab that the test suite's fake cannot
// prove (plan step 3, issue #18):
//
//   1. With the single harmless permission `openid` ("verify who you are"),
//      does the `groups` claim come back filled, and does it list a given group
//      for a given person? The members rule in docs/part-2-design.md rests on it.
//   2. Does the real GitLab login complete inside a pop-up that was opened by a
//      page from disk, by a locked-down ("sandboxed") page, and by an ordinary
//      web page, in a real browser with its pop-up blocker on?
//
// It runs on the author's own machine with a loopback callback, so nothing has
// to be deployed. It prints claim NAMES and yes/no answers. It never prints the
// application's secret, a code, or a token, and it stores nothing.
//
// Usage
//   export GITMARGIN_GITLAB_ID=...        the application's id
//   export GITMARGIN_GITLAB_SECRET=...    its secret (never printed)
//   node scripts/gitlab-claims-check.mjs --group <full/group/path>
//
//   --issuer <url>     default https://gitlab.com
//   --port <n>         default 8976: register http://127.0.0.1:8976/callback on the application
//   --disk <folder>    where to write the from-disk test page (default: the system temp folder)
//   --callback <url>   if GitLab refuses a loopback callback: use this registered address instead.
//                      The tab lands there (a not-found answer is fine); paste its full address
//                      back into this terminal and the script finishes the exchange locally.

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The exact policy the comment service puts on stored pages (PAGE_HEADERS in
// service/src/router.js). Kept in step by tests/gitlab-claims-check.test.js.
export const STORED_PAGE_SANDBOX =
  'sandbox allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads';

const sha256url = (text) => createHash('sha256').update(String(text), 'utf8').digest('base64url');
const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The page with one button. `base` is absolute so the copy on disk can use it too. */
function openerPage(base, kind) {
  return `<!doctype html><meta charset="utf-8"><title>gitmargin pop-up check (${escapeHtml(kind)})</title>
<body style="font: 15px system-ui; max-width: 40rem; margin: 3rem auto; line-height: 1.5">
<h1>Pop-up check: ${escapeHtml(kind)}</h1>
<p>Press the button. A small window should open with the real GitLab sign-in. Finish signing in there.</p>
<button id="open" style="font: inherit; padding: .5rem 1rem">Open the GitLab sign-in in a pop-up</button>
<pre id="log">Nothing yet.</pre>
<script>
document.getElementById('open').addEventListener('click', function () {
  var popup = window.open(${JSON.stringify(`${base}/start?from=${encodeURIComponent(kind)}`)}, 'gm-check', 'popup,width=560,height=700');
  var lines = ['Pop-up opened from the click: ' + (popup ? 'YES' : 'NO (blocked)')];
  var log = document.getElementById('log');
  log.textContent = lines.join('\\n');
  if (!popup) return;
  var ticks = 0;
  var timer = setInterval(function () {
    ticks += 1;
    var state;
    try { state = String(popup.closed); } catch (e) { state = 'error: ' + e; }
    lines[1] = 'This page reads the pop-up as closed: ' + state + '  (if the window is still open and this says true, the link between the two windows was cut)';
    log.textContent = lines.join('\\n');
    if (ticks > 240) clearInterval(timer);
  }, 500);
});
</script>`;
}

function resultPage(title, lines) {
  return `<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<body style="font: 15px system-ui; max-width: 40rem; margin: 3rem auto; line-height: 1.5">
<h1>${escapeHtml(title)}</h1><pre>${escapeHtml(lines.join('\n'))}</pre><p>You can close this window.</p>`;
}

/** Claim names inside an ID token, read without trusting it: names only, no values. */
function idTokenClaimNames(idToken) {
  try {
    return Object.keys(JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8'))).sort();
  } catch {
    return [];
  }
}

/**
 * @returns {Promise<{url: string, diskPage: string, authorizeUrl: (from?: string) => string,
 *   finish: (landedUrl: string) => Promise<object>, results: object[], close: () => Promise<void>}>}
 */
export async function startCheck({ issuer, clientId, clientSecret, group, port = 8976, diskFolder, callback, log = console.log }) {
  if (!clientId || !clientSecret) throw new Error('Set GITMARGIN_GITLAB_ID and GITMARGIN_GITLAB_SECRET first.');
  const base = String(issuer || 'https://gitlab.com').replace(/\/+$/, '');
  const found = await fetch(`${base}/.well-known/openid-configuration`);
  if (!found.ok) throw new Error(`No sign-in metadata at ${base} (HTTP ${found.status}).`);
  const meta = await found.json();

  const pending = new Map(); // state -> { verifier, from }
  const results = [];
  let origin = '';
  const redirectUri = () => callback || `${origin}/callback`;

  function authorizeUrl(from = 'terminal') {
    const state = randomBytes(12).toString('hex');
    const verifier = randomBytes(32).toString('base64url');
    pending.set(state, { verifier, from });
    const go = new URL(meta.authorization_endpoint);
    go.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: 'openid', // the single harmless permission, and nothing else
      state,
      code_challenge: sha256url(verifier),
      code_challenge_method: 'S256',
    }).toString();
    return go.toString();
  }

  /** Finish one sign-in from the address the browser landed on. */
  async function finish(landedUrl) {
    const landed = new URL(landedUrl);
    const held = pending.get(landed.searchParams.get('state'));
    if (!held) throw new Error('That address does not belong to a sign-in this run started.');
    pending.delete(landed.searchParams.get('state'));
    if (landed.searchParams.get('error')) throw new Error(`GitLab answered: ${landed.searchParams.get('error')}`);

    const tokenAnswer = await fetch(meta.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: landed.searchParams.get('code') || '',
        redirect_uri: redirectUri(),
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: held.verifier,
      }),
    });
    const token = await tokenAnswer.json().catch(() => ({}));
    // The error NAME only. The body can echo what was sent.
    if (!tokenAnswer.ok || !token.access_token) throw new Error(`The token call was refused: ${token.error || tokenAnswer.status}`);

    const who = await (await fetch(meta.userinfo_endpoint, { headers: { authorization: `Bearer ${token.access_token}` } })).json();
    const groups = Array.isArray(who.groups) ? who.groups : null;
    const wanted = String(group || '').toLowerCase();
    const result = {
      from: held.from,
      scopeGranted: token.scope || null,
      userinfoClaims: Object.keys(who).sort(),
      idTokenClaims: idTokenClaimNames(token.id_token),
      groupsClaimPresent: groups !== null,
      groupsCount: groups ? groups.length : 0,
      listsTheGroup: wanted ? Boolean(groups && groups.some((g) => String(g).toLowerCase() === wanted)) : null,
    };
    results.push(result);
    log('');
    log(`Sign-in finished (started from: ${result.from}).`);
    log(`  permission granted:        ${result.scopeGranted}`);
    log(`  userinfo claim names:      ${result.userinfoClaims.join(', ')}`);
    log(`  ID token claim names:      ${result.idTokenClaims.join(', ') || '(none read)'}`);
    log(`  groups claim present:      ${result.groupsClaimPresent ? 'YES' : 'NO'} (${result.groupsCount} group paths)`);
    if (wanted) log(`  lists "${group}":${' '.repeat(Math.max(1, 14 - String(group).length))}${result.listsTheGroup ? 'YES' : 'NO'}`);
    return result;
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, origin);
    const html = (status, body, extra = {}) => {
      res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...extra });
      res.end(body);
    };
    if (url.pathname === '/') return html(200, openerPage(origin, 'an ordinary web page'));
    if (url.pathname === '/sandboxed') {
      return html(200, openerPage(origin, 'a locked-down stored page'), {
        'content-security-policy': STORED_PAGE_SANDBOX,
        'referrer-policy': 'no-referrer',
      });
    }
    if (url.pathname === '/start') {
      res.writeHead(302, { location: authorizeUrl(url.searchParams.get('from') || 'a page'), 'cache-control': 'no-store' });
      return res.end();
    }
    if (url.pathname === '/callback') {
      try {
        const result = await finish(url.toString());
        return html(200, resultPage('Signed in. The answers are in the terminal.', [
          `groups claim present: ${result.groupsClaimPresent ? 'YES' : 'NO'}`,
          group ? `lists "${group}": ${result.listsTheGroup ? 'YES' : 'NO'}` : '',
        ]));
      } catch (error) {
        log(`Sign-in did not finish: ${error.message}`);
        return html(400, resultPage('Sign-in did not finish', [error.message]));
      }
    }
    return html(404, resultPage('Not found', []));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;

  const folder = diskFolder || os.tmpdir();
  mkdirSync(folder, { recursive: true });
  const diskPage = path.join(folder, 'gitmargin-popup-check.html');
  writeFileSync(diskPage, openerPage(origin, 'a file opened from disk'));

  return {
    url: origin,
    diskPage,
    authorizeUrl,
    finish,
    results,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      server.closeAllConnections?.();
    },
  };
}

/**
 * On WSL the script runs in Linux and the browser runs in Windows, where
 * `/mnt/c/Users/me/Desktop/x.html` is `C:\Users\me\Desktop\x.html`. Anything
 * else is returned as a file:// address.
 */
export function openablePath(filePath) {
  const mounted = /^\/mnt\/([a-z])\/(.*)$/.exec(filePath);
  return mounted ? `${mounted[1].toUpperCase()}:\\${mounted[2].replace(/\//g, '\\')}` : pathToFileURL(filePath).toString();
}

function option(args, name) {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write('See the comment at the top of scripts/gitlab-claims-check.mjs\n');
    return;
  }
  const check = await startCheck({
    issuer: option(args, '--issuer'),
    clientId: process.env.GITMARGIN_GITLAB_ID,
    clientSecret: process.env.GITMARGIN_GITLAB_SECRET,
    group: option(args, '--group'),
    port: Number(option(args, '--port') || 8976),
    diskFolder: option(args, '--disk'),
    callback: option(args, '--callback'),
  });

  console.log('Open each of these in the browser where the person is logged in to GitLab, and press the button:');
  console.log(`  1. an ordinary web page:        ${check.url}/`);
  console.log(`  2. a locked-down stored page:   ${check.url}/sandboxed`);
  console.log(`  3. a file opened from disk:     ${openablePath(check.diskPage)}`);
  console.log('     (on WSL, pass --disk /mnt/c/Users/<you>/Desktop so a Windows browser can open it)');
  console.log('For each one, note: did the small window open, did the GitLab login finish inside it, and was an');
  console.log('approval screen shown (expected the first time only).');
  if (option(args, '--callback')) {
    console.log('\nUsing a registered callback that is not this machine. After signing in, the tab lands on that address.');
    console.log('Paste the full address here and press Enter:');
    const lines = readline.createInterface({ input: process.stdin });
    for await (const line of lines) {
      if (!line.trim()) continue;
      try {
        await check.finish(line.trim());
      } catch (error) {
        console.log(`Could not finish: ${error.message}`);
      }
    }
  }
  console.log('\nPress Ctrl+C when done.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // A message for a person, not a stack trace, and never the secret.
    process.stderr.write(`gitlab-claims-check: ${error.message}\n`);
    process.exitCode = 1;
  });
}
