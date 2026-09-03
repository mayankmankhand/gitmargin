// Finding the comment block in a file that also contains the overlay.
//
// This is subtler than it looks, and getting it wrong corrupts prototypes.
//
// Once `attach` inlines the bundle, the overlay's own source code lives in the
// document as text - and that source builds the comment block, so it contains
// the literal
//
//     <script type="application/json" id="gitmargin-comments">
//
// A naive regex finds that lookalike first. It then scans for the next
// `</script>`, which is not the lookalike's (esbuild escapes every real closing
// tag inside the bundle as `<\/script>`) but the OVERLAY's own closing tag, tens
// of kilobytes later. A strip built that way deletes the second half of the
// overlay and hands the reviewer a file whose comments nobody can load.
//
// So a candidate is only the real block when its contents actually parse as one.
// That is the whole idea here, and it is why every caller goes through this
// module rather than matching the tag itself.

/** Every tag-shaped candidate. Global and stateless per call by construction. */
const candidates = () =>
  /[ \t]*<script\b[^>]*\bid=["']gitmargin-comments["'][^>]*>([\s\S]*?)<\/script>[ \t]*\r?\n?/gi;

/** An envelope, or null when this candidate is not one. */
function asEnvelope(content) {
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' && Array.isArray(parsed.comments) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The batch a file carries.
 *
 * Returns the envelope, `null` when the file carries none, or the string
 * 'broken' when something was clearly meant to be the block and is not. The
 * last case exists so a truncated file gets a real explanation instead of
 * "no comments here": the real block's content always starts with `{`, and no
 * fragment of the bundle does.
 */
export function findEnvelope(html) {
  let found = null;
  let brokenish = false;

  for (const match of html.matchAll(candidates())) {
    const envelope = asEnvelope(match[1]);
    // Last one wins: the real block is appended just before </body>, after any
    // lookalike inside the overlay above it.
    if (envelope) found = envelope;
    else if (match[1].trim().startsWith('{')) brokenish = true;
  }

  if (found) return found;
  return brokenish ? 'broken' : null;
}

/** The document without its comment blocks, leaving every lookalike in place. */
export function stripEnvelopes(html) {
  return html.replace(candidates(), (whole, content) => (asEnvelope(content) ? '' : whole));
}
