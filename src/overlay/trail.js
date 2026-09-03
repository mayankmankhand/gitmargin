// The click trail: what the reviewer did before they stopped to comment.
//
// For a multi-step prototype the trail IS the state. "After clicking Next,
// Next" is what lets a coding agent, or a human, get back to the same view.
// Nothing surveyed in research/agent-feedback-formats.md records this.
//
// Two hard rules:
//   1. Clicks only. What was typed into a field is never recorded, not the
//      value and not the field's focus.
//   2. Only while comment mode is off. A click that opens a comment box is the
//      reviewer talking to the overlay, not walking through the prototype.

import { selectorFor } from './selector.js';
import { visibleText, short } from './text.js';

/** Batch format section 4: a rolling log of the last 20 clicks. */
const MAX_ENTRIES = 20;

const entries = [];
let recording = true;

/** Turn recording off while comment mode is on. */
export function setRecording(on) {
  recording = !!on;
}

function onClick(event) {
  if (!recording) return;
  const target = event.target;
  if (!target || target.nodeType !== 1) return;
  // Never log the overlay's own UI.
  if (target.closest('#gitmargin-root')) return;

  entries.push({
    at: Date.now(),
    selector: selectorFor(target),
    text: short(visibleText(target)),
  });
  if (entries.length > MAX_ENTRIES) entries.shift();
}

/** Start listening. Capture phase, so a prototype that stops propagation is still logged. */
export function startTrail() {
  document.addEventListener('click', onClick, true);
}

/**
 * The trail as the batch carries it: oldest first, each entry saying how many
 * seconds before this moment the click happened.
 */
export function trailFor(now = Date.now()) {
  return entries.map((e) => ({
    seconds_before: Math.max(0, Math.round((now - e.at) / 1000)),
    selector: e.selector,
    text: e.text,
  }));
}
