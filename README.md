# gitmargin

**Google-Docs-style comments for private HTML prototypes, using the access control your team already has.**

> Early stage. v0 is being built in two parts, with one optional layer on top of the first. **Part 1, in progress:** comments on a single HTML file, with no server, that tell a coding agent where the reviewer was and what they expected. The overlay, `gitmargin attach` and `gitmargin pull` are built and tested; a dogfood round with real reviewers is what remains. **Shared comments, an optional layer on part 1, built:** a small service you deploy to your own account makes the comments live, so everyone who opens the page sees the same ones and can reply. **Part 2, in progress:** signing reviewers in with the login your company already has. Its first two pieces, optional sign-in with GitLab or GitHub on a shared prototype, are built and were tested live with real accounts; the rest is parked until it can be tested. The split and the reasons are in [docs/v0-split.md](docs/v0-split.md); the original decision, with the alternatives, is in [docs/v0-decision.md](docs/v0-decision.md).

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

1. **Adds an overlay.** One script inside your HTML file. A reviewer opens the file anywhere, from disk included, clicks an element or highlights text, and leaves a comment anchored to that spot, like a Google Doc. In comment mode a one-pixel frame follows the pointer and shows the element a click will attach to, snapped to the nearest control or named block: a click on the word inside a button means the button. Each comment leaves a pin carrying the writer's initials at the spot, and clicking it opens that comment's thread right there. On a prototype with several steps the pin shows only on the step it was made on, even when every step repeats the same Next button. A small floating toolbar at the top right holds comment mode, a count badge and who you are; the badge opens the comments sheet, which lists every comment, grouped by screen.
2. **Records where they were and what they expected.** Every comment carries the step, tab, or dialog that was open, the clicks that led there ("Next, Next, Continue"), and one question answered in the reviewer's own words: *what did you expect here?* Those are the two things a coding agent needs and a human forgets to say.
3. **Comes back as a file or a text block.** "Send to author" downloads the same HTML with the comments inside; "Copy for author" puts a readable block on the clipboard. No server, no account, no upload.
4. **Speaks AI.** `gitmargin pull` turns the returned file into a batch a coding agent can apply in one pass, as JSON with the rules for applying it carried inside. Two reviewers' files merge into one batch. The format is specified in [docs/batch-format.md](docs/batch-format.md).

**Shared comments, optional: one conversation, wherever the page lives.** Attach with `--service` and the page talks to a small comment service that you deploy to your own Vercel account, with its own Neon database. gitmargin runs nothing and holds nothing.

1. **Live.** Everyone who opens the page, from a file on disk or from any host, sees the same comments within a few seconds, with who wrote each one, and can reply.
2. **Local first.** A comment is saved in the browser the way it always was, then sent. If the service is down the comments sheet says so, nothing is lost, and the file and clipboard routes still work.
3. **By version.** Attaching a changed prototype makes a new version, which opens with no comments. The Version line in the comments sheet opens the older versions, each with its own comments in place, from a copy the service keeps.
4. **Closes the loop.** `gitmargin pull --live` reads the comments from the service, and `gitmargin status` marks one applied, so the reviewer sees what became of it.

By default there is no sign-in: a key written into the page is the only gate, and whoever can open the page can read and write its comments. Sign-in with GitLab or GitHub is a choice you make per prototype (`gitmargin identity`, below in part 2): reviewers then comment under their real GitLab or GitHub name, and you can limit commenting, and reading, to one GitLab group or, with GitHub, to the people who can open one repository. **Attaching with `--service` also uploads a copy of the page to your service**, which is how older versions stay openable, and that copy is not behind whatever password protects the page on your host: anyone holding its link can open it. If the prototype must stay behind your host's login, use part 1 without `--service`, or, on Vercel, [same-project mode](service/README.md#same-project-mode-on-vercel-the-page-and-its-comments-behind-one-login), which puts the page and its comments behind that one login. [service/README.md](service/README.md) has the deploy steps and says plainly what that means.

**Part 2, the destination, in progress: three of its pieces are built, the rest waits until it can be tested.** Your host already knows who's allowed to see the page; part 2 reuses that for comments. Reviewers sign in through the provider your company already uses: GitHub, or GitLab through the company login, then Okta, Entra, or Google by way of OpenID Connect. Sign-in is a choice made per prototype, on top of the same comment service. A publishing command replaces the drag-into-Slack habit: it puts the overlay in, publishes to the host your company already sanctions, and hands back the link. Terms of art in this section, such as OpenID Connect, are explained in the research report's [glossary](research/prior-art-landscape.md#8-glossary). Since 2026-09-19 part 2 has one design, [docs/part-2-design.md](docs/part-2-design.md), and is being built in four cycles that each end in a live test. **Cycle 1, sign-in with GitLab ([#18](https://github.com/mayankmankhand/gitmargin/issues/18)), is built**: a reviewer presses Sign in under the identity chip in the overlay's toolbar, from a file on disk, the service link or GitLab Pages alike, and it was walked on two computers with two gitlab.com accounts, one of them only a Guest of a private group. **Cycle 2, sign-in with GitHub ([#17](https://github.com/mayankmankhand/gitmargin/issues/17)), is built** on the same machinery, through a GitHub App that asks reviewers for nothing beyond who they are (limiting commenting to one repository needs one read permission, and GitHub's screen then asks for more), and it was walked on the real github.com from a file on disk, the service link and a GitHub Pages page, with the repository rule both ways. **Vercel same-project mode ([#19](https://github.com/mayankmankhand/gitmargin/issues/19)) is built too:** a second deployment of your comment service serves one prototype and its comments behind Vercel's own login, so nobody who has not passed it reaches either. Setup and the plain-English warnings are in [service/README.md](service/README.md#sign-in-with-gitlab-optional-per-prototype) and [its GitHub section](service/README.md#sign-in-with-github-optional-per-prototype); same-project mode is set up in [its own section](service/README.md#same-project-mode-on-vercel-the-page-and-its-comments-behind-one-login).

## Running it today

**If you build prototypes with Claude Code**, install the plugin and let Claude do the rest: it builds the prototype so comments land well, shares it (a file, your comment service's link, or GitHub Pages) with `/gitmargin:share`, and reads the comments back when you ask what reviewers said. The whole story, including the one-time setup, is in [docs/claude-code.md](docs/claude-code.md).

```text
/plugin marketplace add https://github.com/mayankmankhand/gitmargin.git
/plugin install gitmargin@gitmargin
```

**By hand**, gitmargin is not on npm yet, so it runs from a clone of this repo:

```bash
git clone https://github.com/mayankmankhand/gitmargin.git
cd gitmargin
npm install && npm run build          # once: builds the overlay bundle

node bin/gitmargin.js attach prototype.html   # writes prototype.gitmargin.html
# send that file to a reviewer, any way you like; they open it and comment
node bin/gitmargin.js pull reviewed.html      # prints the batch as JSON
```

For shared, live comments, deploy the service once ([service/README.md](service/README.md)) and add one flag:

```bash
export GITMARGIN_SECRET=...                     # the value you gave your deployment
node bin/gitmargin.js attach prototype.html --service https://your-service.vercel.app
node bin/gitmargin.js pull prototype.gitmargin.html --live
```

`npm run attach -- prototype.html` and `npm run pull -- reviewed.html` do the same thing. Only the author runs these; a reviewer only ever opens an HTML file, with nothing installed.

Your reviewer needs a current Chrome, Edge, Firefox or Safari; the measured floor is Chrome and Edge 88, Firefox 85, Safari 15.4, and the [split doc](docs/v0-split.md#what-a-reviewers-browser-has-to-be) says what each row means. Anything older says so on the page rather than quietly showing a prototype with no commenting on it. Internet Explorer is not supported and cannot be.

## Design principles

- **Feedback for an AI needs where and why, not just what.** "Make this bigger" is useless to an agent that cannot tell which of four screens "this" is on. Part 1 exists for this principle.
- **Comments are data, not screenshots.** Every comment is anchored to an element and stored as machine-readable data, so both humans and AI agents can act on it.
- **Works where you already deploy.** GitLab Pages, GitHub Pages, Vercel, a bucket, a folder on a server, or a file sent by hand. gitmargin never hosts your prototype or your comments. A plain file talks to nothing at all; a shared one talks only to the service you deployed.
- **The author owns the record.** Shared comments live in a database in the author's own account, not in one gitmargin runs. A company should not have to send its feedback to somebody else's server to get a comment thread.
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

- [ ] **v0 part 1: the file.** The overlay (anchors, pins, comments, state capture, send back), `gitmargin attach` and `pull`, and one dogfood round: a generated prototype sent as a file to two reviewers, comments back, Claude Code applies them without the author explaining where anything was.
- [ ] **Shared live comments** ([#15](https://github.com/mayankmankhand/gitmargin/issues/15)). Built, tested against a local copy of the service, and checked on a real Vercel plus Neon deployment in Chrome and Firefox. The Deploy button is written but untested while this repository is private. A comment service on Vercel plus Neon that each author deploys, comments by version with a stored copy of each version, replies, statuses, `pull --live`. No sign-in by default: a key in the page is the gate.
- [ ] **Sign in with GitLab** ([#18](https://github.com/mayankmankhand/gitmargin/issues/18), cycle 1 of part 2). Built and walked live on gitlab.com: optional per prototype, verified names on comments, a members rule on one GitLab group, and strict reading. Chrome end to end; Firefox by the automated suite, and by hand as far as GitLab's login. The company single sign-on pass-through is untested.
- [x] **Sign in with GitHub** ([#17](https://github.com/mayankmankhand/gitmargin/issues/17), cycle 2 of part 2). Optional per prototype, through a GitHub App that asks for no permissions, with verified names on comments, an optional rule limiting commenting to one repository (the App then needs one read-only permission), and strict reading; tested against a stand-in GitHub in Chromium and Firefox, and walked on the real github.com on 2026-09-23.
- [x] **Vercel same-project mode** ([#19](https://github.com/mayankmankhand/gitmargin/issues/19), cycle 4 of part 2, built ahead of cycle 3). A second deployment of your comment service serves one prototype and its comments behind Vercel's own protection, so nobody who has not passed it reaches either. Tested behind a stand-in for Vercel's login wall in Chromium and Firefox, and walked on a real Vercel project on 2026-09-23: every address answered only with Vercel's login, and a reviewer on the share link read and wrote comments.
- [ ] **The Claude Code plugin** ([#16](https://github.com/mayankmankhand/gitmargin/issues/16), cycle 3 of part 2). Built, not yet walked by a second author: build rules that keep comments on their step, `/gitmargin:share` to a file, the service link or GitHub Pages (it asks where once per project, then never again), and reading the comments back. GitLab Pages and Vercel come next. [docs/claude-code.md](docs/claude-code.md).
- [ ] **v0 part 2, the rest (parked).** A Slack mirror, an MCP server, the phone mode, and the four one-day spikes that sign-in inside a company must pass first: sign-in inside Slack's in-app browser, GitLab consent behaviour, publish timing on GitLab Pages, and corporate MFA policies inside that browser. Parked until there is a gitlab.com group, a Slack workspace, and phones to test with (section 7 of the split doc).
- [ ] **Publish to npm.** Deliberately not done yet: nothing is published to npm, so the commands run from the Claude Code plugin or from a clone (see [Running it today](#running-it-today)). `package.json` already carries the `bin` entry, so publishing is a single step whenever the shape stops moving.
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

Decision made and amended. Part 1 is built and tested end to end: `gitmargin attach` puts the overlay into a copy of a prototype, a reviewer opens it from disk, comments, and sends the comments back as the same file or as a text block, and `gitmargin pull` turns what comes back into a batch for a coding agent. Shared live comments are built on top of that and tested in Chrome and Firefox against a local copy of the comment service: two people on the same page, one from a file and one from a hosted copy, see each other's comments and replies within seconds. The same check passed on a real Vercel plus Neon deployment. A dogfood round with real reviewers comes next. See [docs/v0-split.md](docs/v0-split.md) for what part 1 is and what part 2 parks, [docs/batch-format.md](docs/batch-format.md) for what the agent gets, and [docs/v0-decision.md](docs/v0-decision.md) for the original decision. If you've hit this problem, a private prototype and no good way to collect feedback on it, I'd genuinely like to hear how you work around it today. Open an issue or reach out.

## License

MIT (planned).
