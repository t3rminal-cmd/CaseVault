/* CaseVault — Offline Consistency Checker: the "Checks" tab, the AI engine status, and its settings.
 * Uses the small UI kit app.js exposes as window.CaseVaultUI.
 */
'use strict';

(function (root) {
  let ui = null; // set by init()

  const BANNER = 'AI-assisted review. Verify every flag against the source.';
  const SEVERITY_HELP = {
    High: 'Hard fact mismatch',
    Medium: 'Contradiction',
    Low: 'Not supported by the reports',
  };
  // v1.162: two actions on a flag: Mark as Reviewed (dealt with, stays in the list, greyed) and
  // Dismiss (not a problem, hidden unless "Dismissed" is shown). Each can carry a note.
  const STATUS_LABEL = { open: 'Open', reviewed: 'Mark as Reviewed', dismissed: 'Dismiss' };
  // Checks saved before v1.162 used Fix / Not an issue / Explained.
  const OLD_STATUS = { fix: 'reviewed', explained: 'reviewed', 'not-issue': 'dismissed' };
  const CONFIDENCE_HELP = {
    High: 'High confidence: the checker is sure about this one',
    Medium: 'Medium confidence: likely, but read both passages',
    Low: 'Low confidence: often fine; check only if it matters',
  };
  // Kinds of flag, for grouping the results.
  const GROUPS = [
    ['names', 'Names', ['name']],
    ['addresses', 'Addresses', ['address']],
    ['money', 'Money, Weights and Totals', ['money', 'weight', 'total', 'buy', 'count']],
    ['dates', 'Dates and Times', ['date', 'time']],
    ['inventory', 'Inventory Numbers', ['inventory']], // v1.168
    ['numbers', 'Numbers, Plates and Phones', ['number', 'plate', 'phone']],
    ['statements', 'Statements and Narratives (AI)', ['statement', 'narrative']],
  ];
  const groupOf = (f) => (GROUPS.find(([, , types]) => types.includes(f.type)) || GROUPS[GROUPS.length - 1])[0];
  /** Brings a flag saved by an older version up to date: its status, and a confidence. */
  function upgradeFlag(f) {
    if (OLD_STATUS[f.status]) f.status = OLD_STATUS[f.status];
    if (!f.confidence) f.confidence = f.severity === 'Low' ? 'Low' : 'Medium';
    return f;
  }

  /* =====================================================================
   * AI engine: detection, header status, settings
   * ===================================================================== */

  // v1.178 (helper 1.17): an Ollama installed on the PC (not the one on the SSD) keeps its logs in
  // %LOCALAPPDATA%\Ollama and its models on C:. The AI stays off with it until it is allowed, for this
  // browser session only; rules-only checks always work.
  const ALLOW_INSTALLED = 'cv-ai-installed-ok';
  let allowedInMemory = false;

  const Engine = {
    detected: null,
    busy: null,
    external: false, // the helper says the running engine is not the SSD's

    // Where the running engine comes from, as the helper sees it: 'ssd', 'external' or 'none'; ''
    // when nothing can tell (Chrome or Edge without the helper: see docs/AI-SETUP.md).
    async source() {
      const helperMode = typeof HelperFS !== 'undefined' && HelperFS.servedByHelper && !('showDirectoryPicker' in window && window.isSecureContext);
      if (!helperMode) return '';
      try { const i = await HelperFS.info(); return (i && i.aiEngine) || ''; } catch { return ''; }
    },
    installedAllowed() {
      try { return sessionStorage.getItem(ALLOW_INSTALLED) === '1' || allowedInMemory; } catch { return allowedInMemory; }
    },
    allowInstalled() {
      allowedInMemory = true;
      try { sessionStorage.setItem(ALLOW_INSTALLED, '1'); } catch { /* this page only */ }
    },

    // The profile is remembered per PC (js/ai/hardware.js), because the SSD moves between a PC
    // with a graphics card and one without. vault.json's old setting only still counts for
    // "Rules-only", which is a choice about the case work rather than the PC.
    setting() {
      const pc = typeof CVHardware !== 'undefined' ? CVHardware.profile() : null;
      if (pc) return pc;
      const s = Vault.data && Vault.data.settings;
      return s && s.aiProfileChosen && s.aiProfile === 'rules-only' ? 'rules-only' : 'auto';
    },

    autoOrder() {
      return typeof CVHardware !== 'undefined' ? CVHardware.autoOrder(CVHardware.state) : undefined;
    },

    choice() {
      return CVAI.choose(this.detected, this.setting(), this.autoOrder());
    },

    // 'connected' | 'offline' | 'rules-only' | 'checking' | 'blocked' (an installed Ollama, not allowed)
    status() {
      if (this.setting() === 'rules-only') return 'rules-only';
      if (!this.detected) return 'checking';
      if (this.detected.status === 'blocked') return 'blocked';
      if (this.detected.status !== 'connected') return 'offline';
      return this.choice() ? 'connected' : 'offline';
    },

    // The local Ollama engine (v1.91: the in-browser WebLLM fallback is gone).
    refresh() {
      if (!this.busy) {
        this.busy = (async () => {
          const [d, src] = await Promise.all([CVAI.detect().catch(() => null), this.source()]);
          this.external = src === 'external';
          // Not allowed: no address, no models, so no AI feature can reach it (they all go through here).
          if (this.external && d && d.status === 'connected' && !this.installedAllowed()) this.detected = { status: 'blocked', base: null, models: [], chat: [], embed: null, profiles: {} };
          else this.detected = d || { status: 'offline', models: [], chat: [], profiles: {} };
        })().finally(() => { this.busy = null; renderPill(); });
      }
      return this.busy;
    },

    /**
     * fetch for AI calls to Ollama on this PC. Wrapped so the header's activity indicator sees
     * every request.
     */
    fetchImpl() {
      const raw = (this.detected && this.detected.fetchImpl) || null;
      if (!this.wrapped || this.wrapped.raw !== raw) this.wrapped = { raw, fetch: CVActivity.wrap(raw || undefined) };
      return this.wrapped.fetch;
    },

  };

  function profileLabel(choice) {
    if (!choice) return '';
    const p = CVAI.PROFILES[choice.profile];
    return `${p ? p.label : 'Custom'} · ${CVAI.modelName(choice.model)}`;
  }

  function renderPill() {
    const el = document.getElementById('engine-status');
    if (!el || !Vault.data) { if (el) el.hidden = true; return; }
    const st = Engine.status();
    el.hidden = false;
    el.className = `engine-status ${st}`;
    const text = {
      connected: `AI: ${profileLabel(Engine.choice())}`,
      offline: 'AI: Offline',
      'rules-only': 'AI: Rules-only',
      checking: 'AI: checking…',
      blocked: 'AI: installed Ollama (logs on this PC)',
    }[st];
    // Every AI icon in CaseVault is the same robot: blue when the AI is running, red when it isn't.
    el.replaceChildren(CVIcons.icon('robot'), text);
    el.title = {
      connected: 'The local AI engine is running. Click for AI settings.',
      offline: 'The local AI engine (Ollama) is not running. Checks will use rules only. Click for help.',
      'rules-only': 'AI review is switched off. Checks use rules only. Click to change.',
      checking: 'Looking for the local AI engine…',
      blocked: 'An Ollama installed on this PC is running instead of the SSD\'s, and it keeps its logs and models on this PC. AI is off until you allow it for this session; rules-only checks still work. Click to choose.',
    }[st];
    // The header shows just the icon; the model's name is in the hover box.
    el.title = `${text}. ${el.title}`;
    el.setAttribute('aria-label', text);
  }

  async function showEngineDialog() {
    const { h, openDialog, Save, toast } = ui;
    await Engine.refresh();
    await openDialog((close) => {
      const d = Engine.detected || { status: 'offline', profiles: {}, chat: [] };
      const current = Engine.setting();
      const firstAuto = (CVAI.PROFILES[(Engine.autoOrder() || [])[0]] || CVAI.PROFILES.quick).label;
      const options = [['auto', 'Auto', `Picks for this PC: ${firstAuto} first here. ${CVHardware.explain(CVHardware.state)}`]];
      for (const [key, p] of Object.entries(CVAI.PROFILES)) {
        if (d.profiles[key]) options.push([key, p.label, `${p.hint}. Uses ${CVAI.modelName(d.profiles[key])}.`]);
      }
      options.push(['rules-only', 'Rules-only', 'No AI. Only the rule-based checks run. Always available.']);
      const radios = options.map(([value, label, hint]) => {
        const input = h('input', { type: 'radio', name: 'ai-profile', value, checked: value === current });
        input.addEventListener('change', async () => {
          CVHardware.setProfile(value);
          renderPill();
          toast(`AI profile on this PC: ${label}`, 'success');
        });
        return h('label', { class: 'radio-row' }, input, h('span', {}, h('strong', {}, label), h('span', { class: 'muted small block' }, hint)));
      });
      const choice = Engine.choice();
      // v1.178: an installed Ollama (helper 1.17 tells): off until allowed for this session.
      const installedNote = d.status === 'blocked'
        ? h('div', { class: 'warn-card engine-installed' },
          h('p', {}, h('strong', {}, 'An Ollama installed on this PC is running, not the one on the SSD.'), ' It keeps its logs in %LOCALAPPDATA%\\Ollama and its models on C:, so what you ask the AI could stay on this PC. The AI is off; rules-only checks still work.'),
          h('p', { class: 'muted small' }, 'To use the SSD\'s AI: quit Ollama from the taskbar tray (right-click it → Quit), close the CaseVault helper window and start Start-CaseVault.bat again.'),
          h('div', { class: 'dialog-actions' },
            h('button', { class: 'btn danger', type: 'button', onclick: async () => { Engine.allowInstalled(); close(); await Engine.refresh(); toast('The installed Ollama is used for this session. Its logs stay on this PC.', 'info', 7000); showEngineDialog(); } }, 'Allow It for This Session')))
        : Engine.external && d.status === 'connected'
          ? h('p', { class: 'warn-text small engine-installed' }, 'Using the Ollama installed on this PC for this session: its logs stay on this PC.')
          : null;
      return h('div', { class: 'engine-panel' },
        h('h2', {}, 'AI engine'),
        installedNote,
        d.status === 'blocked' ? null : d.status === 'connected'
          ? h('p', {}, h('span', { class: 'pill status-closed' }, 'Connected'), ' Ollama is running on this computer',
            choice ? ['. Checks will use ', h('strong', {}, profileLabel(choice)), choice.fallback ? ' (the chosen profile has no model installed)' : '', '.'] : ', but no chat model is installed.')
          : h('div', {},
            h('p', {}, h('span', { class: 'pill status-pending' }, 'Offline'), ' The local AI engine is not running, so checks use the rule-based layer only.'),
            h('p', { class: 'muted small explain' }, 'To use AI review, double-click Start-CaseVault.bat on the CV-AI drive (for example W:\\) and click "Check again". See docs/AI-SETUP.md.')),
        d.status === 'connected' && h('p', { class: 'muted small' },
          `Installed models: ${d.models.map((m) => m.name).join(', ') || 'none'}.`),
        d.status === 'connected' && embedStatus(d),
        moreModels(d),
        h('h3', {}, 'Profile on this PC'),
        h('p', { class: 'muted small explain' }, 'Remembered by this PC\'s browser, not on the SSD, so the Beelink and the L14 can each use the model that suits them.'),
        h('div', { class: 'radio-list' }, radios),
        // v1.165: how long the model stays loaded after use (frees the GPU memory sooner).
        h('h3', {}, 'Keep the Model Loaded'),
        (() => {
          const sel = h('select', { 'aria-label': 'Keep the model loaded', class: 'ai-keep' }, CVAI.KEEP_CHOICES.map(([v, l]) => h('option', { value: v, selected: v === CVAI.keepChoice() }, v === CVAI.KEEP_ALIVE ? `${l} (Default)` : l)));
          sel.addEventListener('change', () => { CVAI.setKeepChoice(sel.value); toast(`The model stays loaded: ${sel.options[sel.selectedIndex].textContent.toLowerCase()}.`, 'success'); });
          return h('div', { class: 'ai-keep-row' }, sel, h('p', { class: 'muted small explain' }, 'After it is used, the model stays in the graphics card\'s memory for this long, so the next answer starts at once. A shorter time frees the memory sooner; Unload When Done frees it as soon as a check or draft finishes (the next one waits for the model to load). On this PC only.'));
        })(),
        // v1.185: which installed model does best on this PC, and the passage-search memory on the SSD.
        d.status === 'connected' && d.chat.length && root.CVModelCheck ? h('div', { class: 'row mc-row' },
          h('button', { class: 'btn small', type: 'button', icon: 'bar-chart-line-fill', title: 'Each model reads the self-test\'s made-up case: how many planted mistakes it finds, whether it makes facts up, and how fast it is', onclick: () => { close(); root.CVModelCheck.open(root.CaseVaultUI); } }, 'Test the Models on This PC')) : null,
        d.embed && Vault.embedCacheSize ? (() => {
          const line = h('p', { class: 'muted small embed-cache' }, 'Passage-search memory on the SSD: …');
          Vault.embedCacheSize().then(({ files, bytes }) => {
            line.replaceChildren(`Passage-search memory on the SSD: ${(bytes / 1048576).toFixed(1)} MB in ${files} file${files === 1 ? '' : 's'}. Each passage is worked out once per model, so checks and searches run faster the second time. `,
              bytes ? h('button', { class: 'linkish', type: 'button', onclick: async () => { await Vault.clearEmbedCache().catch(() => {}); toast('The passage-search memory was emptied. It fills again as you work.', 'success'); line.remove(); } }, 'Empty It') : '');
          }).catch(() => line.remove());
          return line;
        })() : null,
        h('p', { class: 'muted small explain' }, 'Privacy: CaseVault only talks to the AI engine on this computer (127.0.0.1:11434). Nothing is sent anywhere else.'),
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', type: 'button', onclick: async () => { close(); await Engine.refresh(); showEngineDialog(); } }, 'Check again'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done')));
    });
  }

  // Another model for Ask AI, for example an uncensored (less-filtered) one such as dolphin3.
  const EXTRA_MODELS = [
    { name: 'dolphin3', size: '4.9 GB', fits: 'Beelink (graphics card, 6 GB)', note: 'Uncensored (less filtered) 8B model. Refuses less; not more accurate.' },
    { name: 'dolphin-mistral', size: '4.1 GB', fits: 'Beelink (graphics card, 6 GB)', note: 'Uncensored, older and a little faster.' },
    { name: 'dolphin-phi', size: '1.6 GB', fits: 'L14 (no graphics card)', note: 'Small uncensored model that runs on the processor. Weaker answers.' },
  ];
  function moreModels(d) {
    const { h, toast } = ui;
    const installed = new Set(((d && d.models) || []).map((m) => String(m.name).replace(/:latest$/, '')));
    const copy = async (cmd) => { try { await navigator.clipboard.writeText(cmd); toast('Command copied. Paste it in the command window.', 'success'); } catch { toast('Select the command and press Ctrl+C.', 'error'); } };
    return h('details', { class: 'more-models' },
      h('summary', {}, 'Add another AI model, for example an uncensored one (dolphin3)'),
      h('ol', { class: 'small' },
        h('li', {}, 'Leave the Start-CaseVault.bat window open (the AI engine must be running) and make sure this PC is online for the download.'),
        h('li', {}, 'Press Windows key + R, type ', h('code', {}, 'cmd'), ' and press Enter.'),
        h('li', {}, 'Copy the command for the model you want, paste it (right-click) and press Enter. Use your drive letter if it isn\'t W:. Wait for "success"; the model is saved in W:\\models, so it downloads once.'),
        h('li', {}, 'Come back here and click ', h('strong', {}, 'Check again'), '. Then pick it in ', h('strong', {}, 'Ask AI → Model'), '. After the download it works offline like the others.')),
      h('table', { class: 'models-table small' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Model'), h('th', {}, 'Size'), h('th', {}, 'For'), h('th', {}, ''), h('th', {}, ''))),
        h('tbody', {}, EXTRA_MODELS.map((m) => {
          const cmd = `W:\\ollama\\ollama.exe pull ${m.name}`;
          return h('tr', {},
            h('td', { title: m.note }, h('strong', {}, m.name)),
            h('td', {}, m.size), h('td', {}, m.fits),
            h('td', {}, installed.has(m.name) ? h('span', { class: 'ok-text' }, '✓ Installed') : h('code', {}, cmd)),
            h('td', {}, installed.has(m.name) ? null : h('button', { class: 'btn small', type: 'button', onclick: () => copy(cmd) }, 'Copy')));
        }))),
      h('p', { class: 'muted small' }, 'Uncensored models refuse less, but they aren\'t more knowledgeable and are more likely to go along with a wrong premise. Keep the Qwen models for Checks and Draft with AI; use these in Ask AI. If a name isn\'t found, search ollama.com for "dolphin" and pick a 7–8B size. Follow your agency\'s policy on AI tools. More in docs/AI-SETUP.md.'));
  }

  // Passage search (embedding model): which report passages the AI reads for each statement.
  function embedStatus(d) {
    const { h, toast } = ui;
    if (d.embed) return h('p', { class: 'small ok-text' }, `✓ Passage search: ${d.embed}. The AI review and Draft with AI find the relevant report passages by meaning, not only by keywords.`);
    const cmd = 'W:\\ollama\\ollama.exe pull nomic-embed-text';
    return h('div', { class: 'card warn-card' },
      h('strong', {}, 'Passage search model not installed'),
      h('p', { class: 'small' }, 'Without it the AI reads the passages found by keywords only, and can miss one written in other words. Install nomic-embed-text (about 0.3 GB) once:'),
      h('ol', { class: 'small' },
        h('li', {}, 'Leave the Start-CaseVault.bat window open (the AI engine must be running).'),
        h('li', {}, 'Press Windows key + R, type cmd and press Enter.'),
        h('li', {}, 'Paste this and press Enter (use your drive letter if it isn\'t W:), then wait for "success":'),
        h('li', { class: 'list-none' }, h('code', {}, cmd), ' ',
          h('button', { class: 'btn small', type: 'button', onclick: async () => {
            try { await navigator.clipboard.writeText(cmd); toast('Command copied.', 'success'); } catch { toast('Select the command and press Ctrl+C.', 'error'); }
          } }, 'Copy')),
        h('li', {}, 'Come back here and click "Check again".')));
  }

  /* =====================================================================
   * Helpers
   * ===================================================================== */

  function banner() {
    return ui.h('div', { class: 'ai-banner', role: 'note' }, ui.icon('exclamation-triangle-fill'), ' ', BANNER);
  }

  function markText(text, highlight) {
    const { h } = ui;
    if (!highlight) return [text];
    const [a, b] = highlight;
    if (!(a >= 0 && b > a && b <= text.length)) return [text];
    return [text.slice(0, a), h('mark', {}, text.slice(a, b)), text.slice(b)];
  }

  // "Report.pdf · page 3", "Log.xlsx · Sheet1 row 12", "Form.pdf · page 1 · Timeline row 2" (XFA field)
  function at(loc) {
    if (loc.sheet != null) return `${loc.sheet} row ${loc.row}`;
    return [loc.page ? `page ${loc.page}` : null, loc.field || null].filter(Boolean).join(' · ') || null;
  }

  function where(loc) {
    return [loc.doc, at(loc)].filter(Boolean).join(' · ');
  }

  const KIND_NAME = { buy: 'Buy', surveillance: 'Surveillance', lab: 'Lab' }; // v1.170: and Lab

  /** v1.171: Order of Events: a Buy report and its Surveillance report side by side, their sentences
   * under the time they happened. A time in one report and not the other stands out on its own row. */
  async function orderOfEventsDialog(c, buyName, survName) {
    const { h, openDialog, toast } = ui;
    let a; let b;
    try { [a, b] = await Promise.all([documentText(c, buyName, () => {}), documentText(c, survName, () => {})]); } catch (err) {
      if (FS.isDisconnectError(err)) { ui.onDriveLost(); return; }
      toast(`Could not read the reports: ${err.message}`, 'error'); return;
    }
    const rows = CVRules.orderOfEvents(a, b);
    const clock = (t) => { if (!t) return 'Before'; const [hh, mm] = t.split(':').map(Number); return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`; };
    const cell = (list) => h('td', { class: list.length ? '' : 'order-none' }, ...(list.length ? list.slice(0, 6).map((t) => h('p', {}, t)) : [h('span', { class: 'muted small' }, 'Nothing at this time')]), list.length > 6 ? h('p', { class: 'muted small' }, `and ${list.length - 6} more`) : null);
    await openDialog((close) => h('div', { class: 'order-events' },
      h('h2', { icon: 'clock-history' }, 'Order of Events'),
      h('p', { class: 'muted small' }, 'Each report\'s sentences under the time they happened (a sentence with no time goes with the time before it). A time only one report gives is on a row of its own.'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'data-table order-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Time'), h('th', {}, buyName.split('/').pop()), h('th', {}, survName.split('/').pop()))),
        h('tbody', {}, ...rows.map((r) => h('tr', { class: !r.a.length || !r.b.length ? 'order-one' : '' }, h('td', { class: 'nowrap order-time' }, clock(r.time)), cell(r.a), cell(r.b)))))),
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
  }

  /** v1.169: the documents of a past check that changed since (a file replaced or edited, or gone).
   * docs: the check's documents [{ name, size, modified, draft }]; files: the case's files now.
   * Drafts are not compared (their text is read again on each check). -> [names] */
  function changedSince(docs, files) {
    const now = new Map(files.map((f) => [f.name, f]));
    return (docs || []).filter((d) => !d.draft && !d.skipped).filter((d) => {
      const f = now.get(d.name);
      if (!f) return true;
      if (d.size != null && f.size != null && Number(d.size) !== Number(f.size)) return true;
      return d.modified != null && f.modified != null && Math.abs(Number(d.modified) - Number(f.modified)) > 2000;
    }).map((d) => d.name);
  }

  async function checkableFiles(c) {
    return (await Vault.listFiles(c.id)).filter((f) => CVExtract.kindOf(f.name));
  }

  // Text of a document: from the SSD cache when the file hasn't changed, otherwise read it again.
  // A draft (info.kind === 'draft') is read from cases/<id>/drafts/ instead of the attached files.
  async function documentText(c, name, onProgress, info = null) {
    if (info && info.kind === 'draft') {
      const draft = await Vault.readDraft(c.id, info.draft);
      if (!draft) {
        const err = new Error(`The draft "${name}" no longer exists.`);
        err.name = 'FileGoneError';
        throw err;
      }
      const paragraphs = CVExtract.paragraphsFromText(CVDraft.stripMarkdown(draft.body), null);
      return { name, kind: 'draft', pageCount: 1, paragraphs, ocrPages: [], warnings: [], size: draft.body.length, modified: draft.meta.updated || null };
    }
    const file = await Vault.readFile(c.id, name);
    if (!file) {
      const err = new Error(`"${name}" is no longer attached to this case.`);
      err.name = 'FileGoneError';
      throw err;
    }
    const cached = await Vault.readTextCache(c.id, name, file.size, file.lastModified);
    // Text read by an older version of the reader is read again (e.g. XFA forms before v1.8).
    if (cached && cached.paragraphs && (cached.extractor || 1) >= CVExtract.VERSION) return { ...cached, size: file.size, modified: file.lastModified };
    const out = await CVExtract.extract(file, name, onProgress);
    await Vault.writeTextCache(c.id, name, file.size, file.lastModified, out);
    return { ...out, size: file.size, modified: file.lastModified };
  }

  /* =====================================================================
   * Checks tab: new check + past checks
   * ===================================================================== */

  async function render(panel, c, token, sub) {
    if (sub) return renderResult(panel, c, token, decodeURIComponent(sub));
    const { h, state, fmtDateTime } = ui;
    const [files, checks] = await Promise.all([checkableFiles(c), Vault.listChecks(c.id)]);
    if (token !== state.renderToken) return;
    Engine.refresh().then(() => { if (token === state.renderToken) updateAiLine(); });

    // ---- new check form
    const guess = files.find((f) => /affidavit|affid|declaration|probable cause/i.test(f.name)) || null;
    const affSelect = h('select', { 'aria-label': 'Document to check' },
      h('option', { value: '' }, 'None: compare the reports with each other'),
      files.map((f) => h('option', { value: f.name, selected: guess && f.name === guess.name }, f.name)));
    const reportList = h('div', { class: 'check-reports' });
    const aiToggle = h('input', { type: 'checkbox' });
    const aiLine = h('span', { class: 'muted small' });
    const runBtn = h('button', { class: 'btn primary', type: 'button', icon: 'clipboard2-check' }, 'Run check');
    // v1.162: Known Aliases of this case: names that are one person, never flagged as misspellings.
    const aliasBox = h('textarea', { rows: 3, class: 'chk-aliases', 'aria-label': 'Known Aliases', placeholder: 'One person per line: Richard Poe, Rick, Ricky' });
    aliasBox.value = c.checkAliases || '';
    // v1.172: the suspects' monikers count too, without typing them here.
    const monikers = root.CVHealth ? root.CVHealth.aliasLines(c.suspects || []) : [];
    const monikerNote = monikers.length ? h('span', { class: 'muted small block chk-monikers' }, `Also from the suspects' monikers: ${monikers.map((l) => l.replace(/, /, ' = ')).join('; ')}.`) : null;
    aliasBox.addEventListener('input', () => {
      const value = aliasBox.value;
      c.checkAliases = value;
      ui.Save.schedule(`check-aliases:${c.id}`, async () => { const full = await Vault.getCase(c.id); full.checkAliases = value; await Vault.saveCase(full); }, 800);
    });
    // v1.59: a header like the other boxes: an icon tile, the title and a line under it.
    const head = (ic, title, sub) => h('div', { class: 'chk-head' }, h('span', { class: 'chk-head-icon', 'aria-hidden': 'true' }, ui.icon(ic)),
      h('div', {}, h('h2', {}, title), sub ? h('p', { class: 'muted small' }, sub) : null));

    // v1.169: what each report is (Buy, Surveillance, Other; Auto goes by its name) and which
    // Surveillance report each Buy report goes with, chosen here and kept with the case.
    const pairPick = { kinds: { ...((c.checkPairs && c.checkPairs.kinds) || {}) }, fixed: { ...((c.checkPairs && c.checkPairs.fixed) || {}) } };
    const savePairs = () => {
      c.checkPairs = { kinds: { ...pairPick.kinds }, fixed: { ...pairPick.fixed } };
      const value = c.checkPairs;
      ui.Save.schedule(`check-pairs:${c.id}`, async () => { const full = await Vault.getCase(c.id); full.checkPairs = value; await Vault.saveCase(full); }, 500);
    };
    const kindOf = (name) => (pairPick.kinds[name] === 'other' ? '' : pairPick.kinds[name] || CVRules.kindFromName(name));
    const pairBox = h('div', { class: 'chk-pair-box' });
    function drawPairs() {
      const chosen = [...reportList.querySelectorAll('input[type=checkbox]:checked')].map((i) => i.value);
      const buys = chosen.filter((n) => kindOf(n) === 'buy');
      const survs = chosen.filter((n) => kindOf(n) === 'surveillance');
      if (!buys.length || !survs.length) { pairBox.replaceChildren(); pairBox.hidden = true; return; }
      pairBox.hidden = false;
      pairBox.replaceChildren(h('span', { class: 'chk-pair-title' }, 'Buy and Surveillance Pairs'),
        ...buys.map((b) => {
          const has = Object.prototype.hasOwnProperty.call(pairPick.fixed, b);
          const sel = h('select', { 'aria-label': `Surveillance report for ${b}`, title: 'Auto pairs by the number in the names, the date and the inventory numbers.' },
            h('option', { value: '__auto', selected: !has }, 'Auto'),
            ...survs.map((v) => h('option', { value: v, selected: has && pairPick.fixed[b] === v }, v.split('/').pop())),
            h('option', { value: '', selected: has && pairPick.fixed[b] === '' }, 'Not Paired'));
          sel.addEventListener('change', () => { if (sel.value === '__auto') delete pairPick.fixed[b]; else pairPick.fixed[b] = sel.value; savePairs(); });
          return h('label', { class: 'chk-pair-row' }, h('span', {}, b.split('/').pop()), h('span', { class: 'muted small' }, 'with'), sel);
        }));
    }

    function drawReports() {
      const aff = affSelect.value;
      const prev = new Map([...reportList.querySelectorAll('input[type=checkbox]')].map((i) => [i.value, i.checked]));
      reportList.replaceChildren(...files.filter((f) => f.name !== aff).map((f) =>
        h('label', { class: 'check-row chk-doc', title: f.name },
          h('input', { type: 'checkbox', value: f.name, checked: prev.has(f.name) ? prev.get(f.name) : true }),
          h('span', {}, f.name.split('/').pop(), f.name.includes('/') ? h('span', { class: 'muted small block' }, f.name.split('/').slice(0, -1).join(' › ')) : null))));
      if (!reportList.children.length) reportList.append(h('p', { class: 'muted small' }, 'No other documents are attached.'));
      // v1.168: Buy and Surveillance reports are marked (by their names); each Buy report is checked with its pair.
      // v1.169: the mark is a choice: Auto (by the name), Buy, Surveillance or Other.
      for (const row of reportList.querySelectorAll('label.chk-doc')) {
        const name = row.querySelector('input').value;
        const auto = CVRules.kindFromName(name);
        const sel = h('select', { class: 'chk-kind-pick', 'aria-label': `What ${name} is`, title: 'What this report is. Auto goes by its name; a Buy report is checked with its Surveillance report.' },
          ...[['', `Auto${auto ? ` (${KIND_NAME[auto]})` : ''}`], ['buy', 'Buy'], ['surveillance', 'Surveillance'], ['lab', 'Lab'], ['other', 'Other']]
            .map(([v, l]) => h('option', { value: v, selected: (pairPick.kinds[name] || '') === v }, l)));
        sel.addEventListener('change', () => { if (sel.value) pairPick.kinds[name] = sel.value; else delete pairPick.kinds[name]; savePairs(); drawKindTag(row, name); drawPairs(); updateAiLine(); });
        row.append(sel);
        drawKindTag(row, name);
      }
      drawPairs();
      updateAiLine();
    }
    function drawKindTag(row, name) {
      const old = row.querySelector('.chk-kind');
      if (old) old.remove();
      const k = kindOf(name);
      if (k) row.querySelector('span').append(h('span', { class: `chk-kind chk-kind-${k}` }, KIND_NAME[k]));
    }
    reportList.addEventListener('change', (e) => { if (e.target.matches('input[type=checkbox]')) { drawPairs(); updateAiLine(); } });

    // v1.168: a Buy report and a Surveillance report among the chosen ones (by their names): the AI
    // can compare their narratives, with or without a document to check.
    const pairsChosen = () => {
      const kinds = [...reportList.querySelectorAll('input[type=checkbox]:checked')].map((i) => kindOf(i.value));
      return kinds.includes('buy') && kinds.includes('surveillance');
    };
    function updateAiLine() {
      const st = Engine.status();
      const choice = Engine.choice();
      const hasAff = !!affSelect.value;
      const pairs = pairsChosen();
      aiToggle.disabled = !(st === 'connected' && choice && (hasAff || pairs));
      if (aiToggle.disabled) aiToggle.checked = false;
      else if (!aiToggle.dataset.touched) aiToggle.checked = true;
      aiLine.textContent = st === 'connected' && choice
        ? (hasAff ? ` using ${profileLabel(choice)}${pairs ? ', and compares the Buy and Surveillance narratives' : ''}` : pairs ? ` compares the Buy and Surveillance narratives, using ${profileLabel(choice)}` : ' (needs a document to check, or a Buy and a Surveillance report)')
        : st === 'rules-only' ? ' (switched off: AI profile is Rules-only)'
          : st === 'checking' ? ' (looking for the AI engine…)'
            : ' (AI engine offline: start Start-CaseVault.bat on the CV-AI drive)';
    }
    aiToggle.addEventListener('change', () => { aiToggle.dataset.touched = '1'; });
    affSelect.addEventListener('change', drawReports);
    drawReports();

    runBtn.addEventListener('click', () => {
      const reports = [...reportList.querySelectorAll('input[type=checkbox]:checked')].map((i) => i.value);
      const affidavit = affSelect.value || null;
      if (!reports.length || (!affidavit && reports.length < 2)) {
        ui.toast(affidavit ? 'Choose at least one report to compare against.' : 'Choose at least two reports to compare with each other.', 'error');
        return;
      }
      runCheck(c, affidavit, reports, aiToggle.checked);
    });

    const form = files.length
      ? h('div', { class: 'card chk-card' },
        head('clipboard2-check', 'New Check', 'Compares an affidavit or draft with the reports: dates, times, names, numbers, addresses, plates, phones, amounts, weights, totals, inventory numbers and the Timeline buys. Reports are cross-checked too, and each Buy report with its Surveillance report.'),
        h('div', { class: 'chk-grid' },
          h('div', { class: 'chk-col' },
            h('label', { class: 'field', title: 'An affidavit or a draft.' }, h('span', {}, 'Document to check'), affSelect),
            h('label', { class: 'check-row chk-ai' }, aiToggle, h('span', {}, h('strong', {}, 'Include AI review'), aiLine)),
            h('label', { class: 'field', title: 'Names of one person (nicknames, monikers): never flagged as spelled differently.' }, h('span', {}, 'Known Aliases'), aliasBox, monikerNote)),
          h('div', { class: 'chk-col' }, h('div', { class: 'field' }, h('span', {}, 'Compare against'), reportList), pairBox)),
        h('div', { class: 'chk-actions' }, h('span', { class: 'muted small' }, 'Nothing leaves this PC.'), h('div', { class: 'spacer' }), runBtn))
      : h('div', { class: 'card chk-card' }, head('clipboard2-check', 'New Check', ''),
        h('p', { class: 'muted' }, 'Attach the affidavit and the reports on the Files tab first. PDF, DOCX, TXT and photos (PNG/JPG) can be checked.'));

    // ---- past checks
    const past = checks.length
      ? h('table', { class: 'files checks-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Run'), h('th', {}, 'Checked'), h('th', {}, 'Flags'), h('th', {}, 'Open'), h('th', {}, 'Engine'))),
        h('tbody', {}, checks.map((k) => h('tr', { class: 'clickable', onclick: () => ui.go(c.id, 'checks', k.name) },
          h('td', {}, h('a', { href: `#/case/${CVRoute.enc(c.id)}/checks/${CVRoute.enc(k.name)}` }, k.created ? fmtDateTime(Date.parse(k.created)) : k.name)),
          h('td', {}, k.damaged ? h('span', { class: 'error-text' }, 'Damaged file') : [k.affidavit || 'Reports only', h('span', { class: 'muted small block' }, `against ${k.reports.length} document${k.reports.length === 1 ? '' : 's'}`),
            // v1.169: a document changed since this check ran: its results may be out of date.
            ...(() => { const ch = changedSince(k.documents, files); return ch.length ? [h('span', { class: 'chk-stale', title: `Changed since this check: ${ch.join(', ')}` }, 'Out of Date')] : []; })()]),
          h('td', {}, k.counts ? ['High', 'Medium', 'Low'].map((s) => h('span', { class: `sev-count sev-${s.toLowerCase()}`, title: s }, `${k.counts[s] || 0}`)) : ''),
          h('td', {}, k.open != null ? String(k.open) : ''),
          h('td', { class: 'muted small' }, k.engine ? (k.engine.model || 'Rules only') : '', k.complete === false ? ' (stopped early)' : '')))))
      : h('p', { class: 'muted empty-note' }, ui.icon('clipboard2-pulse'), h('span', {}, 'No checks yet.'));

    // An archived case is read-only: its past checks can be opened, but no new ones run.
    const archived = Vault.isArchived(c.id);
    panel.replaceChildren(banner(), archived ? h('p', { class: 'muted' }, 'This case is archived. Past checks can be opened and read; restore the case to run a new one.') : form,
      h('div', { class: 'card chk-card chk-past' }, head('clock-history', 'Past Checks', checks.length ? `${checks.length} check${checks.length === 1 ? '' : 's'} on this case. Click one to open it.` : ''), past));
  }

  /* =====================================================================
   * Running a check
   * ===================================================================== */

  // Facts a template writes into every draft that no report will mention: the author's own details
  // (signature block) and today's date ("Prepared …"). They never count as "not found".
  function ownDetails() {
    const a = (Vault.data && Vault.data.settings.affiant) || {};
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return [
      ...['name', 'title', 'agency', 'address', 'phone', 'email'].map((k) => a[k]).filter(Boolean),
      `Prepared ${now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: '2-digit' })}.`,
      `Dated ${pad(now.getMonth() + 1)}/${pad(now.getDate())}/${now.getFullYear()} and ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.`,
    ];
  }

  /** v1.172: the case's Known Aliases and, after them, its suspects' monikers ("Richard Poe, Rick, Ricky"). */
  function caseAliasText(c) {
    const extra = root.CVHealth ? root.CVHealth.aliasLines((c && c.suspects) || []) : [];
    return [String((c && c.checkAliases) || ''), ...extra].filter(Boolean).join('\n');
  }

  /** v1.169: the case's evidence list (the exhibits on the Write Report tab): [{ number, inventory, description }]. */
  async function caseEvidence(c) {
    try {
      const rf = await Vault.readCaseJSON(c.id, 'report-fields.json');
      return ((rf && rf.evidence) || []).map((e) => ({ number: e.number, inventory: String(e.inventory || '').trim(), description: e.description || e.drug || '' }));
    } catch (err) { if (FS.isDisconnectError(err)) throw err; return []; }
  }

  // draft: { slug, title } to check a draft (from the Drafts tab) instead of an attached file.
  async function runCheck(c, affidavit, reports, useAI, draft = null) {
    const { h, openDialog, Save, toast, go } = ui;
    const ctrl = new AbortController();
    const steps = h('ol', { class: 'progress-steps' });
    const activity = h('p', { class: 'muted small' }, 'Starting…');
    const bar = h('progress', { max: 100, value: 0 });
    let stopBtn;
    let closeDialog;
    const addStep = (text) => { const li = h('li', { class: 'running' }, text); steps.append(li); return li; };
    const done = (li, cls = 'done') => { li.className = cls; };

    openDialog((close) => {
      closeDialog = close;
      stopBtn = h('button', { class: 'btn', type: 'button', onclick: () => { ctrl.abort(); stopBtn.disabled = true; activity.textContent = 'Stopping…'; } }, 'Cancel');
      return h('div', { class: 'progress-panel' }, h('h2', {}, 'Checking documents'), steps, bar, activity, h('div', { class: 'dialog-actions' }, stopBtn));
    });
    dialogBlockEscape(true);

    const finish = () => { dialogBlockEscape(false); if (closeDialog) closeDialog(); };
    try {
      // 1. Read every document.
      const names = [affidavit, ...reports].filter(Boolean);
      const docs = [];
      const docInfo = [];
      for (let i = 0; i < names.length; i++) {
        if (ctrl.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        const name = names[i];
        const role = name === affidavit ? 'affidavit' : 'report';
        const li = addStep(`Reading ${name}`);
        try {
          const src = draft && role === 'affidavit' ? { kind: 'draft', draft: draft.slug } : null;
          const d = await documentText(c, name, (msg) => { activity.textContent = `${name}: ${msg}`; }, src);
          docs.push({ name, role, kind: d.kind, paragraphs: d.paragraphs, docIndex: docs.length });
          docInfo.push({ name, role, kind: d.kind, ...(src ? { draft: src.draft } : {}), pageCount: d.pageCount, paragraphCount: d.paragraphs.length, ...(d.xfa ? { xfa: true } : {}), ocrPages: d.ocrPages || [], warnings: d.warnings || [], size: d.size, modified: d.modified });
          done(li, d.ocrPages && d.ocrPages.length ? 'done warn' : 'done');
        } catch (err) {
          if (FS.isDisconnectError(err)) throw err;
          done(li, 'failed');
          li.append(h('span', { class: 'small block' }, err.message));
          if (role === 'affidavit') throw new Error(`Could not read ${name}: ${err.message}`);
          docInfo.push({ name, role, error: err.message, skipped: true });
        }
        bar.value = Math.round(((i + 1) / names.length) * (useAI ? 30 : 80));
      }
      const usable = docs.filter((d) => d.role === 'report').length;
      if (!usable || (!affidavit && usable < 2)) throw new Error('Not enough readable documents to compare.');

      // 2. Rule-based checks.
      const rulesStep = addStep('Rule-based checks');
      activity.textContent = 'Comparing dates, times, names and numbers…';
      await new Promise((r) => setTimeout(r, 20));
      // v1.162: the case's Known Aliases and its Timeline buys (the Buy Summary) go into the checks.
      const caseNow = await Vault.getCase(c.id).catch(() => c);
      const aliases = CVText.parseAliases(caseAliasText(caseNow));
      let buys = [];
      try {
        const tl = await Vault.getTimeline(c.id);
        buys = (tl.events || []).filter((e) => e.kind === 'buy').map((e) => ({ date: e.date, suspect: e.suspect || '', drug: e.drug || '', qty: e.qty, unit: e.unit || 'g', paid: e.paid }));
      } catch (err) { if (FS.isDisconnectError(err)) throw err; }
      // v1.168: each Buy report with its Surveillance report.
      const ruleDocs = docs.map((d) => ({ id: d.docIndex, name: d.name, role: d.role, paragraphs: d.paragraphs }));
      // v1.169: the kinds and pairs chosen on the Checks tab, and the case's evidence list.
      const pairOpts = caseNow.checkPairs || c.checkPairs || {};
      const pairs = CVRules.pairReports(ruleDocs, pairOpts);
      for (const d of docInfo) {
        const k = (pairOpts.kinds || {})[d.name];
        const kind = d.skipped ? '' : k === 'other' ? '' : k || CVRules.reportKind(docs.find((x) => x.name === d.name) || d); // buy, surveillance or lab
        if (kind && d.role === 'report') d.reportKind = kind;
      }
      const evidence = await caseEvidence(c);
      const ruleFlags = CVRules.compare(ruleDocs, { ignore: ownDetails(), aliases, buys, pairs, evidence, kinds: pairOpts.kinds || {} });
      done(rulesStep);
      bar.value = useAI ? 35 : 90;

      // 3. AI review.
      let ai = null;
      let engineInfo = { mode: 'rules-only' };
      if (useAI && (affidavit || pairs.length)) {
        const aiStep = addStep(affidavit ? 'AI review' : 'AI: Buy and Surveillance narratives');
        const choice = Engine.choice();
        const det = Engine.detected;
        if (!choice) {
          done(aiStep, 'failed');
          aiStep.append(h('span', { class: 'small block' }, 'AI engine not available. Rules only.'));
        } else {
          const numCtx = CVAI.numCtxFor(choice.profile);
          engineInfo = { mode: 'ai', profile: choice.profile, model: choice.model, embed: det.embed || null, numCtx };
          // Time per statement, for "this one 0:07 · about 1:10 left".
          const timing = { index: -1, startedAt: 0, firstAt: 0, total: 0, phase: '' };
          const drawTiming = () => {
            if (timing.phase !== 'review' || timing.index < 0) return;
            const t = Date.now();
            const shown = Math.min(timing.index + 1, timing.total);
            const doneCount = timing.index;
            const perItem = doneCount > 0 ? (timing.startedAt - timing.firstAt) / doneCount : 0;
            const left = perItem ? Math.max(0, perItem * (timing.total - doneCount) - (t - timing.startedAt)) : 0;
            activity.replaceChildren(
              `Reviewing statement ${shown} of ${timing.total} with ${CVAI.modelName(choice.model)}…`,
              h('span', { class: 'block timing' }, `This statement: ${CVActivityLib.fmtElapsed(t - timing.startedAt)}`,
                perItem ? ` · about ${CVActivityLib.fmtElapsed(left)} left` : ' · estimating the time left…'));
          };
          const tick = setInterval(drawTiming, 1000);
          if (CVActivity.heavyBusy()) activity.textContent = 'Waiting for "Draft with AI" to finish…';
          try {
            ai = await CVActivity.exclusive('check', async (task) => {
              if (ctrl.signal.aborted) throw new DOMException('Cancelled', 'AbortError'); // cancelled while waiting
              const r = !affidavit ? { flags: [], stats: null, complete: true, stopped: null } : await CVAI.review({
                fetchImpl: Engine.fetchImpl(),
                docs,
                engine: { base: det.base, model: choice.model, embed: det.embed, numCtx },
                signal: ctrl.signal,
                aliases,
                ruleFlags,
                // v1.162: on a slow computer the AI stops early and the rule-based results stand:
                // at most 2 minutes for one statement (3 on the CPU-only Light profile), 20 in all.
                timeoutMs: choice.profile === 'light' ? 180000 : 120000,
                budgetMs: 20 * 60 * 1000,
                onProgress: (p) => {
                  timing.phase = p.phase;
                  if (p.phase === 'embed') {
                    activity.textContent = 'Indexing report passages…';
                    task.set('Indexing…');
                  } else {
                    if (p.done !== timing.index) {
                      const t = Date.now();
                      if (timing.index < 0) timing.firstAt = t;
                      timing.index = p.done;
                      timing.startedAt = t;
                      timing.total = p.total;
                    }
                    task.set(`Checking ${Math.min(p.done + 1, p.total)} of ${p.total}`);
                    drawTiming();
                  }
                  if (p.total) bar.value = 35 + Math.round((p.done / p.total) * (pairs.length ? 45 : 60));
                },
              });
              // v1.168: then each Buy report and its Surveillance report, read together.
              const pairStats = [];
              for (let k = 0; k < pairs.length && !r.stopped; k++) {
                if (ctrl.signal.aborted) return { ...r, complete: false };
                const pr = pairs[k];
                const label = `Comparing ${docs[pr.buy].name} with ${docs[pr.surv].name}`;
                activity.textContent = `${label} (${k + 1} of ${pairs.length})…`;
                task.set(`Narratives ${k + 1} of ${pairs.length}`);
                try {
                  const out = await CVAI.comparePair({
                    fetchImpl: Engine.fetchImpl(), buy: docs[pr.buy], surv: docs[pr.surv], aliases, signal: ctrl.signal,
                    engine: { base: det.base, model: choice.model, numCtx }, timeoutMs: choice.profile === 'light' ? 300000 : 180000,
                  });
                  r.flags.push(...out.flags);
                  pairStats.push({ buy: docs[pr.buy].name, surv: docs[pr.surv].name, ...out.stats, cut: out.cut });
                } catch (err) {
                  if (ctrl.signal.aborted) return { ...r, complete: false };
                  pairStats.push({ buy: docs[pr.buy].name, surv: docs[pr.surv].name, error: err.name === 'AbortError' ? 'too slow on this computer' : err.message });
                }
                bar.value = (affidavit ? 80 : 35) + Math.round(((k + 1) / pairs.length) * (affidavit ? 15 : 60));
              }
              return { ...r, pairStats };
            }, { label: 'Checking…', model: CVAI.modelName(choice.model) });
            done(aiStep, ai.complete ? 'done' : 'done warn');
          } catch (err) {
            done(aiStep, 'failed');
            if (err.name === 'AbortError' && ctrl.signal.aborted) {
              ai = null; // cancelled before the review started: nothing to keep
            } else {
              aiStep.append(h('span', { class: 'small block' }, `AI review stopped: ${err.message}`));
              ai = { flags: [], stats: null, complete: false, error: err.message };
            }
          } finally {
            clearInterval(tick);
          }
        }
      }
      if (ctrl.signal.aborted && !ai) throw new DOMException('Cancelled', 'AbortError');

      // 4. Save to the SSD.
      const saveStep = addStep('Saving to SSD');
      const rank = { High: 0, Medium: 1, Low: 2 };
      const flags = [...ruleFlags, ...(ai ? ai.flags : [])].sort((a, b) => rank[a.severity] - rank[b.severity]
        || a.statement.docIndex - b.statement.docIndex || a.statement.paragraph - b.statement.paragraph || a.statement.start - b.statement.start);
      const name = await Vault.newCheckName(c.id);
      const data = {
        schema: 1,
        app: 'CaseVault',
        appVersion: Vault.APP_VERSION,
        created: new Date().toISOString(),
        affidavit: affidavit || null,
        reports: docInfo.filter((d) => d.role === 'report').map((d) => d.name),
        documents: docInfo,
        docOrder: docs.map((d) => d.name),
        engine: engineInfo,
        ai: ai ? { stats: ai.stats, complete: ai.complete, error: ai.error || null, stopped: ai.stopped || null, ...(ai.pairStats ? { pairs: ai.pairStats } : {}) } : null,
        pairs: pairs.map((pr) => ({ buy: docs[pr.buy].name, surv: docs[pr.surv].name, why: pr.why })), // v1.168
        buys: buys.length,
        evidence: evidence.filter((e) => e.inventory).length, // v1.169
        complete: !ai || ai.complete,
        flags,
      };
      await Save.track(`check-new:${c.id}`, () => Vault.saveCheck(c.id, name, data));
      done(saveStep);
      bar.value = 100;
      finish();
      if (ai && ai.stopped) toast('The AI was too slow on this computer, so it stopped early. The rule-based checks cover every statement; the results were saved.', 'info', 10000);
      else if (!data.complete) toast('The AI review was stopped early. The results so far were saved.', 'info', 8000);
      go(c.id, 'checks', name);
    } catch (err) {
      finish();
      if (err.name === 'AbortError') return toast('Check cancelled. Nothing was saved.');
      if (FS.isDisconnectError(err)) return ui.onDriveLost();
      console.error(err);
      toast(`Check failed: ${err.message}`, 'error', 10000);
    }
  }

  // While a check runs, Esc must not close the progress window.
  function onCancel(e) { e.preventDefault(); }
  function dialogBlockEscape(on) {
    const d = document.getElementById('dialog');
    if (on) d.addEventListener('cancel', onCancel); else d.removeEventListener('cancel', onCancel);
  }

  /* =====================================================================
   * Results
   * ===================================================================== */

  // status: 'active' = everything but the dismissed flags (the default).
  const view = { severity: new Set(['High', 'Medium', 'Low']), status: 'active', layer: 'all', hideLow: false, group: 'kind' };

  async function renderResult(panel, c, token, name) {
    const { h, state, Save, fmtDateTime } = ui;
    let data;
    try {
      data = await Vault.readCheck(c.id, name);
    } catch (err) {
      if (FS.isDisconnectError(err) && err.name !== 'NotFoundError') throw err;
      data = null;
    }
    if (token !== state.renderToken) return;
    const back = h('a', { href: `#/case/${CVRoute.enc(c.id)}/checks`, class: 'back-link' }, '← All checks');
    if (!data) { panel.replaceChildren(back, h('p', { class: 'error-text' }, 'This check could not be read.')); return; }

    const save = () => {
      const snapshot = structuredClone(data);
      Save.schedule(`check:${c.id}:${name}`, () => Vault.saveCheck(c.id, name, snapshot), 500);
    };

    data.flags.forEach(upgradeFlag);
    const counts = { High: 0, Medium: 0, Low: 0 };
    for (const f of data.flags) counts[f.severity]++;
    const openCount = () => data.flags.filter((f) => f.status === 'open').length;

    const list = h('div', { class: 'flag-list' });
    const summaryOpen = h('span', {});
    const drawSummary = () => { summaryOpen.textContent = `${openCount()} of ${data.flags.length} still open`; };

    const statusOk = (f) => (view.status === 'all' ? true : view.status === 'active' ? f.status !== 'dismissed' : f.status === view.status);
    function draw() {
      const shown = data.flags.filter((f) => view.severity.has(f.severity)
        && (view.layer === 'all' || f.layer === view.layer)
        && !(view.hideLow && f.confidence === 'Low')
        && statusOk(f));
      const card = (f) => flagCard(c, data, f, save, () => { drawSummary(); if (view.status !== 'all') draw(); });
      let body;
      if (!shown.length) {
        body = [h('p', { class: 'muted' }, data.flags.length ? 'No flags match these filters.' : 'No inconsistencies were found. Still read the documents yourself: no flags is not proof of accuracy.')];
      } else if (view.group === 'kind') {
        // v1.162: grouped by kind (Names, Addresses, Money…), each group in its own order.
        body = GROUPS.map(([key, label]) => {
          const items = shown.filter((f) => groupOf(f) === key);
          if (!items.length) return null;
          const open = items.filter((f) => f.status === 'open').length;
          return h('section', { class: 'flag-group' },
            h('h3', { class: 'flag-group-head' }, label, h('span', { class: 'muted small' }, ` ${items.length} flag${items.length === 1 ? '' : 's'}${open !== items.length ? `, ${open} open` : ''}`)),
            ...items.map(card));
        }).filter(Boolean);
      } else body = shown.map(card);
      list.replaceChildren(...body);
      drawSummary();
    }

    const sevChips = ['High', 'Medium', 'Low'].map((s) => {
      const b = h('button', { 'data-ro-ok': 'true', type: 'button', class: `chip sev-${s.toLowerCase()} ${view.severity.has(s) ? 'on' : ''}`, title: SEVERITY_HELP[s], 'aria-pressed': String(view.severity.has(s)) }, `${s} ${counts[s]}`);
      b.addEventListener('click', () => {
        if (view.severity.has(s)) view.severity.delete(s); else view.severity.add(s);
        b.classList.toggle('on'); b.setAttribute('aria-pressed', String(view.severity.has(s)));
        draw();
      });
      return b;
    });
    const statusSel = h('select', { 'data-ro-ok': 'true', 'aria-label': 'Show' }, [['active', 'All but Dismissed'], ['open', 'Open only'], ['reviewed', 'Reviewed only'], ['dismissed', 'Dismissed only'], ['all', 'All flags']].map(([v, l]) => h('option', { value: v, selected: view.status === v }, l)));
    const groupSel = h('select', { 'data-ro-ok': 'true', 'aria-label': 'Group' }, [['kind', 'Grouped by Kind'], ['none', 'One List']].map(([v, l]) => h('option', { value: v, selected: view.group === v }, l)));
    groupSel.addEventListener('change', () => { view.group = groupSel.value; draw(); });
    const lowBox = h('input', { type: 'checkbox', 'data-ro-ok': 'true', checked: view.hideLow });
    lowBox.addEventListener('change', () => { view.hideLow = lowBox.checked; draw(); });
    const lowCount = data.flags.filter((f) => f.confidence === 'Low').length;
    const lowToggle = h('label', { class: 'check-row hide-low', title: 'Hide the flags the checker is least sure about' }, lowBox, h('span', {}, `Hide Low Confidence (${lowCount})`));
    statusSel.addEventListener('change', () => { view.status = statusSel.value; draw(); });
    const layerSel = h('select', { 'data-ro-ok': 'true', 'aria-label': 'Layer' }, [['all', 'Rules + AI'], ['rules', 'Rules only'], ['ai', 'AI only']].map(([v, l]) => h('option', { value: v, selected: view.layer === v }, l)));
    layerSel.addEventListener('change', () => { view.layer = layerSel.value; draw(); });

    const st = data.ai && data.ai.stats;
    const docsLine = (data.documents || []).map((d) => h('li', {},
      h('strong', {}, d.name), ` (${d.role === 'affidavit' ? 'checked' : d.reportKind ? `${KIND_NAME[d.reportKind] || 'Other'} report` : 'report'}${d.xfa ? ', XFA form' : ''}${d.pageCount ? `, ${d.pageCount} page${d.pageCount === 1 ? '' : 's'}` : ''})`,
      d.skipped ? h('span', { class: 'error-text' }, ` Skipped: ${d.error}`) : null,
      ...(d.warnings || []).map((w) => h('span', { class: 'warn-text block small' }, w))));

    // Documents that gave no usable text weren't really compared: say so above the results.
    const empty = (data.documents || []).filter((d) => !d.skipped && d.paragraphCount === 0);
    const emptyCard = empty.length ? h('div', { class: 'card warn-card', role: 'note' },
      h('strong', {}, `No usable text in ${empty.map((d) => d.name).join(', ')}.`),
      h('p', { class: 'small' }, `${empty.length === 1 ? 'This document was' : 'These documents were'} not compared, so a clean result doesn't mean ${empty.length === 1 ? 'it agrees' : 'they agree'}. See the notes under Documents below.`)) : null;

    // v1.169: a document changed (or was removed) since this check ran: say so, with Run Again.
    const nowFiles = await checkableFiles(c).catch(() => []);
    if (token !== state.renderToken) return;
    const changed = changedSince(data.documents, nowFiles);
    const staleCard = changed.length ? h('div', { class: 'card warn-card chk-stale-card', role: 'note' },
      h('strong', {}, 'Out of date. '),
      h('span', {}, `Changed since this check: ${changed.join(', ')}. The results may no longer be right.`),
      Vault.isArchived(c.id) ? null : h('button', { class: 'btn small primary', type: 'button', icon: 'arrow-repeat', onclick: async () => {
        const names = new Set(nowFiles.map((f) => f.name));
        const affDoc = (data.documents || []).find((d) => d.role === 'affidavit');
        const reports = (data.reports || []).filter((n) => names.has(n));
        const draft = affDoc && affDoc.draft ? { slug: affDoc.draft, title: String(data.affidavit || '').replace(/^Draft: /, '') } : null;
        const aff = draft ? data.affidavit : data.affidavit && names.has(data.affidavit) ? data.affidavit : null;
        if (!reports.length || (!aff && reports.length < 2)) { ui.toast('Not enough of those documents are still attached. Start a New Check.', 'error'); return; }
        await Engine.refresh();
        runCheck(c, aff, reports, !!(data.engine && data.engine.mode === 'ai') && Engine.status() === 'connected' && !!Engine.choice(), draft);
      } }, 'Run Again')) : null;

    panel.replaceChildren(
      back,
      banner(),
      ...(emptyCard ? [emptyCard] : []),
      ...(staleCard ? [staleCard] : []), // replaceChildren would print "null"
      h('div', { class: 'card result-head' },
        h('h2', {}, data.affidavit ? `Check of ${data.affidavit}` : 'Reports cross-check'),
        h('p', { class: 'muted' }, `${data.created ? fmtDateTime(Date.parse(data.created)) : ''} · `,
          data.engine && data.engine.mode === 'ai' ? `Rules + AI (${CVAI.modelName(data.engine.model)})` : 'Rules only', ' · ', summaryOpen),
        h('ul', { class: 'doc-list' }, docsLine),
        // v1.168: the Buy and Surveillance reports checked together.
        (data.pairs || []).length ? h('div', { class: 'chk-pairs' }, h('strong', {}, 'Checked as pairs: '),
          h('ul', {}, ...data.pairs.map((pr) => {
            const ps = ((data.ai && data.ai.pairs) || []).find((x) => x.buy === pr.buy && x.surv === pr.surv);
            return h('li', {}, `${pr.buy} with ${pr.surv}`, h('span', { class: 'muted small' }, ` (${pr.why})`),
              // v1.171: the two reports' events side by side, by time.
              h('button', { class: 'btn small chk-order-btn', type: 'button', icon: 'clock-history', 'data-ro-ok': 'true', onclick: () => orderOfEventsDialog(c, pr.buy, pr.surv) }, 'Order of Events'),
              ps ? h('span', { class: 'small block' }, ps.error ? `AI narrative comparison stopped: ${ps.error}.`
                : `AI compared the narratives: ${ps.kept} difference${ps.kept === 1 ? '' : 's'} found${ps.discarded ? `, ${ps.discarded} answer${ps.discarded === 1 ? '' : 's'} discarded (quote not found in the reports)` : ''}${ps.cut ? '. The reports were too long to read whole; the end of one was left out' : ''}.`) : null);
          }))) : null,
        st ? h('p', { class: 'small' },
          `AI reviewed ${st.reviewed} of ${st.statements} statements: ${st.supported} supported, ${st.contradicted} contradicted, ${st.notFound} not found.`,
          st.skipped ? ` ${st.skipped} needed no AI: the rules had already flagged them, or a report says the same word for word.` : '',
          st.discarded ? h('strong', {}, ` ${st.discarded} AI answer${st.discarded === 1 ? ' was' : 's were'} discarded because the quoted text was not found in the reports.`) : '') : null,
        data.ai && data.ai.stopped ? h('p', { class: 'warn-text small' }, `The AI was too slow on this computer${data.ai.stopped === 'time' ? ' to finish in 20 minutes' : ''}, so it stopped early. The rule-based checks still cover every statement.`)
          : data.ai && !data.ai.complete ? h('p', { class: 'warn-text small' }, `The AI review did not finish${data.ai.error ? ` (${data.ai.error})` : ''}. Statements after that point were not reviewed by AI.`) : null,
        h('div', { class: 'row result-foot' },
          h('p', { class: 'muted small explain' }, `Saved on the SSD: ${CVFormat.pathText(`${Vault.isArchived(c.id) ? 'archive' : 'cases'}\\${c.id}\\checks\\${name}`)}`),
          h('div', { class: 'spacer' }),
          h('button', { class: 'btn small ghost danger-text', type: 'button', onclick: () => deleteCheck(c, name, data) }, 'Delete this check'))),
      h('div', { class: 'filters' }, sevChips, lowToggle, h('div', { class: 'spacer' }), groupSel, layerSel, statusSel),
      list);
    draw();
  }

  async function deleteCheck(c, name, data) {
    const { confirmDialog, Save, toast, go } = ui;
    const when = data.created ? ui.fmtDateTime(Date.parse(data.created)) : name;
    const ok = await confirmDialog({
      title: 'Delete this check?',
      message: `The check of ${data.affidavit || 'the reports'} from ${when} is deleted from the SSD, with its flags and notes. The documents themselves are not touched.`,
      confirmText: 'Delete check',
      danger: true,
    });
    if (!ok) return;
    const key = `check:${c.id}:${name}`;
    const pending = Save.timers.get(key);
    if (pending) { clearTimeout(pending.timer); Save.timers.delete(key); }
    try {
      await Save.track(`delete-check:${c.id}:${name}`, () => Vault.deleteCheck(c.id, name));
      toast('Check deleted.');
      go(c.id, 'checks');
    } catch { /* reported by Save */ }
  }

  function flagCard(c, data, f, save, onChange) {
    const { h } = ui;
    upgradeFlag(f);
    const note = h('textarea', { rows: 2, class: 'flag-note', placeholder: 'Why it was dismissed', 'aria-label': 'Note' });
    note.value = f.note || '';
    note.hidden = f.status === 'open' && !f.note;
    note.addEventListener('input', () => { f.note = note.value; save(); });

    const card = h('article', { class: `flag sev-${f.severity.toLowerCase()} status-${f.status}` });
    const ACTIONS = ['reviewed', 'dismissed'];
    const buttons = ACTIONS.map((s) => {
      const b = h('button', { type: 'button', class: `btn small ${f.status === s ? 'active' : ''}`, 'aria-pressed': String(f.status === s), icon: s === 'reviewed' ? 'check2' : 'x-lg' }, STATUS_LABEL[s]);
      b.addEventListener('click', () => {
        f.status = f.status === s ? 'open' : s;
        f.reviewed = f.status === 'open' ? null : new Date().toISOString();
        buttons.forEach((x, i) => {
          const on = ACTIONS[i] === f.status;
          x.classList.toggle('active', on); x.setAttribute('aria-pressed', String(on));
        });
        card.className = `flag sev-${f.severity.toLowerCase()} status-${f.status}`;
        if (f.status !== 'open') note.hidden = false;
        save();
        onChange();
      });
      return b;
    });

    // v1.170: Use <value>: a mismatch in a checked draft is corrected in the draft (never in an attached file).
    const affDoc = (data.documents || []).find((d) => d.role === 'affidavit');
    const draftSlug = affDoc && affDoc.draft && f.statement && f.statement.doc === data.affidavit ? affDoc.draft : null;
    const fixBtn = f.fix && draftSlug && !Vault.isArchived(c.id) ? h('button', { type: 'button', class: 'btn small primary flag-fix', title: `Puts ${f.fix.to} in the draft in place of ${f.fix.from}`, onclick: async () => {
      try {
        await CVLazy.reports();
        const d = await Vault.readDraft(c.id, draftSlug);
        if (!d) { ui.toast('That draft no longer exists.', 'error'); return; }
        const next = CVDraftFacts.applyFix(d.body, f.statement.text, f.fix);
        if (next == null) { ui.toast(`"${f.fix.from}" isn't in the draft as written now; change it there by hand.`, 'info'); return; }
        await ui.Save.track(`draft:${c.id}:${draftSlug}`, () => Vault.saveDraft(c.id, draftSlug, d.meta, next));
        f.status = 'reviewed'; f.reviewed = new Date().toISOString();
        f.note = [f.note, `Changed ${f.fix.from} to ${f.fix.to} in the draft.`].filter(Boolean).join(' ');
        save(); onChange();
        ui.toast(`Changed ${f.fix.from} to ${f.fix.to} in the draft.`, 'success');
        fixBtn.disabled = true;
      } catch (err) { if (FS.isDisconnectError(err)) ui.onDriveLost(); }
    } }, `Use ${f.fix.to}`) : null;

    // v1.170: Explain: the AI on this PC says what differs and why it matters, with a suggested rewording.
    const explainBox = h('div', { class: 'flag-explain', hidden: !f.explain });
    const drawExplain = () => {
      if (!f.explain) { explainBox.hidden = true; return; }
      explainBox.hidden = false;
      explainBox.replaceChildren(h('p', {}, h('strong', {}, 'Explained: '), f.explain.explanation),
        f.explain.suggestion ? h('p', { class: 'flag-suggest' }, h('strong', {}, 'Suggested wording: '), h('q', {}, f.explain.suggestion),
          h('button', { type: 'button', class: 'btn small', icon: 'copy', 'data-ro-ok': 'true', onclick: async () => { try { await navigator.clipboard.writeText(f.explain.suggestion); ui.toast('Copied.', 'success'); } catch { ui.toast('Could not copy.', 'error'); } } }, 'Copy')) : null,
        h('p', { class: 'muted small' }, `AI (${CVAI.modelName(f.explain.model || '')}): a suggestion only. Check it against the documents.`));
    };
    drawExplain();
    const explainBtn = Engine.status() === 'connected' && Engine.choice() && f.layer === 'rules' ? h('button', { type: 'button', class: 'btn small', icon: 'chat-left-text', 'data-ro-ok': 'true', title: 'The AI on this PC explains this flag in plain words and suggests a rewording', onclick: async () => {
      const choice = Engine.choice(); const det = Engine.detected;
      explainBtn.disabled = true;
      explainBox.hidden = false; explainBox.replaceChildren(h('p', { class: 'muted small' }, 'Asking the AI…'));
      try {
        const out = await CVActivity.exclusive('check', () => CVAI.explainFlag({ flag: f, fetchImpl: Engine.fetchImpl(), engine: { base: det.base, model: choice.model, numCtx: CVAI.numCtxFor(choice.profile) } }), { label: 'Explaining…', model: CVAI.modelName(choice.model) });
        f.explain = { ...out, model: choice.model };
        save(); drawExplain();
      } catch (err) {
        explainBox.replaceChildren(h('p', { class: 'error-text small' }, `The AI could not explain it: ${err.message}`));
      } finally { explainBtn.disabled = false; }
    } }, f.explain ? 'Explain Again' : 'Explain') : null;

    const quote = (loc, label) => h('button', { 'data-ro-ok': 'true', type: 'button', class: 'quote', title: 'Show this in the document', onclick: () => openLocation(c, data, loc) },
      h('span', { class: 'quote-where' }, label, ': ', where(loc)),
      h('span', { class: 'quote-text' }, '“', markText(loc.text, loc.highlight), '”'));

    card.append(
      h('header', { class: 'flag-head' },
        h('span', { class: `pill sev sev-${f.severity.toLowerCase()}`, title: SEVERITY_HELP[f.severity] }, f.severity),
        h('span', { class: `pill conf conf-${f.confidence.toLowerCase()}`, title: CONFIDENCE_HELP[f.confidence] }, `${f.confidence} Confidence`),
        h('span', { class: 'layer-badge' }, f.layer === 'ai' ? 'AI' : 'Rules'),
        h('strong', { class: 'flag-title' }, f.title)),
      h('div', { class: 'flag-sides' },
        quote(f.statement, data.affidavit && f.statement.doc === data.affidavit ? 'Statement' : 'Says'),
        f.source ? quote(f.source, 'Source') : h('div', { class: 'quote none' }, h('span', { class: 'quote-where' }, 'Source'), h('span', { class: 'muted' }, f.sourceLabel || (f.type === 'total' ? 'The same passage' : 'Not found in the reports')))),
      f.detail ? h('p', { class: 'flag-detail muted small' }, f.detail) : null,
      explainBox,
      h('div', { class: 'flag-actions' }, ...(fixBtn ? [fixBtn] : []), ...buttons, ...(explainBtn ? [explainBtn] : []), f.status !== 'open' && f.reviewed ? h('span', { class: 'muted small' }, `${f.status === 'dismissed' ? 'Dismissed' : 'Reviewed'} ${ui.fmtDateTime(Date.parse(f.reviewed))}`) : null),
      note);
    return card;
  }

  /* =====================================================================
   * Jump to location
   * ===================================================================== */

  async function openLocation(c, data, loc) {
    const { h, openDialog, toast } = ui;
    const info = (data.documents || []).find((d) => d.name === loc.doc);
    let doc;
    try {
      doc = await documentText(c, loc.doc, () => {}, info);
    } catch (err) {
      if (FS.isDisconnectError(err) && err.name !== 'NotFoundError') return ui.onDriveLost();
      return toast(err.message, 'error');
    }
    const changed = info && info.size != null && (info.size !== doc.size || info.modified !== doc.modified);
    await openDialog((close) => {
      let lastPage = null;
      const body = h('div', { class: 'doc-view' });
      for (const p of doc.paragraphs) {
        const section = p.sheet != null ? `Sheet: ${p.sheet}` : p.field != null ? 'Form fields' : p.page ? `Page ${p.page}` : null;
        if (section && section !== lastPage) { body.append(h('div', { class: 'doc-page' }, section)); lastPage = section; }
        const isTarget = p.index === loc.paragraph;
        let content = [p.text];
        if (isTarget && loc.end > loc.start && p.text.slice(loc.start, loc.end) === loc.text) {
          const inner = markText(loc.text, loc.highlight);
          content = [p.text.slice(0, loc.start), h('mark', { class: 'sentence' }, inner), p.text.slice(loc.end)];
        }
        body.append(h('p', { class: isTarget ? 'target' : '' }, content));
      }
      return h('div', { class: 'preview' },
        h('div', { class: 'preview-head' },
          h('h2', {}, loc.doc),
          h('span', { class: 'muted small' }, at(loc) || ''),
          h('div', { class: 'spacer' }),
          h('button', { class: 'btn', type: 'button', onclick: () => {
            close();
            if (info && info.kind === 'draft') ui.go(c.id, 'reports', info.draft);
            else ui.previewFile(c, loc.doc, loc.page, loc.sheet != null ? { sheet: loc.sheet, row: loc.row } : loc.field != null ? { field: loc.field } : null);
          } }, info && info.kind === 'draft' ? 'Open draft' : 'Open original'),
          h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Close')),
        changed ? h('p', { class: 'warn-text small' }, 'This file has changed since the check was run. The highlighted text may have moved.') : null,
        body);
    });
  }

  // Scroll the highlighted paragraph into view whenever the document viewer opens.
  new MutationObserver(() => {
    const t = document.querySelector('#dialog[open] .doc-view .target');
    if (t && !t.dataset.scrolled) { t.dataset.scrolled = '1'; t.scrollIntoView({ block: 'center' }); }
  }).observe(document.documentElement, { subtree: true, childList: true });

  /* =====================================================================
   * Public
   * ===================================================================== */

  function init(kit) {
    ui = kit;
    const pill = document.getElementById('engine-status');
    if (pill) pill.addEventListener('click', () => { if (Vault.data) showEngineDialog(); });
    setInterval(() => { if (!document.hidden && Vault.data) Engine.refresh(); }, 60000);
    if (typeof CVHardware !== 'undefined') {
      CVHardware.onChange(() => { if (Vault.data) renderPill(); });
      CVHardware.probeGpu();
    }
  }

  function onVaultOpen() {
    renderPill();
    Engine.refresh();
  }

  /**
   * v1.173: Check the Mission: the rules check (no AI) on every case number of a Mission, one after
   * the other, each saved as that case's check (an affidavit is picked by its name, as on the
   * Checks tab; without one the reports are checked against each other), then a summary with a
   * link to each, and the inventory numbers two case numbers both list.
   */
  async function checkMission(members) {
    const { h, openDialog, toast } = ui;
    const steps = h('ol', { class: 'progress-steps' });
    let close = null;
    openDialog((done) => { close = done; return h('div', { class: 'progress-panel' }, h('h2', {}, 'Checking the Mission'), steps); });
    const results = [];
    const evidenceAll = [];
    try {
      for (const e of members.filter((x) => !Vault.isArchived(x.id))) {
        const li = h('li', { class: 'running' }, `${e.number || 'No case number'}…`); steps.append(li);
        const c = await Vault.getCase(e.id);
        evidenceAll.push({ number: c.number, evidence: await caseEvidence(c) });
        // Photos (exhibits, labels) are left out: only the written reports are compared.
        const files = (await checkableFiles(c)).filter((f) => !/\.(jpe?g|png|webp|bmp|gif|tiff?|heic)$/i.test(f.name));
        const aff = (files.find((f) => /affidavit|affid|declaration|probable cause/i.test(f.name)) || {}).name || null;
        const reports = files.map((f) => f.name).filter((n) => n !== aff);
        if (!reports.length || (!aff && reports.length < 2)) { li.className = 'done warn'; li.append(h('span', { class: 'small block' }, 'Not enough documents to compare.')); results.push({ c, skipped: true }); continue; }
        const docs = []; const docInfo = [];
        for (const name of [aff, ...reports].filter(Boolean)) {
          const role = name === aff ? 'affidavit' : 'report';
          try {
            const d = await documentText(c, name, () => {});
            docs.push({ name, role, paragraphs: d.paragraphs, docIndex: docs.length });
            docInfo.push({ name, role, kind: d.kind, pageCount: d.pageCount, paragraphCount: d.paragraphs.length, ocrPages: d.ocrPages || [], warnings: d.warnings || [], size: d.size, modified: d.modified });
          } catch (err) { if (FS.isDisconnectError(err)) throw err; docInfo.push({ name, role, error: err.message, skipped: true }); }
        }
        let buys = [];
        try { buys = ((await Vault.getTimeline(c.id)).events || []).filter((x) => x.kind === 'buy').map((x) => ({ date: x.date, suspect: x.suspect || '', drug: x.drug || '', qty: x.qty, unit: x.unit || 'g', paid: x.paid })); } catch (err) { if (FS.isDisconnectError(err)) throw err; }
        const ruleDocs = docs.map((d) => ({ id: d.docIndex, name: d.name, role: d.role, paragraphs: d.paragraphs }));
        const pairOpts = c.checkPairs || {};
        const pairs = CVRules.pairReports(ruleDocs, pairOpts);
        for (const d of docInfo) { const k = (pairOpts.kinds || {})[d.name]; const doc = docs.find((x) => x.name === d.name); const kind = d.skipped || !doc ? '' : k === 'other' ? '' : k || CVRules.reportKind(doc); if (kind && d.role === 'report') d.reportKind = kind; }
        const evidence = evidenceAll[evidenceAll.length - 1].evidence;
        const flags = CVRules.compare(ruleDocs, { ignore: ownDetails(), aliases: CVText.parseAliases(caseAliasText(c)), buys, pairs, evidence, kinds: pairOpts.kinds || {} });
        const name = await Vault.newCheckName(c.id);
        await ui.Save.track(`check-new:${c.id}`, () => Vault.saveCheck(c.id, name, {
          schema: 1, app: 'CaseVault', appVersion: Vault.APP_VERSION, created: new Date().toISOString(), affidavit: aff, reports: docInfo.filter((d) => d.role === 'report').map((d) => d.name),
          documents: docInfo, docOrder: docs.map((d) => d.name), engine: { mode: 'rules-only' }, ai: null, buys: buys.length, evidence: evidence.filter((x) => x.inventory).length,
          pairs: pairs.map((pr) => ({ buy: docs[pr.buy].name, surv: docs[pr.surv].name, why: pr.why })), complete: true, fromMission: true, flags,
        }));
        const counts = { High: 0, Medium: 0, Low: 0 };
        for (const f of flags) counts[f.severity]++;
        results.push({ c, name, counts, docs: docs.length });
        li.className = 'done';
        li.append(h('span', { class: 'small block' }, `${docs.length} documents · ${counts.High} High, ${counts.Medium} Medium, ${counts.Low} Low`));
      }
    } catch (err) {
      if (close) close();
      if (FS.isDisconnectError(err)) { ui.onDriveLost(); return; }
      toast(`The Mission check stopped: ${err.message}`, 'error', 9000); return;
    }
    if (close) close();
    const shared = root.CVMissionTools ? CVMissionTools.sharedInventory(evidenceAll) : [];
    await openDialog((done) => h('div', { class: 'mission-check' },
      h('h2', { icon: 'clipboard2-check' }, 'Mission Check'),
      h('p', { class: 'muted small' }, 'The rules check of each case number (no AI), saved on each case\'s Checks tab.'),
      shared.length ? h('div', { class: 'card warn-card' }, h('strong', {}, 'The same inventory number on two case numbers'),
        h('ul', { class: 'small' }, ...shared.map((x) => h('li', {}, `Inventory #${x.inventory}: ${x.cases.join(', ')}. One exhibit should be on one case number's evidence list.`)))) : null,
      h('div', { class: 'table-wrap' }, h('table', { class: 'data-table mission-check-table' },
        h('thead', {}, h('tr', {}, ...['Case Number', 'Documents', 'High', 'Medium', 'Low', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, ...results.map((r) => h('tr', {},
          h('td', {}, r.c.number || 'No case number'),
          r.skipped ? h('td', { colspan: 4, class: 'muted small' }, 'Not enough documents to compare') : h('td', {}, String(r.docs)),
          ...(r.skipped ? [] : ['High', 'Medium', 'Low'].map((k) => h('td', {}, h('span', { class: `sev-count sev-${k.toLowerCase()}` }, String(r.counts[k]))))),
          h('td', {}, r.skipped ? null : h('a', { class: 'btn small', href: `#/case/${CVRoute.enc(r.c.id)}/checks/${CVRoute.enc(r.name)}`, onclick: () => done() }, 'Open Check'))))))),
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => done() }, 'Done'))));
    return results;
  }

  /** Run a consistency check on a draft against every checkable attached document,
   *  except the draft's own exported copies (draft.exclude). */
  async function checkDraft(c, draft) {
    const skip = new Set(draft.exclude || []);
    const reports = (await checkableFiles(c)).map((f) => f.name).filter((n) => !skip.has(n));
    if (!reports.length) {
      ui.toast('Attach the reports on the Files tab first, then run the check again.', 'error', 8000);
      return;
    }
    await Engine.refresh();
    const useAI = Engine.status() === 'connected' && !!Engine.choice();
    return runCheck(c, `Draft: ${draft.title}`, reports, useAI, draft);
  }

  /* v1.169: check before export. Before a draft leaves the Drafts tab (Export, PDF View, Word
   * View), the rules compare it with the case's documents (photos aside, at most ~15 seconds of
   * reading; the text is kept on the SSD after the first time). Sure mismatches (High, not Low
   * confidence) in the draft are shown, with Run Full Check, Cancel and Export Anyway. Text you
   * chose to export anyway isn't asked about again. */
  const exportOk = new Map(); // `${caseId}:${slug}` -> the text exported anyway
  async function preflight(c, { title, text, exclude = [] }) {
    if (!String(text || '').trim()) return [];
    const files = (await checkableFiles(c)).filter((f) => !exclude.includes(f.name) && CVExtract.kindOf(f.name) !== 'image');
    if (!files.length) return [];
    const docs = [{ name: `Draft: ${title || 'Draft'}`, role: 'affidavit', paragraphs: CVExtract.paragraphsFromText(CVDraft.stripMarkdown(text), null) }];
    const until = Date.now() + 15000;
    for (const f of files) {
      if (Date.now() > until) break;
      try { const d = await documentText(c, f.name, () => {}); if (d.paragraphs.length) docs.push({ name: f.name, role: 'report', paragraphs: d.paragraphs }); } catch (err) { if (FS.isDisconnectError(err)) throw err; }
    }
    if (docs.length < 2) return [];
    const caseNow = await Vault.getCase(c.id).catch(() => c);
    let buys = [];
    try { buys = ((await Vault.getTimeline(c.id)).events || []).filter((e) => e.kind === 'buy').map((e) => ({ date: e.date, suspect: e.suspect || '', drug: e.drug || '', qty: e.qty, unit: e.unit || 'g', paid: e.paid })); } catch (err) { if (FS.isDisconnectError(err)) throw err; }
    const ruleDocs = docs.map((d, i) => ({ id: i, ...d }));
    const flags = CVRules.compare(ruleDocs, {
      ignore: ownDetails(), aliases: CVText.parseAliases(caseAliasText(caseNow)), buys,
      pairs: CVRules.pairReports(ruleDocs, caseNow.checkPairs || {}), evidence: await caseEvidence(c), kinds: (caseNow.checkPairs || {}).kinds || {},
    });
    return flags.filter((f) => f.severity === 'High' && f.confidence !== 'Low' && f.statement && f.statement.docIndex === 0);
  }
  /** v1.170: details that never belong in a report that goes out: a Social Security, payment card,
   * bank account or passport number, and the terms on the watch list (Settings), such as a
   * confidential informant's real name. Names, addresses, phones and plates are a report's business.
   * -> [{ label, value }] */
  const PRIVATE = new Set(['ssn', 'card', 'bank', 'passport', 'known']);
  function privacyFindings(text) {
    const P = root.CVPii;
    if (!P || !String(text || '').trim()) return [];
    const watch = (Vault.data && Vault.data.settings && Vault.data.settings.piiWatchlist) || [];
    const known = P.knownTerms({ watchlist: watch });
    const seen = new Set();
    return P.scan(String(text), { known }).filter((f) => PRIVATE.has(f.type)).filter((f) => { const k = `${f.type}|${f.value.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .map((f) => ({ label: f.type === 'known' ? 'On your watch list' : f.label, value: f.value }));
  }

  /** -> true to go on with the export. draft: { slug, title, text, exclude } */
  async function confirmExport(c, draft) {
    const key = `${c.id}:${draft.slug}`;
    if (exportOk.get(key) === draft.text) return true;
    let flags = [];
    try { flags = await preflight(c, draft); } catch (err) { if (FS.isDisconnectError(err)) throw err; } // never block an export on the check itself
    let priv = [];
    try { priv = privacyFindings(CVDraft.stripMarkdown(draft.text)); } catch { /* the scan is a safety net */ }
    if (!flags.length && !priv.length) return true;
    const { h, openDialog } = ui;
    const choice = await openDialog((close) => h('div', { class: 'export-check' },
      h('h2', { icon: 'clipboard2-check' }, 'Before You Export'),
      priv.length ? h('div', { class: 'export-private' },
        h('p', {}, h('strong', {}, 'Private details: '), 'this draft has details that usually must not go out:'),
        h('ul', { class: 'export-check-list' }, ...priv.slice(0, 8).map((x) => h('li', {}, h('strong', {}, x.label), `: ${x.value}`)))) : null,
      flags.length ? h('p', {}, `${flags.length} thing${flags.length === 1 ? '' : 's'} in this draft ${flags.length === 1 ? 'doesn\'t' : 'don\'t'} match the case's documents:`) : null,
      flags.length ? h('ul', { class: 'export-check-list' }, ...flags.slice(0, 6).map((f) => h('li', {}, h('strong', {}, f.title), h('span', { class: 'muted small block' }, f.detail)))) : null,
      flags.length > 6 ? h('p', { class: 'muted small' }, `And ${flags.length - 6} more. Run Full Check lists them all.`) : null,
      h('div', { class: 'dialog-actions' },
        flags.length ? h('button', { class: 'btn', type: 'button', onclick: () => close('check') }, 'Run Full Check') : null,
        h('button', { class: 'btn', type: 'button', onclick: () => close('cancel') }, 'Cancel'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => close('go') }, 'Export Anyway'))));
    if (choice === 'go') { exportOk.set(key, draft.text); return true; }
    if (choice === 'check') checkDraft(c, { slug: draft.slug, title: draft.title, exclude: draft.exclude || [] });
    return false;
  }

  root.CVChecks = { init, render, onVaultOpen, renderPill, Engine, documentText, checkDraft, profileLabel, preflight, confirmExport, changedSince, ownDetails, privacyFindings, caseAliasText, checkMission };
})(this);
