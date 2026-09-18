// Every request the service answers goes through `route`.
//
// It takes a plain object and returns a plain object, and imports no package.
// That is deliberate: Vercel calls it through `api/index.js`, the tests call it
// through `tests/helpers/service-server.js`, and because neither wrapper holds
// any logic the two can never drift apart. The database arrives as one
// function, `query(sql, params) -> rows`, so production hands in Neon and the
// tests hand in an in-process Postgres.

/**
 * A page opened from disk has the origin "null", and a stored page is served
 * sandboxed, which gives it an opaque origin too. Neither can be named in an
 * allow-list, so the service answers any origin and relies on the page key
 * (and, for the author, the secret) instead. No cookies are ever used, so an
 * open origin exposes nothing a caller could not already reach with curl.
 */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization, x-gitmargin-token',
  'access-control-max-age': '86400',
};

const json = (status, body) => ({
  status,
  headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

/**
 * @param {{method: string, path: string, headers: Record<string,string>, body: unknown}} request
 * @param {{query: (sql: string, params?: unknown[]) => Promise<object[]>, now: () => Date, secret: string}} deps
 * @returns {Promise<{status: number, headers: Record<string,string>, body: string}>}
 */
export async function route(request, deps) {
  const method = String(request.method || 'GET').toUpperCase();
  const path = String(request.path || '/').replace(/\/+$/, '') || '/';

  // The browser asks permission before any request that carries a JSON body or
  // a custom header. Answer it for every path, or nothing else is reachable.
  if (method === 'OPTIONS') return { status: 204, headers: CORS, body: '' };

  try {
    if (method === 'GET' && path === '/api/ping') {
      const rows = await deps.query('select 1 as ok');
      return json(200, { ok: rows[0]?.ok === 1, time: deps.now().toISOString() });
    }
    return json(404, { error: 'not_found' });
  } catch {
    // A raw database error names tables and hosts. The caller gets a plain
    // refusal it can show; the detail stays in the function's own log.
    return json(503, { error: 'service_unavailable' });
  }
}
