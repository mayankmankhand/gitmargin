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
    // Joins the top layer, so the panel stays reachable over a modal <dialog>.
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
  const rail = el('button', { class: 'gm-rail', type: 'button', title: 'Open gitmargin comments' });
  const switchBtn = el('button', { class: 'gm-switch', type: 'button' }, [
    el('span', { class: 'dot' }),
    el('span', { class: 'label', text: 'Comment mode' }),
  ]);
  const closeBtn = el('button', { class: 'gm-close', type: 'button', title: 'Collapse', text: '›' });
  const nameInput = el('input', { type: 'text', placeholder: 'optional' });

  const listLabel = el('div', { class: 'gm-section' }, [el('span', { text: 'Comments' }), el('span', { class: 'gm-spacer' })]);
  const listCount = el('span', { class: 'count' });
  listLabel.appendChild(listCount);
  const list = el('div', { class: 'gm-list' });
  const overall = el('textarea', { placeholder: 'Anything that is not about one spot', hidden: 'hidden' });
  const noteToggle = el('button', { class: 'gm-note-toggle', type: 'button', text: 'Add a note about the whole thing' });
  const sendBtn = el('button', { class: 'gm-btn primary', type: 'button', text: 'Send to author' });
  const copyBtn = el('button', { class: 'gm-btn ghost', type: 'button', text: 'Copy for author' });
  const said = el('div', { class: 'gm-said' });

  const panel = el('div', { class: 'gm-panel is-open' }, [
    rail,
    el('div', { class: 'gm-panel-inner' }, [
      el('div', { class: 'gm-head' }, [
        el('span', { class: 'gm-label name', text: 'gitmargin' }),
        el('div', { class: 'gm-spacer' }),
        switchBtn,
        closeBtn,
      ]),
      el('div', { class: 'gm-who' }, [el('label', { text: 'Your name, for the author' }), nameInput]),
      listLabel,
      list,
      el('div', { class: 'gm-foot' }, [noteToggle, overall, el('div', { class: 'gm-send' }, [sendBtn, copyBtn]), said]),
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
    if (commentMode) openPanel();
    else closeBox();
  };

  rail.addEventListener('click', openPanel);
  closeBtn.addEventListener('click', () => panel.classList.remove('is-open'));
  switchBtn.addEventListener('click', () => setMode(!commentMode));
  noteToggle.addEventListener('click', () => {
    overall.hidden = !overall.hidden;
    noteToggle.textContent = overall.hidden ? 'Add a note about the whole thing' : 'A note about the whole thing';
    if (!overall.hidden) overall.focus();
  });
  nameInput.addEventListener('input', () => store.setReviewer(nameInput.value));
  overall.addEventListener('input', () => store.setOverallNote(overall.value));

  sendBtn.addEventListener('click', () => {
    said.textContent = `Downloaded ${batch.download()}. Send that file back.`;
  });
  copyBtn.addEventListener('click', async () => {
    const result = await batch.copy();
    if (window.__gitmargin) window.__gitmargin.lastCopy = result.text;
    said.textContent = result.ok ? 'Copied. Paste it anywhere.' : 'Could not reach the clipboard.';
  });

  // ---- comment box --------------------------------------------------------
  const boxWhere = el('div', { class: 'where' });
  const boxText = el('textarea', { placeholder: 'What did you expect here?' });
  const chips = TAGS.map((tag) =>
    el('button', { class: 'gm-chip', type: 'button', text: tag, 'data-tag': tag })
  );
  const saveBtn = el('button', { class: 'gm-btn primary', type: 'button', text: 'Save' });
  const cancelBtn = el('button', { class: 'gm-btn', type: 'button', text: 'Cancel' });
  const box = el('div', { class: 'gm-box', hidden: 'hidden' }, [
    boxWhere,
    boxText,
    el('div', { class: 'gm-chips' }, chips),
    el('div', { class: 'gm-box-actions' }, [saveBtn, cancelBtn]),
  ]);
  shadow.appendChild(box);

  chips.forEach((chip) =>
    chip.addEventListener('click', () => {
      const tag = chip.dataset.tag;
      draft.tag = draft.tag === tag ? null : tag;
      chips.forEach((c) => c.classList.toggle('is-on', c.dataset.tag === draft.tag));
    })
  );

  function closeBox() {
    box.hidden = true;
    draft = null;
    chips.forEach((c) => c.classList.remove('is-on'));
    boxText.value = '';
  }

  function openBox({ anchor, element, x, y, where }) {
    draft = { anchor, element, tag: null };
    boxWhere.textContent = where;
    boxText.value = '';
    box.hidden = false;
    // Place it near the spot, then keep it inside the viewport.
    const width = 268;
    const height = box.getBoundingClientRect().height || 190;
    box.style.left = `${clamp(x + 12, 8, window.innerWidth - width - 8)}px`;
    box.style.top = `${clamp(y + 12, 8, window.innerHeight - height - 8)}px`;
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
  cancelBtn.addEventListener('click', closeBox);
  boxText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveDraft();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !box.hidden) {
      e.preventDefault();
      closeBox();
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
      const quoted = anchor.quote && anchor.quote.exact;
      openBox({
        anchor,
        element,
        x: event.clientX,
        y: event.clientY,
        where: quoted ? `"${quoted.slice(0, 60)}"` : anchor.selector || 'this element',
      });
    },
    true
  );

  // ---- rendering ----------------------------------------------------------
  const pins = new Map(); // comment id -> pin element
  const cards = new Map(); // comment id -> { row, elements }

  function renderPins(resolved) {
    lineLayer.textContent = '';
    const seen = new Set();

    resolved.forEach(({ comment, status, element }, index) => {
      if (status !== 'found' || !element) return;
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
      const rect = element.getBoundingClientRect();
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
    const { comment, status } = entry;
    const meta = el('div', { class: 'gm-meta' });
    if (comment.intent.tag) meta.appendChild(el('span', { class: 'gm-tag', text: comment.intent.tag }));
    const screen = comment.state.screen && comment.state.screen.name;
    if (screen) meta.appendChild(el('span', { text: screen }));
    if (status === 'hidden') meta.appendChild(el('span', { class: 'gm-flag', text: 'on another screen' }));
    if (status === 'orphaned') meta.appendChild(el('span', { class: 'gm-flag', text: 'orphaned' }));

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
        render();
      });
      cancel.addEventListener('click', () => {
        editingId = null;
        render();
      });
      body.append(area, el('div', { class: 'gm-card-actions' }, [save, cancel]));
    } else {
      const edit = el('button', { type: 'button', text: 'Edit' });
      const del = el('button', { type: 'button', text: 'Delete' });
      edit.addEventListener('click', (e) => {
        e.stopPropagation();
        editingId = comment.id;
        render();
      });
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        store.remove(comment.id);
        render();
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
    });
    return row;
  }

  function renderPanel(resolved) {
    // Rebuilt wholesale: the fields that hold focus (name, overall note) live
    // outside the list, so nothing the reviewer is typing into is replaced.
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

  function render() {
    const resolved = store.comments().map((comment) => {
      const { element, status } = resolve(comment.anchor);
      return { comment, element, status };
    });
    renderPanel(resolved);
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
