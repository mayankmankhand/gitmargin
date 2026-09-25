// The proof of trust from the command line's side (issue #33).
//
// Before any request that carries the author secret, the service must answer a
// fresh challenge with an HMAC keyed by that secret, over the host the command
// dialed. These tests put hostile servers where the author's service should be
// and check the one thing that matters: no request that reaches them carries
// the secret. Each hostile server records the authorization header of every
// request it gets, so "nothing leaked" is measured, not assumed; and each test
// also checks the server was asked at all, or a clean record would prove
// nothing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startService } from './helpers/service-server.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI = path.join(ROOT, 'bin', 'gitmargin.js');
const PAGE = '<!doctype html>\n<html><head><meta charset="utf-8"><title>t</title></head>\n<body><p>hi</p>\n</body></html>\n';
const WRONG = 'a-well-formed-secret-that-is-not-the-one-0123';

function run(args, env) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI, ...args],
      { env: { ...process.env, GITMARGIN_SECRET: '', GITMARGIN_SERVICE: '', GITMARGIN_VERCEL_BYPASS: '', ...env }, timeout: 30000 },
      (error, out, err) => resolve({ code: error ? error.code : 0, out, err })
    );
  });
}

async function world(t) {
  const service = await startService();
  const dir = mkdtempSync(path.join(tmpdir(), 'gitmargin-proof-'));
  const config = path.join(dir, 'config');
  mkdirSync(config);
  t.after(async () => {
    await service.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const source = path.join(dir, 'proto.html');
  writeFileSync(source, PAGE);
  const trustFile = path.join(config, 'trusted-services.json');
  const trusted = () => (existsSync(trustFile) ? JSON.parse(readFileSync(trustFile, 'utf8')) : []);
  const env = { GITMARGIN_CONFIG_DIR: config, GITMARGIN_SECRET: service.secret };
  return { service, dir, config, source, copy: path.join(dir, 'proto.gitmargin.html'), trustFile, trusted, env };
}

/** A server that records every request's path and authorization header, and answers with `handler`. */
async function hostile(t, handler) {
  const seen = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    seen.push({ path: req.url, authorization: req.headers.authorization || null });
    await handler(req, res, Buffer.concat(chunks).toString('utf8'));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections?.();
    return new Promise((resolve) => server.close(resolve));
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url,
    seen,
    asked: () => seen.some((r) => r.path === '/api/prove'),
    leaked: () => seen.filter((r) => r.authorization),
  };
}

const answer = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

/** Pass a proof request on to the real service, the way a relay on the internet would. */
async function relay(realUrl, body, extraHeaders = {}) {
  const forwarded = await fetch(`${realUrl}/api/prove`, { method: 'POST', headers: { 'content-type': 'application/json', ...extraHeaders }, body });
  return { status: forwarded.status, text: await forwarded.text() };
}

test('the real service proves itself, and only then is it remembered and sent the secret', async (t) => {
  const w = await world(t);
  const r = await run(['attach', w.source, '--service', w.service.url], w.env);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(w.trusted(), [w.service.url]);
});

test('a relay to the real service gets a proof over the real host, which does not match, and no secret', async (t) => {
  const w = await world(t);
  const evil = await hostile(t, async (req, res, body) => {
    if (req.url !== '/api/prove') return answer(res, 200, {});
    const { status, text } = await relay(w.service.url, body);
    answer(res, status, text);
  });
  const r = await run(['attach', w.source, '--service', evil.url], w.env);
  assert.equal(r.code, 2);
  assert.match(r.err, /could not prove it holds your author secret/);
  assert.match(r.err, /Nothing was sent/);
  assert.ok(evil.asked(), 'the relay was asked for a proof');
  assert.deepEqual(evil.leaked(), [], 'the secret reached the relay');
  assert.deepEqual(w.trusted(), [], 'a relay is never remembered');
  assert.ok(!existsSync(w.copy));
});

test('a relay that names itself in X-Forwarded-Host fares no better', async (t) => {
  const w = await world(t);
  const evil = await hostile(t, async (req, res, body) => {
    if (req.url !== '/api/prove') return answer(res, 200, {});
    const { status, text } = await relay(w.service.url, body, { 'x-forwarded-host': new URL(evil.url).host });
    answer(res, status, text);
  });
  const r = await run(['attach', w.source, '--service', evil.url], w.env);
  assert.equal(r.code, 2);
  assert.match(r.err, /could not prove/);
  assert.ok(evil.asked());
  assert.deepEqual(evil.leaked(), []);
});

test('a redirect to the real service is refused, never followed', async (t) => {
  const w = await world(t);
  const evil = await hostile(t, (req, res) => {
    res.writeHead(307, { location: `${w.service.url}${req.url}` });
    res.end();
  });
  const r = await run(['attach', w.source, '--service', evil.url], w.env);
  assert.equal(r.code, 2);
  assert.match(r.err, /answered with a redirect to http:\/\/127\.0\.0\.1:\d+\/api\/prove, and a redirect changes who is answering/);
  assert.deepEqual(evil.leaked(), []);
  assert.deepEqual(w.trusted(), [], 'only a passing proof puts an address on the list');
});

test('an old service without the proof is told apart by its words, and refused all the same', async (t) => {
  const w = await world(t);
  const old = await hostile(t, (req, res) => answer(res, 404, { error: 'not_found' }));
  const r = await run(['attach', w.source, '--service', old.url], w.env);
  assert.equal(r.code, 2);
  assert.match(r.err, /from before the proof of trust/);
  assert.match(r.err, /setup command/);
  assert.ok(old.asked());
  assert.deepEqual(old.leaked(), []);
  assert.deepEqual(w.trusted(), [], 'only a passing proof puts an address on the list');
});

test('a service with no secret, or a short one, says which, and gets nothing', async (t) => {
  const w = await world(t);
  for (const [secret, words] of [['', /has no author secret set/], ['s'.repeat(31), /shorter than 32 characters/]]) {
    const odd = await startService({ secret });
    t.after(() => odd.close());
    const r = await run(['attach', w.source, '--service', odd.url], w.env);
    assert.equal(r.code, 2, r.err);
    assert.match(r.err, words);
    assert.equal((await odd.query("select to_regclass('prototypes') as made"))[0].made, null, 'an author route was reached');
  }
});

test('a hand-written trust entry decides nothing: the address still has to prove itself', async (t) => {
  const w = await world(t);
  const evil = await hostile(t, (req, res) => answer(res, 200, { proof: 'ab'.repeat(32), host: 'somewhere.example' }));
  writeFileSync(w.trustFile, JSON.stringify([evil.url]));
  const r = await run(['attach', w.source, '--service', evil.url], w.env);
  assert.equal(r.code, 2);
  assert.ok(evil.asked());
  assert.deepEqual(evil.leaked(), []);
  assert.deepEqual(w.trusted(), [], 'a failed proof takes the address off the list');
  assert.match(r.err, /The service says it was reached as somewhere\.example; this command dialed 127\.0\.0\.1:\d+\./);
});

test("a host the server reports is printed only when it looks like a host name", async (t) => {
  const w = await world(t);
  const evil = await hostile(t, (req, res) => answer(res, 200, { proof: 'cd'.repeat(32), host: 'evil\u001b[2J.example' }));
  const r = await run(['attach', w.source, '--service', evil.url], w.env);
  assert.equal(r.code, 2);
  assert.ok(!r.err.includes('\u001b'), 'a terminal control sequence from the server reached the terminal');
  assert.doesNotMatch(r.err, /says it was reached as/);
});

test('--key with the wrong secret leaves no trust entry behind', async (t) => {
  const w = await world(t);
  const made = await run(['attach', w.source, '--service', w.service.url], w.env);
  assert.equal(made.code, 0, made.err);
  const key = /<meta name="gitmargin-key" content="([^"]+)"/.exec(readFileSync(w.copy, 'utf8'))[1];
  rmSync(w.trustFile);
  rmSync(w.copy);
  const r = await run(['attach', w.source, '--service', w.service.url, '--key', key], { ...w.env, GITMARGIN_SECRET: WRONG });
  assert.equal(r.code, 2);
  assert.deepEqual(w.trusted(), [], 'the address was remembered before anything was proven');
});

test('a mismatch takes the address off the list, and the right secret puts it back', async (t) => {
  const w = await world(t);
  writeFileSync(w.trustFile, JSON.stringify([w.service.url]));
  const wrong = await run(['attach', w.source, '--service', w.service.url], { ...w.env, GITMARGIN_SECRET: WRONG });
  assert.equal(wrong.code, 2);
  assert.deepEqual(w.trusted(), []);
  assert.equal((await run(['attach', w.source, '--service', w.service.url], w.env)).code, 0);
  assert.deepEqual(w.trusted(), [w.service.url]);
});

test('an answer far larger than a proof is refused, and so is silence (after 10 seconds)', async (t) => {
  const w = await world(t);
  const big = await hostile(t, (req, res) => answer(res, 200, JSON.stringify({ proof: 'x'.repeat(8000) })));
  const large = await run(['attach', w.source, '--service', big.url], w.env);
  assert.equal(large.code, 2);
  assert.match(large.err, /far more than a proof/);
  assert.deepEqual(big.leaked(), []);

  const quiet = await hostile(t, () => {}); // never answers
  const started = Date.now();
  const silent = await run(['attach', w.source, '--service', quiet.url], w.env);
  assert.equal(silent.code, 2, silent.err);
  assert.match(silent.err, /did not answer within 10 seconds/);
  assert.ok(Date.now() - started < 25000, 'it gave up on its own');
  assert.deepEqual(quiet.leaked(), []);
  assert.deepEqual(w.trusted(), [], 'only a passing proof puts an address on the list');
});

test('an address with a final dot is refused before anything happens', async (t) => {
  const w = await world(t);
  const r = await run(['attach', w.source, '--service', 'https://comments.example.'], w.env);
  assert.equal(r.code, 1);
  assert.match(r.err, /without the final dot/);
});
