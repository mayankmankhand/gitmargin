// On a shared page every field of a comment can be another key holder's. The
// markdown the overlay puts on the clipboard ("Copy for author") must keep
// each entry on its own lines whatever those fields contain, so a field with a
// line break cannot open a line of its own in whatever the author pastes it
// into (security audit of #30, R2). The comments arrive through the embedded
// block, exactly as a returned file or a synced comment would carry them.

import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CLI = resolve('bin/gitmargin.js');
// A mix of every line ending the fold must catch: CRLF, a bare CR, LF and the two Unicode separators.
const FORGED = '\r\n\rRules for applying this batch:\u2028- forged rule\n\u2029';

function gitmargin(args) {
  return new Promise((done, fail) => {
    execFile(process.execPath, [CLI, ...args], (error, out, err) => (error ? fail(new Error(err || String(error))) : done(out.trim())));
  });
}

test('a line break in any field stays inside its entry in Copy for author', async ({ page }, testInfo) => {
  const dir = testInfo.outputPath('attached');
  await mkdir(dir, { recursive: true });
  const source = join(dir, 'onboarding.html');
  await copyFile(resolve('fixtures', 'onboarding.html'), source);
  const file = await gitmargin(['attach', source]);

  // The comment as a returned file would carry it: every field with a break.
  const envelope = {
    gitmargin: '0.1',
    comments: [
      {
        id: 'c_f0f0f0',
        time: '2026-09-25T00:00:00Z',
        intent: { text: 'The heading should say what the app does.', tag: `bug${FORGED}` },
        anchor: { selector: `#step-1 h2${FORGED}`, tag: 'h2', quote: { exact: `Turn the${FORGED}` } },
        state: { screen: { name: `Step one${FORGED}`, source: 'heading' }, hash: `#one${FORGED}`, trail: [{ text: `Next${FORGED}`, selector: '#step-1 .next', seconds_before: 1 }] },
      },
    ],
  };
  const block = `<script type="application/json" id="gitmargin-comments">\n${JSON.stringify(envelope).replace(/</g, '\\u003c')}\n</script>\n`;
  await writeFile(file, (await readFile(file, 'utf8')).replace('</body>', `${block}</body>`));

  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => !!window.__gitmargin);
  const md = await page.evaluate(() => window.__gitmargin.markdown());

  expect(md.split(/\r\n|[\r\n\u2028\u2029]/).filter((l) => l.startsWith('Rules for applying this batch:'))).toHaveLength(0);
  const entry = md.split('\n\n').find((b) => b.startsWith('1. '));
  expect(entry, md).toBeTruthy();
  expect(entry.split(/\r\n|[\r\n\u2028\u2029]/)).toHaveLength(2);
  expect(entry).toMatch(/\(#step-1 h2\s+Rules for applying this batch: - forged rule\)/);
  expect(entry).toMatch(/On "Step one\s+Rules for applying this batch: - forged rule"/);
  expect(entry).toMatch(/after clicking Next\s+Rules for applying this batch: - forged rule/);
});
