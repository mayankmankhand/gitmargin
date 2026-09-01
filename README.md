# gitmargin

**Google-Docs-style comments for private HTML prototypes — using the access control your team already has.**

> ⚠️ Early stage. This README describes the problem and the design direction. Code is coming — follow along or open an issue if you want to shape it.

## The problem

AI tools now produce working HTML prototypes in minutes. A PM can go from idea to clickable page before lunch. But the feedback loop hasn't caught up:

- You share the prototype link with your team.
- Someone wants to say *"this button label is wrong"* — and their options are a screenshot in Slack, a bullet list in an email, or "let's hop on a call."
- The feedback lives somewhere other than the thing it's about, and half of it gets lost.

Tools exist for parts of this (see [Prior art](#prior-art--credit-where-its-due) below). But almost all of them assume the page is **public**, or that everyone signs up for **yet another account**.

Real prototypes usually aren't public:

- Hosted on **GitLab Pages**, visible only to project members
- Deployed on **Vercel/Netlify** behind password protection or SSO
- Sitting on an internal server behind a VPN

The moment your prototype is private, the commenting tools either can't reach it, or they bolt on their own separate login — a second identity system your reviewers have to join before they can say "make the header bigger."

## The idea

**Your repo is already your access-control list. Use it for comments too.**

gitmargin is a drop-in comment layer for HTML pages that:

1. **Adds an overlay** — one script tag (or a build step) that lets viewers click anywhere on the rendered page, highlight text, and leave threaded comments, like a Google Doc.
2. **Borrows identity instead of inventing it** — reviewers sign in with the account that already gates the prototype (GitLab, GitHub, or your SSO). If you can *see* the page, you can *comment* on it, as yourself. No new accounts, no anonymous drive-bys.
3. **Stores comments where the prototype lives** — as structured data (JSON) in the same repo, written via the Git host's API. Comments inherit the repo's permissions automatically. Private repo → private comments. No third-party database holding your unreleased product ideas.
4. **Speaks AI** — because comments are structured data in the repo, an AI coding agent can read the whole feedback batch and apply the edits in one pass. Human reviews the page; agent ships the fixes.

## Design principles

- **Zero new accounts.** If a reviewer has to sign up for something, we've failed.
- **Security is inherited, not added.** The prototype's existing access control is the comment system's access control.
- **Comments are data, not screenshots.** Every comment is anchored to a DOM element and stored as machine-readable JSON — so both humans and AI agents can act on it.
- **Works where you already deploy.** GitLab Pages, GitHub Pages, Vercel, a folder on a server. No migration.

## What exists today (and where the gap is)

| Category | Examples | What's missing |
|---|---|---|
| AI-agent review loops | [human-review](https://github.com/petergyang/human-review) by Peter Yang, Onlook | Local-first, single reviewer, no identity — great for *you* reviewing your own AI's work, not for a team |
| Client-feedback SaaS | BugHerd, Markup.io, Usersnap | Separate accounts, separate database, struggle behind auth walls |
| Platform-native comments | Vercel Preview Comments | Genuinely solves this — *if* your whole team lives on Vercel. Locked to one platform |
| No-code CMS | Builder.io, Webstudio, Storyblok (and Coinbase's internal system) | Solves *editing* for marketers, not *reviewing* for teams |

The unclaimed square: **platform-agnostic, identity-aware commenting on private prototypes, with no new accounts and no third-party data store.** That's what this project is aiming at.

## Planned roadmap

- [ ] **v0 — GitLab Pages MVP**: script-tag overlay + GitLab OAuth + comments stored as JSON in the repo via the GitLab API
- [ ] **v0.1 — Agent handoff**: an export format / CLI so Claude Code (or any coding agent) can pull open comments and apply them
- [ ] **v0.2 — GitHub Pages support** (same model, GitHub OAuth + API)
- [ ] **Later**: generic OIDC/SSO mode for prototypes hosted anywhere

## Prior art & credit where it's due

This project stands on ideas from people who solved neighboring problems:

- **[human-review](https://github.com/petergyang/human-review)** (Peter Yang, MIT) — proved that "highlight → comment → agent applies the batch" is the right interaction for reviewing AI-generated HTML.
- **Coinbase's content platform** ([Scaling Content at Coinbase](https://medium.com/the-coinbase-blog)) — proved that taking non-engineers out of the code-review loop collapses cycle time from weeks to hours.
- **Vercel Preview Comments** — proved that identity-aware, on-page comments work when they're tied to the deploy platform. gitmargin tries to make that idea portable.
- **BugHerd, Markup.io, Hypothesis** — a decade of prior art on point-and-click page annotation.

## Status

Design/exploration stage. If you've hit this problem — private prototype, no good way to collect feedback on it — I'd genuinely like to hear how you work around it today. Open an issue or reach out.

## License

MIT (planned).
