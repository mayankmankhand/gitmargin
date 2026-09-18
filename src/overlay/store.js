// The comments, and the one place they are kept.
//
// Part 1 has no server and no sign-in, so the store is the page itself plus a
// best-effort copy in localStorage keyed by the version id. Best-effort is
// deliberate: a browser that refuses storage to a file:// page still works for
// one sitting, and losing a saved draft is better than an overlay that throws.

const PREFIX = 'gitmargin:';

/**
 * A short stable hash of the document's path.
 *
 * Every file:// page shares one storage origin, so a key built from the version
 * id alone puts two prototypes in the same bucket - and with no `attach` command
 * yet, "no version id" is the normal case, which made the collision the default
 * rather than an edge case. Comments from one prototype would load into another
 * and be exported back to the wrong author (review R4).
 */
function pathTag() {
  const path = String(location.pathname || '');
  let h = 0;
  for (let i = 0; i < path.length; i += 1) h = (Math.imul(h, 31) + path.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** `c_` plus six hex characters. Random, so two reviewers' files never collide. */
export function newId() {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return `c_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** In-memory state. The array order is the order comments were made. */
const state = {
  comments: [],
  reviewer: '',
  overallNote: '',
  path: '',
};

/**
 * Whether the last write to storage actually landed. Null until one is tried.
 * The interface reads this: swallowing the error is right, hiding it is not,
 * because the reviewer cannot otherwise know whether closing the tab is safe
 * (review R25).
 */
let storageWorks = null;
export const storageOk = () => storageWorks;

let storageKey = `${PREFIX}unversioned`;
/** True once the reviewer has downloaded or copied the batch this session. */
let exported = false;
export const hasExported = () => exported;
export const markExported = () => {
  exported = true;
};
export const hasUnexportedWork = () =>
  (state.comments.length > 0 || state.overallNote.trim().length > 0) && !exported;
const listeners = new Set();

function persist() {
  try {
    state.path = location.pathname || '';
    localStorage.setItem(storageKey, JSON.stringify(state));
    storageWorks = true;
  } catch {
    /* private mode, a file:// page without storage, or a full quota */
    storageWorks = false;
  }
}

function announce() {
  persist();
  listeners.forEach((fn) => fn());
}

/** A change after an export means there is something new to send again. */
function touched() {
  exported = false;
  announce();
}

/** Load anything saved for this version id. Call once, before the UI mounts. */
export function load(versionId) {
  storageKey = `${PREFIX}${versionId || 'unversioned'}:${pathTag()}`;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    // The key already separates documents; the path check is the belt to that
    // braces, so a hash collision cannot pull in another file's comments.
    const samePlace = !saved || !saved.path || saved.path === (location.pathname || '');
    if (saved && samePlace && Array.isArray(saved.comments)) {
      state.comments = saved.comments;
      state.reviewer = typeof saved.reviewer === 'string' ? saved.reviewer : '';
      state.overallNote = typeof saved.overallNote === 'string' ? saved.overallNote : '';
    }
  } catch {
    /* unreadable storage is the same as empty storage */
  }
}

/**
 * Merge comments that arrived inside the file with whatever is already loaded.
 * Existing ids win, so a reviewer reopening their own reviewed file does not
 * end up with two of everything (review R3).
 */
export function seed(comments, reviewerName, note) {
  const known = new Set(state.comments.map((c) => c.id));
  const incoming = (comments || []).filter((c) => c && c.id && !known.has(c.id));
  if (incoming.length) state.comments = incoming.concat(state.comments);
  if (!state.reviewer && reviewerName) state.reviewer = reviewerName;
  if (!state.overallNote && note) state.overallNote = note;
  if (incoming.length || reviewerName || note) announce();
}

/** Run `fn` whenever anything changes. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const comments = () => state.comments;
export const reviewer = () => state.reviewer;
export const overallNote = () => state.overallNote;

export function setReviewer(name) {
  state.reviewer = String(name || '');
  announce();
}

export function setOverallNote(note) {
  state.overallNote = String(note || '');
  touched();
}

export function add(comment) {
  state.comments.push(comment);
  touched();
  return comment;
}

export function update(id, fields) {
  const comment = state.comments.find((c) => c.id === id);
  if (!comment) return null;
  Object.assign(comment, fields);
  touched();
  return comment;
}

export function remove(id) {
  const at = state.comments.findIndex((c) => c.id === id);
  if (at < 0) return false;
  state.comments.splice(at, 1);
  touched();
  return true;
}

/**
 * Take what the comment service says (issue #15, src/overlay/sync.js).
 *
 * `upsert` replaces a comment by id or adds it; `drop` removes ids. The list is
 * then ordered by when each comment was written, with the id as tie-break, so
 * everyone looking at the page sees the same comment as "3". Announces without
 * `touched()`: someone else's comment arriving is not unexported work of mine.
 */
export function applyRemote({ upsert = [], drop = [] }) {
  if (!upsert.length && !drop.length) return;
  const gone = new Set(drop);
  const byId = new Map(state.comments.filter((c) => !gone.has(c.id)).map((c) => [c.id, c]));
  upsert.forEach((c) => byId.set(c.id, c));
  state.comments = [...byId.values()].sort(
    (a, b) => String(a.time || '').localeCompare(String(b.time || '')) || String(a.id).localeCompare(String(b.id))
  );
  announce();
}
