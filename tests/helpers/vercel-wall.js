// Vercel's login wall, in front of a test comment service (issue #19).
//
// Same-project mode rests on one claim: nothing about the prototype or its
// comments answers anyone who has not passed the host's protection, because the
// host refuses them before the service sees the request. This proxy plays the
// host. Without its login cookie or the automation bypass header, every request
// is sent to a login page, the browser's pre-flight check included, which is
// what the real Vercel answered on 2026-09-23 (a 302 to its own login, for the
// page, `/api/...` and OPTIONS alike). With either, the request goes through to
// the service untouched.
//
// It answers on one port under two host names, `127.0.0.1` and `localhost`. A
// browser keeps a separate cookie for each, so one deployment has two addresses
// with two logins, the way a Vercel project's main address and a deployment
// address do.
//
// The bypass value is plainly made up: the real one is created by the owner in
// Vercel's settings and never appears in this repository.

import http from 'node:http';

export const FAKE_BYPASS = 'fake-vercel-bypass-for-tests-0000000000';

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * @param {string} target the service behind the wall, e.g. http://127.0.0.1:1234
 * @param {{bypass?: string, host?: string}} [options] `host` is where it listens:
 *   another loopback address, such as 127.0.0.2, stands in for a plain-http
 *   address that is not this computer.
 */
export async function startVercelWall(target, { bypass = FAKE_BYPASS, host = '127.0.0.1' } = {}) {
  const seen = []; // every request: what it asked for and what it carried

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://wall.local');
    const cookie = /(?:^|;\s*)_vercel_jwt=([^;]+)/.exec(String(req.headers.cookie || ''));
    const passed = Boolean(cookie && cookie[1] === 'passed');
    const bypassed = req.headers['x-vercel-protection-bypass'] === bypass;
    seen.push({ method: req.method, path: url.pathname, host: req.headers.host, passed, bypassed, bypassHeader: req.headers['x-vercel-protection-bypass'] || null });

    // The login page: one button, which sets the cookie for this host name only.
    // At `/sso-api`, the path of Vercel's own login (measured 2026-09-23).
    if (url.pathname === '/sso-api') {
      const next = (url.searchParams.get('next') || '/').startsWith('/') ? url.searchParams.get('next') || '/' : '/';
      if (req.method === 'POST') {
        res.writeHead(303, { location: next, 'set-cookie': '_vercel_jwt=passed; Path=/; HttpOnly; SameSite=Lax', 'cache-control': 'no-store' });
        return res.end();
      }
      // An ordinary 200 page, as Vercel's own login is: a client that follows the
      // redirect sees a page that looks like success, which is why the command
      // line must never follow it.
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(
        `<!doctype html><title>Log in to Vercel</title><h1 id="wall">Log in to Vercel</h1>` +
          `<form method="post" action="/sso-api?next=${encodeURIComponent(next)}"><button id="wall-login">Continue</button></form>`,
      );
    }

    if (!passed && !bypassed) {
      res.writeHead(302, { location: `/sso-api?next=${encodeURIComponent(url.pathname + url.search)}`, 'content-type': 'text/plain', 'cache-control': 'no-store' });
      return res.end(`Redirecting to ${escapeHtml('/sso-api')}...`);
    }

    // Through the wall: the service answers as it would on Vercel, which hands
    // the function the Host the client asked for. The proof of trust (issue
    // #33) signs over that Host, so it has to arrive unchanged. Node's fetch
    // replaces a Host header with the target's own, so this forwards with
    // http.request, which keeps it.
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
    const headers = { ...req.headers };
    delete headers.connection;
    const to = new URL(target);
    const upstream = await new Promise((resolve, reject) => {
      const forward = http.request({ hostname: to.hostname, port: to.port, path: req.url, method: req.method, headers }, resolve);
      forward.on('error', reject);
      forward.end(body);
    });
    const chunks = [];
    for await (const chunk of upstream) chunks.push(chunk);
    const out = {};
    for (const [name, value] of Object.entries(upstream.headers)) {
      if (!['content-length', 'transfer-encoding', 'connection', 'content-encoding'].includes(name)) out[name] = value;
    }
    res.writeHead(upstream.statusCode, out);
    res.end(Buffer.concat(chunks));
  });

  await new Promise((resolve) => server.listen(0, host, resolve));
  const port = server.address().port;
  return {
    url: `http://${host}:${port}`,
    // The same deployment under a second name, with a login of its own.
    otherUrl: `http://localhost:${port}`,
    bypass,
    seen,
    close: async () => {
      if (!server.listening) return;
      await new Promise((resolve) => server.close(resolve));
      server.closeAllConnections?.();
    },
  };
}
