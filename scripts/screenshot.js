// Makes the picture of the overlay that README.md shows: the Sony setup mock on
// its first step, two of Rin's comments pinned to it, one thread open, and the
// pill at the top right. Run it again whenever the overlay's look changes, so
// the README never shows a version that no longer exists.
//
// Usage: node scripts/screenshot.js [out.png]  ->  docs/images/overlay.png by default
//
// It never touches fixtures/. The fixture is copied into a temporary folder and
// attached THERE with the same command an author runs, so the page in the
// picture is exactly what a reviewer receives: the overlay inlined, opened from
// disk, nothing served. The temporary folder is removed at the end.
//
// It does not build the overlay. `gitmargin attach` inlines dist/gitmargin.js as
// it is on disk, so a stale bundle would give a picture of an old overlay; the
// build is one command you run first, and this script says so when it is missing.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// fileURLToPath, not URL.pathname, for the same reason as scripts/serve-fixture.js:
// a checkout under a directory with a space in its name must still resolve.
const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BUNDLE = join(REPO, 'dist', 'gitmargin.js');
const FIXTURE = join(REPO, 'fixtures', 'onboarding.html');
const CLI = join(REPO, 'bin', 'gitmargin.js');
const OUT = resolve(process.argv[2] || join(REPO, 'docs', 'images', 'overlay.png'));

/** A README image should load on a slow connection: this is the ceiling. */
const LIMIT = 500 * 1024;
const VIEWPORT = { width: 1280, height: 800 };
/** Crisp on a high-density display first; the fallback is only for staying under LIMIT. */
const SCALES = [2, 1.5];

// Rin is the fixture's own fictional person (rin@example.com on its sign-in
// step), so the picture and the mock agree about who is looking at it.
const REVIEWER = 'Rin';
const ON_NEXT = 'I expected Next to stay off until both boxes are ticked.';
const WORDS = 'about five seconds';
const ON_WORDS = 'I expected to see what the light looks like. Mine flashed white and I was not sure it was pairing.';

if (!existsSync(BUNDLE)) {
  console.error('The overlay has not been built yet. Run: npm run build');
  process.exit(1);
}

/** Copy the fixture into `dir` and attach it there. Returns the attached copy's path. */
function attachedCopy(dir) {
  const copy = join(dir, 'onboarding.html');
  copyFileSync(FIXTURE, copy);
  // stdout carries the output path and nothing else (bin/gitmargin.js). stderr
  // carries the "send this to your reviewer" note, which is not for whoever runs
  // this script, so it is shown only when attach fails.
  try {
    return execFileSync(process.execPath, [CLI, 'attach', copy], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    throw new Error(`gitmargin attach failed:\n${error.stderr || error.message}`);
  }
}

/** Leave the two comments as a reviewer would and open the thread on the words. */
async function drive(page, url) {
  // The picture must never be of a broken overlay: any error on the page fails the run.
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => !!window.__gitmargin);

  // The name first, so both pins carry an R. The field lives under the identity
  // chip in the pill, and a second click on the chip closes it again.
  await page.click('.gm-id');
  await page.fill('#gm-reviewer', REVIEWER);
  await page.click('.gm-id');

  // Comment mode on: from here a click marks a spot instead of using the page.
  await page.click('.gm-switch');

  // First comment, on a control: the Next button of step 1.
  await page.click('#step-1 .next');
  await page.locator('.gm-box').waitFor({ state: 'visible' });
  await page.fill('.gm-box textarea', ON_NEXT);
  await page.click('.gm-box-actions .gm-btn.primary');
  await page.locator('.gm-box').waitFor({ state: 'hidden' });

  // Second comment, on a run of words: a real drag across them in the step 1
  // paragraph, the way a reviewer highlights text. The overlay listens for the
  // selection the mouse makes, so setting one from script would not count.
  const box = await page.evaluate((words) => {
    const node = document.querySelector('#step-1 p').firstChild;
    const start = node.textContent.indexOf(words);
    if (start < 0) throw new Error(`The fixture no longer says "${words}".`);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + words.length);
    const r = range.getBoundingClientRect();
    return { x1: r.left + 1, x2: r.right - 1, y: r.top + r.height / 2 };
  }, WORDS);
  await page.mouse.move(box.x1, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x2, box.y, { steps: 8 });
  await page.mouse.up();
  await page.locator('.gm-box').waitFor({ state: 'visible' });
  await page.fill('.gm-box textarea', ON_WORDS);
  await page.click('.gm-box-actions .gm-btn.primary');
  await page.locator('.gm-box').waitFor({ state: 'hidden' });

  // Comment mode off, so the frame that follows the pointer is not in the picture.
  await page.click('.gm-switch');

  // Open the thread on the words. Each pin names its comment in data-focus, so
  // the right one is found by what it quotes rather than by the order pins were drawn.
  const id = await page.evaluate(
    (words) => window.__gitmargin.export().comments.find((c) => c.anchor.quote && c.anchor.quote.exact === words).id,
    WORDS
  );
  await page.click(`.gm-pin[data-focus="pin:${id}"]`);
  await page.locator('.gm-thread').waitFor({ state: 'visible' });

  // The pointer is still on the pin, which shows the hover preview on top of the
  // thread. Park it on empty page, then let the pin's spring and the thread settle.
  await page.mouse.move(40, VIEWPORT.height - 40);
  await page.waitForTimeout(400);

  if (errors.length) throw new Error(`The overlay raised errors on the page:\n${errors.join('\n')}`);
}

/** One picture at one scale. A fresh context each time, so nothing carries over. */
async function capture(browser, url, scale) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: scale });
  const page = await context.newPage();
  try {
    await drive(page, url);
    await page.screenshot({ path: OUT, type: 'png' });
  } finally {
    await context.close();
  }
}

/** Width and height from the PNG header: the IHDR chunk sits at a fixed offset. */
function pngSize(file) {
  const head = readFileSync(file).subarray(16, 24);
  return { width: head.readUInt32BE(0), height: head.readUInt32BE(4) };
}

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

mkdirSync(dirname(OUT), { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'gitmargin-screenshot-'));
const browser = await chromium.launch();
let size = 0;
let scale = SCALES[0];
try {
  const url = pathToFileURL(attachedCopy(dir)).href;
  for (scale of SCALES) {
    await capture(browser, url, scale);
    size = statSync(OUT).size;
    if (size <= LIMIT) break;
    console.error(`${kb(size)} at ${scale}x is over the ${kb(LIMIT)} ceiling for a README image.`);
  }
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}

const { width, height } = pngSize(OUT);
console.log(`${OUT}: ${width}x${height} at ${scale}x, ${kb(size)}`);
if (size > LIMIT) {
  console.error('Still over the ceiling. Crop the viewport in this script or shrink the picture before committing it.');
  process.exit(1);
}
