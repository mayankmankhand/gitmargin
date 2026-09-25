# Changelog

Notable changes to gitmargin are recorded here, in the form of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The versions are the Claude Code plugin's, from `plugin/.claude-plugin/plugin.json`: an installed plugin updates only when that number changes, so every change to a shipped file under `plugin/` gets a version and an entry. Nothing is published to npm yet; the commands run from the plugin or from a clone.

## [Unreleased]

## [0.2.1] - 2026-09-25

### Fixed

- `gitmargin identity` warns about attaching a copy again only when that copy's overlay predates sign-in, in words that match the reading rule ([#30](https://github.com/mayankmankhand/gitmargin/issues/30)).
- `gitmargin attach` on a Vercel same-project deployment names the address reviewers get and Vercel's login as the gate, claims nothing about the login when its check did not run, and keeps the not-found line for a page too large to store ([#30](https://github.com/mayankmankhand/gitmargin/issues/30)).
- The count badge's tooltip says what it does and follows the comments list's state, so a reviewer who closed the list can see how to reopen it ([#30](https://github.com/mayankmankhand/gitmargin/issues/30)).

### Security

- The markdown that `gitmargin pull` and Copy for author hand a coding agent folds every field of a comment, so no field a key holder controls can open a line of its own.
- A reviewer's sign-in pass stays in memory on GitHub Pages and on GitLab Pages, where every site of one owner can share one browser storage.
- `gitmargin attach` refuses a symbolic link at its output name instead of writing through it.
- The comment service enforces the version cap inside its insert, as the other caps already were.

### Changed

- The repository is public: a license, contributing guide, security policy, code of conduct, issue forms, CI, Dependabot, a roadmap and a screenshot; the plugin guide no longer suggests allowing `gitmargin-publish` everywhere.
- Node.js 20 or newer is required. The manifest, the guides and the setup message said 18 while Playwright and the comment service already needed 20.

## [0.2.0] - 2026-09-24

### Added

- GitLab Pages as a share channel ([#37](https://github.com/mayankmankhand/gitmargin/issues/37)). `/gitmargin:share` publishes a private gitlab.com project's prototype to a page only the project's members can open, after GitLab's own login, from a branch of its own, and says how many seconds GitLab's build took.
- The one-line service setup ([#36](https://github.com/mayankmankhand/gitmargin/issues/36)). One command, run in the author's own terminal, logs in to Vercel, makes the project and the Neon database, makes the author secret, deploys the service and checks that it proves it holds the secret. Nothing needs restarting afterwards.

### Changed

- Trust by proof ([#33](https://github.com/mayankmankhand/gitmargin/issues/33)). Every command sends the author secret only to a service that first proves it holds it, by answering a fresh challenge. A typed address, the saved list of services and `GITMARGIN_SERVICE` unlock nothing on their own.

## [0.1.0] - 2026-09-23

### Added

- The plugin's first release ([#16](https://github.com/mayankmankhand/gitmargin/issues/16)): build rules that keep comments on their step; `/gitmargin:share` to a file, the service link or GitHub Pages; reading the comments back and marking each one applied or rejected; `gitmargin check`; `gitmargin-publish`.
