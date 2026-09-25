// The proof of trust (issue #33): `POST /api/prove`, tested through `route`.
//
// The command line hands the author secret only to a service that answers a
// fresh challenge with an HMAC keyed by it. These tests pin the three things
// the security review found the design rests on: the HMAC names the Host the
// request arrived with and nothing a client can set, a relay therefore gets a
// proof over the wrong host, and a short secret is never signed with.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { MIN_SECRET_LENGTH, PROOF_LABEL, proofHost, route } from '../src/router.js';

const SECRET = 'an-author-secret-for-the-proof-tests';

/** What a client that dialed `host` expects back for `challenge`. */
const expected = (challenge, host, secret = SECRET) =>
  createHmac('sha256', secret).update(`${PROOF_LABEL}\n${challenge}\n${host}`, 'utf8').digest('hex');

/** Ask the service for a proof; counts every database call, which must stay at zero. */
async function ask({ challenge, headers = { host: 'author.example' }, secret = SECRET, method = 'POST' } = {}) {
  let queries = 0;
  const query = async () => {
    queries += 1;
    return [];
  };
  const body = challenge === undefined ? null : { challenge };
  const answer = await route({ method, path: '/api/prove', headers, body }, { query, now: () => new Date(), secret });
  return { status: answer.status, headers: answer.headers, json: answer.body ? JSON.parse(answer.body) : null, queries };
}

const fresh = () => randomBytes(32).toString('hex');

test('a fresh challenge is answered with the HMAC over the label, the challenge and the Host header', async () => {
  const challenge = fresh();
  const r = await ask({ challenge });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { proof: expected(challenge, 'author.example'), host: 'author.example' });
  assert.equal(r.headers['cache-control'], 'no-store', 'a proof must never be served from a cache');
  assert.equal(r.queries, 0, 'the proof reads no database, so it answers while Neon is down');
});

test('a relay gets a proof over the real host, which never matches the host the client dialed', async () => {
  // The client dialed evil.example; evil.example forwarded the challenge to the
  // real service, which Vercel only reaches with the real host in the request.
  const challenge = fresh();
  const r = await ask({ challenge, headers: { host: 'author.example' } });
  assert.notEqual(r.json.proof, expected(challenge, 'evil.example'));
});

test('X-Forwarded-Host is ignored, so a relay cannot name itself', async () => {
  const challenge = fresh();
  const r = await ask({ challenge, headers: { host: 'author.example', 'x-forwarded-host': 'evil.example' } });
  assert.equal(r.json.host, 'author.example');
  assert.equal(r.json.proof, expected(challenge, 'author.example'));
  assert.notEqual(r.json.proof, expected(challenge, 'evil.example'));
});

test('the host is lowercased and loses a default port, the same spelling a client computes with', async () => {
  const challenge = fresh();
  for (const sent of ['Author.Example', 'author.example:443', 'AUTHOR.EXAMPLE:80']) {
    const r = await ask({ challenge, headers: { host: sent } });
    assert.equal(r.json.host, 'author.example', sent);
    assert.equal(r.json.proof, expected(challenge, 'author.example'), sent);
  }
  // A port that is not a default one is part of the host, as it is in new URL(...).host.
  assert.equal(proofHost('127.0.0.1:4545'), '127.0.0.1:4545');
  assert.equal(proofHost(new URL('HTTPS://Author.Example:443/').host), 'author.example');
});

test('only a 64-character lowercase hex challenge is answered', async () => {
  const good = fresh();
  for (const challenge of [undefined, '', good.slice(1), `${good}0`, good.toUpperCase(), 'z'.repeat(64), 42]) {
    const r = await ask({ challenge });
    assert.equal(r.status, 400, String(challenge));
    assert.deepEqual(r.json, { error: 'invalid' });
  }
});

test('a missing or short secret is never signed with, and the refusal still names the host', async () => {
  const challenge = fresh();
  const none = await ask({ challenge, secret: '' });
  assert.equal(none.status, 409);
  assert.deepEqual(none.json, { error: 'no_secret', host: 'author.example' });

  const short = await ask({ challenge, secret: 'x'.repeat(MIN_SECRET_LENGTH - 1) });
  assert.equal(short.status, 409);
  assert.deepEqual(short.json, { error: 'weak_secret', host: 'author.example' });

  const enough = 'x'.repeat(MIN_SECRET_LENGTH);
  const ok = await ask({ challenge, secret: enough });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.proof, expected(challenge, 'author.example', enough));
});

test('the proof is a POST: a GET is not a route', async () => {
  const r = await ask({ method: 'GET' });
  assert.equal(r.status, 404);
  assert.deepEqual(r.json, { error: 'not_found' });
});

test('the proof needs no secret from the caller and is not under the author routes', async () => {
  // The author routes answer 401 before anything else; the proof must not.
  const r = await ask({ challenge: fresh(), headers: { host: 'author.example', authorization: 'Bearer wrong' } });
  assert.equal(r.status, 200);
});
