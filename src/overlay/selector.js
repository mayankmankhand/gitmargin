// A short CSS selector that finds one element again.
//
// Short matters: the selector is read by a human in the batch and by an agent
// looking for the spot in the source. Robust matters more, so the anchor also
// carries a text quote (anchor.js) - this is only the first of three ways back
// to the same element.

/** Classes that describe a moment, not an element: never build a selector on one. */
const STATE_CLASSES = new Set([
  'active', 'open', 'selected', 'current', 'on', 'off', 'show', 'shown',
  'hidden', 'visible', 'disabled', 'expanded', 'collapsed', 'checked', 'error',
]);

const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/[^\w-]/g, '\\$&'));

function isUnique(selector) {
  try {
    return document.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

/** `#id` when the id exists and is unique, otherwise null. */
function idSelector(el) {
  if (!el || !el.id) return null;
  const candidate = `#${esc(el.id)}`;
  return isUnique(candidate) ? candidate : null;
}

/** A class worth naming: readable, not a state, not a hash. */
function stableClass(el) {
  return Array.from(el.classList).find(
    (c) => /^[a-z][a-z0-9-]*$/i.test(c) && c.length <= 24 && !STATE_CLASSES.has(c.toLowerCase())
  );
}

/** One path segment: the tag, narrowed by a class or an index only when needed. */
function segment(el) {
  const tag = el.localName;
  const parent = el.parentElement;
  if (!parent) return tag;

  const sameTag = Array.from(parent.children).filter((c) => c.localName === tag);
  if (sameTag.length === 1) return tag;

  const cls = stableClass(el);
  if (cls && sameTag.filter((c) => c.classList.contains(cls)).length === 1) {
    return `${tag}.${esc(cls)}`;
  }
  return `${tag}:nth-of-type(${sameTag.indexOf(el) + 1})`;
}

/**
 * Build a selector for `el`, anchored on the nearest unique id when there is
 * one. Returns null for anything that is not an element.
 */
export function selectorFor(el) {
  if (!el || el.nodeType !== 1) return null;

  const own = idSelector(el);
  if (own) return own;

  // Walk up to the nearest ancestor with a unique id and anchor there. A path
  // anchored on `#step-3` says which screen the element is on, survives changes
  // elsewhere in the page, and is what a human reads in the batch. Stopping at
  // the first merely-unique selector gives shorter but blinder ones.
  const parts = [];
  let node = el;
  let anchor = null;
  while (node && node.nodeType === 1 && node !== document.documentElement) {
    parts.unshift(segment(node));
    const parentId = idSelector(node.parentElement);
    if (parentId) {
      anchor = parentId;
      break;
    }
    node = node.parentElement;
  }

  const full = (anchor ? `${anchor} > ` : '') + parts.join(' > ');
  if (isUnique(full)) return full;

  // Repeated structure with no id to hold on to: take the shortest tail that
  // still identifies one element, and accept the full path when none does.
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const tail = parts.slice(i).join(' > ');
    if (isUnique(tail)) return tail;
  }
  return full || null;
}
