// src/overlay/anchor.js: the one comparison behind "a lookalike counts only on
// the comment's own screen" (issue #24), in plain Node. Where pins actually land
// needs a layout engine and is covered in tests/screens.spec.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sameScreen } from '../src/overlay/anchor.js';

test('the same screen name keeps a lookalike', () => {
  assert.equal(sameScreen('Pair your headphones', 'Pair your headphones'), true);
});

test('a different screen name drops it', () => {
  assert.equal(sameScreen('Pair your headphones', 'Sign in to your Sony account'), false);
});

test('a missing name on either side keeps it: only a known mismatch says no', () => {
  assert.equal(sameScreen(null, 'Sign in to your Sony account'), true);
  assert.equal(sameScreen('Pair your headphones', null), true);
  assert.equal(sameScreen('', 'Sound'), true);
  assert.equal(sameScreen(undefined, undefined), true);
});

test('whitespace does not make two names different', () => {
  assert.equal(sameScreen('  Pair your\nheadphones ', 'Pair your headphones'), true);
});
