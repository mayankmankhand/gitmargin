// Sign-in with GitHub (issue #17), in real browsers, with a real pop-up.
//
// The same flow as tests/signin.spec.js, with the second plug: the provider is
// the fake GitHub (tests/helpers/fake-github.js), which needs a cookie to log
// in and asks for approval once. Nothing in the overlay is GitHub-specific; the
// panel learns the mode from the service and names the provider it is told.
// Shared copies are attached into the test's own output folder and never
// committed.
import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { startService } from './helpers/service-server.js';
import { startFakeGithub } from './helpers/fake-github.js';

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

/** A shared, attached wizard with GitHub sign-in on, and the service and provider behind it. */
async function world(testInfo, { person = 'octo' } = {}) {
  const fake = await startFakeGithub({ person });
  const service = await startService({ github: fake });
  fake.allowRedirect(`${service.url}/auth/callback`);
  const dir = testInfo.outputPath('signin-github');
  await mkdir(dir, { recursive: true });
  const source = join(dir, 'wizard.html');
  await copyFile(resolve('fixtures/wizard.html'), source);
  const env = { GITMARGIN_SECRET: service.secret };
  const attached = await gitmargin(['attach', source, '--service', service.url], env);
  await gitmargin(['identity', attached, 'github'], env);
  const html = readFileSync(attached, 'utf8');
  const key = /<meta name="gitmargin-key" content="([^"]+)"/.exec(html)[1];
  return { fake, service, key, disk: pathToFileURL(attached).href, stored: `${service.url}/p/${key}/latest`, html };
}

async function open(page, url) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => !!window.__gitmargin);
  return errors;
}

async function openIdentity(page) {
  if (!(await page.locator('.gm-idpop').isVisible())) await page.click('.gm-id');
}

/** Press Sign in, and do in the pop-up what a person does at GitHub and on the confirm page. */
async function signIn(page) {
  await openIdentity(page);
  await expect(page.locator('.gm-identity-btn')).toBeVisible(SLOW);
  const [popup] = await Promise.all([page.context().waitForEvent('page'), page.click('.gm-identity-btn')]);
  await popup.waitForLoadState();
  if (await popup.locator('#fake-sign-in').count()) await popup.click('#fake-sign-in');
  await popup.waitForLoadState();
  if (await popup.locator('#fake-authorize').count()) await popup.click('#fake-authorize');
  await popup.waitForSelector('#gm-continue, h1');
  const shown = (await popup.locator('.code').count()) ? (await popup.locator('.code').innerText()).trim() : null;
  const panel = (await page.locator('.gm-identity-code').innerText().catch(() => '')).trim();
  if (await popup.locator('#gm-continue').count()) await popup.click('#gm-continue');
  return { popup, shown, panel };
}

async function comment(page, selector, text) {
  await page.click('.gm-switch');
  await page.click(selector);
  await expect(page.locator('.gm-box')).toBeVisible();
  await page.fill('.gm-box textarea', text);
  await page.click('.gm-box-actions .gm-btn.primary');
  await expect(page.locator('.gm-box')).toBeHidden();
  await page.click('.gm-switch');
}

for (const [where, pick] of [
  ['a file on disk', (w) => w.disk],
  ['the stored copy on the service (locked down)', (w) => w.stored],
]) {
  test(`GitHub from ${where}: sign in, Continue, and the comment carries the verified GitHub name`, async ({ browser }, testInfo) => {
    const w = await world(testInfo);
    const page = await (await browser.newContext()).newPage();
    const errors = await open(page, pick(w));

    await expect(page.locator('.gm-identity-btn')).toHaveText('Sign in with GitHub to comment', SLOW);
    const { popup, shown, panel } = await signIn(page);
    expect(shown).toMatch(/^\d\d-\d\d$/);
    expect(panel).toBe(shown);
    await expect(page.locator('.gm-identity-says')).toHaveText('Commenting as Priya Shah @octopriya · GitHub', SLOW);
    await expect.poll(() => popup.isClosed(), SLOW).toBe(true);

    await comment(page, '#step-1 h2', 'Is this the right heading?');
    await expect(page.locator('.gm-card .gm-author').first()).toHaveText('Priya Shah @octopriya · GitHub (you)', SLOW);
    const held = await w.service.query('select author_name, author_provider, author_username from comments');
    expect(held).toEqual([{ author_name: 'Priya Shah', author_provider: 'github', author_username: 'octopriya' }]);
    expect(errors).toEqual([]);
    await w.service.close();
    await w.fake.close();
  });
}

test('GitHub from a web address, two people: one signs in and comments, the other sees the GitHub name', async ({ browser }, testInfo) => {
  const w = await world(testInfo, { person: 'sam' });
  const site = http.createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(w.html));
  await new Promise((done) => site.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${site.address().port}/wizard.html`;

  const sam = await (await browser.newContext()).newPage();
  const watcher = await (await browser.newContext()).newPage();
  await open(sam, url);
  await open(watcher, url);

  // Sam has no display name on GitHub: the login stands in for it.
  await signIn(sam);
  await expect(sam.locator('.gm-identity-says')).toHaveText('Commenting as samlee @samlee · GitHub', SLOW);
  await comment(sam, '#step-1 h2', 'Seen by both?');

  await expect(watcher.locator('.gm-card .gm-author').first()).toHaveText('samlee @samlee · GitHub', SLOW);
  await openIdentity(watcher);
  await expect(watcher.locator('.gm-identity-btn')).toHaveText('Sign in with GitHub to comment');

  // Signed in is remembered on a page with a real address, and GitHub asks nothing the second time.
  await sam.reload();
  await sam.waitForFunction(() => !!window.__gitmargin);
  await expect(sam.locator('.gm-identity-says')).toHaveText('Commenting as samlee @samlee · GitHub', SLOW);
  site.close();
  await w.service.close();
  await w.fake.close();
});
