# What annotation tools hand to a coding agent, and whether any records where the reviewer was

Researched 2026-09-02 by one automated agent in about 15 fetches, reading each tool's README, docs, schema files,
and source rather than search results. Sources are listed at the end. It answers a narrower question than the
[landscape report](prior-art-landscape.md): for the four tools closest to "comment on an AI-generated HTML file and
hand the batch to an agent", what exactly reaches the agent, does anything capture the application state (which
step, screen, tab, or dialog the reviewer was looking at), and how do comments travel from a reviewer who is not the
author?

What it does not cover: stagewise (its README returned marketing copy only; treat every cell as unverified), and
whether Annotate.js actually works when the HTML is opened from a local file, which was read from source but not run
in a browser.

## Findings

| Tool | (a) What it hands the agent | (b) Application state captured | (c) Reviewer to author; local file | (d) How it attaches |
|---|---|---|---|---|
| [human-review](https://github.com/petergyang/human-review) (Peter Yang) | JSON from `human-review poll`: a list of pages, each with comments `{id, kind: "selection", quote, anchor: {prefix, quote, suffix}, feedback}` and edits `{label, kind: "edited", before, after, after_html}`, plus `overall_note` and a `status`. No CSS selector, screenshot, type, or per-comment status. A `kind: "element"` exists; its fields are unverified. | A `url` only for localhost routes; nothing for files. Hash, step, screenshot, click trail, viewport, console: none found. | A local Node server on 127.0.0.1 that the agent long-polls; state stays on that machine. No share link, no export. A remote reviewer would have to run the CLI themselves, and the JSON would land on their machine. Not a local file: the CLI serves the page over http. | `npx human-review <file or URL>`; the server injects the overlay. |
| [Agentation](https://github.com/benjitaylor/agentation) (Benji Taylor) | Markdown copied to the clipboard: page path, viewport, then per item the element, a `Location` CSS path, the selected text, and the feedback. A "forensic" level adds URL, user agent, pixel ratio, computed styles, and nearby elements. Its JSON schema (`annotation.v1.json`) has `id, comment, elementPath, x, y, element, url, boundingBox, reactComponents, cssClasses, nearbyText, selectedText, intent (fix / change / question / approve), severity (blocking / important / suggestion), status (pending / acknowledged / resolved / dismissed), thread`. | URL, pathname, viewport, bounding boxes, scroll position. Screenshot, hash or step, click trail, console: none found. | Clipboard markdown, or a sync to its own MCP server backed by local SQLite. No file export, no share link. React-only, so not a plain HTML file. | A React component, `<Agentation />`, React 18 or later. |
| [Plannotator](https://github.com/backnotprop/plannotator) | "Structured Markdown" returned through an agent hook as `{decision: "annotated", feedback}`. Content types: comment on selected text, delete, quick label, "looks good", global comment. The exact template lives in `packages/core/feedback-templates.ts` and was not fetched. | For HTML: none found. It keeps a local version history of the HTML and a text diff between reopenings. | A share link: the markdown is compressed into the URL fragment; raw HTML uses an encrypted short link (AES-256-GCM, key in the fragment, a paste service, 7-day expiry) of a portable copy with assets inlined. The reviewer copies an updated link back; the author uses "Import Review" and forwards the merged set to the agent. The open-source sharing flow is deprecated in favour of hosted Workspaces. Local HTML is served by Plannotator inside a sandboxed iframe, not opened as a file. | A CLI, a Claude Code plugin, or a hook that opens a local browser session. No script tag in your file. |
| [Annotate.js](https://github.com/reviewjs/annotate) (reviewjs) | JSON per comment: `id, page, url, type (highlight / rect / circle / pin / pen / block), author, text, color, anchor {exact, prefix, suffix}, geom {kind, selector, x, y, vw, vh}, resolved, replies, createdAt`. Export envelope: `{kind: "annotate-export", exportedAt, page, url, project, exportedViewport {vw, vh, dpr}, comments}`. Also a plain-text summary in a mailto body. No agent-specific output. | `url` is `location.href`, so a hash-routed step is captured by accident. Viewport per comment, with a warning when the width differs by more than 200px. Screenshot, screen name, click trail: none found. | localStorage keyed by project or host, page keyed by pathname. The reviewer clicks "Download JSON" and sends the file; the author clicks "Import", which re-keys the page after a "different page" warning. Clipboard copy and mailto are also present. From a local file: no server dependency, so it should work, but the host is empty and the pathname is the machine's own path. Unverified in a browser. | One `<script src="annotate.js" data-project data-page>` tag, from a CDN or self-hosted. |
| [stagewise](https://github.com/stagewise-io/stagewise) | Unverified. From memory, not verified: the toolbar sends the selected element's context plus a prompt to the IDE's agent, and needs a running dev server. | Unverified. | Unverified. | Unverified. |

## Takeaways

- **Nobody records which step the reviewer was on.** All four capture at most a URL or pathname; Annotate.js gets
  the hash only because it stores the whole address. No tool records a visible screen name, an open dialog, an
  active tab, or a snapshot of the page as shown. No tool records an interaction trail. This is open ground.
- **Nobody asks what the reviewer was trying to do.** Agentation has an `intent` field, but it is a classification
  (fix, change, question, approve) with a severity, not a "what did you expect" question. No tool has a goal or
  task field.
- **Annotate.js is the closest shape** to a single-file tool: one script tag, no server, comments in localStorage,
  a JSON download and import for the round trip, and it should run from a file on disk. Its anchor (text prefix,
  exact, suffix, plus a CSS selector and the viewport) is a sound base.
- **human-review's JSON is the best agent-facing envelope**: a text anchor, free-text feedback, separate
  before-and-after edits, an overall note, and an explicit status. Worth borrowing even though the tool itself
  is single-machine and needs its server.
- **Plannotator shows the no-account remote-reviewer pattern** (payload in the link, reviewer returns an updated
  link, author imports), and then deprecated it for a hosted product. Read that as a maintenance-cost signal.
- **A state block has to be built by the overlay itself**: read the hash, find the active step (an
  `aria-current` marker, the active tab's text, an open dialog's heading, the nearest visible heading), and keep a
  rolling log of the last few clicks (selector plus visible text) to attach to each comment. Nothing surveyed does
  this.

## What this means for gitmargin

Two squares are open, and they are the two things a coding agent needs most and a human reviewer forgets to
say: **where** they were (the step, not just the element) and **why** they stopped (what they expected). gitmargin
part 1 fills both: every comment carries a state block (screen name or hash, the click trail since the page loaded,
the viewport) and an intent block (a free-text "What did you expect here?" plus an optional tag). The rest of the
shape is borrowed on purpose: Annotate.js for the script tag, the no-server storage, and the file round trip;
human-review for the batch the agent reads; Agentation for the tag list. Link-encoded payloads are not borrowed.
The full shape is in [docs/v0-split.md](../docs/v0-split.md) and the format in
[docs/batch-format.md](../docs/batch-format.md).

## Sources

- https://raw.githubusercontent.com/petergyang/human-review/main/src/SKILL.md, plus `src/cli.js`, `src/state.js`, `src/serialize.js` in the same repository
- https://raw.githubusercontent.com/benjitaylor/agentation/main/package/example/public/schema/annotation.v1.json, plus `package/src/utils/generate-output.ts` and `package/src/types.ts`
- https://github.com/backnotprop/plannotator (README); https://docs.plannotator.ai/open-source/workflows/sharing.md; https://docs.plannotator.ai/open-source/workflows/html.md; https://docs.plannotator.ai/open-source/workflows/annotations-and-feedback
- https://raw.githubusercontent.com/reviewjs/annotate/main/annotate.js and the repository README
- https://github.com/stagewise-io/stagewise (README only; details unverified)
