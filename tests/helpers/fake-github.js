// A GitHub that lives inside the test run (issue #17).
//
// It speaks the web flow a GitHub App uses: an authorize page, a token call,
// and the REST API under `/api/v3`, which is where GitHub Enterprise Server
// keeps it and so where the service looks for any address that is not
// github.com. It runs on a loopback port, so `npm test` needs no network and no
// account. The real github.com is proven by the owner's walk (plan step 9).
//
// The awkward parts of the real one are imitated on purpose, because a fake
// that is kinder than the real thing proves nothing:
//
//   1. Logging in needs a cookie, set by the login form and wanted back by the
//      authorize page.
//   2. Approval is asked once per person and skipped afterwards, which is what
//      the service's own confirm page defends against.
//   3. The token call reports most refusals as HTTP 200 with an `error` field,
//      and an unknown client as a 404 (measured against github.com, 2026-09-23).
//      Only a returned `access_token` means yes.
//   4. The token call answers form-encoded text unless asked for JSON.
//   5. The API refuses a request with no `User-Agent`.
//   6. A person's display name can be empty.
//   7. Its pages refuse to be framed (`x-frame-options: deny`, measured).
//
// When a test tells it to fail, it REFUSES. It never delivers first and reports
// failure afterwards: a fake that refuses after delivering cannot test a
// refusal (LESSONS, issue #15).

import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';

/**
 * The people who can "be logged in". `access` is every repository GitHub gives
 * them explicit access to: owned, collaborated on, or through an organization.
 */
export const PEOPLE = {
  octo: { id: 5001, login: 'octopriya', name: 'Priya Shah', access: ['acme/app', 'octopriya/notes'] },
  // No display name set: the login is all there is.
  sam: { id: 5002, login: 'samlee', name: null, access: ['acme/site'] },
  // Access to a repository whose name merely STARTS like the rule's.
  dana: { id: 5004, login: 'danawu', name: 'Dana Wu', access: ['acme/app-two'] },
  // No access to anything the App is installed on.
  noor: { id: 5005, login: 'noorh', name: 'Noor Haddad', access: [] },
  // A name that would be markup if anyone rendered it as markup.
  mallory: { id: 5006, login: 'mallory', name: '<img src=x onerror=alert(1)>', access: ['acme/app'] },
};

/**
 * Where the author's App is installed, and on which repositories. A person
 * sees an installation only when they have access to one of its repositories,
 * and sees only those of its repositories they have access to: GitHub's
 * "explicit permission" rule for a user's token.
 */
const INSTALLATIONS = [
  { id: 71, account: 'acme', repos: ['acme/app', 'acme/app-two', 'acme/site'] },
  { id: 72, account: 'octopriya', repos: ['octopriya/notes'] },
];

const sha256url = (text) => createHash('sha256').update(String(text), 'utf8').digest('base64url');
const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

const cookieOf = (req, name) => {
  const found = String(req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim().split('='))
    .find(([key]) => key === name);
  return found ? decodeURIComponent(found[1] || '') : null;
};

/**
 * @param {{person?: string, clientId?: string, clientSecret?: string}} [options]
 */
export async function startFakeGithub(options = {}) {
  const settings = {
    person: options.person || 'octo', // who types their password into the login form
    deny: false, // the person presses Cancel on the approval page
    failToken: false, // the token call refuses, the way GitHub does: 200 and an `error` field
    failApi: false, // the REST API is down
    noMetadata: false, // the App has no Metadata permission, so repository lists are refused
    extraRepos: 0, // more repositories on the `acme` installation, before the real ones, for paging tests
  };
  const clientId = options.clientId || 'Iv23fakegithubclientid';
  // Plainly made up. The real one is pasted into Vercel by the owner and never
  // appears in this repository.
  const clientSecret = options.clientSecret || 'fake-github-client-secret-for-tests';
  const redirectUris = new Set();
  const codes = new Map(); // code -> { person, redirectUri, challenge, used }
  const tokens = new Map(); // access token -> person key
  const approved = new Set(); // person keys that have pressed Authorize once
  const requests = []; // every call, for tests that assert what was (not) asked

  let origin = '';

  const pageHeaders = () => ({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'deny' });
  const page = (res, status, title, body) => {
    res.writeHead(status, pageHeaders());
    res.end(`<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)}</title><h1>${escapeHtml(title)}</h1>${body}`);
  };
  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const redirect = (res, location, extra = {}) => {
    res.writeHead(302, { location, 'cache-control': 'no-store', ...extra });
    res.end();
  };

  /** The checks the authorize page makes, shared with `approve()` below. */
  function checkAuthorize(params) {
    if (params.get('client_id') !== clientId) return 'unknown application';
    // A GitHub App with several callbacks must be told which one; the service always says.
    if (!redirectUris.has(params.get('redirect_uri'))) return 'redirect_uri is not associated with this application';
    if (params.get('code_challenge_method') !== 'S256' || !params.get('code_challenge')) return 'a S256 challenge is required';
    return null;
  }

  function issueCode(params, personKey) {
    const code = randomBytes(10).toString('hex');
    codes.set(code, { person: personKey, redirectUri: params.get('redirect_uri'), challenge: params.get('code_challenge'), used: false });
    const back = new URL(params.get('redirect_uri'));
    back.searchParams.set('code', code);
    if (params.get('state')) back.searchParams.set('state', params.get('state'));
    return back.toString();
  }

  function denied(params) {
    const back = new URL(params.get('redirect_uri'));
    back.searchParams.set('error', 'access_denied');
    back.searchParams.set('error_description', 'The user has denied your application access.');
    if (params.get('state')) back.searchParams.set('state', params.get('state'));
    return back.toString();
  }

  /** The token call's answer, in the format the caller asked for. */
  function tokenAnswer(req, res, status, body) {
    if (/application\/json/.test(String(req.headers.accept || ''))) return json(res, status, body);
    res.writeHead(status, { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' });
    return res.end(new URLSearchParams(body).toString());
  }

  function installationRepos(installation) {
    if (installation.account !== 'acme' || !settings.extraRepos) return installation.repos;
    const extra = Array.from({ length: settings.extraRepos }, (_, i) => `acme/filler-${String(i).padStart(4, '0')}`);
    return [...extra, ...installation.repos];
  }
  const visibleTo = (person, installation) => installationRepos(installation).filter((r) => person.access.includes(r) || r.startsWith('acme/filler-'));

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, origin);
    requests.push({ method: req.method, path: url.pathname, query: url.search });

    // ---- the web side: login, authorize, token -----------------------------

    if (url.pathname === '/login') {
      if (req.method === 'GET') {
        const next = url.searchParams.get('return_to') || '/';
        return page(
          res,
          200,
          'Fake GitHub: sign in',
          `<form method="post" action="/login"><input type="hidden" name="return_to" value="${escapeHtml(next)}">` +
            `<button id="fake-sign-in" type="submit">Sign in as ${escapeHtml(PEOPLE[settings.person].login)}</button></form>`,
        );
      }
      const form = new URLSearchParams(await readBody(req));
      const next = form.get('return_to') || '/';
      // Only ever back to this fake: a test page must not be able to bounce through it.
      const safe = next.startsWith('/login/oauth/authorize?') ? next : '/';
      return redirect(res, safe, { 'set-cookie': `fake_github_session=${settings.person}; Path=/; HttpOnly; SameSite=Lax` });
    }

    if (url.pathname === '/login/oauth/authorize') {
      const params = req.method === 'POST' ? new URLSearchParams(await readBody(req)) : url.searchParams;
      const problem = checkAuthorize(params);
      if (problem) return page(res, 400, 'Fake GitHub: refused', `<p id="fake-problem">${escapeHtml(problem)}</p>`);

      const personKey = cookieOf(req, 'fake_github_session');
      if (!personKey || !PEOPLE[personKey]) {
        const query = new URLSearchParams(params);
        query.delete('decision');
        return redirect(res, `/login?return_to=${encodeURIComponent(`/login/oauth/authorize?${query.toString()}`)}`);
      }
      if (req.method === 'POST') {
        if (params.get('decision') !== 'authorize' || settings.deny) return redirect(res, denied(params));
        approved.add(personKey);
        return redirect(res, issueCode(params, personKey));
      }
      if (settings.deny) return redirect(res, denied(params));
      // Approved before: straight through, with nothing for the person to press.
      if (approved.has(personKey)) return redirect(res, issueCode(params, personKey));

      const hidden = [...params.entries()]
        .filter(([key]) => key !== 'decision')
        .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}">`)
        .join('');
      return page(
        res,
        200,
        'Fake GitHub: authorize',
        `<p>An App wants to verify your GitHub identity.</p><form method="post" action="/login/oauth/authorize">${hidden}` +
          '<button id="fake-authorize" name="decision" value="authorize" type="submit">Authorize</button> ' +
          '<button id="fake-deny" name="decision" value="cancel" type="submit">Cancel</button></form>',
      );
    }

    if (req.method === 'POST' && url.pathname === '/login/oauth/access_token') {
      const raw = await readBody(req);
      const form = /application\/json/.test(String(req.headers['content-type'] || '')) ? new URLSearchParams(JSON.parse(raw || '{}')) : new URLSearchParams(raw);
      // An unknown client is the one refusal that is not a 200 (measured).
      if (form.get('client_id') !== clientId) return json(res, 404, { error: 'Not Found' });
      // Refuse first, before anything about the code is touched or handed over.
      if (settings.failToken) return tokenAnswer(req, res, 200, { error: 'bad_verification_code', error_description: 'told to fail' });
      if (form.get('client_secret') !== clientSecret) return tokenAnswer(req, res, 200, { error: 'incorrect_client_credentials' });
      const held = codes.get(form.get('code'));
      if (!held || held.used) return tokenAnswer(req, res, 200, { error: 'bad_verification_code' });
      if (form.get('redirect_uri') && held.redirectUri !== form.get('redirect_uri')) return tokenAnswer(req, res, 200, { error: 'redirect_uri_mismatch' });
      // A code issued against a challenge needs its verifier.
      if (sha256url(form.get('code_verifier') || '') !== held.challenge) return tokenAnswer(req, res, 200, { error: 'bad_verification_code' });

      held.used = true; // a code works once
      const accessToken = `ghu_${randomBytes(18).toString('hex')}`;
      tokens.set(accessToken, held.person);
      return tokenAnswer(req, res, 200, { access_token: accessToken, token_type: 'bearer', scope: '', expires_in: 28800 });
    }

    // ---- the API -----------------------------------------------------------

    if (req.method === 'GET' && url.pathname.startsWith('/api/v3/')) {
      if (!req.headers['user-agent']) {
        return json(res, 403, { message: 'Request forbidden by administrative rules. Please make sure your request has a User-Agent header.' });
      }
      if (settings.failApi) return json(res, 503, { message: 'Service unavailable' });
      const bearer = /^(?:Bearer|token) (.+)$/i.exec(String(req.headers.authorization || ''));
      const personKey = bearer && tokens.get(bearer[1]);
      if (!personKey) return json(res, 401, { message: 'Bad credentials' });
      const person = PEOPLE[personKey];
      const path = url.pathname.slice('/api/v3'.length);

      if (path === '/user') {
        return json(res, 200, {
          login: person.login,
          id: person.id,
          node_id: `U_${person.id}`,
          avatar_url: `${origin}/avatars/${person.id}`,
          type: 'User',
          name: person.name,
          company: null,
          email: null,
        });
      }
      if (path === '/user/installations') {
        const visible = INSTALLATIONS.filter((i) => visibleTo(person, i).length);
        return json(res, 200, {
          total_count: visible.length,
          installations: visible.map((i) => ({
            id: i.id,
            account: { login: i.account, type: i.account === 'acme' ? 'Organization' : 'User' },
            repository_selection: 'selected',
            permissions: settings.noMetadata ? {} : { metadata: 'read' },
          })),
        });
      }
      const listing = /^\/user\/installations\/(\d+)\/repositories$/.exec(path);
      if (listing) {
        if (settings.noMetadata) return json(res, 403, { message: 'Resource not accessible by integration' });
        const installation = INSTALLATIONS.find((i) => String(i.id) === listing[1]);
        if (!installation || !visibleTo(person, installation).length) return json(res, 404, { message: 'Not Found' });
        const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get('per_page')) || 30));
        const pageNumber = Math.max(1, Number(url.searchParams.get('page')) || 1);
        const all = visibleTo(person, installation);
        const slice = all.slice((pageNumber - 1) * perPage, pageNumber * perPage);
        return json(res, 200, {
          total_count: all.length,
          repositories: slice.map((fullName) => ({ full_name: fullName, name: fullName.split('/')[1], owner: { login: fullName.split('/')[0] } })),
        });
      }
    }

    return json(res, 404, { message: 'Not Found' });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;

  return {
    url: origin,
    clientId,
    clientSecret,
    requests,
    /** Register a callback address, as the App's settings page on github.com does. */
    allowRedirect: (uri) => redirectUris.add(uri),
    /** Change who signs in, or make the next sign-in go wrong. */
    set: (fields) => Object.assign(settings, fields),
    /** Every code and token handed out so far, so a test can prove the service kept none of them. */
    handedOut: () => [...codes.keys(), ...tokens.keys()],
    /** Forget that anyone approved, so the approval page shows again. */
    forgetApprovals: () => approved.clear(),
    /**
     * What a browser would end up with after the person logs in and presses
     * Authorize: the callback address, carrying a fresh code. For tests that
     * drive the service without a browser. Runs the same checks the page runs.
     */
    approve(authorizeUrl) {
      const params = new URL(authorizeUrl).searchParams;
      const problem = checkAuthorize(params);
      if (problem) throw new Error(`fake GitHub refused: ${problem}`);
      if (settings.deny) return denied(params);
      approved.add(settings.person);
      return issueCode(params, settings.person);
    },
    close: async () => {
      if (!server.listening) return;
      await new Promise((resolve) => server.close(resolve));
      server.closeAllConnections?.();
    },
  };
}
