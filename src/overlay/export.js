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
  const stampedAt = env.exported_at.replace('T', ' ').replace('Z', ' UTC').slice(0, 20);
  const head = [
    `gitmargin batch v${FORMAT_VERSION} | ${env.file || 'unknown file'} | ${env.version_id || 'no version id'}`,
    `Reviewer: ${env.reviewer.name || 'not given'}. ` +
      `Viewport ${env.viewport.width}x${env.viewport.height}. Exported ${stampedAt}.`,
  ];

  const lines = env.comments.map((c, i) => {
    const bits = [];
    if (c.intent.tag) bits.push(`[${c.intent.tag}]`);

    const screen = c.state.screen && c.state.screen.name;
    const where = screen ? `On "${screen}"${c.state.hash ? ` (${c.state.hash})` : ''}` : 'On this page';
    bits.push(where);

    const trail = (c.state.trail || []).map((t) => t.text).filter(Boolean);
    if (trail.length) bits.push(`after clicking ${trail.join(', ')}`);

    const quote = c.anchor.quote && c.anchor.quote.exact;
    const target = quote ? `the "${quote}" element` : 'the element';
    const selector = c.anchor.selector ? ` (${c.anchor.selector})` : '';
    const status = resolve(c.anchor).status === 'orphaned' ? ' [orphaned: spot not found]' : '';

    return `${i + 1}. ${bits.join(', ')}: ${target}${selector}${status}.\n   "${c.intent.text}"`;
  });

  const tail = env.overall_note ? [`Overall: ${env.overall_note}`] : [];
  return [head.join('\n'), lines.join('\n\n'), tail.join('')].filter(Boolean).join('\n\n');
}

/**
 * The reviewed file: the page as it was delivered, with the comments in it.
 *
 * Any block from an earlier round is replaced rather than appended to, so a
 * reviewed file can be reviewed again without collecting duplicates.
 */
export function reviewedHtml() {
  const stripped = originalHtml.replace(
    /[ \t]*<script\b[^>]*\bid=["']gitmargin-comments["'][^>]*>[\s\S]*?<\/script>[ \t]*\r?\n?/gi,
    ''
  );
  const block = `<script type="application/json" id="gitmargin-comments">\n${embeddedJson()}\n</script>\n`;

  const at = stripped.toLowerCase().lastIndexOf('</body>');
  if (at < 0) return stripped + block;
  return stripped.slice(0, at) + block + stripped.slice(at);
}

/** `wizard.html` -> `wizard.reviewed.html`. */
export function reviewedFileName() {
  const base = (stamp.file || '').replace(/\.x?html?$/i, '');
  return `${base || 'prototype'}.reviewed.html`;
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
