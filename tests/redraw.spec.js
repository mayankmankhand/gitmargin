// A prototype that draws every step into the same area (issue #34): React, or
// a render() that replaces innerHTML. Only the step being shown is in the page,
// so the saved address of step 2's Continue also finds step 3's Continue. A
// comment's pin belongs on its own step's element, and on anything that really
// stays on every step (the logo, the help line, a footer button shared by all
// steps), and nowhere else. On another step the comment is listed "on another
// screen", and "Copy for author" does not call it nearby or orphaned.
//
// Each test drives fixtures/redraw.html in one redraw habit at a time
// (window.redrawShape), so each of the rules in anchor.js has a test that fails
// when that rule alone is broken. Every test uses an element that repeats on
// every step: a fixture of unique labels hides the bugs that live in repeats.
import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';

const CLI = resolve('bin/gitmargin.js');

function gitmargin(args) {
  return new Promise((done, fail) => {
    const config = join(tmpdir(), `gitmargin-test-config-${process.pid}`);
    execFile(process.execPath, [CLI, ...args], { env: { ...process.env, GITMARGIN_CONFIG_DIR: config } }, (error, out, err) =>
      error ? fail(new Error(err || String(error))) : done(out.trim())
    );
  });
}

/** Attach a fixture into the test's own folder, the way an author would, and return its file:// URL. */
async function attached(testInfo, fixture = 'redraw.html') {
  const dir = testInfo.outputPath('attached');
  await mkdir(dir, { recursive: true });
  const source = join(dir, fixture);
  await copyFile(resolve('fixtures', fixture), source);
  return pathToFileURL(await gitmargin(['attach', source])).href;
}

async function open(page, url, errors = []) {
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => !!window.__gitmargin);
  return errors;
}

async function comment(page, selector, text) {
  await page.click('.gm-switch');
  await page.click(selector);
  await expect(page.locator('.gm-box')).toBeVisible();
  await page.fill('.gm-box textarea', text);
  await page.click('.gm-box-actions .gm-btn.primary');
  if (await page.locator('.gm-box-name').isVisible()) await page.click('.gm-box-actions .gm-btn.primary');
  await expect(page.locator('.gm-box')).toBeHidden();
  await page.click('.gm-switch');
}

const TITLES = ['Choose a plan', 'Your details', 'Review and pay'];

/** The step now showing, by its title, wherever the habit draws it. */
const title = (page) => page.locator('h2').first();

/**
 * Walk to step `n` (1-based) with the prototype's own Back and Continue, as a
 * reviewer does, then let the overlay lay out once more: the pins follow a page
 * change on the next animation frame, and an assertion that a pin is still
 * there would otherwise pass on the frame before it moved.
 */
async function goTo(page, n) {
  for (;;) {
    const now = TITLES.indexOf(await title(page).textContent()) + 1;
    if (now === n) break;
    await page.click(now < n ? 'button.next' : 'button.back');
    await expect(title(page)).toHaveText(TITLES[now < n ? now : now - 2]);
  }
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

/** How far the nearest pin's centre is from an element's box, in CSS pixels; 0 when it is inside. */
function pinDistanceTo(page, selector) {
  return page.evaluate((sel) => {
    const target = document.querySelector(sel);
    const pins = Array.from(document.getElementById('gitmargin-root').shadowRoot.querySelectorAll('.gm-pin'));
    if (!target || !pins.length) return 1e9;
    const r = target.getBoundingClientRect();
    return Math.min(
      ...pins.map((pin) => {
        const p = pin.getBoundingClientRect();
        const x = p.left + p.width / 2;
        const y = p.top + p.height / 2;
        return Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
      })
    );
  }, selector);
}

const copied = (page) => page.evaluate(() => window.__gitmargin.markdown());

/** On a step the comment was not made on: no pin, listed on another screen, and not called nearby or orphaned. */
async function elsewhere(page, text) {
  await expect(page.locator('.gm-pin')).toHaveCount(0);
  await expect(page.locator('.gm-card', { hasText: text }).locator('.gm-flag')).toHaveText(['on another screen']);
  const markdown = await copied(page);
  expect(markdown).not.toContain('[nearby');
  expect(markdown).not.toContain('[orphaned');
}

/** Pinned on the element, with no flag on its card. */
async function pinnedOn(page, selector, text) {
  await expect.poll(() => pinDistanceTo(page, selector)).toBeLessThan(40);
  await expect(page.locator('.gm-card', { hasText: text }).locator('.gm-flag')).toHaveCount(0);
}

test('a comment on step 2\'s Continue stays on step 2 when every step is drawn afresh, after a reload too', async ({ page }, testInfo) => {
  const errors = await open(page, await attached(testInfo));
  await goTo(page, 2);
  await comment(page, 'button.next', 'Continue should wait for the email.');
  await pinnedOn(page, 'button.next', 'Continue should wait');

  await goTo(page, 1);
  await elsewhere(page, 'Continue should wait');
  await goTo(page, 3);
  await elsewhere(page, 'Continue should wait');
  await goTo(page, 2);
  await expect(page.locator('.gm-pin')).toHaveCount(1);
  await pinnedOn(page, 'button.next', 'Continue should wait');

  // A reload starts over on step 1 with the comment read back from the browser,
  // which is also what a second reviewer sees: nothing remembers which button
  // the comment was made on, so the page alone has to say.
  await page.reload();
  await page.waitForFunction(() => !!window.__gitmargin);
  await expect(page.locator('.gm-card')).toHaveCount(1);
  await goTo(page, 1);
  await elsewhere(page, 'Continue should wait');
  expect(errors).toEqual([]);
});

for (const [habit, shape] of [
  ['the same nodes are kept with new words (React)', { nodes: 'keep' }],
  ['the step title sits in its own box', { title: 'wrapped' }],
  ['each step is tagged with data-gm-screen', { tag: true }],
]) {
  test(`a comment on step 2's Continue stays on step 2 when ${habit}`, async ({ page }, testInfo) => {
    const errors = await open(page, await attached(testInfo));
    await page.evaluate((s) => window.redrawShape(s), shape);
    await goTo(page, 2);
    await comment(page, 'button.next', 'Continue should wait for the email.');
    await pinnedOn(page, 'button.next', 'Continue should wait');
    await goTo(page, 1);
    await elsewhere(page, 'Continue should wait');
    await goTo(page, 3);
    await elsewhere(page, 'Continue should wait');
    await goTo(page, 2);
    await pinnedOn(page, 'button.next', 'Continue should wait');
    expect(errors).toEqual([]);
  });
}

test('a Continue shared by every step keeps its pin where it still says Continue, and loses it on Pay now', async ({ page }, testInfo) => {
  // One button outside the step's card, kept for every step: the same control
  // on steps 1 and 2, so it is pinned on both. On the last step it reads "Pay
  // now", which is not what the reviewer commented on.
  await open(page, await attached(testInfo));
  await page.evaluate(() => window.redrawShape({ footer: 'app' }));
  await goTo(page, 2);
  await comment(page, 'button.next', 'Continue should wait for the email.');
  await goTo(page, 1);
  await pinnedOn(page, 'button.next', 'Continue should wait');
  await goTo(page, 3);
  await expect(page.locator('button.next')).toHaveText('Pay now');
  await elsewhere(page, 'Continue should wait');
});

for (const nodes of ['replace', 'keep']) {
  test(`the logo and the help line keep their pins on every step (nodes ${nodes})`, async ({ page }, testInfo) => {
    // Guards against over-applying the rule: these are not part of any step.
    await open(page, await attached(testInfo));
    await page.evaluate((n) => window.redrawShape({ nodes: n }), nodes);
    await goTo(page, 2);
    await comment(page, '.logo', 'The logo is blurry.');
    await comment(page, '.help', 'This number is wrong.');
    for (const step of [1, 3, 2]) {
      await goTo(page, step);
      await expect(page.locator('.gm-pin')).toHaveCount(2);
      await pinnedOn(page, '.logo', 'The logo is blurry.');
      await pinnedOn(page, '.help', 'This number is wrong.');
    }
  });

  test(`a comment on step 2's own heading has no pin on step 3 (nodes ${nodes})`, async ({ page }, testInfo) => {
    // A heading names its own step, so it has no box to be judged by: it is the
    // words that say step 3's heading is not the one the reviewer commented on.
    await open(page, await attached(testInfo));
    await page.evaluate((n) => window.redrawShape({ nodes: n }), nodes);
    await goTo(page, 2);
    await comment(page, '#stage h2', 'Say whose details.');
    await goTo(page, 3);
    await elsewhere(page, 'Say whose details.');
    await goTo(page, 2);
    await pinnedOn(page, '#stage h2', 'Say whose details.');
  });
}

test('a step title drawn at the top of the page does not make the whole page one step', async ({ page }, testInfo) => {
  // The title block is a child of <body>. The box around a step's title is
  // never taken to be the page itself, so the help line below stays beside the step.
  await open(page, await attached(testInfo));
  await page.evaluate(() => window.redrawShape({ title: 'page' }));
  await goTo(page, 2);
  await comment(page, '.help', 'This number is wrong.');
  for (const step of [1, 3]) {
    await goTo(page, step);
    await pinnedOn(page, '.help', 'This number is wrong.');
  }
});

test('a comment on step 2\'s Back has no pin on a last step drawn as a dialog', async ({ page }, testInfo) => {
  // Back reads the same on every step and sits at the same address, so only
  // the dialog the last step is drawn as says its Back belongs to that step.
  await open(page, await attached(testInfo));
  await page.evaluate(() => window.redrawShape({ dialog: 'last' }));
  await goTo(page, 2);
  await comment(page, 'button.back', 'Back should keep what I typed.');
  await goTo(page, 3);
  await expect(page.locator('[role="dialog"] button.back')).toBeVisible();
  await elsewhere(page, 'Back should keep what I typed.');
});

test('on the Sony wizard, a comment on the subtitle made on step 2 keeps its pin on steps 1 and 3', async ({ page }, testInfo) => {
  // Step 2 is named by its aria-current marker, which names the page rather
  // than the subtitle; steps 1 and 3 name the subtitle by the h1 above it. A
  // name that came from the page is never judged by a box.
  await open(page, await attached(testInfo, 'onboarding.html'));
  await page.click('#step-1 .next');
  await expect(page.locator('#step-2')).toHaveClass(/active/);
  await comment(page, '.shell > .lede', 'Say which headphones.');
  const saved = await page.evaluate(() => window.__gitmargin.export().comments[0].state.screen);
  expect(saved.source).toBe('aria-current');
  await page.click('#step-2 .back');
  await expect(page.locator('#step-1')).toHaveClass(/active/);
  await pinnedOn(page, '.shell > .lede', 'Say which headphones.');
  await page.click('#step-1 .next');
  await page.click('#step-2 .next');
  await expect(page.locator('#step-3')).toHaveClass(/active/);
  await pinnedOn(page, '.shell > .lede', 'Say which headphones.');
});

test('a returned file whose comments name their screen in an older shape opens cleanly and is judged by the words', async ({ page }, testInfo) => {
  // Every build saves the screen as { name, source }, but a returned file is
  // read back as it comes. A bare name, or a name with no source, says nothing
  // about where the screen's name came from, so those comments are judged by
  // their words alone: pinned where Continue still says Continue, not on "Pay now".
  await open(page, await attached(testInfo));
  await goTo(page, 2);
  await comment(page, 'button.next', 'Bare name.');
  await comment(page, 'button.next', 'Name only.');
  const html = await page.evaluate(() => window.__gitmargin.reviewedHtml());
  // The real block is the last one, just before </body>: the inlined overlay
  // carries a lookalike of the opening tag in its own source, earlier in the page.
  const OPEN = '<script type="application/json" id="gitmargin-comments">\n';
  const start = html.lastIndexOf(OPEN) + OPEN.length;
  const end = html.indexOf('\n</script>', start);
  const batch = JSON.parse(html.slice(start, end));
  expect(batch.comments).toHaveLength(2);
  for (const c of batch.comments) {
    c.state.screen = c.intent.text === 'Bare name.' ? 'Your details' : { name: 'Your details' };
  }
  const json = JSON.stringify(batch, null, 2).replace(/</g, '\\u003c');
  const dir = testInfo.outputPath('returned');
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'redraw.reviewed.html');
  await writeFile(file, html.slice(0, start) + json + html.slice(end));

  const errors = await open(page, pathToFileURL(file).href);
  await expect(page.locator('.gm-card')).toHaveCount(2);
  await goTo(page, 1);
  await expect(page.locator('.gm-pin')).toHaveCount(2);
  await pinnedOn(page, 'button.next', 'Bare name.');
  await pinnedOn(page, 'button.next', 'Name only.');
  await goTo(page, 3);
  await expect(page.locator('.gm-pin')).toHaveCount(0);
  await expect(page.locator('.gm-card .gm-flag')).toHaveText(['on another screen', 'on another screen']);
  expect(errors).toEqual([]);
});
