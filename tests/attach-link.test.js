// `attach` writes a copy next to the prototype under a fixed name. A cloned
// project can carry a symbolic link under that name, and writing "the copy"
// would then overwrite whatever the link points at while the command reports
// the source untouched (security audit of #30, R4). The link is refused before
// anything is written or registered.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI = path.join(ROOT, 'bin', 'gitmargin.js');
const PAGE = '<!doctype html>\n<html><head><meta charset="utf-8"><title>t</title></head>\n<body><p>hi</p>\n</body></html>\n';

const run = (args) =>
  new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { env: { ...process.env, GITMARGIN_SECRET: '', GITMARGIN_SERVICE: '' } }, (error, out, err) => resolve({ code: error ? error.code : 0, out, err }));
  });

test('attach refuses a symbolic link at the output name and leaves its target alone', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gitmargin-link-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = path.join(dir, 'proto.html');
  const target = path.join(dir, 'elsewhere.txt');
  writeFileSync(source, PAGE);
  writeFileSync(target, 'precious');
  symlinkSync(target, path.join(dir, 'proto.gitmargin.html'));

  const r = await run(['attach', source]);
  assert.equal(r.code, 2, r.err);
  assert.match(r.err, /proto\.gitmargin\.html is a link, not a file/);
  assert.equal(r.out, '', 'a path was printed as if a copy had been written');
  assert.equal(readFileSync(target, 'utf8'), 'precious', 'the link target was overwritten');
  assert.equal(readFileSync(source, 'utf8'), PAGE, 'the source changed');
});
