/* CaseVault — user interface.
 * Plain DOM code, no framework. Data flows: UI -> Vault (vault.js) -> SSD (fs.js).
 */
'use strict';

(() => {
  /* =====================================================================
   * Small helpers
   * ===================================================================== */

  const $ = (sel, el = document) => el.querySelector(sel);

  // h('div', {class: 'x', onclick: fn}, 'text', childNode, [more])
  function h(tag, attrs = {}, ...kids) {
    // Every date box in CaseVault is typed as MM.DD.YYYY (js/formats.js), with a calendar button.
    if (tag === 'input' && attrs && attrs.type === 'date' && window.CVFormat) {
      const { class: cls, ...rest } = attrs;
      const box = CVFormat.dateField(rest);
      if (cls) box.classList.add(...String(cls).split(/\s+/).filter(Boolean));
      for (const [k, v] of Object.entries(rest)) if (k.startsWith('on') && typeof v === 'function') box.addEventListener(k.slice(2), v);
      return box;
    }
    const el = document.createElement(tag);
    // Headings in Title Case (v1.20): "Upcoming deadlines" shows as "Upcoming Deadlines".
    // Buttons too (v1.21): "Show/hide" -> "Show/Hide", "Edit links" -> "Edit Links".
    const cls = String((attrs && attrs.class) || '');
    const labelled = /^h[2-4]$/.test(tag) || (tag === 'button' && /\b(btn|menu-item|tab)\b/.test(cls) && !/\blinkish\b/.test(cls));
    if (labelled && !(attrs && attrs['data-keep-case'])) kids = kids.map((k) => (typeof k === 'string' ? CVFormat.titleCase(k) : k));
    let iconName = null;
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'icon') iconName = v;
      else if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'selected') el[k] = v;
      else if (k === 'html') el.innerHTML = v; // only ever used with Markdown.render output (escaped)
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : String(kid));
    }
    // Icons go on the right of the words (v1.21).
    // v1.177: a small secondary button with words shows just its words (fewer icons, calmer pages);
    // main buttons, tabs, tiles and headings keep theirs, and so does a button that is only an icon.
    if (iconName && tag === 'button' && /\bbtn\b/.test(cls) && /\bsmall\b/.test(cls) && !/\b(primary|danger|keep-icon)\b/.test(cls) && [...el.childNodes].some((n) => (n.nodeType === 3 ? n.textContent.trim() : n.nodeType === 1 && !n.classList.contains('sr-only') && n.textContent.trim()))) iconName = null; // words a person sees, not just a screen reader's
    if (iconName) { if (el.childNodes.length) el.append(' '); el.append(CVIcons.icon(iconName)); }
    return el;
  }

  const pad = (n) => String(n).padStart(2, '0');
  const today = () => Vault.localDay();

  function fmtDate(s) {
    if (!s) return '';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s);
    if (isNaN(d)) return s;
    // The long date everywhere in CaseVault (v1.32): "September 30, 2026".
    return CVFormat.dateText(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }

  // v1.100: when a case was opened, short, and how long ago (for the sidebar).
  // v1.132: the short month from a list (toLocaleString built a date formatter for every case on
  // every sidebar redraw, a large part of the pause after each save on a slow laptop).
  const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function openedAge(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null;
    const d = new Date(`${iso}T12:00:00`);
    const diff = Math.round((new Date(`${today()}T12:00:00`) - d) / 864e5);
    // v1.128: an Opened date in the future (most likely a typo) says so, rather than "today".
    const future = diff < 0;
    const days = Math.abs(diff);
    const span = days < 60 ? `${days}d` : days < 730 ? `${Math.floor(days / 30.44)}mo` : `${Math.floor(days / 365.25)}y`;
    const spanLong = days < 60 ? plural(days, 'day') : days < 730 ? plural(Math.floor(days / 30.44), 'month') : plural(Math.floor(days / 365.25), 'year');
    const age = days === 0 ? 'today' : future ? `in ${span}` : span;
    const ageLong = days === 0 ? 'Today' : future ? `In ${spanLong}` : spanLong;
    return { short: `${SHORT_MONTHS[d.getMonth()]} ${pad(d.getDate())}, ${d.getFullYear()}`, age, ageLong, days: future ? -days : days, future, long: fmtDate(iso) };
  }

  function fmtDateTime(ms) {
    const d = new Date(ms);
    return `${fmtDate(Vault.localDay(d))} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // v1.76: the time alone, as in fmtDateTime (Files tab: the time under the date updated).
  function fmtTime(ms) {
    const d = new Date(ms);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fmtSize(n) {
    if (n < 1024) return `${n} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let u = -1;
    do { n /= 1024; u++; } while (n >= 1024 && u < units.length - 1);
    return `${n.toFixed(n < 10 ? 1 : 0)} ${units[u]}`;
  }

  function daysUntil(dateStr) {
    const a = new Date(today() + 'T00:00:00');
    const b = new Date(dateStr + 'T00:00:00');
    return Math.round((b - a) / 86400000);
  }

  function dueLabel(dateStr) {
    const n = daysUntil(dateStr);
    if (n < 0) return { text: `${-n} day${n === -1 ? '' : 's'} overdue`, cls: 'overdue' };
    if (n === 0) return { text: 'due today', cls: 'soon' };
    if (n === 1) return { text: 'due tomorrow', cls: 'soon' };
    return { text: `in ${n} days`, cls: n <= 7 ? 'soon' : '' };
  }

  /** v1.148: the deadline a case rings for: its next deadline unless snoozed past today (then the next
   * one not snoozed, or a snoozed one whose snooze has run out); null when nothing is due soon. */
  function effDeadline(c) {
    const nd = c && c.nextDeadline;
    if (!nd || !nd.date) return null;
    const now = today();
    const cands = [nd, ...(nd.snoozed || []), nd.other].filter(Boolean).filter((d) => !d.snooze || d.snooze <= now);
    return cands.sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  }
  function caseDue(c) {
    const d = effDeadline(c);
    return d ? { ...dueLabel(d.date), date: d.date, title: d.title } : null;
  }
  // v1.67: the statute of limitations of a case in the index: 'warn' (5 days or less), 'expired' or ''.
  const solState = (c) => (c && c.sol && !isArchivedEntry(c) && c.status !== 'Closed' && globalThis.CVLimits ? CVLimits.state(c.sol, today()) : '');
  // v1.62: a heading inside a popup form (a thin line with its name) and a hint box.
  const formSect = (label, icon) => h('div', { class: 'form-sect span-2' }, icon ? I(icon) : null, h('span', {}, label));
  const formHint = (...kids) => h('p', { class: 'form-hint span-2' }, I('info-circle'), h('span', {}, ...kids));
  // v1.76: DNA (does not apply) offered on number boxes such as the Federal Jacket Number.
  const dnaCombo = (el) => (window.CVCombo ? CVCombo.attach(el, { items: () => [{ value: 'DNA', label: 'DNA', hint: 'Does Not Apply' }] }) : el);
  const STATUS_ICONS = { Open: 'folder2-open', Closed: 'lock-fill', Archived: 'archive' };
  const statusPill = (status) => h('span', { class: `pill status-${String(status).toLowerCase()}`, icon: STATUS_ICONS[status] }, status);
  // v1.123: a date in three fixed columns (month, day, year), so a column of dates lines up.
  const dateCols = (iso) => {
    const m = /^(\w+) (\d{2}), (\d{4})$/.exec(fmtDate(iso));
    return m ? h('span', { class: 'date-cols' }, h('span', { class: 'dc-m' }, m[1]), h('span', { class: 'dc-d' }, `${m[2]},`), h('span', { class: 'dc-y' }, m[3])) : (iso ? fmtDate(iso) : '—');
  };
  // v1.123: the subject as Last / First / Middle cells (one cell across all three when it isn't one person's name).
  const nameCells = (subject, { initial = false } = {}) => {
    const p = CVOperation.nameParts(subject);
    if (!String(subject || '').trim()) return [h('td', { class: 'muted name-cell', colspan: 3 }, 'No subject yet')];
    if (p.whole) return [h('td', { class: 'subject-cell name-cell', colspan: 3, title: 'Not a single person\'s name, so it isn\'t split' }, p.last)];
    const mid = initial && p.middle ? `${p.middle[0].toUpperCase()}.` : p.middle;
    return [h('td', { class: 'subject-cell name-cell name-last' }, p.last), h('td', { class: 'name-cell' }, p.first), h('td', { class: 'name-cell name-mid' }, mid || h('span', { class: 'muted' }, '—'))];
  };
  const I = (name, opts) => CVIcons.icon(name, opts);
  // v1.85: still being worked on (Templates, the Checker, the Anonymizer).
  const betaTag = () => h('span', { class: 'beta-tag', title: 'Beta: still being worked on. Check what it gives you before you rely on it.' }, 'Beta');

  /* v1.85: the last errors, for Report a Problem. Kept in memory only, never written on their own. */
  const PROBLEMS = [];
  const noteProblem = (kind, text) => {
    PROBLEMS.push({ at: new Date().toISOString(), kind, text: String(text || '').slice(0, 1200) });
    if (PROBLEMS.length > 40) PROBLEMS.shift();
  };
  window.addEventListener('error', (e) => noteProblem('error', `${e.message || 'Error'}${e.filename ? ` (${String(e.filename).split('/').pop()}:${e.lineno}:${e.colno})` : ''}${e.error && e.error.stack ? `\n${e.error.stack}` : ''}`));
  window.addEventListener('unhandledrejection', (e) => { const r = e.reason; noteProblem('promise', r && r.stack ? r.stack : String(r)); });

  function toast(message, kind = 'info', ms = 4000) {
    if (kind === 'error') noteProblem('message', typeof message === 'string' ? message : (message && message.textContent) || '');
    const el = h('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message);
    // v1.118: a message that stays a while can be closed right away.
    if (ms >= 6000) el.append(h('button', { type: 'button', class: 'toast-close', 'aria-label': 'Close this message', onclick: () => el.remove() }, '×'));
    $('#toasts').append(el);
    setTimeout(() => el.remove(), ms);
    return el;
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  /* =====================================================================
   * Dialogs
   * ===================================================================== */

  const dialogEl = $('#dialog');

  const DIALOG_SIZES = [
    ['panel', '.vault-panel'],
    ['form', '.sum-choice, .nh-save-form, .nh-open-form, .op-form, .new-case-form, .deep-search, .restore-form, .locker-form'],
    ['full', '.preview, .doc-view, .lib-preview, .pdf-view, .word-view, .disc'],
    ['wide', '.person-view, .suspect-search, .rolodex-form, .year-summary, .vault-check, .cal-view, .wk-view, .custody-dialog, .problem-form, .type-form, .review-form, .key-form, .gen-form, .close-form, .selftest, .engine-panel, .options-form, .contact-form, .rephrase-form, .aie-form, .memo-form, .fr-form, .vs-form, .mc-form, .review-report, .chat-history-form'],
  ];

  function openDialog(build) {
    return new Promise((resolve) => {
      dialogEl.replaceChildren();
      let done = false;
      const close = (value) => {
        if (done) return;
        done = true;
        dialogEl.onclose = null; // this dialog's "close" event arrives later; it isn't for the next one
        dialogEl.close();
        resolve(value);
      };
      // Esc or the browser closing it. A late "close" event from the previous dialog (one dialog
      // replaced by the next, e.g. Vault → Run self-test) finds the dialog open again: ignore it.
      dialogEl.onclose = () => { if (dialogEl.open) return; if (!done) { done = true; resolve(undefined); } };
      dialogEl.append(build(close));
      // Every box has an X at the top right that closes it without doing anything, like Esc.
      // A box with its own header row (the Vault, Options, a file) gets the X in that row, after
      // Done, as a button of the same size (v1.20); any other box has it in the corner.
      // v1.57: no X when the box already has a button that closes it (Done, Close, Cancel, OK…).
      const closer = [...dialogEl.querySelectorAll('button')].some((b) => /^(done|close|cancel|ok|back|not now|save and close|save & close)$/i.test(b.textContent.trim()));
      if (!closer) {
        const xBtn = h('button', { class: 'icon-btn dialog-x', type: 'button', 'aria-label': 'Close (Esc)', onclick: () => close(undefined) }, I('x-lg'));
        const head = dialogEl.querySelector('.vault-panel-head, .opt-head, .preview-head');
        if (head) { xBtn.classList.add('in-head'); head.append(xBtn); } else dialogEl.append(xBtn);
      }
      // The dialog's size comes from what it shows (set here, not with CSS :has(), which older
      // Firefox versions don't know and would leave file previews 620px wide and clipped).
      const kind = DIALOG_SIZES.find(([, sel]) => dialogEl.querySelector(sel));
      dialogEl.className = `dialog${kind ? ` dialog-${kind[0]}` : ''}`;
      dialogEl.showModal();
      const focus = dialogEl.querySelector('[autofocus]') || dialogEl.querySelector('input, textarea, select, button');
      if (focus) focus.focus();
    });
  }

  function confirmDialog({ title, message, confirmText = 'OK', cancelText = 'Cancel', danger = false, requireText = '' }) {
    return openDialog((close) => {
      const typed = requireText ? h('input', { type: 'text', autocomplete: 'off', 'aria-label': `Type ${requireText} to confirm` }) : null;
      const ok = h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'submit', disabled: !!requireText }, confirmText);
      if (typed) typed.addEventListener('input', () => { ok.disabled = typed.value.trim() !== requireText; });
      return h('form', { method: 'dialog', onsubmit: (e) => { e.preventDefault(); if (!ok.disabled) close(true); } },
        h('h2', {}, title),
        typeof message === 'string' ? h('p', {}, message) : message,
        typed && h('label', { class: 'field' }, h('span', {}, `Type ${requireText} to confirm`), typed),
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, cancelText),
          ok));
    });
  }

  /* =====================================================================
   * Autosave + "Saved to SSD" indicator
   * ===================================================================== */

  /** v1.132: the cursor is in a text box (as opposed to a button, a checkbox or a list). */
  function isTyping() {
    const a = document.activeElement;
    return !!a && (a.isContentEditable || a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /^(text|search|email|tel|url|number|)$/.test(a.type || '')));
  }
  const PAUSE_MS = 1500; // v1.132: "after a pause": this long after the last change (was 0.5 to 1.2 s)
  const Save = {
    timers: new Map(),  // key -> { timer, fn, due }
    failed: new Map(),  // key -> fn  (retried after reconnect)
    running: 0,
    lastSaved: null,

    // Queue a save. Repeated calls with the same key collapse into one write.
    // v1.132: when is set per PC in Options (CVOptions.saveEveryMs): after a pause in typing (the
    // default: PAUSE_MS after the last change), or at most every 5 or 30 minutes. Either way the
    // changes are written at once on a page change, Ctrl+S, a lock, Power Off or the window closing.
    // The indicator is drawn when a save starts waiting, not on every keystroke.
    // Only typing waits: a change made with a click (Add Note, a choice from a list) keeps its own
    // short delay.
    schedule(key, fn, delay = 500) {
      const typing = isTyping();
      const every = typing && window.CVOptions && CVOptions.saveEveryMs ? CVOptions.saveEveryMs() : 0;
      const prev = this.timers.get(key);
      this.failed.delete(key);
      if (prev && every) { prev.fn = fn; return; } // the timer already running writes the newest version
      if (prev) clearTimeout(prev.timer);
      const wait = every || (typing ? Math.max(delay, PAUSE_MS) : delay);
      const entry = { fn, due: Date.now() + wait };
      entry.timer = setTimeout(() => this.run(key, entry.fn).catch(() => {}), wait); // errors surface via the indicator
      this.timers.set(key, entry);
      if (!prev) this.render();
    },

    // Run a save now and report the result through the indicator.
    async run(key, fn) {
      const pending = this.timers.get(key);
      if (pending) clearTimeout(pending.timer);
      this.timers.delete(key);
      this.running++;
      this.render();
      try {
        const result = await fn();
        this.failed.delete(key);
        this.lastSaved = new Date();
        afterSave();
        return result;
      } catch (err) {
        if (FS.isDisconnectError(err)) {
          this.failed.set(key, fn);
          onDriveLost();
        } else if (err && err.name === 'ValidationError') {
          // v1.46: a refused Operation or Case Number change; the caller says why.
        } else {
          console.error(err);
          toast(`Could not save: ${err.message}`, 'error', 8000);
        }
        throw err;
      } finally {
        this.running--;
        this.render();
      }
    },

    // For one-off actions (add file, delete event) that should show in the indicator.
    track(key, fn) {
      return this.run(key, fn);
    },

    flushAll() {
      return Promise.allSettled([...this.timers.entries()].map(([key, { fn }]) => this.run(key, fn)));
    },

    async retryFailed() {
      const jobs = [...this.failed.entries()];
      this.failed.clear();
      await Promise.allSettled(jobs.map(([key, fn]) => this.run(key, fn)));
    },

    discardAll() {
      for (const { timer } of this.timers.values()) clearTimeout(timer);
      this.timers.clear();
      this.failed.clear();
      this.render();
    },

    busy() {
      return this.running > 0 || this.timers.size > 0 || this.failed.size > 0;
    },

    render() {
      const el = $('#save-status');
      if (!state.connected && !this.failed.size) { el.className = 'save-status'; el.textContent = ''; return; }
      if (this.failed.size) {
        el.className = 'save-status error';
        el.textContent = `Not saved — reconnect SSD (${this.failed.size})`;
      } else if (this.running) {
        el.className = 'save-status saving';
        el.textContent = 'Saving…';
      } else if (this.timers.size) {
        // v1.132: changes waiting for the pause in typing, or for the next 5 or 30 minute save.
        const due = new Date(Math.min(...[...this.timers.values()].map((t) => t.due || Date.now())));
        el.className = 'save-status saving';
        el.textContent = due - Date.now() > 60e3 ? `Not saved yet · saves at ${pad(due.getHours())}:${pad(due.getMinutes())} (Ctrl+S saves now)` : 'Saving…';
      } else if (this.lastSaved) {
        el.className = 'save-status saved';
        el.textContent = `Saved to SSD ${pad(this.lastSaved.getHours())}:${pad(this.lastSaved.getMinutes())}:${pad(this.lastSaved.getSeconds())}`;
      } else {
        el.className = 'save-status saved';
        el.textContent = 'Connected to SSD';
      }
      // The header shows just the icon; the words are in its hover box.
      el.title = `${el.textContent}${el.classList.contains('error') ? '' : ` · ${$('#vault-name').textContent || 'SSD'}`}`;
      el.setAttribute('aria-label', el.textContent);
      el.tabIndex = 0;
      el.prepend(I({ error: 'exclamation-triangle-fill', saving: 'arrow-repeat', saved: 'hdd-fill' }[el.className.split(' ')[1]] || 'hdd'));
      this.markTabs();
    },

    // v1.119: a small mark on a case's tab while it has changes not yet written to the SSD.
    markTabs() {
      const TAB_OF = { case: 'details', 'report-fields': 'draft', arrest: 'arrest', draft: 'reports', notes: 'reports', timeline: 'timeline', linkchart: 'linkchart', check: 'checks' };
      const waiting = new Set();
      for (const key of [...this.timers.keys(), ...this.failed.keys()]) {
        const [kind, id] = String(key).split(':');
        if (TAB_OF[kind] && id) waiting.add(`${id}/${TAB_OF[kind]}`);
      }
      for (const a of document.querySelectorAll('.tabs a.tab')) {
        const m = /#\/case\/([^/]+)\/([^/?]+)/.exec(a.getAttribute('href') || '');
        const on = !!m && waiting.has(`${CVRoute.dec(m[1])}/${m[2]}`);
        a.classList.toggle('unsaved', on);
        if (on) a.setAttribute('data-unsaved', 'Changes not saved to the SSD yet'); else a.removeAttribute('data-unsaved');
      }
    },
  };

  const afterSave = debounce(() => refreshCaseList(), 150);

  /* =====================================================================
   * App state
   * ===================================================================== */

  let memBox = null; // v1.119: the top bar's Memory icon (CVMemory.mount)
  const state = {
    connected: false,
    vaultId: null,
    caseId: null,
    archOpen: new Set(), // v1.67: open Archived sub-folders
    tab: 'details',
    caseObj: null,
    renderToken: 0,
    drive: '',
  };

  /* =====================================================================
   * Connecting to the SSD
   * ===================================================================== */

  const gate = $('#gate');

  function showGate(message, detail = '', actions = []) {
    $('#gate-message').textContent = message;
    $('#gate-detail').textContent = detail;
    $('#gate-actions').replaceChildren(...actions.map((a) =>
      h('button', { class: `btn ${a.primary ? 'primary' : ''}`, type: 'button', onclick: a.onClick }, a.label)));
    gate.hidden = false;
    document.body.classList.add('gated');
    const first = $('#gate-actions button');
    if (first) first.focus();
  }

  function hideGate() {
    gate.hidden = true;
    document.body.classList.remove('gated');
  }

  const unsavedNote = () => Save.failed.size
    ? `${Save.failed.size} unsaved change${Save.failed.size === 1 ? ' is' : 's are'} waiting in this window and will be saved when you reconnect. Don't close this tab.`
    : '';

  // Direct mode: Chrome/Edge open the SSD folder themselves (File System Access API).
  // Helper mode: other browsers (Firefox) go through the CaseVault helper on 127.0.0.1.
  const PARTS = {}; // v1.98: Case Overview, Timeline and Files tab, from their own files (see the end)
  const MODE = ('showDirectoryPicker' in window && window.isSecureContext) ? 'direct' : 'helper';
  document.body.dataset.mode = MODE;
  // v1.178: the online copy (GitHub Pages) shares its web address with every Pages site of the
  // account (docs/SECURITY.md), so it never remembers the vault folder there: the folder is chosen
  // each visit and kept only while the page is open. Everyday use is the SSD copy through the helper
  // (Start-CaseVault.bat), whose address is this PC alone. (__cvOnlineCopy: for tests.)
  const ONLINE_COPY = MODE === 'direct' && ((location.protocol === 'https:' && /\.github\.io$/i.test(location.hostname)) || window.__cvOnlineCopy === true);
  let onlineHandle = null;

  const actPick = MODE === 'direct' ? { label: 'Choose folder…', onClick: () => pickFolder() } : null;
  const actReconnect = { label: 'Reconnect', primary: true, onClick: () => reconnect() };
  const acts = (...list) => list.filter(Boolean);

  function gateWelcome() {
    showGate(
      'Choose your CaseVault folder on the SSD.',
      ONLINE_COPY
        ? 'This is CaseVault\'s online copy, for now and then. For everyday use, open CaseVault from the SSD with Start-CaseVault.bat: it runs on this PC only. Here the folder is not remembered, so you choose it each visit; when the browser asks, pick "Allow this time".'
        : 'Pick the CaseVault partition (for example V:\\) or its CaseVault-Data folder. If there is no vault yet, CaseVault will offer to create one.',
      [{ label: 'Choose folder…', primary: true, onClick: () => pickFolder() }]);
  }

  function gateReconnect(name) {
    showGate(
      `Welcome back. Click Reconnect to open "${name}" on your SSD.`,
      'Your browser asks for permission once per session. This keeps other websites from ever reading your drive.',
      acts(actReconnect, actPick));
  }

  function gateMissing(extra = '') {
    const hint = MODE === 'direct'
      ? 'If Windows gave the drive a different letter, click "Choose folder…" and pick the CaseVault-Data folder again.'
      : 'Unlock the CASEVAULT drive with your BitLocker password if Windows asks. The helper finds it on any drive letter.';
    showGate(
      'Drive not connected. Plug in your SSD and click Reconnect.',
      [extra, unsavedNote(), hint].filter(Boolean).join(' '),
      acts(actReconnect, actPick));
  }

  function gateHelperDown(err) {
    // v1.152: the helper runs but was restarted (an update, or Start-CaseVault.bat again), so this
    // window has an old key: say so (not "not running"), and reconnect by itself once a new tab
    // from Start-CaseVault.bat has brought the new key (see the storage listener below).
    if (err && err.keyRefused) {
      return showGate(
        'Start CaseVault Again to Reconnect',
        [unsavedNote(), 'The CaseVault helper was restarted, so this window needs its new key. Double-click Start-CaseVault.bat once: it opens CaseVault in a new tab, and this window reconnects by itself too.'].filter(Boolean).join(' '),
        [actReconnect]);
    }
    showGate(
      'The CaseVault helper is not running.',
      [unsavedNote(), 'Double-click Start-CaseVault.bat on the CV-AI drive (for example W:\\), keep its window open, then click Reconnect.'].filter(Boolean).join(' '),
      [actReconnect]);
  }

  function gateUnsupported() {
    if (MODE === 'helper') {
      return showGate(
        'In this browser, CaseVault runs through the CaseVault helper.',
        'Plug in and unlock the SSD, then double-click Start-CaseVault.bat on the CV-AI drive (for example W:\\). It opens CaseVault at http://127.0.0.1:8517/. Or use Chrome or Edge, which can open the SSD directly.',
        [{ label: 'Open http://127.0.0.1:8517/', primary: true, onClick: () => { location.href = HelperFS.DEFAULT_URL; } }]);
    }
    showGate('This browser can\'t open folders on your SSD.', 'Use Chrome, Edge, or Firefox on a desktop computer.', []);
  }

  function gateError(err) {
    showGate('Could not open the vault.', err.message || String(err), acts(
      { label: 'Try again', primary: true, onClick: () => reconnect() }, actPick));
  }

  function gateCreate(parent) {
    const where = parent.name === Vault.DATA_DIR ? `"${parent.name}"` : `"${parent.name}\\${Vault.DATA_DIR}"`;
    showGate(
      `No vault found in "${parent.name}".`,
      `Create a new, empty vault at ${where}? Nothing else in that folder is touched.`,
      acts({
        label: 'Create vault here', primary: true, onClick: async () => {
          try { await openVault(await Vault.create(parent)); } catch (err) { handleOpenError(err); }
        },
      }, actPick && { label: 'Choose a different folder…', onClick: () => pickFolder() }));
  }

  async function pickFolder() {
    let picked;
    try {
      picked = await window.showDirectoryPicker({ id: 'casevault', mode: 'readwrite' });
    } catch (err) {
      if (err.name === 'AbortError') return;
      return gateError(err);
    }
    try {
      const r = await Vault.resolve(picked);
      if (r.found) return openVault(r.dir);
      gateCreate(r.parent);
    } catch (err) {
      handleOpenError(err);
    }
  }

  // v1.152: a new tab from Start-CaseVault.bat stores the helper's new key; a window waiting on
  // the old one reconnects at once.
  window.addEventListener('storage', (e) => { if (e.key === 'cv-helper-key' && e.newValue && MODE === 'helper' && !state.connected) connectHelper(); });
  async function connectHelper() {
    let info;
    try { info = await HelperFS.info(); } catch (err) { return gateHelperDown(err); }
    if (!info.ready) return gateMissing();
    state.drive = info.drive || '';
    state.bitlocker = info.bitlocker || 'unknown'; // v1.98 (helper 1.13)
    try {
      const r = await Vault.resolve(HelperFS.root(info.root));
      if (r.found) return openVault(r.dir);
      gateCreate(r.parent);
    } catch (err) {
      handleOpenError(err);
    }
  }

  async function reconnect() {
    if (MODE === 'helper') return connectHelper();
    const handle = ONLINE_COPY ? onlineHandle : await HandleStore.load();
    if (!handle) return gateWelcome();
    try {
      const perm = await handle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        return showGate('CaseVault needs permission to read and write the vault folder.',
          'Click Reconnect and choose "Allow" (or "Allow on every visit") when the browser asks.',
          acts(actReconnect, actPick));
      }
      const r = await Vault.resolve(handle);
      if (!r.found) return gateMissing('The saved folder is there, but it has no vault.json.');
      await openVault(r.dir);
    } catch (err) {
      handleOpenError(err);
    }
  }

  // Work out whether the drive or (in helper mode) the helper went away, and show the right screen.
  async function gateLost() {
    if (MODE === 'helper') {
      try {
        const info = await HelperFS.info();
        if (info.ready && state.connected) return;
      } catch { return gateHelperDown(); }
    }
    gateMissing();
  }

  function handleOpenError(err) {
    if (err && (err.name === 'NotFoundError' || err.name === 'NotReadableError' || err.name === 'InvalidStateError')) return gateLost();
    console.error(err);
    gateError(err);
  }

  async function openVault(dir) {
    const previousId = state.vaultId;
    const data = await Vault.load(dir);
    if (previousId && data.vaultId !== previousId && (Save.failed.size || Save.timers.size)) {
      const drop = await confirmDialog({
        title: 'This is a different vault',
        message: `You have ${Save.failed.size + Save.timers.size} unsaved change(s) from the previous vault. They cannot be saved into a different vault. Reconnect the original SSD to keep them, or continue and discard them.`,
        confirmText: 'Discard and continue',
        danger: true,
      });
      if (!drop) { Vault.close(); return gateMissing(); }
      Save.discardAll();
    }
    if (ONLINE_COPY) onlineHandle = dir; // v1.178: while this page is open only
    else if (MODE === 'direct') await HandleStore.save(dir);
    const sameVault = previousId === data.vaultId;
    // v1.151: the key that scrambles case IDs and names in the address (js/route-key.js).
    if (!/^[0-9a-f]{32,128}$/.test(String((Vault.data.settings || {}).routeKey || ''))) await Vault.updateSettings({ routeKey: CVRoute.newSecret() }).catch(() => {});
    CVRoute.setSecret((Vault.data.settings || {}).routeKey);
    state.connected = true;
    // v1.158: hidden when the page was refreshed or closed: covered again before any case is drawn,
    // and only the PIN (now that vault.json is read) opens it.
    if (window.CVPrivacy && CVPrivacy.wasLocked()) CVPrivacy.lock();
    // v1.119: the Memory icon shows with the others at once, not five seconds later (no jump).
    if (memBox) memBox.tick();
    state.vaultId = data.vaultId;
    // Where the data is saved, e.g. W:\CaseVault-Data (helper mode knows the drive letter).
    $('#vault-name').textContent = MODE === 'helper' && state.drive ? CVFormat.pathText(`${state.drive.replace(/[\\/]+$/, '')}\\${dir.name}`) : dir.name;
    hideGate();
    setSidebar(!!(Vault.data.settings && Vault.data.settings.sidebarCollapsed), { save: false });
    if (Vault.data.settings && Vault.data.settings.sidebarWidth) setSidebarWidth(Vault.data.settings.sidebarWidth, { save: false });
    setSidebarLock(!!(Vault.data.settings && Vault.data.settings.sidebarLocked), { save: false });
    Save.render();
    if (sameVault) await Save.retryFailed();
    else { state.caseId = null; state.caseObj = null; }
    renderNetStatus();
    renderCaseList();
    route();
    CVChecks.onVaultOpen();
    if (!sameVault) { safetyChecks(); monthlyVaultCheck(); }
    // v1.91: a saved online AI key from an older version was deleted from the SSD.
    if (Vault.lastCleanup && Vault.lastCleanup.keys) toast('Online AI is no longer part of CaseVault. The saved online AI key was deleted from the SSD (CaseVault-Data\\secrets).', 'info', 10000);
  }

  /* v1.85: data safety. How long since the last full backup (to another drive), and whether the
   * daily vault.json backup and the SSD's free space are fine. */
  // v1.171: how often the banner asks for a full backup is chosen in the Backups panel (7 days by default).
  const BACKUP_EVERY = [3, 7, 14, 30];
  const fullBackupDays = () => { const n = Number(Vault.data && Vault.data.settings && Vault.data.settings.backupEveryDays); return BACKUP_EVERY.includes(n) ? n : 7; };
  // v1.171: a backup is tested (Test Restore) at least once a month; the result is kept in the settings.
  const BACKUP_TEST_DAYS = 30;
  function backupTestDue() {
    const s = (Vault.data && Vault.data.settings) || {};
    if (!s.lastFullBackup || !s.lastFullBackup.at) return false;
    const t = s.lastBackupTest;
    return !t || !t.at || !t.ok || (Date.now() - Date.parse(t.at)) / 86400000 > BACKUP_TEST_DAYS;
  }
  function fullBackupAge() {
    const last = Vault.data && Vault.data.settings && Vault.data.settings.lastFullBackup;
    if (!last || !last.at) return null;
    return Math.max(0, Math.floor((Date.now() - Date.parse(last.at)) / 86400000));
  }
  // v1.153: also due after this many changes (case saves) since the last full backup.
  const FULL_BACKUP_CHANGES = 50;
  const changesSinceBackup = () => Number(Vault.data && Vault.data.settings && Vault.data.settings.changesSinceBackup) || 0;
  const backupByCount = () => fullBackupAge() != null && changesSinceBackup() >= FULL_BACKUP_CHANGES;
  function fullBackupText() {
    const n = fullBackupAge();
    if (backupByCount() && n <= fullBackupDays()) return `${changesSinceBackup()} changes since the last full backup`;
    if (n == null) return 'No full backup yet';
    return `Last full backup: ${n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`}`;
  }
  /* v1.98: is the CASEVAULT drive encrypted? The helper (1.13 or later) asks Windows; in Chrome or
   * Edge there is no way to ask, so it's 'unknown' there. */
  const ENCRYPTION_STEPS = 'In File Explorer, right-click the drive → Turn on BitLocker (choose a password, save the recovery key somewhere safe, pick "Encrypt entire drive").';
  function driveEncryptionWarning() {
    const d = (state.drive || 'The CASEVAULT drive').replace(/[\\/]+$/, '');
    if (state.bitlocker === 'off') return `${d} is not encrypted. Anyone who gets the SSD can read every case on it. ${ENCRYPTION_STEPS}`;
    if (state.bitlocker === 'suspended') return `BitLocker is paused on ${d}, so the cases on it are readable. In File Explorer, right-click the drive → Manage BitLocker → Resume protection.`;
    return null;
  }
  function encryptionText(v) {
    return v === 'on' ? 'Encrypted (BitLocker on)' : v === 'off' ? 'Not encrypted' : v === 'suspended' ? 'BitLocker paused'
      : v === 'network' ? 'On another PC: check its encryption yourself' : 'Encryption: cannot check';
  }
  async function safetyChecks() {
    const warn = [];
    const enc = driveEncryptionWarning();
    if (enc) warn.push(enc);
    try {
      const names = await Vault.listBackups();
      if (!names.some((x) => x.startsWith(`vault-${Vault.localDay()}`))) warn.push('Today\'s automatic backup of vault.json is missing. Open ⋮ → Vault → Backups and click Back Up Now.');
    } catch { /* drive lost: reported elsewhere */ }
    // v1.128: the full-backup reminder is a slim bar under the home page banner (backupBar), not a
    // floating message over the page; the banner's red chip still says it.
    if (MODE === 'helper' && HelperFS.sysinfo) {
      const si = await HelperFS.sysinfo();
      if (si && si.diskTotal && (si.diskFree < 2 * 1024 ** 3 || si.diskFree / si.diskTotal < 0.05)) warn.push(`The SSD is nearly full: ${fmtSize(si.diskFree)} free. Archive or move large files before it fills up.`);
    }
    if (warn.length) toast(h('span', {}, ...warn.flatMap((w, i) => [i ? h('br') : null, w])), 'error', 12000);
  }

  /* v1.156: the monthly self-check: once a month, a minute after the vault opens, the case folders on
   * the SSD are compared with the case list and each case's data files are read. Nothing is said
   * unless something is wrong. Ctrl+K → Check the Vault runs it any time. */
  function monthlyVaultCheck() {
    const last = (Vault.data.settings || {}).lastVaultCheck;
    if (last && last.at && Date.now() - new Date(last.at).getTime() < 30 * 86400000) return;
    setTimeout(async () => {
      if (!Vault.data) return;
      try {
        const r = await Vault.checkVault();
        if (r.problems.length) toast(h('span', {}, `The monthly vault check found ${plural(r.problems.length, 'problem')}. `, h('button', { type: 'button', class: 'linklike toast-link', onclick: () => vaultCheckDialog(r) }, 'See What')), 'error', 20000);
      } catch { /* drive lost: reported elsewhere */ }
    }, 60000);
  }
  async function vaultCheckDialog(result) {
    let r = result;
    if (!r) {
      const note = toast('Checking every case folder on the SSD…', 'info', 600000);
      try { r = await Vault.checkVault(); } catch (err) { note.remove(); if (FS.isDisconnectError(err)) return onDriveLost(); toast(`Not checked: ${err.message}`, 'error'); return undefined; }
      note.remove();
    }
    return openDialog((close) => h('div', { class: 'vault-check' },
      h('h2', { icon: r.problems.length ? 'exclamation-triangle-fill' : 'shield-fill-check' }, 'Check the Vault'),
      h('p', {}, `${plural(r.cases, 'case folder')} and ${plural(r.files, 'file')} checked against the case list.`),
      r.problems.length
        ? h('div', {}, h('p', { class: 'warn-text' }, `${plural(r.problems.length, 'problem')} found. Nothing was changed. Restore the case from a full backup, or ask for help with Report a Problem.`),
          h('ul', { class: 'vault-check-list' }, r.problems.map((x) => h('li', {}, h('strong', {}, x.number || x.id), ` · ${x.what}`))))
        : h('p', { class: 'ok-text' }, 'Everything matches: every case folder is in the case list, and every case file could be read.'),
      h('p', { class: 'muted small' }, 'This check runs by itself once a month.'),
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Close'))));
  }

  // v1.151: the backup screens are in js/backup-ui.js.
  function fullBackupDialog(...a) { return PARTS.backup.fullBackupDialog(...a); }
  function restoreFromBackupDialog(...a) { return PARTS.backup.restoreFromBackupDialog(...a); }
  function testRestoreDialog(...a) { return PARTS.backup.testRestoreDialog(...a); }

  function onDriveLost() {
    if (!state.connected) return;
    state.connected = false;
    quickLinksPanel(false);
    CVChatUI.reset();
    CVNotesFloat.reset();
    if (window.CVLockerUI) CVLockerUI.lock();
    // v1.153: the SSD was pulled: nothing of a case stays on the screen (open popups, the page, the
    // messages), and with a PIN set the privacy screen locks at once (the PIN opens it again).
    for (const d of document.querySelectorAll('dialog[open]')) if (d.id !== 'privacy-screen') { try { d.close(); } catch { /* already closed */ } }
    $('#main').replaceChildren();
    const toasts = $('#toasts'); if (toasts) toasts.replaceChildren();
    if (Vault.data && Vault.data.settings && Vault.data.settings.privacyPin && window.CVPrivacy) CVPrivacy.lock();
    renderNetStatus();
    Save.render();
    gateLost();
  }

  // Heartbeat: notice an unplugged drive (or a stopped helper) within a few seconds.
  setInterval(async () => {
    if (!state.connected || document.hidden) return;
    try { await Vault.ping(); } catch (err) { if (FS.isDisconnectError(err)) onDriveLost(); }
  }, 4000);

  async function launch() {
    if (MODE === 'helper') return HelperFS.servedByHelper ? connectHelper() : gateUnsupported();
    // v1.178: a folder the online copy remembered before is forgotten (see ONLINE_COPY).
    if (ONLINE_COPY) { await HandleStore.clear().catch(() => {}); return gateWelcome(); }
    const handle = await HandleStore.load();
    if (!handle) return gateWelcome();
    let perm = 'prompt';
    try { perm = await handle.queryPermission({ mode: 'readwrite' }); } catch { /* treat as prompt */ }
    if (perm !== 'granted') return gateReconnect(handle.name);
    try {
      const r = await Vault.resolve(handle);
      if (!r.found) return gateMissing('The saved folder has no vault.json.');
      await openVault(r.dir);
    } catch (err) {
      handleOpenError(err);
    }
  }


  /* =====================================================================
   * Sidebar: case list
   * ===================================================================== */

  const isArchivedEntry = (c) => c.location === 'archive';
  // v1.46: the subject and the Operation's number and name are searched too.
  // v1.90: Case History notes are searched too.
  const notesOf = (c) => (c.notes ? [c.notes] : Array.isArray(c.activity) ? c.activity.filter((a) => a.note).map((a) => a.what) : []);
  // v1.97: Subject Names read "LAST, First" in every list (the saved name is kept as typed).
  const subj = (c) => CVOperation.subjectLabel(c && c.subject);
  // v1.156: the search is read word by word (every word must match, in any order), and a few
  // words are filters: due:week (a deadline in the next 7 days), due:overdue, status:pending (or any
  // status), pinned. Saved searches under the box are these same words.
  let onCaseListDrawn = () => {};
  const SEARCH_TOKEN = /^(due|status):(.+)$|^pinned$/;
  function searchTokenOk(c, t) {
    if (t === 'pinned') return ((Vault.data.settings || {}).pinnedCases || []).includes(c.id);
    const [, k, v] = t.match(SEARCH_TOKEN);
    if (k === 'status') return String(c.status || '').toLowerCase() === v;
    const d = c.nextDeadline && c.nextDeadline.date && !isArchivedEntry(c) ? daysUntil(c.nextDeadline.date) : null;
    if (d == null) return false;
    if (v === 'overdue') return d < 0;
    if (v === 'today') return d === 0;
    if (v === 'week') return d >= 0 && d <= 7;
    if (v === 'month') return d >= 0 && d <= 31;
    return false;
  }
  const matchesSearch = (c, q) => {
    if (!q) return true;
    const text = [c.title, c.subject, subj(c), c.fileNumber, c.number, c.agencyNumber, c.client, c.status, CVOperation.opLabel(Vault.operationOf(c)), c.suspectGroup || '', ...(c.tags || []), ...notesOf(c)].join(' ').toLowerCase();
    if (text.includes(q)) return true;
    const words = q.split(/\s+/).filter(Boolean);
    return words.every((w) => (SEARCH_TOKEN.test(w) ? searchTokenOk(c, w) : text.includes(w)));
  };

  // Cases in cases/ (the archive has its own section below the list): open and pending first,
  // then closed, each most recently changed first. Typing a status in the search box finds those.
  function filteredCases() {
    const q = $('#case-search').value.trim().toLowerCase();
    const rank = (c) => (c.status === 'Closed' ? 1 : 0);
    return (Vault.data?.cases || [])
      .filter((c) => !isArchivedEntry(c))
      .filter((c) => matchesSearch(c, q))
      .sort((a, b) => rank(a) - rank(b) || (b.updated || '').localeCompare(a.updated || ''));
  }

  /** v1.157: the subject in the case list as LAST, | First | M. columns (a caption or an unknown
   * offender stays as typed, across the three). */
  function sideName(c) { return nameGrid(c.subject, subj(c) || 'No subject yet', 'cim-subject'); }
  /** v1.158: the name columns are as wide as the longest last and first name in the list (measured
   * in the font they are shown in, folded folders too), so every name fits whole and all of them line
   * up: one width for the cases, one for the Case Group folders. */
  let measureCtx = null;
  function sizeNameColumns(list) {
    measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
    for (const [sel, key] of [['.case-item-meta .cim-name', 'c'], ['.sg-name.cim-name', 'g']]) {
      const cells = list.querySelectorAll(sel);
      if (!cells.length) continue;
      const widest = (cls) => {
        let m = 0;
        for (const n of cells) {
          const el = n.querySelector(cls);
          const cs = getComputedStyle(el);
          measureCtx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
          m = Math.max(m, measureCtx.measureText(el.textContent).width);
        }
        return `${Math.ceil(m) + 2}px`;
      };
      list.style.setProperty(`--nm-last-${key}`, widest('.cim-last'));
      list.style.setProperty(`--nm-first-${key}`, widest('.cim-first'));
      list.style.setProperty(`--nm-mi-${key}`, widest('.cim-mi'));
    }
  }
  /** v1.158: a person's name as LAST, | First | M. grid cells (anything else as typed): the case
   * list and its Case Group folders line their names up the same way. */
  function nameGrid(name, shown, cls, { commaOnly = false } = {}) {
    // A Case Group's name stays as typed ("Doe Family"); only "LAST, First M" is split into columns.
    const p = name && (!commaOnly || /^[^,]+,\s*\S/.test(name)) ? CVOperation.nameParts(name) : null;
    if (!p || p.whole) return h('span', { class: `${cls} cim-whole` }, shown);
    return h('span', { class: `${cls} cim-name` },
      h('span', { class: 'cim-last' }, `${p.last},`), ' ', h('span', { class: 'cim-first' }, p.first), p.middle ? ' ' : '',
      h('span', { class: 'cim-mi', title: p.middle || '' }, p.middle ? `${p.middle[0].toUpperCase()}.` : ''));
  }

  // A case in the left list: [Open] Title [bell], then file | case | client. A red bell means a
  // deadline is overdue or due within a week; the details are in the hover box.
  function caseItem(c, inGroup = false, { dim = false } = {}) {
    const sol = solState(c);
    const due = sol ? { cls: 'overdue', text: sol === 'expired' ? 'statute of limitations expired' : 'statute of limitations expiring' }
      : c.nextDeadline && !isArchivedEntry(c) ? caseDue(c) : null;
    // Any open deadline on the case's Timeline rings the red bell (right of the title).
    // v1.28: the bell sits right after the title; a case number inside an operation leaves it to
    // the operation's name.
    const alarm = !!due && !inGroup;
    const opened = openedAge(c.opened || (c.dates && c.dates.opened));
    const tip = [
      `${c.number || 'No case number'}${c.subject ? `, ${c.subject}` : ''} · ${c.status}`,
      opened ? `Opened ${opened.long} (${opened.future ? `${opened.ageLong.toLowerCase()}: a date in the future, check it` : opened.days ? `${opened.days} day${opened.days === 1 ? '' : 's'} ago` : 'today'})` : null,
      sol ? `Statute of limitations ${sol === 'expired' ? 'expired' : 'expires'} ${fmtDate(c.sol.expires)}` : null,
      due && !sol ? `${due.cls === 'overdue' || due.cls === 'soon' ? 'Alarm: ' : 'Next deadline: '}${c.nextDeadline.title || 'Deadline'}, ${fmtDate(c.nextDeadline.date)}${c.nextDeadline.time ? ` ${c.nextDeadline.time}` : ''} (${due.text})` : null,
      c.arrested ? 'Arrest made: this case has Arrest details' : null, // v1.169: no X on a closed one
    ].filter(Boolean).join('\n');
    const li = h('li', {},
      h('a', {
        href: `#/case/${CVRoute.enc(c.id)}`,
        // v1.60: a case with a reminder (a deadline overdue or within a week) has a thin red border.
        class: `case-item st-${String(c.status).toLowerCase()} ${c.id === state.caseId ? 'active' : ''}${due ? ` has-reminder reminder-${due.cls}` : ''}${c.arrested ? ' has-arrest' : ''}${dim ? ' case-dim' : ''}`,
        'aria-current': c.id === state.caseId ? 'page' : null,
        title: tip,
      },
      // Title on the left; the status and the red bell together on the right (v1.20).
      h('div', { class: 'case-item-top' },
        // v1.46: the Case Number, with the Subject Name under it.
        h('span', { class: 'case-item-title is-number' }, dim ? h('span', { class: 'case-lock', title: 'Closed. The Mission is still going on.' }, I('lock-fill')) : null, c.number || 'No case number yet'),
        alarm ? h('span', { class: `case-bell ${due.cls}`, 'aria-label': `Deadline ${due.text}` }, I('bell-fill')) : null,
        // v1.157: a case with an arrest: a purple border and this badge.
        c.arrested ? h('span', { class: 'case-arrest-tag', 'aria-label': 'Arrest made' }, 'ARREST') : null,
        h('span', { class: 'case-item-flags' },
          h('span', { class: `case-status status-${String(c.status).toLowerCase()}` }, c.status))),
      // Just the numbers: file number | case number | client, e.g. "100 | JH123456 | State".
      // (No empty line when there are no numbers to show, v1.29. Inside an operation only the case
      // number shows, v1.32: the file number, original case and client are on the operation.)
      // v1.157: LAST, First and the middle initial in three columns, lined up from case to case.
      h('div', { class: `case-item-meta muted${c.subject ? '' : ' no-subject'}` }, sideName(c),
        !inGroup && Vault.operationOf(c) ? h('span', { class: 'cim-op' }, CVOperation.opLabel(Vault.operationOf(c))) : null),
      // v1.100: the day it was opened and how long ago, on its own line so the name is never cut off.
      opened ? h('div', { class: 'case-item-opened muted', title: `Opened ${opened.long}${opened.days ? `, ${opened.days} day${opened.days === 1 ? '' : 's'} ago` : ', today'}` },
        I('calendar-event'), h('span', { class: 'cim-opened' }, `${opened.short} · ${opened.age}`)) : null));
    li._cvArgs = [inGroup, { dim }]; // v1.132: to draw just this row again (refreshCaseList)
    return li;
  }

  /* Operations (v1.46): an Operation is a record (number, name, status, dates, notes) in vault.json;
   * a case belongs to none or one of them (case.operationId). Every case lives in General Files; an
   * Operation's Files are its linked cases. In the case list each Operation is a folder, and General
   * Files holds the cases that aren't in one. */
  const GENERAL = 'general';
  const opOf = (c) => (c ? Vault.operationOf(c) : null);
  const opLabel = (op) => CVOperation.opLabel(op);
  /** Active cases of c's Operation (c included), most recently changed first; [] when c has none.
   * c: a case, an index entry or an Operation id. */
  function operationCases(c) {
    const id = typeof c === 'string' ? c : c && c.operationId;
    return id ? (Vault.data?.cases || []).filter((x) => !isArchivedEntry(x) && x.operationId === id).sort((a, b) => (b.updated || '').localeCompare(a.updated || '')) : [];
  }
  // v1.50: the folders start folded. The one holding what's on screen (the case, the Operation, or
  // General Files) is open; one opened or folded with its arrow stays that way until you go to
  // another page. (v1.28 to v1.49 kept which were folded in vault.json.)
  try { localStorage.removeItem('casevault-op-closed'); } catch { /* nothing kept */ }
  // v1.82: a folder you open or fold stays that way until you click it again (kept on this PC).
  const SIDE_FOLD_KEY = 'cv-side-fold';
  const sideFold = new Map((() => { try { return Object.entries(JSON.parse(localStorage.getItem(SIDE_FOLD_KEY) || '{}')); } catch { return []; } })());
  const sideFoldSet = sideFold.set.bind(sideFold);
  // v1.150: a Case Group's key is its name (often a suspect's), so it is kept for this session only:
  // nothing about a case is written to the browser on the PC. Names saved by older versions are dropped.
  const keepOnPc = (k) => !String(k).startsWith('sg:');
  for (const k of [...sideFold.keys()]) if (!keepOnPc(k)) sideFold.delete(k);
  const saveFold = () => { try { localStorage.setItem(SIDE_FOLD_KEY, JSON.stringify(Object.fromEntries([...sideFold].filter(([k]) => keepOnPc(k))))); } catch { /* this session only */ } };
  saveFold();
  sideFold.set = (k, v) => { sideFoldSet(k, v); saveFold(); return sideFold; };
  let sideFoldHash = '';
  function folderOpen(group) {
    if (sideFold.has(group.key)) return sideFold.get(group.key);
    if ($('#case-search').value.trim()) return true;
    if (state.caseId && group.cases.some((c) => c.id === state.caseId)) return true;
    const opm = location.hash.match(/^#\/operation\/([^/]+)/);
    if (opm && group.op && !group.partial && group.op.id === decodeURIComponent(opm[1])) return true;
    return group.key === GENERAL && /^#\/general\b/.test(location.hash);
  }
  const byNumber = (a, b) => String(a.number || '').localeCompare(String(b.number || ''), undefined, { numeric: true });
  /** v1.165: every folder shows how many it holds, 0 and 1 too (the same rule on the home page and
   * in the case list). cls: the badge's class; what: "case", "mission", "file"… for the hover box. */
  const countBadge = (n, cls = 'op-folder-count', what = 'case') => h('span', { class: `${cls}${n ? '' : ' is-zero'}`, title: `${n} ${what}${n === 1 ? '' : 's'}` }, String(n));
  /** A folder in the case list: { key, op (null for General Files), cases }. */
  function operationGroup(group) {
    const { key, op, cases } = group;
    const label = op ? opLabel(op) : 'General Files';
    const open = folderOpen(group);
    const dueCases = cases.filter((c) => caseDue(c)); // v1.148: snoozed deadlines don't ring
    const bell = dueCases.length > 0;
    const meta = op && group.partial ? `${cases.length} closed · ongoing`
      : op ? [op.status, `${group.total} case${group.total === 1 ? '' : 's'}`].join(' · ') : group.closed ? `${cases.length} case${cases.length === 1 ? '' : 's'} closed` // v1.101: the title already says independent
        // v1.169: the open ones, as the count beside it says; the closed ones (under CLOSED) after.
        : `${cases.length} case${cases.length === 1 ? '' : 's'}${group.total > cases.length ? ` · ${group.total - cases.length} closed` : ''}`;
    const det = h('details', { class: `op-group${op ? '' : ' general-group'}${bell ? ' has-reminder' : ''}`, open },
      h('summary', { class: 'op-head', title: op && group.partial ? `${label}: the closed cases of this Mission, which is still going on. They stay in its folder in MISSIONS too.` : op ? `${label}: open the Mission` : 'GENERAL FILES: the cases not in a Mission. Click to see every case.' },
        // v1.101: INDEPENDENT CASES has no room beside its name: its bell sits on the folder's corner.
        h('span', { class: `op-folder${op ? '' : ' gf-icon'}` }, I(op ? 'op-folder' : 'folder-fill'),
          bell && !op ? h('span', { class: 'case-bell folder-bell', 'aria-label': 'Deadline' }, I('bell-fill')) : null),
        h('span', { class: 'op-text' },
          // v1.60: an Operation's number on top, its name under it.
          h('span', { class: 'op-name-row' }, h('span', { class: 'op-name' }, ...(op
            ? [h('span', { class: 'op-num' }, op.number || 'No number'), op.name ? h('span', { class: 'op-title' }, op.name) : null].filter(Boolean)
            : [h('span', { class: 'ind-name' }, 'GENERAL FILES')])), // v1.176: one name everywhere (was INDEPENDENT)
            null), // v1.146: no bell on a Mission's own folder: OPERATION CASES has it, and the case itself is red
          h('span', { class: 'op-meta muted' }, meta)),
        // v1.148: how many of its cases are due, in a red box; the hover box lists them.
        op && !group.partial && dueCases.length ? h('span', { class: 'alert-count', title: alertList(dueCases), 'aria-label': `${dueCases.length} due` }, String(dueCases.length)) : null,
        // v1.161: the count shows from one case up (it used to wait for two).
        // v1.161/1.165: the count shows from 0 up, on every folder.
        countBadge(cases.length, 'op-count'),
        // v1.83: GENERAL FILES has a + for a new case, like MISSION FILES has one for a new Mission.
        // v1.165: no + here; New Case is on the home page, in the menu and on N.
        h('span', { class: 'op-chev', 'aria-hidden': 'true' }, I('chevron-down'))),
      h('ul', { class: 'op-cases' }, cases.length ? (op ? cases.map((c) => caseItem(c, true, { dim: !group.closed && c.status === 'Closed' })) : independentItems(cases)) : [h('li', { class: 'empty muted small' }, op ? 'No cases in this Mission yet.' : 'No cases in General Files.')]));
    // A click on the folder's name opens the Operation (or General Files); the arrow folds it.
    // v1.169: the name also unfolds the folder, remembered before the page opens: the page draws
    // the list again, which used to fold it back or leave it as it was (it seemed not to open).
    det.querySelector('summary').addEventListener('click', (e) => {
      e.preventDefault();
      if (onArrow(e, e.currentTarget)) { det.open = !det.open; sideFold.set(key, det.open); return; }
      sideFold.set(key, true); det.open = true;
      const to = op ? `#/operation/${encodeURIComponent(op.id)}` : '#/general';
      if (location.hash !== to) location.hash = to;
    });
    det.addEventListener('toggle', () => {
      // A <details> drawn open fires "toggle" too: keep only a real change (v1.29).
      if (det.open === folderOpen(group)) return;
      sideFold.set(key, det.open);
    });
    return h('li', { class: 'op-item' }, det);
  }
  /** v1.148: the hover box of a red folder's count: each due case, what is due and when. */
  const alertList = (list) => list.map((c) => { const d = caseDue(c); return `${c.number || 'No case number'}: ${d.title || 'Deadline'}, ${fmtDate(d.date)} (${d.text})`; }).join('\n');
  /** v1.145: INDEPENDENT CASES: the cases in a Case Group (v1.145: suspect folder) together under its name
   * (A to Z, folded like the other folders), then the cases in none. Not a Mission: each case stays
   * on its own; the folder only keeps them together. */
  function independentItems(cases) {
    const byGroup = new Map();
    for (const c of cases) if (c.suspectGroup) byGroup.set(c.suspectGroup, [...(byGroup.get(c.suspectGroup) || []), c]);
    const folders = [...byGroup.keys()].sort((a, b) => a.localeCompare(b)).map((g) => {
      const list = byGroup.get(g);
      const key = `sg:${g}`;
      const open = sideFold.has(key) ? sideFold.get(key) : !!$('#case-search').value.trim() || list.some((c) => c.id === state.caseId) || location.hash === `#/group/${CVRoute.enc(g)}`;
      const det = h('details', { class: 'suspect-group', open },
        h('summary', { class: `sg-head${location.hash === `#/group/${CVRoute.enc(g)}` ? ' active' : ''}`, title: `${g}: a Case Group of ${plural(list.length, 'case')}, kept together (not an Operation). Click to open it; the arrow folds it.` },
          nameGrid(g, g, 'sg-name', { commaOnly: true }), h('span', { class: 'sg-icon' }, I('person-badge')),
          list.some((c) => caseDue(c)) ? h('span', { class: 'alert-count', title: alertList(list.filter((c) => caseDue(c))) }, String(list.filter((c) => caseDue(c)).length)) : null,
          h('span', { class: 'sg-count' }, String(list.length)), h('span', { class: 'op-chev', 'aria-hidden': 'true' }, I('chevron-down'))),
        h('ul', { class: 'op-cases sg-cases' }, list.map((c) => caseItem(c, true))));
      // v1.146: the name opens the group's page; the arrow folds it.
      det.querySelector('summary').addEventListener('click', (e) => {
        e.preventDefault();
        if (onArrow(e, e.currentTarget)) { det.open = !det.open; sideFold.set(key, det.open); return; }
        sideFold.set(key, true); det.open = true; // v1.169: the name unfolds it too
        if (location.hash !== `#/group/${CVRoute.enc(g)}`) location.hash = `#/group/${CVRoute.enc(g)}`;
      });
      return h('li', { class: 'sg-item' }, det);
    });
    return [...folders, ...cases.filter((c) => !c.suspectGroup).map((c) => caseItem(c, true))];
  }
  /** v1.146: a Case Group: independent cases kept together under a name you give it (a suspect's
   * name, a family, a crew...), like an Operation but not one. Each case stays on its own; the group
   * only keeps them together in INDEPENDENT CASES and on its own page. Opened from a case (Details →
   * Case Group), from General Files (New Case Group) or from the group's page (Edit Group).
   * original: the group being edited ('' for a new one); preset: case ids ticked to begin with.
   * -> the group's name ('' when it was ungrouped), or null when cancelled. */
  async function caseGroupDialog({ original = '', preset = [], suggest = '' } = {}) {
    await Save.flushAll();
    const pool = (Vault.data.cases || []).filter((c) => !isArchivedEntry(c) && !opOf(c)).sort(byNumber);
    const names = [...new Set([...Vault.suspectGroups(), ...pool.filter((c) => !CVPersonView.isClosedCase(c)).map((c) => String(c.subject || '').trim())].filter(Boolean))]; // v1.174: not a closed case's subject
    const before = original ? pool.filter((c) => c.suspectGroup === original).map((c) => c.id) : [];
    const res = await openDialog((close) => {
      const picked = new Set([...before, ...preset]);
      const nameIn = h('input', { type: 'text', maxlength: 80, value: original || suggest, list: 'cg-names', autofocus: 'true', spellcheck: 'false', placeholder: 'e.g. DOE, John or Doe Family', 'aria-label': 'Group name' });
      const q = h('input', { type: 'search', placeholder: 'Search by case number or subject', 'aria-label': 'Search cases' });
      const rows = h('div', { class: 'pick-list cg-pick', role: 'list' });
      const ok = h('button', { class: 'btn primary', type: 'submit', icon: 'person-badge' }, 'Save Group');
      const sync = () => { ok.disabled = !nameIn.value.trim() || !picked.size; };
      const draw = () => {
        const t = q.value.trim().toLowerCase();
        const list = pool.filter((c) => !t || [c.number, c.subject, subj(c), c.suspectGroup].join(' ').toLowerCase().includes(t));
        rows.replaceChildren(...(list.length ? list.map((c) => {
          const box = h('input', { type: 'checkbox', checked: picked.has(c.id) });
          box.addEventListener('change', () => { if (box.checked) picked.add(c.id); else picked.delete(c.id); sync(); });
          const elsewhere = c.suspectGroup && c.suspectGroup !== original ? `In ${c.suspectGroup}` : c.status;
          return h('label', { class: 'pick-row', role: 'listitem' }, box,
            h('span', { class: 'pick-num' }, c.number || 'No case number'), h('span', { class: 'pick-subject' }, subj(c) || 'No subject yet'),
            h('span', { class: 'pick-op muted small' }, elsewhere));
        }) : [h('p', { class: 'muted' }, t ? 'No cases match.' : 'No independent cases yet.')]));
      };
      nameIn.addEventListener('input', sync);
      q.addEventListener('input', draw);
      draw(); sync();
      return h('form', { class: 'add-existing cg-form', onsubmit: (e) => { e.preventDefault(); close({ name: nameIn.value.replace(/\s+/g, ' ').trim(), ids: [...picked] }); } },
        h('h2', { icon: 'person-badge' }, original ? 'Edit Case Group' : 'New Case Group'),
        h('p', { class: 'muted small' }, 'Cases about the same person, kept together under one name in General Files. Not a Mission: each case stays on its own. Tick the cases that belong in it.'),
        field('Group Name', nameIn),
        h('datalist', { id: 'cg-names' }, names.map((n) => h('option', { value: n }))),
        q, rows,
        h('div', { class: 'dialog-actions' },
          original ? h('button', { class: 'btn', type: 'button', icon: 'x-circle', title: 'Take every case out of this group; the cases stay as they are', onclick: () => close({ name: '', ids: [] }) }, 'Ungroup') : null,
          h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'), ok));
    });
    if (!res) return null;
    // The same name written another way ("doe, john") joins the group already there ("DOE, John").
    const same = res.name ? Vault.suspectGroups().find((g) => g !== original && CVOperation.suspectKey(g) === CVOperation.suspectKey(res.name)) : '';
    const name = res.name ? same || res.name : '';
    const keep = new Set(name ? res.ids : []);
    const changed = [];
    try {
      for (const id of keep) { await Save.track(`sg:${id}`, () => Vault.setSuspectGroup(id, name)); changed.push([id, name]); }
      for (const id of before) if (!keep.has(id)) { await Save.track(`sg:${id}`, () => Vault.setSuspectGroup(id, '')); changed.push([id, '']); }
    } catch (err) { toast(err && err.message ? err.message : 'The case group could not be saved.', 'error', 6000); }
    for (const [id, g] of changed) if (state.caseObj && state.caseObj.id === id) state.caseObj.suspectGroup = g;
    renderCaseList();
    toast(name ? `${plural(keep.size, 'case')} in the group ${name}.` : 'The group was taken apart; its cases are still in General Files.', 'success', 3500);
    return name;
  }
  /** v1.148: the Case Group Summary PDF: each case's number, subject, status, opened date, next
   * deadline and charges, with the letterhead. */
  async function groupSummary(name, list) {
    const arrests = new Map();
    const full = [];
    // v1.151: read together, not one after another.
    await Promise.all(list.map(async (c) => { arrests.set(c.id, await Vault.readCaseJSON(c.id, 'arrest.json').catch(() => null)); }));
    full.push(...list);
    await CVKit.loadScripts(['js/group-summary.js']); // v1.156: loaded on first use
    const bytes = CVGroupSummary.build(name, CVGroupSummary.rows(full, arrests), { letterhead: await CVLetterhead.forPdf().catch(() => null), printed: fmtDate(today()) });
    await openDialog((done) => h('div', { class: 'pdf-view' }, h('h2', { 'data-keep-case': 'true' }, `Case Group Summary: ${name}`), CVPdfViewer.create(bytes, { h, icon: I, title: `Case Group Summary ${name}`, fileName: `Case Group Summary ${name.replace(/[\\/:*?"<>|]+/g, ' ')}.pdf` }),
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => done() }, 'Close'))));
  }
  /** v1.146: a Case Group's page: its name, Edit Group, and its cases as cards (like an Operation's). */
  function showCaseGroup(name) {
    pageStart(name);
    const list = (Vault.data.cases || []).filter((c) => !isArchivedEntry(c) && !opOf(c) && c.suspectGroup === name).sort(byNumber);
    const edit = async () => { const n = await caseGroupDialog({ original: name }); if (n !== null) location.hash = n ? `#/group/${CVRoute.enc(n)}` : '#/general'; };
    // v1.148: the group's PDF summary, and making it an Operation when the investigation grows.
    const summary = () => groupSummary(name, list);
    const makeOp = async () => {
      if (!(await confirmDialog({ title: `Make ${name} a Mission?`, message: `A new Operation (Mission) is made with ${plural(list.length, 'case')} of this group in it, and the group is taken apart. The cases and their files stay where they are.`, confirmText: 'Make Mission' }))) return;
      const op = await operationDialog(null, { name });
      if (!op) return;
      for (const c of list) { await Save.track(`sg:${c.id}`, () => Vault.setSuspectGroup(c.id, '')).catch(() => {}); await linkCase(c.id, op.id); }
      renderCaseList();
      location.hash = `#/operation/${encodeURIComponent(op.id)}`;
    };
    $('#main').replaceChildren(h('section', { class: 'ops-page group-page' },
      h('div', { class: 'page-head' },
        h('span', { class: 'page-icon cg-icon' }, I('person-badge')),
        h('div', { class: 'page-title' }, h('h1', { 'data-keep-case': 'true' }, name), h('div', { class: 'muted small' }, `Case Group · ${plural(list.length, 'independent case')} kept together (not an Operation)`)),
        h('div', { class: 'spacer' }),
        list.length ? h('a', { class: 'btn', href: `#/case/${CVRoute.enc(list[0].id)}/timeline`, icon: 'calendar-event', title: 'The events of every case in this group on one Timeline' }, 'Timeline') : null,
        list.length ? h('button', { class: 'btn', type: 'button', icon: 'file-earmark-pdf', title: 'Every case of the group on one page, as a PDF with your letterhead', onclick: summary }, 'Summary PDF') : null,
        list.length ? h('button', { class: 'btn', type: 'button', icon: 'op-folder', title: 'Make this group a Mission with the same cases', onclick: makeOp }, 'Make Mission') : null,
        h('button', { class: 'btn primary', type: 'button', icon: 'pencil-square', title: 'Rename the group, or pick its cases', onclick: edit }, 'Edit Group')),
      list.length ? h('div', { class: 'op-open-cases cg-cases' }, list.map((c) => overviewCard(c)))
        : h('div', { class: 'empty-state' }, h('p', {}, 'No cases in this group any more.'), h('p', { class: 'muted small' }, 'Edit Group picks its cases.'))));
  }
  const fileKey = (f) => String(f || '').trim();
  const byFileNumber = (a, b) => {
    const x = fileKey(a); const y = fileKey(b);
    if (!x !== !y) return x ? -1 : 1; // no file number last
    return x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' });
  };
  // v1.101: the sidebar's order (the button by Home): case number, oldest opened first, or newest.
  const SIDE_ORDERS = [['number', 'list-ol', 'By case number'], ['oldest', 'hourglass-split', 'Oldest opened first'], ['newest', 'calendar-event', 'Newest opened first']];
  let sideOrder = (() => { try { return localStorage.getItem('cv-side-order') || 'number'; } catch { return 'number'; } })();
  const openedKey = (c) => c.opened || (c.dates && c.dates.opened) || '';
  const caseOrder = (a, b) => (sideOrder === 'oldest' ? (openedKey(a) || '9999').localeCompare(openedKey(b) || '9999')
    : sideOrder === 'newest' ? openedKey(b).localeCompare(openedKey(a)) : 0) || byNumber(a, b);
  /** The folders for these cases: each Operation (in Operation Number order) with its cases, then
   * General Files with the independent ones. Empty Operations show too, unless a search is on. */
  function opGroups(cases, { searching = false, all = (Vault.data?.cases || []).filter((c) => !isArchivedEntry(c)) } = {}) {
    const q = $('#case-search') ? $('#case-search').value.trim().toLowerCase() : '';
    const groups = [];
    const partials = [];
    for (const op of [...Vault.listOperations()].sort((a, b) => byFileNumber(a.number, b.number) || a.name.localeCompare(b.name))) {
      const total = all.filter((c) => c.operationId === op.id);
      // The Operation's own number or name matching the search shows all its cases.
      const hit = q && opLabel(op).toLowerCase().includes(q);
      // v1.84: open cases first, then the closed ones (greyed, with a lock, while the Mission goes on).
      const shut = (c) => (c.status === 'Closed' ? 1 : 0);
      const mine = (hit ? total : cases.filter((c) => c.operationId === op.id)).sort((a, b) => shut(a) - shut(b) || caseOrder(a, b));
      if (searching && q && !hit && !mine.length) continue;
      const closed = op.status === 'Closed' || (total.length > 0 && total.every((c) => c.status === 'Closed'));
      groups.push({ key: op.id, op, cases: mine, total: total.length, closed });
      // v1.50: a closed case of a Mission that is still open stays in its folder, and shows under
      // CLOSED FILES too; v1.84: there under the Mission's own name ("OP-1 Example · 1 closed").
      const shutNow = closed ? [] : mine.filter((c) => c.status === 'Closed');
      if (shutNow.length) partials.push({ key: `${op.id}:closed`, op, cases: shutNow, total: total.length, closed: true, partial: true });
    }
    groups.push(...partials);
    const loose = cases.filter((c) => !c.operationId || !Vault.getOperation(c.operationId)).sort(caseOrder);
    const looseAll = all.filter((c) => !c.operationId || !Vault.getOperation(c.operationId));
    if (loose.length || !searching || !q) {
      const open = loose.filter((c) => c.status !== 'Closed');
      const shut = loose.filter((c) => c.status === 'Closed');
      if (open.length || !shut.length) groups.push({ key: GENERAL, op: null, cases: open, total: looseAll.length, closed: false });
      if (shut.length) groups.push({ key: `${GENERAL}:closed`, op: null, cases: shut, total: looseAll.length, closed: true });
    }
    return groups;
  }
  const isClosedGroup = (g) => g.closed;

  // v1.78: MISSION FILES in the case list (v1.145: named OPERATION CASES): every open Mission folder inside it, a + for a new one.
  function missionFolder(groups) {
    const key = 'missions';
    const searching = !!$('#case-search').value.trim();
    const open = sideFold.has(key) ? sideFold.get(key) : true;
    const n = groups.filter((g) => g.op).length;
    const bell = groups.some((g) => g.cases.some((c) => caseDue(c)));
    // v1.165: no + in the case list (New Mission is on the home page, in the menu and in Ctrl+K).
    const det = h('details', { class: `op-group mission-group${bell ? ' has-reminder' : ''}`, open: open || searching },
      h('summary', { class: 'op-head', title: 'MISSIONS: click to see them all; the arrow folds the folder.' },
        h('span', { class: 'op-folder mission-icon' }, I('folder-mission')),
        h('span', { class: 'op-text' },
          h('span', { class: 'op-name-row' }, h('span', { class: 'op-name' }, 'MISSIONS')),
          h('span', { class: 'op-meta muted' }, `${n} mission${n === 1 ? '' : 's'}`)),
        // v1.160: the bell in the alert column on the right, lined up with the red counts below it.
        bell ? h('span', { class: 'case-bell alert-count alert-bell', 'aria-label': 'Deadline' }, I('bell-fill')) : null,
        countBadge(n, 'op-count', 'mission'),
        h('span', { class: 'op-chev', 'aria-hidden': 'true' }, I('chevron-down'))),
      h('ul', { class: 'mission-children' }, groups.length ? groups.map((g) => operationGroup(g)) : [h('li', { class: 'empty muted small' }, 'No Missions yet. Click + to make one.')]));
    det.querySelector('summary').addEventListener('click', (e) => {
      if (onArrow(e, e.currentTarget)) { e.preventDefault(); sideFoldHash = location.hash; sideFold.set(key, !det.open); det.open = !det.open; return; }
      e.preventDefault();
      sideFold.set(key, true); det.open = true; // v1.169: the name unfolds it too
      if (location.hash !== '#/operations') location.hash = '#/operations';
    });
    return h('li', { class: 'op-item mission-item' }, det);
  }

  /** v1.157: CLOSED in the case list, after the open folders: an OPERATION folder with the closed
   * Missions (and the closed cases of Missions still going on), and INDEPENDENT with the closed
   * cases not in a Mission. Folded until opened; a search opens it. */
  function closedFolder(groups) {
    const key = 'closed';
    const searching = !!$('#case-search').value.trim();
    const opGroupsClosed = groups.filter((g) => g.op);
    const loose = groups.filter((g) => !g.op);
    const n = groups.reduce((t, g) => t + g.cases.length, 0);
    const holds = (list) => list.some((g) => g.cases.some((c) => c.id === state.caseId));
    const open = searching || (sideFold.has(key) ? sideFold.get(key) : holds(groups));
    const opKey = 'closed-ops';
    const opOpen = searching || (sideFold.has(opKey) ? sideFold.get(opKey) : holds(opGroupsClosed));
    const opsDet = h('details', { class: 'op-group closed-ops-group', open: opOpen },
      h('summary', { class: 'op-head', title: 'The closed Missions, and the closed cases of Missions still going on' },
        h('span', { class: 'op-folder mission-icon' }, I('folder-mission')),
        h('span', { class: 'op-text' }, h('span', { class: 'op-name-row' }, h('span', { class: 'op-name' }, 'MISSIONS')),
          h('span', { class: 'op-meta muted' }, `${opGroupsClosed.length} mission${opGroupsClosed.length === 1 ? '' : 's'}`)),
        countBadge(opGroupsClosed.length, 'op-count', 'mission'),
        h('span', { class: 'op-chev', 'aria-hidden': 'true' }, I('chevron-down'))),
      h('ul', { class: 'mission-children' }, opGroupsClosed.length ? opGroupsClosed.map((g) => operationGroup(g)) : [h('li', { class: 'empty muted small' }, 'No closed Missions.')]));
    opsDet.addEventListener('toggle', () => { if (!searching) sideFold.set(opKey, opsDet.open); });
    const det = h('details', { class: 'op-group closed-group', open },
      h('summary', { class: 'op-head', title: 'CLOSED: the closed cases, by Mission and General Files. The arrow folds the folder.' },
        h('span', { class: 'op-folder closed-icon' }, I('folder-closed')),
        h('span', { class: 'op-text' }, h('span', { class: 'op-name-row' }, h('span', { class: 'op-name' }, 'CLOSED')),
          h('span', { class: 'op-meta muted' }, `${n} case${n === 1 ? '' : 's'}`)),
        // v1.161: how many cases are closed, in the same box as the other folders' counts (no icon).
        countBadge(n, 'op-count closed-count', 'closed case'),
        h('span', { class: 'op-chev', 'aria-hidden': 'true' }, I('chevron-down'))),
      h('ul', { class: 'mission-children closed-children' },
        h('li', { class: 'op-item' }, opsDet),
        ...(loose.length ? loose.map((g) => operationGroup(g)) : [h('li', { class: 'empty muted small' }, 'No closed independent cases.')])));
    det.addEventListener('toggle', () => { if (!searching) sideFold.set(key, det.open); });
    return h('li', { class: 'op-item closed-item' }, det);
  }

  /** v1.132: what the case list shows, as text: the whole list, and the same without the subject
   * names. After a save the list is drawn again only when this changed, and when only a subject
   * changed just that case's row is replaced (drawing every row after each pause in typing froze a
   * slow laptop for up to a second). */
  let sideSig = null;
  function sideSignature() {
    const q = $('#case-search').value.trim().toLowerCase();
    const row = (c, withSubject) => [c.id, c.location, c.number, withSubject ? c.subject : '', c.operationId, c.status, c.opened, c.nextDeadline, c.sol, c.arrested,
      q ? [c.title, c.fileNumber, c.agencyNumber, c.client, c.tags, c.notes] : null];
    const rest = [q, sideOrder, today(), [...sideFold], Vault.listOperations().map((o) => [o.id, o.number, o.name, o.status]), pinnedIds()];
    const ctx = [state.caseId, location.hash, ...rest];
    const cases = Vault.data.cases;
    const rows = cases.map((c) => row(c, true));
    // v1.165: data is everything but where you are (the open case and the page), for navCaseList().
    return { all: JSON.stringify([ctx, rows]), shape: JSON.stringify([ctx, cases.map((c) => row(c, false))]),
      data: JSON.stringify([rest, rows]), caseId: state.caseId, hash: location.hash,
      subjects: new Map(cases.map((c) => [c.id, c.subject])) };
  }
  /** v1.165: after moving to a case or one of its tabs. When only the place changed (not the cases),
   * the list isn't drawn again: a tab of the same case changes nothing in it, and another case whose
   * row is already on screen just takes the highlight. Anything else draws it again. */
  function navCaseList() {
    if (!Vault.data || !sideSig) return renderCaseList();
    const now = sideSignature();
    const isCasePage = (hash) => /^#\/case\//.test(hash || '');
    if (now.data !== sideSig.data || !isCasePage(now.hash) || !isCasePage(sideSig.hash)) return renderCaseList();
    if (now.caseId !== sideSig.caseId) {
      const list = $('#case-list');
      const href = `#/case/${CVRoute.enc(now.caseId)}`;
      const el = [...list.querySelectorAll('a.case-item')].find((a) => a.getAttribute('href') === href);
      if (!el || !el.getClientRects().length || [...list.querySelectorAll('details')].some((d) => !d.open && d.contains(el))) return renderCaseList();
      for (const a of list.querySelectorAll('a.case-item.active')) { a.classList.remove('active'); a.removeAttribute('aria-current'); }
      for (const a of list.querySelectorAll('a.case-item')) if (a.getAttribute('href') === href) { a.classList.add('active'); a.setAttribute('aria-current', 'page'); }
    }
    sideSig = now;
    return undefined;
  }
  /** Redraws the case list unless nothing in it changed (see sideSignature). */
  function refreshCaseList() {
    if (!Vault.data || !sideSig) return renderCaseList();
    const now = sideSignature();
    if (now.all === sideSig.all) return undefined;
    if (now.shape !== sideSig.shape) return renderCaseList();
    for (const c of Vault.data.cases) {
      if (now.subjects.get(c.id) === sideSig.subjects.get(c.id)) continue;
      for (const a of document.querySelectorAll('#case-list a.case-item')) {
        if (a.getAttribute('href') !== `#/case/${CVRoute.enc(c.id)}`) continue;
        const li = a.closest('li');
        if (li && li._cvArgs) li.replaceWith(caseItem(c, ...li._cvArgs));
      }
    }
    sizeNameColumns($('#case-list')); // v1.158: a longer name widens the columns for all
    sideSig = now;
    return undefined;
  }

  function renderCaseList() {
    const list = $('#case-list');
    sideSig = null;
    if (!Vault.data) { list.replaceChildren(); return; }
    drawRailRecent(); // v1.156
    sideSig = sideSignature();
    const cases = filteredCases();
    const activeCount = Vault.data.cases.filter((c) => !isArchivedEntry(c)).length;
    const searching = !!$('#case-search').value.trim();
    const groups = opGroups(cases, { searching });
    // An empty General Files folder shows only when there is nothing else to show.
    const openGroups = groups.filter((g) => !isClosedGroup(g) && !(g.key === GENERAL && !g.cases.length && groups.some((x) => x !== g && !isClosedGroup(x))));
    const closedGroups = groups.filter(isClosedGroup);
    // v1.78: the Missions sit inside one MISSION FILES folder, like GENERAL FILES, with New Mission.
    const missionGroups = openGroups.filter((g) => g.op);
    const otherGroups = openGroups.filter((g) => !g.op);
    // v1.153: pinned cases (the pin on the home page) at the top, besides their place below.
    const pinned = searching ? [] : pinnedIds().map((id) => Vault.data.cases.find((c) => c.id === id)).filter((c) => c && !isArchivedEntry(c));
    const pinBox = pinned.length ? h('li', { class: 'side-pinned' },
      h('div', { class: 'side-found-head muted small side-pinned-head' }, 'Pinned', I('pin-angle')),
      h('ul', { class: 'side-pinned-list' }, pinned.map((c) => caseItem(c)))) : null;
    list.replaceChildren(...(pinBox ? [pinBox] : []), missionFolder(missionGroups), ...(otherGroups.length ? otherGroups.map((g) => operationGroup(g)) : missionGroups.length ? [] : [h('li', { class: 'empty muted' },
      closedGroups.length ? 'Every Mission is closed.' : activeCount ? 'No cases match.' : Vault.data.cases.length ? 'No active cases.' : 'No cases yet. Click "New case".')]));
    // v1.157: CLOSED (Operation and Independent) under the open folders. A search also finds the
    // archived cases: they are listed under the rest.
    if (closedGroups.length) list.append(closedFolder(closedGroups));
    sizeNameColumns(list);
    alignFolderHeads(list);
    const q = $('#case-search').value.trim().toLowerCase();
    if (q) {
      const archived = Vault.data.cases.filter(isArchivedEntry).filter((c) => matchesSearch(c, q));
      if (archived.length) list.append(h('li', { class: 'side-found-head muted small' }, 'Archived'), ...archived.map(caseItem));
    }
    onCaseListDrawn();
  }

  /* v1.169: the counts and arrows of every folder heading in one column, at the same distance from
   * the case list's right edge however deep the folder sits (CLOSED › OPERATION › a Mission): a
   * folder inside another loses its parent's padding and border, which the CSS only made up for
   * one level down. Each heading's right padding is set so its arrow ends where a top folder's does. */
  function alignFolderHeads(list) {
    const heads = [...list.querySelectorAll('details > summary')].filter((sm) => sm.querySelector(':scope > .op-chev') && sm.getClientRects().length);
    if (!heads.length) return;
    for (const sm of heads) sm.style.paddingRight = '';
    const chevRight = (sm) => sm.querySelector(':scope > .op-chev').getBoundingClientRect().right;
    const top = heads.filter((sm) => sm.closest('li').parentElement === list);
    const target = top.length ? Math.max(...top.map(chevRight)) : Math.max(...heads.map(chevRight));
    for (const sm of heads) {
      const off = Math.round(target - chevRight(sm));
      if (!off) continue;
      const pr = parseFloat(getComputedStyle(sm).paddingRight) || 0;
      sm.style.paddingRight = `${Math.max(0, pr - off)}px`;
    }
  }
  // A folder opened shows headings that weren't measured (hidden); the list's width can change too.
  $('#case-list').addEventListener('toggle', () => alignFolderHeads($('#case-list')), true);
  if (typeof ResizeObserver === 'function') new ResizeObserver(debounce(() => alignFolderHeads($('#case-list')), 80)).observe($('#case-list'));
  /** v1.169: a click on the arrow, or anywhere right of it to the heading's edge, folds the folder
   * (the arrow alone was a 12-pixel target; a click just beside it opened the page instead). */
  const onArrow = (e, sm) => { const ch = sm.querySelector(':scope > .op-chev'); return !!(e.target.closest('.op-chev') || (ch && e.clientX >= ch.getBoundingClientRect().left - 4)); };

  $('#case-search').addEventListener('input', debounce(renderCaseList, 120));
  /* =====================================================================
   * Routing: #/  or  #/case/<id>/<tab>
   * ===================================================================== */

  function go(caseId, tab, sub) {
    location.hash = caseId ? `#/case/${CVRoute.enc(caseId)}/${tab || 'details'}${sub ? `/${CVRoute.enc(sub)}` : ''}` : '#/';
  }

  function route() {
    if (!state.connected) return;
    // v1.91: the online page is gone; old #/online links open the overview.
    if (/^#\/online\b/.test(location.hash)) history.replaceState(null, '', '#/');
    // Old #/chat links open the floating Ask AI box over the overview.
    if (/^#\/chat\b/.test(location.hash)) { history.replaceState(null, '', '#/'); CVChatUI.toggle(true); }
    const ref = location.hash.match(/^#\/reference(?:\/([\w-]+))?/);
    if (ref) return showReference(ref[1] || null);
    // v1.46: Operations and General Files.
    if (/^#\/operations\b/.test(location.hash)) return showOperations();
    const opm = location.hash.match(/^#\/operation\/([^/]+)/);
    if (opm) return showOperation(decodeURIComponent(opm[1]));
    if (/^#\/general\b/.test(location.hash)) return showGeneralFiles();
    if (/^#\/narrative\b/.test(location.hash)) return showNarrativeHelper(); // v1.186
    // v1.146: a Case Group of independent cases.
    const grp = location.hash.match(/^#\/group\/([^/]+)/);
    if (grp) {
      const name = CVRoute.dec(grp[1]);
      if (name !== null && !CVRoute.isScrambled(grp[1]) && CVRoute.active) { history.replaceState(null, '', `#/group/${CVRoute.enc(name)}`); }
      return showCaseGroup(name || '');
    }
    // v1.111: Other Files → Secure Locker.
    if (/^#\/locker\b/.test(location.hash)) { pageStart('Secure Locker'); return CVLockerUI.show($('#main')); }
    const m = location.hash.match(/^#\/case\/([^/]+)(?:\/(\w+))?(?:\/([^/]+))?/);
    if (m) {
      // v1.151: scrambled parts are read back; an old plain address is rewritten in place (no new history entry).
      const id = CVRoute.dec(m[1]);
      const subText = m[3] ? CVRoute.dec(m[3]) : null;
      if (id === null) { history.replaceState(null, '', '#/'); return route(); }
      if (CVRoute.active && (!CVRoute.isScrambled(m[1]) || (m[3] && !CVRoute.isScrambled(m[3]) && m[3] !== '.notes'))) {
        history.replaceState(null, '', `#/case/${CVRoute.enc(id)}/${m[2] || 'details'}${m[3] ? `/${m[3] === '.notes' ? m[3] : CVRoute.enc(subText)}` : ''}`);
      }
      showCase(id, m[2] || 'details', subText === null ? null : (m[3] === '.notes' ? '.notes' : encodeURIComponent(subText)));
    }
    else showDashboard();
  }

  window.addEventListener('hashchange', () => { Save.flushAll(); route(); });

  function showReference(section) {
    state.caseId = null;
    state.caseObj = null;
    renderCaseList();
    CVReferenceUI.render($('#main'), section).catch((err) => {
      if (FS.isDisconnectError(err)) return onDriveLost();
      console.error(err);
      toast(`Could not open the reference: ${err.message}`, 'error');
    });
  }

  // The header's Offline badge (v1.91: CaseVault never goes online, so it only says so).
  function renderNetStatus() {
    const el = $('#net-status');
    if (!state.connected) { el.hidden = true; return; }
    el.hidden = false;
    el.className = 'net-status off';
    el.replaceChildren(I('shield-lock-fill'), 'Offline');
    el.title = 'Offline: CaseVault never connects to the internet. It only talks to the AI engine on this PC.';
  }

  /* =====================================================================
   * Dashboard
   * ===================================================================== */

  /* v1.68: a folder not tied to a case number: OTHER FILES (key 'other') or an Operation's own
   * folder (key 'op-<id>', with Subpoenas, Affidavits, Operation Plans, Maps, Subject Data and
   * Vehicle List). Files are kept as they are named, in CaseVault-Data\\shared. */
  const sharedOpen = {};
  // v1.78: Missions (they were Operations): the folder on the SSD keeps its name, it shows as Mission Plans.
  const opFolderLabel = (n) => (n === 'Operation Plans' ? 'Mission Plans' : n);
  const OP_FOLDER_DESC = { Subpoenas: 'Served and returned', Affidavits: 'Search warrant affidavits', 'Operation Plans': 'Ops plans and briefings', Maps: 'Maps and aerials', 'Subject Data': 'Demographics and photo per subject', 'Vehicle List': 'Vehicles, owners and photos', Other: 'Anything else for the Mission' };
  const SHARED_ICONS = { 'USPIS Files': 'badge-uspis', 'DEA Files': 'badge-dea', 'INET Files': 'globe2', Training: 'book', Other: 'folder-other', Subpoenas: 'file-earmark-ruled', Affidavits: 'pencil-square', 'Operation Plans': 'card-checklist', Maps: 'map', 'Subject Data': 'person-vcard', 'Vehicle List': 'car-front' };
  // v1.71: folders are names, or { name, label, desc, custom }; getFolders() reads them each time
  // (Other Files: the built-in folders and the ones you make; New Folder adds one).
  /** v1.73: an Operation's Vehicle List: one card per vehicle with the Draft's vehicle fields
   * (Registered Owner and Address too) and, on the right, a photo of the vehicle. Kept in the
   * folder (.vehicles.json); photos are files in the same folder. */
  function opVehiclesPanel(opId) {
    return opCardsPanel(opId, { folder: 'Vehicle List', noun: 'Vehicle', icon: 'car-front', fields: CVReportFields.LISTS.vehicles.fields,
      summary: (v) => [v.year, v.make, v.model, v.color].filter(Boolean).join(' '), photoAlt: (v) => `Photo of vehicle ${v.plate || ''}`.trim(),
      read: () => Vault.readOpVehicles(opId), write: (snap) => Vault.saveOpVehicles(opId, snap) });
  }
  // v1.80: Subject Data: a demographics sheet per subject, with a photo on the right; as many
  // subjects as the Mission has.
  const SUBJECT_FIELDS = (() => {
    const P = Object.fromEntries((CVReportFields.SUSPECT_INFO || []).map((f) => [f[0], f]));
    const pick = (k, fb) => P[k] || fb;
    return [['name', 'Name', 'text'], ['alias', 'Alias / Moniker', 'text'], ['dob', 'Date of Birth', 'date'],
      ...['gender', 'identity', 'race', 'complexion', 'height', 'weight', 'hair', 'hairStyle', 'eyes', 'veteran'].map((k) => pick(k, [k, k, 'text'])),
      ['phone', 'Phone Number', 'text'], ...['irNumber', 'fbiNumber', 'idocNumber'].map((k) => pick(k, [k, k, 'text'])),
      ['address', 'Address', 'wide'], ['marks', 'Tattoos / Scars', 'wide'], ['notes', 'Notes', 'wide']];
  })();
  // v1.81: the people already written up in the Mission's cases: Details suspects and Draft
  // offenders, one per name (an offender's details fill what the suspect lacks).
  async function missionPeople(opId) {
    const keyOf = (n) => String(n || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const out = new Map();
    const put = (p, where) => {
      const k = keyOf(p.name);
      if (!k || k === 'unknown offender') return;
      const cur = out.get(k) || { name: String(p.name).trim(), from: [] };
      for (const [f, v] of Object.entries(p)) if (f !== 'from' && String(v || '').trim() && !String(cur[f] || '').trim()) cur[f] = String(v).trim();
      if (!cur.from.includes(where)) cur.from.push(where);
      out.set(k, cur);
    };
    // v1.174: a closed case's people are not suggested.
    for (const e of (Vault.data.cases || []).filter((x) => x.operationId === opId && !isArchivedEntry(x) && !CVPersonView.isClosedCase(x))) {
      try {
        const c = await Vault.getCase(e.id);
        for (const s of (c && c.suspects) || []) {
          if (s.notIdentified) continue;
          const i = s.info || {};
          put({ name: s.name, dob: s.dob, alias: i.moniker, phone: i.phone, ...Object.fromEntries(['gender', 'identity', 'race', 'complexion', 'height', 'weight', 'hair', 'hairStyle', 'eyes', 'veteran', 'irNumber', 'fbiNumber', 'idocNumber', 'marks'].map((k) => [k, i[k]])) }, `Suspect, ${e.number || 'case'}`);
        }
      } catch (err) { if (FS.isDisconnectError(err)) throw err; }
      try {
        const d = await Vault.readCaseJSON(e.id, 'report-fields.json');
        for (const o of (d && Array.isArray(d.offendersList) ? d.offendersList : [])) {
          if (o.unknown) continue;
          const socials = Array.isArray(o.socials) ? o.socials.map((x) => x && x.name).filter(Boolean).join(', ') : '';
          const phones = Array.isArray(o.phones) ? o.phones.filter(Boolean).join(', ') : '';
          put({ name: o.name, dob: o.dob, alias: socials, phone: phones, address: o.address, ...Object.fromEntries(['gender', 'identity', 'race', 'complexion', 'height', 'weight', 'hair', 'hairStyle', 'eyes', 'veteran', 'irNumber', 'fbiNumber', 'idocNumber', 'marks'].map((k) => [k, o[k]])) }, `Offender, ${e.number || 'case'}`);
        }
      } catch (err) { if (FS.isDisconnectError(err)) throw err; }
    }
    return [...out.values()];
  }
  function opSubjectsPanel(opId) {
    return opCardsPanel(opId, { folder: 'Subject Data', noun: 'Subject', icon: 'person-plus', fields: SUBJECT_FIELDS, suggest: () => missionPeople(opId),
      summary: (v) => [v.name, v.dob ? `DOB ${fmtDate(v.dob)}` : ''].filter(Boolean).join(' · '), photoAlt: (v) => `Photo of ${v.name || 'the subject'}`,
      read: () => Vault.readOpList(opId, 'Subject Data', '.subjects.json'), write: (snap) => Vault.saveOpList(opId, 'Subject Data', '.subjects.json', snap) });
  }
  /** v1.73 (v1.80: shared by Vehicle List and Subject Data): one card per entry with its fields on
   * the left and a photo on the right. Kept in the folder as a hidden .json; photos are files there. */
  function opCardsPanel(opId, { folder, noun, icon, fields, summary, photoAlt, read, write, suggest = null }) {
    const key = `op-${opId}`;
    const box = h('div', { class: `op-vehicles op-cards-${noun.toLowerCase()}` });
    let list = [];
    const save = debounce(() => { const snap = structuredClone(list); Save.track(`op-${noun.toLowerCase()}s:${opId}`, () => write(snap)).catch(() => {}); }, 500);
    const photoBox = (v) => {
      const pick = h('input', { type: 'file', accept: 'image/*', hidden: true });
      const wrap = h('div', { class: 'op-veh-photo' });
      const show = async () => {
        if (!v.photo) { wrap.replaceChildren(h('button', { type: 'button', class: 'op-veh-photo-add', title: `Add a photo of this ${noun.toLowerCase()}`, onclick: () => pick.click() }, I('camera-fill'), h('span', {}, 'Add Photo')), pick); return; }
        const img = h('img', { alt: photoAlt(v) });
        try { const f = await Vault.readShared(key, folder, v.photo); if (f) { img.src = URL.createObjectURL(f); img.addEventListener('load', () => URL.revokeObjectURL(img.src), { once: true }); } } catch { img.alt = 'Photo not found'; }
        wrap.replaceChildren(h('button', { type: 'button', class: 'op-veh-photo-img', title: 'View', onclick: () => previewFile({ readFile: () => Vault.readShared(key, folder, v.photo), where: `${key}\\${folder}` }, v.photo) }, img),
          h('div', { class: 'op-veh-photo-acts' }, h('button', { type: 'button', class: 'btn small ghost', onclick: () => pick.click() }, 'Replace'), h('button', { type: 'button', class: 'btn small ghost', onclick: () => { v.photo = ''; save(); show(); } }, 'Remove')), pick);
      };
      pick.addEventListener('change', async () => {
        const f = pick.files[0]; pick.value = '';
        if (!f) return;
        try { v.photo = await Save.track(`shared:${key}`, () => Vault.addShared(key, folder, f)); save(); show(); } catch (err) { if (FS.isDisconnectError(err)) onDriveLost(); }
      });
      show();
      return wrap;
    };
    const draw = () => {
      box.replaceChildren(
        ...(list.length ? list.map((v, i) => {
          const inputs = fields.map(([k, label, kind, opts]) => {
            let el;
            if (kind === 'select') el = h('select', { 'aria-label': `${noun} ${i + 1} ${label}` }, opts.map((o) => h('option', { value: o, selected: o === (v[k] || '') }, o || '—')));
            else el = h('input', { type: kind === 'date' ? 'date' : 'text', value: v[k] || '', autocomplete: 'off', 'aria-label': `${noun} ${i + 1} ${label}`, placeholder: kind === 'height' ? '5 ft 10 in' : kind === 'weight' ? '160 Pounds' : null });
            el.addEventListener(kind === 'select' ? 'change' : 'input', () => { v[k] = el.value; save(); });
            // v1.81: a subject's name suggests the suspects and offenders already in the Mission's
            // reports; picking one fills the boxes that are still empty.
            if (suggest && k === 'name' && window.CVCombo) {
              const box2 = CVCombo.attach(el, { items: () => people.map((p) => ({ value: p.name, label: p.name, hint: p.from.join('; ') })), onPick: (it) => {
                const p = people.find((x) => x.name === it.value);
                if (p) { for (const [f] of fields) if (p[f] && !String(v[f] || '').trim()) v[f] = p[f]; save(); draw(); }
              } });
              return field(label, box2, '');
            }
            return field(label, el, kind === 'wide' ? 'op-veh-wide' : '');
          });
          return h('div', { class: 'op-veh-card' },
            h('div', { class: 'op-veh-head' }, h('strong', {}, `${noun} ${i + 1}`), h('span', { class: 'muted small' }, summary(v) || ''), h('div', { class: 'spacer' }),
              h('button', { type: 'button', class: 'icon-btn danger-icon', title: `Remove this ${noun.toLowerCase()}`, onclick: async () => {
                if (!(await confirmDialog({ title: `Remove ${noun} ${i + 1}?`, message: `Its details are removed from ${folder}. A photo stays in the folder.`, confirmText: 'Remove', danger: true }))) return;
                list.splice(i, 1); save(); draw();
              } }, I('trash3'), h('span', { class: 'sr-only' }, `Remove ${noun.toLowerCase()}`))),
            h('div', { class: 'op-veh-body' }, h('div', { class: 'op-veh-fields' }, ...inputs), photoBox(v)));
        }) : [h('p', { class: 'muted small' }, `No ${noun.toLowerCase()}s yet.`)]),
        h('div', { class: 'op-veh-foot' }, h('button', { type: 'button', class: 'btn small', icon, onclick: () => { list.push({ id: Vault.newId(noun[0].toLowerCase()) }); save(); draw(); const last = box.querySelectorAll('.op-veh-card'); if (last.length) last[last.length - 1].querySelector('input').focus(); } }, `Add ${noun}`),
          // v1.81: every suspect and offender of the Mission's reports not on the sheet yet, filled in.
          suggest ? h('button', { type: 'button', class: 'btn small', icon: 'people', title: 'Add every suspect (Details) and offender (Draft) of this Mission\'s cases that is not on this sheet yet', onclick: async () => {
            people = await suggest().catch(() => people);
            const have = new Set(list.map((x) => String(x.name || '').trim().toLowerCase()));
            const add = people.filter((p) => !have.has(p.name.toLowerCase()));
            if (!add.length) { toast('Everyone in the reports is already on this sheet.', 'info'); return; }
            for (const p of add) list.push({ id: Vault.newId('s'), ...Object.fromEntries(fields.map(([f]) => [f, p[f] || '']).filter(([, x]) => x)) });
            save(); draw(); toast(`${add.length} added from the reports.`, 'success');
          } }, 'Add From Reports') : ''));
    };
    let people = [];
    if (suggest) suggest().then((p) => { people = p; }).catch(() => {});
    read().then((v) => { list = v; draw(); }).catch((err) => { if (FS.isDisconnectError(err)) onDriveLost(); });
    return box;
  }

  // v1.72: tiles: the folders as folder icons, like Operations and General Files; a click opens
  // one (its files show under the icons), another click closes it.
  const shortDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; };
  /** v1.140: the home page with Other Files → Training open, scrolled to it. */
  function openTraining() {
    sharedOpen.other = 'Training';
    if (location.hash !== '#/' && location.hash !== '') { location.hash = '#/'; } else showDashboard();
    let tries = 0;
    const go = () => { const sec = document.querySelector('.other-files-section'); if (sec) sec.scrollIntoView({ block: 'start', behavior: 'smooth' }); else if (++tries < 20) setTimeout(go, 100); };
    setTimeout(go, 150);
  }
  /* v1.140: a certificate's details: course, who gave it, date completed, hours, expiry date. */
  async function editCertificate(file, meta, redraw) {
    const d = CVTraining.normalize(meta[file]);
    const f = {
      course: h('input', { maxlength: 200, autocomplete: 'off', value: d.course, placeholder: file.replace(/\.[^.]+$/, ''), 'aria-label': 'Course' }),
      provider: h('input', { maxlength: 200, autocomplete: 'off', value: d.provider, placeholder: 'Example Police Academy', 'aria-label': 'Given By' }),
      date: h('input', { type: 'date', value: d.date, 'aria-label': 'Date Completed' }),
      hours: h('input', { inputmode: 'decimal', maxlength: 8, autocomplete: 'off', value: d.hours, placeholder: '40', 'aria-label': 'Hours' }),
      expires: h('input', { type: 'date', value: d.expires, 'aria-label': 'Expires' }),
      // v1.165: a group keeps similar certificates together on the cards (CPR, Firearms…).
      group: h('input', { maxlength: 60, autocomplete: 'off', value: d.group || '', placeholder: 'CPR, Firearms, Narcotics…', 'aria-label': 'Group', list: 'cert-group-names' }),
    };
    const groupList = h('datalist', { id: 'cert-group-names' }, CVTraining.groupNames(meta).map((g) => h('option', { value: g })));
    const ok = await openDialog((close) => h('form', { class: 'dialog-form cert-form', onsubmit: (e) => { e.preventDefault(); close(true); } },
      h('h2', { icon: 'pencil-square' }, 'Certificate Details'),
      h('p', { class: 'muted small' }, file),
      field('Course', f.course), field('Given By', f.provider), field('Group', f.group, '', 'Certificates with the same group are shown together. Leave it empty for none.'), groupList,
      h('div', { class: 'cert-form-row' }, field('Date Completed', f.date), field('Hours', f.hours), field('Expires', f.expires)),
      h('p', { class: 'muted small' }, 'Leave Expires empty when the certificate does not expire. Needs Attention reminds you 90 and 30 days before.'),
      CVKit.cancelRow(h, () => close(false), h('button', { class: 'btn primary', type: 'submit' }, 'Save'))));
    if (!ok) return;
    const next = CVTraining.normalize({ course: f.course.value, provider: f.provider.value, date: f.date.value, hours: f.hours.value, expires: f.expires.value, group: f.group.value });
    try {
      const all = await Vault.readTraining();
      if (Object.values(next).some(Boolean)) all[file] = next; else delete all[file];
      await Save.track('shared:training', () => Vault.saveTraining(all));
      toast('Certificate details saved.', 'success', 2500);
    } catch (err) { if (FS.isDisconnectError(err)) return onDriveLost(); toast(`Not saved: ${err.message}`, 'error'); }
    redraw();
  }
  /* v1.140: the Training Record PDF: the courses with dates and hours, total hours, then each
   * certificate's pages. */
  async function trainingRecord() {
    const rows = await Vault.trainingRows().catch(() => []);
    if (!rows.length) { toast('Add your certificates to Other Files → Training first.', 'info'); return; }
    const attach = h('input', { type: 'checkbox', checked: true });
    const go = await openDialog((close) => h('form', { class: 'dialog-form', onsubmit: (e) => { e.preventDefault(); close(true); } },
      h('h2', { icon: 'file-earmark-pdf' }, 'Training Record'),
      h('p', {}, `${rows.length} certificate${rows.length === 1 ? '' : 's'}${CVTraining.totalHours(rows) ? `, ${CVTraining.totalHours(rows)} hours in total` : ''}.`),
      h('label', { class: 'check' }, attach, ' Add the certificates after the list'),
      CVKit.cancelRow(h, () => close(false), h('button', { class: 'btn primary', type: 'submit', icon: 'printer' }, 'Make PDF'))));
    if (!go) return;
    const attachments = [];
    if (attach.checked) {
      toast('Adding the certificates…', 'info', 2500);
      for (const r of rows) {
        try {
          const file = await Vault.readShared('other', 'Training', r.file);
          for (const [k, pg] of (await certJpegs(file, r.file)).entries()) attachments.push({ ...pg, caption: `${r.course}${pg.of > 1 ? ` (page ${k + 1} of ${pg.of})` : ''}` });
        } catch (err) { if (FS.isDisconnectError(err)) return onDriveLost(); }
      }
    }
    const affiant = (Vault.data.settings && Vault.data.settings.affiant) || {};
    const bytes = CVTraining.build(rows, { letterhead: await CVLetterhead.forPdf().catch(() => null), printed: fmtDate(today()), today: today(), name: [affiant.name, affiant.title].filter(Boolean).join(', '), attachments });
    await openDialog((done) => h('div', { class: 'pdf-view' }, h('h2', {}, 'Training Record'), CVPdfViewer.create(bytes, { h, icon: I, title: 'Training Record', fileName: 'Training Record.pdf' }),
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => done() }, 'Close'))));
  }
  /** A certificate's pages as JPEGs (a photo is one page), at most 1600 px. */
  async function certJpegs(file, name) {
    const jpegOf = async (cv) => new Uint8Array(await (await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.88))).arrayBuffer());
    const canvasOf = (w, hh) => Object.assign(document.createElement('canvas'), { width: Math.ceil(w), height: Math.ceil(hh) });
    if (/\.pdf$/i.test(name)) {
      const lib = await CVExtract.loadPdfjs();
      const task = CVExtract.openPdf(lib, new Uint8Array(await file.arrayBuffer()));
      try {
        const doc = await task.promise; const out = [];
        for (let n = 1; n <= Math.min(doc.numPages, 10); n++) {
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: Math.min(2.5, 1600 / Math.max(base.width, base.height)) });
          const cv = canvasOf(vp.width, vp.height); const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
          await page.render({ canvasContext: g, viewport: vp }).promise; page.cleanup();
          out.push({ jpeg: await jpegOf(cv), w: cv.width, h: cv.height, of: doc.numPages });
        }
        return out;
      } finally { await task.destroy(); }
    }
    if (!/\.(png|jpe?g|gif|webp|bmp)$/i.test(name)) return [];
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const cv = canvasOf(bmp.width * k, bmp.height * k); const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(bmp, 0, 0, cv.width, cv.height);
    return [{ jpeg: await jpegOf(cv), w: cv.width, h: cv.height, of: 1 }];
  }

  /* v1.141: Cards or List for each folder, kept on this PC (a display choice, no case data). */
  const VIEW_KEY = 'cv-folder-view';
  function folderView(key, folder) {
    let m = {};
    try { m = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}') || {}; } catch { /* private window */ }
    const v = m[`${key}|${folder || ''}`];
    return v === 'cards' || v === 'list' ? v : key === 'other' && folder === 'Training' ? 'cards' : 'list';
  }
  function setFolderView(key, folder, v) {
    try { const m = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}') || {}; m[`${key}|${folder || ''}`] = v; localStorage.setItem(VIEW_KEY, JSON.stringify(m)); } catch { /* private window */ }
  }
  /* v1.139: the picture on a certificate card: the first page of a PDF, or the photo itself. Made in
   * memory only (nothing written to the PC), kept while CaseVault is open, and redrawn when the file
   * changes. */
  const thumbCache = new Map();
  /* v1.165: a card's picture is made only when the card comes on screen (a folder of 40 certificates
   * no longer reads and draws 40 PDFs at once), and a made picture is kept on the SSD (.thumbs), so
   * the next start shows it straight away. */
  const thumbWatch = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { thumbWatch.unobserve(e.target); const go = e.target.cvThumb; delete e.target.cvThumb; if (go) go(); }
  }, { rootMargin: '300px' }) : null;
  const thumbName = (f) => `${String(f.base).replace(/[^\w.-]+/g, '_').slice(0, 80)}~${f.size}-${Math.round(f.modified || 0)}.png`;
  function sharedThumb(reader, f, img) {
    const kind = /\.pdf$/i.test(f.base) ? 'pdf' : /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.base) ? 'img' : '';
    if (!kind) return;
    const id = `${reader.where}|${f.base}|${f.size}|${f.modified}`;
    const load = () => {
      if (!thumbCache.has(id)) {
        thumbCache.set(id, (async () => {
          if (kind === 'img') return URL.createObjectURL(await reader.readFile(f.base));
          const saved = reader.thumbs ? await reader.thumbs.read(thumbName(f)).catch(() => null) : null;
          if (saved) return URL.createObjectURL(saved);
          const file = await reader.readFile(f.base);
          const lib = await CVExtract.loadPdfjs();
          const task = CVExtract.openPdf(lib, new Uint8Array(await file.arrayBuffer()));
          try {
            const page = await (await task.promise).getPage(1);
            const base = page.getViewport({ scale: 1 });
            const vp = page.getViewport({ scale: Math.min(2, 480 / Math.max(base.width, base.height)) });
            const cv = Object.assign(document.createElement('canvas'), { width: Math.ceil(vp.width), height: Math.ceil(vp.height) });
            const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
            await page.render({ canvasContext: g, viewport: vp }).promise;
            page.cleanup();
            const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
            if (reader.thumbs && blob) reader.thumbs.save(thumbName(f), blob).catch(() => {}); // next time from the SSD
            return URL.createObjectURL(blob);
          } finally { await task.destroy(); }
        })().catch(() => { thumbCache.delete(id); return ''; }));
      }
      thumbCache.get(id).then((url) => { if (!url) return; img.src = url; img.hidden = false; img.closest('.cert-art')?.classList.add('has-thumb'); });
    };
    // Drawn now if already made in this session; otherwise when its card is near the screen.
    const box = img.parentElement || img;
    if (thumbCache.has(id) || !thumbWatch) load();
    else { box.cvThumb = load; thumbWatch.observe(box); }
  }

  function sharedFilesBox(key, { folders: fixed = [], getFolders = null, allowNew = false, newTile = true, tiles = false, tileIcon = 'folder2-open', empty = 'No files yet.' } = {}) {
    const box = h('div', { class: `shared-files${tiles ? ' shared-tiles' : ''}`, 'data-key': key });
    const norm = (f) => (typeof f === 'string' ? { name: f, label: f } : { ...f, label: f.label || f.name });
    let folders = fixed.map(norm);
    let vehEl = null;
    let arranging = false; // v1.164: Training: the certificates can be put in the order wanted
    let folder = sharedOpen[key] != null ? sharedOpen[key] : (tiles ? null : folders.length ? folders[0].name : (getFolders ? null : ''));
    const newFolder = async () => {
      const inp = h('input', { maxlength: 60, autocomplete: 'off', 'aria-label': 'Folder name', placeholder: 'ATF Files' });
      setTimeout(() => inp.focus(), 60);
      const name = await openDialog((close) => h('form', { class: 'dialog-form', onsubmit: (e) => { e.preventDefault(); close(inp.value.trim()); } },
        h('h2', { icon: 'folder-plus' }, 'New Folder in Other Files'),
        field('Folder Name', inp),
        CVKit.cancelRow(h, () => close(null), h('button', { class: 'btn primary', type: 'submit' }, 'Create Folder'))));
      if (!name) return;
      try { folder = await Vault.addOtherFolder(name); sharedOpen[key] = folder; toast(`Folder ${folder} made.`, 'success'); } catch (err) { if (FS.isDisconnectError(err)) return onDriveLost(); toast(err.message, 'error'); }
      draw();
    };
    const removeFolder = async (f) => {
      if (!(await confirmDialog({ title: `Remove the folder ${f.label}?`, message: 'Only an empty folder can be removed.', confirmText: 'Remove Folder', danger: true }))) return;
      try { await Vault.removeOtherFolder(f.name); folder = tiles ? null : folders[0].name; sharedOpen[key] = folder; } catch (err) { if (FS.isDisconnectError(err)) return onDriveLost(); toast(err.message, 'error'); }
      draw();
    };
    const pick = h('input', { type: 'file', multiple: true, hidden: true });
    const add = async (files) => {
      if (!files || !files.length || folder == null) return;
      try {
        for (const f of files) await Save.track(`shared:${key}`, () => Vault.addShared(key, folder, f));
        toast(`${files.length} file${files.length === 1 ? '' : 's'} added${folder ? ` to ${folder}` : ''}.`, 'success');
      } catch (err) { if (FS.isDisconnectError(err)) return onDriveLost(); toast(`Not added: ${err.message}`, 'error'); }
      draw();
    };
    pick.addEventListener('change', () => { add([...pick.files]); pick.value = ''; });
    const draw = async () => {
      let list = [];
      let counts = {};
      try {
        if (getFolders) folders = (await getFolders()).map(norm);
        if (folders.length && folder != null && !folders.some((f) => f.name === folder)) folder = tiles ? null : folders[0].name;
        list = folder == null ? [] : await Vault.listShared(key, folder);
        if (folders.length) for (const f of folders) counts[f.name] = f.name === folder ? list.length : (await Vault.listShared(key, f.name)).length;
      } catch (err) { if (FS.isDisconnectError(err)) return onDriveLost(); }
      // v1.164: Training shows its certificates in the order chosen with Arrange (kept in .training.json).
      const isTraining = key === 'other' && folder === 'Training';
      const tmeta = isTraining && list.length ? await Vault.readTraining().catch(() => ({})) : {};
      // v1.165: and under their groups, when any certificate has one.
      const tgroups = isTraining ? CVTraining.grouped(CVTraining.ordered(list, tmeta), tmeta) : [];
      if (isTraining) list = tgroups.flatMap((g) => g.files);
      const groupOfFile = new Map(tgroups.flatMap((g) => g.files.map((f) => [f.base, g.group])));
      if (!isTraining || list.length < 2) arranging = false;
      const saveOrder = async (name, to, group) => {
        try {
          const all = await Vault.readTraining();
          all[CVTraining.ORDER_KEY] = CVTraining.moveTo(list, name, to);
          // v1.165: dropped onto a card of another group: it joins that group.
          if (group != null) { const d = CVTraining.normalize(all[name]); if (group) d.group = group; else delete d.group; all[name] = d; }
          await Save.track('shared:training', () => Vault.saveTraining(all));
        } catch (err) { if (FS.isDisconnectError(err)) return onDriveLost(); toast(`The order wasn't saved: ${err.message}`, 'error'); }
        draw();
      };
      const cur = folders.find((f) => f.name === folder);
      const folderLabel = cur ? cur.label : '';
      // v1.69: the folders are tabs, like a case's Details / Timeline / Write Report tabs.
      const tileRow = tiles ? h('div', { class: 'op-folders shared-folder-tiles', role: 'list' }, ...folders.map((f) => h('button', {
        type: 'button', role: 'listitem', class: `op-folder-tile shared-tile ${f.name === folder ? 'open' : ''}`, 'aria-expanded': String(f.name === folder),
        title: `${f.label}${f.desc ? `: ${f.desc}` : ''} (${counts[f.name] || 0} file${counts[f.name] === 1 ? '' : 's'})`,
        onclick: () => { folder = f.name === folder ? null : f.name; sharedOpen[key] = folder; draw(); },
      }, h('span', { class: 'op-folder-art' }, I(tileIcon), countBadge(counts[f.name] || 0, 'op-folder-count', 'file')),
      // v1.139: the folder's name only (its description is in the hover box), so the tiles match.
      h('span', { class: 'op-folder-name' }, h('span', { class: 'op-num' }, f.label)))),
      allowNew && newTile ? h('button', { type: 'button', role: 'listitem', class: 'op-folder-tile shared-tile shared-tile-new', title: 'Make a new folder in Other Files', onclick: newFolder },
        h('span', { class: 'op-folder-art' }, I('folder-plus')), h('span', { class: 'op-folder-name' }, h('span', { class: 'op-num' }, 'New Folder'))) : '') : null;
      if (tiles && folder == null) { box.replaceChildren(tileRow); return; }
      const chips = tiles ? tileRow : folders.length ? h('nav', { class: `tabs shared-tabs${folders.some((f) => f.desc) ? ' has-desc' : ''}`, role: 'tablist' }, ...folders.map((f) => h('button', {
        type: 'button', role: 'tab', class: `tab${f.name === folder ? ' active' : ''}`, 'aria-selected': String(f.name === folder), title: f.desc || null,
        onclick: () => { folder = f.name; sharedOpen[key] = f.name; draw(); },
      }, h('span', { class: 'tab-main' }, I(SHARED_ICONS[f.label] || (f.custom ? 'folder' : 'folder2-open')), h('span', { class: 'tab-name' }, f.label), h('span', { class: 'tab-count' }, String(counts[f.name] || 0))),
      f.desc ? h('span', { class: 'tab-desc' }, f.desc) : '')),
      allowNew ? h('button', { type: 'button', class: 'tab tab-new', title: 'Make a new folder in Other Files', onclick: newFolder }, h('span', { class: 'tab-main' }, I('folder-plus'), h('span', { class: 'tab-name' }, 'New Folder')), folders.some((f) => f.desc) ? h('span', { class: 'tab-desc' }, 'Your own folder') : '') : '') : null;
      const reader = { readFile: (name) => Vault.readShared(key, folder, name.split('/').pop()), where: `${key}${folder ? `\\${folder}` : ''}`,
        thumbs: { read: (n) => Vault.readSharedThumb(key, folder, n), save: (n, blob) => Vault.saveSharedThumb(key, folder, n, blob) } };
      const delFile = async (f) => {
        if (!(await confirmDialog({ title: `Delete ${f.base}?`, message: 'The file is deleted from the SSD.', confirmText: 'Delete', danger: true }))) return;
        try { await Vault.deleteShared(key, folder, f.base); } catch (err) { if (FS.isDisconnectError(err)) return onDriveLost(); toast(`Not deleted: ${err.message}`, 'error'); }
        draw();
      };
      // v1.139: Training holds certificates: each file is a card of the same size with a picture of
      // its first page (or the photo), so they line up in even rows.
      // v1.141: every folder can show its files as Cards or as a List (remembered on this PC for each
      // folder); Training starts as Cards, the others as a List.
      const training = key === 'other' && folder === 'Training';
      const cards = folderView(key, folder) === 'cards';
      // v1.140: each certificate's details (course, completed, hours, expires) from .training.json.
      const meta = tmeta;
      // v1.165: one card; the cards sit in one grid, or under their group's heading when any has one.
      const cardFor = (f, i) => {
        const img = h('img', { class: 'cert-thumb', alt: '', hidden: true });
        const art = h('span', { class: 'cert-art' }, h('span', { class: 'cert-icon' }, I(FILE_ICONS[fileKind(f.base)])), img);
        sharedThumb(reader, f, img);
        if (!training) {
          return h('div', { class: 'cert-card file-card', role: 'listitem', 'data-file': f.base },
            h('button', { type: 'button', class: 'cert-open', title: `Open ${f.base}`, onclick: () => previewFile(reader, f.base) }, art,
              h('span', { class: 'cert-name' }, f.base.replace(/\.[^.]+$/, '')), h('span', { class: 'cert-facts muted small' }, fmtSize(f.size))),
            h('div', { class: 'cert-foot' }, h('span', { class: 'muted small', title: `${f.base} · last updated ${fmtDateTime(f.modified)}` }, `Added ${f.modified ? new Date(f.modified).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}`),
              h('button', { type: 'button', class: 'icon-btn danger-icon', title: 'Delete this file', onclick: () => delFile(f) }, I('trash3'), h('span', { class: 'sr-only' }, `Delete ${f.base}`))));
        }
        const d = CVTraining.normalize(meta[f.base]);
        const st = CVTraining.notice(d, today());
        const left = CVTraining.daysLeft(d, today());
        // v1.145: the card shows the course name and, when there is one, the expiry; the rest is in the pencil's details.
        const exp = d.expires ? h('span', { class: `cert-exp${st ? ` cert-exp-${st}` : ''}`, title: `Expires ${fmtDate(d.expires)}` },
          st === 'expired' ? 'Expired' : st ? `Renew in ${left} day${left === 1 ? '' : 's'}` : `Expires ${shortDate(d.expires)}`) : null;
        const course = CVTraining.courseOf(f.base, d);
        // v1.164: while arranging, a card is dragged onto another to take its place, or moved one
        // place with the arrows (also by keyboard); opening a certificate waits until Done.
        const moveBtns = arranging ? h('span', { class: 'cert-move' },
          // v1.165: the arrows move it within its group; dragging it onto another group's card moves it there.
          h('button', { type: 'button', class: 'icon-btn', title: 'Move earlier', disabled: i === 0 || groupOfFile.get(list[i - 1].base) !== groupOfFile.get(f.base), onclick: () => saveOrder(f.base, i - 1) }, I('chevron-left'), h('span', { class: 'sr-only' }, `Move ${course} earlier`)),
          h('button', { type: 'button', class: 'icon-btn', title: 'Move later', disabled: i === list.length - 1 || groupOfFile.get(list[i + 1].base) !== groupOfFile.get(f.base), onclick: () => saveOrder(f.base, i + 1) }, I('chevron-right'), h('span', { class: 'sr-only' }, `Move ${course} later`))) : null;
        const card = h('div', { class: `cert-card${st ? ` cert-${st}` : ''}`, role: 'listitem', 'data-file': f.base },
          h('button', { type: 'button', class: 'cert-open', title: arranging ? 'Drag to move it' : `Open ${f.base}`, onclick: () => { if (!arranging) previewFile(reader, f.base); } }, art,
            h('span', { class: 'cert-name', title: `${f.base} · ${fmtSize(f.size)}${d.date ? ` · completed ${fmtDate(d.date)}` : ''}${d.hours ? ` · ${d.hours} hours` : ''}` }, course), exp),
          h('div', { class: 'cert-foot' }, moveBtns || h('span', { class: 'spacer' }),
            arranging ? h('span', { class: 'muted small cert-pos' }, `${i + 1} of ${list.length}`) : h('span', { class: 'cert-tools' },
              h('button', { type: 'button', class: 'icon-btn cert-edit', title: 'Course, date completed, hours and expiry date', onclick: () => editCertificate(f.base, meta, draw) }, I('pencil-square'), h('span', { class: 'sr-only' }, `Details of ${f.base}`)),
              h('button', { type: 'button', class: 'icon-btn danger-icon', title: 'Delete this file', onclick: () => delFile(f) }, I('trash3'), h('span', { class: 'sr-only' }, `Delete ${f.base}`)))));
        if (arranging) {
          card.draggable = true;
          card.addEventListener('dragstart', (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-cv-cert', f.base); card.classList.add('dragging'); });
          card.addEventListener('dragend', () => card.classList.remove('dragging'));
          card.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('text/x-cv-cert')) { e.preventDefault(); e.stopPropagation(); card.classList.add('drop-here'); } });
          card.addEventListener('dragleave', () => card.classList.remove('drop-here'));
          card.addEventListener('drop', (e) => {
            const name = e.dataTransfer.getData('text/x-cv-cert');
            if (!name) return;
            e.preventDefault(); e.stopPropagation();
            card.classList.remove('drop-here');
            if (name !== f.base) saveOrder(name, i, groupOfFile.get(name) !== groupOfFile.get(f.base) ? groupOfFile.get(f.base) : undefined);
          });
        }
        return card;
      };
      const grid = (files) => h('div', { class: `cert-grid${arranging ? ' cert-arranging' : ''}`, role: 'list' }, files.map((f) => cardFor(f, list.indexOf(f))));
      const rows = list.length && cards ? (training && tgroups.length > 1
        ? h('div', { class: 'cert-groups' }, ...tgroups.map((g) => h('section', { class: 'cert-group' },
          h('h3', { class: 'cert-group-head' }, g.group || 'Other Certificates', h('span', { class: 'muted small' }, ` ${g.files.length}`)), grid(g.files))))
        : grid(list)) : list.length ? h('table', { class: 'files shared-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', { class: 'num' }, 'Size'), h('th', { class: 'date-cell' }, 'Updated'), h('th', { class: 'col-actions' }, ''))),
        h('tbody', {}, list.map((f) => h('tr', {},
          h('td', {}, h('button', { type: 'button', class: 'linklike', onclick: () => previewFile(reader, f.base) }, I(FILE_ICONS[fileKind(f.base)]), ' ', f.base)),
          h('td', { class: 'num muted' }, fmtSize(f.size)),
          h('td', { class: 'muted date-cell', title: `Last updated ${fmtDateTime(f.modified)}` }, f.modified ? fmtDate(Vault.localDay(new Date(f.modified))) : '—'),
          h('td', { class: 'col-actions' }, h('button', { type: 'button', class: 'icon-btn danger-icon', title: 'Delete this file', onclick: () => delFile(f) }, I('trash3'), h('span', { class: 'sr-only' }, `Delete ${f.base}`))))))) : h('p', { class: 'muted small shared-empty' }, folderLabel ? `No files in ${folderLabel} yet.` : empty);
      // The vehicle cards are made once, so typing isn't lost when the file list redraws.
      // v1.80: Subject Data opens its demographics sheet the same way.
      const panelFor = { 'Vehicle List': opVehiclesPanel, 'Subject Data': opSubjectsPanel }[folder];
      if (key.startsWith('op-') && panelFor) vehEl = (vehEl && vehEl.dataset.folder === folder) ? vehEl : panelFor(key.slice(3));
      else vehEl = null;
      if (vehEl) vehEl.dataset.folder = folder;
      const vehicles = vehEl || '';
      box.replaceChildren(...[chips, tiles ? h('div', { class: 'op-open-head shared-open-head' }, h('strong', {}, folderLabel), h('div', { class: 'spacer' }),
        training ? h('button', { type: 'button', class: 'btn small', icon: 'file-earmark-pdf', title: 'A list of your courses with dates and hours, and the certificates after it, as a PDF', onclick: () => trainingRecord() }, 'Training Record') : '',
        // v1.164: Arrange: put the certificates in the order wanted, to keep similar ones together.
        training && cards && list.length > 1 ? h('button', { type: 'button', class: `btn small${arranging ? ' primary' : ''}`, icon: 'arrows-move', 'aria-pressed': String(arranging), title: arranging ? 'Finish arranging' : 'Put the certificates in the order you want: drag them, or use the arrows', onclick: () => { arranging = !arranging; draw(); } }, arranging ? 'Done Arranging' : 'Arrange') : '',
        h('div', { class: 'view-switch', role: 'group', 'aria-label': 'Show files as' },
          ...[['cards', 'grid-3x3', 'Cards'], ['list', 'list-ul', 'List']].map(([v, icon, label]) => h('button', { type: 'button', class: `btn small view-btn${(cards ? 'cards' : 'list') === v ? ' on' : ''}`, 'aria-pressed': String((cards ? 'cards' : 'list') === v), icon, title: `Show the files as ${label.toLowerCase()}`, onclick: () => { setFolderView(key, folder, v); draw(); } }, label))),
        h('button', { type: 'button', class: 'btn small ghost', title: 'Close this folder', onclick: () => { folder = null; sharedOpen[key] = null; draw(); } }, 'Close')) : '', vehicles, h('div', { class: 'shared-drop', title: 'Drop files here, or click Add Files' }, rows,
        h('div', { class: 'shared-foot' }, h('button', { type: 'button', class: 'btn small', icon: 'plus-lg', onclick: () => pick.click() }, folderLabel ? `Add Files to ${folderLabel}` : 'Add Files'), h('span', { class: 'muted small' }, 'or drop files here'),
          cur && cur.custom ? h('span', { class: 'spacer' }) : '', cur && cur.custom ? h('button', { type: 'button', class: 'btn small ghost danger', icon: 'trash3', title: 'Remove this folder (only when it is empty)', onclick: () => removeFolder(cur) }, 'Remove Folder') : ''), pick)].filter(Boolean));
    };
    box.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); box.classList.add('drop-on'); } });
    box.addEventListener('dragleave', () => box.classList.remove('drop-on'));
    box.addEventListener('drop', (e) => { e.preventDefault(); box.classList.remove('drop-on'); add([...e.dataTransfer.files]); });
    box.newFolder = newFolder; // v1.74: New Folder sits in the section's header
    draw();
    return box;
  }

  function showDashboard() {
    state.caseId = null;
    state.caseObj = null;
    renderCaseList();
    const cases = Vault.data.cases;
    const count = (s) => cases.filter((c) => c.status === s).length;
    // v1.148: a snoozed deadline is left out until its snooze runs out (the case's next one counts instead).
    const deadlines = cases.filter((c) => c.nextDeadline && c.status !== 'Closed' && c.status !== 'Archived')
      .map((c) => { const d = effDeadline(c); return d ? { ...c, nextDeadline: d } : null; }).filter(Boolean)
      .sort((a, b) => (a.nextDeadline.date + a.nextDeadline.time).localeCompare(b.nextDeadline.date + b.nextDeadline.time));
    // Recently Updated can be cleared (v1.32): only cases changed after that show again.
    const clearedAt = (Vault.data.settings && Vault.data.settings.recentClearedAt) || '';
    // v1.148: pinned cases stay at the top (Clear leaves them), then the most recently changed.
    const pins = pinnedIds();
    const pinned = pins.map((id) => cases.find((c) => c.id === id)).filter(Boolean);
    const recent = [...pinned, ...[...cases].filter((c) => !pins.includes(c.id) && (c.updated || '') > clearedAt).sort((a, b) => (b.updated || '').localeCompare(a.updated || '')).slice(0, 8)];
    const tlBox = h('div', { class: 'dash-section op-timeline-section', hidden: true });
    const opBox = h('div', { class: 'dash-section op-open-section', hidden: true });

    $('#main').replaceChildren(h('section', { class: 'dashboard' },
      // v1.61: a smaller banner with the status counts in it, then quick actions and what needs you.
      welcomeHero(cases, deadlines, count),
      todayPanel(cases),
      backupBar(),
      quickActions(),
      needsAttention(deadlines, cases),
      operationFolders(cases, tlBox, opBox),
      tlBox,
      // v1.42: no Upcoming Deadlines (the banner shows what's due); the open operation's case
      // numbers, each with its tabs, sit here instead, so the folders above never move.
      opBox,
      generalYearFolders(cases),
      // v1.116: closed cases and Missions, then archived cases, in their own sections; v1.134: by
      // year, with OTHER FILES (anything not tied to a case number or a Mission) under them, then
      // the Secure Locker.
      closedFilesSection(cases),
      archivedSection(cases),
      otherFilesSection(),
      secureLockerSection(),
      // v1.71: Recently Updated as even columns, in the Quick Links' size, not bold.
      h('div', { class: 'dash-section ov-panel recent-section' }, panelHead('Recently Updated', 'The cases changed most recently. Clear empties the list.',
        recent.length ? h('button', { class: 'btn small', type: 'button', icon: 'x-circle', title: 'Empties this list. Cases you change after this show here again.', onclick: async () => {
          try { await Save.track('settings', () => Vault.updateSettings({ recentClearedAt: new Date().toISOString() })); showDashboard(); } catch { /* reported */ }
        } }, 'Clear') : ''),
      recent.length
        ? h('div', { class: 'recent-grid', role: 'table' },
          h('div', { class: 'recent-row recent-headrow', role: 'row' }, ...['Subject', 'Case Number', 'File Number', 'Status', 'Updated'].map((t) => h('span', { role: 'columnheader' }, t))),
          ...recent.map((c) => h('a', { href: `#/case/${CVRoute.enc(c.id)}`, class: `recent-row${pins.includes(c.id) ? ' pinned' : ''}`, role: 'row' },
            h('span', { class: 'recent-cell recent-subject' }, pinBtn(c), h('span', { class: 'recent-subject-text' }, (c.title && c.title !== c.subject ? c.title : subj(c) || c.title) || 'Untitled case')),
            h('span', { class: 'recent-cell' }, c.number || '—'),
            h('span', { class: 'recent-cell' }, c.fileNumber || '—'),
            h('span', { class: 'recent-cell' }, statusPill(c.status)),
            h('span', { class: 'recent-cell muted' }, c.updated ? fmtDate(Vault.localDay(new Date(c.updated))) : '—'))))
        : h('p', { class: 'muted' }, cases.length ? 'Nothing changed since you cleared this list.' : 'Create your first case with "New case".')),
    ));
    // v1.63: Quick Links in the footer bar under the page, from the case list to the right edge.
  }

  /** v1.149: TODAY: everything dated today and tomorrow on the Timelines of the open cases, soonest
   * first; a deadline can be ticked done right here. Hidden when there is nothing. */
  const todayMemo = new Map();
  function todayPanel(cases) {
    const box = h('div', { class: 'dash-section ov-panel today-section', hidden: true });
    const now = today();
    const tom = CVFormat.addDays(now, 1);
    (async () => {
      const items = [];
      const open = cases.filter((x) => !isArchivedEntry(x) && x.status !== 'Closed');
      const keyOf = (c) => `${c.updated || ''}|${(c.nextDeadline && c.nextDeadline.date) || ''}`;
      // The Timelines that changed are read 8 at a time (one after another was slow with many cases).
      const stale = open.filter((c) => { const tl = todayMemo.get(c.id); return !tl || tl.key !== keyOf(c); });
      for (let i = 0; i < stale.length; i += 8) {
        await Promise.all(stale.slice(i, i + 8).map(async (c) => {
          try { todayMemo.set(c.id, { key: keyOf(c), data: await Vault.getTimeline(c.id) }); } catch { todayMemo.delete(c.id); }
        }));
      }
      for (const c of open) {
        const tl = todayMemo.get(c.id);
        if (!tl) continue;
        // v1.153: a court date shows for the week before it (7 days and 1 day reminders).
        for (const ev of (tl.data && tl.data.events) || []) if (((ev.date === now || ev.date === tom) || CVOperation.courtReminder(ev, now)) && !ev.done) items.push({ c, ev, data: tl.data });
      }
      if (!items.length) return; // filled even before it is on the page: with nothing re-read this runs at once
      items.sort((a, b) => (a.ev.date + (a.ev.time || '99')).localeCompare(b.ev.date + (b.ev.time || '99')));
      const list = h('ul', { class: 'today-list' }, items.map(({ c, ev, data }) => {
        const done = ev.kind === 'deadline' ? h('input', { type: 'checkbox', 'aria-label': `Mark "${ev.title}" done`, title: 'Mark done' }) : null;
        const li = h('li', { class: `today-row today-${ev.kind}${ev.date === now ? ' is-today' : ''}` },
          done || h('span', { class: 'today-dot' }),
          h('span', { class: 'today-when' }, ev.date === now ? 'Today' : ev.date === tom ? 'Tomorrow' : `In ${CVOperation.daysBetween(now, ev.date)} days`, ev.time ? ` ${ev.time}` : ''),
          h('span', { class: `badge ${ev.kind}` }, CVOperation.kindLabel(ev.kind)),
          h('a', { class: 'today-title', href: caseLink(c, 'timeline') }, ev.title || 'Untitled'),
          h('a', { class: 'today-case', href: caseLink(c), title: subj(c) }, c.number || 'No case number'));
        if (done) done.addEventListener('change', async () => {
          ev.done = true;
          try { await Save.track(`timeline:${c.id}`, () => Vault.saveTimeline(c.id, data)); li.remove(); toast(`"${ev.title}" marked done.`, 'success', 2500); if (!list.children.length) box.hidden = true; } catch { ev.done = false; done.checked = false; }
        });
        return li;
      }));
      box.replaceChildren(panelHead('Today', `${plural(items.length, 'item')} due today and tomorrow on the Timelines of your open cases, and court dates this week.`), list);
      box.hidden = false;
    })().catch(() => {});
    return box;
  }

  /** v1.149: Quick Note (Alt+N, or ⋮ → Quick Note, from anywhere): a dated note into a case's Case History, or
   * into each case of a Case Group. */
  async function quickNoteDialog() {
    const open = (Vault.data.cases || []).filter((c) => !isArchivedEntry(c)).sort(byNumber);
    if (!open.length) { toast('Make a case first.', 'info'); return; }
    const groups = Vault.suspectGroups();
    const res = await openDialog((close) => {
      const pick = h('select', { 'aria-label': 'Case or Case Group' },
        h('optgroup', { label: 'Cases' }, open.map((c) => h('option', { value: `c:${c.id}`, selected: c.id === state.caseId }, `${c.number || 'No case number'}${subj(c) ? ` · ${subj(c)}` : ''}`))),
        groups.length ? h('optgroup', { label: 'Case Groups (the note goes to each case)' }, groups.map((g) => h('option', { value: `g:${g}` }, g))) : null);
      const text = h('textarea', { rows: 4, maxlength: 2000, placeholder: 'What happened', 'aria-label': 'Note', autofocus: 'true' });
      text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); text.form.requestSubmit(); } });
      return h('form', { class: 'quick-note-form', onsubmit: (e) => { e.preventDefault(); if (text.value.trim()) close({ to: pick.value, what: text.value.trim() }); } },
        h('h2', { icon: 'pencil-square' }, 'Quick Note'),
        h('p', { class: 'muted small' }, 'Goes into the Case History with today\'s date and the time. Ctrl+Enter saves.'),
        field('Case', pick), field('Note', text),
        CVKit.cancelRow(h, () => close(null), h('button', { class: 'btn primary', type: 'submit', icon: 'floppy' }, 'Save Note')));
    });
    if (!res) return;
    const ids = res.to.startsWith('g:') ? open.filter((c) => c.suspectGroup === res.to.slice(2) && !opOf(c)).map((c) => c.id) : [res.to.slice(2)];
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    await Save.flushAll();
    let n = 0;
    for (const id of ids) {
      try {
        const live = state.caseObj && state.caseObj.id === id;
        const c = live ? state.caseObj : await Vault.getCase(id);
        c.activity = [...(Array.isArray(c.activity) ? c.activity : []), { day: today(), what: `${time} · ${res.what}`, note: true, added: new Date().toISOString() }];
        await Save.track(`case:${id}`, () => Vault.saveCase(c));
        n += 1;
      } catch { /* reported */ }
    }
    if (n) toast(`Note saved in the Case History of ${plural(n, 'case')}.`, 'success', 3000);
    if (state.caseId && ids.includes(state.caseId)) route();
  }

  /** v1.148: pinned cases (kept in vault.json): they stay at the top of Recently Updated. */
  const pinnedIds = () => ((Vault.data.settings && Array.isArray(Vault.data.settings.pinnedCases)) ? Vault.data.settings.pinnedCases : []).filter((id) => (Vault.data.cases || []).some((c) => c.id === id));
  async function togglePin(c) {
    const ids = pinnedIds();
    const next = ids.includes(c.id) ? ids.filter((x) => x !== c.id) : [...ids, c.id].slice(-12);
    try { await Save.track('settings', () => Vault.updateSettings({ pinnedCases: next })); } catch { return; }
    toast(next.includes(c.id) ? `Case ${c.number || ''} pinned to the top of Recently Updated and the case list.` : `Case ${c.number || ''} unpinned.`, 'success', 2500);
    renderCaseList();
  }
  const pinBtn = (c, after = () => showDashboard()) => {
    const on = pinnedIds().includes(c.id);
    return h('button', { type: 'button', class: `icon-btn pin-btn${on ? ' on' : ''}`, title: on ? 'Unpin: let it move with the others' : 'Pin to the top of Recently Updated', 'aria-pressed': String(on),
      onclick: async (e) => { e.preventDefault(); e.stopPropagation(); await togglePin(c); after(); } }, I('pin-angle'), h('span', { class: 'sr-only' }, on ? 'Unpin' : 'Pin'));
  };
  /** v1.121: Quick Links in a panel that slides in from the right, opened by the Quick Links
   * buttons (beside Reference on the home page, and in the sidebar's icon row). It takes no room
   * until it is opened; Esc, × or a click outside it closes it. (The bottom bar of v1.63–v1.120 is gone.) */
  let qlPanel = null;
  document.addEventListener('cv-links-changed', () => { if (qlPanel && qlPanel.classList.contains('open')) quickLinksPanel(true); });
  function quickLinksPanel(open) {
    if (!qlPanel) {
      qlPanel = h('aside', { id: 'ql-panel', class: 'ql-panel', 'aria-label': 'Quick Links', 'aria-hidden': 'true', inert: '' });
      document.body.append(qlPanel);
      // A link to a page of CaseVault (Location Codes, Charges…) closes the panel to show it; links to
      // outside sites open in a new browser tab and leave it open.
      qlPanel.addEventListener('click', (e) => { const a = e.target.closest('a[href^="#"]'); if (a) setTimeout(() => quickLinksPanel(false), 0); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && qlPanel.classList.contains('open') && !document.querySelector('dialog[open]')) quickLinksPanel(false); });
      document.addEventListener('pointerdown', (e) => {
        if (!qlPanel.classList.contains('open') || qlPanel.contains(e.target) || e.target.closest('.ql-open-btn, dialog, .combo-list')) return;
        quickLinksPanel(false);
      }, true);
    }
    const want = open === undefined ? !qlPanel.classList.contains('open') : !!open;
    if (want) {
      qlPanel.replaceChildren(
        h('div', { class: 'ql-panel-head' }, h('h2', {}, I('link-45deg'), 'Quick Links'),
          h('button', { type: 'button', class: 'icon-btn ql-panel-close', title: 'Close Quick Links (Esc)', onclick: () => quickLinksPanel(false) }, I('x-lg'), h('span', { class: 'sr-only' }, 'Close Quick Links'))),
        CVReferenceUI.quickLinks());
      qlPanel.removeAttribute('inert');
    } else qlPanel.setAttribute('inert', '');
    qlPanel.classList.toggle('open', want);
    qlPanel.setAttribute('aria-hidden', String(!want));
    document.querySelectorAll('.ql-open-btn').forEach((b) => { b.setAttribute('aria-expanded', String(want)); b.classList.toggle('on', want); });
  }

  /* =====================================================================
   * Operations (#/operations, #/operation/<id>) and General Files (#/general), v1.46
   * ===================================================================== */

  function pageStart(title) {
    state.caseId = null;
    state.caseObj = null;
    renderCaseList();
  }
  const caseLink = (c, tab = 'details') => `#/case/${CVRoute.enc(c.id)}/${tab}`;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  /** New or edit Operation. Resolves to the saved Operation, or null. */
  async function operationDialog(op = null, preset = null) {
    const saved = await openDialog((close) => {
      const v = op || { status: 'Open', start: today(), ...(preset || {}) }; // v1.148: preset, e.g. a Case Group's name
      const numberIn = h('input', { name: 'number', required: true, maxlength: 100, autocomplete: 'off', autofocus: true, value: v.number || (op ? '' : CVOperation.nextOpNumber(Vault.listOperations())) });
      const nameIn = h('input', { name: 'name', required: true, maxlength: 200, autocomplete: 'off', value: v.name || '' });
      const statusIn = h('select', { name: 'status' }, CVOperation.OP_STATUSES.map((x) => h('option', { selected: x === v.status }, x)));
      const startIn = h('input', { name: 'start', type: 'date', value: v.start || '' });
      const endIn = h('input', { name: 'end', type: 'date', value: v.end || '' });
      const notesIn = h('textarea', { name: 'notes', rows: 4, maxlength: 20000, 'aria-label': 'Notes' }, v.notes || '');
      const err = h('p', { class: 'error-text small span-2', role: 'alert', hidden: true });
      const form = h('form', { class: 'form-grid op-form', onsubmit: async (e) => {
        e.preventDefault();
        const fields = { number: numberIn.value, name: nameIn.value, status: statusIn.value, start: startIn.value, end: endIn.value, notes: notesIn.value };
        const errs = CVOperation.validateOperation(fields, Vault.listOperations(), op ? op.id : '');
        // v1.85: a Mission is Closed only when its cases are: Close Mission gives each a disposition.
        if (fields.status === 'Closed' && (!op || op.status !== 'Closed')) {
          const open = op ? Vault.operationMembers(op.id).filter((x) => !isArchivedEntry(x) && x.status !== 'Closed') : [];
          if (!op) errs.push('A new Mission starts Open.');
          else if (open.length) errs.push(`${plural(open.length, 'case number')} of this Mission ${open.length === 1 ? 'is' : 'are'} still open (${open.map((x) => x.number || 'no number').join(', ')}). Use Close Mission on the Mission page to close them with a disposition.`);
        }
        err.hidden = !errs.length;
        err.textContent = errs.join(' ');
        if (errs.length) return;
        try {
          close(await Save.track(op ? `op:${op.id}` : 'new-op', () => (op ? Vault.updateOperation(op.id, fields) : Vault.createOperation(fields))));
        } catch (ex) { err.hidden = false; err.textContent = ex.message; }
      } },
      h('h2', { class: 'span-2', icon: 'op-folder' }, op ? 'Edit Mission' : 'New Mission'),
      formSect('Mission', 'op-folder'),
      field('Mission Number', numberIn, '', 'Unique: no two Missions share a number.'),
      field('Mission Name', nameIn),
      formSect('Status and Dates', 'calendar-event'),
      h('div', { class: 'span-2 form-row3' }, field('Status', statusIn), field('Start Date', startIn), field('End Date', endIn)),
      formSect('Notes', 'journal-text'),
      h('div', { class: 'span-2 field' }, notesIn),
      err,
      h('div', { class: 'dialog-actions span-2' },
        h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
        h('button', { class: 'btn primary', type: 'submit' }, op ? 'Save changes' : 'Create Mission')));
      return form;
    });
    if (saved) renderCaseList();
    return saved;
  }

  /** The Operations page: every Operation with its status, dates and number of cases. */
  function showOperations() {
    pageStart('Missions');
    const ops = [...Vault.listOperations()].sort((a, b) => byFileNumber(a.number, b.number) || a.name.localeCompare(b.name));
    const count = (op) => (Vault.data.cases || []).filter((c) => c.operationId === op.id).length;
    $('#main').replaceChildren(h('section', { class: 'ops-page' },
      h('div', { class: 'page-head' }, h('h1', {}, 'Missions'), h('div', { class: 'spacer' }),
        h('a', { class: 'btn', href: '#/general', icon: 'folder-fill' }, 'General Files'),
        h('button', { class: 'btn primary', type: 'button', icon: 'plus-lg', onclick: async () => { const op = await operationDialog(); if (op) location.hash = `#/operation/${encodeURIComponent(op.id)}`; } }, 'New Mission')),
      h('p', { class: 'muted small' }, 'A Mission links cases together. The cases themselves stay in General Files; deleting a Mission never deletes a case or a file.'),
      ops.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'data-table ops-table' },
        h('thead', {}, h('tr', {}, ['Mission', 'Status', 'Start Date', 'End Date', 'Cases'].map((x) => h('th', { class: /Date$/.test(x) ? 'date-cell' : '' }, x)))),
        h('tbody', {}, ops.map((op) => h('tr', {},
          h('td', {}, h('a', { href: `#/operation/${encodeURIComponent(op.id)}`, class: 'op-row-link' }, I('op-folder'), opLabel(op))),
          h('td', {}, statusPill(op.status)),
          h('td', { class: 'nowrap date-cell' }, dateCols(op.start)),
          h('td', { class: 'nowrap date-cell' }, dateCols(op.end)),
          h('td', { class: 'num' }, String(count(op))))))))
        : h('div', { class: 'empty-state' }, h('p', {}, 'No Missions yet.'), h('p', { class: 'muted small' }, 'New Mission makes one. Then create cases inside it, or link cases from General Files.'))));
  }

  /** Pick cases from General Files to link to an Operation. Cases already in another Operation
   * are shown but can't be picked: unlink them there first. */
  async function addExistingDialog(op) {
    const ids = await openDialog((close) => {
      const q = h('input', { type: 'search', placeholder: 'Search by case number or subject', 'aria-label': 'Search cases', autofocus: true });
      const rows = h('div', { class: 'pick-list', role: 'list' });
      const picked = new Set();
      const ok = h('button', { class: 'btn primary', type: 'submit', disabled: true }, 'Link cases');
      const draw = () => {
        const t = q.value.trim().toLowerCase();
        const list = (Vault.data.cases || []).filter((c) => !isArchivedEntry(c) && c.operationId !== op.id)
          .filter((c) => !t || [c.number, c.subject, subj(c), c.title].join(' ').toLowerCase().includes(t)).sort(byNumber);
        rows.replaceChildren(...(list.length ? list.slice(0, 300).map((c) => {
          const other = opOf(c);
          const box = h('input', { type: 'checkbox', disabled: !!other, checked: picked.has(c.id) });
          box.addEventListener('change', () => { if (box.checked) picked.add(c.id); else picked.delete(c.id); ok.disabled = !picked.size; ok.textContent = picked.size > 1 ? `Link ${picked.size} cases` : 'Link case'; });
          return h('label', { class: `pick-row${other ? ' disabled' : ''}`, role: 'listitem', title: other ? `Already in ${opLabel(other)}. Unlink it there first.` : '' }, box,
            h('span', { class: 'pick-num' }, c.number || 'No case number'), h('span', { class: 'pick-subject' }, subj(c) || 'No subject yet'),
            h('span', { class: 'pick-op muted small' }, other ? `In ${opLabel(other)}` : 'General Files'));
        }) : [h('p', { class: 'muted' }, t ? 'No cases match.' : 'No other cases in General Files.')]));
      };
      q.addEventListener('input', draw);
      draw();
      return h('form', { class: 'add-existing', onsubmit: (e) => { e.preventDefault(); close([...picked]); } },
        h('h2', { 'data-keep-case': 'true' }, `Add existing case to ${opLabel(op)}`), q, rows,
        CVKit.cancelRow(h, () => close(null), ok));
    });
    if (!ids || !ids.length) return 0;
    let n = 0;
    for (const id of ids) if (await linkCase(id, op.id)) n += 1;
    return n;
  }

  /** One Operation: its fields (edit), its Files (the linked cases) and Delete. */
  /** v1.179: a Mission's suspects, once each (its case numbers share them). full: full case objects. */
  function missionSuspects(full) {
    const seen = new Set(); const people = [];
    for (const x of full) for (const sx of x.suspects || []) {
      const k = sx && !sx.notIdentified ? CVClosing.personKey(sx.name) || String(sx.name || '').trim().toLowerCase() : '';
      if (k && !seen.has(k)) { seen.add(k); people.push(sx); }
    }
    return people;
  }

  /** v1.180: every case number of a Mission read at once: case.json, the arrest report, the Write
   * Report tab's evidence and the timeline. -> [{ c, a, evidence, tl }] */
  function readMission(members) {
    return Promise.all(members.map(async (m) => {
      const [x, a, rf, tl] = await Promise.all([Vault.getCase(m.id).catch(() => m), Vault.readCaseJSON(m.id, 'arrest.json').catch(() => null),
        Vault.readCaseJSON(m.id, 'report-fields.json').catch(() => null), Vault.getTimeline(m.id).catch(() => ({ events: [] }))]);
      return { c: { ...x, archived: isArchivedEntry(m) }, a, evidence: (rf && rf.evidence) || [], tl: { caseId: m.id, number: m.number || '', events: (tl || {}).events || [] } };
    }));
  }

  /** v1.180: the Mission Closeout PDF: its case numbers and dispositions, what became of each suspect,
   * the buys and the evidence, to keep in the Mission Folder or hand to a supervisor or prosecutor. */
  async function missionCloseout(op, members) {
    try {
      await Save.flushAll();
      const all = await readMission(members);
      const full = all.map((x) => x.c);
      const arrests = new Map(all.map((x) => [x.c.id, x.a]));
      const outcomes = CVClosing.suspectOutcomes(missionSuspects(full), [...arrests.values()]);
      const buys = CVOperation.buySummary(CVOperation.mergeEvents(all.map((x) => x.tl)));
      await CVKit.loadScripts(['js/mission-closeout.js']);
      const data = CVMissionCloseout.rows({ cases: full, arrests, outcomes, buys, evidence: new Map(all.map((x) => [x.c.id, x.evidence])) });
      const title = opLabel(op);
      const bytes = CVMissionCloseout.build(title, data, { letterhead: await CVLetterhead.forPdf().catch(() => null), printed: fmtDate(today()),
        outcome: op.status === 'Closed' && op.outcome ? op.outcome : CVClosing.outcomeSummary(outcomes).text, later: op.later || [] });
      const name = `${FS.safeName(op.number || op.name || 'Mission')} Mission Closeout.pdf`;
      const viewer = CVPdfViewer.create(bytes, { h, icon: I, title: `Mission Closeout ${title}`, fileName: name });
      const saveBtn = h('button', { class: 'btn', type: 'button', icon: 'folder-plus', onclick: async () => {
        try {
          const saved = await Vault.addShared(`op-${op.id}`, 'Other', new File([bytes], name, { type: 'application/pdf' }));
          toast(`Saved: Mission Folder › Other › ${saved}`, 'success', 6000);
          saveBtn.disabled = true;
        } catch (err) { if (FS.isDisconnectError(err)) onDriveLost(); else toast(err.message, 'error'); }
      } }, 'Save to the Mission Folder');
      await openDialog((done) => h('div', { class: 'pdf-view' }, h('h2', { 'data-keep-case': 'true' }, `Mission Closeout: ${title}`), viewer,
        h('div', { class: 'dialog-actions' }, saveBtn, h('button', { class: 'btn primary', type: 'button', onclick: () => done() }, 'Done'))));
      viewer.destroy();
    } catch (err) { if (FS.isDisconnectError(err)) onDriveLost(); else toast(`The closeout was not made: ${err.message}`, 'error'); }
  }

  /** v1.184: the Closing Summary: a short memo the AI drafts from the Closeout's facts, checked for
   * facts the Mission doesn't have, to edit and keep in the Mission Folder (Word). */
  async function missionMemo(op, members) {
    const Engine = CVChecks.Engine;
    await Engine.refresh().catch(() => {});
    if (!(Engine.status() === 'connected' && Engine.choice())) return toast('The local AI engine is not connected. Start Start-CaseVault.bat on the CV-AI drive, then try again.', 'error', 8000);
    let material = '';
    try {
      await Save.flushAll();
      const all = await readMission(members);
      const full = all.map((x) => x.c);
      const arrests = new Map(all.map((x) => [x.c.id, x.a]));
      const outcomes = CVClosing.suspectOutcomes(missionSuspects(full), [...arrests.values()]);
      await CVKit.loadScripts(['js/mission-closeout.js']);
      const data = CVMissionCloseout.rows({ cases: full, arrests, outcomes, buys: CVOperation.buySummary(CVOperation.mergeEvents(all.map((x) => x.tl))), evidence: new Map(all.map((x) => [x.c.id, x.evidence])) });
      material = CVMissionCloseout.memoMaterial(data, { title: opLabel(op), outcome: op.status === 'Closed' && op.outcome ? op.outcome : CVClosing.outcomeSummary(outcomes).text, later: op.later || [] });
    } catch (err) { if (FS.isDisconnectError(err)) return onDriveLost(); return toast(`The Mission could not be read: ${err.message}`, 'error'); }
    const ctrl = new AbortController();
    const ta = h('textarea', { class: 'memo-text', rows: 18, 'aria-label': 'Closing Summary', readonly: true });
    const status = h('p', { class: 'muted small' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Writing…');
    const flags = h('div', { class: 'aie-flags small', hidden: true, role: 'status' });
    const name = `${FS.safeName(op.number || op.name || 'Mission')} Closing Summary.docx`;
    const saveBtn = h('button', { class: 'btn', type: 'button', icon: 'folder-plus', disabled: true, onclick: async () => {
      try {
        const bytes = CVDocx.buildDocx(ta.value, { title: `Closing Summary ${opLabel(op)}` });
        const saved = await Vault.addShared(`op-${op.id}`, 'Other', new File([bytes], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
        toast(`Saved: Mission Folder › Other › ${saved}`, 'success', 6000);
      } catch (err) { if (FS.isDisconnectError(err)) onDriveLost(); else toast(err.message, 'error'); }
    } }, 'Save to the Mission Folder');
    const copyBtn = h('button', { class: 'btn', type: 'button', icon: 'clipboard2-check', disabled: true, onclick: async () => { try { await navigator.clipboard.writeText(ta.value); toast('Copied.', 'success', 1500); } catch { toast('Copying is not allowed here.', 'error'); } } }, 'Copy');
    const dlg = openDialog((close) => h('div', { class: 'memo-form' },
      h('h2', { icon: 'journal-text' }, `Closing Summary: ${opLabel(op)}`),
      h('p', { class: 'muted small' }, 'Drafted by the AI on this PC from the Mission\'s case numbers, suspects, buys and evidence (the same facts as the Closeout PDF). Edit it here before you keep it.'),
      status, ta, flags,
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => { ctrl.abort(); close(); } }, 'Close'), copyBtn, saveBtn)));
    try {
      const ch = Engine.choice(); const det = Engine.detected;
      const numCtx = CVAI.numCtxFor(ch.profile);
      const behavior = window.CVLibrary ? CVLibrary.behaviorById(Vault.data.settings, CVLibrary.defaultBehaviorId(Vault.data.settings)) : null;
      let text = '';
      await CVActivity.exclusive('draft', () => CVCopilot.streamChat({ fetchImpl: Engine.fetchImpl(), base: det.base, model: ch.model, signal: ctrl.signal, numCtx,
        messages: CVMissionCloseout.memoMessages(material, { behavior: behavior ? behavior.prompt : '' }), onText: (piece) => { text += piece; ta.value = text; } }), { label: 'Writing the Closing Summary…', model: CVAI.modelName(ch.model) });
      text = CVCopilot.cleanEdit(text);
      // The second look (v1.182): what the memo says that the Mission doesn't.
      const found = CVCopilot.newFacts(text, material);
      if (found.length && !ctrl.signal.aborted) {
        status.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), ` Checking ${found.length} fact${found.length === 1 ? '' : 's'} the Mission doesn't have…`);
        let fixed = '';
        await CVCopilot.streamChat({ fetchImpl: Engine.fetchImpl(), base: det.base, model: ch.model, signal: ctrl.signal, numCtx,
          messages: CVCopilot.fixFactsMessages({ text, facts: found, material }), onText: (piece) => { fixed += piece; } });
        fixed = CVCopilot.cleanEdit(fixed);
        text = CVCopilot.markUnsupported(fixed || text, fixed ? CVCopilot.newFacts(fixed, material) : found);
        flags.hidden = false;
        flags.replaceChildren(I('exclamation-triangle-fill'), h('span', {}, 'Not in the Mission\'s facts, so it was checked again and what is still missing is now [CONFIRM: …]: '), ...found.flatMap((x, i) => [i ? ', ' : '', h('mark', { class: 'aie-new' }, x)]));
      }
      ta.value = text;
      ta.readOnly = false;
      status.textContent = 'Check every fact and each [CONFIRM: …] before you keep it.';
      saveBtn.disabled = false; copyBtn.disabled = false;
    } catch (err) { if (!ctrl.signal.aborted) status.textContent = `The AI could not finish: ${err.message}`; }
    await dlg;
  }

  /** v1.180: a closed Mission's closed case numbers go to the archive together, with one reason. One
   * still open stays; a case carried on with Continue in a New Case is not in the Mission. */
  async function archiveMission(op, members, done) {
    const closed = members.filter((x) => !isArchivedEntry(x) && x.status === 'Closed');
    const open = members.filter((x) => !isArchivedEntry(x) && x.status !== 'Closed');
    if (!closed.length) return toast('Nothing to archive: no closed case numbers are left in this Mission.', 'info');
    const nums = (xs) => xs.map((x) => x.number || 'No case number').join(', ');
    const choice = await archiveReasonDialog(`Archive the case numbers of ${opLabel(op)}?`,
      `${nums(closed)} move${closed.length === 1 ? 's' : ''} to CaseVault-Data\\archive on the SSD, each with its notes, timeline, files, drafts and checks. Every file is copied and checked before the original is removed.${open.length ? ` ${nums(open)} ${open.length === 1 ? 'is' : 'are'} still open and stay${open.length === 1 ? 's' : ''}.` : ''} A case carried on with Continue in a New Case is not part of the Mission and stays as it is.`,
      { confirmText: `Archive ${plural(closed.length, 'Case Number')}` });
    if (!choice) return;
    await Save.flushAll();
    if (Save.failed.size) return toast('Some changes are not saved yet. Reconnect the SSD, then archive.', 'error', 8000);
    const progress = toast('Archiving: copying and checking files…', 'info', 600000);
    let n = 0; const failed = [];
    for (const x of closed) {
      try {
        await Save.track(`archive:${x.id}`, () => Vault.archiveCase(x.id, (k, file) => { progress.textContent = `Archiving ${x.number || 'a case'}: ${k} file${k === 1 ? '' : 's'} copied and checked (${file})…`; }, choice.folder, choice.reason));
        n++;
      } catch (err) {
        if (FS.isDisconnectError(err)) { progress.remove(); return onDriveLost(); }
        failed.push(`${x.number || 'No case number'}: ${err.message}`);
      }
    }
    progress.remove();
    state.caseObj = null;
    if (n) toast(`${plural(n, 'case number')} archived. ${n === 1 ? 'It opens' : 'They open'} read-only from "Archived" in the case list.`, 'success', 7000);
    if (failed.length) toast(`Not archived (still in the active list, unchanged): ${failed.join('; ')}`, 'error', 12000);
    done();
  }

  function showOperation(id) {
    const op = Vault.getOperation(id);
    pageStart(op ? opLabel(op) : 'Mission');
    if (!op) {
      $('#main').replaceChildren(h('section', { class: 'ops-page' }, h('h1', {}, 'Mission not found'),
        h('p', {}, 'This Mission was deleted. Its cases are in General Files.'), h('p', {}, h('a', { href: '#/operations' }, 'All Missions'), ' · ', h('a', { href: '#/general' }, 'General Files'))));
      return;
    }
    const members = (Vault.data.cases || []).filter((c) => c.operationId === op.id).sort(byNumber);
    const redraw = () => { renderCaseList(); showOperation(id); };
    // v1.82: All Files: every file on the SSD tied to this Mission, in one list (each case number's
    // files and the Mission Folder's), newest first; a click opens one.
    const allFilesBox = h('div', { class: 'op-all-files', hidden: true });
    const toggleAllFiles = async (btn) => {
      if (!allFilesBox.hidden) { allFilesBox.hidden = true; btn.classList.remove('on'); return; }
      allFilesBox.hidden = false; btn.classList.add('on');
      allFilesBox.replaceChildren(h('p', { class: 'muted small' }, 'Reading the SSD…'));
      const rows = [];
      for (const c of members) {
        try { for (const f of await Vault.listFiles(c.id)) rows.push({ where: c.number || 'No case number', folder: (f.folder || 'Unsorted').replace('/', ' › '), base: f.base, size: f.size, modified: f.modified, open: () => previewFile(c, f.name) }); } catch (err) { if (FS.isDisconnectError(err)) return onDriveLost(); }
      }
      try {
        const key = `op-${op.id}`;
        for (const f of await Vault.listShared(key, '*')) rows.push({ where: 'Mission Folder', folder: opFolderLabel(f.folder), base: f.base, size: f.size, modified: f.modified, open: () => previewFile({ readFile: () => Vault.readShared(key, f.folder, f.base), where: `${key}\\${f.folder}` }, f.base) });
      } catch (err) { if (FS.isDisconnectError(err)) return onDriveLost(); }
      rows.sort((x, y) => (y.modified || 0) - (x.modified || 0));
      allFilesBox.replaceChildren(rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'data-table op-all-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Case / Folder'), h('th', {}, 'Name'), h('th', { class: 'num' }, 'Size'), h('th', { class: 'date-cell' }, 'Updated'))),
        h('tbody', {}, rows.map((r) => h('tr', {},
          h('td', {}, h('strong', {}, r.where), h('div', { class: 'muted small' }, r.folder)),
          h('td', {}, h('button', { type: 'button', class: 'linkish', title: r.base, onclick: r.open }, r.base)),
          h('td', { class: 'num muted' }, fmtSize(r.size || 0)),
          h('td', { class: 'muted date-cell' }, r.modified ? fmtDate(Vault.localDay(new Date(r.modified))) : '—')))))) : h('p', { class: 'muted empty-note' }, I('folder2-open'), h('span', {}, 'No files yet for this Mission.')),
        h('p', { class: 'muted small op-section-note' }, `${plural(rows.length, 'file')}: every case number's Files tab and the Mission Folder.`));
    };
    const tlCase = members.find((c) => !isArchivedEntry(c));
    const tlPanel = h('div', { class: 'op-timeline' }, tlCase ? h('p', { class: 'muted small' }, 'Loading the timeline…') : h('p', { class: 'muted' }, 'Add a case number to this Mission to keep its timeline here.'));
    if (tlCase) {
      const tk = state.renderToken;
      setTimeout(() => renderTimeline(tlPanel, tlCase, tk).catch((err) => { if (FS.isDisconnectError(err)) onDriveLost(); else tlPanel.replaceChildren(h('p', { class: 'muted' }, `Could not read the timeline: ${err.message}`)); }), 0);
    }
    // v1.119: how far the Mission is from closed, and what each case number still needs to close.
    const progressBox = h('div', { class: 'op-progress', 'aria-live': 'polite' });
    (async () => {
      const tk = state.renderToken;
      const arrests = new Map(); const full = [];
      // v1.151: every case number read at once (in the Mission's order).
      full.push(...await Promise.all(members.map(async (m) => {
        const [a, x] = await Promise.all([Vault.readCaseJSON(m.id, 'arrest.json').catch(() => null), Vault.getCase(m.id).catch(() => m)]);
        arrests.set(m.id, a);
        return { ...x, archived: isArchivedEntry(m) };
      })));
      // v1.131: filled while this page is on screen (another part of the app redrawing, which bumps
      // the render token, used to leave the Closing column at "…").
      if (tk !== state.renderToken && !progressBox.isConnected) return;
      const pr = CVClosing.missionProgress(full, arrests);
      const bar = h('span', { class: 'op-progress-bar' }, h('span', { class: 'op-progress-fill' }));
      bar.firstChild.style.width = `${pr.total ? Math.round((pr.done / pr.total) * 100) : 0}%`;
      progressBox.replaceChildren(h('strong', {}, `${pr.done} of ${pr.total} case${pr.total === 1 ? '' : 's'} closed`), bar,
        h('span', { class: 'muted small' }, pr.done === pr.total ? 'Everything is closed. Close the Mission when you are ready.' : [...pr.rows.values()].some((r) => r.state === 'ref') ? 'Cases without their own arrest report can close by arrest with the report on another RD.' : ''));
      // v1.179: what became of each suspect of the Mission (the case numbers share them).
      const outcomes = CVClosing.suspectOutcomes(missionSuspects(full), [...arrests.values()]);
      if (outcomes.length) {
        const open = CVClosing.outcomeSummary(outcomes).open.length;
        progressBox.append(h('div', { class: 'op-suspects' },
          h('strong', {}, `${outcomes.length - open} of ${plural(outcomes.length, 'suspect')} accounted for`),
          h('ul', { class: 'op-suspect-list' }, outcomes.map((r) => h('li', {}, h('span', { class: 'op-suspect-name' }, r.name), ' ',
            h('span', { class: `outcome-chip ${r.key || 'unset'}`, title: r.auto ? 'On an arrest report of the Mission' : '' }, r.label),
            r.continuedIn ? h('a', { href: `#/case/${CVRoute.enc(r.continuedIn.caseId)}`, class: 'small' }, ` case ${r.continuedIn.number || 'with no number'}`) : ''))),
          open ? h('span', { class: 'muted small' }, 'Set each suspect\'s outcome on the Details tab. Someone still at large can be carried on with Continue in a New Case, so the Mission can close.') : ''));
      }
      for (const td of document.querySelectorAll('.op-closing[data-case]')) {
        const r = pr.rows.get(td.dataset.case);
        if (r) td.replaceChildren(h('span', { class: `closing-state ${r.state}`, title: r.text }, r.short));
      }
    })().catch(() => progressBox.replaceChildren());
    $('#main').replaceChildren(h('section', { class: 'ops-page op-page' },
      h('a', { href: '#/operations', class: 'back-link' }, '← All Missions'),
      h('div', { class: 'page-head' },
        h('span', { class: 'page-icon' }, I('op-folder')),
        h('div', { class: 'page-title' }, h('h1', {}, opLabel(op)), h('div', { class: 'muted small' }, plural(members.length, 'case'), ' · ', statusPill(op.status))),
        h('div', { class: 'spacer' }),
        // v1.85: Close Mission lives here (it was on every case's Details tab): each open case number
        // gets a disposition; Reopen Mission when it is closed.
        (() => {
          const open = members.filter((x) => !isArchivedEntry(x) && x.status !== 'Closed');
          if (open.length) return h('button', { class: 'btn', type: 'button', icon: 'lock-fill', title: `Closes the ${plural(open.length, 'open case number')} of this Mission, each with a disposition.`, onclick: async () => {
            try { const first = await Vault.getCase(open[0].id); if (await CVClosingUI.closeCaseDialog(first, { operation: open })) redraw(); } catch (err) { if (FS.isDisconnectError(err)) onDriveLost(); else toast(err.message, 'error'); }
          } }, 'Close Mission');
          if (op.status === 'Closed') return h('button', { class: 'btn', type: 'button', icon: 'unlock', title: 'Back to Open. Its cases stay closed until you reopen each one.', onclick: async () => {
            try { await Save.track(`op:${op.id}`, () => Vault.updateOperation(op.id, { status: 'Open', end: '' })); toast('Mission reopened.', 'success'); renderCaseList(); redraw(); } catch { /* reported */ }
          } }, 'Reopen Mission');
          return null;
        })(),
        // v1.180: the closed Mission's case numbers to the archive together.
        op.status === 'Closed' && members.some((x) => !isArchivedEntry(x) && x.status === 'Closed')
          ? h('button', { class: 'btn op-archive-btn', type: 'button', icon: 'archive', title: 'Moves the Mission\'s closed case numbers to the archive together, with one reason', onclick: () => archiveMission(op, members, redraw) }, 'Archive Case Numbers') : null,
        // v1.180: the Mission on one page, as a PDF.
        // v1.184: the Closing Summary memo, drafted by the AI.
        members.length ? h('button', { class: 'btn op-memo-btn', type: 'button', icon: 'journal-text', title: 'A short memo about the Mission for a supervisor or prosecutor, drafted by the AI from the Closeout\'s facts', onclick: () => missionMemo(op, members) }, 'Closing Summary') : null,
        members.length ? h('button', { class: 'btn op-closeout-btn', type: 'button', icon: 'file-earmark-pdf', title: 'Case numbers and dispositions, what became of each suspect, the buys and the evidence, as a PDF', onclick: () => missionCloseout(op, members) }, 'Closeout PDF') : null,
        h('button', { class: 'btn', type: 'button', icon: 'pencil', onclick: async () => { if (await operationDialog(op)) redraw(); } }, 'Edit Mission')),
      // v1.176: the dates on one line (the number, name and status are in the title above).
      op.start || op.end ? h('p', { class: 'op-dates muted' }, [op.start ? `Started ${fmtDate(op.start)}` : '', op.end ? `Ended ${fmtDate(op.end)}` : ''].filter(Boolean).join(' · ')) : null,
      op.notes ? h('div', { class: 'op-notes' }, h('span', { class: 'op-info-label' }, 'Notes'), h('p', {}, op.notes)) : null,
      // v1.179: what became of its suspects, saved when it closed.
      op.status === 'Closed' && op.outcome ? h('div', { class: 'op-notes op-outcome' }, h('span', { class: 'op-info-label' }, 'Suspects'), h('p', {}, op.outcome),
        ...(op.later || []).map((l) => h('p', { class: 'op-later' }, l))) : null, // v1.180: an arrest made later on a case it carried on in
      // v1.74: plain headers; the explanations sit under each section, small.
      h('div', { class: 'section-head op-files-head' }, h('h2', { class: 'section-title caps' }, 'Case Numbers'), h('div', { class: 'spacer' }),
        h('button', { class: 'btn', type: 'button', icon: 'link-45deg', onclick: async () => { if (await addExistingDialog(op)) redraw(); } }, 'Add Existing Case'),
        h('button', { class: 'btn primary', type: 'button', icon: 'plus-lg', onclick: () => newCase({ operationId: op.id }) }, 'New Case in this Mission')),
      members.length ? progressBox : null,
      members.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'data-table op-cases-table' },
        // v1.119: every column named and lined up on the left.
        // v1.123: the subject in Last / First / M.I. columns and the dates in month / day / year columns, all lined up.
        h('thead', {}, h('tr', {}, ['Case Number', 'Last Name', 'First Name', 'M.I.', 'Status', 'Opened', 'Closing', 'Go To', 'Move'].map((x) => h('th', { class: /Name$|M\.I\./.test(x) ? 'name-cell' : '' }, x)))),
        h('tbody', {}, members.map((c) => h('tr', { class: isArchivedEntry(c) ? 'archived-row' : '' },
          h('td', {}, h('a', { href: caseLink(c), class: 'case-num-link' }, c.number || 'No case number')),
          ...nameCells(c.subject, { initial: true }),
          h('td', {}, statusPill(isArchivedEntry(c) ? 'Archived' : c.status)),
          h('td', { class: 'nowrap' }, dateCols(c.opened)),
          h('td', { class: 'op-closing', 'data-case': c.id }, h('span', { class: 'muted small' }, '…')),
          // v1.130: one Open menu per row (Details, Reports, Files), so every row is one line tall.
          h('td', { class: 'nowrap' }, openMenu(c)),
          h('td', { class: 'nowrap' }, isArchivedEntry(c)
            ? h('span', { class: 'muted small', title: 'Archived cases are read-only. Restore it to unlink it.' }, 'Archived')
            : h('button', { class: 'btn small', type: 'button', icon: 'folder-symlink', title: 'Move this case to General Files or another Mission', onclick: async () => { if (await moveCaseDialog(c)) redraw(); } }, 'Move Case')))))))
        : h('div', { class: 'empty-state' }, h('p', {}, 'No cases in this Mission yet.'), h('p', { class: 'muted small' }, 'New Case in this Mission creates one; Add Existing Case links one from General Files.')),
      h('p', { class: 'muted small op-section-note' }, 'The cases linked to this Mission. They live in General Files; nothing is copied.'),
      // v1.172: what is still open on the Mission's cases.
      members.length && window.CVHealthUI ? CVHealthUI.missionPanel(members, { h, icon: I, toast, openDialog, Save, onDriveLost }, op) : null,
      // v1.78: the Mission's timeline (all its case numbers) on its main page.
      h('div', { class: 'section-head op-tl-head', id: 'op-timeline' }, h('h2', { class: 'section-title caps' }, 'Timeline')),
      tlPanel,
      // v1.111: every case number's Field Notes, in plain view.
      members.length ? fieldNotesCard(members, { key: 'mission-field-notes', mission: true }) : null,
      // v1.68: the Operation's own folder, not tied to a case number.
      h('div', { class: 'section-head op-folder-head', id: 'op-folder' }, h('h2', { class: 'section-title caps' }, 'Mission Folder'), h('div', { class: 'spacer' }),
        h('button', { class: 'btn small', type: 'button', icon: 'collection', title: 'Every file on the SSD for this Mission: its case numbers\' files and its Mission Folder', onclick: (e) => toggleAllFiles(e.currentTarget) }, 'All Files')),
      allFilesBox,
      sharedFilesBox(`op-${op.id}`, { tiles: true, tileIcon: 'folder-mission', folders: Vault.OP_FOLDERS.map((n) => ({ name: n, label: opFolderLabel(n), desc: OP_FOLDER_DESC[n] || '' })) }),
      h('p', { class: 'muted small op-section-note' }, 'For the whole Mission, not one case number. Kept on the SSD in CaseVault-Data\\shared.'),
      h('section', { class: 'case-actions op-danger', 'aria-labelledby': 'op-actions-title' },
        h('h3', { id: 'op-actions-title', icon: 'sliders' }, 'Mission actions'),
        h('div', { class: 'case-actions-grid' },
          h('button', { class: 'btn danger action-btn', type: 'button', icon: 'trash3', title: 'Removes the Mission only. Its cases and files stay in General Files.', onclick: async () => {
            const ok = await confirmDialog({ title: 'Delete Mission', danger: true, confirmText: 'Delete Mission',
              message: 'Are you sure you want to delete this Mission? The Mission and its Files folder will be removed. All associated cases and files will be preserved and will remain available in General Files as independent cases.' });
            if (!ok) return;
            try {
              await Save.flushAll();
              const n = await Save.track(`op:${op.id}`, () => Vault.deleteOperation(op.id));
              toast(`Mission deleted. ${plural(n, 'case')} kept in General Files.`, 'success', 5000);
              renderCaseList();
              location.hash = '#/general';
            } catch { /* reported by Save */ }
          } }, 'Delete Mission')))));
  }

  /** General Files: every case (archived ones too), whether or not it's in an Operation. */
  // v1.84: General Files showing one status (from the banner's counts).
  function showGeneralWith(show) {
    state.generalShow = show;
    state.generalQuery = '';
    if (location.hash === '#/general') showGeneralFiles(); else location.hash = '#/general';
  }

  function showGeneralFiles() {
    pageStart('General Files');
    const dups = CVOperation.duplicateNumbers(Vault.data.cases);
    const q = h('input', { type: 'search', placeholder: 'Search by case number, subject or Mission', 'aria-label': 'Search General Files', value: state.generalQuery || '' });
    const show = h('select', { 'aria-label': 'Show' }, [['all', 'All cases'], ['loose', 'General Files only'], ['linked', 'In a Mission'], ['open', 'Open'], ['closed', 'Closed'], ['overdue', 'Overdue'], ['archived', 'Archived']].map(([v, l]) => h('option', { value: v, selected: v === (state.generalShow || 'all') }, l)));
    const body = h('tbody', {});
    const countEl = h('span', { class: 'muted small' });
    const redraw = () => { renderCaseList(); showGeneralFiles(); };
    // v1.101: click a heading to sort by it (again to reverse); Age is days since the case was opened.
    const sortTh = (label, key, cls = '') => h('th', { class: cls, 'data-sort': key },
      h('button', { type: 'button', class: 'th-sort', title: `Sort by ${label}`, onclick: () => {
        const cur = state.generalSort || { key: 'number', dir: 1 };
        state.generalSort = { key, dir: cur.key === key ? -cur.dir : 1 };
        draw();
      } }, label, h('span', { class: 'th-arrow', 'aria-hidden': 'true' })));
    // v1.111: the Subject Name in three columns: Last, First, Middle.
    const head = h('thead', {}, h('tr', {}, sortTh('Case Number', 'number'), sortTh('Last Name', 'subject', 'name-cell'), sortTh('First Name', 'first', 'name-cell'), h('th', { class: 'name-cell', title: 'Middle name' }, 'Middle'), h('th', {}, 'Mission'), h('th', {}, 'Status'),
      sortTh('Opened', 'opened', 'date-cell'), sortTh('Age', 'age', 'age-cell'), h('th', {}, '')));
    const draw = () => {
      state.generalQuery = q.value;
      state.generalShow = show.value;
      const t = q.value.trim().toLowerCase();
      const list = (Vault.data.cases || []).filter((c) => {
        const op = opOf(c);
        if (show.value === 'loose' && (op || isArchivedEntry(c))) return false;
        if (show.value === 'linked' && !op) return false;
        if (show.value === 'archived' && !isArchivedEntry(c)) return false;
        if (['open', 'closed'].includes(show.value) && (isArchivedEntry(c) || String(c.status).toLowerCase() !== show.value)) return false;
        if (show.value === 'overdue' && (isArchivedEntry(c) || c.status === 'Closed' || !caseDue(c) || caseDue(c).cls !== 'overdue')) return false;
        return !t || [c.number, c.subject, subj(c), c.title, c.fileNumber, c.status, op ? opLabel(op) : 'general files'].join(' ').toLowerCase().includes(t);
      }).sort(byNumber);
      // v1.101: sort by any column heading; Age (and Opened) put the oldest or newest case first.
      const srt = state.generalSort || { key: 'number', dir: 1 };
      const openedOf = (c) => c.opened || '9999-99-99';
      const np = (c) => CVOperation.nameParts(c.subject);
      const nameKey = (c, firstFirst) => { const p = np(c); return (firstFirst ? [p.first, p.last, p.middle] : [p.last, p.first, p.middle]).join('\u0001').toLowerCase(); };
      // Cases with no subject go last either way.
      const noName = (c) => (String(c.subject || '').trim() ? 0 : 1);
      if (srt.key === 'subject') list.sort((a, b) => noName(a) - noName(b) || srt.dir * nameKey(a).localeCompare(nameKey(b)) || byNumber(a, b));
      else if (srt.key === 'first') list.sort((a, b) => noName(a) - noName(b) || srt.dir * nameKey(a, true).localeCompare(nameKey(b, true)) || byNumber(a, b));
      else if (srt.key === 'opened') list.sort((a, b) => srt.dir * openedOf(a).localeCompare(openedOf(b)) || byNumber(a, b));
      else if (srt.key === 'age') list.sort((a, b) => srt.dir * openedOf(a).localeCompare(openedOf(b)) || byNumber(a, b)); // oldest first, then newest
      else if (srt.dir < 0) list.reverse();
      head.querySelectorAll('th[data-sort]').forEach((th) => { const on = th.dataset.sort === srt.key; const up = (srt.dir > 0) !== (th.dataset.sort === 'age'); th.setAttribute('aria-sort', on ? (up ? 'ascending' : 'descending') : 'none'); });
      countEl.textContent = `${plural(list.length, 'case')}${list.length !== Vault.data.cases.length ? ` of ${Vault.data.cases.length}` : ''}`;
      body.replaceChildren(...(list.length ? list.map((c) => {
        const op = opOf(c);
        const dup = dups.has(CVOperation.normNumber(c.number));
        const arch = isArchivedEntry(c);
        // v1.50: one Move File button (it was Unlink, or an "Assign to…" list).
        const action = arch ? null : h('button', { class: 'btn small', type: 'button', icon: 'folder-symlink', title: 'Move this case into a Mission, to another one, or back to General Files', onclick: async () => { if (await moveCaseDialog(c)) redraw(); } }, 'Move Case');
        return h('tr', { class: arch ? 'archived-row' : '' },
          h('td', {}, h('a', { href: caseLink(c), class: 'case-num-link' }, c.number || 'No case number'),
            dup ? h('span', { class: 'dup-flag', title: 'Another case has the same Case Number (made before numbers had to be unique). Nothing was changed.' }, I('exclamation-triangle-fill'), 'Duplicate') : null),
          ...nameCells(c.subject),
          // v1.118: the Mission's number on one line; its name in the hover box.
          h('td', { class: 'gen-mission' }, op ? h('a', { href: `#/operation/${encodeURIComponent(op.id)}`, title: opLabel(op) }, op.number || op.name || 'Mission')
            : c.suspectGroup ? h('a', { class: 'gen-sg', href: `#/group/${CVRoute.enc(c.suspectGroup)}`, title: `Case Group ${c.suspectGroup} (not a Mission)` }, c.suspectGroup, I('person-badge')) : h('span', { class: 'muted' }, '—')),
          h('td', {}, statusPill(arch ? 'Archived' : c.status)),
          h('td', { class: 'nowrap date-cell' }, dateCols(c.opened)),
          h('td', { class: 'nowrap age-cell' }, (() => { const o = openedAge(c.opened); return o ? (o.future ? h('span', { class: 'age-future', title: `${o.ageLong}: the Opened date is in the future. Check it on the Details tab.` }, I('exclamation-triangle-fill'), o.age) : h('span', { title: `${o.days} day${o.days === 1 ? '' : 's'} since it was opened` }, o.ageLong)) : '—'; })()),
          h('td', { class: 'nowrap' }, action));
      }) : [h('tr', {}, h('td', { colspan: 9, class: 'muted empty-cell' }, Vault.data.cases.length ? 'No cases match.' : 'No cases yet. New Case makes one.'))]));
    };
    q.addEventListener('input', debounce(draw, 120));
    show.addEventListener('change', draw);
    draw();
    $('#main').replaceChildren(h('section', { class: 'ops-page general-page' },
      h('div', { class: 'page-head' },
        h('span', { class: 'page-icon gf-icon' }, I('folder-fill')),
        h('div', { class: 'page-title' }, h('h1', {}, 'General Files'), h('div', { class: 'muted small' }, 'Every case, in a Mission or not. A Mission only links cases; they are always kept here.')),
        h('div', { class: 'spacer' }),
        h('a', { class: 'btn', href: '#/operations', icon: 'op-folder' }, 'Missions'),
        // v1.146: group related independent cases under a name (not an Operation).
        h('button', { class: 'btn', type: 'button', icon: 'person-badge', title: 'Group related independent cases under a name you give it', onclick: async () => { const n = await caseGroupDialog(); if (n) location.hash = `#/group/${CVRoute.enc(n)}`; } }, 'New Case Group'),
        h('button', { class: 'btn primary', type: 'button', icon: 'plus-lg', onclick: () => newCase() }, 'New Case')),
      dups.size ? h('p', { class: 'warn-note small', role: 'note' }, I('exclamation-triangle-fill'), ` ${plural(dups.size, 'Case Number')} ${dups.size === 1 ? 'is' : 'are'} used by more than one case (made before numbers had to be unique). They are flagged below; nothing was changed.`) : null,
      h('div', { class: 'general-tools' }, q, show, countEl),
      h('div', { class: 'table-wrap' }, h('table', { class: 'data-table general-table' },
        head,
        body))));
  }

  /* Operations on the Overview (v1.28): a blue folder for each operation (Title or Operation Name),
   * its name under it. Click one to open it: its case numbers, each with its Reports, Field Notes,
   * Files (photos, documents) and Timeline. Which one is open is remembered for this visit. */
  const opFolderState = { open: '', close: null };
  // v1.44: just Details, Reports and Files, as words.
  const OP_TABS = [['details', 'Details'], ['reports', 'Reports'], ['files', 'Files']];
  /* v1.130: a small Open menu (a <details>): Details, Reports and Files of one case. A click on a
   * choice, outside it, or Esc closes it. */
  function openMenu(c) {
    const det = h('details', { class: 'row-menu' },
      h('summary', { class: 'btn small', 'aria-label': `Open ${c.number || 'the case'}` }, 'Open', I('chevron-down')),
      h('div', { class: 'row-menu-list', role: 'menu' }, OP_TABS.map(([tab, label]) => h('a', { role: 'menuitem', href: caseLink(c, tab), onclick: () => { det.open = false; } }, label))));
    return det;
  }
  document.addEventListener('click', (e) => { for (const d of document.querySelectorAll('details.row-menu[open]')) if (!d.contains(e.target)) d.open = false; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') for (const d of document.querySelectorAll('details.row-menu[open]')) { d.open = false; d.querySelector('summary').focus(); } });
  // Empty space: anything that isn't a control, a link, a folder, the open folder's cases or the
  // timeline, and nothing inside a dialog or the sidebar.
  // v1.47: the General Files year folders close the same way.
  const yearFolderState = { open: '', close: null };
  // v1.116: CLOSED FILES and ARCHIVED too.
  const closedFolderState = { open: '', sub: '', close: null };
  const archFolderState = { open: '', sub: '', close: null };
  const FOLDER_STATES = [opFolderState, yearFolderState, closedFolderState, archFolderState];
  document.addEventListener('click', (e) => {
    if (!FOLDER_STATES.some((st) => st.open && st.close)) return;
    const t = e.target;
    if (!(t instanceof Element) || !t.closest('#main')) return;
    if (t.closest('a, button, input, select, textarea, label, summary, details, [role="button"], [contenteditable], .op-folder-tile, .op-open, .op-open-section, .op-timeline-section, .dialog')) return;
    if (window.getSelection && String(window.getSelection())) return; // selecting text isn't a click away
    for (const st of FOLDER_STATES) if (st.open && st.close) st.close();
  });
  /** A case as a card on the Overview: its number, subject (and Operation), status and tabs. */
  function overviewCard(c, withOp = false) {
    const to = (tab, sub) => `#/case/${CVRoute.enc(c.id)}/${tab}${sub ? `/${sub}` : ''}`;
    const op = withOp ? opOf(c) : null;
    return h('div', { class: 'op-case-card' },
      h('a', { class: 'op-case-top', href: to('details') }, h('span', { class: 'op-case-id' }, h('span', { class: 'op-case-num' }, c.number || 'No case number yet'),
        h('span', { class: 'op-case-subject muted' }, [subj(c) || 'No subject yet', op ? opLabel(op) : ''].filter(Boolean).join(' · '))), statusPill(c.status)),
      // v1.135: when a closed or archived case was closed (and archived).
      (c.status === 'Closed' || isArchivedEntry(c)) && (c.closed || c.archived) ? h('div', { class: 'op-case-dates muted small' },
        h('span', {}, [c.closed && `Closed ${fmtDate(c.closed)}`, isArchivedEntry(c) && c.archived && `Archived ${fmtDate(c.archived)}`].filter(Boolean).join(' · ')), I('calendar-check')) : null,
      h('nav', { class: 'op-case-links', 'aria-label': `${c.number || 'Case'} tabs` },
        ...OP_TABS.map(([tab, label]) => h('a', { class: 'op-tab-link', href: to(tab) }, label))));
  }
  /* General Files on the Overview (v1.47): the cases that aren't in an Operation, a folder for each
   * year they were opened (newest first), between Operations and Recently Updated. Click a year to
   * see its cases under the folders. */
  /** v1.71: the Overview's section header, the same for every section: the title in capitals with
   * a one-line description under it, and its button on the right. */
  function panelHead(title, desc, action = '') {
    return h('div', { class: 'section-head ov-head' },
      h('div', { class: 'ov-head-text' }, h('h2', { class: `section-title caps${/ (Files|Cases)$/i.test(title) ? ' ov-files-title' : ''}` }, h('span', { class: /^Other Files$/i.test(title) ? 'ov-title-wide' : '' }, title)), h('span', { class: 'ov-desc muted small' }, desc)),
      h('div', { class: 'spacer' }), action || h('span', { class: 'ov-action-space' }));
  }
  /** v1.74: OTHER FILES with New Folder in its header, like All Cases and All Operations. */
  function otherFilesSection() {
    const files = sharedFilesBox('other', { allowNew: true, newTile: false, tiles: true, tileIcon: 'folder-other', empty: 'No files yet. Add forms, training or reference sheets here.',
      getFolders: async () => [...Vault.OTHER_FOLDERS, ...(await Vault.otherCustomFolders()).map((n) => ({ name: n, custom: true }))] });
    return h('div', { class: 'dash-section ov-panel other-files-section' },
      panelHead('Other Files', 'Not tied to a case number or a Mission. Kept on the SSD in CaseVault-Data\\shared\\other.',
        h('button', { type: 'button', class: 'btn small ov-btn-other', icon: 'folder-other', title: 'Make a new folder in Other Files', onclick: () => files.newFolder() }, 'New Folder')),
      files);
  }
  /** v1.112: the Secure Locker in its own section, under Other Files. */
  function secureLockerSection() {
    const open = !!(window.CVLockerUI && CVLockerUI.isUnlocked());
    return h('div', { class: 'dash-section ov-panel locker-section' },
      panelHead('Secure Locker', 'Encrypted on the SSD, behind its own password.',
        h('a', { class: 'btn small ov-btn-locker', href: '#/locker', icon: open ? 'unlock' : 'lock-fill', title: 'Open the Secure Locker (asks for its password)' }, 'Open Locker')),
      h('div', { class: 'op-folders', role: 'list' },
        h('a', { role: 'listitem', class: 'op-folder-tile locker-tile', href: '#/locker', title: 'Secure Locker: Password Manager, Confidential (Informant) Files and Covert aliases and accounts' },
          h('span', { class: 'op-folder-art' }, I('safe2')), h('span', { class: 'op-folder-name' }, 'Secure Locker'))));
  }
  /** v1.116: a Mission is closed when it says so, or when every one of its case numbers is closed. */
  function missionClosed(op, active) {
    const mine = active.filter((c) => c.operationId === op.id);
    return op.status === 'Closed' || (mine.length > 0 && mine.every((c) => c.status === 'Closed'));
  }
  /** v1.116: a section of folders, each opening its cases below (CLOSED FILES, ARCHIVED).
   * v1.134: a folder for each year first; a year opens its folders, a folder its cases.
   * years: [{ k, name, folders: [{ k, name, sub, icon, title, group, href, label }] }]. A folder's
   * count is on its badge only (not repeated under its name). */
  function caseFolderSection({ cls, title, desc, action, years, icon, st, empty, what }) {
    const box = h('div', { class: `dash-section ov-panel op-folders-section ${cls}` });
    const plural2 = (n) => `${n} case number${n === 1 ? '' : 's'}`;
    const tile = (o, isOpen, onclick, extra = '') => h('button', { type: 'button', role: 'listitem', class: `op-folder-tile done-tile${extra} ${isOpen ? 'open' : ''}`, 'aria-expanded': String(isOpen), title: o.title, onclick },
      h('span', { class: 'op-folder-art' }, I(o.icon), countBadge(o.count || 0)),
      o.sub ? h('span', { class: 'op-folder-name op-two-line' }, h('span', { class: 'op-num' }, o.name), h('span', { class: 'op-title' }, o.sub)) : h('span', { class: 'op-folder-name' }, o.name));
    const draw = () => {
      const year = years.find((y) => y.k === st.open);
      const folder = year && year.folders.find((f) => f.k === st.sub);
      const yearTiles = h('div', { class: 'op-folders', role: 'list' }, years.map((y) => {
        const n = y.folders.reduce((t, f) => t + f.group.length, 0);
        return tile({ icon, name: y.name, count: n, title: `${y.name}: ${plural2(n)} ${what}` }, year === y, () => { st.open = year === y ? '' : y.k; st.sub = ''; draw(); }, ' year-group-tile');
      }));
      const inYear = year ? h('div', { class: 'op-open done-year' },
        h('div', { class: 'op-open-head' }, h('strong', {}, `${title} ${year.name}`), h('span', { class: 'muted small' }, plural2(year.folders.reduce((t, f) => t + f.group.length, 0)))),
        h('div', { class: 'op-folders', role: 'list' }, year.folders.map((f) => tile({ ...f, count: f.group.length }, folder === f, () => { st.sub = folder === f ? '' : f.k; draw(); }))),
        folder ? h('div', { class: 'op-open done-folder' },
          h('div', { class: 'op-open-head' }, folder.href ? h('a', { href: folder.href, class: 'op-open-name' }, h('strong', {}, folder.label || folder.name)) : h('strong', {}, folder.label || folder.name),
            h('span', { class: 'muted small' }, plural2(folder.group.length))),
          h('div', { class: 'op-open-cases' }, folder.group.map((c) => overviewCard(c)))) : null) : null;
      // v1.118: an empty section is just its header line, saying so.
      box.classList.toggle('ov-empty', !years.length);
      box.replaceChildren(...[panelHead(title, years.length ? desc : empty, action), years.length ? yearTiles : null, inYear].filter(Boolean));
    };
    st.close = () => { if (st.open && box.isConnected) { st.open = ''; st.sub = ''; draw(); } };
    if (st.open && !years.some((y) => y.k === st.open)) { st.open = ''; st.sub = ''; }
    draw();
    return box;
  }
  /** v1.134: "2026" from an ISO date, or '' (the "No Date" folder). */
  const yearOfDate = (d) => (/^\d{4}/.exec(String(d || '')) || [''])[0];
  /** v1.134: group folders under their years, newest year first, No Date last. items: [{ year, folder }]
   * where folders of the same key in the same year are merged. */
  function byYear(items) {
    const years = new Map();
    for (const { year, folder } of items) {
      if (!years.has(year)) years.set(year, new Map());
      const fs = years.get(year);
      if (fs.has(folder.k)) fs.get(folder.k).group.push(...folder.group); else fs.set(folder.k, { ...folder, group: [...folder.group] });
    }
    return [...years.keys()].sort((a, b) => (!a) - (!b) || b.localeCompare(a))
      .map((y) => ({ k: y || 'none', name: y || 'No Date', folders: [...years.get(y).values()].map((f) => ({ ...f, group: f.group.sort(byNumber) })) }));
  }
  /** v1.116: CLOSED FILES: each closed Mission with its cases; a Mission still open with closed case
   * numbers (under its own name); closed cases not in a Mission. v1.134: by the year they were closed
   * (a closed Mission by the year it ended, else its last case closed). */
  function closedFilesSection(cases) {
    const active = cases.filter((c) => !isArchivedEntry(c));
    const closedYear = (c) => yearOfDate(c.closed);
    const items = [];
    for (const op of [...Vault.listOperations()].sort((a, b) => byFileNumber(a.number, b.number) || a.name.localeCompare(b.name))) {
      const done = missionClosed(op, active);
      const group = active.filter((c) => c.operationId === op.id && (done || c.status === 'Closed'));
      if (!done && !group.length) continue;
      const folder = (g) => ({ k: op.id, name: op.number || 'No number', sub: op.name || (done ? '' : 'Ongoing'), label: opLabel(op), icon: 'folder-closed', group: g,
        href: `#/operation/${encodeURIComponent(op.id)}`, title: done ? `${opLabel(op)}: closed Mission` : `${opLabel(op)}: the Mission goes on; these case numbers are closed` });
      if (done) items.push({ year: yearOfDate(op.end) || group.map(closedYear).filter(Boolean).sort().pop() || '', folder: folder(group) });
      else for (const c of group) items.push({ year: closedYear(c), folder: folder([c]) });
    }
    for (const c of active.filter((x) => x.status === 'Closed' && (!x.operationId || !Vault.getOperation(x.operationId)))) {
      items.push({ year: closedYear(c), folder: { k: 'general', name: 'General Files', label: 'General Files, closed', icon: 'folder-closed', group: [c], title: 'Closed cases not in a Mission' } });
    }
    return caseFolderSection({ cls: 'closed-files-section', title: 'Closed Files', desc: 'Closed Missions and case numbers, by the year they were closed. Each can be reopened.', years: byYear(items), icon: 'folder-closed', what: 'closed', st: closedFolderState,
      action: h('button', { class: 'btn small ov-btn-closed', type: 'button', icon: 'folder-closed', title: 'Every closed case, in a list', onclick: () => showGeneralWith('closed') }, 'All Closed'),
      empty: 'Nothing closed yet. Close Case moves a case here; a Mission comes here when it is closed.' });
  }
  /** v1.116: ARCHIVED: a folder for each archive reason (EXPIRED, NOLLE PROSEQUI, PROSECUTION), then
   * the archived cases without one. v1.134: by the year they were archived. */
  function archivedSection(cases) {
    const items = cases.filter(isArchivedEntry).map((c) => {
      const r = Vault.ARCHIVE_FOLDERS.find(([k]) => k === c.archiveFolder);
      const name = Vault.archiveFolderName(r ? r[0] : 'other'); // v1.145: as renamed
      return { year: yearOfDate(c.archived || c.closed), folder: r ? { k: r[0], name, icon: 'folder-archived', group: [c], title: `Archived: ${name}` } : { k: 'other', name, icon: 'folder-archived', group: [c], title: `${name}: archived for another reason` } };
    });
    const order = [...Vault.ARCHIVE_FOLDERS.map(([k]) => k), 'other'];
    const years = byYear(items).map((y) => ({ ...y, folders: y.folders.sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k)) }));
    // v1.136: archived cases due for a records-retention review (set for the vault: Off, 3, 5, 7 or 10 years).
    const reviewYears = Number(Vault.data.settings.archiveReviewYears) || 0;
    const due = archiveReviewDue(cases, reviewYears);
    const reviewPick = h('select', { class: 'ov-review-pick', 'aria-label': 'Review archived cases after', title: 'Lists archived cases this many years after they were archived, for your agency\'s records-retention review. CaseVault deletes nothing on its own.' },
      [[0, 'Review: Off'], [3, 'Review After 3 Years'], [5, 'Review After 5 Years'], [7, 'Review After 7 Years'], [10, 'Review After 10 Years']].map(([n, label]) => h('option', { value: String(n), selected: n === reviewYears }, label)));
    reviewPick.addEventListener('change', async () => {
      try { await Save.track('settings', () => Vault.updateSettings({ archiveReviewYears: Number(reviewPick.value) })); showDashboard(); } catch { /* reported */ }
    });
    const reviewBtn = due.length ? h('button', { class: 'btn small ov-btn-review', type: 'button', icon: 'hourglass-split', title: `Archived ${reviewYears} or more years ago`, onclick: () => archiveReviewDialog(due, reviewYears) }, `Review (${due.length})`) : null;
    return caseFolderSection({ cls: 'archived-section', title: 'Archived', desc: 'Archived cases, by the year they were archived, then by reason. Restore brings one back.', years, icon: 'folder-archived', what: 'archived', st: archFolderState,
      action: h('div', { class: 'ov-head-actions' }, reviewPick, reviewBtn,
        h('button', { class: 'btn small ov-btn-rename', type: 'button', icon: 'pencil-square', title: 'Give the archive folders your own names. The cases in them stay where they are.', onclick: () => renameArchiveFolders() }, 'Rename Folders'),
        h('button', { class: 'btn small ov-btn-archived', type: 'button', icon: 'folder-archived', title: 'Every archived case, in a list', onclick: () => showGeneralWith('archived') }, 'All Archived')), empty: 'Nothing archived. Archive (on a closed case) moves it here.' });
  }
  /** v1.145: Rename Folders (Archived): your own name for each archive folder, kept in vault.json.
   * Empty puts the standard name back. Only the names change; every case stays in its folder. */
  async function renameArchiveFolders() {
    const keys = [...Vault.ARCHIVE_FOLDERS.map(([k, label]) => [k, label]), ['other', 'Other']];
    const own = { ...(Vault.data.settings.archiveFolderNames || {}) };
    const names = await openDialog((close) => {
      const inputs = keys.map(([k, std]) => {
        const el = h('input', { type: 'text', maxlength: 40, value: own[k] || '', placeholder: std, 'aria-label': `Name for ${std}` });
        return [k, el, field(`${std} Folder`, el)];
      });
      inputs[0][1].setAttribute('autofocus', 'true');
      return h('form', { class: 'rename-arch-form', onsubmit: (e) => { e.preventDefault(); close(Object.fromEntries(inputs.map(([k, el]) => [k, el.value.trim().slice(0, 40)]).filter(([, v]) => v))); } },
        h('h2', { icon: 'pencil-square' }, 'Rename Archive Folders'),
        h('p', { class: 'muted small' }, 'Type a new name for any folder. Leave a box empty to keep the standard name. The cases stay in their folders; only the names change.'),
        h('div', { class: 'form-grid' }, inputs.map(([, , f]) => f)),
        CVKit.cancelRow(h, () => close(null), h('button', { class: 'btn primary', type: 'submit' }, 'Save')));
    });
    if (!names) return;
    try { await Save.track('settings', () => Vault.updateSettings({ archiveFolderNames: names })); toast('Archive folders renamed.', 'success', 2500); showDashboard(); } catch { /* reported */ }
  }
  /** v1.136: archived cases archived `years` or more years ago (oldest first); [] when off. */
  function archiveReviewDue(cases, years) {
    if (!years || !globalThis.CVLimits) return [];
    const now = today();
    return cases.filter(isArchivedEntry).filter((c) => { const d = c.archived || c.closed; return /^\d{4}-\d{2}-\d{2}$/.test(d || '') && CVLimits.addYears(d, years) <= now; })
      .sort((a, b) => (a.archived || a.closed).localeCompare(b.archived || b.closed));
  }
  function archiveReviewDialog(due, years) {
    return openDialog((close) => h('div', { class: 'review-form' },
      h('h2', { icon: 'hourglass-split' }, `Archived ${years}+ Years Ago`),
      h('p', { class: 'muted small' }, `${plural(due.length, 'case')} archived ${years} or more years ago. Check each against your agency's records-retention rules. CaseVault deletes nothing on its own: Delete Case (on the case) moves one to Recently Deleted.`),
      h('table', { class: 'data-table review-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Case Number'), h('th', {}, 'Subject'), h('th', {}, 'Archived'), h('th', {}, 'Reason'), h('th', {}, ''))),
        h('tbody', {}, due.map((c) => h('tr', {}, h('td', {}, c.number || 'No case number'), h('td', {}, subj(c) || '—'), h('td', { class: 'nowrap' }, fmtDate(c.archived || c.closed)),
          h('td', {}, Vault.archiveFolderName(c.archiveFolder || 'other')),
          h('td', {}, h('a', { class: 'btn small', href: caseLink(c, 'details'), onclick: () => close() }, 'Open')))))),
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
  }
  function generalYearFolders(cases) {
    // v1.116: closed cases are under CLOSED FILES.
    const loose = cases.filter((c) => !isArchivedEntry(c) && c.status !== 'Closed' && (!c.operationId || !Vault.getOperation(c.operationId)));
    const yearOf = (c) => (/^\d{4}/.exec(String(c.opened || '')) || [''])[0];
    const years = [...new Set(loose.map(yearOf))].sort((a, b) => (!a) - (!b) || b.localeCompare(a));
    const list = years.map((y) => ({ k: y || 'none', name: y || 'No Date', group: loose.filter((c) => yearOf(c) === y).sort(byNumber) }));
    // v1.112: an empty General Files shows this year's folder, empty, rather than no folder at all.
    if (!list.length) list.push({ k: 'empty', name: String(new Date().getFullYear()), group: [], placeholder: true });
    const box = h('div', { class: 'dash-section ov-panel op-folders-section general-years-section' });
    const draw = () => {
      const open = list.find((o) => o.k === yearFolderState.open);
      const tiles = h('div', { class: 'op-folders', role: 'list' }, list.map((o) => {
        const bell = o.group.some((c) => caseDue(c) && c.status !== 'Closed');
        return h('button', { type: 'button', role: 'listitem', class: `op-folder-tile year-tile ${open === o ? 'open' : ''}${o.placeholder ? ' placeholder-tile' : ''}`, 'aria-expanded': String(open === o),
          title: o.placeholder ? 'No cases outside a Mission yet: New Case puts one here' : `${o.name}: ${o.group.length} case${o.group.length === 1 ? '' : 's'} not in a Mission`,
          onclick: () => { yearFolderState.open = open === o ? '' : o.k; draw(); } },
        h('span', { class: 'op-folder-art' }, I('folder-general'), countBadge(o.group.length)),
        h('span', { class: 'op-folder-name' }, o.name, bell ? h('span', { class: 'case-bell', 'aria-label': 'Deadline' }, I('bell-fill')) : null));
      }));
      const inside = open ? h('div', { class: 'op-open' },
        h('div', { class: 'op-open-head' }, h('strong', {}, `General Files ${open.name}`), h('span', { class: 'muted small' }, `${open.group.length} case${open.group.length === 1 ? '' : 's'}`),
          h('div', { class: 'spacer' }), h('button', { type: 'button', class: 'btn small', onclick: () => newCase() }, 'New Case')),
        h('div', { class: 'op-open-cases' }, open.op ? h('a', { class: 'op-folder-card', href: `#/operation/${encodeURIComponent(open.op.id)}`, title: 'Subpoenas, Affidavits, Mission Plans, Maps, Subject Data and the Vehicle List, for the whole Mission' },
          I('op-folder'), h('span', { class: 'op-folder-card-text' }, h('strong', {}, 'Mission Folder'), h('span', { class: 'muted small' }, Vault.OP_FOLDERS.map(opFolderLabel).join(' · ')))) : null,
        ...open.group.map((c) => overviewCard(c)),
        open.group.length ? null : h('p', { class: 'muted small empty-note' }, I('folder-general'), h('span', {}, 'Empty. Cases not in a Mission show here, in the year they were opened. New Case makes one.')))) : null;
      box.replaceChildren(...[panelHead('General Files', 'Cases not in a Mission, by the year they were opened.', h('a', { class: 'btn small ov-btn-general', href: '#/general', icon: 'folder-general' }, 'All Cases')),
        tiles, inside].filter(Boolean));
    };
    yearFolderState.close = () => { if (yearFolderState.open && box.isConnected) { yearFolderState.open = ''; draw(); } };
    draw();
    return box;
  }
  function operationFolders(cases, tlBox = null, opBox = null) {
    const active = cases.filter((c) => !isArchivedEntry(c));
    // v1.46: a folder for each Operation (Operation Number order, as in the case list), then
    // General Files with the cases that aren't in one.
    // v1.116: closed Missions, and the closed case numbers of the open ones, are under CLOSED FILES.
    // v1.148: in Operation Number order, the newest first, or the most alerts first (kept on this PC).
    const opSort = (() => { try { return localStorage.getItem('cv-op-sort') || 'number'; } catch { return 'number'; } })();
    const alerts = (o) => o.group.filter((c) => caseDue(c)).length;
    const newest = (o) => o.op.start || o.op.created || '';
    const list = Vault.listOperations().filter((op) => !missionClosed(op, active)).map((op) => ({ k: op.id, op, name: opLabel(op), group: active.filter((c) => c.operationId === op.id && c.status !== 'Closed').sort(byNumber) }))
      .sort((a, b) => (opSort === 'newest' ? newest(b).localeCompare(newest(a)) : opSort === 'alerts' ? alerts(b) - alerts(a) : 0) || byFileNumber(a.op.number, b.op.number) || a.op.name.localeCompare(b.op.name));
    const sortPick = h('select', { class: 'ov-op-sort', 'aria-label': 'Order of the Mission folders', title: 'The order of the folders (kept on this PC)' },
      [['number', 'By Number'], ['newest', 'Newest First'], ['alerts', 'Most Alerts First']].map(([v, l]) => h('option', { value: v, selected: v === opSort }, l)));
    sortPick.addEventListener('change', () => { try { localStorage.setItem('cv-op-sort', sortPick.value); } catch { /* this time only */ } showDashboard(); });
    // v1.47: General Files has its own section below, by year.
    const box = h('div', { class: 'dash-section ov-panel op-folders-section' });
    const draw = () => {
      const open = list.find((o) => o.k === opFolderState.open);
      const tiles = h('div', { class: 'op-folders', role: 'list' }, list.map((o) => {
        const bell = o.group.some((c) => caseDue(c) && c.status !== 'Closed');
        return h('button', { type: 'button', role: 'listitem', class: `op-folder-tile ${open === o ? 'open' : ''}`, 'aria-expanded': String(open === o),
          title: `${o.name}: ${o.group.length} case number${o.group.length === 1 ? '' : 's'}`,
          onclick: () => { opFolderState.open = open === o ? '' : o.k; draw(); } },
        h('span', { class: 'op-folder-art' }, I('folder-mission'), countBadge(o.group.length, 'op-folder-count', 'case number')),
        // v1.60: Operation Number on top, name below (as in the sidebar).
        h('span', { class: 'op-folder-name op-two-line' }, ...[h('span', { class: 'op-num' }, o.op.number || 'No number', bell ? h('span', { class: 'case-bell', 'aria-label': 'Deadline' }, I('bell-fill')) : null),
          o.op.name ? h('span', { class: 'op-title' }, o.op.name) : null].filter(Boolean)));
      }));
      const inside = open ? h('div', { class: 'op-open' },
        h('div', { class: 'op-open-head' }, h('a', { href: open.op ? `#/operation/${encodeURIComponent(open.op.id)}` : '#/general', class: 'op-open-name' }, h('strong', {}, open.name)), h('span', { class: 'muted small' }, `${open.group.length} case number${open.group.length === 1 ? '' : 's'}`),
          h('div', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn small', onclick: () => newCase(open.op ? { operationId: open.op.id } : {}) }, open.op ? 'Add Case Number' : 'New Case')),
        h('div', { class: 'op-open-cases' }, open.group.length ? open.group.map((c) => overviewCard(c)) : [h('p', { class: 'muted' }, open.op ? 'No cases in this Mission yet. Add Case Number creates one here.' : 'No cases in General Files.')])) : null;
      box.replaceChildren(...[panelHead('Missions', 'Case numbers worked together. Click a folder to open it.', h('div', { class: 'ov-head-actions' },
          list.length > 1 ? sortPick : null,
          // v1.78: New Mission right here, beside All Missions.
          h('button', { class: 'btn small ov-btn-mission', type: 'button', icon: 'plus-lg', onclick: async () => { const op = await operationDialog(); if (op) { renderCaseList(); location.hash = `#/operation/${encodeURIComponent(op.id)}`; } } }, 'New Mission'),
          h('a', { class: 'btn small ov-btn-mission', href: '#/operations', icon: 'folder-mission' }, 'All Missions'))),
        list.length ? tiles : null, opBox ? null : inside].filter(Boolean));
      box.classList.toggle('ov-empty', !list.length); // v1.118: no open Mission: just the header line
      if (!list.length) { const d = box.querySelector('.ov-desc'); if (d) d.textContent = 'No open Missions. New Mission makes one; closed ones are under Closed Files.'; }
      if (opBox) { opBox.hidden = !inside; opBox.replaceChildren(...(inside ? [inside] : [])); }
      if (tlBox) drawTimeline(open);
    };
    // The open operation's Timeline (v1.32): every case number's events, in its own section.
    // v1.103: the slim line with small circles from a case's Details tab (one circle per event,
    // close ones share a circle with their count, a red Today mark). Point at a circle for the
    // date, title and note; click it to open that case's Timeline tab.
    function drawTimeline(open) {
      if (!open || !open.group.length) { tlBox.hidden = true; tlBox.replaceChildren(); return; }
      tlBox.hidden = false;
      tlBox.replaceChildren(
        h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, `Timeline: ${open.name}`)),
        miniTimeline(open.group[0], open.group));
    }
    // v1.38: a click on empty space on the Overview closes the open folder.
    opFolderState.close = () => { if (opFolderState.open && box.isConnected) { opFolderState.open = ''; draw(); } };
    draw();
    return box;
  }

  /* The landing page's welcome banner (v1.21): a greeting, the date and time, what needs you
   * today, and one-click actions. */
  /* v1.128: when the full backup is due, one slim line under the banner (it used to float over the
   * page): what is due, Back Up Now, and × to hide it for today. */
  function backupBarDue() {
    const n = fullBackupAge();
    if (n != null && n <= fullBackupDays() && !backupByCount() && !backupTestDue()) return false;
    let hidden = '';
    try { hidden = localStorage.getItem('cv-backup-bar') || ''; } catch { /* not kept: show it */ }
    return hidden !== Vault.localDay();
  }
  /** v1.171: the backup is recent enough; only its test is due. */
  function backupOnlyTest() { const n = fullBackupAge(); return n != null && n <= fullBackupDays() && !backupByCount(); }
  function backupBar() {
    if (!backupBarDue()) return null;
    // v1.171: a recent full backup that hasn't been tested (Test Restore) in a month: test it.
    const onlyTest = backupOnlyTest();
    const t = Vault.data.settings.lastBackupTest;
    const bar = h('div', { class: 'backup-bar', role: 'status' },
      I('exclamation-triangle-fill'),
      onlyTest ? h('span', { title: 'Test Restore reads part of the backup back and compares it with the SSD. Nothing is changed.' }, t && t.at && !t.ok ? 'The last backup test found problems: make a new backup and test it.' : t && t.at ? `Backup last tested ${Math.floor((Date.now() - Date.parse(t.at)) / 86400000)} days ago: test it again.` : 'Your backup hasn\'t been tested yet: make sure it reads back.')
        : h('span', { title: 'A copy on a second drive is what saves your cases if this SSD is lost or fails.' }, `${fullBackupText()}: copy the vault to a second drive.`),
      onlyTest ? h('button', { type: 'button', class: 'btn small', icon: 'clipboard2-pulse', onclick: () => testRestoreDialog() }, 'Test Backup')
        : h('button', { type: 'button', class: 'btn small', icon: 'hdd-fill', onclick: () => showVaultPanel('backups') }, 'Back Up Now'),
      h('button', { type: 'button', class: 'icon-btn backup-bar-close', 'aria-label': 'Hide for today', title: 'Hide for today', onclick: () => {
        try { localStorage.setItem('cv-backup-bar', Vault.localDay()); } catch { /* not kept */ }
        bar.remove();
      } }, I('x-lg')));
    return bar;
  }

  function welcomeHero(cases, deadlines, count) {
    const who = ((Vault.data.settings.affiant || {}).name || '').trim();
    const hour = new Date().getHours();
    const greet = hour < 5 ? 'Working Late' : hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
    const clock = h('div', { class: 'hero-clock', 'aria-hidden': 'true' });
    const dateLine = h('span', { class: 'hero-date' });
    const tick = () => {
      if (!clock.isConnected && clock.dataset.started) return false;
      const d = new Date();
      clock.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      dateLine.textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: '2-digit', year: 'numeric' });
      return true;
    };
    tick();
    clock.dataset.started = '1';
    const timer = setInterval(() => { if (!tick()) clearInterval(timer); }, 15000);
    // v1.61: the status counts sit in the banner (no separate row of boxes).
    // v1.84: glass chips with a colour edge; a click opens General Files showing just those cases;
    // Overdue counts the open cases with a deadline past due.
    const overdue = deadlines.filter((c) => dueLabel(c.nextDeadline.date).cls === 'overdue').length;
    const chip = (key, label, n, icon) => h('button', { type: 'button', class: `hero-count hc-${key}${key === 'overdue' && n ? ' hc-alert' : ''}`, title: `${n} ${label.toLowerCase()} case${n === 1 ? '' : 's'}: click to see them in General Files`,
      onclick: () => showGeneralWith(key) }, I(icon), h('strong', {}, String(n)), h('span', {}, label));
    // v1.99: the backup reminder (and an unencrypted SSD) sit in the same row, after Overdue.
    // v1.151: while the backup bar under the banner says the same thing, the chip is left out.
    // v1.171: the chip stays when the bar only asks for a backup test (the chip opens the Backups panel).
    const backupChip = backupBarDue() && !backupOnlyTest() ? null : (() => {
      const n = fullBackupAge(); const due = n == null || n > fullBackupDays() || backupByCount();
      // v1.107: short words, so the chip never clips (the full sentence is in its tooltip).
      const text = n == null ? 'No Backup' : n === 0 ? 'Backed Up' : `Backup: ${n}d`;
      return h('button', { type: 'button', class: `hero-count hc-backup${due ? ' hc-alert' : ''}`, title: `${fullBackupText()}. Click to back up the whole vault to another drive.`, onclick: () => showVaultPanel('backups') },
        I(due ? 'exclamation-triangle-fill' : 'hdd-fill'), h('span', {}, text));
    })();
    const encryptChip = driveEncryptionWarning() ? h('button', { type: 'button', class: 'hero-count hc-encrypt hc-alert', title: driveEncryptionWarning(), onclick: () => showVaultPanel('backups') },
      I('unlock'), h('span', {}, state.bitlocker === 'suspended' ? 'BitLocker Paused' : 'Not Encrypted')) : null;
    const counts = h('div', { class: 'hero-counts' },
      Vault.STATUSES.map((st) => chip(st.toLowerCase(), st, count(st), STATUS_ICONS[st])),
      chip('overdue', 'Overdue', overdue, 'bell-fill'), backupChip, encryptChip);
    // v1.107: every chip as wide as the widest one's words need, so none clips and all match.
    requestAnimationFrame(() => {
      if (!counts.isConnected) return;
      const chips = [...counts.querySelectorAll('.hero-count')];
      chips.forEach((x) => { x.style.minWidth = 'max-content'; });
      const w = Math.max(0, ...chips.map((x) => Math.ceil(x.getBoundingClientRect().width)));
      chips.forEach((x) => { x.style.minWidth = ''; });
      if (w) counts.style.setProperty('--chip-w', `${w}px`);
    });
    return h('div', { class: 'hero hero-compact' },
      h('div', { class: 'hero-art', 'aria-hidden': 'true' }, h('span', { class: 'hero-ring r1' }), h('span', { class: 'hero-ring r2' }), h('span', { class: 'hero-ring r3' })),
      h('div', { class: 'hero-text' },
        h('div', { class: 'hero-line' }, h('h1', { class: 'hero-title' }, `${greet}${who ? `, ${who.split(/\s+/)[0]}` : ''}`), dateLine),
        counts),
      h('div', { class: 'hero-side' }, heroVault(), clock));
  }

  /* v1.61: one row of same-size actions under the banner. */
  function quickActions() {
    const tile = (label, icon, onclick, tip) => h('button', { type: 'button', class: 'qa-tile', title: tip, onclick }, h('span', { class: 'qa-icon' }, I(icon)), h('span', { class: 'qa-label' }, label));
    // v1.176: Draft, Discovery and Link Chart (they only asked which case), Quick Links (in the case
    // list and the menu) and Settings (in the menu) are no longer tiles.
    return h('div', { class: 'quick-actions', role: 'toolbar', 'aria-label': 'Quick actions' },
      tile('New Case', 'plus-lg', () => newCase(), 'Make a new case'),
      tile('Reference', 'book', () => { location.hash = '#/reference'; }, 'Charts, codes and calculators'),
      tile('Suspect Search', 'person-lines-fill', () => CVPersonView.search(window.CaseVaultUI), 'Find a person on any case: their arrest reports and police interactions'), // v1.175
      tile('Rolodex', 'person-rolodex', () => CVRolodex.open(window.CaseVaultUI), 'ASAs, AUSAs, other departments and other contacts, to fill in on a case'), // v1.175
      tile('Search All Cases', 'search', () => CVVaultSearch.open(window.CaseVaultUI), 'A question in plain words across every open case: details, suspects, timelines, notes and reports'), // v1.184
      // v1.156: the Deadline Calendar (a month across every open case) and the Weekly Summary.
      tile('Calendar', 'calendar-event', () => openAgenda('calendar'), 'A month of deadlines, court dates and statutes of limitations across every open case'),
      // v1.186: the Weekly and Year Summaries are one tile that asks which; the Narrative Helper.
      tile('Summaries', 'bar-chart-line-fill', () => summariesDialog(), 'A week or a year across every case; prints as a PDF'),
      tile('Narrative Helper', 'journal-text', () => { location.hash = '#/narrative'; }, 'Write, paste and polish a narrative with the AI, without opening a case'));
  }

  /* v1.137: the banner's picture is a vault door, for the name: a square door with hinges and bolts,
   * a round door in it, and a spoked handle that turns a quarter now and then, as if unlocking. */
  function heroVault() {
    const NS = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs, ...kids) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); n.append(...kids); return n; };
    const spokes = [0, 45, 90, 135].map((a) => el('line', { x1: 60, y1: 34, x2: 60, y2: 86, transform: `rotate(${a} 60 60)` }));
    const bolts = [[60, 18], [102, 60], [60, 102], [18, 60]].map(([x, y]) => el('rect', { x: x - 3, y: y - 3, width: 6, height: 6, class: 'hv-bolt' }));
    return el('svg', { class: 'hero-vault', viewBox: '0 0 120 120', width: 120, height: 120, 'aria-hidden': 'true', focusable: 'false' },
      el('rect', { x: 4, y: 4, width: 112, height: 112, class: 'hv-frame' }),
      el('rect', { x: 0, y: 22, width: 6, height: 14, class: 'hv-hinge' }), el('rect', { x: 0, y: 84, width: 6, height: 14, class: 'hv-hinge' }),
      el('circle', { cx: 60, cy: 60, r: 46, class: 'hv-door' }),
      el('circle', { cx: 60, cy: 60, r: 36, class: 'hv-ring' }),
      ...bolts,
      el('g', { class: 'hv-wheel' }, ...spokes, el('circle', { cx: 60, cy: 60, r: 9, class: 'hv-hub' })));
  }


  /** v1.61: Needs Attention: deadlines overdue or due within a week, soonest first. */
  function needsAttention(deadlines, cases = []) {
    const due = deadlines.filter((c) => daysUntil(c.nextDeadline.date) <= 7);
    // v1.67: narcotic charges: 3 years from the Date of Occurrence (v1.134: 18 months when every one
    // is a misdemeanor); a warning 5 days before.
    const sols = cases.filter((c) => solState(c)).sort((a, b) => a.sol.expires.localeCompare(b.sol.expires));
    const solRows = sols.map((c) => {
      // The period runs to the end of the expiry day.
      const end = new Date(new Date(`${c.sol.expires}T00:00:00`).getTime() + 86400000);
      const left = h('span', { class: 'att-due att-count' });
      const tick = () => { if (!left.isConnected && left.dataset.on) return false; left.dataset.on = '1'; left.textContent = CVLimits.countdown(end - Date.now()); return true; };
      tick();
      const timer = setInterval(() => { if (!tick()) clearInterval(timer); }, 1000);
      const expired = end - Date.now() <= 0;
      return h('a', { role: 'listitem', class: 'attention-row att-overdue att-sol', href: caseLink(c, 'draft'), title: `Narcotic charges must be brought within ${CVLimits.periodText(c.sol)} of the Date of Occurrence (${fmtDate(c.sol.occurred)}).` },
        h('span', { class: 'att-case' }, h('strong', {}, c.number || 'No case number'), h('span', { class: 'muted small' }, subj(c))),
        h('span', { class: 'att-what' }, I('exclamation-triangle-fill'), expired ? ' Statute of Limitations Expired' : ' Warning: Statute of Limitations Expiring'),
        h('span', { class: 'att-when' }, `${expired ? 'Expired' : 'Expires'} ${fmtDate(c.sol.expires)}`),
        left);
    });
    // v1.135: earlier notices, 90 and 30 days before (amber; the last 5 days are the red warning above).
    const soon = cases.filter((c) => c.sol && !isArchivedEntry(c) && c.status !== 'Closed' && globalThis.CVLimits && CVLimits.notice(c.sol, today()))
      .sort((a, b) => a.sol.expires.localeCompare(b.sol.expires));
    const soonRows = soon.map((c) => {
      const n = CVLimits.daysLeft(c.sol, today());
      const lvl = CVLimits.notice(c.sol, today());
      return h('a', { role: 'listitem', class: `attention-row att-sol-${lvl}`, href: caseLink(c, 'draft'), title: `Narcotic charges must be brought within ${CVLimits.periodText(c.sol)} of the Date of Occurrence (${fmtDate(c.sol.occurred)}).` },
        h('span', { class: 'att-case' }, h('strong', {}, c.number || 'No case number'), h('span', { class: 'muted small' }, subj(c))),
        h('span', { class: 'att-what' }, I('hourglass-split'), ` Statute of Limitations in ${n} days`),
        h('span', { class: 'att-when' }, `Expires ${fmtDate(c.sol.expires)}`),
        h('span', { class: 'att-due' }, lvl === 'soon' ? 'Within 30 days' : 'Within 90 days'));
    });
    if (sols.length && !state.solToastShown) {
      state.solToastShown = true;
      toast(`Statute of limitations: ${sols.map((c) => c.number || 'No case number').join(', ')}. See Needs Attention.`, 'error', 9000);
    }
    // v1.66: no count beside the heading; the list says it all.
    // v1.74: Needs Attention folds into one slim bar (with a short summary); remembered.
    const overdueN = solRows.length + due.filter((c) => daysUntil(c.nextDeadline.date) < 0).length;
    const total = solRows.length + soonRows.length + due.length;
    const summary = h('span', { class: `att-summary${overdueN ? ' has-overdue' : ''}` }, total ? `${total} item${total === 1 ? '' : 's'}${overdueN ? ` · ${overdueN} overdue` : ''}` : 'Nothing due in the next 7 days');
    let folded = false;
    try { folded = localStorage.getItem('cv-att-folded') === '1'; } catch { /* private window */ }
    const foldBtn = h('button', { type: 'button', class: 'icon-btn att-fold', 'aria-expanded': String(!folded), title: folded ? 'Show Needs Attention' : 'Fold Needs Attention into a bar' }, I('chevron-down'), h('span', { class: 'sr-only' }, 'Fold or show'));
    const head = h('div', { class: 'section-head att-head' }, h('h2', { class: 'section-title' }, I('bell-fill'), ' Needs Attention'), summary, h('div', { class: 'spacer' }), foldBtn);
    const wrap = (...kids) => {
      const sec = h('div', { class: `dash-section attention-section${folded ? ' att-folded' : ''}` }, head, ...kids);
      const set = (f) => { folded = f; sec.classList.toggle('att-folded', f); foldBtn.setAttribute('aria-expanded', String(!f)); foldBtn.title = f ? 'Show Needs Attention' : 'Fold Needs Attention into a bar'; try { localStorage.setItem('cv-att-folded', f ? '1' : '0'); } catch { /* ignore */ } };
      foldBtn.addEventListener('click', () => set(!folded));
      head.addEventListener('click', (e) => { if (folded && !e.target.closest('button')) set(false); });
      return sec;
    };
    const empty = !due.length && !solRows.length && !soonRows.length;
    const none = h('p', { class: 'muted attention-none', hidden: !empty }, 'Nothing due in the next 7 days.');
    // v1.140: certificates in Training to renew (expired, or within 90 / 30 days), read from the SSD
    // after the page is drawn.
    const certRows = (list) => Vault.trainingRows().then((rows) => {
      const r = CVTraining.renewals(rows, today());
      if (!r.length || !list.isConnected) return;
      list.append(...r.map((c) => {
        const lvl = CVTraining.notice(c, today()); const n = CVTraining.daysLeft(c, today());
        return h('a', { role: 'listitem', class: `attention-row att-cert att-cert-${lvl}${lvl === 'expired' ? ' att-overdue' : ''}`, href: '#/', title: 'Open Other Files → Training', onclick: (e) => { e.preventDefault(); openTraining(); } },
          h('span', { class: 'att-case' }, h('strong', {}, c.course), h('span', { class: 'muted small' }, c.provider || 'Training')),
          h('span', { class: 'att-what' }, I('patch-check-fill'), lvl === 'expired' ? ' Certificate Expired' : ' Certificate to Renew'),
          h('span', { class: 'att-when' }, `${lvl === 'expired' ? 'Expired' : 'Expires'} ${fmtDate(c.expires)}`),
          h('span', { class: 'att-due' }, lvl === 'expired' ? `${-n} day${n === -1 ? '' : 's'} ago` : lvl === 'soon' ? 'Within 30 days' : 'Within 90 days'));
      }));
      list.hidden = false; none.hidden = true;
      const t = list.querySelectorAll('.attention-row').length; const o = list.querySelectorAll('.att-overdue').length;
      summary.textContent = `${t} item${t === 1 ? '' : 's'}${o ? ` · ${o} overdue` : ''}`; summary.classList.toggle('has-overdue', !!o);
    }).catch(() => {});
    const dueRows = due.slice(0, 8).map((c) => {
        const d = c.nextDeadline;
        const n = daysUntil(d.date);
        const lab = dueLabel(d.date);
        return h('a', { role: 'listitem', class: `attention-row ${n < 0 ? 'att-overdue' : n <= 1 ? 'att-now' : 'att-soon'}`, href: caseLink(c, 'timeline'), title: 'Open the Timeline of this case' },
          h('span', { class: 'att-case' }, h('strong', {}, c.number || 'No case number'), h('span', { class: 'muted small' }, subj(c))),
          h('span', { class: 'att-what' }, d.title || 'Deadline'),
          h('span', { class: 'att-when' }, fmtDate(d.date), d.time ? ` ${d.time}` : ''),
          h('span', { class: 'att-due' }, lab.text.replace(/\b\w/g, (ch) => ch.toUpperCase())));
    });
    const attList = h('div', { class: 'attention-list', role: 'list', hidden: empty }, ...solRows, ...soonRows, ...dueRows);
    certRows(attList);
    return wrap(attList, none,
      due.length > 8 ? h('p', { class: 'muted small' }, `And ${due.length - 8} more. Each case shows a red border in the case list.`) : null);
  }

  /* =====================================================================
   * New case
   * ===================================================================== */

  /** An Operation picker: — General Files (no Operation) —, then every Operation. */
  function operationSelect(value = '', attrs = {}) {
    const ops = [...Vault.listOperations()].sort((a, b) => byFileNumber(a.number, b.number) || a.name.localeCompare(b.name));
    return h('select', attrs, h('option', { value: '' }, 'None (General Files)'), ops.map((o) => h('option', { value: o.id, selected: o.id === value }, opLabel(o))));
  }

  /** v1.46: before a new case is made: the same subject on another case asks first; a similar one
   * is pointed out (never merged). Returns true to go ahead. */
  async function subjectCheck(subject, exceptId = '') {
    const m = CVOperation.subjectMatches(Vault.data.cases, subject, exceptId);
    const list = (cases) => h('ul', { class: 'match-list' }, cases.slice(0, 8).map((x) => h('li', {}, h('strong', {}, x.number || 'No case number'), ` · ${subj(x)}`, opOf(x) ? ` · ${opLabel(opOf(x))}` : ' · General Files', isArchivedEntry(x) ? ' · Archived' : '')));
    const ask = (title, message, cases) => openDialog((close) => h('div', { class: 'confirm subject-warn' },
      h('h2', {}, title), h('p', {}, message), list(cases),
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, 'Cancel'),
        h('button', { class: 'btn primary', type: 'button', autofocus: true, 'data-keep-case': 'true', onclick: () => close(true) }, 'Continue and create new case'))));
    if (m.same.length && !(await ask('Same subject', 'This subject already has another case. Is this a new case number for the same subject?', m.same))) return false;
    if (m.similar.length && !(await ask('Possible match', 'A subject with a similar name already has a case. Check it is not the same person. Nothing is merged.', m.similar))) return false;
    return true;
  }

  // v1.46: Case Number and Subject Name are required; the case is made in General Files and,
  // when an Operation is picked, linked to it. prefill: { operationId, subject, number }.
  async function newCase(prefill = {}) {
    if (!state.connected) return;
    if (prefill instanceof Event) prefill = {};
    const result = await openDialog((close) => {
      const numberIn = h('input', { name: 'number', required: true, maxlength: 100, autocomplete: 'off', autofocus: true, value: prefill.number || '' });
      const subjectIn = h('input', { name: 'subject', required: true, maxlength: 200, autocomplete: 'off', value: prefill.subject || '', placeholder: 'Type a name to search the known suspects' });
      // v1.174: typing a name searches the suspects of the open cases (name, date of birth, gender,
      // IR number); picking one fills the Subject Name and makes them the new case's suspect.
      let known = [];
      let picked = null;
      CVPersonView.knownSuspects({}).then((list) => { known = list; drawKnown(); }).catch(() => {});
      const knownBox = h('div', { class: 'known-pick span-2', hidden: true, role: 'listbox', 'aria-label': 'Known suspects' });
      const pickedNote = h('p', { class: 'form-hint span-2 known-picked', hidden: true });
      const drawKnown = () => {
        const hits = picked ? [] : CVPersonView.searchSuspects(known, subjectIn.value).slice(0, 8);
        knownBox.hidden = !hits.length;
        knownBox.replaceChildren(...(hits.length ? [h('div', { class: 'known-row known-head', 'aria-hidden': 'true' }, h('span', {}, 'Name'), h('span', {}, 'DOB'), h('span', {}, 'Gender'), h('span', {}, 'IR'))] : []),
          ...hits.map((x) => h('button', { type: 'button', class: 'known-row', role: 'option', onclick: () => {
            picked = x; subjectIn.value = x.name; drawKnown();
            pickedNote.hidden = false;
            pickedNote.replaceChildren(I('person-vcard'), h('span', {}, `${x.name} becomes this case's suspect, with the details from Case `, ...x.numbers.flatMap((n, j) => [j ? ', ' : '', h('span', { class: 'nowrap' }, n)]), '.'),
              h('button', { type: 'button', class: 'btn small', onclick: () => { picked = null; pickedNote.hidden = true; drawKnown(); subjectIn.focus(); } }, 'Undo'));
          } }, h('strong', {}, x.name), h('span', {}, x.dob ? fmtDate(x.dob) : '—'), h('span', {}, x.gender || '—'), h('span', {}, x.ir || '—'))));
      };
      subjectIn.addEventListener('input', () => { if (picked && subjectIn.value.trim() !== picked.name) { picked = null; pickedNote.hidden = true; } drawKnown(); });
      const opIn = operationSelect(prefill.operationId || '', { name: 'operationId' });
      // One file number can hold several cases: offer the file numbers already in use.
      const fileNumbers = [...new Set((Vault.data.cases || []).map((x) => x.fileNumber).filter(Boolean))].sort();
      // Each with the Operations it's used in, shown on the right of the list (v1.38).
      const opOfFile = (n) => [...new Set((Vault.data.cases || []).filter((x) => x.fileNumber === n).map((x) => opLabel(opOf(x))).filter(Boolean))].join(', ');
      const fileList = h('datalist', { id: 'file-numbers' }, fileNumbers.map((n) => h('option', { value: n, label: opOfFile(n) || n })));
      const openedIn = h('input', { name: 'opened', type: 'date', value: today() });
      const folderNote = h('span', {});
      const numberErr = h('p', { class: 'error-text small span-2', role: 'alert', hidden: true });
      const showFolder = () => {
        const name = CVCaseFiles.caseFolderName({ number: numberIn.value, dates: { opened: openedIn.value } });
        folderNote.replaceChildren(...(name
          ? ['Case folder ', h('code', {}, CVFormat.pathText(`cases\\${name}`)), ' · files named ', h('code', {}, `${name} Arrest Report.pdf`), ' and so on']
          : ['The case number names the folder and files ', h('code', {}, '<year>-<case no.>'), '.']));
      };
      const checkNumber = () => {
        const dup = CVOperation.caseWithNumber(Vault.data.cases, numberIn.value);
        numberErr.hidden = !dup;
        numberErr.textContent = dup ? `Case Number ${numberIn.value.trim()} already exists${isArchivedEntry(dup) ? ' (archived)' : ''}${dup.subject ? `, subject ${dup.subject}` : ''}. Case Numbers must be unique.` : '';
        numberIn.setCustomValidity(dup ? 'This Case Number already exists.' : '');
        return !dup;
      };
      numberIn.addEventListener('input', () => { showFolder(); checkNumber(); });
      openedIn.addEventListener('input', showFolder);
      showFolder();
      const fileIn = h('input', { name: 'fileNumber', maxlength: 100, list: 'file-numbers', title: 'The investigation file. Several cases can share one file number.' });
      const agencyIn = h('input', { name: 'agencyNumber', maxlength: 100, title: 'The federal jacket number for this case.' });
      const clientIn = clientSelect('', { name: 'client' });
      const opNote = h('p', { class: 'form-hint span-2 op-note' });
      // Picking an Operation fills the file number, jacket number and client from its cases.
      const fillFrom = () => {
        const op = Vault.getOperation(opIn.value);
        const sibs = op ? operationCases(op.id) : [];
        opNote.textContent = op ? `Adds a case to ${opLabel(op)} (${sibs.length} so far${sibs.length ? `: ${sibs.map((x) => x.number).filter(Boolean).join(', ')}` : ''}).` : 'The case goes in General Files, not in a Mission. It can be linked to one later.';
        const sib = sibs[0];
        if (!sib) return;
        if (!fileIn.value) fileIn.value = sib.fileNumber || '';
        if (!agencyIn.value) agencyIn.value = sib.agencyNumber || '';
        if (!clientIn.value && sib.client) { if (![...clientIn.options].some((o) => o.value === sib.client)) clientIn.append(h('option', { value: sib.client }, sib.client)); clientIn.value = sib.client; }
      };
      opIn.addEventListener('change', fillFrom);
      fillFrom();
      const form = h('form', { class: 'form-grid new-case-form', onsubmit: (e) => {
        e.preventDefault();
        if (!checkNumber()) { numberIn.focus(); return; }
        const fd = new FormData(form);
        close({
          number: fd.get('number').trim(), subject: fd.get('subject').trim(), operationId: fd.get('operationId') || '',
          fileNumber: fd.get('fileNumber').trim(), agencyNumber: fd.get('agencyNumber').trim(), client: fd.get('client'),
          status: fd.get('status'), opened: fd.get('opened'), tags: [], knownSuspect: picked ? picked.suspect : null,
        });
      } },
      h('h2', { class: 'span-2', icon: 'folder-plus' }, 'New case'),
      formSect('Case', 'person-vcard'),
      field('Case Number', numberIn, '', 'Unique: no two cases, archived ones included, can share a Case Number.'),
      field('Subject Name', subjectIn, '', 'The person the case is about. Several cases can have the same subject.'),
      numberErr,
      knownBox, pickedNote,
      field('Mission', opIn, 'span-2', 'Optional. The case is always kept in General Files; a Mission only links it.'),
      opNote,
      formSect('File Details', 'folder2-open'),
      field('File Number', fileIn),
      field('Federal Jacket Number', dnaCombo(agencyIn)),
      fileList,
      h('div', { class: 'span-2 form-row2' }, field('Client', clientIn), field('Opened', openedIn)),
      formHint(folderNote),
      h('div', { class: 'dialog-actions span-2' },
        h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
        h('button', { class: 'btn primary', type: 'submit' }, 'Create case')));
      return form;
    });
    if (!result) return;
    const knownSx = result.knownSuspect;
    delete result.knownSuspect;
    if (!knownSx && !(await subjectCheck(result.subject))) return; // a picked known suspect is the same person on purpose
    try {
      const c = await Save.track('new-case', () => Vault.createCase(result));
      if (knownSx) { // v1.174: the picked known suspect, as this case's main suspect
        const full = await Vault.getCase(c.id);
        full.suspects = [{ ...structuredClone(knownSx), role: 'Primary' }];
        await Save.track(`case:${c.id}`, () => Vault.saveCase(full));
      }
      // Inside an Operation: it shares the Operation's Case Overview from the start.
      if (c.operationId) await mergeIntoOperation(c.id).catch(() => {});
      renderCaseList();
      go(c.id, 'details');
    } catch (err) { if (err && err.name === 'ValidationError') toast(err.message, 'error', 7000); /* else reported by Save */ }
  }

  /** v1.46: after a case joins an Operation, its Case Overview (suspects, contacts, deconfliction)
   * and the Operation's are joined, and every case of the Operation gets the result. */
  async function mergeIntoOperation(caseId) {
    const c = await Vault.getCase(caseId);
    const others = [];
    others.push(...(await Promise.all(operationCases(c.operationId).filter((x) => x.id !== caseId).map((o) => Vault.getCase(o.id).catch(() => null)))).filter(Boolean)); // v1.151: at once; a moved one is left out
    if (!others.length) return;
    const merged = CVOperation.mergeOverview([...others, c]);
    for (const x of [c, ...others]) {
      if (CVOperation.sameOverview(x, { ...x, ...merged })) continue;
      Object.assign(x, structuredClone(merged));
      await Save.track(`case:${x.id}`, () => Vault.saveCase(x));
    }
  }

  /** Link a case to an Operation (from General Files, the Operation page or the case's Details). */
  async function linkCase(caseId, opId) {
    try {
      await Save.track(`link:${caseId}`, () => Vault.assignCase(caseId, opId));
      await mergeIntoOperation(caseId).catch(() => {});
      if (state.caseObj && state.caseObj.id === caseId) state.caseObj = null; // re-read on the next draw
      toast(`Linked to ${opLabel(Vault.getOperation(opId))}.`, 'success', 3000);
      return true;
    } catch (err) {
      if (err && err.name === 'ValidationError') toast(err.message, 'error', 7000);
      return false;
    }
  }

  /* Move File (v1.50): one box to move a case between General Files and the Operations: out of
   * an Operation into General Files (independent), from General Files into an Operation, or from
   * one Operation to another. The case and its files never move on the SSD; only the link changes.
   * -> true when it moved. */
  async function moveCaseDialog(entry) {
    await Save.flushAll();
    const cur = opOf(entry);
    const ops = [...Vault.listOperations()].sort((a, b) => byFileNumber(a.number, b.number) || a.name.localeCompare(b.name));
    const choices = [['', 'General Files (independent case)', 'folder-fill'], ...ops.map((op) => [op.id, opLabel(op), 'op-folder'])].filter(([id]) => id !== (cur ? cur.id : ''));
    if (!choices.length) { toast('There is nowhere else to move it yet. Make a Mission first.', 'info', 5000); return false; }
    const want = await openDialog((close) => {
      let pick = choices[0][0];
      const rows = choices.map(([id, label, icon], i) => {
        const radio = h('input', { type: 'radio', name: 'move-dest', value: id, checked: i === 0 });
        radio.addEventListener('change', () => { pick = id; });
        return h('label', { class: `move-dest${id ? '' : ' gf-link'}` }, radio, I(icon), h('span', {}, label));
      });
      return h('form', { class: 'move-file', onsubmit: (e) => { e.preventDefault(); close(pick); } },
        h('h2', {}, 'Move Case'),
        h('p', { class: 'muted small' }, `Case ${entry.number || entry.title || ''} is in ${cur ? opLabel(cur) : 'General Files'}. Where should it go? Its files stay where they are on the SSD; only where it's listed changes.`),
        h('div', { class: 'move-dests', role: 'radiogroup', 'aria-label': 'Move to' }, rows),
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close(undefined) }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit', icon: 'folder-symlink' }, 'Move')));
    });
    if (want === undefined) return false;
    try {
      if (cur) await Save.track(`link:${entry.id}`, () => Vault.unlinkCase(entry.id));
      if (state.caseObj && state.caseObj.id === entry.id) state.caseObj = null;
      if (want) return await linkCase(entry.id, want);
      toast(`Case ${entry.number || ''} moved to General Files.`, 'success', 3000);
      return true;
    } catch (err) {
      if (err && err.name === 'ValidationError') toast(err.message, 'error', 7000);
      return false;
    }
  }

  /* v1.54: fold a section away with the button in its heading (▾ / ▸). Which ones are folded is a
   * screen preference of this PC (localStorage), never case data. */
  const FOLD_STORE = 'casevault-folded-sections';
  const foldedSet = () => { try { return new Set(JSON.parse(localStorage.getItem(FOLD_STORE) || '[]')); } catch { return new Set(); } };
  function makeFoldable(section, key, { open: startOpen = false, count = null } = {}) { // v1.59: every form starts folded
    const head = section.querySelector(':scope > h3');
    if (!head || section.querySelector(':scope > .fold-body')) return section;
    const body = h('div', { class: 'fold-body' });
    for (const n of [...section.childNodes]) if (n !== head) body.append(n);
    const btn = h('button', { class: 'icon-btn fold-btn', type: 'button' });
    const row = h('div', { class: 'fold-head' });
    head.replaceWith(row);
    // v1.118: how many entries, beside the title (kept up to date as entries are added or removed).
    const pill = count ? h('span', { class: 'fold-count count-pill', 'aria-label': 'Entries' }) : null;
    const recount = () => { if (!pill) return; const n = Number(count()) || 0; pill.textContent = String(n); pill.classList.toggle('zero', !n); };
    row.append(...[head, pill, h('div', { class: 'spacer' }), btn].filter(Boolean));
    section.append(body);
    if (pill) { recount(); new MutationObserver(recount).observe(body, { childList: true, subtree: true }); }
    section.classList.add('foldable');
    const set = foldedSet();
    let folded = set.has(key) || (!startOpen && !set.has(`open:${key}`));
    const show = () => {
      body.hidden = folded;
      section.classList.toggle('folded', folded);
      const label = `${folded ? 'Show' : 'Hide'} ${head.textContent.trim()}`;
      btn.title = label; btn.setAttribute('aria-expanded', String(!folded));
      btn.replaceChildren(I(folded ? 'chevron-right' : 'chevron-down'), h('span', { class: 'sr-only' }, label));
    };
    // Open it from outside (the Vault's list on the left).
    section.cvUnfold = () => { if (folded) btn.click(); };
    btn.addEventListener('click', () => {
      folded = !folded;
      const st = foldedSet();
      st.delete(key); st.delete(`open:${key}`);
      if (folded && startOpen) st.add(key);
      if (!folded && !startOpen) st.add(`open:${key}`);
      try { localStorage.setItem(FOLD_STORE, JSON.stringify([...st])); } catch { /* this visit only */ }
      show();
    });
    show();
    return section;
  }

  /* v1.111: the Field Notes in plain view: on a case's Details tab (that case) and on a Mission's
   * page (each of its case numbers). Read from notes.md on the SSD each time; Edit opens the Field
   * Notes page of that case. */
  function fieldNotesCard(cases, { key = 'field-notes', mission = false } = {}) {
    const body = h('div', { class: 'fn-cards' }, h('p', { class: 'muted small' }, 'Reading the Field Notes…'));
    const section = h('section', { class: 'card field-notes-card' }, h('h3', { icon: 'journal-text' }, 'Field Notes'), body);
    const tk = state.renderToken;
    (async () => {
      const items = [];
      for (const c of cases) {
        let text = '';
        try { text = await Vault.getNotes(c.id); } catch (err) { if (FS.isDisconnectError(err)) return onDriveLost(); }
        items.push({ c, text: String(text || '').trim() });
      }
      if (tk !== state.renderToken || !body.isConnected) return;
      const shown = mission ? items.filter((x) => x.text) : items;
      body.replaceChildren(...(shown.length ? shown.map(({ c, text }) => h('article', { class: 'fn-card' },
        h('div', { class: 'fn-card-head' },
          mission ? h('a', { href: caseLink(c), class: 'case-num-link' }, c.number || 'No case number') : null,
          mission && subj(c) ? h('span', { class: 'muted small' }, subj(c)) : null,
          h('div', { class: 'spacer' }),
          !isArchivedEntry(c) && !mission && window.CVNotesFloat ? h('button', { class: 'btn small', type: 'button', icon: 'journal-text', title: 'Write in the floating Notes box, beside whatever page you are on', onclick: () => CVNotesFloat.toggle() }, 'Notes Box') : null,
          h('a', { class: 'btn small', href: `#/case/${CVRoute.enc(c.id)}/reports/.notes`, icon: 'pencil', title: 'Open this case\'s Field Notes page to read or edit them' }, isArchivedEntry(c) ? 'Open' : 'Edit')),
        text ? h('div', { class: 'fn-text markdown-body', html: Markdown.render(text) }) : h('p', { class: 'muted small empty-note' }, I('journal-text'), h('span', {}, 'No Field Notes yet. Edit, or the Notes button at the bottom right, to write some.'))))
        : [h('p', { class: 'muted small empty-note' }, I('journal-text'), h('span', {}, 'None of this Mission\'s case numbers has Field Notes yet.'))]));
    })();
    return makeFoldable(section, key, { open: true });
  }

  /** A labelled box. tip: the explanation, shown in the hover box (no brackets in labels). */
  function field(label, input, cls = '', tip = '') {
    return h('label', { class: `field ${cls}`, title: tip || null }, h('span', {}, label), input);
  }

  $('#btn-new-case').addEventListener('click', newCase);

  /* =====================================================================
   * Case view
   * ===================================================================== */

  // Reports (v1.17) holds the case notes and every draft in one list.
  // v1.52: Link Chart, after Files.
  // v1.64: each case tab has an icon, like the Options tabs.
  const TAB_ICONS = { details: 'person-vcard', arrest: 'shield-exclamation', timeline: 'calendar-event', draft: 'pencil-square', reports: 'journal-bookmark', files: 'folder2-open', linkchart: 'diagram-3-fill', mail: 'envelope', checks: 'list-check' };
  const TABS = [['details', 'Details'], ['timeline', 'Timeline'], ['draft', 'Write Report'], ['reports', 'Saved Reports'], ['files', 'Files'], ['linkchart', 'Link Chart'], ['mail', 'Mail'], ['checks', 'Checks']];
  // The Arrest details tab appears once a case has arrest details, or is closed "by arrest".
  const FOLDER_ICONS = {
    '': 'collection', unsorted: 'folder', photos: 'image', 'Case Overview': 'journal-richtext', 'Case Initiation': 'flag', 'Affidavit Drafts': 'pencil-square', 'Affidavit Final': 'file-earmark-ruled', Affidavits: 'file-earmark-ruled',
    'Warrant Drafts': 'pencil-fill', 'Warrant Final': 'file-earmark-text', 'Warrants Signed': 'shield-fill-check', 'Arrest Report': 'person-badge', 'Supplementary Report': 'file-earmark-text',
    'Case Report': 'journal-bookmark', 'Link Charts': 'diagram-3-fill', Deconfliction: 'signpost-split', 'Drug Exhibits': 'capsule-pill', 'Other Exhibits': 'box-seam', Email: 'envelope',
    'Ops Plan': 'map', 'Subpoena Drafts': 'pencil-square', 'Subpoena Sent': 'send', 'Subpoena Response': 'inbox', 'Subject Information': 'person-vcard',
    Recordings: 'mic', 'Recordings/Video': 'camera-video', 'Recordings/Audio': 'mic', 'Vehicle Information': 'car-front', Maps: 'geo-alt', 'Case Closing': 'check-circle-fill', Other: 'folder',
  };
  const FILE_ICONS = { pdf: 'file-earmark-pdf-fill', word: 'file-earmark-word-fill', sheet: 'file-earmark-spreadsheet', image: 'file-earmark-image', audio: 'file-earmark-music', video: 'file-earmark-play', text: 'file-earmark-text', mail: 'envelope-paper', zip: 'file-earmark-zip', other: 'file-earmark' };
  function fileKind(name) {
    const ext = (/\.([a-z0-9]+)$/i.exec(name) || [])[1]?.toLowerCase() || '';
    if (ext === 'pdf') return 'pdf';
    if (/^(docx?|docm|rtf|odt)$/.test(ext)) return 'word';
    if (/^(xlsx?|xlsm|ods|csv)$/.test(ext)) return 'sheet';
    if (/^(png|jpe?g|gif|webp|bmp|tiff?|heic)$/.test(ext)) return 'image';
    if (/^(mp3|wav|m4a|aac|ogg|wma|flac)$/.test(ext)) return 'audio';
    if (/^(mp4|mov|avi|mkv|webm|wmv)$/.test(ext)) return 'video';
    if (/^(txt|md|log|json|xml)$/.test(ext)) return 'text';
    if (/^(eml|msg)$/.test(ext)) return 'mail';
    if (/^(zip|7z|rar)$/.test(ext)) return 'zip';
    return 'other';
  }
  const TYPE_LABELS = { pdf: 'PDF', word: 'Word', sheet: 'Spreadsheet', image: 'Image', audio: 'Audio', video: 'Video', text: 'Text', mail: 'Email', zip: 'Archive' };
  /** "PDF", "Word", "Image (JPG)"…: the Type column. */
  function fileTypeLabel(name) {
    const ext = ((/\.([a-z0-9]+)$/i.exec(name) || [])[1] || '').toUpperCase();
    const k = fileKind(name);
    if (k === 'other') return ext || 'File';
    return k === 'pdf' ? 'PDF' : `${TYPE_LABELS[k]}${ext && !['PDF', 'DOCX'].includes(ext) ? ` (${ext})` : ''}`;
  }
  // The case notes' place in Reports (a draft's name never starts with a dot).
  const NOTES_SUB = '.notes';
  // v1.177: the Mail tab shows when Settings → Department Mail says so (Show the Mail Tab); a link
  // straight to a case's mail still opens it.
  const mailShown = (tab) => !!(Vault.data && Vault.data.settings && Vault.data.settings.showMailTab) || tab === 'mail';
  const tabsFor = (c, tab = '') => { const t = TABS.filter(([k]) => k !== 'mail' || mailShown(tab)); return CVClosingUI.hasArrestTab(c) ? [t[0], ['arrest', 'Arrest'], ...t.slice(1)] : t; };

  async function showCase(id, tab, sub = null) {
    const token = ++state.renderToken;
    try {
      if (state.caseId !== id || !state.caseObj) {
        state.caseObj = await Vault.getCase(id);
      }
    } catch (err) {
      if (token !== state.renderToken) return;
      if (FS.isDisconnectError(err) && err.name !== 'NotFoundError') return onDriveLost();
      toast(err.name === 'CaseMissingError' || err.name === 'NotFoundError'
        ? 'That case folder is no longer on the SSD. The case list has been refreshed.'
        : `Could not open case: ${err.message}`, 'error', 7000);
      await Vault.rebuildIndex().catch(() => {});
      return go(null);
    }
    if (token !== state.renderToken) return;
    const c = state.caseObj;
    // Old addresses: #/case/<id>/notes and #/case/<id>/drafts[/<draft>] now live under Saved Reports.
    if (tab === 'notes') { tab = 'reports'; sub = NOTES_SUB; } else if (tab === 'drafts') tab = 'reports';
    // v1.31: Report Fields is the Write Report tab.
    if (tab === 'reports' && sub === '.fields') { tab = 'draft'; sub = null; }
    const tabs = tabsFor(c, tab);
    if (!tabs.some(([t]) => t === tab)) tab = 'details';
    state.caseId = id;
    state.lastCaseId = id;
    state.tab = tab;
    noteOpened(id);
    navCaseList(); // v1.165: was a full redraw at every tab

    const archived = Vault.isArchived(id);
    const panel = h('div', { class: 'tab-panel', role: 'tabpanel' });
    $('#main').replaceChildren(h('section', { class: `case ${archived ? 'archived' : ''}` },
      archived ? h('div', { class: 'archived-banner', role: 'note' },
        I('archive', { cls: 'banner-icon' }),
        h('div', {}, h('strong', {}, 'Archived case'),
          h('span', { class: 'small block' }, 'Read-only. Notes, files, drafts and checks can be opened and searched, but not changed.'),
          c.archiveReason ? h('span', { class: 'small block arch-reason' }, `Reason: ${c.archiveReason}${c.dates && c.dates.archived ? ` (${fmtDate(c.dates.archived)})` : ''}`) : null),
        h('div', { class: 'spacer' }),
        // v1.67: which Archived sub-folder it is in.
        h('label', { class: 'arch-folder-pick' }, h('span', { class: 'small' }, 'Archive Folder'),
          h('select', { 'aria-label': 'Archive folder', onchange: async (e) => {
            try { await Save.track(`archfolder:${c.id}`, () => Vault.setArchiveFolder(c.id, e.target.value)); c.archiveFolder = e.target.value; renderCaseList(); toast('Moved to the archive folder.', 'success'); } catch (err) { toast(`Not moved: ${err.message}`, 'error'); }
          } }, [['', 'No Sub-folder'], ...Vault.ARCHIVE_FOLDERS.map(([k]) => [k, Vault.archiveFolderName(k)])].map(([k, label]) => h('option', { value: k, selected: (c.archiveFolder || '') === k }, label)))),
        h('button', { class: 'btn', type: 'button', icon: 'arrow-counterclockwise', onclick: () => restoreCase(c) }, 'Restore to active cases')) : null,
      // v1.46: the Case Number first, the Subject Name under it, and the Operation it's in.
      h('div', { class: 'case-head' },
        h('h1', { id: 'case-title' }, c.number || 'No case number yet'),
        h('div', { class: 'case-subject', id: 'case-subject' }, subj(c) || 'No subject yet'),
        h('div', { class: 'case-sub muted', id: 'case-sub' }, caseSubtitle(c))),
      h('nav', { class: 'tabs', role: 'tablist' }, tabs.map(([t, label]) =>
        h('a', { href: `#/case/${CVRoute.enc(id)}/${t}`, role: 'tab', class: `tab ${t === tab ? 'active' : ''}`, 'aria-selected': String(t === tab), icon: TAB_ICONS[t] }, label))), // v1.176: Checks is no longer marked Beta
      panel));
    Save.markTabs();
    // Read-only: everything in the tab that could change the case is switched off, now and as
    // the tab redraws. (vault.js refuses the writes too.)
    if (archived) new MutationObserver(() => applyReadOnly(panel)).observe(panel, { childList: true, subtree: true });

    const renderers = { details: renderDetails, arrest: (...a) => CVClosingUI.renderArrest(...a), draft: async (panel, cc, tk) => (await CVLazy.reports()).fields.render(panel, cc, tk), reports: async (panel, cc, tk, s) => (s === NOTES_SUB ? renderNotes(panel, cc, tk) : (await CVLazy.reports()).drafts.render(panel, cc, tk, s)), timeline: renderTimeline, files: renderFiles, linkchart: async (panel, cc, tk) => (await CVLazy.linkChart()).render(panel, cc, tk), mail: (...a) => CVMailUI.render(...a), checks: (...a) => CVChecks.render(...a) };
    try {
      await renderers[tab](panel, c, token, sub);
    } catch (err) {
      if (FS.isDisconnectError(err)) return onDriveLost();
      console.error(err);
      panel.replaceChildren(h('p', { class: 'error-text' }, `Could not load this tab: ${err.message}`));
    }
    if (archived) applyReadOnly(panel);
  }

  // Text boxes become read-only (still scrollable and selectable); other controls are disabled,
  // except those marked data-ro-ok (open, preview, export a copy, filters) and the case actions.
  function applyReadOnly(root) {
    for (const el of root.querySelectorAll('input, select, textarea, button')) {
      if (el.closest('[data-ro-ok]')) continue;
      const textual = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|date|time|number|email|tel|url)$/.test(el.type));
      if (textual) { if (!el.readOnly) el.readOnly = true; } else if (!el.disabled) el.disabled = true;
    }
    for (const el of root.querySelectorAll('.dropzone:not([aria-disabled])')) { el.setAttribute('aria-disabled', 'true'); el.hidden = true; }
  }

  function caseSubtitle(c) {
    // v1.27: the file and case numbers and the opened date are on the Details tab itself.
    const op = opOf(c);
    return [op ? h('a', { href: `#/operation/${encodeURIComponent(op.id)}`, class: 'case-op-link', title: 'Open the Mission' }, I('op-folder'), opLabel(op)) : h('a', { href: '#/general', class: 'case-op-link gf-link', title: 'Not in a Mission: open General Files' }, I('folder-fill'), 'General Files'),
      c.agencyNumber && `Agency ${c.agencyNumber}`, c.client, statusPill(c.status)]
      .filter(Boolean).flatMap((x, i) => (i ? [' · ', x] : [x]));
  }

  function refreshCaseHeader(c) {
    const title = $('#case-title');
    if (title) title.textContent = c.number || 'No case number yet';
    const subjEl = $('#case-subject');
    if (subjEl) subjEl.textContent = subj(c) || 'No subject yet';
    const sub = $('#case-sub');
    // v1.132: drawn again only when what it shows changed (not on every keystroke in a field).
    const key = JSON.stringify([c.operationId, opLabel(opOf(c)), c.agencyNumber, c.client, c.status]);
    if (sub && sub.dataset.key !== key) { sub.replaceChildren(...caseSubtitle(c)); sub.dataset.key = key; }
  }

  /* ---------- Details ---------- */

  /** v1.27: the operation's other cases get this case's Case Overview (suspects, contacts,
   * deconfliction), so every case number shows the same one. */
  async function syncOverview(c) {
    const others = operationCases(c).filter((x) => x.id !== c.id);
    for (const o of others) {
      let oc;
      try { oc = await Vault.getCase(o.id); } catch { continue; }
      if (CVOperation.sameOverview(oc, c)) continue;
      oc.suspects = structuredClone(c.suspects || []);
      oc.contacts = structuredClone(c.contacts || {});
      oc.deconfliction = structuredClone(c.deconfliction || []);
      await Vault.saveCase(oc);
    }
  }

  function renderDetails(panel, c) {
    const save = () => {
      refreshCaseHeader(c);
      const snapshot = structuredClone(c);
      Save.schedule(`case:${c.id}`, () => Vault.saveCase(snapshot), 600);
      if (operationCases(c).some((x) => x.id !== c.id)) Save.schedule(`overview:${c.operationId}`, () => syncOverview(snapshot), 1200);
    };
    const bind = (input, apply) => { input.addEventListener('input', () => { apply(input.value); save(); }); return input; };

    // v1.85: set by Close Case (and cleared by Reopen), so it is shown, not typed.
    const closedInput = h('input', { type: 'text', value: c.dates.closed ? fmtDate(c.dates.closed) : 'Not closed', readonly: true, tabindex: -1, class: 'readonly-date', 'aria-label': 'Closed', title: c.status === 'Closed' ? 'Set when the case was closed. To change it, reopen the case and close it again.' : 'Filled in when you close the case.' });
    // v1.84: closing and archiving use their own buttons (they ask for the disposition or the
    // reason). A closed case shows Closed, greyed; picking Open reopens it. (v1.105: no Pending.)
    const statusSelect = h('select', { title: 'To close or archive the case, use the Close Case and Archive buttons.' },
      ['Open', ...(c.status === 'Open' ? [] : [c.status])].map((s) => h('option', { selected: s === c.status, disabled: s !== 'Open' }, s)));
    statusSelect.addEventListener('change', () => {
      // Open on a closed case reopens it. If the dialog is cancelled, nothing changes. (Closing
      // and archiving have their own buttons, v1.84.)
      const want = statusSelect.value;
      statusSelect.value = c.status;
      if (want === 'Open' && c.status === 'Closed') { CVClosingUI.reopenCase(c); return; }
      if (want !== c.status) Vault.logActivity(c, `Status: ${c.status} to ${want}`);
      c.status = want;
      if (want === 'Open') c.pending = null;
      statusSelect.value = want;
      statusNote.textContent = CVClosingUI.statusLine(c);
      save();
    });
    const statusNote = h('span', { class: 'muted small block status-note' }, CVClosingUI.statusLine(c));
    const archived = Vault.isArchived(c.id);

    const members = archived ? [c] : [c, ...operationCases(c).filter((x) => x.id !== c.id)];
    const op = opOf(c);
    // v1.46: the Subject Name (an independent case is titled by it).
    const subjectIn = bind(h('input', { value: c.subject || '', maxlength: 200, placeholder: 'No subject yet' }), (v) => { c.subject = v.trim(); c.title = CVOperation.caseTitle(c, op); });
    // The Case Number is unique: a number another case has is refused, and it can't be emptied.
    const numberIn = h('input', { value: c.number || '', maxlength: 100 });
    numberIn.addEventListener('change', () => {
      const v = numberIn.value.trim();
      const dup = CVOperation.caseWithNumber(Vault.data.cases, v, c.id);
      if (!v && c.number) { toast('Case Number is required.', 'error', 5000); numberIn.value = c.number; return; }
      if (dup) { toast(`Case Number ${v} already exists${isArchivedEntry(dup) ? ' (archived)' : ''}. Case Numbers must be unique.`, 'error', 7000); numberIn.value = c.number || ''; return; }
      c.number = v;
      save();
      renderCaseList();
    });
    const dupNow = CVOperation.caseWithNumber(Vault.data.cases, c.number, c.id);
    // v1.179: a case made by Continue in a New Case points back to the case (and Mission) it came from.
    const from = c.continuedFrom && c.continuedFrom.caseId ? c.continuedFrom : null;
    const fromExists = from && (Vault.data.cases || []).some((x) => x.id === from.caseId);
    panel.replaceChildren(
      ...(from ? [h('p', { class: 'continued-from small' }, I('folder-symlink'), h('span', {}, `Continued from case `),
        fromExists ? h('a', { href: `#/case/${CVRoute.enc(from.caseId)}` }, from.number || 'with no number') : h('span', {}, from.number || 'with no number'),
        h('span', {}, `${from.mission ? ` (Mission ${from.mission})` : ''}${from.name ? `, for ${from.name}` : ''}${from.date ? `, on ${fmtDate(from.date)}` : ''}.`))] : []), // (replaceChildren would show a null)
      // ---- the operation, the same on every one of its case numbers: name, status, dates
      h('section', { class: 'op-card' },
        h('div', { class: 'case-op-bar', 'data-ro-ok': archived ? null : 'true' },
          // v1.151: where the case is filed is in the header above (it was said twice); the bar keeps its buttons.
          // v1.146: an independent case can be in a Case Group (a name you give it) with related cases.
          !op && c.suspectGroup ? h('a', { class: 'case-sg-label', href: `#/group/${CVRoute.enc(c.suspectGroup)}`, title: 'Case Group: open it' }, c.suspectGroup, I('person-badge')) : null,
          h('div', { class: 'spacer' }),
          !op && !archived ? h('button', { class: 'btn small sg-btn', type: 'button', icon: 'person-badge', title: 'Group this case with related cases under a name you give it (not a Mission)', onclick: async () => {
            const n = await caseGroupDialog({ original: c.suspectGroup || '', preset: [c.id], suggest: String(c.subject || '').trim() });
            if (n !== null) showCase(c.id, 'details');
          } }, 'Case Group') : null,
          // v1.148: pin the case to the top of Recently Updated.
          archived ? null : h('button', { class: `btn small pin-case${pinnedIds().includes(c.id) ? ' on' : ''}`, type: 'button', icon: 'pin-angle', title: 'Keep this case at the top of Recently Updated on the home page', onclick: async () => { await togglePin(c); showCase(c.id, 'details'); } }, pinnedIds().includes(c.id) ? 'Unpin' : 'Pin'),
          // v1.50: Move File (it was "Assign to" / "Move to" and Unlink).
          archived ? null : h('button', { class: 'btn small', type: 'button', icon: 'folder-symlink', title: 'Move this case into a Mission, to another one, or back to General Files', onclick: async () => {
            if (await moveCaseDialog(Vault.data.cases.find((x) => x.id === c.id) || c)) { renderCaseList(); showCase(c.id, 'details'); }
          } }, 'Move Case')),
        h('form', { class: `form-grid details-grid op-top details-row4 details-row-title${c.dates.closed ? '' : ' not-closed'}`, onsubmit: (e) => e.preventDefault() },
          field('Subject Name', subjectIn, '', 'The person the case is about. Shown under the Case Number. Several cases can have the same subject.'),
          h('label', { class: 'field', title: c.status === 'Closed' ? 'Pick Open to reopen. Archive uses its button.' : 'No leads left? Close it as Inactive. Close and Archive use the buttons below.' }, h('span', {}, 'Status'), statusSelect, statusNote), // v1.176: the hint is its hover box
          field('Opened', bind(h('input', { type: 'date', value: c.dates.opened || '' }), (v) => { c.dates.opened = v; })),
          // v1.119: the Closed date shows once the case is closed (not "Not closed" on every open case).
          (() => { const f = field('Closed', closedInput); if (!c.dates.closed) f.hidden = true; return f; })()),
        caseTiles(c, members, archived)),
      miniTimeline(c, members, { mine: true }),
      // v1.111: the case's Field Notes, in plain view.
      fieldNotesCard([c], { key: 'details-field-notes' }),
      // ---- this case number
      // v1.44: File Number, Original Case Number, Federal Jacket Number and Client in one row; no Tags.
      h('form', { class: 'form-grid details-grid details-row4', onsubmit: (e) => e.preventDefault() },
        field('Case Number', numberIn, '', `Unique: no two cases, archived ones included, share a Case Number. Folder: ${CVFormat.pathText(`${archived ? 'archive' : 'cases'}\\${c.id}`)}`),
        field('File Number', bind(h('input', { value: c.fileNumber || '', maxlength: 100, title: 'The investigation file. Several cases can share one file number.' }), (v) => { c.fileNumber = v; })),
        field('Federal Jacket Number', dnaCombo(bind(h('input', { value: c.agencyNumber || '', maxlength: 100, title: 'The federal jacket number for this case.' }), (v) => { c.agencyNumber = v; }))),
        field('Client', (() => { const sel = clientSelect(c.client); sel.addEventListener('change', () => { c.client = sel.value; save(); }); return sel; })()),
        dupNow ? h('p', { class: 'error-text span-2 small', role: 'note' }, `Another case also has Case Number ${c.number} (made before Case Numbers had to be unique). Nothing was changed; give one of them a different number.`) : null,
        archived && c.dates.archived ? h('p', { class: 'muted span-2 small' }, `Archived ${fmtDate(c.dates.archived)}`) : null),
      // v1.172: Case Health: what is still open on the case, and the gaps (custody, arrest, checks).
      window.CVHealthUI ? makeFoldable(CVHealthUI.panel(c, { h, icon: I, toast, openDialog, Save, onDriveLost }), 'case-health', { open: true }) : '',
      makeFoldable(partnersSection(c, save), 'overview-partners', { count: () => (c.partners || []).length }),
      // ---- Case Overview: shared by the operation's case numbers (v1.27)
      h('hr', { class: 'overview-sep' }),
      h('div', { class: 'overview-head' }, h('h2', {}, 'Case Overview'),
        h('p', { class: 'muted small' }, members.length > 1 ? `Suspects, contacts and deconfliction for the whole Mission: the same on all ${members.length} case numbers.` : op ? 'Suspects, contacts and deconfliction. Case numbers added to this Mission share them.' : 'Suspects, contacts and deconfliction for this case.')),
      // v1.118: each with how many entries it holds, so you can see without opening it.
      makeFoldable(suspectsSection(c, save), 'overview-suspects', { count: () => (c.suspects || []).length }),
      makeFoldable(contactsSection(c, save), 'overview-contacts', { count: () => { const k = c.contacts || {}; const has = (o) => !!o && Object.values(o).some((v) => String(v || '').trim()); return (has(k.officer) ? 1 : 0) + (has(k.prosecutor) ? 1 : 0) + (k.others || []).filter(has).length; } }),
      makeFoldable(deconflictionSection(c, save), 'overview-deconfliction', { count: () => (c.deconfliction || []).length }),
      makeFoldable(caseHistorySection(c, archived ? null : save), 'case-history', { count: () => (c.activity || []).length }),
      // Everything saves by itself as you type; the button saves now and says so.
      // (An archived case gets an empty string here: a null would show as the word "null".)
      archived ? '' : h('div', { class: 'details-save' },
        h('button', { class: 'btn primary', type: 'button', icon: 'save', title: 'Save this case to the SSD now. Changes also save by themselves a moment after you type.', onclick: async () => {
          save();
          await Save.flushAll();
          if (Save.failed.size) toast('Not saved: reconnect the SSD.', 'error');
          else toast('Case saved to the SSD.', 'success', 2500);
        } }, 'Save changes')),
      // Archive and delete side by side, so the gentler choice is always in view.
      h('section', { class: 'case-actions', 'data-ro-ok': 'true', 'aria-labelledby': 'case-actions-title' },
        h('h3', { id: 'case-actions-title', icon: 'sliders' }, 'Case actions'),
        // Same-size buttons, icon and name; the explanation shows when you point at one.
        h('div', { class: 'case-actions-grid' },
          !archived ? (c.status === 'Closed'
            ? h('button', { class: 'btn action-btn', type: 'button', icon: 'unlock', title: 'Back to Open, for new information. The closing is kept in the case\'s history.', onclick: () => CVClosingUI.reopenCase(c) }, 'Reopen case')
            : h('button', { class: 'btn primary action-btn', type: 'button', icon: 'lock-fill', title: 'Choose how the case ended (arrest, cleared, unfounded…). Loose ends are listed first.', onclick: () => CVClosingUI.closeCaseDialog(c) }, 'Close Case')) : null,
          !archived && !CVClosingUI.hasArrestTab(c) ? h('button', { class: 'btn action-btn', type: 'button', icon: 'person-vcard', title: 'Arrestee, arrest and charges, for the arrest report. Adds an Arrest details tab.', onclick: async () => {
            c.arrest = true;
            delete c.arrestRemoved;
            try { await Save.track(`case:${c.id}`, () => Vault.saveCase(structuredClone(c))); go(c.id, 'arrest'); } catch { /* reported */ }
          } }, 'Add arrest details') : null,
          // The arrest details can be deleted again, also on a case closed by arrest (v1.29).
          !archived && CVClosingUI.hasArrestTab(c) ? h('button', { class: 'btn action-btn', type: 'button', icon: 'trash3', title: 'Takes the Arrest details tab off this case and deletes what was entered in it.', onclick: () => CVClosingUI.deleteArrest(c) }, 'Delete Arrest') : null,
          !archived && c.status === 'Open' ? h('button', { class: 'btn action-btn', type: 'button', icon: 'calendar-check', title: 'Waiting on a lab, the DA or another agency? Puts the date to check back on the Timeline as a deadline.', onclick: () => CVClosingUI.followUpDialog(c) }, 'Add Follow-up') : null,
          !archived && Vault.conventionalId(c) ? h('button', { class: 'btn action-btn', type: 'button', icon: 'folder', title: `Renames this case's folder on the SSD to the <year>-<case no.> convention (${Vault.conventionalId(c)}). Every file is copied and checked first.`, onclick: () => renameCaseFolder(c) }, 'Rename folder') : null,
          !archived ? h('button', { class: 'btn action-btn', type: 'button', icon: 'archive', title: 'Keeps it read-only in the archive; it can still be opened, searched and restored.', onclick: () => archiveCase(c) }, 'Archive Case') : null,
          h('button', { class: 'btn action-btn', type: 'button', icon: 'file-earmark-pdf', title: 'One page for a supervisor: status, disposition, arrestees and charges, exhibits and the timeline.', onclick: () => caseSummary(c) }, 'Case Summary'),
          h('button', { 'data-ro-ok': 'true', class: 'btn action-btn', type: 'button', icon: 'lock-fill', title: 'The whole case in one password-locked file on the SSD. Settings → Backups → Import Case opens it.', onclick: async () => { try { (await CVLazy.caseExport()).exportDialog(c); } catch (err) { toast(`Could not open Export Encrypted: ${err.message}`, 'error'); } } }, 'Export Encrypted'),
          h('button', { 'data-ro-ok': 'true', class: 'btn action-btn', type: 'button', icon: 'copy', title: 'Copies the case number, subject, charges, next court date and next deadline, to paste into an email or a message.', onclick: () => copyCaseDetails(c) }, 'Copy Case Details'),
          h('button', { class: 'btn danger action-btn', type: 'button', icon: 'trash3', title: 'Moves the case to Recently Deleted (⋮ → Vault) for 30 days, then deletes it for good.', onclick: () => deleteCase(c) }, 'Delete case…'))));

    // Cases of the operation made before v1.27 each had their own suspects, contacts and
    // deconfliction: join them into the one Case Overview (then it's the same on all of them).
    if (members.length > 1) (async () => {
      const sibs = [];
      sibs.push(...(await Promise.all(members.slice(1).map((o) => Vault.getCase(o.id).catch(() => null)))).filter(Boolean)); // v1.151: at once; moved or missing ones left out
      const merged = CVOperation.mergeOverview([c, ...sibs]);
      if (CVOperation.sameOverview(c, { ...c, ...merged }) || state.caseId !== c.id || !panel.isConnected) return;
      Object.assign(c, merged);
      save();
      renderDetails(panel, c);
    })();
  }

  // Client: who the case is for. A value from before v1.14 that isn't one of these is kept as its
  // own choice, so nothing is lost.
  const CLIENTS = ['State', 'Federal', 'Other'];
  function clientSelect(value, attrs = {}) {
    const v = String(value || '');
    const opts = ['', ...CLIENTS, ...(v && !CLIENTS.includes(v) ? [v] : [])];
    return h('select', { title: 'Who the case is for: State, Federal or Other.', ...attrs }, opts.map((o) => h('option', { value: o, selected: o === v }, o || '—')));
  }

  /* v1.98: the Case Overview on the Details tab is in js/case-overview.js. */
  function suspectsSection(...args) { return PARTS.overview.suspectsSection(...args); }
  function miniTimeline(...args) { return PARTS.overview.miniTimeline(...args); }
  function caseTiles(...args) { return PARTS.overview.caseTiles(...args); }
  function partnersSection(...args) { return PARTS.overview.partnersSection(...args); }
  function contactsSection(...args) { return PARTS.overview.contactsSection(...args); }
  function deconflictionSection(...args) { return PARTS.overview.deconflictionSection(...args); }
  function historyOf(...args) { return PARTS.overview.historyOf(...args); }
  function caseHistorySection(...args) { return PARTS.overview.caseHistorySection(...args); }

  /* v1.136: Year Summary: cases opened, closed and archived in a year, arrests by month, charges by
   * type and the most common ones, narcotics recovered; on screen, and as a PDF. */
  /* v1.186: Summaries: the week (what changed on each case) or the year (a year at a glance). */
  function summariesDialog() {
    const opt = (label, icon, note, run) => h('button', { type: 'button', class: 'sum-opt', onclick: () => { close(); run(); } },
      h('span', { class: 'sum-opt-icon' }, I(icon)), h('span', { class: 'sum-opt-label' }, label), h('span', { class: 'sum-opt-note small muted' }, note));
    let close = () => {};
    return openDialog((done) => {
      close = done;
      return h('div', { class: 'sum-choice' },
        h('h2', { icon: 'bar-chart-line-fill' }, 'Summaries'),
        h('p', { class: 'muted small' }, 'Which breakdown? Both print as a PDF.'),
        h('div', { class: 'sum-options', role: 'group', 'aria-label': 'Breakdown' },
          opt('Week', 'calendar-check', 'What changed on each case in a week, and what was on its Timeline', () => openAgenda('weekly')),
          opt('Year', 'bar-chart-line-fill', 'Cases opened, closed and archived, arrests, charges and narcotics recovered', () => yearSummary())),
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => done() }, 'Cancel')));
    });
  }

  /* v1.186: the Narrative Helper page (#/narrative), loaded with the Reports tab's code. */
  async function showNarrativeHelper() {
    pageStart('Narrative Helper');
    const main = $('#main');
    main.replaceChildren(h('p', { class: 'muted' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Opening…'));
    try { await CVLazy.reports(); await CVNarrativeHelper.render(main); } catch (err) { if (FS.isDisconnectError(err)) onDriveLost(); else toast(`Could not open the Narrative Helper: ${err.message}`, 'error'); }
  }

  async function openAgenda(which) {
    try { await (await CVLazy.agenda())[which](); } catch (err) { if (FS.isDisconnectError(err)) onDriveLost(); else toast(`Could not open: ${err.message}`, 'error'); }
  }
  async function yearSummary(pickYear) {
    const entries = (Vault.data && Vault.data.cases) || [];
    const arrests = new Map();
    try {
      await Promise.all(entries.map(async (e) => { arrests.set(e.id, await Vault.readCaseJSON(e.id, 'arrest.json').catch(() => null)); }));
    } catch (err) { if (FS.isDisconnectError(err)) return onDriveLost(); }
    try { await CVKit.loadScripts(['js/year-summary.js']); } catch (err) { toast(`Could not open: ${err.message}`, 'error'); return undefined; } // v1.156: loaded on first use
    const years = CVYearSummary.years(entries, arrests, today().slice(0, 4));
    let year = pickYear && years.includes(String(pickYear)) ? String(pickYear) : years[0];
    const pdfOf = async (s) => CVYearSummary.build(s, { letterhead: await CVLetterhead.forPdf().catch(() => null), printed: fmtDate(today()) });
    return openDialog((close) => {
      const body = h('div', { class: 'ys-body' });
      const sel = h('select', { 'aria-label': 'Year' }, years.map((y) => h('option', { value: y, selected: y === year }, y)));
      const stat = (n, label, icon) => h('div', { class: 'ys-stat' }, h('strong', {}, String(n)), h('span', { class: 'muted small' }, label, ' ', I(icon)));
      const draw = () => {
        const s = CVYearSummary.compute(year, entries, arrests);
        const max = Math.max(1, ...s.byMonth);
        body.replaceChildren(
          h('div', { class: 'ys-stats' }, stat(s.opened.length, 'Cases opened', 'folder-plus'), stat(s.closed.length, 'Cases closed', 'folder-closed'),
            stat(s.archived.length, 'Archived', 'folder-archived'), stat(s.arrests, 'Arrests', 'person-badge'), stat(s.charges.total, 'Charges', 'list-ol')),
          h('h3', { class: 'ys-h' }, 'Arrests by Month'),
          h('div', { class: 'ys-months', role: 'img', 'aria-label': `Arrests by month: ${s.byMonth.map((n, i) => `${CVYearSummary.MONTHS[i]} ${n}`).join(', ')}` },
            s.byMonth.map((n, i) => {
              const bar = h('span', { class: 'ys-bar' });
              bar.style.height = `${Math.round((n / max) * 100)}%`; // set in script: the page allows no inline styles
              return h('div', { class: 'ys-month', title: `${CVYearSummary.MONTHS[i]}: ${n}` }, h('span', { class: 'ys-n' }, n ? String(n) : ''), bar, h('span', { class: 'ys-m muted small' }, CVYearSummary.MONTHS[i]));
            })),
          h('h3', { class: 'ys-h' }, 'Charges'),
          h('p', { class: 'ys-line' }, `Felony ${s.charges.felony} · Misdemeanor ${s.charges.misdemeanor} · Other or unknown ${s.charges.other}`),
          s.topCharges.length ? h('table', { class: 'data-table ys-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Most common charges'), h('th', { class: 'num' }, 'Counts'))),
            h('tbody', {}, s.topCharges.map(([label, n]) => h('tr', {}, h('td', {}, label), h('td', { class: 'num' }, String(n)))))) : h('p', { class: 'muted small' }, 'No charges on Arrest Reports this year.'),
          h('h3', { class: 'ys-h' }, 'Narcotics Recovered'),
          s.narcotics.length ? h('table', { class: 'data-table ys-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Narcotic'), h('th', { class: 'num' }, 'Total'), h('th', { class: 'num' }, 'Entries'))),
            h('tbody', {}, s.narcotics.map((n) => h('tr', {}, h('td', {}, n.drug), h('td', { class: 'num' }, `${n.total || '—'}${n.unit ? ` ${n.unit}` : ''}`), h('td', { class: 'num' }, String(n.count)))))) : h('p', { class: 'muted small' }, 'No narcotics on Arrest Reports this year.'),
          h('p', { class: 'muted small' }, 'From the case dates and the Arrest Reports (arrest date, charges, recovered narcotics).'));
      };
      sel.addEventListener('change', () => { year = sel.value; draw(); });
      draw();
      return h('div', { class: 'year-summary' },
        h('div', { class: 'ys-head' }, h('h2', {}, 'Year Summary'), sel, h('div', { class: 'spacer' }),
          h('button', { class: 'btn primary', type: 'button', icon: 'printer', onclick: async () => {
            const bytes = await pdfOf(CVYearSummary.compute(year, entries, arrests));
            const name = `Year Summary ${year}.pdf`;
            close();
            await openDialog((done) => h('div', { class: 'pdf-view' }, h('h2', {}, `Year Summary ${year}`), CVPdfViewer.create(bytes, { h, icon: I, title: 'Year Summary', fileName: name }),
              h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => { done(); yearSummary(year); } }, 'Back'), h('button', { class: 'btn primary', type: 'button', onclick: () => done() }, 'Close'))));
          } }, 'Print / PDF')),
        body);
    });
  }

  /* v1.153: Copy Case Details: a few lines to paste into an email (cleared from the clipboard after 2 minutes). */
  let detailsClip = null;
  async function copyCaseDetails(c) {
    const [arrest, tl] = await Promise.all([
      Vault.readCaseJSON(c.id, 'arrest.json').catch(() => null),
      Vault.getTimeline(c.id).catch(() => ({ events: [] })),
    ]);
    const text = CVCaseSummary.detailsText({ c, subject: subj(c), mission: CVOperation.opLabel(opOf(c)), arrest, timeline: tl, today: today(), fmtDate });
    try {
      await navigator.clipboard.writeText(text);
      toast('Case details copied. They are cleared from the clipboard in 2 minutes.', 'success', 4000);
      clearTimeout(detailsClip);
      detailsClip = setTimeout(() => { navigator.clipboard.writeText(' ').catch(() => {}); }, 120000);
    } catch { toast('Could not copy: click in the CaseVault window first, then try again.', 'error'); }
  }

  /* v1.85: Case Summary: one page for a supervisor, as a PDF (the letterhead on top). */
  async function caseSummary(c) {
    let arrest = null; let fields = null; let tl = { events: [] };
    try {
      [arrest, fields, tl] = await Promise.all([
        Vault.readCaseJSON(c.id, 'arrest.json').catch(() => null),
        Vault.readCaseJSON(c.id, 'report-fields.json').catch(() => null),
        Vault.getTimeline(c.id).catch(() => ({ events: [] })),
      ]);
    } catch (err) { if (FS.isDisconnectError(err)) return onDriveLost(); }
    const op = opOf(c);
    const lh = await CVLetterhead.forPdf().catch(() => null);
    const bytes = CVCaseSummary.build({ c, op, arrest, fields, timeline: tl, history: historyOf(c).map((r) => (r.note ? { ...r, what: `Note: ${r.what}` } : r)), fmtDate }, { letterhead: lh, printed: fmtDate(today()) });
    const name = `Case Summary ${c.number || 'case'}.pdf`.replace(/[\\/:*?"<>|]/g, '');
    const viewer = CVPdfViewer.create(bytes, { h, icon: I, title: 'Case Summary', fileName: name });
    await openDialog((done) => h('div', { class: 'pdf-view' }, h('h2', {}, 'Case Summary'), viewer,
      h('div', { class: 'dialog-actions' },
        Vault.isArchived(c.id) ? null : h('button', { class: 'btn', type: 'button', icon: 'save', title: 'Save this PDF in the case\'s Files', onclick: async () => {
          try { await Save.track(`files:${c.id}`, () => Vault.addFile(c.id, new File([bytes], name, { type: 'application/pdf' }), { folder: 'Supplementary Report', description: 'Case Summary', replace: true })); toast('Saved to Files → Supplementary Report.', 'success'); } catch (err) { toast(`Not saved: ${err.message}`, 'error'); }
        } }, 'Save PDF to Case'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => done() }, 'Done'))));
    viewer.destroy();
  }

  // Pending edits to a case that is being deleted are dropped rather than written.
  function dropPendingSaves(id) {
    for (const key of [...Save.timers.keys()]) {
      if (key === `case:${id}` || key.startsWith(`notes:${id}`) || key.startsWith(`timeline:${id}`) || key.startsWith(`draft:${id}:`)) {
        clearTimeout(Save.timers.get(key).timer);
        Save.timers.delete(key);
      }
    }
    Save.render();
  }

  /** v1.180: why a case (or a closed Mission's case numbers) goes to the archive: one of the archive
   * folders, or Other with the reason written in. passed: the date the statute of limitations
   * passed, to pick EXPIRED. -> { folder, reason } or null */
  function archiveReasonDialog(heading, message, { passed = '', confirmText = 'Archive Case' } = {}) {
    // v1.84: a reason is required: one of the folders, or Other with the reason written in.
    const REASONS = { expired: 'Statute of limitations passed', nolle: 'Nolle prosequi: the charges were dropped', prosecution: 'Prosecution finished', '': 'Other reason' };
    return openDialog((close) => {
      const note = h('textarea', { rows: 2, maxlength: 400, placeholder: 'Why the case is archived', 'aria-label': 'Reason for archiving' });
      const ok = h('button', { class: 'btn primary', type: 'submit', disabled: true }, confirmText);
      const pick = h('div', { class: 'arch-pick', role: 'radiogroup', 'aria-label': 'Reason and archive folder' },
        [...Vault.ARCHIVE_FOLDERS.map(([k]) => [k, Vault.archiveFolderName(k)]), ['', Vault.archiveFolderName('other')]].map(([k, label]) => h('label', { class: 'arch-opt' },
          h('input', { type: 'radio', name: 'arch-folder', value: k, checked: passed && k === 'expired' }), I(k ? 'folder-archived' : 'archive'),
          h('span', {}, h('strong', {}, label), h('span', { class: 'muted small block' }, REASONS[k])))));
      const hint = h('p', { class: 'small arch-need' });
      const sync = () => {
        const sel = pick.querySelector('input:checked');
        const other = !!sel && sel.value === '';
        note.placeholder = other ? 'Required: why the case is archived' : 'Optional: more about the reason';
        ok.disabled = !sel || (other && !note.value.trim());
        hint.textContent = !sel ? 'Choose why the case is archived.' : other && !note.value.trim() ? 'Write the reason for Other.' : '';
        hint.hidden = !hint.textContent;
      };
      pick.addEventListener('change', sync);
      note.addEventListener('input', sync);
      sync();
      return h('form', { class: 'confirm arch-form', onsubmit: (e) => {
        e.preventDefault();
        if (ok.disabled) return;
        const k = pick.querySelector('input:checked').value;
        const more = note.value.trim();
        close({ folder: k, reason: k ? `${REASONS[k]}${more ? `: ${more}` : ''}` : more });
      } },
        h('h2', { icon: 'archive' }, heading),
        h('p', {}, message),
        formSect('Reason', 'folder-archived'), pick,
        passed ? formHint(`The statute of limitations passed on ${fmtDate(passed)}, so EXPIRED is picked.`) : null,
        field('Reason details', note), hint,
        h('p', { class: 'muted small explain' }, 'It leaves the case list and opens read-only from "Archived" at the bottom of the list. You can restore it at any time.'),
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
          ok));
    });
  }

  async function archiveCase(c) {
    // v1.67: which Archived sub-folder: EXPIRED (statute of limitations passed), NOLLE PROSEQUI,
    // PROSECUTION, or none.
    const entry = Vault.data.cases.find((x) => x.id === c.id);
    const passed = entry && entry.sol && globalThis.CVLimits && CVLimits.state(entry.sol, today()) === 'expired';
    const choice = await archiveReasonDialog('Move this case to the archive?', `"${c.title || 'Untitled case'}" moves to CaseVault-Data\\archive on the SSD, with its notes, timeline, files, drafts and checks. Every file is copied and checked before the original is removed.`, { passed: passed ? entry.sol.expires : '' });
    if (choice == null) return;
    const { folder, reason } = choice;
    await Save.flushAll();
    if (Save.failed.size) return toast('Some changes are not saved yet. Reconnect the SSD, then archive.', 'error', 8000);
    const progress = toast('Archiving: copying and checking files…', 'info', 600000);
    try {
      await Save.track(`archive:${c.id}`, () => Vault.archiveCase(c.id, (n, name) => { progress.textContent = `Archiving: ${n} file${n === 1 ? '' : 's'} copied and checked (${name})…`; }, folder, reason));
      progress.remove();
      state.caseObj = null;
      toast('Case archived. It opens read-only from "Archived" in the case list.', 'success', 7000);
      renderCaseList();
      route();
    } catch (err) {
      progress.remove();
      if (FS.isDisconnectError(err)) return onDriveLost();
      toast(`The case was not archived: ${err.message} It is still in the active list, unchanged.`, 'error', 12000);
      state.caseObj = null;
      route();
    }
  }

  async function renameCaseFolder(c) {
    await Save.flushAll();
    if (Save.failed.size) return toast('Some changes are not saved yet. Reconnect the SSD first.', 'error', 8000);
    const progress = toast('Renaming: copying and checking files…', 'info', 600000);
    try {
      const updated = await Save.track(`rename:${c.id}`, () => Vault.renameCaseFolder(c.id, (n) => { progress.textContent = `Renaming: ${n} file${n === 1 ? '' : 's'} copied and checked…`; }));
      progress.remove();
      state.caseObj = null;
      toast(`Case folder renamed to ${updated.id}.`, 'success', 7000);
      renderCaseList();
      go(updated.id, 'details');
    } catch (err) {
      progress.remove();
      if (FS.isDisconnectError(err)) return onDriveLost();
      toast(`The folder was not renamed: ${err.message} The case is unchanged.`, 'error', 12000);
    }
  }

  async function restoreCase(c) {
    const progress = toast('Restoring: copying and checking files…', 'info', 600000);
    try {
      await Save.track(`restore:${c.id}`, () => Vault.restoreCase(c.id, (n) => { progress.textContent = `Restoring: ${n} file${n === 1 ? '' : 's'} copied and checked…`; }));
      progress.remove();
      state.caseObj = null;
      toast('Case restored to the active list.', 'success');
      renderCaseList();
      route();
    } catch (err) {
      progress.remove();
      if (FS.isDisconnectError(err)) return onDriveLost();
      toast(`The case was not restored: ${err.message} It is still in the archive, unchanged.`, 'error', 12000);
    }
  }

  // Delete needs the case number typed (the title when there's no number), and offers the archive instead.
  async function deleteCase(c) {
    const want = Vault.deleteConfirmText(c);
    const archived = Vault.isArchived(c.id);
    const choice = await openDialog((close) => {
      const typed = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-describedby': 'delete-help' });
      const del = h('button', { class: 'btn danger', type: 'submit', disabled: true }, 'Delete');
      typed.addEventListener('input', () => { del.disabled = !Vault.deleteConfirmMatches(c, typed.value); });
      return h('form', { class: 'delete-form', onsubmit: (e) => { e.preventDefault(); if (Vault.deleteConfirmMatches(c, typed.value)) close('delete'); } },
        h('h2', {}, `Delete "${c.title || 'Untitled case'}"?`),
        h('p', { class: 'error-text' }, `Deletes this case: notes, timeline, files, drafts and checks. It is kept in Recently Deleted (⋮ → Vault) for ${Vault.BIN_DAYS} days, where you can restore it; after that it is gone for good.`),
        archived ? null : h('p', { class: 'muted small explain' }, 'To keep it out of the way but safe, archive it instead.'),
        h('label', { class: 'field' },
          h('span', { id: 'delete-help' }, c.number ? 'Type the case number to confirm: ' : 'Type the case title to confirm: ', h('code', {}, want)),
          typed),
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
          archived ? null : h('button', { class: 'btn', type: 'button', onclick: () => close('archive') }, 'Archive instead'),
          del));
    });
    if (choice === 'archive') return archiveCase(c);
    if (choice !== 'delete') return;
    // v1.85: asked twice. The last one, over a big skull and crossbones, is a little less serious.
    const last = await openDialog((close) => {
      const no = h('button', { class: 'btn primary', type: 'button', autofocus: true, onclick: () => close(false) }, 'Spare It');
      return h('form', { class: 'doom-form', onsubmit: (e) => { e.preventDefault(); close(true); } },
        h('div', { class: 'doom-skull', 'aria-hidden': 'true' }, I('skull-crossbones')),
        h('div', { class: 'doom-body' },
          h('h2', {}, 'Last Chance, Detective'),
          h('p', { class: 'doom-case' }, c.number || c.title || 'This case'),
          h('p', {}, `You are about to send this case to the evidence locker in the sky. It waits there ${Vault.BIN_DAYS} days in Recently Deleted, in case you change your mind. After that, IT cannot pull it out of a dumpster for you.`),
          h('p', { class: 'muted small' }, 'Did you make a full backup? No judgment. Okay, a little judgment.'),
          h('div', { class: 'dialog-actions' },
            no,
            h('button', { class: 'btn danger', type: 'submit', icon: 'skull-crossbones' }, 'Delete It'))));
    });
    if (!last) { toast('Case spared. It lives to see another day.', 'success'); return; }
    dropPendingSaves(c.id);
    try {
      await Save.track(`delete:${c.id}`, () => Vault.deleteCase(c.id));
      state.caseObj = null;
      toast(`Case deleted. It is in ⋮ → Vault → Recently Deleted for ${Vault.BIN_DAYS} days.`, 'success', 6000);
      renderCaseList();
      go(null);
    } catch { /* reported by Save */ }
  }

  /* ---------- Restore cases from a full backup (v1.106) ---------- */

  /* ---------- Search Inside Cases (v1.106) ---------- */

  async function searchInsideCases(query) {
    const q = String(query || '').trim();
    if (!q || !state.connected) return;
    await Save.flushAll().catch(() => {});
    let stopped = false;
    await openDialog((close) => {
      const status = h('p', { class: 'muted small deep-status' }, 'Looking…');
      const list = h('div', { class: 'deep-results' });
      const box = h('div', { class: 'deep-search' },
        h('h2', { icon: 'search' }, `Search Inside Cases: "${q}"`),
        h('p', { class: 'muted small' }, 'Notes, timeline, reports, the Draft form, arrest details, suspects and contacts, and file names. Every word has to be in the same place.'),
        status, list,
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => { stopped = true; close(null); } }, 'Done')));
      // Started once the window is on screen; closing it (Done, Esc, a result) stops the search.
      setTimeout(() => CVCaseSearch.search(Vault, q, { stop: () => stopped || !box.isConnected, isFatal: (err) => FS.isDisconnectError(err), onCase: (n, total) => { status.textContent = `Looking… ${n} of ${total} cases`; } })
        .then((results) => {
          if (!box.isConnected) return;
          const hits = results.reduce((n, r) => n + r.hits.length, 0);
          status.textContent = results.length ? `${hits} match${hits === 1 ? '' : 'es'} in ${plural(results.length, 'case')}.` : '';
          list.replaceChildren(...(results.length ? results.map((r) => h('section', { class: 'deep-case' },
            h('h3', {}, h('span', { class: 'deep-num' }, r.number || r.title || 'No case number'), r.subject ? h('span', { class: 'muted small' }, r.subject) : null, r.archived ? h('span', { class: 'pill status-archived' }, 'Archived') : null),
            h('ul', {}, r.hits.slice(0, 12).map((x) => h('li', {}, h('a', { href: `#/case/${CVRoute.enc(r.id)}/${x.tab}`, onclick: () => { stopped = true; close(null); } }, h('strong', {}, x.where), h('span', { class: 'deep-snippet' }, x.snippet)))),
              r.hits.length > 12 ? h('li', { class: 'muted small' }, `and ${r.hits.length - 12} more`) : null)))
            : [h('div', { class: 'empty-state' }, I('search'), h('p', {}, `Nothing found for "${q}".`), h('p', { class: 'muted small' }, 'Check the spelling, or try fewer words.'))]));
        })
        .catch((err) => { if (FS.isDisconnectError(err)) { close(null); onDriveLost(); } else status.textContent = `The search stopped: ${err.message}`; }), 0);
      return box;
    });
    stopped = true;
  }

  /* ---------- Notes ---------- */

  async function renderNotes(panel, c, token) {
    const text = await Vault.getNotes(c.id);
    if (token !== state.renderToken) return;
    // The case notes are opened from Reports (v1.17).
    const back = h('a', { href: `#/case/${CVRoute.enc(c.id)}/reports`, class: 'back-link' }, '← All reports');
    const ta = h('textarea', { class: 'notes-editor', spellcheck: 'true', 'aria-label': 'Field Notes', placeholder: 'Write notes here.' });
    ta.value = text;
    const counter = h('span', { class: 'muted small' });
    const updateCount = () => {
      const words = (ta.value.match(/\S+/g) || []).length;
      counter.textContent = `${words} word${words === 1 ? '' : 's'} · notes.md`;
    };
    updateCount();

    // Notes save by themselves a moment after typing stops; Save (or Ctrl+S) writes them now.
    const key = `notes:${c.id}`;
    const status = h('span', { class: 'note-save-status small muted', role: 'status', 'aria-live': 'polite' }, text ? '✓ Saved on the SSD' : '');
    const markSaved = () => { status.className = 'note-save-status small ok-text'; status.textContent = `✓ Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; };
    const saveNotes = (value) => async () => {
      await Vault.saveNotes(c.id, value);
      if (ta.value === value) markSaved();
      window.dispatchEvent(new CustomEvent('cv-notes-changed', { detail: { caseId: c.id, text: value, from: 'page' } }));
    };
    // Written in the floating Field Notes box (v1.24): shown here too, unless you're typing here.
    const onFloat = (e) => {
      const d = e.detail || {};
      if (!panel.isConnected) { window.removeEventListener('cv-notes-changed', onFloat); return; }
      if (d.from !== 'float' || d.caseId !== c.id || panel.contains(document.activeElement)) return;
      ta.value = d.text; updateCount(); markSaved();
    };
    window.addEventListener('cv-notes-changed', onFloat);
    ta.addEventListener('input', () => {
      updateCount();
      status.className = 'note-save-status small warn-text';
      status.textContent = 'Not saved yet…';
      Save.schedule(key, saveNotes(ta.value), 700);
    });
    const btnSave = h('button', { class: 'btn small primary', type: 'button', title: 'Save now (Ctrl+S). Notes also save by themselves.' }, 'Save');
    btnSave.addEventListener('click', async () => {
      const pending = Save.timers.get(key);
      if (pending) { clearTimeout(pending.timer); Save.timers.delete(key); }
      btnSave.disabled = true;
      try { await Save.run(key, saveNotes(ta.value)); markSaved(); } catch { /* shown by the header indicator */ } finally { btnSave.disabled = false; }
    });

    // Formatted (bold shows bold, as in Word) or Markdown; notes.md stays Markdown (v1.19).
    const rich = CVRichEditor.create(ta, { h, icon: I, label: 'Field Notes' });
    const fmtBar = CVFormatBar.attach(ta, { h, icon: I, rich });

    panel.replaceChildren(
      h('div', { class: 'notes-head' }, back, h('h2', { icon: 'journal-text' }, 'Field Notes')),
      h('div', { class: 'toolbar' }, fmtBar, h('div', { class: 'spacer' }), counter, status, btnSave),
      rich.el, ta);
  }

  /* v1.98: the Timeline tab is in js/case-timeline.js. */
  function renderTimeline(...args) { return PARTS.timeline.renderTimeline(...args); }

  /* v1.98: the Files tab is in js/files-tab.js. */
  function renderFiles(...args) { return PARTS.files.renderFiles(...args); }
  function previewFile(...args) { return PARTS.files.previewFile(...args); }

  /* =====================================================================
   * Vault panel
   * ===================================================================== */

  async function showVaultPanel(section = null) {
    if (!state.connected) return;
    let backups = [];
    // v1.153: Templates is part of Reports, which loads on first use.
    const [, list] = await Promise.all([CVLazy.reports().catch(() => null), Vault.listBackups().then((x) => x, (err) => { if (FS.isDisconnectError(err)) throw err; return []; })]).catch(() => [null, null]);
    if (!list) return onDriveLost();
    backups = list;
    const v = Vault.data;
    await openDialog((close) => {
      const keep = h('input', { type: 'number', min: 1, max: 365, value: v.settings.backupsToKeep, class: 'narrow' });
      keep.addEventListener('change', () => {
        const n = Math.max(1, Math.min(365, parseInt(keep.value, 10) || 30));
        keep.value = n;
        Save.track('settings', () => Vault.updateSettings({ backupsToKeep: n })).catch(() => {});
      });
      const info = h('section', { 'data-section': 'vault' },
        h('h3', {}, 'This vault'),
        h('div', { class: 'vault-facts' },
          [['folder2-open', 'Folder', Vault.root.name], ['collection', 'Cases', String(v.cases.length)], ['calendar-event', 'Created', v.created ? fmtDateTime(Date.parse(v.created)) : '—'],
            ['shield-check', 'App version', Vault.APP_VERSION], [MODE === 'direct' ? 'usb-drive' : 'plug', 'Mode', MODE === 'direct' ? 'Direct' : 'Helper', MODE === 'direct' ? 'The browser opens the SSD itself.' : 'The CaseVault helper on 127.0.0.1 opens the SSD.']]
            .map(([ic, k, val, tip]) => h('div', { class: 'fact', title: tip || null }, h('span', { class: 'fact-icon' }, I(ic)), h('span', {}, h('span', { class: 'small muted block' }, k), h('strong', {}, val))))),
        h('p', { class: 'muted small' }, 'Vault ID ', h('span', { class: 'mono' }, v.vaultId || '—')));
      // v1.85: a full backup to another drive, and each vault.json backup can be restored.
      const last = v.settings.lastFullBackup;
      const age = fullBackupAge();
      const restoreRow = (name) => h('li', { class: 'backup-row' }, h('span', { class: 'mono small' }, name),
        h('button', { class: 'btn small', type: 'button', icon: 'arrow-counterclockwise', title: 'Puts this copy of vault.json back. The current one is backed up first.', onclick: async () => {
          const ok = await confirmDialog({ title: 'Restore This Backup?', message: `vault.json goes back to ${name}: the case list, Missions and settings as they were then. The current vault.json is backed up first, so this can be undone by restoring that copy. Case folders are not changed; every case still on the SSD stays in the list.`, confirmText: 'Restore', danger: true });
          if (!ok) return;
          await Save.flushAll();
          try {
            const r = await Save.track('restore', () => Vault.restoreBackup(name));
            close();
            toast(`Restored ${name}: ${r.cases} case${r.cases === 1 ? '' : 's'}. The previous vault.json is saved as ${r.safety}.`, 'success', 10000);
            state.caseObj = null;
            renderCaseList();
            route();
          } catch (err) { toast(`Not restored: ${err.message}`, 'error', 9000); }
        } }, 'Restore'));
      const backupsSec = h('section', { 'data-section': 'backups' },
        h('h3', {}, 'Backups'),
        h('div', { class: `backup-full${age == null || age > fullBackupDays() ? ' backup-due' : ''}` },
          h('span', { class: 'fact-icon' }, I('hdd-fill')),
          h('div', {}, h('strong', { class: 'block' }, 'Whole vault to another drive'),
            h('span', { class: 'small' }, last && last.at ? `${fullBackupText()} (${fmtDateTime(Date.parse(last.at))})${last.files ? `, ${last.files} files, ${fmtSize(last.bytes)}, checked` : last.manual ? ', copied by hand' : ''}.` : 'No full backup yet. If the SSD is lost or fails, everything on it is gone.'),
            h('span', { class: 'muted small block' }, `Do this at least every ${fullBackupDays()} days, or after ${FULL_BACKUP_CHANGES} changes (${changesSinceBackup()} so far). The banner reminds you.`),
            // v1.171: how often the banner reminds you.
            (() => {
              const sel = h('select', { class: 'backup-every', 'aria-label': 'Remind me to back up every' }, BACKUP_EVERY.map((d) => h('option', { value: String(d), selected: d === fullBackupDays() }, `Every ${d} Days`)));
              sel.addEventListener('change', async () => { try { await Save.track('settings', () => Vault.updateSettings({ backupEveryDays: Number(sel.value) })); toast(`The banner now asks for a backup every ${sel.value} days.`, 'success'); } catch { /* reported */ } });
              return h('label', { class: 'inline backup-every-row small' }, 'Remind me ', sel);
            })()),
          h('div', { class: 'spacer' }),
          h('button', { class: 'btn primary', type: 'button', icon: 'hdd-fill', onclick: async () => { close(); await fullBackupDialog(); } }, 'Back Up Everything')),
        h('div', { class: `backup-full backup-enc${driveEncryptionWarning() ? ' backup-due' : ''}` },
          h('span', { class: 'fact-icon' }, I(state.bitlocker === 'on' ? 'shield-lock-fill' : 'unlock')),
          h('div', {}, h('strong', { class: 'block' }, `This SSD: ${encryptionText(state.bitlocker)}`),
            h('span', { class: 'small' }, driveEncryptionWarning() || (state.bitlocker === 'on' ? 'Cases on it can only be read after the drive is unlocked with its BitLocker password.'
              : MODE === 'direct' ? 'Chrome and Edge cannot tell. In File Explorer, the CASEVAULT drive should show a padlock; if not, right-click it → Turn on BitLocker.'
                : 'Windows did not say. In File Explorer, the CASEVAULT drive should show a padlock; if not, right-click it → Turn on BitLocker.')))),
        h('p', {}, `A copy of vault.json (the case list, Missions and settings) is saved once a day. ${backups.length} backup${backups.length === 1 ? '' : 's'} on the SSD${backups[0] ? `, newest: ${backups[0]}` : ''}.`),
        backups.length ? h('details', { class: 'backup-list' }, h('summary', {}, 'Restore a vault.json backup'), h('ul', {}, backups.slice(0, 30).map(restoreRow))) : null,
        h('div', { class: 'row' },
          h('label', { class: 'inline' }, 'Keep the newest ', keep, ' backups'),
          h('div', { class: 'spacer' }),
          h('button', { class: 'btn', type: 'button', icon: 'save', onclick: async () => {
            try { const name = await Save.track('backup', () => Vault.backupNow()); toast(`Backup saved: ${name}`, 'success'); close(); } catch { /* reported */ }
          } }, 'Back up now')),
        // v1.149: the last 10 full backups.
        (v.settings.backupHistory || []).length ? h('details', { class: 'backup-list backup-history' },
          h('summary', {}, `Full backup history (last ${v.settings.backupHistory.length})`),
          h('table', { class: 'data-table backup-hist-table' },
            h('thead', {}, h('tr', {}, ['Date', 'Drive or Folder', 'Size', 'Checked'].map((t) => h('th', {}, t)))),
            h('tbody', {}, v.settings.backupHistory.map((b) => h('tr', {},
              h('td', { class: 'nowrap' }, fmtDateTime(Date.parse(b.at))),
              h('td', { class: 'backup-hist-where', title: b.folder || null }, b.manual ? 'Copied by hand' : [b.where, b.folder].filter(Boolean).join(' · ') || '—'),
              h('td', { class: 'nowrap' }, b.bytes ? `${fmtSize(b.bytes)} · ${plural(b.files, 'file')}` : '—'),
              h('td', { class: 'nowrap' }, b.verified ? 'Yes' : 'No')))))) : null,
        // v1.149: read a sample of a backup back, without changing anything.
        h('div', { class: `backup-full backup-test${backupTestDue() ? ' backup-due' : ''}` },
          h('span', { class: 'fact-icon' }, I('clipboard2-pulse')),
          h('div', {}, h('strong', { class: 'block' }, 'Test a backup'),
            // v1.171: when it was last tested, and how it went.
            (() => { const t = v.settings.lastBackupTest; return h('span', { class: 'small block backup-tested' }, t && t.at ? `Last tested ${fmtDateTime(Date.parse(t.at))}${t.backup ? ` (${t.backup})` : ''}: ${t.ok ? 'it read back fine' : 'it had problems'}.` : 'Not tested yet.'); })(),
            h('span', { class: 'muted small block' }, `Reads 20 random files of a CaseVault-Backup folder and compares them with the SSD. Nothing is changed or copied. Do it at least every ${BACKUP_TEST_DAYS} days.`)),
          h('div', { class: 'spacer' }),
          h('button', { class: 'btn', type: 'button', icon: 'clipboard2-pulse', onclick: async () => { close(); await testRestoreDialog(); } }, 'Test Restore')),
        // v1.153: a case from Export Encrypted (a .cvcase file).
        h('div', { class: 'backup-full backup-import' },
          h('span', { class: 'fact-icon' }, I('unlock')),
          h('div', {}, h('strong', { class: 'block' }, 'Import an encrypted case'),
            h('span', { class: 'muted small block' }, 'A .cvcase file made with Export Encrypted (saved on the SSD, or from another drive), and its password.')),
          h('div', { class: 'spacer' }),
          h('button', { class: 'btn', type: 'button', icon: 'unlock', onclick: async () => { close(); try { (await CVLazy.caseExport()).importDialog(); } catch (err) { toast(`Could not open Import Case: ${err.message}`, 'error'); } } }, 'Import Case…')),
        // v1.106: bring cases back from a full backup on another drive.
        h('div', { class: 'backup-full backup-restore' },
          h('span', { class: 'fact-icon' }, I('arrow-counterclockwise')),
          h('div', {}, h('strong', { class: 'block' }, 'Restore cases from a full backup'),
            h('span', { class: 'muted small block' }, 'Pick a CaseVault-Backup folder on the backup drive or the other PC, then the cases to bring back. A case that is in the vault now goes to Recently Deleted first.')),
          h('div', { class: 'spacer' }),
          h('button', { class: 'btn', type: 'button', icon: 'folder2-open', onclick: async () => { close(); await restoreFromBackupDialog(); } }, 'Restore Cases…')));
      // v1.106: deleted cases wait here for 30 days.
      const deletedSec = h('section', { 'data-section': 'deleted' }, h('h3', {}, 'Recently Deleted'));
      const drawDeleted = async () => {
        let items = [];
        try { items = await Vault.listDeleted(); } catch (err) { if (FS.isDisconnectError(err)) return onDriveLost(); }
        const rows = items.map((x) => h('li', { class: 'bin-row' },
          h('span', { class: 'bin-what' }, h('strong', {}, x.number || x.title || 'No case number'), x.subject ? h('span', { class: 'muted small block' }, x.subject) : null),
          h('span', { class: 'muted small bin-when' }, `Deleted ${fmtDate(String(x.deletedAt).slice(0, 10))} · gone after ${fmtDate(x.until)}`),
          h('button', { class: 'btn small', type: 'button', icon: 'arrow-counterclockwise', onclick: async () => {
            try { await Save.track(`restore:${x.id}`, () => Vault.restoreDeleted(x.id)); renderCaseList(); toast(`${x.number || 'The case'} is back${x.from === 'archive' ? ' in the archive' : ''}.`, 'success'); drawDeleted(); } catch (err) { toast(err.message, 'error'); }
          } }, 'Restore'),
          h('button', { class: 'btn small danger', type: 'button', icon: 'trash3', onclick: async () => {
            if (!(await confirmDialog({ title: 'Delete it for good?', message: `${x.number || x.title || 'This case'} will be removed from the SSD. This can't be undone.`, confirmText: 'Delete Now', danger: true }))) return;
            try { await Save.track(`purge:${x.id}`, () => Vault.purgeDeleted(x.id)); toast('Deleted for good.'); drawDeleted(); } catch { /* reported */ }
          } }, 'Delete Now')));
        deletedSec.replaceChildren(h('h3', {}, 'Recently Deleted'),
          h('p', { class: 'muted small' }, `Deleted cases wait here ${Vault.BIN_DAYS} days, then they are removed from the SSD for good. Restore puts one back where it was.`),
          rows.length ? h('ul', { class: 'bin-list' }, rows) : h('p', { class: 'empty-state small' }, I('trash3'), h('span', {}, 'Nothing deleted in the last 30 days.')));
      };
      drawDeleted();
      const maintenance = h('section', { 'data-section': 'maintenance' },
        h('h3', {}, 'Maintenance'),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn', type: 'button', icon: 'arrow-repeat', onclick: async () => {
            try { await Save.track('reindex', () => Vault.rebuildIndex()); renderCaseList(); toast('Case index rebuilt from the case folders.', 'success'); } catch { /* reported */ }
          } }, 'Rebuild case index'),
          h('button', { class: 'btn', type: 'button', icon: 'clipboard2-pulse', onclick: () => { close(); showSelfTest(); } }, 'Run self-test…'),
          MODE === 'direct' && h('button', { class: 'btn', type: 'button', icon: 'folder2-open', onclick: async () => { close(); await Save.flushAll(); pickFolder(); } }, 'Open a different vault…'),
          MODE === 'direct' && h('button', { class: 'btn', type: 'button', icon: 'box-arrow-left', onclick: async () => {
            close();
            await Save.flushAll();
            if (Save.failed.size) return toast('Some changes are not saved yet. Reconnect the SSD first.', 'error');
            await HandleStore.clear();
            Vault.close();
            Object.assign(state, { connected: false, vaultId: null, caseId: null, caseObj: null });
            $('#vault-name').textContent = '';
            $('#main').replaceChildren();
            renderCaseList();
            Save.render();
            gateWelcome();
          } }, 'Disconnect')));

      // Each section is a card; the list on the left jumps to it and follows the scrolling.
      const SECTION_ICONS = { vault: 'safe2', backups: 'save', deleted: 'trash3', privacy: 'eye-slash', affiant: 'person-badge', templates: 'file-earmark-ruled', library: 'bookshelf', terms: 'book', language: 'journal-text', behavior: 'robot', links: 'link-45deg', pii: 'fingerprint', mail: 'envelope-at', log: 'list-check', maintenance: 'tools' };
      const sections = [info, backupsSec, deletedSec, privacySettings(v), affiantSettings(v), ...(window.CVDraftsUI ? [CVDraftsUI.templateSettings()] : []), CVLibraryUI.librarySection(), CVLibraryUI.termsSection(), CVLibraryUI.languageSection(), CVLibraryUI.behaviorSection(), CVReferenceUI.linksSection(),
        CVSecureSettings.watchSection(), CVSecureSettings.mailSection(), CVSecureSettings.logSection(), maintenance];
      const scroller = h('div', { class: 'vault-content' });
      // Scroll only the sections' own box. scrollIntoView would also scroll the panel itself,
      // which pushed the Done button off the top.
      const scrollToSection = (sec, smooth = false) => (sec.cvUnfold && sec.cvUnfold(), scroller.scrollTo({ top: sec.offsetTop - 8, behavior: smooth ? 'smooth' : 'auto' }));
      const nav = h('nav', { class: 'vault-nav', 'aria-label': 'Vault settings' });
      sections.forEach((sec, i) => {
        const key = sec.dataset.section || `s${i}`;
        sec.dataset.section = key;
        sec.classList.add('vault-card');
        const title = sec.querySelector('h3');
        if (title && !title.querySelector('svg')) title.append(' ', I(SECTION_ICONS[key] || 'gear'));
        // The section's explanation goes into a hover box on its heading and icon (v1.29: no ⓘ).
        const intro = title && title.nextElementSibling;
        if (intro && intro.matches('p.muted')) {
          title.dataset.tip = [title.dataset.tip || title.getAttribute('title'), intro.textContent.trim()].filter(Boolean).join('\n');
          title.dataset.tipLong = '1';
          title.removeAttribute('title');
          title.tabIndex = 0;
          intro.remove();
        }
        scroller.append(sec);
        nav.append(h('button', { type: 'button', class: 'vault-nav-item', 'data-target': key, onclick: () => scrollToSection(sec, true) },
          h('span', {}, title ? [...title.childNodes].filter((n) => !(n.classList && n.classList.contains('beta-tag'))).map((n) => n.textContent).join('').replace(/\s*\(.*\)$/, '').trim() : key), I(SECTION_ICONS[key] || 'gear')));
      });
      const spy = new IntersectionObserver((entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (!top) return;
        for (const b of nav.children) b.classList.toggle('active', b.dataset.target === top.target.dataset.section);
      }, { root: scroller, rootMargin: '0px 0px -70% 0px' });
      sections.forEach((sec) => spy.observe(sec));
      nav.firstChild.classList.add('active');
      // Open at one section (Menu → Library): scroll to it once the panel is on screen, and mark
      // it in the list on the left.
      if (section) setTimeout(() => {
        const el = scroller.querySelector(`[data-section="${section}"]`);
        if (!el) return;
        scrollToSection(el);
        setTimeout(() => { for (const b of nav.children) b.classList.toggle('active', b.dataset.target === section); }, 200);
      }, 60);
      // v1.54: each section is a card that folds away with the button in its heading.
      sections.forEach((sec) => { sec.classList.add('vault-sec', 'cv-boxed'); makeFoldable(sec, `vault-${sec.dataset.section}`); });
      return h('div', { class: 'vault-panel' },
        h('div', { class: 'vault-panel-head' }, h('span', { class: 'vault-badge' }, I('gear')), h('div', {}, h('h2', {}, 'Settings'), // v1.121: Vault and Library together as Settings
          h('p', { class: 'muted small explain' }, `${Vault.root.name} · ${v.cases.length} case${v.cases.length === 1 ? '' : 's'}`)),
          h('div', { class: 'spacer' }), h('button', { class: 'btn primary', type: 'button', icon: 'check2', onclick: () => close() }, 'Done')),
        h('div', { class: 'vault-panel-body' }, nav, scroller));
    });
  }

  // Self-test: made-up documents through every reader, the checker, privacy and the AI engine.
  async function showSelfTest() {
    if (!state.connected) return;
    const env = { Vault, FS, Engine: CVChecks.Engine, mode: MODE };
    const icons = { waiting: 'three-dots', running: 'arrow-repeat', pass: 'check-circle-fill', warn: 'exclamation-triangle-fill', fail: 'x-circle' };
    let results = [];
    const list = h('ol', { class: 'selftest-list' });
    const summary = h('p', { class: 'muted' }, 'Running. This takes up to a minute; the AI test can take longer the first time.');
    const copy = h('button', { class: 'btn', type: 'button', disabled: true, onclick: async () => {
      try { await navigator.clipboard.writeText(CVSelfTest.report(results, env)); toast('Report copied. It holds no case data.', 'success'); } catch { toast('Could not copy.', 'error'); }
    } }, 'Copy report');
    const draw = (r) => {
      results = r;
      list.replaceChildren(...r.map((x) => h('li', { class: `selftest-item ${x.status}` },
        h('span', { class: 'selftest-icon' }, I(icons[x.status] || 'three-dots')),
        h('div', {}, h('strong', {}, x.name), h('span', { class: 'sr-only' }, ` ${x.status}`), x.detail ? h('span', { class: 'small block muted' }, x.detail) : null))));
    };
    const dialog = openDialog((close) => h('div', { class: 'selftest' },
      h('h2', { icon: 'clipboard2-pulse' }, 'Self-test'),
      h('p', { class: 'muted small explain' }, 'Uses its own made-up documents, never your cases. Writes one small test file to the SSD and deletes it.'),
      list, summary,
      h('div', { class: 'dialog-actions' }, copy, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Close'))));
    const final = await CVSelfTest.run(env, draw);
    const n = (st) => final.filter((x) => x.status === st).length;
    summary.className = n('fail') ? 'error-text' : n('warn') ? 'warn-text' : 'ok-text';
    summary.textContent = n('fail') ? `${n('fail')} check${n('fail') === 1 ? '' : 's'} failed. Copy the report and keep it for support.`
      : `All ${final.length - n('warn')} checks passed${n('warn') ? `; ${n('warn')} to look at` : ''}.`;
    copy.disabled = false;
    await dialog;
  }

  // "My Profile": the affiant profile that fills {{affiant.*}} in templates. Saved in vault.json.
  function affiantSettings(v) {
    const a = v.settings.affiant || {};
    const LABELS = { name: 'Name', title: 'Title or rank', agency: 'Agency', address: 'Address', phone: 'Phone', email: 'Email' };
    const TYPES = { phone: 'tel', email: 'email' };
    const inputs = {};
    const save = () => {
      const next = {};
      for (const k of CVDraft.AFFIANT_FIELDS) next[k] = inputs[k].value.trim();
      return Save.track('settings', () => Vault.updateSettings({ affiant: next }));
    };
    const rows = CVDraft.AFFIANT_FIELDS.map((k) => {
      const id = `affiant-${k}`;
      inputs[k] = k === 'address'
        ? h('textarea', { id, rows: 3, autocomplete: 'off', class: 'affiant-wide' })
        : h('input', { id, type: TYPES[k] || 'text', autocomplete: 'off' });
      inputs[k].value = a[k] || '';
      inputs[k].addEventListener('change', () => { save().catch(() => {}); });
      return h('div', { class: `field${k === 'address' ? ' affiant-address' : ''}`, title: `Fills {{affiant.${k}}} in templates.` }, h('label', { for: id }, LABELS[k]), inputs[k]);
    });
    return h('section', { 'data-section': 'affiant' },
      h('h3', {}, 'My Profile'),
      h('p', { class: 'muted small explain' }, 'Filled into templates wherever they say ', h('code', {}, '{{affiant.name}}'), ' and so on. Anything left empty becomes a [CONFIRM: ...] placeholder. Stored in vault.json on the SSD.'),
      h('div', { class: 'affiant-grid' }, rows),
      // v1.118: the department letterhead lives here (the Draft, Arrest and Link Chart tabs show one line).
      window.CVLetterhead ? h('div', { class: 'profile-letterhead' }, h('h4', {}, 'Letterhead'), CVLetterhead.editor()) : null,
      h('div', { class: 'row profile-actions' }, h('div', { class: 'spacer' }),
        h('button', { class: 'btn primary vault-save', type: 'button', icon: 'save', title: 'Save your profile to vault.json on the SSD. Each box also saves when you leave it.', onclick: async () => {
          try { await save(); toast('Profile saved to the SSD.', 'success'); } catch { /* reported by Save */ }
        } }, 'Save changes')));
  }

  // The privacy screen hides CaseVault after 15 minutes alone, unless you chose another time
  // (or Off) in Vault → Privacy screen. Vaults from before v1.15 said 0 without anyone choosing it.
  function idleMinutes() {
    const s = (Vault.data && Vault.data.settings) || {};
    return s.privacyIdleSet ? Number(s.privacyIdleMinutes) || 0 : 15;
  }

  // Privacy screen settings, shown inside the Vault panel. The PIN form is inline because the app
  // has a single dialog element.
  function privacySettings(v) {
    const status = h('span', {});
    const form = h('div', { class: 'row', hidden: true });
    const pin1 = h('input', { type: 'password', inputmode: 'numeric', maxlength: 6, class: 'narrow pin', placeholder: 'PIN', 'aria-label': 'New PIN, 4 to 6 digits', autocomplete: 'off' });
    const pin2 = h('input', { type: 'password', inputmode: 'numeric', maxlength: 6, class: 'narrow pin', placeholder: 'Repeat', 'aria-label': 'Repeat the PIN', autocomplete: 'off' });
    const setBtn = h('button', { class: 'btn', type: 'button' });
    const removeBtn = h('button', { class: 'btn', type: 'button' }, 'Remove PIN');
    const draw = () => {
      const has = !!v.settings.privacyPin;
      status.textContent = has ? 'A PIN is set. It is needed to leave the privacy screen.' : 'No PIN: one click leaves the privacy screen.';
      setBtn.textContent = has ? 'Change PIN…' : 'Set PIN…';
      removeBtn.hidden = !has;
    };
    const savePin = async () => {
      if (!CVPrivacy.isValidPin(pin1.value)) return toast('The PIN must be 4 to 6 digits.', 'error');
      if (pin1.value !== pin2.value) return toast('The two PINs are different.', 'error');
      const record = await CVPrivacy.makePinRecord(pin1.value);
      pin1.value = pin2.value = '';
      try {
        await Save.track('settings', () => Vault.updateSettings({ privacyPin: record }));
        form.hidden = true;
        draw();
        toast('Privacy screen PIN saved. Only a salted hash is stored.', 'success');
      } catch { /* reported by Save */ }
    };
    setBtn.addEventListener('click', () => { form.hidden = !form.hidden; if (!form.hidden) pin1.focus(); });
    removeBtn.addEventListener('click', async () => {
      try { await Save.track('settings', () => Vault.updateSettings({ privacyPin: null })); draw(); toast('PIN removed.'); } catch { /* reported */ }
    });
    for (const i of [pin1, pin2]) i.addEventListener('input', () => { i.value = i.value.replace(/\D/g, '').slice(0, 6); });
    pin2.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); savePin(); } });
    form.append(pin1, pin2, h('button', { class: 'btn primary', type: 'button', onclick: savePin }, 'Save PIN'),
      h('button', { class: 'btn', type: 'button', onclick: () => { form.hidden = true; pin1.value = pin2.value = ''; } }, 'Cancel'));

    const idle = h('select', { 'aria-label': 'Hide automatically after' },
      [[0, 'Off'], [1, '1 minute'], [2, '2 minutes'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes']]
        .map(([m, label]) => h('option', { value: m, selected: idleMinutes() === m }, label)));
    idle.addEventListener('change', () => {
      Save.track('settings', () => Vault.updateSettings({ privacyIdleMinutes: Number(idle.value), privacyIdleSet: true })).catch(() => {});
    });
    draw();
    return h('section', { 'data-section': 'privacy' },
      h('h3', {}, 'Privacy screen'),
      h('p', { class: 'muted small explain' }, 'Press ', h('kbd', {}, 'Ctrl'), '+', h('kbd', {}, 'Shift'), '+', h('kbd', {}, 'H'), ', press ', h('kbd', {}, 'Esc'), ' twice quickly, or click ', h('strong', {}, 'Hide'),
        ' to cover CaseVault with a blank screen. The tab title changes to "New Tab", media pauses and pending edits are saved.'),
      h('div', { class: 'row' }, status, h('div', { class: 'spacer' }), setBtn, removeBtn),
      form,
      h('div', { class: 'row' }, h('label', { class: 'inline' }, 'Hide automatically after ', idle, ' without activity')),
      h('p', { class: 'hint' }, 'For real security when you leave, press ', h('kbd', {}, 'Windows key'), ' + ', h('kbd', {}, 'L'), ' to lock the PC. The privacy screen only hides what is on screen.'));
  }

  // v1.28: Vault, Library and Reference are on the Overview, not in the menu.
  $('#btn-settings').addEventListener('click', () => showVaultPanel()); // v1.187: Settings was only in Find since v1.176
  $('#btn-options').addEventListener('click', () => CVOptions.open(window.CaseVaultUI));
  $('#btn-contact-dev').addEventListener('click', () => CVOptions.contactDev(window.CaseVaultUI));
  $('#btn-problem').addEventListener('click', () => reportProblem());
  $('#btn-shortcuts').addEventListener('click', () => shortcutsDialog());

  /* v1.85: Report a Problem. The app version, browser, screen and the last errors, with case
   * numbers, names, Missions and the letterhead taken out, saved as a text file on the SSD (or
   * copied) to send to the developer. Nothing is sent from here. */
  function scrubbed(text) {
    let t = String(text || '');
    const words = new Set();
    const add = (v) => { const x = String(v || '').trim(); if (x.length >= 3) words.add(x); };
    if (Vault.data) {
      for (const c of Vault.data.cases || []) { add(c.number); add(c.subject); add(c.title); add(c.fileNumber); add(c.id); }
      for (const o of Vault.data.operations || []) { add(o.number); add(o.name); }
      const st = Vault.data.settings || {};
      if (st.affiant) for (const v of Object.values(st.affiant)) if (typeof v === 'string') add(v);
      if (st.letterhead && st.letterhead.header) st.letterhead.header.split('\n').forEach(add);
    }
    for (const w of [...words].sort((a, b) => b.length - a.length)) t = t.split(w).join('[removed]');
    return t
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
      .replace(/\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[phone]')
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[ssn]')
      .replace(/(cases|archive)\/[^\s/)]+/g, '$1/[case]');
  }
  async function problemText(what) {
    const si = MODE === 'helper' && HelperFS.sysinfo ? await HelperFS.sysinfo().catch(() => null) : null;
    const lines = [
      'CaseVault problem report',
      `Made: ${new Date().toISOString()}`,
      `App version: ${Vault.APP_VERSION}`,
      `Mode: ${MODE === 'direct' ? 'Direct (Chrome/Edge)' : 'Helper'}`,
      `Browser: ${navigator.userAgent}`,
      `Screen: ${innerWidth}x${innerHeight} at ${devicePixelRatio}x, zoom ${CVOptions.getZoom ? CVOptions.getZoom() : 100}%`,
      `Page: ${location.hash.replace(/\/case\/[^/]+/, '/case/[case]').replace(/\/operation\/[^/]+/, '/operation/[mission]').replace(/\/group\/[^/]+/, '/group/[group]') || '#/'}`,
      `Cases: ${Vault.data ? Vault.data.cases.length : 0}, Missions: ${Vault.data ? (Vault.data.operations || []).length : 0}`,
      si && si.diskTotal ? `SSD free: ${fmtSize(si.diskFree)} of ${fmtSize(si.diskTotal)}` : null,
      `Unsaved changes: ${Save.timers.size}, failed saves: ${Save.failed.size}`,
      '',
      'What happened:',
      what || '(not described)',
      '',
      `Recent errors (${PROBLEMS.length}):`,
      ...(PROBLEMS.length ? PROBLEMS.map((p) => `[${p.at}] ${p.kind}: ${p.text}`) : ['none']),
    ].filter((x) => x != null);
    return scrubbed(lines.join('\n'));
  }
  async function reportProblem() {
    const what = h('textarea', { rows: 3, maxlength: 2000, placeholder: 'What were you doing? No case details.', 'aria-label': 'What happened' });
    const preview = h('textarea', { class: 'problem-preview mono', rows: 12, readonly: true, 'aria-label': 'The report' });
    const refresh = async () => { preview.value = await problemText(what.value.trim()); };
    what.addEventListener('input', debounce(refresh, 300));
    await refresh();
    await openDialog((close) => h('div', { class: 'problem-form' },
      h('h2', { icon: 'clipboard2-pulse' }, 'Report a Problem'),
      h('p', { class: 'muted small explain' }, 'This is everything the report holds. Case numbers, names, Missions and your letterhead are taken out. Read it, then save it to the SSD or copy it, and send it with Contact Dev.'),
      field('What happened', what), field('The report', preview),
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Close'),
        h('button', { class: 'btn', type: 'button', icon: 'copy', onclick: async () => {
          try { await navigator.clipboard.writeText(preview.value); toast('Report copied.', 'success'); } catch { preview.select(); toast('Select the text and copy it with Ctrl+C.', 'info'); }
        } }, 'Copy'),
        h('button', { class: 'btn primary', type: 'button', icon: 'save', onclick: async () => {
          try {
            const d = new Date();
            const name = `problem-report-${Vault.localDay(d)}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.txt`;
            await Save.track('problem', async () => FS.writeText(await FS.getDir(Vault.root, 'exports', true), name, preview.value));
            toast(`Saved as CaseVault-Data\\exports\\${name}. Attach it in Contact Dev.`, 'success', 8000);
            close();
          } catch (err) { toast(`Not saved: ${err.message}`, 'error'); }
        } }, 'Save to SSD'))));
  }

  /* v1.85: keyboard shortcuts. */
  const SHORTCUTS = [['Ctrl+K', 'Find a case, Mission, person or page'], ['Alt+N', 'Quick Note into a case\'s Case History'], ['Alt+1 … Alt+9', 'The tabs of the open case, in order'], ['N', 'New case (when not typing)'], ['T', 'Training certificates (when not typing)'], ['Ctrl+S', 'Save every change now'], ['Ctrl+\\', 'Show or hide the case list'], ['Esc', 'Close the popup'], ['?', 'This list']];
  /* v1.131: Find (Ctrl+K). One box for cases (number, subject, notes, status: the same match as the
   * sidebar search), Missions, CaseVault's pages and actions, and two searches for the words typed:
   * every case a person is on (the person view) and inside every case's notes, reports and files.
   * Arrow keys and Enter, or a click. */
  function findDialog() {
    const pages = [
      ['Home', 'house-door', () => { location.hash = '#/'; }], ['General Files', 'folder-general', () => { location.hash = '#/general'; }],
      ['All Missions', 'folder-mission', () => { location.hash = '#/operations'; }], ['Reference', 'book', () => { location.hash = '#/reference'; }],
      ['Quick Links', 'link-45deg', () => quickLinksPanel(true)], ['Settings', 'gear', () => showVaultPanel()],
      ['Back Up the Vault', 'hdd-fill', () => showVaultPanel('backups')], ['New Case', 'plus-lg', () => newCase()],
      ['New Mission', 'folder-plus', async () => { const op = await operationDialog(); if (op) { renderCaseList(); location.hash = `#/operation/${encodeURIComponent(op.id)}`; } }],
      ['Quick Note', 'pencil-square', () => quickNoteDialog()], // v1.149
      ['Suspect Search', 'person-lines-fill', () => CVPersonView.search(window.CaseVaultUI)], // v1.175
      ['Rolodex', 'person-rolodex', () => CVRolodex.open(window.CaseVaultUI)], // v1.175
      ['Search All Cases', 'search', () => CVVaultSearch.open(window.CaseVaultUI)], // v1.184
      ['Keyboard Shortcuts', 'lightning-charge', () => shortcutsDialog()],
      ['Year Summary', 'bar-chart-line-fill', () => yearSummary()], ['Summaries', 'bar-chart-line-fill', () => summariesDialog()], // v1.186
      ['Narrative Helper', 'journal-text', () => { location.hash = '#/narrative'; }],
      ['Check the Vault', 'shield-fill-check', () => vaultCheckDialog()], ['Calendar', 'calendar-event', () => openAgenda('calendar')], ['Weekly Summary', 'calendar-check', () => openAgenda('weekly')], // v1.156
      ['Training Record', 'file-earmark-pdf', () => trainingRecord()], ['Training', 'patch-check-fill', () => openTraining()],
    ];
    return openDialog((close) => {
      const input = h('input', { type: 'search', class: 'find-input', placeholder: 'Case number, name, Mission or page', 'aria-label': 'Find', autocomplete: 'off', autofocus: true });
      const list = h('div', { class: 'find-list', role: 'listbox' });
      let items = []; let at = 0;
      // v1.141: the certificates in Training (by course, who gave it or file name) and the files in
      // Other Files, read once when Find opens.
      let files = [];
      (async () => {
        const folders = [...Vault.OTHER_FOLDERS, ...(await Vault.otherCustomFolders().catch(() => [])).map((n) => ({ name: n, label: n }))];
        const out = [];
        for (const f of folders) {
          const list = await Vault.listShared('other', f.name).catch(() => []);
          const meta = f.name === 'Training' && list.length ? await Vault.readTraining().catch(() => ({})) : null;
          for (const x of list) {
            const reader = { readFile: (name) => Vault.readShared('other', f.name, name.split('/').pop()), where: `other${f.name ? `\\${f.name}` : ''}` };
            const d = meta ? CVTraining.normalize(meta[x.base]) : null;
            out.push({ cert: !!meta, title: meta ? CVTraining.courseOf(x.base, d) : x.base, sub: meta ? [d.provider, d.date ? shortDate(d.date) : '', x.base].filter(Boolean).join(' · ') : `Other Files → ${f.label || f.name || 'Other'}`,
              hay: [x.base, d && d.course, d && d.provider].filter(Boolean).join(' ').toLowerCase(), open: () => previewFile(reader, x.base) });
          }
        }
        files = out;
        if (input.isConnected && input.value.trim()) draw();
      })();
      const go = (fn) => { close(); setTimeout(fn, 0); };
      const row = (icon, title, sub, fn, kind) => ({ el: h('button', { type: 'button', class: 'find-row', role: 'option', onclick: () => go(fn) },
        I(icon), h('span', { class: 'find-title' }, title), sub ? h('span', { class: 'find-sub muted' }, sub) : null, h('span', { class: 'find-kind muted' }, kind)), fn });
      const draw = () => {
        const q = input.value.trim().toLowerCase();
        const cases = (Vault.data?.cases || []).filter((c) => !q || matchesSearch(c, q))
          .sort((a, b) => (isArchivedEntry(a) - isArchivedEntry(b)) || (b.updated || '').localeCompare(a.updated || '')).slice(0, q ? 12 : 6)
          .map((c) => row(isArchivedEntry(c) ? 'folder-archived' : 'folder', c.number || 'No case number', [subj(c), isArchivedEntry(c) ? 'Archived' : c.status].filter(Boolean).join(' · '), () => { location.hash = caseLink(c); }, 'Case'));
        const ops = (Vault.listOperations() || []).filter((op) => !q || `${op.number} ${op.name}`.toLowerCase().includes(q)).slice(0, q ? 6 : 3)
          .map((op) => row('folder-mission', opLabel(op), `${plural(Vault.operationMembers(op.id).length, 'case')}`, () => { location.hash = `#/operation/${encodeURIComponent(op.id)}`; }, 'Mission'));
        const pg = pages.filter(([t]) => !q || t.toLowerCase().includes(q)).map(([t, icon, fn]) => row(icon, t, '', fn, 'Page'));
        const fl = q ? files.filter((x) => q.split(/\s+/).every((w) => x.hay.includes(w))).slice(0, 8)
          .map((x) => row(x.cert ? 'patch-check-fill' : 'file-earmark', x.title, x.sub, x.open, x.cert ? 'Certificate' : 'File')) : [];
        const more = q.length >= 2 ? [
          row('person-lines-fill', `Every case "${input.value.trim()}" is on`, 'Subjects, suspects and arrestees, names written another way too', () => CVPersonView.open(input.value.trim(), window.CaseVaultUI), 'Person'),
          row('search', `Search inside cases for "${input.value.trim()}"`, 'Notes, timelines, reports, the Draft form and file names', () => searchInsideCases(input.value.trim()), 'Search'),
        ] : [];
        // A typed word that names a Mission lists the Mission before its cases (they match it too).
        items = q && ops.length ? [...ops, ...cases, ...fl, ...pg, ...more] : [...cases, ...ops, ...fl, ...pg, ...more];
        at = Math.min(at, Math.max(0, items.length - 1));
        list.replaceChildren(...(items.length ? items.map((x, i) => { x.el.classList.toggle('on', i === at); x.el.setAttribute('aria-selected', String(i === at)); return x.el; }) : [h('p', { class: 'muted find-none' }, 'Nothing found.')]));
      };
      input.addEventListener('input', () => { at = 0; draw(); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); at = (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(1, items.length); draw(); (items[at] || {}).el?.scrollIntoView({ block: 'nearest' }); }
        if (e.key === 'Enter' && items[at]) { e.preventDefault(); go(items[at].fn); }
        if (e.key === 'Escape') { e.preventDefault(); close(); } // not left to the browser, which can skip the first Esc
      });
      draw();
      return h('div', { class: 'find-form' }, h('div', { class: 'find-head' }, I('search'), input), list,
        h('p', { class: 'find-foot muted' }, h('kbd', {}, '↑'), h('kbd', {}, '↓'), ' to move · ', h('kbd', {}, 'Enter'), ' to open · ', h('kbd', {}, 'Esc'), ' to close · ', h('kbd', {}, '?'), ' for every shortcut'));
    });
  }

  function shortcutsDialog() {
    return openDialog((close) => h('div', { class: 'shortcuts-form' },
      h('h2', { icon: 'lightning-charge' }, 'Keyboard Shortcuts'),
      h('table', { class: 'data-table shortcuts-table' }, h('tbody', {}, SHORTCUTS.map(([k, v]) => h('tr', {}, h('td', {}, h('kbd', {}, k)), h('td', {}, v))))),
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
  }

  // The menu (top right): Reference, Library, Vault, Theme, Options, Contact Dev.
  const menuBtn = $('#btn-menu');
  const menu = $('#app-menu');
  menuBtn.append(I('three-dots-vertical'));
  const setMenu = (open, focus = false) => {
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    if (open && focus) menu.querySelector('.menu-item').focus();
  };
  menuBtn.addEventListener('click', () => setMenu(menu.hidden, true));
  // Choosing an item closes the menu (the theme item stays open, so you can click through the themes).
  menu.addEventListener('click', (e) => { const item = e.target.closest('.menu-item'); if (item && item.id !== 'btn-theme') setMenu(false); });
  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll('.menu-item')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); setMenu(false); menuBtn.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  });
  document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('.menu-wrap')) setMenu(false); }, true);
  $('#btn-chat').addEventListener('click', () => CVChatUI.toggle());

  // Theme: automatic -> light -> dark. The button shows what's in effect.
  function drawThemeButton() {
    const t = CVTheme.get();
    const btn = $('#btn-theme');
    btn.replaceChildren(I(t === 'auto' ? 'circle-half' : t === 'dark' ? 'moon-stars-fill' : 'sun-fill'), h('span', {}, `Theme: ${{ auto: 'Automatic', light: 'Light', dark: 'Dark' }[t]}`));
    btn.title = `${CVTheme.LABELS[t]}. Click to change.`;
  }
  $('#btn-theme').addEventListener('click', () => { CVTheme.next(); toast(CVTheme.LABELS[CVTheme.get()], 'info', 1800); });
  CVTheme.onChange(drawThemeButton);
  drawThemeButton();
  CVIcons.decorate();

  /* =====================================================================
   * Global behaviour
   * ===================================================================== */

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      Save.flushAll();
    }
    // v1.85: Ctrl+K searches the case list; N makes a new case and ? lists the shortcuts, when
    // you're not typing in a box and no popup is open.
    const typing = e.target && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
    const popup = !!document.querySelector('#dialog[open]') || !!(window.CVPrivacy && CVPrivacy.locked);
    if (state.connected && !popup && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      // v1.131: Find, for cases, Missions, people and pages (the sidebar's own search stays on its magnifier).
      findDialog();
      return;
    }
    // v1.149: Alt+N: a Quick Note into a case's Case History, from anywhere (Ctrl+Shift+N is the
    // browser's private window, so the page never sees it).
    if (state.connected && !popup && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key.toLowerCase() === 'n' || e.code === 'KeyN')) {
      e.preventDefault();
      quickNoteDialog();
      return;
    }
    // v1.153: Alt+1 … Alt+9: the tabs of the case open now, in their order (Details, Timeline …).
    if (state.connected && !popup && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && /^Digit[1-9]$/.test(e.code || '') && state.caseId) {
      const tabs = [...document.querySelectorAll('#main nav.tabs a.tab')];
      const t = tabs[Number(e.code.slice(5)) - 1];
      if (t) { e.preventDefault(); location.hash = t.getAttribute('href'); }
      return;
    }
    if (state.connected && !popup && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); newCase(); return; }
      // v1.165: T opens Other Files → Training (Alt+T is a browser menu key).
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); openTraining(); return; }
      if (e.key === '?') { e.preventDefault(); shortcutsDialog(); return; }
    }
    // Ctrl+\ shows or hides the case list (Ctrl+B is left to the browser and text fields).
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === '\\' || e.code === 'Backslash')) {
      if (!state.connected || document.querySelector('#dialog[open]')) return;
      e.preventDefault();
      if (document.body.classList.contains('sidebar-locked')) { toast('The case list is locked. Unlock it with the padlock at its top.'); return; }
      setSidebar(!document.body.classList.contains('sidebar-collapsed'), { focus: true });
    }
  });

  /* v1.156: Select Cases: tick cases in a list, then one action for all of them. */
  async function bulkDialog() {
    if (!state.connected) return;
    const open = Vault.data.cases.filter((c) => !isArchivedEntry(c)).sort(byNumber);
    if (!open.length) return toast('There are no open cases.', 'info');
    const picked = new Set();
    const ops = Vault.listOperations().filter((o) => o.status !== 'Closed');
    const res = await openDialog((close) => {
      const count = h('span', { class: 'muted small' }, 'None selected');
      const boxes = open.map((c) => {
        const cb = h('input', { type: 'checkbox', 'aria-label': `Select case ${c.number || ''}` });
        cb.addEventListener('change', () => { if (cb.checked) picked.add(c.id); else picked.delete(c.id); count.textContent = picked.size ? `${picked.size} selected` : 'None selected'; });
        const op = c.operationId && (Vault.data.operations || []).find((o) => o.id === c.operationId);
        return h('label', { class: 'bulk-row' }, cb, h('strong', {}, c.number || 'No case number'), h('span', { class: 'muted small' }, [subj(c), op ? CVOperation.opLabel(op) : c.suspectGroup || 'General Files'].filter(Boolean).join(' · ')), statusPill(c.status));
      });
      const all = h('button', { type: 'button', class: 'btn small', onclick: () => { const on = picked.size < open.length; boxes.forEach((b) => { const cb = b.querySelector('input'); cb.checked = on; cb.dispatchEvent(new Event('change')); }); } }, 'Select All');
      const groupName = h('input', { maxlength: 80, placeholder: 'Case Group name', 'aria-label': 'Case Group name', list: 'bulk-groups' });
      const opSel = h('select', { 'aria-label': 'Mission' }, h('option', { value: '' }, 'Pick a Mission'), ops.map((o) => h('option', { value: o.id }, CVOperation.opLabel(o))));
      const need = (fn) => () => { if (!picked.size) { toast('Select at least one case.', 'error'); return; } fn(); };
      return h('div', { class: 'bulk-dialog' },
        h('h2', { icon: 'card-checklist' }, 'Select Cases'),
        h('div', { class: 'bulk-top' }, all, count),
        h('div', { class: 'bulk-list' }, boxes),
        h('datalist', { id: 'bulk-groups' }, [...new Set(Vault.data.cases.map((c) => c.suspectGroup).filter(Boolean))].map((g) => h('option', { value: g }))),
        h('div', { class: 'bulk-actions' },
          h('button', { class: 'btn', type: 'button', icon: 'pin-angle', onclick: need(() => close({ act: 'pin' })) }, 'Pin'),
          h('button', { class: 'btn', type: 'button', icon: 'pin-angle', onclick: need(() => close({ act: 'unpin' })) }, 'Unpin'),
          h('span', { class: 'bulk-pair' }, groupName, h('button', { class: 'btn', type: 'button', icon: 'folder', onclick: need(() => { if (!groupName.value.trim()) return toast('Type the Case Group name.', 'error'); close({ act: 'group', name: groupName.value.trim() }); }) }, 'Put in Case Group')),
          ops.length ? h('span', { class: 'bulk-pair' }, opSel, h('button', { class: 'btn', type: 'button', icon: 'op-folder', onclick: need(() => { if (!opSel.value) return toast('Pick the Mission.', 'error'); close({ act: 'mission', op: opSel.value }); }) }, 'Move to Mission')) : null,
          h('button', { class: 'btn danger-ghost', type: 'button', icon: 'archive', onclick: need(() => close({ act: 'archive' })) }, 'Archive…')),
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel')));
    });
    if (!res) return;
    const ids = [...picked];
    const cases = ids.map((id) => open.find((c) => c.id === id));
    try {
      if (res.act === 'pin' || res.act === 'unpin') {
        const now = pinnedIds();
        const next = res.act === 'pin' ? [...now, ...ids.filter((id) => !now.includes(id))].slice(-12) : now.filter((id) => !ids.includes(id));
        await Save.track('settings', () => Vault.updateSettings({ pinnedCases: next }));
        toast(`${plural(ids.length, 'case')} ${res.act === 'pin' ? 'pinned' : 'unpinned'}.`, 'success');
      } else if (res.act === 'group') {
        const free = cases.filter((c) => !c.operationId);
        for (const c of free) await Save.track(`case:${c.id}`, () => Vault.setSuspectGroup(c.id, res.name));
        toast(`${plural(free.length, 'case')} put in the Case Group ${res.name}.${free.length < cases.length ? ` ${plural(cases.length - free.length, 'case')} in a Mission stayed there.` : ''}`, 'success', 6000);
      } else if (res.act === 'mission') {
        for (const c of cases) if (c.operationId !== res.op) await Save.track(`case:${c.id}`, () => Vault.assignCase(c.id, res.op));
        toast(`${plural(cases.length, 'case')} moved to the Mission.`, 'success');
      } else if (res.act === 'archive') {
        const reason = await openDialog((close) => {
          const pick = h('select', { 'aria-label': 'Reason' }, h('option', { value: '' }, 'Pick a reason'), Vault.ARCHIVE_FOLDERS.map(([k]) => h('option', { value: k }, Vault.archiveFolderName(k))), h('option', { value: 'other' }, Vault.archiveFolderName('other')));
          const note = h('input', { maxlength: 400, placeholder: 'Reason (required for Other)', 'aria-label': 'Reason details' });
          return h('form', { class: 'confirm', onsubmit: (e) => { e.preventDefault(); if (!pick.value || (pick.value === 'other' && !note.value.trim())) return toast('Pick a reason (and write it for Other).', 'error'); close({ folder: pick.value === 'other' ? '' : pick.value, reason: [pick.value === 'other' ? '' : Vault.archiveFolderName(pick.value), note.value.trim()].filter(Boolean).join(': ') }); } },
            h('h2', { icon: 'archive' }, `Archive ${plural(cases.length, 'case')}?`),
            h('p', {}, 'Each moves to CaseVault-Data\\archive on the SSD with everything in it, copied and checked first. They can be restored at any time.'),
            field('Reason', pick), field('Reason Details', note),
            CVKit.cancelRow(h, () => close(null), h('button', { class: 'btn primary', type: 'submit', icon: 'archive' }, 'Archive')));
        });
        if (!reason) return;
        await Save.flushAll();
        const progress = toast('Archiving…', 'info', 600000);
        let n = 0;
        for (const c of cases) { progress.textContent = `Archiving ${c.number || ''} (${++n} of ${cases.length})…`; await Save.track(`archive:${c.id}`, () => Vault.archiveCase(c.id, null, reason.folder, reason.reason)); }
        progress.remove();
        toast(`${plural(cases.length, 'case')} archived.`, 'success');
      }
    } catch (err) { if (FS.isDisconnectError(err)) return onDriveLost(); toast(`Stopped: ${err.message}`, 'error', 8000); }
    renderCaseList();
    route();
  }

  /* v1.156: the last 3 cases opened, as small buttons on the hidden case list's rail (kept in
   * vault.json on the SSD, so they follow the drive). */
  const RAIL_RECENT = 3;
  function noteOpened(id) {
    const s = Vault.data && Vault.data.settings;
    if (!s) return;
    const now = Array.isArray(s.recentOpened) ? s.recentOpened : [];
    const next = [id, ...now.filter((x) => x !== id)].slice(0, RAIL_RECENT);
    if (next.join('|') !== now.join('|')) Save.track('settings', () => Vault.updateSettings({ recentOpened: next })).catch(() => {});
    drawRailRecent(next);
  }
  function drawRailRecent(ids) {
    const head = document.querySelector('.sidebar-head');
    if (!head) return;
    head.querySelectorAll('.rail-recent').forEach((x) => x.remove());
    const list = (ids || (Vault.data && Vault.data.settings && Vault.data.settings.recentOpened) || [])
      .map((id) => Vault.data.cases.find((c) => c.id === id)).filter(Boolean);
    if (!list.length) return;
    const tail = (n) => { const t = String(n || '').replace(/\s+/g, ''); return t.length > 4 ? t.slice(-4) : t || '?'; };
    const box = h('div', { class: 'rail-only rail-recent', role: 'group', 'aria-label': 'Recently opened cases' },
      ...list.map((c) => h('a', { class: `icon-btn rail-case${c.id === state.caseId ? ' on' : ''}`, href: `#/case/${CVRoute.enc(c.id)}`, title: `Case ${c.number || ''}${subj(c) ? ` · ${subj(c)}` : ''}` }, h('span', { 'aria-hidden': 'true' }, tail(c.number)), h('span', { class: 'sr-only' }, `Open case ${c.number || ''}`))));
    head.append(box);
  }

  /* ---------- collapsible sidebar ---------- */

  // collapsed: true hides the case list to a thin rail (or entirely at phone width).
  // Remembered in vault.json so it follows the SSD. focus moves to the other toggle, which is
  // where keyboard users expect to be after the one they pressed disappears.
  function setSidebar(collapsed, { save = true, focus = false } = {}) {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    const expandBtn = $('#btn-sidebar-expand');
    const collapseBtn = $('#btn-sidebar-collapse');
    expandBtn.hidden = !collapsed;
    expandBtn.setAttribute('aria-expanded', String(!collapsed));
    collapseBtn.setAttribute('aria-expanded', String(!collapsed));
    const label = collapsed ? 'Show the case list' : 'Hide the case list';
    collapseBtn.title = `${label} (Ctrl+\\)`;
    collapseBtn.querySelector('.sr-only').textContent = label;
    // The header toggle shows only at phone width; otherwise the rail's toggle keeps focus.
    if (focus) (collapsed && expandBtn.getClientRects().length ? expandBtn : collapseBtn).focus();
    if (save && state.connected && !!Vault.data.settings.sidebarCollapsed !== collapsed) {
      Save.track('settings', () => Vault.updateSettings({ sidebarCollapsed: collapsed })).catch(() => {});
    }
  }
  // v1.121: the Quick Links bar and the sidebar's Closed / Archived area are gone; their old saved sizes too.
  try { for (const k of ['cv-side-bottom-h', 'cv-side-bottom-h-lock', 'cv-ql-h', 'cv-ql-h-lock', 'cv-ql-open']) localStorage.removeItem(k); } catch { /* nothing kept */ }

  // Lock (v1.24): the case list stays exactly as it is, shown or hidden and at its width, until
  // it's unlocked with the padlock. Remembered in vault.json.
  let setSidebarWidth = () => {};
  const lockBtn = h('button', { id: 'btn-sidebar-lock', class: 'icon-btn', type: 'button', 'aria-pressed': 'false' });
  function setSidebarLock(locked, { save = true } = {}) {
    document.body.classList.toggle('sidebar-locked', locked);
    lockBtn.setAttribute('aria-pressed', String(locked));
    const label = locked ? 'Unlock the case list (it can then be hidden or resized)' : 'Lock the case list as it is (size and shown or hidden)';
    lockBtn.title = label;
    lockBtn.replaceChildren(I(locked ? 'lock-fill' : 'unlock'), h('span', { class: 'sr-only' }, label));
    $('#btn-sidebar-collapse').disabled = locked;
    $('#btn-sidebar-expand').disabled = locked;
    if (save && state.connected && !!Vault.data.settings.sidebarLocked !== locked) {
      Save.track('settings', () => Vault.updateSettings({ sidebarLocked: locked })).catch(() => {});
    }
  }
  lockBtn.addEventListener('click', () => setSidebarLock(!document.body.classList.contains('sidebar-locked')));
  $('#btn-sidebar-collapse').after(lockBtn); // v1.34: hide button far left, padlock far right
  // v1.50: next to the hide-the-list button: Search (an icon that opens the search box), Home and
  // Hide (the privacy screen, moved here from the header, so the header keeps just the menu).
  const searchBtn = h('button', { id: 'btn-side-search', class: 'icon-btn', type: 'button', title: 'Search cases', 'aria-controls': 'case-search', 'aria-expanded': 'false' }, I('search'), h('span', { class: 'sr-only' }, 'Search cases'));
  const homeBtn = h('a', { id: 'btn-side-home', class: 'icon-btn', href: '#/', title: 'Home: the Overview' }, I('house-door'), h('span', { class: 'sr-only' }, 'Home'));
  // v1.121: Quick Links from any page.
  const linksBtn = h('button', { id: 'btn-side-links', class: 'icon-btn ql-open-btn', type: 'button', title: 'Quick Links', 'aria-controls': 'ql-panel', 'aria-expanded': 'false', onclick: () => quickLinksPanel() }, I('link-45deg'), h('span', { class: 'sr-only' }, 'Quick Links'));
  // v1.68: Power Off (next to the SSD icon): saves everything, then the helper stops itself, the
  // browser window, Ollama, and locks and ejects the V: and W: drives.
  $('#btn-power').addEventListener('click', async () => {
    // v1.90: no full backup for over a week: offer one before the SSD goes in the drawer.
    const age = fullBackupAge();
    if (age == null || age > fullBackupDays() || backupByCount()) {
      const pick = await openDialog((close) => h('form', { class: 'power-backup-form', onsubmit: (e) => { e.preventDefault(); close('backup'); } },
        h('h2', { icon: 'exclamation-triangle-fill' }, 'Back Up Before Powering Off?'),
        h('p', {}, `${fullBackupText()}. A copy on a second drive is what saves your cases if this SSD is lost or fails.`),
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
          h('button', { class: 'btn', type: 'button', onclick: () => close('off') }, 'Power Off Anyway'),
          h('button', { class: 'btn primary', type: 'submit', icon: 'hdd-fill' }, 'Back Up First'))));
      if (!pick) return;
      if (pick === 'backup') { showVaultPanel('backups'); return; }
    }
    const ok = await confirmDialog({ title: 'Power Off CaseVault', message: 'Saves your work, then closes CaseVault, this browser window, the CaseVault helper and the AI engine, and locks and ejects the V: and W: drives. Unplug the SSD once Windows says it is safe.', confirmText: 'Power Off', danger: true });
    if (!ok) return;
    try { await Save.flushAll(); } catch { /* reported by Save */ }
    if (Save.failed && Save.failed.size) { toast('Some changes did not save. Power Off stopped so nothing is lost.', 'error', 6000); return; }
    let sent = false;
    if (HelperFS.servedByHelper) { try { await HelperFS.shutdown(); sent = true; } catch { /* helper not running */ } }
    document.body.replaceChildren(h('div', { class: 'power-off-screen' },
      I('power'),
      h('h1', {}, 'CaseVault Is Off'),
      h('p', {}, sent ? 'The helper is closing this window and ejecting the drives. Wait for Windows to say it is safe, then unplug the SSD.' : 'Your work is saved. Close this window, then eject the SSD from the taskbar.')));
    document.title = 'CaseVault - Off';
    setTimeout(() => { try { window.close(); } catch { /* the helper closes it */ } }, 800);
  });
  const privacyBtn = $('#btn-privacy');
  privacyBtn.classList.remove('tb-square');
  const sortBtn = h('button', { id: 'btn-side-sort', class: 'icon-btn', type: 'button' });
  const drawSort = () => {
    const [, icon, label] = SIDE_ORDERS.find((o) => o[0] === sideOrder) || SIDE_ORDERS[0];
    const next = SIDE_ORDERS[(SIDE_ORDERS.findIndex((o) => o[0] === sideOrder) + 1) % SIDE_ORDERS.length][2];
    sortBtn.title = `Cases: ${label}. Click for ${next.toLowerCase()}`;
    sortBtn.classList.toggle('on', sideOrder !== 'number');
    sortBtn.replaceChildren(I(icon), h('span', {}, `Order: ${label}`));
  };
  sortBtn.addEventListener('click', () => {
    sideOrder = SIDE_ORDERS[(SIDE_ORDERS.findIndex((o) => o[0] === sideOrder) + 1) % SIDE_ORDERS.length][0];
    try { localStorage.setItem('cv-side-order', sideOrder); } catch { /* not kept: fine */ }
    drawSort();
    renderCaseList();
    toast(`Cases: ${SIDE_ORDERS.find((o) => o[0] === sideOrder)[2].toLowerCase()}.`, 'info', 1800);
  });
  drawSort();
  // v1.156: Select Cases: several cases at once (pin, Case Group, Mission, archive).
  const bulkBtn = h('button', { id: 'btn-side-bulk', class: 'icon-btn', type: 'button', title: 'Select several cases to pin, group, move to a Mission or archive together', onclick: () => bulkDialog() }, I('card-checklist'), h('span', { class: 'sr-only' }, 'Select cases'));
  // v1.176: the order of the cases and Select Cases are in a ⋯ menu (used now and then), so the
  // icons along the top have room.
  sortBtn.className = 'side-more-item'; bulkBtn.className = 'side-more-item';
  bulkBtn.replaceChildren(I('card-checklist'), h('span', {}, 'Select Cases'));
  const moreMenu = h('div', { class: 'side-more-menu', role: 'menu', hidden: true }, sortBtn, bulkBtn);
  const moreBtn = h('button', { id: 'btn-side-more', class: 'icon-btn', type: 'button', title: 'Order of the cases, Select Cases', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, I('three-dots-vertical'), h('span', { class: 'sr-only' }, 'More'));
  const showMore = (on) => { moreMenu.hidden = !on; moreBtn.setAttribute('aria-expanded', String(on)); moreBtn.classList.toggle('on', on); };
  moreBtn.addEventListener('click', (e) => { e.stopPropagation(); showMore(moreMenu.hidden); });
  for (const b of [sortBtn, bulkBtn]) b.addEventListener('click', () => showMore(false));
  document.addEventListener('pointerdown', (e) => { if (!moreMenu.hidden && !moreMenu.contains(e.target) && e.target !== moreBtn && !moreBtn.contains(e.target)) showMore(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !moreMenu.hidden) showMore(false); });
  const moreWrap = h('span', { class: 'side-more' }, moreBtn, moreMenu);
  $('#btn-sidebar-collapse').after(searchBtn, homeBtn, linksBtn, privacyBtn, moreWrap);
  const tools = $('.sidebar-tools');
  const showSearch = (on) => {
    tools.classList.toggle('search-open', on);
    searchBtn.setAttribute('aria-expanded', String(on));
    searchBtn.classList.toggle('on', on);
  };
  showSearch(false);
  searchBtn.addEventListener('click', () => {
    if (document.body.classList.contains('sidebar-collapsed')) { if (document.body.classList.contains('sidebar-locked')) return; setSidebar(false, { focus: false }); }
    const on = !tools.classList.contains('search-open') || document.activeElement !== $('#case-search');
    showSearch(on || !!$('#case-search').value.trim());
    if (on) $('#case-search').focus();
  });
  // v1.106: Search Inside Cases: under the search box while something is typed; Enter starts it.
  const deepBtn = h('button', { id: 'btn-deep-search', class: 'btn small deep-search-btn', type: 'button', icon: 'search', hidden: true, title: 'Also look in each case\'s notes, timeline, reports, Draft form, arrest details and file names', onclick: () => searchInsideCases($('#case-search').value) }, 'Search Inside Cases');
  $('#case-search').closest('.search-wrap').after(deepBtn);
  $('#case-search').addEventListener('input', () => { deepBtn.hidden = !$('#case-search').value.trim(); });
  // v1.156: Saved searches: quick filters under the search box, and searches you name and keep.
  const BUILT_IN_SEARCHES = [['Due This Week', 'due:week'], ['Overdue', 'due:overdue'], ['Pending', 'status:pending'], ['Pinned', 'pinned']];
  const savedRow = h('div', { class: 'saved-searches', role: 'group', 'aria-label': 'Saved searches' });
  const runSearch = (q) => { $('#case-search').value = q; deepBtn.hidden = !q; showSearch(true); renderCaseList(); drawSaved(); };
  function drawSaved() {
    const cur = $('#case-search').value.trim().toLowerCase();
    const mine = ((Vault.data && Vault.data.settings) || {}).savedSearches || [];
    const chip = (name, q, del) => h('span', { class: `saved-chip${cur === q.toLowerCase() ? ' on' : ''}` },
      h('button', { class: 'saved-run', type: 'button', title: `Search: ${q}`, onclick: () => runSearch(cur === q.toLowerCase() ? '' : q) }, name),
      del ? h('button', { class: 'saved-del', type: 'button', title: `Remove the saved search "${name}"`, 'aria-label': `Remove ${name}`, onclick: async () => {
        await Vault.updateSettings({ savedSearches: mine.filter((x) => x.q !== q || x.name !== name) });
        drawSaved();
      } }, '×') : null);
    const canSave = cur && !BUILT_IN_SEARCHES.some(([, q]) => q === cur) && !mine.some((x) => x.q.toLowerCase() === cur);
    savedRow.replaceChildren(...BUILT_IN_SEARCHES.map(([n, q]) => chip(n, q, false)), ...mine.map((x) => chip(x.name, x.q, true)),
      ...(canSave ? [h('button', { class: 'btn small saved-add', type: 'button', icon: 'star-fill', title: 'Keep this search under the box', onclick: saveSearch }, 'Save Search')] : []));
  }
  async function saveSearch() {
    const q = $('#case-search').value.trim();
    if (!q) return;
    const name = h('input', { maxlength: 40, value: q.slice(0, 40), 'aria-label': 'Name of the search', autocomplete: 'off' });
    const got = await openDialog((close) => h('form', { onsubmit: (e) => { e.preventDefault(); close(name.value.trim()); } },
      h('h2', { icon: 'star-fill' }, 'Save Search'),
      h('p', { class: 'muted small' }, `Search: ${q}. Words like due:week, due:overdue, status:pending and pinned filter the cases; other words must all be found.`),
      field('Name', name),
      CVKit.cancelRow(h, () => close(null), h('button', { class: 'btn primary', type: 'submit', icon: 'star-fill' }, 'Save'))));
    if (!got) return;
    const list = ((Vault.data.settings || {}).savedSearches || []).filter((x) => x.name !== got);
    await Vault.updateSettings({ savedSearches: [...list, { name: got, q }].slice(-12) });
    drawSaved();
    toast(`Saved search "${got}".`, 'success', 2000);
  }
  deepBtn.after(savedRow);
  drawSaved();
  onCaseListDrawn = drawSaved;
  $('#case-search').addEventListener('keydown', (e) => { if (e.key === 'Enter' && $('#case-search').value.trim()) { e.preventDefault(); searchInsideCases($('#case-search').value); } });
  $('#case-search').addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    if ($('#case-search').value) { $('#case-search').value = ''; deepBtn.hidden = true; renderCaseList(); }
    showSearch(false);
    searchBtn.focus();
  });
  $('#case-search').addEventListener('blur', (e) => { if (!$('#case-search').value.trim() && !(e.relatedTarget && tools.contains(e.relatedTarget))) showSearch(false); });
  setSidebarLock(false, { save: false });

  // Drag the case list's right edge to make it wider or narrower (or focus it and use ← →).
  // Double-click puts it back. The width is kept in this browser, like the theme.
  (function sidebarResizer() {
    const side = $('#sidebar');
    const KEY = 'casevault-sidebar-width';
    const MIN = 200; const MAX = 520; const DEF = 300;
    // keep: remember it in this browser and in the vault (vault.json on the SSD), so it stays the
    // same in Edge and Firefox and on another PC until it's dragged again (v1.24).
    // v1.175: never narrower than the buttons at its top in one row (the padlock stays on that line).
    const headMin = () => {
      const hd = side.querySelector('.sidebar-head');
      if (!hd || document.body.classList.contains('sidebar-collapsed')) return MIN;
      const kids = [...hd.children].filter((k) => k.offsetParent);
      const cs = getComputedStyle(hd);
      const gap = parseFloat(cs.columnGap) || 0;
      const need = kids.reduce((sum, k) => sum + k.getBoundingClientRect().width, 0) + gap * Math.max(0, kids.length - 1) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      return Math.max(MIN, Math.ceil(need / (parseFloat(document.documentElement.style.zoom) || 1)) + 2);
    };
    const setW = (w, keep = true) => {
      const px = Math.round(Math.min(MAX, Math.max(headMin(), w)));
      document.documentElement.style.setProperty('--sidebar-w', `${px}px`);
      grip.setAttribute('aria-valuenow', String(px));
      if (keep) {
        try { if (px === DEF) localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(px)); } catch { /* this session only */ }
        if (state.connected && Vault.data.settings.sidebarWidth !== px) Save.track('settings', () => Vault.updateSettings({ sidebarWidth: px })).catch(() => {});
      }
    };
    setSidebarWidth = (w, { save = true } = {}) => setW(w, save);
    const grip = h('div', { class: 'sidebar-resizer', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Case list width', 'aria-valuemin': MIN, 'aria-valuemax': MAX, tabindex: 0, title: 'Drag to make the case list wider or narrower. Double-click to reset.' });
    side.append(grip);
    let saved = DEF;
    try { saved = Number(localStorage.getItem(KEY)) || DEF; } catch { /* default */ }
    setW(saved, false);
    // The buttons are all in place once the page is drawn: a width kept from before that is now too
    // narrow for them widens to fit (not saved; dragging saves).
    setTimeout(() => { document.documentElement.style.setProperty('--sidebar-min', `${headMin()}px`); const cur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w')) || saved; if (cur < headMin()) setW(cur, false); }, 0);
    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || document.body.classList.contains('sidebar-locked')) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      const left = side.getBoundingClientRect().left;
      document.body.classList.add('resizing-sidebar');
      const move = (ev) => setW(ev.clientX - left, false);
      const up = (ev) => { setW(ev.clientX - left); grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); document.body.classList.remove('resizing-sidebar'); };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    });
    grip.addEventListener('dblclick', () => { if (!document.body.classList.contains('sidebar-locked')) setW(DEF); });
    grip.addEventListener('keydown', (e) => {
      if (document.body.classList.contains('sidebar-locked')) return;
      const cur = side.getBoundingClientRect().width;
      if (e.key === 'ArrowLeft') { e.preventDefault(); setW(cur - 20); } else if (e.key === 'ArrowRight') { e.preventDefault(); setW(cur + 20); }
    });
  })();

  $('#btn-sidebar-collapse').addEventListener('click', () => setSidebar(!document.body.classList.contains('sidebar-collapsed'), { focus: true }));
  $('#btn-sidebar-expand').addEventListener('click', () => setSidebar(false, { focus: true }));
  $('#btn-rail-new').addEventListener('click', () => $('#btn-new-case').click());
  drawRailRecent();

  // Write any pending edits the moment the window is hidden or closed.
  document.addEventListener('visibilitychange', () => { if (document.hidden) Save.flushAll(); });
  window.addEventListener('beforeunload', (e) => {
    if (Save.busy()) {
      Save.flushAll();
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Service worker: caches the app files (never case data) so the app opens offline.
  // Only on https / localhost; the file:// copy on the SSD doesn't need it.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker not registered', err));
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) toast('A CaseVault update was installed. Reload the page when convenient to use it.', 'info', 15000);
      hadController = true;
    });
  }

  // v1.98: the parts of the app kept in their own files get the helpers they use.
  PARTS.files = CVFilesTab.init({ state, h, I, toast, Save, showCase, FOLDER_ICONS, onDriveLost, confirmDialog, fmtDate, fileTypeLabel, fileKind, FILE_ICONS, fmtSize, fmtDateTime, fmtTime, openDialog, field });
  // v1.148: a Timeline shows the whole Operation, or the whole Case Group for an independent case in one.
  const timelineCases = (c) => {
    const ops = operationCases(c);
    if (ops.length) return ops;
    const e = (Vault.data?.cases || []).find((x) => x.id === (typeof c === 'string' ? c : c && c.id));
    if (!e || !e.suspectGroup || opOf(e)) return [];
    return Vault.data.cases.filter((x) => !isArchivedEntry(x) && !opOf(x) && x.suspectGroup === e.suspectGroup).sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  };
  PARTS.timeline = CVCaseTimeline.init({ operationCases: timelineCases, state, h, today, Save, field, dueLabel, fmtDate, confirmDialog, openDialog, icon: I, toast, opOf });
  PARTS.overview = CVCaseOverview.init({ h, field, dnaCombo, I, today, fmtDate, dueLabel, opOf, Save, newCase, openDialog, fmtDateTime, toast, renderCaseList });
  PARTS.backup = CVBackupUI.init({ h, I, MODE, Save, confirmDialog, encryptionText, ENCRYPTION_STEPS, field, fmtSize, onDriveLost, openDialog, plural, renderCaseList, route, state, toast, today });

  // Small toolkit shared with the consistency checker screen (js/checker/checks-ui.js).
  window.CaseVaultUI = { h, icon: I, betaTag, $, toast, openDialog, confirmDialog, field, fmtDate, fmtDateTime, fmtSize, Save, state, go, refresh: () => route(), previewFile, onDriveLost, showVaultPanel, makeFoldable };
  CVChecks.init(window.CaseVaultUI);
  CVOutbound.init(window.CaseVaultUI);
  CVMailUI.init(window.CaseVaultUI);
  // v1.151: Discovery and Link Chart load the first time they are opened (start-up reads less).
  const lazyPart = (files, name) => { let ready = null; return () => (ready = ready || CVKit.loadScripts(files).then(() => { window[name].init(window.CaseVaultUI); return window[name]; }).catch((err) => { ready = null; throw err; })); };
  window.CVLazy = { discovery: lazyPart(['js/discovery-receipt.js', 'js/discovery-ui.js'], 'CVDiscoveryUI'), linkChart: lazyPart(['js/linkchart.js', 'js/linkchart-ui.js'], 'CVLinkChartUI'), caseExport: lazyPart(['js/case-export.js', 'js/case-export-ui.js'], 'CVCaseExportUI'), agenda: lazyPart(['js/agenda.js', 'js/agenda-ui.js'], 'CVAgendaUI') };
  // v1.153: Reports and the Write Report tab too (they need each other, so they come together).
  let reportsReady = null;
  CVLazy.reports = () => (reportsReady = reportsReady || CVKit.loadScripts(['js/drafts/ghost.js', 'js/drafts/review.js', 'js/drafts/draft-facts.js', 'js/drafts/drafts-ui.js', 'js/report-fields-ui.js', 'js/drafts/ai-edit-ui.js', 'js/drafts/narrative-helper.js'])
    .then(() => { CVDraftsUI.init(window.CaseVaultUI); CVReportFieldsUI.init(window.CaseVaultUI); CVAIEdit.init(window.CaseVaultUI); CVNarrativeHelper.init(window.CaseVaultUI); return { drafts: CVDraftsUI, fields: CVReportFieldsUI }; })
    .catch((err) => { reportsReady = null; throw err; }));
  CVSecureSettings.init(window.CaseVaultUI);
  memBox = CVMemory.mount($('#mem-status'), {
    isHelper: () => MODE === 'helper',
    engineConnected: () => CVChecks.Engine.status() === 'connected',
  });
  CVActivityLib.mount(CVActivity, $('#ai-activity'));
  CVClosingUI.init(window.CaseVaultUI);
  CVLetterhead.init(window.CaseVaultUI);
  CVReferenceUI.init(window.CaseVaultUI);
  CVLibraryUI.init(window.CaseVaultUI);
  CVChatUI.init(window.CaseVaultUI);
  CVNotesFloat.init(window.CaseVaultUI);
  CVLockerUI.init(window.CaseVaultUI);

  // Privacy screen: the "Hide" button or the idle timer. See js/privacy.js.
  CVPrivacy.init({
    flush: () => Save.flushAll(),
    getPinRecord: () => (Vault.data && Vault.data.settings.privacyPin) || null,
    getIdleMinutes: idleMinutes,
    button: $('#btn-privacy'),
    // v1.106: a PIN saved before v1.106 is re-saved with the slower hash after it unlocks.
    upgradePin: async (pin) => { const record = await CVPrivacy.makePinRecord(pin); await Save.track('settings', () => Vault.updateSettings({ privacyPin: record })); },
  });

  Save.render();
  launch();
})();
