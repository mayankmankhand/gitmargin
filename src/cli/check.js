// `gitmargin check <prototype.html> [--channel file|service-link|github-pages] [--json]`
//
// Says, before anything is sent or published, what in a prototype will not
// survive the place it is going. Every rule comes from a measurement made while
// planning issue #16 (plans/PLAN-issue-16.md, decisions D5 and D6): a page that
// passed `attach` without a word and then broke in a reviewer's browser.
//
// Offline by design. This file imports nothing that can reach the network, and
// in particular not live.js: a check is safe to run on anything, anywhere, with
// no secret in the environment (tests/check.test.js asserts the import graph).
//
// Static checks on the text, with no HTML parser. That is a choice, not a
// shortcut: gitmargin has no runtime dependencies (docs/v0-split.md section 2),
// and every rule here is a pattern an author can read in their own file. A
// pattern can miss a case a parser would catch, so a clean result means "none of
// the known breakages", not "guaranteed to work".
//
// Findings are the answer, so they go to stdout, and the command exits 0
// whenever it ran, findings or not. A non-zero exit means it was called wrong.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CliError, EXIT_OK, EXIT_USAGE } from './errors.js';
// attach.js reads files and nothing else. Borrowed so a check of an attached
// copy sees the prototype inside it, not the overlay's own code (which uses
// storage and names data-gm-screen, and would report itself).
import { stripPrevious } from './attach.js';

/** The places a page can go this cycle (plan D8). */
export const CHANNELS = ['file', 'service-link', 'github-pages'];

/**
 * The service stores a page only up to 4,194,304 bytes (service/API.md), and
 * attach adds about 96 KB of overlay, so anything over this is too close.
 */
export const MAX_PAGE_BYTES = 4_000_000;

/**
 * One entry per rule: how bad it is, where it bites, why, and the one-line fix
 * from the build rules (plan D5). The order here is the order findings print in.
 */
export const RULES = {
  'no-head': {
    level: 'breaks',
    channels: CHANNELS,
    why: 'attach refuses a page with no <head>: there is nowhere to record the version.',
    fix: 'Add a <head> section to the page.',
  },
  'no-body-close': {
    level: 'breaks',
    channels: CHANNELS,
    why: 'attach refuses a page with no </body>: there is nowhere to put the comment tools.',
    fix: 'End the page body with </body>.',
  },
  'csp-meta': {
    level: 'breaks',
    channels: CHANNELS,
    why: 'A Content-Security-Policy tag stops the inlined comment tools from starting, and the page says nothing.',
    fix: 'Remove the Content-Security-Policy meta tag.',
  },
  'relative-asset': {
    level: 'breaks',
    channels: CHANNELS,
    why: 'Only this one HTML file is sent or published, so the file it points at will be missing.',
    fix: 'Inline it into the page: scripts and styles in <script> and <style> blocks, images as data: URLs or inline SVG.',
  },
  'relative-link': {
    level: 'breaks',
    channels: CHANNELS,
    why: 'Only this one HTML file is sent or published, so the page it links to will be missing.',
    fix: 'Keep every screen in this one file and switch between them with script.',
  },
  'path-routing': {
    level: 'breaks',
    channels: CHANNELS,
    why: 'Changing the address path throws when the page is opened from disk, and comments made after it changes are lost on reload.',
    fix: 'Route with location.hash (#step-2), not history.pushState or replaceState.',
  },
  storage: {
    level: 'breaks',
    // Only the stored copy on the service is sandboxed. From disk and on GitHub
    // Pages storage works, so saying it there would be noise.
    channels: ['service-link'],
    why: "The copy stored on the service is sandboxed, so a storage call outside try/catch throws and stops the prototype's script.",
    fix: 'Wrap every storage call in try/catch.',
  },
  size: {
    level: 'breaks',
    channels: ['service-link'],
    why: 'The service stores a page only up to 4,194,304 bytes, and attach adds about 96 KB.',
    fix: 'Shrink the page: inline fewer or smaller images.',
  },
  'modal-dialog': {
    // A note, not a break. The page works on every host; what fails is
    // commenting while such a dialog is open, because it sits above the overlay
    // (docs/v0-split.md section 5). That only matters when the dialog is a step,
    // which a text check cannot tell, and a confirmation pop-up like the ones in
    // fixtures/onboarding.html is fine.
    level: 'note',
    channels: CHANNELS,
    why: 'While a dialog opened with showModal() is open it sits above the comment tools, so a reviewer cannot comment on it.',
    fix: 'If it is a step, show it as a normal section, or open the dialog with show().',
  },
  'no-screen-names': {
    level: 'note',
    channels: CHANNELS,
    why: 'Comments will be named by the nearest heading, not by the step they were made on.',
    fix: 'Give each step\'s wrapper data-gm-screen="<name>".',
  },
};

const RULE_ORDER = Object.keys(RULES);

/** A snippet short enough for one line of output. */
function short(text, max = 90) {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 3)}...` : flat;
}

/**
 * The code around a match, from its own line only. A minified script is one
 * line of a hundred kilobytes, so the window is centred on the match.
 */
function around(code, index) {
  const start = code.lastIndexOf('\n', index) + 1;
  const newline = code.indexOf('\n', index);
  const end = newline < 0 ? code.length : newline;
  let from = Math.max(start, index - 30);
  // Start on a whole word rather than in the middle of one, backing up a
  // little way at most: minified code may have no space for a long stretch.
  for (let steps = 0; from > start && steps < 20 && /\S/.test(code[from - 1]); steps += 1) from -= 1;
  return short(code.slice(from, Math.min(end, index + 60)));
}

/** One attribute's value from a tag's attribute text, or null. */
function attrOf(attrs, name) {
  // `(?:^|\s)` so `data-src` is not read as `src`; `\s*=` so `srcset` is not.
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}

/**
 * Split a page into its markup and its inline scripts.
 *
 * One left-to-right pass over comments and script blocks, so whichever starts
 * first wins, the way a browser reads them: a `<!--` inside a script is code,
 * and a script inside a comment is not a script. The markup keeps each script's
 * opening tag (for `<script src>`) and loses its body.
 */
function splitPage(html) {
  const scripts = [];
  let markup = '';
  let last = 0;
  for (const m of html.matchAll(/<!--[\s\S]*?(?:-->|$)|<script\b([^>]*)>([\s\S]*?)(?:<\/script\s*>|$)/gi)) {
    markup += html.slice(last, m.index);
    if (!m[0].startsWith('<!--')) {
      scripts.push({ attrs: m[1], body: m[2] });
      markup += `<script${m[1]}></script>`;
    }
    last = m.index + m[0].length;
  }
  markup += html.slice(last);
  return { markup, scripts };
}

/** Script types a browser (or Babel in the browser) runs as code. JSON and templates are data. */
const CODE_TYPE = /^(?:module|text\/(?:javascript|ecmascript|babel|jsx)|application\/(?:javascript|ecmascript|x-javascript))$/i;
/** JSX: markup written inside a script, so its tags can point at assets too. */
const JSX_TYPE = /^text\/(?:babel|jsx)$/i;

/**
 * Does this address point at a file next to the page?
 *
 * Anything with a scheme (http:, https:, data:, blob:, mailto:, tel:,
 * javascript:) or starting with //, # or ? does not. A root path like
 * /assets/app.js does: only the one file travels, so it is missing too.
 */
export function isRelative(url) {
  const u = String(url).trim();
  if (!u) return false;
  if (/^(?:#|\/\/|\?)/.test(u)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return false;
  // A template placeholder, filled in by script: not an address yet.
  if (/\{\{|\$\{/.test(u)) return false;
  // A JSX expression (<img src={item.image} />, read from a text/babel script):
  // a script value, not a file next to the page. Flagging it sent the share
  // skill looking for a file that does not exist (review of #16, R3).
  if (u.startsWith('{')) return false;
  return true;
}

/** The addresses in a srcset: each candidate is a run of non-space, then descriptors up to a comma. */
function srcsetUrls(value) {
  const urls = [];
  let rest = value;
  for (;;) {
    rest = rest.replace(/^[\s,]+/, '');
    const m = /^\S+/.exec(rest);
    if (!m) break;
    let url = m[0];
    rest = rest.slice(url.length);
    // A data: URL holds commas of its own, so a comma ends a candidate only
    // at the end of the address or after its descriptors.
    if (/,+$/.test(url)) url = url.replace(/,+$/, '');
    else {
      const comma = rest.indexOf(',');
      rest = comma < 0 ? '' : rest.slice(comma + 1);
    }
    if (url) urls.push(url);
  }
  return urls;
}

/** Which attributes of which tags load a file. `<link>` only for rels that fetch one. */
function assetsOf(tag, attrs) {
  const found = [];
  const take = (name) => {
    const value = attrOf(attrs, name);
    if (value !== null) found.push({ name, url: value });
  };
  switch (tag) {
    case 'img':
    case 'source':
      take('src');
      for (const url of srcsetUrls(attrOf(attrs, 'srcset') || '')) found.push({ name: 'srcset', url });
      break;
    case 'video':
      take('src');
      take('poster');
      break;
    case 'script':
    case 'audio':
    case 'track':
    case 'iframe':
    case 'embed':
      take('src');
      break;
    case 'link':
      if (/\b(?:stylesheet|icon|preload|modulepreload)\b/i.test(attrOf(attrs, 'rel') || '')) take('href');
      break;
    default:
      break;
  }
  return found;
}

/**
 * Is `index` inside an open `try { ... }` block?
 *
 * Braces are counted on the raw text, with no attempt at strings or comments:
 * a heuristic that is right for the shapes prototypes use (a storage call in a
 * try block, or not), and cheap enough for a minified page.
 */
function guardedPositions(code, indexes) {
  const guarded = new Set();
  const wanted = [...indexes].sort((a, b) => a - b);
  const stack = [];
  let next = 0;
  for (let i = 0; i <= code.length && next < wanted.length; i += 1) {
    while (next < wanted.length && wanted[next] === i) {
      if (stack.includes(true)) guarded.add(wanted[next]);
      next += 1;
    }
    const ch = code[i];
    if (ch === '{') stack.push(/\btry\s*$/.test(code.slice(Math.max(0, i - 16), i)));
    else if (ch === '}') stack.pop();
  }
  return guarded;
}

/** The top-level arguments of a call whose `(` is at `open`, as raw text. */
function callArguments(code, open) {
  const args = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (let i = open + 1; i < code.length; i += 1) {
    const ch = code[i];
    if (quote) {
      current += ch;
      if (ch === '\\') {
        current += code[i + 1] ?? '';
        i += 1;
      } else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      current += ch;
    } else if (ch === '(' || ch === '[' || ch === '{') {
      depth += 1;
      current += ch;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) break;
      depth -= 1;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
    } else current += ch;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

/**
 * Does this pushState or replaceState call change the path?
 *
 * Only the third argument moves the address. Without one the call only stores
 * state, and a string that starts with # changes just the hash, which is the
 * routing the build rules ask for.
 */
function changesPath(code, open) {
  const args = callArguments(code, open);
  if (args.length < 3) return false;
  return !/^["'`]#/.test(args[2]);
}

/**
 * Every finding for one page, most serious first.
 *
 * Pure, so the tests can hand it a string. `channel` keeps only the findings
 * that affect that host; `name` is what a whole-file finding quotes.
 *
 * @param {string} html
 * @param {{channel?: string|null, name?: string}} [options]
 * @returns {{rule: string, level: string, channels: string[], detail: string, why: string, fix: string}[]}
 */
export function checkHtml(html, { channel = null, name = 'the page' } = {}) {
  if (channel !== null && !CHANNELS.includes(channel)) throw new Error(`Not a channel: ${channel}`);
  const page = stripPrevious(String(html));
  const found = [];
  const add = (rule, detail) => {
    const { level, channels, why, fix } = RULES[rule];
    found.push({ rule, level, channels: [...channels], detail: short(detail), why, fix });
  };

  // The same two tests attach makes, on the same stripped text, so check and
  // attach cannot disagree about what attach will refuse.
  if (!/<\/head\s*>/i.test(page) && !/<head\b[^>]*>/i.test(page)) add('no-head', name);
  if (!/<\/body\s*>/i.test(page)) add('no-body-close', name);

  const { markup, scripts } = splitPage(page);

  for (const m of markup.matchAll(/<meta\b[^>]*>/gi)) {
    if (/^content-security-policy$/i.test((attrOf(m[0].slice(5), 'http-equiv') || '').trim())) add('csp-meta', m[0]);
  }

  // Tags that load a file, from the markup and from any JSX. One finding per
  // address, however many times it is used: each needs one fix.
  const typeOf = (s) => (attrOf(s.attrs, 'type') || '').trim();
  const tagText = [markup, ...scripts.filter((s) => JSX_TYPE.test(typeOf(s))).map((s) => s.body)].join('\n');
  const seenAssets = new Set();
  const seenLinks = new Set();
  for (const m of tagText.matchAll(/<(img|source|script|link|video|audio|track|iframe|embed|a|area)\b([^>]*)>/gi)) {
    const tag = m[1].toLowerCase();
    if (tag === 'a' || tag === 'area') {
      const href = attrOf(m[2], 'href');
      if (href !== null && isRelative(href) && !seenLinks.has(href)) {
        seenLinks.add(href);
        add('relative-link', `<${tag} href="${href}">`);
      }
      continue;
    }
    for (const { name: attr, url } of assetsOf(tag, m[2])) {
      if (!isRelative(url) || seenAssets.has(url)) continue;
      seenAssets.add(url);
      add('relative-asset', `<${tag} ${attr}="${url}">`);
    }
  }
  // CSS, in <style> blocks and style attributes alike.
  for (const m of markup.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)) {
    const url = m[1] ?? m[2] ?? m[3];
    if (!isRelative(url) || seenAssets.has(url)) continue;
    seenAssets.add(url);
    add('relative-asset', `url(${url})`);
  }

  // The page's own code: inline scripts that run, and inline event handlers.
  const code = scripts.filter((s) => !typeOf(s) || CODE_TYPE.test(typeOf(s))).map((s) => s.body);
  for (const m of markup.matchAll(/\son[a-z]+\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) code.push(m[1] ?? m[2]);

  const firstOf = (rule, hits) => {
    if (hits.length) add(rule, hits.length > 1 ? `${hits[0]} (and ${hits.length - 1} more)` : hits[0]);
  };
  const routing = [];
  const storage = [];
  const modal = [];
  for (const body of code) {
    for (const m of body.matchAll(/\b(?:pushState|replaceState)\s*\(/g)) {
      if (changesPath(body, m.index + m[0].length - 1)) routing.push(around(body, m.index));
    }
    const uses = [...body.matchAll(/\b(?:localStorage|sessionStorage|indexedDB)\b|\bdocument\s*\.\s*cookie\b/g)];
    const guarded = guardedPositions(body, uses.map((m) => m.index));
    for (const m of uses) if (!guarded.has(m.index)) storage.push(around(body, m.index));
    for (const m of body.matchAll(/\.showModal\s*\(/g)) modal.push(around(body, m.index));
  }
  firstOf('path-routing', routing);
  firstOf('storage', storage);
  firstOf('modal-dialog', modal);

  const bytes = Buffer.byteLength(page, 'utf8');
  if (bytes > MAX_PAGE_BYTES) {
    add('size', `${name} is ${(bytes / 1_000_000).toFixed(1)} MB (${bytes.toLocaleString('en-US')} bytes)`);
  }

  // Searched in the whole page, scripts included: a React page writes the
  // attribute in JSX, and a script can set it through dataset.
  if (!/\bdata-gm-screen\b|\bdataset\.gmScreen\b/.test(page)) add('no-screen-names', name);

  const rank = (f) => (f.level === 'breaks' ? 0 : 1) * RULE_ORDER.length + RULE_ORDER.indexOf(f.rule);
  return found
    .map((f, at) => ({ f, at }))
    .sort((a, b) => rank(a.f) - rank(b.f) || a.at - b.at)
    .map(({ f }) => f)
    .filter((f) => channel === null || f.channels.includes(channel));
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** The text a person reads: one line per finding, then the count. */
export function formatFindings(findings, channel = null) {
  const lines = findings.map((f) => `${f.level} ${f.rule} (${f.channels.join(', ')}): ${f.detail} - ${f.why} Fix: ${f.fix}`);
  const breaks = findings.filter((f) => f.level === 'breaks').length;
  lines.push(
    `${plural(findings.length, 'finding', 'findings')} (${breaks} ${breaks === 1 ? 'breaks' : 'break'} the page on ${channel || 'at least one host'})`
  );
  return `${lines.join('\n')}\n`;
}

export function check(args) {
  const files = [];
  let channel = null;
  let json = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--json') json = true;
    else if (arg === '--channel') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('-')) {
        throw new CliError('--channel needs a value.', EXIT_USAGE, `One of: ${CHANNELS.join(', ')}`);
      }
      if (!CHANNELS.includes(value)) throw new CliError(`Not a channel: ${value}`, EXIT_USAGE, `One of: ${CHANNELS.join(', ')}`);
      channel = value;
      i += 1;
    } else if (arg.startsWith('-')) {
      throw new CliError(`Unknown option: ${arg}`, EXIT_USAGE, 'Try: gitmargin help');
    } else files.push(arg);
  }
  if (files.length !== 1) {
    throw new CliError(
      files.length === 0 ? 'check needs one HTML file.' : 'check takes exactly one file.',
      EXIT_USAGE,
      'Try: gitmargin check prototype.html'
    );
  }

  const file = files[0];
  // The same test attach makes, so check accepts exactly what attach would.
  if (!/\.x?html?$/i.test(file)) throw new CliError(`Not an HTML file: ${file}`, EXIT_USAGE);
  let html;
  try {
    html = readFileSync(file, 'utf8');
  } catch {
    throw new CliError(`Cannot read ${file}`, EXIT_USAGE);
  }

  const findings = checkHtml(html, { channel, name: path.basename(file) });
  process.stdout.write(json ? `${JSON.stringify({ file, channel, findings }, null, 2)}\n` : formatFindings(findings, channel));
  return EXIT_OK;
}
