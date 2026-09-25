# Changelog

Notable changes to gitmargin are recorded here, in the form of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The versions are the Claude Code plugin's, from `plugin/.claude-plugin/plugin.json`: an installed plugin updates only when that number changes, so every change to a shipped file under `plugin/` gets a version and an entry. Nothing is published to npm yet; the commands run from the plugin or from a clone.

## [Unreleased]

## [0.2.0] - 2026-09-24

### Added

- GitLab Pages as a share channel ([#37](https://github.com/mayankmankhand/gitmargin/issues/37)). `/gitmargin:share` publishes a private gitlab.com project's prototype to a page only the project's members can open, after GitLab's own login, from a branch of its own, and says how many seconds GitLab's build took.
- The one-line service setup ([#36](https://github.com/mayankmankhand/gitmargin/issues/36)). One command, run in the author's own terminal, logs in to Vercel, makes the project and the Neon database, makes the author secret, deploys the service and checks that it proves it holds the secret. Nothing needs restarting afterwards.

### Changed

- Trust by proof ([#33](https://github.com/mayankmankhand/gitmargin/issues/33)). Every command sends the author secret only to a service that first proves it holds it, by answering a fresh challenge. A typed address, the saved list of services and `GITMARGIN_SERVICE` unlock nothing on their own.

## [0.1.0] - 2026-09-23

### Added

- The plugin's first release ([#16](https://github.com/mayankmankhand/gitmargin/issues/16)): build rules that keep comments on their step; `/gitmargin:share` to a file, the service link or GitHub Pages; reading the comments back and marking each one applied or rejected; `gitmargin check`; `gitmargin-publish`.
