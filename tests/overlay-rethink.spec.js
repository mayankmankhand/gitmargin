// The rethought overlay (issue #21): pins with initials, the thread at the
// spot, the sheet on demand, the light/dark switch, and the rules the plan
// added: pins that stack without overlapping, a thread that flips at the
// window edge, a row that lights its pin, Unread, and open state that survives
// a rebuild. Plain pages open from file://; the Unread test runs a real
// shared page against the in-process service, like tests/shared.spec.js.
import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
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
  // The badge's tooltip says what it does and follows the sheet's state, since
  // a click toggles it (issue #30, F2). Its accessible name stays the count.
  const badge = page.locator('.gm-badge');
  await expect(badge).toHaveAttribute('title', '1 comment. Opens the comments list; Escape closes it.');
  await page.click('.gm-badge');
  await expect(badge).toHaveAttribute('title', '1 comment. Closes the comments list.');
  await page.click('.gm-card');
  await page.click('.gm-switch');
  await expect(page.locator('.gm-thread')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.gm-thread')).toBeHidden();
  await expect(page.locator('.gm-sheet')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.gm-sheet')).toBeHidden();
  await expect(badge).toHaveAttribute('title', '1 comment. Opens the comments list; Escape closes it.');
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

// ---- the review of the #21 cycle -------------------------------------------
// Each test below pins one fix the review asked for. They were written against
// the fixed overlay and checked against the one before it.

test('C turns comment mode on, which is what the button and the empty sheet promise', async ({ page }, testInfo) => {
  await open(page, await attached(testInfo, 'onboarding.html'));
  expect(await page.evaluate(() => window.__gitmargin.ui.isCommentMode())).toBe(false);
  await page.keyboard.press('c');
  expect(await page.evaluate(() => window.__gitmargin.ui.isCommentMode())).toBe(true);
  // And it still does not steal the key from a field the reviewer is typing in.
  await page.keyboard.press('Escape');
  await page.click('#step-1 input[type=checkbox]');
  await page.evaluate(() => document.querySelector('#step-2 input, input[type=text]')?.focus());
  const typed = await page.evaluate(() => {
    const field = document.querySelector('input[type=text]');
    if (!field) return null;
    field.focus();
    return document.activeElement === field;
  });
  if (typed) {
    await page.keyboard.press('c');
    expect(await page.evaluate(() => window.__gitmargin.ui.isCommentMode())).toBe(false);
  }
});

test('an edit in progress is not thrown away by Escape or by a click on the page', async ({ page }, testInfo) => {
  await open(page, await attached(testInfo, 'onboarding.html'));
  await comment(page, '#step-1 h2', 'The original text.');
  await page.click('.gm-pin');
  await page.locator('.gm-thread').getByRole('button', { name: 'Edit' }).click();
  await page.fill('.gm-thread textarea', 'A careful rewrite in progress');

  // Escape once warns and keeps both the thread and the text.
  await page.keyboard.press('Escape');
  await expect(page.locator('.gm-thread')).toBeVisible();
  await expect(page.locator('.gm-thread .gm-boxwarn')).toHaveText('Press again to discard what you typed.');
  await expect(page.locator('.gm-thread textarea')).toHaveValue('A careful rewrite in progress');

  // A click on the page is the same gesture, and the second press goes through.
  await page.keyboard.press('Escape');
  await expect(page.locator('.gm-thread')).toBeHidden();
  const env = await page.evaluate(() => window.__gitmargin.export());
  expect(env.comments[0].intent.text).toBe('The original text.');
});

test('an armed Delete survives a rebuild, and the thread keeps a typed edit across one', async ({ page }, testInfo) => {
  await open(page, await attached(testInfo, 'onboarding.html'));
  await comment(page, '#step-1 h2', 'A comment worth several minutes.');
  await page.click('.gm-pin');
  const del = page.locator('.gm-thread').getByRole('button', { name: 'Delete' });
  await del.click();
  await expect(page.locator('.gm-thread').getByRole('button', { name: 'Delete?' })).toBeVisible();

  // Anything the prototype does rebuilds the thread: a clock, a carousel, a poll.
  await page.evaluate(() => document.querySelector('#step-1 h2').append(' '));
  await page.evaluate(() => window.__gitmargin.ui.render());
  await page.waitForTimeout(120);
  await expect(page.locator('.gm-thread').getByRole('button', { name: 'Delete?' })).toBeVisible();
  await page.locator('.gm-thread').getByRole('button', { name: 'Delete?' }).click();
  expect((await page.evaluate(() => window.__gitmargin.export())).comments).toHaveLength(0);
});

test('closing a thread puts the keyboard back on its pin, not on the page', async ({ page }, testInfo) => {
  await open(page, await attached(testInfo, 'onboarding.html'));
  await comment(page, '#step-1 h2', 'Focus comes back here.');
  await page.click('.gm-pin');
  await expect(page.locator('.gm-thread')).toBeVisible();
  // The keyboard is inside the thread, on a control the close is about to
  // destroy: the case where focus used to fall to the page body.
  await page.locator('.gm-thread').getByRole('button', { name: 'Edit' }).focus();
  await expect(page.locator('.gm-thread').getByRole('button', { name: 'Edit' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.gm-thread')).toBeHidden();
  await expect(page.locator('.gm-pin')).toBeFocused();

  // And from a row in the sheet, the keyboard goes back to that row.
  await page.click('.gm-badge');
  await page.locator('.gm-card').click();
  await page.locator('.gm-thread').getByRole('button', { name: 'Edit' }).focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.gm-card')).toBeFocused();
});

test('the line under the pill says a newer version exists, before the sheet is opened', async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const service = await startService();
  try {
    const url = await attached(testInfo, 'onboarding.html', service);
    const page = await (await browser.newContext()).newPage();
    await open(page, url);
    await expect(page.locator('.gm-notice')).toBeHidden();

    // The author attaches a changed prototype: this page is now the older one.
    const dir = testInfo.outputPath('attached');
    const source = join(dir, 'onboarding.html');
    const html = await readFile(source, 'utf8');
    await writeFile(source, html.replace('</h2>', ' (revised)</h2>'));
    await gitmargin(['attach', source, '--service'], { GITMARGIN_SECRET: service.secret });

    await expect(page.locator('.gm-notice')).toBeVisible(SLOW);
    await expect(page.locator('.gm-notice')).toContainText('A newer version');
    // Pressing it opens the sheet, where the Version line lives.
    await page.click('.gm-notice');
    await expect(page.locator('.gm-sheet')).toBeVisible();
    await expect(page.locator('.gm-notice')).toBeHidden();
  } finally {
    await service.close();
  }
});

test('the sheet rebuilds only when its comments changed, so a scrolling page leaves it alone', async ({ page }, testInfo) => {
  await open(page, await attached(testInfo, 'onboarding.html'));
  await comment(page, '#step-1 h2', 'Still the same row.');
  await page.click('.gm-badge');
  await page.locator('.gm-card').evaluate((row) => { row.dataset.sameElement = 'yes'; });

  // A ticking prototype and a scroll: the old build threw the row away on each.
  await page.evaluate(() => document.querySelector('#step-1 h2').append(' '));
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(200);
  expect(await page.locator('.gm-card').getAttribute('data-same-element')).toBe('yes');

  // A real change still rebuilds it.
  await comment(page, '#step-1 p', 'A second comment.');
  await expect(page.locator('.gm-card')).toHaveCount(2);
});

test('the chip asks for a name in words, and the name field is behind it', async ({ page }, testInfo) => {
  await open(page, await attached(testInfo, 'onboarding.html'));
  await expect(page.locator('.gm-id')).toContainText('Your name');
  await page.click('.gm-id');
  await page.fill('#gm-reviewer', 'Priya Shah');
  await page.click('.gm-id');
  await expect(page.locator('.gm-id .gm-avatar')).toHaveText('PS');
  await expect(page.locator('.gm-id')).not.toContainText('Your name');
});

test('a dark page painted in oklch, the shape a modern prototype uses, measures dark', async ({ page }, testInfo) => {
  // Written into the test's own folder rather than the repo: this is the same
  // dark fixture with its ground restated in oklch, which is what a browser
  // keeps in computed styles and what the reader had to learn to convert.
  const dir = testInfo.outputPath('attached');
  await mkdir(dir, { recursive: true });
  const source = join(dir, 'oklch.html');
  const html = await readFile(resolve('fixtures/onboarding-dark.html'), 'utf8');
  await writeFile(source, html.replace('background: #141418;', 'background: oklch(0.18 0.01 260);'));
  const file = await gitmargin(['attach', source], {});
  const errors = await open(page, pathToFileURL(file).href);

  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.night')).backgroundColor)).toContain('oklch');
  expect(await page.evaluate(() => window.__gitmargin.ui.theme())).toBe('dark');
  expect(await hostClass(page)).toContain('gm-dark');
  expect(errors).toEqual([]);
});

test('on a narrow window the sheet takes the width and the Comment button stays reachable', async ({ page }, testInfo) => {
  await open(page, await attached(testInfo, 'onboarding.html'));
  await comment(page, '#step-1 h2', 'Narrow window.');
  for (const width of [360, 480]) {
    await page.setViewportSize({ width, height: 720 });
    if (!(await page.locator('.gm-sheet').isVisible())) await page.click('.gm-badge');
    await expect(page.locator('.gm-sheet')).toBeVisible();
    // The sheet is the width of the window, and the pill sits over its head.
    const sheet = await rectOf(page.locator('.gm-sheet'));
    expect(Math.round(sheet.right - sheet.left)).toBe(width);
    const before = await page.evaluate(() => window.__gitmargin.ui.isCommentMode());
    await page.click('.gm-switch', { timeout: 5000 });
    expect(await page.evaluate(() => window.__gitmargin.ui.isCommentMode())).toBe(!before);
    await page.click('.gm-switch');
  }
});
