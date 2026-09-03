// Where the comment is: three ways to find the same spot.
//
// An AI-regenerated page changes shape, so one pointer is not enough. Every
// comment carries a CSS selector, the quoted text with a few words either side
// (the W3C Web Annotation model's prefix/exact/suffix), and the point inside
// the element's box that was clicked. Resolution tries them in that order, and
// a comment that matches none of them is orphaned - a normal state, not a loss.

import { selectorFor } from './selector.js';
import { collapse, visibleText } from './text.js';

/** Characters of context kept either side of the quote. */
const CONTEXT = 32;
/** Longest quote stored; a whole paragraph is not a useful anchor. */
const MAX_QUOTE = 160;

const elementOf = (node) => (!node ? null : node.nodeType === 1 ? node : node.parentElement);

const isVisible = (el) => !!el && el.nodeType === 1 && el.getClientRects().length > 0;

/** Build prefix/exact/suffix by finding `exact` inside its container's text. */
function quoteAround(container, exact) {
  if (!exact) return { prefix: '', exact: '', suffix: '' };
  const hay = collapse(container ? container.textContent : '');
  const at = hay.indexOf(exact);
  if (at < 0) return { prefix: '', exact, suffix: '' };
  return {
    prefix: hay.slice(Math.max(0, at - CONTEXT), at),
    exact,
    suffix: hay.slice(at + exact.length, at + exact.length + CONTEXT),
  };
}

/** Where in the element's box the click landed, as fractions. */
function pointIn(el, event) {
  const rect = el.getBoundingClientRect();
  if (!event || !rect.width || !rect.height) return { x: 0.5, y: 0.5 };
  const clamp = (v) => Math.min(1, Math.max(0, Math.round(v * 1000) / 1000));
  return {
    x: clamp((event.clientX - rect.left) / rect.width),
    y: clamp((event.clientY - rect.top) / rect.height),
  };
}

/** An anchor for a clicked element. */
export function anchorFromElement(el, event) {
  const exact = collapse(visibleText(el)).slice(0, MAX_QUOTE);
  return {
    selector: selectorFor(el),
    quote: quoteAround(el.parentElement || document.body, exact),
    point: pointIn(el, event),
  };
}

/** An anchor for a text selection: the quote is what the reviewer highlighted. */
export function anchorFromSelection(selection) {
  const exact = collapse(selection.toString()).slice(0, MAX_QUOTE);
  const range = selection.getRangeAt(0);
  const el = elementOf(range.commonAncestorContainer);
  return {
    selector: selectorFor(el),
    quote: quoteAround(el, exact),
    point: { x: 0.5, y: 0.5 },
  };
}

/** Every element whose own visible text is exactly `exact`, smallest first. */
function byQuote(exact) {
  if (!exact) return [];
  return Array.from(document.querySelectorAll('body *'))
    .filter((el) => !el.closest('#gitmargin-root') && collapse(el.textContent) === exact)
    .sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
}

/**
 * Find the element an anchor points at.
 *
 * Returns `{ element, status }` where status is:
 *   found     - the element is in the page and on screen
 *   hidden    - the element exists but is not being shown (another wizard step)
 *   orphaned  - nothing matched; the comment keeps its text and is flagged
 */
export function resolve(anchor) {
  if (!anchor) return { element: null, status: 'orphaned' };

  const candidates = [];
  if (anchor.selector) {
    try {
      candidates.push(...document.querySelectorAll(anchor.selector));
    } catch {
      /* a selector from another version of the page may not even parse */
    }
  }
  candidates.push(...byQuote(anchor.quote && anchor.quote.exact));

  const usable = candidates.filter((el) => el && !el.closest('#gitmargin-root'));
  if (!usable.length) return { element: null, status: 'orphaned' };

  const shown = usable.find(isVisible);
  return shown ? { element: shown, status: 'found' } : { element: usable[0], status: 'hidden' };
}
