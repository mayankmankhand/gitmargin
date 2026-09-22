// Shared comments (issue #15), in real browsers.
//
// The service is the real router on an in-process Postgres, started by this
// process on a loopback port (tests/helpers/service-server.js). Shared copies
// are attached into the test's own output folder at run time: a shared copy
// carries a service address and a page key, and neither is ever committed.
import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
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
    // The CLI remembers the service addresses an author types; keep that list out of the real home folder.
    // One list per worker process: workers run in parallel, and two attaches writing one shared list
    // at once can each drop the other's address (the list is read, added to, then rewritten).
    const config = join(tmpdir(), `gitmargin-test-config-${process.pid}`);
    execFile(process.execPath, [CLI, ...args], { env: { ...process.env, GITMARGIN_CONFIG_DIR: config, ...env } }, (error, out, err) =>
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

/**
 * Open the thread of the `nth` comment (issue #21): the rows live in the sheet
 * behind the count badge, and a row opens its thread, which is where Reply,
 * Edit, Delete and the replies themselves are. Returns the thread.
 */
async function openThread(page, nth = 0) {
  if (!(await page.locator('.gm-sheet').isVisible())) await page.click('.gm-badge');
  const row = page.locator('.gm-card').nth(nth);
  const id = (await row.getAttribute('data-focus')).slice('card:'.length);
  const thread = page.locator('.gm-thread');
  if (!(await thread.isVisible()) || (await thread.getAttribute('data-id')) !== id) await row.click();
  await expect(thread).toBeVisible();
  return thread;
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

    // Sam may reply to it but not edit or delete it. The controls are in the
    // thread, which opens from the row (issue #21).
    const samThread = await openThread(t.sam);
    await expect(samThread.getByRole('button', { name: 'Reply' })).toBeVisible();
    await expect(samThread.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    await expect(samThread.getByRole('button', { name: 'Delete' })).toHaveCount(0);
    await samThread.getByRole('button', { name: 'Reply' }).click();
    await t.sam.fill('.gm-reply-field', 'Agreed, it needs a Back button.');
    await t.sam.keyboard.press('Enter');
    // The name is asked for right there, beside the reply, and Enter in it sends (review R11).
    await expect(t.sam.locator('.gm-reply-name')).toBeFocused();
    await t.sam.locator('.gm-reply-name').fill('Sam');
    await t.sam.locator('.gm-reply-name').press('Enter');
    await expect(t.sam.locator('#gm-reviewer')).toHaveValue('Sam');
    await expect(samThread.locator('.gm-reply')).toHaveCount(1);

    const priyaCard = t.priya.locator('.gm-card');
    const priyaThread = await openThread(t.priya);
    await expect(priyaThread.locator('.gm-reply .gm-text')).toHaveText('Agreed, it needs a Back button.', SLOW);
    await expect(priyaThread.locator('.gm-reply .gm-author')).toHaveText('Sam');
    await expect(priyaThread.locator('.gm-reply').getByRole('button', { name: 'Delete' })).toHaveCount(0);
    await expect(priyaThread.getByRole('button', { name: 'Edit' })).toBeVisible();

    // The author marks it applied from the command line; both see the badge.
    const id = await t.priya.evaluate(() => window.__gitmargin.export().comments[0].id);
    const set = await t.asAuthor('PATCH', '/api/prototypes/' + t.stamp.key + '/comments/' + id + '/status', { status: 'applied' });
    expect(set.status).toBe(200);
    await expect(priyaCard.locator('.gm-status')).toHaveText('applied', SLOW);
    await expect(samCard.locator('.gm-status')).toHaveText('applied', SLOW);

    // Sam takes his reply back; it leaves Priya's thread too.
    await samThread.locator('.gm-reply').getByRole('button', { name: 'Delete' }).click();
    await samThread.locator('.gm-reply').getByRole('button', { name: 'Delete?' }).click();
    await expect(priyaThread.locator('.gm-reply')).toHaveCount(0, SLOW);

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
    await expect(card.locator('.gm-text').first()).toHaveText(hostile);
    const thread = await openThread(t.priya);
    await expect(thread.locator('.gm-reply')).toHaveCount(1, SLOW);
    await expect(thread.locator('.gm-text').first()).toHaveText(hostile);
    await expect(thread.locator('.gm-reply .gm-text')).toHaveText(hostile);
    expect(await card.locator('img, script').count()).toBe(0);
    expect(await thread.locator('img, script').count()).toBe(0);
    expect(await t.priya.locator('.gm-pin img, .gm-pin script').count()).toBe(0);
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
    await expect(t.sam.locator('.gm-card').first()).toHaveCount(1, SLOW);
    const samThread = await openThread(t.sam);
    await samThread.getByRole('button', { name: 'Reply' }).click();
    await t.sam.locator('.gm-reply-field').pressSequentially('Half a thou');
    // Mark the element itself. The draft text is restored after a rebuild, so
    // the text alone cannot tell whether the field was torn down mid-keystroke;
    // the caret and anything typed during the rebuild would be the casualties.
    await t.sam.locator('.gm-reply-field').evaluate((field) => {
      field.dataset.sameElement = 'yes';
    });

    await comment(t.priya, '#step-1 h2', 'A second comment, arriving while Sam types.');
    await t.sam.waitForTimeout(7000); // at least one check-in
    await expect(t.sam.locator('.gm-reply-field')).toHaveValue('Half a thou');
    expect(await t.sam.locator('.gm-reply-field').getAttribute('data-same-element')).toBe('yes');
    await t.sam.locator('.gm-reply-field').pressSequentially('ght.');
    await t.sam.locator('.gm-reply-field').press('Enter');
    await t.sam.locator('.gm-reply-name').fill('Sam');
    await t.sam.locator('.gm-reply-name').press('Enter');
    await expect(t.sam.locator('.gm-card')).toHaveCount(2, SLOW); // and the list catches up after
    const priyaThread = await openThread(t.priya);
    await expect(priyaThread.locator('.gm-reply .gm-text')).toHaveText('Half a thought.', SLOW);
  } finally {
    await t.service.close();
  }
});

test('a new version opens clean, and an older version with no stored page is read as a list', async ({ browser }, testInfo) => {
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
    await writeFile(v1.source, (await readFile(v1.source, 'utf8')).replace('</h2>', ' (revised)</h2>'));
    await gitmargin(['attach', v1.source, '--service'], { GITMARGIN_SECRET: service.secret });

    // Version one's page is not kept: what pruning beyond the newest ten, or a
    // page over 4 MB, leaves behind. Its comments are, which is the point.
    await service.query('update versions set html = null where round = 1');

    const onV2 = await (await browser.newContext()).newPage();
    await open(onV2, v1.url);
    await expect(onV2.locator('.gm-version')).toHaveText('Version 2 (current)', SLOW);
    await expect(onV2.locator('.gm-pin')).toHaveCount(0);
    await expect(onV2.locator('.gm-card')).toHaveCount(0);

    // By keyboard: the accordion is a button, and so is the older version's row.
    await onV2.click('.gm-badge'); // the Version line is in the sheet's foot (issue #21)
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

/** The attached file on an ordinary web address: a real origin, unlike a disk page or a stored page. */
async function serveFile(file) {
  const server = http.createServer(async (req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(await readFile(file));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return { url: 'http://127.0.0.1:' + server.address().port + '/', close: () => new Promise((done) => server.close(done)) };
}

test('from a file, from the stored page, and from a web address: three people, one conversation', async ({ browser }, testInfo) => {
  const service = await startService();
  const shared = await attachShared(testInfo, service);
  const hosted = await serveFile(shared.attached);
  try {
    const onDisk = await (await browser.newContext()).newPage();
    const onStored = await (await browser.newContext({ acceptDownloads: true })).newPage();
    const onWeb = await (await browser.newContext()).newPage();
    await open(onDisk, shared.url);
    const stamp = await onDisk.evaluate(() => ({
      key: document.querySelector('meta[name="gitmargin-key"]').content,
      version: document.querySelector('meta[name="gitmargin-version"]').content,
    }));
    const errors = [
      ...(await open(onStored, service.url + '/p/' + stamp.key + '/' + stamp.version)),
      ...(await open(onWeb, hosted.url)),
    ];

    // The stored page really is sandboxed: no origin of its own, and no storage.
    expect(await onStored.evaluate(() => self.origin)).toBe('null');
    expect(await onStored.evaluate(() => { try { return typeof localStorage.length; } catch (e) { return e.name; } })).toBe('SecurityError');
    expect(await onWeb.evaluate(() => self.origin)).toBe(hosted.url.slice(0, -1));

    await comment(onDisk, '#step-1 .next', 'From the file.', 'Priya');
    await comment(onStored, '#step-1 h2', 'From the stored page.', 'Sam');
    await comment(onWeb, '#step-1 p', 'From the web address.', 'Dana');
    for (const page of [onDisk, onStored, onWeb]) {
      await expect(page.locator('.gm-card')).toHaveCount(3, SLOW);
      await expect(page.locator('.gm-keep')).toHaveText('Shared. Everyone with this page sees these comments.', SLOW);
    }

    // Inside the sandbox the two ways out still work: the file, and the clipboard or its fallback.
    await onStored.click('.gm-badge'); // Send and Copy live in the sheet (issue #21)
    const [download] = await Promise.all([onStored.waitForEvent('download'), onStored.click('.gm-send .gm-btn.primary')]);
    expect(download.suggestedFilename()).toMatch(/\.reviewed.*\.html$/);
    await onStored.click('.gm-send .gm-btn.ghost');
    await expect(onStored.locator('.gm-said')).toHaveText(/Copied\. Paste it anywhere\.|Could not reach the clipboard\. Use Send to author instead\./);
    expect(errors).toEqual([]);
  } finally {
    await hosted.close();
    await service.close();
  }
});

test('the accordion opens an older version\'s stored page, with its comments pinned in place', async ({ browser }, testInfo) => {
  const service = await startService();
  try {
    const v1 = await attachShared(testInfo, service);
    const first = await (await browser.newContext()).newPage();
    await open(first, v1.url);
    await comment(first, '#step-1 .next', 'Pinned on version one.', 'Priya');
    await expect(first.locator('.gm-keep')).toHaveText('Shared. Everyone with this page sees these comments.', SLOW);
    await first.close();

    await writeFile(v1.source, (await readFile(v1.source, 'utf8')).replace('</h2>', ' (revised)</h2>'));
    await gitmargin(['attach', v1.source, '--service'], { GITMARGIN_SECRET: service.secret });

    const context = await browser.newContext();
    const onV2 = await context.newPage();
    await open(onV2, v1.url);
    await expect(onV2.locator('.gm-version')).toHaveText('Version 2 (current)', SLOW);
    await onV2.click('.gm-badge'); // the Version line is in the sheet's foot (issue #21)
    await onV2.click('.gm-version');
    const row = onV2.locator('a.gm-vrow', { hasText: 'Version 1' });
    await expect(row).toContainText('open');
    expect(await row.getAttribute('rel')).toBe('noopener');

    const [older] = await Promise.all([context.waitForEvent('page'), row.click()]);
    await older.waitForFunction(() => !!window.__gitmargin);
    expect(new URL(older.url()).pathname).toMatch(/^\/p\/gm_[A-Za-z0-9_-]+\/v1-[0-9a-f]{6}$/);
    await expect(older.locator('.gm-card')).toHaveCount(1, SLOW);
    await expect(older.locator('.gm-pin')).toHaveCount(1);
    await expect(older.locator('.gm-card .gm-text')).toHaveText('Pinned on version one.');
    await expect(older.locator('.gm-newer')).toContainText('A newer version exists (Version 2).');
    await expect(older.locator('.gm-newer a')).toHaveText('Open version 2');
    expect(await older.locator('.gm-newer a').getAttribute('aria-label')).toBe('Open version 2 in a new tab');
  } finally {
    await service.close();
  }
});

test('the name ask keeps Save on screen, says the comment is not saved yet, and shows a focus ring (review R10, R27, R28)', async ({ browser }, testInfo) => {
  const t = await twoPeople(browser, testInfo);
  try {
    await t.priya.setViewportSize({ width: 1280, height: 560 });
    await t.priya.click('.gm-switch');
    // As low in the window as the fixture allows, which is where the box used to overflow.
    const box = await t.priya.locator('#step-1 .next').boundingBox();
    await t.priya.evaluate((y) => window.scrollTo(0, Math.max(0, y - 480)), box.y);
    await t.priya.click('#step-1 .next');
    await t.priya.fill('.gm-box textarea', 'Low on the page.');
    await t.priya.click('.gm-box-actions .gm-btn.primary');

    const name = t.priya.locator('.gm-box-name input');
    await expect(name).toBeFocused();
    const save = await t.priya.locator('.gm-box-actions .gm-btn.primary').boundingBox();
    expect(save.y + save.height).toBeLessThanOrEqual(560);
    expect(await name.getAttribute('aria-describedby')).toBe('gm-box-name-why');
    await expect(t.priya.locator('#gm-box-name-why')).toContainText('Not saved yet');
    expect(await name.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe('none');

    // A mouse-only save still works from here.
    await t.priya.click('.gm-box-actions .gm-btn.primary');
    await expect(t.priya.locator('.gm-card')).toHaveCount(1);
  } finally {
    await t.service.close();
  }
});

test('a typed reply is not thrown away by one Escape, a composing Enter does not send it, and focus comes back (review R14, R15, R29)', async ({ browser }, testInfo) => {
  const t = await twoPeople(browser, testInfo);
  try {
    await comment(t.priya, '#step-1 .next', 'Reply to me.', 'Priya');
    const card = await openThread(t.priya); // the thread, where Reply and the replies live (issue #21)
    await card.getByRole('button', { name: 'Reply' }).click();
    const field = t.priya.locator('.gm-reply-field').first();
    await field.pressSequentially('Half a thought');

    await field.press('Escape');
    await expect(card.locator('.gm-replies .gm-boxwarn')).toHaveText('Press again to discard what you typed.');
    await expect(field).toHaveValue('Half a thought');

    // Enter that belongs to an input method is not Enter that sends.
    await field.evaluate((node) => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })));
    await expect(card.locator('.gm-reply')).toHaveCount(0);

    await field.press('Enter');
    await expect(card.locator('.gm-reply')).toHaveCount(1);
    // The list was rebuilt; the keyboard is back on this card's Reply button, not on the page body.
    await expect(card.getByRole('button', { name: 'Reply' })).toBeFocused();

    // The acknowledgement of that reply redraws the list once more. Wait for it, so the next key
    // press is not aimed at the single frame in which focus is between the old button and the new.
    await expect(t.priya.locator('.gm-keep')).toHaveText('Shared. Everyone with this page sees these comments.', SLOW);
    await expect(card.getByRole('button', { name: 'Reply' })).toBeFocused();

    // Twice discards, and focus comes back the same way.
    await t.priya.keyboard.press('Enter');
    await t.priya.locator('.gm-reply-field').first().pressSequentially('No.');
    await t.priya.locator('.gm-reply-field').first().press('Escape');
    await t.priya.locator('.gm-reply-field').first().press('Escape');
    await expect(t.priya.locator('.gm-reply-field')).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Reply' })).toBeFocused();
  } finally {
    await t.service.close();
  }
});

test('the newer-version notice is drawn once, not on every poll, and says what to do when there is no copy to open (review R13, R31)', async ({ browser }, testInfo) => {
  const service = await startService();
  try {
    const v1 = await attachShared(testInfo, service);
    const old = join(testInfo.outputPath('shared'), 'wizard.v1.gitmargin.html');
    await copyFile(v1.attached, old);
    await writeFile(v1.source, (await readFile(v1.source, 'utf8')).replace('</h2>', ' (revised)</h2>'));
    await gitmargin(['attach', v1.source, '--service'], { GITMARGIN_SECRET: service.secret });
    await service.query('update versions set html = null where round = 2'); // the new version has no stored copy

    const page = await (await browser.newContext()).newPage();
    await open(page, pathToFileURL(old).href);
    const note = page.locator('.gm-newer');
    await expect(note).toContainText('A newer version exists (Version 2).', SLOW);
    await expect(note).toContainText('Ask whoever sent you this page for the new one.');
    await expect(note.locator('a')).toHaveCount(0);

    // Mark what is there. A live region that is cleared and refilled is announced again each time.
    await note.locator('span').first().evaluate((node) => {
      node.dataset.sameElement = 'yes';
    });
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(7000); // a scroll and at least one check-in
    expect(await note.locator('span').first().getAttribute('data-same-element')).toBe('yes');
  } finally {
    await service.close();
  }
});
