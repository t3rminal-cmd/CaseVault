/* CaseVault — a searchable drop-down you can also type into (v1.22): UCR codes, location codes,
 * charges, gangs. Typing filters the list (every word must match, anywhere); the ▾ button shows
 * the whole list; ↑ ↓ and Enter pick; Esc closes. Anything not in the list can still be typed.
 *
 *   const box = CVCombo.attach(input, { items: () => [{ value, label, hint }], onPick(item) })
 *   // put `box` where the input would have gone
 */
'use strict';

(function (root) {
  let seq = 0;

  /** Items matching a query: every word appears in the label or hint (case doesn't matter). */
  function filter(items, query, max = 80) {
    const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    const out = [];
    for (const it of items) {
      const hay = `${it.label} ${it.hint || ''}`.toLowerCase();
      if (words.every((w) => hay.includes(w))) out.push(it);
      if (out.length >= max) break;
    }
    return out;
  }

  function attach(input, { items, onPick, max = 80, label = 'Show the list' } = {}) {
    const doc = root.document;
    const id = `cv-combo-${++seq}`;
    const wrap = doc.createElement('div');
    wrap.className = 'combo';
    const list = doc.createElement('ul');
    list.className = 'combo-list';
    list.id = id;
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'combo-toggle';
    btn.tabIndex = -1;
    btn.setAttribute('aria-label', label);
    btn.append(root.CVIcons ? root.CVIcons.icon('chevron-down') : '▾');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', id);
    input.setAttribute('aria-expanded', 'false');
    input.autocomplete = 'off';
    input.removeAttribute('list');
    wrap.append(input, btn, list);

    let shown = [];
    let active = -1;
    let picking = false;
    let lastPicked = null; // v1.175: the value picked last (its list then stays closed)
    const open = () => !list.hidden;
    // v1.190: the height and side (below or above the box) the list opened with, kept while you
    // type, so it doesn't shrink and jump with each letter.
    let held = null;
    function close() { held = null; list.style.minHeight = ''; root.removeEventListener('scroll', onScroll, true); root.removeEventListener('resize', onResize); list.hidden = true; active = -1; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
    function mark() {
      [...list.children].forEach((li, i) => li.classList.toggle('active', i === active));
      const li = list.children[active];
      if (li) { li.scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', li.id); }
    }
    function draw(all) {
      shown = filter(items(), all ? '' : input.value, max);
      list.replaceChildren(...shown.map((it, i) => {
        const li = doc.createElement('li');
        li.className = 'combo-opt';
        li.id = `${id}-${i}`;
        li.setAttribute('role', 'option');
        const main = doc.createElement('span');
        main.textContent = it.label;
        li.append(main);
        if (it.hint) { const s = doc.createElement('span'); s.className = 'combo-hint'; s.textContent = it.hint; li.append(s); }
        li.addEventListener('mousedown', (e) => e.preventDefault()); // keep the focus in the box
        li.addEventListener('click', () => pick(i));
        return li;
      }));
      // Nothing to choose when the one match was just picked. v1.175: a code typed in full (259)
      // still shows its match, to pick it (picking fills in its description too).
      const exact = !all && shown.length === 1 && shown[0].value.toLowerCase() === input.value.trim().toLowerCase() && lastPicked === shown[0].value;
      const wasOpen = held !== null;
      list.hidden = !shown.length || exact;
      if (list.hidden) { held = null; list.style.minHeight = ''; }
      else if (!wasOpen) { list.style.minHeight = ''; held = { h: 0, above: null }; }
      if (!list.hidden) { place(); root.addEventListener('scroll', onScroll, true); root.addEventListener('resize', onResize); }
      // A hover box already showing for this box steps aside for the list (v1.38).
      if (!list.hidden) { const t = doc.getElementById('cv-tip'); if (t) t.hidden = true; }
      input.setAttribute('aria-expanded', String(!list.hidden));
      active = -1;
      if (!list.hidden && !all && shown.length === 1) { active = 0; mark(); } // the only match: Enter picks it
    }
    // v1.160: the list floats over the page under its box (above it when there's no room below), so
    // a box near the bottom of a form that scrolls is never cut off or hidden under the Save bar; it
    // follows its box when the page scrolls and stays inside the window (v1.79).
    function place() {
      const z = parseFloat(doc.documentElement.style.zoom) || 1;
      const r = wrap.getBoundingClientRect();
      const W = root.innerWidth / z; const H = root.innerHeight / z;
      list.style.minWidth = `${Math.min(Math.max(r.width / z, 160), W - 16)}px`;
      if (held && held.h) list.style.minHeight = `${held.h}px`;
      const w = list.offsetWidth; const h = list.offsetHeight;
      list.style.left = `${Math.max(8, Math.min(r.left / z, W - w - 8))}px`;
      const below = r.bottom / z + 2;
      const above = held && held.above !== null ? held.above : (below + h > H - 4 && r.top / z - h - 2 > 4);
      if (held && !held.h) { held.h = h; held.above = above; }
      list.style.top = `${above ? r.top / z - h - 2 : Math.min(below, Math.max(4, H - h - 4))}px`;
    }
    // Listened to only while the list is open (added in draw, removed in close).
    function onScroll(e) {
      if (!open() || list.contains(e.target)) return;
      const b = wrap.getBoundingClientRect();
      if (b.bottom < 0 || b.top > root.innerHeight || !wrap.isConnected) close(); else place();
    }
    function onResize() { if (open()) place(); }
    function pick(i) {
      const it = shown[i];
      if (!it) return;
      picking = true;
      lastPicked = it.value;
      input.value = it.value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      picking = false;
      close();
      if (onPick) onPick(it);
    }
    input.addEventListener('input', () => { if (!picking && doc.activeElement === input) draw(false); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!open()) draw(!input.value); active = Math.min(active + 1, shown.length - 1); mark(); } else if (e.key === 'ArrowUp' && open()) { e.preventDefault(); active = Math.max(active - 1, 0); mark(); } else if (e.key === 'Enter' && open() && active >= 0) { e.preventDefault(); pick(active); } else if (e.key === 'Escape' && open()) { e.preventDefault(); e.stopPropagation(); close(); }
    });
    input.addEventListener('blur', () => setTimeout(() => { if (doc.activeElement !== input) close(); }, 120));
    // A click anywhere else closes the list, whatever has the focus.
    doc.addEventListener('pointerdown', (e) => { if (open() && !wrap.contains(e.target)) close(); }, true);
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => { if (input.disabled || input.readOnly) return; if (open()) close(); else { input.focus(); draw(true); } });
    return wrap;
  }

  /* v1.38: the browser's own suggestion pop-ups (a <datalist>, and the history of what was typed
   * before) are drawn by the browser with round corners and can't be styled. So, everywhere:
   * - a box with a list of choices (<input list="…">) gets this square list instead, filled from
   *   its <datalist> each time it opens (so a list that changes stays current);
   * - every other text box has the browser's history pop-up turned off (autocomplete="off"). */
  const TEXTY = /^(text|search|email|tel|url|number|)$/;
  function upgrade(el) {
    const doc = root.document;
    if (el.tagName !== 'INPUT' || el.dataset.cvUpgraded) return;
    el.dataset.cvUpgraded = '1';
    if (!el.hasAttribute('autocomplete') && TEXTY.test(el.getAttribute('type') || '')) el.setAttribute('autocomplete', 'off');
    const listId = el.getAttribute('list');
    if (!listId || el.closest('.combo')) return;
    const mark = doc.createComment('');
    el.before(mark);
    const items = () => {
      const dl = doc.getElementById(listId);
      return dl ? [...dl.querySelectorAll('option')].filter((o) => o.value).map((o) => ({ value: o.value, label: o.value, hint: o.label && o.label !== o.value ? o.label : '' })) : [];
    };
    const wrap = attach(el, { items, onPick: () => el.dispatchEvent(new Event('change', { bubbles: true })) });
    mark.replaceWith(wrap);
  }
  function upgradeAll(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.tagName === 'INPUT') upgrade(node);
    else node.querySelectorAll('input').forEach(upgrade);
  }
  if (root.document && root.MutationObserver) {
    const start = () => {
      upgradeAll(root.document.body);
      new root.MutationObserver((muts) => { for (const m of muts) m.addedNodes.forEach(upgradeAll); }).observe(root.document.body, { childList: true, subtree: true });
    };
    if (root.document.body) start(); else root.document.addEventListener('DOMContentLoaded', start);
  }

  const api = { attach, filter, upgrade };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVCombo = api;
})(this);
