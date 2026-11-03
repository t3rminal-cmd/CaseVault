/* CaseVault — the "Drafts" tab: draft editor with local-AI suggestions, "Draft with AI",
 * [CONFIRM: ...] checklist, templates, .docx export, and a one-click consistency check.
 *
 * Drafts are Markdown files in cases/<case-id>/drafts/ on the SSD (see draft-core.js). Every AI call
 * goes to the local Ollama engine only (see copilot.js); nothing typed here leaves the computer.
 * Uses the small UI kit app.js exposes as window.CaseVaultUI.
 */
'use strict';

(function (root) {
  let ui = null;
  let pendingGenerate = null; // { caseId, slug } -> open "Draft with AI" when that editor opens
  const AI_BANNER = 'AI-generated draft. Verify every fact against the source before signing or filing.';

  const Engine = () => CVChecks.Engine;
  const aiReady = () => Engine().status() === 'connected' && !!Engine().choice();

  /* =====================================================================
   * List + new draft
   * ===================================================================== */

  async function render(panel, c, token, sub) {
    if (sub) return renderEditor(panel, c, token, decodeURIComponent(sub));
    const { h, state, fmtDateTime, toast, go, Save, confirmDialog } = ui;
    // v1.171: the Timeline too, for New Report's "A Timeline Buy" (read with the rest, before anything is drawn).
    const [drafts, templates, notesText, timeline] = await Promise.all([Vault.listDrafts(c.id), Vault.listTemplates(), Vault.getNotes(c.id).catch(() => ''),
      Vault.getTimeline(c.id).catch((err) => { if (FS.isDisconnectError(err)) throw err; return null; })]);
    if (token !== state.renderToken) return;
    Engine().refresh().then(() => { if (token === state.renderToken) drawStart(); });

    const title = h('input', { maxlength: 150, 'aria-label': 'Report title' });
    // v1.54: New Report offers three types (reports made before keep theirs).
    const NEW_TYPES = [['summary', 'Case Summary'], ['affidavit', 'Affidavits'], ['other', 'Other']];
    const type = h('select', { 'aria-label': 'Document type' }, NEW_TYPES.map(([k, l]) => h('option', { value: k }, l)));
    const tplSelect = h('select', { 'aria-label': 'Template' }, templates.map((t) => h('option', { value: t.file }, t.title)));
    // Picking a template suggests the matching document type (affidavit, subpoena, ...).
    const guessType = () => {
      const name = `${tplSelect.value} ${(templates.find((t) => t.file === tplSelect.value) || {}).title || ''}`.toLowerCase();
      const hit = CVDraft.docTypeOf(name); // v1.48: "DEA 6 sample" is DEA Style
      if (NEW_TYPES.some(([k]) => k === hit)) type.value = hit;
    };
    tplSelect.addEventListener('change', guessType);
    // How to start: a dropdown (Blank, Template, Draft with AI). The template list shows under it
    // when Template is picked.
    // v1.171: a Buy or Surveillance narrative started from a Timeline buy (no AI): its date, time,
    // suspect, drug, amount and paid, and the evidence list's inventory numbers; the rest is [CONFIRM: …].
    const tlBuys = ((timeline && timeline.events) || []).filter((e) => e.kind === 'buy').sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`));
    const buyPick = h('select', { 'aria-label': 'Timeline buy' }, tlBuys.map((e, i) => h('option', { value: String(i) }, `Buy ${i + 1}: ${[e.date, e.suspect, root.CVOperation.buyLine(e)].filter(Boolean).join(' · ')}`)));
    const buyKind = h('select', { 'aria-label': 'Narrative' }, h('option', { value: 'buy' }, 'Buy Narrative'), h('option', { value: 'surveillance' }, 'Surveillance Narrative'));
    const buyRow = h('div', { class: 'start-buy', hidden: true }, buyPick, buyKind,
      h('span', { class: 'muted small block' }, 'Fills in what the Timeline and the evidence list know (date, suspect, drug, amount, paid, inventory numbers). The rest is marked [CONFIRM: …] to fill.'));
    const startSel = h('select', { 'aria-label': 'Start from' },
      h('option', { value: 'blank' }, 'Blank'), h('option', { value: 'template' }, 'Template'), h('option', { value: 'ai' }, 'Draft with AI'),
      tlBuys.length ? h('option', { value: 'buy' }, 'A Timeline Buy') : null);
    const aiNote = h('span', { class: 'muted small block' });
    const tplRow = h('div', { class: 'start-template', hidden: true }, templates.length
      ? tplSelect
      : h('span', { class: 'muted small block' }, 'No templates yet. Add or import one under Vault → Templates.'));
    const startBox = h('div', { class: 'start-box' }, startSel, tplRow, buyRow, aiNote);
    function drawStart() {
      const ready = aiReady();
      const aiOpt = startSel.querySelector('option[value="ai"]');
      aiOpt.disabled = !ready;
      if (!ready && startSel.value === 'ai') startSel.value = 'blank';
      tplRow.hidden = startSel.value !== 'template';
      buyRow.hidden = startSel.value !== 'buy';
      aiNote.hidden = startSel.value !== 'ai';
      aiNote.textContent = ready
        ? `Writes a first draft from this case's details, timeline, notes, report fields and attached documents, using ${CVChecks.profileLabel(Engine().choice())}.`
        : 'Draft with AI needs the local AI engine. Start Start-CaseVault.bat on the CV-AI drive.';
      if (startSel.value === 'template') guessType();
    }
    startSel.addEventListener('change', drawStart);
    drawStart();


    // New ▾ (v1.31): Notes opens the Field Notes; Report asks for a title, type and how to start.
    let closeNew = null;
    const create = h('button', { class: 'btn primary', type: 'submit' }, 'Create Report');
    create.addEventListener('click', async (e) => {
      e.preventDefault();
      if (closeNew) closeNew();
      const start = startSel.value;
      // v1.171: "Buy 2 Narrative" / "Surveillance 2 Narrative", so the Checks tab pairs them by number.
      const buyN = Number(buyPick.value) + 1;
      const name = title.value.trim() || (start === 'buy' ? `${buyKind.value === 'surveillance' ? 'Surveillance' : 'Buy'} ${buyN} Narrative` : CVDraft.DOC_TYPES[type.value].label);
      let body = `# ${name}\n\n`;
      try {
        if (start === 'buy') {
          let evidence = [];
          try { evidence = ((await Vault.readCaseJSON(c.id, 'report-fields.json')) || {}).evidence || []; } catch (err) { if (FS.isDisconnectError(err)) throw err; }
          body = CVDraftFacts.buySkeleton(tlBuys[buyN - 1], { kind: buyKind.value, evidence, title: name });
        }
        if (start === 'template') {
          if (!templates.length) return toast('Add a template first.', 'error');
          const tpl = await Vault.readTemplate(tplSelect.value);
          body = CVDraft.fillTemplate(tpl, CVDraft.templateContext(state.caseObj || c, new Date(), Vault.data.settings.affiant, await CVClosingUI.templateExtra(state.caseObj || c)));
        }
        if (start === 'ai') body = '';
        const slug = await Vault.newDraftSlug(c.id, name);
        const meta = { title: name, type: start === 'buy' ? 'other' : type.value, ai: false, created: new Date().toISOString(), ...(start === 'template' ? { template: tplSelect.value } : {}) };
        await Save.track(`draft:${c.id}:${slug}`, () => Vault.saveDraft(c.id, slug, meta, body));
        if (start === 'ai') pendingGenerate = { caseId: c.id, slug };
        go(c.id, 'reports', slug);
      } catch { /* reported by Save */ }
    });

    // Reports: every report of the case (v1.32: the Field Notes aren't listed here; they're in the
    // Notes button at the bottom right). No dates.
    const I = (n) => ui.icon(n);
    const archived = Vault.isArchived(c.id);
    // v1.40: view only. Clicking a report shows its PDF the way the Files tab shows one; the rows
    // can be dragged into your own order (kept in reports-order.json); a report sent from the Draft
    // tab can be sent back there to correct it.
    let order = null;
    try { order = await Vault.readCaseJSON(c.id, ORDER_FILE); } catch (err) { if (FS.isDisconnectError(err)) throw err; }
    if (token !== state.renderToken) return;
    const rows = CVDraft.orderReports(drafts, order && order.order);
    const saveOrder = async (slugs) => {
      try { await Save.track(`reports-order:${c.id}`, () => Vault.writeCaseJSON(c.id, ORDER_FILE, { order: slugs })); ui.refresh(); } catch { /* reported by Save */ }
    };
    const move = (d, to) => {
      const slugs = rows.map((x) => x.slug).filter((x) => x !== d.slug);
      slugs.splice(Math.max(0, Math.min(slugs.length, to)), 0, d.slug);
      return saveOrder(slugs);
    };
    const sendBackBtn = (d) => h('button', { class: 'icon-btn', type: 'button', title: 'Back to Write Report to correct it', onclick: async () => {
      try { if (await root.CVReportFieldsUI.sendBack(c, d.slug)) go(c.id, 'draft'); } catch { /* reported */ }
    } }, I('arrow-counterclockwise'), h('span', { class: 'sr-only' }, `Send ${d.title} back to the Write Report tab`));
    const fromDraft = (d) => d.fromFields && !!root.CVReportFieldsUI;
    // v1.34: the AI tag has its own column; each report has an icon, its type as a tag, and a bin.
    const list = h('table', { class: 'files drafts-table reports-table' },
      h('colgroup', {}, archived ? null : h('col', { class: 'col-grip' }), h('col', {}), h('col', { class: 'col-rtype' }), h('col', { class: 'col-ai' }), h('col', { class: 'col-ract' })),
      h('thead', {}, h('tr', {}, archived ? null : h('th', { class: 'grip-cell' }, h('span', { class: 'sr-only' }, 'Order')),
        h('th', {}, 'Report'), h('th', {}, 'Type'), h('th', { class: 'ai-col' }, 'AI'), h('th', {}, h('span', { class: 'sr-only' }, 'Actions')))),
      h('tbody', {}, rows.length ? rows.map((d, i) => {
        const grip = archived ? null : h('button', { class: 'grip-btn', type: 'button', 'aria-label': `Move ${d.title} (drag, or Alt+Up / Alt+Down)` }, I('grip-vertical'));
        const tr = h('tr', { 'data-slug': d.slug, draggable: archived ? null : 'true' },
          archived ? null : h('td', { class: 'grip-cell' }, grip),
          h('td', { class: 'report-name' }, h('button', { 'data-ro-ok': 'true', class: 'linkish report-open', type: 'button', onclick: () => viewReport(c, d) },
            h('span', { class: 'report-icon', 'aria-hidden': 'true' }, I(d.fromLinkChart ? 'diagram-3-fill' : d.fromFields ? 'clipboard2-check' : 'file-earmark-text')), h('span', { class: 'report-title' }, shortTitle(d)))),
          h('td', {}, h('span', { class: 'type-tag' }, (CVDraft.DOC_TYPES[d.type] || CVDraft.DOC_TYPES.other).label)),
          h('td', { class: 'ai-col' }, d.ai ? h('span', { class: 'layer-badge ai-badge' }, I('robot'), 'AI') : h('span', { class: 'muted', 'aria-label': 'No' }, '—')),
          h('td', { class: 'actions' },
            h('button', { 'data-ro-ok': 'true', class: 'icon-btn', type: 'button', title: 'View', onclick: () => viewReport(c, d) }, I('eye'), h('span', { class: 'sr-only' }, `View ${d.title}`)),
            archived ? null : h('button', { class: 'icon-btn', type: 'button', title: 'Send to Files', onclick: async () => {
              try { const path = await saveReportToFiles(c, d); toast(`Saved to Files: ${path.split('/').pop()}`, 'success', 5000); } catch (err) { if (!FS.isDisconnectError(err) && err.name === 'NotFoundError') toast(`Could not save ${d.title}: ${err.message}`, 'error'); }
            } }, I('folder-plus'), h('span', { class: 'sr-only' }, `Send ${d.title} to Files`)),
            archived ? null : d.fromLinkChart ? h('button', { class: 'icon-btn', type: 'button', title: 'Send Back to Link Chart to change it', onclick: async () => {
              if (await (await root.CVLazy.linkChart()).openFromFile(c, d.chartPath)) go(c.id, 'linkchart');
            } }, I('diagram-3-fill'), h('span', { class: 'sr-only' }, `Send ${d.title} back to the Link Chart tab`))
              : fromDraft(d) ? sendBackBtn(d)
              : h('a', { class: 'icon-btn', href: `#/case/${CVRoute.enc(c.id)}/reports/${CVRoute.enc(d.slug)}`, title: 'Edit (a report made with New Report)' }, I('pencil-square'), h('span', { class: 'sr-only' }, `Edit ${d.title}`)),
            archived ? null : h('button', { class: 'icon-btn danger-icon', type: 'button', title: `Delete ${d.title}`, onclick: async () => {
              if (!(await confirmDialog({ title: `Delete "${d.title}"?`, message: 'The report is permanently deleted from the SSD.', confirmText: 'Delete', danger: true }))) return;
              try {
                await Save.track(`draft-del:${c.id}:${d.slug}`, () => Vault.deleteDraft(c.id, d.slug)); ui.refresh();
                // v1.153: Undo brings the report back as it was.
                CVKit.undoToast(toast, h, `Deleted "${d.title}".`, async () => { await Save.track(`draft-undel:${c.id}:${d.slug}`, () => Vault.undeleteDraft(c.id, d.slug)); ui.refresh(); });
              } catch { /* reported */ }
            } }, I('trash3'), h('span', { class: 'sr-only' }, `Delete ${d.title}`))));
        if (!archived) {
          grip.addEventListener('keydown', (e) => {
            if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
            e.preventDefault();
            move(d, i + (e.key === 'ArrowUp' ? -1 : 1));
          });
          tr.addEventListener('dragstart', (e) => { e.dataTransfer.setData('application/x-casevault-report', d.slug); e.dataTransfer.effectAllowed = 'move'; tr.classList.add('dragging'); });
          tr.addEventListener('dragend', () => tr.classList.remove('dragging'));
          tr.addEventListener('dragover', (e) => {
            if (!e.dataTransfer.types.includes('application/x-casevault-report')) return;
            e.preventDefault();
            const r = tr.getBoundingClientRect();
            tr.classList.toggle('drop-before', e.clientY < r.top + r.height / 2);
            tr.classList.toggle('drop-after', e.clientY >= r.top + r.height / 2);
          });
          tr.addEventListener('dragleave', () => tr.classList.remove('drop-before', 'drop-after'));
          tr.addEventListener('drop', (e) => {
            const slug = e.dataTransfer.getData('application/x-casevault-report');
            const after = tr.classList.contains('drop-after');
            tr.classList.remove('drop-before', 'drop-after');
            const moving = rows.find((x) => x.slug === slug);
            if (!moving || moving === d) return;
            e.preventDefault();
            const rest = rows.filter((x) => x !== moving);
            move(moving, rest.indexOf(d) + (after ? 1 : 0));
          });
        }
        return tr;
      }) : [h('tr', {}, h('td', { colspan: archived ? 4 : 5, class: 'muted' }, 'No reports yet. Fill in the Write Report tab and click Save as Report, or use New Report.'))]));

    const newReport = () => ui.openDialog((close) => {
      closeNew = close;
      return h('form', { class: 'form-grid new-report-form', onsubmit: (e) => e.preventDefault() },
        h('h2', { class: 'span-2' }, 'New Report'),
        ui.field('Title', title), ui.field('Type', type),
        h('div', { class: 'field span-2' }, h('span', {}, 'Start from'), startBox),
        h('div', { class: 'dialog-actions span-2' }, h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'), create));
    }).then(() => { closeNew = null; });
    const newBtn = h('button', { class: 'btn small primary new-report-btn', type: 'button', icon: 'plus-lg', onclick: () => newReport() }, 'New Report');
    // Field Notes (v1.33): their own section at the top, always there; what you save in the notes
    // (here or in the Notes box) shows here.
    const notesPlain = String(notesText || '').replace(/\*\*|\+\+|__|[#>*_`]/g, '').replace(/\n{3,}/g, '\n\n').trim();
    const words = (notesPlain.match(/\S+/g) || []).length;
    const notesUrl = `#/case/${CVRoute.enc(c.id)}/reports/.notes`;
    // v1.34: Field Notes and Reports are two cards, each with an icon in its heading.
    const notesSection = h('section', { class: 'rpt-card notes-section' },
      h('div', { class: 'reports-head' }, h('span', { class: 'rpt-icon', 'aria-hidden': 'true' }, I('journal-text')), h('h2', { class: 'section-title' }, 'Field Notes'), h('div', { class: 'spacer' }),
        h('span', { class: 'count-pill' }, words ? `${words} word${words === 1 ? '' : 's'}` : 'Empty'),
        h('a', { class: 'btn small', href: notesUrl }, I('pencil-square'), archived ? ' Open' : ' Open and Edit')),
      h('a', { class: 'notes-card', href: notesUrl },
        notesPlain ? h('div', { class: 'notes-card-text' }, notesPlain.length > 900 ? `${notesPlain.slice(0, 900).replace(/\s+\S*$/, '')}…` : notesPlain)
          : h('div', { class: 'notes-empty' }, I('pencil'), h('span', {}, 'No field notes yet. Click here to write them; they save as you type.'))));
    panel.replaceChildren(
      notesSection,
      h('section', { class: 'rpt-card reports-section' },
        h('div', { class: 'reports-head' }, h('span', { class: 'rpt-icon', 'aria-hidden': 'true' }, I('files')), h('h2', { class: 'section-title' }, 'Reports'),
          h('span', { class: 'count-pill' }, String(drafts.length)), h('div', { class: 'spacer' }),
          // An archived case is read-only: its reports can be read and exported, not added to.
          archived ? null : newBtn),
        list),
      h('p', { class: 'muted small explain' }, `Every report, draft or AI draft for this case. Saved on the SSD in ${CVFormat.pathText(`${archived ? 'archive' : 'cases'}\\${c.id}`)}, in the drafts folder, as Markdown files. Templates live in CaseVault-Data | templates (Vault → Templates).`));
  }

  const ORDER_FILE = 'reports-order.json';
  const pdfOpts = (c, title) => {
    const p = Vault.data.settings.affiant || {};
    return { agency: p.agency || '', caseLabel: [c.title, c.number ? `Case ${c.number}` : ''].filter(Boolean).join(' \u00b7 '), printed: '', title: title || '' };
  };

  /** A report as its PDF, shown the way the Files tab shows a PDF (v1.40). Read only: a report sent
   * from the Write Report tab can be sent back there; one made with New Report can be opened to edit. */
  /** A report's PDF bytes: from its form when sent from the Write Report tab, else from its text. */
  async function reportPdfBytes(c, d) {
    const RFU = root.CVReportFieldsUI;
    let bytes = d.fromFields && RFU ? await RFU.sentPdf(c, d.slug) : null;
    // v1.59: a Link Chart's report shows the chart's own PDF from Files.
    if (!bytes && d.fromLinkChart && d.chartPath) {
      const f = await Vault.readFile(c.id, d.chartPath).catch(() => null);
      if (f) bytes = new Uint8Array(await f.arrayBuffer());
    }
    if (!bytes) {
      const r = await Vault.readDraft(c.id, d.slug);
      if (!r) throw Object.assign(new Error('the report is not on the SSD'), { name: 'NotFoundError' });
      bytes = CVDraftPdf.build(r.body, pdfOpts(c, d.title));
    }
    return bytes;
  }

  /** Saves a report's PDF in Files (v1.42), in place of the copy saved before. -> path */
  async function saveReportToFiles(c, d, bytes = null) {
    const b = bytes || await reportPdfBytes(c, d);
    const RFU = root.CVReportFieldsUI;
    if (d.fromFields && RFU) return (await RFU.savePdfToCase(c, null, b, d.title)).path;
    if (d.fromLinkChart) return ui.Save.track(`draft-pdf:${c.id}`, () => Vault.addFile(c.id, new File([b], (d.chartPath || '').split('/').pop() || `${FS.safeName(d.title || 'Link Chart')}.pdf`, { type: 'application/pdf' }), { folder: 'Link Charts', description: d.title, replace: true }));
    const what = `${d.type} ${d.title}`;
    const folder = /supplement/i.test(what) ? 'Supplementary Report' : /arrest/i.test(what) ? 'Arrest Report' : 'Case Report';
    const name = `${FS.safeName(d.title || 'Report')}.pdf`;
    return ui.Save.track(`draft-pdf:${c.id}`, () => Vault.addFile(c.id, new File([b], name, { type: 'application/pdf' }), { folder, description: d.title, replace: true }));
  }

  /** The name shown in the Reports list: "Purchase" for "Supplementary Report - Purchase", the
   * type being in its own column (v1.42). */
  const shortTitle = (d) => { const m = /^Supplementary Report\s+-\s+(.+)$/i.exec(d.title || ''); return m ? m[1] : d.title; };

  async function viewReport(c, d) {
    const { h, toast, go } = ui;
    const RFU = root.CVReportFieldsUI;
    let bytes = null;
    try {
      bytes = await reportPdfBytes(c, d);
    } catch (err) {
      if (FS.isDisconnectError(err) && err.name !== 'NotFoundError') return ui.onDriveLost();
      return toast(`Could not open ${d.title}: ${err.message}`, 'error');
    }
    const name = `${FS.safeName(d.title || 'Report')}.pdf`;
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const archived = Vault.isArchived(c.id);
    const I = (n) => ui.icon(n);
    await ui.openDialog((close) => h('div', { class: 'preview report-preview' },
      h('div', { class: 'preview-head' },
        h('h2', {}, d.title),
        h('span', { class: 'muted small', title: 'Reports are view only' }, I('lock-fill'), ' View only'),
        h('div', { class: 'spacer' }),
        archived ? null : d.fromLinkChart ? h('button', { class: 'btn primary', type: 'button', icon: 'diagram-3-fill', title: 'Put this chart back on the Link Chart tab to change it. Save PDF to Case there updates it here and in Files.', onclick: async () => {
          if (await (await root.CVLazy.linkChart()).openFromFile(c, d.chartPath)) { close(); go(c.id, 'linkchart'); }
        } }, 'Send Back to Link Chart')
          : d.fromFields && RFU
          ? h('button', { class: 'btn primary', type: 'button', icon: 'arrow-counterclockwise', title: 'Put this report back on the Write Report tab to correct it. Save as Report then updates it.', onclick: async () => {
            try { if (await RFU.sendBack(c, d.slug)) { close(); go(c.id, 'draft'); } } catch { /* reported */ }
          } }, 'Back to Write Report')
          : h('button', { class: 'btn', type: 'button', icon: 'pencil-square', title: 'Open this report in the editor', onclick: () => { close(); go(c.id, 'reports', d.slug); } }, 'Edit'),
        archived ? null : h('button', { class: 'btn', type: 'button', icon: 'folder-plus', onclick: async (e) => {
          const btn = e.currentTarget;
          try { const path = await saveReportToFiles(c, d, bytes); toast(`Saved to Files: ${path.split('/').pop()}`, 'success', 5000); btn.disabled = true; } catch { /* reported by Save */ }
        } }, 'Send to Files'),
        h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Close')),
      h('iframe', { class: 'preview-frame', src: url, title: name })));
    URL.revokeObjectURL(url);
  }

  /* =====================================================================
   * Editor
   * ===================================================================== */

  async function renderEditor(panel, c, token, slug) {
    const { h, state, toast, go, Save, confirmDialog } = ui;
    const draft = await Vault.readDraft(c.id, slug);
    if (token !== state.renderToken) return;
    const back = h('a', { href: `#/case/${CVRoute.enc(c.id)}/reports`, class: 'back-link' }, '← All reports');
    if (!draft) { panel.replaceChildren(back, h('p', { class: 'error-text' }, 'This draft no longer exists.')); return; }
    const meta = draft.meta;
    const saveKey = `draft:${c.id}:${slug}`;
    const save = (delay = 700) => {
      const body = ta.value;
      const m = { ...meta };
      Save.schedule(saveKey, async () => { Object.assign(meta, await Vault.saveDraft(c.id, slug, m, body)); }, delay);
    };

    // ---- header
    const banner = h('div', { class: 'ai-banner', role: 'note', hidden: !meta.ai }, ui.icon('exclamation-triangle-fill'), ' ', AI_BANNER);
    const titleInput = h('input', { class: 'draft-title', value: meta.title, maxlength: 150, 'aria-label': 'Draft title' });
    titleInput.addEventListener('input', () => { meta.title = titleInput.value.trim() || slug; save(); });
    const typeSelect = h('select', { 'aria-label': 'Document type' }, Object.entries(CVDraft.DOC_TYPES).map(([k, t]) => h('option', { value: k, selected: k === meta.type }, t.label)));
    typeSelect.addEventListener('change', () => { meta.type = typeSelect.value; checkBtn.hidden = meta.type !== 'affidavit'; save(0); });

    // ---- editor with the AI suggestion box
    const ta = h('textarea', { class: 'draft-editor', spellcheck: 'true', 'aria-label': 'Draft text', placeholder: 'Write here. [CONFIRM: …] marks facts to check.' });
    ta.value = draft.body;
    // The suggestion box floats just below the cursor line. It never takes focus: the cursor stays
    // in the text, Tab accepts and Esc dismisses. Screen readers hear the suggestion (aria-live).
    const suggContext = h('span', { class: 'sugg-context' });
    const suggText = h('mark', { class: 'sugg-text', title: 'Click to accept' });
    const suggBox = h('div', { class: 'sugg-box', hidden: true },
      h('div', { class: 'sugg-label', 'aria-hidden': 'true' }, 'AI suggestion'),
      h('div', { class: 'sugg-body', 'aria-live': 'polite' }, h('span', { class: 'sr-only' }, 'AI suggestion: '), suggContext, suggText),
      h('div', { class: 'sugg-foot', 'aria-hidden': 'true' }, h('kbd', {}, 'Tab'), ' to accept · ', h('kbd', {}, 'Esc'), ' to dismiss'));
    // Formatted view (bold shows bold, as in Word) over the Markdown text box (v1.19).
    const rich = CVRichEditor.create(ta, { h, icon: ui.icon, label: 'Draft text' });
    const wrap = h('div', { class: 'editor-wrap' }, rich.el, ta, suggBox);

    // v1.135: on or off for each PC; off to begin with on a PC without a graphics card for the AI.
    const HW = root.CVHardware;
    const suggestDefaultOff = () => !!HW && typeof HW.state.suggestions !== 'boolean' && HW.noGpu(HW.state);
    const suggestToggle = h('input', { type: 'checkbox', checked: HW ? HW.suggestionsOn(HW.state, Vault.data.settings.draftSuggestions) : Vault.data.settings.draftSuggestions !== false });
    const suggestNote = h('span', { class: 'muted small' });
    const suggestLabel = h('label', { class: 'check-row suggest-toggle', title: 'Suggestions as you type, in the Markdown view.' }, suggestToggle, h('span', {}, 'AI suggestions ', suggestNote));
    const suggestionsOn = () => suggestToggle.checked && !suggestToggle.disabled;
    function drawSuggestState() {
      const ready = aiReady() && !!CVCopilot.fastModel(Engine().detected);
      suggestToggle.disabled = !ready;
      suggestNote.textContent = !ready ? `(off: AI ${Engine().status() === 'rules-only' ? 'is Rules-only' : 'engine offline'})`
        : !suggestToggle.checked && suggestDefaultOff() ? '(off on this PC: no graphics card for the AI, so they would slow typing; tick to turn on)'
          : `(${CVCopilot.fastModel(Engine().detected)}, Tab accepts, Esc dismisses)`;
      if (!ready) ghost.stop();
    }
    suggestToggle.addEventListener('change', () => {
      if (HW) HW.setSuggestions(suggestToggle.checked);
      else Save.track('settings', () => Vault.updateSettings({ draftSuggestions: suggestToggle.checked })).catch(() => {});
      drawSuggestState();
      if (!suggestToggle.checked) ghost.stop();
    });

    const ghost = CVGhost.createGhost({
      delay: 700,
      // One shared queue: no suggestions while a check or "Draft with AI" is using the model.
      fetchSuggestion: async (before, signal) => {
        if (CVActivity.heavyBusy()) return '';
        const det = Engine().detected;
        const model = CVCopilot.fastModel(det);
        const task = CVActivity.begin('suggest', { label: 'Suggesting…', model });
        try {
          return await CVCopilot.suggest({
            fetchImpl: Engine().fetchImpl(), base: det.base, model, before, signal,
            numCtx: CVCopilot.numCtxForModel(det, model),
            caseInfo: { title: c.title, number: c.number, client: c.client },
          });
        } finally { task.end(); }
      },
      onChange: drawGhost,
    });

    // Where the cursor is, in pixels from the textarea's top-left corner (scrolling included):
    // a hidden copy of the textarea's text layout, without its scroll, measures the spot.
    const MEASURE_PROPS = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch', 'fontKerning',
      'fontFeatureSettings', 'letterSpacing', 'wordSpacing', 'lineHeight', 'textTransform', 'textIndent', 'textRendering', 'tabSize',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle', 'direction', 'wordBreak'];
    function caretCoords(pos) {
      const cs = getComputedStyle(ta);
      const m = document.createElement('div');
      for (const p of MEASURE_PROPS) m.style[p] = cs[p];
      Object.assign(m.style, {
        position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', overflow: 'hidden', height: 'auto',
        whiteSpace: 'pre-wrap', overflowWrap: 'break-word', boxSizing: 'content-box', borderColor: 'transparent',
        // Same text width as the textarea (clientWidth leaves out its scrollbar).
        width: `${ta.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)}px`,
      });
      m.textContent = ta.value.slice(0, pos);
      const marker = document.createElement('span');
      marker.textContent = '​';
      m.append(marker);
      document.body.append(m);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
      const out = {
        top: marker.offsetTop + parseFloat(cs.borderTopWidth) - ta.scrollTop,
        left: marker.offsetLeft + parseFloat(cs.borderLeftWidth) - ta.scrollLeft,
        height: lh,
      };
      m.remove();
      return out;
    }

    function drawGhost() {
      const g = ghost.ghost;
      if (!g || ghost.anchor < 0 || !ta.isConnected || wrap.hidden) { suggBox.hidden = true; return; }
      suggContext.textContent = CVGhost.sentencePrefix(ta.value, ghost.anchor);
      suggText.textContent = g;
      placeSuggestion();
    }

    function placeSuggestion() {
      if (!ghost.ghost || !ta.isConnected) { suggBox.hidden = true; return; }
      const caret = caretCoords(ghost.anchor);
      // The cursor line is scrolled out of the editor's view: hide the box until it's back.
      if (caret.top + caret.height < 0 || caret.top > ta.clientHeight) { suggBox.hidden = true; return; }
      suggBox.hidden = false;
      const taRect = ta.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      // Vertical: window coordinates, limited to what is visible of both the editor and the window.
      const place = CVGhost.boxPlacement({
        caretTop: taRect.top + caret.top,
        caretBottom: taRect.top + caret.top + caret.height,
        boxHeight: suggBox.offsetHeight,
        limitTop: Math.max(0, taRect.top),
        limitBottom: Math.min(window.innerHeight, taRect.bottom),
      });
      // Fixed size, lined up with the text's left edge: the box only moves down with the cursor
      // line and never changes size while you type (v1.11).
      const left = Math.max(0, taRect.left - wrapRect.left + (parseFloat(getComputedStyle(ta).paddingLeft) || 0) - 8);
      suggBox.style.top = `${Math.round(place.top - wrapRect.top)}px`;
      suggBox.style.left = `${Math.round(left)}px`;
      suggBox.classList.toggle('above', place.above);
    }

    function acceptSuggestion(r = ghost.key('Tab')) {
      if (!r || !r.accept) return;
      const pos = ta.selectionStart;
      ta.setRangeText(r.accept, pos, pos, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // Clicking the suggestion accepts it; mousedown is cancelled so the cursor stays in the text.
    suggBox.addEventListener('mousedown', (e) => e.preventDefault());
    suggText.addEventListener('click', () => { acceptSuggestion(); ta.focus(); });
    // Window resizes and page scrolling move the cursor line too (capture catches any scroller).
    const onResize = () => {
      if (!ta.isConnected) { window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onResize, true); return; }
      if (ghost.ghost) placeSuggestion();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);

    const tellGhost = () => ghost.update({ text: ta.value, cursor: ta.selectionStart, enabled: suggestionsOn() && ta.selectionStart === ta.selectionEnd && !ta.readOnly, focused: document.activeElement === ta });
    ta.addEventListener('input', () => { tellGhost(); save(); schedulePlaceholders(); });
    ta.addEventListener('click', tellGhost);
    ta.addEventListener('keyup', (e) => { if (/^(Arrow|Home|End|Page)/.test(e.key)) tellGhost(); });
    ta.addEventListener('scroll', () => { if (ghost.ghost) placeSuggestion(); });
    ta.addEventListener('blur', () => ghost.stop());
    // Runs before the formatting bar's Tab-to-indent (capture): when a suggestion is showing,
    // Tab takes it; otherwise Tab indents.
    ta.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' && e.key !== 'Escape') return;
      if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
      const r = ghost.key(e.key);
      if (!r) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      acceptSuggestion(r);
    }, true);

    // ---- [CONFIRM: ...] checklist
    const confirmList = h('ol', { class: 'confirm-list' });
    const confirmCount = h('span', { class: 'pill' }, '0');
    function drawPlaceholders() {
      const ph = CVDraft.extractPlaceholders(ta.value);
      confirmCount.textContent = String(ph.length);
      confirmCount.className = `pill ${ph.length ? 'status-pending' : 'status-closed'}`;
      confirmList.replaceChildren(...(ph.length ? ph.map((p) => h('li', {}, h('button', {
        'data-ro-ok': 'true', type: 'button', class: 'linkish', title: `Line ${p.line}`,
        onclick: () => {
          if (rich.active()) {
            // The nth time this exact placeholder appears, found in the formatted view.
            let nth = 0; let at = -1;
            while ((at = ta.value.indexOf(p.text, at + 1)) >= 0 && at < p.start) nth += 1;
            if (rich.selectText(p.text, nth)) return;
            rich.setMode('markdown');
          }
          ta.focus();
          ta.setSelectionRange(p.start, p.end);
          const lh = parseFloat(getComputedStyle(ta).lineHeight) || 22;
          ta.scrollTop = Math.max(0, (p.line - 4) * lh);
        },
      }, p.label), h('span', { class: 'muted small' }, ` line ${p.line}`))) : [h('li', { class: 'muted small none' }, 'Nothing left to confirm.')]));
    }
    let phTimer = null;
    const schedulePlaceholders = () => { clearTimeout(phTimer); phTimer = setTimeout(drawPlaceholders, 250); };
    drawPlaceholders();

    // ---- toolbar
    // v1.34: in this order, each with its icon: Word View, PDF View, Draft with AI, Re-phrase, Review, Export, Save, Delete.
    const wordViewBtn = h('button', { 'data-ro-ok': 'true', class: 'btn small', type: 'button', icon: 'file-earmark-word', title: 'Shows this report as the Word document Export makes. Save it to the case files or to this computer from there.', onclick: () => wordView() }, 'Word View');
    const genBtn = h('button', { class: 'btn small', type: 'button', icon: 'robot', onclick: () => openGenerate() }, 'Draft with AI');
    // PDF View (v1.31): the report as a PDF, in the Supplementary Report's style; save it from there.
    const pdfViewBtn = h('button', { 'data-ro-ok': 'true', class: 'btn small', type: 'button', icon: 'file-earmark-pdf', title: 'Shows this report as a PDF. Print it, download it, or save it to the case files.', onclick: () => pdfView() }, 'PDF View');
    // v1.181: tell the AI what to do with the selection (or the whole draft), with the case's facts.
    const askEditBtn = h('button', { class: 'btn small', type: 'button', icon: 'chat-left-text', title: 'Tell the AI what to do with the selected text, or the whole draft: "Make this more concise", "Add the time and place". You see its version first.', onclick: () => CVAIEdit.open({ c, target: CVAIEdit.editorTarget(ta, rich), behaviorId: meta.behavior }) }, 'Ask AI to Edit');
    const rephraseBtn = h('button', { class: 'btn small', type: 'button', icon: 'magic', title: 'Select text, then click: the AI rewrites it in report style. You approve the change.', onclick: () => rephrase() }, 'Re-phrase');
    const reviewBtn = h('button', { class: 'btn small', type: 'button', icon: 'clipboard2-check', title: 'Checks the totals, then the AI looks for names, dates and amounts that don\'t agree.', onclick: () => review() }, 'Review');
    const checkBtn = h('button', { class: 'btn small', type: 'button', hidden: meta.type !== 'affidavit', onclick: async () => {
      await Save.flushAll();
      CVChecks.checkDraft(c, { slug, title: meta.title, exclude: meta.exports || [] });
    } }, 'Run consistency check');
    // Export (v1.34): just the three choices. The report is saved as a Word document (.docx).
    const exportMenu = h('details', { class: 'menu export-menu' },
      h('summary', { class: 'btn small', title: 'Save this report as a Word document, or as a template' }, ui.icon('download'), ' Export ▾'),
      h('div', { class: 'menu-items' },
        h('button', { type: 'button', title: 'Saves it as a Word document in this case\'s Files', onclick: () => exportDocx('case') }, ui.icon('folder-plus'), ' Save to Case Files'),
        h('button', { 'data-ro-ok': 'true', type: 'button', title: 'Saves it as a Word document where you choose on this computer', onclick: () => exportDocx('download') }, ui.icon('pc-display'), ' Save to PC'),
        h('button', { type: 'button', title: 'Keeps this report\'s text as a template in Vault → Templates', onclick: saveAsTemplate }, ui.icon('bookmark-plus'), ' Save Template'),
        // v1.149: a good report teaches Draft with AI: names and numbers swapped for placeholders first.
        h('button', { 'data-ro-ok': 'true', type: 'button', class: 'use-example', title: 'Copies this report, anonymized, into the Library as an example for the AI', onclick: async () => {
          await Save.flushAll();
          await root.CVLibraryUI.addFromReport(c, titleInput.value || meta.title, ta.value, typeSelect.value || meta.type);
        } }, ui.icon('journal-bookmark'), ' Use as AI Example')));
    // Drafts save by themselves; Save (or Ctrl+S) writes now and says so.
    const saveBtn = h('button', { class: 'btn small primary', type: 'button', icon: 'floppy', title: 'Save now (Ctrl+S). Drafts also save by themselves.', onclick: async () => {
      save(0);
      await Save.flushAll();
      if (!Save.failed.has(saveKey)) toast(`Saved to the SSD (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}).`, 'success', 2500);
    } }, 'Save');
    // v1.153: the last 10 saved versions of this report (one every 10 minutes while it is edited):
    // view one, or put it back (the text now is kept as a version first).
    const versionsBtn = h('button', { 'data-ro-ok': 'true', class: 'btn small', type: 'button', icon: 'clock-history', title: 'Earlier versions of this report: view one or put it back', onclick: async () => {
      await Save.flushAll();
      const list = await Vault.listDraftVersions(c.id, slug).catch(() => []);
      const pick = await ui.openDialog((close) => {
        const view = h('pre', { class: 'ver-view muted' }, list.length ? 'Pick a version on the left to see it here.' : '');
        let chosen = null;
        const put = h('button', { class: 'btn primary', type: 'button', icon: 'arrow-counterclockwise', disabled: true, onclick: () => close(chosen) }, 'Put This Version Back');
        const rows = list.map((v) => h('button', { type: 'button', class: 'ver-row', onclick: async (e) => {
          chosen = v.name;
          for (const b of rows) b.classList.toggle('on', b === e.currentTarget);
          const r = await Vault.readDraftVersion(c.id, slug, v.name).catch(() => null);
          view.textContent = r ? r.body : 'This version could not be read.';
          put.disabled = Vault.isArchived(c.id) || fromDraft || !r;
        } }, h('strong', {}, new Date(Date.parse(v.at)).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })), h('span', { class: 'muted small' }, `${Math.max(1, Math.round(v.size / 1024))} KB`)));
        return h('div', { class: 'ver-dialog' },
          h('h2', { icon: 'clock-history' }, 'Earlier Versions'),
          h('p', { class: 'muted small' }, list.length ? 'CaseVault keeps the last 10 versions of a report: one every 10 minutes while you write, and one when it is deleted.' : 'No earlier versions yet. One is kept every 10 minutes while you write.'),
          list.length ? h('div', { class: 'ver-grid' }, h('div', { class: 'ver-list' }, rows), view) : null,
          CVKit.cancelRow(h, () => close(null), put));
      });
      if (!pick) return;
      try {
        await Save.track(`draft:${c.id}:${slug}`, () => Vault.restoreDraftVersion(c.id, slug, pick));
        toast('That version is back. The text from before is kept under Versions.', 'success', 5000);
        go(c.id, 'reports', slug);
        ui.refresh();
      } catch (err) { toast(`Not put back: ${err.message}`, 'error'); }
    } }, 'Versions');
    const delBtn = h('button', { class: 'btn small danger-ghost', type: 'button', icon: 'trash3', title: 'Delete this report from the SSD', onclick: async () => {
      if (!(await confirmDialog({ title: `Delete "${meta.title}"?`, message: 'The draft is permanently deleted from the SSD.', confirmText: 'Delete', danger: true }))) return;
      const t = Save.timers.get(saveKey);
      if (t) { clearTimeout(t.timer); Save.timers.delete(saveKey); }
      try {
        await Save.track(`draft-del:${c.id}:${slug}`, () => Vault.deleteDraft(c.id, slug)); go(c.id, 'reports');
        CVKit.undoToast(toast, h, `Deleted "${meta.title}".`, async () => { await Save.track(`draft-undel:${c.id}:${slug}`, () => Vault.undeleteDraft(c.id, slug)); go(c.id, 'reports', slug); });
      } catch { /* reported */ }
    } }, 'Delete');

    const genStatus = h('div', { class: 'gen-status', hidden: true });
    const fmtBar = CVFormatBar.attach(ta, { h, icon: ui.icon, rich });
    // AI suggestions follow the cursor in the Markdown text, so they run in that view.
    const drawSuggestMode = (m) => { suggestLabel.hidden = m === 'rich'; if (m === 'rich') ghost.stop(); };

    // v1.39: a report sent from the Write Report tab is view-only here; Back to Write Report puts its form
    // back on the Write Report tab for revisions (and the next Save as Report updates this report).
    const RFU0 = root.CVReportFieldsUI;
    const fromDraft = !!meta.fromFields && !!RFU0;
    if (fromDraft) { ta.readOnly = true; titleInput.readOnly = true; typeSelect.disabled = true; }
    const sendBackBtn = fromDraft && !Vault.isArchived(c.id) ? h('button', { class: 'btn small primary', type: 'button', icon: 'arrow-counterclockwise', title: 'Put this report back on the Write Report tab to revise it. Save as Report then updates this report and its PDF.', onclick: async () => {
      try { if (await RFU0.sendBack(c, slug)) go(c.id, 'draft'); } catch { /* reported */ }
    } }, 'Back to Write Report') : null;
    panel.replaceChildren(
      back,
      banner,
      fromDraft ? h('p', { class: 'view-only-note' }, ui.icon('lock-fill'), ' View only: this report was sent from the Write Report tab. To revise it, click Back to Write Report.') : '',
      h('div', { class: 'draft-head' }, titleInput, typeSelect),
      h('div', { class: 'draft-actions-bar' }, wordViewBtn, pdfViewBtn, ...(fromDraft ? [] : [genBtn, askEditBtn, rephraseBtn, reviewBtn]), checkBtn, exportMenu, h('div', { class: 'spacer' }), fromDraft ? sendBackBtn || '' : saveBtn, versionsBtn, delBtn),
      h('div', { class: 'toolbar draft-toolbar', hidden: fromDraft },
        fmtBar,
        suggestLabel),
      genStatus,
      h('div', { class: 'draft-grid' },
        h('div', { class: 'draft-main' }, wrap),
        h('aside', { class: 'confirm-panel' },
          h('h3', {}, 'To confirm ', confirmCount),
          h('p', { class: 'muted small explain' }, 'Every [CONFIRM: ...] in the draft. Click one to jump to it, then replace it with the checked fact.'),
          confirmList,
          // v1.170: the case's facts to write from, and the draft checked against them as you write.
          root.CVDraftFacts ? CVDraftFacts.attach({ c, slug, meta, ta, rich, ui }).el : '')));
    drawSuggestState();
    rich.onMode(drawSuggestMode);
    drawSuggestMode(rich.mode());
    Engine().refresh().then(() => { if (ta.isConnected) drawSuggestState(); });

    /* ---- export ---- */

    function docxName() {
      return `${FS.safeName(meta.title || slug).replace(/\.docx$/i, '')}.docx`;
    }

    // v1.183: a report that started as an AI draft, exported: your final version can teach the AI
    // (Use as AI Example, anonymized). Asked once per report.
    function offerAsExample() {
      if (!meta.ai || meta.exampleOffered || !root.CVLibraryUI) return;
      meta.exampleOffered = true;
      save(0);
      setTimeout(async () => {
        const yes = await ui.confirmDialog({ title: 'Teach the AI with your final version?', message: 'This report started as an AI draft. Your finished version, with names, numbers and addresses swapped for placeholders, can go in the Library as an example, so Draft with AI writes more like you.', confirmText: 'Use as AI Example', cancelText: 'Not This One' });
        if (yes) await root.CVLibraryUI.addFromReport(c, titleInput.value || meta.title, ta.value, typeSelect.value || meta.type);
      }, 600);
    }

    async function exportDocx(where) {
      exportMenu.open = false;
      await ui.Save.flushAll();
      // v1.169: check before export: the draft against the case's documents.
      if (root.CVChecks && CVChecks.confirmExport && !(await CVChecks.confirmExport(c, { slug, title: meta.title, text: ta.value, exclude: meta.exports || [] }))) return;
      const bytes = CVDocx.buildDocx(ta.value, { title: meta.title });
      const type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      offerAsExample();
      if (where === 'case') {
        try {
          // Filed by the case's naming convention. Affidavits go with their warrants (v1.15):
          // Warrant Drafts\2026-00123 Warrant Draft - Affidavit - <title>.docx
          const folder = { affidavit: 'Warrant Drafts', subpoena: 'Subpoena Drafts', summary: 'Case Report', dea6: 'Case Report' }[meta.type] || 'Other';
          const title = (meta.title || '').trim();
          const description = meta.type === 'affidavit' ? `Affidavit${title && !/^affidavit$/i.test(title) ? ` - ${title.replace(/^affidavit\s*[-:]\s*/i, '')}` : ''}`
            : folder === 'Other' || !/^(affidavit|case report)$/i.test(title) ? title : '';
          const name = await Save.track(`file:${c.id}:${docxName()}`, () => Vault.addFile(c.id, new File([bytes], docxName(), { type }), { folder, description }));
          // Remember exports so the draft's consistency check never compares the draft with its own copy.
          meta.exports = [...new Set([...(meta.exports || []), name])];
          save(0);
          toast(`Saved to this case's Files as ${CVFormat.pathText(name)}.`, 'success');
        } catch { /* reported by Save */ }
        return;
      }
      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({ suggestedName: docxName(), types: [{ description: 'Word document', accept: { [type]: ['.docx'] } }] });
          const w = await handle.createWritable();
          await w.write(bytes);
          await w.close();
          toast(`Saved ${handle.name}.`, 'success');
        } catch (err) { if (err.name !== 'AbortError') toast(`Could not save: ${err.message}`, 'error'); }
        return;
      }
      // Firefox: the browser's own download / save dialog.
      const url = URL.createObjectURL(new Blob([bytes], { type }));
      const a = h('a', { href: url, download: docxName(), hidden: true });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    /* ---- Draft with AI ---- */

    let genCtrl = null;
    const stopOnLeave = () => { if (genCtrl) genCtrl.abort(); window.removeEventListener('hashchange', stopOnLeave); };
    window.addEventListener('hashchange', stopOnLeave);

    // Every installed chat model is under 5B parameters.
    function onlySmallModels() {
      const det = Engine().detected;
      const chat = (det && det.chat) || [];
      return chat.length > 0 && chat.every((m) => m.size != null && m.size < 5);
    }

    // Export → Save as a template: this report's text becomes a template in Vault → Templates.
    async function saveAsTemplate() {
      exportMenu.open = false;
      const name = await ui.openDialog((close) => {
        const inp = h('input', { type: 'text', value: meta.title, maxlength: 80, autofocus: true });
        return h('form', { onsubmit: (e) => { e.preventDefault(); close(inp.value.trim()); } },
          h('h2', {}, 'Save as a template'),
          h('p', { class: 'muted small' }, 'Replace this case\'s details with {{placeholders}} afterwards in Vault → Templates (for example {{case.number}}), or use Options → Dev Tools to make it fictitious first.'),
          ui.field('Template name', inp),
          CVKit.cancelRow(h, () => close(null), h('button', { class: 'btn primary', type: 'submit' }, 'Save template')));
      });
      if (!name) return;
      const file = `${name.replace(/\.md$/i, '')}.md`;
      try { await Save.track(`template:${file}`, () => Vault.saveTemplate(file, ta.value)); toast(`Saved as the template "${name}".`, 'success'); } catch { /* reported by Save */ }
    }

    // Re-phrase: the selection rewritten the DEA way; shown side by side before it replaces anything.
    async function rephrase() {
      const inRich = rich.active();
      const s = ta.selectionStart; const e = ta.selectionEnd;
      const text = (inRich ? rich.selectionText() : ta.value.slice(s, e)).trim();
      if (!text) return toast('Select the sentence or paragraph to re-phrase first.', 'error');
      await Engine().refresh();
      if (!aiReady()) return toast('The local AI engine is not connected. Start Start-CaseVault.bat on the CV-AI drive, then try again.', 'error', 8000);
      const choice = Engine().choice(); const det = Engine().detected;
      const ctrl = new AbortController();
      const out = h('div', { class: 'rephrase-out notes-preview' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Re-phrasing…');
      let result = '';
      const use = h('button', { class: 'btn primary', type: 'button', disabled: true }, 'Replace the selection');
      const done = ui.openDialog((close) => {
        use.addEventListener('click', () => close(result.trim()));
        return h('div', { class: 'rephrase-form' },
          h('h2', { icon: 'magic' }, 'Re-phrase to DEA standards'),
          h('div', { class: 'rephrase-cols' },
            h('div', {}, h('h3', {}, 'Now'), h('div', { class: 'rephrase-in notes-preview' }, text)),
            h('div', {}, h('h3', {}, 'Re-phrased'), out)),
          h('p', { class: 'muted small' }, 'Check that every fact, number and name is unchanged before you use it.'),
          h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => { ctrl.abort(); close(null); } }, 'Cancel'), use));
      });
      CVActivity.exclusive('draft', () => CVCopilot.streamChat({
        fetchImpl: Engine().fetchImpl(), base: det.base, model: choice.model, signal: ctrl.signal, numCtx: CVAI.numCtxFor(choice.profile),
        messages: CVCopilot.rephraseMessages(text, CVLibrary.behaviorById(Vault.data.settings, meta.behavior || CVLibrary.defaultBehaviorId(Vault.data.settings)).prompt),
        onText: (piece) => { result += piece; out.textContent = result; },
      }), { label: 'Re-phrasing…', model: CVAI.modelName(choice.model) })
        .then(() => { use.disabled = !result.trim(); })
        .catch((err) => { if (!ctrl.signal.aborted) out.textContent = `Could not re-phrase: ${err.message}`; });
      const chosen = await done;
      ctrl.abort();
      if (!chosen) return;
      if (inRich) { rich.replaceSelection(chosen); return; }
      ta.focus();
      ta.setRangeText(chosen, s, e, 'select');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Review: the arithmetic check at once, then the AI's consistency review (added when the
    // local AI is found; the window doesn't wait for it).
    async function review() {
      save(0);
      const math = CVReview.check(ta.value);
      const mathText = CVReview.describe(math);
      const aiBox = h('div', { class: 'review-ai notes-preview' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Looking for the local AI…');
      const ctrl = new AbortController();
      const dlg = ui.openDialog((close) => h('div', { class: 'review-report' },
        h('h2', { icon: 'clipboard2-check' }, 'Review'),
        h('h3', {}, 'Totals'),
        h('div', { class: `review-math ${math.issues.length ? 'warn' : 'ok'}` }, ...mathText.split('\n').map((l) => h('p', {}, (math.issues.length ? '⚠ ' : '✓ ') + l))),
        // v1.183: the required elements of the kind of warrant or subpoena chosen in Draft with AI.
        ...(meta.warrantType && CVLibrary.warrantType(meta.warrantType) ? [h('h3', {}, `Required Elements: ${CVLibrary.warrantType(meta.warrantType).label}`),
          h('ul', { class: 'review-elements plain-list' }, CVLibrary.elementCheck(ta.value, meta.warrantType).map((e) => h('li', { class: e.found ? 'ok-text' : 'warn-text' }, `${e.found ? '✓' : '⚠ Not found:'} ${e.label}`))),
          h('p', { class: 'muted small' }, 'Looks for the usual words only; it can\'t tell whether an element is enough.')] : []),
        h('h3', {}, 'Consistency - Local AI'),
        aiBox,
        h('p', { class: 'muted small' }, 'AI reviews can miss things or be wrong. Read the report yourself too.'),
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => { ctrl.abort(); close(); } }, 'Done'))));
      (async () => {
        await Engine().refresh().catch(() => {});
        if (ctrl.signal.aborted) return;
        if (!aiReady()) { aiBox.replaceChildren('The local AI engine is not connected, so only the totals were checked.'); return; }
        const choice = Engine().choice(); const det = Engine().detected;
        const caseObj = await Vault.getCase(c.id);
        const facts = [`Title: ${caseObj.title || ''}`, `Case number: ${caseObj.number || ''}`, caseObj.agencyNumber ? `Federal jacket number: ${caseObj.agencyNumber}` : '', ...CVCopilot.contactLines(caseObj.contacts)].filter(Boolean).join('\n');
        let result = '';
        aiBox.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Reading the report…');
        await CVActivity.exclusive('draft', () => CVCopilot.streamChat({
          fetchImpl: Engine().fetchImpl(), base: det.base, model: choice.model, signal: ctrl.signal, numCtx: CVAI.numCtxFor(choice.profile),
          messages: CVCopilot.reviewMessages(ta.value, { facts, math: mathText }),
          onText: (piece) => { result += piece; aiBox.innerHTML = Markdown.render(result); },
        }), { label: 'Reviewing…', model: CVAI.modelName(choice.model) });
      })().catch((err) => { if (!ctrl.signal.aborted) aiBox.textContent = `Could not finish the review: ${err.message}`; });
      await dlg;
      ctrl.abort();
    }

    async function pdfView() {
      save(0);
      await ui.Save.flushAll();
      // v1.169: check before export: the draft against the case's documents.
      if (root.CVChecks && CVChecks.confirmExport && !(await CVChecks.confirmExport(c, { slug, title: meta.title, text: ta.value, exclude: meta.exports || [] }))) return;
      const p = Vault.data.settings.affiant || {};
      const name = `${(meta.title || 'Report').replace(/[\\/:*?"<>|]/g, '')}.pdf`;
      const opts = { agency: p.agency || '', caseLabel: [c.title, c.number ? `Case ${c.number}` : ''].filter(Boolean).join(' \u00b7 '), printed: '', title: meta.title || '' };
      // The report made from the Write Report tab, unchanged here: the same PDF as the Write Report tab's (v1.32).
      const RFU = root.CVReportFieldsUI;
      // (Only the report the form now goes to: one sent before a Clear All prints from its text.)
      // v1.40: every report sent from the Write Report tab (not just the latest) prints from its form.
      const sent = RFU && meta.fromFields ? await RFU.sentPdf(c, slug).catch(() => null) : null;
      const linked = !!sent;
      const bytes = sent || CVDraftPdf.build(ta.value, opts);
      const viewer = CVPdfViewer.create(bytes, { h, icon: ui.icon, title: meta.title || 'Report', fileName: name });
      const folder = /supplement/i.test(`${meta.type} ${meta.title}`) ? 'Supplementary Report' : /arrest/i.test(`${meta.type} ${meta.title}`) ? 'Arrest Report' : 'Case Report';
      const saveCase = Vault.isArchived(c.id) ? null : h('button', { class: 'btn', type: 'button', title: `Saves the PDF in this case's ${folder} folder.`, onclick: async () => {
        try {
          const path = linked
            ? (await RFU.savePdfToCase(c, null, bytes, meta.title || RFU.titleOf(slug))).path
            : await ui.Save.track(`draft-pdf:${c.id}`, () => Vault.addFile(c.id, new File([bytes], name, { type: 'application/pdf' }), { folder, description: name.replace(/\.pdf$/, ''), replace: true }));
          toast(`Saved to the case files: ${path.split('/').pop()}`, 'success', 5000);
          saveCase.disabled = true;
        } catch { /* reported by Save */ }
      } }, 'Save PDF to Case');
      await ui.openDialog((close) => h('div', { class: 'pdf-view' },
        h('h2', {}, meta.title || 'Report'),
        viewer,
        h('div', { class: 'dialog-actions' }, saveCase, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
      viewer.destroy();
    }

    // Word View (v1.34): the Word document Export makes, shown read-only, with the same saves.
    async function wordView() {
      save(0);
      await ui.Save.flushAll();
      // v1.169: check before export: the draft against the case's documents.
      if (root.CVChecks && CVChecks.confirmExport && !(await CVChecks.confirmExport(c, { slug, title: meta.title, text: ta.value, exclude: meta.exports || [] }))) return;
      const bytes = CVDocx.buildDocx(ta.value, { title: meta.title });
      const page = h('div', { class: 'docx-page' }, h('p', { class: 'muted' }, 'Making the Word document…'));
      try {
        const xml = await CVExtract.unzipEntry(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), 'word/document.xml');
        const numbering = await CVExtract.unzipEntry(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), 'word/numbering.xml').catch(() => null);
        const blocks = CVDocxView.parse(xml || '', numbering || '');
        page.replaceChildren(...(blocks.length ? [CVDocxView.render(blocks)] : [h('p', { class: 'muted' }, 'This report has no text yet.')]));
      } catch (err) { page.replaceChildren(h('p', { class: 'error-text' }, `Could not show the Word document: ${err.message}`)); }
      const toCase = Vault.isArchived(c.id) ? null : h('button', { class: 'btn', type: 'button', icon: 'folder-plus', onclick: async () => { await exportDocx('case'); toCase.disabled = true; } }, 'Save to Case Files');
      await ui.openDialog((close) => h('div', { class: 'word-view' },
        h('h2', { icon: 'file-earmark-word' }, meta.title || 'Report'),
        h('p', { class: 'muted small' }, 'The Word document, read-only. Fonts and spacing are simplified here; it opens in Word as usual.'),
        h('div', { class: 'docx-preview word-view-page' }, page),
        h('div', { class: 'dialog-actions' }, toCase, h('button', { 'data-ro-ok': 'true', class: 'btn', type: 'button', icon: 'pc-display', onclick: () => exportDocx('download') }, 'Save to PC'), h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
    }

    async function openGenerate() {
      await Engine().refresh();
      if (!aiReady()) return toast('The local AI engine is not connected. Start Start-CaseVault.bat on the CV-AI drive, then try again.', 'error', 8000);
      const [files, templates, library] = await Promise.all([Vault.listFiles(c.id), Vault.listTemplates(), CVLibraryUI.items().catch(() => [])]);
      const docs = files.filter((f) => CVExtract.kindOf(f.name));
      const settings = Vault.data.settings;
      const behaviors = CVLibrary.behaviorsOf(settings);
      const opts = await ui.openDialog((close) => {
        const type = h('select', {}, Object.entries(CVDraft.DOC_TYPES).map(([k, t]) => h('option', { value: k, selected: k === meta.type }, t.label)));
        const tpl = h('select', {}, h('option', { value: '' }, 'None: the standard structure'),
          templates.map((t) => h('option', { value: t.file, selected: t.file === meta.template }, t.title)));
        const useTimeline = h('input', { type: 'checkbox', checked: true });
        const useNotes = h('input', { type: 'checkbox', checked: true });
        const docBoxes = docs.map((f) => h('input', { type: 'checkbox', value: f.name, checked: true }));
        const instr = h('textarea', { rows: 3, placeholder: 'Optional: "Formal tone", "Focus on March 14"' });
        const behavior = h('select', {}, behaviors.map((b) => h('option', { value: b.id, selected: b.id === (meta.behavior || CVLibrary.defaultBehaviorId(settings)) }, b.name)));
        // Library: examples of the chosen document type are ticked, and the "always use" directives.
        const libBox = h('div', { class: 'check-reports lib-pick' });
        const libChecks = [];
        const drawLibrary = () => {
          const pick = CVLibrary.pickForDraft(library, type.value);
          const on = new Set([...pick.examples, ...pick.directives]);
          libChecks.length = 0;
          const group = (label, list) => (list.length ? [h('span', { class: 'small muted lib-pick-head' }, label), list.map((it) => {
            const box = h('input', { type: 'checkbox', value: it.path, checked: on.has(it.path) });
            libChecks.push(box);
            return h('label', { class: 'check-row', title: it.path }, box, h('span', {}, it.name, it.docType && it.docType !== 'any' ? h('span', { class: 'muted small' }, ` · ${(CVLibrary.DOC_TYPES.find((d) => d[0] === it.docType) || [])[1] || ''}`) : null));
          })] : []);
          const ex = library.filter((i) => (CVLibrary.category(i.category) || {}).role === 'example');
          const dir = library.filter((i) => i.category === 'directives');
          libBox.replaceChildren(...(library.length ? [...group('Examples to write like', ex), ...group('Directives to follow', dir)]
            : [h('p', { class: 'muted small' }, 'The Library is empty. Add sample reports (DEA-6, DEA-7, DEA-202), warrants and directives in Vault → Library.')]).flat(Infinity));
        };
        type.addEventListener('change', drawLibrary);
        drawLibrary();
        const useValues = h('input', { type: 'checkbox', checked: /drug|narcotic|cocaine|heroin|fentanyl|meth|cannabis/i.test(`${c.title} ${(c.tags || []).join(' ')}`) });
        const useCodes = h('input', { type: 'checkbox' });
        // Off by default: the draft starts straight with the summary.
        const useHeader = h('input', { type: 'checkbox' });
        // v1.182: one part at a time (on by default with a small model), and a second look at the facts.
        const small = CVCopilot.isSmallModel(Engine().detected, (Engine().choice() || {}).model);
        const bySection = h('input', { type: 'checkbox', checked: small, 'aria-label': 'One part at a time' });
        const factCheck = h('input', { type: 'checkbox', checked: true, 'aria-label': 'Check its facts afterwards' });
        const sectionRow = h('label', { class: 'check-row', title: 'Each part (for a DEA-6: Synopsis, Details, Indexing) is written on its own, knowing what is already written. Slower, but small models write much better this way.' }, bySection, h('span', {}, 'Write one part at a time (better with small models)'));
        const showSections = () => { sectionRow.hidden = !CVCopilot.sectionPlan(type.value); };
        type.addEventListener('change', showSections);
        showSections();
        // v1.183: the kind of warrant or subpoena: its approved language (Language Bank) and its required elements.
        const kindSel = h('select', { 'aria-label': 'Kind of warrant or subpoena' });
        const kindRow = ui.field('Kind', kindSel, '', 'Uses your approved paragraphs for this kind (Vault → Language Bank) and checks the draft for its required elements.');
        const drawKinds = () => {
          const list = CVLibrary.typesFor(type.value);
          kindSel.replaceChildren(h('option', { value: '' }, 'Not set'), ...list.map((t) => h('option', { value: t.key, selected: t.key === meta.warrantType }, t.label)));
          kindRow.hidden = !list.length;
        };
        type.addEventListener('change', drawKinds);
        drawKinds();
        const replace = h('input', { type: 'radio', name: 'gen-mode', value: 'replace', checked: !ta.value.trim() });
        const append = h('input', { type: 'radio', name: 'gen-mode', value: 'append', checked: !!ta.value.trim() });
        return h('form', { class: 'gen-form', onsubmit: (e) => {
          e.preventDefault();
          close({ type: type.value, template: tpl.value, timeline: useTimeline.checked, notes: useNotes.checked, docs: docBoxes.filter((b) => b.checked).map((b) => b.value), instructions: instr.value.trim(), mode: replace.checked ? 'replace' : 'append',
            behavior: behavior.value, library: libChecks.filter((b) => b.checked).map((b) => b.value), values: useValues.checked, codes: useCodes.checked, header: useHeader.checked,
            sections: bySection.checked && !!CVCopilot.sectionPlan(type.value), factCheck: factCheck.checked, warrantType: kindRow.hidden ? '' : kindSel.value });
        } },
        h('h2', {}, 'Draft with AI'),
        h('p', { class: 'muted small' }, `Uses ${CVChecks.profileLabel(Engine().choice())} on this computer. The AI is told to use only this case's material and to write [CONFIRM: ...] for anything missing.`),
        onlySmallModels() ? h('p', { class: 'warn-text small small-model-note' }, 'Small model: fine for suggestions, weak for full drafts. Install qwen2.5:7b for better drafts.') : null,
        h('div', { class: 'form-grid' }, ui.field('Document type', type), ui.field('Template', tpl), kindRow),
        h('div', { class: 'field' }, h('span', {}, 'Use'),
          h('div', { class: 'check-reports' },
            h('label', { class: 'check-row' }, h('input', { type: 'checkbox', checked: true, disabled: true }), h('span', {}, 'Case details')),
            h('label', { class: 'check-row' }, useTimeline, h('span', {}, 'Timeline')),
            h('label', { class: 'check-row' }, useNotes, h('span', {}, 'Notes')),
            docBoxes.map((b) => h('label', { class: 'check-row' }, b, h('span', {}, b.value))),
            docs.length ? null : h('p', { class: 'muted small' }, 'No attached documents to draw on.'))),
        h('div', { class: 'field' }, h('span', {}, 'Header'),
          h('label', { class: 'check-row', title: 'Off: the draft starts straight with the summary.' }, useHeader, h('span', {}, 'Start with a header block: case officer, ASA/AUSA, file, case and agency numbers, date'))),
        h('div', { class: 'field' }, h('span', {}, 'Accuracy'),
          h('div', { class: 'check-reports' }, sectionRow,
            h('label', { class: 'check-row', title: 'Afterwards, dates, times, amounts, weights and names that the case doesn\'t have are looked at again; what still isn\'t in the case becomes [CONFIRM: …].' }, factCheck, h('span', {}, 'Check its facts afterwards, and mark what the case doesn\'t have [CONFIRM: …]')))),
        ui.field('Writing behavior', behavior),
        h('div', { class: 'field' }, h('span', { title: 'How to write, never facts: names and events in the examples belong to other cases.' }, 'Library'), libBox),
        h('div', { class: 'field' }, h('span', {}, 'Reference'),
          h('div', { class: 'check-reports' },
            h('label', { class: 'check-row' }, useValues, h('span', {}, 'Narcotics street values')),
            h('label', { class: 'check-row' }, useCodes, h('span', {}, 'Incident location and UCR codes')))),
        ui.field('Instructions', instr),
        ta.value.trim() ? h('div', { class: 'row' }, h('label', { class: 'check-row' }, replace, h('span', {}, 'Replace the current text')), h('label', { class: 'check-row' }, append, h('span', {}, 'Add below the current text'))) : null,
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit' }, 'Generate')));
      });
      if (opts) generate(opts);
    }

    async function generate(opts) {
      const choice = Engine().choice();
      const det = Engine().detected;
      ghost.stop();
      genCtrl = new AbortController();
      const ctrl = genCtrl;
      const stop = h('button', { class: 'btn small', type: 'button', onclick: () => ctrl.abort() }, 'Stop');
      const msg = h('span', {}, 'Gathering the case material…');
      genStatus.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), msg, h('div', { class: 'spacer' }), stop);
      genStatus.hidden = false;
      ta.readOnly = true;
      genBtn.disabled = true;
      const start = opts.mode === 'append' ? `${ta.value.replace(/\s+$/, '')}\n\n` : '';
      let text = '';
      let checked = null; // v1.182: the second pass, when it ran
      const show = () => { if (ta.isConnected) { ta.value = start + text; ta.scrollTop = ta.scrollHeight; } };
      const saveNow = (delay) => {
        const m = { ...meta };
        const body = start + text;
        Save.schedule(saveKey, async () => { Object.assign(meta, await Vault.saveDraft(c.id, slug, m, body)); }, delay);
      };
      try {
        const [caseObj, timeline, notes] = await Promise.all([
          Vault.getCase(c.id), opts.timeline ? Vault.getTimeline(c.id) : { events: [] }, opts.notes ? Vault.getNotes(c.id) : '',
        ]);
        const docs = [];
        for (const name of opts.docs) {
          if (ctrl.signal.aborted) break;
          msg.textContent = `Reading ${name}…`;
          try {
            const d = await CVChecks.documentText(c, name, (m) => { msg.textContent = `Reading ${name}: ${m}`; });
            docs.push({ name, docIndex: docs.length, paragraphs: d.paragraphs });
          } catch (err) {
            if (FS.isDisconnectError(err)) throw err;
            toast(`Skipped ${name}: ${err.message}`, 'error', 6000);
          }
        }
        if (ctrl.signal.aborted) throw new DOMException('Stopped', 'AbortError');
        if (CVActivity.heavyBusy()) msg.textContent = 'Waiting for the consistency check to finish…';
        await CVActivity.exclusive('draft', async () => {
          if (ctrl.signal.aborted) throw new DOMException('Stopped', 'AbortError');
          const numCtx = CVAI.numCtxFor(choice.profile);
          msg.textContent = 'Finding the relevant passages…';
          const typeLabel = (CVDraft.DOC_TYPES[opts.type] || CVDraft.DOC_TYPES.other).label;
          const query = [typeLabel, caseObj.title, opts.instructions, String(notes).slice(0, 600), ...(timeline.events || []).map((e) => e.title)].join(' ');
          const hits = await CVCopilot.relevantPassages({ docs, query, engine: { base: det.base, embed: det.embed }, fetchImpl: Engine().fetchImpl() });
          const passages = hits.map((p) => ({ ...p, docName: docs[p.doc].name }));
          const template = opts.template ? CVDraft.fillTemplate(await Vault.readTemplate(opts.template), CVDraft.templateContext(caseObj, new Date(), Vault.data.settings.affiant, await CVClosingUI.templateExtra(caseObj))) : '';
          const references = [];
          const libItems = await CVLibraryUI.items().catch(() => []);
          const chosen = libItems.filter((i) => opts.library.includes(i.path));
          // v1.183: names in examples swapped for placeholders before the AI sees them; past the first
          // example (kept whole, for its structure), only the paragraphs closest to this draft.
          const exampleTexts = await CVLibraryUI.texts(chosen.filter((i) => i.category !== 'directives').map((i) => i.path), (n) => { msg.textContent = `Reading ${n} from the Library…`; }, { scrub: true });
          const examples = exampleTexts.map((x, i) => {
            if (!i || !root.CVText) return x;
            const paras = x.text.split(/\n\s*\n/).map((t) => t.trim()).filter((t) => t.length > 40).map((text) => ({ text }));
            const best = CVText.createIndex(paras).search(query, 6).map((p) => p.text);
            return best.length ? { ...x, text: paras.filter((p) => best.includes(p.text)).map((p) => p.text).join('\n\n') } : x;
          });
          const directives = await CVLibraryUI.texts(chosen.filter((i) => i.category === 'directives').map((i) => i.path), (n) => { msg.textContent = `Reading ${n} from the Library…`; });
          const behaviorPrompt = CVLibrary.behaviorById(Vault.data.settings, opts.behavior).prompt;
          if (opts.values) references.push({ title: 'Narcotics street values', text: CVReference.narcoticsText() });
          if (opts.codes) references.push({ title: 'Incident location codes', text: CVReference.locationCodesText() }, { title: 'UCR codes', text: CVReference.ucrText() });
          const fields = root.CVReportFields ? CVReportFields.asText(await CVReportFieldsUI.load(c)) : '';
          // v1.183: the Terminology terms the case material uses.
          const glossary = root.CVTerms ? CVTerms.forText(caseObj.title, notes, fields, opts.instructions, ...(timeline.events || []).map((e) => `${e.title} ${e.note || ''} ${e.drug || ''}`), ...passages.map((x) => x.text)) : '';
          const wt = opts.warrantType ? CVLibrary.warrantType(opts.warrantType) : null;
          const bank = wt ? CVLibrary.bankText(Vault.data.settings.languageBank, wt.key) : '';
          const elements = wt ? CVLibrary.elementCheck('', wt.key).map((e) => e.label) : [];
          if (wt) meta.warrantType = wt.key;
          const request = { type: opts.type, template, instructions: opts.instructions, caseObj, timeline, notes, passages, references, examples, directives, behavior: behaviorPrompt, numCtx, header: !!opts.header, fields, glossary, bank, elements };
          const messages = CVCopilot.draftMessages(request);

          Object.assign(meta, {
            ai: true, type: opts.type, ...(opts.template ? { template: opts.template } : {}), behavior: opts.behavior,
            generated: { model: choice.model, at: new Date().toISOString(), sources: ['case details', opts.timeline && 'timeline', opts.notes && 'notes', ...opts.docs, ...examples.map((r) => `example: ${r.title}`), ...directives.map((r) => `directive: ${r.title}`), ...references.map((r) => `reference: ${r.title}`)].filter(Boolean) },
          });
          banner.hidden = false;
          typeSelect.value = meta.type;
          checkBtn.hidden = meta.type !== 'affidavit';
          msg.textContent = `Writing with ${CVAI.modelName(choice.model)}…`;
          show();
          const write = (msgs) => CVCopilot.streamChat({
            fetchImpl: Engine().fetchImpl(),
            base: det.base, model: choice.model, messages: msgs, signal: ctrl.signal, numCtx,
            onText: (piece) => { text += piece; show(); saveNow(1500); schedulePlaceholders(); },
          });
          // v1.182: one part at a time (better with small models), each knowing what is written so far.
          const plan = opts.sections ? CVCopilot.sectionPlan(opts.type) : null;
          if (plan) {
            for (let i = 0; i < plan.length; i++) {
              if (ctrl.signal.aborted) throw new DOMException('Stopped', 'AbortError');
              msg.textContent = `Writing part ${i + 1} of ${plan.length} with ${CVAI.modelName(choice.model)}…`;
              if (i) { text = `${text.replace(/\s+$/, '')}\n\n`; show(); }
              await write(CVCopilot.draftMessages({ ...request, part: { name: plan[i], index: i, total: plan.length, written: text } }));
            }
          } else await write(messages);
          // v1.182: the second pass: what it wrote that the case doesn't have, looked at again; what
          // is still not in the case after that goes in [CONFIRM: …].
          if (opts.factCheck) {
            const facts = CVCopilot.factsOnly(messages);
            const found = CVCopilot.newFacts(text, facts, opts.instructions);
            if (found.length && !ctrl.signal.aborted) {
              msg.textContent = `Checking ${found.length} fact${found.length === 1 ? '' : 's'} the case doesn't have…`;
              let fixed = '';
              await CVCopilot.streamChat({ fetchImpl: Engine().fetchImpl(), base: det.base, model: choice.model, signal: ctrl.signal, numCtx,
                messages: CVCopilot.fixFactsMessages({ text, facts: found, material: facts }), onText: (piece) => { fixed += piece; } });
              fixed = CVCopilot.cleanEdit(fixed);
              const left = fixed ? CVCopilot.newFacts(fixed, facts, opts.instructions) : found;
              const before = text;
              text = CVCopilot.markUnsupported(fixed || text, left);
              show(); saveNow(0); schedulePlaceholders();
              checked = { found, left, before };
            }
          }
        }, { label: 'Drafting…', model: CVAI.modelName(choice.model) });
        saveNow(0);
        // v1.183: the required elements of the kind of warrant or subpoena, looked for in the draft.
        const missingEls = meta.warrantType ? CVLibrary.elementCheck(start + text, meta.warrantType).filter((e) => !e.found) : [];
        if (missingEls.length) toast(`The draft doesn't seem to cover: ${missingEls.map((e) => e.label).join('; ')}. Review lists them too.`, 'info', 12000);
        if (checked) {
          const t = toast(`Draft written. ${checked.found.length} fact${checked.found.length === 1 ? '' : 's'} not in the case ${checked.found.length === 1 ? 'was' : 'were'} checked again${checked.left.length ? `; ${checked.left.length} ${checked.left.length === 1 ? 'is' : 'are'} now [CONFIRM: …]` : ''}. Check every [CONFIRM: ...].`, 'success', 12000);
          if (t) {
            const undo = h('button', { class: 'toast-undo', type: 'button' }, 'Show the First Version');
            const b0 = checked.before;
            undo.addEventListener('click', () => { t.remove(); text = b0; show(); saveNow(0); drawPlaceholders(); });
            t.append(' ', undo);
          }
        } else toast('Draft written. Check every [CONFIRM: ...] and verify each fact against the source.', 'success', 8000);
      } catch (err) {
        if (ctrl.signal.aborted) {
          if (text) saveNow(0);
          toast(text ? 'Stopped. The text so far is kept.' : 'Stopped.');
        } else if (FS.isDisconnectError(err) && err.name !== 'NotFoundError') {
          ui.onDriveLost();
        } else {
          if (text) saveNow(0);
          toast(`Draft with AI failed: ${err.message}`, 'error', 10000);
        }
      } finally {
        if (genCtrl === ctrl) genCtrl = null;
        genStatus.hidden = true;
        ta.readOnly = false;
        genBtn.disabled = false;
        drawPlaceholders();
      }
    }

    if (pendingGenerate && pendingGenerate.caseId === c.id && pendingGenerate.slug === slug) {
      pendingGenerate = null;
      openGenerate();
    } else if (rich.active()) {
      rich.focus();
    } else {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }

  /* =====================================================================
   * Templates (shown in the Vault panel)
   * ===================================================================== */

  /** The placeholder list under the template editor: click one to put it at the cursor. */
  function placeholderHelp(area) {
    const { h } = ui;
    const arrestKeys = window.CVClosing ? [...CVClosing.ARRESTEE_FIELDS, ...CVClosing.ARREST_FIELDS].map((f) => f.key) : [];
    const insert = (key) => {
      const text = `{{${key}}}`;
      area.focus();
      area.setRangeText(text, area.selectionStart, area.selectionEnd, 'end');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    };
    return h('details', { class: 'placeholder-help' },
      h('summary', { title: 'Click one to insert it at the cursor.' }, 'Placeholders'),
      h('p', { class: 'muted small explain' }, 'When a draft is made, each placeholder is replaced with the case\'s value. Anything empty or unknown becomes [CONFIRM: …] so nothing slips through. Upper/lower case does not matter.'),
      CVDraft.placeholderGroups(arrestKeys, root.CVReportFields ? CVReportFields.PLACEHOLDERS : []).map((grp) => h('div', { class: 'ph-group' },
        h('span', { class: 'ph-title small' }, grp.title),
        h('span', { class: 'ph-keys' }, grp.keys.map((k) => h('button', { class: 'ph-key', type: 'button', title: `Insert {{${k}}}`, onclick: () => insert(k) }, `{{${k}}}`))))));
  }

  function templateSettings() {
    const { h, toast, Save } = ui;
    const box = h('div', {});
    const editor = h('div', { class: 'template-editor', hidden: true });

    async function draw() {
      let list = [];
      try { list = await Vault.listTemplates(); } catch (err) { if (FS.isDisconnectError(err)) return ui.onDriveLost(); }
      box.replaceChildren(list.length
        ? h('ul', { class: 'plain-list template-list' }, list.map((t) => h('li', {},
          h('span', { title: t.file }, t.title),
          h('span', { class: 'template-btns' },
            h('button', { class: 'btn small ghost', type: 'button', icon: 'file-earmark-plus', title: 'Start a new report from this template in the case you have open, with its details filled in.', onclick: () => useTemplate(t) }, 'Use'),
            h('button', { class: 'btn small ghost', type: 'button', icon: 'download', title: 'Save this template as a Word document (.docx) on this computer, with its {{placeholders}}.', onclick: () => downloadTemplate(t) }, 'Download'),
            h('button', { class: 'btn small ghost', type: 'button', onclick: () => edit(t.file) }, 'Edit'),
            h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
              if (!window.confirm(`Delete the template "${t.title}" from the SSD?`)) return;
              try { await Save.track('templates', () => Vault.deleteTemplate(t.file)); draw(); } catch { /* reported */ }
            } }, 'Delete')))))
        : h('p', { class: 'muted small' }, 'No templates yet.'));
    }

    // Use: a new report in the open case, filled from this template, then open it.
    async function useTemplate(t) {
      const id = ui.state.caseId;
      if (!id || Vault.isArchived(id)) return toast('Open a case first (not an archived one), then use the template.', 'error');
      try {
        const caseObj = await Vault.getCase(id);
        const text = CVDraft.fillTemplate(await Vault.readTemplate(t.file), CVDraft.templateContext(caseObj, new Date(), Vault.data.settings.affiant, await CVClosingUI.templateExtra(caseObj)));
        const name = t.title;
        const hit = CVDraft.docTypeOf(`${t.file} ${t.title}`);
        const slug = await Vault.newDraftSlug(id, name);
        await Save.track(`draft:${id}:${slug}`, () => Vault.saveDraft(id, slug, { title: name, type: hit, ai: false, created: new Date().toISOString(), template: t.file }, text));
        const d = document.getElementById('dialog');
        if (d && d.open) d.close();
        ui.go(id, 'reports', slug);
        toast(`New report from "${t.title}" in this case.`, 'success');
      } catch (err) { if (err && err.message) toast(`Could not use the template: ${err.message}`, 'error'); }
    }

    // Download: the template as a Word document, placeholders and all.
    async function downloadTemplate(t) {
      try {
        const text = await Vault.readTemplate(t.file);
        const bytes = CVDocx.buildDocx(text, { title: t.title });
        const type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        const fname = `${t.title.replace(/[<>:"/\\|?*]+/g, '-')}.docx`;
        if (window.showSaveFilePicker) {
          try {
            const handle = await window.showSaveFilePicker({ suggestedName: fname, types: [{ description: 'Word document', accept: { [type]: ['.docx'] } }] });
            const w = await handle.createWritable(); await w.write(new Blob([bytes], { type })); await w.close();
            toast(`Saved ${fname}.`, 'success');
            return;
          } catch (err) { if (err && err.name === 'AbortError') return; }
        }
        const url = URL.createObjectURL(new Blob([bytes], { type }));
        const a = h('a', { href: url, download: fname, hidden: true });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch (err) { toast(`Could not save the template: ${err.message}`, 'error'); }
    }

    function edit(file, text) {
      const name = h('input', { value: file || '', placeholder: 'agency-affidavit.md', 'aria-label': 'File name', class: 'template-name' });
      const area = h('textarea', { rows: 12, class: 'template-text', 'aria-label': 'Template text' });
      area.value = text != null ? text : '';
      if (file && text == null) Vault.readTemplate(file).then((t) => { area.value = t || ''; });
      editor.replaceChildren(
        ui.field('File name', name),
        area,
        placeholderHelp(area),
        h('div', { class: 'row' },
          h('div', { class: 'spacer' }),
          h('button', { class: 'btn', type: 'button', onclick: () => { editor.hidden = true; } }, 'Cancel'),
          h('button', { class: 'btn primary vault-save', type: 'button', icon: 'save', onclick: async () => {
            let fname = name.value.trim() || 'template.md';
            if (!/\.md$/i.test(fname)) fname += '.md';
            try {
              await Save.track('templates', () => Vault.saveTemplate(fname, area.value));
              if (file && FS.safeName(fname) !== file) await Vault.deleteTemplate(file);
              editor.hidden = true;
              toast('Template saved to CaseVault-Data\\templates.', 'success');
              draw();
            } catch { /* reported by Save */ }
          } }, 'Save template')));
      editor.hidden = false;
      area.focus();
    }

    // Import: Markdown or text as is; a Word document is converted (headings, bold/italic, lists
    // and tables kept). {{placeholders}} typed in Word, or «placeholders», carry over.
    const importInput = h('input', { type: 'file', accept: '.md,.txt,.docx,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document', hidden: true });
    importInput.addEventListener('change', async () => {
      const f = importInput.files[0];
      importInput.value = '';
      if (!f) return;
      try {
        if (/\.docx$/i.test(f.name)) {
          const buf = await f.arrayBuffer();
          const xml = await CVExtract.unzipEntry(buf, 'word/document.xml');
          if (!xml) throw new Error('it has no document body');
          const numbering = await CVExtract.unzipEntry(buf, 'word/numbering.xml').catch(() => null);
          const md = CVDocxView.toTemplate(CVDocxView.parse(xml, numbering || ''));
          edit(FS.safeName(f.name.replace(/\.docx$/i, '.md')), md);
          toast('Converted from Word. Check the text, add {{placeholders}} where case details go, then Save template.', 'success', 7000);
        } else {
          edit(FS.safeName(f.name.replace(/\.txt$/i, '.md')), await f.text());
        }
      } catch (err) { toast(`Could not import ${f.name}: ${err.message}`, 'error'); }
    });

    draw();
    return h('section', { 'data-section': 'templates' },
      h('h3', {}, 'Templates', ui.betaTag ? ui.betaTag() : null),
      h('p', { class: 'muted small explain' }, 'Your own document formats for Drafts, kept as Markdown files in CaseVault-Data\\templates on the SSD. To add one: Import your agency\'s Word form (or a .md/.txt file), or New template and paste the text. Where a case detail goes, put a placeholder like {{case.number}}: the editor lists them all. # at the start of a line makes a heading, **bold**, *italic*, - for a list.'),
      box,
      h('div', { class: 'row template-actions' },
        h('button', { class: 'btn small', type: 'button', onclick: () => edit('', '# New template\n\nCase No. {{case.number}}\n') }, 'New template'),
        h('button', { class: 'btn small', type: 'button', onclick: () => importInput.click() }, 'Import Word, .md or .txt…'),
        importInput),
      editor);
  }

  function init(kit) { ui = kit; }

  root.CVDraftsUI = { init, render, templateSettings };
})(this);
