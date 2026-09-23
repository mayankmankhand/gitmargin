---
name: build-rules
description: Rules for building an HTML prototype that people will review with gitmargin comments, so every comment stays on the step it was made on. Use whenever you create or restructure a clickable HTML prototype, mockup, wizard, onboarding flow or multi-screen page, especially one that will be shared for review.
when_to_use: The user asks for a prototype, mockup, clickable demo, wizard, onboarding or signup flow, or a multi-step or multi-screen HTML page; or asks to change how the screens of an existing one are shown; or asks to share, send or publish a prototype for review.
---

# Build a prototype that can be reviewed

gitmargin puts comments on an HTML prototype. Each comment records the element a reviewer clicked and the step (screen) they were on, and its pin shows only on that step. That works on almost any page, but some common ways of building a page break it without any warning: a pin jumps onto the next step's lookalike button, every comment gets the same step name, or the page breaks once it is shared. Follow these rules whenever you build or restructure a prototype. They cost nothing when the page is never reviewed.

## The rules

1. **One self-contained HTML file.** Put CSS in `<style>`, script in `<script>`, and images inline (`data:` URLs or inline SVG). Scripts and fonts from a public CDN (`https://...`) are fine. Only this one file is wrapped and shared, so a relative `styles.css`, `app.js` or `img/logo.png` goes missing for the reviewer.

2. **Every screen lives in this same file.** Do not link to `step2.html`. Show and hide screens with script instead.

3. **Each step gets its own wrapper with a unique `id` and a `data-gm-screen` name.** The name is what the author reads next to each comment, so make it the step's human name.

   ```html
   <section id="step-details" data-gm-screen="Your details">...</section>
   <section id="step-plan" data-gm-screen="Choose a plan" hidden>...</section>
   ```

   This applies to React and to any code that redraws one area for each step. Render the step's wrapper with its own `id` and `data-gm-screen`, not a shared `<div id="app">` whose contents change:

   ```jsx
   <section key={step.id} id={`step-${step.id}`} data-gm-screen={step.title}>...</section>
   ```

   Both attributes are needed: the name alone, or the id alone, still lets a pin follow a comment onto the next step's lookalike.

4. **Hide steps that are not showing with `hidden` or `display: none`.** Not with `visibility: hidden`, `opacity: 0`, or by sliding them off screen: to the page those still count as showing, so pins land on the wrong step.

5. **Switch steps with script** (a click handler that changes `hidden` or a class). Not with CSS alone (`:target`, `:checked`, or an attribute on `<html>`): the page does not tell anyone a step changed, and old pins stay on screen.

6. **No step inside a modal dialog.** A `<dialog>` opened with `showModal()` sits above everything, including the comment tools, so a reviewer cannot comment on it. Show that step as a normal section, or open the dialog with `show()`.

7. **Guard browser storage.** Wrap every `localStorage`, `sessionStorage`, `indexedDB` or `document.cookie` call in `try { ... } catch {}` and carry on without it. The shared review link opens the page locked down, where storage calls throw, and an unguarded one stops the whole script.

   ```js
   function remember(key, value) { try { localStorage.setItem(key, value); } catch {} }
   ```

8. **Route with the hash, not the path.** Use `location.hash = '#plan'` and a `hashchange` listener, not `history.pushState`. A page opened from disk cannot change its path, and comments made after a path change are lost on reload.

9. **No Content-Security-Policy `<meta>` tag.** It stops the comment tools from starting, silently.

## Check before you finish

When the file is written, run:

```bash
gitmargin check <file.html>
```

Fix every finding marked `breaks`, then run it again. A `no-screen-names` note means rule 3 is missing somewhere: fix it. A `modal-dialog` note needs fixing only when that dialog is one of the steps (rule 6); a confirmation pop-up can stay. If the `gitmargin` command is not found, the plugin is not installed on this machine; skip the check and say so.

The first time in a project, Claude Code may ask the author's permission to run `gitmargin check`. Run the check as a Bash call of its own, exactly as written above, so that one "Yes, and don't ask again" (which saves `gitmargin check *` for this project) covers every later check.

## Sharing it

Sharing for review is the author's own step: they type `/gitmargin:share <file.html>`, and you cannot start it for them. When the author asks you to share, send or publish a prototype for review, check it as above, then tell them to type `/gitmargin:share <file.html>`. Do not email, upload or attach the file yourself instead.
