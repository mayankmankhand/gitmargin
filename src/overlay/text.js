// Text helpers shared by the anchor, the screen name and the trail. Whitespace
// in HTML is arbitrary, so everything compares collapsed text: one space
// between words, nothing at the ends.

/** Collapse runs of whitespace to single spaces and trim. */
export function collapse(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

/** The visible text of an element, or its label when it shows only an icon. */
export function visibleText(el) {
  if (!el || el.nodeType !== 1) return '';
  const own = collapse(el.textContent);
  if (own) return own;
  return collapse(el.getAttribute('aria-label') || el.getAttribute('title') || '');
}

/** Truncate for a label, never mid-render: the full text stays in the anchor. */
export function short(value, max = 40) {
  const text = collapse(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
