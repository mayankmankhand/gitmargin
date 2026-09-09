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
  await expect(page.locator('.gm-flag')).toHaveText(['on another screen']);
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
  await expect(page.locator('.gm-flag')).toHaveText(['orphaned']);
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

test('a written comment is not thrown away by Escape or by clicking elsewhere', async ({
  page,
}) => {
  await openFixture(page);
  await walkTo(page, 3);
  await page.click('.gm-switch');
  await page.click('#step-3 .continue');
  await page.fill('.gm-box textarea', 'Half a thought that took a while to write.');

  // Escape once warns and keeps the text.
  await page.keyboard.press('Escape');
  await expect(page.locator('.gm-box')).toBeVisible();
  await expect(page.locator('.gm-boxwarn')).toHaveText('Press again to discard what you typed.');
  await expect(page.locator('.gm-box textarea')).toHaveValue(
    'Half a thought that took a while to write.'
  );

  // Typing again means the reviewer is still working, so the guard re-arms and
  // a click on another spot warns rather than blanking the box.
  await page.locator('.gm-box textarea').type(' More.');
  await expect(page.locator('.gm-boxwarn')).toHaveText('');
  await page.click('#step-3 h2');
  await expect(page.locator('.gm-box textarea')).toHaveValue(
    'Half a thought that took a while to write. More.'
  );
  await expect(page.locator('.gm-boxwarn')).toHaveText('Press again to discard what you typed.');

  // Only the second attempt in a row discards, deliberately.
  await page.keyboard.press('Escape');
  await expect(page.locator('.gm-box')).toBeHidden();
  expect((await page.evaluate(() => window.__gitmargin.export())).comments).toHaveLength(0);
});

test('deleting a comment takes two clicks', async ({ page }) => {
  await openFixture(page);
  await walkTo(page, 3);
  await comment(page, '#step-3 .continue', 'A comment worth several minutes.', 'bug');
  await page.click('.gm-card');

  await page.click('.gm-card-actions .gm-del');
  await expect(page.locator('.gm-card-actions .gm-del')).toHaveText('Delete?');
  await expect(page.locator('.gm-card')).toHaveCount(1);
  expect((await page.evaluate(() => window.__gitmargin.export())).comments).toHaveLength(1);

  await page.click('.gm-card-actions .gm-del');
  await expect(page.locator('.gm-card')).toHaveCount(0);
  expect((await page.evaluate(() => window.__gitmargin.export())).comments).toHaveLength(0);
});

test('a comment can be made and dismissed with the keyboard alone', async ({ page }) => {
  await openFixture(page);
  await page.click('.gm-switch');

  // Select a fragment the way shift and the arrow keys would, then press the
  // comment key. A paragraph never takes focus, so this is the only route.
  await page.evaluate(() => {
    const node = document.querySelector('#step-1 p').firstChild;
    const range = document.createRange();
    range.setStart(node, 4);
    range.setEnd(node, 17);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await page.keyboard.press('c');
  await expect(page.locator('.gm-box')).toBeVisible();

  await page.fill('.gm-box textarea', 'Reached without a mouse.');
  await page.keyboard.press('Control+Enter');
  const env = await page.evaluate(() => window.__gitmargin.export());
  expect(env.comments).toHaveLength(1);
  expect(env.comments[0].anchor.quote.exact).toBe('standard plan');

  // Escape with no box open is the way out of comment mode.
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__gitmargin.ui.isCommentMode())).toBe(false);
});

test('collapsing the panel cannot leave the prototype frozen', async ({ page }) => {
  await openFixture(page);
  await page.click('.gm-switch');
  expect(await page.evaluate(() => window.__gitmargin.ui.isCommentMode())).toBe(true);

  await page.click('.gm-close');
  expect(await page.evaluate(() => window.__gitmargin.ui.isCommentMode())).toBe(false);
  // And the prototype answers clicks again.
  await page.click('#step-1 .next');
  await expect(page.locator('#step-2')).toHaveClass(/active/);
});

test('the overlay exposes state and names to assistive technology', async ({ page }) => {
  await openFixture(page);
  await walkTo(page, 3);
  const sw = page.locator('.gm-switch');
  await expect(sw).toHaveAttribute('role', 'switch');
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');

  // The name field's label is associated, not just adjacent.
  expect(
    await page.evaluate(() => {
      const root = document.getElementById('gitmargin-root').shadowRoot;
      const input = root.getElementById('gm-reviewer');
      const label = root.querySelector('label[for="gm-reviewer"]');
      return !!(input && label && root.querySelector(`#${label.htmlFor}`) === input);
    })
  ).toBe(true);

  await page.click('#step-3 h2');
  await page.fill('.gm-box textarea', 'Checking the pin label.');
  await page.click('.gm-box-actions .gm-btn.primary');
  await expect(page.locator('.gm-pin')).toHaveAttribute(
    'aria-label',
    'Comment 1: Checking the pin label.'
  );
});

test('card actions are revealed by keyboard focus, not only by hover', async ({ page }) => {
  await openFixture(page);
  await walkTo(page, 3);
  await comment(page, '#step-3 .continue', 'Checking focus reveal.', 'change');

  await page.evaluate(() => {
    const root = document.getElementById('gitmargin-root').shadowRoot;
    root.querySelector('.gm-card-actions button').focus();
  });
  await expect
    .poll(async () =>
      Number(
        await page.evaluate(() => {
          const root = document.getElementById('gitmargin-root').shadowRoot;
          return getComputedStyle(root.querySelector('.gm-card-actions')).opacity;
        })
      )
    )
    .toBe(1);
});

test('a pin is not drawn for an element scrolled out of the viewport', async ({ page }) => {
  await openFixture(page);
  await walkTo(page, 3);
  await comment(page, '#step-3 .continue', 'Checking off-screen pins.', 'change');
  await expect(page.locator('.gm-pin')).toHaveCount(1);

  // Push the content far below the fold and look at the top of the page.
  await page.evaluate(() => {
    document.body.style.paddingTop = '4000px';
    window.scrollTo(0, 0);
  });
  await expect(page.locator('.gm-pin')).toHaveCount(0);
  // The comment is not lost, only its pin.
  await expect(page.locator('.gm-card')).toHaveCount(1);
});

test('the comment box names the element in words, never a CSS selector', async ({ page }) => {
  await openFixture(page);
  await walkTo(page, 3);
  await page.click('.gm-switch');
  await page.click('#card');

  const where = await page.locator('.gm-box .where').textContent();
  expect(where).toBe('the field');
  expect(where).not.toContain('#');
  expect(where).not.toContain('>');
});

test('an open edit survives a re-render of the page', async ({ page }) => {
  await openFixture(page);
  await walkTo(page, 3);
  await comment(page, '#step-3 .continue', 'The original text.', 'change');
  await page.click('.gm-card');
  await page.click('.gm-card-actions button');

  await page.fill('.gm-card textarea', 'A careful rewrite in progress');
  // Anything the prototype does triggers the observer: a clock, a carousel, a
  // scroll. Here, a DOM change stands in for all of them.
  await page.evaluate(() => document.querySelector('#step-3 h2').append(' '));
  await page.waitForTimeout(120);
  await expect(page.locator('.gm-card textarea')).toHaveValue('A careful rewrite in progress');
});

test('a dialog names the screen it belongs to', async ({ page }) => {
  await openFixture(page);
  await walkTo(page, 3);

  // Shown non-modally: the reviewer can still reach the overlay. The modal case
  // is covered by the next test, which records why it cannot work today.
  await page.evaluate(() => document.getElementById('help-dialog').show());
  await page.click('.gm-switch');
  await page.click('#help-dialog p');
  await page.fill('.gm-box textarea', 'Say which provider, not just "our provider".');
  await page.click('.gm-box-actions .gm-btn.primary');

  const c = (await page.evaluate(() => window.__gitmargin.export())).comments[0];
  expect(c.state.screen).toEqual({ name: 'About your card', source: 'dialog' });
});

test('a modal dialog covers the overlay: the known limit, recorded', async ({ page }) => {
  await openFixture(page);
  await walkTo(page, 3);
  await page.click('.gm-switch');
  await page.evaluate(() => document.getElementById('help-dialog').showModal());

  // The click is still intercepted and the anchor is still captured...
  await page.evaluate(() => document.querySelector('#help-dialog p').click());
  expect(await page.evaluate(() => window.__gitmargin.ui.isBoxOpen())).toBe(true);

  // ...but the box is behind the dialog's backdrop, so it cannot be used.
  // A modal <dialog> opened after the overlay sits above it in the top layer
  // and re-showing the popover does not reorder it. If a future engine changes
  // that, this assertion fails and the limit can be lifted.
  const onTop = await page.evaluate(() => {
    const host = document.getElementById('gitmargin-root');
    const r = host.shadowRoot.querySelector('.gm-box').getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + 20);
    return el ? el.tagName : null;
  });
  expect(onTop).toBe('DIALOG');
});

test('an element with no text of its own still anchors by selector', async ({ page }) => {
  await openFixture(page);
  await walkTo(page, 3);
  await page.click('.gm-switch');

  // A text input has no text of its own, so the quote is empty and the
  // selector is the only pointer left.
  await page.click('#card');
  await page.fill('.gm-box textarea', 'This field should mask the number.');
  await page.click('.gm-box-actions .gm-btn.primary');

  const c = (await page.evaluate(() => window.__gitmargin.export())).comments[0];
  expect(c.anchor.quote.exact).toBe('');
  expect(c.anchor.selector).toBe('#card');
  const resolves = await page.evaluate(
    (sel) => document.querySelector(sel)?.id,
    c.anchor.selector
  );
  expect(resolves).toBe('card');
  // The markdown still reads as a sentence rather than a selector dump.
  expect(await page.evaluate(() => window.__gitmargin.markdown())).toContain('the field (#card)');
});

test('the panel keeps updating while a comment is being edited', async ({ page }) => {
  await openFixture(page);
  await walkTo(page, 3);
  await comment(page, '#step-3 .continue', 'The original text.', 'change');
  await page.click('.gm-card');
  await page.click('.gm-card-actions button');
  await page.fill('.gm-card textarea', 'A careful rewrite in progress');

  // The saved notice and the count live outside the list, so guarding the list
  // against rebuilds must not freeze them too.
  await expect(page.locator('.gm-keep')).toHaveText('Kept in this browser until you send it.');
  await expect(page.locator('.gm-section .count')).toHaveText('1');
  await page.evaluate(() => document.querySelector('#step-3 h2').append(' '));
  await page.waitForTimeout(120);
  await expect(page.locator('.gm-card textarea')).toHaveValue('A careful rewrite in progress');
  await expect(page.locator('.gm-section .count')).toHaveText('1');
});

test('a pin is dropped when its element slides off sideways, not just downwards', async ({
  page,
}) => {
  await openFixture(page);
  await walkTo(page, 3);
  await comment(page, '#step-3 .continue', 'Checking a horizontal exit.', 'change');
  await expect(page.locator('.gm-pin')).toHaveCount(1);

  // An off-canvas drawer is the usual way a prototype moves something out of
  // view, and it moves sideways rather than down.
  await page.evaluate(() => {
    document.querySelector('.shell').style.transform = 'translateX(-4000px)';
  });
  await expect(page.locator('.gm-pin')).toHaveCount(0);
  await expect(page.locator('.gm-leader')).toHaveCount(0);
  await expect(page.locator('.gm-card')).toHaveCount(1);

  // And off to the right, where a clamped pin would land on the panel itself.
  await page.evaluate(() => {
    document.querySelector('.shell').style.transform = 'translateX(4000px)';
  });
  await expect(page.locator('.gm-pin')).toHaveCount(0);

  // Back in view, the pin returns.
  await page.evaluate(() => {
    document.querySelector('.shell').style.transform = '';
  });
  await expect(page.locator('.gm-pin')).toHaveCount(1);
});

test('a quote that matches in two places is marked approximate, not guessed at', async ({
  page,
}) => {
  await openFixture(page);
  await walkTo(page, 3);
  await comment(page, '#step-3 .continue', 'Expected this to stay disabled.', 'bug');
  await expect(page.locator('.gm-flag')).toHaveCount(0);

  // Break the selector and put the same word somewhere else on the page, so
  // the quote no longer identifies one element.
  await page.evaluate(() => {
    document.querySelector('#step-3 .continue').className = 'renamed';
    const decoy = document.createElement('p');
    decoy.textContent = 'Please Continue when you are ready.';
    document.querySelector('#step-3').append(decoy);
  });

  await expect(page.locator('.gm-flag')).toHaveText(['nearby']);
  expect(await page.evaluate(() => window.__gitmargin.markdown())).toContain(
    '[nearby: the exact element was not found, this is the closest match]'
  );
});

test('an icon-only control is described by its accessible name', async ({ page }) => {
  await openFixture(page);
  await walkTo(page, 3);
  await page.click('.gm-switch');
  await page.click('#help');

  await page.fill('.gm-box textarea', 'This should explain the charge, not the storage.');
  await page.click('.gm-box-actions .gm-btn.primary');

  const c = (await page.evaluate(() => window.__gitmargin.export())).comments[0];
  // visibleText falls back to the accessible name only when there is no text;
  // this button shows a question mark, so the quote is that mark and the
  // selector carries the identity.
  expect(c.anchor.selector).toBe('#help');
  expect(c.anchor.tag).toBe('button');
  expect(await page.evaluate(() => window.__gitmargin.markdown())).toContain('button (#help)');
});

test('leaving comment mode does not throw away a comment in progress', async ({ page }) => {
  await openFixture(page);
  await walkTo(page, 3);
  await page.click('.gm-switch');
  await page.click('#step-3 .continue');
  await page.fill('.gm-box textarea', 'Most of a thought.');

  // Turning the mode off governs what a click does; it must not discard this.
  await page.click('.gm-switch');
  expect(await page.evaluate(() => window.__gitmargin.ui.isCommentMode())).toBe(false);
  await expect(page.locator('.gm-box textarea')).toHaveValue('Most of a thought.');

  // And it can still be saved.
  await page.click('.gm-box-actions .gm-btn.primary');
  expect((await page.evaluate(() => window.__gitmargin.export())).comments).toHaveLength(1);
});

test('the keyboard route is stated where a reviewer can read it', async ({ page }) => {
  await openFixture(page);
  await expect(page.locator('.gm-empty')).toContainText('press C');
});

// ---- issue #10: the target preview -----------------------------------------
// In comment mode a frame follows the pointer and shows the element a click
// will attach a comment to, and that element is snapped up from the raw node
// under the pointer. The frame and the click call one function; the first test
// below compares the two by identity, which is the whole promise.

/** True when the preview is on the element `selector` finds, compared by identity. */
const framedIs = (page, selector) =>
  page.evaluate((s) => window.__gitmargin.ui.target() === document.querySelector(s), selector);
const frameHidden = (page) =>
  page.evaluate(() => document.getElementById('gitmargin-root').shadowRoot.querySelector('.gm-target').hidden);
/** Two animation frames: the pointer handler updates once per frame. */
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

test('the frame shows the element a click will anchor: a label inside a button means the button', async ({ page }) => {
  await openFixture(page);
  await page.click('.gm-switch');

  await page.hover('#promo .label');
  await settle(page);
  expect(await framedIs(page, '#promo')).toBe(true);
  // The frame is drawn 3px outside the element's box, like the selected-comment frame.
  const [frame, target] = await page.evaluate(() => {
    const f = document.getElementById('gitmargin-root').shadowRoot.querySelector('.gm-target').getBoundingClientRect();
    const t = document.querySelector('#promo').getBoundingClientRect();
    return [f, t];
  });
  expect(Math.abs(frame.left - (target.left - 3))).toBeLessThan(1);
  expect(Math.abs(frame.width - (target.width + 6))).toBeLessThan(1);

  // The click picks the framed element: the same node, not merely the same shape.
  await page.click('#promo .label');
  await expect(page.locator('.gm-box')).toBeVisible();
  expect(await framedIs(page, '#promo')).toBe(true);
  await page.fill('.gm-box textarea', 'Promo codes belong at checkout, not here.');
  await page.click('.gm-box-actions .gm-btn.primary');

  const c = (await page.evaluate(() => window.__gitmargin.export())).comments[0];
  expect(c.anchor.tag).toBe('button');
  expect(await page.evaluate((sel) => document.querySelector(sel) === document.querySelector('#promo'), c.anchor.selector)).toBe(true);
  // The quote is what the page renders: the icon glyph and the label are two
  // inline spans with nothing between them, so they read as one word.
  expect(c.anchor.quote.exact).toBe('%Add a promo code');
});

test('a word inside a paragraph frames and anchors the paragraph', async ({ page }) => {
  await openFixture(page);
  await page.click('.gm-switch');

  await page.hover('#step-1 .fine strong');
  await settle(page);
  expect(await framedIs(page, '#step-1 .fine p')).toBe(true);

  await page.click('#step-1 .fine strong');
  await page.fill('.gm-box textarea', 'Say which order counts as the first.');
  await page.click('.gm-box-actions .gm-btn.primary');
  const c = (await page.evaluate(() => window.__gitmargin.export())).comments[0];
  expect(c.anchor.tag).toBe('p');
  expect(c.anchor.quote.exact).toBe('Delivery is free on your first order.');
});

test('the frame hides while text is being dragged, and the highlight still anchors its quote', async ({ page }) => {
  await openFixture(page);
  await page.click('.gm-switch');

  const box = await page.evaluate(() => {
    const node = document.querySelector('#step-1 p').firstChild;
    const range = document.createRange();
    range.setStart(node, 4);
    range.setEnd(node, 17);
    const r = range.getBoundingClientRect();
    return { x1: r.left + 1, x2: r.right - 1, y: r.top + r.height / 2 };
  });
  await page.mouse.move(box.x1, box.y);
  await settle(page);
  expect(await framedIs(page, '#step-1 p')).toBe(true); // resting on the paragraph
  await page.mouse.down();
  await page.mouse.move(box.x2, box.y, { steps: 8 });
  await settle(page);
  expect(await page.evaluate(() => String(getSelection()).length)).toBeGreaterThan(0);
  expect(await frameHidden(page)).toBe(true); // the selection is its own preview
  await page.mouse.up();

  await expect(page.locator('.gm-box')).toBeVisible();
  expect(await frameHidden(page)).toBe(true); // a highlight draft has no frame
  await page.fill('.gm-box textarea', 'Still anchored to the words.');
  await page.click('.gm-box-actions .gm-btn.primary');
  const c = (await page.evaluate(() => window.__gitmargin.export())).comments[0];
  expect(c.anchor.quote.exact).toBe('standard plan');
});

test('focus moving onto a control frames it, and C comments on it', async ({ page }) => {
  await openFixture(page);
  await page.click('.gm-switch');

  await page.focus('#plan');
  await settle(page);
  expect(await framedIs(page, '#plan')).toBe(true);

  // C is left alone on a field the reviewer may be typing into (a select picks
  // an option by letter), so the comment half of this promise uses a button.
  await page.focus('#step-1 .next');
  await settle(page);
  expect(await framedIs(page, '#step-1 .next')).toBe(true);
  await page.keyboard.press('c');
  await expect(page.locator('.gm-box')).toBeVisible();
  expect(await framedIs(page, '#step-1 .next')).toBe(true);
  expect(await page.locator('.gm-box .where').textContent()).toBe('"Next"');
  await page.fill('.gm-box textarea', 'Next reads as a submit.');
  await page.keyboard.press('Control+Enter');
  const c = (await page.evaluate(() => window.__gitmargin.export())).comments[0];
  expect(c.anchor.tag).toBe('button');
  expect(await page.evaluate((sel) => document.querySelector(sel) === document.querySelector('#step-1 .next'), c.anchor.selector)).toBe(true);
});

test('the frame stays on the element while the box is open, then follows the pointer again', async ({ page }) => {
  await openFixture(page);
  await page.click('.gm-switch');

  await page.hover('#step-1 .next');
  await settle(page);
  await page.click('#step-1 .next');
  await expect(page.locator('.gm-box')).toBeVisible();
  await page.hover('#step-1 h2');
  await settle(page);
  expect(await framedIs(page, '#step-1 .next')).toBe(true); // the open box owns the frame

  await page.fill('.gm-box textarea', 'Next reads as a submit.');
  await page.click('.gm-box-actions .gm-btn.primary');
  expect(await frameHidden(page)).toBe(true); // nothing framed until the pointer moves
  await page.hover('#step-1 h2');
  await settle(page);
  expect(await framedIs(page, '#step-1 h2')).toBe(true);
});

test('no frame with comment mode off, none over the panel, and page furniture opens nothing', async ({ page }) => {
  await openFixture(page);

  await page.hover('#step-1 .next');
  await settle(page);
  expect(await frameHidden(page)).toBe(true);

  await page.click('.gm-switch');
  await page.hover('#step-1 .next');
  await settle(page);
  expect(await frameHidden(page)).toBe(false);
  await page.hover('.gm-panel');
  await settle(page);
  expect(await frameHidden(page)).toBe(true);

  // The page margin resolves to nothing: no frame, and a click there opens no box.
  await page.mouse.move(4, 4);
  await settle(page);
  expect(await page.evaluate(() => document.elementFromPoint(4, 4).localName)).toBe('body');
  expect(await frameHidden(page)).toBe(true);
  await page.mouse.click(4, 4);
  await expect(page.locator('.gm-box')).toBeHidden();

  await page.keyboard.press('Escape'); // leaves comment mode
  expect(await frameHidden(page)).toBe(true);
});

// ---- issue #10 review fixes ------------------------------------------------

test('a selection left over from before comment mode does not hijack a click on a button', async ({ page }) => {
  await openFixture(page);
  // Select words with comment mode OFF, the way a reviewer reading the page might.
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
  expect(await page.evaluate(() => String(getSelection()))).toBe('standard plan');

  await page.click('.gm-switch');
  await page.hover('#step-1 .next');
  await settle(page);
  expect(await framedIs(page, '#step-1 .next')).toBe(true);
  await page.click('#step-1 .next');
  await expect(page.locator('.gm-box')).toBeVisible();
  // The frame promised the button; the comment lands on the button.
  expect(await page.locator('.gm-box .where').textContent()).toBe('"Next"');
  await page.fill('.gm-box textarea', 'Next reads as a submit.');
  await page.click('.gm-box-actions .gm-btn.primary');
  const c = (await page.evaluate(() => window.__gitmargin.export())).comments[0];
  expect(c.anchor.tag).toBe('button');
  expect(c.anchor.quote.exact).toBe('Next');
});

test('C opens on the framed element when focus and frame disagree', async ({ page }) => {
  await openFixture(page);
  await page.click('.gm-switch');
  await page.focus('#step-1 .next');
  await settle(page);
  expect(await framedIs(page, '#step-1 .next')).toBe(true);
  // A nudge of the trackpad moves the frame; focus stays on the button.
  await page.hover('#step-1 .fine strong');
  await settle(page);
  expect(await framedIs(page, '#step-1 .fine p')).toBe(true);
  await page.keyboard.press('c');
  await expect(page.locator('.gm-box')).toBeVisible();
  await page.fill('.gm-box textarea', 'Which order is the first?');
  await page.keyboard.press('Control+Enter');
  const c = (await page.evaluate(() => window.__gitmargin.export())).comments[0];
  expect(c.anchor.tag).toBe('p');
  expect(c.anchor.quote.exact).toBe('Delivery is free on your first order.');
});

test('a wrapper larger than the window still gets a frame inside the window', async ({ page }) => {
  await openFixture(page);
  // A screen-filling shell, the shape an AI prototype often has: fixed, overflowing every edge.
  await page.evaluate(() => {
    const wall = document.createElement('div');
    wall.id = 'wall';
    wall.textContent = 'App shell';
    wall.style.cssText = 'position:fixed;inset:-40px;background:#111;color:#eee;';
    document.body.appendChild(wall);
  });
  await page.click('.gm-switch');
  await page.mouse.move(200, 500);
  await settle(page);
  expect(await framedIs(page, '#wall')).toBe(true);
  const frame = await page.evaluate(() => {
    const f = document.getElementById('gitmargin-root').shadowRoot.querySelector('.gm-target');
    const r = f.getBoundingClientRect();
    const cs = getComputedStyle(f);
    return { hidden: f.hidden, left: r.left, top: r.top, right: r.right, bottom: r.bottom, outline: cs.outlineWidth };
  });
  const size = page.viewportSize();
  expect(frame.hidden).toBe(false);
  expect(frame.left).toBeGreaterThanOrEqual(0);
  expect(frame.top).toBeGreaterThanOrEqual(0);
  expect(frame.right).toBeLessThanOrEqual(size.width);
  expect(frame.bottom).toBeLessThanOrEqual(size.height);
  // The ground-coloured hairline outside the stroke, so the frame reads on this dark shell.
  expect(frame.outline).toBe('1px');
});
