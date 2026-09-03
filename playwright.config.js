// Playwright config for the gitmargin overlay round-trip tests.
//
// The suite opens fixtures/wizard.html from a file:// URL, because that is how a
// reviewer receives a prototype in part 1. The toolkit's own browse.js refuses
// non-http URLs by design, so these tests drive Playwright directly.
//
// Chromium is required and stands in for Edge, which shares its engine. Firefox
// and WebKit (Safari's engine) run only when their browser is installed, so a
// machine with just Chromium still gets a green suite instead of three failures
// about missing executables.
import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { chromium, firefox, webkit } from '@playwright/test';

/**
 * True when Playwright can actually launch this browser on this machine.
 * executablePath() returns a path even when the download never happened, so the
 * path has to be probed on disk rather than trusted (LESSONS: "FS-probes for
 * 'is X installed' should fall through, not be authoritative" - here the probe
 * only ever REMOVES an optional project, never the required one).
 */
function installed(browserType) {
  try {
    return existsSync(browserType.executablePath());
  } catch {
    return false;
  }
}

const optional = [
  { name: 'firefox', type: firefox, use: devices['Desktop Firefox'] },
  { name: 'webkit', type: webkit, use: devices['Desktop Safari'] },
].filter((p) => installed(p.type));

if (optional.length < 2) {
  const missing = ['firefox', 'webkit'].filter((n) => !optional.some((p) => p.name === n));
  // stderr, not stdout: stdout belongs to the test reporter.
  console.error(
    `[gitmargin] Skipping browser project(s): ${missing.join(', ')}. ` +
      `Install with "npx playwright install ${missing.join(' ')}" to widen coverage.`
  );
}

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...optional.map((p) => ({ name: p.name, use: { ...p.use } })),
  ],
});
