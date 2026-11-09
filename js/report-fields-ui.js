/* CaseVault — Reports → Report Fields: the form (js/report-fields.js has the fields and the text
 * conversions). Saved in the case folder as report-fields.json, a moment after each change and
 * with Save changes.
 */
'use strict';

(function (root) {
  let ui = null;
  const F = () => root.CVReportFields;
  const FILE = 'report-fields.json';

  async function load(c) {
    let d = null;
    try { d = await Vault.readCaseJSON(c.id, FILE); } catch (err) { if (FS.isDisconnectError(err)) throw err; }
    const x = F().normalize(d); // older saves brought up to date (v1.20 fields and evidence types)
    // v1.110: the Draft form only: old short IUCR wording ("Delv: Hallucinogens") is written out.
    // Reports already sent keep the wording they were sent with.
    F().updateOldUcr(x);
    return x;
  }

  // Exhibit numbers already given in this case and in every case with the same agency case number.
  async function numbersInUse(c, data) {
    const nums = [...data.evidence.map((e) => e.number), data.lastExhibit || 0];
    const agency = String(c.agencyNumber || '').trim().toLowerCase();
    if (!agency) return nums;
    const others = (Vault.data.cases || []).filter((x) => x.id !== c.id && String(x.agencyNumber || '').trim().toLowerCase() === agency);
    for (const o of others) {
      try {
        const d = await Vault.readCaseJSON(o.id, FILE);
        if (d) nums.push(...(d.evidence || []).map((e) => e.number), d.lastExhibit || 0);
      } catch (err) { if (FS.isDisconnectError(err)) throw err; }
    }
    return nums;
  }

  // A photo in the case files as a JPEG (at most 1600 px, readable in print) -> { jpeg, w, h }.
  async function toJpeg(c, path) {
    const bmp = await createImageBitmap(await Vault.readFile(c.id, path));
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const cv = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(bmp, 0, 0, cv.width, cv.height);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.88));
    return { jpeg: new Uint8Array(await blob.arrayBuffer()), w: cv.width, h: cv.height };
  }

  // v1.104: a PDF can be attached to an exhibit as well as photos. Each of its pages goes into the
  // report as an attachment page, the same as a photo (at most 1600 px, readable in print).
  const isPdf = (path) => /\.pdf$/i.test(String(path || ''));
  async function pdfPageCanvas(page, maxSide) {
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(2.5, maxSide / Math.max(base.width, base.height)) });
    const cv = Object.assign(document.createElement('canvas'), { width: Math.ceil(vp.width), height: Math.ceil(vp.height) });
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    return cv;
  }
  async function withPdf(c, path, fn) {
    const lib = await CVExtract.loadPdfjs();
    const task = CVExtract.openPdf(lib, new Uint8Array(await (await Vault.readFile(c.id, path)).arrayBuffer()));
    try { return await fn(await task.promise); } finally { await task.destroy(); }
  }
  const jpegOf = async (cv) => new Uint8Array(await (await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.88))).arrayBuffer());
  async function pdfJpegs(c, path) {
    return withPdf(c, path, async (doc) => {
      const out = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const cv = await pdfPageCanvas(page, 1600);
        out.push({ jpeg: await jpegOf(cv), w: cv.width, h: cv.height });
        page.cleanup();
      }
      return out;
    });
  }
  /** One attached file -> its pages as JPEGs (a photo is one page). */
  async function fileJpegs(c, path) { return isPdf(path) ? pdfJpegs(c, path) : [await toJpeg(c, path)]; }
  const pageNote = (k, n) => (n > 1 ? ` (page ${k + 1} of ${n})` : '');
  /** The picture on an exhibit's tile: the photo, or the first page of a PDF. */
  function showThumb(c, path, img) {
    const done = (blob) => { img.src = URL.createObjectURL(blob); img.addEventListener('load', () => URL.revokeObjectURL(img.src), { once: true }); };
    const fail = () => { img.alt = isPdf(path) ? 'PDF not found' : 'Photo not found'; };
    if (!isPdf(path)) { Vault.readFile(c.id, path).then(done).catch(fail); return; }
    img.classList.add('rf-thumb-pdf');
    withPdf(c, path, async (doc) => { const page = await doc.getPage(1); const cv = await pdfPageCanvas(page, 480); page.cleanup(); return new Promise((res) => cv.toBlob(res, 'image/png')); }).then(done).catch(fail);
  }
  const PICK_ACCEPT = 'image/*,application/pdf,.pdf';

  async function photoJpegs(c, data) {
    const out = [];
    if (F().isHidden(data, 'evidence')) return out;
    for (const e of data.evidence) {
      for (const [j, path] of (e.photos || []).entries()) {
        try {
          const pages = await fileJpegs(c, path);
          const caption = `${F().exhibitLine(e).replace(/^Exhibit \S+?(?=[,:])/, `Exhibit ${F().photoLabel(e.number, j)}`)}${String((e.photoLabels || [])[j] || '').trim() ? ` - ${isPdf(path) ? 'Document' : 'Photo'}: ${String(e.photoLabels[j]).trim()}` : ''}`;
          pages.forEach((pg, k) => out.push({ ...pg, caption: caption + pageNote(k, pages.length) }));
        } catch { /* a photo or PDF that can't be read is left out */ }
      }
    }
    // v1.68: the Additional Exhibits after the inventoried ones.
    for (const x of data.extraExhibits || []) out.push(...await extraJpegs(c, x));
    return out;
  }
  async function extraJpegs(c, x) {
    const out = [];
    for (const [j, path] of (x.photos || []).entries()) {
      try { const pages = await fileJpegs(c, path); pages.forEach((pg, k) => out.push({ ...pg, caption: F().extraCaption(x, j) + pageNote(k, pages.length) })); } catch { /* left out */ }
    }
    return out;
  }

  /* ---- One report, one PDF (v1.32): the Write Report tab keeps a linked "Supplementary Report" under
   * Reports, and the PDF saved from either place is the same file, made from the form. ---- */
  const LINKED = 'supplementary-report';
  const PDF_NAME = 'Supplementary Report.pdf';
  const BASE_TITLE = 'Supplementary Report';
  // v1.33: each draft sent from the Write Report tab is its own report: "Supplementary Report", then
  // (after Clear All) "Supplementary Report 2", and so on.
  const titleOf = (slug) => { const m = /^supplementary-report-(\d+)$/.exec(slug || ''); return m ? `${BASE_TITLE} ${m[1]}` : BASE_TITLE; };
  // (Spacing and table marks don't count: the Formatted view may lay a table out again.)
  const sigOf = (text) => { const t = String(text || '').replace(/[\s|:\-]+/g, ''); let n = 5381; for (let i = 0; i < t.length; i++) n = ((n * 33) ^ t.charCodeAt(i)) >>> 0; return `${t.length}:${n.toString(36)}`; };

  /** The form as the PDF's bytes (with the exhibit photos). */
  async function pdfFor(c, data) {
    const d = data || await load(c);
    const p = Vault.data.settings.affiant || {};
    return CVReportPdf.build(d, { letterhead: root.CVLetterhead ? await root.CVLetterhead.forPdf() : null, agency: p.agency || '', caseLabel: [c.title, c.number ? `Case ${c.number}` : ''].filter(Boolean).join(' · '), printed: '', photos: await photoJpegs(c, d) });
  }

  /** Saves the PDF in the case's Supplementary Report folder, in place of the one saved before. */
  async function savePdfToCase(c, data, bytes, title = BASE_TITLE) {
    const b = bytes || await pdfFor(c, data);
    const file = new File([b], `${title}.pdf`, { type: 'application/pdf' });
    const path = await ui.Save.track(`report-pdf:${c.id}`, () => Vault.addFile(c.id, file, { folder: 'Supplementary Report', description: title, replace: true }));
    return { path, bytes: b };
  }

  /** The linked report under Saved Reports: { slug, edited } (edited: its text was changed in Reports). */
  async function linkedReport(c, slug = LINKED) {
    const d = await Vault.readDraft(c.id, slug).catch(() => null);
    if (!d || !d.meta.fromFields) return null;
    return { slug, edited: sigOf(d.body) !== d.meta.fieldsSig, meta: d.meta, body: d.body };
  }

  /** The report the form on the Write Report tab goes to now ('' before it's first sent). */
  async function sentSlugOf(c, data) {
    const d = data || await load(c);
    if (typeof d.sentSlug === 'string') return d.sentSlug; // '' after Clear All: the next send makes a new report
    return (await linkedReport(c, LINKED)) ? LINKED : ''; // sent with v1.32
  }

  /** Writes the form into the linked report (made the first time). An edited one is replaced only
   * when force is set. -> { slug, kept } */
  async function syncLinked(c, data, { force = false, slug = LINKED, title = '' } = {}) {
    const cur = await linkedReport(c, slug);
    if (cur && cur.edited && !force) return { slug, kept: true };
    title = title || (cur && cur.meta.title) || titleOf(slug);
    const body = F().toMarkdown(data, title);
    const meta = { ...(cur ? cur.meta : { created: new Date().toISOString() }), title, type: 'supplemental', ai: false, fromFields: true, fieldsSig: sigOf(body) };
    await ui.Save.track(`draft:${c.id}:${slug}`, () => Vault.saveDraft(c.id, slug, meta, body));
    return { slug, kept: false };
  }

  const formFile = (slug) => `report-fields-${slug}.json`;
  /** A sent report's title as it shows under Saved Reports (v1.41: named after its heading). */
  const reportTitle = async (c, slug) => { const d = await Vault.readDraft(c.id, slug).catch(() => null); return (d && d.meta.title) || titleOf(slug); };
  /** Where savePdfToCase puts a report's PDF. */
  const pdfPathOf = (c, title) => CVCaseFiles.joinPath('Supplementary Report', FS.safeName(CVCaseFiles.fileName(c, 'Supplementary Report', `${title}.pdf`, title)));
  const hasEntries = (d) => {
    const x = F().normalize(d);
    return F().FIELDS.some(([k, , kind]) => k !== 'rdNumber' && (kind === 'check' ? !!x[k] : String(x[k] || '').trim()))
      || Object.keys(F().LISTS).some((k) => x[k].some(F().filled)) || x.evidence.length > 0 || !!String(x.narrative || '').trim();
  };
  /** Back to Write Report (v1.39): the report's form goes back on the Write Report tab. Asks first when the
   * Write Report tab holds a different report. -> true when done. */
  async function sendBack(c, slug) {
    const cur = await load(c);
    const name = await reportTitle(c, slug);
    let snap = null;
    try { snap = await Vault.readCaseJSON(c.id, formFile(slug)); } catch (err) { if (FS.isDisconnectError(err)) throw err; }
    if (!snap && cur.sentSlug !== slug) {
      ui.toast(`${name} was sent before this version kept its form, so it can't go back to the Write Report tab. Edit the form there and send it again.`, 'error', 9000);
      return false;
    }
    if (snap && cur.sentSlug !== slug && hasEntries(cur)) {
      const other = cur.sentSlug ? `${await reportTitle(c, cur.sentSlug)} (as last sent, plus any changes since)` : 'a draft that hasn\'t been sent';
      if (!(await ui.confirmDialog({ title: `Send ${name} back to the Write Report tab?`, message: `The Write Report tab now holds ${other}. It's replaced by ${name}'s form. What was sent stays under Saved Reports and Files.`, confirmText: 'Send Back' }))) return false;
    }
    const next = snap ? F().normalize(snap) : cur;
    next.sentSlug = slug;
    await ui.Save.track(`report-fields:${c.id}`, () => Vault.writeCaseJSON(c.id, FILE, next));
    ui.toast(`${name} is back on the Write Report tab. Save as Report updates the report when you're done.`, 'success', 6000);
    return true;
  }

  /** The PDF of a report sent from the Write Report tab (v1.40), laid out like the Write Report tab's Print/PDF:
   * from the form as it was sent, else the form now when it still goes to this report. null when
   * neither is there (sent before v1.39) or its text was changed under Saved Reports. */
  async function sentPdf(c, slug) {
    const cur = await linkedReport(c, slug);
    if (!cur || cur.edited) return null;
    let snap = null;
    try { snap = await Vault.readCaseJSON(c.id, formFile(slug)); } catch (err) { if (FS.isDisconnectError(err)) throw err; }
    if (snap) return pdfFor(c, F().normalize(snap));
    const now = await load(c);
    return (await sentSlugOf(c, now)) === slug ? pdfFor(c, now) : null;
  }

  /** Photos saved before v1.41 as "Exhibit 1", "Exhibit 1 (2)" are renamed in Files to their label
   * (Exhibit 1a, 1b). Only those names, and only when the new name is free. -> true when renamed. */
  async function relabelPhotos(c, e, n) {
    let changed = false;
    for (let j = 0; j < e.photos.length; j++) {
      const { folder, base } = CVCaseFiles.splitPath(e.photos[j]);
      const ext = (/\.[^.]{1,10}$/.exec(base) || [''])[0];
      const stem = base.slice(0, base.length - ext.length);
      const m = /-Exhibit (\d+)(?: \((\d+)\))?$/.exec(stem);
      if (!m || m[1] !== String(n)) continue;
      const label = `Exhibit ${F().photoLabel(n, j)}`;
      const target = CVCaseFiles.joinPath(folder, FS.safeName(CVCaseFiles.fileName(c, folder, base, label)));
      if (await Vault.readFile(c.id, target).catch(() => null)) continue;
      e.photos[j] = await Vault.moveFile(c.id, e.photos[j], folder, { description: label });
      changed = true;
    }
    return changed;
  }

  async function render(panel, c, token) {
    const { h, state, Save, toast, go } = ui;
    const data = await load(c);
    if (token !== state.renderToken) return;
    if (!data.rdNumber && c.number) data.rdNumber = c.number; // v1.48: the R.D. Number starts as the Case Number
    const archived = Vault.isArchived(c.id);
    const key = `report-fields:${c.id}`;
    const save = (delay = 700) => {
      const snapshot = structuredClone(data);
      Save.schedule(key, () => Vault.writeCaseJSON(c.id, FILE, snapshot), delay);
    };


    // Searchable lists (v1.22): UCR codes and location codes from the Reference pages, and the
    // charges; the pick-lists (victim, gang, hair, eyes). All can still be typed over.
    const RD = root.CVRefData || { UCR_CODES: [], LOCATION_CODES: [], CHARGES: [], NARCOTIC_DATA: {} };
    // v1.42: the IUCR Code box holds just the code; its description goes in Offense Classification.
    const UCR_ITEMS = RD.UCR_CODES.flatMap((g) => g.codes.map(([code, desc]) => ({ value: code, label: code, hint: desc, group: g.title, code, desc })));
    { const m = /^(\S+)\s+\S/.exec(String(data.ucr || '')); if (m && UCR_ITEMS.some((it) => it.code === m[1])) data.ucr = m[1]; }
    const LOC_ITEMS = RD.LOCATION_CODES.flatMap((g) => g.codes.map(([code, desc]) => ({ value: code, label: `${code} ${desc}`, hint: g.title, desc })));
    const CHARGE_ITEMS = (RD.CHARGES || []).flatMap((g) => g.codes.map(([statute, desc]) => ({ value: statute, label: `${statute} ${desc}`, hint: g.title, statute, desc })));
    const pickItems = (list) => list.map((v) => ({ value: v, label: v }));
    // Narcotic types: the calculator's list (it has prices), then the evidence types not in it.
    const DNA_ITEMS = [{ value: 'DNA', label: 'DNA', hint: 'Does Not Apply' }];
    // v1.109: no doubles (Cannabis is the calculator's Marijuana, Cocaine its Cocaine (Powder)…).
    const NARCOTIC_ITEMS = F().narcoticChoices(RD.NARCOTIC_DATA || {});
    // v1.109: a victim, offender or charge can read "See DEA 6 for further information".
    const SEE_ITEM = { value: F().SEE_DEA6, label: F().SEE_DEA6, hint: 'Only this box', see: true };
    const moneyText = (v) => {
      const n = parseFloat(String(v || '').replace(/[$,\s]/g, ''));
      return Number.isFinite(n) ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : String(v || '').trim();
    };
    const els = {}; // the Report Fields inputs by key, for fields filled from a pick
    // v1.93: Offense Classification uses the exact wording of the first charge's Statute Description.
    const chargeDescs = () => F().chargeDescriptions(data);
    /** v1.110: the description of the IUCR code entered ('' when it isn't one in the list). */
    const ucrDesc = () => { const v = String(data.ucr || '').trim().toLowerCase(); const it = v && UCR_ITEMS.find((x) => x.code.toLowerCase() === v); return it ? it.desc : ''; };
    // v1.95: always one of the charges' Statute Descriptions (see CVReportFields.syncOffense).
    const offenseFromCharge = () => {
      F().syncOffense(data);
      if (els.offense && els.offense.value !== (data.offense || '')) els.offense.value = data.offense || '';
    };
    const input = (key, label, kind, opts) => {
      if (kind === 'list') { const el = listEditor(key); el.classList.add('span-all'); return el; }
      let el;
      if (kind === 'select' || kind === 'yesno') {
        const list = kind === 'yesno' ? ['', 'Yes', 'No'] : opts;
        el = h('select', {}, list.map((o) => h('option', { value: o, selected: o === (data[key] || '') }, o || '—')));
        el.addEventListener('change', () => { data[key] = el.value; save(); });
      } else if (kind === 'textarea') {
        el = h('textarea', { rows: 2 });
        el.value = data[key] || '';
        el.addEventListener('input', () => { data[key] = el.value; save(); });
      } else if (kind === 'check') {
        el = h('input', { type: 'checkbox', checked: !!data[key] });
        el.addEventListener('change', () => { data[key] = el.checked; save(); });
        return h('label', { class: 'check-row rf-check' }, el, h('span', {}, label));
      } else if (kind === 'time') {
        el = CVTimeField.create({ label, value: data[key] || '' });
        el.addEventListener('input', () => { data[key] = el.value; save(); });
      } else {
        el = h('input', { type: kind === 'date' ? 'date' : kind === 'number' ? 'number' : 'text', min: kind === 'number' ? 0 : null, autocomplete: 'off', value: data[key] || '',
          placeholder: key === 'buyFunds' ? '$100.00 prerecorded 1505 funds in the form of:' : null });
        el.addEventListener('input', () => { data[key] = el.value; save(); });
      }
      els[key] = el;
      const setField = (k, v) => { data[k] = v; if (els[k]) els[k].value = v; };
      // The input keeps its own listeners; a searchable list wraps it (box), not replaces it.
      let box = el;
      // v1.44: Method Code and Safe Method offer DNA (does not apply); anything else can be typed.
      // v1.76: the IR Number can be DNA as well; v1.92: and the CB Number.
      // v1.189: and the Unit Number.
      if (['methodCode', 'unit', 'safeMethod', 'arrestUnit', 'residence', 'irNumber', 'cbNumber'].includes(key)) box = CVCombo.attach(el, { items: () => [{ value: 'DNA', label: 'DNA', hint: 'Does Not Apply' }], onPick: () => save() });
      // v1.93: Offense Classification offers the Statute Descriptions of the charges entered below.
      // v1.108: Address of Occurrence offers the confidential address; any other can be typed.
      if (key === 'address') box = CVCombo.attach(el, { items: () => pickItems(F().PICKS.address), onPick: () => save() });
      if (key === 'offense') {
        // v1.110: the IUCR code's description is offered first.
        box = CVCombo.attach(el, { label: 'The IUCR description and the charges\' Statute Descriptions', items: () => [...(ucrDesc() ? [{ value: ucrDesc(), label: ucrDesc(), hint: 'IUCR', ucr: true }] : []), ...chargeDescs().filter((d0) => d0 !== ucrDesc()).map((d0) => ({ value: d0, label: d0, hint: 'Statute Description' }))],
          onPick: (it) => { data.offenseFrom = it && it.ucr ? 'ucr' : ''; save(); } });
        // v1.95: wording that isn't one of the charges goes back to the charge's, when you leave the box.
        el.addEventListener('change', () => {
          const typed = String(data.offense || '').trim();
          data.offenseFrom = typed && typed === ucrDesc() ? 'ucr' : '';
          offenseFromCharge();
          if (typed && typed !== data.offense) toast('Offense Classification uses the exact description of the IUCR code or of a charge. Pick one from the arrow, or change the IUCR code or the charge.', 'info', 7000);
          save();
        });
      }
      // v1.69: Court Branch and Court Officer can be Pending, and so can the Court Date.
      // v1.175: the approving ASA and AUSA from the Rolodex.
      if ((key === 'asa' || key === 'ausa') && root.CVRolodex) box = CVCombo.attach(el, { label: 'Pick from the Rolodex', items: () => root.CVRolodex.comboItems(root.CVRolodex.list(), [key === 'asa' ? 'ASA' : 'AUSA']), onPick: () => save() });
      if (key === 'courtBranch') box = CVCombo.attach(el, { items: () => [{ value: 'Pending', label: 'Pending', hint: 'Not set yet' }], onPick: () => save() });
      if (key === 'courtDate') {
        const pend = h('input', { type: 'checkbox', checked: data.courtDate === 'Pending', 'aria-label': 'Court Date pending' });
        const showPend = () => { el.disabled = pend.checked; if (pend.checked) el.value = ''; box.classList.toggle('is-pending', pend.checked); };
        pend.addEventListener('change', () => { data.courtDate = pend.checked ? 'Pending' : el.value; showPend(); save(); });
        box = h('div', { class: 'rf-date-pending' }, el, h('label', { class: 'check-row rf-pending', title: 'The court date is not set yet' }, pend, h('span', {}, 'Pending')));
        showPend();
      }
      if (kind === 'ucr') {
        // From Common UCR; an empty Offense Classification takes the UCR group (Narcotics…).
        // v1.39: picking an IUCR code puts its description in Offense Classification (for 2170:
        // "Delv: Synthetic Drugs"); so does typing a code that's in the list.
        // v1.93: when a charge is entered, its Statute Description wins over the UCR wording.
        // v1.110: no longer: the IUCR code picked writes its description (spelled out, e.g.
        // "Manufacture and Delivery: Hallucinogen") in Offense Classification.
        const fillOffense = (it) => { if (key === 'ucr' && it) { setField('offense', it.desc); data.offenseFrom = 'ucr'; save(); } };
        box = CVCombo.attach(el, { items: () => UCR_ITEMS, onPick: (it) => { fillOffense(it); save(); } });
        el.addEventListener('change', () => {
          const v = el.value.trim().toLowerCase();
          fillOffense(UCR_ITEMS.find((it) => it.code.toLowerCase() === v || `${it.code} ${it.desc}`.toLowerCase() === v));
          // Emptied: the wording goes back to the charge's.
          if (!v && data.offenseFrom === 'ucr') { data.offenseFrom = ''; offenseFromCharge(); save(); }
        });
      } else if (kind === 'location') {
        // From Location Codes; Type of Location fills in from the code picked.
        box = CVCombo.attach(el, { items: () => LOC_ITEMS, onPick: (it) => { setField('locationType', it.desc); save(); } });
      }
      // Officer's Report lines get their own tick box, for when one doesn't apply (v1.22; every line since v1.34).
      if (F().OPTIONAL_LINES.includes(key)) {
        const on = !F().isHidden(data, key);
        const cb = h('input', { type: 'checkbox', checked: on, 'aria-label': `Include ${label}`, title: 'Untick if this line doesn\'t apply' });
        // v1.92: a row that holds its own tick box (Court Date's Pending) is not a <label>: a label
        // inside a label made Firefox also untick the row's Include box when Pending was clicked.
        const rowCls = `span-all rf-line rf-optional${on ? '' : ' rf-line-off'}`;
        // v1.175: never a <label> either: clicking the box moves its label (placeholder to label on
        // focus), and a click that then landed on the row ticked the Include box and took the cursor.
        // The row's name puts the cursor in its box.
        const name = h('span', { onclick: () => { const t = box.matches && box.matches('input, textarea, select') ? box : box.querySelector('input:not([type=checkbox]), textarea, select'); if (t && !t.disabled) t.focus(); } }, label);
        const row = h('div', { class: `field ${rowCls}` }, name, box);
        row.prepend(cb);
        cb.addEventListener('change', () => {
          data.hidden = data.hidden.filter((x) => x !== key);
          if (!cb.checked) data.hidden.push(key);
          row.classList.toggle('rf-line-off', !cb.checked);
          save();
        });
        return row;
      }
      return ui.field(label, box, kind === 'textarea' || kind === 'line' ? 'span-all rf-line' : opts === 'span' ? 'span-all' : ['offense', 'address', 'locationType'].includes(key) ? 'rf-off-wide' : '');
    };

    // Pick-lists you can also type over (victim, gang, hair and eye colour).

    // ---- lists you add to: victims, offenders, charges, gangs, persons not arrested, personnel, vehicles
    function listEditor(key) {
      const L = F().LISTS[key];
      const box = h('div', { class: 'rf-items' });
      const draw = () => {
        box.replaceChildren(...(data[key].length ? data[key].map((it, i) => {
          const inputs = {};
          const unknown = key === 'offendersList' && !!it.unknown;
          const lab = `${L.item} ${i + 1}`;
          const stateVictim = F().isStateVictim(key, it);
          const seeDea6 = F().isSeeDea6(key, it);
          const fields = F().fieldsFor(key, it).map(([k, label, kind, opts]) => {
            let el;
            // v1.39: an offender's phone numbers (Add Another Phone) and monikers with their app.
            // v1.94: Offender Vehicle(s): a set of boxes per vehicle and Impound / Tow / DNA click boxes
            // (one at a time). Built from <div>s, so no tick box sits inside another's label.
            if (kind === 'vehicles') {
              if (!Array.isArray(it[k])) it[k] = [];
              const holder = h('div', { class: 'rf-vehicles-list' });
              const drawVehicles = (focusLast) => {
                holder.replaceChildren(...it[k].map((v, j) => {
                  const vlab = `${lab} vehicle ${j + 1}`;
                  const boxes = F().OFFENDER_VEHICLE.map(([vk, vl]) => {
                    const inp = h('input', { type: 'text', autocomplete: 'off', value: v[vk] || '', 'aria-label': `${vlab} ${vl}`, maxlength: vk === 'vin' ? 17 : 120 });
                    inp.addEventListener('input', () => { v[vk] = vk === 'vin' || vk === 'state' ? inp.value.toUpperCase() : inp.value; if (inp.value !== v[vk]) { const at = inp.selectionStart; inp.value = v[vk]; inp.setSelectionRange(at, at); } save(); });
                    return ui.field(vl, inp, vk === 'owner' ? 'rf-veh-owner' : vk === 'vin' ? 'rf-veh-vin' : '');
                  });
                  const ticks = F().VEHICLE_DISPOSITIONS.map(([dk, dl]) => {
                    const cb = h('input', { type: 'checkbox', checked: v.disposition === dk, 'aria-label': `${vlab} ${dl}` });
                    cb.addEventListener('change', () => { v.disposition = cb.checked ? dk : ''; drawVehicles(); save(); });
                    return h('label', { class: 'check-row rf-veh-tick', title: dk === 'DNA' ? 'Does Not Apply: not impounded or towed' : `The vehicle was ${dl.toLowerCase()}` }, cb, h('span', {}, dk));
                  });
                  return h('div', { class: 'rf-veh-card' },
                    h('div', { class: 'rf-veh-head' }, h('strong', {}, `Vehicle ${j + 1}`), h('div', { class: 'rf-veh-ticks', role: 'group', 'aria-label': `${vlab} impound, tow or DNA` }, ...ticks),
                      archived ? '' : h('button', { class: 'icon-btn danger-icon', type: 'button', title: 'Remove this vehicle', onclick: () => { it[k].splice(j, 1); drawVehicles(); save(); } }, ui.icon('trash3'), h('span', { class: 'sr-only' }, `Remove ${vlab}`))),
                    h('div', { class: 'rf-veh-grid' }, ...boxes));
                }), archived ? '' : h('button', { class: 'btn small rf-veh-add', type: 'button', icon: 'plus-lg', onclick: () => { it[k].push(F().blankVehicle()); drawVehicles(true); save(); } }, it[k].length ? 'Add Another Vehicle' : 'Add Vehicle'));
                if (focusLast) { const cards = holder.querySelectorAll('.rf-veh-card'); const first = cards.length && cards[cards.length - 1].querySelector('input[type=text]'); if (first) first.focus(); }
              };
              drawVehicles();
              inputs[k] = holder;
              return h('div', { class: 'field rf-wide rf-vehicles' }, h('span', {}, label), holder);
            }
            if (kind === 'phones' || kind === 'socials') {
              if (!Array.isArray(it[k])) it[k] = [];
              if (kind === 'phones' && !it[k].length) it[k].push('');
              const holder = h('div', { class: 'rf-multi' });
              const drawMulti = (focusLast) => {
                holder.replaceChildren(...it[k].map((v, j) => {
                  let parts;
                  if (kind === 'phones') {
                    const inp = h('input', { type: 'tel', autocomplete: 'off', value: v || '', 'aria-label': `${lab} phone number ${j + 1}` });
                    inp.addEventListener('input', () => { it[k][j] = inp.value; save(); });
                    parts = [inp];
                  } else {
                    const nm = h('input', { type: 'text', autocomplete: 'off', value: (v && v.name) || '', placeholder: 'Moniker / Username', 'aria-label': `${lab} moniker ${j + 1}` });
                    nm.addEventListener('input', () => { it[k][j] = { ...it[k][j], name: nm.value }; save(); });
                    const app = h('select', { 'aria-label': `${lab} moniker ${j + 1} app` }, F().SOCIAL_APPS.map((o) => h('option', { value: o, selected: o === ((v && v.app) || '') }, o || 'App or Street Name')));
                    app.addEventListener('change', () => { it[k][j] = { ...it[k][j], app: app.value }; save(); });
                    parts = [nm, app];
                  }
                  return h('div', { class: `rf-multi-row rf-multi-${kind}` }, ...parts,
                    archived ? '' : h('button', { class: 'icon-btn danger-icon', type: 'button', title: 'Remove', onclick: () => { it[k].splice(j, 1); drawMulti(); save(); } }, ui.icon('x-lg'), h('span', { class: 'sr-only' }, 'Remove')));
                }), archived ? '' : h('button', { class: 'btn small rf-multi-add', type: 'button', onclick: () => {
                  it[k].push(kind === 'phones' ? '' : { name: '', app: '' }); drawMulti(true); save();
                } }, kind === 'phones' ? (it[k].length ? 'Add Another Phone' : 'Add Phone Number') : 'Add Moniker / Social Media'));
                if (focusLast) { const ins = holder.querySelectorAll('.rf-multi-row input'); if (ins.length) ins[ins.length - 1].focus(); }
              };
              drawMulti();
              inputs[k] = holder;
              // v1.48: the phone numbers start folded away; Show Phone Numbers opens them.
              if (kind === 'phones') {
                holder.hidden = true;
                const count = () => it[k].filter((x) => String(x || '').trim()).length;
                const tog = h('button', { class: 'btn small rf-phones-toggle', type: 'button', 'data-ro-ok': 'true', 'aria-expanded': 'false' });
                const drawTog = () => { tog.textContent = holder.hidden ? `Show Phone Numbers${count() ? ` (${count()})` : ''}` : 'Hide Phone Numbers'; tog.setAttribute('aria-expanded', String(!holder.hidden)); };
                tog.addEventListener('click', () => { holder.hidden = !holder.hidden; drawTog(); });
                drawTog();
                return h('div', { class: 'field rf-wide rf-phones' }, tog, holder);
              }
              return ui.field(label, holder, 'rf-wide');
            }
            // Height in feet and inches, weight in pounds; for an unknown offender, from–to (v1.25).
            if (kind === 'height' || kind === 'weight' || (kind === 'age' && unknown)) {
              const range = unknown;
              const parts = kind === 'height' ? F().heightParts(it[k]) : F().numParts(it[k]);
              const vals = [parts[0] || null, range ? parts[1] || null : null];
              const store = () => {
                const txt = vals.map((v) => (kind === 'height' ? (v ? F().heightOf(v.ft, v.in) : '') : (v || ''))).filter(Boolean);
                it[k] = range ? txt.join(' - ') : (txt[0] || '');
                save();
              };
              const one = (n) => {
                const sub = range ? (n ? ' to' : ' from') : '';
                if (kind === 'height') {
                  const v = vals[n] || {};
                  const ft = h('input', { type: 'number', min: 3, max: 8, inputmode: 'numeric', class: 'rf-num', value: v.ft == null ? '' : v.ft, 'aria-label': `${lab} ${label}${sub} feet` });
                  const inch = h('input', { type: 'number', min: 0, max: 11, inputmode: 'numeric', class: 'rf-num', value: v.ft == null ? '' : v.in, 'aria-label': `${lab} ${label}${sub} inches` });
                  const upd = () => { vals[n] = ft.value === '' ? null : { ft: Number(ft.value), in: Math.min(11, Number(inch.value || 0)) }; store(); };
                  ft.addEventListener('input', upd); inch.addEventListener('input', upd);
                  return [ft, h('span', { class: 'rf-unit' }, 'ft'), inch, h('span', { class: 'rf-unit' }, 'in')];
                }
                const num = h('input', { type: 'number', min: 0, inputmode: 'decimal', class: 'rf-num', value: vals[n] || '', 'aria-label': `${lab} ${label}${sub}` });
                num.addEventListener('input', () => { vals[n] = num.value; store(); });
                return kind === 'weight' ? [num, h('span', { class: 'rf-unit' }, 'lbs')] : [num];
              };
              el = h('span', { class: `rf-measure${range ? ' rf-range' : ''}` }, ...one(0), ...(range ? [h('span', { class: 'rf-unit' }, 'to'), ...one(1)] : []));
              inputs[k] = el;
              return ui.field(F().labelFor(it, k, label), el, range && kind !== 'age' ? 'rf-span2' : '');
            }
            if (kind === 'select') {
              // v1.44: long race names shortened on screen (the saved value is the full name) so a
              // person's Gender, Gender Identity, Race and Complexion fit on one row.
              const SHORT = { 'American Indian / Alaska Native': 'Am. Indian / AK Native', 'Asian / Pacific Islander': 'Asian / Pac. Islander' };
              el = h('select', {}, opts.map((o) => h('option', { value: o, selected: o === (it[k] || ''), title: SHORT[o] ? o : null }, SHORT[o] || o || '—')));
              el.addEventListener('change', () => { it[k] = el.value; save(); });
            } else if (kind === 'time' && root.CVTimeField) {
              // v1.82: a notification's time, like the report's own Time box.
              el = CVTimeField.create({ label, value: it[k] || '' });
              el.addEventListener('input', () => { it[k] = el.value; save(); });
            } else if (kind === 'age') {
              // Worked out from the date of birth.
              el = h('input', { type: 'text', readonly: true, tabindex: -1, class: 'rf-auto', value: it[k] || '', title: 'From the date of birth' });
            } else {
              el = h('input', { type: kind === 'date' ? 'date' : kind === 'phone' ? 'tel' : 'text', autocomplete: 'off', value: it[k] || '' });
              if (kind === 'phone' && root.CVFormat) CVFormat.phone && el.addEventListener('blur', () => { el.value = CVFormat.phone(el.value); it[k] = el.value; save(); });
              if (kind === 'money') el.addEventListener('blur', () => { const m = moneyText(el.value); if (m !== el.value) { el.value = m; it[k] = m; save(); } });
              el.addEventListener('input', () => { it[k] = el.value; save(); });
              if (kind === 'date' && unknown && k === 'dob') el.disabled = true;
            }
            el.setAttribute('aria-label', `${L.item} ${i + 1} ${label}`);
            inputs[k] = el;
            let box = el;
            // A victim that becomes (or stops being) the State of Illinois changes its boxes (v1.27).
            // Switched as you type or pick (not when you leave the box, which would move the page
            // under a click); the cursor stays in the name box.
            const redrawIfState = () => {
              if (F().isStateVictim(key, it) === stateVictim) {
                // v1.108: from the State of Illinois to the Federal Government (or back): the State's
                // Relation Code 024 goes (or comes) with it; a code typed in stays.
                const cur = String(it.relation || '').trim(); const want = F().govRelation(it);
                if (stateVictim && cur !== want && (cur === '' || cur === F().STATE_RELATION)) { it.relation = want; if (inputs.relation) inputs.relation.value = want; save(); }
                return;
              }
              // v1.93: becoming the State of Illinois fills Relation Code 024 (when it's empty).
              if (!stateVictim && !String(it.relation || '').trim()) it.relation = F().govRelation(it);
              draw(); save();
              const again = box.querySelector(`[aria-label="${L.item} ${i + 1} Name"]`);
              if (again) { again.focus(); const n = again.value.length; try { again.setSelectionRange(n, n); } catch { /* not a text box */ } }
            };
            // v1.109: becoming (or no longer) "See DEA 6": the other boxes go (or come back).
            const redrawIfSee = () => {
              if (F().isSeeDea6(key, it) === seeDea6) return false;
              if (key === 'charges') offenseFromCharge();
              draw(); save();
              const again = document.querySelector(`[aria-label="${L.item} ${i + 1} ${label}"]`);
              if (again) { again.focus(); const n = again.value.length; try { again.setSelectionRange(n, n); } catch { /* not a text box */ } }
              return true;
            };
            if (['victimsList', 'offendersList'].includes(key) && k === 'name') el.addEventListener('input', () => { if (!redrawIfSee() && key === 'victimsList') redrawIfState(); });
            if (F().PICKS[kind]) box = CVCombo.attach(el, { items: () => [...pickItems(F().PICKS[kind]), ...(key === 'victimsList' ? [SEE_ITEM] : [])], onPick: () => { if (key === 'victimsList' && !redrawIfSee()) redrawIfState(); } });
            else if (key === 'offendersList' && k === 'name' && !unknown) box = CVCombo.attach(el, { items: () => [SEE_ITEM], onPick: () => redrawIfSee() });
            else if (kind === 'narcotic') box = CVCombo.attach(el, { items: () => NARCOTIC_ITEMS });
            // v1.76: IR, FBI and IDOC Numbers can be DNA (does not apply); v1.92: and the CB Number.
            else if (['irNumber', 'fbiNumber', 'idocNumber', 'cbNumber'].includes(k)) box = CVCombo.attach(el, { items: () => DNA_ITEMS });
            else if (key === 'narcotics' && k === 'value') {
              // Street value from the narcotic calculator (Reference): type, amount and unit.
              const calc = h('button', { class: 'btn small rf-calc', type: 'button', icon: 'calculator', title: 'Work out the street value with the narcotic calculator (Reference → Narcotic calculator)', onclick: () => {
                const Ref = root.CVReference;
                const amount = parseFloat(String(it.amount || '').replace(/,/g, ''));
                const drug = String(it.drug || '');
                if (!Ref || !RD.NARCOTIC_DATA || !RD.NARCOTIC_DATA[drug]) { toast('Pick the narcotic type from the list first: the calculator knows those.'); return; }
                const units = Ref.priceUnits(drug);
                const unit = it.unit && units.includes(it.unit) ? it.unit : units[0];
                const r = Ref.streetValue(drug, amount, unit);
                if (!r.ok) { toast(r.error); return; }
                it.value = moneyText(String(r.value)); el.value = it.value;
                if (!it.unit) { it.unit = unit; if (inputs.unit) inputs.unit.value = unit; }
                save();
                toast(r.line, 'success', 7000);
              } }, 'Calculate');
              box = h('span', { class: 'rf-with-btn' }, el, calc);
            }
            else if (kind === 'charge' || kind === 'chargeWide') {
              // Search the charges by statute or wording; picking fills both boxes.
              box = CVCombo.attach(el, { items: () => [...CHARGE_ITEMS.map((c) => ({ ...c, value: kind === 'charge' ? c.statute : c.desc })), SEE_ITEM], onPick: (c) => {
                // v1.109: See DEA 6: the statute is in the DEA 6, so only the description box stays.
                if (c.see) { it.statute = ''; it.description = F().SEE_DEA6; if (key === 'charges') offenseFromCharge(); draw(); save(); return; }
                it.statute = c.statute; it.description = c.desc;
                if (inputs.statute) inputs.statute.value = c.statute;
                if (inputs.description) inputs.description.value = c.desc;
                if (key === 'charges') offenseFromCharge();
                save();
              } });
              // Typed by hand: Offense Classification follows the charge's wording too.
              if (kind === 'chargeWide' && key === 'charges') el.addEventListener('input', () => { if (!redrawIfSee()) { offenseFromCharge(); save(); } });
            }
            return ui.field(label, box, kind === 'wide' || kind === 'chargeWide' || seeDea6 ? 'rf-wide' : ''); // v1.109: See DEA 6 never cut off
          });
          // Age follows the date of birth.
          if (inputs.dob && inputs.age && !unknown) {
            const upd = () => { it.age = F().ageOn(inputs.dob.value, Vault.localDay()); inputs.age.value = it.age; save(); };
            inputs.dob.addEventListener('input', upd);
            inputs.dob.addEventListener('change', upd);
          }
          const unknownBox = key === 'offendersList' && !seeDea6 ? h('label', { class: 'check-row small rf-unknown', title: 'Name not known: age, height and weight become ranges' },
            h('input', { type: 'checkbox', checked: unknown, 'aria-label': `${lab} unknown offender`, onchange: (e) => {
              it.unknown = e.target.checked;
              if (it.unknown && !String(it.name || '').trim()) it.name = F().UNKNOWN;
              if (!it.unknown && it.name === F().UNKNOWN) it.name = '';
              if (!it.unknown) it.age = F().ageOn(it.dob, Vault.localDay());
              if (it.unknown) { it.dob = ''; it.age = ''; }
              draw(); save();
            } }), h('span', {}, 'Unknown Offender')) : null;
          // v1.82: No Vehicle hides the Vehicle, VIN and Plates boxes (they stay saved if filled).
          const noVehBox = key === 'offendersList' && !seeDea6 ? h('label', { class: 'check-row small rf-unknown', title: 'No vehicle information: hide Offender Vehicle(s) (left off the PDF)' },
            h('input', { type: 'checkbox', checked: !!it.noVehicle, 'aria-label': `${lab} no vehicle`, onchange: (e) => { it.noVehicle = e.target.checked; draw(); save(); } }), h('span', {}, 'No Vehicle')) : null;
          return h('div', { class: `rf-item${unknown ? ' rf-item-unknown' : ''}${stateVictim ? ' rf-item-state' : ''}${seeDea6 ? ' rf-item-see' : ''}` },
            h('div', { class: 'rf-item-head' }, h('strong', {}, `${L.item} ${i + 1}`), unknownBox, noVehBox,
              archived ? null : h('button', { class: 'icon-btn danger-icon', type: 'button', title: `Delete ${L.item.toLowerCase()}`, onclick: async () => {
                if (F().filled(it) && !(await ui.confirmDialog({ title: `Delete ${L.item} ${i + 1}?`, message: 'This entry is removed from the report.', confirmText: 'Delete', danger: true }))) return;
                data[key].splice(i, 1); draw(); save();
              } }, ui.icon('trash3'), h('span', { class: 'sr-only' }, `Delete ${L.item} ${i + 1}`))),
            h('div', { class: `rf-item-grid rf-grid-${key}` }, fields));
        }) : [h('p', { class: 'muted small rf-none' }, `No ${L.title.toLowerCase()} yet.`)]));
      };
      draw();
      // v1.95: adding or removing a charge keeps Offense Classification on a charge's wording.
      if (key === 'charges') new MutationObserver(() => { const before = data.offense; offenseFromCharge(); if (data.offense !== before) save(); }).observe(box, { childList: true });
      const add = h('button', { class: 'btn small', type: 'button', icon: 'plus-lg', onclick: () => {
        data[key].push(F().blankItem(key)); draw(); save();
        const last = box.lastElementChild && box.lastElementChild.querySelector('input, select');
        if (last) last.focus();
      } }, `Add ${L.item}`);
      // Offenders can be filled from Details → Suspects (name, date of birth, age); the description is entered here.
      const fromSuspects = key === 'offendersList' && !archived ? h('button', { class: 'btn small', type: 'button', icon: 'person-exclamation', title: 'Add suspects from Details as offenders', onclick: async () => {
        const list = (c.suspects || []).map((s) => (s && s.notIdentified ? { ...s, name: 'Not Identified' } : s)).filter((s) => s && String(s.name || '').trim());
        if (!list.length) { toast('No named suspects on the Details tab yet.'); return; }
        // v1.93: pick which suspects go into this report (the Primary ones are ticked to start with).
        const already = new Set(data.offendersList.map((o) => String(o.name || '').trim().toLowerCase()).filter(Boolean));
        const picked = await ui.openDialog((close) => {
          const boxes = list.map((s) => {
            const inReport = already.has(String(s.name).trim().toLowerCase());
            const cb = h('input', { type: 'checkbox', checked: !inReport && (s.role || 'Primary') === 'Primary' });
            // v1.117: Name, Role and a note in their own columns, so the roles line up.
            const role = s.role === 'Main' ? 'Primary' : s.role || 'Primary';
            return [s, cb, h('label', { class: 'rf-suspect-pick sp-row' }, cb,
              h('strong', { class: 'sp-name' }, s.name),
              h('span', { class: `sp-role sp-role-${role.toLowerCase().replace(/[^a-z]+/g, '-')}` }, role),
              h('span', { class: 'sp-note muted small' }, inReport ? 'Already in this report (updated if ticked)' : ''))];
          });
          const go = h('button', { class: 'btn primary', type: 'submit', icon: 'person-plus' }, 'Add to Offenders');
          const sync = () => { go.disabled = !boxes.some(([, cb]) => cb.checked); };
          boxes.forEach(([, cb]) => cb.addEventListener('change', sync));
          sync();
          return h('form', { class: 'suspect-pick-form', onsubmit: (e) => { e.preventDefault(); close(boxes.filter(([, cb]) => cb.checked).map(([x]) => x)); } },
            h('h2', { icon: 'person-exclamation' }, 'Add Suspects to This Report'),
            h('p', { class: 'muted small' }, 'Tick the suspects from the Details tab who are offenders in this report. Their name, date of birth and description are filled in.'),
            h('div', { class: 'suspect-pick-list' },
              h('div', { class: 'sp-row sp-head', 'aria-hidden': 'true' }, h('span'), h('span', {}, 'Name'), h('span', {}, 'Role'), h('span', {}, 'In Report')),
              boxes.map(([, , row]) => row)),
            h('div', { class: 'dialog-actions' },
              h('button', { class: 'btn', type: 'button', onclick: () => { boxes.forEach(([, cb]) => { cb.checked = true; }); sync(); } }, 'Tick All'),
              h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
              go));
        });
        if (!picked || !picked.length) return;
        for (const s of picked) F().suspectToOffender(data, s, Vault.localDay());
        draw(); save();
        toast(`${picked.length} suspect${picked.length === 1 ? '' : 's'} filled into Offenders.`, 'success');
      } }, 'Add From Suspects') : null;
      const wrap = h('div', { class: `rf-list rf-list-${key}` });
      let head = h('h4', {}, L.title);
      // The Officer's Report lists can be ticked off like its lines (v1.34): left out of the PDF and the report.
      if (F().OPTIONAL_LISTS.includes(key)) {
        const on = !F().isHidden(data, key);
        const cb = h('input', { type: 'checkbox', checked: on, 'aria-label': `Include ${L.title}`, title: 'Untick if this doesn\'t apply' });
        wrap.classList.toggle('rf-line-off', !on);
        cb.addEventListener('change', () => {
          data.hidden = data.hidden.filter((x) => x !== key);
          if (!cb.checked) data.hidden.push(key);
          wrap.classList.toggle('rf-line-off', !cb.checked);
          if (key === 'charges') offenseFromCharge(); // v1.95
          save();
        });
        head = h('label', { class: 'rf-list-head' }, cb, h('h4', {}, L.title));
      }
      wrap.append(head, box, archived ? '' : h('div', { class: 'contact-add' }, add, fromSuspects || ''));
      return wrap;
    }

    // ---- every part has an Include box on the left: untick it when the part doesn't apply; it's
    // then folded away and left out of the PDF and the report.
    // v1.25: a fold button on the right (▾/▸) only folds the part away on screen, to keep the page
    // short; it stays in the PDF. Remembered in this browser for every case.
    // v1.59: every part starts folded; the parts you open are remembered (in this browser).
    const OPEN_KEY = 'casevault-rf-open';
    const opened = new Set((() => { try { return JSON.parse(localStorage.getItem(OPEN_KEY) || '[]'); } catch { return []; } })());
    const keepFolds = () => { try { localStorage.setItem(OPEN_KEY, JSON.stringify([...opened])); } catch { /* this session only */ } };
    const folded = { has: (id) => !opened.has(id), add: (id) => opened.delete(id), delete: (id) => opened.add(id) };
    const foldButtons = [];
    // v1.100: after Save Changes, a part without its green check outlines what is still blank in red.
    let showMissing = false;
    const recheckers = [];
    let refreshNext = () => {};
    const missingBox = (el) => {
      if (el.tagName === 'TEXTAREA' && !el.offsetParent) {
        const rich = el.parentElement && el.parentElement.querySelector(`.${el.className.split(/\s+/)[0]}-rich`);
        if (rich) return rich;
      }
      return el.closest('.rf-boxed') || el.closest('.combo, .date-field') || el;
    };
    function part(id, title, icon, ...body) {
      const on = !F().isHidden(data, id);
      const inner = h('div', { class: 'rf-body' }, ...body);
      const cb = h('input', { type: 'checkbox', checked: on, 'aria-label': `Include ${title}` });
      const fold = h('button', { class: 'icon-btn rf-fold', type: 'button' });
      // v1.67: a green check in the header once every field in the part is filled (seen folded too).
      // v1.68: it sits in its own column beside the fold arrow, so the checks line up down the page.
      const done = h('span', { class: 'rf-done', title: 'Every field in this part is filled in (or ticked off)' }, ui.icon('check-circle-fill'), h('span', { class: 'sr-only' }, `${title}: complete`));
      // v1.177: how much of the part is filled in, beside its name (seen folded too).
      const prog = h('span', { class: 'rf-progress' });
      const sec = h('section', { class: `rf-section rf-${id}` },
        // v1.76: "Hidden on screen" floats beside the checkbox on hover; "Not in the report" has its
        // own column next to the green check.
        h('div', { class: 'rf-head' }, h('label', { class: 'rf-include' }, cb, h('span', { class: 'rf-include-tip', 'aria-hidden': 'true' }, h('span', { class: 'tip-on' }, 'In the report. Untick to leave it out of the PDF'), h('span', { class: 'tip-off' }, 'Not in the report. Tick to put it back'), h('span', { class: 'tip-hidden' }, 'Hidden on screen (it stays in the PDF)'))), h('h3', { icon }, title), prog, h('div', { class: 'spacer' }), h('span', { class: 'rf-off-tag', 'aria-hidden': 'true' }, 'Not in the report'), done, fold),
        inner);
      let pending = 0;
      // v1.68: a line or list that is ticked off counts as filled, and so does a whole part that is
      // ticked off; phone numbers and monikers (added with their own Add button) are extras.
      const checkDone = () => {
        pending = 0;
        let complete;
        if (!cb.checked) complete = true;
        else {
          const boxes = [...inner.querySelectorAll('input, select, textarea')].filter((el) => !el.disabled && !['checkbox', 'radio', 'file', 'button', 'hidden', 'submit'].includes(el.type)
            && !el.closest('.combo-list, datalist, .rf-multi, .rf-vehicles-list, .rf-line-off, .rf-extras, .rf-photo-label, .rf-start-at, .rf-ev-note-input') && (() => { const hid = el.parentElement && el.parentElement.closest('[hidden]'); return !hid || hid === inner; })());
          const offLines = inner.querySelectorAll('.rf-line-off').length;
          complete = (boxes.length || offLines) ? boxes.every((el) => String(el.value || '').trim()) : false;
          const nFilled = boxes.filter((el) => String(el.value || '').trim()).length;
          prog.textContent = boxes.length && !complete ? `${nFilled} of ${boxes.length} filled` : '';
          // v1.93: a list still ticked in with nothing added (no Police Personnel, no charges…) isn't
          // filled in; tick it off when it doesn't apply.
          if (complete && inner.querySelector('.rf-list:not(.rf-line-off) .rf-none')) complete = false;
          inner.querySelectorAll('.rf-missing').forEach((el) => el.classList.remove('rf-missing'));
          if (showMissing && !complete) {
            boxes.filter((el) => !String(el.value || '').trim()).forEach((el) => missingBox(el).classList.add('rf-missing'));
            inner.querySelectorAll('.rf-list:not(.rf-line-off) .rf-none').forEach((el) => el.classList.add('rf-missing'));
            // Nothing blank to point at (an empty list, no evidence yet): the empty note, else its Add button.
            if (!inner.querySelector('.rf-missing')) {
              const empty = [...inner.querySelectorAll('.rf-empty, .rf-none')].filter((el) => el.offsetParent);
              const add = [...inner.querySelectorAll('.contact-add button')].find((el) => el.offsetParent);
              (empty.length ? empty : add ? [add] : []).forEach((el) => el.classList.add('rf-missing'));
            }
          }
        }
        if (!cb.checked) { inner.querySelectorAll('.rf-missing').forEach((el) => el.classList.remove('rf-missing')); prog.textContent = ''; }
        refreshNext();
        done.classList.toggle('on', complete);
        done.setAttribute('aria-hidden', String(!complete));
        sec.classList.toggle('rf-complete', complete);
      };
      const later = () => { if (!pending) pending = requestAnimationFrame(checkDone); };
      recheckers.push(checkDone);
      inner.addEventListener('input', later);
      inner.addEventListener('change', later);
      new MutationObserver(later).observe(inner, { childList: true, subtree: true });
      later();
      const show = () => {
        const isOn = cb.checked; const isFolded = folded.has(id);
        inner.hidden = !isOn || isFolded;
        sec.classList.toggle('rf-off', !isOn);
        sec.classList.toggle('rf-folded', isOn && isFolded);
        fold.disabled = !isOn;
        const label = isFolded ? `Show ${title}` : `Hide ${title} on screen (it stays in the PDF)`;
        fold.title = label; fold.setAttribute('aria-expanded', String(!isFolded));
        fold.replaceChildren(ui.icon(isFolded ? 'chevron-right' : 'chevron-down'), h('span', { class: 'sr-only' }, label));
      };
      fold.addEventListener('click', () => { if (folded.has(id)) folded.delete(id); else folded.add(id); keepFolds(); show(); });
      foldButtons.push((want) => { if (want) folded.add(id); else folded.delete(id); show(); });
      cb.addEventListener('change', () => {
        data.hidden = data.hidden.filter((x) => x !== id);
        if (!cb.checked) data.hidden.push(id);
        show();
        save();
        later();
      });
      show();
      return sec;
    }
    const foldAll = (want) => { foldButtons.forEach((f) => f(want)); keepFolds(); };

    // v1.54: a line whose label is a switch: the Search Warrant or the Subpoena number, the ASA or
    // the AUSA. The text moves with the switch; the other of the pair is left out of the report.
    // v1.69: a label switch is as wide as its longest choice (Consolas: every letter is 1ch, plus
    // the letter spacing), so no browser cuts "SEARCH WARRANT NUMBER" short.
    function fitSwitch(sel, labels) {
      const n = Math.max(...labels.map((l) => l.length));
      sel.style.width = `calc(${n} * (1ch + .02em) + 1.8rem)`;
    }
    function switchLine(group, choices) {
      let cur = data[`${group}Kind`] || choices[0][0];
      const sel = h('select', { class: 'rf-switch', 'aria-label': `${choices.map((c) => c[1]).join(' or ')}` }, choices.map(([k, l]) => h('option', { value: k, selected: k === cur }, l)));
      fitSwitch(sel, choices.map((c) => c[1]));
      const inp = h('input', { autocomplete: 'off', value: data[cur] || '', 'aria-label': choices.find((c) => c[0] === cur)[1] });
      inp.addEventListener('input', () => { data[cur] = inp.value; save(); });
      const on = !(data.hidden || []).includes(cur);
      const cb = h('input', { type: 'checkbox', checked: on, 'aria-label': 'Include this line', title: 'Untick if this line doesn\'t apply' });
      const row = h('label', { class: `field rf-boxed rf-line rf-optional rf-switch-field${on ? '' : ' rf-line-off'}` }, cb, h('span', { class: 'rf-lab' }, sel), inp);
      cb.addEventListener('change', () => {
        data.hidden = data.hidden.filter((x) => x !== cur);
        if (!cb.checked) data.hidden.push(cur);
        row.classList.toggle('rf-line-off', !cb.checked);
        save();
      });
      sel.addEventListener('change', () => {
        const next = sel.value;
        const wasOff = data.hidden.includes(cur);
        data.hidden = data.hidden.filter((x) => x !== cur && x !== next);
        if (wasOff) data.hidden.push(next);
        data[next] = inp.value; data[cur] = '';
        cur = next; data[`${group}Kind`] = cur;
        inp.setAttribute('aria-label', choices.find((c) => c[0] === cur)[1]);
        save();
      });
      return row;
    }
    function judgeLine() {
      const sel = h('select', { class: 'rf-switch', 'aria-label': 'Judge or Magistrate' }, ['Judge', 'Magistrate'].map((t) => h('option', { value: t, selected: t === (data.judgeTitle || 'Judge') }, `${t} Approving`)));
      fitSwitch(sel, ['Judge Approving', 'Magistrate Approving']);
      sel.addEventListener('change', () => { data.judgeTitle = sel.value; save(); });
      const inp = h('input', { autocomplete: 'off', value: data.judge || '', 'aria-label': 'Judge or magistrate' });
      inp.addEventListener('input', () => { data.judge = inp.value; save(); });
      const on = !(data.hidden || []).includes('judge');
      const cb = h('input', { type: 'checkbox', checked: on, 'aria-label': 'Include this line', title: 'Untick if this line doesn\'t apply' });
      const row = h('label', { class: `field rf-boxed rf-line rf-optional rf-switch-field${on ? '' : ' rf-line-off'}` }, cb, h('span', { class: 'rf-lab' }, sel), inp);
      cb.addEventListener('change', () => { data.hidden = data.hidden.filter((x) => x !== 'judge'); if (!cb.checked) data.hidden.push('judge'); row.classList.toggle('rf-line-off', !cb.checked); save(); });
      return row;
    }
    // v1.54: Pre-Recorded Funds: one line per denomination (how many, and their serial numbers),
    // added and changed in a small box; one Recovered or Not Recovered for all, at the lower right.
    function fundsEditor() {
      const box = h('div', { class: 'rf-funds-list' });
      const fundDialog = (g) => ui.openDialog((close) => {
        const den = h('select', { 'aria-label': 'Denomination' }, F().DENOMINATIONS.map((v) => h('option', { value: v, selected: v === (g.denomination || '') }, v || 'Denomination')));
        const qty = h('input', { type: 'number', min: 1, value: g.quantity || '', 'aria-label': 'Quantity', placeholder: 'How many bills' });
        const ser = h('textarea', { rows: 5, 'aria-label': 'Serial numbers', placeholder: 'One serial number per line' });
        ser.value = (g.serials || []).join('\n');
        const count = () => ser.value.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
        ser.addEventListener('input', () => { if (!qty.dataset.typed) qty.value = count().length || ''; });
        // v1.80: Electronic Funds: an amount of transfers and their reference numbers, not bills.
        const serLabel = h('span');
        const showKind = () => {
          const e = den.value === 'Electronic Funds';
          qty.placeholder = e ? 'How many transfers' : 'How many bills';
          ser.placeholder = e ? 'One transaction or reference number per line (optional)' : 'One serial number per line (or separated by commas)';
          serLabel.textContent = e ? 'Transaction / Reference Numbers' : 'Serial Numbers';
        };
        den.addEventListener('change', showKind);
        showKind();
        qty.addEventListener('input', () => { qty.dataset.typed = '1'; });
        const err = h('p', { class: 'error-text small' });
        return h('form', { class: 'rf-fund-form cv-boxed', onsubmit: (e) => {
          e.preventDefault();
          if (!den.value) { err.textContent = 'Pick the denomination.'; return; }
          close({ denomination: den.value, quantity: String(qty.value || count().length || ''), serials: count() });
        } },
        h('h2', {}, g.denomination ? 'Change Pre-Recorded Funds' : 'Add Pre-Recorded Funds'),
        h('div', { class: 'rf-fund-grid' }, ui.field('Denomination', den), ui.field('Quantity', qty), ui.field(serLabel, ser, 'span-2')),
        h('p', { class: 'muted small' }, 'The quantity counts the serial numbers you enter; type another number when not every bill was recorded.'),
        err,
        CVKit.cancelRow(h, () => close(), h('button', { class: 'btn primary', type: 'submit' }, g.denomination ? 'Save' : 'Add')));
      });
      const draw = () => {
        box.replaceChildren(...(data.funds.length ? data.funds.map((g, i) => h('div', { class: 'rf-fund' },
          h('strong', { class: 'rf-fund-den' }, g.denomination === 'Electronic Funds' && !(g.quantity || (g.serials || []).length) ? 'Electronic Funds' : `${g.denomination || '—'} × ${g.quantity || (g.serials || []).length || 0}`),
          h('span', { class: 'rf-fund-serials' }, (g.serials || []).length ? (g.serials || []).join(', ') : h('span', { class: 'muted' }, g.denomination === 'Electronic Funds' ? 'No reference numbers' : 'No serial numbers')),
          archived ? '' : h('span', { class: 'rf-fund-btns' },
            h('button', { class: 'icon-btn', type: 'button', title: 'Change', onclick: async () => { const r = await fundDialog(g); if (r) { data.funds[i] = r; draw(); save(); } } }, ui.icon('pencil'), h('span', { class: 'sr-only' }, 'Change')),
            h('button', { class: 'icon-btn danger-icon', type: 'button', title: 'Delete', onclick: () => { data.funds.splice(i, 1); draw(); save(); } }, ui.icon('trash3'), h('span', { class: 'sr-only' }, 'Delete'))))) : [h('p', { class: 'muted small rf-none' }, 'No pre-recorded funds yet.')]));
      };
      draw();
      const rec = h('select', { 'aria-label': 'Recovered or Not Recovered' }, F().RECOVERED.map((v) => h('option', { value: v, selected: v === (data.fundsRecovered || '') }, v || '— Recovered? —')));
      rec.addEventListener('change', () => { data.fundsRecovered = rec.value; save(); });
      const on = !F().isHidden(data, 'funds');
      const cb = h('input', { type: 'checkbox', checked: on, 'aria-label': 'Include Pre-Recorded Funds', title: 'Untick if this doesn\'t apply' });
      const wrap = h('div', { class: `rf-list rf-list-funds span-all${on ? '' : ' rf-line-off'}` });
      cb.addEventListener('change', () => { data.hidden = data.hidden.filter((x) => x !== 'funds'); if (!cb.checked) data.hidden.push('funds'); wrap.classList.toggle('rf-line-off', !cb.checked); save(); });
      wrap.append(h('label', { class: 'rf-list-head' }, cb, h('h4', {}, 'Pre-Recorded Funds')), box,
        h('div', { class: 'rf-funds-foot' },
          archived ? h('span') : h('button', { class: 'btn small', type: 'button', icon: 'plus-lg', onclick: async () => { const r = await fundDialog({}); if (r) { data.funds.push(r); draw(); save(); } } }, 'Add Funds'),
          h('div', { class: 'spacer' }), h('label', { class: 'field rf-boxed rf-funds-rec' }, rec)));
      return wrap;
    }
    // v1.76: Victim/Offender/Property/Circumstances Verified and Updated share one grey box.
    function updateFields(s) {
      const checks = s.fields.filter((f) => f[2] === 'check');
      return [h('div', { class: 'rf-checkbox-group' }, checks.map(([k, label, kind, opts]) => input(k, label, kind, opts))),
        ...s.fields.filter((f) => f[2] !== 'check').map(([k, label, kind, opts]) => input(k, label, kind, opts))];
    }
    function reportLines(s) {
      const out = [];
      const byKey = Object.fromEntries(s.fields.map((f) => [f[0], f]));
      const make = (k) => { const [key, label, kind, opts] = byKey[k]; return input(key, label, kind, opts); };
      for (const [k] of s.fields) {
        if (['courtDate', 'subpoenaGJ', 'asa', 'ausa', 'judge'].includes(k)) continue;
        if (k === 'courtBranch') out.push(h('div', { class: 'rf-line-row rf-row-court' }, make('courtBranch'), make('courtDate')));
        else if (k === 'searchWarrant') out.push(h('div', { class: 'rf-line-row rf-row-3' }, switchLine('doc', [['searchWarrant', 'Search Warrant Number'], ['subpoenaGJ', 'Subpoena GJ Number']]), switchLine('pros', [['asa', 'ASA Approving'], ['ausa', 'AUSA Approving']]), judgeLine()));
        else if (k === 'funds') out.push(fundsEditor());
        else out.push(make(k));
      }
      return out;
    }
    // v1.86: the secondary reporting officer (name, star, date, time and signature) can be left out.
    const SECOND = ['secondOfficer', 'secondStar', 'secondDate', 'secondTime'];
    function approvalFields(s) {
      const els = s.fields.map(([k, label, kind, opts]) => { const el = input(k, label, kind, opts); if (SECOND.includes(k)) el.classList.add('rf-second'); return el; });
      const on = !F().isHidden(data, 'secondOfficer');
      const cb = h('input', { type: 'checkbox', checked: on, 'aria-label': 'Include a secondary reporting officer' });
      const row = h('label', { class: 'check-row span-all rf-second-toggle' }, cb, h('span', {}, h('strong', {}, 'Secondary Reporting Officer'), h('span', { class: 'muted small' }, ': untick when there is none. The name, star and signature boxes then come off the PDF.')));
      const show = () => { for (const el of els) if (el.classList.contains('rf-second')) el.hidden = !cb.checked; };
      cb.addEventListener('change', () => {
        data.hidden = data.hidden.filter((x) => x !== 'secondOfficer');
        if (!cb.checked) data.hidden.push('secondOfficer');
        show();
        save();
      });
      show();
      const at = s.fields.findIndex(([k]) => k === 'secondOfficer');
      return [...els.slice(0, at), row, ...els.slice(at)];
    }
    const sections = F().SECTIONS.map((s) => part(s.id, s.title, s.icon,
      h('div', { class: s.id === 'report' ? 'rf-lines' : `rf-grid${s.id === 'update' || s.id === 'people' ? ' rf-grid-4' : s.id === 'approval' ? ' rf-grid-officers' : s.id === 'assignment' ? ' rf-grid-assign' : ''}` }, s.id === 'report' ? reportLines(s) : s.id === 'update' ? updateFields(s) : s.id === 'approval' ? approvalFields(s) : s.fields.map(([k, label, kind, opts]) => input(k, label, kind, opts))),
      ...(s.lists || []).map(listEditor)));

    // ---- evidence inventoried: one card per exhibit (number given automatically)
    const evRows = h('div', { class: 'rf-exhibits' });
    // v1.108: a note for the whole part ("See DEA 6 for further information"), shown once it is set.
    const evNote = h('input', { class: 'rf-ev-note-input', autocomplete: 'off', value: data.evidenceNote || '', 'aria-label': 'Evidence note' });
    evNote.addEventListener('input', () => { data.evidenceNote = evNote.value; save(); });
    const evNoteBox = String(data.evidenceNote || '').trim() ? ui.field('Evidence Note', evNote, 'rf-ev-note') : null;
    // v1.156: chain of custody: a dated log of who had each exhibit, printed with the report.
    const custodyLine = (e) => {
      const st = CVCustody.status(e.custody);
      const n = CVCustody.normalize(e.custody).length;
      if (st.state === 'none') return 'No entries yet';
      const where = { in: 'In evidence', out: `Out: ${st.last.action}${st.last.to ? ` (${st.last.to})` : ''}`, gone: st.last.action }[st.state];
      return `${n} entr${n === 1 ? 'y' : 'ies'} · ${where}`;
    };
    const nextAction = (a) => ({ 'Checked Out': 'Returned', 'Sent to Lab': 'Returned from Lab', 'Taken to Court': 'Returned from Court' }[a] || 'Checked Out');
    async function custodyDialog(e, after) {
      const n = e.number;
      const list = h('div', { class: 'custody-list' });
      const draw = () => {
        const log = CVCustody.normalize(e.custody);
        list.replaceChildren(log.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'data-table custody-table' },
          h('thead', {}, h('tr', {}, ...['Date / Time', 'Action', 'Released By', 'Received By', 'Purpose', ''].map((t) => h('th', {}, t)))),
          h('tbody', {}, ...log.map((x, i) => h('tr', {},
            h('td', { class: 'nowrap' }, `${x.date ? ui.fmtDate(x.date) : '—'}${x.time ? ` ${x.time}` : ''}`), h('td', {}, x.action), h('td', {}, x.from || '—'), h('td', {}, x.to || '—'), h('td', {}, x.purpose || '—'),
            h('td', {}, archived ? null : h('button', { class: 'icon-btn danger-icon', type: 'button', title: 'Delete this entry', onclick: () => {
              const all = CVCustody.normalize(e.custody);
              all.splice(i, 1);
              e.custody = all; save(0); draw();
            } }, ui.icon('trash3'), h('span', { class: 'sr-only' }, 'Delete entry')))))))) : h('p', { class: 'muted small' }, 'No entries yet. Start with when it was received or seized.'));
        // v1.172: the gaps in the log (checked out and not returned, sent to the lab with no return…).
        const gaps = root.CVHealth ? CVHealth.custodyGaps(e).filter((g) => !/no chain of custody entries/.test(g.text)) : [];
        if (gaps.length) list.append(h('div', { class: 'custody-gaps', role: 'note' }, h('strong', {}, `Gaps in the chain of custody (${gaps.length})`),
          h('ul', { class: 'small' }, ...gaps.map((g) => h('li', { class: `sev-${g.severity.toLowerCase()}` }, h('span', { class: `pill sev sev-${g.severity.toLowerCase()}` }, g.severity), ' ', g.text.replace(/^Exhibit [^:]+: /, ''))))));
      };
      draw();
      const date = h('input', { type: 'date', value: Vault.localDay(), 'aria-label': 'Custody date' });
      const time = root.CVTimeField ? CVTimeField.create({ label: 'Custody time', value: '' }) : h('input', { type: 'time', 'aria-label': 'Custody time' });
      const last = CVCustody.normalize(e.custody).pop();
      const action = h('select', { 'aria-label': 'Custody action' }, CVCustody.ACTIONS.map((a) => h('option', { value: a }, a)));
      action.value = last ? nextAction(last.action) : CVCustody.ACTIONS[0];
      const from = h('input', { maxlength: 80, autocomplete: 'off', 'aria-label': 'Released by', value: last ? last.to : '' });
      const to = h('input', { maxlength: 80, autocomplete: 'off', 'aria-label': 'Received by' });
      const purpose = h('input', { maxlength: 160, autocomplete: 'off', 'aria-label': 'Purpose' });
      const err = h('p', { class: 'error-text', role: 'alert' });
      await ui.openDialog((close) => h('div', { class: 'custody-dialog' },
        h('h2', { icon: 'clipboard2-check' }, `Chain of Custody: Exhibit ${n}`),
        h('p', { class: 'muted small' }, String(e.description || '').trim() || 'Each time the exhibit changes hands: when, what happened, who released it and who received it.'),
        list,
        archived ? null : h('form', { class: 'custody-form', onsubmit: (ev) => {
          ev.preventDefault();
          err.textContent = '';
          if (!date.value) { err.textContent = 'Pick the date.'; return; }
          if (!to.value.trim() && !from.value.trim()) { err.textContent = 'Type who released it or who received it.'; to.focus(); return; }
          e.custody = [...CVCustody.normalize(e.custody), { date: date.value, time: time.value || '', action: action.value, from: from.value.trim(), to: to.value.trim(), purpose: purpose.value.trim() }];
          save(0); draw();
          from.value = to.value.trim(); to.value = ''; purpose.value = '';
          action.value = nextAction(action.value);
        } },
        h('div', { class: 'custody-grid' }, ui.field('Date', date), ui.field('Time', time), ui.field('Action', action), ui.field('Released By', from), ui.field('Received By', to), ui.field('Purpose', purpose)),
        err, h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'submit', icon: 'plus-lg' }, 'Add Entry'))),
        h('div', { class: 'dialog-actions' },
          h('button', { 'data-ro-ok': 'true', class: 'btn', type: 'button', icon: 'printer', onclick: () => custodyPdf([e]) }, 'Print'),
          h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Done'))));
      if (after) after();
    }
    async function custodyPdf(list) {
      save(0);
      const bytes = CVCustody.build({ number: c.number || '', title: [CVOperation.subjectLabel(c.subject), c.title].filter(Boolean).join(' · '), exhibits: list, fmtDate: ui.fmtDate },
        { letterhead: root.CVLetterhead ? await root.CVLetterhead.forPdf().catch(() => null) : null, printed: ui.fmtDate(Vault.localDay()) });
      const name = `Chain of Custody ${c.number || ''}.pdf`.replace(/\s+\.pdf$/, '.pdf').replace(/[\\/:*?"<>|]/g, '');
      const viewer = CVPdfViewer.create(bytes, { h, icon: ui.icon, title: 'Chain of Custody', fileName: name });
      await ui.openDialog((close) => h('div', { class: 'pdf-view' }, h('h2', { icon: 'printer' }, 'Chain of Custody'), viewer,
        h('div', { class: 'dialog-actions' },
          archived ? null : h('button', { class: 'btn', type: 'button', icon: 'save', title: 'Save this PDF in the case\'s Files (Supplementary Report)', onclick: async () => {
            try { await ui.Save.track(`files:${c.id}`, () => Vault.addFile(c.id, new File([bytes], name, { type: 'application/pdf' }), { folder: 'Supplementary Report', description: 'Chain of Custody', replace: true })); ui.toast('Saved to Files → Supplementary Report.', 'success'); } catch (err) { ui.toast(`Not saved: ${err.message}`, 'error'); }
          } }, 'Save PDF to Case'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
      viewer.destroy();
    }
    const drawEvidence = () => {
      evRows.replaceChildren(...(data.evidence.length ? data.evidence.map((e, i) => {
        const n = e.number;
        const inv = h('input', { value: e.inventory || '', autocomplete: 'off', 'aria-label': `Exhibit ${n} inventory number` });
        inv.addEventListener('input', () => { e.inventory = inv.value; save(); });
        const type = h('select', { 'aria-label': `Exhibit ${n} type` }, ['', ...F().EVIDENCE_TYPES].map((t) => h('option', { value: t, selected: t === (e.type || '') }, t || '—')));
        const drug = h('select', { 'aria-label': `Exhibit ${n} narcotic type` }, ['', ...F().DRUG_TYPES].map((t) => h('option', { value: t, selected: t === (e.drug || '') }, t || '—')));
        drug.addEventListener('change', () => { e.drug = drug.value; save(); });
        const weight = h('input', { value: e.weight || '', autocomplete: 'off', placeholder: '12.4 g', 'aria-label': `Exhibit ${n} weight` });
        weight.addEventListener('input', () => { e.weight = weight.value; save(); });
        const narc = h('div', { class: 'rf-narc', hidden: e.type !== 'Narcotics' }, ui.field('Narcotic Type', drug), ui.field('Weight', weight));
        type.addEventListener('change', () => { e.type = type.value; narc.hidden = e.type !== 'Narcotics'; save(); });
        const desc = h('textarea', { rows: 3, 'aria-label': `Exhibit ${n} description`, placeholder: 'What, where found, when, by whom' });
        desc.value = e.description || '';
        desc.addEventListener('input', () => { e.description = desc.value; save(); });
        // Photos: saved in the case's exhibit folder; click one to view it.
        if (!Array.isArray(e.photoLabels)) e.photoLabels = (e.photos || []).map(() => '');
        const strip = h('div', { class: 'rf-photos' });
        const drawPhotos = () => {
          strip.replaceChildren(...e.photos.map((path, j) => {
            const tag = F().photoLabel(n, j);
            const img = h('img', { alt: `Exhibit ${tag}` });
            showThumb(c, path, img);
            // A label for each photo (v1.34): shown under it here and in its caption in the PDF.
            const label = h('input', { class: 'rf-photo-label', maxlength: 120, placeholder: isPdf(path) ? 'Label this PDF' : 'Label this photo', 'aria-label': `Label for photo ${tag}`, readonly: archived || null });
            label.value = e.photoLabels[j] || '';
            label.addEventListener('input', () => { e.photoLabels[j] = label.value; save(); });
            return h('figure', { class: 'rf-photo-card' },
              h('div', { class: 'rf-photo' },
                h('span', { class: 'rf-photo-tag' }, tag),
                isPdf(path) ? h('span', { class: 'rf-photo-pdf', title: 'PDF: every page goes into the report' }, 'PDF') : null,
                h('button', { 'data-ro-ok': 'true', class: 'rf-photo-open', type: 'button', title: 'View', onclick: () => ui.previewFile(c, path) }, img),
                archived ? null : h('button', { class: 'rf-photo-x', type: 'button', title: 'Take off this exhibit (the file stays in the case files)', onclick: () => { e.photos.splice(j, 1); e.photoLabels.splice(j, 1); drawPhotos(); save(); } }, ui.icon('x-lg'), h('span', { class: 'sr-only' }, 'Remove photo'))),
              label);
          }));
        };
        drawPhotos();
        if (!archived) relabelPhotos(c, e, n).then((changed) => { if (changed) { drawPhotos(); save(0); } }).catch(() => {});
        const picker = h('input', { type: 'file', accept: PICK_ACCEPT, multiple: true, hidden: true });
        picker.addEventListener('change', async () => {
          const files = [...picker.files];
          picker.value = '';
          for (const f of files) {
            try {
              // v1.41: named like its label here (Exhibit 1a, 1b), not "Exhibit 1 (2)".
              const path = await Save.track(`photo:${c.id}`, () => Vault.addFile(c.id, f, { folder: e.type === 'Narcotics' ? 'Drug Exhibits' : 'Other Exhibits', description: `Exhibit ${F().photoLabel(n, e.photos.length)}` }));
              e.photos.push(path);
              e.photoLabels.push('');
            } catch { /* reported by Save */ }
          }
          drawPhotos();
          save(0);
        });
        // v1.172: how many gaps the log has, beside the button.
        const gapTag = h('span', { class: 'custody-gap-tag', hidden: true });
        const drawGapTag = () => {
          const n = root.CVHealth ? CVHealth.custodyGaps(e).filter((g) => g.severity !== 'Low' && !/no chain of custody entries/.test(g.text)).length : 0;
          gapTag.hidden = !n; gapTag.textContent = `${n} gap${n === 1 ? '' : 's'}`; gapTag.title = n ? 'The chain of custody has gaps: open it to see them' : '';
        };
        drawGapTag();
        // v1.173: Read Labels: the photos of the exhibit read (OCR, on this PC) for the inventory number on its label.
        const labelOut = h('ul', { class: 'label-reads small', hidden: true });
        const photosNow = () => (e.photos || []).filter((x) => /\.(jpe?g|png|webp|bmp|gif)$/i.test(x));
        const labelBtn = h('button', { 'data-ro-ok': 'true', class: 'btn small rf-label-btn', type: 'button', icon: 'search', hidden: !photosNow().length, title: 'Reads the exhibit\'s photos (on this PC) for the inventory number on the label, and compares it with the Inventory Number', onclick: async () => {
          const list = photosNow();
          if (!list.length) return;
          labelBtn.disabled = true; labelOut.hidden = false;
          labelOut.replaceChildren(h('li', { class: 'muted' }, `Reading ${list.length} photo${list.length === 1 ? '' : 's'}…`));
          const rows = [];
          for (const [j, path] of list.entries()) {
            let v = { state: 'none' };
            try {
              const d = await CVChecks.documentText(c, path, () => {});
              v = CVMissionTools.labelVerdict(e.inventory, CVMissionTools.labelNumbers(d.paragraphs.map((x) => x.text).join('\n')));
            } catch (err) { if (FS.isDisconnectError(err)) { ui.onDriveLost(); return; } v = { state: 'error', message: err.message }; }
            const name = `Photo ${j + 1}`;
            rows.push(h('li', { class: `label-${v.state}` },
              v.state === 'match' ? `${name}: Inventory #${v.number}, matches.`
                : v.state === 'differs' ? `${name}: the label reads ${v.number}, not ${String(e.inventory).trim()}${v.near ? ' (one or two digits apart: a typo on the label or here?)' : ''}.`
                  : v.state === 'unlisted' ? `${name}: the label reads ${v.number}; this exhibit has no Inventory Number yet.`
                    : v.state === 'error' ? `${name}: could not be read (${v.message}).` : `${name}: no inventory number could be read.`));
          }
          labelOut.replaceChildren(...rows);
          labelBtn.disabled = false;
        } }, 'Read Labels');
        new MutationObserver(() => { labelBtn.hidden = !photosNow().length; }).observe(strip, { childList: true }); // shown once there is a photo
        const custodyBtn = h('button', { 'data-ro-ok': 'true', class: 'btn small rf-custody-btn', type: 'button', icon: 'clipboard2-check', title: 'Who had this exhibit and when (received, checked out, sent to the lab, court…)', onclick: () => custodyDialog(e, () => { custodyBtn.firstChild.textContent = `Chain of Custody: ${custodyLine(e)}`; drawGapTag(); }) }, h('span', {}, `Chain of Custody: ${custodyLine(e)}`));
        // A big camera tile, the size of a photo (v1.34), so it's easy to find.
        const addPhoto = archived ? null : h('button', { class: 'rf-photo-add', type: 'button', title: 'Add photos or PDFs of this exhibit (every page of a PDF goes into the report)', onclick: () => picker.click() }, ui.icon('camera-fill'), h('span', {}, 'Add Photos or PDF'));
        return h('div', { class: 'rf-exhibit-card' },
          h('div', { class: 'rf-exhibit-no', title: 'Given automatically; never reused' }, h('span', { class: 'small muted' }, 'Exhibit No.'), h('strong', { class: 'rf-exhibit' }, String(n))),
          h('div', { class: 'rf-exhibit-body' },
            h('div', { class: 'rf-exhibit-row' }, ui.field('Inventory Number', inv), ui.field('Type', type), narc),
            ui.field('Description', desc, 'span-all'),
            h('div', { class: 'rf-photo-row' }, strip, addPhoto, picker),
            h('div', { class: 'rf-custody-row' }, custodyBtn, gapTag, labelBtn), labelOut),
          archived ? null : h('button', { class: 'icon-btn danger-icon', type: 'button', title: 'Remove exhibit', onclick: () => { data.evidence.splice(i, 1); drawEvidence(); save(); } }, ui.icon('trash3'), h('span', { class: 'sr-only' }, `Remove exhibit ${n}`)));
      }) : [h('p', { class: 'muted small rf-empty empty-note' }, ui.icon('camera-fill'), h('span', {}, 'No evidence yet.'))]));
    };
    drawEvidence();
    const custodyAll = h('button', { 'data-ro-ok': 'true', class: 'btn small', type: 'button', icon: 'printer', title: 'Every exhibit\'s chain of custody in one PDF, to print with the report', onclick: () => custodyPdf(data.evidence) }, 'Chain of Custody PDF');
    const addExhibit = h('button', { class: 'btn small', type: 'button', icon: 'plus-lg', title: c.agencyNumber ? `Numbered on from the last exhibit of any case with federal jacket number ${c.agencyNumber}.` : 'Numbered on from the last exhibit of this case. Cases with the same federal jacket number share one sequence.', onclick: async () => {
      try {
        const n = await nextNumber();
        data.evidence.push({ number: n, inventory: '', type: '', drug: '', weight: '', description: '', photos: [], photoLabels: [] });
        data.lastExhibit = Math.max(Number(data.lastExhibit) || 0, n);
        drawEvidence();
        save(0);
        drawNext();
        const last = evRows.lastElementChild && evRows.lastElementChild.querySelector('input');
        if (last) last.focus();
      } catch (err) { if (FS.isDisconnectError(err)) ui.onDriveLost(); }
    } }, 'Add Exhibit');
    // v1.42: the numbering can start again (Reset to 1) or from any number. Empty: numbered on
    // automatically, as before.
    const nextNumber = async () => (Number(data.exhibitStart) > 0
      ? F().nextFrom(data.exhibitStart, data.evidence.map((e) => e.number))
      : F().nextExhibit(await numbersInUse(c, data)));
    const startAt = h('input', { type: 'number', min: 1, step: 1, inputmode: 'numeric', class: 'rf-num rf-start-at', 'aria-label': 'Next exhibit number', value: Number(data.exhibitStart) > 0 ? data.exhibitStart : '' });
    const drawNext = () => { nextNumber().then((n) => { startAt.placeholder = String(n); if (Number(data.exhibitStart) > 0) startAt.value = String(n); }).catch(() => {}); };
    startAt.addEventListener('change', () => { const v = parseInt(startAt.value, 10); data.exhibitStart = v > 0 ? v : 0; save(0); drawNext(); });
    const resetBtn = h('button', { class: 'btn small ghost', type: 'button', onclick: () => { data.exhibitStart = 1; save(0); drawNext(); } }, 'Reset to 1');
    const autoBtn = h('button', { class: 'btn small ghost', type: 'button', onclick: () => { data.exhibitStart = 0; startAt.value = ''; save(0); drawNext(); } }, 'Automatic');
    // v1.107: a case entered later but dated earlier: its exhibits move up, the others follow.
    const dateBtn = h('button', { class: 'btn small', type: 'button', icon: 'list-ol', title: 'Number the exhibits again in date order (Date of Occurrence) across every case that shares this sequence', onclick: () => dateOrderDialog() }, 'Put in Date Order');
    const numbering = archived ? null : h('div', { class: 'rf-numbering' }, h('label', { class: 'rf-numbering-label' }, h('span', {}, 'Next Exhibit No.'), startAt), resetBtn, autoBtn, dateBtn);
    async function dateOrderDialog() {
      save(0);
      await Save.flushAll();
      if (Save.failed.size) { toast('Some changes are not saved yet. Reconnect the SSD first.', 'error'); return; }
      const agency = String(c.agencyNumber || '').trim().toLowerCase();
      const entries = (Vault.data.cases || []).filter((x) => x.id === c.id || (agency && String(x.agencyNumber || '').trim().toLowerCase() === agency));
      const group = [];
      const skipped = [];
      for (const e of entries) {
        if (Vault.isArchived(e.id)) { skipped.push(e.number || e.title || e.id); continue; } // read-only
        const d = e.id === c.id ? F().normalize(await Vault.readCaseJSON(c.id, FILE)) : F().normalize(await Vault.readCaseJSON(e.id, FILE).catch(() => null));
        group.push({ id: e.id, number: e.number || '', date: d.date || '', opened: e.opened || '', evidence: d.evidence, d });
      }
      const plan = F().dateOrderPlan(group);
      if (!plan.changed) { toast('The exhibits are already in date order.', 'success'); return; }
      const byId = new Map(group.map((g) => [g.id, g]));
      const ok = await ui.openDialog((close) => h('div', { class: 'confirm date-order' },
        h('h2', { icon: 'list-ol' }, 'Put Exhibits in Date Order'),
        h('p', {}, agency ? `Every case with federal jacket number ${c.agencyNumber} shares one exhibit sequence. Numbered again by Date of Occurrence (the opened date when it is empty):` : 'Numbered again in order:'),
        h('table', { class: 'date-order-table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Case'), h('th', {}, 'Date'), h('th', {}, 'Exhibits'))),
          h('tbody', {}, plan.order.map((id) => { const g = byId.get(id); const ch = plan.changes[id];
            return h('tr', {}, h('td', {}, g.number || 'No number'), h('td', {}, g.date ? F().shown('date', g.date) : `${g.opened ? `opened ${g.opened}` : '—'}`),
              h('td', {}, ch.length ? ch.map(([a, b2]) => (a === b2 ? `${b2}` : `${a} → ${b2}`)).join(', ') : 'none')); }))),
        h('p', { class: 'muted small' }, 'Exhibit photos and PDFs are renamed to their new numbers. Reports already sent keep the numbers they were sent with, and an exhibit number typed into a narrative is not changed: check those.'),
        skipped.length ? h('p', { class: 'muted small' }, `Archived (read-only, left as they are): ${skipped.join(', ')}.`) : null,
        CVKit.cancelRow(h, () => close(false), h('button', { class: 'btn primary', type: 'button', icon: 'list-ol', onclick: () => close(true) }, 'Renumber'))));
      if (!ok) return;
      try {
        for (const id of plan.order) {
          const g = byId.get(id);
          const map = new Map(plan.changes[id]);
          const ev = [...g.d.evidence].sort((x, y) => (parseInt(x.number, 10) || 0) - (parseInt(y.number, 10) || 0));
          // Photos and PDFs: renamed in two steps, so 1 → 2 and 2 → 1 never collide.
          for (const step of ['tmp', 'final']) {
            for (const e of ev) {
              const to = map.get(parseInt(e.number, 10));
              if (to == null || to === parseInt(e.number, 10)) continue;
              for (let j = 0; j < (e.photos || []).length; j++) {
                const { folder } = CVCaseFiles.splitPath(e.photos[j]);
                const label = step === 'tmp' ? `Renumbering ${to}-${j}` : `Exhibit ${F().photoLabel(to, j)}`;
                try { e.photos[j] = await Vault.moveFile(id, e.photos[j], folder, { description: label }); } catch (err) { if (FS.isDisconnectError(err)) throw err; }
              }
            }
          }
          for (const e of ev) { const to = map.get(parseInt(e.number, 10)); if (to != null) e.number = to; }
          g.d.evidence.sort((x, y) => x.number - y.number);
          g.d.lastExhibit = Math.max(0, ...g.d.evidence.map((e) => e.number));
          g.d.exhibitStart = 0;
          await Save.track(`report-fields:${id}`, () => Vault.writeCaseJSON(id, FILE, g.d));
        }
        toast('Exhibits renumbered in date order.', 'success', 5000);
        ui.refresh();
      } catch (err) {
        if (FS.isDisconnectError(err)) ui.onDriveLost(); else toast(`Renumbering stopped: ${err.message}`, 'error', 9000);
      }
    }
    drawNext();

    // ---- v1.68: Additional Exhibits: photographs or text-message screenshots not tied to an
    // inventory number, numbered on their own (Additional Exhibit 1; photos 1a, 1b…).
    const exRows = h('div', { class: 'rf-exhibits rf-extra-exhibits' });
    async function textsPdf(x) {
      save(0);
      await Save.flushAll();
      const name = `Additional Exhibit ${x.number} - Text Messages`;
      const bytes = CVReportPdf.textsReport(await extraJpegs(c, x), {
        heading: `Text Message Correspondence - Additional Exhibit ${x.number}${x.title ? `: ${x.title}` : ''}`,
        title: name, description: x.description || '',
        caseLabel: [c.title, c.number ? `Case ${c.number}` : ''].filter(Boolean).join(' · '),
      });
      if (!archived) {
        try {
          await Save.track(`texts-pdf:${c.id}`, () => Vault.addFile(c.id, new File([bytes], `${name}.pdf`, { type: 'application/pdf' }), { folder: 'Other Exhibits', description: name, replace: true }));
          toast(`${name}.pdf saved to Files (Other Exhibits).`, 'success', 3000);
        } catch { /* reported by Save */ }
      }
      const viewer = CVPdfViewer.create(bytes, { h, icon: ui.icon, title: name, fileName: `${name}.pdf` });
      await ui.openDialog((close) => h('div', { class: 'pdf-view' },
        h('h2', { icon: 'chat-square-text' }, 'Text Message Report'),
        viewer,
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
      viewer.destroy();
    }
    const drawExtras = () => {
      exRows.replaceChildren(...(data.extraExhibits.length ? data.extraExhibits.map((x, i) => {
        const n = x.number;
        const kind = h('select', { 'aria-label': `Additional exhibit ${n} kind` }, F().EXTRA_KINDS.map(([k, l]) => h('option', { value: k, selected: k === x.kind }, l)));
        const title = h('input', { value: x.title || '', autocomplete: 'off', placeholder: x.kind === 'texts' ? 'Between UC and Target' : 'What the photos show', 'aria-label': `Additional exhibit ${n} title` });
        title.addEventListener('input', () => { x.title = title.value; save(); });
        const desc = h('textarea', { rows: 2, 'aria-label': `Additional exhibit ${n} description`, placeholder: 'Where they came from, when and by whom.' });
        desc.value = x.description || '';
        desc.addEventListener('input', () => { x.description = desc.value; save(); });
        const strip = h('div', { class: `rf-photos${x.kind === 'texts' ? ' rf-photos-texts' : ''}` });
        const drawPhotos = () => {
          strip.replaceChildren(...x.photos.map((path, j) => {
            const tag = F().photoLabel(n, j);
            const img = h('img', { alt: `Additional Exhibit ${tag}` });
            showThumb(c, path, img);
            const label = h('input', { class: 'rf-photo-label', maxlength: 120, placeholder: isPdf(path) ? 'Label this PDF' : 'Label this photo', 'aria-label': `Label for additional photo ${tag}`, readonly: archived || null });
            label.value = x.photoLabels[j] || '';
            label.addEventListener('input', () => { x.photoLabels[j] = label.value; save(); });
            return h('figure', { class: 'rf-photo-card' },
              h('div', { class: 'rf-photo' },
                h('span', { class: 'rf-photo-tag' }, tag),
                isPdf(path) ? h('span', { class: 'rf-photo-pdf', title: 'PDF: every page goes into the report' }, 'PDF') : null,
                h('button', { 'data-ro-ok': 'true', class: 'rf-photo-open', type: 'button', title: 'View', onclick: () => ui.previewFile(c, path) }, img),
                archived ? '' : h('button', { class: 'rf-photo-x', type: 'button', title: 'Take off this exhibit (the file stays in the case files)', onclick: () => { x.photos.splice(j, 1); x.photoLabels.splice(j, 1); drawPhotos(); save(); } }, ui.icon('x-lg'), h('span', { class: 'sr-only' }, 'Remove photo'))),
              label);
          }));
        };
        drawPhotos();
        const picker = h('input', { type: 'file', accept: PICK_ACCEPT, multiple: true, hidden: true });
        picker.addEventListener('change', async () => {
          const files = [...picker.files];
          picker.value = '';
          for (const f of files) {
            try {
              const path = await Save.track(`photo:${c.id}`, () => Vault.addFile(c.id, f, { folder: 'Other Exhibits', description: `Additional Exhibit ${F().photoLabel(n, x.photos.length)}` }));
              x.photos.push(path);
              x.photoLabels.push('');
            } catch { /* reported by Save */ }
          }
          drawPhotos();
          save(0);
        });
        const addPhoto = archived ? '' : h('button', { class: 'rf-photo-add', type: 'button', title: x.kind === 'texts' ? 'Add screenshots of the text messages (or a PDF of them)' : 'Add photographs or PDFs (every page of a PDF goes into the report)', onclick: () => picker.click() }, ui.icon(x.kind === 'texts' ? 'chat-square-text' : 'camera-fill'), h('span', {}, x.kind === 'texts' ? 'Add Screenshots' : 'Add Photos or PDF'));
        const pdfBtn = x.kind === 'texts' ? h('button', { 'data-ro-ok': 'true', class: 'btn small', type: 'button', icon: 'file-earmark-pdf', title: 'A portrait PDF of the screenshots, two to a page, each labelled. Saved under Files (Other Exhibits).', onclick: async (ev) => { const b = ev.currentTarget; b.disabled = true; b.classList.add('busy'); try { await textsPdf(x); } finally { b.disabled = false; b.classList.remove('busy'); } } }, 'Text Message PDF') : '';
        kind.addEventListener('change', () => { x.kind = kind.value; save(0); drawExtras(); });
        return h('div', { class: 'rf-exhibit-card rf-extra-card' },
          h('div', { class: 'rf-exhibit-no', title: 'Additional Exhibit: not tied to an inventory number' }, h('span', { class: 'small muted' }, 'Additional'), h('strong', { class: 'rf-exhibit' }, String(n))),
          h('div', { class: 'rf-exhibit-body' },
            h('div', { class: 'rf-exhibit-row' }, ui.field('Kind', kind), ui.field('Title', title), pdfBtn ? h('div', { class: 'rf-extra-pdf' }, pdfBtn) : ''),
            ui.field('Description', desc, 'span-all'),
            h('div', { class: 'rf-photo-row' }, strip, addPhoto, picker)),
          archived ? '' : h('button', { class: 'icon-btn danger-icon', type: 'button', title: 'Remove additional exhibit', onclick: () => { data.extraExhibits.splice(i, 1); drawExtras(); drawExtraNext(); save(); } }, ui.icon('trash3'), h('span', { class: 'sr-only' }, `Remove additional exhibit ${n}`)));
      }) : [h('p', { class: 'muted small empty-note' }, ui.icon('image'), h('span', {}, 'No additional exhibits.'))]));
    };
    drawExtras();
    const extraAt = h('input', { type: 'number', min: 1, step: 1, inputmode: 'numeric', class: 'rf-num rf-start-at rf-extra-start', 'aria-label': 'Next additional exhibit number', value: data.extraStart > 0 ? data.extraStart : '' });
    const drawExtraNext = () => { const n = F().nextExtra(data); extraAt.placeholder = String(n); if (data.extraStart > 0) extraAt.value = String(n); };
    extraAt.addEventListener('change', () => { const v = parseInt(extraAt.value, 10); data.extraStart = v > 0 ? v : 0; save(0); drawExtraNext(); });
    const addExtra = h('button', { class: 'btn small', type: 'button', icon: 'plus-lg', title: 'Photographs or text-message screenshots not tied to an inventory number', onclick: () => {
      const n = F().nextExtra(data);
      data.extraExhibits.push({ number: n, kind: 'photos', title: '', description: '', photos: [], photoLabels: [] });
      if (data.extraStart > 0) data.extraStart = n + 1;
      drawExtras(); drawExtraNext(); save(0);
    } }, 'Add Additional Exhibit');
    const extraNumbering = h('div', { class: 'rf-numbering' },
      h('label', { class: 'rf-numbering-label' }, h('span', {}, 'Next Additional No.'), extraAt),
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => { data.extraStart = 1; save(0); drawExtraNext(); } }, 'Reset to 1'),
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => { data.extraStart = 0; extraAt.value = ''; save(0); drawExtraNext(); } }, 'Automatic'));
    drawExtraNext();
    const extrasBox = h('div', { class: 'rf-extras span-all' },
      h('h4', { class: 'rf-extras-head', icon: 'images' }, 'Additional Exhibits'),
      exRows,
      archived ? '' : h('div', { class: 'contact-add rf-evidence-add' }, addExtra, extraNumbering));

    const narrative = h('textarea', { class: 'rf-narrative', rows: 24, placeholder: 'What happened, in order. Tab indents.', 'aria-label': 'Summary of Investigation' });
    narrative.value = data.narrative || '';
    narrative.addEventListener('input', () => { data.narrative = narrative.value; save(); });
    const rich = CVRichEditor.create(narrative, { h, icon: ui.icon, label: 'Summary of Investigation' });
    const fmt = CVFormatBar.attach(narrative, { h, icon: ui.icon, rich });
    // v1.181: Ask AI to Edit the narrative (the selection, or all of it), with the case's facts.
    const askEdit = archived ? null : h('div', { class: 'rf-ai-row' }, h('button', { class: 'btn small rf-ask-edit', type: 'button', icon: 'chat-left-text',
      title: 'Tell the AI what to do with the selected text, or the whole narrative: "Make this more concise", "Add the time and place of the March 14 buy". You see its version first.',
      onclick: () => root.CVAIEdit.open({ c, target: root.CVAIEdit.editorTarget(narrative, rich) }) }, 'Ask AI to Edit'));

    const saveBtn = h('button', { class: 'btn primary', type: 'button', icon: 'save', onclick: async () => {
      save(0);
      await Save.flushAll();
      showMissing = true;
      recheckers.forEach((f) => f());
      const blank = panel.querySelectorAll('.rf-missing').length;
      if (!Save.failed.has(key)) toast(blank ? `Saved. ${blank} field${blank === 1 ? '' : 's'} still blank (outlined in red).` : 'Report fields saved to the SSD.', 'success', blank ? 5000 : 2500);
    } }, 'Save Changes');
    // v1.101: Next Missing takes you to each red outline in turn (opening a folded part on the way).
    const nextBtn = h('button', { class: 'btn rf-next-missing', type: 'button', icon: 'arrow-down', hidden: true, title: 'Go to the next field still blank (outlined in red)' });
    let nextAt = -1;
    nextBtn.addEventListener('click', () => {
      const all = [...panel.querySelectorAll('.rf-missing')];
      if (!all.length) return;
      nextAt = (nextAt + 1) % all.length;
      const el = all[nextAt];
      const sec = el.closest('.rf-section');
      const fold = sec && sec.classList.contains('rf-folded') ? sec.querySelector('.rf-fold') : null;
      if (fold) fold.click();
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const input = el.matches('input, select, textarea, [contenteditable]') ? el : el.querySelector('input:not([type=hidden]), select, textarea, [contenteditable="true"]');
      if (input) input.focus({ preventScroll: true });
      el.classList.add('rf-missing-flash');
      setTimeout(() => el.classList.remove('rf-missing-flash'), 900);
    });
    refreshNext = () => {
      const n = panel.querySelectorAll('.rf-missing').length;
      nextBtn.hidden = !n;
      // Only when the count changes: rewriting it each time would set the form's own watchers off again.
      const label = `Next Missing (${n})`;
      if (nextBtn.textContent !== label) nextBtn.textContent = label;
      if (nextAt >= n) nextAt = -1;
    };
    // ---- the Supplementary Report as a PDF: look at it and print, keep it, or send it to sign.
    // Exhibit photos as JPEG for the Exhibit Attachments pages (at most 1600 px, readable in print).
    const pdfBytes = () => pdfFor(c, data);
    async function showPdf(bytes) {
      // Our own viewer (pdf.js): the whole report always scrolls into view; zoom in percent (v1.25).
      const viewer = CVPdfViewer.create(bytes, { h, icon: ui.icon, title: 'Supplementary Report', fileName: `${F().titleFor(data)}.pdf` });
      await ui.openDialog((close) => h('div', { class: 'pdf-view' },
        h('h2', { icon: 'printer' }, 'Supplementary Report'),
        viewer,
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
      viewer.destroy();
    }
    const printBtn = h('button', { 'data-ro-ok': 'true', class: 'btn', type: 'button', icon: 'printer', title: 'Opens the report. Print it, or save it as a PDF.', onclick: async () => {
      save(0);
      await Save.flushAll();
      await showPdf(await pdfBytes());
    } }, 'Print / PDF');
    // v1.33: one button sends the draft to Reports (an editable report laid out like the PDF) and to
    // Files (the PDF, in the Supplementary Report folder). Sending again brings both up to date.
    const sendBtn = h('button', { class: 'btn primary', type: 'button', icon: 'send', title: 'Puts this report under Saved Reports and its PDF under Files (Supplementary Report). Sending again updates both.', onclick: async () => {
      save(0);
      await Save.flushAll();
      // v1.153: a checklist first: the exhibits the narrative mentions against the evidence list, and its dates in order.
      const check = F().sendChecklist(data, Vault.localDay());
      if (check.problems && !(await ui.openDialog((close) => h('div', { class: 'send-check' },
        h('h2', { icon: 'card-checklist' }, 'Before You Send'),
        h('ul', { class: 'send-check-list' }, check.items.map((x) => h('li', { class: x.ok ? 'ok' : 'warn' }, ui.icon(x.ok ? 'check-circle-fill' : 'exclamation-triangle-fill'), h('span', {}, x.text)))),
        h('p', { class: 'muted small' }, 'These are reminders only. Go back to fix them, or send the report as it is.'),
        CVKit.cancelRow(h, () => close(false), h('button', { class: 'btn primary', type: 'button', icon: 'send', onclick: () => close(true) }, 'Send Anyway')))))) return;
      try {
        let slug = await sentSlugOf(c, data);
        if (slug && !(await Vault.readDraft(c.id, slug).catch(() => null))) slug = ''; // that report was deleted
        // v1.41: each report is named after its heading (Supplementary Report - Purchase). When the
        // Officer Report Type changed since it was sent, ask: a new report (the UCO's and the
        // surveillance officer's reports of one buy), or update the one sent.
        const want = F().titleFor(data);
        let prevTitle = '';
        if (slug) {
          prevTitle = await reportTitle(c, slug);
          let snap = null;
          try { snap = await Vault.readCaseJSON(c.id, formFile(slug)); } catch (err) { if (FS.isDisconnectError(err)) throw err; }
          const prevBase = snap ? F().titleFor(F().normalize(snap)) : prevTitle;
          // v1.48: every report sent is its own, so sending again always asks (New Report first):
          // the UCO's and the surveillance officer's reports of one buy can both be Purchase.
          {
            const choice = await ui.openDialog((close) => h('form', { class: 'send-choice', onsubmit: (e) => { e.preventDefault(); close('new'); } },
              h('h2', {}, 'Make a new report?'),
              h('p', {}, prevBase !== want ? `This draft was sent as ${prevTitle}. It's now ${want}.` : `This draft was already sent as ${prevTitle}.`),
              h('p', { class: 'muted small' }, `New Report keeps ${prevTitle} exactly as it was sent (its sections, evidence and PDF) and adds ${want} under Saved Reports and Files. Update replaces ${prevTitle}.`),
              h('div', { class: 'dialog-actions' },
                h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
                h('button', { class: 'btn', type: 'button', onclick: () => close('update') }, `Update ${prevTitle}`),
                h('button', { class: 'btn primary', type: 'submit', autofocus: true }, 'New Report'))));
            if (!choice) return;
            if (choice === 'new') { slug = ''; prevTitle = ''; }
          }
        }
        // Two reports never share a title (or a PDF): "… - Purchase", "… - Purchase 2".
        const taken = new Set((await Vault.listDrafts(c.id)).filter((d) => d.slug !== slug).map((d) => d.title.toLowerCase()));
        const title = F().uniqueTitle(want, taken);
        if (!slug) slug = await Vault.newDraftSlug(c.id, title);
        const cur = await linkedReport(c, slug);
        let force = false;
        if (cur && cur.edited) {
          force = await ui.confirmDialog({ title: 'Replace the edited report?', message: `${prevTitle || title} was changed under Saved Reports. Replace its text with this draft? (Its PDF in Files is replaced too.)`, confirmText: 'Replace' });
          if (!force) return;
        }
        await syncLinked(c, data, { force, slug, title });
        // The form as sent is kept with the report, so Back to Write Report can bring it back (v1.39).
        await Save.track(`report-form:${c.id}:${slug}`, () => Vault.writeCaseJSON(c.id, formFile(slug), { ...structuredClone(data), sentSlug: slug }));
        if (data.sentSlug !== slug) { data.sentSlug = slug; save(0); await Save.flushAll(); }
        const r = await savePdfToCase(c, data, null, title);
        // Updated under a new name: its old PDF goes, so Files doesn't keep a stale copy.
        if (prevTitle && prevTitle !== title) {
          const old = pdfPathOf(c, prevTitle);
          if (old !== r.path) await Vault.deleteFile(c.id, old).catch(() => {});
        }
        // v1.89: the Draft empties once the report is sent, ready for the next one. Undo puts it back;
        // so does Back to Write Report on the report under Saved Reports.
        const before = structuredClone(data);
        await clearForm();
        undoToast(`Sent: Reports → ${title}, and Files → ${r.path.split('/').pop()}. The Draft is empty for the next report.`, before, 'The sent draft is back on the form.');
        ui.refresh();
      } catch { /* reported by Save */ }
    } }, 'Save as Report');
    // An empty form (Clear All, and after Save as Report).
    async function clearForm() {
      const fresh = F().normalize({});
      for (const k of Object.keys(data)) delete data[k];
      Object.assign(data, fresh);
      if (c.number) data.rdNumber = c.number;
      data.sentSlug = '';
      save(0);
      await Save.flushAll();
    }
    // v1.90: a toast with Undo, which puts the form back as it was before it was emptied.
    function undoToast(message, before, restored) {
      const t = toast(message, 'success', 9000);
      if (!t) return;
      const undo = h('button', { class: 'toast-undo', type: 'button' }, 'Undo');
      undo.addEventListener('click', async () => {
        t.remove();
        for (const k of Object.keys(data)) delete data[k];
        Object.assign(data, before);
        save(0);
        await Save.flushAll();
        toast(restored, 'success', 4000);
        ui.refresh();
      });
      t.append(' ', undo);
    }
    // Clear All (v1.33): an empty form, to draft another report. What was sent stays in Saved Reports and
    // Files; the next send makes a new report.
    const clearBtn = h('button', { class: 'btn danger-ghost', type: 'button', title: 'Empties the form to draft another report. Reports and Files keep what was already sent.', onclick: async () => {
      if (!(await ui.confirmDialog({ title: 'Clear the whole draft?', message: 'Every entry on this form is emptied, to draft another report. What you already sent stays under Saved Reports and Files. A draft not sent yet can be brought back with Undo right after.', confirmText: 'Clear All', danger: true }))) return;
      const before = structuredClone(data);
      await clearForm();
      undoToast('The form is empty: ready for another report.', before, 'The draft is back on the form.');
      ui.refresh();
    } }, 'Clear All');

    // v1.108: See DEA 6: a report kept for statistics only. Victims, Offenders, Charges and Evidence
    // read "See DEA 6 for further information" and the summary points to the DEA 6 reports.
    const dea6Btn = h('button', { class: 'btn', type: 'button', icon: 'file-earmark-text', title: 'For a statistics-only report: every part says See DEA 6 for further information.', onclick: async () => {
      const fed = String(c.agencyNumber || '').trim();
      const text = F().dea6Narrative(fed);
      const had = String(data.narrative || '').trim();
      const ok = await ui.confirmDialog({ title: 'See DEA 6 for further information?',
        message: `Victims, Offenders, Charges and Evidence Inventoried show "${F().SEE_DEA6}" (entries already there are kept). The Summary of Investigation becomes: ${text}${had && had !== text ? ' The summary written now is replaced (Undo brings it back).' : ''}${fed ? '' : ' This case has no Federal Jacket Number yet: add it on the Details tab, then click See DEA 6 again.'}`,
        confirmText: 'Use DEA-6 Narrative' });
      if (!ok) return;
      const before = structuredClone(data);
      F().seeDea6(data, fed);
      for (const id of ['people', 'report', 'evidence', 'summary']) folded.delete(id);
      keepFolds();
      save(0);
      await Save.flushAll();
      undoToast('Victims, Offenders, Charges and Evidence now say See DEA 6 for further information, and the summary is filled in.', before, 'The draft is back as it was.');
      ui.refresh();
    } }, 'Use DEA-6 Narrative');

    // v1.39: the heading names the Officer Report Type picked (Supplementary Report – Purchase…);
    // Show All / Hide All sit up here, and Save Changes sits with the other buttons.
    const heading = h('h2', {}, headingOf(data));
    if (els.activity) els.activity.addEventListener('change', () => { heading.textContent = headingOf(data); });
    panel.replaceChildren(
      h('div', { class: 'notes-head rf-head-bar' },
        heading, h('div', { class: 'spacer' }),
        h('button', { 'data-ro-ok': 'true', class: 'btn small ghost', type: 'button', icon: 'chevron-down', title: 'Open every part on screen', onclick: () => foldAll(false) }, 'Show All'),
        h('button', { 'data-ro-ok': 'true', class: 'btn small ghost', type: 'button', icon: 'chevron-right', title: 'Fold every part away on screen (they stay in the PDF). Open one with its arrow.', onclick: () => foldAll(true) }, 'Hide All')),
      h('p', { class: 'muted small explain' }, 'The Supplementary Report for this case: fill it in, then Save as Report puts it under Saved Reports and its PDF under Files. Clear All starts another one. Saved as report-fields.json.'),
      h('div', { class: 'rf-actions' }, archived ? null : sendBtn, printBtn, archived ? null : clearBtn, archived ? null : dea6Btn, h('div', { class: 'spacer' }), archived ? null : nextBtn, archived ? null : saveBtn),
      // v1.85: the department letterhead, as at the top of the PDF.
      archived || !root.CVLetterhead ? null : root.CVLetterhead.summary(), // v1.118: one line; the editor is in Vault → My Profile
      ...sections.slice(0, -1),
      part('evidence', 'Evidence Inventoried', 'box-seam', evNoteBox, evRows, archived ? null : h('div', { class: 'contact-add rf-evidence-add' }, addExhibit, custodyAll, numbering), extrasBox),
      part('summary', 'Summary of Investigation', 'journal-text', fmt, askEdit, rich.el, narrative),
      sections[sections.length - 1]); // Submission and Approval comes last, as on the printed report
    // v1.48: every field is one grey box with its label inside; an empty box shows the label as its
    // placeholder, and the label moves to the top of the box once there is a value.
    labelsInside(panel);
    // v1.135: once per frame at most, and only when fields are added (a typed letter, a save
    // message or this fitting itself used to set it off again on every frame, which froze typing).
    let fitQueued = false;
    const queueFit = () => { if (fitQueued) return; fitQueued = true; requestAnimationFrame(() => { fitQueued = false; fitPlaceholders(panel); }); };
    queueFit();
    new MutationObserver((ms) => {
      if (!ms.some((m) => [...m.addedNodes].some((n) => n.nodeType === 1))) return;
      labelsInside(panel); queueFit();
    }).observe(panel, { childList: true, subtree: true });
  }

  // A label that doesn't fit its box as a placeholder stays on top instead (no cut-off words).
  let measureCtx = null;
  function fitPlaceholders(root) {
    measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
    for (const f of root.querySelectorAll('.rf-section .field.rf-boxed')) {
      const inp = f.querySelector(':scope > input:not([type=checkbox]), :scope > textarea, :scope > .combo > input, :scope > select');
      if (!inp || !inp.offsetWidth) continue;
      // v1.135: measured again only when the box's width or its label changed.
      const fitKey = `${inp.clientWidth}|${inp.dataset.label || inp.placeholder || ''}`;
      if (inp.dataset.fitKey === fitKey) continue;
      inp.dataset.fitKey = fitKey;
      const cs = getComputedStyle(inp);
      measureCtx.font = `500 ${cs.fontSize} ${cs.fontFamily}`;
      if (inp.tagName !== 'SELECT' && inp.placeholder && !inp.dataset.label) inp.dataset.label = inp.placeholder;
      const text = inp.tagName === 'SELECT' ? '' : (inp.dataset.label || '');
      const room = inp.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (inp.closest('.combo') || inp.tagName === 'SELECT' ? 30 : 4);
      const lab = inp.tagName === 'SELECT' ? (inp.dataset.label || '') : text;
      const long = !!lab && measureCtx.measureText(lab).width + 8 > room;
      f.classList.toggle('rf-ph-long', long);
      // Too long: no placeholder at all, the label stays on top; else the label is the placeholder.
      const ph = long ? '' : inp.dataset.label;
      if (inp.tagName !== 'SELECT' && f.classList.contains('rf-ph') && inp.dataset.label && inp.placeholder !== ph) inp.placeholder = ph;
      // A list too narrow for its label shows the label on top and a dash as its empty choice.
      const first = long ? '—' : inp.dataset.label;
      if (inp.tagName === 'SELECT' && inp.dataset.label && inp.options[0] && inp.options[0].textContent !== first) inp.options[0].textContent = first;
    }
  }
  window.addEventListener('resize', () => { const r = document.querySelector('.tab-panel'); if (r) fitPlaceholders(r); });

  const WIDGETS = ['date-field', 'time-field', 'combo', 'rf-measure', 'rf-with-btn', 'rf-multi'];
  function labelsInside(root) {
    for (const f of root.querySelectorAll('.rf-section .field:not(.check-row):not(.rf-boxed)')) {
      const lab = [...f.children].find((el) => el.tagName === 'SPAN' && !WIDGETS.some((w) => el.classList.contains(w)));
      f.classList.add('rf-boxed');
      if (!lab) continue;
      lab.classList.add('rf-lab');
      const text = lab.textContent.trim();
      // Text boxes (also inside a searchable list) take the label as their placeholder.
      for (const inp of f.querySelectorAll(':scope > input:not([type=checkbox]):not(.rf-num), :scope > textarea, :scope > .combo > input')) {
        if (!inp.placeholder) { inp.placeholder = text; f.classList.add('rf-ph'); }
      }
      // A list's empty choice reads as the label.
      const sel = f.querySelector(':scope > select');
      if (sel && sel.options[0] && sel.options[0].value === '') { sel.options[0].textContent = text; sel.dataset.label = text; f.classList.add('rf-ph'); }
    }
  }
  const headingOf = (d) => F().titleFor(d);

  function init(kit) { ui = kit; }

  root.CVReportFieldsUI = { init, load, render, sendBack, sentPdf, numbersInUse, pdfFor, savePdfToCase, linkedReport, syncLinked, sentSlugOf, titleOf, LINKED, PDF_NAME };
})(this);
