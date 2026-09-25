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
(`docs/v0-split.md` section 2). **The overlay was redrawn in issue #21** (2026-09-22): a teardrop pin with the
author's initials marks the spot, the thread opens beside the element, every comment lives in a sheet behind the count
badge (grouped by screen, with All, Unread and Mine), and one floating pill holds comment mode, the badge and the
identity chip. The look is Marker on a light page and Graphite on a dark one, measured from the page itself by
`src/overlay/theme.js`; `DESIGN-PROFILE.md` names the system and the retired one. **Issue #24** (2026-09-22): a
comment's pin stays on the screen it was made on, even when every step repeats the same Next button (the saved element
on a hidden step means "on another screen"; a lookalike counts only on the comment's own screen), and the look now
follows a page that turns dark after load. It is the second deliberate part-1 change, one assertion (`tests/README.md`);
the two limits it leaves, and the ones issue #34 leaves, are in `docs/batch-format.md` section 3. **Issue #34**
(2026-09-24): in a prototype that draws every step into the same area (React, a `render()` replacing `innerHTML`), a
visible match at the saved address on another screen is that screen's lookalike when it sits in the box holding that
screen's content (`screenAt` in `src/overlay/screen.js`, `belongsHere` in `src/overlay/anchor.js`), and a shared
element keeps its pin while its words, numbers aside, still match; `screen.js` reads the page's headings, dialogs and
step marker once per task, because `resolve()` runs once per comment on every frame. Tests: `tests/redraw.spec.js` on
`fixtures/redraw.html` (one redraw habit per `window.redrawShape` switch).
**Shared live comments are built** (issue #15): a comment service in `service/` that each author deploys to their own
Vercel account with Neon Postgres. `attach --service <address>` registers the prototype and version, uploads a copy of
the page, and writes the address and a page key into the copy; the overlay then saves locally first and syncs about
every 5 seconds, and the comments carry authors, replies and a read-only status badge; the Version line in the comments
sheet opens older versions. `pull --live`, `status` and `remove` are the author's commands. By default there is no sign-in: the key in the page is
the only gate. A page attached without `--service` never reaches the network. `service/API.md` is the contract the
CLI and the overlay are both written against; `service/README.md` has the deploy steps and the plain-English warnings.
A reviewer needs Chrome or Edge 88, Firefox 85, or Safari 15.4; anything older now says so on the page
rather than failing silently (`docs/v0-split.md` section 5). **Part 2** (in progress; cycles 1, 2 and 3 built, cycle 4's same-project mode built ahead of cycle 3 and its GitLab Pages channel built and walked in #37, the rest parked) = sign-in (GitHub in issue #17, GitLab through the
company login in #18), a publishing plugin (#16), Vercel same-project mode (#19), the Slack mirror, the phone mode, and
the four spikes. **Part 2 has one design since 2026-09-19, in `docs/part-2-design.md`:** read it before touching sign-in or
publishing, and do not restate it elsewhere. It is built in four cycles; **cycle 1, the sign-in core plus GitLab, is built (issue #18):** `gitmargin identity <copy> gitlab --members <group> [--read members]` sets the mode on the service, never in the page; the overlay signs in through a pop-up and a confirm page; `service/src/signin.js` holds the flow; tests run against `tests/helpers/fake-gitlab.js`. **Cycle 2, the GitHub plug, is built and walked (issue #17, 2026-09-23):** `identity <copy> github [--members owner/repo]` through a GitHub App the author creates with no permissions (the repository rule needs one: Metadata, read-only, and the App installed on that repository), a second entry in `PROVIDERS` in `signin.js`, tests against `tests/helpers/fake-github.js`; the overlay changed only its no-access line, which names a repository for GitHub. **Same-project mode is built and walked (issue #19, 2026-09-23):** a deployment with `GITMARGIN_SAME_PROJECT=1` serves its one prototype as its own site behind Vercel's protection; the CLI passes Vercel's wall with `GITMARGIN_VERCEL_BYPASS` (same trust rule as the author secret); tests run behind `tests/helpers/vercel-wall.js`. **Cycle 3, the Claude Code plugin, is built and walked (issue #16, 2026-09-23):** `plugin/` installs as `gitmargin@gitmargin` with three skills (build rules, `/gitmargin:share` to a file, the service link or GitHub Pages, and pull); its commands arrived with it: `gitmargin check`, `gitmargin services`, `attach --require-trusted`, and `gitmargin-publish`. The author's guide is `docs/claude-code.md`; its follow-ups #33 (trust) and #36 (first-time setup; the walk's first share took two terminals, a browser, three hand-offs and a restart) are built, below. **The GitLab Pages channel is built and walked (issue #37, 2026-09-24; a publish took 31 to 37 seconds from the push, the #2 timing spike's first answer):** `gitmargin-publish` picks the host from the remote; on gitlab.com (private projects only) `plugin/scripts/publish-gitlab.mjs` pushes `public/<name>/index.html` and a build file to `gitmargin-pages`, sets Pages to members only with `--enable` before the push, and follows the build through `glab` with host and token variables stripped; the host-free half is `publish-core.mjs`; tests run against `tests/helpers/fake-glab.cjs`. **One-line setup and trust by proof are built and walked (issues #33 and #36, 2026-09-24, plugin 0.2.0, PR #40; on a new WSL Ubuntu and a new Vercel account, first share to live link took one browser login, one command, no restart and 6 min 53 s):** before any request that carries the author secret, the CLI checks `POST /api/prove` (an HMAC over a fresh challenge and the Host header), so a typed address, the saved list and `GITMARGIN_SERVICE` unlock nothing; the secret comes from `GITMARGIN_SECRET` or `~/.config/gitmargin/secret`, so nothing restarts; `node plugin/scripts/setup.mjs` (logic in `src/cli/setup.js`, printed by `gitmargin services --json` as `setupCommand`) is the author's one command in their own terminal, refuses without a terminal or with an agent marker, and never replaces a secret without a yes; tests run against `tests/helpers/fake-vercel.cjs`, and a test in `tests/plugin.test.js` fails when `plugin/` changes without a version bump. This session may not write saved secrets or deploy to a production address: those lines are the owner's.
The GitLab-issue mirror is retired: comments are shown on the page. The split and the reasons: `docs/v0-split.md`; the original decision and the
out-of-scope list: `docs/v0-decision.md`; the batch an agent reads: `docs/batch-format.md` (v0.9, wire 0.1).

## Working on the overlay

`npm run build` bundles `src/overlay/` into one self-contained `dist/gitmargin.js`, pinned to
`--target=es2020`: without a target the minifier picks the browser floor itself, and it did. `npm test`
builds, then runs the `node --test` suite in `tests/*.test.js` (the CLI, no browser), then the Playwright
suite in `tests/*.spec.js`, which opens the fixtures from `file://` because that is how a reviewer
receives a prototype. Chromium is required; Firefox and WebKit run when they can start on this machine
(`tests/README.md` has the detail, including why WebKit is untested here). The toolkit's browser script cannot
open a local file, so `npm run serve` is how it reaches the overlay: design screenshots, the design loop's
interaction checks, and the review's browser checks. It picks a free port and prints the address, which the
toolkit will not find on its usual ports, so hand it that address.

## Working on the Claude Code plugin

`plugin/` is what authors install (`.claude-plugin/marketplace.json` at the root points at it). `scripts/sync-plugin.js`
owns four generated paths, `plugin/bin/gitmargin.js`, `plugin/src/`, `plugin/dist/` and `plugin/service/`, copied from
the sources and never edited by hand: after any change to `bin/`, `src/cli/`, `src/overlay/` or `service/`, run
`npm run build:plugin`, or the last test in `tests/plugin.test.js` fails and names the file. Everything else in
`plugin/` is hand-written: the manifest, the two sh launchers, `scripts/publish-branch.mjs`, and `skills/`. The skills
are prompt files: an edit to one always asks the owner first, and no unit test proves one, so rerun the scenarios in
`tests/plugin-evals/README.md` in headless `claude -p` sessions with stand-in `gh` and `vercel` before calling a skill
change done. `claude plugin validate --strict` checks the manifests, not the skills;
`claude --plugin-dir plugin plugin details gitmargin` lists the skills it can load.

## Working on the comment service

`service/` is its own Vercel project root with one runtime dependency (the Neon driver, used by one adapter file).
Everything goes through `service/src/router.js`, which takes a plain request and imports no package, so Vercel and the
tests run the same code; the database arrives as `query(sql, params)` and the clock as `now()`. Tests use an in-process
Postgres, so they need no Neon and no network. Never commit a copy attached with `--service`: it carries a service
address and a page key (`*.gitmargin.html` is ignored for this reason too). The author secret lives in `~/.config/gitmargin/secret`
(or `GITMARGIN_SECRET`, which wins) and in Vercel's settings, never in a file in this repo, and since issue #33 the CLI
sends it only to a service that first proves it holds it (`POST /api/prove`, an HMAC over a fresh challenge and the
Host): a typed address, `~/.config/gitmargin/trusted-services.json` and `GITMARGIN_SERVICE` unlock nothing, because an
agent can produce all three. The setup line (`plugin/scripts/setup.mjs`) is the author's to run in their own terminal. The three part-1 test files (`tests/roundtrip.spec.js`,
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

The toolkit runs as the `tk` Claude Code plugin (since issue #12; audited at 7.4.3 in issue #23), so its commands carry the `tk:` prefix and only its seeded rules file, state record and `.claude/toolkit/` extensions folder live in this repo. Use `/tk:review` for a unified auto-detected review, or a single lens such as `/tk:review-code` or `/tk:review-ux`. On a new machine, install the plugin and put the debate API keys in `~/.claude/plugins/.env.local`, which is where its scripts look.
