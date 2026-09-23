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
      // Sign-in (issue #18): the provider's settings and the network call arrive
      // from outside, like the database and the clock. `origin` is this service's
      // own address, used to build the one callback the provider will accept; a
      // forged Host only produces an address the provider refuses.
      fetch: (...args) => fetch(...args),
      origin: `https://${req.headers['x-forwarded-host'] || req.headers.host}`,
      providers: {
        gitlab: {
          url: process.env.GITMARGIN_GITLAB_URL || 'https://gitlab.com',
          id: process.env.GITMARGIN_GITLAB_ID || '',
          secret: process.env.GITMARGIN_GITLAB_SECRET || '',
        },
        // Issue #17: a GitHub App's Client ID and a client secret made on its page.
        github: {
          url: process.env.GITMARGIN_GITHUB_URL || 'https://github.com',
          id: process.env.GITMARGIN_GITHUB_ID || '',
          secret: process.env.GITMARGIN_GITHUB_SECRET || '',
        },
      },
    },
  );
  res.statusCode = answer.status;
  for (const [name, value] of Object.entries(answer.headers)) res.setHeader(name, value);
  res.end(answer.body);
}
