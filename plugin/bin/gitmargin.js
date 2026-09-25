#!/usr/bin/env node
// gitmargin, part 1: the two commands that bracket a review round.
//
//   attach  puts the overlay into one HTML file and stamps a version id
//   pull    reads the comments back out in a form a coding agent can act on
//   check   says, offline, what in a prototype will not survive its host (issue #16)
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
import { attachLive, listServices, pullLive, removeComment, setIdentityMode, setStatus } from '../src/cli/live.js';
import { check } from '../src/cli/check.js';
import { CliError, EXIT_OK, EXIT_USAGE } from '../src/cli/errors.js';

const USAGE = `gitmargin - comments on one HTML prototype, in a form an agent can act on

Two ways to run it (it is not on npm):
  Installed through the Claude Code plugin:  gitmargin <command>
    in Claude Code's shell, with the overlay already built.
  From a clone of the repo:  node bin/gitmargin.js <command>
    Build the overlay once first: npm install && npm run build
The lines below use the clone form. With the plugin, type gitmargin in place of
node bin/gitmargin.js.

Usage
  node bin/gitmargin.js attach <prototype.html>        write a copy with the overlay in it
  node bin/gitmargin.js pull <reviewed.html> [more...] print the comments as JSON
  node bin/gitmargin.js check <prototype.html>         say what will not survive the host
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

check
  Reads one prototype, offline, and prints what will break where it is going:
  files next to it that will not travel with it, links to other pages, a
  Content-Security-Policy tag, path routing, unguarded browser storage and a
  page too large to store (the service link), with a one-line fix for each.
  Exits 0 whenever it ran, findings or not.

    --channel file|service-link|github-pages|gitlab-pages   only what affects that host
    --json       print {file, channel, findings} instead of lines

Shared comments (optional; needs a comment service you deployed, see service/README.md)
  node bin/gitmargin.js attach <prototype.html> --service <address>
      Registers the prototype and this version with your service and writes the
      address and a page key into the copy, so everyone who opens it sees the
      same comments. Later attaches need only --service. --key <key> reuses a
      prototype from another machine. Needs the author secret: GITMARGIN_SECRET,
      or else the file "secret" in the settings folder (see services).
      The secret is only ever sent to a service that first proves it holds
      it (service/API.md, "The proof of trust"), however the address reached
      this command. --require-trusted also refuses, sending nothing, an
      address this machine has not seen prove itself before.
      Behind Vercel's protection (same-project mode), set GITMARGIN_SERVICE to
      the address and GITMARGIN_VERCEL_BYPASS to the project's Protection
      Bypass for Automation; the bypass goes to that address only.
  node bin/gitmargin.js pull <prototype.gitmargin.html> --live
      Reads the comments for that copy's version from the service. --version
      <id> or --all for other versions. More files after it merge in as usual.
  node bin/gitmargin.js status <prototype.gitmargin.html> <comment-id> <status>
      open, accepted, rejected or applied. Reviewers see it on their page.
  node bin/gitmargin.js remove <prototype.gitmargin.html> <comment-id>
      Removes anyone's comment. Both need the author secret.
  node bin/gitmargin.js services [--json]
      The settings folder, the comment services this machine trusts, whether
      the author secret is set and where from (never its value), and whether
      the service copy in the settings folder differs from the one that came
      with this command line (after a plugin update: deploy it again). Sends
      nothing.
  node bin/gitmargin.js identity <prototype.gitmargin.html> <none|gitlab|github> [--members <group>] [--read open|members]
      Who may comment. gitlab: people sign in and comment under their real GitLab
      name; --members limits it to one GitLab group (its full path). github:
      the same with GitHub; --members owner/repo limits it to people GitHub
      lets open that repository. --read members hides the comments from
      everyone else too. none: typed names, as before. Each run
      replaces the whole setting, so repeat every flag you still want. Needs
      the author secret, and a GitLab application or GitHub App set up on the
      service (service/README.md). Every change signs everyone out.

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
    case 'identity':
      return setIdentityMode(rest);
    case 'check':
      return check(rest);
    case 'services':
      return listServices(rest);
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
