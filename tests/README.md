# Tests

```bash
npm test        # builds the overlay, then runs the suite
```

The suite opens `fixtures/wizard.html` from a `file://` URL, because that is how a
reviewer receives a prototype in part 1. For a plain file, nothing here starts a server.

## What runs

| Files | Runner | What it covers |
|---|---|---|
| `tests/cli.test.js` | node:test | `attach` and `pull` on plain files, no browser |
| `tests/cli-service.test.js` | node:test | `attach --service`, `pull --live`, `status`, `remove`: the real CLI as a separate process |
| `tests/sync.test.js` | node:test | `src/overlay/sync.js` in plain Node: retry, merge, tombstones, pacing, with a clock the test moves |
| `service/tests/router.test.js` | node:test | every route, refusal and limit of the comment service |
| `tests/roundtrip.spec.js`, `tests/cli-roundtrip.spec.js` | Playwright | the part-1 overlay and the attach, comment, pull round trip |
| `tests/shared.spec.js` | Playwright | shared comments between two and three real browsers |
| `tests/signin.spec.js` | Playwright | sign-in with a fake GitLab and a real pop-up |
| `tests/signin-github.spec.js` | Playwright | the same sign-in with a fake GitHub (issue #17): from disk, the stored copy and a web address |
| `tests/same-project.spec.js`, `tests/cli-same-project.test.js`, `tests/sync-same-origin.test.js`, `service/tests/same-project.test.js` | Playwright, node:test | same-project mode (issue #19) behind a stand-in for Vercel's login wall (`tests/helpers/vercel-wall.js`): reviewers who passed it share comments, nothing answers anyone who has not, the command line passes it with the bypass, and a page talks to the address it was opened from |
| `service/tests/signin.test.js`, `service/tests/signin-github.test.js` | node:test | every sign-in rule in `service/API.md`, for GitLab and GitHub, against the two fakes in `tests/helpers/` |
| `service/tests/signin-github-rule.test.js` | node:test | the GitHub repository rule (issue #17's cut line): who counts as having access, and failures that are never a verdict |
| `tests/cli-identity.test.js` | node:test | `identity` for GitLab and GitHub (a group or one `owner/repo`, the refusals, a service with no sign-in app set up), and `pull --live` marking each author verified or typed |
| `tests/overlay-rethink.spec.js` | Playwright | the redrawn overlay (issue #21): the light/dark switch, initials and colours, pin placement, the sheet's links to the pins, Unread, open state across a rebuild |
| `tests/theme.test.js`, `tests/author.test.js` | node:test | the luminance maths behind the switch, and the initials and colour a chip carries |
| `tests/screens.spec.js` | Playwright | a prototype with more than one screen (issue #24): a comment's pin stays on the screen it was made on, and the light/dark look follows a page that changes after load |
| `tests/redraw.spec.js` | Playwright | a prototype that draws every step into the same area (issue #34), on `fixtures/redraw.html` in one redraw habit at a time (`window.redrawShape`: new markup or the same nodes with new words, the title in the card, in its own box, at the top of the page or first in the app's wrapper, a footer every step shares, tagged steps, a dialog step or every step a dialog): a comment's pin stays on its step, while the logo, the help line and a shared footer keep theirs; also a long page whose saved address drifts into another section, a heading straight in the page body, and the Sony wizard's step counter; each rule in `anchor.js` and `screen.js` has a test that fails when that rule alone is broken |
| `tests/anchor.test.js` | node:test | the screen comparison behind "a lookalike counts only on its own screen" |
| `tests/check.test.js` | node:test | `gitmargin check` (issue #16): each rule fires on its trigger and stays silent without it, the channel filter, the JSON output. `tests/cli-service.test.js` also covers `attach --require-trusted` refusing an address this machine has not used, with nothing reaching the service, `gitmargin services`, and the review link `attach` prints |
| `tests/plugin.test.js` | node:test | the Claude Code plugin (issue #16): `scripts/sync-plugin.js` copies only what git would commit, `--check` catches drift, and a copy of `plugin/` outside the repository runs `gitmargin` through its launcher. Its last test fails whenever `plugin/` is out of date with the sources: run `npm run build:plugin` |
| `tests/plugin-evals/README.md` | by hand, `claude -p` | the plugin's three skills (issue #16): the headless scenarios that proved them, what each must show, and how to rerun them without touching real accounts |
| `tests/publish-branch.test.js` | node:test | `gitmargin-publish` (issue #16) against a local bare repository and a stand-in `gh`: the `gitmargin-pages` branch, the author's checkout left untouched, and every refusal before a push |
| `tests/cli-proof.test.js` | node:test | the proof of trust from the CLI's side (issue #33): hostile, relaying and redirecting servers never receive the author secret, the proof is bound to the dialed host, and oversized or silent answers are refused |
| `tests/cli-secret.test.js` | node:test | where the author secret comes from (issue #36): `GITMARGIN_SECRET`, else the secret file, with its mode, size and shape checks, in a scratch config folder |
| `tests/setup.test.js` | node:test | the author's one-command setup (issue #36) against the stand-in `vercel` in `tests/helpers/fake-vercel.cjs`: login, project, database, secret, deploy and the proof check, every refusal, and nothing of gitmargin's reaching the child |
| `tests/sha256.test.js` | node:test | the overlay's synchronous SHA-256 against Node's `crypto` |
| `tests/gitlab-claims-check.test.js` | node:test | the owner's manual GitLab probe (`scripts/gitlab-claims-check.mjs`): it prints claim names and never a secret, a code, a token or a person's name |
| `tests/sync-identity.test.js` | node:test | `src/overlay/sync.js` with sign-in on (issue #18): passes, the fail-safe for an overlay from before sign-in, and tab-only storage on a disk page |
| `tests/pull-fields.test.js` | node:test | every field of a comment folds onto its line in the markdown `pull` prints, whatever line endings it carries (review of #30) |
| `tests/export-fields.spec.js` | Playwright | the same fold in the overlay's Copy for author, on a comment carried by the embedded block |
| `tests/attach-link.test.js` | node:test | `attach` refuses a symbolic link at its output name and leaves the link's target alone |
| `tests/sync-shared-origin.test.js` | node:test | which hosts count as shared browser storage for the sign-in pass (GitHub Pages, GitLab Pages) |
| `tests/publish-gitlab.test.js` | node:test | `gitmargin-publish` on GitLab Pages (issue #37) against a local bare repository and a stand-in `glab` (`tests/helpers/fake-glab.cjs`, copied from what glab 1.119.0 printed): a private project only, `public/<name>/` and a build file on the `gitmargin-pages` branch, Pages set to members only before the push and only with `--enable`, the build of this commit followed, and every refusal before any change |

**The comment service in tests is the real one.** `tests/helpers/service-server.js` runs the same `route` function Vercel
runs, over an in-process Postgres (PGlite, a root dev dependency) on a random loopback port. So the service tests need
no Neon, no Docker, no account and no network, and `npm test` needs no second install. Where a rule is about time (the
write limit, "changed since", polling), the test owns the clock instead of waiting.

**Shared copies are made at test time and never committed.** A copy attached with `--service` carries a service
address and a page key. The tests attach into a temp folder or Playwright's output folder.

**The shared browser tests are slow on purpose.** They wait for real check-ins, about five seconds each, between real
browsers, several in a row, so that spec has a 90 second budget per test instead of the default 30.

**Two fixtures, one light and one dark.** `fixtures/onboarding.html` is the Sony setup flow as `attach` receives it.
`fixtures/onboarding-dark.html` is its twin on a dark ground, same structure and the same `data-gm-screen` stamps, so
any test can run on both. The dark ground is painted on a wrapper `div`, not on `body`, on purpose: that is how most
AI-made prototypes do it, and the overlay's light/dark switch (`src/overlay/theme.js`) has to find it there. The maths
behind the switch runs in `tests/theme.test.js` under Node, on the exact colour strings a browser returns.

**A fixture that redraws one area.** `fixtures/redraw.html` is a three-step checkout with only the step being shown in
the page, the way React and a `render()` that replaces `innerHTML` build one; `window.redrawShape({ ... })` switches it
to one redraw habit at a time, back on step 1, and a reload is always its default shape. Its script sits in `<head>` on
purpose: the quote search reads the page's body, and a script there, carrying every step's words, would answer for a
comment whose element is gone and hide the rule that counts a rejected match as on another screen.

**The three part-1 test files are a tripwire.** Shared comments were built under the rule that
`tests/roundtrip.spec.js`, `tests/cli-roundtrip.spec.js` and `tests/cli.test.js` pass with zero edits, since a page
attached without `--service` must behave exactly as before. It caught one real regression on the way. New behaviour
gets new files. The issue #21 rethink was the first deliberate part-1 change. The list moved into a sheet behind the
count badge, the name field moved under the identity chip, and a row click now opens the thread. So two of the three
files were edited, under a stated rule: a class-name swap, one added "open" click, a card assertion becoming the same
comment's thread assertion, or an assertion on a removed control becoming the same assertion on its replacement.
Every edit is listed in that plan's Outcomes, no assertion changed what it checks beyond those, and
`tests/cli.test.js` was not touched. Issue #24 is the second, and it is one assertion in `tests/roundtrip.spec.js`:
the overlay now measures the page again when it changes, so the dark shell that test adds after load gives the
overlay its dark look, and the ring outside the frame is two pixels rather than one. The test still checks what it
was written for, that the frame reads on a dark shell, and the change was approved in the issue #24 plan before it was made.

## Browsers

Chromium is required and stands in for Edge, which shares its engine. Firefox and
WebKit are optional and run only when they can actually start on this machine:

```bash
npx playwright install chromium          # required
npx playwright install firefox webkit    # optional, widens coverage
```

`npx playwright install` will download WebKit onto a host that cannot run it, so
`playwright.config.js` asks each optional browser for its version and skips the
ones that fail. On WSL and most Linux hosts WebKit needs system libraries that
only root can install:

```bash
npx playwright install --with-deps webkit   # needs sudo
```

The run prints one line saying which browsers were skipped and why. To override
the probe, set `GM_BROWSERS`, for example `GM_BROWSERS=chromium npm test`.

## What was confirmed where

| Browser | Round trip | Download from disk | Clipboard from disk |
|---|---|---|---|
| Chromium 151 | pass | pass | pass |
| Firefox 153 | pass | pass | pass |
| WebKit | not run: host is missing shared libraries | not run | not run |

Recorded 2026-09-02 on WSL2 Ubuntu. `docs/batch-format.md` section 8 carries the
same result as the answer to its first two open points.
