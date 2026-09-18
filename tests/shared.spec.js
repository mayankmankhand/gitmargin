// Shared comments (issue #15), in real browsers.
//
// The service is the real router on an in-process Postgres, started by this
// process on a loopback port (tests/helpers/service-server.js). Shared copies
// are attached into the test's own output folder at run time: a shared copy
// carries a service address and a page key, and neither is ever committed.
import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { startService } from './helpers/service-server.js';

const CLI = resolve('bin/gitmargin.js');

/**
 * Async on purpose: the service the CLI calls runs in THIS process, and a
 * synchronous spawn would stop it from answering.
 */
function gitmargin(args, env) {
  return new Promise((done, fail) => {
    execFile(process.execPath, [CLI, ...args], { env: { ...process.env, ...env } }, (error, out, err) =>
      error ? fail(new Error(err || String(error))) : done(out.trim())
    );
  });
}

/** Copy a fixture somewhere writable and attach it, shared through `service`. */
async function attachShared(testInfo, service, fixture = 'fixtures/wizard.html') {
  const dir = testInfo.outputPath('shared');
  await mkdir(dir, { recursive: true });
  const source = join(dir, 'wizard.html');
  await copyFile(resolve(fixture), source);
  const attached = await gitmargin(['attach', source, '--service', service.url], { GITMARGIN_SECRET: service.secret });
  return { attached, url: pathToFileURL(attached).href, source };
}

async function open(page, url) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => !!window.__gitmargin);
  return errors;
}

/** Leave one comment on `selector`, the way tests/roundtrip.spec.js does. */
async function comment(page, selector, text) {
  await page.click('.gm-switch');
  await page.click(selector);
  await expect(page.locator('.gm-box')).toBeVisible();
  await page.fill('.gm-box textarea', text);
  await page.click('.gm-box-actions .gm-btn.primary');
  await page.click('.gm-switch');
}

test('a page without the sharing tags never touches the network', async ({ page }) => {
  const requests = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) requests.push(r.url());
  });
  const errors = await open(page, pathToFileURL(resolve('fixtures/wizard.html')).href);
  expect(await page.evaluate(() => window.__gitmargin.sync)).toBeNull();
  await comment(page, '#step-1 .next', 'A comment on a plain file.');
  await page.waitForTimeout(1500);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test('two people with the same file open see each other\'s comments without reloading', async ({ browser }, testInfo) => {
  const service = await startService();
  try {
    const { url } = await attachShared(testInfo, service);
    const priya = await (await browser.newContext()).newPage();
    const sam = await (await browser.newContext()).newPage();
    const errors = [...(await open(priya, url)), ...(await open(sam, url))];

    await comment(priya, '#step-1 .next', 'I expected a Back button here too.');
    await expect(priya.locator('.gm-pin')).toHaveCount(1);
    // Sam did nothing: the pin arrives on his next check-in, about five seconds.
    await expect(sam.locator('.gm-pin')).toHaveCount(1, { timeout: 12_000 });
    await expect(sam.locator('.gm-card')).toContainText('I expected a Back button here too.');

    await comment(sam, '#step-1 h2', 'This heading is vague.');
    await expect(priya.locator('.gm-pin')).toHaveCount(2, { timeout: 12_000 });
    expect(errors).toEqual([]);
  } finally {
    await service.close();
  }
});

test('a browser that refuses storage still shares: the overlay starts, and comments travel both ways', async ({ browser }, testInfo) => {
  const service = await startService();
  try {
    const { url } = await attachShared(testInfo, service);
    const refused = await browser.newContext();
    // Merely naming localStorage throws here, as it does inside a sandboxed page.
    await refused.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new Error('storage is not available');
        },
      });
    });
    const priya = await refused.newPage();
    const sam = await (await browser.newContext()).newPage();
    const errors = [...(await open(priya, url)), ...(await open(sam, url))];

    await comment(priya, '#step-1 .next', 'Written where nothing can be stored.');
    await expect(sam.locator('.gm-pin')).toHaveCount(1, { timeout: 12_000 });
    await comment(sam, '#step-1 h2', 'And one coming back.');
    await expect(priya.locator('.gm-pin')).toHaveCount(2, { timeout: 12_000 });
    expect(errors).toEqual([]);
  } finally {
    await service.close();
  }
});
