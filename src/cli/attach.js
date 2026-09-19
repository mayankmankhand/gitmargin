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
import { readFileSync, statSync, writeFileSync } from 'node:fs';
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

/**
 * Do these two paths name the same file?
 *
 * Compared by identity, not by text. `outputNameFor` always writes the marker
 * segment lowercase, so `p.GitMargin.html` produces the output name
 * `p.gitmargin.html`: two different strings, one file on a case-insensitive
 * volume. On this machine that is not hypothetical - /mnt/c is Windows-backed -
 * and the miss meant `attach` overwrote its own input while printing "is
 * untouched", destroying a returned reviewer's comments (review R2). Device and
 * inode also settle the symlink and hardlink versions of the same question.
 */
export function isSameFile(a, b) {
  let left;
  try {
    left = statSync(a);
  } catch {
    return false; // No output file yet, which is the normal first attach.
  }
  try {
    const right = statSync(b);
    return left.dev === right.dev && left.ino === right.ino;
  } catch {
    return false;
  }
}

/** Attribute-safe: a prototype named `it"s.html` must not break the meta tag. */
const attr = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

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
      // `service` and `key` are the two sharing tags `attach --service` writes
      // (src/cli/live.js). Stripped here so a re-attach replaces them, and so a
      // plain attach of a once-shared prototype really is unshared.
      .replace(/[ \t]*<meta\s+name=["']gitmargin-(?:version|file|service|key)["'][^>]*>[ \t]*\r?\n?/gi, '')
      .replace(/[ \t]*<script\b[^>]*\bid=["']gitmargin-overlay["'][^>]*>[\s\S]*?<\/script>[ \t]*\r?\n?/gi, '')
      // The unsupported-browser notice, so re-attaching replaces it rather than
      // stacking a second copy. Neither id appears inside the bundle, so like
      // the overlay above these have no lookalike to confuse them.
      .replace(/[ \t]*<script\b[^>]*\bid=["']gitmargin-fallback["'][^>]*>[\s\S]*?<\/script>[ \t]*\r?\n?/gi, '')
      .replace(/[ \t]*<noscript\b[^>]*\bid=["']gitmargin-nojs["'][^>]*>[\s\S]*?<\/noscript>[ \t]*\r?\n?/gi, '')
      .replace(/[ \t]*<script\b[^>]*\bsrc=["'][^"']*gitmargin\.js["'][^>]*>[\s\S]*?<\/script>[ \t]*\r?\n?/gi, '')
  );
}

/**
 * Insert before the LAST match, the way the overlay's own exporter does.
 *
 * Scans a private copy of the pattern. Driving `exec` in a loop leaves a
 * regex's `lastIndex` wherever the scan stopped, so sharing one would make the
 * next call start from the middle of the document (review R14). Safe today only
 * because the one call site passes a fresh literal; this makes it safe always.
 */
function insertBeforeLast(source, pattern, insert, what) {
  const scan = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  let at = -1;
  for (let m = scan.exec(source); m; m = scan.exec(source)) at = m.index;
  if (at < 0) throw new CliError(`Could not ${what}.`, EXIT_REFUSED);
  return source.slice(0, at) + insert + source.slice(at);
}

/**
 * Told plainly when the overlay could not start.
 *
 * Every way the overlay can fail on an old browser is mute. The bundle is built
 * at esbuild's default target, so an engine that cannot parse modern syntax
 * throws a SyntaxError before executing a byte; an engine that parses it but
 * lacks Shadow DOM dies at `attachShadow`. Either way a reviewer gets a page
 * that looks completely normal, has no comment interface and no error, and
 * sends nothing back - and the author cannot tell that from a reviewer who
 * simply had no comments.
 *
 * Deliberately ES5, with no arrow functions, no `let`, no template literals and
 * no optional catch binding, because it has to run in exactly the browsers the
 * bundle cannot. It only reads `window.__gitmargin`, the handle the overlay
 * publishes on a successful start, so it needs no knowledge of why the failure
 * happened. It is placed BEFORE the overlay so the snapshot in
 * src/overlay/snapshot.js includes it and a returned file still carries it.
 */
const FALLBACK_NOTICE =
  '<noscript id="gitmargin-nojs"><div style="position:fixed;top:0;left:0;right:0;z-index:2147483647;' +
  'background:#1b1b3a;color:#fff;font:13px system-ui,sans-serif;padding:10px 14px">' +
  'gitmargin needs JavaScript to leave comments on this page.</div></noscript>\n' +
  '<script id="gitmargin-fallback">\n' +
  '(function () {\n' +
  '  /* If the overlay started, it published window.__gitmargin and there is\n' +
  '     nothing to say. Checked on load, which is after the DOMContentLoaded\n' +
  '     the overlay starts on. */\n' +
  '  function check() {\n' +
  '    if (window.__gitmargin || !document.body) { return; }\n' +
  '    var bar = document.createElement("div");\n' +
  '    bar.id = "gitmargin-unsupported";\n' +
  '    bar.setAttribute("style", "position:fixed;top:0;left:0;right:0;z-index:2147483647;' +
  'background:#1b1b3a;color:#fff;font:13px system-ui,sans-serif;padding:10px 14px");\n' +
  '    bar.appendChild(document.createTextNode(\n' +
  '      "This browser is too old to leave comments on this prototype. ' +
  'Reopen this file in an up-to-date Chrome, Edge, Firefox or Safari, ' +
  'or reply to whoever sent it to you."));\n' +
  '    document.body.appendChild(bar);\n' +
  '  }\n' +
  '  if (window.addEventListener) { window.addEventListener("load", check, false); }\n' +
  '  else if (window.attachEvent) { window.attachEvent("onload", check); }\n' +
  '})();\n' +
  '</script>\n';

/**
 * Put the stamp and the overlay into one document.
 *
 * Exported separately from the file handling so the tests can drive it on
 * strings without touching the disk.
 */
export function attachToHtml(html, { bundle, versionId, originalName, service = null }) {
  const stripped = stripPrevious(html);

  // The two sharing tags are what switches the overlay's sync on. Without
  // `service` they are not written and the output is byte for byte what it was
  // before sharing existed: the page, not the code, decides (issue #15).
  const stamp =
    `<meta name="gitmargin-version" content="${attr(versionId)}">\n` +
    `<meta name="gitmargin-file" content="${attr(originalName)}">\n` +
    (service
      ? `<meta name="gitmargin-service" content="${attr(service.address)}">\n` +
        `<meta name="gitmargin-key" content="${attr(service.key)}">\n`
      : '');

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
  // The notice goes in first so it ends up ABOVE the overlay: the snapshot is
  // taken when the overlay's script runs, so anything after it would be missing
  // from the file the reviewer sends back.
  const withNotice = insertBeforeLast(
    out,
    /<\/body\s*>/gi,
    FALLBACK_NOTICE,
    'find </body> to place the unsupported-browser notice before'
  );
  const overlay = `<script id="gitmargin-overlay">\n${bundle}\n</script>\n`;
  return insertBeforeLast(withNotice, /<\/body\s*>/gi, overlay, 'find </body> to place the overlay before');
}

/** What an attached copy says about itself, read from its meta tags. */
export function readStamp(html) {
  const tag = (name) =>
    // The value runs to the quote that OPENED it. Stopping at either kind of
    // quote read mayank's.html back as mayank (review R21).
    (new RegExp(`<meta\\s+name=["']gitmargin-${name}["']\\s+content=(?:"([^"]*)"|'([^']*)')`, 'i').exec(html) || []).slice(1).find((v) => v) || null;
  const unescape = (v) =>
    v === null ? null : v.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
  return {
    versionId: unescape(tag('version')),
    file: unescape(tag('file')),
    service: unescape(tag('service')),
    key: unescape(tag('key')),
  };
}

/**
 * Everything `attach` checks and reads before it decides a version id.
 *
 * Shared with `attach --service` (src/cli/live.js) so the two cannot disagree
 * about what is safe: the bundle guard, the HTML check, and above all the rule
 * that the original is never the file written to.
 */
export function prepareAttach(source) {
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
  if (isSameFile(outPath, source)) {
    throw new CliError(
      `${path.basename(source)} is already an attached copy.`,
      EXIT_REFUSED,
      'Attach the original prototype instead; that rewrites this copy from it.'
    );
  }

  // The previous copy is the only record of which round this is. Absent on a
  // first attach, which is what starts the counter at v1.
  let previous = { versionId: null, file: null, service: null, key: null };
  try {
    previous = readStamp(readFileSync(outPath, 'utf8'));
  } catch {
    // No previous copy. Nothing to read, nothing to report.
  }

  // The overlay builds the reviewer's download name from `originalName`, as
  // `<stem>.reviewed.html`, so it is the name the author will recognise coming
  // back rather than the copy's.
  return { bundle, bytes, html, outPath, previous, originalName: path.basename(source) };
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
  const { bundle, bytes, html, outPath, previous, originalName } = prepareAttach(source);
  const versionId = nextVersionId(previous.versionId, hashOf(bytes));
  const out = attachToHtml(html, { bundle, versionId, originalName });

  writeFileSync(outPath, out, 'utf8');

  process.stdout.write(`${outPath}\n`);
  process.stderr.write(
    `Attached the overlay to ${originalName} as version ${versionId}.\n` +
      `Send ${path.basename(outPath)} to your reviewer. ${path.basename(source)} is untouched.\n`
  );
  // A plain attach never touches the network, so it cannot keep a prototype
  // shared. Say so, or the author sends a copy nobody else's comments reach.
  if (previous.service) {
    process.stderr.write(
      `Note: the previous copy shared its comments through ${previous.service}. This one does not.\n` +
        `To keep sharing: gitmargin attach ${path.basename(source)} --service\n`
    );
  }
  return EXIT_OK;
}
