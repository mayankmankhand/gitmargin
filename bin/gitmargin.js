#!/usr/bin/env node
// gitmargin, part 1: the two commands that bracket a review round.
//
//   attach  puts the overlay into one HTML file and stamps a version id
//   pull    reads the comments back out in a form a coding agent can act on
//
// Only the author ever runs these. A reviewer only ever opens an HTML file, so
// nothing here needs to be installed anywhere but this machine. Node and
// nothing else: no runtime dependencies, by design (docs/v0-split.md section 2).
//
// stdout carries the ANSWER and nothing else - the output path from `attach`,
// the batch from `pull` - because the whole point of `pull` is that something
// else reads it. Every note, warning, and error goes to stderr.

import { attach } from '../src/cli/attach.js';
import { pull } from '../src/cli/pull.js';
import { CliError, EXIT_OK, EXIT_USAGE } from '../src/cli/errors.js';

const USAGE = `gitmargin - comments on one HTML prototype, in a form an agent can act on

Usage
  gitmargin attach <prototype.html>          write a copy with the overlay in it
  gitmargin pull <reviewed.html> [more...]   print the comments as JSON
  gitmargin help                             this text

attach
  Writes <name>.gitmargin.html next to the original and stamps a version id
  derived from the file's contents. The original is never modified. Send the
  copy to your reviewer, any way you like.

pull
  Reads files a reviewer sent back, or a "Copy for author" text block. Pass -
  to read that block from standard input. Several inputs merge into one batch
  by comment id, so two reviewers become one list.

    --markdown   print the human rendering instead of JSON

Exit codes
  0  success
  1  usage error
  2  refused: the input or the build would produce a broken file`;

async function main(argv) {
  const [command, ...rest] = argv;

  switch (command) {
    case 'attach':
      return attach(rest);
    case 'pull':
      return pull(rest);
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(`${USAGE}\n`);
      return EXIT_OK;
    case undefined:
      throw new CliError('No command given.', EXIT_USAGE, 'Try: gitmargin help');
    default:
      throw new CliError(`Unknown command: ${command}`, EXIT_USAGE, 'Try: gitmargin help');
  }
}

try {
  process.exitCode = (await main(process.argv.slice(2))) ?? EXIT_OK;
} catch (error) {
  if (error instanceof CliError) {
    // A CliError is a message for a human, not a crash. No stack trace: the
    // stack is noise when the problem is "that file has no <head>".
    process.stderr.write(`gitmargin: ${error.message}\n`);
    if (error.hint) process.stderr.write(`${error.hint}\n`);
    process.exitCode = error.code;
  } else {
    throw error;
  }
}
