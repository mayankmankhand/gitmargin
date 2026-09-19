// The Hairline UI: pins on the page, a panel down the right edge, and one
// comment box. Everything lives in a shadow root, so the prototype's CSS cannot
// reach in and the overlay's cannot reach out.
//
// The overlay never writes into the prototype's DOM. Pins and quote underlines
// are drawn in our own tree at viewport coordinates, so the page the reviewer
// sends back is the page they were given.

import css from './ui.css';
import { ROOT_ID } from './root.js';

const TAGS = ['change', 'bug', 'question', 'like'];

/** Small DOM helper: el('div', { class: 'x' }, [children]). */
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) if (child) node.appendChild(child);
  return node;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * A Range covering `exact` inside `root`, or null.
 * Whitespace-tolerant, because the stored quote is collapsed and the page's is
 * not. Best effort: a quote that spans several elements gets no underline.
 */
function rangeForQuote(root, exact) {
  // Typed, not just truthy: on a shared page this value was written by whoever
  // holds the page key, and a number here used to throw inside the loop that
  // draws every pin, hiding all of them for every reviewer (review R4). The
  // service now refuses such a value; this is the overlay not relying on that.
  if (!root || typeof exact !== 'string' || !exact || exact.length > 200) return null;
  const pattern = new RegExp(exact.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'));
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const match = pattern.exec(node.data);
    if (match) {
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      return range;
    }
  }
  return null;
}

export function mountUi(deps) {
  const { store, batch, createComment, anchorFromElement, anchorFromSelection, resolve, setRecording, targetFor } = deps;
  // Null unless the page is shared (issue #15, src/overlay/sync.js). Every
  // shared-mode element below is built only when this is set, so a plain file
  // gets exactly the panel it always had.
  const sync = deps.sync || null;
  /** A blank name is allowed; it still needs something to stand in the list. */
  const nameOf = (author) => (author && author.name && author.name.trim()) || 'Someone';

  // ---- host + shadow root -------------------------------------------------
  const host = el('div', { id: ROOT_ID, popover: 'manual' });
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.appendChild(el('style', { text: css }));
  document.body.appendChild(host);
  try {
    // Joins the top layer, which puts the overlay above ordinary page content
    // whatever z-index that content uses.
    //
    // Known limit, measured: a <dialog> opened with showModal() AFTER this
    // point sits above us in the top layer, and re-showing the popover does not
    // reorder it (Chromium 151). While such a dialog is open the panel and the
    // comment box are behind its backdrop, so a reviewer cannot comment on a
    // modal dialog's contents. Recorded for the issue #6 dogfood rather than
    // worked around, because every workaround writes into the prototype's DOM.
    host.showPopover();
  } catch {
    host.removeAttribute('popover'); // older engine: plain fixed positioning
  }

  const pinLayer = el('div');
  const lineLayer = el('div');
  shadow.append(pinLayer, lineLayer);
  // The target preview: the element a click would attach a comment to, framed
  // before the click. One persistent element rather than a child of lineLayer,
  // which renderPins empties on every frame (issue #10).
  const targetFrame = el('div', { class: 'gm-frame gm-target', hidden: 'hidden' });
  shadow.appendChild(targetFrame);

  // ---- state --------------------------------------------------------------
  let commentMode = false;
  let selectedId = null;
  let editingId = null;
  // The reply being written, kept here rather than in the DOM: the list is
  // rebuilt whenever comments change, and in shared mode they change while you type.
  let replyingId = null;
  let editingReplyId = null;
  let replyDraft = '';
  let replyDiscardArmed = false; // Escape or Cancel pressed once over a typed reply
  let focusAfterRender = null; // a data-focus token to return keyboard focus to
  let draft = null; // { anchor, element, x, y, tag }
  let stashedSelection = null;
  let framed = null; // the element the target preview is on, or null
  let pointerDown = false; // a drag in progress may be a text selection
  let selectionMoved = false; // did the selection change during this gesture?
  let selectionAtDown = ''; // the selection's text when the pointer went down

  // ---- panel --------------------------------------------------------------
  const rail = el('button', {
    class: 'gm-rail',
    type: 'button',
    'aria-label': 'Open the gitmargin comment panel',
  });
  const switchBtn = el('button', {
    class: 'gm-switch',
    type: 'button',
    role: 'switch',
    'aria-checked': 'false',
    title: 'While this is on, clicking marks a spot instead of using the page. Escape turns it off.',
  }, [
    el('span', { class: 'dot' }),
    el('span', { class: 'label', text: 'Comment mode' }),
  ]);
  const closeBtn = el('button', { class: 'gm-close', type: 'button', title: 'Collapse', text: '›' });
  const nameInput = el('input', { type: 'text', id: 'gm-reviewer', placeholder: 'optional' });

  const listLabel = el('div', { class: 'gm-section' }, [el('span', { text: 'Comments' }), el('span', { class: 'gm-spacer' })]);
  const listCount = el('span', { class: 'count' });
  listLabel.appendChild(listCount);
  const list = el('div', { class: 'gm-list' });
  const overall = el('textarea', {
    placeholder: 'Anything that is not about one spot',
    'aria-label': 'A note about the whole thing',
    hidden: 'hidden',
  });
  const noteToggle = el('button', { class: 'gm-note-toggle', type: 'button', text: 'Add a note about the whole thing' });
  const sendBtn = el('button', { class: 'gm-btn primary', type: 'button', text: 'Send to author' });
  const copyBtn = el('button', { class: 'gm-btn ghost', type: 'button', text: 'Copy for author' });
  const said = el('div', { class: 'gm-said', role: 'status', 'aria-live': 'polite' });
  const keepNote = el('div', { class: 'gm-keep', role: 'status', 'aria-live': 'polite' });

  // Shared mode only: which version of the page this is, the way to the others,
  // and a nudge when this is not the newest. At the top of the panel rather
  // than across the page, because a bar would cover the design under review.
  const versionBtn = el('button', { class: 'gm-version', type: 'button', 'aria-expanded': 'false' });
  // Polite live region: 'Loading...' and a failure to load are otherwise silent.
  const versionList = el('div', { class: 'gm-versions', hidden: 'hidden', 'aria-live': 'polite' });
  const newerNote = el('div', { class: 'gm-newer', role: 'status' });
  const sharedHead = el('div', { class: 'gm-shared', hidden: 'hidden' }, [versionBtn, versionList, newerNote]);

  const panel = el('div', {
    class: 'gm-panel is-open',
    role: 'complementary',
    'aria-label': 'gitmargin comments',
  }, [
    rail,
    el('div', { class: 'gm-panel-inner' }, [
      el('div', { class: 'gm-head' }, [
        el('span', { class: 'gm-label name', text: 'gitmargin' }),
        el('div', { class: 'gm-spacer' }),
        switchBtn,
        closeBtn,
      ]),
      ...(sync ? [sharedHead] : []),
      el('div', { class: 'gm-who' }, [
        el('label', { for: 'gm-reviewer', text: sync ? 'Your name, shown with your comments' : 'Your name, for the author' }),
        nameInput,
      ]),
      listLabel,
      list,
      el('div', { class: 'gm-foot' }, [noteToggle, overall, el('div', { class: 'gm-send' }, [sendBtn, copyBtn]), said, keepNote]),
      el('div', { class: 'gm-fill' }),
    ]),
  ]);
  shadow.appendChild(panel);

  const openPanel = () => panel.classList.add('is-open');
  const setMode = (on) => {
    commentMode = !!on;
    setRecording(!commentMode); // the trail records the prototype, not the overlay
    switchBtn.classList.toggle('is-on', commentMode);
    document.documentElement.style.cursor = commentMode ? 'crosshair' : '';
    // A page-level signal that survives collapsing the panel. The crosshair is
    // not enough on its own: a prototype's own `cursor: pointer` wins over it
    // on exactly the buttons a reviewer tries to click (review R14).
    host.classList.toggle('gm-armed', commentMode);
    switchBtn.setAttribute('aria-checked', commentMode ? 'true' : 'false');
    if (!commentMode) hideTarget();
    if (commentMode) openPanel();
    // Leaving the mode governs what a click does; it is not a reason to throw
    // away a comment in progress. An empty box closes, a written one stays open
    // so the reviewer can still save it (review R16, residual path).
    else if (!boxText.value.trim()) closeBox();
  };

  rail.addEventListener('click', openPanel);
  closeBtn.addEventListener('click', () => {
    // Collapsing hides the switch, so leaving comment mode armed behind it
    // would freeze the prototype with no visible cause (review R14).
    setMode(false);
    panel.classList.remove('is-open');
  });
  switchBtn.addEventListener('click', () => setMode(!commentMode));
  noteToggle.addEventListener('click', () => {
    overall.hidden = !overall.hidden;
    noteToggle.textContent = overall.hidden ? 'Add a note about the whole thing' : 'A note about the whole thing';
    if (!overall.hidden) overall.focus();
  });
  nameInput.addEventListener('input', () => store.setReviewer(nameInput.value));
  overall.addEventListener('input', () => store.setOverallNote(overall.value));

  sendBtn.addEventListener('click', () => {
    const name = batch.download();
    store.markExported();
    said.textContent = `Saved ${name} to your downloads. Reply to the message you got this file in and attach it.`;
  });
  copyBtn.addEventListener('click', async () => {
    const result = await batch.copy();
    if (window.__gitmargin) {
      window.__gitmargin.lastCopy = result.text;
      window.__gitmargin.lastCopyOk = result.ok;
    }
    if (result.ok) store.markExported();
    said.textContent = result.ok
      ? 'Copied. Paste it anywhere.'
      : 'Could not reach the clipboard. Use Send to author instead.';
  });

  // ---- comment box --------------------------------------------------------
  const boxWhere = el('div', { class: 'where' });
  const boxText = el('textarea', {
    placeholder: 'What did you expect here?',
    'aria-label': 'What did you expect here?',
  });
  const chips = TAGS.map((tag) =>
    el('button', {
      class: 'gm-chip',
      type: 'button',
      text: tag,
      'data-tag': tag,
      'aria-pressed': 'false',
    })
  );
  const boxWarn = el('div', { class: 'gm-boxwarn' });
  const saveBtn = el('button', { class: 'gm-btn primary', type: 'button', text: 'Save' });
  const cancelBtn = el('button', { class: 'gm-btn', type: 'button', text: 'Cancel' });
  // Shared mode asks for a name once, at the moment it first matters: other
  // people are about to read this comment. Blank is allowed (it shows as
  // "Someone"), so the ask can never stand between a reviewer and saving.
  // The explanation is tied to the field, so a screen reader landing there hears
  // that the first Save did not save, not only the field's label (review R28).
  const NAME_WHY = 'Not saved yet. Others will see this, so add your name, or press again to go without one.';
  const boxName = el('input', { type: 'text', 'aria-label': 'Your name, shown with your comments', 'aria-describedby': 'gm-box-name-why', placeholder: 'Your name', maxlength: '80' });
  const boxNameRow = el('div', { class: 'gm-box-name', hidden: 'hidden' }, [
    el('div', { class: 'gm-box-name-why', id: 'gm-box-name-why', text: NAME_WHY }),
    boxName,
  ]);
  /** The box was placed for the height it had. When it grows, keep Save on screen (review R10). */
  function keepBoxInView() {
    const rect = box.getBoundingClientRect();
    box.style.top = `${clamp(rect.top, 8, Math.max(8, window.innerHeight - rect.height - 8))}px`;
  }
  let replyNameAsk = false; // the same ask, drawn beside a reply instead
  let nameAsked = false;
  /** True when the save should wait because the name row was just shown. */
  function askNameFirst(where = 'box') {
    if (!sync || nameAsked || store.reviewer().trim()) return false;
    nameAsked = true;
    if (where === 'box') {
      boxNameRow.hidden = false;
      keepBoxInView();
      boxName.focus();
    } else {
      // Asked beside the reply itself. It used to send focus to the name field at
      // the top of the panel and explain itself in the footer, leaving the reply
      // behind with no way back by keyboard (review R11).
      replyNameAsk = true;
      render(true);
    }
    return true;
  }
  boxName.addEventListener('input', () => store.setReviewer(boxName.value));

  const box = el('div', { class: 'gm-box', hidden: 'hidden' }, [
    boxWhere,
    boxText,
    el('div', { class: 'gm-chips' }, chips),
    boxNameRow,
    el('div', { class: 'gm-box-actions' }, [saveBtn, cancelBtn]),
    boxWarn,
  ]);
  shadow.appendChild(box);

  chips.forEach((chip) =>
    chip.addEventListener('click', () => {
      const tag = chip.dataset.tag;
      draft.tag = draft.tag === tag ? null : tag;
      chips.forEach((c) => {
        const on = c.dataset.tag === draft.tag;
        c.classList.toggle('is-on', on);
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    })
  );

  function closeBox() {
    box.hidden = true;
    draft = null;
    hideTarget(); // the next pointer move frames whatever is under it again
    chips.forEach((c) => {
      c.classList.remove('is-on');
      c.setAttribute('aria-pressed', 'false');
    });
    boxText.value = '';
    boxWarn.textContent = '';
    boxNameRow.hidden = true;
  }

  /**
   * Close, but not silently over work in progress.
   *
   * Escape is the reflex used to dismiss an autofill dropdown or an
   * input-method candidate list, and a click elsewhere on the page is how a
   * reviewer explores. Either one used to throw away a written paragraph with
   * no prompt and no undo (review R16). The second attempt goes through.
   */
  function closeBoxGuarded() {
    if (boxText.value.trim() && !boxWarn.textContent) {
      boxWarn.textContent = 'Press again to discard what you typed.';
      boxText.focus();
      return false;
    }
    closeBox();
    return true;
  }

  /**
   * How the box describes the spot. The reviewer may be a designer or an
   * executive, so a raw CSS selector is not an answer; the exported markdown
   * already says "the Continue button", and this says the same (review R27).
   */
  function describe(anchor, element) {
    const quoted = anchor.quote && anchor.quote.exact;
    if (quoted) return `"${quoted.slice(0, 60)}"`;
    const label = element && element.nodeType === 1
      ? (element.getAttribute('aria-label') || element.getAttribute('title') || '').trim()
      : '';
    const tag = element && element.nodeType === 1 ? element.localName : '';
    const noun = batch.nounFor(tag || anchor.selector);
    return label ? `the "${label}" ${noun}` : `the ${noun}`;
  }

  function openBox({ anchor, element, x, y, framed: keep = null }) {
    draft = { anchor, element, tag: null };
    boxWhere.textContent = describe(anchor, element);
    // While the box is open the frame stays on the thing being commented on,
    // so "what am I commenting on" has an answer the whole time the reviewer
    // is typing. A highlight has no frame: the selection itself is the mark.
    if (keep) showTarget(keep);
    else hideTarget();
    boxText.value = '';
    box.hidden = false;
    // Place it near the spot, then keep it inside the viewport. A keyboard
    // entry has no pointer coordinates, so fall back to the element's own box
    // rather than pinning the panel to the top-left corner (review R20).
    const width = 268;
    const height = box.getBoundingClientRect().height || 190;
    let atX = x;
    let atY = y;
    if (!Number.isFinite(atX) || !Number.isFinite(atY) || (atX === 0 && atY === 0)) {
      const rect = element && element.getBoundingClientRect
        ? element.getBoundingClientRect()
        : { left: 24, bottom: 24 };
      atX = rect.left;
      atY = rect.bottom;
    }
    box.style.left = `${clamp(atX + 12, 8, window.innerWidth - width - 8)}px`;
    box.style.top = `${clamp(atY + 12, 8, window.innerHeight - height - 8)}px`;
    boxText.focus();
  }

  function saveDraft() {
    const text = boxText.value.trim();
    if (!text || !draft) return;
    if (askNameFirst()) return;
    boxNameRow.hidden = true;
    const comment = createComment({
      anchor: draft.anchor,
      element: draft.element,
      text,
      tag: draft.tag,
    });
    store.add(comment);
    closeBox();
    openPanel();
  }

  saveBtn.addEventListener('click', saveDraft);
  cancelBtn.addEventListener('click', closeBoxGuarded);
  boxText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveDraft();
  });
  // Enter that confirms an input-method candidate is not Enter that submits
  // (review R29): Japanese, Chinese and Korean typing all pass through it.
  boxName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) saveDraft();
  });
  // Still writing, so the "press again to discard" arming no longer applies.
  boxText.addEventListener('input', () => {
    boxWarn.textContent = '';
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!box.hidden) {
      e.preventDefault();
      closeBoxGuarded();
      return;
    }
    // R14: with no box open, Escape is the way out of comment mode. Without it
    // there was no keyboard exit at all, and a reviewer who could not find the
    // switch had a frozen prototype and no explanation.
    if (commentMode) {
      e.preventDefault();
      setMode(false);
    }
  });

  // ---- target preview (issue #10) -----------------------------------------
  // In comment mode nothing used to show what a click would attach to, and the
  // answer was the innermost node under the pointer: a word's <span>, an icon,
  // a wrapper. Now the pointer is followed by a frame around targetFor(node),
  // and the click handler below calls the same function, so the frame can only
  // ever show the element the click will pick.

  /**
   * The stroke never leaves the window. A wrapper wider than the viewport used
   * to get a frame with all four edges offscreen, which looked exactly like
   * "nothing to comment on" while a click still opened a box on it (review R7,
   * #10 cycle). Four pixels in, so the line sits inside the armed border with
   * a gap rather than on top of it.
   */
  const INSET = 4;

  /** Put the frame where `framed` is now, or hide it if it has gone. */
  function placeTarget() {
    if (!framed) return;
    const rect = framed.isConnected ? framed.getBoundingClientRect() : null;
    if (!rect || (!rect.width && !rect.height)) {
      hideTarget();
      return;
    }
    const left = Math.max(rect.left - 3, INSET);
    const top = Math.max(rect.top - 3, INSET);
    const right = Math.min(rect.right + 3, window.innerWidth - INSET);
    const bottom = Math.min(rect.bottom + 3, window.innerHeight - INSET);
    if (right <= left || bottom <= top) {
      targetFrame.hidden = true; // scrolled out of view: still the target, nothing to draw
      return;
    }
    targetFrame.style.left = `${left}px`;
    targetFrame.style.top = `${top}px`;
    targetFrame.style.width = `${right - left}px`;
    targetFrame.style.height = `${bottom - top}px`;
    targetFrame.hidden = false;
  }

  function showTarget(element) {
    framed = element;
    placeTarget();
  }

  function hideTarget() {
    framed = null;
    targetFrame.hidden = true;
  }

  /**
   * The selection this pointer gesture made, or null.
   *
   * A selection left over from before comment mode was turned on, or made with
   * the keyboard, survives a click on a button in both engines. Stashing
   * whatever selection existed at mouseup then anchored the old quote while the
   * frame sat on the button (review R1, #10 cycle; measured in Chromium and
   * Firefox). A selection is the click's intent only when the gesture changed
   * it: the change flag catches the ordinary drag, and the text comparison
   * catches an engine that reports the change late.
   */
  function freshSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return null;
    return selectionMoved || sel.toString() !== selectionAtDown ? sel : null;
  }

  /** A drag that is selecting text: the selection is its own preview. */
  function selecting() {
    return pointerDown && !!freshSelection();
  }

  /** Frame what `raw` resolves to, or nothing when it resolves to nothing. */
  function followPointer(raw) {
    if (!commentMode || !box.hidden) return; // an open box owns the frame
    if (selecting()) {
      hideTarget();
      return;
    }
    const target = targetFor(raw);
    if (target) showTarget(target);
    else hideTarget();
  }

  // One update per animation frame, however fast the pointer moves. Capture
  // phase, like every other listener here, so a prototype that stops
  // propagation cannot hide the preview. Over the overlay's own panel the
  // event target is the host, which targetFor rejects, so the frame goes away.
  let lastPointerTarget = null;
  let pointerScheduled = false;
  document.addEventListener(
    'pointermove',
    (event) => {
      if (!commentMode) return;
      lastPointerTarget = event.target;
      if (pointerScheduled) return;
      pointerScheduled = true;
      requestAnimationFrame(() => {
        pointerScheduled = false;
        followPointer(lastPointerTarget);
      });
    },
    true
  );
  document.addEventListener(
    'pointerdown',
    () => {
      pointerDown = true;
      selectionMoved = false;
      selectionAtDown = String(window.getSelection() || '');
    },
    true
  );
  document.addEventListener('selectionchange', () => {
    if (pointerDown) selectionMoved = true;
  });
  document.addEventListener('pointerup', () => { pointerDown = false; }, true);
  document.addEventListener('pointercancel', () => { pointerDown = false; }, true);
  // Leaving the window: pointerleave does not bubble, so a listener on the
  // document element fires for the window edge and nothing else.
  document.documentElement.addEventListener('pointerleave', () => {
    if (commentMode && box.hidden) hideTarget();
  });

  // The keyboard route sees the same preview: Tab onto a control and the frame
  // is on what C will comment on. Focus landing in the overlay resolves to
  // nothing and clears it.
  document.addEventListener(
    'focusin',
    (event) => {
      if (!commentMode || !box.hidden) return;
      const target = targetFor(event.target);
      if (target) showTarget(target);
      else hideTarget();
    },
    true
  );

  // ---- picking a spot -----------------------------------------------------
  // Capture phase, so a click never reaches the prototype while comment mode is
  // on. The trail's own listener sits on the same node and is gated by
  // setRecording rather than by propagation.
  document.addEventListener(
    'mouseup',
    () => {
      if (!commentMode) return;
      stashedSelection = freshSelection();
    },
    true
  );

  document.addEventListener(
    'click',
    (event) => {
      if (!commentMode) return;
      const raw = event.target;
      if (!raw || raw.nodeType !== 1 || raw.closest(`#${ROOT_ID}`)) return;

      event.preventDefault();
      event.stopPropagation();

      // Work in progress wins over a new target (review R16).
      if (!box.hidden && !closeBoxGuarded()) return;

      let anchor;
      let element;
      let keep = null;
      if (stashedSelection) {
        anchor = anchorFromSelection(stashedSelection);
        element = stashedSelection.getRangeAt(0).commonAncestorContainer;
        element = element.nodeType === 1 ? element : element.parentElement;
        stashedSelection = null;
      } else {
        // The rule the frame used, so the box opens on the element the
        // reviewer was shown (issue #10). Page furniture resolves to nothing:
        // comment mode still swallows the click, and nothing opens.
        const target = targetFor(raw);
        if (!target) return;
        anchor = anchorFromElement(target, event);
        element = target;
        keep = target;
      }
      openBox({ anchor, element, x: event.clientX, y: event.clientY, framed: keep });
    },
    true
  );

  /**
   * The keyboard path into a comment.
   *
   * Pressing Enter on a focused control already dispatches a click, which the
   * handler above catches. What had no route at all was everything that never
   * receives focus - headings, paragraphs, table rows - which is most of what a
   * reviewer has opinions about, and text selected with shift and the arrow
   * keys, because the selection was only ever stashed on mouseup (review R20).
   */
  document.addEventListener('keydown', (event) => {
    if (!commentMode || !box.hidden) return;
    if (event.key !== 'c' && event.key !== 'C') return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    // A prototype built from web components puts its fields inside shadow roots,
    // where document.activeElement reports only the host (review R20, residual).
    let active = document.activeElement;
    while (active && active.shadowRoot && active.shadowRoot.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    // Never steal the key from something the reviewer is typing into.
    if (active && (active.isContentEditable || active.matches('input, textarea, select'))) return;

    const selection = window.getSelection();
    const hasText = selection && !selection.isCollapsed && selection.toString().trim();
    // A selection in the page is the intent regardless of what holds focus:
    // turning comment mode on with the mouse leaves focus inside the overlay.
    if (!hasText && active && active.closest && active.closest(`#${ROOT_ID}`)) return;
    // The frame is the promise, so C opens on the framed element when there is
    // one. After Tab and then a nudge of the trackpad, focus and frame disagree
    // and the reviewer is looking at the frame (review R9, #10 cycle). With no
    // frame, the same rule as a click: body, html and the overlay resolve to
    // nothing, and a focused element inside a control resolves to the control.
    const element = hasText
      ? (selection.getRangeAt(0).commonAncestorContainer.nodeType === 1
          ? selection.getRangeAt(0).commonAncestorContainer
          : selection.getRangeAt(0).commonAncestorContainer.parentElement)
      : framed || targetFor(active);
    if (!element) return;

    event.preventDefault();
    const anchor = hasText ? anchorFromSelection(selection) : anchorFromElement(element, null);
    openBox({ anchor, element, framed: hasText ? null : element });
  });

  // ---- rendering ----------------------------------------------------------
  const pins = new Map(); // comment id -> pin element
  const cards = new Map(); // comment id -> { row, elements }

  function renderPins(resolved) {
    lineLayer.textContent = '';
    const seen = new Set();

    resolved.forEach(({ comment, status, element }, index) => {
      if (status !== 'found' || !element) return;

      // Off the viewport on ANY edge: no pin at all. Checked before the pin is
      // claimed, so a pin that leaves the screen is removed rather than left at
      // the edge (review R23). The horizontal half matters as much as the
      // vertical: an off-canvas drawer slides sideways, and a clamped pin then
      // lands on top of the overlay's own panel.
      const rect = element.getBoundingClientRect();
      if (
        rect.bottom < 0 ||
        rect.top > window.innerHeight ||
        rect.right < 0 ||
        rect.left > window.innerWidth
      ) {
        return;
      }
      seen.add(comment.id);

      let pin = pins.get(comment.id);
      if (!pin) {
        pin = el('button', { class: 'gm-pin', type: 'button' });
        pin.addEventListener('click', () => {
          selectedId = selectedId === comment.id ? null : comment.id;
          openPanel();
          render();
          const card = cards.get(comment.id);
          if (card) card.row.scrollIntoView({ block: 'nearest' });
        });
        pins.set(comment.id, pin);
        pinLayer.appendChild(pin);
      }
      pin.textContent = String(index + 1);
      pin.title = comment.intent.text;
      // The visible label is a bare digit, and the comment text lives in a
      // title a keyboard or touch user never sees (review R21).
      pin.setAttribute('aria-label', `Comment ${index + 1}: ${comment.intent.text}`);
      pin.classList.toggle('is-selected', selectedId === comment.id);

      // Selecting a comment frames the thing it is about. This is the whole
      // claim of the tool made visible: here is where the reviewer was.
      if (selectedId === comment.id) {
        const box = element.getBoundingClientRect();
        lineLayer.appendChild(
          el('div', {
            class: 'gm-frame',
            style: `left:${box.left - 3}px;top:${box.top - 3}px;width:${box.width + 6}px;height:${box.height + 6}px`,
          })
        );
      }

      // Above the element's leading edge, fully clear of it: a pin sitting on
      // the corner reads as damage to the prototype, and a pin in the left
      // gutter collides with whatever shares the row. Below when there is no
      // room above.
      const above = rect.top - 30;
      const pinLeft = clamp(rect.left - 2, 2, window.innerWidth - 20);
      const pinTop = clamp(above >= 2 ? above : rect.bottom + 12, 2, window.innerHeight - 20);
      pin.style.left = `${pinLeft}px`;
      pin.style.top = `${pinTop}px`;

      // A hairline from the pin to the element, so the number is visibly about
      // that thing and not floating near it.
      const gap = above >= 2 ? rect.top - (pinTop + 18) : pinTop - rect.bottom;
      if (gap > 0 && gap < 40) {
        const lineTop = above >= 2 ? pinTop + 18 : rect.bottom;
        lineLayer.appendChild(
          el('div', { class: 'gm-leader', style: `left:${pinLeft + 9}px;top:${lineTop}px;height:${gap}px` })
        );
      }

      // The pencil mark under the quoted text.
      let range = null;
      try {
        range = rangeForQuote(element, comment.anchor.quote && comment.anchor.quote.exact);
      } catch {
        // One comment's underline is never worth every other comment's pin.
      }
      if (range) {
        for (const r of range.getClientRects()) {
          if (!r.width) continue;
          lineLayer.appendChild(
            el('div', {
              class: 'gm-underline',
              style: `left:${r.left}px;top:${r.bottom}px;width:${r.width}px`,
            })
          );
        }
      }
    });

    for (const [id, pin] of pins) {
      if (!seen.has(id)) {
        pin.remove();
        pins.delete(id);
      }
    }
  }

  /**
   * The replies under a comment, plus the one-line field when a reply is being
   * written here. Null when there is nothing to draw, so a plain file's card is
   * exactly the card it was.
   */
  function repliesFor(comment) {
    const replies = Array.isArray(comment.replies) ? comment.replies : [];
    const writing = sync && replyingId === comment.id;
    if (!replies.length && !writing) return null;
    const wrap = el('div', { class: 'gm-replies' });
    // Clicks in here are about the reply, not about selecting the card.
    wrap.addEventListener('click', (e) => e.stopPropagation());

    replies.forEach((r) => {
      if (writing && editingReplyId === r.id) return; // it is in the field below
      const mine = sync && sync.isMine(r.id);
      const row = el('div', { class: 'gm-reply' }, [
        el('div', { class: 'gm-meta' }, [
          el('span', { class: 'gm-author', text: mine ? `${nameOf(r.author)} (you)` : nameOf(r.author) }),
          // A reply the service refused stays here, marked, until its writer fixes it (review R12).
          sync && sync.isUnshared(r.id) ? el('span', { class: 'gm-flag', text: 'not shared yet' }) : null,
        ]),
        el('p', { class: 'gm-text', text: String(r.text || '') }),
      ]);
      if (mine) {
        const edit = el('button', { type: 'button', text: 'Edit', 'data-focus': `redit:${r.id}` });
        const del = el('button', { type: 'button', class: 'gm-del', text: 'Delete', 'data-focus': `rdel:${r.id}` });
        edit.addEventListener('click', () => {
          replyingId = comment.id;
          editingReplyId = r.id;
          replyDraft = String(r.text || '');
          render(true);
        });
        // Two steps, like a comment's Delete, for the same reason (review R17).
        del.addEventListener('click', () => {
          if (del.dataset.armed !== 'yes') {
            del.dataset.armed = 'yes';
            del.textContent = 'Delete?';
            return;
          }
          sync.removeReply(comment.id, r.id);
          focusAfterRender = `reply:${comment.id}`;
          render(true);
        });
        row.appendChild(el('div', { class: 'gm-card-actions' }, [edit, del]));
      }
      wrap.appendChild(row);
    });

    if (writing) {
      const field = el('input', { type: 'text', class: 'gm-reply-field', 'aria-label': 'Your reply', placeholder: 'Reply', maxlength: '4000' });
      field.value = replyDraft;
      const askingName = replyNameAsk && !store.reviewer().trim();
      const nameField = el('input', { type: 'text', class: 'gm-reply-field gm-reply-name', 'aria-label': 'Your name, shown with your comments', 'aria-describedby': 'gm-reply-name-why', placeholder: 'Your name', maxlength: '80' });
      const warn = el('div', { class: 'gm-boxwarn', role: 'status', text: replyDiscardArmed ? 'Press again to discard what you typed.' : '' });
      const send = el('button', { type: 'button', class: 'gm-reply-send', text: editingReplyId ? 'Save' : 'Send' });
      const cancel = el('button', { type: 'button', text: 'Cancel' });
      const done = () => {
        replyingId = null;
        editingReplyId = null;
        replyDraft = '';
        replyNameAsk = false;
        replyDiscardArmed = false;
        // The list is rebuilt, and with it whatever had focus. Put it back on this
        // card's Reply button, or keyboard users land on the page body (review R14).
        focusAfterRender = `reply:${comment.id}`;
        render(true);
      };
      // Escape is also how people dismiss a suggestion list, and the comment box
      // already asks twice before throwing typing away (review R15, R16 before it).
      const cancelGuarded = () => {
        if (field.value.trim() && !replyDiscardArmed) {
          replyDiscardArmed = true;
          warn.textContent = 'Press again to discard what you typed.';
          return;
        }
        done();
      };
      const submit = () => {
        const text = field.value.trim();
        if (!text) return;
        if (askNameFirst('panel')) return;
        if (askingName && nameField.value.trim()) store.setReviewer(nameField.value);
        if (editingReplyId) sync.editReply(comment.id, editingReplyId, text);
        else sync.addReply(comment.id, text);
        done();
      };
      field.addEventListener('input', () => {
        replyDraft = field.value;
        replyDiscardArmed = false;
        warn.textContent = '';
      });
      const keys = (e) => {
        if (e.key === 'Enter' && !e.isComposing) submit();
        if (e.key === 'Escape') {
          e.stopPropagation();
          cancelGuarded();
        }
      };
      field.addEventListener('keydown', keys);
      nameField.addEventListener('keydown', keys);
      send.addEventListener('click', submit);
      cancel.addEventListener('click', cancelGuarded);
      if (askingName) {
        wrap.appendChild(el('div', { class: 'gm-reply-ask' }, [el('div', { class: 'gm-box-name-why', id: 'gm-reply-name-why', text: NAME_WHY }), nameField]));
      }
      wrap.appendChild(el('div', { class: 'gm-reply-row' }, [field, send, cancel]));
      wrap.appendChild(warn);
      // The list was just rebuilt, so these are new elements: put the caret back,
      // in the name field when that is what is being asked for.
      requestAnimationFrame(() => {
        if (replyingId !== comment.id) return;
        const target = askingName ? nameField : field;
        if (shadow.activeElement !== field && shadow.activeElement !== nameField) target.focus();
      });
    }
    return wrap;
  }

  /**
   * Put keyboard focus back after a rebuild destroyed the element that had it.
   * Only when focus really was lost: if the person has since moved somewhere
   * else in the panel, that is where they want to be.
   */
  function restoreFocus() {
    if (!focusAfterRender) return;
    const token = focusAfterRender;
    requestAnimationFrame(() => {
      if (focusAfterRender !== token) return;
      focusAfterRender = null; // spent either way, or a stale token would move focus at some later rebuild
      if (shadow.activeElement) return;
      const target = Array.from(shadow.querySelectorAll('[data-focus]')).find((node) => node.dataset.focus === token);
      if (target) target.focus();
    });
  }

  // ---- shared mode: versions ---------------------------------------------
  let versionsOpen = false;
  let versionsDrawn = '';
  let newerDrawn = null;
  const olderOpen = new Set(); // version ids whose read-only list is expanded
  const olderComments = new Map(); // version id -> comments | 'loading' | 'failed'

  versionBtn.addEventListener('click', () => {
    versionsOpen = !versionsOpen;
    versionsDrawn = '';
    renderShared();
  });

  /** One older comment, read-only: who, where, what. It is about another page. */
  function olderCard(c) {
    const screen = c.state && c.state.screen && c.state.screen.name;
    const quote = c.anchor && c.anchor.quote && c.anchor.quote.exact;
    return el('div', { class: 'gm-older' }, [
      el('div', { class: 'gm-meta' }, [
        el('span', { class: 'gm-author', text: nameOf(c.author) }),
        screen ? el('span', { text: screen }) : null,
        c.status && c.status !== 'open' ? el('span', { class: 'gm-status', text: c.status }) : null,
      ]),
      quote ? el('div', { class: 'gm-older-quote', text: `"${quote}"` }) : null,
      el('p', { class: 'gm-text', text: String((c.intent && c.intent.text) || '') }),
    ]);
  }

  function renderShared() {
    if (!sync) return;
    const view = sync.view();
    const here = view.versions.find((v) => v.version_id === sync.versionId) || null;
    sharedHead.hidden = !here;
    if (!here) return;

    // The header already says which version this page is, so the list holds
    // only the others; and with no others there is nothing to open, so it is a
    // plain line rather than a button that does nothing (design critic, round 1).
    const others = view.versions.filter((v) => v.version_id !== sync.versionId);
    versionBtn.textContent = `Version ${here.round}${view.isLatest ? ' (current)' : ''}`;
    versionBtn.disabled = others.length === 0;
    if (!others.length) versionsOpen = false;
    versionBtn.setAttribute('aria-expanded', versionsOpen ? 'true' : 'false');
    versionList.hidden = !versionsOpen;

    const latest = view.versions.find((v) => v.version_id === view.latest) || null;
    // Touched only when what it says changes. It is a live region, and clearing
    // and refilling one on every scroll and poll is how you make a screen reader
    // say the same sentence all afternoon (review R13).
    const newer = !view.isLatest && latest ? `${latest.round}|${latest.has_page}` : '';
    if (newer !== newerDrawn) {
      newerDrawn = newer;
      newerNote.textContent = '';
      if (newer) {
        newerNote.appendChild(el('span', { text: `A newer version exists (Version ${latest.round}). ` }));
        newerNote.appendChild(
          latest.has_page
            ? el('a', { href: sync.pageUrl(latest.version_id), target: '_blank', rel: 'noopener', text: `Open version ${latest.round}`, 'aria-label': `Open version ${latest.round} in a new tab` })
            // No stored copy to open, so say what to do instead of stopping there (review R31).
            : el('span', { text: 'Ask whoever sent you this page for the new one.' })
        );
      }
    }

    // Rebuilt only when what it shows has changed: it holds links and buttons a
    // keyboard user may be on, and a poll every five seconds would pull focus.
    const drawn = JSON.stringify([versionsOpen, view.versions, [...olderOpen], [...olderComments.entries()].map(([k, v]) => [k, Array.isArray(v) ? v.length : v])]);
    if (!versionsOpen || drawn === versionsDrawn) return;
    versionsDrawn = drawn;
    versionList.textContent = '';
    others.forEach((v) => {
      const label = `Version ${v.round} · ${v.comments} comment${v.comments === 1 ? '' : 's'}`;
      if (v.has_page) {
        versionList.appendChild(
          el('a', { class: 'gm-vrow', href: sync.pageUrl(v.version_id), target: '_blank', rel: 'noopener', text: `${label} · open`, 'aria-label': `${label}, opens in a new tab` })
        );
        return;
      }
      // No stored copy of that page, so its comments are read here instead.
      const open = olderOpen.has(v.version_id);
      const row = el('button', { class: 'gm-vrow', type: 'button', 'aria-expanded': open ? 'true' : 'false', 'data-focus': `version:${v.version_id}`, text: `${label} · ${open ? 'hide' : 'read'}` });
      row.addEventListener('click', async () => {
        focusAfterRender = `version:${v.version_id}`; // this row is about to be rebuilt (review R14)
        if (olderOpen.has(v.version_id)) {
          olderOpen.delete(v.version_id);
        } else {
          olderOpen.add(v.version_id);
          if (!Array.isArray(olderComments.get(v.version_id))) {
            olderComments.set(v.version_id, 'loading');
            renderShared();
            olderComments.set(v.version_id, (await sync.loadVersion(v.version_id)) || 'failed');
            focusAfterRender = `version:${v.version_id}`; // rebuilt a second time, now with the list in it
          }
        }
        renderShared();
      });
      versionList.appendChild(row);
      if (open) {
        const held = olderComments.get(v.version_id);
        const inside = el('div', { class: 'gm-older-list' });
        if (held === 'loading') inside.appendChild(el('div', { class: 'gm-older-note', text: 'Loading...' }));
        else if (!Array.isArray(held)) inside.appendChild(el('div', { class: 'gm-older-note', text: 'Could not reach the comment service.' }));
        else if (!held.length) inside.appendChild(el('div', { class: 'gm-older-note', text: 'No comments on that version.' }));
        else held.forEach((c) => inside.appendChild(olderCard(c)));
        versionList.appendChild(inside);
      }
    });
    restoreFocus();
  }

  /** The one line that says whether comments are reaching other people. */
  function sharedLine() {
    const view = sync.view();
    if (view.problem) return view.problem;
    if (view.state === 'offline') {
      return store.storageOk() === false
        ? 'Working locally. Comments will be shared when the service is back; keep this tab open until then.'
        : 'Working locally. Comments will be shared when the service is back.';
    }
    if (view.state === 'connecting' || view.unsent > 0) return 'Sharing...';
    return 'Shared. Everyone with this page sees these comments.';
  }

  function cardFor(entry, index) {
    const { comment, status, via } = entry;
    const meta = el('div', { class: 'gm-meta' });
    // Shared mode: who said it comes first, because with several people on one
    // page that is the first thing a reader needs. Always set as text, never as
    // markup: a name is whatever a stranger with the page key typed.
    const own = !sync || sync.isMine(comment.id);
    if (sync) meta.appendChild(el('span', { class: 'gm-author', text: own ? nameOf(comment.author) + ' (you)' : nameOf(comment.author) }));
    if (comment.intent.tag) meta.appendChild(el('span', { class: 'gm-tag', text: comment.intent.tag }));
    const screen = comment.state.screen && comment.state.screen.name;
    if (screen) meta.appendChild(el('span', { text: screen }));
    if (status === 'hidden') meta.appendChild(el('span', { class: 'gm-flag', text: 'on another screen' }));
    if (status === 'orphaned') meta.appendChild(el('span', { class: 'gm-flag', text: 'orphaned' }));
    // The exact element is gone and only its container was found, so the pin is
    // approximate. Saying so beats pointing confidently at the wrong thing.
    if ((via === 'ancestor' || via === 'quote-loose') && status !== 'orphaned') {
      meta.appendChild(el('span', { class: 'gm-flag', text: 'nearby' }));
    }
    // What the author or their agent did with it. Read-only here: a status is
    // set from the command line. 'open' is the default and says nothing, so it
    // is not drawn.
    if (comment.status && comment.status !== 'open') {
      meta.appendChild(el('span', { class: 'gm-status', text: comment.status }));
    }
    if (sync && sync.isUnshared(comment.id)) meta.appendChild(el('span', { class: 'gm-flag', text: 'not shared yet' }));

    const body = el('div', { class: 'body' }, [meta]);

    if (editingId === comment.id) {
      const area = el('textarea', {});
      area.value = comment.intent.text;
      const save = el('button', { type: 'button', text: 'Save' });
      const cancel = el('button', { type: 'button', text: 'Cancel' });
      save.addEventListener('click', () => {
        const text = area.value.trim();
        if (text) store.update(comment.id, { intent: { ...comment.intent, text } });
        editingId = null;
        render(true);
      });
      cancel.addEventListener('click', () => {
        editingId = null;
        render(true);
      });
      body.append(area, el('div', { class: 'gm-card-actions' }, [save, cancel]));
    } else {
      const edit = el('button', { type: 'button', text: 'Edit', 'data-focus': `edit:${comment.id}` });
      const del = el('button', { type: 'button', class: 'gm-del', text: 'Delete', 'data-focus': `del:${comment.id}` });
      edit.addEventListener('click', (e) => {
        e.stopPropagation();
        editingId = comment.id;
        render(true);
      });
      // Two steps, in place. A comment is the reviewer's own prose and nothing
      // keeps a copy once it is gone, so one mis-aimed click should not be
      // enough - Delete sits next to Edit in the same muted type (review R17).
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (del.dataset.armed !== 'yes') {
          del.dataset.armed = 'yes';
          del.textContent = 'Delete?';
          return;
        }
        store.remove(comment.id);
        render(true);
      });
      const reply = el('button', { type: 'button', text: 'Reply', 'data-focus': `reply:${comment.id}` });
      reply.addEventListener('click', (e) => {
        e.stopPropagation();
        // A reply half-written on another card is work, like a comment is (review R15).
        if (replyingId && replyingId !== comment.id && replyDraft.trim() && !replyDiscardArmed) {
          replyDiscardArmed = true;
          render(true);
          return;
        }
        replyDiscardArmed = false;
        replyingId = comment.id;
        editingReplyId = null;
        replyDraft = '';
        render(true);
      });
      // Edit and Delete only on what this browser wrote. Without sign-in that is
      // all 'your own' can mean; the service enforces the same rule with the
      // edit token, so hiding the buttons is a courtesy, not the lock.
      const actions = [...(sync ? [reply] : []), ...(own ? [edit, del] : [])];
      body.append(
        el('p', { class: 'gm-text', text: comment.intent.text }),
        ...(actions.length ? [el('div', { class: 'gm-card-actions' }, actions)] : [])
      );
    }

    const replies = repliesFor(comment);
    if (replies) body.append(replies);

    const row = el('div', { class: 'gm-card' }, [el('div', { class: 'num', text: String(index + 1) }), body]);
    row.classList.toggle('is-selected', selectedId === comment.id);
    row.addEventListener('click', () => {
      selectedId = selectedId === comment.id ? null : comment.id;
      render();
      // Selecting from the panel should show the thing being framed.
      if (selectedId === comment.id && entry.element && entry.status === 'found') {
        entry.element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    });
    return row;
  }

  /** Rebuild the comment list. Skipped while an edit is open (see renderPanel). */
  function renderList(resolved) {
    // Whatever control in here has the keyboard is about to be destroyed. On a
    // shared page the list is rebuilt whenever anyone comments, so without this a
    // keyboard user lost their place every few seconds (review R14, and the
    // broader case its test exposed). An explicit request, set by the action that
    // caused the rebuild, wins over where focus happened to be.
    const active = shadow.activeElement;
    if (!focusAfterRender && active && list.contains(active) && active.dataset.focus) focusAfterRender = active.dataset.focus;
    list.textContent = '';
    cards.clear();
    if (!resolved.length) {
      list.appendChild(
        el('div', {
          class: 'gm-empty',
          text:
            'No comments yet. Turn on comment mode, then click anything on the page. ' +
            'With a keyboard: select some text or tab to a control, then press C.',
        })
      );
    }
    resolved.forEach((entry, index) => {
      const row = cardFor(entry, index);
      cards.set(entry.comment.id, { row });
      list.appendChild(row);
    });
    restoreFocus();
  }

  function renderPanel(resolved, force) {
    // The LIST is rebuilt wholesale, except while a card is being edited: that
    // textarea lives inside it, so rebuilding replaces what is being typed with
    // the original text, and a scroll or a ticking prototype is enough to
    // trigger it (review R7). Everything outside the list still updates, so the
    // count and the saved notice do not freeze behind an open edit.
    // A reply being written gets the same protection, and needs it more: in
    // shared mode the list changes whenever anyone else comments.
    if (force || (editingId === null && replyingId === null) || !list.childElementCount) renderList(resolved);
    renderShared();

    // Storage is best effort on a local file, so say which way it went rather
    // than leaving the reviewer to guess whether closing the tab is safe.
    const ok = store.storageOk();
    // On a shared page the question changes from 'is it saved in this browser'
    // to 'has it reached the others', so the same line answers that instead.
    keepNote.textContent = sync
      ? sharedLine()
      : ok === false
        ? 'Not saved in this browser. Send or copy before you close this tab.'
        : ok === true
          ? 'Kept in this browser until you send it.'
          : '';

    const count = resolved.length;
    rail.textContent = count ? `${count} comment${count === 1 ? '' : 's'}` : 'gitmargin';
    listCount.textContent = count ? String(count) : '0';
    if (document.activeElement !== host || shadow.activeElement !== nameInput) {
      if (shadow.activeElement !== nameInput) nameInput.value = store.reviewer();
      if (shadow.activeElement !== overall) overall.value = store.overallNote();
      if (store.overallNote() && overall.hidden) {
        overall.hidden = false;
        noteToggle.textContent = 'A note about the whole thing';
      }
    }
  }

  function render(force) {
    const resolved = store.comments().map((comment) => {
      const { element, status, via } = resolve(comment.anchor);
      return { comment, element, status, via };
    });
    renderPanel(resolved, force);
    renderPins(resolved);
    placeTarget(); // scroll, resize and page changes move the framed element too
  }

  // One re-layout per frame, however many things changed.
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      render();
    });
  }

  new MutationObserver((records) => {
    // Ignore our own mutations: the overlay lives in a shadow root, but the host
    // element itself is a child of <body>.
    if (records.every((r) => r.target === host || host.contains(r.target))) return;
    schedule();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });

  // The last guard before the work is gone: comments written and never sent.
  window.addEventListener('beforeunload', (e) => {
    // Shared: the work is safe once the service has it, so only what is still
    // unsent is worth stopping someone for. Plain file: unchanged.
    if (sync ? sync.view().unsent === 0 : !store.hasUnexportedWork()) return;
    e.preventDefault();
    e.returnValue = '';
  });

  window.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
  store.subscribe(schedule);

  render();

  return {
    setCommentMode: setMode,
    isCommentMode: () => commentMode,
    openPanel,
    render,
    isBoxOpen: () => !box.hidden,
    // Read by the test suite: the element the target preview is on, so a test
    // can compare it by identity with what a click then anchors (issue #10).
    target: () => framed,
    shadow,
  };
}
