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
// and a wrapper div paints the dark ground. A layer painted with a gradient or
// a picture has no colour to read, so its text colour stands in: light text
// means a dark ground (review of #21, R13). Recorded limit: a light card that
// happens to sit at the centre measures light.
//
// When the overlay's own thread or sheet covers the centre, the measurement
// looks past it to the page underneath (issue #24). The overlay measures again
// whenever the ground may have changed (src/overlay/ui.js): after the page
// changes, when a fade or an animation on it ends, on resize, once on the
// first scroll, and when the system's light/dark setting flips. Scrolling alone
// never measures again, so a still page painted in light and dark bands keeps
// one look as it moves. A page whose own script changes as it scrolls (a menu
// that lights up the section in view, a section that animates in) is measured
// at each of those changes like any other, so there the look can follow the
// band at the centre. Ignoring changes made mid-scroll would also ignore a
// screen changed right after a scroll, the case this measuring exists for
// (review of #24, R8).

import { ROOT_ID } from './root.js';

/**
 * Parse the colour strings a browser hands back for an sRGB colour:
 * `rgb(r, g, b)`, `rgba(r, g, b, a)`, and the `#rrggbb` / `#rrggbbaa` a
 * canvas returns after converting anything else.
 */
function channels(cssColor) {
  if (typeof cssColor !== 'string') return null;
  const text = cssColor.trim();
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(text);
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]);
    if (!(alpha > 0)) return null; // transparent: this layer says nothing about the ground
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(text);
  if (hex) {
    if (hex[2] !== undefined && parseInt(hex[2], 16) === 0) return null;
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return null;
}

/**
 * WCAG relative luminance of a computed colour string, 0 (black) to 1 (white),
 * or null when the string is not an sRGB colour or is fully transparent.
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

let canvasContext = null;
/**
 * Any colour the engine understands, as `rgb(...)`: painted onto a single
 * pixel and read back. Computed styles keep `oklch(...)` and friends as
 * written, and so does a canvas's own `fillStyle`, which round-trips the
 * syntax it was given; only the pixel is always sRGB (review of #21, R6,
 * measured in Chromium). Returns null when the engine could not parse the
 * colour, and the input untouched when there is no canvas to paint on.
 */
function toSrgb(cssColor, doc) {
  if (typeof cssColor !== 'string') return null;
  if (channels(cssColor) !== null || /^rgba?\(/i.test(cssColor)) return cssColor;
  try {
    if (!canvasContext) {
      const canvas = doc.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      canvasContext = canvas.getContext('2d', { willReadFrequently: true });
    }
    if (!canvasContext) return cssColor;
    // A colour the engine cannot parse leaves fillStyle at what it was, so the
    // pixel would report the last colour painted. Start from a known one and
    // compare: unchanged means unparseable, and unparseable means no answer.
    canvasContext.fillStyle = '#000000';
    canvasContext.fillStyle = cssColor;
    if (canvasContext.fillStyle === '#000000' && !/^#0{6}$|^black$/i.test(cssColor.trim())) return null;
    canvasContext.clearRect(0, 0, 1, 1);
    canvasContext.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = canvasContext.getImageData(0, 0, 1, 1).data;
    return a === 0 ? null : `rgba(${r}, ${g}, ${b}, ${a / 255})`;
  } catch {
    return cssColor;
  }
}

/** 'dark' or 'light' from a luminance. */
const themeFor = (lum) => (lum < DARK_BELOW ? 'dark' : 'light');

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
  const isOurs = (el) => !!(el && el.closest && el.closest(`#${ROOT_ID}`));
  let node = hit;
  if (!node) {
    try {
      // Everything under the centre, topmost first, so our own thread or sheet
      // can be looked past to the page beneath it (issue #24). Starting from
      // body instead read a dark page as light whenever the sheet covered the
      // centre, because the usual AI-made page leaves body white and paints a wrapper.
      const x = view.innerWidth / 2;
      const y = view.innerHeight / 2;
      const stack = doc.elementsFromPoint ? doc.elementsFromPoint(x, y) : [doc.elementFromPoint(x, y)];
      node = stack.find((el) => el && !isOurs(el)) || null;
    } catch {
      node = null;
    }
  }
  // A hit inside the overlay says nothing about the page: start from body.
  if (isOurs(node)) node = null;
  if (!node) node = doc.body;
  for (let el = node; el; el = el.parentElement) {
    let style = null;
    try {
      style = view.getComputedStyle(el);
    } catch {
      style = null;
    }
    if (!style) continue;
    const lum = luminanceOf(toSrgb(style.backgroundColor, doc));
    if (lum !== null) return themeFor(lum);
    // A gradient or a picture paints this layer with no colour to read; its
    // text was chosen to read on it, so light text means a dark ground.
    if (style.backgroundImage && style.backgroundImage !== 'none') {
      const text = luminanceOf(toSrgb(style.color, doc));
      if (text !== null) return text > 0.5 ? 'dark' : 'light';
    }
  }
  return 'light';
}
