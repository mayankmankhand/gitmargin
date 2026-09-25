# Security

gitmargin runs nothing and holds nothing: the comment service is deployed to the author's own Vercel account, and a plain attached file talks to no server at all. That shapes what a security problem here looks like. This page says what counts, how to report it, and the three things that are by design and not bugs.

## What is in scope

- **The comment service** (`service/`): every route in `service/API.md`, the page key, the author secret, the proof of trust (`POST /api/prove`), the limits, and sign-in with GitLab or GitHub.
- **The CLI's handling of the author secret and the Vercel bypass** (`src/cli/`, `bin/gitmargin.js`): the secret is meant to reach only a service that has first proved it holds the same secret, and `GITMARGIN_VERCEL_BYPASS` follows the same rule. A way to make a command send either to an address someone else chose is a bug.
- **The overlay running inside a prototype** (`src/overlay/`, built into `dist/gitmargin.js`): it runs next to the prototype's own script, reads comments other people wrote, and must never run script from a comment, from the page or from the service's answers.
- **The publishers to GitHub Pages and GitLab Pages** (`gitmargin-publish`, `plugin/scripts/publish-*.mjs`): they push to a branch of their own and must leave the author's branches, files and other settings alone.

Examples of what to report: a page key that opens another prototype's comments; an author call the service answers without the secret; a comment whose text runs as script on a reviewer's page; a proof of trust that a service without the secret can pass; a publisher that changes something it says it does not.

## How to report

Use GitHub's private vulnerability reporting on this repository: open the **Security** tab and choose **Report a vulnerability**. That reaches the maintainer and nobody else.

Until that is switched on, open a GitHub issue that says only **"security, please contact me"** and nothing else: no details, no addresses, no keys. The maintainer will contact you through the address on your GitHub profile, so the details stay private.

Whichever route you use, never paste a page key (`gm_...`), an author secret, a Vercel bypass, or an attached copy (`*.gitmargin.html`, which carries a key).

## Supported versions

Two things are supported: the `main` branch, and the latest version of the Claude Code plugin, the one in `plugin/.claude-plugin/plugin.json`. Nothing is published to npm yet. An older plugin version gets no fix; `/plugin update gitmargin@gitmargin` brings the latest, and the next `/gitmargin:share` says if the comment service needs deploying again.

## What to expect

This is a solo project. A report is acknowledged within a week, best effort, and the reply says what happens next and roughly when. A fix ships on `main` and, when the plugin is affected, as a new plugin version with a line in `CHANGELOG.md`. Credit goes to the reporter unless they ask otherwise.

## Not bugs: three things that are by design

These are documented in [README.md](README.md), [service/README.md](service/README.md) and [docs/claude-code.md](docs/claude-code.md). They are trade-offs the author of a prototype chooses, so please do not report them.

1. **Without sign-in, the page key is the only gate.** A page attached with `--service` carries a key, and whoever can open the page has it. So anyone who can open the page can read and write its comments, under any name they type. If the page is public, the key is public. Sign-in with GitLab or GitHub, set per prototype with `gitmargin identity`, is the answer when that matters.
2. **Stored copies on the service sit behind the key, not behind the host's login.** Attaching with `--service` uploads a copy of the page to the author's service, which is how older versions stay openable from the Version line. That copy opens for anyone holding its link and the key, even when the page itself sits behind GitLab's login or a password on Vercel. When the page must stay behind the host's login, the answers are part 1 without `--service`, or same-project mode on Vercel.
3. **GitHub Pages is public.** A page published there can be opened, and commented on, by anyone on the internet, and its key stays in the `gitmargin-pages` branch's history even after the page is removed. `/gitmargin:share` says so before it publishes there for the first time.
