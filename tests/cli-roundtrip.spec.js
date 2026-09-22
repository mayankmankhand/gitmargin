// The whole loop, end to end, the way it actually happens:
//
//   attach a prototype -> the reviewer opens the copy from disk and comments
//   -> "Send to author" downloads a file -> pull turns it into a batch
//
// Everything else in the suite tests one link. This tests that the links meet.
// It is the only place where the CLI and the overlay are exercised together, so
// a change to the stamp, the embedded block, or the escaping fails here first.
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { findEnvelope } from '../src/cli/comment-block.js';

const CLI = resolve('bin/gitmargin.js');

/** Run a gitmargin command and return its stdout. Throws on a non-zero exit. */
function gitmargin(args) {
  return execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

/**
 * Copy the prototype somewhere writable and attach the overlay to it.
 *
 * The copy matters: `attach` writes next to its input, and a test that wrote
 * into fixtures/ would leave the repository dirty and race the other workers.
 */
async function attachFixture(testInfo, fixture = 'fixtures/onboarding.html') {
  const dir = testInfo.outputPath('attach');
  await mkdir(dir, { recursive: true });
  const source = join(dir, 'onboarding.html');
  await copyFile(resolve(fixture), source);

  const attached = gitmargin(['attach', source]).trim();
  const versionId = /content="(v\d+-[0-9a-f]{6})"/.exec(await readFile(attached, 'utf8'))[1];
  return { attached, versionId };
}

/**
 * Leave one comment. Same shape as the helper in roundtrip.spec.js.
 *
 * `click` is passed through to Playwright, so a test can aim at a container's
 * own padding instead of its centre, where a child would take the click.
 */
async function comment(page, selector, text, tag, click) {
  await page.click('.gm-switch');
  await page.click(selector, click);
  await expect(page.locator('.gm-box')).toBeVisible();
  await page.fill('.gm-box textarea', text);
  if (tag) await page.click(`.gm-chip[data-tag="${tag}"]`);
  await page.click('.gm-box-actions .gm-btn.primary');
  await page.click('.gm-switch');
}

test('attach, comment, send back, pull: the batch names the version and the screen', async ({ page }, testInfo) => {
  const { attached, versionId } = await attachFixture(testInfo);

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(attached).href);
  await page.waitForFunction(() => !!window.__gitmargin);

  // The overlay must have picked up the stamp attach wrote, not a default.
  expect(await page.evaluate(() => window.__gitmargin.versionId)).toBe(versionId);
  expect(await page.evaluate(() => window.__gitmargin.file)).toBe('onboarding.html');

  // Walk two steps so the trail has something in it, then comment on step 3,
  // whose screen name has to come from the heading fallback.
  await page.click('#step-1 .next');
  await page.click('#step-2 .next');
  await expect(page.locator('#step-3')).toHaveClass(/active/);
  await comment(page, '#step-3 .next', 'I expected to be able to pick more than one.', 'bug');

  await page.click('.gm-badge'); // Send lives in the sheet (issue #21)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('.gm-send .gm-btn.primary'),
  ]);
  // attach stamped the ORIGINAL name, so the reviewer's file comes back with a
  // name the author recognises rather than "onboarding.gitmargin.reviewed.html".
  expect(download.suggestedFilename()).toBe('onboarding.reviewed.html');

  const returned = testInfo.outputPath('onboarding.reviewed.html');
  await download.saveAs(returned);

  const batch = JSON.parse(gitmargin(['pull', returned]));
  expect(batch.gitmargin).toBe('0.1');
  expect(batch.file).toBe('onboarding.html');
  expect(batch.version_id).toBe(versionId);
  expect(batch.rules.length).toBeGreaterThan(0);
  expect(batch.sources).toHaveLength(1);
  expect(batch.sources[0].carrier).toBe('html');
  expect(batch.sources[0].lossy).toBe(false);

  expect(batch.comments).toHaveLength(1);
  const [c] = batch.comments;
  expect(c.intent).toEqual({ text: 'I expected to be able to pick more than one.', tag: 'bug' });
  expect(c.source).toBe(0);
  expect(c.state.trail.map((t) => t.text)).toEqual(['Next', 'Next']);
  expect(c.state.screen.name).toBeTruthy();
  expect(c.anchor.selector).toBeTruthy();

  expect(errors).toEqual([]);
});

test('the file a reviewer sends back carries the overlay whole', async ({ page }, testInfo) => {
  // The regression this protects: the overlay's source builds the comment
  // block, so once attach inlines the bundle the document contains a perfect
  // lookalike of that block's opening tag. Stripping by tag alone matched the
  // lookalike and ran on to the overlay's own closing tag, silently deleting
  // two thirds of it. The file still opened; it just could not be reviewed
  // again, which is the one thing a returned file has to support.
  const { attached } = await attachFixture(testInfo);
  const overlayOf = (html) => (html.match(/<script id="gitmargin-overlay">([\s\S]*?)\n<\/script>/) || [])[1] || '';
  const sent = overlayOf(await readFile(attached, 'utf8'));
  expect(sent.length).toBeGreaterThan(10_000);

  await page.goto(pathToFileURL(attached).href);
  await page.waitForFunction(() => !!window.__gitmargin);
  await comment(page, '#step-1 .next', 'Does the overlay survive?', 'question');

  await page.click('.gm-badge'); // Send lives in the sheet (issue #21)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('.gm-send .gm-btn.primary'),
  ]);
  const returned = testInfo.outputPath('intact/onboarding.reviewed.html');
  await download.saveAs(returned);

  expect(overlayOf(await readFile(returned, 'utf8'))).toBe(sent);

  // ...and the proof that it is really still working code: reopen the returned
  // file and it must load its own comments back.
  await page.goto(pathToFileURL(returned).href);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => !!window.__gitmargin);
  await expect(page.locator('.gm-card')).toHaveCount(1);
});

test('two reviewers on the same version become one batch', async ({ page }, testInfo) => {
  const { attached, versionId } = await attachFixture(testInfo);
  const files = [];

  for (const [who, what] of [
    ['Priya', 'The Bluetooth prompt appears before I know why.'],
    ['Sam', 'I could not tell this step was optional.'],
  ]) {
    await page.goto(pathToFileURL(attached).href);
    // Each reviewer is a fresh machine: no local copy, nothing carried over.
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => !!window.__gitmargin);

    await comment(page, '#step-1 h2', what, 'question');
    await page.click('.gm-id'); // the name field is under the identity chip (issue #21)
    await page.fill('.gm-who input', who);

    await page.click('.gm-badge'); // Send lives in the sheet (issue #21)

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('.gm-send .gm-btn.primary'),
    ]);
    const saved = testInfo.outputPath(`${who}.reviewed.html`);
    await download.saveAs(saved);
    files.push(saved);
  }

  const batch = JSON.parse(gitmargin(['pull', ...files]));
  expect(batch.version_id).toBe(versionId);
  expect(batch.sources.map((s) => s.reviewer)).toEqual(['Priya', 'Sam']);
  expect(batch.comments).toHaveLength(2);
  // Ids are random per comment, so two reviewers never collide and both survive.
  expect(new Set(batch.comments.map((c) => c.id)).size).toBe(2);
  expect(batch.comments.map((c) => c.source)).toEqual([0, 1]);
});

test('the clipboard block pulls back as a lossier batch of the same comments', async ({ page }, testInfo) => {
  const { attached } = await attachFixture(testInfo);

  await page.goto(pathToFileURL(attached).href);
  await page.waitForFunction(() => !!window.__gitmargin);
  await comment(page, '#step-1 .next', 'This should say what happens next.', 'change');

  // Read what the overlay put on the clipboard from its own report: a file://
  // page cannot be relied on to read the clipboard back in every engine.
  await page.click('.gm-badge'); // Copy lives in the sheet (issue #21)
  await page.click('.gm-send .gm-btn:not(.primary)');
  const block = await page.evaluate(() => window.__gitmargin.lastCopy);
  expect(block).toContain('gitmargin batch v0.1');

  const batch = JSON.parse(
    execFileSync(process.execPath, [CLI, 'pull', '-'], { encoding: 'utf8', input: block })
  );
  expect(batch.sources[0].carrier).toBe('markdown');
  expect(batch.sources[0].lossy).toBe(true);
  expect(batch.comments).toHaveLength(1);
  expect(batch.comments[0].intent.text).toBe('This should say what happens next.');
  expect(batch.comments[0].intent.tag).toBe('change');
  // The trail survives as text; the timings and the anchor detail do not.
  expect(batch.comments[0].anchor.selector).toBeTruthy();
  expect(batch.comments[0].state.trail.every((t) => t.seconds_before === null)).toBe(true);
});

test('a reviewed file can be attached again for a second round', async ({ page }, testInfo) => {
  const { attached } = await attachFixture(testInfo);

  await page.goto(pathToFileURL(attached).href);
  await page.waitForFunction(() => !!window.__gitmargin);
  await comment(page, '#step-1 .next', 'Round one.', 'change');

  await page.click('.gm-badge'); // Send lives in the sheet (issue #21)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('.gm-send .gm-btn.primary'),
  ]);
  const returned = testInfo.outputPath('round1/onboarding.reviewed.html');
  await download.saveAs(returned);

  // The author edits nothing and re-attaches what came back. The old comment
  // block must not travel into the new round: it belongs to the batch already
  // pulled, and carrying it forward would double-count it.
  const again = gitmargin(['attach', returned]).trim();
  const html = await readFile(again, 'utf8');

  // "No block" has to be asked of the validator, not of the text. Every
  // attached file contains the block's opening tag as a string, inside the
  // bundle that writes it, so no substring or regex check for the tag can ever
  // pass here. What must be true is that nothing PARSES as a block.
  expect(findEnvelope(html)).toBeNull();
  expect(html).not.toContain('Round one.');
  expect(html.match(/<script[^>]*\bid="gitmargin-overlay"/g)).toHaveLength(1);
  expect(html.match(/<meta name="gitmargin-version"/g)).toHaveLength(1);
});

test('two comments on one screen name the same screen, even when one is on its heading', async ({
  page,
}, testInfo) => {
  // The heading fallback is reached only where the prototype tags nothing, and
  // step 3 of the onboarding fixture is deliberately untagged.
  //
  // Before the fix in src/overlay/screen.js, commenting ON the step's own <h2>
  // reported the app-level title while every other element on that step
  // reported the step: compareDocumentPosition returns 0 for a node compared
  // with itself, so the element's own heading never matched and an earlier one
  // won. Two comments on one screen came back naming two different screens,
  // which is the single thing the screen field exists to get right.
  const { attached } = await attachFixture(testInfo);
  await page.goto(pathToFileURL(attached).href);
  await page.waitForFunction(() => !!window.__gitmargin);

  await page.click('#step-1 .next');
  await page.click('#step-2 .next');
  await expect(page.locator('#step-3')).toHaveClass(/active/);

  await comment(page, '#step-3 h2', 'This title does not say what happens next.');
  await comment(page, '#step-3 .next', 'I expected this to stay disabled.');
  await comment(page, '#step-3 p', 'This paragraph repeats the title.');

  const env = await page.evaluate(() => window.__gitmargin.export());
  const names = env.comments.map((c) => c.state.screen.name);
  expect(new Set(names).size).toBe(1);
  // Named for the step the reviewer was on, not for the app around it.
  expect(names[0]).toBe(await page.locator('#step-3 h2').innerText());
});

test('a reviewer who gives a name gets it in the file name, so two reviewers do not collide', async ({
  page,
}, testInfo) => {
  const { attached } = await attachFixture(testInfo);
  await page.goto(pathToFileURL(attached).href);
  await page.waitForFunction(() => !!window.__gitmargin);

  await page.click('.gm-id'); // the name field is under the identity chip (issue #21)

  await page.fill('#gm-reviewer', 'José Ríos');
  await comment(page, '#step-1 h2', 'Anything.');

  await page.click('.gm-badge'); // Send lives in the sheet (issue #21)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('.gm-send .gm-btn.primary'),
  ]);
  // Accents are folded rather than dropped: "jos-r-os" would look broken.
  expect(download.suggestedFilename()).toBe('onboarding.reviewed.jose-rios.html');
});

test('a browser that cannot run the overlay says so instead of looking normal', async ({
  page,
}, testInfo) => {
  const { attached } = await attachFixture(testInfo);

  // Stand in for any engine that parses the bundle but cannot run it. The real
  // case this protects is older still: an engine that cannot parse the bundle
  // at all never executes a byte of it, which is why the notice is a separate
  // ES5 script rather than anything the overlay itself does.
  await page.addInitScript(() => {
    delete Element.prototype.attachShadow;
  });
  await page.goto(pathToFileURL(attached).href, { waitUntil: 'load' });

  const notice = page.locator('#gitmargin-unsupported');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('too old to leave comments');

  // The prototype the reviewer was sent still works: the overlay is the last
  // element in <body> and never writes into the page, so its failure is
  // contained. A reviewer can still read what they were asked to look at.
  await page.click('#step-1 .next');
  await expect(page.locator('#step-2')).toHaveClass(/active/);
});

test('the notice stays out of the way when the overlay does start', async ({ page }, testInfo) => {
  const { attached } = await attachFixture(testInfo);
  await page.goto(pathToFileURL(attached).href, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__gitmargin);
  await expect(page.locator('#gitmargin-unsupported')).toHaveCount(0);
});

test('a click on page furniture is not a step in the trail', async ({ page }, testInfo) => {
  // From the first real run: four of fifteen entries were clicks that landed on
  // <body>, and each carried the whole page truncated to 40 characters, so the
  // trail an agent reads was mostly the same sentence repeated. The trail is
  // meant to BE the state of a multi-step prototype.
  const { attached } = await attachFixture(testInfo);
  await page.goto(pathToFileURL(attached).href);
  await page.waitForFunction(() => !!window.__gitmargin);

  await page.click('#step-1 .next');
  await page.evaluate(() => document.body.click());
  await page.evaluate(() => document.body.click());
  await page.click('#step-2 .next');

  const trail = await page.evaluate(() => window.__gitmargin.trail());
  expect(trail.map((t) => t.text)).toEqual(['Next', 'Next']);
  expect(trail.every((t) => t.selector !== 'body' && t.selector !== 'html')).toBe(true);
});

test('a form field is named by its label, not left blank', async ({ page }, testInfo) => {
  const { attached } = await attachFixture(testInfo);
  await page.goto(pathToFileURL(attached).href);
  await page.waitForFunction(() => !!window.__gitmargin);

  await page.click('#step-1 .next');
  await page.click('#email');

  const trail = await page.evaluate(() => window.__gitmargin.trail());
  const field = trail.find((t) => t.selector === '#email');
  expect(field).toBeTruthy();
  expect(field.text).toBeTruthy();
});

test('clicking a label records one step, not the label and its control', async ({
  page,
}, testInfo) => {
  // The browser forwards a click on a <label> to the control it names, so one
  // press arrives twice. The label is the half with words on it.
  const { attached } = await attachFixture(testInfo);
  await page.goto(pathToFileURL(attached).href);
  await page.waitForFunction(() => !!window.__gitmargin);

  await page.click('#step-1 > label:nth-of-type(2)');

  const trail = await page.evaluate(() => window.__gitmargin.trail());
  expect(trail).toHaveLength(1);
  expect(trail[0].text).toBe('They are within a metre of this phone');
});

test('an element quote reads the way the page renders it, not as one long word', async ({
  page,
}, testInfo) => {
  // `textContent` glues children together with nothing in between, and both of
  // these containers separate their children with CSS rather than with
  // whitespace in the markup: `display: block` on the tile's <strong>, and
  // flex-item blockification on the spec row's two <span>s. Neither is visible
  // to a tag-name rule - strong, small and span are all inline by default -
  // so the quote is read from the computed display instead (issue #8).
  const { attached } = await attachFixture(testInfo);
  await page.goto(pathToFileURL(attached).href);
  await page.waitForFunction(() => !!window.__gitmargin);

  await page.click('#step-1 .next');
  await page.click('#step-2 .next');
  await expect(page.locator('#step-3')).toHaveClass(/active/);
  // Aimed into the label's own 14px padding, so the click lands on the tile and
  // not on one of the children whose separation is the thing under test.
  await comment(page, '#step-3 .tile:nth-child(1)', 'These read as one option to me.', 'question', {
    position: { x: 5, y: 5 },
  });

  await page.click('#step-3 .next');
  await page.click('#tab-about');
  await comment(page, '#panel-about .line:nth-child(1)', 'I expected the model name first.', 'question');

  const env = await page.evaluate(() => window.__gitmargin.export());
  expect(env.comments.map((c) => c.anchor.quote.exact)).toEqual([
    'Commuting Trains, buses, walking',
    'Model WH-1000XM5',
  ]);
  // The context either side is read the same way, so it does not go silently
  // empty the moment the quote carries a break the raw text does not.
  expect(env.comments[1].anchor.quote.suffix).toContain('Firmware');
});

test('a comment on a hidden panel is found by its quote, not lost to whitespace', async ({
  page,
}, testInfo) => {
  // The panel is hidden AND the selector is destroyed, which leaves the quote
  // as the only pointer left - the exact situation the anchor exists for.
  //
  // What this guards is the pairing: reading the quote as rendered text while
  // still matching it against raw text. It passes against the code as it was
  // before issue #8, because both sides were glued there and agreed with each
  // other. It fails when only the reading half is changed.
  const { attached } = await attachFixture(testInfo);
  await page.goto(pathToFileURL(attached).href);
  await page.waitForFunction(() => !!window.__gitmargin);

  await page.click('#step-1 .next');
  await page.click('#step-2 .next');
  await page.click('#step-3 .next');
  await page.click('#tab-about');
  await comment(page, '#panel-about .line:nth-child(1)', 'Is this the firmware we ship?', 'question');
  await expect(page.locator('.gm-pin')).toHaveCount(1);

  // Change tabs (the panel is hidden) and rename its container (the selector
  // no longer matches anything).
  await page.click('#tab-sound');
  await page.evaluate(() => {
    document.querySelector('#panel-about').id = 'panel-about-regenerated';
  });

  // Found anyway, on a screen the reviewer is not looking at. Not orphaned,
  // and not "nearby": the quote matched one element exactly.
  await expect(page.locator('.gm-flag')).toHaveText(['on another screen']);
  await expect(page.locator('.gm-card')).toHaveCount(1);
  expect(await page.evaluate(() => window.__gitmargin.markdown())).not.toContain('[orphaned:');
});

test('a quote still finds its element when hidden text sits in the middle of it', async ({
  page,
}, testInfo) => {
  // The invariant the whitespace-insensitive match rests on: reading an
  // element's text may add spaces but must never drop characters, so the same
  // element's raw text always still contains the quote. A walker that skipped
  // unrendered children broke it - the quote came out as the two visible words
  // with nothing between them, which appears nowhere in the raw text.
  const { attached } = await attachFixture(testInfo);
  await page.goto(pathToFileURL(attached).href);
  await page.waitForFunction(() => !!window.__gitmargin);

  await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.id = 'inv-probe';
    probe.innerHTML = 'Alpha<span style="display:none">HIDDEN</span>Omega';
    document.querySelector('.step.active').appendChild(probe);
  });

  await comment(page, '#inv-probe', 'Does this still find itself?', 'question');

  // Destroy the selector, leaving the quote as the only pointer.
  await page.evaluate(() => {
    document.querySelector('#inv-probe').id = 'inv-probe-regenerated';
  });

  // Found exactly, by the quote: a pin, and no flag at all. An "on another
  // screen" or "nearby" flag here would mean the quote missed and the third
  // pointer picked up the container instead.
  await expect(page.locator('.gm-pin')).toHaveCount(1);
  await expect(page.locator('.gm-flag')).toHaveCount(0);
  expect(await page.evaluate(() => window.__gitmargin.markdown())).not.toContain('[orphaned:');
});
