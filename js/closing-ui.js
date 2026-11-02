/* CaseVault — screens for the case status rules (js/closing.js):
 *   - the Arrest details tab (cases/<id>/arrest.json), for arrest reports;
 *   - "Close case…" with a disposition and a loose-ends checklist;
 *   - "Reopen case".
 * Uses the small UI kit app.js exposes as window.CaseVaultUI.
 */
'use strict';

(function (root) {
  let ui = null;
  const K = () => root.CVClosing;
  const today = () => root.CVFormat.isoDay();

  /** Does this case show the Arrest details tab? */
  // A case closed by arrest has the tab too, unless its arrest details were deleted (v1.29).
  const hasArrestTab = (c) => !!(c && (c.arrest || (c.closure && c.closure.disposition === 'arrest' && !c.arrestRemoved)));

  /** Delete the arrest details (v1.29: also on the tab itself, and for a case closed by arrest). */
  async function deleteArrest(c) {
    const { Save, toast, confirmDialog } = ui;
    if (!(await confirmDialog({ title: 'Delete the arrest details?', message: 'The Arrest details tab is taken off this case, and the arrestees, arrest and charges entered there are deleted from the SSD. Arrest report drafts already made are kept.', confirmText: 'Delete', danger: true }))) return false;
    try {
      // A save of the tab still waiting would write the details back.
      const pending = Save.timers && Save.timers.get(`arrest:${c.id}`);
      if (pending) { clearTimeout(pending.timer); Save.timers.delete(`arrest:${c.id}`); }
      const fresh = await Vault.getCase(c.id);
      fresh.arrest = false;
      fresh.arrestRemoved = true;
      fresh.people = [];
      await Save.track(`arrest:${c.id}`, () => Vault.writeCaseJSON(c.id, 'arrest.json', K().emptyArrest()));
      await Save.track(`case:${c.id}`, () => Vault.saveCase(fresh));
      Object.assign(c, fresh);
      toast('Arrest details deleted.', 'success', 2500);
      location.hash = `#/case/${CVRoute.enc(c.id)}/details`;
      ui.refresh();
      return true;
    } catch { return false; /* reported by Save */ }
  }

  // Charges to pick from (v1.29): the Reference's Illinois and federal statutes; search by
  // statute or wording, picking fills both boxes. They can still be typed over.
  // v1.32: the charges on the case's Supplementary Report (Write Report tab) come first.
  const chargeItems = (fromReport = []) => [
    ...fromReport.map((x) => ({ label: `${x.statute || ''} ${x.description || ''}`.trim(), hint: 'On the Supplementary Report', statute: x.statute || '', desc: x.description || '' })),
    ...((root.CVRefData && root.CVRefData.CHARGES) || []).flatMap((g) => g.codes.map(([statute, desc]) => ({ label: `${statute} ${desc}`, hint: g.title, statute, desc }))),
  ];

  async function readArrest(c) {
    return (await Vault.readCaseJSON(c.id, 'arrest.json').catch(() => null)) || K().emptyArrest();
  }

  /** {{arrest.*}} and {{closure.*}} values for templates. */
  async function templateExtra(c) {
    const arrest = await Vault.readCaseJSON(c.id, 'arrest.json').catch(() => null);
    // {{report.*}} from Reports → Report Fields (v1.18).
    const fields = root.CVReportFields ? await Vault.readCaseJSON(c.id, 'report-fields.json').catch(() => null) : null;
    // v1.140: {{training}} and the rest from Other Files → Training.
    const training = root.CVTraining ? CVTraining.context(await Vault.trainingRows().catch(() => [])) : {};
    // v1.172: {{evidence}}, {{buys}}, {{buys.count}}, {{buys.total}} and {{inventory}} (tables from the evidence list and the Timeline).
    const tl = await Vault.getTimeline(c.id).catch(() => null);
    const tables = root.CVHealth ? root.CVHealth.templateValues({ evidence: (fields && fields.evidence) || [], events: (tl && tl.events) || [] }) : {};
    return { ...K().arrestContext(arrest || { arrestees: [] }), ...K().closureContext(c.closure), ...(fields ? CVReportFields.context(fields) : {}), ...training, ...tables };
  }

  /* ---------------- Arrest details tab ---------------- */

  /* The Arrest details tab (v1.30): laid out like an arrest report, one per arrestee, in the
   * report's order. Print / PDF, Save PDF to Case and Email for E-Sign make the Arrest Report
   * PDF (js/arrest-pdf.js), in the same style as the Supplementary Report. */
  const IMAGE_RE = /\.(jpe?g|png|gif|webp|bmp)$/i;

  async function renderArrest(panel, c, token) {
    const { h, Save, toast } = ui;
    const arrest = K().normalizeArrest(await readArrest(c));
    const archived = Vault.isArchived(c.id);
    const RFsee = (x) => root.CVReportFields.isSeeDea6('charges', x);
    if (token !== ui.state.renderToken) return;
    if (!arrest.arrestees.length) arrest.arrestees.push(K().emptyArrestee());
    // The RD number is the case number unless you type another.
    for (const a of arrest.arrestees) if (!a.rdNumber && c.number) a.rdNumber = c.number;
    const images = archived ? [] : (await Vault.listFiles(c.id).catch(() => [])).filter((f) => IMAGE_RE.test(f.name));
    const draftForm = await root.CVLazy.reports().then((r) => r.fields.load(c)).catch(() => null); // v1.153: loads on first use
    const isSee = (x) => root.CVReportFields && RFsee(x);
    // v1.172: the arrest details against the rest of the case (suspects, Timeline, charges, evidence
    // list), shown above the arrestees and checked again as they are edited.
    const issuesBox = h('div', { class: 'card warn-card arrest-issues', role: 'note', hidden: true });
    const [tlNow, rfNow] = await Promise.all([Vault.getTimeline(c.id).catch(() => ({ events: [] })), Vault.readCaseJSON(c.id, 'report-fields.json').catch(() => null)]);
    const drawIssues = () => {
      if (!root.CVHealth) return;
      const items = root.CVHealth.arrestIssues({ arrest, caseObj: ui.state.caseObj && ui.state.caseObj.id === c.id ? ui.state.caseObj : c, timeline: tlNow || { events: [] }, evidence: (rfNow && rfNow.evidence) || [], today: Vault.localDay() });
      issuesBox.hidden = !items.length;
      issuesBox.replaceChildren(h('strong', {}, `Doesn't match the rest of the case (${items.length})`),
        h('ul', { class: 'small' }, ...items.map((x) => h('li', {}, h('span', { class: `pill sev sev-${x.severity.toLowerCase()}` }, x.severity), ' ', x.text))));
    };
    let issuesTimer = null;
    panel.addEventListener('change', () => { clearTimeout(issuesTimer); issuesTimer = setTimeout(drawIssues, 500); });
    const reportCharges = ((draftForm && draftForm.charges) || []).filter((x) => (x.statute || x.description) && !isSee(x));
    // v1.114: the reports' victims (Draft and sent), offered on each charge by the arrestee's RD number.
    const forms = [];
    if (draftForm) forms.push({ rdNumber: draftForm.rdNumber || c.number || '', victimsList: draftForm.victimsList || [], title: 'Write Report tab' });
    if (!archived) {
      for (const d of (await Vault.listDrafts(c.id).catch(() => [])).filter((x) => x.fromFields)) {
        const f = await Vault.readCaseJSON(c.id, `report-fields-${d.slug}.json`).catch(() => null);
        if (f) forms.push({ rdNumber: f.rdNumber || '', victimsList: f.victimsList || [], title: d.title });
      }
    }
    // v1.113: the people to pick the arrestee from: Details suspects and the Draft's offenders.
    const choices = K().arresteeChoices(c.suspects, (draftForm && draftForm.offendersList) || []);
    // v1.119: the arrestees already entered on the Mission's other case numbers, to copy over.
    const elsewhere = [];
    if (!archived && c.operationId) {
      for (const o of (Vault.data.cases || []).filter((x) => x.id !== c.id && x.operationId === c.operationId)) {
        const other = await Vault.readCaseJSON(o.id, 'arrest.json').catch(() => null);
        for (const a of (other && other.arrestees) || []) if (K().arresteeName(a)) elsewhere.push({ a, number: o.number || '', rd: a.rdNumber || o.number || '' });
      }
    }
    if (token !== ui.state.renderToken) return;
    // v1.113: an arrestee with no charges typed yet gets the Write Report tab's charges by itself.
    let autoCharged = false;
    // Once only: charges you removed on purpose don't come back.
    if (!archived && reportCharges.length) for (const a of arrest.arrestees) if (!a.chargesAuto && K().chargesBlank(a)) {
      a.charges = reportCharges.map((x) => K().withClass(K().emptyCharge(), x.statute || '', x.description || ''));
      a.chargesAuto = true;
      autoCharged = true;
    }

    const status = h('span', { class: 'note-save-status small muted', role: 'status', 'aria-live': 'polite' }, '✓ Saved on the SSD');
    const key = `arrest:${c.id}`;
    const writeNow = async () => {
      const snapshot = structuredClone(arrest);
      await Vault.writeCaseJSON(c.id, 'arrest.json', snapshot);
      // The arrestees' names are known terms: flagged when mail is checked (js/secure/pii.js).
      const people = K().peopleOf(snapshot);
      if (!c.arrest || c.arrestRemoved || JSON.stringify(people) !== JSON.stringify(c.people || [])) {
        c.arrest = true;
        delete c.arrestRemoved;
        c.people = people;
        await Vault.saveCase(structuredClone(c));
      }
      status.className = 'note-save-status small ok-text';
      status.textContent = `✓ Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    };
    const changed = () => {
      // v1.135: written only when it changes (not on every keystroke).
      if (status.textContent !== 'Not saved yet…') { status.className = 'note-save-status small warn-text'; status.textContent = 'Not saved yet…'; }
      Save.schedule(key, writeNow, 700);
    };

    const input = (obj, f, onChange) => {
      let el;
      if (f.type === 'select' || f.type === 'yn') el = h('select', {}, (f.type === 'yn' ? ['', 'Yes', 'No'] : f.options).map((o) => h('option', { value: o, selected: (obj[f.key] || '') === o }, o || '—')));
      else if (f.type === 'textarea') el = h('textarea', { rows: f.key === 'narrative' ? 14 : 2 });
      else if (f.type === 'time') el = CVTimeField.create({ label: f.label });
      else el = h('input', { type: f.type || 'text', autocomplete: 'off', 'data-format': f.format || null, maxlength: f.format === 'ssn' ? 11 : null });
      if (f.type !== 'select' && f.type !== 'yn') el.value = obj[f.key] || '';
      el.addEventListener(f.type === 'select' || f.type === 'yn' ? 'change' : 'input', () => { obj[f.key] = el.value; changed(); if (onChange) onChange(); });
      // v1.113: a victim can be the State of Illinois (then only the officer's name is asked).
      if (f.victimPick && root.CVCombo) return CVCombo.attach(el, { items: () => [{ value: K().STATE_VICTIM, label: K().STATE_VICTIM, hint: 'Officer name only' }], onPick: () => { if (onChange) onChange(); } });
      // v1.114: a property's description: pick one of the four or write your own.
      if (f.propertyPick && root.CVCombo) return CVCombo.attach(el, { label: 'Show the descriptions', items: () => K().PROPERTY_KINDS.map((k) => ({ value: k, label: k })) });
      // v1.92: CB # and IR # can be DNA (does not apply), as on the Write Report tab.
      if ((f.key === 'bookingNumber' || f.key === 'irNumber') && root.CVCombo) {
        return CVCombo.attach(el, { items: () => [{ value: 'DNA', label: 'DNA', hint: 'Does Not Apply' }] });
      }
      return el;
    };
    const fieldset = (obj, fields, onChange, cls = '') => h('div', { class: `form-grid arrest-grid${cls ? ` ${cls}` : ''}` }, fields.map((f) => ui.field(f.label, input(obj, f, onChange), f.type === 'textarea' ? 'span-2' : '')));
    // v1.59: each part starts folded, like every form (open one with its arrow; remembered).
    const section = (title, ...kids) => { const sec = h('section', { class: 'arrest-section' }, h('h3', {}, title), ...kids); return ui.makeFoldable ? ui.makeFoldable(sec, `arrest-${title}`) : sec; };

    // A list of entries (narcotics, warrants, victims and complainants): a box per entry.
    const listEditor = (a, listKey, noneText, addLabel) => {
      const L = K().LISTS[listKey];
      const box = h('div', { class: 'arrest-list' });
      const draw = () => {
        box.replaceChildren(...(a[listKey].length ? a[listKey].map((it, i) => h('div', { class: 'arrest-item' },
          h('div', { class: 'arrest-item-head' }, h('strong', {}, `${L.item} ${i + 1}`), h('div', { class: 'spacer' }),
            archived ? null : h('button', { class: 'btn small ghost danger-text', type: 'button', onclick: () => { a[listKey].splice(i, 1); changed(); draw(); } }, `Remove ${L.item}`)),
          listKey === 'nonOffenders' ? (() => {
            // v1.113: State of Illinois: Role, Name and Officer name only; switches as the name changes.
            const was = K().isStateVictim(it);
            const flip = () => { if (K().isStateVictim(it) !== was) { draw(); const el = box.querySelectorAll('.arrest-item')[i]; const n = el && el.querySelector('input'); if (n) { n.focus(); } } };
            return fieldset(it, K().nonOffenderFields(it), flip);
          })() : fieldset(it, L.fields, null, listKey === 'properties' ? 'arrest-g-property' : listKey === 'phoneCalls' ? 'arrest-g-calls' : ''))) : [h('p', { class: 'muted small' }, noneText)]),
        archived ? null : h('div', { class: 'row' },
          h('button', { class: 'btn small', type: 'button', onclick: () => { a[listKey].push(K().emptyItem(listKey)); changed(); draw(); } }, addLabel),
          listKey === 'nonOffenders' && !a.nonOffenders.some(K().isStateVictim) ? h('button', { class: 'btn small', type: 'button', title: 'The State of Illinois as the victim, with the officer\'s name', onclick: () => { a.nonOffenders.push({ ...K().emptyItem('nonOffenders'), role: 'Victim', name: K().STATE_VICTIM }); changed(); draw(); } }, '+ Add State of Illinois as Victim') : null));
      };
      draw();
      return box;
    };

    // The arrestee's photo: a picture from the case files, shown on the report beside the Offender.
    const photoPicker = (a) => {
      const img = h('img', { class: 'arrest-photo-img', alt: 'Arrestee photo', hidden: true });
      let url = '';
      const show = async () => {
        if (url) { URL.revokeObjectURL(url); url = ''; }
        img.hidden = true;
        if (!a.photo) return;
        try { url = URL.createObjectURL(await Vault.readFile(c.id, a.photo)); img.src = url; img.hidden = false; } catch { /* moved or deleted */ }
      };
      const sel = h('select', { 'aria-label': 'Photo' }, h('option', { value: '' }, '— No photo —'),
        ...images.map((f) => h('option', { value: f.name, selected: f.name === a.photo }, f.name.split('/').pop())));
      if (a.photo && !images.some((f) => f.name === a.photo)) sel.append(h('option', { value: a.photo, selected: true }, a.photo.split('/').pop()));
      sel.addEventListener('change', () => { a.photo = sel.value; changed(); show(); });
      const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
      file.addEventListener('change', async () => {
        const f = file.files[0];
        file.value = '';
        if (!f) return;
        try {
          const path = await Save.track(`file:${c.id}`, () => Vault.addFile(c.id, f, { folder: 'Subject Information', description: `${K().arresteeName(a) || 'Arrestee'} photo` }));
          a.photo = path;
          sel.append(h('option', { value: path, selected: true }, path.split('/').pop()));
          sel.value = path;
          changed(); show();
        } catch { /* reported by Save */ }
      });
      show();
      return h('div', { class: 'arrest-photo' }, img,
        h('div', { class: 'arrest-photo-pick' }, ui.field('Photo', sel),
          archived ? null : h('button', { class: 'btn small', type: 'button', title: 'Adds a picture to the case files (Subject Information) and uses it here', onclick: () => file.click() }, 'Add Photo'), file));
    };

    // v1.113: a tick box for a part that doesn't apply: the boxes go and the report says so.
    const noneBox = (a, flag, label, body) => {
      const cb = h('input', { type: 'checkbox', checked: !!a[flag], disabled: archived || null });
      const wrap = h('div', { class: 'arrest-none-body', hidden: !!a[flag] }, body);
      cb.addEventListener('change', () => { a[flag] = cb.checked; wrap.hidden = cb.checked; changed(); });
      return [h('label', { class: 'check-row arrest-none' }, cb, h('span', {}, label)), wrap];
    };
    // v1.113: pick the arrestee from the suspects and offenders already written up.
    const personPick = (a, redraw) => {
      if (archived || !choices.length) return null;
      const sel = h('select', { class: 'arrest-pick', 'aria-label': 'Pick the arrestee from the suspects' },
        h('option', { value: '' }, 'Pick from Suspects…'), ...choices.map((p, i) => h('option', { value: String(i) }, `${p.name} (${p.from})`)));
      sel.addEventListener('change', () => {
        const p = choices[Number(sel.value)];
        if (!p) return;
        Object.assign(a, K().personToArrestee(p));
        changed(); redraw();
        toast(`${p.name}: name and description filled in from the ${p.from}. Check them before printing.`, 'success', 5000);
      });
      return h('div', { class: 'arrest-pick-row' }, ui.field('Arrestee', sel, '', 'Fills the name, date of birth and description from a suspect on the Details tab or an offender on the Write Report tab'));
    };
    const list = h('div', { class: 'arrestees' });
    const draw = () => {
      list.replaceChildren(...arrest.arrestees.map((a, i) => {
        // v1.114: a charge on two lines (Offense and Charge; Class, Type, Counts and Victim), so nothing is cut off.
        const cell = (f, el) => h('div', { class: `charge-${f.key}` }, ui.field(f.label, el));
        const charges = h('tbody', {}, a.charges.map((ch, j) => h('tr', {}, h('td', { class: 'charge-card' },
          h('div', { class: 'arrest-item-head' }, h('strong', {}, `Charge ${j + 1}`), h('div', { class: 'spacer' }),
            archived ? null : h('button', { class: 'btn small ghost danger-text', type: 'button', title: 'Remove this charge', onclick: () => { a.charges.splice(j, 1); if (!a.charges.length) a.charges.push(K().emptyCharge()); changed(); draw(); } }, 'Remove Charge')),
          h('div', { class: 'charge-grid' }, K().CHARGE_FIELDS.map((f) => {
            const el = input(ch, f);
            if (!root.CVCombo || !['statute', 'description', 'degree', 'victim'].includes(f.key)) return cell(f, el);
            let box;
            // v1.114: Class: pick from the list (or type); the Type follows it.
            if (f.key === 'degree') {
              box = CVCombo.attach(el, { label: 'Show the classes', items: () => K().CHARGE_CLASSES.map((k) => ({ value: k, label: k })), onPick: (x) => {
                const t = K().typeOfClass(x.value);
                if (t) ch.level = t;
                changed(); draw();
              } });
            } else if (f.key === 'victim') {
              // v1.114: the victims on the reports with this arrestee's RD number.
              box = CVCombo.attach(el, { label: 'Show the victims', items: () => K().victimChoices(forms, a.rdNumber, a.nonOffenders).map((v) => ({ value: v.name, label: v.name, hint: v.hint })) });
            } else {
              box = CVCombo.attach(el, { label: 'Show the charges', items: () => chargeItems(reportCharges).map((x) => ({ ...x, value: f.key === 'statute' ? x.statute : x.desc })), onPick: (x) => {
                // v1.114: the class and type come with the charge.
                Object.assign(ch, K().withClass(ch, x.statute, x.desc));
                changed(); draw();
              } });
            }
            return cell(f, box);
          }))))));
        const name = K().arresteeName(a) || `Arrestee ${i + 1}`;
        const ageOut = h('output', { class: 'arrest-age' });
        // v1.113: until the arrest date is in, the age today.
        const showAge = () => { const n = K().ageOn(a.dob, a.date || Vault.localDay()); ageOut.textContent = n ? `${n} years` : '—'; };
        showAge();
        const offender = fieldset(a, K().ARRESTEE_FIELDS, showAge, 'arrest-g-offender');
        offender.insertBefore(ui.field('Age', ageOut), offender.children[6] || null);
        return h('section', { class: 'card arrestee cv-boxed' },
          h('div', { class: 'row' }, h('h2', {}, name), h('div', { class: 'spacer' }),
            archived ? null : h('button', { class: 'btn small ghost danger-text', type: 'button', onclick: async () => {
              if (!(await ui.confirmDialog({ title: `Remove ${name}?`, message: 'This arrestee and their charges are removed from the arrest details.', confirmText: 'Remove', danger: true }))) return;
              arrest.arrestees.splice(i, 1);
              if (!arrest.arrestees.length) arrest.arrestees.push(K().emptyArrestee());
              changed(); draw();
            } }, 'Remove Arrestee')),
          section('Report Numbers', (() => { const g = fieldset(a, K().NUMBER_FIELDS); g.classList.add('arrest-numbers'); return g; })()),
          section('Offender', personPick(a, draw), h('div', { class: 'arrest-offender' }, offender, photoPicker(a))),
          section('Incident', fieldset(a, K().INCIDENT_FIELDS, showAge, 'arrest-g-incident')),
          section('Charges',
            h('table', { class: 'charges-table' }, charges),
            archived ? null : h('div', { class: 'row' },
              h('button', { class: 'btn small', type: 'button', onclick: () => { a.charges.push(K().emptyCharge()); changed(); draw(); } }, '+ Add Charge'),
              reportCharges.length ? h('button', { class: 'btn small', type: 'button', title: 'Adds the charges from the Supplementary Report (Write Report tab) that aren\'t here yet', onclick: () => {
                const have = new Set(a.charges.map((x) => `${(x.statute || '').trim()}|${(x.description || '').trim()}`));
                a.charges = a.charges.filter((x) => (x.statute || '').trim() || (x.description || '').trim());
                for (const x of reportCharges) if (!have.has(`${(x.statute || '').trim()}|${(x.description || '').trim()}`)) a.charges.push(K().withClass(K().emptyCharge(), x.statute || '', x.description || ''));
                if (!a.charges.length) a.charges.push(K().emptyCharge());
                changed(); draw();
              } }, 'Use Report Charges') : null)),
          section('Recovered Narcotics', ...noneBox(a, 'noNarcotics', 'No narcotics recovered', listEditor(a, 'narcotics', 'No narcotics recovered.', '+ Add Narcotic'))),
          section('Warrant', ...noneBox(a, 'noWarrant', 'No warrant identified', listEditor(a, 'warrants', 'No warrant identified.', '+ Add Warrant'))),
          section('Victim and Complainant', listEditor(a, 'nonOffenders', 'None added.', '+ Add Victim or Complainant')),
          section('Arrestee Vehicle', ...noneBox(a, 'noVehicle', 'No arrestee vehicle information', fieldset(a, K().VEHICLE_FIELDS, null, 'arrest-g-4'))),
          // v1.114: one row per property: inventory number and description. Text from before stays below.
          section('Properties', listEditor(a, 'properties', 'No properties recorded.', '+ Add Property'),
            a.property ? fieldset(a, [{ key: 'property', label: 'Other confiscated properties', type: 'textarea' }]) : null),
          // v1.133: who the arrestee called, or that they refused a phone call.
          section('Phone Calls', ...noneBox(a, 'refusedCall', 'Refused phone call', listEditor(a, 'phoneCalls', 'No phone calls recorded.', '+ Add Phone Call'))),
          section('Incident Narrative', fieldset(a, [{ key: 'narrative', label: 'The facts for probable cause to arrest and to support the charges', type: 'textarea' }])),
          section('Court and Bond', fieldset(a, [...K().COURT_FIELDS, ...K().BOND_FIELDS], null, 'arrest-g-court')),
          section('Reporting Personnel', fieldset(a, K().PERSONNEL_FIELDS, null, 'arrest-g-personnel')));
      }));
    };
    draw();

    // ---- the Arrest Report as a PDF: look at it and print, keep it, or send it to sign.
    async function photoJpeg(path) {
      const bmp = await createImageBitmap(await Vault.readFile(c.id, path));
      const k = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
      const cv = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
      const g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(bmp, 0, 0, cv.width, cv.height);
      const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.88));
      return { jpeg: new Uint8Array(await blob.arrayBuffer()), w: cv.width, h: cv.height };
    }
    const pdfBytes = async () => {
      const p = Vault.data.settings.affiant || {};
      const photos = {};
      for (const [i, a] of arrest.arrestees.entries()) { if (a.photo) { try { photos[i] = await photoJpeg(a.photo); } catch { /* left out */ } } }
      return CVArrestPdf.build(arrest, { letterhead: root.CVLetterhead ? await root.CVLetterhead.forPdf() : null, agency: p.agency || '', caseNumber: c.number || '', caseLabel: [c.title, c.number ? `Case ${c.number}` : ''].filter(Boolean).join(' · '), printed: '', photos });
    };
    const pdfName = () => `Arrest Report ${CVArrestPdf.reportName(arrest.arrestees[0] || {})}.pdf`.replace(/[\\/:*?"<>|]/g, '');
    async function showPdf(bytes) {
      const viewer = CVPdfViewer.create(bytes, { h, icon: ui.icon, title: 'Arrest Report', fileName: pdfName() });
      await ui.openDialog((close) => h('div', { class: 'pdf-view' },
        h('h2', {}, 'Arrest Report'),
        viewer,
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Done'))));
      viewer.destroy();
    }
    let lastPdf = null;
    async function savePdf() {
      await Save.flushAll();
      const sig = JSON.stringify(arrest);
      if (lastPdf && lastPdf.sig === sig) return lastPdf.path;
      const bytes = await pdfBytes();
      const file = new File([bytes], pdfName(), { type: 'application/pdf' });
      const path = await Save.track(`arrest-pdf:${c.id}`, () => Vault.addFile(c.id, file, { folder: 'Arrest Report', description: pdfName().replace(/\.pdf$/, ''), replace: true }));
      lastPdf = { sig, path, bytes };
      return path;
    }
    // v1.135: before printing or saving: what is still empty, with Go Back or Continue Anyway.
    const checkFirst = async () => {
      const gaps = K().arrestGaps(arrest);
      if (!gaps.length) return true;
      return ui.confirmDialog({ title: 'Some parts of the Arrest Report are empty', confirmText: 'Continue Anyway', cancelText: 'Go Back',
        message: h('div', { class: 'arrest-gaps' }, h('p', {}, 'Still to fill in (or tick as not applying):'),
          ...gaps.map((g) => h('div', {}, h('strong', {}, g.who), h('ul', {}, g.missing.map((m) => h('li', {}, m)))))) });
    };
    const printBtn = h('button', { 'data-ro-ok': 'true', class: 'btn small', type: 'button', title: 'Opens the Arrest Report. Print it, or save it as a PDF.', onclick: async () => {
      if (!archived && !(await checkFirst())) return;
      await Save.flushAll();
      await showPdf(await pdfBytes());
    } }, 'Print / PDF');
    const pdfCaseBtn = h('button', { class: 'btn small', type: 'button', title: 'Saves the PDF in this case\'s Arrest Report folder.', onclick: async () => {
      if (!(await checkFirst())) return;
      let path;
      try { path = await savePdf(); } catch { return; }
      toast(`Saved to the case files: ${path.split('/').pop()}`, 'success', 5000);
      await showPdf(lastPdf.bytes);
    } }, 'Save PDF to Case');
    const signBtn = h('button', { class: 'btn small', type: 'button', title: 'Saves the PDF to the case and starts an email with it attached, for signing.', onclick: async () => {
      if (!(await checkFirst())) return;
      let path;
      try { path = await savePdf(); } catch { return; }
      if (root.CVMailUI) {
        CVMailUI.prepare(c, {
          subject: `${c.number || c.title || ''} Arrest Report for signature`.trim(),
          body: 'Please review and sign the attached Arrest Report. The signature boxes can be signed electronically (Adobe Acrobat or Reader: Fill & Sign) or printed and signed in blue ink.',
          attach: [path],
        });
      }
      ui.go(c.id, 'mail');
      toast('The PDF is attached. Add the recipients, then check and create the Outlook draft.', 'success', 8000);
    } }, 'Email for E-Sign');

    const saveBtn = h('button', { class: 'btn small primary', type: 'button', onclick: async () => {
      try { await Save.run(key, writeNow); } catch { /* shown by the header indicator */ }
    } }, 'Save');
    const reportBtn = h('button', { class: 'btn small', type: 'button', onclick: () => startArrestReport(c) }, 'Start an arrest report draft');

    // v1.119: copy an arrestee from another case number of the Mission (their own details; this
    // case's RD number). A blank first arrestee is filled in instead of adding another.
    const copyFromMission = () => ui.openDialog((done) => h('div', { class: 'copy-arrestee' },
      h('h2', { icon: 'people' }, 'Copy From Another Case'),
      h('p', { class: 'muted small' }, 'Arrestees on the other case numbers of this Mission. Their name, residence, date of birth and description are copied; the charges, property and narrative stay with that case.'),
      h('div', { class: 'copy-list' }, ...elsewhere.map(({ a, number, rd }) => h('div', { class: 'copy-row' },
        h('strong', {}, K().arresteeName(a)),
        h('span', { class: 'muted small' }, [a.dob ? `DOB ${a.dob}` : '', `RD ${rd}`, number && number !== rd ? `case ${number}` : ''].filter(Boolean).join(' · ')),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn small primary', type: 'button', onclick: () => {
          const copy = K().copyArrestee(a, c.number || '');
          const blank = arrest.arrestees.findIndex((x) => !K().arresteeName(x));
          if (blank >= 0 && arrest.arrestees.length === 1) arrest.arrestees[blank] = { ...arrest.arrestees[blank], ...Object.fromEntries(K().ARRESTEE_FIELDS.map((f) => [f.key, copy[f.key]])), rdNumber: copy.rdNumber || arrest.arrestees[blank].rdNumber };
          else arrest.arrestees.push(copy);
          changed(); draw(); done();
          toast(`${K().arresteeName(a)} copied. Check the charges for this case.`, 'success', 5000);
        } }, 'Copy')))),
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => done() }, 'Cancel'))));

    // v1.113: Show All / Hide All, as on the Write Report tab.
    const foldAll = (want) => panel.querySelectorAll(`.arrest-section.foldable${want ? ':not(.folded)' : '.folded'} > .fold-head .fold-btn`).forEach((b) => b.click());
    const showAll = h('button', { 'data-ro-ok': 'true', class: 'btn small ghost', type: 'button', icon: 'chevron-down', title: 'Open every part on screen', onclick: () => foldAll(false) }, 'Show All');
    const hideAll = h('button', { 'data-ro-ok': 'true', class: 'btn small ghost', type: 'button', icon: 'chevron-right', title: 'Fold every part away on screen (they stay on the report)', onclick: () => foldAll(true) }, 'Hide All');
    if (autoCharged) { changed(); toast('Charges filled in from the Write Report tab. Change or remove them as needed.', 'info', 5000); }
    // v1.143: the parts that aren't there are left out (replaceChildren would show null as "null").
    panel.replaceChildren(...[
      h('div', { class: 'toolbar arrest-toolbar' },
        h('p', { class: 'muted small explain' }, 'The Arrest Report for this case, one per arrestee. Print it, save it as a PDF or email it to sign. These details also fill {{arrest.…}} in templates. Saved in this case\'s folder on the SSD (arrest.json).'),
        printBtn, archived ? null : pdfCaseBtn, archived ? null : signBtn,
        h('div', { class: 'spacer' }), showAll, hideAll, status, archived ? null : saveBtn,
        archived ? null : h('button', { class: 'btn small danger-ghost', type: 'button', title: 'Deletes all the arrest details of this case and takes the tab off', onclick: () => deleteArrest(c) }, 'Delete Arrest')),
      archived || !root.CVLetterhead ? null : root.CVLetterhead.summary(), // v1.85; v1.118: one line, edited in a popup or Vault → My Profile
      // v1.115: closed by arrest with the arrest report on another RD.
      c.closure && c.closure.arrestRef ? h('div', { class: 'card arrest-ref-card' },
        h('strong', {}, `The arrest report for this case is on RD ${c.closure.arrestRef.number}.`),
        h('span', { class: 'muted small' }, ' This case was closed by arrest with it.'), ' ',
        (Vault.data.cases || []).some((x) => x.id === c.closure.arrestRef.id) ? h('button', { 'data-ro-ok': 'true', class: 'btn small', type: 'button', icon: 'person-vcard', onclick: () => ui.go(c.closure.arrestRef.id, 'arrest') }, `Open RD ${c.closure.arrestRef.number}`) : null) : null,
      issuesBox,
      list,
      archived ? null : h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => { const a = K().emptyArrestee(); if (c.number) a.rdNumber = c.number; arrest.arrestees.push(a); changed(); draw(); } }, '+ Add another arrestee'),
        elsewhere.length ? h('button', { class: 'btn', type: 'button', icon: 'people', title: 'The same person was arrested on another case number of this Mission: copy their details here', onclick: () => copyFromMission() }, 'Copy From Another Case') : null,
        h('div', { class: 'spacer' }), reportBtn)].filter(Boolean));
    drawIssues();
  }

  // A new draft from the arrest report template, filled from these details.
  async function startArrestReport(c) {
    const { Save, toast } = ui;
    await Save.flushAll();
    try {
      // Your own arrest report template (Vault → Templates), else the built-in outline (v1.28).
      const found = (await Vault.listTemplates()).find((t) => /arrest/i.test(`${t.file} ${t.title}`));
      const tpl = found || { file: '', title: 'Arrest Report outline' };
      const caseObj = await Vault.getCase(c.id);
      const text = found ? await Vault.readTemplate(found.file) : CVDraft.ARREST_OUTLINE;
      const body = CVDraft.fillTemplate(text, CVDraft.templateContext(caseObj, new Date(), Vault.data.settings.affiant, await templateExtra(caseObj)));
      const title = `Arrest report${caseObj.people && caseObj.people[0] ? ` - ${caseObj.people[0]}` : ''}`;
      const slug = await Vault.newDraftSlug(c.id, title);
      await Save.track(`draft:${c.id}:${slug}`, () => Vault.saveDraft(c.id, slug, { title, type: 'other', ai: false, template: tpl.file, created: new Date().toISOString() }, body));
      toast(`Draft made from "${tpl.title}". Check every [CONFIRM: …].`, 'success', 6000);
      ui.go(c.id, 'reports', slug);
    } catch { /* reported by Save */ }
  }

  /* ---------------- Close case ---------------- */

  // v1.39: the Write Report tab's Update Information boxes that closing fills in, by disposition.
  const CLOSE_CODES = {
    arrest: { status: '3 - Cleared Closed', cleared: '1 - Arrest' },
    exceptional: { status: '4 - Cleared Open', cleared: '5 - Other' },
    unfounded: { status: '2 - Unfounded', cleared: '' },
    inactive: { status: '1 - Suspended', cleared: '' },
    referred: { status: '4 - Cleared Open', cleared: '3 - Referred for Prosecution' },
    continued: { status: '', cleared: '' },
    other: { status: '', cleared: '' },
  };

  async function closeCaseDialog(c, { operation = null } = {}) {
    const { h, openDialog, Save, toast } = ui;
    await Save.flushAll();
    // v1.39: every open case number of the operation is listed; tick the ones to close (this one,
    // or all of them from Close Operation).
    // v1.46: the Operation's cases are the ones linked to it (operationId).
    const members = (operation || (Vault.data.cases || []).filter((x) => c.operationId && x.operationId === c.operationId))
      .filter((x) => x.id === c.id || (x.status !== 'Closed' && !Vault.isArchived(x.id)));
    if (!members.some((x) => x.id === c.id)) members.unshift(c);
    // Loose ends, as a reminder. v1.180: from Close Mission, every case number's, grouped.
    const perRow = !!operation && members.length > 1;
    const looseOf = async (x) => {
      const [timeline, checks, drafts] = await Promise.all([
        Vault.getTimeline(x.id).catch(() => ({ events: [] })),
        Vault.listChecks(x.id).catch(() => []),
        Vault.listDrafts(x.id).then((list) => Promise.all(list.map(async (d) => {
          const full = await Vault.readDraft(x.id, d.slug).catch(() => null);
          return { title: d.title, confirm: full ? CVDraft.extractPlaceholders(full.body).length : 0 };
        }))).catch(() => []),
      ]);
      const out = K().closeChecklist({ timeline, checks, drafts });
      // v1.172: ready to close? Custody gaps, the arrest against the case, a check out of date, and
      // narcotics with no lab result or exhibits with no final disposition (Case Health).
      try {
        const g = await root.CVHealthUI.gather(x);
        const more = [...root.CVHealth.caseHealth(g).filter((y) => ['Custody', 'Arrest', 'Evidence'].includes(y.area) || /out of date/.test(y.text)), ...root.CVHealth.closeReadiness(g.evidence)];
        out.push(...more.map((y) => ({ kind: 'health', text: y.text, severity: y.severity })));
      } catch (err) { if (FS.isDisconnectError(err)) throw err; }
      return out;
    };
    const looseGroups = [{ number: c.number || 'No case number', items: await looseOf(c) }];
    if (perRow) {
      for (const x of members.filter((y) => y.id !== c.id)) {
        const full = await Vault.getCase(x.id).catch(() => null);
        if (full) looseGroups.push({ number: x.number || 'No case number', items: await looseOf(full) });
      }
    }
    const loose = looseGroups[0].items;
    // v1.84: closing by arrest needs the arrest report: an arrestee's name and at least one charge.
    // v1.115: of every case number closed. One without its own can point to the RD that has it.
    const reports = new Map(); // case id -> { c, names, ready, day }
    const readReport = async (x) => {
      if (reports.has(x.id)) return;
      const a = await readArrest(x).catch(() => null);
      const day = ((a && a.arrestees) || []).map((y) => y.date || '').sort().pop() || '';
      reports.set(x.id, { c: x, a, names: K().peopleOf(a), ready: K().arrestReady(a), day });
    };
    for (const x of members) await readReport(x);
    const named = reports.get(c.id).names;
    // v1.111: other open cases on the same suspect (Subject Name or an identified suspect), from
    // anywhere in the vault, offered to close with this one (not ticked to start).
    let related = [];
    if (!operation) {
      const inList = new Set(members.map((x) => x.id));
      const full = [];
      for (const x of (Vault.data.cases || []).filter((y) => !inList.has(y.id) && y.status !== 'Closed' && !Vault.isArchived(y.id))) {
        try { full.push(await Vault.getCase(x.id)); } catch { /* moved or missing */ }
      }
      related = K().sameSuspectCases(c, full);
    }
    // The RDs that can hold the arrest report: this mission's cases (closed ones too), and the others on the same suspect.
    for (const x of related.map((r) => r.c)) await readReport(x);
    if (c.operationId) for (const x of (Vault.data.cases || []).filter((y) => y.operationId === c.operationId && !Vault.isArchived(y.id))) await readReport(x);
    const ready = new Set([...reports].filter(([, r]) => r.ready).map(([id]) => id));
    // v1.179: what became of each suspect (the Mission's, which every case number shares); one
    // still at large is a loose end.
    const sx = K().suspectOutcomes(c.suspects, [...reports.values()].filter((r) => r.c.id === c.id || (c.operationId && r.c.operationId === c.operationId)).map((r) => r.a));
    if (perRow) { const atLarge = K().closeChecklist({ suspects: sx }); if (atLarge.length) looseGroups.unshift({ number: 'Suspects', items: atLarge }); } else loose.push(...K().closeChecklist({ suspects: sx }));
    // Newest arrest first; this case first when it has its own.
    const refChoices = [...reports.values()].filter((r) => r.ready).sort((a, b) => (b.c.id === c.id) - (a.c.id === c.id) || b.day.localeCompare(a.day) || String(b.c.number || '').localeCompare(String(a.c.number || '')));
    const RF = root.CVReportFields;
    const optsOf = (key) => ((RF && RF.FIELDS.find(([k]) => k === key)) || [, , , ['']])[3];

    const result = await openDialog((close) => {
      const radios = K().DISPOSITIONS.map((d) => {
        const r = h('input', { type: 'radio', name: 'disposition', value: d.key, checked: d.key === ((c.closure && c.closure.disposition) || '') });
        return { d, r, row: h('label', { class: 'radio-row' }, r, h('span', {}, h('strong', {}, d.label), h('span', { class: 'muted small block' }, d.hint))) };
      });
      const reason = h('select', { 'aria-label': 'Reason' }, h('option', { value: '' }, 'Choose the reason…'), K().disposition('exceptional').reasons.map((x) => h('option', { value: x }, x)));
      const reasonRow = h('label', { class: 'field', hidden: true }, h('span', {}, 'Exceptional clearance reason'), reason);
      const arrestNote = h('p', { class: 'small', hidden: true });
      // v1.115: Arrest report on RD: for the case numbers closed without arrest details of their own.
      const refSel = h('select', { 'aria-label': 'Arrest report on RD' }, h('option', { value: '' }, 'Choose the RD…'),
        refChoices.map((r) => h('option', { value: r.c.id }, `${r.c.number || r.c.title || 'No case number'}: ${r.names.join(', ')}`)));
      if (refChoices.length) refSel.value = refChoices[0].c.id;
      const refRow = h('div', { class: 'close-arrest-ref', hidden: true }, ui.field('Arrest report on RD', refSel, '', 'The case number whose Arrest Details hold the arrest report. The case numbers closed without arrest details of their own point to it.'));
      const date = h('input', { type: 'date', value: (c.dates && c.dates.closed) || today(), required: true });
      const by = h('input', { type: 'text', maxlength: 120, value: (c.closure && c.closure.closedBy) || ((Vault.data.settings.affiant || {}).name || ''), placeholder: 'Your name and star number', 'aria-label': 'Closed by' });
      const note = h('textarea', { rows: 3, placeholder: 'How it ended (optional)' });
      // Which case numbers.
      const picks = members.map((x) => {
        const cb = h('input', { type: 'checkbox', checked: x.id === c.id || !!operation, 'aria-label': `Close ${x.number || 'no number'}` });
        const label = h('label', { class: 'check-row close-pick' }, cb, h('span', {}, h('strong', {}, x.number || 'No case number'), x.subject ? h('span', { class: 'muted small' }, ` ${x.subject}`) : '', x.id === c.id && !perRow ? h('span', { class: 'muted small' }, ' (this one)') : ''));
        if (!perRow) return { x, cb, row: label };
        // v1.180: from Close Mission, each case number with its own disposition, suggested from its
        // arrest report or what became of its suspect.
        const sug = K().suggestDisposition(x, sx, ready.has(x.id));
        const num = x.number || 'no number';
        const dsel = h('select', { class: 'close-disp', 'aria-label': `Disposition for ${num}` }, h('option', { value: '' }, 'Choose…'),
          K().DISPOSITIONS.map((d) => h('option', { value: d.key, selected: d.key === sug.disposition }, d.label)));
        const rsel = h('select', { class: 'close-reason', 'aria-label': `Reason for ${num}`, hidden: sug.disposition !== 'exceptional' }, h('option', { value: '' }, 'Choose the reason…'),
          K().disposition('exceptional').reasons.map((r) => h('option', { value: r, selected: r === sug.reason }, r)));
        dsel.addEventListener('change', () => { rsel.hidden = dsel.value !== 'exceptional'; });
        const why = h('span', { class: 'muted small close-sug' }, sug.disposition ? (ready.has(x.id) ? 'From its arrest report' : 'From its suspect\'s outcome') : 'Choose how it ended');
        return { x, cb, dsel, rsel, row: h('div', { class: 'close-pick-row' }, label, dsel, rsel, why) };
      });
      const relPicks = related.map(({ c: x, names }) => {
        const cb = h('input', { type: 'checkbox', 'aria-label': `Also close ${x.number || 'no number'}` });
        return { x, names, cb, row: h('label', { class: 'check-row close-pick' }, cb, h('span', {}, h('strong', {}, x.number || 'No case number'), x.subject ? h('span', { class: 'muted small' }, ` ${x.subject}`) : '', h('span', { class: 'muted small block' }, `Same suspect: ${names.join(', ')}`))) };
      });
      // The Write Report tab's boxes.
      const upd = h('input', { type: 'checkbox', checked: !!RF });
      const status = h('select', { 'aria-label': 'Status' }, optsOf('status').map((o) => h('option', { value: o }, o || '—')));
      const cleared = h('select', { 'aria-label': 'How Cleared' }, optsOf('cleared').map((o) => h('option', { value: o }, o || '—')));
      const CHECKS = ['victimVerified', 'offenderVerified', 'propertyVerified', 'circumstancesVerified', 'victimUpdated', 'offenderUpdated', 'propertyUpdated', 'circumstancesUpdated'];
      const checkBoxes = CHECKS.map((k) => {
        const f = RF && RF.FIELDS.find(([kk]) => kk === k);
        const cb = h('input', { type: 'checkbox', checked: /Verified$/.test(k) });
        return { k, cb, row: h('label', { class: 'check-row small' }, cb, h('span', {}, f ? f[1] : k)) };
      });
      const draftBox = h('div', { class: 'close-draft' },
        h('div', { class: 'form-grid' }, ui.field('Status', status), ui.field('How Cleared', cleared)),
        h('div', { class: 'close-checks' }, checkBoxes.map((x) => x.row)));
      upd.addEventListener('change', () => { draftBox.hidden = !upd.checked; });
      if (perRow) draftBox.firstChild.hidden = true; // v1.180: each case number gets its own disposition's Status and How Cleared
      const ok = h('button', { class: 'btn primary', type: 'submit', disabled: true }, 'Close Case');
      // v1.180: a case number's disposition: its own (Close Mission) or the one chosen for all.
      const rowOf = (x) => picks.find((p) => p.x.id === x.id);
      const dispOf = (x) => { const p = rowOf(x); if (perRow && p) return p.dsel.value; const sel = radios.find((y) => y.r.checked); return sel ? sel.d.key : ''; };
      const pick = () => {
        const sel = radios.find((x) => x.r.checked);
        reasonRow.hidden = perRow || !(sel && sel.d.key === 'exceptional');
        const ticked = [...picks, ...relPicks].filter((p) => p.cb.checked).map((p) => p.x);
        const arrestTicked = ticked.filter((x) => dispOf(x) === 'arrest');
        const byArrest = arrestTicked.length > 0;
        const cov = K().arrestCoverage(arrestTicked, ready, refSel.value);
        const nums = (list) => list.map((x) => x.number || x.title || 'no number').join(', ');
        const ref = reports.get(refSel.value);
        arrestNote.hidden = !byArrest;
        refRow.hidden = !byArrest || !cov.missing.length || !refChoices.length;
        arrestNote.className = cov.ok ? 'small' : 'small arrest-required';
        const own = arrestTicked.filter((x) => ready.has(x.id));
        arrestNote.replaceChildren(
          !cov.missing.length ? `Arrest details: ${[...new Set(own.flatMap((x) => reports.get(x.id).names))].join(', ')}. You can still change them on the Arrest details tab.`
            : cov.ok ? `${nums(cov.missing)} ${cov.missing.length > 1 ? 'have' : 'has'} no arrest details of ${cov.missing.length > 1 ? 'their' : 'its'} own: closed by arrest with the arrest report on RD ${ref.c.number || ref.c.title} (${ref.names.join(', ')}).`
              : refChoices.length ? `Required before closing by arrest: the arrest report. ${nums(cov.missing)} ${cov.missing.length > 1 ? 'have' : 'has'} no arrest details: choose the RD that has the arrest report below, or fill in the arrestee and a charge on the Arrest details tab.`
                : `Required before closing by arrest: the arrest report. ${named.length ? `Add at least one charge for ${named.join(', ')}` : 'Fill in the arrestee and at least one charge'} on the Arrest details tab, then close the case.`,
          cov.ok || ready.has(c.id) ? '' : h('button', { class: 'btn small-btn', type: 'button', icon: 'person-vcard', onclick: () => close({ fillArrest: true }) }, 'Open Arrest Details'));
        const n = ticked.length;
        ok.textContent = n > 1 ? `Close ${n} Case Numbers` : 'Close Case';
        const missing = perRow ? ticked.some((x) => !dispOf(x) || (dispOf(x) === 'exceptional' && !rowOf(x).rsel.value)) : !sel || (sel.d.key === 'exceptional' && !reason.value);
        ok.disabled = missing || (byArrest && !cov.ok) || !date.value || !n || !by.value.trim();
        ok.title = missing ? (perRow ? 'Choose how each ticked case number ended (and the reason for an exceptional clearance).' : 'Choose the disposition first.') : byArrest && !cov.ok ? 'Fill in the arrest report first, or choose the RD that has it.' : '';
      };
      const codes = () => { const sel = radios.find((x) => x.r.checked); const cc = sel && CLOSE_CODES[sel.d.key]; if (cc) { status.value = cc.status; cleared.value = cc.cleared; } };
      for (const x of radios) x.r.addEventListener('change', () => { codes(); pick(); });
      for (const p of [...picks, ...relPicks]) { p.cb.addEventListener('change', pick); if (p.dsel) { p.dsel.addEventListener('change', pick); p.rsel.addEventListener('change', pick); } }
      reason.addEventListener('change', pick);
      refSel.addEventListener('change', pick);
      date.addEventListener('input', pick);
      by.addEventListener('input', pick);
      codes();
      pick();
      return h('form', { class: 'close-form', onsubmit: (e) => {
        e.preventDefault();
        const sel = radios.find((x) => x.r.checked);
        if (!sel && !perRow) return;
        const ticked = [...picks, ...relPicks].filter((p) => p.cb.checked).map((p) => p.x);
        const arrestTicked = ticked.filter((x) => dispOf(x) === 'arrest');
        const cov = arrestTicked.length ? K().arrestCoverage(arrestTicked, ready, refSel.value) : { refFor: [] };
        const ref = cov.refFor.length ? reports.get(refSel.value).c : null;
        close({
          arrestRef: ref ? { id: ref.id, number: ref.number || ref.title || '', for: cov.refFor } : null,
          disposition: sel ? sel.d.key : '', reason: sel && sel.d.key === 'exceptional' ? reason.value : '', date: date.value,
          per: perRow ? Object.fromEntries(picks.filter((p) => p.cb.checked).map((p) => [p.x.id, { disposition: p.dsel.value, reason: p.dsel.value === 'exceptional' ? p.rsel.value : '' }])) : null, note: note.value.trim(), closedBy: by.value.trim(),
          ids: [...picks, ...relPicks].filter((p) => p.cb.checked).map((p) => p.x.id),
          withSame: Object.fromEntries(relPicks.filter((p) => p.cb.checked).map((p) => [p.x.id, p.names])),
          draft: upd.checked ? { status: status.value, cleared: cleared.value, checks: Object.fromEntries(checkBoxes.map((x) => [x.k, x.cb.checked])) } : null,
        });
      } },
      h('h2', {}, perRow && operation ? `Close Mission ${[c.operation && c.operation.number, c.operation && c.operation.name].filter(Boolean).join(' ')}`.trim() : `Close "${c.title || 'Untitled case'}"${c.number && members.length === 1 ? ` (${c.number})` : ''}`),
      h('p', { class: 'muted small explain' }, 'Close a case when the investigation is finished. Choose how it ended. A closed case stays in the list (filter: Closed) until you archive it, and can be reopened.'),
      perRow
        // v1.180: every case number's loose ends, grouped.
        ? (looseGroups.some((g) => g.items.length) ? h('div', { class: 'card warn-card close-loose-groups' }, h('strong', {}, 'Before you close'),
          h('ul', { class: 'small' }, looseGroups.filter((g) => g.items.length).map((g) => h('li', {}, h('strong', {}, g.number), h('ul', {}, g.items.map((x) => h('li', {}, x.text)))))),
          h('p', { class: 'small muted' }, 'You can still close the Mission; this is a reminder.')) : h('p', { class: 'small ok-text' }, '✓ No open deadlines, check flags, [CONFIRM: …] or evidence left on any case number.'))
        : loose.length ? h('div', { class: 'card warn-card' }, h('strong', {}, 'Before you close'), h('ul', { class: 'small' }, loose.map((x) => h('li', {}, x.text))),
          h('p', { class: 'small muted' }, 'You can still close the case; this is a reminder.')) : h('p', { class: 'small ok-text' }, '✓ No open deadlines, check flags or [CONFIRM: …] left.'),
      sx.length > 1 || (operation && sx.length) ? h('div', { class: 'close-suspects' }, h('h3', { icon: 'people' }, 'Suspects'),
        h('ul', { class: 'small' }, sx.map((r) => h('li', {}, h('strong', {}, r.name), ': ', h('span', { class: `outcome-chip ${r.key || 'unset'}` }, r.label),
          r.auto ? h('span', { class: 'muted' }, ' (on the arrest report)') : '', r.continuedIn ? h('span', { class: 'muted' }, ` in case ${r.continuedIn.number || 'with no number'}`) : ''))),
        h('p', { class: 'muted small' }, 'Set each suspect\'s outcome by their name on the Details tab.')) : '',
      members.length > 1 ? h('div', {}, h('h3', {}, 'Case numbers to close'), h('p', { class: 'muted small' }, perRow
        ? 'Each case number closes with its own disposition, suggested from its arrest report or what became of its suspect. Change any of them; untick one to leave it open. Each can still be reopened on its own.'
        : 'Tick each case number of this mission to close with this disposition. Each can still be reopened on its own.'), h('div', { class: perRow ? 'close-picks close-picks-rows' : 'close-picks' }, picks.map((p) => p.row))) : '',
      relPicks.length ? h('div', { class: 'close-related' }, h('h3', { icon: 'people' }, 'Other open cases on the same suspect'),
        h('p', { class: 'muted small' }, 'Arrested on this case, or done with this person? Tick the other cases to close them too, with the same disposition and date. Each notes that it was closed with this case, and each can be reopened on its own.'),
        h('div', { class: 'close-picks' }, relPicks.map((p) => p.row))) : '',
      perRow ? '' : h('h3', {}, 'Disposition'),
      perRow ? '' : h('div', { class: 'radio-list' }, radios.map((x) => x.row)),
      reasonRow, arrestNote, refRow,
      h('div', { class: 'form-grid' }, ui.field('Closed on', date), ui.field('Closed by', by)),
      RF ? h('div', {}, h('label', { class: 'check-row' }, upd, h('span', {}, h('strong', {}, 'Update the Write Report tab'), h('span', { class: 'muted small' }, ': Status, How Cleared and the Update Information boxes of each case number closed'))), draftBox) : '',
      ui.field('Closing note', note),
      CVKit.cancelRow(h, () => close(null), ok));
    });
    if (!result) return false;
    if (result.fillArrest) {
      if (!c.arrest || c.arrestRemoved) {
        c.arrest = true;
        delete c.arrestRemoved;
        try { await Save.track(`case:${c.id}`, () => Vault.saveCase(structuredClone(c))); } catch { return false; }
      }
      toast('Fill in the arrestee and the charges, then Close Case again.', 'info', 6000);
      ui.go(c.id, 'arrest');
      return false;
    }
    const { ids, draft, withSame = {}, arrestRef = null, per = null, ...closure } = result;
    const before = new Map();
    for (const id of ids) {
      const oc = id === c.id ? c : await Vault.getCase(id).catch(() => null);
      if (oc) before.set(id, { status: oc.status, closed: oc.dates.closed, closure: oc.closure || null, closureHistory: oc.closureHistory, pending: oc.pending, arrest: oc.arrest, arrestRemoved: oc.arrestRemoved });
    }
    let n = 0;
    for (const id of ids) {
      try {
        const oc = id === c.id ? c : await Vault.getCase(id);
        const was = oc.closure;
        oc.status = 'Closed';
        oc.dates.closed = closure.date;
        const dd = per && per[id] ? per[id] : { disposition: closure.disposition, reason: closure.reason }; // v1.180: its own, from Close Mission
        oc.closure = { ...closure, ...dd, at: new Date().toISOString() };
        // v1.111: a case closed with another one on the same suspect says so.
        if (withSame[oc.id]) oc.closure.note = [closure.note, `Closed together with ${c.number || c.title || 'another case'} (same suspect: ${withSame[oc.id].join(', ')}).`].filter(Boolean).join('\n');
        // v1.115: no arrest details of its own: the arrest report is on another RD.
        const refHere = dd.disposition === 'arrest' && arrestRef && arrestRef.for.includes(oc.id);
        if (refHere) {
          oc.closure.arrestRef = { id: arrestRef.id, number: arrestRef.number };
          oc.closure.note = [oc.closure.note, `Arrest report: see RD ${arrestRef.number}.`].filter(Boolean).join('\n');
        }
        if (was && was.at && was.at !== oc.closure.at) oc.closureHistory = [...(oc.closureHistory || []), was];
        oc.pending = null;
        if (dd.disposition === 'arrest' && !refHere) { oc.arrest = true; delete oc.arrestRemoved; }
        Vault.logActivity(oc, `Closed: ${K().disposition(dd.disposition).label}${dd.reason ? ` (${dd.reason})` : ''}${closure.closedBy ? `, by ${closure.closedBy}` : ''}`);
        await Save.track(`case:${oc.id}`, () => Vault.saveCase(structuredClone(oc)));
        // The Write Report tab of each case closed: Status, How Cleared and the boxes ticked (v1.39).
        if (draft && RF) {
          let d = null;
          try { d = await Vault.readCaseJSON(oc.id, 'report-fields.json'); } catch { /* none yet */ }
          { const b = before.get(oc.id); if (b) b.fields = d ? structuredClone(d) : null; }
          d = RF.normalize(d);
          if (!d.caseNumber && (oc.agencyNumber || oc.number)) d.caseNumber = oc.agencyNumber || oc.number;
          const cc = per ? CLOSE_CODES[dd.disposition] || {} : draft;
          if (cc.status) d.status = cc.status;
          if (cc.cleared) d.cleared = cc.cleared;
          for (const [k, v] of Object.entries(draft.checks)) if (v) d[k] = true;
          await Save.track(`report-fields:${oc.id}`, () => Vault.writeCaseJSON(oc.id, 'report-fields.json', d));
        }
        n++;
      } catch { /* reported by Save */ }
    }
    // v1.84: Undo for a few seconds puts each case back as it was.
    const closedOps = []; // Missions closed with it, put back by Undo too
    const one = per ? (per[ids[0]] || {}).disposition : closure.disposition;
    const msg = per ? `Closed ${n} case number${n === 1 ? '' : 's'}, each with its own disposition.` : n > 1 ? `Closed ${n} case numbers: ${K().disposition(one).label}.` : `Case closed: ${K().disposition(one).label}.`;
    const t = toast(msg, 'success', 8000);
    if (t && n) {
      const undo = ui.h('button', { class: 'toast-undo', type: 'button' }, 'Undo');
      undo.addEventListener('click', async () => {
        t.remove();
        for (const [id, b] of before) {
          try {
            const oc = id === c.id ? c : await Vault.getCase(id);
            oc.status = b.status;
            oc.dates.closed = b.closed;
            oc.closure = b.closure;
            if (b.closureHistory) oc.closureHistory = b.closureHistory; else delete oc.closureHistory;
            oc.pending = b.pending;
            oc.arrest = b.arrest;
            if (b.arrestRemoved) oc.arrestRemoved = b.arrestRemoved;
            Vault.logActivity(oc, `Close undone: back to ${b.status}`);
            await Save.track(`case:${oc.id}`, () => Vault.saveCase(structuredClone(oc)));
            if (RF && 'fields' in b) await Save.track(`report-fields:${oc.id}`, () => Vault.writeCaseJSON(oc.id, 'report-fields.json', RF.normalize(b.fields)));
          } catch { /* reported by Save */ }
        }
        for (const o of closedOps) await Vault.updateOperation(o.id, { status: o.status, end: o.end }).catch(() => {});
        toast(before.size > 1 ? 'Close undone: the case numbers are back as they were.' : 'Close undone: the case is back as it was.', 'success');
        ui.refresh();
      });
      t.append(' ', undo);
    }
    if (ids.includes(c.id)) ui.go(c.id, 'details');
    ui.refresh();
    if (n) closedOps.push(...await missionFollowUp(c, ids, 'close', closure.date, K().outcomeSummary(sx).text));
    if (n) await laterArrest(ids, per, closure);
    return n > 0;
  }

  /** v1.180: a case carried on from a Mission (Continue in a New Case) closed by arrest: offer to note
   * it on the closed Mission's record (it stays closed) and on the Timeline of the case it came from. */
  async function laterArrest(ids, per, closure) {
    for (const id of ids) {
      const dd = per && per[id] ? per[id] : closure;
      if (dd.disposition !== 'arrest') continue;
      const oc = await Vault.getCase(id).catch(() => null);
      const from = oc && oc.continuedFrom;
      const op = from && from.operationId ? Vault.getOperation(from.operationId) : null;
      if (!op || op.status !== 'Closed') continue;
      const line = K().laterArrestLine(from.name, oc.number, closure.date);
      if ((op.later || []).includes(line)) continue;
      const label = [op.number, op.name].filter(Boolean).join(' ') || 'the Mission';
      const ok = await ui.confirmDialog({
        title: 'Note the arrest on the closed Mission?',
        message: ui.h('div', {}, ui.h('p', {}, `${from.name} was carried on from Mission ${label} when it closed. Add this line to the Mission's record? It stays closed.`), ui.h('p', { class: 'small' }, ui.h('strong', {}, line))),
        confirmText: 'Add It', cancelText: 'Not Now',
      });
      if (!ok) continue;
      try {
        await Vault.updateOperation(op.id, { later: [...(op.later || []), line] });
        if (from.caseId && (Vault.data.cases || []).some((x) => x.id === from.caseId) && !Vault.isArchived(from.caseId)) {
          const tl = await Vault.getTimeline(from.caseId);
          tl.events.push({ id: Vault.newId('e'), kind: 'event', date: closure.date, time: '', title: `${from.name} arrested on case ${oc.number || 'with no number'}`, note: 'Added when that case closed by arrest.', suspect: from.name, done: false, created: new Date().toISOString() });
          await ui.Save.track(`timeline:${from.caseId}`, () => Vault.saveTimeline(from.caseId, tl));
        }
        ui.toast(`Added to Mission ${label}.`, 'success');
      } catch (e) { ui.toast(e.message || 'The Mission was not updated.', 'error'); }
    }
  }

  /** v1.84: after closing the last open case of a Mission, offer to close the Mission too; after
   * reopening a case of a closed Mission, offer to reopen the Mission. Returns the Missions changed,
   * with what they were before. */
  async function missionFollowUp(c, ids, what, date = today(), outcome = '') {
    const opIds = [...new Set(ids.map((id) => (id === c.id ? c : (Vault.data.cases || []).find((x) => x.id === id) || {}).operationId).filter(Boolean))];
    const changed = [];
    for (const opId of opIds) {
      const op = Vault.getOperation(opId);
      if (!op) continue;
      const cases = (Vault.data.cases || []).filter((x) => x.operationId === opId && !Vault.isArchived(x.id));
      const label = [op.number, op.name].filter(Boolean).join(' ') || 'this Mission';
      if (what === 'close') {
        if (op.status === 'Closed' || cases.some((x) => x.status !== 'Closed' && !ids.includes(x.id))) continue;
        const ok = await ui.confirmDialog({
          title: 'Close the Mission too?',
          message: ui.h('div', {}, ui.h('p', {}, `Every case of ${label} is closed now. Close the Mission as well? It moves to CLOSED FILES with its cases, and can be reopened.`),
            outcome ? ui.h('p', { class: 'small' }, ui.h('strong', {}, 'Suspects: '), outcome) : ''),
          confirmText: 'Close Mission',
          cancelText: 'Keep it open',
        });
        if (!ok) continue;
        try {
          changed.push({ id: op.id, status: op.status, end: op.end || '' });
          await Vault.updateOperation(op.id, { status: 'Closed', end: op.end || date, outcome: outcome || op.outcome || '' }); // v1.179: what became of its suspects
          ui.toast(`Mission closed: ${label}.`, 'success');
        } catch (e) { ui.toast(e.message || 'The Mission could not be closed.', 'error'); }
      } else {
        if (op.status !== 'Closed') continue;
        const ok = await ui.confirmDialog({
          title: 'Reopen the Mission?',
          message: `${label} is closed. Reopen the Mission too, so it is back in MISSIONS with this case?`,
          confirmText: 'Reopen Mission',
          cancelText: 'Keep it closed',
        });
        if (!ok) continue;
        try {
          changed.push({ id: op.id, status: op.status, end: op.end || '' });
          await Vault.updateOperation(op.id, { status: 'Open', end: '' });
          ui.toast(`Mission reopened: ${label}.`, 'success');
        } catch (e) { ui.toast(e.message || 'The Mission could not be reopened.', 'error'); }
      }
    }
    if (changed.length) ui.refresh();
    return changed;
  }

  async function reopenCase(c) {
    const { Save, toast } = ui;
    const d = c.closure && K().disposition(c.closure.disposition);
    const ok = await ui.confirmDialog({
      title: 'Reopen this case?',
      message: `It goes back to Open${d ? `. The closing (${d.label}${c.closure.date ? `, ${root.CVFormat ? CVFormat.dateText(c.closure.date) : c.closure.date}` : ''}) is kept in the case's history` : ''}. Arrest details, files and drafts stay as they are.`,
      confirmText: 'Reopen case',
    });
    if (!ok) return false;
    if (c.closure) c.closureHistory = [...(c.closureHistory || []), { ...c.closure, reopened: new Date().toISOString() }];
    c.closure = null;
    c.status = 'Open';
    c.dates.closed = '';
    Vault.logActivity(c, 'Reopened');
    try {
      await Save.track(`case:${c.id}`, () => Vault.saveCase(structuredClone(c)));
      toast('Case reopened.', 'success');
      ui.refresh();
      await missionFollowUp(c, [c.id], 'reopen');
      return true;
    } catch { return false; }
  }

  /* ---------------- Follow-up (v1.106) ---------------- */

  const plusDays = (n) => root.CVFormat.addDays(root.CVFormat.isoDay(), n);

  /** Waiting on a lab, the DA, another agency: a deadline on the Timeline brings the case back. */
  async function followUpDialog(c) {
    const { h, openDialog, Save, toast } = ui;
    const result = await openDialog((close) => {
      const reason = h('select', {}, K().FOLLOW_UP_REASONS.map((r) => h('option', { value: r }, r)));
      const detail = h('input', { type: 'text', maxlength: 120, placeholder: 'Lab request 26-114' });
      const follow = h('input', { type: 'date', value: plusDays(14), required: true });
      return h('form', { class: 'follow-form', onsubmit: (e) => { e.preventDefault(); if (follow.value) close({ reason: reason.value, detail: detail.value.trim(), followUp: follow.value }); } },
        h('h2', { icon: 'calendar-check' }, 'Add Follow-up'),
        h('p', { class: 'muted small explain' }, 'Waiting on someone else? Put the date to check back on the Timeline. It shows as a deadline on the Overview and rings the bell when it is close.'),
        h('div', { class: 'form-grid' }, ui.field('Waiting on', reason), ui.field('Details', detail), ui.field('Follow up by', follow), h('div')),
        CVKit.cancelRow(h, () => close(null), h('button', { class: 'btn primary', type: 'submit', icon: 'calendar-check' }, 'Add to Timeline')));
    });
    if (!result) return false;
    try {
      const tl = await Vault.getTimeline(c.id);
      tl.events.push(K().followUpEvent(result.reason, result.detail, result.followUp, Vault.newId('e')));
      await Save.track(`timeline:${c.id}`, () => Vault.saveTimeline(c.id, tl));
      toast(`Follow-up added: ${result.reason}, ${result.followUp}.`, 'success');
      ui.refresh();
      return true;
    } catch { return false; }
  }

  /** One line under the status: what the status means here, and what it's waiting on / how it closed. */
  function statusLine(c) {
    const K2 = K();
    if (c.status === 'Closed' && c.closure) {
      const d = K2.disposition(c.closure.disposition);
      return `Closed ${c.closure.date || ''}${c.closure.closedBy ? ` by ${c.closure.closedBy}` : ''}: ${d ? d.label : ''}${c.closure.reason ? ` (${c.closure.reason})` : ''}.${c.closure.arrestRef ? ` Arrest report on RD ${c.closure.arrestRef.number}.` : ''}`;
    }
    // Open needs no explaining on the Details tab (v1.24).
    return c.status === 'Open' ? '' : K2.STATUS_HELP[c.status] || '';
  }

  function init(kit) { ui = kit; }

  root.CVClosingUI = { init, hasArrestTab, deleteArrest, renderArrest, closeCaseDialog, reopenCase, followUpDialog, statusLine, templateExtra, startArrestReport };
})(this);
