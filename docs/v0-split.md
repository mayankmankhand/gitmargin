# gitmargin v0, split into two parts

Decided 2026-09-02, the same day as [the v0 decision](v0-decision.md), which this document amends. It came out of
[issue #2](https://github.com/mayankmankhand/gitmargin/issues/2), which asked for four one-day spikes before any
code was written. Technical terms are explained in the research report's
[glossary](../research/prior-art-landscape.md#8-glossary).

## 1. What changed and why

The v0 decision was designed around one company's setup: gitlab.com Pages behind SAML, a Slack workspace, a VP
opening links on a phone from the Slack app. The four spikes in section 9 of that decision exist to test exactly
those assumptions, and every one of them needs something that is not available right now: a gitlab.com group with
SAML on, a Slack workspace to post into, the company's MFA policy, and two phones with Slack installed.

That is not a detail. A design the builder cannot test alone cannot be built alone. So v0 is now two parts:

- **Part 1 is just an HTML file.** A script attached to one AI-generated prototype. A reviewer opens the file
  anywhere, from disk included, leaves comments, and sends them back. The author hands the batch to a coding agent.
  No server, no hosting, no Slack, no sign-in.
- **Part 2 is identity and private hosting.** Everything in the v0 decision that needs a company's infrastructure
  moves here, parked until it can be tested. Nothing is scrapped; the four spikes are still the right tests to run
  when the resources exist.

The README's thesis, comments on *private* prototypes with the identity the host already has, belongs to part 2
and stays the destination. Part 1 does not claim it.

## 2. Part 1: what it is

```
You generate prototype.html with an AI
  -> gitmargin attach prototype.html       (writes a copy with the overlay in and a version id)
  -> you send that copy to a reviewer, any way you like
The reviewer opens it in a browser, from disk or anywhere
  -> clicks through the wizard             (the overlay logs each click: "Next", "Next")
  -> clicks an element or highlights text, and types what they expected
  -> the overlay records: anchor, screen, click trail, viewport   (what if the screen has no name?)
  -> "Send to author" downloads the file with the comments inside  (does download work from disk?)
     or "Copy for author" puts a text block on the clipboard
You receive the file or the text
  -> gitmargin pull reviewed.html          -> the batch: what, where, and which version
  -> Claude Code applies the edits          (what if an anchor is orphaned? the wrong version?)
```

The questions in the diagram are tracked, not open-ended: the screen name is answered in section 3 below and in
section 4 of [batch-format.md](batch-format.md); orphaned anchors and version mismatches in its section 6. Whether
the download works from disk was the first open point in its section 8 and is now answered there: yes in Chromium
and Firefox, tested from a `file://` URL; WebKit is the one engine still untested.

Three pieces:

1. **The overlay.** One script inside the HTML. On a laptop you click an element or highlight text and a comment
   box opens: one text field with the placeholder "What did you expect here?" and an optional tag (change, bug,
   question, like). In comment mode a one-pixel frame follows the pointer and shows the element a click will
   attach to, snapped to the nearest control or named block: a click on the word inside a button means the button,
   and a click on a bold word inside a paragraph means the paragraph. A pin carrying the reviewer's initials marks
   the element and its thread opens beside it; a small floating toolbar at the top right holds comment mode, a count
   badge and who you are, and a sheet behind the count badge lists every thread. (The pins were
   numbered and the list was a permanent side panel until issue #21 redrew the overlay on 2026-09-22.)
2. **Attach and pull.** `gitmargin attach prototype.html` writes a copy of the file next to the original with
   the overlay inside, and stamps a version id into that copy. The original is untouched; the copy is what you
   send. `gitmargin pull reviewed.html` reads the comments back out, from the returned file or from a pasted
   text block, and prints the batch for an agent as JSON. Neither command has a runtime dependency: Node and
   nothing else.

   Not published to npm: only the author ever runs them, so they run from a clone of the repository as
   `node bin/gitmargin.js attach prototype.html` and `node bin/gitmargin.js pull reviewed.html`, or through npm
   as `npm run attach -- prototype.html` and `npm run pull -- reviewed.html`. Building the overlay bundle they
   attach needs one dev dependency, so a fresh clone runs `npm install && npm run build` once first. Publishing
   would make `npx gitmargin` work and changes nothing else; it is a later decision, not a part-1 one.
3. **The batch.** What the agent reads: for each comment, what the reviewer wanted and where they were. The format
   is drafted in [batch-format.md](batch-format.md).

## 3. What a comment carries

Every comment records two things, because they are the two things a coding agent needs most and a human reviewer
forgets to say.

**Where they were:**

- The anchor: a CSS selector for the element, the quoted text with a few words either side, and a point inside
  the element. Several ways to find the same spot, because an AI-regenerated page changes shape; a comment whose
  spot cannot be found is shown as "orphaned", not lost.
- The screen: the page hash, and the name of the step, tab, or dialog that was open. If the prototype tags its
  screens with a `data-gm-screen` attribute the name is exact; if not, the overlay guesses from the nearest visible
  heading.
- The click trail: what the reviewer clicked since the page loaded, as "Next, Next, Continue". For a multi-step
  prototype the trail *is* the state, and it lets both a human and an agent get back to the same view.
- The viewport. A screenshot of the visible screen was considered and left out of the v0.1 build: the field is in
  the format and always null, because a rendering library costs every prototype about 200KB and the trail plus the
  screen name already answer "where" (section 8 of [batch-format.md](batch-format.md)).

**Why they stopped:** the free text they typed, and the optional tag. The trail records what was clicked, never what
was typed into fields.

## 4. How comments get back

Two routes, both built, both needing nothing but the file:

- **Send to author.** A button that downloads the same HTML with the comments embedded in it. The reviewer sends
  that file back the way they received the original. This route is lossless: it carries the full trail and every
  field of every comment.
- **Copy for author.** A button that puts a readable text block on the clipboard. The reviewer pastes it into any
  message. This route is lighter and lossy: the trail is summarised to the words that were clicked, and the
  per-comment anchor detail is dropped.

A version id is stamped into the file at attach time, so a returned batch always says which version it belongs to,
and comments from two reviewers on the same version merge by comment id (ids are random, so two files never
collide).

## 5. What part 1 deliberately leaves out

No server. No hosting. No Slack. No sign-in: a reviewer can type a name, and that is all the identity there is.
No phone mode: part 1 is laptop-first. No sync between reviewers: each one sends their own file or block back. (Sharing is now an option on top of part 1, not a change to it: see the amendment at the head of section 7.)
Comments are not encrypted in the file: whoever holds the file can read them, exactly as they can read the
prototype.

Two measured limits found while building it, both standing as known gaps for the dogfood:

- A prototype that opens a **modal** dialog (`showModal()`) puts that dialog above the overlay, so while it is open
  the overlay and the comment box cannot be reached. A non-modal dialog is fine, and the screen name is read from
  either. Working around it would mean writing into the prototype's page, which part 1 does not do.
- **Keyboard reach is partial.** A reviewer can turn comment mode on, tab to any control the prototype makes
  focusable, and press C to comment on it, and a text selection made with the keyboard works the same way. What is
  still out of reach is content that never takes focus at all, which on a typical prototype means the headings and
  paragraphs. Covering those needs a roving cursor that walks the page element by element, which is a feature rather
  than a fix, so it is written down here rather than half-built.

A third gap, found by using it on 2026-09-04 and tracked as
[issue #10](https://github.com/mayankmankhand/gitmargin/issues/10), was that nothing showed which element a click
would attach to. It is closed, and the frame that closed it is described with the overlay in section 2.

### What a reviewer's browser has to be

Measured on 2026-09-04, from the built bundle and the styles it carries, not from a promise:

| | Chrome / Edge | Firefox | Safari |
|---|---|---|---|
| Overlay runs at all | 80 | 72 | 13.1 |
| Everything renders as designed | 88 | 85 | 15.4 |

Below the first row the bundle cannot be parsed, so none of it runs. That used to be silent: the reviewer saw an
ordinary prototype with no commenting and no explanation, which an author cannot tell apart from a reviewer who had
nothing to say. `attach` now writes a small notice, deliberately in the older syntax the bundle cannot use, so any
browser that cannot run the overlay says so instead. A page with JavaScript switched off says so too.

Two things follow that are easy to get wrong. **Internet Explorer is not on the table**: it was retired in 2022 and
parses none of this, and a prototype an AI generates will usually not run in it either, so the reviewer would blame
the file rather than the browser. And **the floor is a decision now, not an accident**: the build pins its target,
because with none set the minifier rewrote a null check into newer syntax and moved the floor to Chrome 80 on its
own.

Safari is the one engine never actually exercised: WebKit does not start on the machine the suite runs on
([issue #7](https://github.com/mayankmankhand/gitmargin/issues/7)). The numbers above are read from the code, and
for Safari they are the only evidence there is.

## 6. The success test

Send a generated prototype as a file to two reviewers. Get their comments back. Drop the batch into Claude Code.
It makes the right edits without the author explaining where anything was. Part 1 is done when that round works.

A second round is run only if the first one forces a change to the overlay or the batch format, rather than on a
fixed count. Each round spends two colleagues' time, so it has to be buying an answer the last one did not
already give.

## 7. Part 2: what is parked, and what unparks it

**Amended 2026-09-21.** Cycle 1 of that design, sign-in with GitLab ([#18](https://github.com/mayankmankhand/gitmargin/issues/18)), is built and was walked live. "No sign-in" below describes part 1 and the default of shared comments; on a shared prototype sign-in is now the author's choice.

**Amended 2026-09-19.** Part 2 now has one design, in [part-2-design.md](part-2-design.md): where the page lives, who may comment, and the author's own comment service as the constant, built in four cycles that each end in a live test on accounts one person can own. That document is the description of part 2 from here on. What follows is kept as the record of how the list got there.

**Amended 2026-09-18 ([issue #13](https://github.com/mayankmankhand/gitmargin/issues/13), built in [issue #15](https://github.com/mayankmankhand/gitmargin/issues/15)).** One piece of this list left the parking lot, in a smaller shape than the one below. Shared, live comments no longer wait for sign-in:

- **What was built:** a comment service each author deploys to their own Vercel account with Neon Postgres. A page attached with `--service` carries the service's address and a page key, and everyone who opens it shares one set of comments, with replies and statuses. Comments belong to a version of the page; the service keeps a sandboxed copy of each version so an older one can still be opened with its comments in place. `service/README.md` and `service/API.md` describe it.
- **What it deliberately is not:** signed in. The key in the page is the only gate, and names are typed. That is the honest price of needing no company infrastructure to build or test.
- **Decisions that changed the list below:** gitmargin does not run a server for anyone (each author owns the box and the data); comments are shown on the page rather than mirrored into a GitLab issue, so the GitLab-issue mirror is retired; sign-in becomes a choice made per prototype and is split into [#17](https://github.com/mayankmankhand/gitmargin/issues/17) (GitHub) and [#18](https://github.com/mayankmankhand/gitmargin/issues/18) (GitLab through the company login); publishing becomes a plugin, [#16](https://github.com/mayankmankhand/gitmargin/issues/16); the Slack mirror stays parked.
- **Part 1 is untouched by it.** A page attached without `--service` never reaches the network, and comes back as a file or a text block exactly as sections 2 to 4 describe.

What follows is the original list, kept as decided. Read it with the amendment above in mind.

Parked, in the order it was decided in [the v0 decision](v0-decision.md):

- Sign-in through the company's own provider via OpenID Connect, GitLab first (section 3).
- The gitmargin server on Vercel Functions with Neon Postgres: the record, the audience check, the session
  transport that avoids third-party cookies (section 4).
- The one-way mirrors into the Slack thread and the GitLab issue (section 4).
- `npx gitmargin publish` to GitLab Pages and the Slack link, one link per version plus latest (sections 1 and 5).
- An MCP server for agents, on top of the batch (section 1).
- The VP on a phone from the Slack app, and the tap-to-comment sheet built for them (section 2).
- The four spikes, summarised here; the full wording is in section 9 of the decision and in
  [issue #2](https://github.com/mayankmankhand/gitmargin/issues/2):
  1. The sign-in hand-off inside Slack's in-app browser, on iOS and Android.
  2. GitLab consent behaviour: a confidential app asks once, a public app asks every visit, token refresh, the
     Members API check with a bot token.
  3. Publish timing on GitLab Pages: Commits API plus the Pages job, two versions plus latest, the earlier
     version still opens afterwards.
  4. Corporate MFA and device policies inside the webview, where Okta documents that WebAuthn is not supported.

What unparks it: access to a gitlab.com group where the spikes can run (SAML on, for spike 4), a Slack workspace
to post into, an iPhone and an Android phone with Slack installed, and four days. The dogfood order in section 8
of the decision still stands once that is true.

## 8. What stays the same

- **gitmargin never hosts the prototype.** Part 1 goes further: it never serves anything at all. With shared comments the author's own service keeps a copy of each version, in the author's own account; gitmargin still runs and holds nothing.
- **The comment model.** An anchor, a thread, a version pointer, and a status (open, accepted, rejected, applied);
  orphaned is a normal state. Part 1 adds the state block and the intent block to it, and part 2 inherits both.
- **The sockets picture.** The v0 decision describes one core and three sockets: serve, identify, store. Part 1
  is that core with each socket at its simplest: the file is the host, a typed name is the identity, and the file
  is the store. Part 2 plugs in the real adapters without changing the core.

## 9. What the research found

A targeted pass on 2026-09-02, written up in
[research/agent-feedback-formats.md](../research/agent-feedback-formats.md), read the four tools closest to this
shape: human-review, Agentation, Plannotator, and Annotate.js. None records which step or screen the reviewer was
on, none keeps an interaction trail, and none asks what the reviewer expected; one has a tag list. So part 1 is a
known base (Annotate.js's script tag and file round trip, human-review's batch shape) plus the two things nobody
does. That is the honest line for the README.

## 10. Issue map

| Issue | Was | Becomes | Part |
|---|---|---|---|
| [#2](https://github.com/mayankmankhand/gitmargin/issues/2) | Spikes before building: Slack in-app sign-in, GitLab consent, publish timing, corporate MFA | Part 2 (parked): sign-in spikes, GitLab Pages, Slack, server | 2 |
| [#3](https://github.com/mayankmankhand/gitmargin/issues/3) | Comment overlay: anchors, pins, threads, phone tap mode | Part 1: comment overlay on one HTML file: anchors, pins, threads, state capture, send back | 1 |
| [#4](https://github.com/mayankmankhand/gitmargin/issues/4) | gitmargin server on Vercel + Neon: sign-in, record, mirrors, batch API | Closed 2026-09-18, superseded: storage by #15, sign-in by #17 and #18; the GitLab-issue mirror is retired | 2 |
| [#5](https://github.com/mayankmankhand/gitmargin/issues/5) | npx gitmargin publish and pull: GitLab Pages deploy, Slack link, batch for agents (CLI + MCP) | Part 1: npx gitmargin attach and pull: inject the overlay, read comments back for agents | 1 |
| [#15](https://github.com/mayankmankhand/gitmargin/issues/15) | (new, from #13) | Shared live comments: a comment service on Vercel + Neon the author deploys; versions, stored pages, replies, statuses; no sign-in | between 1 and 2 |
| [#16](https://github.com/mayankmankhand/gitmargin/issues/16) to [#19](https://github.com/mayankmankhand/gitmargin/issues/19) | (new, from #13) | A publishing plugin, GitHub sign-in (built and walked 2026-09-23, cycle 2), GitLab sign-in (built 2026-09-21, cycle 1; the company-login pass-through untested), Vercel same-project mode | 2 |
| [#6](https://github.com/mayankmankhand/gitmargin/issues/6) | Dogfood round 1 on gitlab.com Pages with three real reviewers | Part 1 dogfood: a wizard prototype sent as a file to two reviewers, comments back, Claude Code applies | 1 |
