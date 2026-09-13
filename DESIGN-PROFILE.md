<!--
  design-profile-template.md - the seed for DESIGN-PROFILE.md (issue #160).

  Both installers copy this file to <project>/DESIGN-PROFILE.md ONCE, on a fresh
  install, and never overwrite it afterwards: the seeded copy is user-owned, like
  CLAUDE.md and LESSONS.md. /tk:explore reads it before any design work and offers to
  create it from this template when it is missing. /tk:explore and /tk:document write it;
  /tk:execute only reads it. The rules that use these sections live in the toolkit's
  design-rules skill (tk:design-rules).

  This template ships through the shared-fragment glob, so it is present in every
  install. It is a template, not this repository's own profile: keep every value
  below blank here.
-->
# Design Profile

This file remembers this repository's design answers so the toolkit never asks twice
and never overwrites a design system you already have. Edit it freely.

## Design system

<!-- One of: unknown | none | exists. When it exists, say where it lives (a tokens
     file, a theme config, a component library, a style guide, a Figma link) and what
     it covers (colors, type, spacing, components, motion). -->
- **Status:** exists
- **Where it lives:** the token block at the top of `src/overlay/ui.css` (the `:host` rule). Established 2026-09-02 by the issue #3 overlay; before that the repo had no design system at all.
- **What it covers:** one accent (`--gm-accent` deep ink indigo `#363a9c`), three border tokens split by role (`--gm-line` for decorative dividers, `--gm-line-strong` for surface edges, `--gm-field-line` for the boundary of anything a person operates, which is the one that has to clear 3:1), a panel ground (`--gm-panel`), text and muted text, 13px system UI type, and a 150ms panel widen with a short spring on a new pin. No shadows and no gradients: the look is drawn in one-pixel strokes.

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

## Directions tried

<!-- One line per direction: name, seed, best critic score, kept or dropped. Written
     by /tk:document at the end of a cycle. -->
- **Hairline** - seed `8EJlC5cKVf9RE/8H/9oDT8iVvVw/IqTL` - best critic score 5/10 over the full 5 rounds (4, 5, 5, 5, 5) - **kept**, and it is now the design system above. The score never reached the 9/10 bar; see the retry list below for why that is not the whole story. Receipt: the Design run section of `plans/PLAN-issue-3.md`.
- **Red pen** - no seed drawn - dropped at pick.
- **Wayfinding** - no seed drawn - dropped at pick. Both were dropped because the owner answered "you decide" to the idea list, so one direction was proposed and confirmed rather than three built.
- **Hairline, improve run on comment mode** (issue #10, 2026-09-09) - the same seed, no new direction - critic 5/10 in one round of the two allowed - **kept**. Stopped early on purpose: all six gaps were about the panel or the fixture underneath (composer not anchored, the whole-thing note reads as a caption, the switch quieter than Send, three border treatments, a flat type scale, a four-instruction empty state) and none about the frame the cycle added. Receipt: the Outcomes section of `plans/PLAN-issue-10.md`.

## Prompts to retry on newer models

<!-- Briefs that did not work this time. Try them again when a newer model ships;
     that is how you learn what the latest models can do. -->
- **Hairline**, the brief that shipped: "an overlay drawn in one-pixel strokes and almost nothing else, one accent on white, system UI at 13px, no shadows or gradients, so it reads over any prototype without competing with it." Seed `8EJlC5cKVf9RE/8H/9oDT8iVvVw/IqTL`. It stalled at 5/10 across five critic rounds and is worth retrying, but read the caveat before assuming the brief is the problem: the critic sees one screenshot of the whole frame, and this surface is an overlay sitting on top of someone else's prototype. Three of its repeated complaints were about the prototype underneath, which is not ours to redesign, and one (that no leader ties a pin to its element) was factually wrong by the last round. A fair retry needs either a screenshot that isolates the overlay or a critic told what it is looking at.
- **The panel, as a brief of its own** (from the issue #10 improve run, 2026-09-09). The critic's six gaps are a ready-made brief for a panel cycle rather than a failed one: anchor the composer to the panel's bottom, make the whole-thing note read as a field, give the comment-mode switch the weight Send has, pick one border treatment for name field, select and button, open up the type scale, cut the empty state to one instruction, and give the collapse chevron a hit area. Same seed. The owner said no design changes in the #10 cycle, so this waits for a cycle that is about the panel.

## Baseline images

<!-- Optional paths to screenshots or concept art the design critic treats as a
     moodboard for the quality bar, never as a target to copy. -->
