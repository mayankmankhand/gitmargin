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
| `tests/overlay-rethink.spec.js` | Playwright | the redrawn overlay (issue #21): the light/dark switch, initials and colours, pin placement, the sheet's links to the pins, Unread, open state across a rebuild |
| `tests/theme.test.js`, `tests/author.test.js` | node:test | the luminance maths behind the switch, and the initials and colour a chip carries |
| `tests/screens.spec.js` | Playwright | a prototype with more than one screen (issue #24): a comment's pin stays on the screen it was made on, and the light/dark look follows a page that changes after load |
| `tests/anchor.test.js` | node:test | the screen comparison behind "a lookalike counts only on its own screen" |

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

**The three part-1 test files are a tripwire.** Shared comments were built under the rule that
`tests/roundtrip.spec.js`, `tests/cli-roundtrip.spec.js` and `tests/cli.test.js` pass with zero edits, since a page
attached without `--service` must behave exactly as before. It caught one real regression on the way. New behaviour
gets new files. The issue #21 rethink was the one deliberate part-1 change. The list moved into a sheet behind the
count badge, the name field moved under the identity chip, and a row click now opens the thread. So two of the three
files were edited, under a stated rule: a class-name swap, one added "open" click, a card assertion becoming the same
comment's thread assertion, or an assertion on a removed control becoming the same assertion on its replacement.
Every edit is listed in that plan's Outcomes, no assertion changed what it checks beyond those, and
`tests/cli.test.js` was not touched. Issue #24 is the second, and it is one assertion in `tests/roundtrip.spec.js`:
the overlay now measures the page again when it changes, so the dark shell that test adds after load gives the
overlay its dark look, and the ring outside the frame is two pixels rather than one. The test still checks what it
was written for, that the frame reads on a dark shell, and the change was approved in that plan before it was made.

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
