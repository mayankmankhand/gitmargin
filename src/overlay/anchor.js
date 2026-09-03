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

/**
 * Elements whose visible text CONTAINS the quote, tightest container first.
 *
 * Containment rather than equality, because equality could never rescue the two
 * cases the quote exists for: a highlight is a fragment of a longer paragraph by
 * construction, and an element's stored quote is truncated at MAX_QUOTE, so a
 * long element's quote is only ever a prefix of its own text (review R9).
 * Sorting by subtree size keeps the tightest match ahead of its ancestors, which
 * all contain the same text.
 */
function byQuote(exact) {
  if (!exact) return [];
  const matches = Array.from(document.querySelectorAll('body *')).filter(
    (el) => !el.closest('#gitmargin-root') && collapse(el.textContent).includes(exact)
  );
  // Keep only the tightest containers: an element whose descendant also matches
  // is just an ancestor of the real one. Without this, <body> matches every
  // quote on the page - including one whose element is on a hidden step, which
  // would resolve the comment to the whole document and draw a pin for it.
  return matches
    .filter((el) => !matches.some((other) => other !== el && el.contains(other)))
    .sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
}

/**
 * The nearest surviving ancestor named by a selector, found by dropping its
 * trailing segments one at a time.
 *
 * This is the third way back to a spot, and the only one left when a page has
 * been regenerated with new class names and new copy: the exact element is gone
 * but its container is usually still there, which is enough to put an agent in
 * the right part of the page rather than reporting nothing (review R10).
 */
function ancestorFor(selector) {
  if (!selector) return null;
  const parts = selector.split('>').map((x) => x.trim()).filter(Boolean);
  for (let take = parts.length - 1; take > 0; take -= 1) {
    try {
      const found = document.querySelector(parts.slice(0, take).join(' > '));
      if (found && !found.closest('#gitmargin-root')) return found;
    } catch {
      /* a selector from another version of the page may not parse */
    }
  }
  return null;
}

/**
 * Find the element an anchor points at, trying the three ways in order.
 *
 * Returns `{ element, status, via }` where status is:
 *   found     - the element is in the page and on screen
 *   hidden    - the element exists but is not being shown (another wizard step)
 *   orphaned  - nothing matched; the comment keeps its text and is flagged
 * and `via` says which of the three pointers answered: selector, quote, or
 * ancestor. An ancestor match is deliberately approximate; the panel says so.
 *
 * A visible selector match returns immediately. That is not only the common
 * case, it is the hot one: this runs once per comment on every animation frame
 * of a scroll, and the quote scan reads the text of every element in the page
 * (review R8).
 */
export function resolve(anchor) {
  if (!anchor) return { element: null, status: 'orphaned', via: null };

  const selectorHits = [];
  if (anchor.selector) {
    try {
      for (const el of document.querySelectorAll(anchor.selector)) {
        if (el && !el.closest('#gitmargin-root')) selectorHits.push(el);
      }
    } catch {
      /* a selector from another version of the page may not even parse */
    }
  }

  const shownBySelector = selectorHits.find(isVisible);
  if (shownBySelector) return { element: shownBySelector, status: 'found', via: 'selector' };

  const quoteHits = byQuote(anchor.quote && anchor.quote.exact);
  const shownByQuote = quoteHits.find(isVisible);
  if (shownByQuote) return { element: shownByQuote, status: 'found', via: 'quote' };

  // Nothing on screen, but the spot may still exist on another screen.
  if (selectorHits.length) return { element: selectorHits[0], status: 'hidden', via: 'selector' };
  if (quoteHits.length) return { element: quoteHits[0], status: 'hidden', via: 'quote' };

  const ancestor = ancestorFor(anchor.selector);
  if (ancestor) {
    return {
      element: ancestor,
      status: isVisible(ancestor) ? 'found' : 'hidden',
      via: 'ancestor',
    };
  }
  return { element: null, status: 'orphaned', via: null };
}
