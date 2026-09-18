// The comment service, running locally for tests.
//
// It calls the same `route` function Vercel calls, over an in-process Postgres
// on a random loopback port, so the CLI and browser suites exercise the real
// handlers with no network, no account and no Docker. The clock is the
// caller's to move: limits and "changed since" are about time, and a test that
// waits for real time is a slow test that still flakes.

import http from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import { route } from '../../service/src/router.js';

/** A `query(sql, params) -> rows` function over a fresh in-process database. */
export function memoryDatabase() {
  const db = new PGlite();
  const query = async (sql, params = []) => (await db.query(sql, params)).rows;
  return { query, close: () => db.close() };
}

/** A clock that only moves when told to. */
export function testClock(start = '2026-09-18T12:00:00.000Z') {
  let at = new Date(start).getTime();
  return {
    now: () => new Date(at),
    advance: (ms) => {
      at += ms;
    },
  };
}

/**
 * @param {{secret?: string, clock?: {now: () => Date}, down?: () => boolean}} [options]
 *   `down` lets a test take the service away mid-session and bring it back.
 */
export async function startService(options = {}) {
  const secret = options.secret === undefined ? 'test-secret-test-secret' : options.secret;
  const clock = options.clock || { now: () => new Date() };
  const database = memoryDatabase();

  const server = http.createServer(async (req, res) => {
    if (options.down && options.down()) {
      req.socket.destroy();
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    let body = null;
    try {
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
    } catch {
      body = null;
    }
    const url = new URL(req.url, 'http://service.local');
    const answer = await route(
      { method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers: req.headers, body },
      { query: database.query, now: clock.now, secret },
    );
    res.writeHead(answer.status, answer.headers);
    res.end(answer.body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    secret,
    query: database.query,
    // Safe to call twice: a test may take the service away on purpose and the
    // cleanup hook will still call this afterwards.
    close: async () => {
      if (!server.listening) return;
      await new Promise((resolve) => server.close(resolve));
      server.closeAllConnections?.();
      await database.close();
    },
  };
}
