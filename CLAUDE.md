# Project Instructions for Claude

<!-- This file is YOURS. Add your project-specific info below. -->
<!-- Toolkit rules live in .claude/rules/toolkit.md (managed by the toolkit, auto-discovered by Claude). -->

## About This Project
<!-- Describe your project: what it is, what it does, what tech stack it uses -->

**gitmargin**: Google-Docs-style comments on HTML prototypes that a coding agent can act on. The
destination is comments on *private* prototypes reusing the access control the team already has
(GitLab/GitHub login or corporate SSO); the first step is much smaller. See `README.md` for the
problem statement, `research/prior-art-landscape.md` for the landscape research (what others tried,
hosting options inside big companies, likely users), and `research/agent-feedback-formats.md` for
what existing tools hand to agents.

Status: v0 decided 2026-09-02 and split into two parts the same day. **Part 1's overlay is built and
tested** (issue #3): a reviewer opens the prototype from disk, clicks an element or highlights text,
says what they expected, and the comments come back as the file with them embedded or as a clipboard
text block. Each comment records where they were (anchor, click trail, screen name, viewport) and
why they stopped. **`gitmargin attach` and `pull` are built and tested** (issue #5): run from the repo as
`node bin/gitmargin.js <command>`, not published to npm. What remains in part 1: a dogfood round with two
reviewers (issue #6), which is scoped and ready to run: a designer and an engineer, on the Sony onboarding
fixture, with the file to send at `fixtures/onboarding.gitmargin.html`. The one gap found by using it, that
comment mode did not show what a click would attach to, was issue #10 and is closed: a one-pixel frame follows
the pointer and shows the element a click will anchor, snapped to the nearest control or named block
(`docs/v0-split.md` section 2).
**Shared live comments are built** (issue #15): a comment service in `service/` that each author deploys to their own
Vercel account with Neon Postgres. `attach --service <address>` registers the prototype and version, uploads a copy of
the page, and writes the address and a page key into the copy; the overlay then saves locally first and syncs about
every 5 seconds, and the panel shows authors, replies, a read-only status badge and a Version line that opens older
versions. `pull --live`, `status` and `remove` are the author's commands. There is no sign-in: the key in the page is
the only gate. A page attached without `--service` never reaches the network. `service/API.md` is the contract the
CLI and the overlay are both written against; `service/README.md` has the deploy steps and the plain-English warnings.
A reviewer needs Chrome or Edge 88, Firefox 85, or Safari 15.4; anything older now says so on the page
rather than failing silently (`docs/v0-split.md` section 5). **Part 2** (parked) = sign-in (GitHub in issue #17, GitLab through the
company login in #18), a publishing plugin (#16), Vercel same-project mode (#19), the Slack mirror, the phone mode, and
the four spikes. The GitLab-issue mirror is retired: comments are shown on the page. The split and the reasons: `docs/v0-split.md`; the original decision and the
out-of-scope list: `docs/v0-decision.md`; the batch an agent reads: `docs/batch-format.md` (v0.5, wire 0.1).

## Working on the overlay

`npm run build` bundles `src/overlay/` into one self-contained `dist/gitmargin.js`, pinned to
`--target=es2020`: without a target the minifier picks the browser floor itself, and it did. `npm test`
builds, then runs the `node --test` suite in `tests/*.test.js` (the CLI, no browser), then the Playwright
suite in `tests/*.spec.js`, which opens the fixtures from `file://` because that is how a reviewer
receives a prototype. Chromium is required; Firefox and WebKit run when they can start on this machine
(`tests/README.md` has the detail, including why WebKit is untested here). `npm run serve` is only for
design screenshots, since the toolkit's browser script cannot open a local file.

## Working on the comment service

`service/` is its own Vercel project root with one runtime dependency (the Neon driver, used by one adapter file).
Everything goes through `service/src/router.js`, which takes a plain request and imports no package, so Vercel and the
tests run the same code; the database arrives as `query(sql, params)` and the clock as `now()`. Tests use an in-process
Postgres, so they need no Neon and no network. Never commit a copy attached with `--service`: it carries a service
address and a page key (`*.gitmargin.html` is ignored for this reason too). The author secret lives in the environment
and in Vercel's settings, never in a file in this repo. The three part-1 test files (`tests/roundtrip.spec.js`,
`tests/cli-roundtrip.spec.js`, `tests/cli.test.js`) are a tripwire for the plain-file workflow: a change that needs one
of them edited has changed part 1.

## Who I Am
<!-- Describe yourself or your team: experience level, how you like to work -->

Mayank, a product manager. I build with AI tools and can read code but don't write it
professionally. Explain things simply, in plain English, and tell me why, not just what.

## My Preferences
<!-- Add project-specific rules, coding conventions, or preferences here -->

- **Read `PRIVATE-NOTES.md` first** at the start of every session in this repo. It is gitignored
  and must never be committed, pushed, quoted in the README, or published in any HTML artifact.
  Before any commit, confirm `git status` does not list it.
- Keep `PRIVATE-NOTES.md` updated with decisions; keep the public-facing files (README, research)
  free of anything marked private in it.
- Don't re-derive the landscape research - reuse `research/prior-art-landscape.md` and the
  research log in `PRIVATE-NOTES.md`.
- Working on `main` is fine for docs and small changes; branch for anything experimental.

## Skills

The toolkit runs as the `tk` Claude Code plugin (since issue #12; audited at 7.3.0 in issue #14), so its commands carry the `tk:` prefix and only its seeded rules file and state record live in this repo. Use `/tk:review` for a unified auto-detected review, or a single lens such as `/tk:review-code` or `/tk:review-ux`. On a new machine, install the plugin and put the debate API keys in `~/.claude/plugins/.env.local`, which is where its scripts look.
