// What the service accepts, field by field.
//
// Everything that reaches a key route was written by whoever holds the page
// key, and a public page means a public key. So nothing is stored because it
// arrived: a comment is rebuilt from the fields the batch format defines
// (`docs/batch-format.md` section 3), the same way `pull` rebuilds one from a
// returned file, and anything else is dropped.

export const LIMITS = {
  text: 4000,
  commentBytes: 32 * 1024,
  name: 80,
  comments: 500,
  replies: 100,
  versions: 50,
  pageBytes: 4 * 1024 * 1024,
  pagesKept: 10,
  writesPerMinute: 60,
};

export const STATUSES = ['open', 'accepted', 'rejected', 'applied'];
const TAGS = ['change', 'bug', 'question', 'like'];

export const isCommentId = (v) => typeof v === 'string' && /^c_[0-9a-f]{6}$/.test(v);
export const isReplyId = (v) => typeof v === 'string' && /^r_[0-9a-f]{6}$/.test(v);
export const isHash = (v) => typeof v === 'string' && /^[0-9a-f]{6}$/.test(v);
export const isVersionId = (v) => typeof v === 'string' && /^v\d{1,4}-[0-9a-f]{6}$/.test(v);
export const isToken = (v) => typeof v === 'string' && v.length >= 16 && v.length <= 200;

const str = (v) => (typeof v === 'string' ? v : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

/**
 * The nested parts of a comment, leaf by leaf.
 *
 * These used to pass through whole, on the reasoning that the size cap bounded
 * them. Size was never the problem: other people's browsers READ these values.
 * A quote whose `exact` was a number reached a string method in every
 * reviewer's pin drawing and threw, and one stored comment hid everyone's pins
 * (review of the #15 cycle, R4). So every leaf is a string, a finite number,
 * or null, and nothing else is kept.
 */
const pick = (value, shape) => {
  const source = obj(value);
  if (!source) return null;
  return Object.fromEntries(Object.entries(shape).map(([key, leaf]) => [key, leaf(source[key])]));
};
const QUOTE = { prefix: str, exact: str, suffix: str };
const POINT = { x: num, y: num };
const SCREEN = { name: str, source: str };
const STEP = { seconds_before: num, selector: str, text: str };
const SCROLL = { x: num, y: num };
const VIEWPORT = { width: num, height: num };

/** A display name: one line, trimmed, cut rather than refused. */
export function cleanName(value) {
  return String(typeof value === 'string' ? value : '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIMITS.name);
}

/** Comment or reply text. Returns `{ text }` or `{ error }`. */
export function cleanText(value) {
  if (typeof value !== 'string' || !value.trim()) return { error: 'invalid' };
  if (value.length > LIMITS.text) return { error: 'too_long' };
  return { text: value };
}

/** `{ text, tag }`, or `{ error }`. An unknown tag becomes no tag. */
export function cleanIntent(value) {
  const intent = obj(value);
  if (!intent) return { error: 'invalid' };
  const text = cleanText(intent.text);
  if (text.error) return text;
  return { intent: { text: text.text, tag: TAGS.includes(intent.tag) ? intent.tag : null } };
}

/**
 * One part-1 comment with only the fields the format defines, or `{ error }`.
 * `status` and `replies` are never taken from the sender: a new comment is
 * open and has no replies, whatever arrived.
 */
export function cleanComment(raw) {
  const comment = obj(raw);
  if (!comment || !isCommentId(comment.id)) return { error: 'invalid' };
  const intent = cleanIntent(comment.intent);
  if (intent.error) return intent;

  const anchor = obj(comment.anchor) || {};
  const state = obj(comment.state) || {};
  const body = {
    id: comment.id,
    time: str(comment.time),
    intent: intent.intent,
    anchor: {
      selector: str(anchor.selector),
      quote: pick(anchor.quote, QUOTE),
      point: pick(anchor.point, POINT),
      tag: str(anchor.tag),
      resolution: str(anchor.resolution),
    },
    state: {
      hash: str(state.hash),
      title: str(state.title),
      screen: pick(state.screen, SCREEN),
      trail: Array.isArray(state.trail) ? state.trail.slice(0, 20).map((step) => pick(step, STEP)).filter(Boolean) : [],
      scroll: pick(state.scroll, SCROLL),
      viewport: pick(state.viewport, VIEWPORT),
      // A screenshot is a data URL of unbounded size, and no build writes one
      // yet. The slot stays in the format; the service does not store it.
      screenshot: null,
    },
  };

  // Every leaf is typed above; the total size bounds what the strings can carry.
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > LIMITS.commentBytes) return { error: 'too_long' };
  return { body };
}
