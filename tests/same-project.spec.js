// Same-project mode (issue #19), in real browsers, behind a stand-in for
// Vercel's login wall (tests/helpers/vercel-wall.js). The service runs switched
// to same-project mode; the prototype is attached through the wall with the
// automation bypass, exactly as the author does it; reviewers pass the wall's
// login and land on the prototype at the front door.
//
// The claim under test is the issue's Done when: two reviewers who passed the
// protection see each other's comments, and a request that did not pass is
// refused by the wall, never answered by the comment service.
import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { startService } from './helpers/service-server.js';
import { startVercelWall } from './helpers/vercel-wall.js';

const CLI = resolve('bin/gitmargin.js');
test.describe.configure({ timeout: 90_000 });
const SLOW = { timeout: 20_000 };

function gitmargin(args, env) {
  return new Promise((done, fail) => {
    const config = join(tmpdir(), `gitmargin-test-config-${process.pid}`);
    execFile(process.execPath, [CLI, ...args], { env: { ...process.env, GITMARGIN_CONFIG_DIR: config, ...env } }, (error, out, err) =>
      error ? fail(new Error(err || String(error))) : done(out.trim())
    );
  });
}

/** A same-project deployment behind the wall, with the wizard attached through it. */
async function world(testInfo) {
  const service = await startService({ sameProject: true });
  const wall = await startVercelWall(service.url);
  const dir = testInfo.outputPath('same-project');
  await mkdir(dir, { recursive: true });
  const source = join(dir, 'wizard.html');
  await copyFile(resolve('fixtures/wizard.html'), source);
  await gitmargin(['attach', source, '--service', wall.url], { GITMARGIN_SECRET: service.secret, GITMARGIN_VERCEL_BYPASS: wall.bypass });
  const [{ key }] = await service.query('select key from prototypes');
  return { service, wall, key, close: async () => (await wall.close(), await service.close()) };
}

/** Open an address the way a reviewer does: the wall's login first, then the front door. */
async function passAndOpen(browser, address) {
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${address}/`);
  await expect(page.locator('#wall')).toHaveText('Log in to Vercel');
  await page.click('#wall-login');
  await page.waitForFunction(() => !!window.__gitmargin);
  return { page, errors };
}

async function comment(page, selector, text, name = 'Priya') {
  await page.click('.gm-switch');
  await page.click(selector);
  await expect(page.locator('.gm-box')).toBeVisible();
  await page.fill('.gm-box textarea', text);
  await page.click('.gm-box-actions .gm-btn.primary');
  // Typed names by default: the first comment asks who is writing.
  if (await page.locator('.gm-box-name').isVisible()) {
    await page.fill('.gm-box-name input', name);
    await page.click('.gm-box-actions .gm-btn.primary');
  }
  await expect(page.locator('.gm-box')).toBeHidden();
  await page.click('.gm-switch');
}

test('two reviewers who passed the wall land on the prototype and see each other\'s comments', async ({ browser }, testInfo) => {
  const w = await world(testInfo);
  const a = await passAndOpen(browser, w.wall.url);
  const b = await passAndOpen(browser, w.wall.url);
  // The front door took both to the prototype's own page, served as the site's page.
  expect(new URL(a.page.url()).pathname).toBe(`/p/${w.key}/latest`);

  await comment(a.page, '#step-1 h2', 'Seen behind the wall?');
  await expect.poll(async () => (await w.service.query('select count(*)::int as n from comments'))[0].n, SLOW).toBe(1);
  await expect.poll(() => b.page.evaluate(() => window.__gitmargin.export().comments.map((c) => c.intent.text)), SLOW).toEqual(['Seen behind the wall?']);

  // Every call the pages made went through the wall with its login, none with the bypass.
  const api = w.wall.seen.filter((c) => c.path.startsWith('/api/p/'));
  expect(api.length).toBeGreaterThan(0);
  expect(api.every((c) => c.passed && !c.bypassHeader)).toBe(true);
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  await w.close();
});

test('without passing the wall there is no prototype and no comment route, only the wall', async ({ browser }, testInfo) => {
  const w = await world(testInfo);
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(`${w.wall.url}/p/${w.key}/latest`);
  await expect(stranger.locator('#wall')).toHaveText('Log in to Vercel');
  expect(await stranger.evaluate(() => typeof window.__gitmargin)).toBe('undefined');

  // A bare request, and the browser's pre-flight check, get the wall's redirect, not the service.
  for (const [method, path] of [['GET', `/api/p/${w.key}/comments`], ['GET', '/'], ['OPTIONS', `/api/p/${w.key}/comments`]]) {
    const answer = await fetch(`${w.wall.url}${path}`, { method, redirect: 'manual' });
    expect(answer.status, `${method} ${path}`).toBe(302);
    expect(answer.headers.get('location')).toMatch(/^\/sso-api\?next=/);
  }
  const reached = w.wall.seen.filter((c) => !c.passed && !c.bypassed && c.path.startsWith('/api/'));
  expect(reached.length).toBeGreaterThan(0); // the wall saw them, and forwarded none
  await w.close();
});

test('a page opened on the deployment\'s second address talks to that address, where its login is', async ({ browser }, testInfo) => {
  const w = await world(testInfo);
  // The attached page names the first address; this reviewer only ever passes the second.
  const a = await passAndOpen(browser, w.wall.otherUrl);
  expect(new URL(a.page.url()).origin).toBe(w.wall.otherUrl);
  await comment(a.page, '#step-1 h2', 'Written on the second address.');
  await expect.poll(async () => (await w.service.query('select count(*)::int as n from comments'))[0].n, SLOW).toBe(1);
  const api = w.wall.seen.filter((c) => c.path.startsWith('/api/p/'));
  expect(api.every((c) => c.host === new URL(w.wall.otherUrl).host)).toBe(true);
  expect(a.errors).toEqual([]);
  await w.close();
});

test('the address rule reads the document\'s origin: a locked-down stored copy keeps the address in the page (review of #19, R2)', async ({ browser }, testInfo) => {
  for (const sameProject of [false, true]) {
    const service = await startService({ sameProject });
    const port = new URL(service.url).port;
    const dir = testInfo.outputPath(`address-rule-${sameProject}`);
    await mkdir(dir, { recursive: true });
    const source = join(dir, 'wizard.html');
    await copyFile(resolve('fixtures/wizard.html'), source);
    // The page is attached naming one address of the service and opened at another.
    await gitmargin(['attach', source, '--service', `http://localhost:${port}`], { GITMARGIN_SECRET: service.secret });
    const [{ key }] = await service.query('select key from prototypes');
    const page = await (await browser.newContext()).newPage();
    await page.goto(`http://127.0.0.1:${port}/p/${key}/latest`);
    await page.waitForFunction(() => !!window.__gitmargin);
    const used = await page.evaluate(() => window.__gitmargin.sync.pageUrl('v1-aaaaaa'));
    // Default mode serves a sandboxed copy: it keeps the address written in it.
    // Same-project mode serves the site's own page: it talks to where it was opened.
    expect(new URL(used).hostname, `sameProject ${sameProject}`).toBe(sameProject ? '127.0.0.1' : 'localhost');
    await service.close();
  }
});
