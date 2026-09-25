// Spies for "the author's secrets never reach a child program" (issue #33).
//
// A spy is a small sh script with a program's name, put first on PATH. Each run
// writes one line to a log, "<name> clean" or "<name> leaked" (when
// GITMARGIN_SECRET or GITMARGIN_VERCEL_BYPASS reached it), and then runs the
// program the rest of PATH would have found. Logging "clean" as well as
// "leaked" is what lets a test prove the spy was in the way at all: a spy that
// never ran would report no leaks too.

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Put a spy for each of `names` in `dir`. `searchPath` is the PATH the real
 * programs are found on (the caller's own, stand-ins included). Put `dir`
 * first on the PATH of the run under test. Answers a function that reads the
 * log's lines.
 */
export function secretSpies(dir, names, log, searchPath) {
  mkdirSync(dir, { recursive: true });
  for (const name of names) {
    const real = execFileSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8', env: { PATH: searchPath } }).trim();
    writeFileSync(
      path.join(dir, name),
      '#!/bin/sh\n' +
        `if [ -n "$GITMARGIN_SECRET$GITMARGIN_VERCEL_BYPASS" ]; then echo "${name} leaked" >> "${log}"; else echo "${name} clean" >> "${log}"; fi\n` +
        `exec "${real}" "$@"\n`
    );
    chmodSync(path.join(dir, name), 0o755);
  }
  return () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []);
}
