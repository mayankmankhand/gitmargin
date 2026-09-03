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
    originalLength: originalHtml.length,
    lastCopy: null,
    ui,
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
