/* CaseVault — the Narrative Helper (v1.186): write, paste and polish a narrative with the local AI
 * without opening a case first. A page of its own (#/narrative, the home page tile):
 *   Facts From a Case   optional: a case whose details, timeline, notes, arrest report and evidence
 *                       the AI may take facts from
 *   Facts and Notes     optional: facts typed or pasted here, used the same way
 *   Narrative           the text you write; Write a Draft and Ask AI to Edit work on it (the
 *                       selection, or all of it), and show their version first, with Undo
 * Open a Report brings in a report from the chosen case; Save to a Case saves the narrative in a
 * case's Reports (a new report, or over the one opened). Nothing is kept on this PC: the text stays
 * in this window's memory until it is saved to a case on the SSD, copied or the app is closed.
 */
'use strict';

(function (root) {
  let ui = null;
  const clean = (v) => String(v == null ? '' : v).trim();
  // What the page holds while the app is open (memory only, never on the PC's disk).
  const state = { caseId: '', notes: '', text: '', behavior: '', opened: null };

  const DRAFT_PROMPT = 'Write the narrative from the facts and notes: first person, past tense, in time order, with the date, time and place of each event. Use only the facts given.';
  const words = (t) => (clean(t).match(/\S+/g) || []).length;
  const openCases = () => (Vault.data.cases || []).filter((c) => !Vault.isArchived(c.id))
    .sort((a, b) => String(a.number || '').localeCompare(String(b.number || ''), undefined, { numeric: true }));
  const caseLabel = (c) => `${c.number || 'No case number'}${c.subject ? `, ${c.subject}` : ''}`;
  const caseOf = (id) => (id ? (Vault.data.cases || []).find((c) => c.id === id) || null : null);

  /** The page. */
  async function render(main) {
    const { h, toast, openDialog, confirmDialog } = ui;
    if (state.caseId && !caseOf(state.caseId)) state.caseId = '';
    const settings = Vault.data.settings;
    const behaviors = root.CVLibrary ? CVLibrary.behaviorsOf(settings) : [];
    if (!state.behavior) state.behavior = root.CVLibrary ? CVLibrary.defaultBehaviorId(settings) : '';

    const caseSel = h('select', { class: 'nh-case', 'aria-label': 'Facts from a case' },
      h('option', { value: '' }, 'No case: only the facts and notes below'),
      ...openCases().map((c) => h('option', { value: c.id, selected: c.id === state.caseId }, caseLabel(c))));
    const styleSel = h('select', { class: 'nh-style', 'aria-label': 'Writing style' },
      ...behaviors.map((b) => h('option', { value: b.id, selected: b.id === state.behavior }, b.name)));
    const notes = h('textarea', { class: 'nh-notes', rows: 6, 'aria-label': 'Facts and notes', placeholder: 'Optional. Paste or type the facts: who, what, when (date and time), where, amounts, weights, exhibit numbers. The AI takes facts only from here and the case you choose.' });
    notes.value = state.notes;
    const ta = h('textarea', { class: 'nh-text', rows: 20, 'aria-label': 'Narrative', spellcheck: 'true', placeholder: 'Write or paste the narrative here, or click Write a Draft.' });
    ta.value = state.text;
    const count = h('span', { class: 'nh-count muted small', 'aria-live': 'polite' });
    const openedLine = h('p', { class: 'nh-opened small muted' });
    const drawOpened = () => {
      const c = state.opened && caseOf(state.opened.caseId);
      openedLine.hidden = !c;
      openedLine.textContent = c ? `Opened from ${caseLabel(c)}: "${state.opened.title}". Save to a Case can save over it.` : '';
    };
    const sync = () => { state.text = ta.value; state.notes = notes.value; count.textContent = `${words(ta.value)} word${words(ta.value) === 1 ? '' : 's'}`; };
    ta.addEventListener('input', sync); notes.addEventListener('input', sync);
    caseSel.addEventListener('change', () => { state.caseId = caseSel.value; });
    styleSel.addEventListener('change', () => { state.behavior = styleSel.value; });
    sync(); drawOpened();

    const ask = (prompt) => CVAIEdit.open({ c: caseOf(state.caseId), target: CVAIEdit.editorTarget(ta), behaviorId: state.behavior, notes: notes.value, prompt });
    const writeDraft = () => {
      if (!clean(notes.value) && !state.caseId) { toast('Type the facts and notes first, or choose a case to take them from.', 'error'); notes.focus(); return undefined; }
      ta.setSelectionRange(ta.value.length, ta.value.length); // the whole narrative: Insert Below adds the draft after what is there
      return ask(DRAFT_PROMPT);
    };

    const copy = async () => {
      if (!clean(ta.value)) return toast('There is no narrative to copy yet.', 'info');
      try { await navigator.clipboard.writeText(ta.value); toast('The narrative is copied.', 'success'); }
      catch { ta.select(); toast('Press Ctrl+C to copy the selected narrative.', 'info'); }
      return undefined;
    };
    const clear = async () => {
      if (!clean(ta.value) && !clean(notes.value)) return;
      if (!(await confirmDialog({ title: 'Start Over?', message: 'This empties the narrative and the facts and notes. Anything not saved to a case is gone.', confirmText: 'Start Over', danger: true }))) return;
      Object.assign(state, { notes: '', text: '', opened: null });
      render(main);
    };

    /** Bring in a report from the chosen case. */
    const openReport = async () => {
      const c = caseOf(state.caseId);
      if (!c) { toast('Choose the case first, under Facts From a Case.', 'error'); caseSel.focus(); return; }
      const list = (await Vault.listDrafts(c.id).catch(() => [])).filter((d) => !d.fromLinkChart);
      if (!list.length) { toast(`${caseLabel(c)} has no reports yet.`, 'info'); return; }
      const slug = await openDialog((close) => h('div', { class: 'nh-open-form' },
        h('h2', { icon: 'journal-text' }, `Open a Report From ${c.number || 'the Case'}`),
        h('div', { class: 'nh-report-list', role: 'list' }, ...list.map((d) => h('button', { class: 'nh-report', role: 'listitem', type: 'button', onclick: () => close(d.slug) },
          h('strong', {}, d.title), h('span', { class: 'muted small' }, ` · ${ui.fmtDateTime ? ui.fmtDateTime(d.updated) : d.updated}`)))),
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'))));
      if (!slug) return;
      const d = await Vault.readDraft(c.id, slug);
      if (!d) { toast('That report is no longer there.', 'error'); return; }
      if (clean(ta.value) && !(await confirmDialog({ title: 'Replace the Narrative?', message: `The narrative here is replaced with "${d.meta.title}".`, confirmText: 'Open It' }))) return;
      ta.value = d.body; state.opened = { caseId: c.id, slug, title: d.meta.title, meta: d.meta };
      if (d.meta.behavior) { state.behavior = d.meta.behavior; styleSel.value = d.meta.behavior; }
      sync(); drawOpened();
    };

    /** Save the narrative in a case's Reports. */
    const save = async () => {
      if (!clean(ta.value)) { toast('There is no narrative to save yet.', 'info'); return; }
      const cases = openCases();
      if (!cases.length) { toast('There is no open case to save it to.', 'error'); return; }
      const got = await openDialog((close) => {
        const sel = h('select', { name: 'case', 'aria-label': 'Case', required: true },
          ...cases.map((c) => h('option', { value: c.id, selected: c.id === (state.opened ? state.opened.caseId : state.caseId) }, caseLabel(c))));
        const title = h('input', { name: 'title', maxlength: 120, required: true, 'aria-label': 'Report title', value: state.opened ? state.opened.title : 'Narrative' });
        const over = h('input', { type: 'checkbox', checked: !!state.opened });
        const overRow = h('label', { class: 'check nh-over' }, over, ` Save over "${state.opened ? state.opened.title : ''}"`);
        const drawOver = () => { overRow.hidden = !state.opened || sel.value !== state.opened.caseId; };
        sel.addEventListener('change', drawOver); drawOver();
        return h('form', { class: 'nh-save-form', onsubmit: (e) => { e.preventDefault(); if (clean(title.value)) close({ id: sel.value, title: clean(title.value), over: !overRow.hidden && over.checked }); } },
          h('h2', { icon: 'folder-plus' }, 'Save to a Case'),
          h('p', { class: 'muted small' }, 'The narrative is saved in the case\'s Reports, on the SSD.'),
          h('label', { class: 'field' }, h('span', {}, 'Case'), sel),
          h('label', { class: 'field' }, h('span', {}, 'Title'), title),
          overRow,
          h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'), h('button', { class: 'btn primary', type: 'submit' }, 'Save')));
      });
      if (!got) return;
      try {
        const slug = got.over ? state.opened.slug : await Vault.newDraftSlug(got.id, got.title);
        const meta = { ...(got.over ? state.opened.meta : { type: 'other' }), title: got.title, behavior: state.behavior || undefined };
        const saved = await Vault.saveDraft(got.id, slug, meta, ta.value);
        state.opened = { caseId: got.id, slug, title: got.title, meta: saved };
        drawOpened();
        const c = caseOf(got.id);
        const t = toast(`Saved in ${caseLabel(c)} → Reports as "${got.title}".`, 'success', 8000);
        if (t) {
          const go = h('button', { class: 'toast-undo', type: 'button' }, 'Open It');
          go.addEventListener('click', () => { t.remove(); ui.go(got.id, 'reports', slug); });
          t.append(' ', go);
        }
      } catch (err) { toast(`Could not save: ${err.message}`, 'error'); }
    };

    main.replaceChildren(h('div', { class: 'nh-page' },
      h('div', { class: 'nh-head' }, h('h1', { icon: 'journal-text' }, 'Narrative Helper')),
      h('p', { class: 'muted small nh-intro' }, 'Write or polish a narrative here without opening a case. The AI takes facts only from the case you choose and what you type under Facts and Notes, and marks anything else [CONFIRM: …]. Nothing is kept on this PC: save it to a case or copy it before you close CaseVault.'),
      h('div', { class: 'nh-options' },
        h('label', { class: 'field' }, h('span', {}, 'Facts From a Case'), caseSel),
        behaviors.length ? h('label', { class: 'field' }, h('span', {}, 'Writing Style'), styleSel) : ''),
      h('label', { class: 'field nh-notes-field' }, h('span', {}, 'Facts and Notes'), notes),
      h('div', { class: 'nh-text-head' }, h('h2', {}, 'Narrative'), count),
      openedLine,
      h('div', { class: 'nh-actions' },
        h('button', { class: 'btn primary nh-draft', type: 'button', icon: 'magic', title: 'The AI writes a narrative from the facts and notes (and the case, if you chose one). You see it first.', onclick: writeDraft }, 'Write a Draft'),
        h('button', { class: 'btn nh-edit', type: 'button', icon: 'chat-left-text', title: 'Tell the AI what to do with the selected text, or the whole narrative: "Make this more concise", "Fix the grammar only". You see its version first.', onclick: () => ask('') }, 'Ask AI to Edit'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn nh-open', type: 'button', icon: 'journal-text', title: 'Bring in a report from the case chosen above', onclick: openReport }, 'Open a Report'),
        h('button', { class: 'btn nh-copy', type: 'button', icon: 'clipboard2-check', onclick: copy }, 'Copy'),
        h('button', { class: 'btn nh-clear', type: 'button', icon: 'x-lg', onclick: clear }, 'Start Over'),
        h('button', { class: 'btn primary nh-save', type: 'button', icon: 'folder-plus', onclick: save }, 'Save to a Case')),
      ta));
  }

  function init(kit) { ui = kit; }
  root.CVNarrativeHelper = { init, render, DRAFT_PROMPT, words, _state: state };
})(this);
