# Project Instructions for Claude

<!-- This file is YOURS. Add your project-specific info below. -->
<!-- Toolkit rules live in .claude/rules/toolkit.md (managed by the toolkit, auto-discovered by Claude). -->
<!-- See README.md > "How It Works" for details on how these files connect. -->

## About This Project
<!-- Describe your project: what it is, what it does, what tech stack it uses -->

**gitmargin**: Google-Docs-style comments on HTML prototypes that a coding agent can act on. The
destination is comments on *private* prototypes reusing the access control the team already has
(GitLab/GitHub login or corporate SSO); the first step is much smaller. See `README.md` for the
problem statement, `research/prior-art-landscape.md` for the landscape research (what others tried,
hosting options inside big companies, likely users), and `research/agent-feedback-formats.md` for
what existing tools hand to agents.

Status: v0 decided 2026-09-02 and split into two parts the same day; code not started. **Part 1**
(next) = a comment overlay on a single HTML file, no server: the reviewer opens the file anywhere,
each comment records where they were (anchor, click trail, screen name) and what they expected, and
the comments come back as the file with comments embedded or as a clipboard text block. `npx gitmargin
attach` and `pull` bracket it; the batch an agent reads is drafted in `docs/batch-format.md`.
**Part 2** (parked) = sign-in via OpenID Connect, the server on Vercel + Neon, the Slack and GitLab
mirrors, publish to GitLab Pages, the phone mode, and the four spikes. The split and the reasons:
`docs/v0-split.md`; the original decision and the out-of-scope list: `docs/v0-decision.md`.

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

Review capabilities live in `.claude/skills/` as SKILL.md files. They auto-create slash commands and are discoverable by subagents. Shared reference files in `.claude/skills/shared/`. Use `/review` for unified auto-detected review or individual `/review-code`, `/review-ux`, etc. for focused reviews.
