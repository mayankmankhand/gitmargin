// Playwright config for the gitmargin overlay round-trip tests.
//
// The suite opens fixtures/wizard.html from a file:// URL, because that is how a
// reviewer receives a prototype in part 1. The toolkit's own browse.js refuses
// non-http URLs by design, so these tests drive Playwright directly.
//
// Chromium is required and stands in for Edge, which shares its engine. Firefox
// and WebKit (Safari's engine) are optional: a machine with only Chromium still
// gets a green suite instead of failures about browsers it never installed.
import { defineConfig, devices, chromium, firefox, webkit } from '@playwright/test';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OPTIONAL = [
  { name: 'firefox', type: firefox, use: devices['Desktop Firefox'] },
  { name: 'webkit', type: webkit, use: devices['Desktop Safari'] },
];

/**
 * Which optional browsers can actually RUN here.
 *
 * The binary being on disk is not the question: `playwright install` downloads
 * WebKit happily onto a host that is missing the ~30 shared libraries it needs,
 * and the fs check would then enable a project that cannot launch. So each
 * candidate is asked for its version, which fails fast when the libraries are
 * absent. Set GM_BROWSERS to override, e.g. GM_BROWSERS=chromium,firefox.
 */
function usableBrowsers() {
  if (process.env.GM_BROWSERS) return process.env.GM_BROWSERS.split(',').filter(Boolean);

  const usable = ['chromium'];
  const broken = [];
  const absent = [];
  for (const { name, type } of OPTIONAL) {
    let path;
    try {
      path = type.executablePath();
    } catch {
      absent.push(name);
      continue;
    }
    if (!existsSync(path)) {
      absent.push(name);
      continue;
    }
    try {
      execFileSync(path, ['--version'], { timeout: 20_000, stdio: 'ignore' });
      usable.push(name);
    } catch {
      broken.push(name);
    }
  }

  // Workers inherit this environment, so the probe runs once per test run.
  process.env.GM_BROWSERS = usable.join(',');

  // stderr, not stdout: stdout belongs to the test reporter.
  if (absent.length) {
    console.error(
      `[gitmargin] Not installed, skipping: ${absent.join(', ')}. ` +
        `Add with "npx playwright install ${absent.join(' ')}".`
    );
  }
  if (broken.length) {
    console.error(
      `[gitmargin] Installed but cannot start, skipping: ${broken.join(', ')}. ` +
        'The host is missing shared libraries; on Debian or Ubuntu run ' +
        `"npx playwright install --with-deps ${broken.join(' ')}" (needs sudo).`
    );
  }
  return usable;
}

const enabled = usableBrowsers();
const projects = [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }].concat(
  OPTIONAL.filter((p) => enabled.includes(p.name)).map((p) => ({ name: p.name, use: { ...p.use } }))
);

export default defineConfig({
  testDir: 'tests',
  // Playwright owns *.spec.js only. The CLI tests next door are *.test.js and
  // run under Node's own runner; without this they would be collected here
  // too, where node:test's imports mean nothing.
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  projects,
});
