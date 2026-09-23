// Where the comment is: three ways to find the same spot.
//
// An AI-regenerated page changes shape, so one pointer is not enough. Every
// comment carries a CSS selector, the quoted text with a few words either side
// (the W3C Web Annotation model's prefix/exact/suffix), and the point inside
// the element's box that was clicked. Resolution tries them in that order, and
// a comment that matches none of them is orphaned - a normal state, not a loss.
//
// A comment also remembers the screen it was made on (issue #24). The saved
// element on a screen that is not showing means "on another screen", and a
// lookalike found by its words only counts on the comment's own screen, so a
// wizard that repeats its Next button on every step keeps each comment on its step.

import { selectorFor } from './selector.js';
import { ROOT } from './root.js';
import { screenFor } from './screen.js';
import { collapse, renderedText, visibleText } from './text.js';

/** Characters of context kept either side of the quote. */
const CONTEXT = 32;
/** Longest quote stored; a whole paragraph is not a useful anchor. */
const MAX_QUOTE = 160;

const elementOf = (node) => (!node ? null : node.nodeType === 1 ? node : node.parentElement);

const isVisible = (el) => !!el && el.nodeType === 1 && el.getClientRects().length > 0;

/** Every whitespace character removed: the form quotes are MATCHED in. */
const squeeze = (value) => String(value == null ? '' : value).replace(/\s+/g, '');

/** A screen name in the form names are compared in: whitespace runs collapsed, ends trimmed. */
const screenKey = (name) => (typeof name === 'string' ? name.replace(/\s+/g, ' ').trim() : '');

/**
 * Whether a lookalike on the screen named `found` may be the element of a
 * comment made on the screen named `saved` (issue #24). Only a known mismatch
 * says no: a prototype with no headings, markers or hash names no screen at
 * all, and a missing name must never cost a comment its pin.
 */
export function sameScreen(saved, found) {
  const a = screenKey(saved);
  const b = screenKey(found);
  return !a || !b || a === b;
}

/**
 * Whether an element still carries the words its comment quoted; no quote to
 * check means yes. The selector can outlive its element - a regenerated page
 * may reuse the address for something else - so a hidden element only speaks
 * for a comment while it still reads what the reviewer saw.
 */
function agrees(el, exact) {
  const wanted = squeeze(exact);
  return !wanted || squeeze(el.textContent).includes(wanted);
}

/**
 * How many of the saved neighbours - the prefix before the quote and the suffix
 * after it - still sit around the quote at `el`: 0, 1 or 2. Of two "Next"
 * buttons on one screen, the one beside "Turn on Bluetooth" is the one the
 * comment was left on (issue #24).
 *
 * Read inside the element's parent, which is where an element's anchor read
 * them, and in the same whitespace-free form as the quote. The element's place
 * in its parent's text is counted from its preceding siblings, so a parent
 * holding two copies of the same words still tells them apart.
 */
function contextScore(el, quote, wanted) {
  const prefix = squeeze(quote && quote.prefix);
  const suffix = squeeze(quote && quote.suffix);
  const parent = el.parentElement;
  if (!parent || (!prefix && !suffix)) return 0;
  const at = squeeze(el.textContent).indexOf(wanted);
  if (at < 0) return 0;
  let start = at;
  for (let n = el.previousSibling; n; n = n.previousSibling) {
    // Only text and elements make up a parent's textContent; a comment node does not.
    if (n.nodeType === 1 || n.nodeType === 3) start += squeeze(n.textContent).length;
  }
  const hay = squeeze(parent.textContent);
  let score = 0;
  if (prefix && hay.slice(0, start).endsWith(prefix)) score += 1;
  if (suffix && hay.slice(start + wanted.length).startsWith(suffix)) score += 1;
  return score;
}

/** Build prefix/exact/suffix by finding `exact` inside its container's text. */
function quoteAround(container, exact) {
  if (!exact) return { prefix: '', exact: '', suffix: '' };
  // The same rendered text the quote itself was read from. Reading the
  // haystack any other way makes this indexOf miss as soon as the quote
  // carries a break the raw text does not, and prefix/suffix go silently
  // empty rather than wrong - the worst kind of failure to notice.
  const hay = renderedText(container);
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
    tag: el.localName,
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
    tag: el ? el.localName : null,
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
 * all contain the same text. Between exactness and size, the saved neighbours
 * break a tie between lookalikes (issue #24).
 */
function byQuote(quote) {
  const exact = quote && quote.exact;
  if (!exact) return [];
  // Whitespace decides nothing here. The stored quote carries the breaks the
  // page RENDERS (text.js), while an element's textContent carries only the
  // breaks its markup happens to have, so the two are different strings even
  // when they are the same words. Comparing with whitespace removed makes a
  // quote find its element either way, and it survives the page being
  // regenerated with different formatting - the case this anchor exists for.
  // The cost is slightly looser matching ("a man" would match "aman").
  //
  // This is where the comparison is fixed rather than in the walker, because
  // this scan reads every element in the page and runs once per comment on
  // every frame of a scroll (see resolve below); it stays on plain textContent.
  const wanted = squeeze(exact);
  if (!wanted) return [];
  const textOf = (el) => squeeze(el.textContent);

  const matches = Array.from(document.querySelectorAll('body *')).filter(
    (el) => !el.closest(ROOT) && textOf(el).includes(wanted)
  );
  // Whether this element's text IS the quote, or merely contains it. A
  // containment match is how a highlighted fragment is found again, but a short
  // quote can also land on unrelated copy that happens to include those words,
  // so the two are not equally trustworthy and the caller marks them apart.
  const isExact = (el) => textOf(el) === wanted;
  // Keep only the tightest containers: an element whose descendant also matches
  // is just an ancestor of the real one. Without this, <body> matches every
  // quote on the page - including one whose element is on a hidden step, which
  // would resolve the comment to the whole document and draw a pin for it.
  return matches
    .filter((el) => !matches.some((other) => other !== el && el.contains(other)))
    .map((el) => ({ element: el, exact: isExact(el), context: contextScore(el, quote, wanted), size: el.querySelectorAll('*').length }))
    // Exact matches first, then the one whose saved neighbours still surround it,
    // then the tightest container. The sort is stable, so document order decides the rest.
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.context - a.context || a.size - b.size)
    .map(({ element, exact: isExactMatch }) => ({ element, exact: isExactMatch }));
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
      if (found && !found.closest(ROOT)) return found;
    } catch {
      /* a selector from another version of the page may not parse */
    }
  }
  return null;
}

/**
 * Find the element an anchor points at, trying the three ways in order.
 *
 * `screen` is the name of the screen the comment was made on (its
 * `state.screen.name`), or null when that screen was never named.
 *
 * Returns `{ element, status, via }` where status is:
 *   found     - the element is in the page and on screen
 *   hidden    - the comment belongs to a screen that is not being shown (another wizard step)
 *   orphaned  - nothing matched; the comment keeps its text and is flagged
 * and `via` says which pointer answered: selector, quote, quote-loose (a guess
 * between several matches), ancestor, or screen (its lookalikes are all on
 * other screens, so there is no element to point at). An ancestor or a loose
 * quote is deliberately approximate; the panel says so. A comment on another
 * screen is not approximate, it is elsewhere, and says only that.
 *
 * The order (issue #24): the saved element wins whenever it is still in the
 * page. On screen it gets the pin; off screen the comment is on another
 * screen, the rule the first overlay plan set ("found but no client rects means
 * 'on another screen', no pin"). The words only get a say when the selector
 * finds nothing that still carries them, and then a visible lookalike counts
 * only on the comment's own screen. The order before this let a lookalike you
 * could see outrank the real element on a hidden step, so a comment on step 1's
 * Next was pinned to the Next of whatever step was showing.
 *
 * A visible selector match returns immediately. That is not only the common
 * case, it is the hot one: this runs once per comment on every animation frame
 * of a scroll, and the quote scan reads the text of every element in the page
 * (review R8). A saved element on a hidden step now returns before that scan too.
 */
export function resolve(anchor, screen = null) {
  if (!anchor) return { element: null, status: 'orphaned', via: null };

  const selectorHits = [];
  if (anchor.selector) {
    try {
      for (const el of document.querySelectorAll(anchor.selector)) {
        if (el && !el.closest(ROOT)) selectorHits.push(el);
      }
    } catch {
      /* a selector from another version of the page may not even parse */
    }
  }

  const shownBySelector = selectorHits.find(isVisible);
  if (shownBySelector) return { element: shownBySelector, status: 'found', via: 'selector' };

  // The saved element, still in the page, on a screen that is not being shown.
  const kept = selectorHits.find((el) => agrees(el, anchor.quote && anchor.quote.exact));
  if (kept) return { element: kept, status: 'hidden', via: 'selector' };

  // A visible lookalike on another screen is not this comment's element. Only
  // visible ones are judged: screenFor names the screen being SHOWN, which is
  // true of an element on screen and says nothing true about a hidden one.
  let elsewhere = 0;
  const quoteHits = byQuote(anchor.quote).filter((hit) => {
    if (!isVisible(hit.element) || sameScreen(screen, screenFor(hit.element).name)) return true;
    elsewhere += 1;
    return false;
  });
  // One candidate is an answer; several is a guess. A highlighted fragment
  // normally has exactly one containing element - its own paragraph, which is
  // the element the anchor named anyway - so that stays an exact result. It is
  // when the same words appear somewhere else on the page that picking one is
  // no better than a coin toss, and the panel and the batch say so.
  const ambiguous = quoteHits.length > 1;
  const quoteVia = ambiguous ? 'quote-loose' : 'quote';

  const shownByQuote = quoteHits.find((hit) => isVisible(hit.element));
  if (shownByQuote) {
    return { element: shownByQuote.element, status: 'found', via: quoteVia };
  }
  // Its words are showing, but only on screens it was not made on: the comment
  // is on another screen, not lost, and not "nearby" anything here.
  if (elsewhere) return { element: null, status: 'hidden', via: 'screen' };

  // Nothing on screen, but the spot may still exist on another screen.
  if (selectorHits.length) return { element: selectorHits[0], status: 'hidden', via: 'selector' };
  if (quoteHits.length) {
    return { element: quoteHits[0].element, status: 'hidden', via: quoteVia };
  }

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
