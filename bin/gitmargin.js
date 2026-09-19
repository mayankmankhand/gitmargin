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
import { attachLive, pullLive, removeComment, setStatus } from '../src/cli/live.js';
import { CliError, EXIT_OK, EXIT_USAGE } from '../src/cli/errors.js';

const USAGE = `gitmargin - comments on one HTML prototype, in a form an agent can act on

Not on npm, so run these from the repo. Build the overlay once first:
  npm install && npm run build

Usage
  node bin/gitmargin.js attach <prototype.html>        write a copy with the overlay in it
  node bin/gitmargin.js pull <reviewed.html> [more...] print the comments as JSON
  node bin/gitmargin.js help                           this text

  npm run attach -- <prototype.html>                   the same, through npm
  npm run pull -- <reviewed.html>

attach
  Writes <name>.gitmargin.html next to the original and stamps a version id
  derived from the file's contents. The original is never modified. Send the
  copy to your reviewer, any way you like.

pull
  Reads files a reviewer sent back, or a "Copy for author" text block. Pass -
  to read that block from standard input. Several inputs merge into one batch
  by comment id, so two reviewers become one list.

    --markdown   print the human rendering instead of JSON

Shared comments (optional; needs a comment service you deployed, see service/README.md)
  node bin/gitmargin.js attach <prototype.html> --service <address>
      Registers the prototype and this version with your service and writes the
      address and a page key into the copy, so everyone who opens it sees the
      same comments. Later attaches need only --service. --key <key> reuses a
      prototype from another machine. Needs GITMARGIN_SECRET in the environment.
      The secret is only ever sent to an address you typed here yourself, or
      named in GITMARGIN_SERVICE: never to one that only a file names.
  node bin/gitmargin.js pull <prototype.gitmargin.html> --live
      Reads the comments for that copy's version from the service. --version
      <id> or --all for other versions. More files after it merge in as usual.
  node bin/gitmargin.js status <prototype.gitmargin.html> <comment-id> <status>
      open, accepted, rejected or applied. Reviewers see it on their page.
  node bin/gitmargin.js remove <prototype.gitmargin.html> <comment-id>
      Removes anyone's comment. Both need GITMARGIN_SECRET.

Exit codes
  0  success
  1  usage error
  2  refused: the input or the build would produce a broken file`;

async function main(argv) {
  const [command, ...rest] = argv;

  // The commands that reach a comment service live in src/cli/live.js and are
  // chosen by an explicit flag. Without the flag, `attach` and `pull` run the
  // same code they always did and never touch the network.
  switch (command) {
    case 'attach':
      return rest.includes('--service') || rest.includes('--key') ? attachLive(rest) : attach(rest);
    case 'pull':
      return rest.includes('--live') ? pullLive(rest) : pull(rest);
    case 'status':
      return setStatus(rest);
    case 'remove':
      return removeComment(rest);
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
