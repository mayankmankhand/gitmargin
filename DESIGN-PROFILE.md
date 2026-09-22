<!--
  This repository's design profile, seeded once by the toolkit and owned by this repo
  from then on: the toolkit never overwrites it, like CLAUDE.md and LESSONS.md.
  /tk:explore reads it before any design work; /tk:explore and /tk:document write it;
  /tk:execute only reads it. The rules that use these sections live in the toolkit's
  design-rules skill (tk:design-rules). The values below are this repo's real answers.
-->
# Design Profile

This file remembers this repository's design answers so the toolkit never asks twice
and never overwrites a design system you already have. Edit it freely.

## Design system

<!-- One of: unknown | none | exists. When it exists, say where it lives (a tokens
     file, a theme config, a component library, a style guide, a Figma link) and what
     it covers (colors, type, spacing, components, motion). -->
- **Status:** exists
- **Where it lives:** the two token blocks at the top of `src/overlay/ui.css`: the `:host` rule (the light set, **Marker**) and the `:host(.gm-dark)` rule (the dark set, **Graphite**). Established 2026-09-22 by the issue #21 rethink, which retired Hairline (below). Which set applies is measured from the page underneath by `src/overlay/theme.js`, never taken from the browser's colour-scheme preference: the overlay sits on someone else's prototype, and a dark prototype is dark on a light-mode machine too.
- **What it covers:** one accent (violet `#7c3aed` for fills, `--gm-accent-ink` for lines and text, which lightens to `#b39cf7` on dark) used for exactly three things: the armed state of comment mode, Send to author, and the frame around a selected element; one colour per person for pins and chips (eight fills in `src/overlay/author.js`, all clearing 4.5:1 with white initials, chosen by a hash of the handle or the name, grey with a question mark for no name); surfaces (`--gm-surface`, `--gm-surface-2`), text and muted text, a decorative line and a 3:1 field line, a ring in the page's ground colour around every pin (one pixel on light, two on dark) so a pin never vanishes into the page; real shadows on the pill, the thread, the sheet and the popovers; 12px radius on cards and a 999px pill; 13px system UI type; a 200ms spring on a new pin, 120ms on hover, 150ms when the chrome moves aside for the sheet. Components: the teardrop pin (26px, point on the spot, four orientations), the frame (one pixel plus a soft ring, hugging the words), the thread card (300px, capped at 70vh), the sheet (320px, right edge), the pill chrome (Comment, the count badge with an unread dot, the identity chip), the comment box, and the identity popover.

## Allowed variance

<!-- What exploration may change inside the design system without asking. The
     default is layout, composition, motion, and copy. Colors, type, spacing, and
     components stay as the system defines them unless a divergence page says
     otherwise. -->
- layout, composition, motion, copy

## Taste notes

<!-- Reactions captured while reacting to idea lists in /tk:explore: what felt right,
     what felt tacky, what to avoid. One line each, newest last. -->
- 2026-09-02, issue #3 overlay: shown seven one-line looks (margin notes, sticky notes, inspector, Docs literal, red pen, ghost, wayfinding) and answered "you decide"; no per-idea reactions. Standing constraint accepted: the overlay sits on someone else's prototype and must read over any page without competing with it.
- 2026-09-22, issue #21 rethink: Hairline "looked dated" and "it wasn't crystal clear where the comments lay". Wants the experience of the comment tools people already use (Claude artifact comments, Figma, Notion): the thread opens at the spot it is about, an avatar chip marks the spot, the full list is on demand rather than always open, colours may differ. Framed by the owner as an improvement and a system change, not a divergence. Resolve from the page is out of scope.

## Directions tried

<!-- One line per direction: name, seed, best critic score, kept or dropped. Written
     by /tk:document at the end of a cycle. -->
- **Hairline** - seed `8EJlC5cKVf9RE/8H/9oDT8iVvVw/IqTL` - best critic score 5/10 over the full 5 rounds (4, 5, 5, 5, 5) - **kept from issue #3 to issue #18, retired in issue #21** (2026-09-22) by the owner's decision. Its improve runs on comment mode (#10), the shared-mode panel (#15) and the sign-in identity line (#18) each scored 5/10 and each re-raised the same panel gaps, recorded below as the standing panel brief, which the #21 rethink closed. Receipts: the Design run sections of `plans/PLAN-issue-3.md`, `-10`, `-15` and `-18`.
- **Red pen** and **Wayfinding** - no seeds drawn - dropped at the #3 pick, because the owner answered "you decide" to the idea list.
- **Marker, with Graphite on dark** (issue #21, 2026-09-22) - seeds `K0zslNDYCdVjvtCjfr1i7MojAWBYuquk` (Marker) and `PVkYGctr9kR3KplKvgmJKOijApPq8xSp` (Graphite, folded in as the dark surfaces) - picked from three rendered prototypes ("Marker + graphite with outline if dark mode prototype") - critic rounds on a real shared page with two people, light and dark: 5 and 5, then 5 and 5, then 5, 5 and 6; stopped per M15, round 3 kept, its fix pass applied unscored - **kept, and it is now the design system above.** Gaps left open at the stop: two pins on adjacent elements still read as a pair (a cluster with a count is the next idea); a thread beside the column sits away from a short heading, bridged by a hairline; the sheet's empty space with only three comments; the teardrop tails, which one critic read as map markers and the direction chose on purpose. Receipt: the Outcomes of `plans/PLAN-issue-21.md`.
- **Paper** (issue #21) - seed `Ko78QNp4eAjbVGZi7lzSKvjpIxatSY4H` - the Notion-like light direction - dropped at pick.
- **Graphite** on its own (issue #21) - seed `PVkYGctr9kR3KplKvgmJKOijApPq8xSp` - dropped at pick as a direction; its dark surfaces live on inside Marker.

## Prompts to retry on newer models

<!-- Briefs that did not work this time. Try them again when a newer model ships;
     that is how you learn what the latest models can do. -->
- **Hairline**, the brief that shipped in #3 and was retired in #21: "an overlay drawn in one-pixel strokes and almost nothing else, one accent on white, system UI at 13px, no shadows or gradients, so it reads over any prototype without competing with it." Seed `8EJlC5cKVf9RE/8H/9oDT8iVvVw/IqTL`. It stalled at 5/10 across five critic rounds and three improve runs. The owner's verdict after living with it was "dated" and "not clear where the comments lay", so a retry should start from the #21 model (thread at the spot, list on demand) and ask only whether hairline strokes can carry it.
- **The standing panel brief (issues #10 to #18), closed by #21.** The critic's recurring gaps were: anchor the composer to the panel's bottom, make the whole-thing note read as a field, give the comment-mode switch the weight Send has, pick one border treatment, open up the type scale, cut the empty state to one instruction, give the collapse chevron a hit area, collapse the always-open name field to one line, stop stating the identity twice, and make it clear where a comment was made. What #21 did with each: the panel is gone, so the composer question is moot (the comment box opens at the spot); the whole-thing note is drawn as a field; comment mode is a tinted button in the pill and Send is the one solid accent; borders are one field line and one decorative line; the type scale is 13px body, 12px meta, 14px sheet title; the empty state is one sentence; the chevron is gone (the sheet has an X and Escape); the name field lives under the identity chip; the identity is a chip with initials, and "(you)" stays on rows and threads on purpose, because in a list of several people the reader needs it; and where a comment was made is answered by construction: the pin is at the spot, the thread opens beside it, and a row in the sheet lights its pin on hover and scrolls to it on click.
- **Marker after its review (2026-09-22).** The critic loop stopped at 5/10 light and 6/10 dark, and the review that followed changed the surface again, outside the loop and unscored: a line under the pill for what the closed sheet hid, the pill given a stacking order above the sheet on a narrow window, the nameless identity chip reading "Your name" rather than a question mark, Edit and Delete revealed on hover, and the sheet's rows cut to two lines. Those are the critic's own composition complaints answered by a different route, so a retry of this brief should be scored against the current surface rather than the round-3 screenshots. Receipt: the review digest in `reports/review-orchestrator-2026-09-22-125835.md`.

- **Marker, the brief that shipped in #21:** "Figma-style teardrop pins with initials and a number in one colour per person, a white thread card at the spot with the element's name as context, hover to preview, a list sheet grouped by screen with All, Unread and Mine, a floating pill chrome, and a dark variant that reads as the tool over a dark page." Seeds above. It reached 6/10 on the dark page and 5/10 on the light one over three rounds. Read the caveat before assuming the brief is the problem: the critic sees the whole frame, including the Sony prototype underneath, and renders in a headless Linux fallback font that no reviewer sees; a fair retry gives the critic a screenshot on the reviewer's own font or tells it what it is looking at. The one structural idea not tried: clustering pins that sit within a pin's height of each other into one pin with a count.

## Baseline images

<!-- Optional paths to screenshots or concept art the design critic treats as a
     moodboard for the quality bar, never as a target to copy. -->
