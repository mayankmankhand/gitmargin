// The comments, and the one place they are kept.
//
// Part 1 has no server and no sign-in, so the store is the page itself plus a
// best-effort copy in localStorage keyed by the version id. Best-effort is
// deliberate: a browser that refuses storage to a file:// page still works for
// one sitting, and losing a saved draft is better than an overlay that throws.

const PREFIX = 'gitmargin:';

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
};

let storageKey = `${PREFIX}unversioned`;
const listeners = new Set();

function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    /* private mode, a file:// page without storage, or a full quota */
  }
}

function announce() {
  persist();
  listeners.forEach((fn) => fn());
}

/** Load anything saved for this version id. Call once, before the UI mounts. */
export function load(versionId) {
  storageKey = `${PREFIX}${versionId || 'unversioned'}`;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && Array.isArray(saved.comments)) {
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
  announce();
}

export function add(comment) {
  state.comments.push(comment);
  announce();
  return comment;
}

export function update(id, fields) {
  const comment = state.comments.find((c) => c.id === id);
  if (!comment) return null;
  Object.assign(comment, fields);
  announce();
  return comment;
}

export function remove(id) {
  const at = state.comments.findIndex((c) => c.id === id);
  if (at < 0) return false;
  state.comments.splice(at, 1);
  announce();
  return true;
}
