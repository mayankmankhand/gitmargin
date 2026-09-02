# gitmargin

**Google-Docs-style comments for private HTML prototypes, using the access control your team already has.**

> Early stage. This README describes the problem and the v0 decision. Code is coming; follow along or open an issue if you want to shape it. The full decision, with the reasoning and the alternatives, is in [docs/v0-decision.md](docs/v0-decision.md).

## The problem

AI tools now produce working HTML prototypes in minutes. A PM can go from idea to clickable page before lunch. But the feedback loop hasn't caught up:

- You share the prototype with your team, usually by dropping the `.html` file into Slack.
- Someone wants to say *"this button label is wrong"*, and their options are a screenshot in Slack, a bullet list in an email, or "let's hop on a call."
- The feedback lives somewhere other than the thing it's about, and half of it gets lost.

Tools exist for parts of this (see [Prior art](#prior-art-and-credit-where-its-due) below). But almost all of them assume the page is **public**, or that everyone signs up for **yet another account**, or that the whole team lives on one hosting vendor.

Real prototypes usually aren't public:

- Hosted on **GitLab Pages**, visible only to project members
- Deployed on **Vercel/Netlify** behind password protection or SSO
- Sitting on an internal server behind a VPN

The moment your prototype is private, the commenting tools either can't reach it, or they bolt on their own separate login: a second identity system your reviewers have to join before they can say "make the header bigger."

## The idea

**Your host already knows who's allowed to see the page. Reuse that for comments.**

gitmargin is a comment layer for HTML pages that:

1. **Adds an overlay.** One script tag lets viewers click anywhere on the rendered page, highlight text, and leave threaded comments, like a Google Doc. On a phone, tap an element and say one sentence.
2. **Borrows identity instead of inventing it.** Reviewers sign in through the provider your company already uses, by way of OpenID Connect: GitLab first, then Slack, Okta, Entra, or Google as configuration. If you can *see* the page, you can *comment* on it, as yourself.
3. **Keeps comments in a small gitmargin server you run** (Vercel Functions plus Neon Postgres in v0, self-hostable), and mirrors every comment into the GitLab issue and the Slack thread with a link back. The server holds comments and anchors, never the page.
4. **Speaks AI.** Because comments are structured data with statuses, a coding agent can pull the whole feedback batch through a CLI or an MCP server and apply the edits in one pass. Human reviews the page; agent ships the fixes.
5. **Replaces the drag-into-Slack habit.** `npx gitmargin publish ./dist` puts the overlay in, publishes to the host your company already sanctions, and posts the link in Slack.

## Design principles

- **No account beyond the one your host already requires.** gitmargin never adds a sign-up. It can't remove the seat a host like GitLab Pages demands, and it says so.
- **Security is inherited, not added.** The prototype's existing access control is the comment system's access control. On a host with no gate of its own, gitmargin gates the comments and the mirror, not the page bytes.
- **Comments are data, not screenshots.** Every comment is anchored to an element and stored as machine-readable data, so both humans and AI agents can act on it.
- **Works where you already deploy.** GitLab Pages, GitHub Pages, Vercel, a bucket, a folder on a server. gitmargin never hosts your prototype.

## What exists today (and where the gap is)

| Category | Examples | What's missing |
|---|---|---|
| AI-agent review loops | [human-review](https://github.com/petergyang/human-review) by Peter Yang, Onlook, Plannotator | Local-first, single reviewer, no identity: great for *you* reviewing your own AI's work, not for a team |
| Client-feedback SaaS | BugHerd, Markup.io, Usersnap | Separate accounts, separate database, struggle behind auth walls, upload your page to render screenshots |
| Platform-native comments | Vercel Preview Comments, Netlify Drawer | Genuinely solve this, *if* your whole team lives on that vendor. Locked to one platform |
| No-code CMS | Builder.io, Webstudio, Storyblok (and Coinbase's internal system) | Solve *editing* for marketers, not *reviewing* for teams |

The unclaimed square: **platform-agnostic, identity-aware commenting on private prototypes, with no account beyond the one your host already requires, and the record under your own control.** That's what this project is aiming at. The [research report](research/prior-art-landscape.md) has the full landscape, 166 sources.

## Planned roadmap

- [ ] **v0: GitLab Pages dogfood.** The overlay, the server on Vercel plus Neon, `publish` to GitLab Pages, `pull` and an MCP server for agents, one real review round with an engineer, a designer, and a VP on a phone. Four one-day spikes first: sign-in inside Slack's in-app browser, GitLab consent behaviour, publish timing on GitLab Pages, and corporate MFA policies inside that browser (section 9 of the decision doc).
- [ ] **v0.1: Vercel with Sign in with Slack.** The cheapest second adapter and the first non-Git host.
- [ ] **v0.2: Ungated hosts (S3, Firebase) with corporate SSO** as the provider.
- [ ] **Later:** a Cloudflare Access gate adapter, GitHub Pages (Enterprise Cloud), a self-hosting package, two-way Slack sync.

## Prior art and credit where it's due

This project stands on ideas from people who solved neighbouring problems:

- **[human-review](https://github.com/petergyang/human-review)** (Peter Yang, MIT) proved that "highlight, comment, agent applies the batch" is the right interaction for reviewing AI-generated HTML.
- **GitLab Visual Reviews** (GitLab 12.0 to 17.0) was almost exactly this idea: one script tag posting comments into the merge request. It was removed for low usage, most likely because reviewers had to paste an API token to use it. Validation and warning in one.
- **Vercel Preview Comments** and **Netlify Drawer** proved that identity-aware, on-page comments work when tied to the deploy platform, and Vercel now exports comments as JSON for agents. gitmargin tries to make that idea portable.
- **Coinbase's content platform** ([Scaling Content at Coinbase](https://medium.com/the-coinbase-blog)) proved that taking non-engineers out of the code-review loop collapses cycle time from weeks to hours.
- **Hypothesis, BugHerd, Markup.io** and the W3C Web Annotation model: a decade of prior art on anchoring comments to a page.

## Status

Decision made, code not started. See [docs/v0-decision.md](docs/v0-decision.md) for what v0 is, who it's for, and what's out of scope. If you've hit this problem, a private prototype and no good way to collect feedback on it, I'd genuinely like to hear how you work around it today. Open an issue or reach out.

## License

MIT (planned).
