// A prototype with more than one screen (issue #24). A comment remembers the
// element it was left on and the screen it was on, and its pin belongs on that
// element, or on a lookalike on that same screen, and nowhere else. On any other
// screen the comment is listed "on another screen", and "Copy for author" does
// not call it nearby or orphaned just because the reviewer is standing elsewhere.
//
// The bug this guards was found on a person's first look: a comment on step 1's
// Next button followed them to the Next button of every later step. So these
// tests drive the Sony fixture, where every step repeats the same Next and Back.
//
// The second half is the overlay's own look on a page that changes under it:
// a prototype that turns dark after load, fades to dark, or follows the
// system's light/dark setting gets the dark look without waiting for a resize,
// and the measurement reads the page under the overlay's own sheet.
import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
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
async function attached(testInfo, fixture = 'onboarding.html') {
  const dir = testInfo.outputPath('attached');
  await mkdir(dir, { recursive: true });
  const source = join(dir, fixture);
  await copyFile(resolve('fixtures', fixture), source);
  return pathToFileURL(await gitmargin(['attach', source])).href;
}

async function open(page, url) {
  const errors = [];
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

/** Click a step's own Next with comment mode off, as a reviewer walks the prototype. */
async function next(page, step) {
  await page.click(`#step-${step} .next`);
  await expect(page.locator(`#step-${step}`)).not.toHaveClass(/active/);
}

/** How far the only pin's centre is from an element's box, in CSS pixels; 0 when it is inside. */
function pinDistanceTo(page, selector) {
  return page.evaluate((sel) => {
    const pin = document.getElementById('gitmargin-root').shadowRoot.querySelector('.gm-pin');
    const target = document.querySelector(sel);
    if (!pin || !target) return 1e9;
    const p = pin.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    const x = p.left + p.width / 2;
    const y = p.top + p.height / 2;
    return Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
  }, selector);
}

const copied = (page) => page.evaluate(() => window.__gitmargin.markdown());

test('a comment on a button every step repeats stays on its own step, and is listed on another screen elsewhere', async ({ page }, testInfo) => {
  const errors = await open(page, await attached(testInfo));
  await comment(page, '#step-1 .next', 'Next should wait until both boxes are ticked.');
  await expect(page.locator('.gm-pin')).toHaveCount(1);

  for (const step of [2, 3, 4, 5]) {
    await next(page, step - 1);
    await expect(page.locator(`#step-${step}`)).toHaveClass(/active/);
    // Every one of these steps has its own Next; none of them is the one the comment was left on.
    await expect(page.locator('.gm-pin')).toHaveCount(0);
    await expect(page.locator('.gm-card .gm-flag')).toHaveText(['on another screen']);
    const text = await copied(page);
    expect(text).not.toContain('[nearby');
    expect(text).not.toContain('[orphaned');
  }

  // Back on step 1, the pin is where it was left.
  for (const step of [5, 4, 3, 2]) await page.click(`#step-${step} .back`);
  await expect(page.locator('#step-1')).toHaveClass(/active/);
  await expect(page.locator('.gm-pin')).toHaveCount(1);
  expect(await pinDistanceTo(page, '#step-1 .next')).toBeLessThan(40);
  await expect(page.locator('.gm-card .gm-flag')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('when every step carries the same screen name, the saved element still keeps the comment on its own step', async ({ page }, testInfo) => {
  // Guards the first rule on its own: here the screen rule cannot tell the steps
  // apart, so only the saved element, found on its hidden step, keeps the
  // comment off the next step's Next. A prototype whose steps share one heading does this.
  await open(page, await attached(testInfo));
  await page.evaluate(() => document.querySelectorAll('.step').forEach((s) => s.setAttribute('data-gm-screen', 'Setup')));
  await comment(page, '#step-1 .next', 'Next should wait until both boxes are ticked.');
  await next(page, 1);
  await expect(page.locator('.gm-pin')).toHaveCount(0);
  await expect(page.locator('.gm-card .gm-flag')).toHaveText(['on another screen']);
});

test('on a prototype that builds only the current step, a comment is not pinned to the lookalike that replaced its element', async ({ page }, testInfo) => {
  const errors = await open(page, await attached(testInfo));
  await comment(page, '#step-1 .next', 'Made on step 1.');
  await next(page, 1);
  await comment(page, '#step-2 .next', 'Made on step 2.');

  // Behave like a prototype that keeps only the screen being shown.
  await page.evaluate(() => document.querySelectorAll('.step:not(.active)').forEach((s) => s.remove()));

  // One pin, and it is step 2's own comment; step 1's is on another screen, not "nearby".
  await expect(page.locator('.gm-pin')).toHaveCount(1);
  const first = page.locator('.gm-card', { hasText: 'Made on step 1.' });
  await expect(first.locator('.gm-flag')).toHaveText(['on another screen']);
  await expect(page.locator('.gm-card', { hasText: 'Made on step 2.' }).locator('.gm-flag')).toHaveCount(0);
  const line = (await copied(page)).split('\n').find((l) => l.startsWith('1. '));
  expect(line).toBeTruthy();
  expect(line).not.toMatch(/\[(nearby|orphaned)/);

  // Its row still opens its thread, docked under the chrome with no pin to point at.
  await page.click('.gm-badge');
  await first.click();
  const thread = page.locator('.gm-thread');
  await expect(thread).toBeVisible();
  await expect(thread.locator('.gm-flag')).toHaveText(['on another screen']);
  expect(await thread.evaluate((n) => n.getBoundingClientRect().top)).toBeLessThan(120);
  expect(errors).toEqual([]);
});

test('the same element on every step keeps its pin on every step', async ({ page }, testInfo) => {
  // Guards against over-applying the screen rule: the header is the element
  // itself on every step, not a lookalike, even though each step names itself differently.
  await open(page, await attached(testInfo));
  await comment(page, '.shell > h1', 'The product name is too small.');
  for (const step of [1, 2]) {
    await expect(page.locator('.gm-pin')).toHaveCount(1);
    await next(page, step);
  }
  await expect(page.locator('#step-3')).toHaveClass(/active/);
  await expect(page.locator('.gm-pin')).toHaveCount(1);
  expect(await pinDistanceTo(page, '.shell > h1')).toBeLessThan(40);
  await expect(page.locator('.gm-card .gm-flag')).toHaveCount(0);
});

test('when the address is lost, the words around the quote pick between lookalikes on the same screen', async ({ page }, testInfo) => {
  await open(page, await attached(testInfo));
  await comment(page, '#step-1 .next', 'Next should wait until both boxes are ticked.');
  await page.evaluate(() => {
    // The saved address stops finding the real button, and a second Next
    // appears on the same screen, earlier in the page, with other neighbours.
    document.querySelector('#step-1 .next').classList.replace('next', 'renamed');
    const decoy = document.createElement('div');
    decoy.id = 'decoy';
    decoy.innerHTML = '<button type="button">Next</button>';
    document.querySelector('#step-1').prepend(decoy);
  });
  await expect(page.locator('.gm-pin')).toHaveCount(1);
  // The real one sits next to "Turn on Bluetooth", which is the prefix the comment saved.
  await expect.poll(() => pinDistanceTo(page, '#step-1 .renamed')).toBeLessThan(40);
  expect(await pinDistanceTo(page, '#decoy button')).toBeGreaterThan(100);
  await expect(page.locator('.gm-card .gm-flag')).toHaveText(['nearby']);
});

test('a hidden element that took over the address but not the words does not send the comment to another screen', async ({ page }, testInfo) => {
  // Guards the text check on the saved address: only a hidden element that
  // still carries the quoted words is the comment's own element.
  await open(page, await attached(testInfo));
  await comment(page, '#step-1 .next', 'Next should wait until both boxes are ticked.');
  await page.evaluate(() => {
    const step = document.querySelector('#step-1');
    const moved = document.createElement('p');
    moved.id = 'moved';
    moved.append(step.querySelector('.next'));
    step.append(moved);
    const stale = document.createElement('div');
    stale.hidden = true;
    stale.innerHTML = '<button class="next">Later</button>';
    step.append(stale);
  });
  await expect(page.locator('.gm-pin')).toHaveCount(1);
  await expect.poll(() => pinDistanceTo(page, '#moved .next')).toBeLessThan(40);
  await expect(page.locator('.gm-card .gm-flag')).toHaveText(['nearby']);
});

// ---- the look follows the page ---------------------------------------------

const theme = (page) => page.evaluate(() => window.__gitmargin.ui.theme());
const NIGHT = 'body.night { background: #0e0e11; color: #e6e6ea; }';

test('a light prototype that turns dark after load gets the dark look at once, switched exactly once', async ({ page }, testInfo) => {
  await open(page, await attached(testInfo));
  expect(await theme(page)).toBe('light');
  await page.addStyleTag({ content: NIGHT });
  // Count the host's class changes from here on: one switch, not a flicker or a loop.
  await page.evaluate(() => {
    window.__switches = 0;
    new MutationObserver((records) => {
      window.__switches += records.length;
    }).observe(document.getElementById('gitmargin-root'), { attributes: true, attributeFilter: ['class'] });
  });
  // The prototype moves to a dark screen: a class on body, no resize, no scroll.
  await page.evaluate(() => document.body.classList.add('night'));
  await expect.poll(() => theme(page), { timeout: 3000 }).toBe('dark');
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.__switches)).toBe(1);
  await page.evaluate(() => document.body.classList.remove('night'));
  await expect.poll(() => theme(page), { timeout: 3000 }).toBe('light');
});

test('a page that fades to dark gets the dark look once the fade has finished', async ({ page }, testInfo) => {
  // Measured when the class lands, a fade still reads light; the end of the fade is the moment to look again.
  await open(page, await attached(testInfo));
  await page.addStyleTag({ content: `body { transition: background-color 300ms linear; } ${NIGHT}` });
  await page.evaluate(() => document.body.classList.add('night'));
  await expect.poll(() => theme(page), { timeout: 3000 }).toBe('dark');
});

test('a page that animates to dark gets the dark look once the animation has finished', async ({ page }, testInfo) => {
  await open(page, await attached(testInfo));
  await page.addStyleTag({
    content: '@keyframes to-night { to { background-color: #0e0e11; } } body.night { animation: to-night 300ms linear forwards; }',
  });
  await page.evaluate(() => document.body.classList.add('night'));
  await expect.poll(() => theme(page), { timeout: 3000 }).toBe('dark');
});

test('a page that follows the system setting gets the dark look when the system turns dark', async ({ page }, testInfo) => {
  // The page changes without a single change to its content, so only the setting itself can say so.
  await page.emulateMedia({ colorScheme: 'light' });
  await open(page, await attached(testInfo));
  await page.addStyleTag({ content: '@media (prefers-color-scheme: dark) { body { background: #0e0e11; color: #e6e6ea; } }' });
  expect(await theme(page)).toBe('light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => theme(page), { timeout: 3000 }).toBe('dark');
});

test('with the sheet over the middle of a narrow window, a dark page still reads as dark', async ({ page }, testInfo) => {
  // The dark fixture paints its ground on a wrapper and leaves body light, so
  // measuring body instead of the page under the sheet reads it as light.
  await page.setViewportSize({ width: 600, height: 800 });
  await open(page, await attached(testInfo, 'onboarding-dark.html'));
  expect(await theme(page)).toBe('dark');
  await page.evaluate(() => window.__gitmargin.ui.openPanel());
  await expect(page.locator('.gm-sheet')).toBeVisible();
  expect(await page.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight / 2).id)).toBe('gitmargin-root');
  await page.setViewportSize({ width: 601, height: 800 }); // a resize measures again
  await page.waitForTimeout(300);
  expect(await theme(page)).toBe('dark');
});
