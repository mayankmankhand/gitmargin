// `gitmargin check`: what will not survive the host, found offline (issue #16,
// plan D6). Run by `node --test`; nothing here needs a browser or a network.
//
// Every rule is tested twice: it fires on a small page with its trigger, and it
// stays silent on the same page without it. A rule that is only ever seen
// firing could be firing on everything.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHANNELS, MAX_PAGE_BYTES, RULES, checkHtml, formatFindings, isRelative } from '../src/cli/check.js';
import { attachToHtml } from '../src/cli/attach.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI = path.join(ROOT, 'bin', 'gitmargin.js');
const ONBOARDING = path.join(ROOT, 'fixtures', 'onboarding.html');

/** A clean page, with room for a trigger in the head or the body. */
const page = ({ head = '', body = '' } = {}) =>
  `<!doctype html>\n<html><head><meta charset="utf-8"><title>t</title>${head}</head>\n` +
  `<body><section id="step-1" data-gm-screen="Start"><h1>Hi</h1>${body}</section>\n</body></html>\n`;

const rules = (html, options) => checkHtml(html, options).map((f) => f.rule);
const only = (html, rule, options) => checkHtml(html, options).filter((f) => f.rule === rule);

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...options });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

function scratch(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gitmargin-check-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// ------------------------------------------------------------------ the rules

test('a clean page has no findings', () => {
  assert.deepEqual(checkHtml(page()), []);
});

test('no-head and no-body-close: the two things attach refuses, tested the way attach tests them', () => {
  const noHead = '<!doctype html>\n<html><body data-gm-screen="x"><p>hi</p></body></html>';
  assert.deepEqual(rules(noHead), ['no-head']);
  assert.equal(only(noHead, 'no-head')[0].detail, 'the page');
  assert.equal(only(noHead, 'no-head', { name: 'p.html' })[0].detail, 'p.html', 'a whole-file finding names the file');
  // attach accepts either half of the head, so check does too.
  assert.deepEqual(rules('<html><head><title>t</title><body data-gm-screen="x"></body></html>'), []);
  assert.deepEqual(rules('<html><title>t</title></head><body data-gm-screen="x"></body></html>'), []);
  // <header> is not <head>.
  assert.deepEqual(rules('<html><body data-gm-screen="x"><header>h</header></body></html>'), ['no-head']);

  const noBody = page().replace('</body>', '');
  assert.deepEqual(rules(noBody), ['no-body-close']);
  for (const rule of ['no-head', 'no-body-close']) {
    assert.equal(RULES[rule].level, 'breaks');
    assert.deepEqual(RULES[rule].channels, CHANNELS);
  }
});

test('relative-asset: every kind of tag and CSS that loads a file next to the page', () => {
  const cases = [
    [{ body: '<script src="app.js"></script>' }, '<script src="app.js">'],
    [{ body: '<script type="module" src="./main.js"></script>' }, '<script src="./main.js">'],
    [{ head: '<link rel="stylesheet" href="styles.css">' }, '<link href="styles.css">'],
    [{ head: "<link href='favicon.ico' rel='icon'>" }, '<link href="favicon.ico">'],
    [{ head: '<link rel="apple-touch-icon" href="/touch.png">' }, '<link href="/touch.png">'],
    [{ body: '<img src="img/logo.png" alt="">' }, '<img src="img/logo.png">'],
    [{ body: '<img src=logo.png alt="">' }, '<img src="logo.png">'],
    [{ body: '<img srcset="data:image/png;base64,AAAA 1x, img/big.png 2x" src="data:image/png;base64,AAAA">' }, '<img srcset="img/big.png">'],
    [{ body: '<picture><source srcset="hero.webp" type="image/webp"><img src="data:,x"></picture>' }, '<source srcset="hero.webp">'],
    [{ body: '<video><source src="clip.mp4"></video>' }, '<source src="clip.mp4">'],
    [{ body: '<video src="intro.mp4"></video>' }, '<video src="intro.mp4">'],
    [{ body: '<video poster="still.jpg" src="https://cdn.example/a.mp4"></video>' }, '<video poster="still.jpg">'],
    [{ body: '<audio src="ping.mp3"></audio>' }, '<audio src="ping.mp3">'],
    [{ head: '<style>.hero { background: url("img/bg.jpg") }</style>' }, 'url(img/bg.jpg)'],
    [{ head: "<style>@font-face { src: url('fonts/a.woff2') }</style>" }, 'url(fonts/a.woff2)'],
    [{ body: '<div style="background-image:url(pattern.svg)"></div>' }, 'url(pattern.svg)'],
    // A React page writes its markup in JSX, inside a script.
    [{ body: '<div id="root"></div><script type="text/babel">const Logo = () => <img src="logo.svg" alt="" />;</script>' }, '<img src="logo.svg">'],
  ];
  for (const [parts, detail] of cases) {
    const found = checkHtml(page(parts));
    assert.deepEqual(found.map((f) => f.rule), ['relative-asset'], detail);
    assert.equal(found[0].detail, detail);
    assert.equal(found[0].level, 'breaks');
    assert.deepEqual(found[0].channels, CHANNELS, 'only the one file travels, whatever the host');
  }
});

test('relative-asset stays silent for addresses that travel, and for what is not an asset', () => {
  const silent = [
    '<script src="https://cdn.tailwindcss.com"></script>',
    '<script src="http://example.com/a.js"></script>',
    '<script src="//unpkg.com/react@18"></script>',
    '<img src="data:image/png;base64,iVBORw0KGgo=" alt="">',
    '<img src="blob:https://example.com/1234" alt="">',
    '<img src="#" alt="">',
    '<img src="" alt="">',
    '<img data-src="lazy.png" src="data:,x" alt="">',
    '<img src="{{ image }}" alt="">',
    '<div style="background:url(data:image/svg+xml;utf8,<svg/>)"></div>',
    '<div style="background:url(#grad)"></div>',
    '<link rel="canonical" href="other.html">',
    '<link rel="preconnect" href="https://fonts.gstatic.com">',
    '<!-- <img src="old-logo.png"> -->',
    '<script type="application/json" id="data">{"html": "<img src=\\"x.png\\">"}</script>',
    '<script>const tpl = \'<img src="\' + name + \'">\';</script>',
  ];
  for (const body of silent) assert.deepEqual(rules(page({ body })), [], body);
});

test('relative-asset: one finding per file, however often it is used', () => {
  const found = only(page({ body: '<img src="a.png"><img src="a.png"><div style="background:url(a.png)"></div><img src="b.png">' }), 'relative-asset');
  assert.deepEqual(found.map((f) => f.detail), ['<img src="a.png">', '<img src="b.png">']);
});

test('isRelative: schemes, protocol-relative, hash and query travel; paths do not', () => {
  for (const url of ['https://a.b/c', 'HTTP://a.b', '//a.b/c', 'data:,x', 'blob:x', '#x', '?step=2', 'mailto:a@b.c', 'tel:+1', 'javascript:void(0)', '', '  ', '${src}']) {
    assert.equal(isRelative(url), false, url);
  }
  for (const url of ['a.png', './a.png', '../a.png', '/a.png', 'img/a b.png']) assert.equal(isRelative(url), true, url);
});

test('relative-link: a link to another page breaks, a link within this one does not', () => {
  const found = checkHtml(page({ body: '<a href="details.html">More</a><a href="details.html">Again</a>' }));
  assert.deepEqual(found.map((f) => [f.rule, f.detail]), [['relative-link', '<a href="details.html">']]);
  assert.equal(found[0].level, 'breaks');
  assert.deepEqual(found[0].channels, CHANNELS);
  assert.deepEqual(rules(page({ body: '<map><area href="/next" alt=""></map>' })), ['relative-link']);

  for (const href of ['#step-2', 'https://example.com', '//example.com', 'mailto:a@b.c', 'tel:+15551234', 'javascript:void(0)', '']) {
    assert.deepEqual(rules(page({ body: `<a href="${href}">x</a>` })), [], href);
  }
  assert.deepEqual(rules(page({ body: '<a>no href</a>' })), []);
});

test('storage: breaks the service link only, and only outside try/catch', () => {
  const unguarded = page({ body: "<script>const saved = localStorage.getItem('draft');</script>" });
  const [finding] = only(unguarded, 'storage');
  assert.equal(finding.level, 'breaks');
  assert.deepEqual(finding.channels, ['service-link'], 'from disk and on GitHub Pages storage works');
  assert.match(finding.detail, /localStorage\.getItem\('draft'\)/);

  for (const call of ['sessionStorage.setItem("a", 1)', 'indexedDB.open("db")', 'document.cookie = "a=1"', 'window.localStorage.clear()']) {
    assert.deepEqual(rules(page({ body: `<script>${call};</script>` })), ['storage'], call);
  }
  assert.deepEqual(rules(page({ body: '<button onclick="localStorage.clear()">Reset</button>' })), ['storage'], 'an inline handler is the page\'s own script too');

  // Guarded: the fix the finding asks for makes it go away.
  const guarded = [
    "<script>let saved = null; try { saved = localStorage.getItem('draft'); } catch (e) {}</script>",
    "<script>function load(){try{return JSON.parse(sessionStorage.getItem('k'))}catch{return null}}</script>",
    "<script>try { if (ok) { document.cookie = 'a=1'; } } catch (e) {}</script>",
  ];
  for (const body of guarded) assert.deepEqual(rules(page({ body })), [], body);
  // A catch block is not a guard, and neither is code after the try closed.
  assert.deepEqual(rules(page({ body: "<script>try { x() } catch (e) { localStorage.clear() }</script>" })), ['storage']);
  assert.deepEqual(rules(page({ body: "<script>try { x() } catch (e) {} localStorage.clear();</script>" })), ['storage']);
  // Data, not code.
  assert.deepEqual(rules(page({ body: '<script type="application/json">{"note": "localStorage"}</script>' })), []);
  assert.deepEqual(rules(page({ body: '<p>We never use localStorage.</p>' })), [], 'prose is not script');

  const many = only(page({ body: '<script>localStorage.a = 1; localStorage.b = 2; sessionStorage.c = 3;</script>' }), 'storage');
  assert.equal(many.length, 1, 'one finding for the rule');
  assert.match(many[0].detail, /\(and 2 more\)$/);
});

test('modal-dialog: a note on every host, and show() is fine', () => {
  const [finding] = checkHtml(page({ body: "<dialog id=d>x</dialog><script>document.getElementById('d').showModal();</script>" }));
  assert.equal(finding.rule, 'modal-dialog');
  assert.equal(finding.level, 'note', 'the page works; only commenting inside the open dialog does not');
  assert.deepEqual(finding.channels, CHANNELS);
  assert.match(finding.detail, /showModal\(\)/);
  assert.deepEqual(rules(page({ body: "<dialog id=d>x</dialog><script>document.getElementById('d').show();</script>" })), []);
});

test('csp-meta: a Content-Security-Policy tag, however it is quoted', () => {
  for (const tag of [
    `<meta http-equiv="Content-Security-Policy" content="default-src 'self'">`,
    `<meta content="script-src 'none'" http-equiv='content-security-policy'>`,
    `<meta http-equiv=Content-Security-Policy content="img-src *">`,
  ]) {
    const found = checkHtml(page({ head: tag }));
    assert.deepEqual(found.map((f) => [f.rule, f.level]), [['csp-meta', 'breaks']], tag);
    assert.deepEqual(found[0].channels, CHANNELS);
    assert.match(found[0].detail, /^<meta /);
  }
  assert.deepEqual(rules(page({ head: '<meta name="viewport" content="width=device-width">' })), []);
  assert.deepEqual(rules(page({ head: '<meta http-equiv="X-UA-Compatible" content="IE=edge">' })), []);
});

test('path-routing: a call that changes the path breaks; a hash, or no address at all, does not', () => {
  for (const call of ["history.pushState({}, '', '/step-2')", 'window.history.replaceState(null, "", "step2.html")', 'history.pushState({ step: 2 }, "", url)']) {
    const found = checkHtml(page({ body: `<script>${call};</script>` }));
    assert.deepEqual(found.map((f) => [f.rule, f.level]), [['path-routing', 'breaks']], call);
    assert.deepEqual(found[0].channels, CHANNELS);
  }
  for (const call of [
    "history.pushState({}, '', '#step-2')",
    "history.replaceState({ a: [1, 2] }, '', '#' + id)",
    'history.pushState(null, "", `#step-${n}`)',
    'history.replaceState({ step: 2 }, "")',
    "location.hash = 'step-2'",
  ]) {
    assert.deepEqual(rules(page({ body: `<script>${call};</script>` })), [], call);
  }
});

test('size: over the limit breaks the service link only; at the limit is fine', () => {
  const base = page({ body: '<!--  -->' });
  const padded = (bytes) => base.replace('<!--  -->', `<!-- ${'x'.repeat(bytes - Buffer.byteLength(base))} -->`);
  assert.equal(Buffer.byteLength(padded(MAX_PAGE_BYTES)), MAX_PAGE_BYTES);
  assert.deepEqual(rules(padded(MAX_PAGE_BYTES)), []);

  const [finding] = checkHtml(padded(MAX_PAGE_BYTES + 1), { name: 'big.html' });
  assert.deepEqual([finding.rule, finding.level, finding.channels], ['size', 'breaks', ['service-link']]);
  assert.match(finding.detail, /^big\.html is 4\.0 MB \(4,000,001 bytes\)$/);
});

test('no-screen-names: a note until one step names itself, in markup or in script', () => {
  const unnamed = page().replace(' data-gm-screen="Start"', '');
  const [finding] = checkHtml(unnamed, { name: 'p.html' });
  assert.deepEqual([finding.rule, finding.level, finding.channels, finding.detail], ['no-screen-names', 'note', CHANNELS, 'p.html']);
  assert.deepEqual(rules(unnamed.replace('</body>', '<script>el.dataset.gmScreen = "Pay";</script></body>')), []);
  assert.deepEqual(rules(unnamed.replace('</body>', '<script type="text/babel">const S = () => <div data-gm-screen="Pay" />;</script></body>')), []);
});

test('an attached copy is checked as the prototype inside it, not as the overlay', () => {
  // A stand-in bundle that trips three rules. The copy must not report them.
  const bundle = 'localStorage.getItem("x");history.pushState({},"","/x");d.showModal();';
  const copy = attachToHtml(page(), { bundle, versionId: 'v1-abcdef', originalName: 'p.html', service: { address: 'https://s.example', key: 'gm_k' } });
  assert.ok(copy.includes(bundle));
  assert.deepEqual(checkHtml(copy), []);
});

test('findings come out breaks first, and --channel keeps only what affects that host', () => {
  const html = page({
    head: '<link rel="stylesheet" href="a.css">',
    body: `<script>localStorage.x = 1; d.showModal();</script><!-- ${'x'.repeat(MAX_PAGE_BYTES)} -->`,
  }).replace(' data-gm-screen="Start"', '');
  assert.deepEqual(rules(html), ['relative-asset', 'storage', 'size', 'modal-dialog', 'no-screen-names']);
  assert.deepEqual(rules(html, { channel: 'service-link' }), ['relative-asset', 'storage', 'size', 'modal-dialog', 'no-screen-names']);
  assert.deepEqual(rules(html, { channel: 'file' }), ['relative-asset', 'modal-dialog', 'no-screen-names']);
  assert.deepEqual(rules(html, { channel: 'github-pages' }), ['relative-asset', 'modal-dialog', 'no-screen-names']);
  assert.throws(() => checkHtml(html, { channel: 'ftp' }), /Not a channel/);
});

test('fixtures/onboarding.html, the reference prototype, has nothing that breaks', () => {
  const found = checkHtml(readFileSync(ONBOARDING, 'utf8'));
  assert.deepEqual(found.filter((f) => f.level === 'breaks'), []);
  // Its two pop-up dialogs open with showModal(): a note, and the only one.
  assert.deepEqual(found.map((f) => [f.rule, f.level]), [['modal-dialog', 'note']]);
});

test('every finding says where it bites and how to fix it, on one line', () => {
  for (const [id, rule] of Object.entries(RULES)) {
    assert.ok(['breaks', 'note'].includes(rule.level), id);
    assert.ok(rule.channels.length > 0 && rule.channels.every((c) => CHANNELS.includes(c)), id);
    for (const text of [rule.why, rule.fix]) {
      assert.ok(text.length > 0 && !text.includes('\n'), id);
      assert.doesNotMatch(text, /[\u2013\u2014]/, 'no en or em dashes');
    }
  }
});

test('check stays offline: nothing it imports can reach the network', () => {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\bfetch\s*\(/, `${path.basename(file)} calls fetch`);
    for (const [, spec] of source.matchAll(/^import\s[^'"]*['"]([^'"]+)['"]/gm)) {
      assert.doesNotMatch(spec, /^(?:node:)?(?:http|https|net|tls|dgram|dns|child_process)$/, `${path.basename(file)} imports ${spec}`);
      if (spec.startsWith('.')) visit(path.join(path.dirname(file), spec));
    }
  };
  visit(path.join(ROOT, 'src', 'cli', 'check.js'));
  assert.ok(![...seen].some((f) => f.endsWith('live.js')), 'check must not import live.js');
  assert.ok(seen.size > 1, 'the scan followed the imports');
});

// -------------------------------------------------------------------- the CLI

test('the CLI prints one line per finding and a count, and exits 0 even when something breaks', (t) => {
  const dir = scratch(t);
  const file = path.join(dir, 'p.html');
  writeFileSync(file, page({ head: '<link rel="stylesheet" href="a.css">', body: '<script>localStorage.x = 1;</script>' }));

  const all = run(['check', file]);
  assert.equal(all.code, 0, all.err);
  assert.equal(all.err, '');
  const lines = all.out.trimEnd().split('\n');
  assert.deepEqual(lines.length, 3);
  assert.match(lines[0], /^breaks relative-asset \(file, service-link, github-pages\): <link href="a\.css"> - .+ Fix: Inline it/);
  assert.match(lines[1], /^breaks storage \(service-link\): localStorage\.x = 1; - .+ Fix: Wrap every storage call in try\/catch\.$/);
  assert.equal(lines[2], '2 findings (2 break the page on at least one host)');

  const one = run(['check', file, '--channel', 'github-pages']);
  assert.equal(one.code, 0);
  assert.equal(one.out.trimEnd().split('\n').at(-1), '1 finding (1 breaks the page on github-pages)');

  const clean = path.join(dir, 'clean.htm');
  writeFileSync(clean, page());
  assert.equal(run(['check', clean]).out, '0 findings (0 break the page on at least one host)\n');
});

test('the CLI --json prints the file, the channel and the findings, and nothing else', (t) => {
  const dir = scratch(t);
  const file = path.join(dir, 'p.html');
  writeFileSync(file, page({ body: '<a href="next.html">Next</a>' }));

  const first = run(['check', '--json', file]);
  assert.equal(first.code, 0, first.err);
  assert.equal(first.err, '');
  const parsed = JSON.parse(first.out);
  assert.deepEqual(parsed, {
    file,
    channel: null,
    findings: [
      {
        rule: 'relative-link',
        level: 'breaks',
        channels: ['file', 'service-link', 'github-pages'],
        detail: '<a href="next.html">',
        why: RULES['relative-link'].why,
        fix: RULES['relative-link'].fix,
      },
    ],
  });
  assert.deepEqual(Object.keys(parsed.findings[0]), ['rule', 'level', 'channels', 'detail', 'why', 'fix'], 'stable key order');
  assert.equal(run(['check', '--json', file]).out, first.out, 'the same page gives the same bytes');

  const filtered = JSON.parse(run(['check', file, '--json', '--channel', 'service-link']).out);
  assert.equal(filtered.channel, 'service-link');
  assert.equal(filtered.findings.length, 1);

  const onboarding = JSON.parse(run(['check', ONBOARDING, '--json']).out);
  assert.deepEqual(onboarding.findings.filter((f) => f.level === 'breaks'), []);
});

test('the CLI refuses bad usage with exit 1 and prints nothing on stdout', (t) => {
  const dir = scratch(t);
  const file = path.join(dir, 'p.html');
  writeFileSync(file, page());
  writeFileSync(path.join(dir, 'x.txt'), page());

  const cases = [
    [['check'], /check needs one HTML file/],
    [['check', file, file], /exactly one file/],
    [['check', file, '--bogus'], /Unknown option: --bogus/],
    [['check', file, '--channel', 'ftp'], /Not a channel: ftp/],
    [['check', file, '--channel'], /--channel needs a value/],
    [['check', file, '--channel', '--json'], /--channel needs a value/],
    [['check', path.join(dir, 'x.txt')], /Not an HTML file/],
    [['check', path.join(dir, 'missing.html')], /Cannot read/],
    [['check', dir + '.html'], /Cannot read/],
  ];
  for (const [args, message] of cases) {
    const r = run(args);
    assert.equal(r.code, 1, args.join(' '));
    assert.equal(r.out, '', args.join(' '));
    assert.match(r.err, message, args.join(' '));
    // A message for a person, not a crash: a stack trace would also exit 1.
    assert.match(r.err, /^gitmargin: /, args.join(' '));
    assert.doesNotMatch(r.err, /\n\s+at /, args.join(' '));
  }
});

test('the formatter pluralises the count', () => {
  assert.equal(formatFindings([]), '0 findings (0 break the page on at least one host)\n');
  const note = checkHtml(page().replace(' data-gm-screen="Start"', ''));
  assert.match(formatFindings(note, 'file'), /\n1 finding \(0 break the page on file\)\n$/);
});
