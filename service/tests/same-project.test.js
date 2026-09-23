// Same-project mode (issue #19): a second deployment of the comment service,
// switched on with GITMARGIN_SAME_PROJECT=1, serves its one prototype as its own
// site behind the host's protection. The switch changes exactly three things
// (API.md, "Same-project mode"); each has a test here, and so does "with the
// switch off, nothing moved".

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startService } from '../../tests/helpers/service-server.js';

const SERVICE = fileURLToPath(new URL('..', import.meta.url));
const PAGE = '<!doctype html><html><head><title>p</title></head><body><p>hi</p></body></html>';

async function setUp(t, { sameProject = true } = {}) {
  const service = await startService({ sameProject });
  t.after(() => service.close());
  const call = async (method, route, { body, auth = false } = {}) => {
    const response = await fetch(`${service.url}${route}`, {
      method,
      redirect: 'manual',
      headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${service.secret}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let answer = null;
    try {
      answer = JSON.parse(text);
    } catch {
      /* a page */
    }
    return { status: response.status, headers: response.headers, text, answer };
  };
  const publish = async (name = 'onboarding.html') => {
    const made = await call('POST', '/api/prototypes', { body: { name }, auth: true });
    if (made.status !== 201) return made;
    await call('POST', `/api/prototypes/${made.answer.key}/versions`, { body: { hash: 'abc123', file: name, html: PAGE }, auth: true });
    return made;
  };
  return { service, call, publish };
}

test('the front door opens the one prototype, and says so plainly before there is one', async (t) => {
  const s = await setUp(t);
  const empty = await s.call('GET', '/');
  assert.equal(empty.status, 404);
  assert.ok(empty.text.includes('Nothing is published here yet'), empty.text);

  const { answer } = await s.publish();
  const door = await s.call('GET', '/');
  assert.equal(door.status, 302);
  assert.equal(door.headers.get('location'), `/p/${answer.key}/latest`);
  assert.equal(door.headers.get('cache-control'), 'no-store');
});

test('pages are served as ordinary pages of the site: no sandbox, and the other page headers kept', async (t) => {
  const s = await setUp(t);
  const { answer } = await s.publish();
  const page = await s.call('GET', `/p/${answer.key}/latest`);
  assert.equal(page.status, 200);
  assert.equal(page.text, PAGE);
  assert.equal(page.headers.get('content-security-policy'), null, 'a same-project page was sandboxed');
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(page.headers.get('cache-control'), 'no-store');
});

test('one prototype per deployment: a second is refused with the key of the first', async (t) => {
  const s = await setUp(t);
  const first = await s.publish('one.html');
  assert.equal(first.status, 201);
  const second = await s.publish('two.html');
  assert.equal(second.status, 409);
  assert.deepEqual(second.answer, { error: 'one_prototype', key: first.answer.key });
  assert.equal((await s.service.query('select count(*)::int as n from prototypes'))[0].n, 1);
  // Versions of the one prototype still go in as usual.
  const v2 = await s.call('POST', `/api/prototypes/${first.answer.key}/versions`, { body: { hash: 'def456', html: PAGE }, auth: true });
  assert.equal(v2.answer.version_id, 'v2-def456');
});

test('two creates at the same moment still leave one prototype', async (t) => {
  const s = await setUp(t);
  const results = await Promise.all([s.publish('a.html'), s.publish('b.html'), s.publish('c.html')]);
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal((await s.service.query('select count(*)::int as n from prototypes'))[0].n, 1);
});

test('with the switch off, nothing moved: sandboxed pages, no front door, any number of prototypes', async (t) => {
  const s = await setUp(t, { sameProject: false });
  const one = await s.publish('one.html');
  assert.equal((await s.publish('two.html')).status, 201);
  const page = await s.call('GET', `/p/${one.answer.key}/latest`);
  assert.match(page.headers.get('content-security-policy'), /^sandbox /);
  const door = await s.call('GET', '/');
  assert.equal(door.status, 404);
  assert.deepEqual(door.answer, { error: 'not_found' });
});

test('on Vercel every path reaches the one function, and nothing static can win over it', () => {
  const config = JSON.parse(readFileSync(path.join(SERVICE, 'vercel.json'), 'utf8'));
  assert.deepEqual(config.rewrites, [{ source: '/(.*)', destination: '/api/index' }]);
  // Vercel serves a file on disk before any rewrite, so a stray index.html or
  // public/ folder would take `/` away from the front door.
  for (const name of ['index.html', 'public']) assert.equal(existsSync(path.join(SERVICE, name)), false, name);
});

test('the deployment switch is exactly GITMARGIN_SAME_PROJECT=1', () => {
  const entry = readFileSync(path.join(SERVICE, 'api', 'index.js'), 'utf8');
  assert.match(entry, /sameProject: process\.env\.GITMARGIN_SAME_PROJECT === '1'/);
});
