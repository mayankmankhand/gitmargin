// Which screen the reviewer was looking at.
//
// The order below is batch-format.md section 4, and `source` records which rule
// answered, so a reader knows how much to trust the name. The convention comes
// first: one line in the prototype's generation prompt ("wrap each screen, step,
// tab panel and dialog in an element with data-gm-screen set to its name") makes
// every name exact.

import { collapse, renderedText, visibleText } from './text.js';

const HEADINGS = 'h1, h2, h3, h4, h5, h6';

/** What a box may hold and still be only its heading's wrapper: the heading, a line or two of text, an icon. */
const HEADING_GROUP = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hgroup', 'p', 'span', 'small', 'strong', 'b', 'em', 'i', 'br', 'img', 'svg']);

const isVisible = (el) => !!el && el.nodeType === 1 && el.getClientRects().length > 0;

/** The first heading inside a container, if it has one. */
function headingIn(container) {
  const h = container.querySelector(HEADINGS);
  return h ? renderedText(h) : '';
}

/**
 * The heading that names `el`'s screen: `{ heading, own }`, where own says the
 * heading is `el` itself or holds it, or null when no visible heading is found.
 */
function headingAbove(el) {
  // A comment left ON a heading is named by that heading, not by the one above
  // it. compareDocumentPosition returns 0 for a node compared with itself, so
  // without this the element's own heading never matches the loop below and an
  // earlier, broader heading wins: commenting on a step's <h2> reported the
  // app-level title while every other element on that same step reported the
  // step. Two comments on one screen came back naming different screens, which
  // is the one thing the screen field exists to get right. `closest` also
  // covers an element nested inside a heading, such as a <span> in an <h2>.
  const own = el && el.closest ? el.closest(HEADINGS) : null;
  if (isVisible(own)) return { heading: own, own: true };

  const headings = Array.from(document.querySelectorAll(HEADINGS)).filter(isVisible);
  let best = null;
  for (const h of headings) {
    const position = h.compareDocumentPosition(el);
    const isBefore = position & Node.DOCUMENT_POSITION_FOLLOWING;
    const contains = position & Node.DOCUMENT_POSITION_CONTAINED_BY;
    if (isBefore || contains) best = h;
  }
  return best ? { heading: best, own: false } : null;
}

/**
 * The box that holds a step's own content, found from the heading that names
 * the step (issue #34): the heading's parent, or, when that parent holds only
 * the heading and a line or two of text (the "title and lead in their own div"
 * habit), the box around it. The whole page is never one step's box: `body`
 * holds everything that stays on every step, so it gives no box at all.
 */
function stepBox(heading) {
  const isGroup = (box) => box.children.length <= 3 && Array.from(box.children).every((c) => HEADING_GROUP.has(c.localName));
  let box = heading.parentElement;
  while (box && isGroup(box) && box.parentElement && box.parentElement !== document.body) box = box.parentElement;
  return box && box !== document.body && box !== document.documentElement ? box : null;
}

/**
 * Name the screen for `el`, and find the box that holds that screen's own
 * content when the name came from around `el` itself. Returns
 * `{ name, source, box }`; box is null when the name came from the page as a
 * whole (a modal elsewhere, the current-step marker, the selected tab, the
 * hash) or from `el`'s own heading, which names itself rather than a step.
 */
function nameScreen(el) {
  // 1. The convention: an ancestor tagged by the prototype itself.
  const tagged = el && el.closest ? el.closest('[data-gm-screen]') : null;
  if (tagged) {
    return { name: collapse(tagged.getAttribute('data-gm-screen')), source: 'data-gm-screen', box: tagged };
  }

  // 2. An open dialog: either the one holding the element, or any modal one,
  //    since a modal dialog IS the screen the reviewer can see.
  const dialogs = Array.from(document.querySelectorAll('dialog[open], [role="dialog"]')).filter(isVisible);
  const holding = dialogs.find((d) => el && d.contains(el));
  const dialog = holding || dialogs.find((d) => d.matches('dialog[open]'));
  if (dialog) {
    const name = headingIn(dialog) || collapse(dialog.getAttribute('aria-label')) || 'Dialog';
    return { name, source: 'dialog', box: holding || null };
  }

  // 3. An explicitly marked current step.
  const step = document.querySelector('[aria-current="step"]');
  if (isVisible(step)) {
    return { name: headingIn(step) || visibleText(step).slice(0, 60), source: 'aria-current', box: null };
  }

  // 4. The selected tab.
  const tab = document.querySelector('[role="tab"][aria-selected="true"]');
  if (isVisible(tab)) {
    return { name: visibleText(tab), source: 'tab', box: null };
  }

  // 5. The nearest visible heading above the element.
  const above = el ? headingAbove(el) : null;
  const heading = above ? renderedText(above.heading) : '';
  if (heading) return { name: heading, source: 'heading', box: above.own ? null : stepBox(above.heading) };

  // 6. The page hash, which is all a hash-routed prototype gives away.
  const hash = collapse(location.hash);
  if (hash) return { name: hash, source: 'hash', box: null };

  return { name: null, source: 'none', box: null };
}

/**
 * Name the screen for `el`, with the rule that answered.
 * Returns `{ name, source }`; name is null when nothing at all was found.
 * This is what a comment saves, so it never carries an element.
 */
export function screenFor(el) {
  const { name, source } = nameScreen(el);
  return { name, source };
}

/**
 * The screen a VISIBLE element is on, as `screenFor` names it, plus the box that
 * holds that screen's own content (see nameScreen). Rules 2 to 4 and 6 read
 * what the page is showing now, which says nothing true about a hidden element,
 * so this is only asked about elements on screen.
 */
export function screenAt(el) {
  return nameScreen(el);
}
