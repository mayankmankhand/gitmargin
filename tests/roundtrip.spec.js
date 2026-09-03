// The part-1 round trip, driven the way a reviewer actually gets the file: as
// HTML on disk, opened with a file:// URL. Nothing here starts a server.
//
// What each test protects is written in its title, because when one of these
// fails the question is always "which promise broke?".
import { test, expect } from '@playwright/test';
import { readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const FIXTURE = pathToFileURL(resolve('fixtures/wizard.html')).href;
const VERSION = 'v1-fixt01';

/** Open the fixture and fail loudly on any page error. */
async function openFixture(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(FIXTURE);
  await page.waitForFunction(() => !!window.__gitmargin);
  return errors;
}

/** Walk to a step by clicking Next, with comment mode off. */
async function walkTo(page, step) {
  for (let n = 1; n < step; n += 1) await page.click(`#step-${n} .next`);
  await expect(page.locator(`#step-${step}`)).toHaveClass(/active/);
}

/** Leave one comment on `selector`, with comment mode handled for you. */
async function comment(page, selector, text, tag) {
  await page.click('.gm-switch');
  await page.click(selector);
  await expect(page.locator('.gm-box')).toBeVisible();
  await page.fill('.gm-box textarea', text);
  if (tag) await page.click(`.gm-chip[data-tag="${tag}"]`);
  await page.click('.gm-box-actions .gm-btn.primary');
  await page.click('.gm-switch'); // back to walking the prototype
}

test('a comment records the screen, the trail and the element it was left on', async ({ page }) => {
  const errors = await openFixture(page);
  await walkTo(page, 3);
  await comment(page, '#step-3 .continue', 'I expected this to stay disabled until the address is valid.', 'bug');

  await expect(page.locator('.gm-pin')).toHaveCount(1);
  await expect(page.locator('.gm-card')).toHaveCount(1);

  const env = await page.evaluate(() => window.__gitmargin.export());
  expect(env.gitmargin).toBe('0.1');
  expect(env.file).toBe('wizard.html');
  expect(env.version_id).toBe(VERSION);
  expect(env.comments).toHaveLength(1);

  const c = env.comments[0];
  expect(c.id).toMatch(/^c_[0-9a-f]{6}$/);
  expect(c.intent).toEqual({
    text: 'I expected this to stay disabled until the address is valid.',
    tag: 'bug',
  });
  expect(c.status).toBe('open');

  // Where they were.
  expect(c.state.screen).toEqual({ name: 'Payment', source: 'data-gm-screen' });
  expect(c.state.hash).toBe('#step-3');
  expect(c.state.trail.map((t) => t.text)).toEqual(['Next', 'Next']);
  expect(c.state.screenshot).toBeNull(); // out of the v0.1 build by decision

  // The anchor finds exactly the button that was clicked.
  const resolved = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? `${el.tagName}:${el.textContent.trim()}` : null;
  }, c.anchor.selector);
  expect(resolved).toBe('BUTTON:Continue');
  expect(c.anchor.quote.exact).toBe('Continue');

  expect(errors).toEqual([]);
});

test('highlighting text anchors the quote with its surrounding words', async ({ page }) => {
  await openFixture(page);
  await page.click('.gm-switch');

  // A real drag across the words "standard plan" in the step 1 paragraph.
  const box = await page.evaluate(() => {
    const node = document.querySelector('#step-1 p').firstChild;
    const range = document.createRange();
    range.setStart(node, 4);
    range.setEnd(node, 17);
    const r = range.getBoundingClientRect();
    return { x1: r.left + 1, x2: r.right - 1, y: r.top + r.height / 2 };
  });
  await page.mouse.move(box.x1, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x2, box.y, { steps: 8 });
  await page.mouse.up();

  await expect(page.locator('.gm-box')).toBeVisible();
  await page.fill('.gm-box textarea', 'This promise is not kept on the payment step.');
  await page.click('.gm-box-actions .gm-btn.primary');

  const c = (await page.evaluate(() => window.__gitmargin.export())).comments[0];
  expect(c.anchor.quote.exact).toBe('standard plan');
  expect(`${c.anchor.quote.prefix}${c.anchor.quote.suffix}`.length).toBeGreaterThan(0);
  expect(c.state.screen.name).toBe('Your plan');
});

test('Send to author downloads the page with the comments in it, and hostile text cannot break the file', async ({
  page,
}, testInfo) => {
  await openFixture(page);
  await walkTo(page, 3);
  // A reviewer who types markup must not be able to end the JSON block early.
  await comment(page, '#step-3 .continue', 'Use </script> and <!-- here, please.', 'change');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('.gm-send .gm-btn.primary'),
  ]);
  expect(download.suggestedFilename()).toBe('wizard.reviewed.html');

  const saved = testInfo.outputPath('wizard.reviewed.html');
  await download.saveAs(saved);
  const html = await readFile(saved, 'utf8');

  const block = html.match(
    /<script type="application\/json" id="gitmargin-comments">([\s\S]*?)<\/script>/
  );
  expect(block).not.toBeNull();
  // The reviewer's markup survives only as escapes: exactly one closing script
  // tag exists in the file, and it is the one that ends the block.
  expect(block[1]).not.toContain('</script>');
  expect(block[1]).not.toContain('<!--');
  expect(block[1]).toContain('\\u003c');

  const parsed = JSON.parse(block[1]);
  expect(parsed.version_id).toBe(VERSION);
  expect(parsed.comments[0].intent.text).toBe('Use </script> and <!-- here, please.');

  // The overlay is still in the returned file, so the author can open it and
  // see the pins; the prototype's own markup is untouched.
  expect(html).toContain('id="step-3"');
  expect(html).not.toContain('gitmargin-root');
});

test('Copy for author puts the markdown batch on the clipboard', async ({ page }) => {
  await openFixture(page);
  await walkTo(page, 3);
  await comment(page, '#step-3 .continue', 'Expected this to stay disabled.', 'bug');
  await page.fill('.gm-who input', 'Priya');

  await page.click('.gm-send .gm-btn.ghost');
  const { text, ok } = await page.evaluate(() => ({
    text: window.__gitmargin.lastCopy,
    ok: window.__gitmargin.lastCopyOk,
  }));

  const lines = text.split('\n');
  expect(lines[0]).toBe(`gitmargin batch v0.1 | wizard.html | ${VERSION}`);
  expect(lines[1]).toMatch(/^Reviewer: Priya\. Viewport \d+x\d+\. Exported .+ UTC\.$/);
  expect(text).toContain('1. [bug] On "Payment" (#step-3), after clicking Next, Next:');
  expect(text).toContain('"Expected this to stay disabled."');
  // One numbered line per comment.
  expect(text.match(/^\d+\. /gm)).toHaveLength(1);
  // Recorded for docs/batch-format.md section 8, not asserted: engines differ
  // on whether a file:// page may write to the clipboard without a gesture.
  console.error(`[gitmargin] clipboard write reported ok=${ok}`);
});

test('comments survive closing the tab', async ({ page }) => {
  await openFixture(page);
  const storageWorks = await page.evaluate(() => {
    try {
      localStorage.setItem('gm-probe', '1');
      localStorage.removeItem('gm-probe');
      return true;
    } catch {
      return false;
    }
  });
  test.skip(!storageWorks, 'this engine gives a file:// page no localStorage');

  await walkTo(page, 3);
  await comment(page, '#step-3 .continue', 'Should still be here after a reload.', 'question');
  await page.fill('.gm-who input', 'Priya');

  await page.reload();
  await page.waitForFunction(() => !!window.__gitmargin);
  const env = await page.evaluate(() => window.__gitmargin.export());
  expect(env.comments).toHaveLength(1);
  expect(env.comments[0].intent.text).toBe('Should still be here after a reload.');
  expect(env.reviewer.name).toBe('Priya');
  await expect(page.locator('.gm-card')).toHaveCount(1);
});

test('a comment on another screen keeps its place, and one with no element is orphaned', async ({
  page,
}) => {
  await openFixture(page);
  await walkTo(page, 3);
  await comment(page, '#step-3 .continue', 'Expected this to stay disabled.', 'bug');
  await expect(page.locator('.gm-pin')).toHaveCount(1);

  // Back to step 1: the element is still in the document but not shown.
  await page.click('#step-3 .back');
  await page.click('#step-2 .back');
  await expect(page.locator('.gm-pin')).toHaveCount(0);
  await expect(page.locator('.gm-flag')).toHaveText('on another screen');
  // Nothing is lost: the card and the batch still carry it.
  await expect(page.locator('.gm-card')).toHaveCount(1);
  expect((await page.evaluate(() => window.__gitmargin.export())).comments).toHaveLength(1);

  // Take the element itself out of the page. The comment is NOT orphaned: the
  // third pointer finds the nearest surviving container, and the card says the
  // pin is only nearby rather than exact.
  await page.evaluate(() => document.querySelector('#step-3 .continue').remove());
  await expect(page.locator('.gm-flag')).toHaveText(['on another screen', 'nearby']);
  await expect(page.locator('.gm-card')).toHaveCount(1);

  // Take the whole container out and there is nothing left to anchor to.
  await page.evaluate(() => document.querySelector('#step-3').remove());
  await expect(page.locator('.gm-flag')).toHaveText('orphaned');
  await expect(page.locator('.gm-card')).toHaveCount(1);
  expect(await page.evaluate(() => window.__gitmargin.markdown())).toContain('[orphaned:');
});

test('comment mode decides whether a click belongs to the prototype or to the overlay', async ({
  page,
}) => {
  await openFixture(page);

  // Off: the click is the prototype's, and the trail records it.
  await page.click('#step-1 .next');
  await expect(page.locator('#step-2')).toHaveClass(/active/);
  expect(await page.evaluate(() => window.__gitmargin.trail().length)).toBe(1);

  // On: the same kind of click opens a comment box and the wizard stays put.
  await page.click('.gm-switch');
  await page.click('#step-2 .next');
  await expect(page.locator('#step-2')).toHaveClass(/active/);
  await expect(page.locator('.gm-box')).toBeVisible();
  expect(await page.evaluate(() => window.__gitmargin.trail().length)).toBe(1);

  // Escape closes the box without leaving a comment.
  await page.keyboard.press('Escape');
  await expect(page.locator('.gm-box')).toBeHidden();
  expect((await page.evaluate(() => window.__gitmargin.export())).comments).toHaveLength(0);
});

// --- regressions from the issue #3 review -----------------------------------

test('a returned file can be reopened and re-sent without losing its comments', async ({
  page,
}) => {
  // The copy is saved NEXT TO the fixture on purpose: the fixture loads the
  // bundle with a relative <script src>, so a copy anywhere else cannot find
  // it. `npx gitmargin attach` (issue #5) inlines the bundle, which is what
  // makes a real returned file portable; until then this is the honest setup.
  const returned = resolve('fixtures/.tmp-reviewed.html');
  await openFixture(page);
  await walkTo(page, 3);
  await comment(page, '#step-3 .continue', 'Expected this to stay disabled.', 'bug');
  await page.fill('.gm-who input', 'Priya');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('.gm-send .gm-btn.primary'),
  ]);
  await download.saveAs(returned);

  try {
    // A second reviewer, or the author, opens the file that came back. Clearing
    // storage first is what makes this a real test: on another machine there is
    // no local copy, so the embedded block is the only source.
    await page.goto(pathToFileURL(returned).href);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => !!window.__gitmargin);

    await expect(page.locator('.gm-card')).toHaveCount(1);
    const reopened = await page.evaluate(() => window.__gitmargin.export());
    expect(reopened.comments).toHaveLength(1);
    expect(reopened.comments[0].intent.text).toBe('Expected this to stay disabled.');
    expect(reopened.reviewer.name).toBe('Priya');

    // Re-sending keeps it rather than replacing it with an empty list, and
    // leaves exactly one block rather than stacking a second one up.
    const html = await page.evaluate(() => window.__gitmargin.reviewedHtml());
    const block = JSON.parse(
      html.match(/<script type="application\/json" id="gitmargin-comments">([\s\S]*?)<\/script>/)[1]
    );
    expect(block.comments).toHaveLength(1);
    expect(html.match(/id="gitmargin-comments"/g)).toHaveLength(1);
  } finally {
    await rm(returned, { force: true });
  }
});

test('the returned file closes its body tag properly when the page holds non-ASCII text', async ({
  page,
}, testInfo) => {
  await openFixture(page);
  await walkTo(page, 3);
  await comment(page, '#step-3 .continue', 'Checking the closing tag survives.', 'change');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('.gm-send .gm-btn.primary'),
  ]);
  const saved = testInfo.outputPath('wizard.unicode.html');
  await download.saveAs(saved);
  const html = await readFile(saved, 'utf8');

  // The fixture carries a dotted capital I, whose lowercase form is longer.
  expect(html).toContain('İstanbul');
  expect(html).toMatch(/<\/script>\s*<\/body>\s*<\/html>\s*$/);
  expect(html).not.toMatch(/<\s*\/body/i.source && /<(?!\/body>)[^<]*\/body>/);
});

test('an overlay pasted into the head still captures the whole page', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(resolve('fixtures/head-script.html')).href);
  await page.waitForFunction(() => !!window.__gitmargin);

  const html = await page.evaluate(() => window.__gitmargin.reviewedHtml());
  expect(html).toContain('<body>');
  expect(html).toContain('</body>');
  expect(html).toContain('The overlay must still capture this whole page');
  expect(html).toContain('id="go"');
  expect(errors).toEqual([]);
});

test('each comment records the viewport it was written at', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 720 });
  await openFixture(page);
  await walkTo(page, 3);
  await comment(page, '#step-3 .continue', 'Checking the viewport is recorded.', 'change');

  const c = (await page.evaluate(() => window.__gitmargin.export())).comments[0];
  expect(c.state.viewport).toEqual({ width: 1024, height: 720 });

  // Resizing before export must not rewrite what the reviewer saw.
  await page.setViewportSize({ width: 1440, height: 900 });
  const after = (await page.evaluate(() => window.__gitmargin.export())).comments[0];
  expect(after.state.viewport).toEqual({ width: 1024, height: 720 });
});

test('a highlighted quote finds the spot again when the selector stops matching', async ({
  page,
}) => {
  await openFixture(page);
  await page.click('.gm-switch');

  // Highlight a fragment inside the step 1 paragraph. The stored quote is a
  // FRAGMENT of that paragraph's text, which is the case an exact-match
  // fallback can never rescue.
  const box = await page.evaluate(() => {
    const node = document.querySelector('#step-1 p').firstChild;
    const range = document.createRange();
    range.setStart(node, 4);
    range.setEnd(node, 17);
    const r = range.getBoundingClientRect();
    return { x1: r.left + 1, x2: r.right - 1, y: r.top + r.height / 2 };
  });
  await page.mouse.move(box.x1, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x2, box.y, { steps: 8 });
  await page.mouse.up();
  await page.fill('.gm-box textarea', 'This promise is not kept on the payment step.');
  await page.click('.gm-box-actions .gm-btn.primary');
  await expect(page.locator('.gm-pin')).toHaveCount(1);

  // Regenerate the page the way an AI would: same words, different structure,
  // so the stored selector no longer matches anything.
  await page.evaluate(() => {
    document.querySelector('#step-1').id = 'plan-step';
  });

  // The quote still finds it, exactly, with no approximate or orphaned flag.
  await expect(page.locator('.gm-pin')).toHaveCount(1);
  await expect(page.locator('.gm-flag')).toHaveCount(0);
  expect(await page.evaluate(() => window.__gitmargin.markdown())).not.toContain('[orphaned:');
});

test('two unstamped prototypes do not share a comment store', async ({ page }) => {
  const a = pathToFileURL(resolve('fixtures/unstamped-a.html')).href;
  const b = pathToFileURL(resolve('fixtures/unstamped-b.html')).href;

  await page.goto(a);
  await page.waitForFunction(() => !!window.__gitmargin);
  await page.click('.gm-switch');
  await page.click('main .go');
  await page.fill('.gm-box textarea', 'This belongs to prototype a.');
  await page.click('.gm-box-actions .gm-btn.primary');
  await page.fill('.gm-who input', 'Priya');
  await expect(page.locator('.gm-card')).toHaveCount(1);

  // A different file, same browser, same file:// origin, neither stamped.
  await page.goto(b);
  await page.waitForFunction(() => !!window.__gitmargin);
  const env = await page.evaluate(() => window.__gitmargin.export());
  expect(env.version_id).toBeNull();
  expect(env.comments).toHaveLength(0);
  expect(env.reviewer.name).toBeNull();
  await expect(page.locator('.gm-card')).toHaveCount(0);

  // And the first file still has its own.
  await page.goto(a);
  await page.waitForFunction(() => !!window.__gitmargin);
  await expect(page.locator('.gm-card')).toHaveCount(1);
});

test('the reviewer is told whether their comments are being kept', async ({ page }) => {
  await openFixture(page);
  await walkTo(page, 3);
  await comment(page, '#step-3 .continue', 'Checking the saved notice.', 'change');
  await expect(page.locator('.gm-keep')).toHaveText('Kept in this browser until you send it.');

  // Now a browser that refuses storage to a local file.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage is not available');
      },
    });
  });
  await page.goto(FIXTURE);
  await page.waitForFunction(() => !!window.__gitmargin);
  await walkTo(page, 3);
  await comment(page, '#step-3 .continue', 'Checking the unsaved warning.', 'change');
  await expect(page.locator('.gm-keep')).toHaveText(
    'Not saved in this browser. Send or copy before you close this tab.'
  );
});
