/* CaseVault — one way to write numbers everywhere:
 *
 *   phone   123.456.7890
 *   SSN     123.45.6789
 *   date    12.01.2026   (month.day.year)
 *
 * Phone and SSN boxes format themselves as you type. Date boxes are plain boxes you type into
 * ("12012026", "12/1/26" and "2026-12-01" all become 12.01.2026) with a calendar button; they
 * still hold "YYYY-MM-DD" underneath, so saved data doesn't change.
 *
 * The formatters are plain logic with no DOM, so the tests run them under Node.
 */
'use strict';

(function (root) {
  const pad = (n) => String(n).padStart(2, '0');
  const digits = (s) => String(s || '').replace(/\D/g, '');

  /** Groups the digits as they're typed: "1234567890" -> "123.456.7890". Anything else is left alone. */
  function phone(text) {
    const s = String(text || '');
    if (!s.trim()) return '';
    // Keep international numbers, extensions and words as typed.
    if (/^\s*\+(?!1\b)/.test(s) || /[a-z]/i.test(s.replace(/\s*(x|ext\.?)\s*\d*$/i, ''))) return s;
    let d = digits(s.replace(/\s*(x|ext\.?)\s*\d*$/i, ''));
    const ext = (/\s*(?:x|ext\.?)\s*(\d+)$/i.exec(s) || [])[1];
    if (d.length === 11 && d[0] === '1') d = d.slice(1);
    if (d.length > 10) return s;
    const out = d.length <= 3 ? d : d.length <= 6 ? `${d.slice(0, 3)}.${d.slice(3)}` : `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return ext ? `${out} x${ext}` : out;
  }

  /** "123456789" -> "123.45.6789" (as typed, too). */
  function ssn(text) {
    const d = digits(text).slice(0, 9);
    return d.length <= 3 ? d : d.length <= 5 ? `${d.slice(0, 3)}.${d.slice(3)}` : `${d.slice(0, 3)}.${d.slice(3, 5)}.${d.slice(5)}`;
  }

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  /** "2026-09-30" -> "September 30, 2026" (v1.32: the long date everywhere); anything else as it is. */
  function dateText(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? `${MONTHS[Number(m[2]) - 1]} ${m[3]}, ${m[1]}` : String(iso || '');
  }

  /** v1.69: the month whose name starts with these letters ("sep" -> "September"), or ''. */
  function predictMonth(letters) {
    const t = String(letters || '').toLowerCase();
    if (!t) return '';
    return MONTHS.find((m) => m.toLowerCase().startsWith(t)) || '';
  }
  /** A whole month name, or its first three letters or more -> the month's name; else ''. */
  function monthOf(word) {
    const t = String(word || '').toLowerCase();
    return t.length >= 3 ? (MONTHS.find((m) => m.toLowerCase().startsWith(t)) || '') : '';
  }

  /** What was typed -> "YYYY-MM-DD", or '' if it isn't a real date. Month first, as in the US. */
  function parseDate(text) {
    const s = String(text || '').trim();
    if (!s) return '';
    let y; let mo; let d;
    let m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(s);
    // "September 30, 2026" or "Sep 30 2026", as dates are shown (v1.32).
    const long = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
    const mi = long ? MONTHS.findIndex((x) => x.toLowerCase().startsWith(long[1].toLowerCase().slice(0, 3))) : -1;
    if (long && mi >= 0) [y, mo, d] = [long[3], mi + 1, long[2]];
    else if (m) [y, mo, d] = [m[1], m[2], m[3]];
    else if ((m = /^(\d{1,2})[-./ ](\d{1,2})[-./ ](\d{2}|\d{4})$/.exec(s))) [mo, d, y] = [m[1], m[2], m[3]];
    else if ((m = /^(\d{2})(\d{2})(\d{4}|\d{2})$/.exec(s))) [mo, d, y] = [m[1], m[2], m[3]];
    else return '';
    y = Number(y); mo = Number(mo); d = Number(d);
    if (y < 100) y += y < 70 ? 2000 : 1900;
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d || y < 1900 || y > 2200) return '';
    return `${y}-${pad(mo)}-${pad(d)}`;
  }

  /* ---------- in the page ---------- */

  /**
   * A date box: type MM.DD.YYYY, or pick it from the calendar button. Returns the wrapper; read and
   * set its .value as "YYYY-MM-DD". Fires 'input' and 'change'. A form still gets the value under
   * the box's name (a hidden input holds it). attrs: name, value, required, aria-label, title.
   */
  function dateField(attrs = {}) {
    const doc = root.document;
    const wrap = doc.createElement('span');
    wrap.className = 'date-field';
    const text = doc.createElement('input');
    text.type = 'text';
    text.className = 'date-text';
    text.inputMode = 'numeric';
    text.autocomplete = 'off';
    text.maxLength = 24;
    text.placeholder = 'MM.DD.YYYY';
    if (attrs['aria-label']) text.setAttribute('aria-label', attrs['aria-label']);
    if (attrs.required) text.required = true;
    if (attrs.title) wrap.title = attrs.title;
    const hidden = doc.createElement('input');
    hidden.type = 'hidden';
    if (attrs.name) hidden.name = attrs.name;
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-btn date-btn';
    btn.title = 'Pick a date';
    if (root.CVIcons) btn.append(root.CVIcons.icon('calendar-event'));
    const sr = doc.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = 'Pick a date';
    btn.append(sr);
    wrap.append(text, btn, hidden);

    let iso = parseDate(attrs.value) || '';
    const show = () => { text.value = dateText(iso); hidden.value = iso; };
    show();
    const fire = () => {
      wrap.dispatchEvent(new root.Event('input', { bubbles: true }));
      wrap.dispatchEvent(new root.Event('change', { bubbles: true }));
    };
    Object.defineProperty(wrap, 'value', {
      get() { return iso; },
      set(v) { iso = parseDate(v) || ''; show(); },
    });
    Object.defineProperty(wrap, 'name', { get: () => hidden.name });

    // v1.69: type a month's first letters and it's predicted ("sep" -> "September", the rest
    // selected); Tab takes it. "September 30" + Tab adds this year and finishes the date.
    text.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || e.shiftKey) return;
      const v = text.value;
      const full = monthOf(v.trim());
      if (full && text.selectionEnd === v.length && text.selectionStart < v.length) {
        e.preventDefault();
        text.value = `${full} `;
        text.setSelectionRange(text.value.length, text.value.length);
        return;
      }
      const md = /^([A-Za-z]+)\.?\s+(\d{1,2})$/.exec(v.trim());
      if (md && monthOf(md[1])) {
        text.value = `${monthOf(md[1])} ${Number(md[2])}, ${new Date().getFullYear()}`;
        text.dispatchEvent(new root.Event('input', { bubbles: false }));
      }
    });
    text.addEventListener('input', (e) => {
      e.stopPropagation();
      // Dots go in as you type: "1201" -> "12.01", "12012026" -> "12.01.2026".
      // Only digits and our own dots: regroup the digits (typing "/" or "-" is left as typed).
      const d = text.value.replace(/\D/g, '');
      if (/^[\d.]*$/.test(text.value) && d.length <= 8 && text.selectionStart === text.value.length && !(e.inputType || '').startsWith('delete')) {
        text.value = d.length <= 2 ? d : d.length <= 4 ? `${d.slice(0, 2)}.${d.slice(2)}` : `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}`;
      }
      // v1.69: letters only: predict the month, the part not typed selected.
      const typed = text.value;
      if (/^[A-Za-z]+$/.test(typed) && !(e.inputType || '').startsWith('delete') && text.selectionStart === typed.length) {
        const full = predictMonth(typed);
        if (full && full.length > typed.length) { text.value = full; text.setSelectionRange(typed.length, full.length); }
      }
      const next = parseDate(text.value);
      if (next || !text.value.trim()) {
        const changed = next !== iso;
        iso = next;
        hidden.value = iso;
        text.setCustomValidity('');
        if (changed) fire();
      }
    });
    text.addEventListener('blur', () => {
      const next = parseDate(text.value);
      if (next) { iso = next; show(); }
      text.setCustomValidity(text.value.trim() && !next ? 'Type a date as MM.DD.YYYY, for example 12.01.2026.' : '');
    });
    // v1.50: CaseVault's own square calendar (the browser's is rounded and can't be restyled).
    btn.addEventListener('click', () => calendar(btn, iso, (v) => { iso = v; show(); text.setCustomValidity(''); fire(); text.focus(); }));
    return wrap;
  }


  /* ---------- the calendar (v1.50) ---------- */

  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  /** The 42 days (six weeks, Sunday first) shown for a month; month is 0-11. */
  function monthGrid(year, month) {
    const first = new Date(year, month, 1);
    const start = new Date(year, month, 1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return { iso: isoOf(d), day: d.getDate(), inMonth: d.getMonth() === month };
    });
  }

  let openCal = null;
  /** A square calendar under the button; onPick(iso or '') when a day, Today or Clear is chosen. */
  function calendar(anchor, iso, onPick) {
    const doc = root.document;
    if (openCal) { const was = openCal.anchor; openCal.close(); if (was === anchor) return; }
    const host = anchor.closest('dialog[open]') || doc.body;
    const pop = doc.createElement('div');
    pop.className = 'cal-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Pick a date');
    const today = isoOf(new Date());
    const base = parseDate(iso) || today;
    let year = Number(base.slice(0, 4)); let month = Number(base.slice(5, 7)) - 1; let focus = base;
    const mk = (tag, cls, txt, attrs = {}) => { const el = doc.createElement(tag); if (cls) el.className = cls; if (txt != null) el.textContent = txt; for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return el; };
    const head = mk('div', 'cal-head');
    const title = mk('span', 'cal-title');
    const nav = (txt, label, fn) => { const b = mk('button', 'cal-nav', txt, { type: 'button', title: label, 'aria-label': label }); b.addEventListener('click', () => { fn(); draw(); }); return b; };
    const moveMonth = (n) => { const d = new Date(year, month + n, 1); year = d.getFullYear(); month = d.getMonth(); };
    head.append(nav('«', 'Previous year', () => { year -= 1; }), nav('‹', 'Previous month', () => moveMonth(-1)), title, nav('›', 'Next month', () => moveMonth(1)), nav('»', 'Next year', () => { year += 1; }));
    const grid = mk('div', 'cal-grid', null, { role: 'grid' });
    const foot = mk('div', 'cal-foot');
    const pick = (v) => { close(); onPick(v); };
    const todayBtn = mk('button', 'cal-act', 'Today', { type: 'button' });
    todayBtn.addEventListener('click', () => pick(today));
    const clearBtn = mk('button', 'cal-act', 'Clear', { type: 'button' });
    clearBtn.addEventListener('click', () => pick(''));
    foot.append(clearBtn, todayBtn);
    pop.append(head, grid, foot);
    function draw() {
      title.textContent = `${MONTHS[month]} ${year}`;
      grid.replaceChildren(...['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((w) => mk('span', 'cal-wd', w)));
      if (focus.slice(0, 7) !== `${year}-${pad(month + 1)}`) focus = `${year}-${pad(month + 1)}-01`;
      for (const d of monthGrid(year, month)) {
        const b = mk('button', `cal-day${d.inMonth ? '' : ' out'}${d.iso === today ? ' today' : ''}${d.iso === iso ? ' on' : ''}`, String(d.day),
          { type: 'button', 'data-iso': d.iso, tabindex: d.iso === focus ? '0' : '-1', 'aria-label': dateText(d.iso) });
        b.addEventListener('click', () => pick(d.iso));
        grid.append(b);
      }
    }
    const focusDay = () => { const b = grid.querySelector(`[data-iso="${focus}"]`); if (b) b.focus(); };
    pop.addEventListener('keydown', (e) => {
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); anchor.focus(); return; }
      if (step && e.target.classList.contains('cal-day')) {
        e.preventDefault();
        const d = new Date(Number(focus.slice(0, 4)), Number(focus.slice(5, 7)) - 1, Number(focus.slice(8, 10)) + step);
        focus = isoOf(d); year = d.getFullYear(); month = d.getMonth();
        draw(); focusDay();
      } else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); moveMonth(e.key === 'PageUp' ? -1 : 1); draw(); focusDay(); }
    });
    // Placed under the button (above it when there's no room), inside the page's zoom.
    const z = parseFloat(doc.documentElement.style.zoom) || 1;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const W = root.innerWidth / z; const H = root.innerHeight / z;
      const w = pop.offsetWidth; const hh = pop.offsetHeight;
      const left = Math.max(4, Math.min(r.right / z - w, W - w - 4));
      const below = r.bottom / z + 4;
      pop.style.left = `${left}px`;
      pop.style.top = `${below + hh > H - 4 ? Math.max(4, r.top / z - hh - 4) : below}px`;
    };
    const outside = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
    // v1.190: a scroll elsewhere (the page behind a window still scrolling into place) leaves it
    // open; one that moves its box moves it along.
    const scrolled = (e) => {
      if (pop.contains(e.target)) return;
      const t = e.target;
      const moves = t === doc || t === doc.documentElement || t === doc.body || (t && t.contains && t.contains(anchor));
      if (!moves) return;
      if (!anchor.isConnected) { close(); return; }
      place();
    };
    function close() {
      if (!pop.isConnected) return;
      pop.remove();
      doc.removeEventListener('pointerdown', outside, true);
      root.removeEventListener('resize', close);
      root.removeEventListener('scroll', scrolled, true);
      if (openCal && openCal.pop === pop) openCal = null;
    }
    draw();
    host.append(pop);
    place();
    doc.addEventListener('pointerdown', outside, true);
    root.addEventListener('resize', close);
    root.addEventListener('scroll', scrolled, true);
    openCal = { pop, anchor, close };
    focusDay();
    return { close, el: pop };
  }

  // Phone and SSN boxes format themselves. Only when the cursor is at the end, so fixing a digit
  // in the middle doesn't make the cursor jump; the whole number is tidied when you leave the box.
  function install(doc) {
    const fmt = (el) => (el.type === 'tel' ? phone : el.dataset && el.dataset.format === 'ssn' ? ssn : null);
    doc.addEventListener('input', (e) => {
      const el = e.target;
      if (!(el instanceof root.HTMLInputElement)) return;
      const f = fmt(el);
      if (!f || el.selectionStart !== el.value.length || (e.inputType || '').startsWith('delete')) return;
      const v = f(el.value);
      if (v !== el.value) el.value = v;
    }, true);
    doc.addEventListener('blur', (e) => {
      const el = e.target;
      if (!(el instanceof root.HTMLInputElement)) return;
      const f = fmt(el);
      if (!f) return;
      const v = f(el.value);
      if (v !== el.value) { el.value = v; el.dispatchEvent(new root.Event('input', { bubbles: true })); el.dispatchEvent(new root.Event('change', { bubbles: true })); }
    }, true);
  }

  /* ---------------- headings: Title Case ---------------- */

  const SMALL = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'nor', 'for', 'of', 'on', 'in', 'to', 'at', 'by', 'with', 'from', 'as', 'per', 'vs', 'via', 'into']);
  /** "Upcoming deadlines" -> "Upcoming Deadlines". Short joining words stay lower case (except
   * first); words with capitals, digits, dots or slashes (DEA-6, notes.md, AI) and anything in
   * quotes (a case's own title) are left as they are. */
  function titleCase(text) {
    let quoted = false;
    let first = true;
    return String(text).split(/(\s+)/).map((w) => {
      if (/^\s+$/.test(w) || !w) return w;
      const opens = /^["“']/.test(w);
      const was = quoted;
      if (opens && !quoted) quoted = true;
      if (quoted && /["”']$/.test(w) && (w.length > 1 || !opens)) quoted = false;
      if (was || opens) { first = false; return w; }
      const skip = /[@\\/]|\.\w/.test(w) || !/^[a-z]/.test(w);
      const small = !first && SMALL.has(w.toLowerCase().replace(/[^a-z]/g, ''));
      const out = skip || small ? w : w[0].toUpperCase() + w.slice(1);
      first = /[:–—-]$/.test(w);
      return out;
    }).join('');
  }

  /** A folder path as shown on screen (v1.22): "cases\\2026-B1\\files" -> "cases | 2026-B1 | files". */
  const pathText = (p) => String(p || '').split(/[\\/]+/).filter(Boolean).join(' | ');

  /** v1.151: one place for "YYYY-MM-DD" in this PC's time zone (was copied in six files). */
  const isoDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  /** That day plus n days ("2026-10-24", 1 -> "2026-10-25"); noon keeps clock changes out of it. */
  const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return isoDay(d); };

  const api = { phone, ssn, dateText, parseDate, predictMonth, monthOf, dateField, monthGrid, calendar, install, titleCase, pathText, isoDay, addDays };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.CVFormat = api;
    if (root.document) install(root.document);
  }
})(this);
