// Which way the page underneath is lit (issue #21).
//
// The overlay draws Marker on a light prototype and Graphite on a dark one.
// That is decided by measuring the page, never by asking the browser for its
// colour-scheme preference: the pins sit on the prototype's own ground, and a
// dark prototype is dark on a light-mode machine too.
//
// The measurement starts at the element under the viewport's centre and climbs
// to <html>, taking the first background that has a colour. Starting at body
// would miss the usual AI-made pattern, where body keeps the browser's white
// and a wrapper div paints the dark ground. Recorded limit: a light card that
// happens to sit at the centre measures light; the overlay re-measures on
// resize and on the first scroll, which is as far as a measurement can go
// without guessing.

import { ROOT_ID } from './root.js';

/** Parse `rgb(r, g, b)` or `rgba(r, g, b, a)`, the two shapes getComputedStyle returns. */
function channels(cssColor) {
  if (typeof cssColor !== 'string') return null;
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(cssColor.trim());
  if (!m) return null;
  const alpha = m[4] === undefined ? 1 : Number(m[4]);
  if (!(alpha > 0)) return null; // transparent: this layer says nothing about the ground
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * WCAG relative luminance of a computed colour string, 0 (black) to 1 (white),
 * or null when the string is not a colour or is fully transparent.
 *
 * Pure, so it is tested in Node on the exact strings a browser hands back.
 */
export function luminanceOf(cssColor) {
  const rgb = channels(cssColor);
  if (!rgb) return null;
  const lin = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** Below this the page reads as dark. 0.4 rather than 0.5 so a mid grey stays light-themed. */
const DARK_BELOW = 0.4;

/**
 * 'dark' or 'light' for the page in `doc`, measured now.
 *
 * `hit` may be passed by a test; otherwise it is the element under the viewport
 * centre. Anything inside the overlay's own host is skipped, and when the walk
 * finds no coloured background at all (an unstyled page, a document with no
 * body yet) the answer is 'light', the browser's own default ground.
 */
export function themeOf(doc = document, hit = null) {
  const view = doc.defaultView;
  if (!view || !doc.documentElement) return 'light';
  let node = hit;
  if (!node) {
    try {
      node = doc.elementFromPoint(view.innerWidth / 2, view.innerHeight / 2);
    } catch {
      node = null;
    }
  }
  // Our own overlay is what sits at the centre when a thread or the sheet is
  // open; the page under it is the question, so start from body instead.
  if (node && node.closest && node.closest(`#${ROOT_ID}`)) node = null;
  if (!node) node = doc.body;
  for (let el = node; el; el = el.parentElement) {
    let lum = null;
    try {
      lum = luminanceOf(view.getComputedStyle(el).backgroundColor);
    } catch {
      lum = null;
    }
    if (lum !== null) return lum < DARK_BELOW ? 'dark' : 'light';
  }
  return 'light';
}
