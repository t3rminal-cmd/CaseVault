/* CaseVault — Library and AI writing behavior, in the Vault panel, and the Library part of
 * Draft with AI. See js/library.js for what they are.
 */
'use strict';

(function (root) {
  let ui = null;
  const L = () => root.CVLibrary;
  const textMemo = new Map();

  /** Library files with their settings: [{ path, folder, name, size, modified, category, docType, always }]. */
  async function items() {
    const [files, meta] = await Promise.all([Vault.listLibrary(), Vault.readLibraryMeta()]);
    return files.map((f) => {
      const cat = L().categoryOfFolder(f.folder);
      const m = meta.items[f.path] || {};
      return { ...f, category: cat ? cat.key : 'other', docType: m.docType || L().guessDocType(f.name), always: !!m.always };
    });
  }

  async function setMeta(path, patch) {
    const meta = await Vault.readLibraryMeta();
    meta.items[path] = { ...(meta.items[path] || {}), ...patch };
    await ui.Save.track('library', () => Vault.writeLibraryMeta(meta));
  }

  /* ---------- v1.149: real names in examples ---------- */
  /** What CaseVault knows to look for: every case's numbers, clients and subjects, this case's
   * people, you, and the watch list (Settings). Plus the usual patterns (phones, addresses, SSNs…). */
  function knownFor(caseObj = null) {
    const s = (Vault.data && Vault.data.settings) || {};
    const cases = (Vault.data && Vault.data.cases) || [];
    const subjects = cases.map((c) => String(c.subject || '').trim()).filter((v) => v.length >= 3).map((value) => ({ value, type: 'known' }));
    return [...root.CVPii.knownTerms({ caseObj, affiant: s.affiant, watchlist: s.piiWatchlist || [], caseIndex: cases }), ...subjects];
  }
  const scrubScan = (text, caseObj = null) => root.CVPii.scan(text, { known: knownFor(caseObj) });
  /** The findings as a short list: "Name: DOE, John", at most 12, then "and N more". */
  function findingsList(findings) {
    const { h } = ui;
    const seen = new Set(); const rows = [];
    for (const f of findings) { const k = `${f.label}|${f.value.toLowerCase()}`; if (seen.has(k)) continue; seen.add(k); rows.push(f); }
    return h('ul', { class: 'scrub-list' }, ...rows.slice(0, 12).map((f) => h('li', {}, h('span', { class: 'scrub-type' }, f.label), ' ', h('span', { class: 'scrub-value' }, f.value))),
      rows.length > 12 ? h('li', { class: 'muted' }, `and ${rows.length - 12} more`) : null);
  }
  /** The example folder for a document type: warrants and affidavits apart from reports. */
  const folderFor = (docType) => (['affidavit', 'warrant'].includes(docType) ? 'warrants' : 'examples');

  /** v1.149: Use as AI Example (a report's Export menu): the report's text with names, numbers and
   * addresses swapped for placeholders ([NAME_1]…), saved in the Library as an example. */
  async function addFromReport(caseObj, title, text, type) {
    const { h } = ui;
    const findings = scrubScan(text, caseObj);
    const { text: clean, replaced } = root.CVPii.redact(text, findings);
    const guess = L().DOC_TYPES.some(([k]) => k === type) ? type : L().guessDocType(`${title} ${type}`);
    const docSel = h('select', { 'aria-label': 'Example of' }, L().DOC_TYPES.map(([k, label]) => h('option', { value: k, selected: k === guess }, label)));
    const pre = h('textarea', { class: 'scrub-preview', rows: 10, readonly: true }); pre.value = clean;
    const ok = await ui.openDialog((close) => h('form', { class: 'scrub-form', onsubmit: (e) => { e.preventDefault(); close(true); } },
      h('h2', { icon: 'journal-bookmark' }, 'Use as AI Example'),
      h('p', { class: 'muted small' }, replaced ? `${replaced} name${replaced === 1 ? '' : 's'}, number${replaced === 1 ? '' : 's'} or address${replaced === 1 ? '' : 'es'} were swapped for placeholders like [NAME_1], so the AI learns the wording, not the people. Read it before saving: unusual names can slip through.` : 'Nothing that looks like a name, number or address was found. Read it before saving: unusual names can slip through.'),
      replaced ? findingsList(findings) : null,
      ui.field('Example Of', docSel), pre,
      CVKit.cancelRow(h, () => close(false), h('button', { class: 'btn primary', type: 'submit', icon: 'journal-bookmark' }, 'Save Example'))));
    if (!ok) return false;
    const cat = L().category(folderFor(docSel.value));
    const name = `${FS.safeName(title || 'Report')} (example).md`;
    try {
      const path = await ui.Save.track('library', () => Vault.saveLibraryFile(cat.folder, name, new File([pre.value], name, { type: 'text/markdown' })));
      await setMeta(path, { docType: docSel.value, always: false });
      ui.toast(`Saved in Settings → Library → ${cat.label}.`, 'success', 4000);
      return true;
    } catch { return false; }
  }

  /** The file's text, read once and kept in library/.cache on the SSD. */
  async function textOf(path) {
    const file = await Vault.readLibraryFile(path);
    if (!file) return '';
    const key = `${path}|${file.size}|${file.lastModified}`;
    if (textMemo.has(key)) return textMemo.get(key);
    let text = await Vault.readLibraryText(path, file.size, file.lastModified).catch(() => null);
    if (text == null) {
      if (/\.(md|txt)$/i.test(file.name)) text = await file.text();
      else {
        const out = await CVExtract.extract(file, file.name);
        text = (out.paragraphs || []).map((p) => p.text).join('\n\n');
      }
      await Vault.writeLibraryText(path, file.size, file.lastModified, text).catch(() => {});
    }
    textMemo.set(key, text);
    return text;
  }

  /** [{ title, text }] for the chosen paths, for draftMessages(). v1.183: scrub: names, numbers and
   * addresses swapped for placeholders before the AI sees them (examples kept "as they are" too). */
  async function texts(paths, onProgress, { scrub = false } = {}) {
    const out = [];
    for (const p of paths) {
      if (onProgress) onProgress(p.split('/').pop());
      try {
        let t = await textOf(p);
        if (scrub && t.trim() && root.CVPii) t = root.CVPii.redact(t, scrubScan(t)).text;
        if (t.trim()) out.push({ title: p.split('/').pop().replace(/\.[^.]+$/, ''), text: t });
      } catch (err) {
        if (FS.isDisconnectError(err)) throw err;
        ui.toast(`Skipped ${p.split('/').pop()}: ${err.message}`, 'error', 6000);
      }
    }
    return out;
  }

  /**
   * v1.183: the Library for Ask AI and Ask AI to Edit: the directives marked "always" (shortened),
   * and the few example passages closest to the question, names scrubbed. -> text block or ''.
   */
  async function relevantFor(query, { k = 3 } = {}) {
    const list = await items().catch(() => []);
    if (!list.length) return '';
    const dirs = await texts(list.filter((i) => i.category === 'directives' && i.always).map((i) => i.path)).catch(() => []);
    const ex = await texts(list.filter((i) => (L().category(i.category) || {}).role === 'example').map((i) => i.path), null, { scrub: true }).catch(() => []);
    const passages = ex.flatMap((d) => d.text.split(/\n\s*\n/).map((t) => t.trim()).filter((t) => t.length > 60).map((text) => ({ title: d.title, text })));
    const picked = passages.length && root.CVText ? CVText.createIndex(passages).search(String(query || ''), k) : [];
    const parts = [
      ...dirs.map((d) => `### Directive: ${d.title}\n${d.text.length > 1500 ? `${d.text.slice(0, 1480)} …[shortened]` : d.text}`),
      ...picked.map((x) => `### Example: ${x.title}\n${x.text}`),
    ];
    return parts.length ? `## From the Library (how to write, and rules to follow; NOT facts of this case)\n${parts.join('\n\n')}` : '';
  }

  /* ---------------- Vault → Terminology (v1.183) ---------------- */

  function termsSection() {
    const { h, toast, Save } = ui;
    const T = () => root.CVTerms;
    const box = h('div', { class: 'terms-list' });
    const q = h('input', { type: 'search', placeholder: 'Search the terms', 'aria-label': 'Search the terms', autocomplete: 'off' });
    const term = h('input', { maxlength: 60, 'aria-label': 'Term', placeholder: 'Term (for example: zip)' });
    const meaning = h('input', { maxlength: 300, 'aria-label': 'Meaning', placeholder: 'What it means (for example: one ounce, about 28 grams)' });
    const kind = h('select', { 'aria-label': 'Kind' }, T().KINDS.map((k) => h('option', { value: k }, k)));
    const drugSel = h('select', { 'aria-label': 'Same as a drug', title: 'Drug slang only: the checks treat this word as that drug ("girl" in one report and "cocaine" in another are the same drug).' },
      h('option', { value: '' }, 'Not a drug name'), ...['cocaine', 'heroin', 'fentanyl', 'methamphetamine', 'cannabis', 'mdma', 'oxycodone', 'pcp'].map((d) => h('option', { value: d }, `Same as ${d}`)));
    const mine = () => T().mine();
    const save = (list) => Save.track('settings', () => Vault.updateSettings({ terms: list.map(T().normalize) }));
    const draw = () => {
      const words = q.value.trim().toLowerCase();
      const list = T().all(mine()).filter((x) => !words || `${x.term} ${x.meaning} ${x.kind}`.toLowerCase().includes(words))
        .sort((a, b) => T().KINDS.indexOf(a.kind) - T().KINDS.indexOf(b.kind) || a.term.localeCompare(b.term));
      box.replaceChildren(list.length ? h('table', { class: 'data-table terms-table' },
        h('thead', {}, h('tr', {}, ['Term', 'Meaning', 'Kind', ''].map((x) => h('th', {}, x)))),
        h('tbody', {}, list.map((x) => h('tr', { class: x.builtin ? 'builtin' : '' },
          h('td', {}, h('strong', {}, x.term)), h('td', {}, x.meaning, x.drug ? h('span', { class: 'muted small' }, ` · counts as ${x.drug}`) : ''),
          h('td', { class: 'muted small' }, x.kind),
          h('td', {}, x.builtin ? h('span', { class: 'muted small', title: 'Built in. Add the same term to change its meaning.' }, 'Built in')
            : h('button', { class: 'icon-btn danger-icon', type: 'button', title: `Remove ${x.term}`, onclick: async () => {
              try { await save(mine().filter((y) => String(y.term).toLowerCase() !== x.term.toLowerCase())); draw(); } catch { /* reported */ }
            } }, ui.icon('trash3'), h('span', { class: 'sr-only' }, `Remove ${x.term}`))))))) : h('p', { class: 'muted small' }, 'No term matches.'));
    };
    q.addEventListener('input', draw);
    const add = h('button', { class: 'btn small', type: 'button', icon: 'plus-lg', onclick: async () => {
      const t = term.value.trim(); const m = meaning.value.trim();
      if (!t || !m) return toast('Type the term and what it means.', 'error');
      const list = [...mine().filter((y) => String(y.term).toLowerCase() !== t.toLowerCase()), { term: t, meaning: m, kind: kind.value, ...(drugSel.value && kind.value === 'Drug slang' ? { drug: drugSel.value } : {}) }];
      try { await save(list); term.value = ''; meaning.value = ''; drugSel.value = ''; toast(`${t} added.`, 'success'); draw(); } catch { /* reported */ }
    } }, 'Add Term');
    draw();
    return h('section', { 'data-section': 'terms' },
      h('h3', {}, 'Terminology'),
      h('p', { class: 'muted small explain' }, 'Words of the trade and what they mean: drug and quantity slang, abbreviations, your statutes, local places. Only the terms a case uses go to the AI with it. Drug slang marked "Same as" a drug also counts as that drug in the consistency checks. Kept in vault.json on the SSD.'),
      h('div', { class: 'row terms-add' }, term, meaning, kind, drugSel, add),
      h('div', { class: 'row' }, q),
      box);
  }

  /* ---------------- Vault → Language Bank (v1.183) ---------------- */

  function languageSection() {
    const { h, toast, Save } = ui;
    const typeSel = h('select', { 'aria-label': 'Kind of warrant or subpoena' }, L().WARRANT_TYPES.map((t) => h('option', { value: t.key }, t.label)));
    const box = h('div', { class: 'bank-list' });
    const bank = () => (Array.isArray(Vault.data.settings.languageBank) ? Vault.data.settings.languageBank : []);
    const save = (list) => Save.track('settings', () => Vault.updateSettings({ languageBank: list }));
    const title = h('input', { maxlength: 120, 'aria-label': 'Paragraph title', placeholder: 'Title (for example: Training and experience)' });
    const text = h('textarea', { rows: 5, 'aria-label': 'Approved paragraph', placeholder: 'Paste the approved paragraph, word for word. Use [CONFIRM: …] for what changes each time.' });
    const draw = () => {
      const t = L().warrantType(typeSel.value);
      const list = bank().filter((x) => x.type === t.key);
      box.replaceChildren(
        h('p', { class: 'small' }, h('strong', {}, 'Required elements: '), t.elements.map((k) => L().elementCheck('', t.key).find((e) => e.key === k).label).join(' · ')),
        list.length ? h('ul', { class: 'plain-list bank-items' }, list.map((x) => h('li', { class: 'bank-item' },
          h('div', { class: 'bank-head' }, h('strong', {}, x.title || 'Paragraph'), h('div', { class: 'spacer' }),
            h('button', { class: 'icon-btn danger-icon', type: 'button', title: `Remove ${x.title || 'this paragraph'}`, onclick: async () => {
              try { await save(bank().filter((y) => y.id !== x.id)); draw(); } catch { /* reported */ }
            } }, ui.icon('trash3'), h('span', { class: 'sr-only' }, `Remove ${x.title || 'paragraph'}`))),
          h('p', { class: 'small bank-text' }, x.text))))
          : h('p', { class: 'muted small' }, 'No approved paragraphs for this kind yet. Add the ones your prosecutor\'s office or department gave you.'));
    };
    typeSel.addEventListener('change', draw);
    const add = h('button', { class: 'btn small', type: 'button', icon: 'plus-lg', onclick: async () => {
      if (!text.value.trim()) return toast('Paste the paragraph first.', 'error');
      const item = { id: `lb${Date.now().toString(36)}`, type: typeSel.value, title: title.value.trim(), text: text.value.trim() };
      try { await save([...bank(), item]); title.value = ''; text.value = ''; toast('Paragraph kept.', 'success'); draw(); } catch { /* reported */ }
    } }, 'Add Paragraph');
    draw();
    return h('section', { 'data-section': 'language' },
      h('h3', {}, 'Language Bank'),
      h('p', { class: 'muted small explain' }, 'Your approved wording for each kind of warrant and subpoena, from your prosecutor\'s office or department. Draft with AI uses it word for word where it fits, and checks the draft for each kind\'s required elements. CaseVault ships no legal wording. Kept in vault.json on the SSD.'),
      h('div', { class: 'row' }, ui.field('Kind', typeSel)),
      box,
      ui.field('Title', title), ui.field('Paragraph', text),
      h('div', { class: 'row' }, add));
  }

  /* ---------------- Vault → Library ---------------- */

  function librarySection() {
    const { h, toast, Save } = ui;
    const box = h('div', { class: 'library-list' }, h('p', { class: 'muted small' }, 'Reading the library…'));
    const target = h('select', { 'aria-label': 'Add to' }, L().CATEGORIES.map((c) => h('option', { value: c.key }, c.label)));
    const input = h('input', { type: 'file', multiple: true, hidden: true, accept: '.pdf,.docx,.txt,.md,.xlsx,.csv,.jpg,.jpeg,.png' });
    const folderInput = h('input', { type: 'file', multiple: true, hidden: true, webkitdirectory: true });

    async function add(files) {
      const cat = L().category(target.value);
      const list = files.filter((f) => !f.name.startsWith('.'));
      if (!list.length) return;
      // v1.149: look in each file for real names, numbers and addresses before it goes in.
      const checking = toast(`Checking ${list.length} file${list.length === 1 ? '' : 's'} for names and numbers…`, 'info', 600000);
      const flagged = new Map();
      for (const f of list) {
        try {
          const text = /\.(md|txt)$/i.test(f.name) ? await f.text() : ((await CVExtract.extract(f, f.name)).paragraphs || []).map((p) => p.text).join('\n\n');
          const found = text.trim() ? scrubScan(text) : [];
          if (found.length) flagged.set(f, { text, found });
        } catch { /* unreadable: added as it is */ }
      }
      checking.remove();
      let mode = 'asis';
      if (flagged.size) {
        mode = await ui.openDialog((close) => h('div', { class: 'scrub-form' },
          h('h2', { icon: 'exclamation-triangle-fill' }, 'Real Names Found'),
          h('p', { class: 'small' }, `${flagged.size} of ${list.length} file${list.length === 1 ? '' : 's'} have what look like real names, phone numbers, addresses or case numbers. A small AI can copy them into a new draft. Save an anonymized copy instead (the text with [NAME_1]-style placeholders, as a text file), or keep the files as they are.`),
          ...[...flagged.entries()].map(([f, x]) => h('div', { class: 'scrub-file' }, h('strong', {}, f.name), findingsList(x.found))),
          h('div', { class: 'dialog-actions' },
            h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
            h('button', { class: 'btn', type: 'button', onclick: () => close('asis') }, 'Keep As They Are'),
            h('button', { class: 'btn primary', type: 'button', icon: 'shield-lock-fill', onclick: () => close('clean') }, 'Save Anonymized Copies'))));
        if (!mode) return;
      }
      const note = toast(`Copying ${list.length} file${list.length === 1 ? '' : 's'} into the Library…`, 'info', 600000);
      let n = 0;
      try {
        for (const f of list) {
          const x = mode === 'clean' ? flagged.get(f) : null;
          const name = x ? `${f.name.replace(/\.[^.]+$/, '')} (anonymized).md` : f.name;
          const data = x ? new File([root.CVPii.redact(x.text, x.found).text], name, { type: 'text/markdown' }) : f;
          const path = await Save.track('library', () => Vault.saveLibraryFile(cat.folder, name, data));
          await setMeta(path, { docType: L().guessDocType(f.name), always: cat.key === 'directives' });
          n++;
        }
        toast(`${n} file${n === 1 ? '' : 's'} added to ${cat.label}.`, 'success');
      } catch { /* reported by Save */ } finally { note.remove(); }
      draw();
    }
    input.addEventListener('change', () => { const f = [...input.files]; input.value = ''; add(f); });
    folderInput.addEventListener('change', () => { const f = [...folderInput.files]; folderInput.value = ''; add(f); });

    // v1.188: the Library as folders (one per part, opened and closed by its name), and the
    // examples by document type as one list that also narrows the folders to that type.
    let showType = '';
    const openFolders = new Set();
    async function draw() {
      let list = [];
      try { list = await items(); } catch (err) { if (FS.isDisconnectError(err)) return ui.onDriveLost(); }
      // v1.149: which document types Draft with AI has examples for, and which have none.
      const examples = list.filter((i) => (L().category(i.category) || {}).role === 'example');
      const cover = L().DOC_TYPES.filter(([k]) => k !== 'any').map(([k, label]) => [k, label, examples.filter((i) => i.docType === k).length]);
      const typeSel = h('select', { class: 'lib-type-filter', 'aria-label': 'Examples Draft with AI can use', title: 'How many examples Draft with AI has of each document type. Choose one to show only those.' },
        h('option', { value: '' }, `All Types (${list.length} file${list.length === 1 ? '' : 's'})`),
        ...cover.map(([k, label, n]) => h('option', { value: k, selected: k === showType }, `${label}: ${n ? `${n} example${n === 1 ? '' : 's'}` : 'none yet'}`)));
      typeSel.addEventListener('change', () => { showType = typeSel.value; if (showType) for (const c of L().CATEGORIES) if (c.role === 'example') openFolders.add(c.key); draw(); });
      const coverage = h('div', { class: 'lib-coverage' }, ui.field('Examples Draft with AI Can Use', typeSel));
      box.replaceChildren(coverage, ...L().CATEGORIES.map((cat) => {
        const rows = list.filter((i) => i.category === cat.key && (!showType || i.docType === showType));
        const open = openFolders.has(cat.key);
        return h('div', { class: `lib-group lib-folder${open ? ' open' : ''}` },
          h('button', { class: 'lib-folder-head', type: 'button', 'aria-expanded': String(open), title: cat.hint, onclick: () => { if (open) openFolders.delete(cat.key); else openFolders.add(cat.key); draw(); } },
            ui.icon(open ? 'folder2-open' : 'folder'), h('span', { class: 'lib-folder-name' }, cat.label), h('span', { class: 'muted small' }, `${rows.length} file${rows.length === 1 ? '' : 's'}`),
            h('span', { class: 'lib-folder-caret', 'aria-hidden': 'true' }, open ? '▾' : '▸')),
          !open ? '' : rows.length ? h('ul', { class: 'lib-rows' }, rows.map((it) => row(it, cat))) : h('p', { class: 'muted small lib-empty' }, showType ? 'None of this type here.' : cat.hint));
      }));
    }
    const fileIcon = (name) => (/\.pdf$/i.test(name) ? 'file-earmark-pdf' : /\.docx?$/i.test(name) ? 'file-earmark-word' : /\.(xlsx|csv)$/i.test(name) ? 'file-earmark-spreadsheet' : /\.(jpe?g|png)$/i.test(name) ? 'file-earmark-image' : 'file-earmark-text');

    function row(it, cat) {
      const type = h('select', { class: 'lib-type', 'aria-label': `What ${it.name} is`, title: 'What this is an example of. Draft with AI picks examples of the document type you are writing.' },
        L().DOC_TYPES.map(([k, label]) => h('option', { value: k, selected: k === it.docType }, label)));
      type.addEventListener('change', () => setMeta(it.path, { docType: type.value }).catch(() => {}));
      const always = h('input', { type: 'checkbox', checked: it.always });
      always.addEventListener('change', () => setMeta(it.path, { always: always.checked }).catch(() => {}));
      const move = h('select', { class: 'lib-move', 'aria-label': `Move ${it.name}`, title: 'Move to another part of the Library' },
        L().CATEGORIES.map((c) => h('option', { value: c.key, selected: c.key === cat.key }, c.label)));
      move.addEventListener('change', async () => {
        try {
          const to = await Save.track('library', () => Vault.moveLibraryFile(it.path, L().category(move.value).folder));
          await setMeta(to, { docType: it.docType, always: move.value === 'directives' ? true : it.always });
          draw();
        } catch { /* reported */ }
      });
      return h('li', { class: 'lib-row' },
        h('button', { class: 'lib-name lib-open', type: 'button', title: `Open ${it.name} as it was saved`, onclick: () => view(it) }, ui.icon(fileIcon(it.name)), h('span', {}, it.name.replace(/\.(md|txt)$/i, ''))), // v1.27: no .md
        cat.role === 'example' ? type : h('label', { class: 'check-row small', title: 'Send this directive with every Draft with AI.' }, always, h('span', {}, 'Always use')),
        move,
        h('button', { class: 'icon-btn', type: 'button', title: 'Show the text the AI reads from it', onclick: () => showText(it) }, ui.icon('eye'), h('span', { class: 'sr-only' }, `Show the text of ${it.name}`)),
        h('button', { class: 'icon-btn danger-icon', type: 'button', title: 'Delete from the Library', onclick: async () => {
          if (!(await ui.confirmDialog({ title: 'Delete from the Library?', message: `"${it.name}" will be deleted from CaseVault-Data\\library on the SSD.`, confirmText: 'Delete', danger: true }))) return;
          try { await Save.track('library', () => Vault.deleteLibraryFile(it.path)); draw(); } catch { /* reported */ }
        } }, ui.icon('trash3'), h('span', { class: 'sr-only' }, `Delete ${it.name}`)));
    }

    /** v1.188: the file as it was saved, in CaseVault's viewer: a PDF in the PDF viewer, Word as a
     * page, Markdown formatted. Settings opens again at the Library after. */
    async function view(it) {
      const inSettings = !!(document.querySelector('#dialog[open] .vault-panel'));
      await ui.previewFile({ readFile: () => Vault.readLibraryFile(it.path), where: 'library', formatted: true,
        pathText: `${Vault.root.name}\\library\\${it.path.split('/').join('\\')}` }, it.name);
      if (inSettings && ui.showVaultPanel) ui.showVaultPanel('library');
    }

    async function showText(it) {
      const pre = h('pre', { class: 'lib-text' }, 'Reading…');
      const d = ui.openDialog((close) => h('div', { class: 'lib-preview' },
        h('div', { class: 'preview-head' }, h('h2', {}, it.name), h('div', { class: 'spacer' }), h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Close')),
        h('p', { class: 'muted small explain' }, 'This is the text Draft with AI reads from this file, or its first part if it is long.'), pre));
      try { const t = await textOf(it.path); pre.textContent = t.trim() ? t : '(No text found. A scanned PDF needs OCR: open it once in a case, or save it as text.)'; } catch (err) { pre.textContent = `Could not read it: ${err.message}`; }
      await d;
    }

    draw();
    return h('section', { 'data-section': 'library' },
      h('h3', {}, 'Library'),
      h('p', { class: 'muted small explain' }, 'Sample reports and warrants the AI learns to write from (DEA-6, DEA-7, DEA-202…), and directives it follows. Draft with AI uses examples of the document type you are writing, and your "always use" directives. Examples teach the format and wording only: their names and facts are never used. Stored in CaseVault-Data\\library on the SSD; only the AI on this computer reads them.'),
      h('div', { class: 'row lib-add' }, h('span', { class: 'small' }, 'Add to'), target,
        h('button', { class: 'btn small', type: 'button', onclick: () => input.click() }, 'Add files…'),
        h('button', { class: 'btn small', type: 'button', onclick: () => folderInput.click() }, 'Add a folder…'), input, folderInput),
      box);
  }

  /* ---------------- Vault → AI writing behavior ---------------- */

  function behaviorSection() {
    const { h, toast, Save } = ui;
    const box = h('div', {});
    const settings = () => Vault.data.settings;
    const saveAll = (list, def) => Save.track('settings', () => Vault.updateSettings({ aiBehaviors: list, ...(def ? { aiBehaviorDefault: def } : {}) }));

    function draw(selectedId) {
      const list = L().behaviorsOf(settings());
      const def = L().defaultBehaviorId(settings());
      const pick = h('select', { 'aria-label': 'Behavior' }, list.map((b) => h('option', { value: b.id, selected: b.id === (selectedId || def) }, `${b.name}${b.id === def ? ' · Default' : ''}`)));
      const name = h('input', { maxlength: 80, 'aria-label': 'Name' });
      const prompt = h('textarea', { rows: 9, class: 'behavior-prompt', 'aria-label': 'Instruction prompt', spellcheck: 'true' });
      const load = () => { const b = list.find((x) => x.id === pick.value); name.value = b.name; prompt.value = b.prompt; restoreBtn.hidden = !b.builtin; delBtn.hidden = !!b.builtin; };
      const current = () => list.find((x) => x.id === pick.value);
      const restoreBtn = h('button', { class: 'btn small', type: 'button', icon: 'arrow-counterclockwise', title: 'Put this built-in behavior back to how CaseVault ships it.', onclick: async () => {
        const saved = (settings().aiBehaviors || []).filter((x) => x.id !== pick.value);
        try { await saveAll(saved); toast('Restored.', 'success'); draw(pick.value); } catch { /* reported */ }
      } }, 'Restore original');
      const delBtn = h('button', { class: 'btn small danger-ghost ghost', type: 'button', icon: 'trash3', onclick: async () => {
        const saved = (settings().aiBehaviors || []).filter((x) => x.id !== pick.value);
        try { await saveAll(saved, def === pick.value ? 'dea6' : null); draw(); } catch { /* reported */ }
      } }, 'Delete');
      pick.addEventListener('change', load);
      load();
      box.replaceChildren(
        h('div', { class: 'row' }, ui.field('Behavior', pick),
          h('button', { class: 'btn small', type: 'button', icon: 'plus-lg', onclick: async () => {
            const id = `custom-${Date.now().toString(36)}`;
            const saved = [...(settings().aiBehaviors || []), { id, name: 'My behavior', prompt: current().prompt }];
            try { await saveAll(saved); draw(id); } catch { /* reported */ }
          } }, 'New')),
        ui.field('Name', name),
        ui.field('Instruction prompt', prompt, '', 'How the AI writes.'),
        h('div', { class: 'row' },
          h('button', { class: 'btn small', type: 'button', icon: 'check2', title: 'Draft with AI starts with this behavior selected.', onclick: async () => {
            try { await saveAll(settings().aiBehaviors || [], pick.value); toast(`${current().name} is the default.`, 'success'); draw(pick.value); } catch { /* reported */ }
          } }, 'Make Default'),
          restoreBtn, delBtn, h('div', { class: 'spacer' }),
          h('button', { class: 'btn primary vault-save', type: 'button', icon: 'save', onclick: async () => {
            const b = current();
            const saved = (settings().aiBehaviors || []).filter((x) => x.id !== b.id);
            saved.push({ id: b.id, name: name.value.trim() || b.name, prompt: prompt.value });
            try { await saveAll(saved); toast('Behavior saved.', 'success'); draw(b.id); } catch { /* reported */ }
          } }, 'Save behavior')));
    }
    draw();
    return h('section', { 'data-section': 'behavior' },
      h('h3', {}, 'AI writing behavior'),
      h('p', { class: 'muted small explain' }, 'The instruction prompt that tells the AI how to write. DEA-6 style is the default; choose another in Draft with AI, edit these, or add your own. Saved in vault.json on the SSD.'),
      box);
  }

  function init(kit) { ui = kit; }

  root.CVLibraryUI = { init, items, texts, librarySection, behaviorSection, termsSection, languageSection, relevantFor, addFromReport, scrubScan };
})(this);
