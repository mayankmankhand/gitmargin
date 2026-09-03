// The Hairline UI: pins on the page, a panel down the right edge, and one
// comment box. Everything lives in a shadow root, so the prototype's CSS cannot
// reach in and the overlay's cannot reach out.
//
// The overlay never writes into the prototype's DOM. Pins and quote underlines
// are drawn in our own tree at viewport coordinates, so the page the reviewer
// sends back is the page they were given.

import css from './ui.css';

const TAGS = ['change', 'bug', 'question', 'like'];
const ROOT_ID = 'gitmargin-root';

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
  if (!root || !exact || exact.length > 200) return null;
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
  const { store, batch, createComment, anchorFromElement, anchorFromSelection, resolve, setRecording } = deps;

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

  // ---- state --------------------------------------------------------------
  let commentMode = false;
  let selectedId = null;
  let editingId = null;
  let draft = null; // { anchor, element, x, y, tag }
  let stashedSelection = null;

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
  const keepNote = el('div', { class: 'gm-keep' });

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
      el('div', { class: 'gm-who' }, [
        el('label', { for: 'gm-reviewer', text: 'Your name, for the author' }),
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
    if (commentMode) openPanel();
    else closeBox();
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
  const box = el('div', { class: 'gm-box', hidden: 'hidden' }, [
    boxWhere,
    boxText,
    el('div', { class: 'gm-chips' }, chips),
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
    chips.forEach((c) => {
      c.classList.remove('is-on');
      c.setAttribute('aria-pressed', 'false');
    });
    boxText.value = '';
    boxWarn.textContent = '';
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

  function openBox({ anchor, element, x, y }) {
    draft = { anchor, element, tag: null };
    boxWhere.textContent = describe(anchor, element);
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

  // ---- picking a spot -----------------------------------------------------
  // Capture phase, so a click never reaches the prototype while comment mode is
  // on. The trail's own listener sits on the same node and is gated by
  // setRecording rather than by propagation.
  document.addEventListener(
    'mouseup',
    () => {
      if (!commentMode) return;
      const sel = window.getSelection();
      stashedSelection = sel && !sel.isCollapsed && sel.toString().trim() ? sel : null;
    },
    true
  );

  document.addEventListener(
    'click',
    (event) => {
      if (!commentMode) return;
      const target = event.target;
      if (!target || target.nodeType !== 1 || target.closest(`#${ROOT_ID}`)) return;

      event.preventDefault();
      event.stopPropagation();

      // Work in progress wins over a new target (review R16).
      if (!box.hidden && !closeBoxGuarded()) return;

      let anchor;
      let element = target;
      if (stashedSelection) {
        anchor = anchorFromSelection(stashedSelection);
        element = stashedSelection.getRangeAt(0).commonAncestorContainer;
        element = element.nodeType === 1 ? element : element.parentElement;
        stashedSelection = null;
      } else {
        anchor = anchorFromElement(target, event);
      }
      openBox({ anchor, element, x: event.clientX, y: event.clientY });
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

    const active = document.activeElement;
    // Never steal the key from something the reviewer is typing into.
    if (active && (active.isContentEditable || active.matches('input, textarea, select'))) return;

    const selection = window.getSelection();
    const hasText = selection && !selection.isCollapsed && selection.toString().trim();
    // A selection in the page is the intent regardless of what holds focus:
    // turning comment mode on with the mouse leaves focus inside the overlay.
    if (!hasText && active && active.closest && active.closest(`#${ROOT_ID}`)) return;
    const element = hasText
      ? (selection.getRangeAt(0).commonAncestorContainer.nodeType === 1
          ? selection.getRangeAt(0).commonAncestorContainer
          : selection.getRangeAt(0).commonAncestorContainer.parentElement)
      : active && active !== document.body
        ? active
        : null;
    if (!element) return;

    event.preventDefault();
    const anchor = hasText ? anchorFromSelection(selection) : anchorFromElement(element, null);
    openBox({ anchor, element });
  });

  // ---- rendering ----------------------------------------------------------
  const pins = new Map(); // comment id -> pin element
  const cards = new Map(); // comment id -> { row, elements }

  function renderPins(resolved) {
    lineLayer.textContent = '';
    const seen = new Set();

    resolved.forEach(({ comment, status, element }, index) => {
      if (status !== 'found' || !element) return;

      // Off the viewport: no pin at all. Checked before the pin is claimed, so
      // a pin that scrolls away is removed rather than left at the edge
      // (review R23).
      const rect = element.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
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
      const range = rangeForQuote(element, comment.anchor.quote && comment.anchor.quote.exact);
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

  function cardFor(entry, index) {
    const { comment, status, via } = entry;
    const meta = el('div', { class: 'gm-meta' });
    if (comment.intent.tag) meta.appendChild(el('span', { class: 'gm-tag', text: comment.intent.tag }));
    const screen = comment.state.screen && comment.state.screen.name;
    if (screen) meta.appendChild(el('span', { text: screen }));
    if (status === 'hidden') meta.appendChild(el('span', { class: 'gm-flag', text: 'on another screen' }));
    if (status === 'orphaned') meta.appendChild(el('span', { class: 'gm-flag', text: 'orphaned' }));
    // The exact element is gone and only its container was found, so the pin is
    // approximate. Saying so beats pointing confidently at the wrong thing.
    if (via === 'ancestor' && status !== 'orphaned') {
      meta.appendChild(el('span', { class: 'gm-flag', text: 'nearby' }));
    }

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
      const edit = el('button', { type: 'button', text: 'Edit' });
      const del = el('button', { type: 'button', class: 'gm-del', text: 'Delete' });
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
      body.append(
        el('p', { class: 'gm-text', text: comment.intent.text }),
        el('div', { class: 'gm-card-actions' }, [edit, del])
      );
    }

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

  function renderPanel(resolved, force) {
    // Rebuilt wholesale, EXCEPT while a card is being edited: that textarea
    // lives inside the list, so rebuilding replaces what is being typed with
    // the original text, and a scroll or a ticking prototype is enough to
    // trigger it (review R7). The pins still re-render either way.
    if (!force && editingId !== null && list.childElementCount) return;
    list.textContent = '';
    cards.clear();
    if (!resolved.length) {
      list.appendChild(
        el('div', {
          class: 'gm-empty',
          text: 'No comments yet. Turn on comment mode, then click anything on the page.',
        })
      );
    }
    resolved.forEach((entry, index) => {
      const row = cardFor(entry, index);
      cards.set(entry.comment.id, { row });
      list.appendChild(row);
    });

    // Storage is best effort on a local file, so say which way it went rather
    // than leaving the reviewer to guess whether closing the tab is safe.
    const ok = store.storageOk();
    keepNote.textContent =
      ok === false
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
    if (!store.hasUnexportedWork()) return;
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
    shadow,
  };
}
