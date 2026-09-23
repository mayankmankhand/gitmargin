// Which address a shared page talks to (issue #19, API.md "Same-project mode").
// A page the comment service serves as its own site, at <origin>/p/<its own
// key>/..., talks to the address it was opened from, so a host's per-address
// login rides along; every other page talks to the address written into it.
// Plain Node: the rule as a function, then the sync module using it for its
// three kinds of address (comment calls, the sign-in window, older versions).

import test from 'node:test';
import assert from 'node:assert/strict';

// store.js reads `location.pathname` for its storage key; Node has no location.
globalThis.location = { pathname: '/p/gm_samesamesame0000/latest' };

const { serviceAddress, startSync } = await import('../src/overlay/sync.js');

const KEY = 'gm_samesamesame0000';
const stamp = { service: 'https://written.example', key: KEY, versionId: 'v1-abc123' };
const at = (href) => {
  const u = new URL(href);
  return { protocol: u.protocol, origin: u.origin, pathname: u.pathname };
};

test('a page served at its own /p/<key>/... talks to the address it was opened from', () => {
  assert.equal(serviceAddress(stamp, at(`https://proto.vercel.app/p/${KEY}/latest`)), 'https://proto.vercel.app');
  assert.equal(serviceAddress(stamp, at(`https://proto-abc123-team.vercel.app/p/${KEY}/v2-def456`)), 'https://proto-abc123-team.vercel.app');
  assert.equal(serviceAddress(stamp, at(`http://127.0.0.1:4000/p/${KEY}/v12-0a1b2c`)), 'http://127.0.0.1:4000');
});

test('everything else talks to the address written into the page', () => {
  const written = 'https://written.example';
  // Another prototype's page, a lookalike path, a page elsewhere on the site.
  assert.equal(serviceAddress(stamp, at('https://proto.vercel.app/p/gm_someoneelse00000/latest')), written);
  assert.equal(serviceAddress(stamp, at(`https://proto.vercel.app/p/${KEY}/latest/extra`)), written);
  assert.equal(serviceAddress(stamp, at(`https://proto.vercel.app/x/p/${KEY}/latest`)), written);
  assert.equal(serviceAddress(stamp, at(`https://proto.vercel.app/p/${KEY}/not-a-version`)), written);
  assert.equal(serviceAddress(stamp, at('https://pages.example/onboarding.gitmargin.html')), written);
  // A file on disk, and a sandboxed stored copy, whose origin is "null".
  assert.equal(serviceAddress(stamp, at('file:///home/me/onboarding.gitmargin.html')), written);
  assert.equal(serviceAddress(stamp, { protocol: 'https:', origin: 'null', pathname: `/p/${KEY}/latest` }), written);
  // No location at all, or one that cannot be read.
  assert.equal(serviceAddress(stamp, null), written);
  assert.equal(serviceAddress(stamp, { get protocol() { throw new Error('sandboxed'); } }), written);
});

test('the sync module uses that address for the comments, the sign-in window and the older versions', async () => {
  const store = await import('../src/overlay/store.js?same-origin=1');
  store.load(stamp.versionId);
  const calls = [];
  const opened = [];
  const queue = [];
  const timers = { set: (fn) => (queue.push(fn), queue.length), clear: () => {} };
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        prototype: { name: 'onboarding.html', identity: 'github', read: 'open', members: null },
        latest: stamp.versionId,
        version: stamp.versionId,
        versions: [],
        comments: [],
        server_time: '2026-09-23T10:00:00.000Z',
      }),
    };
  };
  const sync = startSync({
    stamp,
    store,
    fetchImpl,
    timers,
    storage: new Map(),
    isHidden: () => false,
    onVisible: () => {},
    openWindow: (url) => (opened.push(url), {}),
    pageLocation: () => at(`https://proto-abc123-team.vercel.app/p/${KEY}/latest`),
  });
  // Run what the sync module queued (its first check-in) until it settles.
  for (let i = 0; i < 5 && queue.length; i++) await queue.shift()();
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(calls.length > 0, 'no call was made');
  for (const url of calls) assert.ok(url.startsWith('https://proto-abc123-team.vercel.app/api/p/'), url);
  assert.equal(sync.pageUrl('v1-abc123'), `https://proto-abc123-team.vercel.app/p/${KEY}/v1-abc123`);
  sync.signIn();
  assert.equal(opened.length, 1);
  assert.ok(opened[0].startsWith(`https://proto-abc123-team.vercel.app/auth/start?key=${KEY}&code_hash=`), opened[0]);
  sync.stop();
});
