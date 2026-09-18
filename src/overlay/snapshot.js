// The page as delivered, captured before the overlay touches anything.
//
// "Send to author" must hand back the prototype the reviewer received, not the
// prototype as they left it: serialising the live DOM would save a wizard stuck
// on step 3, with the overlay's own panel baked in. A page opened from disk
// cannot fetch its own source, so the snapshot is taken here instead - this
// module is imported first, and the overlay's script tag is the last element in
// <body>, so at this moment the document is fully parsed and nothing of ours
// exists yet.
//
// Known limit (to confirm in the issue #6 dogfood): a prototype script that ran
// before this one has already changed the DOM, and its changes are part of the
// snapshot. For the init-on-load scripts an AI writes, that is harmless.
//
// The capture is deferred when the document is still parsing. The bundle is a
// classic script, so nothing defers it for us: pasted into <head> by hand, it
// would otherwise capture a document with no body at all and hand the author
// back an empty page (review R6).

function doctypeString(dt) {
  if (!dt) return '';
  const publicId = dt.publicId ? ` PUBLIC "${dt.publicId}"` : '';
  const systemId = dt.systemId ? `${dt.publicId ? '' : ' SYSTEM'} "${dt.systemId}"` : '';
  return `<!DOCTYPE ${dt.name}${publicId}${systemId}>\n`;
}

let captured = null;

/** Take the snapshot now. Safe to call twice; the first capture wins. */
export function capture() {
  if (captured === null) {
    captured = doctypeString(document.doctype) + document.documentElement.outerHTML;
  }
  return captured;
}

/**
 * The page as delivered. Callers read this at export time, long after start(),
 * so the getter always has a value; the fallback capture is there only so a
 * misuse returns the live document rather than null.
 */
export function originalHtml() {
  return captured === null ? capture() : captured;
}

// Capture immediately when the document is already parsed - the documented
// placement, last in <body> - and otherwise as soon as parsing finishes.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', capture, { once: true });
} else {
  capture();
}

function meta(name) {
  const el = document.querySelector(`meta[name="${name}"]`);
  const value = el && el.getAttribute('content');
  return value ? value.trim() : null;
}

/**
 * The stamp `npx gitmargin attach` writes into <head>. Both may be absent when
 * the overlay was pasted in by hand; the batch then carries a null version_id
 * and the download falls back to a generic name.
 */
export const stamp = {
  versionId: meta('gitmargin-version'),
  file: meta('gitmargin-file'),
  // Written only by `attach --service` (issue #15). Both absent is the normal
  // case, and then nothing in the overlay ever touches the network.
  service: meta('gitmargin-service'),
  key: meta('gitmargin-key'),
};
