## What changed and why

<!-- One or two short paragraphs. Say what a reader will see differently, and why. Link the issue if there is one. -->

## Checklist

- [ ] `npm test` is green. It builds the overlay, then runs the Node tests and the Playwright suite; Chromium is required.
- [ ] `npm run build:plugin` was run if anything under `bin/`, `src/cli/`, `src/overlay/` or `service/` changed, so `plugin/` matches the sources.
- [ ] The plugin version in `plugin/.claude-plugin/plugin.json` was bumped if any shipped file under `plugin/` changed, and `CHANGELOG.md` has a line for it under Unreleased.
- [ ] The diff carries no attached copy (`*.gitmargin.html`), no page key, no author secret and no Vercel bypass.
- [ ] If a skill under `plugin/skills/` changed, the rehearsals in `tests/plugin-evals/README.md` it could touch were rerun, and the result is noted above.
- [ ] If `tests/roundtrip.spec.js`, `tests/cli-roundtrip.spec.js` or `tests/cli.test.js` changed, the change to the plain-file workflow is deliberate and explained above.
