/* CaseVault — Ask AI to Edit (v1.181): a box to tell the local AI what to do with a narrative
 * ("make this more concise", "add the time and place of the March 14 buy", "grammar only"). It
 * works on the selection, or the whole narrative when nothing is selected, with the case's facts
 * (details, timeline, notes, arrest report, evidence) at hand. The answer is shown beside the text
 * first; nothing changes until Replace or Insert Below, and Undo puts the text back. Dates, times,
 * amounts, weights and names in the answer that the case doesn't have are marked to check.
 * Used by the Reports tab's editor (js/drafts/drafts-ui.js) and the Write Report tab's Summary of
 * Investigation (js/report-fields-ui.js). Quick prompts you add are kept in vault.json on the SSD.
 */
'use strict';

(function (root) {
  let ui = null;
  const Engine = () => CVChecks.Engine;
  const aiReady = () => Engine().status() === 'connected' && !!Engine().choice();
  const clean = (v) => String(v == null ? '' : v).trim();

  /** The case's facts for the AI: details, timeline and notes (as Ask AI has them), the arrest report and the evidence list. */
  async function material(c) {
    const [caseObj, timeline, notes, arrest, rf] = await Promise.all([
      Vault.getCase(c.id).catch(() => c), Vault.getTimeline(c.id).catch(() => ({ events: [] })), Vault.getNotes(c.id).catch(() => ''),
      Vault.readCaseJSON(c.id, 'arrest.json').catch(() => null), Vault.readCaseJSON(c.id, 'report-fields.json').catch(() => null),
    ]);
    const parts = [root.CVChat ? CVChat.caseMaterial({ caseObj, timeline, notes }, 6000) : ''];
    const K = root.CVClosing;
    const arrested = ((arrest && arrest.arrestees) || []).map((a) => K.normalizeArrestee(a)).filter((a) => K.arresteeName(a));
    if (arrested.length) {
      parts.push(`## Arrest report\n${arrested.map((a) => `- ${K.arresteeName(a)}${a.dob ? `, DOB ${a.dob}` : ''}: arrested${a.date ? ` ${a.date}` : ''}${a.time ? ` ${a.time}` : ''}${clean(a.location) ? ` at ${clean(a.location)}` : ''}${K.chargesText(a.charges) ? `; charges: ${K.chargesText(a.charges)}` : ''}`).join('\n')}`);
    }
    // The buys with what was bought and paid (the timeline lines above have only their titles).
    const buys = root.CVHealth ? CVHealth.buysTable((timeline && timeline.events) || []) : '';
    if (buys) parts.push(`## Buys\n${buys}`);
    const ev = root.CVHealth && rf && rf.evidence ? CVHealth.evidenceTable(rf.evidence) : '';
    if (ev) parts.push(`## Evidence\n${ev}`);
    return parts.filter(Boolean).join('\n\n');
  }
  /** v1.183: the material, with the Terminology terms it and the text use. */
  const withTerms = (material, ...more) => { const g = root.CVTerms ? CVTerms.forText(material, ...more) : ''; return g ? `${material}\n\n${g}` : material; };

  /** The quick prompts: the built-in ones, then yours (Vault settings aiEditPrompts). */
  const mine = () => (Array.isArray(Vault.data.settings.aiEditPrompts) ? Vault.data.settings.aiEditPrompts : []).filter((x) => x && clean(x.prompt));
  const quick = () => [...CVCopilot.EDIT_PROMPTS, ...mine().map((x, i) => ({ id: `mine-${i}`, label: clean(x.label) || clean(x.prompt).slice(0, 24), prompt: clean(x.prompt), mine: true }))];

  /**
   * An editor to act on: a textarea, with its formatted (rich) editor when it has one. -> { text,
   * whole, replace(md), insertBelow(md), undo() }. Taken when the box opens, so the selection is
   * the one made before.
   */
  function editorTarget(ta, rich) {
    const inRich = !!(rich && rich.active && rich.active());
    const s = ta.selectionStart; const e = ta.selectionEnd;
    const sel = inRich ? rich.selectionText() : ta.value.slice(s, e);
    const whole = !clean(sel);
    const before = ta.value;
    const changed = () => ta.dispatchEvent(new Event('input', { bubbles: true }));
    const setAll = (v) => { ta.value = v; changed(); };
    return {
      text: whole ? ta.value : sel,
      whole,
      replace(md) {
        if (whole) return setAll(md);
        if (inRich) { rich.replaceSelection(md); return undefined; }
        ta.focus(); ta.setRangeText(md, s, e, 'select'); changed();
        return undefined;
      },
      insertBelow(md) {
        if (whole) return setAll(`${ta.value.replace(/\s+$/, '')}\n\n${md}`);
        if (inRich) { rich.replaceSelection(`${sel}\n\n${md}`); return undefined; }
        ta.focus(); ta.setRangeText(`\n\n${md}`, e, e, 'end'); changed();
        return undefined;
      },
      undo() { setAll(before); },
    };
  }

  /** The Ask AI to Edit window. c: the case; target: editorTarget(); behaviorId: the writing behavior to follow. */
  async function open({ c, target, behaviorId = '' }) {
    const { h, openDialog, toast } = ui;
    const I = ui.icon;
    await Engine().refresh().catch(() => {});
    if (!aiReady()) return toast('The local AI engine is not connected. Start Start-CaseVault.bat on the CV-AI drive, then try again.', 'error', 8000);
    const facts = await material(c).catch(() => '');
    const settings = Vault.data.settings;
    const behavior = root.CVLibrary ? CVLibrary.behaviorById(settings, behaviorId || CVLibrary.defaultBehaviorId(settings)) : null;
    let ctrl = null;
    let result = '';
    const choice = await openDialog((close) => {
      const prompt = h('textarea', { rows: 3, maxlength: 1000, class: 'aie-prompt', 'aria-label': 'What should the AI do?', placeholder: target.whole
        ? 'What should the AI do with the narrative? For example: "Write a paragraph about the arrest from the arrest report", "Put the events in time order"'
        : 'What should the AI do with the selected text? For example: "Make this more concise", "Add the time and place of the March 14 buy"' });
      const chips = h('div', { class: 'aie-chips', role: 'group', 'aria-label': 'Quick prompts' });
      const drawChips = () => chips.replaceChildren(...quick().map((q) => h('span', { class: 'aie-chip-wrap' },
        h('button', { class: 'btn small aie-chip', type: 'button', title: q.prompt, onclick: () => { prompt.value = q.prompt; prompt.focus(); } }, q.label),
        q.mine ? h('button', { class: 'icon-btn aie-chip-del', type: 'button', title: `Remove "${q.label}"`, onclick: async () => {
          const list = mine().filter((x) => clean(x.prompt) !== q.prompt);
          await Vault.updateSettings({ aiEditPrompts: list }).catch((err) => toast(err.message, 'error'));
          drawChips();
        } }, I('x-lg'), h('span', { class: 'sr-only' }, `Remove ${q.label}`)) : '')),
      h('button', { class: 'btn small ghost aie-keep', type: 'button', title: 'Keep what is in the box as a quick prompt (saved on the SSD)', onclick: async () => {
        const p = clean(prompt.value);
        if (!p) return toast('Type the prompt to keep first.', 'error');
        if (quick().some((q) => q.prompt === p)) return toast('That prompt is already a button.', 'info');
        const label = p.length > 28 ? `${p.slice(0, 26).trim()}…` : p;
        await Vault.updateSettings({ aiEditPrompts: [...mine(), { label, prompt: p }] }).catch((err) => toast(err.message, 'error'));
        drawChips();
      } }, 'Keep as a Button'));
      drawChips();
      const now = h('div', { class: 'aie-in notes-preview' }, target.text.trim() || h('span', { class: 'muted' }, '(empty: the AI writes new text)'));
      const out = h('div', { class: 'aie-out notes-preview' }, h('span', { class: 'muted' }, 'The AI\'s version shows here.'));
      const flags = h('div', { class: 'aie-flags small', hidden: true, role: 'status' });
      const replaceBtn = h('button', { class: 'btn primary', type: 'button', disabled: true, onclick: () => close({ mode: 'replace', text: result }) }, target.whole ? 'Replace the Narrative' : 'Replace the Selection');
      const insertBtn = h('button', { class: 'btn', type: 'button', disabled: true, onclick: () => close({ mode: 'insert', text: result }) }, 'Insert Below');
      const runBtn = h('button', { class: 'btn primary aie-run', type: 'submit', icon: 'magic' }, 'Ask AI');
      const run = async () => {
        const instruction = clean(prompt.value);
        if (!instruction) { prompt.focus(); return; }
        if (ctrl) ctrl.abort();
        ctrl = new AbortController();
        const my = ctrl;
        result = '';
        replaceBtn.disabled = true; insertBtn.disabled = true; flags.hidden = true;
        out.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Writing…');
        const ch = Engine().choice(); const det = Engine().detected;
        const library = root.CVLibraryUI ? await CVLibraryUI.relevantFor(`${instruction} ${target.text}`).catch(() => '') : ''; // v1.183
        let raw = '';
        try {
          await CVActivity.exclusive('draft', () => CVCopilot.streamChat({
            fetchImpl: Engine().fetchImpl(), base: det.base, model: ch.model, signal: my.signal, numCtx: CVAI.numCtxFor(ch.profile),
            messages: CVCopilot.editMessages({ text: target.text, instruction, whole: target.whole, material: [withTerms(facts, target.text, instruction), library].filter(Boolean).join('\n\n'), behavior: behavior ? behavior.prompt : '' }),
            onText: (piece) => { raw += piece; out.textContent = raw; },
          }), { label: 'Editing…', model: CVAI.modelName(ch.model) });
        } catch (err) {
          if (!my.signal.aborted) out.textContent = `The AI could not finish: ${err.message}`;
          return;
        }
        if (my.signal.aborted) return;
        result = CVCopilot.cleanEdit(raw);
        out.textContent = result;
        const sources = [target.text, facts, instruction];
        const extra = CVCopilot.newFacts(result, ...sources);
        // v1.182: a second look at what the case doesn't have; what still isn't in it becomes [CONFIRM: …].
        let first = '';
        if (extra.length) {
          out.append(h('p', { class: 'muted small' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ` Checking ${extra.length} fact${extra.length === 1 ? '' : 's'} the case doesn't have…`));
          let fixed = '';
          try {
            await CVActivity.exclusive('draft', () => CVCopilot.streamChat({
              fetchImpl: Engine().fetchImpl(), base: det.base, model: ch.model, signal: my.signal, numCtx: CVAI.numCtxFor(ch.profile),
              messages: CVCopilot.fixFactsMessages({ text: result, facts: extra, material: sources.filter(Boolean).join('\n\n') }),
              onText: (piece) => { fixed += piece; },
            }), { label: 'Checking facts…', model: CVAI.modelName(ch.model) });
          } catch (err) { if (my.signal.aborted) return; fixed = ''; }
          if (my.signal.aborted) return;
          fixed = CVCopilot.cleanEdit(fixed);
          const left = fixed ? CVCopilot.newFacts(fixed, ...sources) : extra;
          first = result;
          result = CVCopilot.markUnsupported(fixed || result, left);
          out.textContent = result;
        }
        flags.hidden = !extra.length;
        const useFirst = first ? h('button', { class: 'btn small aie-first', type: 'button', title: 'Its version before the second look, with nothing marked', onclick: () => {
          result = first; out.textContent = result; useFirst.remove();
        } }, 'Use Its First Version') : '';
        flags.replaceChildren(I('exclamation-triangle-fill'), h('span', {}, 'Not in the case or your text, so it was checked again and what is still missing is now [CONFIRM: …]: '),
          ...extra.flatMap((x, i) => [i ? ', ' : '', h('mark', { class: 'aie-new' }, x)]), useFirst);
        replaceBtn.disabled = !result; insertBtn.disabled = !result;
      };
      return h('form', { class: 'aie-form', onsubmit: (e) => { e.preventDefault(); run(); } },
        h('h2', { icon: 'magic' }, 'Ask AI to Edit'),
        h('p', { class: 'muted small' }, target.whole
          ? 'Nothing is selected, so the AI works on the whole narrative. Select a sentence or paragraph first to work on just that.'
          : 'The AI works on the text you selected. It uses this case\'s details, timeline, notes, arrest report and evidence for any fact it adds, and writes [CONFIRM: …] when the case doesn\'t say.'),
        prompt, chips,
        h('div', { class: 'aie-run-row' }, runBtn),
        h('div', { class: 'rephrase-cols aie-cols' },
          h('div', {}, h('h3', {}, target.whole ? 'Now' : 'Selected'), now),
          h('div', {}, h('h3', {}, 'AI\'s Version'), out)),
        flags,
        h('p', { class: 'muted small' }, 'Nothing changes until you choose. Check every fact, number and name before you use it.'),
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'), insertBtn, replaceBtn));
    });
    if (ctrl) ctrl.abort();
    if (!choice || !choice.text) return;
    if (choice.mode === 'insert') target.insertBelow(choice.text); else target.replace(choice.text);
    const t = toast(choice.mode === 'insert' ? 'The AI\'s text was added.' : 'The AI\'s version is in.', 'success', 8000);
    if (t) {
      const undo = h('button', { class: 'toast-undo', type: 'button' }, 'Undo');
      undo.addEventListener('click', () => { t.remove(); target.undo(); toast('Undone: the text is back as it was.', 'success'); });
      t.append(' ', undo);
    }
  }

  function init(kit) { ui = kit; }
  root.CVAIEdit = { init, open, editorTarget, material };
})(this);
