// The overlay's surface (issue #21): pins on the page, a thread that opens at
// the spot, a sheet listing every comment on demand, one floating pill of
// controls, and one comment box. Everything lives in a shadow root, so the
// prototype's CSS cannot reach in and the overlay's cannot reach out.
//
// The overlay never writes into the prototype's DOM. Pins, frames and quote
// underlines are drawn in our own tree at viewport coordinates, so the page
// the reviewer sends back is the page they were given.
//
// Open state (which thread, whether the sheet is open, the filter, the
// popovers) lives in variables here, never in the DOM: on a shared page the
// surface is rebuilt whenever anyone comments, and a rebuild that read its
// state from the DOM would close what a reviewer had just opened.

import css from './ui.css';
import { ROOT_ID } from './root.js';
import { themeOf } from './theme.js';
import { initialsOf, authorHue } from './author.js';

const TAGS = ['change', 'bug', 'question', 'like'];
const SHEET_WIDTH = 320;
const PIN = 26; // the pin's box; it grows from its point when selected, so the point stays put
const THREAD_WIDTH = 300;

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

/** An inline icon: one path in a 16-unit box, stroked in the current colour. */
function icon(d) {
  const NS = 'http://www.w3.org/2000/svg';
  const node = document.createElementNS(NS, 'svg');
  node.setAttribute('viewBox', '0 0 16 16');
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('class', 'gm-icon');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  node.appendChild(path);
  return node;
}
const BUBBLE = 'M2 3h12v8H6l-3 3v-3H2z';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const collapse = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** "2m", "3h", "4d": how long ago, for a card's meta. Blank when the time is unreadable. */
function ago(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

/**
 * A Range covering `exact` inside `root`, or null.
 * Whitespace-tolerant, because the stored quote is collapsed and the page's is
 * not. Best effort: a quote that spans several elements gets no underline.
 */
function rangeForQuote(root, exact) {
  // Typed, not just truthy: on a shared page this value was written by whoever
  // holds the page key, and a number here used to throw inside the loop that
  // draws every pin, hiding all of them for every reviewer (review R4).
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
  // shared-mode element below is built only when this is set.
  const sync = deps.sync || null;
  const PROVIDERS = { gitlab: 'GitLab', github: 'GitHub' };
  const providerName = (id) => PROVIDERS[id] || String(id || '');
  /**
   * A blank name is allowed; it still needs something to stand in the list. A
   * name the comment service vouched for says who vouched ("Priya Shah · GitLab");
   * a typed one reads as it always did, with no mark (issue #18).
   */
  const nameOf = (author) => {
    const name = (author && author.name && author.name.trim()) || 'Someone';
    if (!author || author.verified !== true) return name;
    // The handle too: two people can share a display name, and the mark vouches
    // for the account, not for the name shown (review of the #18 cycle, R5).
    const handle = author.username ? ` @${author.username}` : '';
    return `${name}${handle} · ${providerName(author.provider)}`;
  };
  /** A vouched-for name is drawn a step stronger than a typed one, so the two are told apart at a glance. */
  const authorClass = (author) => (author && author.verified === true ? 'gm-author is-verified' : 'gm-author');
  /**
   * Who a comment is from, for its chip. On a plain file comments carry no
   * author: they are all the one reviewer's, so the chip is theirs.
   */
  const authorOf = (comment) => comment.author || (sync ? null : { name: store.reviewer() });
  /** A chip: initials on the author's colour. */
  const avatar = (author, cls = 'gm-avatar') =>
    el('span', { class: cls, style: `--gm-author:${authorHue(author)}`, text: initialsOf(author && author.name), 'aria-hidden': 'true' });

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
    // reorder it (Chromium 151). While such a dialog is open the overlay is
    // behind its backdrop, so a reviewer cannot comment on a modal dialog's
    // contents. Recorded rather than worked around, because every workaround
    // writes into the prototype's DOM.
    host.showPopover();
  } catch {
    host.removeAttribute('popover'); // older engine: plain fixed positioning
  }

  // Which way the page is lit decides which token set draws the overlay.
  // Measured at mount, on resize, and once on the first scroll (theme.js).
  let theme = 'light';
  function applyTheme() {
    theme = themeOf(document);
    host.classList.toggle('gm-dark', theme === 'dark');
  }
  applyTheme();

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
  let selectedId = null; // the open thread
  let editingId = null;
  // The reply being written, kept here rather than in the DOM: the thread is
  // rebuilt whenever comments change, and in shared mode they change while you type.
  let replyingId = null;
  let editingReplyId = null;
  let replyDraft = '';
  let replyDiscardArmed = false; // Escape or Cancel pressed once over a typed reply
  let focusAfterRender = null; // a data-focus token to return keyboard focus to
  let draft = null; // { anchor, element, tag }
  let stashedSelection = null;
  let framed = null; // the element the target preview is on, or null
  let pointerDown = false; // a drag in progress may be a text selection
  let selectionMoved = false; // did the selection change during this gesture?
  let selectionAtDown = ''; // the selection's text when the pointer went down
  let sheetOpen = false;
  let filter = 'all'; // all | unread | mine
  let identityOpen = false;
  let previewId = null; // the pin under the pointer
  let hotId = null; // the sheet row under the pointer, whose pin lights up
  const pinPos = new Map(); // comment id -> { left, top, below } of its drawn pin

  // ---- the chrome: one pill, top right -----------------------------------
  const switchBtn = el('button', {
    class: 'gm-switch',
    type: 'button',
    role: 'switch',
    'aria-checked': 'false',
    title: 'Comment mode. While this is on, clicking marks a spot instead of using the page. C turns it on, Escape off.',
  }, [icon(BUBBLE), el('span', { class: 'label', text: 'Comment' })]);
  const badgeCount = el('span', { class: 'count', text: '0' });
  const badgeDot = el('span', { class: 'dot', hidden: 'hidden' });
  const badgeBtn = el('button', { class: 'gm-badge', type: 'button', 'aria-expanded': 'false', title: 'All comments' }, [
    icon(BUBBLE), badgeCount, badgeDot,
  ]);
  const idAvatar = el('span', { class: 'gm-avatar', 'aria-hidden': 'true' });
  const idText = el('span', { class: 'label', hidden: 'hidden' });
  const idBtn = el('button', { class: 'gm-id', type: 'button', 'aria-expanded': 'false', 'aria-label': 'Your name' }, [idAvatar, idText]);
  const bar = el('div', { class: 'gm-bar', role: 'toolbar', 'aria-label': 'gitmargin' }, [switchBtn, badgeBtn, idBtn]);
  shadow.appendChild(bar);

  // ---- the identity popover: the typed name, or the sign-in states ---------
  const nameInput = el('input', { type: 'text', id: 'gm-reviewer', placeholder: 'optional', maxlength: '80' });
  const whoRow = el('div', { class: 'gm-who' }, [
    el('label', { for: 'gm-reviewer', text: sync ? 'Your name, shown with your comments' : 'Your name, for the author' }),
    nameInput,
  ]);
  // Sign-in (issue #18). Built once and updated in place.
  const identitySays = el('span', { class: 'gm-identity-says' });
  const identityCode = el('span', { class: 'gm-identity-code', hidden: 'hidden' });
  // One live region holds the sentence AND the code, so a screen reader hears
  // "check it shows this code: 48-21" and not the sentence alone (review of #18, R16).
  const identityLive = el('div', { class: 'gm-identity-live', role: 'status', 'aria-live': 'polite' }, [identitySays, identityCode]);
  const identityBtn = el('button', { type: 'button', class: 'gm-identity-btn' });
  const identityQuiet = el('button', { type: 'button', class: 'gm-identity-quiet', hidden: 'hidden' });
  const identityLine = el('div', { class: 'gm-identity', hidden: 'hidden' }, [identityLive, el('div', { class: 'gm-identity-actions' }, [identityBtn, identityQuiet])]);
  // The click handler calls straight into sync.signIn(): nothing may be awaited
  // between this click and the pop-up opening, or the browser blocks it.
  identityBtn.addEventListener('click', () => sync && sync.signIn());
  identityQuiet.addEventListener('click', () => {
    if (!sync) return;
    if (sync.view().signin.state === 'waiting') sync.cancelSignIn();
    else sync.signOut();
  });
  const idPop = el('div', { class: 'gm-pop gm-idpop', hidden: 'hidden', role: 'dialog', 'aria-label': 'Your name' }, [
    ...(sync ? [identityLine] : []),
    whoRow,
  ]);
  shadow.appendChild(idPop);

  // ---- the sheet: every comment, grouped by screen ------------------------
  const listCount = el('span', { class: 'count', text: '0' });
  const sheetTitle = el('div', { class: 'gm-section' }, [el('span', { text: 'Comments' }), listCount]);
  const closeBtn = el('button', { class: 'gm-close', type: 'button', title: 'Close', 'aria-label': 'Close the comments list', text: '✕' });
  const filters = el('div', { class: 'gm-filters', hidden: sync ? null : 'hidden' });
  const filterBtns = ['all', 'unread', 'mine'].map((key) =>
    el('button', { type: 'button', class: 'gm-filter', 'data-filter': key, 'aria-pressed': 'false', text: key[0].toUpperCase() + key.slice(1) })
  );
  filterBtns.forEach((b) => {
    filters.appendChild(b);
    b.addEventListener('click', () => {
      filter = b.dataset.filter;
      render(true);
    });
  });
  const list = el('div', { class: 'gm-list' });
  const overall = el('textarea', {
    placeholder: 'Anything that is not about one spot',
    'aria-label': 'A note about the whole thing',
    hidden: 'hidden',
  });
  // Drawn as a field, because it is one: pressing it opens the real textarea.
  const noteToggle = el('button', { class: 'gm-note-toggle', type: 'button', text: 'Add a note about the whole thing' });
  const sendBtn = el('button', { class: 'gm-btn primary', type: 'button', text: 'Send to author' });
  const copyBtn = el('button', { class: 'gm-btn ghost', type: 'button', text: 'Copy for author' });
  const said = el('div', { class: 'gm-said', role: 'status', 'aria-live': 'polite' });
  const keepNote = el('div', { class: 'gm-keep', role: 'status', 'aria-live': 'polite' });

  // Shared mode only: which version of the page this is, the way to the others,
  // and a nudge when this is not the newest.
  const versionBtn = el('button', { class: 'gm-version', type: 'button', 'aria-expanded': 'false' });
  // Polite live region: 'Loading...' and a failure to load are otherwise silent.
  const versionList = el('div', { class: 'gm-versions', hidden: 'hidden', 'aria-live': 'polite' });
  const newerNote = el('div', { class: 'gm-newer', role: 'status' });
  const sharedHead = el('div', { class: 'gm-shared', hidden: 'hidden' }, [versionBtn, versionList, newerNote]);

  const sheet = el('div', {
    class: 'gm-sheet',
    hidden: 'hidden',
    role: 'complementary',
    'aria-label': 'gitmargin comments',
  }, [
    el('div', { class: 'gm-sheet-head' }, [
      el('div', { class: 'gm-sheet-title' }, [sheetTitle, el('div', { class: 'gm-spacer' }), closeBtn]),
      keepNote,
      ...(sync ? [sharedHead] : []),
    ]),
    filters,
    list,
    el('div', { class: 'gm-foot' }, [
      noteToggle,
      overall,
      el('div', { class: 'gm-send' }, [sendBtn, copyBtn]),
      said,
    ]),
  ]);
  shadow.appendChild(sheet);

  // ---- the thread and the hover preview, at the spot ----------------------
  const thread = el('div', { class: 'gm-thread', hidden: 'hidden', role: 'dialog', 'aria-label': 'Comment' });
  const preview = el('div', { class: 'gm-preview', hidden: 'hidden', 'aria-hidden': 'true' });
  shadow.append(thread, preview);
  // Clicks inside the thread are about the thread, never "click elsewhere".
  thread.addEventListener('click', (e) => e.stopPropagation());

  // ---- open and close ------------------------------------------------------
  /** The bar and the popovers move left when the sheet is open. */
  function layoutChrome() {
    bar.classList.toggle('is-shifted', sheetOpen);
    idPop.classList.toggle('is-shifted', sheetOpen);
    sheet.hidden = !sheetOpen;
    badgeBtn.setAttribute('aria-expanded', sheetOpen ? 'true' : 'false');
    idPop.hidden = !identityOpen;
    idBtn.setAttribute('aria-expanded', identityOpen ? 'true' : 'false');
  }
  const openSheet = () => {
    if (sheetOpen) return;
    sheetOpen = true;
    identityOpen = false;
    layoutChrome();
    render(true);
  };
  const closeSheet = () => {
    if (!sheetOpen) return;
    sheetOpen = false;
    layoutChrome();
    render();
  };
  function closePopovers() {
    if (!identityOpen) return;
    identityOpen = false;
    layoutChrome();
  }
  function openThread(id, { scroll = false } = {}) {
    selectedId = id;
    previewId = null;
    closePopovers();
    // Reading someone else's comment is what Unread means by "read".
    if (sync && !sync.isMine(id) && store.markSeen) store.markSeen(id);
    render(true);
    if (!scroll) return;
    const entry = resolvedNow.find((r) => r.comment.id === id);
    if (entry && entry.element && entry.status === 'found') {
      entry.element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
  function closeThread() {
    if (selectedId === null) return;
    selectedId = null;
    editingId = null;
    // A typed reply is work; it stays put for when the thread opens again.
    if (!replyDraft.trim()) {
      replyingId = null;
      editingReplyId = null;
    }
    render(true);
  }

  const setMode = (on) => {
    commentMode = !!on;
    setRecording(!commentMode); // the trail records the prototype, not the overlay
    switchBtn.classList.toggle('is-on', commentMode);
    document.documentElement.style.cursor = commentMode ? 'crosshair' : '';
    // A page-level signal that is visible wherever the reviewer looks. The
    // crosshair is not enough on its own: a prototype's own `cursor: pointer`
    // wins over it on exactly the buttons a reviewer tries to click (review R14).
    host.classList.toggle('gm-armed', commentMode);
    switchBtn.setAttribute('aria-checked', commentMode ? 'true' : 'false');
    if (!commentMode) hideTarget();
    // Leaving the mode governs what a click does; it is not a reason to throw
    // away a comment in progress. An empty box closes, a written one stays open
    // so the reviewer can still save it (review R16, residual path).
    else closePopovers();
    if (!commentMode && !boxText.value.trim()) closeBox();
  };

  switchBtn.addEventListener('click', () => setMode(!commentMode));
  badgeBtn.addEventListener('click', () => (sheetOpen ? closeSheet() : openSheet()));
  closeBtn.addEventListener('click', () => {
    closeSheet();
    badgeBtn.focus();
  });
  idBtn.addEventListener('click', () => {
    identityOpen = !identityOpen;
    layoutChrome();
    if (identityOpen && !whoRow.hidden) nameInput.focus();
  });
  function showNote() {
    overall.hidden = false;
    noteToggle.textContent = 'A note about the whole thing';
    overall.focus();
  }
  noteToggle.addEventListener('click', () => {
    if (!overall.hidden) {
      overall.hidden = true;
      noteToggle.textContent = 'Add a note about the whole thing';
      return;
    }
    showNote();
  });
  nameInput.addEventListener('input', () => store.setReviewer(nameInput.value));
  overall.addEventListener('input', () => store.setOverallNote(overall.value));

  function tell(message) {
    said.textContent = message;
  }
  function doSend() {
    const name = batch.download();
    store.markExported();
    tell(`Saved ${name} to your downloads. Reply to the message you got this file in and attach it.`);
  }
  async function doCopy() {
    const result = await batch.copy();
    if (window.__gitmargin) {
      window.__gitmargin.lastCopy = result.text;
      window.__gitmargin.lastCopyOk = result.ok;
    }
    if (result.ok) store.markExported();
    tell(result.ok ? 'Copied. Paste it anywhere.' : 'Could not reach the clipboard. Use Send to author instead.');
  }
  sendBtn.addEventListener('click', doSend);
  copyBtn.addEventListener('click', doCopy);

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
  const signInOn = () => Boolean(sync && sync.view().identity.mode !== 'none');
  let replyNameAsk = false; // the same ask, drawn beside a reply instead
  let nameAsked = false;
  /** True when the save should wait because the name row was just shown. */
  function askNameFirst(where = 'box') {
    if (!sync || nameAsked || store.reviewer().trim() || signInOn()) return false;
    nameAsked = true;
    if (where === 'box') {
      boxNameRow.hidden = false;
      keepBoxInView();
      boxName.focus();
    } else {
      // Asked beside the reply itself, so the reply is never left behind with
      // no way back by keyboard (review R11).
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
   * How the box and the thread describe the spot. The reviewer may be a
   * designer or an executive, so a raw CSS selector is not an answer; the
   * exported markdown already says "the Continue button", and this says the
   * same (review R27).
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
    closeThread();
    boxText.value = '';
    box.hidden = false;
    // Place it near the spot, then keep it inside the viewport. A keyboard
    // entry has no pointer coordinates, so fall back to the element's own box
    // rather than pinning the box to the top-left corner (review R20).
    const width = 300;
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
    box.style.left = `${clamp(atX + 12, 8, usableRight() - width - 8)}px`;
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
    // One layer at a time, nearest first: a thread, then a popover, then the
    // sheet, then comment mode itself. Without the last there was no keyboard
    // exit at all (R14), and a reviewer who could not find the switch had a
    // frozen prototype and no explanation.
    if (selectedId !== null) {
      e.preventDefault();
      closeThread();
      return;
    }
    if (identityOpen) {
      e.preventDefault();
      closePopovers();
      return;
    }
    if (sheetOpen) {
      e.preventDefault();
      closeSheet();
      badgeBtn.focus();
      return;
    }
    if (commentMode) {
      e.preventDefault();
      setMode(false);
    }
  });

  // ---- target preview (issue #10) -----------------------------------------
  // In comment mode a frame follows the pointer and shows the element a click
  // will attach a comment to, snapped up from the innermost node under the
  // pointer by targetFor. The click handler below calls the same function, so
  // the frame can only ever show the element the click will pick.

  /**
   * The stroke never leaves the window. A wrapper wider than the viewport used
   * to get a frame with all four edges offscreen, which looked exactly like
   * "nothing to comment on" while a click still opened a box on it (review R7,
   * #10 cycle). Four pixels in, so the line sits inside the armed edge with a
   * gap rather than on top of it.
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
  // propagation cannot hide the preview. Over the overlay's own chrome the
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
      const raw = event.target;
      const inOverlay = raw && raw.nodeType === 1 && raw.closest(`#${ROOT_ID}`);
      // A click on the page closes what floats over it: the thread and the
      // popovers. The sheet stays; it is closed on purpose, from its own X.
      if (!inOverlay) {
        closePopovers();
        if (selectedId !== null && (box.hidden || commentMode)) closeThread();
      }
      if (!commentMode) return;
      if (!raw || raw.nodeType !== 1 || inOverlay) return;

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
  const cards = new Map(); // comment id -> the sheet row
  let resolvedNow = []; // the last resolve, read by openThread's scroll

  /** The right edge the overlay may use for floating things: the sheet takes the rest. */
  const usableRight = () => window.innerWidth - (sheetOpen ? SHEET_WIDTH : 0);

  /**
   * True when the comment is a highlight inside its element rather than the
   * element itself: its quote is a fragment of the element's text. A highlight's
   * pin sits at the end of the quoted words, not on the element's corner, so a
   * text comment and an element comment on one block never overlap.
   */
  function isHighlight(comment, element, range) {
    const exact = comment.anchor.quote && comment.anchor.quote.exact;
    return Boolean(range && exact && collapse(element.textContent).length > exact.length);
  }

  /**
   * The extent of an element's visible text: a heading is a block as wide as
   * its column, but its words end long before that, and the thread should sit
   * beside the words. Null when there is nothing to measure.
   */
  function textExtent(element) {
    try {
      const range = document.createRange();
      range.selectNodeContents(element);
      const rects = Array.from(range.getClientRects()).filter((r) => r.width && r.height);
      if (!rects.length) return null;
      return { left: Math.min(...rects.map((r) => r.left)), right: Math.max(...rects.map((r) => r.right)) };
    } catch {
      return null;
    }
  }

  /**
   * Whether a pin drawn at (left, top) would cover something. The page is asked
   * what sits under the pin's centre: the page's own ground, the element the
   * pin is about, or a box that contains it, is free; anything else (a
   * neighbouring control, another pin, the sheet) is taken.
   */
  function pinSpotFree(left, top, element) {
    // The centre and the four corners: a pin whose centre is on the ground
    // while one corner clips a neighbouring button is not free.
    const inset = 1;
    const points = [
      [left + PIN / 2, top + PIN / 2],
      [left + inset, top + inset],
      [left + PIN - inset, top + inset],
      [left + inset, top + PIN - inset],
      [left + PIN - inset, top + PIN - inset],
    ];
    for (const [x, y] of points) {
      let hit = null;
      try {
        hit = document.elementFromPoint(x, y);
      } catch {
        return true;
      }
      if (!hit || hit === document.body || hit === document.documentElement) continue;
      if (hit === host) return false;
      if (hit === element || hit.contains(element)) continue;
      return false;
    }
    return true;
  }

  function renderPins(resolved) {
    lineLayer.textContent = '';
    pinPos.clear();
    const seen = new Set();
    const placed = []; // the pins drawn so far this frame, so the next one can avoid them
    // While the pins are being placed they let the pointer through, so the
    // free-spot probe sees the page and not a pin's own position from the
    // last frame; each one takes the pointer back once it is placed.
    for (const pin of pins.values()) pin.style.pointerEvents = 'none';

    resolved.forEach(({ comment, status, element }, index) => {
      if (status !== 'found' || !element) return;

      // Off the viewport on ANY edge: no pin at all. Checked before the pin is
      // claimed, so a pin that leaves the screen is removed rather than left at
      // the edge (review R23). The horizontal half matters as much as the
      // vertical: an off-canvas drawer slides sideways.
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

      // The pencil mark under the quoted text, and the point a highlight's pin
      // sits on.
      let range = null;
      try {
        range = rangeForQuote(element, comment.anchor.quote && comment.anchor.quote.exact);
      } catch {
        // One comment's underline is never worth every other comment's pin.
      }
      const rects = range ? Array.from(range.getClientRects()).filter((r) => r.width) : [];
      const highlight = isHighlight(comment, element, range) && rects.length > 0;
      // The spot: the element's top-left corner, or the end of the quoted words.
      const spot = highlight
        ? { x: rects[rects.length - 1].right, top: rects[rects.length - 1].top, bottom: rects[rects.length - 1].bottom }
        : { x: rect.left, top: rect.top, bottom: rect.bottom };

      let pin = pins.get(comment.id);
      if (!pin) {
        pin = el('button', { class: 'gm-pin', type: 'button' }, [el('span', { class: 'initials' })]);
        pin.addEventListener('click', (e) => {
          e.stopPropagation();
          if (selectedId === comment.id) closeThread();
          else openThread(comment.id);
        });
        // A hover previews the thread, mouse only: on touch there is no hover,
        // and while a thread is open the preview would only get in its way.
        pin.addEventListener('pointerenter', (e) => {
          if (e.pointerType && e.pointerType !== 'mouse') return;
          if (selectedId !== null) return;
          previewId = comment.id;
          renderPreview();
        });
        pin.addEventListener('pointerleave', () => {
          if (previewId !== comment.id) return;
          previewId = null;
          renderPreview();
        });
        pins.set(comment.id, pin);
        pinLayer.appendChild(pin);
      }
      const author = authorOf(comment);
      pin.style.setProperty('--gm-author', authorHue(author));
      pin.firstChild.textContent = initialsOf(author && author.name);
      pin.title = comment.intent.text;
      // The visible label is initials and a digit, and the comment text lives
      // in a title a keyboard or touch user never sees (review R21).
      pin.setAttribute('aria-label', `Comment ${index + 1}: ${comment.intent.text}`);
      pin.classList.toggle('is-selected', selectedId === comment.id);
      pin.classList.toggle('is-hot', hotId === comment.id);

      // Selecting a comment frames the thing it is about, in the author's own
      // colour, so the frame and the pin read as one mark. This is the whole
      // claim of the tool made visible: here is where the reviewer was.
      // The frame hugs the words, not the block: a heading's box runs the
      // width of its column, and a frame that wide reads as a form field.
      const text = textExtent(element);
      const box = text
        ? { left: Math.max(rect.left, text.left - 2), right: Math.min(rect.right, text.right + 2) }
        : { left: rect.left, right: rect.right };
      if (selectedId === comment.id) {
        lineLayer.appendChild(
          el('div', {
            class: 'gm-frame',
            style: `left:${box.left - 3}px;top:${rect.top - 3}px;width:${box.right - box.left + 6}px;height:${rect.height + 6}px`,
          })
        );
      }

      // The point of the teardrop touches the spot and the body hangs off the
      // element, never on it: on it would read as damage to the prototype.
      // The places to try, in order: for an element, the gutter to its upper
      // left with the point on the corner (on a centred prototype that covers
      // nothing at all), then above the corner, then below it; for a
      // highlight, above the end of its words, then below. A place is taken
      // when the page has something else there (a neighbouring control, an
      // earlier pin), and a pin that has to step away from its spot draws a
      // line back to it, so the map of comments never reads as clutter.
      const OVERLAP = 4; // how far the point reaches onto the spot
      const STEP = PIN - 4;
      const places = highlight
        ? [
            { left: spot.x - 2, top: spot.top - PIN - OVERLAP, cls: '', dir: 1, at: [spot.x, spot.top] },
            { left: spot.x - 2, top: spot.bottom + OVERLAP, cls: 'is-below', dir: 1, at: [spot.x, spot.bottom] },
          ]
        : [
            { left: spot.x - PIN + OVERLAP, top: spot.top - PIN + OVERLAP, cls: 'is-left', dir: -1, at: [spot.x, spot.top] },
            { left: spot.x - PIN + OVERLAP, top: spot.top - OVERLAP, cls: 'is-below is-left', dir: -1, at: [spot.x, spot.top] },
            { left: spot.x - 2, top: spot.top - PIN - OVERLAP, cls: '', dir: 1, at: [spot.x, spot.top] },
            { left: spot.x - 2, top: spot.bottom + OVERLAP, cls: 'is-below', dir: 1, at: [spot.x, spot.bottom] },
            { left: spot.x - PIN + OVERLAP, top: spot.bottom - OVERLAP, cls: 'is-below is-left', dir: -1, at: [spot.x, spot.bottom] },
          ];
      const maxLeft = usableRight() - PIN - 2;
      const maxTop = window.innerHeight - PIN - 2;
      const overlaps = (l, t) => placed.some((p) => l < p.right + 6 && l + PIN > p.left - 6 && t < p.bottom + 6 && t + PIN > p.top - 6);
      let pick = null;
      for (const place of places) {
        for (let step = 0; step <= 3 && !pick; step += 1) {
          const l = place.left + step * STEP * place.dir;
          const t = place.top;
          if (l < 2 || l > maxLeft || t < 2 || t > maxTop) continue;
          if (overlaps(l, t) || !pinSpotFree(l, t, element)) continue;
          pick = { ...place, left: l, top: t };
        }
        if (pick) break;
      }
      // Nowhere is free: the first place, kept inside the window, and stepped
      // clear of earlier pins at least.
      if (!pick) {
        let l = clamp(places[0].left, 2, maxLeft);
        const t = clamp(places[0].top, 2, maxTop);
        for (let step = 0; step < 4 && overlaps(l, t); step += 1) l = clamp(l + STEP * places[0].dir, 2, maxLeft);
        pick = { ...places[0], left: l, top: t };
      }
      const pinLeft = pick.left;
      const pinTop = pick.top;
      const isLeft = pick.cls.includes('is-left');
      const below = pick.cls.includes('is-below');
      pin.style.left = `${pinLeft}px`;
      pin.style.top = `${pinTop}px`;
      pin.style.pointerEvents = '';
      pin.classList.toggle('is-left', isLeft);
      pin.classList.toggle('is-below', below);
      placed.push({ left: pinLeft, top: pinTop, right: pinLeft + PIN, bottom: pinTop + PIN });
      pinPos.set(comment.id, { left: pinLeft, top: pinTop, below, rect, textRight: box.right, frameRight: box.right + 3 });

      // Where the point is, against where the spot is: a pin that had to step
      // away gets a line from its point to the spot.
      const pointX = isLeft ? pinLeft + PIN : pinLeft;
      const pointY = below ? pinTop : pinTop + PIN;
      const dx = pick.at[0] - pointX;
      const dy = pick.at[1] - pointY;
      const length = Math.hypot(dx, dy);
      if (length > 8 && length < 240) {
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        lineLayer.appendChild(el('div', { class: 'gm-leader', style: `left:${pointX}px;top:${pointY}px;width:${length}px;transform:rotate(${angle}deg)` }));
      }

      // The pencil mark under the quoted words, for a highlight only: an
      // element's whole text underlined next to its pin says nothing the pin
      // does not, and the frame says the rest when the thread is open.
      if (highlight) {
        for (const r of rects) {
          lineLayer.appendChild(el('div', { class: 'gm-underline', style: `left:${r.left}px;top:${r.bottom}px;width:${r.width}px` }));
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

  /** The one-line card that follows the pointer over a pin. */
  function renderPreview() {
    const entry = previewId !== null ? resolvedNow.find((r) => r.comment.id === previewId) : null;
    const at = entry && pinPos.get(entry.comment.id);
    if (!entry || !at) {
      preview.hidden = true;
      return;
    }
    preview.textContent = '';
    const author = authorOf(entry.comment);
    preview.append(el('b', { text: nameOf(author) }), el('span', { text: entry.comment.intent.text }));
    preview.hidden = false;
    const width = 220;
    const height = preview.offsetHeight || 44;
    let left = at.left + PIN + 8;
    if (left + width > usableRight() - 8) left = at.left - width - 8;
    preview.style.left = `${clamp(left, 8, usableRight() - width - 8)}px`;
    preview.style.top = `${clamp(at.top, 8, window.innerHeight - height - 8)}px`;
  }

  /** One author line: chip, name, the handle when vouched for, and how long ago. */
  function whoRowFor(author, { own = false, time = '' } = {}) {
    const meta = el('div', { class: 'gm-meta' }, [
      el('span', { class: authorClass(author), text: own ? `${nameOf(author)} (you)` : nameOf(author) }),
      time ? el('span', { class: 'gm-time', text: ago(time) }) : null,
    ]);
    return el('div', { class: 'gm-who-row' }, [avatar(author), meta]);
  }

  /**
   * The replies under a comment, plus the one-line field when a reply is being
   * written here. Null when there is nothing to draw.
   */
  function repliesFor(comment) {
    const replies = Array.isArray(comment.replies) ? comment.replies : [];
    const writing = sync && replyingId === comment.id;
    if (!replies.length || (writing && editingReplyId && replies.length === 1)) return null;
    const wrap = el('div', { class: 'gm-replies' });

    replies.forEach((r) => {
      if (writing && editingReplyId === r.id) return; // it is in the field below
      const mine = sync && sync.isMine(r.id);
      const row = el('div', { class: 'gm-reply' }, [
        whoRowFor(r.author, { own: mine, time: r.time }),
        // A reply the service refused stays here, marked, until its writer fixes it (review R12).
        sync && sync.isUnshared(r.id) ? el('div', { class: 'gm-meta', style: 'margin-left:28px' }, [el('span', { class: 'gm-flag', text: 'not shared yet' })]) : null,
        el('p', { class: 'gm-text', text: String(r.text || '') }),
      ]);
      if (mine) {
        const edit = el('button', { type: 'button', class: 'gm-quiet', text: 'Edit', 'data-focus': `redit:${r.id}` });
        const del = el('button', { type: 'button', class: 'gm-del gm-quiet', text: 'Delete', 'data-focus': `rdel:${r.id}` });
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
    return wrap;
  }

  /** The one-line reply field, with the name ask beside it when a name is needed. */
  function replyComposer(comment) {
    const wrap = el('div', { class: 'gm-reply-write' });
    {
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
        // The thread is rebuilt, and with it whatever had focus. Put it back on
        // this comment's Reply button, or keyboard users land on the page body (review R14).
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
      // The thread was just rebuilt, so these are new elements: put the caret
      // back, in the name field when that is what is being asked for.
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
   * else in the overlay, that is where they want to be.
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

  /** The flags a comment carries: where it is, how sure the pin is, whether it reached the others. */
  function flagsFor(entry) {
    const { comment, status, via } = entry;
    const out = [];
    if (status === 'hidden') out.push(el('span', { class: 'gm-flag', text: 'on another screen' }));
    if (status === 'orphaned') out.push(el('span', { class: 'gm-flag', text: 'orphaned' }));
    // The exact element is gone and only its container was found, so the pin is
    // approximate. Saying so beats pointing confidently at the wrong thing.
    if ((via === 'ancestor' || via === 'quote-loose') && status !== 'orphaned') out.push(el('span', { class: 'gm-flag', text: 'nearby' }));
    if (sync && sync.isUnshared(comment.id)) out.push(el('span', { class: 'gm-flag', text: 'not shared yet' }));
    return out;
  }

  /**
   * The thread: one comment, at its spot, with its replies. Rebuilt whole,
   * except while its text or a reply is being edited (see renderPanel).
   */
  function renderThread(resolved, force) {
    const entry = selectedId !== null ? resolved.find((r) => r.comment.id === selectedId) : null;
    if (!entry) {
      if (selectedId !== null) selectedId = null; // deleted under us
      thread.hidden = true;
      return;
    }
    if (!force && (editingId !== null || replyingId !== null) && thread.childElementCount) return;

    const { comment, status, element } = entry;
    const own = !sync || sync.isMine(comment.id);
    const screen = comment.state.screen && comment.state.screen.name;
    const index = resolved.indexOf(entry);

    // Whatever control in here has the keyboard is about to be destroyed (review R14).
    const active = shadow.activeElement;
    if (!focusAfterRender && active && thread.contains(active) && active.dataset.focus) focusAfterRender = active.dataset.focus;
    thread.textContent = '';

    const ctx = el('div', { class: 'gm-thread-ctx' }, [
      el('span', { class: 'where' }, [
        el('b', { text: `#${index + 1}` }),
        screen ? el('span', { class: 'gm-screen', text: screen }) : null,
        el('span', { class: 'gm-quote', text: describe(comment.anchor, element) }),
      ]),
      ...flagsFor(entry),
      // What the author or their agent did with it. Read-only here: a status is
      // set from the command line. 'open' is the default and says nothing.
      comment.status && comment.status !== 'open' ? el('span', { class: 'gm-status', text: comment.status }) : null,
    ]);

    const body = el('div', { class: 'gm-thread-body' });
    body.appendChild(whoRowFor(comment.author || authorOf(comment), { own: Boolean(sync && own), time: comment.time }));
    if (comment.intent.tag) body.appendChild(el('div', { class: 'gm-meta', style: 'margin-left:28px' }, [el('span', { class: 'gm-tag', text: comment.intent.tag })]));

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
      const edit = el('button', { type: 'button', class: 'gm-quiet', text: 'Edit', 'data-focus': `edit:${comment.id}` });
      const del = el('button', { type: 'button', class: 'gm-del gm-quiet', text: 'Delete', 'data-focus': `del:${comment.id}` });
      edit.addEventListener('click', () => {
        editingId = comment.id;
        render(true);
      });
      // Two steps, in place. A comment is the reviewer's own prose and nothing
      // keeps a copy once it is gone, so one mis-aimed click should not be
      // enough (review R17).
      del.addEventListener('click', () => {
        if (del.dataset.armed !== 'yes') {
          del.dataset.armed = 'yes';
          del.textContent = 'Delete?';
          return;
        }
        store.remove(comment.id);
        render(true);
      });
      // Edit and Delete only on what this browser wrote. Without sign-in that is
      // all 'your own' can mean; the service enforces the same rule with the
      // edit token, so hiding the buttons is a courtesy, not the lock.
      const actions = own ? [edit, del] : [];
      body.append(
        el('p', { class: 'gm-text', text: comment.intent.text }),
        ...(actions.length ? [el('div', { class: 'gm-card-actions' }, actions)] : [])
      );
    }
    const replies = repliesFor(comment);
    if (replies) body.appendChild(replies);

    // Reply is the thread's own action, so it sits at the foot, after the
    // replies; while one is being written, the field takes its place.
    const foot = el('div', { class: 'gm-thread-foot' });
    if (sync && replyingId === comment.id) {
      foot.appendChild(replyComposer(comment));
    } else if (sync) {
      const reply = el('button', { type: 'button', class: 'gm-reply-btn', text: 'Reply', 'data-focus': `reply:${comment.id}` });
      reply.addEventListener('click', () => {
        // A reply half-written elsewhere is work, like a comment is (review R15).
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
      foot.appendChild(reply);
    }

    thread.append(ctx, body, foot);
    thread.hidden = false;
    thread.dataset.id = comment.id;
    thread.dataset.status = status;
    restoreFocus();
  }

  /**
   * Where the thread sits: beside the element it is about, never on it. To
   * the right of the element when that fits, else to its left, else under it;
   * pushed up when it would run off the bottom. Docked under the chrome when
   * the comment has no pin on this screen (it is on another step, or
   * orphaned), so its replies and actions stay reachable.
   */
  function placeThread() {
    if (thread.hidden) return;
    const at = pinPos.get(selectedId);
    const height = thread.offsetHeight || 200;
    const right = usableRight();
    if (!at) {
      thread.style.left = `${Math.max(8, right - THREAD_WIDTH - 16)}px`;
      thread.style.top = '52px';
      return;
    }
    const { rect, textRight, frameRight } = at;
    let left;
    let top = at.top - 8;
    let beside = false;
    if (rect.right + 12 + THREAD_WIDTH <= right - 8) {
      left = rect.right + 12;
      beside = true;
    } else if (textRight + 14 + THREAD_WIDTH <= right - 8) {
      left = textRight + 14;
      beside = true;
    } else if (rect.left - 14 - THREAD_WIDTH >= 8) {
      left = rect.left - 14 - THREAD_WIDTH;
    } else {
      left = at.left;
      top = rect.bottom + 10;
    }
    const finalTop = clamp(top, 8, Math.max(8, window.innerHeight - height - 8));
    thread.style.left = `${clamp(left, 8, Math.max(8, right - THREAD_WIDTH - 8))}px`;
    thread.style.top = `${finalTop}px`;
    // A caret on the thread's edge, level with the frame, and a hairline
    // across any gap between the two, so the frame and the card that explains
    // it read as one object.
    thread.classList.toggle('is-beside', beside);
    const middle = (rect.top + rect.bottom) / 2;
    thread.style.setProperty('--gm-caret', `${clamp(middle - finalTop, 12, Math.max(12, height - 12))}px`);
    const finalLeft = clamp(left, 8, Math.max(8, right - THREAD_WIDTH - 8));
    if (beside && finalLeft - 6 - frameRight > 12 && middle > finalTop && middle < finalTop + height) {
      lineLayer.appendChild(el('div', { class: 'gm-tie', style: `left:${frameRight + 1}px;top:${middle}px;width:${finalLeft - 6 - frameRight - 1}px` }));
    }
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
        el('span', { class: authorClass(c.author), text: nameOf(c.author) }),
        screen ? el('span', { text: screen }) : null,
        c.status && c.status !== 'open' ? el('span', { class: 'gm-status', text: c.status }) : null,
      ]),
      quote ? el('div', { class: 'gm-older-quote', text: `"${quote}"` }) : null,
      el('p', { class: 'gm-text', text: String((c.intent && c.intent.text) || '') }),
    ]);
  }

  let identityDrawn = '';
  /** The identity chip and its popover, touched only when what they say changes. */
  function renderIdentity(view) {
    const on = view.identity.mode !== 'none';
    const provider = providerName(view.identity.mode);
    const unsent = view.unsent;
    // Strict reading: until someone signs in there is nothing to show, so the
    // button says what signing in is FOR. Unsent work still comes first.
    const strict = view.identity.read === 'members';
    const waitingToSend = unsent ? `to send ${unsent} comment${unsent === 1 ? '' : 's'}` : strict ? 'to see comments' : 'to comment';
    let says = '';
    let code = '';
    let button = '';
    let quiet = '';
    let attention = false; // a state the reviewer has to see, so the popover opens itself
    if (on && view.session) {
      says = `Commenting as ${view.session.name || 'you'}${view.session.username ? ` @${view.session.username}` : ''} · ${providerName(view.session.provider)}`;
      quiet = 'Sign out';
    } else if (on && view.signin.state === 'waiting') {
      says = `Waiting for ${provider}... Finish in the small window, and check it shows this code:`;
      code = view.signin.shortCode || '';
      quiet = 'Cancel';
      attention = true;
    } else if (on && view.signin.state === 'blocked') {
      says = 'Your browser blocked the sign-in window. Allow pop-ups for this page, then try again.';
      button = `Sign in with ${provider}`;
      attention = true;
    } else if (on && view.signin.state === 'not_member') {
      // The verdict first, then who, then what to do: the earlier order ("Signed
      // in as ..., this prototype only takes ...") was read as a failure by the
      // owner in the live walk (review of #18, R3). The provider keeps its own
      // session, so "another account" means signing out there first (R4).
      const who = view.signin.who || {};
      const group = who.members || view.identity.members || 'the group';
      says = `Your account is not in ${group}. You are signed in to ${provider} as ${who.name || 'someone'}, and only members can ${strict ? 'open this prototype' : 'comment here'}. Ask the author for access, or sign out of ${provider} and sign in here with another account.`;
      button = `Sign in with ${provider} again`;
      attention = true;
    } else if (on && view.signin.state === 'failed') {
      says = 'Sign-in did not finish.';
      button = `Sign in with ${provider} ${waitingToSend}`;
      attention = true;
    } else if (on) {
      says = unsent ? 'Saved here. Not shared until you sign in.' : '';
      button = `Sign in with ${provider} ${waitingToSend}`;
      attention = unsent > 0;
    }
    const drawn = [on, says, code, button, quiet].join('|');
    if (drawn === identityDrawn) return;
    const hadFocus = shadow.activeElement === identityBtn || shadow.activeElement === identityQuiet;
    identityDrawn = drawn;
    identityLine.hidden = !on;
    identityLine.classList.toggle('is-row', Boolean(says && quiet && !button && !code));
    whoRow.hidden = on;
    identitySays.textContent = says;
    identitySays.title = says; // a long name is cut with an ellipsis on the one-row layout; the whole line stays reachable
    identitySays.hidden = !says;
    identityCode.textContent = code;
    identityCode.hidden = !code;
    identityLive.hidden = !says && !code;
    identityBtn.textContent = button;
    identityBtn.hidden = !button;
    identityQuiet.textContent = quiet;
    identityQuiet.hidden = !quiet;
    // The chip: the signed-in person's initials, or the words that are the
    // way in when nobody is signed in yet.
    if (on && view.session) {
      renderChip(view.session);
    } else if (on) {
      idAvatar.hidden = true;
      idText.hidden = false;
      idText.textContent = 'Sign in';
      idBtn.classList.add('is-text');
      idBtn.setAttribute('aria-label', `Sign in with ${provider}`);
    }
    // Something happened that the reviewer has to read (a code to check, a
    // refusal, a blocked window): the popover opens itself.
    if (attention && !identityOpen) {
      identityOpen = true;
      layoutChrome();
    }
    // Pressing Sign in swaps the button for Cancel. Focus follows to whichever is there now.
    if (hadFocus) (button ? identityBtn : quiet ? identityQuiet : identityBtn).focus();
  }

  /** The chip in the chrome: initials on the person's colour. */
  function renderChip(person) {
    idAvatar.hidden = false;
    idText.hidden = true;
    idBtn.classList.remove('is-text');
    idAvatar.style.setProperty('--gm-author', authorHue(person));
    idAvatar.textContent = initialsOf(person && person.name);
    const name = (person && person.name && person.name.trim()) || '';
    idBtn.setAttribute('aria-label', name ? `Your name: ${name}` : 'Your name');
  }

  function renderShared() {
    if (!sync) return;
    const view = sync.view();
    renderIdentity(view);
    const here = view.versions.find((v) => v.version_id === sync.versionId) || null;
    // Shown only when there is another version to know about: a page with one
    // version has nothing to say here (design critic, #21).
    const others = here ? view.versions.filter((v) => v.version_id !== sync.versionId) : [];
    sharedHead.hidden = !here || (others.length === 0 && view.isLatest);
    if (!here) return;

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
    if (view.state === 'locked') return 'Comments on this prototype are for members only. Sign in to see the latest.';
    if (view.state === 'offline') {
      return store.storageOk() === false
        ? 'Working locally. Comments will be shared when the service is back; keep this tab open until then.'
        : 'Working locally. Comments will be shared when the service is back.';
    }
    if (view.state === 'connecting' || view.unsent > 0) return 'Sharing...';
    if (view.identity.read === 'members') return 'Shared. Signed-in members see these comments.';
    return 'Shared. Everyone with this page sees these comments.';
  }

  /** Whether someone else's comment has not been opened here yet. */
  const isUnread = (comment) => Boolean(sync && !sync.isMine(comment.id) && store.isSeen && !store.isSeen(comment.id));

  /** One row of the sheet: number, chip, who and where, the first line. */
  function entryFor(entry, index) {
    const { comment, status } = entry;
    const own = !sync || sync.isMine(comment.id);
    const author = authorOf(comment);
    const meta = el('div', { class: 'gm-meta' });
    // Shared mode: who said it comes first, because with several people on one
    // page that is the first thing a reader needs. Always set as text, never as
    // markup: a name is whatever a stranger with the page key typed.
    if (sync) meta.appendChild(el('span', { class: authorClass(comment.author), text: own ? `${nameOf(comment.author)} (you)` : nameOf(comment.author) }));
    if (comment.intent.tag) meta.appendChild(el('span', { class: 'gm-tag', text: comment.intent.tag }));
    // No screen name here: the row sits under a group label that says it.
    flagsFor(entry).forEach((f) => meta.appendChild(f));
    if (comment.status && comment.status !== 'open') meta.appendChild(el('span', { class: 'gm-status', text: comment.status }));
    const when = ago(comment.time);
    if (when) meta.appendChild(el('span', { class: 'gm-time', text: when }));

    const row = el('div', {
      class: 'gm-card',
      role: 'button',
      tabindex: '0',
      'data-focus': `card:${comment.id}`,
      'aria-label': `Comment ${index + 1}${status === 'found' ? '' : status === 'hidden' ? ', on another screen' : ', orphaned'}: ${comment.intent.text}`,
    }, [
      el('div', { class: 'num', text: String(index + 1) }),
      avatar(author),
      el('div', { class: 'body' }, [meta, el('p', { class: 'gm-text', text: comment.intent.text })]),
      isUnread(comment) ? el('span', { class: 'dot', 'aria-hidden': 'true' }) : null,
    ]);
    row.classList.toggle('is-selected', selectedId === comment.id);
    row.classList.toggle('is-hot', hotId === comment.id);
    const activate = () => {
      if (selectedId === comment.id) closeThread();
      else openThread(comment.id, { scroll: true });
    };
    row.addEventListener('click', activate);
    row.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      activate();
    });
    // The row under the pointer lights its pin on the page: the link between
    // the list and the spot, without reading the row's words.
    row.addEventListener('pointerenter', () => {
      hotId = comment.id;
      const pin = pins.get(comment.id);
      if (pin) pin.classList.add('is-hot');
    });
    row.addEventListener('pointerleave', () => {
      if (hotId === comment.id) hotId = null;
      const pin = pins.get(comment.id);
      if (pin) pin.classList.remove('is-hot');
    });
    return row;
  }

  /** Rebuild the sheet's list: grouped by screen, this screen first. */
  function renderList(resolved) {
    // Whatever control in here has the keyboard is about to be destroyed. On a
    // shared page the list is rebuilt whenever anyone comments, so without this a
    // keyboard user lost their place every few seconds (review R14). An explicit
    // request, set by the action that caused the rebuild, wins.
    const active = shadow.activeElement;
    if (!focusAfterRender && active && list.contains(active) && active.dataset.focus) focusAfterRender = active.dataset.focus;
    list.textContent = '';
    cards.clear();

    const shown = resolved.filter((entry) => {
      if (filter === 'unread') return isUnread(entry.comment);
      if (filter === 'mine') return !sync || sync.isMine(entry.comment.id);
      return true;
    });

    if (!resolved.length) {
      list.appendChild(el('div', { class: 'gm-empty', text: 'No comments yet. To leave one, press C or the Comment button, then click anything on the page.' }));
    } else if (!shown.length) {
      list.appendChild(el('div', { class: 'gm-empty', text: filter === 'unread' ? 'Nothing unread.' : 'None of these are yours.' }));
    }

    // Groups keep the comments' own order; the group that has a pin on this
    // screen comes first, and every other screen after it, named.
    const groups = new Map();
    shown.forEach((entry) => {
      const screen = (entry.comment.state.screen && entry.comment.state.screen.name) || '';
      const here = entry.status === 'found';
      const key = `${here ? 'here' : 'there'}:${screen}`;
      if (!groups.has(key)) groups.set(key, { screen, here, entries: [] });
      groups.get(key).entries.push(entry);
    });
    const ordered = [...groups.values()].sort((a, b) => Number(b.here) - Number(a.here));
    const oneGroup = ordered.length === 1 && ordered[0].here;
    ordered.forEach((group) => {
      if (!oneGroup) {
        const label = group.screen ? `${group.screen}${group.here ? '' : ' · another screen'}` : group.here ? 'This screen' : 'Elsewhere';
        list.appendChild(el('div', { class: 'gm-group', text: label }));
      }
      group.entries.forEach((entry) => {
        const row = entryFor(entry, resolved.indexOf(entry));
        cards.set(entry.comment.id, row);
        list.appendChild(row);
      });
    });
    restoreFocus();
  }

  function renderChrome(resolved) {
    const count = resolved.length;
    badgeCount.textContent = String(count);
    listCount.textContent = String(count);
    badgeBtn.title = count === 1 ? '1 comment' : `${count} comments`;
    badgeDot.hidden = !resolved.some((entry) => isUnread(entry.comment));
    filterBtns.forEach((b) => {
      const on = b.dataset.filter === filter;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    // The chip on a page with no sign-in: the typed name's initials.
    if (!sync || sync.view().identity.mode === 'none') renderChip({ name: store.reviewer() });
  }

  function renderPanel(resolved, force) {
    // The list and the thread are rebuilt wholesale, except while a comment or
    // a reply is being edited: that field lives inside them, so rebuilding
    // replaces what is being typed with the original text, and a scroll or a
    // ticking prototype is enough to trigger it (review R7). Everything else
    // still updates, so the count and the saved notice do not freeze.
    if (force || (editingId === null && replyingId === null) || !list.childElementCount) renderList(resolved);
    renderThread(resolved, force);
    renderShared();
    renderChrome(resolved);

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

    if (shadow.activeElement !== nameInput) nameInput.value = store.reviewer();
    if (shadow.activeElement !== overall) overall.value = store.overallNote();
    if (store.overallNote() && overall.hidden) {
      overall.hidden = false;
      noteToggle.textContent = 'A note about the whole thing';
    }
  }

  function render(force) {
    const resolved = store.comments().map((comment) => {
      const { element, status, via } = resolve(comment.anchor);
      return { comment, element, status, via };
    });
    resolvedNow = resolved;
    renderPanel(resolved, force);
    renderPins(resolved);
    placeThread();
    renderPreview();
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
  window.addEventListener('resize', () => {
    applyTheme();
    schedule();
  });
  // The page under the viewport centre may only be reached by scrolling: a
  // dark app behind a light hero, say. One more measurement, then.
  window.addEventListener('scroll', () => {
    applyTheme();
    schedule();
  }, { once: true, capture: true });
  store.subscribe(schedule);

  render();

  return {
    setCommentMode: setMode,
    isCommentMode: () => commentMode,
    openPanel: openSheet,
    closePanel: closeSheet,
    openThread,
    render,
    isBoxOpen: () => !box.hidden,
    // Read by the test suite: the element the target preview is on, so a test
    // can compare it by identity with what a click then anchors (issue #10).
    target: () => framed,
    theme: () => theme,
    shadow,
  };
}
