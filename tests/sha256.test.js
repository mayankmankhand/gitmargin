// src/overlay/sha256.js against Node's own SHA-256. The overlay hashes the
// sign-in's one-time code with it, and the service compares that hash with its
// own, so one wrong bit means nobody can ever sign in.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { sha256hex } from '../src/overlay/sha256.js';

const node = (text) => createHash('sha256').update(text, 'latin1').digest('hex');

test('matches Node on the published vectors and on every padding boundary', () => {
  assert.equal(sha256hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  for (const length of [1, 31, 32, 54, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
    const text = 'a'.repeat(length);
    assert.equal(sha256hex(text), node(text), `length ${length}`);
  }
});

test('matches Node on 200 random one-time codes, the only thing it is used for', () => {
  for (let i = 0; i < 200; i += 1) {
    const code = randomBytes(16).toString('hex');
    assert.equal(sha256hex(code), node(code));
  }
});
