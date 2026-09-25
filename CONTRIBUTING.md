# Contributing to gitmargin

gitmargin puts Google-Docs-style comments on HTML prototypes and turns them into a batch a coding agent can act on. Bug reports, questions and pull requests are welcome. This page says how the repository is put together, what to run before you open a pull request, and the few rules that keep the pieces honest with each other. [README.md](README.md) says what the project is for.

## Build it

You need Node.js 20 or newer and git (Playwright, which the tests use, needs 20). Nothing is on npm yet, so everything runs from a clone:

```bash
git clone https://github.com/mayankmankhand/gitmargin.git
cd gitmargin
npm install && npm run build
```

`npm run build` bundles `src/overlay/` into one self-contained file, `dist/gitmargin.js`, which `gitmargin attach` writes into a copy of a prototype. The build is pinned to `--target=es2020` on purpose: without a target the minifier picks the browser floor itself, and it did once.

The pieces:

| Folder | What it is |
|---|---|
| `src/overlay/` | the comment overlay that runs inside a prototype |
| `src/cli/`, `bin/gitmargin.js` | the author's commands: `attach`, `pull`, `check`, `status`, `identity` and the rest |
| `service/` | the comment service, its own Vercel project root, with one runtime dependency (the Neon driver, used in one adapter file) |
| `plugin/` | the Claude Code plugin an author installs |
| `tests/`, `service/tests/` | the tests |
| `docs/` | the decisions and the formats, including `docs/batch-format.md`, which is what the agent reads |

## The plugin's generated files

`plugin/` is what authors install, and an installed plugin cannot read files outside its own folder. So `scripts/sync-plugin.js` copies four paths into it from the sources: `plugin/bin/gitmargin.js`, `plugin/src/`, `plugin/dist/` and `plugin/service/`. **Never edit those four by hand.** After any change to `bin/`, `src/cli/`, `src/overlay/` or `service/`, run:

```bash
npm run build:plugin
```

If you forget, the last test in `tests/plugin.test.js` fails and names the file that drifted. The same rule is why Dependabot watches only the root and the workflow: the service's one dependency is updated by hand (`npm update` in `service/`), then `npm run build:plugin` and a version bump, which is what ships it. Everything else in `plugin/` is written by hand: the manifest in `plugin/.claude-plugin/`, the two shell launchers in `plugin/bin/`, the scripts in `plugin/scripts/`, and the skills.

## Test it

```bash
npm test
```

That builds the overlay, runs the Node tests in `tests/*.test.js` and `service/tests/*.test.js` (the CLI and the service, no browser), then runs the Playwright suite in `tests/*.spec.js`. The browser tests open the fixtures from `file://`, because that is how a reviewer receives a prototype. The service tests run the real service over an in-process Postgres, so they need no Neon account and no network.

Chromium is required. Firefox and WebKit are optional and run when they can start on your machine:

```bash
npx playwright install chromium          # required
npx playwright install firefox webkit    # optional
```

[tests/README.md](tests/README.md) lists every test file and what it covers, and explains the browser probe and `GM_BROWSERS`.

### Three files are a tripwire

`tests/roundtrip.spec.js`, `tests/cli-roundtrip.spec.js` and `tests/cli.test.js` cover the plain-file workflow: a page attached without `--service`, opened from disk, sent back as a file or a text block. They pass with zero edits unless a change to that workflow is deliberate and written down, in the pull request and in the issue that decided it. A change that needs one of them edited has changed part 1, and that is worth noticing. New behaviour gets new test files.

### The skills have no unit test

The three skills under `plugin/skills/` are prompt files Claude follows, so no test can prove them. An edit to one reruns the headless rehearsals in [tests/plugin-evals/README.md](tests/plugin-evals/README.md): every scenario the edit could touch, with stand-in `gh`, `glab` and `vercel` commands, never against a real account. Say in the pull request which scenarios you reran.

## The service has one contract

[service/API.md](service/API.md) is the contract. The CLI and the overlay are both written against that file, not against each other, so a change to what the service answers starts there. Everything the service does goes through `route()` in `service/src/router.js`, which takes a plain request and imports no package: Vercel and the tests run the same code, with the database passed in as `query(sql, params)` and the clock as `now()`.

## Keys and secrets

Never commit a copy attached with `--service`. Such a copy (`*.gitmargin.html`, which git ignores for this reason) carries a service address and a page key, and whoever has the key can read and write that prototype's comments. The author secret lives in `~/.config/gitmargin/secret` or `GITMARGIN_SECRET` and in Vercel's settings, never in a file in this repository. The same goes for issues and pull requests: no keys, no secrets, no Vercel bypass, no attached copies. For a security problem, read [SECURITY.md](SECURITY.md) instead of opening a public issue.

## File an issue

Use the issue forms. A bug report asks what happened, what you expected, which channel the page was shared on, the browser, and the output of `gitmargin check`. A feature request asks for the problem before the idea. For a setup question, read [Running it today](README.md#running-it-today) and [docs/claude-code.md](docs/claude-code.md) first.

## Open a pull request

1. Branch from `main`. Commit messages start with a verb and keep the first line under 50 characters.
2. `npm test` is green.
3. `npm run build:plugin` was run if anything under `bin/`, `src/cli/`, `src/overlay/` or `service/` changed.
4. The plugin version was bumped if a shipped file under `plugin/` changed (the rule below), and `CHANGELOG.md` has a line for it under Unreleased.
5. The diff carries no attached copy and no secret.
6. Say what changed and why, in plain English. The pull request template asks the same questions.

## The plugin version rule

Any change to a shipped file under `plugin/` bumps `version` in `plugin/.claude-plugin/plugin.json`. An installed plugin updates only when that number changes, so a change without a bump never reaches anyone who already installed it. `tests/plugin.test.js` compares `plugin/` with `main` and fails when something under it changed while the version stayed the same. The four generated paths count as shipped files, so a change to the overlay, the CLI or the service bumps the plugin too, once it is synced.
