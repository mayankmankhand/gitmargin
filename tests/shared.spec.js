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

// These tests wait for real check-ins (about five seconds each) between two
// real browsers, several in a row. The default 30 s per test is too tight for
// that under a full parallel run: Firefox took 27 s alone and tipped over.
test.describe.configure({ timeout: 90_000 });

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

/**
 * Leave one comment on `selector`, the way tests/roundtrip.spec.js does. On a
 * shared page the first save asks for a name; `name` answers it (blank is allowed).
 */
async function comment(page, selector, text, name = '') {
  await page.click('.gm-switch');
  await page.click(selector);
  await expect(page.locator('.gm-box')).toBeVisible();
  await page.fill('.gm-box textarea', text);
  await page.click('.gm-box-actions .gm-btn.primary');
  if (await page.locator('.gm-box-name').isVisible()) {
    await page.fill('.gm-box-name input', name);
    await page.click('.gm-box-actions .gm-btn.primary');
  }
  await expect(page.locator('.gm-box')).toBeHidden();
  await page.click('.gm-switch');
}

/** A shared page open in two separate browsers, plus the service behind it. */
async function twoPeople(browser, testInfo, options = {}) {
  const service = await startService(options);
  const shared = await attachShared(testInfo, service);
  const priya = await (await browser.newContext()).newPage();
  const sam = await (await browser.newContext()).newPage();
  const errors = [...(await open(priya, shared.url)), ...(await open(sam, shared.url))];
  const stamp = await priya.evaluate(() => ({
    key: document.querySelector('meta[name="gitmargin-key"]').content,
    version: document.querySelector('meta[name="gitmargin-version"]').content,
  }));
  const asAuthor = (method, path, body) =>
    fetch(service.url + path, {
      method,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + service.secret },
      body: body ? JSON.stringify(body) : undefined,
    });
  return { service, shared, priya, sam, errors, stamp, asAuthor };
}

const SLOW = { timeout: 20_000 }; // one check-in is about five seconds; two, plus margin under load

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

test('the name is asked for once, on the first shared comment, and never on a plain file', async ({ browser, page }, testInfo) => {
  const t = await twoPeople(browser, testInfo);
  try {
    await t.priya.click('.gm-switch');
    await t.priya.click('#step-1 .next');
    await t.priya.fill('.gm-box textarea', 'First.');
    await t.priya.click('.gm-box-actions .gm-btn.primary');
    await expect(t.priya.locator('.gm-box-name')).toBeVisible();
    await expect(t.priya.locator('.gm-card')).toHaveCount(0); // not saved yet
    await t.priya.fill('.gm-box-name input', 'Priya');
    await t.priya.keyboard.press('Enter');
    await expect(t.priya.locator('.gm-card')).toHaveCount(1);
    await expect(t.priya.locator('#gm-reviewer')).toHaveValue('Priya');
    await t.priya.click('.gm-switch');

    // Second comment: no prompt. Sam leaves it blank: still saves, shown as Someone.
    await t.priya.click('.gm-switch');
    await t.priya.click('#step-1 h2');
    await t.priya.fill('.gm-box textarea', 'Second.');
    await t.priya.click('.gm-box-actions .gm-btn.primary');
    await expect(t.priya.locator('.gm-card')).toHaveCount(2);
    await comment(t.sam, '#step-1 .next', 'No name given.', '');
    await expect(t.priya.locator('.gm-card .gm-author', { hasText: 'Someone' })).toHaveCount(1, SLOW);

    await open(page, pathToFileURL(resolve('fixtures/wizard.html')).href);
    await page.click('.gm-switch');
    await page.click('#step-1 .next');
    await page.fill('.gm-box textarea', 'Plain file.');
    await page.click('.gm-box-actions .gm-btn.primary');
    await expect(page.locator('.gm-card')).toHaveCount(1);
    await expect(page.locator('.gm-card .gm-author')).toHaveCount(0);
    expect(t.errors).toEqual([]);
  } finally {
    await t.service.close();
  }
});

test('replies, own-only controls, and a status the author sets', async ({ browser }, testInfo) => {
  const t = await twoPeople(browser, testInfo);
  try {
    await comment(t.priya, '#step-1 .next', 'What do you think of this?', 'Priya');
    const samCard = t.sam.locator('.gm-card');
    await expect(samCard).toHaveCount(1, SLOW);
    await expect(samCard.locator('.gm-author').first()).toHaveText('Priya');

    // Sam may reply to it but not edit or delete it.
    await samCard.hover();
    await expect(samCard.getByRole('button', { name: 'Reply' })).toBeVisible();
    await expect(samCard.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    await expect(samCard.getByRole('button', { name: 'Delete' })).toHaveCount(0);
    await samCard.getByRole('button', { name: 'Reply' }).click();
    await t.sam.fill('.gm-reply-field', 'Agreed, it needs a Back button.');
    await t.sam.keyboard.press('Enter');
    await t.sam.fill('#gm-reviewer', 'Sam'); // the panel asked for a name
    await t.sam.locator('.gm-reply-field').press('Enter');
    await expect(samCard.locator('.gm-reply')).toHaveCount(1);

    const priyaCard = t.priya.locator('.gm-card');
    await expect(priyaCard.locator('.gm-reply .gm-text')).toHaveText('Agreed, it needs a Back button.', SLOW);
    await expect(priyaCard.locator('.gm-reply .gm-author')).toHaveText('Sam');
    await expect(priyaCard.locator('.gm-reply').getByRole('button', { name: 'Delete' })).toHaveCount(0);
    await priyaCard.hover();
    await expect(priyaCard.getByRole('button', { name: 'Edit' })).toBeVisible();

    // The author marks it applied from the command line; both see the badge.
    const id = await t.priya.evaluate(() => window.__gitmargin.export().comments[0].id);
    const set = await t.asAuthor('PATCH', '/api/prototypes/' + t.stamp.key + '/comments/' + id + '/status', { status: 'applied' });
    expect(set.status).toBe(200);
    await expect(priyaCard.locator('.gm-status')).toHaveText('applied', SLOW);
    await expect(samCard.locator('.gm-status')).toHaveText('applied', SLOW);

    // Sam takes his reply back; it leaves Priya's panel too.
    await samCard.locator('.gm-reply').hover();
    await samCard.locator('.gm-reply').getByRole('button', { name: 'Delete' }).click();
    await samCard.locator('.gm-reply').getByRole('button', { name: 'Delete?' }).click();
    await expect(priyaCard.locator('.gm-reply')).toHaveCount(0, SLOW);

    // What a reviewer sends by file carries the conversation in the format's own slot.
    const exported = await t.priya.evaluate(() => window.__gitmargin.export());
    expect(exported.gitmargin).toBe('0.1');
    expect(exported.comments[0].author).toEqual({ name: 'Priya' });
    expect(exported.comments[0].status).toBe('applied');
    expect(t.errors).toEqual([]);
  } finally {
    await t.service.close();
  }
});

test('names, comments and replies from other people are drawn as text and run nothing', async ({ browser }, testInfo) => {
  const t = await twoPeople(browser, testInfo);
  try {
    const hostile = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>';
    const headers = { 'content-type': 'application/json', 'x-gitmargin-token': 'a-hostile-token-0123456789' };
    const made = await fetch(t.service.url + '/api/p/' + t.stamp.key + '/comments', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        version_id: t.stamp.version,
        author: { name: hostile },
        comment: { id: 'c_bad001', time: '2026-09-18T12:00:00Z', intent: { text: hostile }, anchor: { selector: '#step-1 .next' }, state: {} },
      }),
    });
    expect(made.status).toBe(201);
    await fetch(t.service.url + '/api/p/' + t.stamp.key + '/comments/c_bad001/replies', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: 'r_bad001', text: hostile, author: { name: hostile } }),
    });

    const card = t.priya.locator('.gm-card');
    await expect(card).toHaveCount(1, SLOW);
    await expect(card.locator('.gm-reply')).toHaveCount(1, SLOW);
    await expect(card.locator('.gm-text').first()).toHaveText(hostile);
    await expect(card.locator('.gm-reply .gm-text')).toHaveText(hostile);
    expect(await card.locator('img, script').count()).toBe(0);
    expect(await t.priya.evaluate(() => window.__pwned)).toBeUndefined();
    expect(t.errors).toEqual([]);
  } finally {
    await t.service.close();
  }
});

test('the service going away mid-session loses nothing, and says so', async ({ browser }, testInfo) => {
  const line = { down: false };
  const t = await twoPeople(browser, testInfo, { down: () => line.down });
  try {
    await comment(t.priya, '#step-1 .next', 'While it was up.', 'Priya');
    await expect(t.priya.locator('.gm-keep')).toHaveText('Shared. Everyone with this page sees these comments.', SLOW);

    line.down = true;
    await comment(t.priya, '#step-1 h2', 'While it was down.');
    await expect(t.priya.locator('.gm-keep')).toContainText('Working locally', SLOW);
    await expect(t.priya.locator('.gm-card')).toHaveCount(2); // still here
    await expect(t.priya.locator('.gm-flag', { hasText: 'not shared yet' })).toHaveCount(1);

    line.down = false;
    await expect(t.sam.locator('.gm-card')).toHaveCount(2, { timeout: 40_000 }); // the back-off has to run out
    await expect(t.priya.locator('.gm-keep')).toHaveText('Shared. Everyone with this page sees these comments.', { timeout: 40_000 });
    await expect(t.priya.locator('.gm-flag', { hasText: 'not shared yet' })).toHaveCount(0);
  } finally {
    await t.service.close();
  }
});

test('a reply being typed is not wiped when someone else\'s comment arrives', async ({ browser }, testInfo) => {
  const t = await twoPeople(browser, testInfo);
  try {
    await comment(t.priya, '#step-1 .next', 'Reply to me.', 'Priya');
    const samCard = t.sam.locator('.gm-card').first();
    await expect(samCard).toBeVisible(SLOW);
    await samCard.hover();
    await samCard.getByRole('button', { name: 'Reply' }).click();
    await t.sam.locator('.gm-reply-field').pressSequentially('Half a thou');

    await comment(t.priya, '#step-1 h2', 'A second comment, arriving while Sam types.');
    await t.sam.waitForTimeout(7000); // at least one check-in
    await expect(t.sam.locator('.gm-reply-field')).toHaveValue('Half a thou');
    await t.sam.locator('.gm-reply-field').pressSequentially('ght.');
    await t.sam.locator('.gm-reply-field').press('Enter');
    await t.sam.fill('#gm-reviewer', 'Sam');
    await t.sam.locator('.gm-reply-field').press('Enter');
    await expect(t.sam.locator('.gm-card')).toHaveCount(2, SLOW); // and the list catches up after
    await expect(t.priya.locator('.gm-reply .gm-text')).toHaveText('Half a thought.', SLOW);
  } finally {
    await t.service.close();
  }
});

test('a new version opens clean, and the accordion reads the older version\'s comments', async ({ browser }, testInfo) => {
  const service = await startService();
  try {
    const v1 = await attachShared(testInfo, service);
    const old = join(testInfo.outputPath('shared'), 'wizard.v1.gitmargin.html');
    await copyFile(v1.attached, old); // the copy someone still has open after v2 ships
    const onV1 = await (await browser.newContext()).newPage();
    await open(onV1, pathToFileURL(old).href);
    await comment(onV1, '#step-1 .next', 'Said about version one.', 'Priya');
    await expect(onV1.locator('.gm-version')).toHaveText('Version 1 (current)', SLOW);

    // The author changes the prototype and attaches again: version two.
    const { readFile, writeFile } = await import('node:fs/promises');
    await writeFile(v1.source, (await readFile(v1.source, 'utf8')).replace('</h2>', ' (revised)</h2>'));
    await gitmargin(['attach', v1.source, '--service'], { GITMARGIN_SECRET: service.secret });

    const onV2 = await (await browser.newContext()).newPage();
    await open(onV2, v1.url);
    await expect(onV2.locator('.gm-version')).toHaveText('Version 2 (current)', SLOW);
    await expect(onV2.locator('.gm-pin')).toHaveCount(0);
    await expect(onV2.locator('.gm-card')).toHaveCount(0);

    // By keyboard: the accordion is a button, and so is the older version's row.
    await onV2.locator('.gm-version').focus();
    await onV2.keyboard.press('Enter');
    const row = onV2.locator('.gm-vrow', { hasText: 'Version 1' });
    await expect(row).toContainText('1 comment');
    await row.focus();
    await onV2.keyboard.press('Enter');
    await expect(onV2.locator('.gm-older .gm-text')).toHaveText('Said about version one.');
    await expect(onV2.locator('.gm-older .gm-author')).toHaveText('Priya');
    await expect(onV2.locator('.gm-pin')).toHaveCount(0); // read, never pinned: it is about another page

    // And whoever is still on version one is told.
    await expect(onV1.locator('.gm-newer')).toContainText('A newer version exists (Version 2).', SLOW);
    await expect(onV1.locator('.gm-version')).toHaveText('Version 1', SLOW);
  } finally {
    await service.close();
  }
});
