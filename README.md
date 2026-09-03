# gitmargin

**Google-Docs-style comments for private HTML prototypes, using the access control your team already has.**

> Early stage. v0 is being built in two parts. **Part 1, in progress:** comments on a single HTML file, with no server, that tell a coding agent where the reviewer was and what they expected. The overlay, `gitmargin attach` and `gitmargin pull` are built and tested; a dogfood round with real reviewers is what remains. **Part 2, parked:** the identity and private-hosting half of the line above. The split and the reasons are in [docs/v0-split.md](docs/v0-split.md); the original decision, with the alternatives, is in [docs/v0-decision.md](docs/v0-decision.md).

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

And there is a second problem hiding inside the first. Even when a comment does reach the author, it rarely says enough for a coding agent to act on it: *which* of the four screens is "this" on, and what did the reviewer expect to happen?

## The idea

**Part 1, building now: the file is the whole product.**

1. **Adds an overlay.** One script inside your HTML file. A reviewer opens the file anywhere, from disk included, clicks an element or highlights text, and leaves a comment anchored to that spot, like a Google Doc.
2. **Records where they were and what they expected.** Every comment carries the step, tab, or dialog that was open, the clicks that led there ("Next, Next, Continue"), and one question answered in the reviewer's own words: *what did you expect here?* Those are the two things a coding agent needs and a human forgets to say.
3. **Comes back as a file or a text block.** "Send to author" downloads the same HTML with the comments inside; "Copy for author" puts a readable block on the clipboard. No server, no account, no upload.
4. **Speaks AI.** `gitmargin pull` turns the returned file into a batch a coding agent can apply in one pass, as JSON with the rules for applying it carried inside. Two reviewers' files merge into one batch. The format is specified in [docs/batch-format.md](docs/batch-format.md).

**Part 2, the destination, parked until it can be tested.** Your host already knows who's allowed to see the page; part 2 reuses that for comments. Reviewers sign in through the provider your company already uses, by way of OpenID Connect, GitLab first, then Slack, Okta, Entra, or Google as configuration. Comments live in a small gitmargin server you run and are mirrored into the GitLab issue and the Slack thread with a link back. `npx gitmargin publish ./dist` replaces the drag-into-Slack habit: it puts the overlay in, publishes to the host your company already sanctions, and posts the link. Terms of art in this section, such as OpenID Connect, are explained in the research report's [glossary](research/prior-art-landscape.md#8-glossary).

## Design principles

- **Feedback for an AI needs where and why, not just what.** "Make this bigger" is useless to an agent that cannot tell which of four screens "this" is on. Part 1 exists for this principle.
- **Comments are data, not screenshots.** Every comment is anchored to an element and stored as machine-readable data, so both humans and AI agents can act on it.
- **Works where you already deploy.** GitLab Pages, GitHub Pages, Vercel, a bucket, a folder on a server, or a file sent by hand. gitmargin never hosts your prototype; in part 1 it never serves anything at all.
- **No account beyond the one your host already requires** (part 2). gitmargin never adds a sign-up. It can't remove the seat a host like GitLab Pages demands, and it says so.
- **Security is inherited, not added** (part 2). The prototype's existing access control is the comment system's access control. On a host with no gate of its own, gitmargin gates the comments and the mirror, not the page bytes.

## What exists today (and where the gap is)

| Category | Examples | What's missing |
|---|---|---|
| AI-agent review loops | [human-review](https://github.com/petergyang/human-review) by Peter Yang, Onlook, Plannotator, Agentation, Annotate.js | Local-first, single reviewer, no identity: great for *you* reviewing your own AI's work, not for a team. And none records which step the reviewer was on |
| Client-feedback SaaS | BugHerd, Markup.io, Usersnap | Separate accounts, separate database, struggle behind auth walls, upload your page to render screenshots |
| Platform-native comments | Vercel Preview Comments, Netlify Drawer | Genuinely solve this, *if* your whole team lives on that vendor. Locked to one platform |
| No-code CMS | Builder.io, Webstudio, Storyblok (and Coinbase's internal system) | Solve *editing* for marketers, not *reviewing* for teams |

A closer read on 2026-09-02 of the four tools nearest to part 1 (human-review, Agentation, Plannotator, Annotate.js) found that none records which step or screen the reviewer was on, none keeps an interaction trail, and none asks what the reviewer expected: [research/agent-feedback-formats.md](research/agent-feedback-formats.md).

The unclaimed square is still **platform-agnostic, identity-aware commenting on private prototypes, with no account beyond the one your host already requires, and the record under your own control.** That is part 2. Part 1 takes the piece of it that needs no infrastructure: comments on a plain file that an agent can act on because they say where and why. The [research report](research/prior-art-landscape.md) has the full landscape, 166 sources.

## Planned roadmap

- [ ] **v0 part 1: the file.** The overlay (anchors, pins, comments, state capture, send back), `gitmargin attach` and `pull`, and one dogfood round: a four-step wizard prototype sent as a file to two reviewers, comments back, Claude Code applies them without the author explaining where anything was.
- [ ] **v0 part 2: identity and private hosting (parked).** Sign-in via OpenID Connect with GitLab first, the server on Vercel plus Neon, `publish` to GitLab Pages, the Slack and GitLab mirrors, an MCP server, the phone mode, and the four one-day spikes that must come first: sign-in inside Slack's in-app browser, GitLab consent behaviour, publish timing on GitLab Pages, and corporate MFA policies inside that browser. Parked until there is a gitlab.com group, a Slack workspace, and phones to test with (section 7 of the split doc).
- [ ] **Later ports:** Vercel with Sign in with Slack, ungated hosts (S3, Firebase) with corporate SSO, a Cloudflare Access gate adapter, GitHub Pages (Enterprise Cloud), a self-hosting package, two-way Slack sync.

## Prior art and credit where it's due

This project stands on ideas from people who solved neighbouring problems:

- **[human-review](https://github.com/petergyang/human-review)** (Peter Yang, MIT) proved that "highlight, comment, agent applies the batch" is the right interaction for reviewing AI-generated HTML. Its JSON batch is the shape part 1's batch borrows.
- **[Annotate.js](https://github.com/reviewjs/annotate)** showed the single-file shape part 1 borrows: one script tag, no server, comments downloaded and imported as JSON.
- **GitLab Visual Reviews** (GitLab 12.0 to 17.0) was almost exactly the part 2 idea: one script tag posting comments into the merge request. It was removed for low usage, most likely because reviewers had to paste an API token to use it. Validation and warning in one.
- **Vercel Preview Comments** and **Netlify Drawer** proved that identity-aware, on-page comments work when tied to the deploy platform, and Vercel now exports comments as JSON for agents. gitmargin tries to make that idea portable.
- **Coinbase's content platform** ([Scaling Content at Coinbase](https://medium.com/the-coinbase-blog)) proved that taking non-engineers out of the code-review loop collapses cycle time from weeks to hours.
- **Hypothesis, BugHerd, Markup.io** and the W3C Web Annotation model: a decade of prior art on anchoring comments to a page.

## Status

Decision made and amended. Part 1 is built and tested end to end: `gitmargin attach` puts the overlay into a copy of a prototype, a reviewer opens it from disk, comments, and sends the comments back as the same file or as a text block, and `gitmargin pull` turns what comes back into a batch for a coding agent. A dogfood round with real reviewers comes next. See [docs/v0-split.md](docs/v0-split.md) for what part 1 is and what part 2 parks, [docs/batch-format.md](docs/batch-format.md) for what the agent gets, and [docs/v0-decision.md](docs/v0-decision.md) for the original decision. If you've hit this problem, a private prototype and no good way to collect feedback on it, I'd genuinely like to hear how you work around it today. Open an issue or reach out.

## License

MIT (planned).
