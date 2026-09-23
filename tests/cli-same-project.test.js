// The command line in front of Vercel's login wall (issue #19). A same-project
// deployment sits behind the host's protection, so `attach --service` and the
// other commands reach it with Vercel's automation bypass, under the rule the
// author secret already follows: only to an address the author typed or named in
// GITMARGIN_SERVICE. Without it, they stop and name the wall. The wall is
// tests/helpers/vercel-wall.js in front of the real router on an in-process
// Postgres; attached copies go to a scratch folder, never into the repo.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startService } from './helpers/service-server.js';
import { startVercelWall } from './helpers/vercel-wall.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI = path.join(ROOT, 'bin', 'gitmargin.js');
const PAGE = '<!doctype html>\n<html><head><meta charset="utf-8"><title>t</title></head>\n<body><p>hi</p>\n</body></html>\n';

/** One config folder per test, so what one test typed is never trusted in another. */
function run(args, env = {}, config) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI, ...args],
      { env: { ...process.env, GITMARGIN_SECRET: '', GITMARGIN_SERVICE: '', GITMARGIN_VERCEL_BYPASS: '', GITMARGIN_CONFIG_DIR: config, ...env } },
      (error, out, err) => resolve({ code: error ? error.code : 0, out, err })
    );
  });
}

async function setup(t) {
  const service = await startService({ sameProject: true });
  const wall = await startVercelWall(service.url);
  const dir = mkdtempSync(path.join(tmpdir(), 'gitmargin-same-project-'));
  const config = path.join(dir, 'config');
  mkdirSync(config);
  t.after(async () => {
    await wall.close();
    await service.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const source = path.join(dir, 'proto.html');
  writeFileSync(source, PAGE);
  const cli = (args, env = {}) => run(args, { GITMARGIN_SECRET: service.secret, ...env }, config);
  return { service, wall, dir, source, copy: path.join(dir, 'proto.gitmargin.html'), cli };
}

test('attach reaches a protected deployment with the bypass, on every call it makes', async (t) => {
  const s = await setup(t);
  const r = await s.cli(['attach', s.source, '--service', s.wall.url], { GITMARGIN_VERCEL_BYPASS: s.wall.bypass });
  assert.equal(r.code, 0, r.err);
  assert.ok(existsSync(s.copy));
  const calls = s.wall.seen.filter((c) => c.path.startsWith('/api/prototypes'));
  assert.ok(calls.length >= 3, 'register, version, page');
  assert.ok(calls.every((c) => c.bypassed), 'a call went without the bypass');
  // The one call made without it on purpose: the check that the address is walled.
  const probe = s.wall.seen.filter((c) => c.path === '/api/ping');
  assert.equal(probe.length, 1);
  assert.equal(probe[0].bypassHeader, null, 'the open-address check carried the bypass, so it could never see an open address');
  // The bypass never lands in the page.
  assert.ok(!readFileSync(s.copy, 'utf8').includes(s.wall.bypass), 'the bypass was written into the page');

  // pull --live comes back through the wall the same way.
  const pulled = await s.cli(['pull', s.copy, '--live'], { GITMARGIN_VERCEL_BYPASS: s.wall.bypass });
  assert.equal(pulled.code, 0, pulled.err);
  assert.equal(JSON.parse(pulled.out).gitmargin, '0.1');
});

test('without the bypass the command stops, names Vercel\'s protection, and writes nothing', async (t) => {
  const s = await setup(t);
  const r = await s.cli(['attach', s.source, '--service', s.wall.url]);
  assert.equal(r.code, 2);
  assert.match(r.err, /is behind Vercel's protection/);
  assert.match(r.err, /GITMARGIN_VERCEL_BYPASS/);
  assert.equal(existsSync(s.copy), false, 'a copy was written');
  assert.equal((await s.service.query("select to_regclass('prototypes') as t"))[0].t, null, 'the service was reached');
});

test('a wrong bypass is named as refused, not as missing', async (t) => {
  const s = await setup(t);
  const r = await s.cli(['attach', s.source, '--service', s.wall.url], { GITMARGIN_VERCEL_BYPASS: 'not-the-bypass-at-all' });
  assert.equal(r.code, 2);
  assert.match(r.err, /refused the bypass secret/);
});

test('the bypass never follows an address that only a file names', async (t) => {
  const s = await setup(t);
  assert.equal((await s.cli(['attach', s.source, '--service', s.wall.url], { GITMARGIN_VERCEL_BYPASS: s.wall.bypass })).code, 0);

  // A copy that came back naming some other protected address.
  const other = await startService({ sameProject: true });
  const otherWall = await startVercelWall(other.url, { bypass: s.wall.bypass });
  t.after(async () => {
    await otherWall.close();
    await other.close();
  });
  const forged = path.join(s.dir, 'forged.gitmargin.html');
  writeFileSync(forged, readFileSync(s.copy, 'utf8').replace(s.wall.url, otherWall.url));
  const r = await s.cli(['pull', forged, '--live'], { GITMARGIN_VERCEL_BYPASS: s.wall.bypass });
  assert.notEqual(r.code, 0);
  assert.match(r.err, /only goes to an address you typed/);
  assert.equal(otherWall.seen.filter((c) => c.bypassHeader).length, 0, 'the bypass reached an address only a file named');
});

test('the bypass never goes in the clear, even to an address the author named', async (t) => {
  const s = await setup(t);
  assert.equal((await s.cli(['attach', s.source, '--service', s.wall.url], { GITMARGIN_VERCEL_BYPASS: s.wall.bypass })).code, 0);

  // The same service behind a wall on plain http at an address that is not
  // loopback by name: 127.0.0.2 reaches this computer, but the command line
  // cannot know that, so it treats it like any address across a network.
  const plain = await startVercelWall(s.service.url, { host: '127.0.0.2' });
  t.after(() => plain.close());
  const copy = path.join(s.dir, 'plain.gitmargin.html');
  writeFileSync(copy, readFileSync(s.copy, 'utf8').replace(s.wall.url, plain.url));
  const r = await s.cli(['pull', copy, '--live'], { GITMARGIN_VERCEL_BYPASS: s.wall.bypass, GITMARGIN_SERVICE: plain.url });
  assert.notEqual(r.code, 0);
  assert.ok(plain.seen.length > 0, 'the pull never reached the address, so this proves nothing');
  assert.equal(plain.seen.filter((c) => c.bypassHeader).length, 0, 'the bypass crossed plain http');
});

test('a second prototype is refused with the first one\'s key, and nothing is written', async (t) => {
  const s = await setup(t);
  const env = { GITMARGIN_VERCEL_BYPASS: s.wall.bypass };
  const first = await s.cli(['attach', s.source, '--service', s.wall.url], env);
  assert.equal(first.code, 0, first.err);
  const key = /<meta name="gitmargin-key" content="([^"]+)"/.exec(readFileSync(s.copy, 'utf8'))[1];

  const elsewhere = path.join(s.dir, 'other');
  mkdirSync(elsewhere);
  const second = path.join(elsewhere, 'second.html');
  writeFileSync(second, PAGE.replace('hi', 'another page'));
  const r = await s.cli(['attach', second, '--service', s.wall.url], env);
  assert.equal(r.code, 2);
  assert.match(r.err, new RegExp(`already holds one \\(key ${key}\\)`));
  assert.match(r.err, new RegExp(`--key ${key}`));
  assert.equal(existsSync(path.join(elsewhere, 'second.gitmargin.html')), false, 'a copy was written');

  // The way it names works: the same key publishes the next version.
  const again = await s.cli(['attach', second, '--service', s.wall.url, '--key', key], env);
  assert.equal(again.code, 0, again.err);
  assert.match(readFileSync(path.join(elsewhere, 'second.gitmargin.html'), 'utf8'), /<meta name="gitmargin-version" content="v2-/);
});

test('publishing to a same-project address that answers without Vercel\'s login says so (review of #19, R16)', async (t) => {
  const s = await setup(t);
  // Straight to the service: nothing in front of it, as with Vercel's default protection on the main address.
  const open = await s.cli(['attach', s.source, '--service', s.service.url]);
  assert.equal(open.code, 0, open.err);
  assert.match(open.err, /answers without Vercel's login/);
  assert.match(open.err, /choose All Deployments/);

  // Behind the wall, the same publish says nothing about it.
  const walled = await s.cli(['attach', s.source, '--service', s.wall.url, '--key', /<meta name="gitmargin-key" content="([^"]+)"/.exec(readFileSync(s.copy, 'utf8'))[1]], { GITMARGIN_VERCEL_BYPASS: s.wall.bypass });
  assert.equal(walled.code, 0, walled.err);
  assert.ok(!/answers without Vercel's login/.test(walled.err), walled.err);
});

test('a redirect that is not Vercel\'s login is named with where it points, not blamed on the bypass (review of #19, R18)', async (t) => {
  const s = await setup(t);
  const moved = http.createServer((req, res) => res.writeHead(301, { location: 'https://www.example.test/' }).end());
  await new Promise((done) => moved.listen(0, '127.0.0.1', done));
  t.after(() => moved.close());
  const address = `http://127.0.0.1:${moved.address().port}`;
  const r = await s.cli(['attach', s.source, '--service', address], { GITMARGIN_VERCEL_BYPASS: s.wall.bypass });
  assert.equal(r.code, 2);
  assert.match(r.err, /answered with a redirect to https:\/\/www\.example\.test\//);
  assert.ok(!/refused the bypass/.test(r.err), 'a moved address was blamed on the bypass secret');
});
