// gitmargin overlay, part 1.
//
// One script inside one HTML file. The reviewer opens the file anywhere, from
// disk included, says what they expected, and sends the comments back as the
// same file or as a block of text. No server, no upload, no account.
//
// snapshot.js is imported first on purpose: it captures the page as delivered
// at module-evaluation time, before anything here creates an element.
import { originalHtml, stamp } from './snapshot.js';
import { anchorFromElement, anchorFromSelection, resolve } from './anchor.js';
import { screenFor } from './screen.js';
import { startTrail, trailFor, setRecording } from './trail.js';
import * as store from './store.js';
import * as batch from './export.js';
import { mountUi } from './ui.js';

const isoSeconds = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * Build a comment record. Everything about *where* is captured now, at the
 * moment the reviewer stopped, because that is the only moment it is true.
 */
export function createComment({ anchor, element, text, tag }) {
  return {
    id: store.newId(),
    time: isoSeconds(),
    intent: { text: String(text || '').trim(), tag: tag || null },
    anchor,
    state: {
      hash: location.hash || null,
      title: document.title || null,
      screen: screenFor(element),
      trail: trailFor(),
      scroll: { x: Math.round(window.scrollX), y: Math.round(window.scrollY) },
      // Per comment, not per export: viewport width decides which responsive
      // layout the reviewer was looking at, and they may resize or move to
      // another screen before they send the batch (review R11).
      viewport: { width: window.innerWidth, height: window.innerHeight },
      // Out of the v0.1 build by decision: a rendering library costs every
      // prototype ~200KB, and the trail plus the screen name already say where.
      // The field stays so the format does not change when it arrives.
      screenshot: null,
    },
    status: 'open',
  };
}

function start() {
  store.load(stamp.versionId);
  // Comments this file already carries from an earlier round. Without this the
  // returned file is a dead end: nobody can read it back, and re-sending it
  // would replace its comments with an empty list (review R3).
  const carried = batch.embeddedReviewer();
  store.seed(batch.embeddedComments(), carried.name, carried.note);
  startTrail();

  const ui = mountUi({
    store,
    batch,
    createComment,
    anchorFromElement,
    anchorFromSelection,
    resolve,
    setRecording,
  });

  // The only global the overlay adds: a handle for the tests, and the seam the
  // CLI in issue #5 will read. Everything else lives in the bundle's closure.
  window.__gitmargin = {
    format: batch.FORMAT_VERSION,
    versionId: stamp.versionId,
    file: stamp.file,
    export: batch.envelope,
    markdown: batch.markdown,
    reviewedHtml: batch.reviewedHtml,
    originalLength: originalHtml().length,
    // Read by the test suite: the clipboard cannot be read back reliably from a
    // file:// page in every engine, so the overlay reports what it put there.
    trail: () => trailFor(),
    lastCopy: null,
    lastCopyOk: null,
    ui,
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
