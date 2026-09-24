// Which screen the reviewer was looking at.
//
// The order below is batch-format.md section 4, and `source` records which rule
// answered, so a reader knows how much to trust the name. The convention comes
// first: one line in the prototype's generation prompt ("wrap each screen, step,
// tab panel and dialog in an element with data-gm-screen set to its name") makes
// every name exact.

import { ROOT_ID } from './root.js';
import { collapse, renderedText, visibleText } from './text.js';

const HEADINGS = 'h1, h2, h3, h4, h5, h6';

/** What a box may hold and still be only its heading's wrapper: the heading, a line or two of text, an icon. */
const HEADING_GROUP = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hgroup', 'p', 'span', 'small', 'strong', 'b', 'em', 'i', 'br', 'img', 'svg']);

const isVisible = (el) => !!el && el.nodeType === 1 && el.getClientRects().length > 0;

/**
 * The page's visible headings, and each one's rendered text, read once per task
 * rather than once per question. resolve() names the screen of every visible
 * match, once per comment on every frame, and each naming walks every heading:
 * timed in the review of issue #34 on a page of 100 headed sections with 15
 * comments, that made a frame four times slower than before the fix. One frame
 * is one task, and the page cannot change during it, so the reading is dropped
 * at the end of the task and the next frame reads the page afresh.
 */
let taskCache = null;
function cached() {
  if (!taskCache) {
    taskCache = { text: new Map() };
    queueMicrotask(() => {
      taskCache = null;
    });
  }
  return taskCache;
}
/** A reading of the page that is the same for every element, made once per task. */
const perTask = (key, read) => {
  const cache = cached();
  if (!(key in cache)) cache[key] = read();
  return cache[key];
};
const visibleHeadings = () => perTask('headings', () => Array.from(document.querySelectorAll(HEADINGS)).filter(isVisible));
const headingText = (h) => {
  const { text } = cached();
  if (!text.has(h)) text.set(h, renderedText(h));
  return text.get(h);
};

/** The first heading inside a container, if it has one. */
function headingIn(container) {
  const h = container.querySelector(HEADINGS);
  return h ? renderedText(h) : '';
}

/** The heading that names `el`'s screen, or null when no visible heading is found. */
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
  if (isVisible(own)) return own;

  // The last heading that comes before `el` or holds it. The headings are in
  // document order and the ones that qualify are always a run from the start
  // (a heading that holds `el` also comes before it), so the last of them is
  // found by halving rather than by walking every heading: this runs once per
  // comment on every frame, and a long page has a hundred headings or more
  // (review of #34, the R2 split).
  const headings = visibleHeadings();
  const before = Node.DOCUMENT_POSITION_FOLLOWING | Node.DOCUMENT_POSITION_CONTAINED_BY;
  let best = null;
  for (let lo = 0, hi = headings.length - 1; lo <= hi; ) {
    const mid = (lo + hi) >> 1;
    if (headings[mid].compareDocumentPosition(el) & before) {
      best = headings[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/**
 * Whether `box` is the page's own wrapper: `body`, or one of the elements it
 * holds alone all the way down, such as a React mount and the app shell inside
 * it. Everything that stays on every step lives in these, so they are the whole
 * page rather than any one step. The overlay's own host is left out of the count.
 */
function isPageWrapper(box) {
  for (let el = document.body; el; ) {
    if (el === box) return true;
    const shown = Array.from(el.children).filter((c) => c.id !== ROOT_ID && isVisible(c));
    if (shown.length !== 1) return false;
    el = shown[0];
  }
  return false;
}

/**
 * The box that holds a step's own content, found from the heading that names
 * the step (issue #34): the heading's parent, or, when that parent holds only
 * the heading and a line or two of text (the "title and lead in their own div"
 * habit), the box around it. The whole page is never one step's box: `body`
 * holds everything that stays on every step, so a climb that reaches it gives
 * no box at all. (`body` itself is never a heading group: the overlay's own
 * host element is a child of it.)
 *
 * A climb that lands on the page's own wrapper gives no box either: a title
 * block drawn first inside a React app's shell, apart from the step's card,
 * would otherwise make the whole app one step, and every help line and shared
 * footer in it would lose its pin (review of #34, R1). A heading whose own
 * parent is that wrapper still gets it as its box, because the heading sits
 * straight in it: a page that draws its whole step into one wrapper, with
 * nothing beside it, is one step (the #16 innerHTML prototype).
 */
function stepBox(heading) {
  const isGroup = (box) => box.children.length <= 3 && Array.from(box.children).every((c) => HEADING_GROUP.has(c.localName));
  let box = heading.parentElement;
  let climbed = false;
  while (box && isGroup(box)) {
    box = box.parentElement;
    climbed = true;
  }
  if (!box || box === document.body || (climbed && isPageWrapper(box))) return null;
  return box;
}

/**
 * Name the screen for `el`, and find the box that holds that screen's own
 * content when the name came from around `el` itself. Returns
 * `{ name, source, box }`; box is null when the name came from the page as a
 * whole (a modal elsewhere, the current-step marker, the selected tab, the hash).
 */
function nameScreen(el) {
  // 1. The convention: an ancestor tagged by the prototype itself.
  const tagged = el && el.closest ? el.closest('[data-gm-screen]') : null;
  if (tagged) {
    return { name: collapse(tagged.getAttribute('data-gm-screen')), source: 'data-gm-screen', box: tagged };
  }

  // 2. An open dialog: either the one holding the element, or any modal one,
  //    since a modal dialog IS the screen the reviewer can see.
  const dialogs = perTask('dialogs', () => Array.from(document.querySelectorAll('dialog[open], [role="dialog"]')).filter(isVisible));
  const holding = dialogs.find((d) => el && d.contains(el));
  const dialog = holding || dialogs.find((d) => d.matches('dialog[open]'));
  if (dialog) {
    const name = headingIn(dialog) || collapse(dialog.getAttribute('aria-label')) || 'Dialog';
    return { name, source: 'dialog', box: holding || null };
  }

  // 3. An explicitly marked current step, then 4. the selected tab. Neither
  //    depends on the element, so each is read once per task.
  const marked = perTask('marked', () => {
    const step = document.querySelector('[aria-current="step"]');
    if (isVisible(step)) return { name: headingIn(step) || visibleText(step).slice(0, 60), source: 'aria-current', box: null };
    const tab = document.querySelector('[role="tab"][aria-selected="true"]');
    if (isVisible(tab)) return { name: visibleText(tab), source: 'tab', box: null };
    return null;
  });
  if (marked) return { ...marked };

  // 5. The nearest visible heading above the element.
  const above = el ? headingAbove(el) : null;
  const heading = above ? headingText(above) : '';
  if (heading) return { name: heading, source: 'heading', box: stepBox(above) };

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

/**
 * Whether a screen named `name` is showing anywhere on the page now: a visible
 * tagged wrapper, dialog or heading by that name. A long page shows several
 * headed sections at once, so a comment whose saved address has landed in
 * another section may still have its own section in view, and its words with
 * it (review of #34, R13). A step drawn in place of another is not in view.
 */
export function screenShowing(name) {
  const key = collapse(name);
  if (!key) return false;
  const named = (els, nameOf) => Array.from(document.querySelectorAll(els)).some((el) => isVisible(el) && collapse(nameOf(el)) === key);
  return (
    named('[data-gm-screen]', (el) => el.getAttribute('data-gm-screen')) ||
    named('dialog[open], [role="dialog"]', (el) => el.getAttribute('aria-label')) ||
    visibleHeadings().some((h) => collapse(headingText(h)) === key)
  );
}
