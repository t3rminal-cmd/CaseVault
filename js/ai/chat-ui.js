/* CaseVault — Ask AI: a chat with the AI on this computer, offline, in a
 * floating box. It stays open while you move around CaseVault, so you can keep writing a draft or
 * notes next to it; "Insert" puts an answer where your cursor was.
 *
 * Pick a model and, optionally, a case to ask about. Until the first question, the case follows
 * the case you have open. The conversation stays in this window until you save it to a case (as a
 * draft) or start a new chat. See js/ai/chat.js.
 *
 * v1.18: every conversation is kept on the SSD (CaseVault-Data/chats) after each answer, so
 * History can open it again or delete it. Clear empties the one on screen and deletes its copy.
 */
'use strict';

(function (root) {
  let ui = null;
  const Engine = () => root.CVChecks.Engine;
  // This window only.
  const mem = { turns: [], caseId: '', searchFiles: false, model: '', open: false, size: 'normal' };
  let ctrl = null;
  let els = null; // the floating box, built once
  let lastEditor = null; // the notes/draft box you were typing in, for "Insert"

  const models = () => ((Engine().detected && Engine().detected.chat) || []).map((m) => m.name);
  const activeCases = () => (Vault.data.cases || []).filter((c) => c.status !== 'Archived').sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  const caseLabel = (c) => `${c.title || 'Untitled case'}${c.number ? ` · ${c.number}` : ''}`;

  // Remember the last text box you typed in outside the chat, so an answer can go there.
  function trackEditors() {
    document.addEventListener('focusin', (e) => {
      // The formatted view of a draft or the notes stands for its text box (v1.19).
      const richEl = e.target.closest && e.target.closest('.rich-editor');
      const t = richEl && richEl.cvRich ? richEl.cvRich.ta : e.target;
      if (!(t instanceof HTMLTextAreaElement) || t.readOnly || t.disabled) return;
      if (els && els.box.contains(t)) return;
      if (t.closest('dialog')) return;
      lastEditor = t;
    });
  }

  function insertIntoEditor(text) {
    const t = lastEditor;
    if (!t || !t.isConnected) { ui.toast('Click in a draft or your notes first, where the answer should go.', 'error', 5000); return; }
    if (t.cvRich && t.cvRich.active()) {
      t.cvRich.insertMarkdown(`${text.trim()}\n`);
      ui.toast('Inserted.', 'success', 1500);
      return;
    }
    const start = t.selectionStart ?? t.value.length;
    const end = t.selectionEnd ?? start;
    const before = t.value.slice(0, start);
    const piece = `${before && !before.endsWith('\n') ? '\n\n' : ''}${text.trim()}\n`;
    t.setRangeText(piece, start, end, 'end');
    // The editor saves on input, as when you type.
    t.dispatchEvent(new Event('input', { bubbles: true }));
    t.focus();
    ui.toast('Inserted.', 'success', 1500);
  }

  function build() {
    const { h } = ui;
    const modelSel = h('select', { 'aria-label': 'Model', title: 'The AI model on this computer that answers. Add models with Ollama; they show up here.' });
    modelSel.addEventListener('change', () => { mem.model = modelSel.value; ui.Save.track('settings', () => Vault.updateSettings({ chatModel: modelSel.value })).catch(() => {}); document.dispatchEvent(new Event('cv-model-changed')); });
    const caseSel = h('select', { 'aria-label': 'Case', title: 'Ask about a case: its details, contacts, timeline and notes go with each question.' });
    const searchFiles = h('input', { type: 'checkbox', checked: mem.searchFiles });
    const filesToggle = h('label', { class: 'check-row small', title: 'Also look through the case\'s documents for the passages that answer the question. Slower the first time a document is read.' }, searchFiles, h('span', {}, 'Search the case files'));
    const syncCase = () => { mem.caseId = caseSel.value; filesToggle.hidden = !caseSel.value || caseSel.value.startsWith('op:'); };
    caseSel.addEventListener('change', () => { syncCase(); mem.casePicked = true; });
    searchFiles.addEventListener('change', () => { mem.searchFiles = searchFiles.checked; });

    const thread = h('div', { class: 'chat-thread', 'aria-live': 'polite' });
    const input = h('textarea', { class: 'chat-input', rows: 3, spellcheck: 'true', placeholder: 'Ask anything. Enter sends · Shift+Enter: new line', 'aria-label': 'Your question' });
    const sendBtn = h('button', { class: 'btn primary chat-send', type: 'button', icon: 'send', title: 'Send (Enter)' }, 'Send');
    const stopBtn = h('button', { class: 'btn chat-send', type: 'button', icon: 'x-circle', hidden: true, title: 'Stop the answer; what is written so far is kept.' }, 'Stop');

    const iconBtn = (icon, label, onclick, extra = {}) => h('button', { class: 'icon-btn', type: 'button', title: label, onclick, ...extra }, ui.icon(icon), h('span', { class: 'sr-only' }, label));
    const sizeBtn = iconBtn('arrows-angle-expand', 'Bigger', () => setSize(mem.size === 'big' ? 'normal' : 'big'));
    const minBtn = iconBtn('dash-lg', 'Minimize: keep the chat, out of the way', () => setSize(mem.size === 'min' ? 'normal' : 'min'));
    const newBtn = iconBtn('plus-lg', 'New chat. The current one stays in History.', () => { if (ctrl) ctrl.abort(); startNew(); input.focus(); });
    const historyBtn = iconBtn('clock-history', 'History: open or delete earlier chats', () => showHistory());
    const clearBtn = iconBtn('fire', 'Clear this chat: empties it and deletes its saved copy', () => clearChat());
    const saveBtn = iconBtn('save', 'Save the conversation to a case as a draft, on the SSD.', () => saveToCase());
    const closeBtn = iconBtn('x-lg', 'Close. The conversation is kept until you start a new chat or close CaseVault.', () => toggle(false));
    const title = h('div', { class: 'chat-float-title' }, ui.icon('robot'), h('strong', {}, 'Ask AI'));
    const head = h('div', { class: 'chat-float-head', title: 'Drag to move' }, title, h('div', { class: 'spacer' }), newBtn, historyBtn, clearBtn, saveBtn, sizeBtn, minBtn, closeBtn);
    const box = h('section', { class: 'chat-float', id: 'chat-float', role: 'dialog', 'aria-label': 'Ask AI', hidden: true },
      head,
      h('div', { class: 'chat-float-body' },
        h('div', { class: 'chat-options' }, ui.field('Model', modelSel), ui.field('Case', caseSel), filesToggle),
        thread,
        h('div', { class: 'chat-composer' }, input, h('div', { class: 'chat-actions' }, sendBtn, stopBtn)),
        h('p', { class: 'chat-foot', title: 'Runs on this computer; nothing leaves it. Check answers against the case.' }, 'Local AI: nothing leaves this PC. Check answers.')));
    document.body.append(box);

    // Drag the box by its title bar. Where it goes is kept for this window only.
    head.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button') || mem.size === 'big') return;
      const r = box.getBoundingClientRect();
      const dx = e.clientX - r.left; const dy = e.clientY - r.top;
      head.setPointerCapture(e.pointerId);
      box.classList.add('moving');
      const move = (ev) => {
        const x = Math.max(4, Math.min(ev.clientX - dx, innerWidth - r.width - 4));
        const y = Math.max(4, Math.min(ev.clientY - dy, innerHeight - 40));
        mem.pos = { x, y };
        place();
      };
      const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); box.classList.remove('moving'); };
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
    });

    sendBtn.addEventListener('click', () => send());
    stopBtn.addEventListener('click', () => { if (ctrl) ctrl.abort(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); setSize('min'); } });

    els = { box, head, modelSel, caseSel, searchFiles, filesToggle, syncCase, thread, input, sendBtn, stopBtn, sizeBtn, minBtn };
    // Until you ask something (or pick a case yourself), the case follows the one you have open.
    root.addEventListener('hashchange', () => { if (mem.open) followOpenCase(); });
  }

  // Where you dragged the box (the CSP allows styles set from a script, not in the markup).
  function place() {
    if (!els) return;
    const { box } = els;
    if (mem.pos && mem.size !== 'big') {
      box.style.left = `${Math.round(Math.min(mem.pos.x, innerWidth - 120))}px`;
      box.style.top = `${Math.round(Math.min(mem.pos.y, innerHeight - 40))}px`;
      box.style.right = 'auto';
      box.style.bottom = 'auto';
    } else {
      box.style.left = ''; box.style.top = ''; box.style.right = ''; box.style.bottom = '';
    }
  }

  function setSize(size) {
    const { box, sizeBtn, minBtn } = els;
    // A size you set by dragging the corner is kept for "normal" and set aside for big/minimized.
    if (mem.size === 'normal') mem.userSize = { w: box.style.width, h: box.style.height };
    mem.size = size;
    box.style.width = size === 'normal' && mem.userSize ? mem.userSize.w : '';
    box.style.height = size === 'normal' && mem.userSize ? mem.userSize.h : '';
    box.classList.toggle('big', size === 'big');
    box.classList.toggle('min', size === 'min');
    sizeBtn.replaceChildren(ui.icon(size === 'big' ? 'arrows-angle-contract' : 'arrows-angle-expand'), ui.h('span', { class: 'sr-only' }, size === 'big' ? 'Smaller' : 'Bigger'));
    sizeBtn.title = size === 'big' ? 'Smaller' : 'Bigger';
    minBtn.title = size === 'min' ? 'Show the chat again' : 'Minimize: keep the chat, out of the way';
    place();
    if (size !== 'min') els.input.focus();
  }

  function followOpenCase() {
    if (!els || mem.turns.length || mem.casePicked) return;
    const open = ui.state.caseId && activeCases().some((c) => c.id === ui.state.caseId) ? ui.state.caseId : '';
    if (open && els.caseSel.value !== open) { els.caseSel.value = open; els.syncCase(); }
  }

  async function refreshOptions() {
    const { h } = ui;
    const { modelSel, caseSel } = els;
    await Engine().refresh().catch(() => {});
    const list = models();
    const choice = Engine().choice();
    const fallback = choice && choice.model;
    if (!mem.model || !list.includes(mem.model)) mem.model = (Vault.data.settings.chatModel && list.includes(Vault.data.settings.chatModel)) ? Vault.data.settings.chatModel : fallback || list[0] || '';
    modelSel.replaceChildren(...(list.length ? list.map((m) => h('option', { value: m, selected: m === mem.model }, CVAI.modelName(m))) : [h('option', { value: '' }, 'No AI engine found')]));
    const cases = activeCases();
    if (mem.caseId && !cases.some((c) => c.id === mem.caseId)) mem.caseId = '';
    // v1.184: a whole Mission too (every case number, its suspects' outcomes and buys).
    const ops = (Vault.listOperations ? Vault.listOperations() : []).filter((o) => o.status !== 'Closed' || mem.caseId === `op:${o.id}`);
    if (mem.caseId && mem.caseId.startsWith('op:') && !ops.some((o) => `op:${o.id}` === mem.caseId)) mem.caseId = '';
    caseSel.replaceChildren(h('option', { value: '' }, 'General Questions'),
      ...(ops.length ? [h('optgroup', { label: 'Missions' }, ops.map((o) => h('option', { value: `op:${o.id}`, selected: `op:${o.id}` === mem.caseId }, `Mission ${[o.number, o.name].filter(Boolean).join(' ')}`)))] : []),
      h('optgroup', { label: 'Cases' }, cases.map((c) => h('option', { value: c.id, selected: c.id === mem.caseId }, caseLabel(c)))));
    caseSel.value = mem.caseId;
    els.syncCase();
    followOpenCase();
  }

  function bubble(t) {
    const { h } = ui;
    const body = h('div', { class: 'chat-body' });
    if (t.role === 'user') body.textContent = t.content;
    else body.innerHTML = Markdown.render(t.content) || '';
    const tools = t.role === 'assistant' && t.content ? h('div', { class: 'chat-tools' },
      h('button', { class: 'icon-btn', type: 'button', title: 'Copy this answer', onclick: async () => { try { await navigator.clipboard.writeText(t.content); ui.toast('Copied.', 'success', 1500); } catch { ui.toast('Could not copy.', 'error'); } } }, ui.icon('copy'), h('span', { class: 'sr-only' }, 'Copy')),
      h('button', { class: 'icon-btn', type: 'button', title: 'Insert this answer where your cursor was in the draft or notes you were writing', onclick: () => insertIntoEditor(t.content) }, ui.icon('box-arrow-in-down-left'), h('span', { class: 'sr-only' }, 'Insert into your draft or notes'))) : null;
    return h('div', { class: `chat-msg ${t.role}` },
      h('span', { class: 'chat-avatar' }, ui.icon(t.role === 'user' ? 'person-circle' : 'robot')),
      h('div', { class: 'chat-content' }, body, t.error ? h('p', { class: 'error-text small' }, t.error) : null,
        // v1.182: what the answer says that the case material doesn't, to check.
        t.unsupported && t.unsupported.length ? h('p', { class: 'chat-unsupported small' }, ui.icon('exclamation-triangle-fill'), h('span', {}, 'Not in the case material, so check before relying on it: '),
          ...t.unsupported.flatMap((x, i) => [i ? ', ' : '', h('mark', { class: 'aie-new' }, x)])) : null,
        tools));
  }

  function empty() {
    const { h } = ui;
    return h('div', { class: 'chat-empty' },
      h('span', { class: 'chat-empty-icon' }, ui.icon('robot')),
      h('h2', {}, 'Ask the AI on this computer'),
      h('p', { class: 'muted small' }, 'Nothing leaves this PC. Keep working while it answers.'),
      h('div', { class: 'chat-starters' }, ['Summarize this case so far', 'What is still missing for the affidavit?', 'Make a timeline table of the key events', 'Explain possession vs. possession with intent'].map((q) =>
        h('button', { class: 'btn small', type: 'button', onclick: () => { els.input.value = q; els.input.focus(); } }, q))));
  }

  function draw() {
    const { thread } = els;
    thread.replaceChildren(...(mem.turns.length ? mem.turns.map(bubble) : [empty()]));
    thread.scrollTop = thread.scrollHeight;
  }

  async function send() {
    const { input, modelSel, caseSel, searchFiles, thread, sendBtn, stopBtn } = els;
    const { h } = ui;
    const q = input.value.trim();
    if (!q || ctrl) return;
    if (!modelSel.value) { ui.toast('No AI engine is running. Start Start-CaseVault.bat on the CV-AI drive, then try again.', 'error', 8000); return; }
    input.value = '';
    const history = mem.turns.filter((t) => !t.error && t.content).map((t) => ({ role: t.role, content: t.content }));
    mem.turns.push({ role: 'user', content: q });
    const answer = { role: 'assistant', content: '' };
    mem.turns.push(answer);
    draw();
    const answerEl = thread.lastElementChild.querySelector('.chat-body');
    answerEl.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Thinking…');
    ctrl = new AbortController();
    const my = ctrl;
    sendBtn.hidden = true; stopBtn.hidden = false;
    let pending = false;
    const paint = () => { pending = false; if (answerEl.isConnected) { answerEl.innerHTML = Markdown.render(answer.content); thread.scrollTop = thread.scrollHeight; } };
    try {
      const det = Engine().detected;
      // The context size that suits the chosen model's size (as Draft with AI's suggestions do).
      const numCtx = CVCopilot.numCtxForModel(det, modelSel.value);
      let material = ''; let glossary = '';
      if (caseSel.value.startsWith('op:')) {
        // v1.184: the whole Mission.
        const op = Vault.getOperation(caseSel.value.slice(3));
        const members = (Vault.data.cases || []).filter((c) => op && c.operationId === op.id && !Vault.isArchived(c.id));
        answerEl.textContent = `Reading ${members.length} case number${members.length === 1 ? '' : 's'}…`;
        const read = await Promise.all(members.map(async (m) => {
          const [caseObj, timeline, notes, arrest] = await Promise.all([Vault.getCase(m.id), Vault.getTimeline(m.id).catch(() => ({ events: [] })), Vault.getNotes(m.id).catch(() => ''), Vault.readCaseJSON(m.id, 'arrest.json').catch(() => null)]);
          const K = root.CVClosing;
          const arr = ((arrest && arrest.arrestees) || []).map((a) => K.normalizeArrestee(a)).filter((a) => K.arresteeName(a))
            .map((a) => `- ${K.arresteeName(a)}${a.date ? `, arrested ${a.date}` : ''}${K.chargesText(a.charges) ? `; charges: ${K.chargesText(a.charges)}` : ''}`).join('\n');
          return { caseObj, timeline, notes, arrest: arr, raw: arrest };
        }));
        const K = root.CVClosing;
        const seen = new Set(); const people = [];
        for (const x of read) for (const sx of x.caseObj.suspects || []) { const k = sx && !sx.notIdentified ? K.personKey(sx.name) : ''; if (k && !seen.has(k)) { seen.add(k); people.push(sx); } }
        const summary = K.outcomeSummary(K.suspectOutcomes(people, read.map((x) => x.raw))).text;
        const buys = root.CVHealth ? CVHealth.buysTable(read.flatMap((x) => (x.timeline.events || []).map((e) => ({ ...e, title: `${x.caseObj.number || ''} ${e.title || ''}` })))) : '';
        material = CVChat.missionMaterial({ title: op ? [op.number, op.name].filter(Boolean).join(' ') : '', summary, buys, cases: read }, Math.floor(numCtx * 3.5 * 0.55));
        glossary = root.CVTerms ? CVTerms.forText(material, q) : '';
      } else if (caseSel.value) {
        const entry = (Vault.data.cases || []).find((c) => c.id === caseSel.value);
        const [caseObj, timeline, notes] = await Promise.all([Vault.getCase(entry.id), Vault.getTimeline(entry.id), Vault.getNotes(entry.id)]);
        let passages = [];
        if (searchFiles.checked) {
          const files = (await Vault.listFiles(entry.id)).filter((f) => CVExtract.kindOf(f.name));
          const docs = [];
          for (const f of files) {
            if (my.signal.aborted) break;
            answerEl.textContent = `Reading ${f.base}…`;
            try { const d = await CVChecks.documentText(entry, f.name); docs.push({ name: f.base, docIndex: docs.length, paragraphs: d.paragraphs }); } catch (err) { if (FS.isDisconnectError(err)) throw err; }
          }
          answerEl.textContent = 'Finding the passages that answer it…';
          const hits = await CVCopilot.relevantPassages({ docs, query: q, engine: { base: det.base, embed: det.embed }, fetchImpl: Engine().fetchImpl(), k: 8 });
          passages = hits.map((p) => ({ ...p, docName: docs[p.doc].name }));
        }
        material = CVChat.caseMaterial({ caseObj, timeline, notes, passages }, Math.floor(numCtx * 3.5 * 0.45));
        glossary = root.CVTerms ? CVTerms.forText(material, q) : ''; // v1.183: Terminology (to the AI; not facts to check against)
      }
      // v1.183: the Library's directives and the example passages closest to the question (how to write, not facts).
      const library = root.CVLibraryUI ? await CVLibraryUI.relevantFor(q).catch(() => '') : '';
      const messages = CVChat.buildMessages({ history, question: q, material: [material, glossary, library].filter(Boolean).join('\n\n'), numCtx });
      if (CVActivity.heavyBusy()) answerEl.textContent = 'Waiting for the check or draft that is running…';
      await CVActivity.exclusive('chat', () => CVCopilot.streamChat({
        fetchImpl: Engine().fetchImpl(), base: det.base, model: modelSel.value, messages, signal: my.signal, numCtx,
        onText: (piece) => { answer.content += piece; if (!pending) { pending = true; requestAnimationFrame(paint); } },
      }), { label: 'Answering…', model: CVAI.modelName(modelSel.value) });
      paint();
      // v1.182: dates, times, amounts, weights and names in the answer that the case material doesn't have.
      if (material) answer.unsupported = CVCopilot.newFacts(answer.content, material, q, ...history.filter((t) => t.role === 'user').map((t) => t.content));
    } catch (err) {
      if (my.signal.aborted) { if (!answer.content) answer.content = '_Stopped._'; } else answer.error = FS.isDisconnectError(err) ? 'The SSD was disconnected.' : `Could not answer: ${err.message}`;
    } finally {
      ctrl = null;
      sendBtn.hidden = false; stopBtn.hidden = true;
      draw();
      keep();
      // Don't pull the cursor out of the draft you went back to while it answered.
      if (els.box.contains(document.activeElement) || document.activeElement === document.body) input.focus();
    }
  }

  /* ---- history on the SSD ---- */

  const newId = () => `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  function startNew() {
    mem.turns = []; mem.chatId = ''; mem.casePicked = false;
    followOpenCase();
    draw();
  }
  // Keep this conversation on the SSD (after each answer).
  function keep() {
    const turns = mem.turns.filter((t) => t.content && !t.error);
    if (!turns.length) return;
    if (!mem.chatId) mem.chatId = newId();
    const first = (turns.find((t) => t.role === 'user') || {}).content || 'Chat';
    ui.Save.track(`chat:${mem.chatId}`, () => Vault.saveChat({ id: mem.chatId, title: first.replace(/\s+/g, ' ').slice(0, 80), caseId: els.caseSel.value, model: els.modelSel.value, turns: turns.map((t) => ({ role: t.role, content: t.content })) })).catch(() => {});
  }
  async function clearChat() {
    if (!mem.turns.length) return;
    if (!(await ui.confirmDialog({ title: 'Clear this chat?', message: 'The conversation on screen is emptied and its saved copy is deleted from the SSD.', confirmText: 'Clear', danger: true }))) return;
    if (ctrl) ctrl.abort();
    const id = mem.chatId;
    startNew();
    if (id) { try { await Vault.deleteChat(id); } catch { /* already gone */ } }
    els.input.focus();
  }
  async function showHistory() {
    const { h } = ui;
    let list = [];
    try { list = await Vault.listChats(); } catch (err) { if (FS.isDisconnectError(err)) return ui.onDriveLost(); }
    const caseName = (id) => { const c = (Vault.data.cases || []).find((x) => x.id === id); return c ? c.title || c.number : ''; };
    await ui.openDialog((close) => {
      const body = h('div', { class: 'chat-history' });
      const draw = () => {
        body.replaceChildren(list.length ? h('ul', { class: 'plain-list chat-history-list' }, list.map((c) => h('li', {},
          h('button', { class: 'linkish chat-history-open', type: 'button', onclick: async () => {
            const chat = await Vault.readChat(c.id);
            if (!chat) return ui.toast('That chat is no longer on the SSD.', 'error');
            if (ctrl) ctrl.abort();
            mem.turns = (chat.turns || []).map((t) => ({ role: t.role, content: t.content }));
            mem.chatId = chat.id; mem.casePicked = true;
            if (chat.caseId && [...els.caseSel.options].some((o) => o.value === chat.caseId)) { els.caseSel.value = chat.caseId; els.syncCase(); }
            draw_(); close();
          } }, c.title),
          h('span', { class: 'muted small' }, [ui.fmtDateTime(Date.parse(c.updated)), `${c.turns} message${c.turns === 1 ? '' : 's'}`, caseName(c.caseId)].filter(Boolean).join(' · ')),
          h('button', { class: 'icon-btn danger-icon', type: 'button', title: 'Delete this chat from the SSD', onclick: async () => {
            try { await Vault.deleteChat(c.id); } catch { /* gone */ }
            if (mem.chatId === c.id) mem.chatId = '';
            list = list.filter((x) => x.id !== c.id); draw();
          } }, ui.icon('trash3'), h('span', { class: 'sr-only' }, 'Delete'))))) : h('p', { class: 'muted' }, 'No saved chats.'));
      };
      draw();
      return h('div', { class: 'chat-history-form' },
        h('h2', { icon: 'clock-history' }, 'Ask AI history'),
        h('p', { class: 'muted small' }, 'Kept on the SSD in CaseVault-Data\\chats. Open one to carry on, or delete it.'),
        body,
        h('div', { class: 'dialog-actions' },
          // Two clicks: the first asks, the second deletes (one dialog at a time in CaseVault).
          list.length ? h('button', { class: 'btn danger-ghost', type: 'button', onclick: async (e) => {
            const b = e.currentTarget;
            if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = `Click again to delete all ${list.length}`; return; }
            for (const c of list) { try { await Vault.deleteChat(c.id); } catch { /* gone */ } }
            mem.chatId = ''; list = []; draw(); b.remove();
            ui.toast('All saved chats deleted from the SSD.', 'success');
          } }, 'Delete all') : null,
          h('div', { class: 'spacer' }),
          h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done')));
    });
  }
  const draw_ = () => draw();

  async function saveToCase() {
    if (!mem.turns.some((t) => t.content)) return ui.toast('Nothing to save yet.', 'error');
    const v = els.caseSel.value;
    const opId = v.startsWith('op:') ? v.slice(3) : '';
    // v1.184: a Mission chosen: pick one of its case numbers to save it to.
    const id = (v && !opId ? v : '') || (await pickCaseId(opId ? activeCases().filter((c) => c.operationId === opId) : activeCases()));
    if (!id) return;
    const title = 'Ask AI';
    try {
      const slug = await Vault.newDraftSlug(id, title);
      await ui.Save.track(`draft:${id}:${slug}`, () => Vault.saveDraft(id, slug, { title, type: 'other', ai: true, created: new Date().toISOString() }, CVChat.transcript(mem.turns.filter((t) => t.content), { title, model: els.modelSel.value })));
      ui.toast(`Saved to the case as the draft "${title}".`, 'success', 5000);
    } catch { /* reported by Save */ }
  }

  async function pickCaseId(cases) {
    const { h } = ui;
    if (!cases.length) { ui.toast('Create a case first.', 'error'); return null; }
    const sel = h('select', { 'aria-label': 'Case' }, cases.map((c) => h('option', { value: c.id }, caseLabel(c))));
    return ui.openDialog((close) => h('form', { onsubmit: (e) => { e.preventDefault(); close(sel.value); } },
      h('h2', { icon: 'folder2-open' }, 'Save the chat to a case'), ui.field('Case', sel),
      CVKit.cancelRow(h, () => close(null), h('button', { class: 'btn primary', type: 'submit' }, 'Save'))));
  }

  /** Open (true), close (false) or switch the floating chat. */
  async function toggle(want) {
    if (!els) build();
    const open = want == null ? !mem.open || mem.size === 'min' : want;
    mem.open = open;
    els.box.hidden = !open;
    document.body.classList.toggle('chat-open', open);
    const btn = document.getElementById('btn-chat');
    if (btn) btn.setAttribute('aria-expanded', String(open));
    if (!open) return;
    if (mem.size === 'min') setSize('normal');
    place();
    if (!mem.turns.length) draw();
    els.input.focus();
    await refreshOptions();
  }

  /** The SSD was disconnected or the vault closed: hide the chat and forget the conversation. */
  function reset() {
    if (ctrl) ctrl.abort();
    mem.turns = []; mem.caseId = ''; mem.casePicked = false; mem.chatId = '';
    if (els) { els.box.hidden = true; draw(); }
    mem.open = false;
    document.body.classList.remove('chat-open');
  }

  function init(kit) { ui = kit; trackEditors(); }

  root.CVChatUI = { init, toggle, reset, isOpen: () => mem.open };
})(this);
