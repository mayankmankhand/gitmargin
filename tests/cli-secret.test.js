// Where the author secret comes from (issue #36): GITMARGIN_SECRET when it is
// set, otherwise the file "secret" in gitmargin's settings folder. A file needs
// no profile line, so nothing has to restart after setup.
//
// Every run uses its own scratch settings folder (GITMARGIN_CONFIG_DIR), so no
// test here can read the secret file of the person running the tests. A bad
// file must be refused before anything is sent, so those cases run against a
// server that only counts the requests it receives.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { startService } from './helpers/service-server.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI = path.join(ROOT, 'bin', 'gitmargin.js');
const PAGE = '<!doctype html>\n<html><head><meta charset="utf-8"><title>t</title></head>\n<body><p>hi</p>\n</body></html>\n';
const OTHER = 'another-secret-this-machine-also-holds-0123';

/** Async, because the service it calls runs in this process. The timeout is the "never hangs" guard. */
function run(args, env) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI, ...args],
      { env: { ...process.env, GITMARGIN_SECRET: '', GITMARGIN_SERVICE: '', GITMARGIN_VERCEL_BYPASS: '', ...env }, timeout: 15000 },
      (error, out, err) => resolve({ code: error ? error.code : 0, killed: Boolean(error && error.killed), out, err })
    );
  });
}

/** A settings folder and a prototype, both in scratch space. */
function world(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gitmargin-secret-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const config = path.join(dir, 'config');
  mkdirSync(config, { mode: 0o700 });
  const source = path.join(dir, 'proto.html');
  writeFileSync(source, PAGE);
  const file = path.join(config, 'secret');
  const put = (content, mode = 0o600) => {
    writeFileSync(file, content, { mode });
    chmodSync(file, mode);
  };
  return { dir, config, source, file, put, env: { GITMARGIN_CONFIG_DIR: config } };
}

async function started(t, options) {
  const service = await startService(options);
  t.after(() => service.close());
  return service;
}

/** A server that answers nothing useful and counts what reaches it. */
async function counter(t) {
  let requests = 0;
  const server = http.createServer((req, res) => {
    requests += 1;
    res.writeHead(500);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return { url: `http://127.0.0.1:${server.address().port}`, count: () => requests };
}

const services = async (w, env = {}) => {
  const r = await run(['services', '--json'], { ...w.env, ...env });
  assert.equal(r.code, 0, r.err);
  return { ...JSON.parse(r.out), raw: r.out + r.err };
};

test('with no secret anywhere, services says so and names no problem', async (t) => {
  const w = world(t);
  const answer = await services(w);
  assert.equal(answer.secretSet, false);
  assert.equal(answer.secretFrom, null);
  assert.equal(answer.secretProblem, null);
});

test('with GITMARGIN_SECRET unset, the file is used: no profile line, no restart', async (t) => {
  const w = world(t);
  const service = await started(t);
  w.put(service.secret);
  const r = await run(['attach', w.source, '--service', service.url], w.env);
  assert.equal(r.code, 0, r.err);

  const answer = await services(w);
  assert.equal(answer.secretSet, true);
  assert.equal(answer.secretFrom, 'file');
  assert.ok(!answer.raw.includes(service.secret), 'the value is never shown');
  const text = await run(['services'], w.env);
  assert.ok(text.out.includes(`Author secret (${w.file}): set`), text.out);
});

test('a link to a private file counts: the file it points at is what is checked', async (t) => {
  const w = world(t);
  const service = await started(t);
  const real = path.join(w.dir, 'kept-elsewhere');
  writeFileSync(real, service.secret, { mode: 0o600 });
  symlinkSync(real, w.file);
  assert.equal((await run(['attach', w.source, '--service', service.url], w.env)).code, 0);
});

test('a BOM and one final line break are ignored, as an editor or echo adds them', async (t) => {
  const w = world(t);
  const service = await started(t);
  for (const content of [`﻿${service.secret}\n`, `${service.secret}\r\n`]) {
    w.put(content);
    const r = await run(['attach', w.source, '--service', service.url], w.env);
    assert.equal(r.code, 0, `${JSON.stringify(content.slice(0, 1))}: ${r.err}`);
  }
});

test('GITMARGIN_SECRET wins over the file, and a difference is noted without either value', async (t) => {
  const w = world(t);
  const service = await started(t);
  w.put(OTHER);
  const r = await run(['attach', w.source, '--service', service.url], { ...w.env, GITMARGIN_SECRET: service.secret });
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /GITMARGIN_SECRET and .*secret hold different secrets; using GITMARGIN_SECRET/);
  assert.ok(!r.err.includes(service.secret) && !r.err.includes(OTHER), 'neither value is printed');

  // The other way round: the environment holds the wrong one, so the right file is not used.
  w.put(service.secret);
  const wrong = await run(['attach', w.source, '--service', service.url], { ...w.env, GITMARGIN_SECRET: OTHER });
  assert.notEqual(wrong.code, 0);
  assert.equal((await services(w, { GITMARGIN_SECRET: OTHER })).secretFrom, 'environment');
});

test('a secret file that cannot be trusted is refused before anything is sent, and never quoted', async (t) => {
  const cases = [
    { name: 'empty', make: (w) => w.put(''), problem: /is empty/ },
    { name: 'readable by others', make: (w) => w.put(OTHER, 0o644), problem: /can be read by other users.*chmod 600/ },
    { name: 'a pipe', make: (w) => execFileSync('mkfifo', ['-m', '600', w.file]), problem: /is not a plain file/ },
    { name: 'a folder', make: (w) => mkdirSync(w.file, { mode: 0o700 }), problem: /is not a plain file/ },
    { name: 'too large', make: (w) => w.put('x'.repeat(5000)), problem: /larger than a secret can be/ },
    { name: 'a space inside', make: (w) => w.put('abcdefghijklmnop qrstuvwxyz0123456789'), problem: /space or a line break/ },
    { name: 'two final line breaks', make: (w) => w.put(`${OTHER}\n\n`), problem: /space or a line break/ },
    { name: '31 characters', make: (w) => w.put('y'.repeat(31)), problem: /shorter than 32 characters/ },
  ];
  const server = await counter(t);
  for (const c of cases) {
    const w = world(t);
    c.make(w);
    const r = await run(['attach', w.source, '--service', server.url], w.env);
    assert.equal(r.killed, false, `${c.name}: must not hang`);
    assert.equal(r.code, 1, `${c.name}: ${r.err}`);
    assert.match(r.err, c.problem, c.name);
    assert.match(r.err, /Nothing was sent/, c.name);
    assert.ok(!r.err.includes(OTHER), `${c.name}: the content is never quoted`);

    const answer = await services(w);
    assert.equal(answer.secretSet, false, c.name);
    assert.match(answer.secretProblem, c.problem, c.name);
  }
  assert.equal(server.count(), 0, 'not one request reached the service');
});

test('a short GITMARGIN_SECRET is refused the same way, before anything is sent', async (t) => {
  const w = world(t);
  const server = await counter(t);
  const r = await run(['attach', w.source, '--service', server.url], { ...w.env, GITMARGIN_SECRET: 'z'.repeat(31) });
  assert.equal(r.code, 1);
  assert.match(r.err, /GITMARGIN_SECRET holds a secret shorter than 32 characters/);
  assert.equal(server.count(), 0);
});
