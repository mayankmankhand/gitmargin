// Tiny static server for the fixture, used only by the design-critic loop:
// the toolkit's browse.js navigates http(s) URLs only, so a screenshot of the
// overlay needs the fixture served rather than opened from disk. The tests do
// NOT use this - they open the file directly, which is how a reviewer gets it.
//
// Usage: npm run serve  ->  prints the URL and stays up until Ctrl-C.
//
// It serves two directories and nothing else. An earlier version rooted itself
// at the repository, which meant a localhost port handed out PRIVATE-NOTES.md,
// .git/config and .env.local to anything that asked. Containment was never the
// problem; the root was (review R1).
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join, normalize, resolve, sep } from 'node:path';

// fileURLToPath, not URL.pathname: a pathname is percent-encoded, so a checkout
// under a directory with a space in its name would yield a root that does not
// exist and 404 everything (review R28).
const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** The only directories this server will read from. */
const SERVED = ['fixtures', 'dist'].map((d) => join(REPO, d));
const DEFAULT_FILE = 'fixtures/wizard.html';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

/** True when `p` is inside one of the served directories. */
const isServed = (p) => SERVED.some((dir) => p === dir || p.startsWith(dir + sep));

const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
  const filePath = join(REPO, rel === '' ? DEFAULT_FILE : rel);

  if (!isServed(filePath)) {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    // Resolve symlinks before reading: the path check above compares strings,
    // which a link pointing out of the served directory would walk straight past.
    const real = await realpath(filePath);
    if (!isServed(real)) {
      res.writeHead(404).end('Not found');
      return;
    }
    const body = await readFile(real);
    res.writeHead(200, { 'content-type': TYPES[extname(real)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  console.log(`gitmargin fixture: http://127.0.0.1:${port}/fixtures/wizard.html`);
});
