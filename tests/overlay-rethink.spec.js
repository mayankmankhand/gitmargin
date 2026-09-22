// The rethought overlay (issue #21): pins with initials, the thread at the
// spot, the sheet on demand, the light/dark switch, and the rules the plan
// added: pins that stack without overlapping, a thread that flips at the
// window edge, a row that lights its pin, Unread, and open state that survives
// a rebuild. Plain pages open from file://; the Unread test runs a real
// shared page against the in-process service, like tests/shared.spec.js.
import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { startService } from './helpers/service-server.js';

const CLI = resolve('bin/gitmargin.js');
const SLOW = { timeout: 20_000 };

function gitmargin(args, env) {
  return new Promise((done, fail) => {
    const config = join(tmpdir(), `gitmargin-test-config-${process.pid}`);
    execFile(process.execPath, [CLI, ...args], { env: { ...process.env, GITMARGIN_CONFIG_DIR: config, ...env } }, (error, out, err) =>
      error ? fail(new Error(err || String(error))) : done(out.trim())
    );
  });
}

/** Attach a fixture into the test's own folder, plain or shared, and return its file:// URL. */
async function attached(testInfo, fixture, service = null) {
  const dir = testInfo.outputPath('attached');
  await mkdir(dir, { recursive: true });
  const source = join(dir, fixture);
  await copyFile(resolve('fixtures', fixture), source);
  const args = ['attach', source, ...(service ? ['--service', service.url] : [])];
  const file = await gitmargin(args, service ? { GITMARGIN_SECRET: service.secret } : {});
  return pathToFileURL(file).href;
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

async function setName(page, name) {
  await page.click('.gm-id');
  await page.fill('#gm-reviewer', name);
  await page.click('.gm-id');
}

const hostClass = (page) => page.evaluate(() => document.getElementById('gitmargin-root').className);
const rectOf = (locator) => locator.evaluate((n) => { const r = n.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

test('the overlay measures the page: light on the light fixture, dark on the dark one, with a light ring on the pins there', async ({ page }, testInfo) => {
  const errors = await open(page, await attached(testInfo, 'onboarding.html'));
  expect(await page.evaluate(() => window.__gitmargin.ui.theme())).toBe('light');
  expect(await hostClass(page)).not.toContain('gm-dark');
  await comment(page, '#step-1 h2', 'On the light page.');
  expect(await page.locator('.gm-pin').evaluate((n) => getComputedStyle(n).borderColor)).toBe('rgb(255, 255, 255)');

  errors.push(...(await open(page, await attached(testInfo, 'onboarding-dark.html'))));
  // The dark fixture keeps body white and paints its ground on a wrapper: that is the path being measured.
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(251, 251, 252)');
  expect(await page.evaluate(() => window.__gitmargin.ui.theme())).toBe('dark');
  expect(await hostClass(page)).toContain('gm-dark');
  await comment(page, '#step-1 h2', 'On the dark page.');
  expect(await page.locator('.gm-pin').evaluate((n) => getComputedStyle(n).borderColor)).toBe('rgb(244, 244, 245)');
  expect(errors).toEqual([]);
});

test('a pin carries initials on a colour that stays the same for the same name, and a grey question mark with no name', async ({ page }, testInfo) => {
  await open(page, await attached(testInfo, 'onboarding.html'));
  await comment(page, '#step-1 h2', 'Anonymous.');
  await expect(page.locator('.gm-pin .initials')).toHaveText('?');
  const grey = await page.locator('.gm-pin').evaluate((n) => n.style.getPropertyValue('--gm-author'));
  expect(grey).toBe('#6b7280');

  await setName(page, 'Priya Shah');
  await comment(page, '#step-1 p', 'Named.');
  await expect(page.locator('.gm-pin .initials')).toHaveText(['PS', 'PS']);
  const colours = await page.locator('.gm-pin').evaluateAll((pins) => pins.map((p) => p.style.getPropertyValue('--gm-author')));
  expect(colours[0]).toBe(colours[1]);
  expect(colours[0]).not.toBe('#6b7280');
  // The chip in the chrome shows the same initials.
  await expect(page.locator('.gm-id .gm-avatar')).toHaveText('PS');
});

test('the thread opens beside its element, and flips inside the window when there is no room on the right', async ({ page }, testInfo) => {
  await open(page, await attached(testInfo, 'onboarding.html'));
  await comment(page, '#step-1 h2', 'Beside me, please.');
  await page.click('.gm-pin');
  const thread = page.locator('.gm-thread');
  await expect(thread).toBeVisible();
  const heading = await rectOf(page.locator('#step-1 h2'));
  const beside = await rectOf(thread);
  expect(beside.left).toBeGreaterThanOrEqual(heading.right);
  expect(beside.right).toBeLessThanOrEqual(page.viewportSize().width);
  // The words are framed, in the accent, and the thread names the screen and the words.
  await expect(page.locator('.gm-frame:not(.gm-target)')).toHaveCount(1);
  await expect(thread.locator('.gm-thread-ctx')).toContainText('#1');
  await expect(thread.locator('.gm-thread-ctx')).toContainText('Pair your headphones');

  // A window too narrow for a card on the right: the thread stays inside it.
  await page.setViewportSize({ width: 720, height: 700 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const narrow = await rectOf(thread);
  expect(narrow.left).toBeGreaterThanOrEqual(0);
  expect(narrow.right).toBeLessThanOrEqual(720);
  expect(narrow.bottom).toBeLessThanOrEqual(700);
});

test('two comments on one element stack without overlapping, and a pin never lands on a neighbouring control', async ({ page }, testInfo) => {
  await open(page, await attached(testInfo, 'onboarding.html'));
  await comment(page, '#step-1 h2', 'First on the heading.');
  await comment(page, '#step-1 h2', 'Second on the heading.');
  await expect(page.locator('.gm-pin')).toHaveCount(2);
  const [a, b] = await Promise.all([rectOf(page.locator('.gm-pin').nth(0)), rectOf(page.locator('.gm-pin').nth(1))]);
  expect(intersects(a, b)).toBe(false);

  // The Next button has Turn on Bluetooth to its left: the pin goes above, not onto the neighbour.
  await comment(page, '#step-1 .next', 'On the Next button.');
  const pin = await rectOf(page.locator('.gm-pin').nth(2));
  const neighbour = await rectOf(page.locator('#step-1 .ghost').first());
  expect(intersects(pin, neighbour)).toBe(false);
});

test('a row in the sheet lights its pin on hover, and a click scrolls to the element and opens its thread', async ({ page }, testInfo) => {
  await open(page, await attached(testInfo, 'onboarding.html'));
  await comment(page, '#step-1 .next', 'Far below, soon.');
  await page.click('.gm-badge');
  await expect(page.locator('.gm-sheet')).toBeVisible();
  await page.hover('.gm-card');
  await expect(page.locator('.gm-pin')).toHaveClass(/is-hot/);
  await page.mouse.move(600, 600);
  await expect(page.locator('.gm-pin')).not.toHaveClass(/is-hot/);

  // Push the element below the fold, then click the row.
  await page.evaluate(() => { document.querySelector('.shell').style.paddingTop = '2400px'; window.scrollTo(0, 0); });
  await expect(page.locator('.gm-pin')).toHaveCount(0);
  await page.click('.gm-card');
  await expect(page.locator('.gm-thread')).toBeVisible();
  await expect.poll(async () => (await rectOf(page.locator('#step-1 .next'))).top).toBeLessThan(page.viewportSize().height);
  await expect(page.locator('.gm-pin')).toHaveCount(1);
});

test('a comment on another screen opens its thread docked under the chrome, with no pin to point at', async ({ page }) => {
  await open(page, pathToFileURL(resolve('fixtures/wizard.html')).href);
  await page.click('#step-1 .next');
  await comment(page, '#step-2 h2', 'About step two.');
  await page.click('#step-2 .back');
  await expect(page.locator('.gm-pin')).toHaveCount(0);
  await page.click('.gm-badge');
  await expect(page.locator('.gm-group')).toContainText('another screen');
  await page.click('.gm-card');
  const thread = page.locator('.gm-thread');
  await expect(thread).toBeVisible();
  await expect(thread.locator('.gm-flag')).toHaveText(['on another screen']);
  // Docked: it sits near the top, clear of the sheet, and Edit and Delete are still reachable.
  const at = await rectOf(thread);
  expect(at.top).toBeLessThan(120);
  expect(at.right).toBeLessThanOrEqual(page.viewportSize().width - 320);
  await expect(thread.getByRole('button', { name: 'Delete' })).toHaveCount(1);
});

test('open state lives through a rebuild: the thread and the sheet stay open, and a focused row keeps focus', async ({ page }, testInfo) => {
  await open(page, await attached(testInfo, 'onboarding.html'));
  await comment(page, '#step-1 h2', 'Stay open.');
  await page.click('.gm-badge');
  await page.click('.gm-card');
  await expect(page.locator('.gm-thread')).toBeVisible();
  await page.locator('.gm-card').focus();
  await expect(page.locator('.gm-card')).toBeFocused();

  // What the page and the sync tick do: a DOM change, and a full forced rebuild.
  await page.evaluate(() => document.querySelector('#step-1 h2').append(' '));
  await page.evaluate(() => window.__gitmargin.ui.render(true));
  await page.waitForTimeout(120);
  await expect(page.locator('.gm-thread')).toBeVisible();
  await expect(page.locator('.gm-sheet')).toBeVisible();
  await expect(page.locator('.gm-card')).toBeFocused();
});

test('Escape closes one layer at a time: the thread, then the sheet, then comment mode', async ({ page }, testInfo) => {
  await open(page, await attached(testInfo, 'onboarding.html'));
  await comment(page, '#step-1 h2', 'Layers.');
  await page.click('.gm-badge');
  await page.click('.gm-card');
  await page.click('.gm-switch');
  await expect(page.locator('.gm-thread')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.gm-thread')).toBeHidden();
  await expect(page.locator('.gm-sheet')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.gm-sheet')).toBeHidden();
  expect(await page.evaluate(() => window.__gitmargin.ui.isCommentMode())).toBe(true);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__gitmargin.ui.isCommentMode())).toBe(false);
});

test('hovering a pin previews the comment; the sheet groups by screen with this screen first', async ({ page }) => {
  await open(page, pathToFileURL(resolve('fixtures/wizard.html')).href);
  await page.click('#step-1 .next');
  await comment(page, '#step-2 h2', 'On step two.');
  await page.click('#step-2 .back');
  await comment(page, '#step-1 h2', 'On step one.');
  await page.hover('.gm-pin');
  await expect(page.locator('.gm-preview')).toBeVisible();
  await expect(page.locator('.gm-preview')).toContainText('On step one.');
  await page.mouse.move(600, 600);
  await expect(page.locator('.gm-preview')).toBeHidden();

  await page.click('.gm-badge');
  const groups = page.locator('.gm-group');
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0)).toHaveText('Your plan');
  await expect(groups.nth(1)).toContainText('another screen');
});

test('on a shared page, someone else\'s comment is unread until its thread is opened, and that is remembered', async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const service = await startService();
  try {
    const url = await attached(testInfo, 'onboarding.html', service);
    const priya = await (await browser.newContext()).newPage();
    const sam = await (await browser.newContext()).newPage();
    await open(priya, url);
    await open(sam, url);
    await setName(sam, 'Sam Lee');
    await comment(sam, '#step-1 h2', 'From Sam.');

    await expect(priya.locator('.gm-card')).toHaveCount(1, SLOW);
    await expect(priya.locator('.gm-badge .dot')).toBeVisible();
    await priya.click('.gm-badge');
    await expect(priya.locator('.gm-card .dot')).toHaveCount(1);
    await priya.click('.gm-filter[data-filter="unread"]');
    await expect(priya.locator('.gm-card')).toHaveCount(1);
    await priya.click('.gm-filter[data-filter="mine"]');
    await expect(priya.locator('.gm-card')).toHaveCount(0);
    await priya.click('.gm-filter[data-filter="all"]');

    await priya.click('.gm-card');
    await expect(priya.locator('.gm-thread')).toBeVisible();
    await expect(priya.locator('.gm-card .dot')).toHaveCount(0);
    await expect(priya.locator('.gm-badge .dot')).toBeHidden();

    // Reading is remembered in this browser.
    await priya.reload();
    await priya.waitForFunction(() => !!window.__gitmargin);
    await expect(priya.locator('.gm-card')).toHaveCount(1, SLOW);
    await expect(priya.locator('.gm-badge .dot')).toBeHidden();
    // Sam's own comment was never unread for Sam.
    await expect(sam.locator('.gm-badge .dot')).toBeHidden();
  } finally {
    await service.close();
  }
});
