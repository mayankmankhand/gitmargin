// What a click is aimed at: the one rule the trail and the comment target share.
//
// The raw event target is whatever node the pointer happened to land on: the
// <span> holding a button's label, an icon, a bold word, a wrapper <div>. Two
// consumers need something better than that, and want slightly different
// things from it:
//
//   - the click trail (trail.js) records a step only when the click was aimed
//     at a control or at something short enough to be a label, and drops page
//     furniture entirely (the 2026-09-04 dogfood fix: four <body> clicks each
//     carrying the whole page truncated to forty characters)
//   - the comment target (ui.js) always needs SOMETHING to frame and anchor, so
//     after a control it tries the nearest named block and then keeps the raw
//     element (issue #10: a click on the word inside a button anchored the word)
//
// Both start with the same first step, a control wins, and that step lives here
// once. A rule that lives in two files drifts.

const ROOT = '#gitmargin-root';

/**
 * Things a reviewer clicks on purpose.
 *
 * `[tabindex]` is narrowed to values a person can Tab to. A prototype that
 * manages focus after navigation puts tabindex="-1" on a whole screen wrapper,
 * and matching that made every click on the screen "aimed at" the screen
 * (issue #10). The trail's earlier list matched any tabindex.
 */
export const CONTROLS = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  '[role="button"]',
  '[role="tab"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[tabindex]:not([tabindex^="-"])',
].join(',');

/**
 * Things a reviewer has opinions about but never clicks: a block with a name
 * of its own. A word inside one of these belongs to the block (issue #10).
 */
export const NAMED_BLOCKS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'li', 'dt', 'dd', 'td', 'th',
  'blockquote', 'figcaption', 'legend',
  'img', 'svg', 'video', 'figure', 'picture',
].join(',');

const isPage = (el) => !!el && (el.localName === 'body' || el.localName === 'html');

/** The control a click was aimed at, or null. Never the page itself. */
export function controlFor(el) {
  if (!el || !el.closest) return null;
  const control = el.closest(CONTROLS);
  return control && !isPage(control) ? control : null;
}

/**
 * What a comment attaches to when the reviewer clicks `el`: a control, else the
 * nearest named block, else `el` itself. Null for the page body, the document
 * element, anything inside the overlay, and anything that is not an element,
 * meaning there is nothing there to comment on.
 *
 * The hover frame and the click both call this, so the frame can only ever show
 * the element the click will pick (issue #10).
 */
export function targetFor(el) {
  if (!el || el.nodeType !== 1 || !el.closest) return null;
  if (isPage(el) || el.closest(ROOT)) return null;
  const control = controlFor(el);
  if (control) return control;
  const block = el.closest(NAMED_BLOCKS);
  if (block && !isPage(block)) return block;
  return el;
}
