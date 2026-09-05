// Text helpers shared by the anchor, the screen name and the trail. Whitespace
// in HTML is arbitrary, so everything compares collapsed text: one space
// between words, nothing at the ends.

/** Collapse runs of whitespace to single spaces and trim. */
export function collapse(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

/**
 * Whether a rendered child ends the run of text around it.
 *
 * `textContent` concatenates children with nothing in between, so a container
 * whose children are separated by CSS rather than by whitespace in the markup
 * reads as one long word: the fixture's `<strong>Commuting</strong><small>...`
 * came back as "CommutingTrains, buses, walking". The separation is real on
 * screen and invisible to `textContent`.
 *
 * The signal has to be the COMPUTED display, not the tag name: `strong`,
 * `small` and `span` are all inline by default, and both cases in the fixture
 * are separated by CSS (`display: block` on one, flex-item blockification on
 * the other). A tag-name list catches neither.
 *
 * `contents` and an empty string do not break: the first generates no box of
 * its own, and the second means the element is not in a rendered document,
 * where guessing a break would invent whitespace that was never there.
 */
function breaksLine(el, display) {
  return el.localName === 'br' || !(display === 'contents' || display === '' || display.startsWith('inline'));
}

/** Append `node`'s rendered text to `parts`, a space at every visual break. */
function walk(node, parts) {
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      parts.push(child.data);
      continue;
    }
    if (child.nodeType !== 1) continue;
    const display = getComputedStyle(child).display;
    // Not rendered, so not read. Skipping it keeps the quote to what the
    // reviewer could actually see - the other four steps of a wizard are not
    // part of the text of the container holding them.
    if (display === 'none') continue;
    const breaks = breaksLine(child, display);
    if (breaks) parts.push(' ');
    walk(child, parts);
    if (breaks) parts.push(' ');
  }
}

/**
 * An element's text the way a person reads it off the screen.
 *
 * Not `innerText`. Two measured reasons, neither of them about resolution -
 * matching ignores whitespace (see byQuote in anchor.js), so a quote finds its
 * element either way. First, the browser makes `innerText` fall back to
 * `textContent` whenever an element is not being rendered, so the quote stored
 * for a wizard step would read as words or as one long run depending on which
 * screen the reviewer happened to be on. Second, it does not separate
 * blockified flex items at all: the fixture's spec row comes back glued even
 * when it is on screen, which is the case this fix exists for.
 *
 * Computed display has neither problem: a display:none subtree still reports
 * the real display of everything inside it. Measured on both fixtures, #8.
 */
export function renderedText(el) {
  if (!el || el.nodeType !== 1) return '';
  const parts = [];
  walk(el, parts);
  return collapse(parts.join(''));
}

/** The visible text of an element, or its label when it shows only an icon. */
export function visibleText(el) {
  if (!el || el.nodeType !== 1) return '';
  const own = renderedText(el);
  if (own) return own;
  return collapse(el.getAttribute('aria-label') || el.getAttribute('title') || '');
}

/** Truncate for a label, never mid-render: the full text stays in the anchor. */
export function short(value, max = 40) {
  const text = collapse(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
