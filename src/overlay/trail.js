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
import { collapse, renderedText, visibleText, short } from './text.js';
import { controlFor } from './target.js';
import { ROOT } from './root.js';

/** Batch format section 4: a rolling log of the last 20 clicks. */
const MAX_ENTRIES = 20;

/** The longest text an entry can carry, matching `short`'s own truncation. */
const LABEL_MAX = 40;

const entries = [];
let recording = true;
let lastStep = null;

/** Turn recording off while comment mode is on. */
export function setRecording(on) {
  recording = !!on;
}

/**
 * What a click was aimed at, or null when it was aimed at nothing.
 *
 * The raw event target is whatever node the pointer happened to land on, which
 * is often <body> or a wrapper. In the first real run, four of fifteen entries
 * were <body> and each carried the whole page truncated to 40 characters, so
 * the trail an agent reads ran "after clicking Next, Sony Sound Connect Seven
 * steps to set u…, Sony Sound Connect Seven steps to set u…, ...". The trail is
 * supposed to BE the state of a multi-step prototype, so a click on empty page
 * furniture is not a step in it.
 *
 * A control wins outright. Failing that the element is kept only if its text is
 * short enough to be a label rather than a container's whole contents, because
 * a prototype may well advance on a plain <div> with a click handler and losing
 * that step would be worse than the noise this removes.
 */
function stepFor(target) {
  // The control step is shared with the comment target (target.js). The rest
  // of this rule is the trail's own: the comment target keeps a raw element
  // because it must frame and anchor something, while a step that is not a
  // control and not a label is noise in a trail and is dropped.
  const control = controlFor(target);
  if (control) return control;
  if (target.localName === 'body' || target.localName === 'html') return null;
  const text = collapse(visibleText(target));
  return text && text.length <= LABEL_MAX ? target : null;
}

/**
 * What to call it. A form field has no text of its own, so three more entries
 * in that same run read as nothing at all; its own <label> is what a person
 * would call it, and is what the trail records instead.
 */
function nameFor(el) {
  const own = visibleText(el);
  if (own) return own;
  if (el.labels && el.labels.length) {
    const labelled = collapse(Array.from(el.labels, (l) => renderedText(l)).join(' '));
    if (labelled) return labelled;
  }
  return collapse(el.getAttribute('placeholder') || el.getAttribute('name') || '');
}

function onClick(event) {
  if (!recording) return;
  const target = event.target;
  if (!target || target.nodeType !== 1) return;
  // Never log the overlay's own UI.
  if (target.closest(ROOT)) return;

  const step = stepFor(target);
  if (!step) return;

  // One press on a <label> arrives twice, because the browser forwards it to
  // the control the label names. Keep the label, which is the half with words
  // on it, and drop the echo.
  if (step === lastStep) return;
  if (lastStep && lastStep.localName === 'label' && (lastStep.contains(step) || lastStep.control === step)) {
    return;
  }
  lastStep = step;

  entries.push({
    at: Date.now(),
    selector: selectorFor(step),
    text: short(nameFor(step)),
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
