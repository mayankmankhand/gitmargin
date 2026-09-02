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
  -> npx gitmargin attach prototype.html   (puts the overlay in and stamps a version id)
  -> you send the file to a reviewer, any way you like
The reviewer opens it in a browser, from disk or anywhere
  -> clicks through the wizard             (the overlay logs each click: "Next", "Next")
  -> clicks an element or highlights text, and types what they expected
  -> the overlay records: anchor, screen, click trail, viewport   (what if the screen has no name?)
  -> "Send to author" downloads the file with the comments inside  (does download work from disk?)
     or "Copy for author" puts a text block on the clipboard
You receive the file or the text
  -> npx gitmargin pull reviewed.html      -> the batch: what, where, and which version
  -> Claude Code applies the edits          (what if an anchor is orphaned? the wrong version?)
```

Three pieces:

1. **The overlay.** One script inside the HTML. On a laptop you click an element or highlight text and a comment
   box opens: one text field with the placeholder "What did you expect here?" and an optional tag (change, bug,
   question, like). A small numbered pin marks the element; a slim panel on the right lists every thread.
2. **Attach and pull.** `npx gitmargin attach prototype.html` puts the overlay into the file and stamps a version
   id. `npx gitmargin pull reviewed.html` reads the comments back out, from the returned file or from a pasted
   text block, and prints the batch for an agent.
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
- The viewport, and a screenshot of the visible screen when that can be done cheaply.

**Why they stopped:** the free text they typed, and the optional tag. The trail records what was clicked, never what
was typed into fields.

## 4. How comments get back

Two routes, both built, both needing nothing but the file:

- **Send to author.** A button that downloads the same HTML with the comments embedded in it. The reviewer sends
  that file back the way they received the original. This route is lossless: it carries screenshots and the full
  trail.
- **Copy for author.** A button that puts a readable text block on the clipboard. The reviewer pastes it into any
  message. This route is lighter and lossy: no screenshots, and the trail is summarised.

A version id is stamped into the file at attach time, so a returned batch always says which version it belongs to,
and comments from two reviewers on the same version merge by comment id.

## 5. What part 1 deliberately leaves out

No server. No hosting. No Slack. No sign-in: a reviewer can type a name, and that is all the identity there is.
No phone mode: part 1 is laptop-first. No sync between reviewers: each one sends their own file or block back.
Comments are not encrypted in the file: whoever holds the file can read them, exactly as they can read the
prototype.

## 6. The success test

Generate a four-step wizard prototype. Send the file to two people. Get their comments back. Drop the batch into
Claude Code. It makes the right edits without the author explaining where anything was. Part 1 is done when that
works twice.

## 7. Part 2: what is parked, and what unparks it

Parked, in the order it was decided in [the v0 decision](v0-decision.md):

- Sign-in through the company's own provider via OpenID Connect, GitLab first (section 3).
- The gitmargin server on Vercel Functions with Neon Postgres: the record, the audience check, the session
  transport that avoids third-party cookies (section 4).
- The one-way mirrors into the Slack thread and the GitLab issue (section 4).
- `npx gitmargin publish` to GitLab Pages and the Slack link, one link per version plus latest (sections 1 and 5).
- An MCP server for agents, on top of the batch (section 1).
- The VP on a phone from the Slack app, and the tap-to-comment sheet built for them (section 2).
- The four spikes, kept as written in section 9:
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

- **gitmargin never hosts the prototype.** Part 1 goes further: it never serves anything at all.
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
| [#4](https://github.com/mayankmankhand/gitmargin/issues/4) | gitmargin server on Vercel + Neon: sign-in, record, mirrors, batch API | Part 2 (parked): the same, marked parked | 2 |
| [#5](https://github.com/mayankmankhand/gitmargin/issues/5) | npx gitmargin publish and pull: GitLab Pages deploy, Slack link, batch for agents (CLI + MCP) | Part 1: npx gitmargin attach and pull: inject the overlay, read comments back for agents | 1 |
| [#6](https://github.com/mayankmankhand/gitmargin/issues/6) | Dogfood round 1 on gitlab.com Pages with three real reviewers | Part 1 dogfood: a wizard prototype sent as a file to two reviewers, comments back, Claude Code applies | 1 |
