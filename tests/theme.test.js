// src/overlay/theme.js: the luminance maths behind the light/dark switch, in
// plain Node, on the strings getComputedStyle really returns (issue #21).
// themeOf itself needs a layout engine and is covered in tests/overlay-rethink.spec.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { luminanceOf, themeOf } from '../src/overlay/theme.js';

test('white is 1 and black is 0', () => {
  assert.equal(luminanceOf('rgb(255, 255, 255)'), 1);
  assert.equal(luminanceOf('rgb(0, 0, 0)'), 0);
});

test('a graphite ground reads as dark, an off-white one as light', () => {
  // #1f1f23 and #fafafa, as a browser reports them.
  const graphite = luminanceOf('rgb(31, 31, 35)');
  const paper = luminanceOf('rgb(250, 250, 250)');
  assert.ok(graphite < 0.4, `graphite ${graphite} should be under the dark line`);
  assert.ok(paper > 0.4, `paper ${paper} should be over the dark line`);
});

test('a transparent layer says nothing about the ground', () => {
  assert.equal(luminanceOf('rgba(0, 0, 0, 0)'), null);
  assert.equal(luminanceOf('rgba(20, 20, 30, 0)'), null);
  // Any alpha above zero is a real layer, and an alpha channel does not change the maths.
  assert.equal(luminanceOf('rgba(255, 255, 255, 0.5)'), 1);
});

test('a hex colour, which is what a canvas hands back for oklch and friends, parses too', () => {
  assert.equal(luminanceOf('#ffffff'), 1);
  assert.equal(luminanceOf('#000000'), 0);
  assert.ok(luminanceOf('#1f1f23') < 0.4);
  assert.equal(luminanceOf('#1f1f2300'), null); // an alpha of zero is transparent
});

test('anything that is not an sRGB colour string is null, never a throw', () => {
  // The browser-side converter turns oklch and hsl into rgb or hex before this
  // function sees them; in Node they reach it raw and must not throw.
  for (const bad of ['transparent', 'hsl(0 0% 0%)', 'oklch(20% 0 0)', '#123', '', null, undefined, 42, 'rgb(1, 2)']) {
    assert.equal(luminanceOf(bad), null, `${String(bad)} should be null`);
  }
});

test('themeOf falls back to light when there is no document to measure', () => {
  assert.equal(themeOf({}), 'light');
  assert.equal(themeOf({ documentElement: null, defaultView: null }), 'light');
});
