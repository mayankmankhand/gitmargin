# Project Instructions for Claude

<!-- This file is YOURS. Add your project-specific info below. -->
<!-- Toolkit rules live in .claude/rules/toolkit.md (managed by the toolkit, auto-discovered by Claude). -->
<!-- See README.md > "How It Works" for details on how these files connect. -->

## About This Project
<!-- Describe your project: what it is, what it does, what tech stack it uses -->

**gitmargin** — Google-Docs-style comments on private HTML prototypes, reusing the access control
the team already has (GitLab/GitHub login or corporate SSO) instead of inventing a new account
system. See `README.md` for the problem statement and design direction, and
`research/prior-art-landscape.md` for the landscape research (what others tried, hosting options
inside big companies, likely users).

Status: v0 decided (2026-09-02), code not started. v0 = a comment overlay (one script tag on the
author's own HTML, gitmargin never hosts) + a small gitmargin server on Vercel Functions + Neon Postgres
(OpenID Connect sign-in, GitLab first; the comment record; one-way mirrors to the Slack thread and GitLab
issue; a batch API for agents) + `npx gitmargin publish`. Dogfood 1 is gitlab.com Pages. The full decision,
reasoning, and out-of-scope list: `docs/v0-decision.md`.

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
- Don't re-derive the landscape research — reuse `research/prior-art-landscape.md` and the
  research log in `PRIVATE-NOTES.md`.
- Working on `main` is fine for docs and small changes; branch for anything experimental.

## Skills

Review capabilities live in `.claude/skills/` as SKILL.md files. They auto-create slash commands and are discoverable by subagents. Shared reference files in `.claude/skills/shared/`. Use `/review` for unified auto-detected review or individual `/review-code`, `/review-ux`, etc. for focused reviews.
