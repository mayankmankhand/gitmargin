// Tiny static server for the fixture, used only by the design-critic loop:
// .claude/scripts/browse.js navigates http(s) URLs only, so a screenshot of the
// overlay needs the fixture served rather than opened from disk. The tests do
// NOT use this - they open the file directly, which is how a reviewer gets it.
//
// Usage: npm run serve  ->  prints the URL and stays up until Ctrl-C.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
  const filePath = join(ROOT, rel === '' ? 'fixtures/wizard.html' : rel);

  // Containment by resolved path plus separator, never by string prefix alone
  // (LESSONS: "A containment check that compares path strings is not containment").
  if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { 'content-type': TYPES[extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  console.log(`gitmargin fixture: http://127.0.0.1:${port}/fixtures/wizard.html`);
});
