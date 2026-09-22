// Who a comment is from, drawn as a chip (issue #21).
//
// A pin carries the author's initials on a colour that is theirs for the whole
// page, so three people's comments are told apart at a glance and a reader can
// follow one person's trail. Pure functions, so they are tested in Node.

/**
 * Eight fills that all clear 4.5:1 with white initials on top. The set is
 * fixed rather than generated, so the same person keeps the same colour in
 * every browser and every session.
 */
export const HUES = ['#d1242f', '#7c3aed', '#2563eb', '#0f766e', '#15803d', '#b45309', '#be185d', '#4338ca'];

/** The chip of a person with no name at all: grey, with a question mark. */
export const NEUTRAL = '#6b7280';

/** A small stable hash, so the pick is the same everywhere. */
function hashOf(text) {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  return h >>> 0;
}

/**
 * Up to two initials: the first letter of the first word and of the last word,
 * so "Priya Shah" is PS and "Mayank" is M. A blank name is "?", never an empty
 * chip. Read by code point, so a name in any script gets a whole character.
 */
export function initialsOf(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const first = Array.from(words[0])[0] || '';
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] || '' : '';
  return (first + last).toUpperCase();
}

/**
 * The fill for `author`: one of the eight, chosen by the handle when there is
 * one (two people can share a display name; the handle is what the service
 * vouched for) and by the name otherwise. No name at all gets the neutral grey.
 */
export function authorHue(author) {
  const key = author && (author.username || author.name);
  const text = String(key || '').trim().toLowerCase();
  if (!text) return NEUTRAL;
  return HUES[hashOf(text) % HUES.length];
}
