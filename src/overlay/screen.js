// Which screen the reviewer was looking at.
//
// The order below is batch-format.md section 4, and `source` records which rule
// answered, so a reader knows how much to trust the name. The convention comes
// first: one line in the prototype's generation prompt ("wrap each screen, step,
// tab panel and dialog in an element with data-gm-screen set to its name") makes
// every name exact.

import { collapse, renderedText, visibleText } from './text.js';

const HEADINGS = 'h1, h2, h3, h4, h5, h6';

const isVisible = (el) => !!el && el.nodeType === 1 && el.getClientRects().length > 0;

/** The first heading inside a container, if it has one. */
function headingIn(container) {
  const h = container.querySelector(HEADINGS);
  return h ? renderedText(h) : '';
}

/** The nearest visible heading that comes before `el` in document order. */
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
  if (isVisible(own)) return renderedText(own);

  const headings = Array.from(document.querySelectorAll(HEADINGS)).filter(isVisible);
  let best = '';
  for (const h of headings) {
    const position = h.compareDocumentPosition(el);
    const isBefore = position & Node.DOCUMENT_POSITION_FOLLOWING;
    const contains = position & Node.DOCUMENT_POSITION_CONTAINED_BY;
    if (isBefore || contains) best = renderedText(h);
  }
  return best;
}

/**
 * Name the screen for `el`, with the rule that answered.
 * Returns `{ name, source }`; name is null when nothing at all was found.
 */
export function screenFor(el) {
  // 1. The convention: an ancestor tagged by the prototype itself.
  const tagged = el && el.closest ? el.closest('[data-gm-screen]') : null;
  if (tagged) {
    return { name: collapse(tagged.getAttribute('data-gm-screen')), source: 'data-gm-screen' };
  }

  // 2. An open dialog: either the one holding the element, or any modal one,
  //    since a modal dialog IS the screen the reviewer can see.
  const dialogs = Array.from(document.querySelectorAll('dialog[open], [role="dialog"]')).filter(isVisible);
  const dialog = dialogs.find((d) => el && d.contains(el)) || dialogs.find((d) => d.matches('dialog[open]'));
  if (dialog) {
    const name = headingIn(dialog) || collapse(dialog.getAttribute('aria-label')) || 'Dialog';
    return { name, source: 'dialog' };
  }

  // 3. An explicitly marked current step.
  const step = document.querySelector('[aria-current="step"]');
  if (isVisible(step)) {
    return { name: headingIn(step) || visibleText(step).slice(0, 60), source: 'aria-current' };
  }

  // 4. The selected tab.
  const tab = document.querySelector('[role="tab"][aria-selected="true"]');
  if (isVisible(tab)) {
    return { name: visibleText(tab), source: 'tab' };
  }

  // 5. The nearest visible heading above the element.
  const heading = el ? headingAbove(el) : '';
  if (heading) return { name: heading, source: 'heading' };

  // 6. The page hash, which is all a hash-routed prototype gives away.
  const hash = collapse(location.hash);
  if (hash) return { name: hash, source: 'hash' };

  return { name: null, source: 'none' };
}
