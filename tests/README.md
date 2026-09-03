# Tests

```bash
npm test        # builds the overlay, then runs the suite
```

The suite opens `fixtures/wizard.html` from a `file://` URL, because that is how a
reviewer receives a prototype in part 1. Nothing here starts a server.

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
