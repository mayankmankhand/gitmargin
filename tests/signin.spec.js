// Sign-in (issue #18), in real browsers, with a real pop-up.
//
// The service is the real router on an in-process Postgres; the provider is the
// fake GitLab (tests/helpers/fake-gitlab.js), which needs a cookie to log in and
// cuts the pop-up's link to its opener the way gitlab.com does. Shared copies
// are attached into the test's own output folder and never committed.
//
// What this cannot show: Playwright switches the pop-up blocker off, so "opens
// from a real click with the blocker on" was checked by hand in real Chrome
// against the real gitlab.com (plan step 3). The blocked case is tested here by
// making `window.open` return nothing.
import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { startService } from './helpers/service-server.js';
import { startFakeGitlab } from './helpers/fake-gitlab.js';

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

/** A shared, attached wizard with sign-in on, and the service and provider behind it. */
async function world(testInfo, { person = 'priya', members = 'gitmargin-test', read = 'open' } = {}) {
  const fake = await startFakeGitlab({ person });
  const service = await startService({ gitlab: fake });
  fake.allowRedirect(`${service.url}/auth/callback`);
  const dir = testInfo.outputPath('signin');
  await mkdir(dir, { recursive: true });
  const source = join(dir, 'wizard.html');
  await copyFile(resolve('fixtures/wizard.html'), source);
  const env = { GITMARGIN_SECRET: service.secret };
  const attached = await gitmargin(['attach', source, '--service', service.url], env);
  if (members !== false) await gitmargin(['identity', attached, 'gitlab', '--members', members, '--read', read], env);
  const html = readFileSync(attached, 'utf8');
  const key = /<meta name="gitmargin-key" content="([^"]+)"/.exec(html)[1];
  const version = /<meta name="gitmargin-version" content="([^"]+)"/.exec(html)[1];
  return { fake, service, attached, key, version, env, disk: pathToFileURL(attached).href, stored: `${service.url}/p/${key}/latest`, html };
}

async function open(page, url) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => !!window.__gitmargin);
  return errors;
}

/** Press Sign in, and do in the pop-up what a person does. Returns the code the confirm page showed. */
async function signIn(page, { press = '#gm-continue' } = {}) {
  await expect(page.locator('.gm-identity-btn')).toBeVisible(SLOW);
  const [popup] = await Promise.all([page.context().waitForEvent('page'), page.click('.gm-identity-btn')]);
  await popup.waitForLoadState();
  if (await popup.locator('#fake-sign-in').count()) await popup.click('#fake-sign-in');
  await popup.waitForLoadState();
  if (await popup.locator('#fake-authorize').count()) await popup.click('#fake-authorize');
  await popup.waitForSelector(`${press}, h1`);
  const shown = (await popup.locator('.code').count()) ? (await popup.locator('.code').innerText()).trim() : null;
  const panel = await page.locator('.gm-identity-code').innerText().catch(() => '');
  if (await popup.locator(press).count()) await popup.click(press);
  return { popup, shown, panel: panel.trim() };
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
  test(`from ${where}: sign in, Continue, and the comment carries the verified name`, async ({ browser }, testInfo) => {
    const w = await world(testInfo);
    const page = await (await browser.newContext()).newPage();
    const errors = await open(page, pick(w));

    await expect(page.locator('.gm-who')).toBeHidden();
    await expect(page.locator('.gm-identity-btn')).toHaveText('Sign in with GitLab to comment', SLOW);

    const { popup, shown, panel } = await signIn(page);
    expect(shown).toMatch(/^\d\d-\d\d$/);
    expect(panel).toBe(shown);
    await expect(page.locator('.gm-identity-says')).toHaveText('Commenting as Priya Shah @priya · GitLab', SLOW);
    await expect.poll(() => popup.isClosed(), SLOW).toBe(true);

    await comment(page, '#step-1 h2', 'Is this the right heading?');
    await expect(page.locator('.gm-card .gm-author').first()).toHaveText('Priya Shah @priya · GitLab (you)', SLOW);
    const held = await w.service.query('select author_name, author_provider from comments');
    expect(held).toEqual([{ author_name: 'Priya Shah', author_provider: 'gitlab' }]);
    expect(errors).toEqual([]);
    await w.service.close();
    await w.fake.close();
  });
}

test('from a web address, two people: one signs in and comments, the other sees the verified name', async ({ browser }, testInfo) => {
  const w = await world(testInfo);
  const site = http.createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(w.html));
  await new Promise((done) => site.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${site.address().port}/wizard.html`;

  const priya = await (await browser.newContext()).newPage();
  const watcher = await (await browser.newContext()).newPage();
  await open(priya, url);
  await open(watcher, url);

  await signIn(priya);
  await expect(priya.locator('.gm-identity-says')).toHaveText('Commenting as Priya Shah @priya · GitLab', SLOW);
  await comment(priya, '#step-1 h2', 'Seen by both?');

  await expect(watcher.locator('.gm-card .gm-author').first()).toHaveText('Priya Shah @priya · GitLab', SLOW);
  await expect(watcher.locator('.gm-identity-btn')).toBeVisible();

  // Signed in is remembered on a page with a real address: a reload asks for nothing.
  await priya.reload();
  await priya.waitForFunction(() => !!window.__gitmargin);
  await expect(priya.locator('.gm-identity-says')).toHaveText('Commenting as Priya Shah @priya · GitLab', SLOW);

  await priya.click('.gm-identity-quiet');
  await expect(priya.locator('.gm-identity-btn')).toBeVisible(SLOW);
  site.close();
  await w.service.close();
  await w.fake.close();
});

test('a comment written signed out is kept, says so, and goes when the person signs in', async ({ browser }, testInfo) => {
  const w = await world(testInfo);
  const page = await (await browser.newContext()).newPage();
  await open(page, w.disk);
  await expect(page.locator('.gm-identity-btn')).toBeVisible(SLOW);
  await comment(page, '#step-1 h2', 'Typed before signing in.');
  await expect(page.locator('.gm-identity-btn')).toHaveText('Sign in with GitLab to send 1 comment', SLOW);
  expect(await w.service.query('select 1 from comments')).toEqual([]);

  await signIn(page);
  await expect.poll(async () => (await w.service.query('select author_name from comments')).map((r) => r.author_name), SLOW).toEqual(['Priya Shah']);
  await w.service.close();
  await w.fake.close();
});

test('someone outside the group is told so, and Cancel on the confirm page grants nothing', async ({ browser }, testInfo) => {
  const outsider = await world(testInfo, { person: 'sam' });
  const page = await (await browser.newContext()).newPage();
  await open(page, outsider.disk);
  await signIn(page, { press: '#never-there' });
  // The verdict comes first, then who, then what to do (review of #18, R3 and R4).
  await expect(page.locator('.gm-identity-says')).toContainText('Your account is not in gitmargin-test', SLOW);
  await expect(page.locator('.gm-identity-says')).toContainText('signed in to GitLab as Sam Lee');
  await expect(page.locator('.gm-identity-says')).toContainText('sign out of GitLab');
  await expect(page.locator('.gm-identity-btn')).toHaveText('Sign in with GitLab again');
  await outsider.service.close();
  await outsider.fake.close();

  const w = await world(testInfo);
  const second = await (await browser.newContext()).newPage();
  await open(second, w.disk);
  await signIn(second, { press: '#gm-cancel' });
  // After Cancel the panel keeps asking for up to 20 s, since an unknown code can also mean a slow pop-up (R20).
  await expect(second.locator('.gm-identity-says')).toHaveText('Sign-in did not finish.', { timeout: 30_000 });
  expect(await w.service.query('select 1 from sessions')).toEqual([]);
  await w.service.close();
  await w.fake.close();
});

test('a blocked pop-up says what to do', async ({ browser }, testInfo) => {
  const w = await world(testInfo);
  const page = await (await browser.newContext()).newPage();
  await page.addInitScript(() => {
    window.open = () => null; // what a pop-up blocker does
  });
  await open(page, w.disk);
  await page.click('.gm-identity-btn');
  await expect(page.locator('.gm-identity-says')).toHaveText('Your browser blocked the sign-in window. Allow pop-ups for this page, then try again.');
  await expect(page.locator('.gm-identity-btn')).toHaveText('Sign in with GitLab');
  await w.service.close();
  await w.fake.close();
});

test('the identity line is reachable and operable by keyboard alone', async ({ browser }, testInfo) => {
  const w = await world(testInfo);
  const page = await (await browser.newContext()).newPage();
  await open(page, w.disk);
  await expect(page.locator('.gm-identity-btn')).toBeVisible(SLOW);
  await page.locator('.gm-identity-btn').focus();
  const [popup] = await Promise.all([page.context().waitForEvent('page'), page.keyboard.press('Enter')]);
  // Sign in became Cancel under the person's hands; focus must not fall to the page.
  await expect(page.locator('.gm-identity-quiet')).toBeFocused();
  // The live region wraps the sentence and the code together (review of #18, R16).
  await expect(page.locator('.gm-identity-live')).toHaveAttribute('role', 'status');
  await expect(page.locator('.gm-identity-live .gm-identity-code')).toBeVisible();
  await popup.close();
  await page.keyboard.press('Enter');
  await expect(page.locator('.gm-identity-btn')).toBeFocused();
  await w.service.close();
  await w.fake.close();
});

test('with sign-in off the panel is exactly the old one and no /auth address is ever asked for', async ({ browser }, testInfo) => {
  const w = await world(testInfo, { members: false });
  const page = await (await browser.newContext()).newPage();
  const asked = [];
  page.on('request', (r) => asked.push(r.url()));
  await open(page, w.disk);
  await page.waitForTimeout(6000); // one full check-in
  await expect(page.locator('.gm-identity')).toBeHidden();
  await expect(page.locator('.gm-who')).toBeVisible();
  expect(asked.filter((u) => u.includes('/auth'))).toEqual([]);
  await w.service.close();
  await w.fake.close();
});

// ---- strict reading (plan step 9) ------------------------------------------

test('strict reading, the stored copy: a sign-in page first, then the page, signed in, with nothing left in the address', async ({ browser }, testInfo) => {
  const w = await world(testInfo, { read: 'members' });
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  // A stranger with the link gets the sign-in page and not one word of the prototype.
  const gate = await page.goto(w.stored);
  expect(gate.status()).toBe(401);
  await expect(page.locator('h1')).toHaveText('Sign in to open this page');
  expect(await page.content()).not.toContain('step-1');

  await page.click('#gm-signin');
  await page.waitForLoadState();
  if (await page.locator('#fake-sign-in').count()) await page.click('#fake-sign-in');
  await page.waitForLoadState();
  if (await page.locator('#fake-authorize').count()) await page.click('#fake-authorize');
  await expect(page.locator('h1')).toHaveText('Open wizard.html as Priya Shah?', SLOW);
  await page.click('#gm-continue');

  // Same tab, now the prototype, and the panel is signed in without a second sign-in.
  await page.waitForFunction(() => !!window.__gitmargin, null, SLOW);
  await expect(page.locator('.gm-identity-says')).toHaveText('Commenting as Priya Shah @priya · GitLab', SLOW);
  expect(new URL(page.url()).hash).toBe('');
  await comment(page, '#step-1 h2', 'Members only, and I am one.');
  await expect(page.locator('.gm-card .gm-author').first()).toHaveText('Priya Shah @priya · GitLab (you)', SLOW);
  await expect.poll(async () => (await w.service.query('select 1 from comments')).length, SLOW).toBe(1);

  // The ticket is spent: a reload, or the same address pasted elsewhere, meets the sign-in page again.
  const again = await page.reload();
  expect(again.status()).toBe(401);
  expect(errors).toEqual([]);
  await w.service.close();
  await w.fake.close();
});

test('strict reading, a file on disk: the panel is locked and says so; signing in shows the comments', async ({ browser }, testInfo) => {
  const w = await world(testInfo, { read: 'members' });
  const context = await browser.newContext();
  const writer = await context.newPage();
  await open(writer, w.disk);
  await expect(writer.locator('.gm-identity-btn')).toHaveText('Sign in with GitLab to see comments', SLOW);
  await signIn(writer);
  await expect(writer.locator('.gm-identity-says')).toHaveText('Commenting as Priya Shah @priya · GitLab', SLOW);
  await comment(writer, '#step-1 h2', 'Only members should read this.');
  await expect.poll(async () => (await w.service.query('select 1 from comments')).length, SLOW).toBe(1);

  // Someone else with the same file, signed out: no comments, and a plain reason.
  const reader = await (await browser.newContext()).newPage();
  const errors = await open(reader, w.disk);
  await expect(reader.locator('.gm-identity-btn')).toHaveText('Sign in with GitLab to see comments', SLOW);
  await expect(reader.locator('.gm-card')).toHaveCount(0);
  await expect(reader.locator('.gm-panel')).toContainText('for members only');
  expect(errors).toEqual([]);
  await w.service.close();
  await w.fake.close();
});
