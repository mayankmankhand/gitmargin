// A GitLab that lives inside the test run.
//
// It speaks the same open sign-in standard gitlab.com does: a discovery
// document, an authorize page, a token call and a userinfo call with a `groups`
// claim. It runs on a loopback port, so `npm test` needs no network and no
// account. The real gitlab.com is proven separately, by hand (plan step 3) and
// by the owner's two-computer walk (plan step 8).
//
// Three things a real login does are imitated on purpose, because a fake that
// is kinder than the real thing proves nothing:
//
//   1. Logging in needs a cookie. The login form sets one and the authorize page
//      wants it back. A pop-up that wrongly inherited a sandbox has no cookies,
//      so it loops here exactly as it would on gitlab.com.
//   2. Its pages send `Cross-Origin-Opener-Policy: same-origin`, the header that
//      cuts the link between a pop-up and the page that opened it. gitlab.com
//      answered with it on 2026-09-19.
//   3. Approval is asked once per person and skipped afterwards, which is what
//      makes a silent second sign-in possible, and so what the service's own
//      confirm page has to defend against.
//
// When a test tells it to fail, it REFUSES. It never delivers first and reports
// failure afterwards: a fake that refuses after delivering cannot test a
// refusal (LESSONS, issue #15).

import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';

/** The people who can "be logged in" at the fake. `groups` are full group paths. */
export const PEOPLE = {
  priya: { sub: '1001', name: 'Priya Shah', nickname: 'priya', groups: ['gitmargin-test', 'acme/design'] },
  sam: { sub: '1002', name: 'Sam Lee', nickname: 'samlee', groups: ['somewhere-else'] },
  // A member of a subgroup only: not a member of `acme/design` itself.
  ines: { sub: '1003', name: 'Ines Ortega', nickname: 'ines', groups: ['acme/design/interns'] },
  // Paths that merely START like the real ones. A prefix match would let her in.
  dana: { sub: '1004', name: 'Dana Wu', nickname: 'dana', groups: ['gitmargin-test-two', 'acme/design-team'] },
  // No groups at all.
  noor: { sub: '1005', name: 'Noor Haddad', nickname: 'noor', groups: [] },
  // A name that would be markup if anyone rendered it as markup.
  mallory: { sub: '1006', name: '<img src=x onerror=alert(1)>', nickname: 'mallory', groups: ['gitmargin-test'] },
};

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
 * @param {{person?: string, coop?: boolean, clientId?: string, clientSecret?: string}} [options]
 */
export async function startFakeGitlab(options = {}) {
  const settings = {
    person: options.person || 'priya', // who types their password into the login form
    deny: false, // the person presses Deny on the approval page
    failToken: false, // the token call refuses, and hands nothing over
    coop: options.coop !== false, // cut the opener link, as the real pages do
  };
  const clientId = options.clientId || 'fake-gitlab-application-id';
  // Plainly made up. The real one is pasted into Vercel by the owner and never
  // appears in this repository.
  const clientSecret = options.clientSecret || 'fake-gitlab-application-value-for-tests';
  const redirectUris = new Set();
  const codes = new Map(); // code -> { person, redirectUri, challenge, used }
  const tokens = new Map(); // access token -> person key
  const approved = new Set(); // person keys that have pressed Authorize once
  const requests = []; // every call, for tests that assert what was (not) asked

  let origin = '';

  const pageHeaders = () => ({
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    ...(settings.coop ? { 'cross-origin-opener-policy': 'same-origin', 'x-frame-options': 'SAMEORIGIN' } : {}),
  });
  const page = (res, status, title, body, extra = {}) => {
    res.writeHead(status, { ...pageHeaders(), ...extra });
    res.end(`<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)}</title><h1>${escapeHtml(title)}</h1>${body}`);
  };
  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const redirect = (res, location, extra = {}) => {
    res.writeHead(302, { location, 'cache-control': 'no-store', ...extra });
    res.end();
  };

  /** The checks the authorize endpoint makes, shared with `approve()` below. */
  function checkAuthorize(params) {
    if (params.get('client_id') !== clientId) return 'unknown application';
    if (!redirectUris.has(params.get('redirect_uri'))) return 'redirect address is not registered';
    if (params.get('response_type') !== 'code') return 'unsupported response type';
    if (!String(params.get('scope') || '').split(' ').includes('openid')) return 'openid was not asked for';
    if (params.get('code_challenge_method') !== 'S256' || !params.get('code_challenge')) return 'a S256 challenge is required';
    return null;
  }

  function issueCode(params, personKey) {
    const code = randomBytes(16).toString('hex');
    codes.set(code, {
      person: personKey,
      redirectUri: params.get('redirect_uri'),
      challenge: params.get('code_challenge'),
      used: false,
    });
    const back = new URL(params.get('redirect_uri'));
    back.searchParams.set('code', code);
    if (params.get('state')) back.searchParams.set('state', params.get('state'));
    return back.toString();
  }

  function denied(params) {
    const back = new URL(params.get('redirect_uri'));
    back.searchParams.set('error', 'access_denied');
    if (params.get('state')) back.searchParams.set('state', params.get('state'));
    return back.toString();
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, origin);
    requests.push({ method: req.method, path: url.pathname });

    if (req.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
      return json(res, 200, {
        issuer: origin,
        authorization_endpoint: `${origin}/oauth/authorize`,
        token_endpoint: `${origin}/oauth/token`,
        userinfo_endpoint: `${origin}/oauth/userinfo`,
        scopes_supported: ['openid', 'profile', 'email', 'read_user', 'read_api', 'api'],
        claims_supported: ['iss', 'sub', 'name', 'nickname', 'preferred_username', 'groups', 'groups_direct'],
        code_challenge_methods_supported: ['plain', 'S256'],
        token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      });
    }

    // The login form. The cookie it sets is the whole point: see note 1 above.
    if (url.pathname === '/users/sign_in') {
      if (req.method === 'GET') {
        const next = url.searchParams.get('return') || '/';
        return page(
          res,
          200,
          'Fake GitLab: sign in',
          `<form method="post" action="/users/sign_in"><input type="hidden" name="return" value="${escapeHtml(next)}">` +
            `<button id="fake-sign-in" type="submit">Sign in as ${escapeHtml(PEOPLE[settings.person].name)}</button></form>`,
        );
      }
      const form = new URLSearchParams(await readBody(req));
      const next = form.get('return') || '/';
      // Only ever back to this fake: a test page must not be able to bounce through it.
      const safe = next.startsWith('/oauth/authorize?') ? next : '/';
      return redirect(res, safe, { 'set-cookie': `fake_gitlab_session=${settings.person}; Path=/; HttpOnly; SameSite=Lax` });
    }

    if (url.pathname === '/oauth/authorize') {
      const params = req.method === 'POST' ? new URLSearchParams(await readBody(req)) : url.searchParams;
      const problem = checkAuthorize(params);
      if (problem) return page(res, 400, 'Fake GitLab: refused', `<p id="fake-problem">${escapeHtml(problem)}</p>`);

      const personKey = cookieOf(req, 'fake_gitlab_session');
      if (!personKey || !PEOPLE[personKey]) {
        const query = new URLSearchParams(params);
        query.delete('decision');
        return redirect(res, `/users/sign_in?return=${encodeURIComponent(`/oauth/authorize?${query.toString()}`)}`);
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
        'Fake GitLab: authorize',
        `<p>An application wants to verify who you are (openid).</p><form method="post" action="/oauth/authorize">${hidden}` +
          '<button id="fake-authorize" name="decision" value="authorize" type="submit">Authorize</button> ' +
          '<button id="fake-deny" name="decision" value="deny" type="submit">Deny</button></form>',
      );
    }

    if (req.method === 'POST' && url.pathname === '/oauth/token') {
      const form = new URLSearchParams(await readBody(req));
      // Refuse first, before anything about the code is touched or handed over.
      if (settings.failToken) return json(res, 400, { error: 'invalid_grant', error_description: 'told to fail' });

      let id = form.get('client_id');
      let secret = form.get('client_secret');
      const basic = /^Basic (.+)$/i.exec(String(req.headers.authorization || ''));
      if (basic) [id, secret] = Buffer.from(basic[1], 'base64').toString('utf8').split(':');
      if (id !== clientId || secret !== clientSecret) return json(res, 401, { error: 'invalid_client' });

      const held = codes.get(form.get('code'));
      if (form.get('grant_type') !== 'authorization_code' || !held || held.used) return json(res, 400, { error: 'invalid_grant' });
      if (held.redirectUri !== form.get('redirect_uri')) return json(res, 400, { error: 'invalid_grant' });
      if (sha256url(form.get('code_verifier') || '') !== held.challenge) return json(res, 400, { error: 'invalid_grant' });

      held.used = true; // a code works once
      const accessToken = randomBytes(24).toString('hex');
      tokens.set(accessToken, held.person);
      return json(res, 200, { access_token: accessToken, token_type: 'Bearer', expires_in: 7200, scope: 'openid' });
    }

    if (req.method === 'GET' && url.pathname === '/oauth/userinfo') {
      const bearer = /^Bearer (.+)$/i.exec(String(req.headers.authorization || ''));
      const personKey = bearer && tokens.get(bearer[1]);
      if (!personKey) return json(res, 401, { error: 'invalid_token' });
      const person = PEOPLE[personKey];
      return json(res, 200, {
        sub: person.sub,
        sub_legacy: `legacy-${person.sub}`,
        name: person.name,
        nickname: person.nickname,
        preferred_username: person.nickname,
        profile: `${origin}/${person.nickname}`,
        picture: `${origin}/avatar/${person.sub}.png`,
        groups: person.groups,
      });
    }

    return json(res, 404, { error: 'not_found' });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;

  return {
    url: origin,
    clientId,
    clientSecret,
    requests,
    /** Register a callback address, as the application form on gitlab.com does. */
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
      if (problem) throw new Error(`fake GitLab refused: ${problem}`);
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
