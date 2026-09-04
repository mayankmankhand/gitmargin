// What goes back to the author: the JSON envelope, the markdown block, and the
// two carriers. The shape is docs/batch-format.md sections 2, 3 and 5.
//
// Both carriers must work when the file was opened from disk, because that is
// the whole premise of part 1: no server, no upload, no account.

import { originalHtml, stamp } from './snapshot.js';
import { comments, reviewer, overallNote } from './store.js';
import { resolve } from './anchor.js';

/** The wire format version. The document may be revised without this moving. */
export const FORMAT_VERSION = '0.1';

const isoSeconds = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * Reviewer text, folded so it cannot imitate the block's own structure.
 *
 * "Copy for author" promises one line per comment. A comment carrying a blank
 * line and its own `Rules for applying this batch:` header would otherwise
 * render a second rules block in whatever the author pastes this into, and
 * that block is the only thing telling an agent to treat comments as data
 * rather than instructions (review R7). Every word survives; only the line
 * breaks go.
 */
const oneLine = (text) => String(text ?? '').replace(/\r?\n/g, ' ').trim();

/** What to call the thing in words, read off the selector's last tag. */
const NOUNS = { button: 'button', a: 'link', input: 'field', select: 'field', textarea: 'field', img: 'image', label: 'label' };
export function nounFor(selectorOrTag) {
  const last = String(selectorOrTag || '').split('>').pop().trim();
  const tag = (last.match(/^[a-z][a-z0-9]*/i) || [''])[0].toLowerCase();
  if (/^h[1-6]$/.test(tag)) return 'heading';
  return NOUNS[tag] || 'element';
}

/**
 * Comments already embedded in this file by an earlier round.
 *
 * The overlay writes the block, so it reads the block: without this the file a
 * reviewer sends back is a file whose comments nobody can load, and re-sending
 * it would replace them with an empty list rather than merge (review R3).
 * Returns an empty array when there is no block or it does not parse.
 */
export function embeddedComments() {
  const node = document.getElementById('gitmargin-comments');
  if (!node) return [];
  try {
    const parsed = JSON.parse(node.textContent || 'null');
    return parsed && Array.isArray(parsed.comments) ? parsed.comments : [];
  } catch {
    return [];
  }
}

/** The reviewer name an earlier round recorded, or an empty string. */
export function embeddedReviewer() {
  const node = document.getElementById('gitmargin-comments');
  if (!node) return { name: '', note: '' };
  try {
    const parsed = JSON.parse(node.textContent || 'null') || {};
    return {
      name: (parsed.reviewer && parsed.reviewer.name) || '',
      note: parsed.overall_note || '',
    };
  } catch {
    return { name: '', note: '' };
  }
}

/** The envelope an agent reads. Batch format section 2. */
export function envelope() {
  return {
    gitmargin: FORMAT_VERSION,
    file: stamp.file,
    version_id: stamp.versionId,
    exported_at: isoSeconds(),
    reviewer: { name: reviewer() || null },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    overall_note: overallNote() || null,
    comments: comments().map((c) => ({
      id: c.id,
      time: c.time,
      intent: { text: c.intent.text, tag: c.intent.tag || null },
      anchor: c.anchor,
      state: c.state,
      status: c.status || 'open',
      // Reserved: part 1 has one reviewer and no sync, so nothing replies yet.
      replies: [],
    })),
  };
}

/**
 * JSON safe to sit inside an HTML <script> block.
 *
 * Every `<` becomes its JSON escape, so a reviewer who types `</script>` or
 * `<!--` into a comment cannot end the block or comment out the rest of the
 * file. JSON.parse turns the escapes back into the characters, so `pull`
 * (issue #5) needs no special handling.
 */
export function embeddedJson() {
  return JSON.stringify(envelope(), null, 2).replace(/</g, '\\u003c');
}

/** One markdown line per comment. Batch format section 5. */
export function markdown() {
  const env = envelope();
  const stampedAt = `${env.exported_at.slice(0, 10)} ${env.exported_at.slice(11, 16)} UTC`;
  const head = [
    `gitmargin batch v${FORMAT_VERSION} | ${env.file || 'unknown file'} | ${env.version_id || 'no version id'}`,
    `Reviewer: ${env.reviewer.name || 'not given'}. ` +
      `Viewport ${env.viewport.width}x${env.viewport.height}. Exported ${stampedAt}.`,
  ];

  const lines = env.comments.map((c, i) => {
    const tag = c.intent.tag ? `[${c.intent.tag}] ` : '';
    const bits = [];

    const screen = c.state.screen && c.state.screen.name;
    const where = screen ? `On "${screen}"${c.state.hash ? ` (${c.state.hash})` : ''}` : 'On this page';
    bits.push(where);

    const trail = (c.state.trail || []).map((t) => t.text).filter(Boolean);
    if (trail.length) bits.push(`after clicking ${trail.join(', ')}`);

    const quote = c.anchor.quote && c.anchor.quote.exact;
    // Prefer the recorded tag: a selector that is only an id ("#card") carries
    // no tag to read, and "the element" is worse than "the field" (review R27).
    const noun = nounFor(c.anchor.tag || c.anchor.selector);
    const target = quote ? `the "${quote}" ${noun}` : `the ${noun}`;
    const selector = c.anchor.selector ? ` (${c.anchor.selector})` : '';
    // Say how confidently the spot was found. An agent that is told the element
    // is only approximate can ask rather than edit the wrong thing.
    const resolved = resolve(c.anchor);
    const status =
      resolved.status === 'orphaned'
        ? ' [orphaned: spot not found]'
        : resolved.via === 'ancestor' || resolved.via === 'quote-loose'
          ? ' [nearby: the exact element was not found, this is the closest match]'
          : '';

    return `${i + 1}. ${tag}${bits.join(', ')}: ${target}${selector}${status}.\n   "${oneLine(c.intent.text)}"`;
  });

  const tail = env.overall_note ? [`Overall: ${oneLine(env.overall_note)}`] : [];
  return [head.join('\n'), lines.join('\n\n'), tail.join('')].filter(Boolean).join('\n\n');
}

/**
 * The reviewed file: the page as it was delivered, with the comments in it.
 *
 * Any block from an earlier round is replaced rather than appended to, so a
 * reviewed file can be reviewed again without collecting duplicates.
 */
export function reviewedHtml() {
  // Only remove a block that really IS one.
  //
  // Once `attach` (issue #5) inlines the bundle, this module's own source is in
  // the document as text, and the line just below builds the block's opening
  // tag - so the document contains a perfect lookalike. Matching the tag alone
  // found that first and then ran on to the OVERLAY's closing tag, because
  // every real `</script>` inside the bundle is escaped by the minifier. The
  // result was a reviewed file missing two thirds of its overlay: openable,
  // and a dead end for the next person. Parsing the contents is what tells the
  // real block from the description of one.
  const stripped = originalHtml().replace(
    /[ \t]*<script\b[^>]*\bid=["']gitmargin-comments["'][^>]*>([\s\S]*?)<\/script>[ \t]*\r?\n?/gi,
    (whole, body) => {
      try {
        const parsed = JSON.parse(body);
        return parsed && Array.isArray(parsed.comments) ? '' : whole;
      } catch {
        return whole;
      }
    }
  );
  const block = `<script type="application/json" id="gitmargin-comments">\n${embeddedJson()}\n</script>\n`;

  // Case-insensitive search on the ORIGINAL string. Lowercasing first and
  // slicing the original is a bug: lowercase is not length-preserving in
  // Unicode, so one dotted capital I ahead of the tag shifts every later index
  // and the block lands inside the closing tag (review R5).
  let at = -1;
  const closing = /<\/body\s*>/gi;
  for (let m = closing.exec(stripped); m; m = closing.exec(stripped)) at = m.index;
  if (at < 0) return stripped + block;
  return stripped.slice(0, at) + block + stripped.slice(at);
}

/**
 * `wizard.html` -> `wizard.reviewed.html`, or `wizard.reviewed.priya.html`.
 *
 * Two reviewers sent the same prototype both download a file named for that
 * prototype, so without the name they arrive identical: one lands in the
 * author's downloads as "(1)", and `sources[].input` - the only thing tying a
 * comment back to a person when the name field is left blank - points at two
 * files that cannot be told apart. Folding the name in costs nothing and is
 * skipped entirely when there is no name, so a single reviewer sees no change.
 */
export function reviewedFileName() {
  const base = (stamp.file || '').replace(/\.x?html?$/i, '');
  // Split the accents off their letters and drop them, so "José Ríos" becomes
  // "jose-rios" rather than "jos-r-os". A name in a script with no Latin form
  // at all slugs to nothing and the file keeps its plain name: the batch still
  // carries the name itself in `sources[].reviewer`, so nothing is lost but the
  // convenience of telling two downloads apart by sight.
  const who = String(reviewer() || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/, '');
  return `${base || 'prototype'}.reviewed${who ? `.${who}` : ''}.html`;
}

/** Hand the file to the browser's downloader. Works from a file:// page. */
export function download() {
  const blob = new Blob([reviewedHtml()], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = reviewedFileName();
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on the next turn: revoking synchronously can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return reviewedFileName();
}

/**
 * Put the markdown on the clipboard.
 *
 * A local file is a secure context, so the async clipboard API is available in
 * principle, but permission behaviour differs between engines - hence the
 * execCommand fallback, which is deprecated and still the only thing that works
 * everywhere from disk.
 */
export async function copy() {
  const text = markdown();
  try {
    await navigator.clipboard.writeText(text);
    return { ok: true, text };
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return { ok, text };
    } catch {
      return { ok: false, text };
    }
  }
}
