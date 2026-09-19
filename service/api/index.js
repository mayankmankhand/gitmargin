// The Vercel wrapper. `vercel.json` rewrites every path here, so stored pages
// under /p/... and the API under /api/... reach the same router. It holds no
// logic of its own: it turns Vercel's request into the plain object the router
// takes, and the router's plain answer back into a response.

import { route } from '../src/router.js';
import { query } from '../src/db-neon.js';

export default async function handler(req, res) {
  // After a rewrite `req.url` is still the address the caller asked for.
  const url = new URL(req.url, 'http://service.local');
  const answer = await route(
    {
      method: req.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: req.headers,
      body: req.body,
    },
    {
      query,
      now: () => new Date(),
      secret: process.env.GITMARGIN_SECRET || '',
      log: (error) => console.error(error),
    },
  );
  res.statusCode = answer.status;
  for (const [name, value] of Object.entries(answer.headers)) res.setHeader(name, value);
  res.end(answer.body);
}
