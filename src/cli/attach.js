// `gitmargin attach <prototype.html>`
//
// Writes a copy of one HTML file with the overlay inlined and a version id
// stamped in. The original is never opened for writing: the copy is the thing
// you send, and if anything here is wrong you still have the file you started
// with.
//
// Inlined rather than linked on purpose. A prototype travels alone - dropped
// into Slack, attached to an email, opened from a downloads folder - so a
// <script src> pointing at anything would arrive broken.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError, EXIT_OK, EXIT_REFUSED, EXIT_USAGE, replaceOnce } from './errors.js';
import { stripEnvelopes } from './comment-block.js';

/** The built overlay, found relative to this file rather than to the cwd. */
const BUNDLE_PATH = fileURLToPath(new URL('../../dist/gitmargin.js', import.meta.url));

/**
 * Sequences that would end an inline <script> block early.
 *
 * `</script` is the obvious one. `<!--` is the subtle one: inside a classic
 * script it puts the HTML parser into an escaped state where the NEXT
 * `</script>` no longer closes the block, so the rest of the page is swallowed
 * as code. Neither appears in today's bundle, which is a fact about today's
 * build and not a promise about the next one.
 */
const UNSAFE_IN_SCRIPT = [/<\/script/i, /<!--/];

/** First six hex of a SHA-256 over the file's bytes. */
export function hashOf(bytes) {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 6);
}

/**
 * Refuse a bundle that cannot survive being inlined.
 *
 * Separate from `attach` so a test can hand it a hostile string. A guard that
 * is only reachable through a real build is a guard nobody can prove fires.
 */
export function assertBundleSafe(bundle) {
  for (const pattern of UNSAFE_IN_SCRIPT) {
    if (pattern.test(bundle)) {
      throw new CliError(
        `The built overlay contains ${pattern.source.replace(/\\/g, '')}, which would end the inline script early and corrupt every attached file.`,
        EXIT_REFUSED,
        'This is a build problem, not a problem with your prototype. Report it.'
      );
    }
  }
  return bundle;
}

/** The built overlay, or a message telling the author to build it. */
export function readBundle(bundlePath = BUNDLE_PATH) {
  try {
    return readFileSync(bundlePath, 'utf8');
  } catch {
    throw new CliError('The overlay has not been built yet.', EXIT_REFUSED, 'Run: npm run build');
  }
}

/**
 * The version id for this attach.
 *
 * Idempotent by content: re-attaching an unchanged file reproduces the id it
 * already had, so nothing downstream sees a new version that is not one. A
 * single changed character produces an unrelated hash, and only then does the
 * round counter move.
 */
export function nextVersionId(previousId, hash) {
  const previous = /^v(\d+)-([0-9a-f]{6})$/.exec(previousId || '');
  if (previous && previous[2] === hash) return previousId;
  const round = previous ? Number(previous[1]) + 1 : 1;
  return `v${round}-${hash}`;
}

/** `prototype.html` -> `prototype.gitmargin.html`, and idempotent on re-attach. */
export function outputNameFor(sourceBase) {
  const ext = path.extname(sourceBase);
  const stem = sourceBase.slice(0, -ext.length || undefined).replace(/\.gitmargin$/i, '');
  return `${stem}.gitmargin${ext}`;
}

/** Attribute-safe: a prototype named `it"s.html` must not break the meta tag. */
const attr = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/**
 * Remove what a previous attach or review round left behind.
 *
 * These deliberately do NOT assert that they matched: a clean prototype has
 * nothing to strip, which is the normal case. Only the insertions assert.
 */
export function stripPrevious(html) {
  // The comment block goes through the validator; the other two are matched
  // directly because neither `id="gitmargin-overlay"` nor a gitmargin.js src
  // appears anywhere inside the bundle, so neither has a lookalike to confuse.
  return stripEnvelopes(
    html
      .replace(/[ \t]*<meta\s+name=["']gitmargin-(?:version|file)["'][^>]*>[ \t]*\r?\n?/gi, '')
      .replace(/[ \t]*<script\b[^>]*\bid=["']gitmargin-overlay["'][^>]*>[\s\S]*?<\/script>[ \t]*\r?\n?/gi, '')
      .replace(/[ \t]*<script\b[^>]*\bsrc=["'][^"']*gitmargin\.js["'][^>]*>[\s\S]*?<\/script>[ \t]*\r?\n?/gi, '')
  );
}

/** Insert before the LAST match, the way the overlay's own exporter does. */
function insertBeforeLast(source, pattern, insert, what) {
  let at = -1;
  for (let m = pattern.exec(source); m; m = pattern.exec(source)) at = m.index;
  if (at < 0) throw new CliError(`Could not ${what}.`, EXIT_REFUSED);
  return source.slice(0, at) + insert + source.slice(at);
}

/**
 * Put the stamp and the overlay into one document.
 *
 * Exported separately from the file handling so the tests can drive it on
 * strings without touching the disk.
 */
export function attachToHtml(html, { bundle, versionId, originalName }) {
  const stripped = stripPrevious(html);

  const stamp =
    `<meta name="gitmargin-version" content="${attr(versionId)}">\n` +
    `<meta name="gitmargin-file" content="${attr(originalName)}">\n`;

  // Before </head> rather than after <head>, so a charset declaration keeps its
  // place in the first bytes of the document.
  let out;
  if (/<\/head\s*>/i.test(stripped)) {
    out = replaceOnce(stripped, /<\/head\s*>/i, `${stamp}</head>`, 'write the stamp into <head>');
  } else if (/<head\b[^>]*>/i.test(stripped)) {
    out = replaceOnce(stripped, /<head\b[^>]*>/i, (m) => `${m}\n${stamp}`, 'write the stamp into <head>');
  } else {
    throw new CliError(
      'That file has no <head>, so there is nowhere to record the version id.',
      EXIT_REFUSED,
      'Add a <head> section to the prototype and attach again.'
    );
  }

  // Last element in <body>. src/overlay/snapshot.js captures the page as
  // delivered at the moment its script runs, so anything after it would be
  // missing from what the reviewer sends back.
  const overlay = `<script id="gitmargin-overlay">\n${bundle}\n</script>\n`;
  return insertBeforeLast(out, /<\/body\s*>/gi, overlay, 'find </body> to place the overlay before');
}

export function attach(args) {
  const files = args.filter((a) => !a.startsWith('-'));
  if (files.length !== 1) {
    throw new CliError(
      files.length === 0 ? 'attach needs one HTML file.' : 'attach takes exactly one file.',
      EXIT_USAGE,
      'Try: gitmargin attach prototype.html'
    );
  }

  const source = files[0];
  if (!/\.x?html?$/i.test(source)) {
    throw new CliError(`Not an HTML file: ${source}`, EXIT_USAGE);
  }

  const bundle = assertBundleSafe(readBundle());

  let bytes;
  try {
    bytes = readFileSync(source);
  } catch {
    throw new CliError(`Cannot read ${source}`, EXIT_USAGE);
  }

  const html = bytes.toString('utf8');
  const outPath = path.join(path.dirname(source), outputNameFor(path.basename(source)));

  // `outputNameFor` is idempotent, so an already-attached copy names itself as
  // its own output. Writing there would modify the file we were handed, and
  // "the original is never opened for writing" has to hold without exception -
  // it is the reason this command is safe to run on anything.
  if (path.resolve(outPath) === path.resolve(source)) {
    throw new CliError(
      `${path.basename(source)} is already an attached copy.`,
      EXIT_REFUSED,
      'Attach the original prototype instead; that rewrites this copy from it.'
    );
  }

  // The previous copy is the only record of which round this is. Absent on a
  // first attach, which is what starts the counter at v1.
  let previousId = null;
  try {
    const previous = readFileSync(outPath, 'utf8');
    previousId = (/<meta\s+name=["']gitmargin-version["']\s+content=["']([^"']+)["']/i.exec(previous) || [])[1] || null;
  } catch {
    // No previous copy. Nothing to read, nothing to report.
  }

  const versionId = nextVersionId(previousId, hashOf(bytes));
  // The overlay builds the reviewer's download name from this, as
  // `<stem>.reviewed.html`, so it is the name the author will recognise coming
  // back rather than the copy's.
  const originalName = path.basename(source);
  const out = attachToHtml(html, { bundle, versionId, originalName });

  writeFileSync(outPath, out, 'utf8');

  process.stdout.write(`${outPath}\n`);
  process.stderr.write(
    `Attached the overlay to ${originalName} as version ${versionId}.\n` +
      `Send ${path.basename(outPath)} to your reviewer. ${path.basename(source)} is untouched.\n`
  );
  return EXIT_OK;
}
