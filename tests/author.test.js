// src/overlay/author.js: the initials and the colour a person's chip carries (issue #21).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialsOf, authorHue, HUES, NEUTRAL } from '../src/overlay/author.js';

test('initials are the first letters of the first and last words', () => {
  assert.equal(initialsOf('Priya Shah'), 'PS');
  assert.equal(initialsOf('Mayank'), 'M');
  assert.equal(initialsOf('  Arjun  K  Rao '), 'AR');
  assert.equal(initialsOf('josé ríos'), 'JR');
});

test('a blank name is a question mark, never an empty chip', () => {
  assert.equal(initialsOf(''), '?');
  assert.equal(initialsOf('   '), '?');
  assert.equal(initialsOf(null), '?');
  assert.equal(initialsOf(undefined), '?');
});

test('a name in another script gets whole characters', () => {
  assert.equal(initialsOf('山田 太郎'), '山太');
  assert.equal(initialsOf('😀 face'), '😀F');
});

test('the same person gets the same colour, and it is one of the eight', () => {
  const a = authorHue({ name: 'Priya Shah' });
  assert.equal(a, authorHue({ name: 'Priya Shah' }));
  assert.ok(HUES.includes(a));
  assert.ok(HUES.includes(authorHue({ name: 'Sam Lee' })));
});

test('the handle decides when there is one, so two people with one display name differ', () => {
  const one = authorHue({ name: 'Mayank Mankhand', username: 'mayankmankhand07' });
  const two = authorHue({ name: 'Mayank Mankhand', username: 'mankhand.mayank' });
  assert.notEqual(one, two);
  // And the handle wins over the name: renaming the display name changes nothing.
  assert.equal(one, authorHue({ name: 'M. Mankhand', username: 'mayankmankhand07' }));
});

test('no name and no handle is the neutral grey', () => {
  assert.equal(authorHue(null), NEUTRAL);
  assert.equal(authorHue({}), NEUTRAL);
  assert.equal(authorHue({ name: '  ' }), NEUTRAL);
});
