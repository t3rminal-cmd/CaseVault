/* CaseVault — the Case Overview on the Details tab: suspects, Mission timeline line, case tiles, LEO partners, contacts, deconfliction and Case History.
 * Moved out of app.js in v1.98 (same code): app.js hands over the shared helpers with init(kit). */
'use strict';

(function (root) {
  function init(kit) {
    const { h, field, dnaCombo, I, today, fmtDate, dueLabel, opOf, Save, newCase, openDialog,
      fmtDateTime, toast, renderCaseList } = kit;

    /* Suspects on the Details tab: name, date of birth (the age is worked out), residence and role
     * (Main, Secondary, Other). Kept in case.json as c.suspects; {{suspect.*}} fills templates with
     * the main suspect and {{suspects}} lists them all. */
    function suspectsSection(c, save) {
      if (!Array.isArray(c.suspects)) c.suspects = [];
      const rows = h('div', { class: 'suspect-rows' });
      // v1.93: Primary first, then Secondary, then Other (in the order added within each role).
      const RANK = { Primary: 0, Main: 0, Secondary: 1 };
      const rank = (s) => (s && s.role in RANK ? RANK[s.role] : s && s.role ? 2 : 0);
      const sortSuspects = () => {
        const sorted = c.suspects.map((s, i) => [s, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([s]) => s);
        const moved = sorted.some((s, i) => s !== c.suspects[i]);
        if (moved) c.suspects.splice(0, c.suspects.length, ...sorted);
        return moved;
      };
      const cardOf = (s) => rows.children[c.suspects.indexOf(s)];
      const draw = () => {
        sortSuspects();
        rows.replaceChildren(...(c.suspects.length ? c.suspects.map((s, i) => {
          const who = `Suspect ${i + 1}`;
          const input = (key, attrs) => { const el = h('input', { value: s[key] || '', autocomplete: 'off', ...attrs }); el.addEventListener('input', () => { s[key] = el.value.trim(); save(); }); return el; };
          const age = h('output', { class: 'suspect-age', 'aria-label': `${who} age` });
          const showAge = () => { const a = CVDraft.ageOn(s.dob); age.textContent = a == null ? '—' : String(a); };
          const dob = input('dob', { type: 'date', 'aria-label': `${who} date of birth` });
          dob.addEventListener('input', showAge);
          showAge();
          const role = h('select', { 'aria-label': `${who} role` }, CVDraft.SUSPECT_ROLES.map((r) => h('option', { value: r, selected: r === (s.role || 'Primary') }, r)));
          role.addEventListener('change', () => {
            s.role = role.value;
            if (sortSuspects()) { draw(); const card0 = cardOf(s); const sel = card0 && card0.querySelector(`select[aria-label$="role"]`); if (sel) { sel.focus(); card0.scrollIntoView({ block: 'nearest' }); } }
            save();
          });
          if (!s.role || s.role === 'Main') s.role = 'Primary'; // "Main" before v1.36
          // Demographics (v1.34), kept in s.info: Add From Suspects on the Write Report tab copies them into Offenders.
          if (!s.info || typeof s.info !== 'object') s.info = {};
          const PERSON = (k) => CVReportFields.SUSPECT_INFO.find(([key]) => key === k);
          const infoInput = (k, attrs = {}) => {
            // v1.39: the record numbers and a phone, besides the description.
            const EXTRA = { phone: 'Phone Number', moniker: 'Moniker / Social Media' };
            const [, label, kind, opts] = PERSON(k) || [k, EXTRA[k] || k, k === 'phone' ? 'phone' : 'text'];
            let el;
            if (kind === 'select') el = h('select', { 'aria-label': `${who} ${label}` }, opts.map((o) => h('option', { value: o, selected: o === (s.info[k] || '') }, o || '—')));
            else el = h('input', { value: s.info[k] || '', autocomplete: 'off', maxlength: 200, 'aria-label': `${who} ${label}`, type: kind === 'phone' ? 'tel' : 'text', list: kind === 'hair' ? 'suspect-hair' : kind === 'hairStyle' ? 'suspect-hairstyle' : kind === 'eyes' ? 'suspect-eyes' : null, placeholder: kind === 'height' ? '5 ft 10 in' : kind === 'weight' ? '160 Pounds' : '', ...attrs });
            el.addEventListener(kind === 'select' ? 'change' : 'input', () => { s.info[k] = el.value.trim(); save(); });
            return field(label, ['irNumber', 'fbiNumber', 'idocNumber'].includes(k) ? dnaCombo(el) : el, kind === 'wide' ? 'suspect-wide' : '');
          };
          const demo = h('div', { class: 'suspect-demo' },
            // v1.69: the same fields as an offender on the Draft (all but Clothing Description).
            ['gender', 'identity', 'race', 'complexion', 'height', 'weight', 'hair', 'hairStyle', 'eyes', 'veteran', 'relation', 'irNumber', 'fbiNumber', 'idocNumber', 'phone', 'moniker', 'marks'].map((k) => infoInput(k)));
          // v1.67: Not Identified: the name box is set aside (kept, in case it's filled later).
          const nameIn = input('name', { maxlength: 120, 'aria-label': `${who} name`, list: 'suspect-known' }); // v1.168: suspects of other cases suggested
          const notId = h('input', { type: 'checkbox', checked: !!s.notIdentified, 'aria-label': `${who} not identified` });
          const showNotId = () => { nameIn.disabled = notId.checked; nameIn.placeholder = notId.checked ? 'Not Identified' : ''; card.classList.toggle('not-identified', notId.checked); };
          notId.addEventListener('change', () => { s.notIdentified = notId.checked; showNotId(); save(); });
          // v1.153: the same person (name, and date of birth when given) on another case: say so, with a link.
          const dup = h('p', { class: 'suspect-dup', hidden: true, role: 'status' });
          const checkDup = async () => {
            if (s.notIdentified || !String(s.name || '').trim() || !root.CVPersonView.findDuplicates) { dup.hidden = true; return; }
            const hits = await root.CVPersonView.findDuplicates({ name: s.name, dob: s.dob }, c).catch(() => []);
            if (!hits.length) { dup.hidden = true; return; }
            // v1.168: their record on that case (a Mission's case first) can fill in this one's empty boxes.
            const src = hits.find((x) => x.suspect && x.filled);
            const op = src && src.c.operationId ? opOf(src.c) : null;
            const fill = src ? h('button', { class: 'btn small suspect-fill', type: 'button', icon: 'person-plus',
              title: `Fills in the empty boxes (date of birth, residence, description and record numbers) from ${src.name} on ${src.c.number || 'that case'}${op ? ` (${op.number || op.name})` : ''}. What you already typed stays.`,
              onclick: () => {
                const n = root.CVPersonView.fillFrom(s, src.suspect);
                if (!n) { root.CaseVaultUI.toast('Nothing to fill in: every box already has something.', 'info'); return; }
                save(); draw();
                root.CaseVaultUI.toast(`Filled in ${n} detail${n === 1 ? '' : 's'} of ${src.name} from ${src.c.number || 'the other case'}${op ? ` (${op.number || op.name})` : ''}.`, 'success');
              } }, `Fill In From ${src.c.number || 'That Case'}`) : null;
            dup.replaceChildren(I('person-exclamation'), h('span', {}, `${hits[0].sameDob ? 'The same person (name and date of birth)' : 'Someone with this name'} is on ${hits.length === 1 ? 'another case' : `${hits.length} other cases`}: `),
              ...hits.slice(0, 4).flatMap((x, n) => [n ? ', ' : '', h('a', { href: `#/case/${CVRoute.enc(x.c.id)}`, title: `${x.name}${x.dob ? `, DOB ${x.dob}` : ''}${x.c.operationId && opOf(x.c) ? `\nMission ${opOf(x.c).number || opOf(x.c).name}` : ''}` }, x.c.number || 'No case number')]),
              hits.length > 4 ? ` and ${hits.length - 4} more` : '', fill);
            dup.hidden = false;
          };
          nameIn.addEventListener('change', checkDup);
          dob.addEventListener('change', checkDup);
          // v1.171: one record per person: the same person on other cases (this Mission's too) with
          // other details can be brought up to date from this one, case by case.
          const upd = h('p', { class: 'suspect-update', hidden: true, role: 'status' });
          const infoLabel = (k) => { const f = CVReportFields.SUSPECT_INFO.find(([key]) => key === k); return f ? f[1] : { phone: 'Phone Number', moniker: 'Moniker / Social Media' }[k] || k; };
          const fieldName = (d) => (d.key.startsWith('info.') ? infoLabel(d.key.slice(5)) : d.label);
          let updTimer = null;
          const checkUpdate = async () => {
            const PV = root.CVPersonView;
            if (Vault.isArchived(c.id) || s.notIdentified || !String(s.name || '').trim() || !PV || !PV.personDiff) { upd.hidden = true; return; }
            const hits = (await PV.findDuplicates({ name: s.name, dob: s.dob }, c, { sameMission: true }).catch(() => []))
              .filter((x) => x.suspect && !Vault.isArchived(x.c.id) && PV.personDiff(s, x.suspect).length);
            if (!hits.length) { upd.hidden = true; return; }
            upd.replaceChildren(I('arrow-repeat'), h('span', {}, `${s.name} is on ${hits.length === 1 ? 'another case' : `${hits.length} other cases`} with other details. `),
              h('button', { class: 'btn small suspect-update-btn', type: 'button', icon: 'arrow-repeat', onclick: () => updateOthers(hits) }, `Update on ${hits.length} Other Case${hits.length === 1 ? '' : 's'}`));
            upd.hidden = false;
          };
          const updateOthers = async (hits) => {
            const PV = root.CVPersonView;
            const ticks = hits.map(() => h('input', { type: 'checkbox', checked: true }));
            const go = await openDialog((close) => h('form', { class: 'suspect-update-form', onsubmit: (e) => { e.preventDefault(); close(true); } },
              h('h2', { icon: 'arrow-repeat' }, `Update ${s.name} on Other Cases`),
              h('p', { class: 'muted small' }, 'This case\'s details of the person go on the ticked cases. Details only the other case has stay there.'),
              h('div', { class: 'suspect-update-list' }, ...hits.map((x, n) => {
                const op = x.c.operationId ? opOf(x.c) : null;
                return h('label', { class: 'check-row suspect-update-row' }, ticks[n],
                  h('span', {}, h('strong', {}, x.c.number || 'No case number'), op ? h('span', { class: 'muted small' }, ` · ${op.number || op.name}`) : null,
                    h('ul', { class: 'small' }, ...PV.personDiff(s, x.suspect).map((d) => h('li', {}, `${fieldName(d)}: ${d.from || '(empty)'} → ${d.to}`)))));
              })),
              h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, 'Cancel'), h('button', { class: 'btn primary', type: 'submit' }, 'Update'))));
            if (!go) return;
            let done = 0;
            for (let n = 0; n < hits.length; n++) {
              if (!ticks[n].checked) continue;
              try {
                await Save.track(`case:${hits[n].c.id}`, async () => {
                  const full = await Vault.getCase(hits[n].c.id);
                  const t = (full.suspects || []).find((x) => x && !x.notIdentified && root.CVOperation.nameMatch(s.name, x.name) === 'same' && !(s.dob && x.dob && x.dob !== s.dob));
                  if (!t) return;
                  PV.updateFrom(t, s);
                  await Vault.saveCase(full);
                  done++;
                });
              } catch { /* reported by Save */ }
            }
            if (done) root.CaseVaultUI.toast(`${s.name} updated on ${done} other case${done === 1 ? '' : 's'}.`, 'success');
            checkUpdate();
          };
          // v1.179: what became of the suspect, and a suspect still at large carried on in a new case.
          const outcomeRow = h('div', { class: 'suspect-outcome' });
          const drawOutcome = () => {
            const K = root.CVClosing;
            const ro = Vault.isArchived(c.id);
            const sel = h('select', { 'aria-label': `${who} outcome`, disabled: ro },
              h('option', { value: '' }, 'Not set'),
              ...K.SUSPECT_OUTCOMES.filter((o) => o.key !== 'continued' || (s.continuedIn && s.continuedIn.caseId)).map((o) => h('option', { value: o.key, selected: o.key === s.outcome, title: o.hint }, o.label)));
            sel.addEventListener('change', () => { s.outcome = sel.value; save(); drawOutcome(); });
            const moved = s.outcome === 'continued' && s.continuedIn && s.continuedIn.caseId;
            outcomeRow.replaceChildren(field('Outcome', sel),
              moved ? h('p', { class: 'suspect-continued small' }, I('folder-symlink'), h('span', {}, 'Continued in case '),
                h('a', { href: `#/case/${CVRoute.enc(s.continuedIn.caseId)}` }, s.continuedIn.number || 'with no number'),
                s.continuedIn.date ? h('span', { class: 'muted' }, ` on ${fmtDate(s.continuedIn.date)}`) : '',
                ro ? '' : h('button', { class: 'btn small suspect-continue-undo', type: 'button', title: `Removes case ${s.continuedIn.number || ''} again, if nothing was added to it yet, and makes ${s.name} At Large here`, onclick: () => undoContinue() }, 'Undo')) : '',
              !ro && s.outcome === 'at-large' && !s.notIdentified && String(s.name || '').trim()
                ? h('button', { class: 'btn small suspect-continue', type: 'button', icon: 'folder-plus', title: `Makes a new independent case for ${s.name}, with their details, and links the two cases. Then this ${c.operationId ? 'Mission' : 'case'} can close.`, onclick: () => continueCase() }, 'Continue in a New Case')
                : '');
          };
          const continueCase = async () => {
            await Save.flushAll();
            const op = c.operationId ? opOf(c) : null;
            const mission = op ? [op.number, op.name].filter(Boolean).join(' ') : '';
            const got = await openDialog((close) => {
              const numberIn = h('input', { required: true, maxlength: 100, autocomplete: 'off', autofocus: true, 'aria-label': 'New case number' });
              const openedIn = h('input', { type: 'date', value: today(), required: true, 'aria-label': 'Opened' });
              // v1.180: the warrant, and a reminder on the new case to check on it.
              const warrantIn = h('input', { maxlength: 60, autocomplete: 'off', 'aria-label': 'Warrant number', placeholder: 'If there is one' });
              const checkCb = h('input', { type: 'checkbox', checked: true, 'aria-label': 'Add a warrant check' });
              const daysIn = h('input', { type: 'number', min: 1, max: 365, value: 30, 'aria-label': 'Days until the warrant check', class: 'days-in' });
              const err = h('p', { class: 'error-text small', role: 'alert', hidden: true });
              const check = () => {
                const dup = CVOperation.caseWithNumber(Vault.data.cases, numberIn.value);
                err.hidden = !dup;
                err.textContent = dup ? `Case Number ${numberIn.value.trim()} already exists. Case Numbers must be unique.` : '';
                numberIn.setCustomValidity(dup ? 'This Case Number already exists.' : '');
                return !dup;
              };
              numberIn.addEventListener('input', check);
              return h('form', { class: 'continue-form', onsubmit: (e) => { e.preventDefault(); if (check()) close({ number: numberIn.value.trim(), opened: openedIn.value, warrant: warrantIn.value.trim(), check: checkCb.checked, days: Math.max(1, Math.min(365, Number(daysIn.value) || 30)) }); } },
                h('h2', { icon: 'folder-plus' }, `Continue ${s.name} in a New Case`),
                h('p', { class: 'muted small' }, `${s.name} is still at large. This makes an independent case in General Files${op ? ', outside the Mission,' : ''} with ${s.name} as its suspect (their details, record numbers and description) and this case's contacts. Each case points to the other, and the Timeline of each says so. Here, ${s.name} becomes "Moved to Another Case"${op ? ' on every case number of the Mission' : ''}, so ${op ? 'the Mission' : 'this case'} can close.`),
                h('div', { class: 'form-grid' }, field('New Case Number', numberIn), field('Opened', openedIn), field('Warrant Number', warrantIn)),
                h('label', { class: 'check-row continue-check' }, checkCb, h('span', {}, 'Add a warrant check to the new case\'s Timeline in '), daysIn, h('span', {}, ' days')),
                err,
                h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
                  h('button', { class: 'btn primary', type: 'submit', icon: 'folder-plus' }, 'Make the New Case')));
            });
            if (!got) return;
            let nc; let eventId = '';
            try {
              nc = await Save.track('new-case', () => Vault.createCase({ number: got.number, subject: s.name, fileNumber: c.fileNumber || '', agencyNumber: c.agencyNumber || '', client: c.client || '', opened: got.opened }));
              const full = await Vault.getCase(nc.id);
              const sx = structuredClone(s);
              delete sx.continuedIn;
              full.suspects = [{ ...sx, role: 'Primary', outcome: 'at-large' }];
              full.contacts = structuredClone(c.contacts || {});
              full.continuedFrom = { caseId: c.id, number: c.number || '', operationId: c.operationId || '', mission, name: s.name, date: got.opened, warrant: got.warrant };
              Vault.logActivity(full, `Continued from case ${c.number || ''}${mission ? ` (Mission ${mission})` : ''} for ${s.name}`);
              await Save.track(`case:${nc.id}`, () => Vault.saveCase(full));
              const ev = root.CVClosing.continuationEvents({ name: s.name, from: c.number, to: got.number, mission, date: got.opened, ids: [Vault.newId('e'), Vault.newId('e')] });
              eventId = ev.from.id;
              const check = got.check ? root.CVClosing.warrantCheckEvent(s.name, got.warrant, got.opened, got.days, Vault.newId('e')) : null;
              for (const [id, add] of [[c.id, [ev.from]], [nc.id, [ev.to, check].filter(Boolean)]]) {
                const tl = await Vault.getTimeline(id);
                tl.events.push(...add);
                await Save.track(`timeline:${id}`, () => Vault.saveTimeline(id, tl));
              }
            } catch (err) {
              if (err && err.name === 'ValidationError') toast(err.message, 'error', 7000);
              if (!nc) return; // nothing made; anything else is reported by Save
            }
            s.outcome = 'continued';
            s.continuedIn = { caseId: nc.id, number: got.number, date: got.opened, eventId, warrant: got.warrant };
            Vault.logActivity(c, `${s.name} continued in case ${got.number}`);
            save();
            drawOutcome();
            renderCaseList();
            const t = toast(`Case ${got.number} made for ${s.name}.`, 'success', 8000);
            if (t) t.append(' ', h('a', { class: 'toast-undo', href: `#/case/${CVRoute.enc(nc.id)}` }, 'Open It'));
          };
          // v1.180: Undo of Continue in a New Case: the new case goes to Recently Deleted, only while
          // nothing was added to it; the suspect is At Large here again.
          const undoContinue = async () => {
            const ci = s.continuedIn;
            await Save.flushAll();
            const exists = (Vault.data.cases || []).some((x) => x.id === ci.caseId);
            try {
              if (exists) {
                const [nc, files, tl, notes] = await Promise.all([Vault.getCase(ci.caseId), Vault.caseFolderFiles(ci.caseId).catch(() => []),
                  Vault.getTimeline(ci.caseId).catch(() => ({ events: [] })), Vault.getNotes(ci.caseId).catch(() => '')]);
                const ok = !Vault.isArchived(ci.caseId) && root.CVClosing.continuedUntouched({ files: files.map((f) => ({ path: f.path, size: f.blob.size })), events: tl.events, notes, status: nc.status });
                if (!ok) { toast(`Case ${ci.number} already has work in it (files, notes, Timeline entries or a new status), so it stays. Delete it from its Details tab if you are sure.`, 'error', 9000); return; }
                const yes = await root.CaseVaultUI.confirmDialog({ title: `Undo: remove case ${ci.number}?`, message: `Case ${ci.number} goes to Recently Deleted (kept 30 days), and ${s.name} is At Large here again.`, confirmText: 'Remove It', cancelText: 'Keep It' });
                if (!yes) return;
                await Save.track(`delete:${ci.caseId}`, () => Vault.deleteCase(ci.caseId));
              }
              const tl = await Vault.getTimeline(c.id);
              tl.events = tl.events.filter((e) => !(ci.eventId ? e.id === ci.eventId : e.title === `${s.name} continued in case ${ci.number}`));
              await Save.track(`timeline:${c.id}`, () => Vault.saveTimeline(c.id, tl));
            } catch (err) { if (err && err.name === 'ValidationError') toast(err.message, 'error', 7000); return; }
            s.outcome = 'at-large';
            delete s.continuedIn;
            Vault.logActivity(c, `Continue in case ${ci.number} undone`);
            save();
            drawOutcome();
            renderCaseList();
            toast(`${exists ? `Case ${ci.number} removed. ` : ''}${s.name} is At Large again.`, 'success');
          };
          drawOutcome();
          const card = h('div', { class: 'suspect-card' }, h('div', { class: 'suspect-row' },
            h('div', { class: 'field suspect-name-field' }, h('span', { class: 'suspect-name-label' }, 'Name', h('label', { class: 'suspect-notid', title: 'The suspect has not been identified yet. Templates and the Draft show "Not Identified".' }, notId, h('span', {}, 'Not Identified'))), nameIn),
            field('DOB', dob),
            h('div', { class: 'field' }, h('span', {}, 'Age'), age),
            field('Residence', input('residence', { maxlength: 200, 'aria-label': `${who} residence`, title: s.residence || '' })),
            field('Role', role),
            // v1.119: every case and Mission this person is on.
            h('button', { 'data-ro-ok': 'true', class: 'icon-btn person-btn', type: 'button', title: 'Every case this person is on', onclick: () => { if (!String(s.name || '').trim()) return; root.CVPersonView.open(s.name, root.CaseVaultUI); } }, I('person-lines-fill'), h('span', { class: 'sr-only' }, `Cases with ${who}`)),
            h('button', { class: 'icon-btn danger-icon contact-remove', type: 'button', title: 'Remove this suspect', onclick: () => { c.suspects.splice(i, 1); draw(); save(); } }, I('trash3'), h('span', { class: 'sr-only' }, `Remove ${who}`))),
            outcomeRow,
            dup,
            upd,
            demo);
          card.addEventListener('change', () => { clearTimeout(updTimer); updTimer = setTimeout(checkUpdate, 600); });
          if (String(s.name || '').trim()) setTimeout(checkUpdate, 0);
          // v1.168: the suggestions list now, not later from the page watcher (which moved the box and
          // took the focus away from a new suspect's name).
          if (root.CVCombo && root.CVCombo.upgrade) root.CVCombo.upgrade(nameIn);
          showNotId();
          return card;
        }) : [h('p', { class: 'muted small suspect-empty empty-note' }, I('person-vcard'), h('span', {}, 'No suspects yet. Add suspect makes one.'))]));
      };
      draw();
      // v1.168: the suspects of the other cases (a Mission's first), as suggestions while typing a name.
      const known = h('datalist', { id: 'suspect-known' });
      if (root.CVPersonView && root.CVPersonView.knownSuspects) {
        root.CVPersonView.knownSuspects(c).then((list) => known.replaceChildren(...list.slice(0, 300).map((x) => h('option', { value: x.name, label: [x.dob, x.gender, x.ir ? `IR ${x.ir}` : '', x.number].filter(Boolean).join(' · ') })))).catch(() => {});
      }
      return h('section', { class: 'contacts suspects cv-boxed', 'aria-labelledby': 'suspects-title' },
        h('h3', { id: 'suspects-title', icon: 'person-exclamation', title: 'The people this case is about. The main suspect fills {{suspect.name}} in templates.' }, 'Suspects'),
        known,
        h('datalist', { id: 'suspect-hair' }, CVReportFields.PICKS.hair.map((x) => h('option', { value: x }))),
        h('datalist', { id: 'suspect-hairstyle' }, CVReportFields.PICKS.hairStyle.map((x) => h('option', { value: x }))),
        h('datalist', { id: 'suspect-eyes' }, CVReportFields.PICKS.eyes.map((x) => h('option', { value: x }))),
        rows,
        h('div', { class: 'contact-add' }, h('button', { class: 'btn small', type: 'button', icon: 'person-plus', onclick: () => {
          const added = { name: '', dob: '', residence: '', info: {}, role: c.suspects.some((x) => x.role === 'Primary' || x.role === 'Main') ? 'Secondary' : 'Primary' };
          c.suspects.push(added);
          draw();
          // The new card sits in its role's place (a Secondary goes before the Others).
          const card0 = cardOf(added);
          const first = card0 && (card0.querySelector('input[aria-label$=" name"]') || card0.querySelector('input'));
          if (first) { first.focus(); card0.scrollIntoView({ block: 'nearest' }); }
        } }, 'Add suspect')));
    }

    /* A slim timeline on the Details tab (v1.37): a line with a small dot for each event of the
     * operation (every case number), in date order, and a Today mark. Point at a dot for its date,
     * title and note; click it to open that case's Timeline tab. */
    function miniTimeline(c, members, { mine = false } = {}) {
      const box = h('section', { class: 'mini-tl', 'aria-label': 'Timeline' });
      (async () => {
        const tls = [];
        // v1.151: read at once (a moved case number is left out).
        tls.push(...(await Promise.all(members.map((m) => Vault.getTimeline(m.id).then((t) => ({ caseId: m.id, number: m.number || '', events: (t || {}).events || [] }), () => null)))).filter(Boolean));
        const rows = CVOperation.mergeEvents(tls).filter((r) => r.ev && r.ev.date);
        const colors = CVOperation.suspectColors(rows); // v1.117: each suspect's colour
        if (!rows.length) { box.replaceChildren(h('div', { class: 'mini-tl-head' }, h('span', { class: 'mini-tl-title' }, 'Timeline'), h('a', { class: 'muted small', href: `#/case/${CVRoute.enc(c.id)}/timeline` }, 'No events yet. Add them on the Timeline tab.'))); return; }
        const t = (d) => new Date(`${d}T12:00:00`).getTime();
        const todayIso = today();
        const first = Math.min(t(rows[0].ev.date), t(todayIso));
        const last = Math.max(t(rows[rows.length - 1].ev.date), t(todayIso));
        const span = Math.max(last - first, 864e5);
        const pos = (d) => `${(3 + 94 * (t(d) - first) / span).toFixed(2)}%`;
        const line = h('div', { class: 'mini-tl-line' });
        const tip = (ev, number) => [`${fmtDate(ev.date)}${ev.time ? ` ${ev.time}` : ''}`, ev.title || (ev.kind === 'deadline' ? 'Deadline' : 'Event'), ev.suspect ? `Suspect: ${ev.suspect}` : '',
          ev.kind === 'deadline' ? (ev.done ? 'Deadline: done' : `Deadline: ${dueLabel(ev.date).text}`) : '', number && members.length > 1 ? `Case ${number}` : '', ev.note || ''].filter(Boolean).join('\n');
        // v1.97: events too close to tell apart (the same day, or a day or two on a long line) share
        // one marker with their count; pointing at it lists them all. Worked out again on resize.
        const pct = (d) => 3 + 94 * (t(d) - first) / span;
        const marker = (group) => {
          const evs = group.items.map((r) => r.ev);
          const dues = evs.map((ev) => (ev.kind === 'deadline' && !ev.done ? dueLabel(ev.date) : null));
          const due = dues.find((d) => d && d.cls === 'overdue') || dues.find(Boolean);
          const deadline = evs.some((ev) => ev.kind === 'deadline');
          const done = evs.every((ev) => ev.done);
          const many = evs.length > 1;
          const text = many ? [`${evs.length} events`, ...group.items.map(({ ev, number }) => `${fmtDate(ev.date)}${ev.time ? ` ${ev.time}` : ''} · ${ev.title || (ev.kind === 'deadline' ? 'Deadline' : 'Event')}${ev.kind === 'deadline' ? (ev.done ? ' (done)' : ` (${dueLabel(ev.date).text})`) : ''}${number && members.length > 1 ? ` · ${number}` : ''}`)].join('\n')
            : tip(evs[0], group.items[0].number);
          // v1.107: on a case's Details tab, the circles of that case number's own events glow green.
          const own = mine && group.items.some((r) => r.caseId === c.id);
          const dot = h('a', { class: `mini-tl-dot${own ? ' mini-tl-mine' : ''}${many ? ' mini-tl-group' : ''}${deadline ? ' deadline' : ''}${done ? ' done' : ''}${due ? ` ${due.cls}` : ''}`, href: `#/case/${CVRoute.enc(group.items[0].caseId)}/timeline`, 'data-tip': text, 'aria-label': text.replace(/\n/g, ', ') }, many ? String(evs.length) : null);
          dot.style.setProperty('left', `${group.x.toFixed(2)}%`);
          // v1.117: in the events' colour (the suspect's) when they share one.
          const cols = [...new Set(evs.map((ev) => CVOperation.eventColor(ev, colors)))];
          if (cols.length === 1 && cols[0]) { dot.classList.add('has-color'); dot.style.setProperty('--dot-color', cols[0]); }
          return dot;
        };
        const place = () => {
          const gap = (18 / (line.clientWidth || 900)) * 100;
          let groups = [];
          for (const r of rows) {
            const x = pct(r.ev.date);
            const g = groups[groups.length - 1];
            if (g && x - g.x0 < gap) { g.items.push(r); g.xs.push(x); } else groups.push({ x0: x, items: [r], xs: [x] });
          }
          groups.forEach((g) => { g.x = g.xs.reduce((a, b) => a + b, 0) / g.xs.length; });
          for (let i = 1; i < groups.length; i += 1) {
            if (groups[i].x - groups[i - 1].x < gap) {
              const a = groups[i - 1]; const b = groups[i];
              a.items.push(...b.items); a.xs.push(...b.xs); a.x = a.xs.reduce((m, n) => m + n, 0) / a.xs.length;
              groups.splice(i, 1); i = Math.max(0, i - 2);
            }
          }
          groups = groups.map(marker);
          line.querySelectorAll('.mini-tl-dot').forEach((d) => d.remove());
          line.prepend(...groups);
        };
        let width = 0;
        new ResizeObserver(() => { if (line.clientWidth && line.clientWidth !== width) { width = line.clientWidth; place(); } }).observe(line);
        place();
        const now = h('span', { class: 'mini-tl-today', 'data-tip': `Today, ${fmtDate(todayIso)}`, 'aria-label': 'Today' });
        now.style.setProperty('left', pos(todayIso));
        line.append(now);
        box.replaceChildren(
          h('div', { class: 'mini-tl-head' }, h('span', { class: 'mini-tl-title' }, 'Timeline'), h('span', { class: 'muted small' }, `${rows.length} event${rows.length === 1 ? '' : 's'}`),
            mine && members.length > 1 ? h('span', { class: 'mini-tl-key small' }, h('span', { class: 'mini-tl-key-dot', 'aria-hidden': 'true' }), `${c.number || 'This case'}`) : null, h('div', { class: 'spacer' }),
            h('span', { class: 'muted small' }, `${fmtDate(new Date(first).toISOString().slice(0, 10))} – ${fmtDate(new Date(last).toISOString().slice(0, 10))}`)),
          line);
      })();
      return box;
    }

    /* The operation's case numbers (v1.27): a folder for each, its number under it; the one on
     * screen is highlighted. Click one to open it; + adds a case number to the operation. */
    function caseTiles(c, members, archived) {
      const sorted = [...members].sort((a, b) => String(a.number || '').localeCompare(String(b.number || ''), undefined, { numeric: true }));
      if (!opOf(c)) return null; // v1.46: an independent case has no Operation to show
      return h('div', { class: 'case-tiles', role: 'list', 'aria-label': 'Case numbers in this Mission' },
        sorted.map((x) => {
          const cur = x.id === c.id;
          // v1.37: every case number's folder opens that case's Saved Reports tab (this one's too).
          return h('a', { class: `case-tile${cur ? ' current' : ''} status-${String(x.status).toLowerCase()}`, role: 'listitem', href: `#/case/${CVRoute.enc(x.id)}/reports`, title: `${x.number || 'No case number'} · ${x.status}${cur ? ' (this one)' : ''}: open its Reports` },
            I(cur ? 'folder2-open' : 'folder-fill'), h('span', { class: 'case-tile-num' }, x.number || 'No number'), h('span', { class: 'case-tile-status' }, x.status));
        }),
        archived ? null : h('button', { class: 'case-tile add', type: 'button', title: 'A new case in this Mission, with its file number, jacket number and client', onclick: () => { Save.flushAll(); newCase({ operationId: c.operationId }); } },
          I('plus-lg'), h('span', { class: 'case-tile-num' }, 'Add Case Number')));
    }

    /* LEO partners on the Details tab (v1.26): the agencies working the case with you. Local PD and
     * Sheriff Dept ask which department. Kept in case.json as c.partners [{ agency, name }];
     * {{case.partners}} fills templates. */
    const DEPT_QUESTION = { 'State PD': 'Which state police?', 'Local PD': 'Which police department?', 'Sheriff Dept': 'Which sheriff\'s department?', Other: 'Which agency?' };
    function askDepartment(agency, current = '') {
      return openDialog((close) => {
        const inp = h('input', { type: 'text', value: current, autofocus: true, maxlength: 300, placeholder: agency === 'State PD' ? 'Illinois State Police' : agency === 'Local PD' ? 'Evanston Police Department' : agency === 'Other' ? 'Postal Service OIG; Amtrak Police' : 'Cook County Sheriff\'s Office', 'aria-label': DEPT_QUESTION[agency] });
        return h('form', { class: 'partner-form', onsubmit: (e) => { e.preventDefault(); close(inp.value.trim()); } },
          h('h2', { icon: 'building' }, DEPT_QUESTION[agency]),
          h('p', { class: 'muted small' }, 'More than one? Separate them with a semicolon (;).'),
          field(agency, inp),
          CVKit.cancelRow(h, () => close(null), h('button', { class: 'btn primary', type: 'submit' }, 'OK')));
      });
    }
    /* LEO Partners as badges (v1.33; v1.51: CaseVault's own colour badge for each agency, not a seal),
     * the Chicago six-pointed star for Local PD and a police shield for the Sheriff. */
    const CHICAGO_STAR = 'M12.00 1.00 L9.70 8.02 L2.47 6.50 L7.40 12.00 L2.47 17.50 L9.70 15.98 L12.00 23.00 L14.30 15.98 L21.53 17.50 L16.60 12.00 L21.53 6.50 L14.30 8.02 Z';
    const emblem = (d) => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'bi'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); p.setAttribute('fill', 'currentColor'); svg.append(p); return svg; };
    const PARTNER_BADGES = {
      DEA: { name: 'Drug Enforcement Administration', icon: 'capsule-pill', badge: 'badge-dea', color: '#1f6f43' },
      FBI: { name: 'Federal Bureau of Investigation', icon: 'fingerprint', badge: 'badge-fbi', color: '#1f3a6b' },
      ATF: { name: 'Alcohol, Tobacco, Firearms and Explosives', icon: 'fire', badge: 'badge-atf', color: '#8a2d1c' },
      USMS: { name: 'U.S. Marshals Service', icon: 'marshal-star', badge: 'badge-usms', color: '#5a4a1a' },
      IRS: { name: 'IRS Criminal Investigation', icon: 'cash-coin', badge: 'badge-irs', color: '#22636b' },
      CBP: { name: 'Customs and Border Protection', icon: 'globe-americas', badge: 'badge-cbp', color: '#1d4f91' },
      HSI: { name: 'Homeland Security Investigations', icon: 'shield-fill-check', badge: 'badge-hsi', color: '#2d4b73' },
      ICE: { name: 'Immigration and Customs Enforcement', icon: 'shield-shaded', badge: 'badge-ice', color: '#3b4f63' },
      USSS: { name: 'U.S. Secret Service', icon: 'star-fill', badge: 'badge-usss', color: '#7a5a12' },
      USPIS: { name: 'U.S. Postal Inspection Service', icon: 'envelope-paper', badge: 'badge-uspis', color: '#2b5aa6' },
      'State PD': { name: 'State Police', icon: 'patch-check-fill', badge: 'badge-state-pd', color: '#33507a' },
      'Local PD': { name: 'Police Department', svg: CHICAGO_STAR, badge: 'badge-local-pd', color: '#1b74c5' },
      'Sheriff Dept': { name: 'Sheriff\'s Office', icon: 'shield-fill', badge: 'badge-sheriff', color: '#6b4f1d' },
      Other: { name: 'Another agency', icon: 'building', color: '#5c6670' },
    };
    function partnersSection(c, save) {
      if (!Array.isArray(c.partners)) c.partners = [];
      const box = h('div', { class: 'partner-chips' });
      const setNames = (agency, text) => {
        c.partners = c.partners.filter((p) => p.agency !== agency);
        const names = String(text || '').split(/\s*;\s*/).map((x) => x.trim()).filter(Boolean);
        for (const name of names) c.partners.push({ agency, name });
        return names.length;
      };
      // v1.54: only the agencies working this case show; "Show All Agencies" brings the rest back to
      // pick from. With none picked, all show.
      let showAll = false;
      const toggle = h('button', { class: 'btn small ghost partner-toggle', type: 'button' });
      toggle.addEventListener('click', () => { showAll = !showAll; draw(); });
      const draw = () => {
        const picked = new Set(c.partners.map((p) => p.agency));
        const all = showAll || !picked.size;
        toggle.hidden = !picked.size;
        toggle.replaceChildren(I(all ? 'eye-slash' : 'eye'), all ? ' Show Only Working This Case' : ` Show All Agencies (${CVDraft.PARTNER_AGENCIES.length - picked.size} more)`);
        box.replaceChildren(...CVDraft.PARTNER_AGENCIES.filter((agency) => all || picked.has(agency)).map((agency) => {
        const mine = c.partners.filter((p) => p.agency === agency);
        const on = mine.length > 0;
        const names = mine.map((p) => p.name).filter(Boolean).join('; ');
        const cb = h('input', { type: 'checkbox', checked: on, 'aria-label': agency });
        cb.addEventListener('change', async () => {
          if (cb.checked && DEPT_QUESTION[agency]) {
            const text = await askDepartment(agency);
            if (!text || !setNames(agency, text)) { cb.checked = false; return; }
          } else if (cb.checked) c.partners.push({ agency });
          else c.partners = c.partners.filter((p) => p.agency !== agency);
          draw(); save();
        });
        const edit = on && DEPT_QUESTION[agency] ? h('button', { class: 'icon-btn partner-edit', type: 'button', title: `Change the ${agency === 'State PD' ? 'state police' : agency === 'Local PD' ? 'police department' : agency === 'Other' ? 'agency' : 'sheriff\'s department'}`, onclick: async () => {
          const text = await askDepartment(agency, names);
          if (text == null) return;
          if (!setNames(agency, text)) c.partners = c.partners.filter((p) => p.agency !== agency);
          draw(); save();
        } }, I('pencil'), h('span', { class: 'sr-only' }, `Change ${agency}`)) : null;
        const b = PARTNER_BADGES[agency] || PARTNER_BADGES.Other;
        const tile = h('div', { class: `partner-chip partner-badge${on ? ' on' : ''}` },
          h('label', { class: 'partner-pick', title: on ? `${b.name}: working this case. Click to take it off.` : `${b.name}: click if working this case.` }, cb,
            h('span', { class: `partner-emblem${b.badge ? ' partner-art' : ''}`, 'aria-hidden': 'true' }, b.badge ? I(b.badge) : b.svg ? emblem(b.svg) : I(b.icon)),
            h('span', { class: 'partner-words' }, h('strong', {}, agency === 'Sheriff Dept' ? 'Sheriff' : agency), h('span', { class: 'partner-full' }, names || b.name))),
          edit);
        tile.style.setProperty('--agency', b.color); // set from script: the page's CSP allows no inline style attributes
        return tile;
      }));
      };
      draw();
      return h('section', { class: 'contacts partners', 'aria-labelledby': 'partners-title' },
        h('h3', { id: 'partners-title', icon: 'shield-check', title: 'The agencies working this case with you. Templates can use {{case.partners}}.' }, 'LEO Partners'),
        box, h('div', { class: 'partner-tools' }, toggle));
    }

    /* Contacts on the Details tab: the case officer, the prosecutor (ASA or AUSA) and anyone else
     * the case needs (finance, asset forfeiture, the narcotic team supervisor…). Kept in case.json
     * as c.contacts; {{case.officer.*}} and {{case.prosecutor.*}} fill templates. */
    const CONTACT_ROLES = ['Team Supervisor', 'Team Member', 'Finance', 'Asset Forfeiture', 'Task Force Officer', 'Analyst', 'Lab', 'Victim Advocate'];
    function contactsSection(c, save) {
      const k = c.contacts = Object.assign({ officer: {}, prosecutor: {}, others: [] }, c.contacts || {});
      k.officer = k.officer || {}; k.prosecutor = k.prosecutor || {}; k.others = Array.isArray(k.others) ? k.others : [];
      if (!k.prosecutor.title) k.prosecutor.title = 'ASA';
      const input = (obj, key, attrs) => {
        const el = h('input', { value: obj[key] || '', ...attrs });
        el.addEventListener('input', () => { obj[key] = el.value.trim(); save(); });
        return el;
      };
      // v1.175: the Rolodex: a name box offers its cards (the prosecutor's: ASAs and AUSAs) and
      // picking one fills in the email and phone (and the title or role); the card button keeps a
      // contact typed here in the Rolodex.
      const R = root.CVRolodex;
      const person = (obj, who, { kinds = null, onCard = null, kindOf = () => 'Other' } = {}) => {
        const nameIn = input(obj, 'name', { maxlength: 120, autocomplete: 'off', 'aria-label': `${who} name` });
        const emailIn = input(obj, 'email', { type: 'email', maxlength: 200, autocomplete: 'off', 'aria-label': `${who} email` });
        const phoneIn = input(obj, 'phone', { type: 'tel', maxlength: 40, autocomplete: 'off', 'aria-label': `${who} phone` });
        const nameBox = R && root.CVCombo ? root.CVCombo.attach(nameIn, { label: 'Pick from the Rolodex', items: () => R.comboItems(R.list(), typeof kinds === 'function' ? kinds() : kinds), onPick: (it) => {
          const x = it && it.card;
          if (!x) return;
          obj.name = x.name;
          if (x.email) { obj.email = x.email; emailIn.value = x.email; }
          if (x.phone) { obj.phone = x.phone; phoneIn.value = x.phone; }
          if (onCard) onCard(x);
          save();
        } }) : nameIn;
        const keepBtn = R ? h('button', { class: 'icon-btn rolo-keep', type: 'button', title: 'Save this contact in the Rolodex, to fill in on other cases', onclick: async () => {
          if (!String(obj.name || '').trim()) { root.CaseVaultUI.toast('Type the name first.', 'info'); return; }
          try {
            const r = await R.keep({ kind: kindOf(), name: obj.name, email: obj.email, phone: obj.phone, title: obj.role || '' });
            root.CaseVaultUI.toast(r === 'added' ? `${obj.name} was added to the Rolodex.` : r === 'updated' ? `${obj.name}'s card in the Rolodex was filled in.` : `${obj.name} is already in the Rolodex.`, 'success');
          } catch (err) { root.CaseVaultUI.toast(`Not saved: ${err.message}`, 'error'); }
        } }, I('person-rolodex'), h('span', { class: 'sr-only' }, `Save ${who} in the Rolodex`)) : null;
        return [field('Name', nameBox), field('Email', emailIn), field('Phone', phoneIn), keepBtn];
      };
      const proTitle = h('select', { 'aria-label': 'Prosecutor title', title: 'ASA: Assistant State\'s Attorney. AUSA: Assistant United States Attorney.' },
        ['ASA', 'AUSA'].map((t) => h('option', { value: t, selected: t === k.prosecutor.title }, t)));
      proTitle.addEventListener('change', () => { k.prosecutor.title = proTitle.value; save(); });

      const roles = h('datalist', { id: 'contact-roles' }, CONTACT_ROLES.map((r) => h('option', { value: r })));
      const others = h('div', { class: 'contact-others' });
      const drawOthers = () => {
        others.replaceChildren(...k.others.map((o, i) => h('div', { class: 'contact-row' },
          field('Role', input(o, 'role', { maxlength: 80, list: 'contact-roles', placeholder: 'Finance', 'aria-label': `Contact ${i + 1} role` })),
          ...person(o, `Contact ${i + 1}`, { onCard: (x) => { if (!String(o.role || '').trim()) { o.role = x.title || x.kind; drawOthers(); } }, kindOf: () => (/police|officer|detective|agent|tfo|task force/i.test(o.role || '') ? 'Other Police' : 'Other') }),
          h('button', { class: 'icon-btn danger-icon contact-remove', type: 'button', title: 'Remove this contact', onclick: () => { k.others.splice(i, 1); drawOthers(); save(); } }, I('trash3'), h('span', { class: 'sr-only' }, `Remove contact ${i + 1}`)))));
      };
      drawOthers();
      const add = h('button', { class: 'btn small', type: 'button', icon: 'person-plus', title: 'Add someone else on the case: the team supervisor, a team member, finance, asset forfeiture…', onclick: () => {
        k.others.push({ role: '', name: '', email: '', phone: '' });
        drawOthers();
        const last = others.lastElementChild && others.lastElementChild.querySelector('input');
        if (last) last.focus();
      } }, 'Add contact');

      return h('section', { class: 'contacts cv-boxed', 'aria-labelledby': 'contacts-title' },
        h('h3', { id: 'contacts-title', icon: 'people', title: 'Who to reach on this case. Fills {{case.prosecutor.name}} and the like in templates.' }, 'Contacts'),
        roles,
        h('div', { class: 'contact-row' }, h('div', { class: 'field contact-role' }, h('span', {}, 'Role'), h('strong', { class: 'contact-fixed' }, 'Case Officer')), ...person(k.officer, 'Case officer', { kindOf: () => 'Other Police' })),
        h('div', { class: 'contact-row' }, h('label', { class: 'field contact-role' }, h('span', {}, 'Role'), proTitle), ...person(k.prosecutor, 'Prosecutor', { kinds: ['ASA', 'AUSA'], onCard: (x) => { if (['ASA', 'AUSA'].includes(x.kind)) { k.prosecutor.title = x.kind; proTitle.value = x.kind; } }, kindOf: () => k.prosecutor.title || 'ASA' })),
        others,
        h('div', { class: 'contact-add' }, add, R ? h('button', { class: 'btn small', type: 'button', icon: 'person-rolodex', title: 'Prosecutors, other departments and anyone else you work with, kept on the SSD', onclick: () => R.open(root.CaseVaultUI) }, 'Rolodex') : null));
    }

    /* Deconfliction (v1.21): a table of each deconfliction check before an operation: date, event
     * or location, the system checked, its deconfliction number, and whether there was a conflict
     * (Yes / No). Kept in case.json as c.deconfliction. */
    const DECON_SYSTEMS = ['RISSafe', 'HIDTA Deconfliction', 'DICE', 'Case Explorer', 'SAFETNet', 'Department Deconfliction'];
    function deconflictionSection(c, save) {
      c.deconfliction = Array.isArray(c.deconfliction) ? c.deconfliction : [];
      // v1.33: a card per check, the boxes in rows that wrap, so nothing is cut off (long dates too).
      const rows = h('div', { class: 'decon-list' });
      const cellInput = (row, key, attrs) => {
        const el = h('input', { value: row[key] || '', autocomplete: 'off', ...attrs });
        el.addEventListener('input', () => { row[key] = el.value.trim(); save(); });
        el.addEventListener('change', () => { row[key] = String(el.value).trim(); save(); });
        return el;
      };
      const dateBox = (r, i) => {
        const el = cellInput(r, 'date', { type: 'date', 'aria-label': `Check ${i + 1} date` });
        el.addEventListener('change', () => { resort = true; setTimeout(settle, 0); });
        return el;
      };
      // System (v1.34): a drop-down of the deconfliction systems; Other asks for its name.
      const systemPick = (r, i) => {
        const known = DECON_SYSTEMS.includes(r.system || '');
        const other = h('input', { class: 'decon-other', value: known ? '' : (r.system || ''), autocomplete: 'off', maxlength: 100, placeholder: 'Which system?', 'aria-label': `Check ${i + 1} other system`, hidden: known || !r.system });
        const sel = h('select', { 'aria-label': `Check ${i + 1} system` },
          ['', ...DECON_SYSTEMS, 'Other'].map((o) => h('option', { value: o, selected: o === 'Other' ? (!known && !!r.system) : o === (r.system || '') }, o || '—')));
        sel.addEventListener('change', () => {
          other.hidden = sel.value !== 'Other';
          r.system = sel.value === 'Other' ? other.value.trim() : sel.value;
          save();
          if (!other.hidden) other.focus();
        });
        other.addEventListener('input', () => { r.system = other.value.trim(); save(); });
        return h('div', { class: 'decon-system' }, sel, other);
      };
      // v1.96: checks in date order, oldest first; no date goes last. A changed date re-sorts once
      // the cursor leaves the list, so a card doesn't jump while its date is being typed.
      const dateKey = (r) => (/^\d{4}-\d{2}-\d{2}$/.test((r && r.date) || '') ? r.date : '9999-99-99');
      const sortChecks = () => {
        const sorted = c.deconfliction.map((r, i) => [r, i]).sort((a, b) => dateKey(a[0]).localeCompare(dateKey(b[0])) || a[1] - b[1]).map(([r]) => r);
        const moved = sorted.some((r, i) => r !== c.deconfliction[i]);
        if (moved) c.deconfliction.splice(0, c.deconfliction.length, ...sorted);
        return moved;
      };
      let resort = false;
      const settle = () => {
        if (!resort || rows.contains(document.activeElement)) return;
        resort = false;
        if (sortChecks()) { draw(); save(); }
      };
      rows.addEventListener('focusout', () => setTimeout(settle, 0));
      const draw = () => {
        sortChecks();
        rows.replaceChildren(...(c.deconfliction.length ? c.deconfliction.map((r, i) => {
          const conflict = h('select', { 'aria-label': `Check ${i + 1} conflict`, class: r.conflict === 'Yes' ? 'decon-yes' : '' }, ['', 'No', 'Yes'].map((o) => h('option', { value: o, selected: o === (r.conflict || '') }, o || '—')));
          const card = h('div', { class: `decon-card${r.conflict === 'Yes' ? ' conflict' : ''}` });
          conflict.addEventListener('change', () => { r.conflict = conflict.value; conflict.className = r.conflict === 'Yes' ? 'decon-yes' : ''; card.classList.toggle('conflict', r.conflict === 'Yes'); save(); });
          card.append(
            h('div', { class: 'decon-card-head' }, h('strong', {}, `Check ${i + 1}`), h('div', { class: 'spacer' }),
              h('button', { class: 'icon-btn danger-icon', type: 'button', title: 'Delete this check', onclick: () => { c.deconfliction.splice(i, 1); draw(); save(); } }, I('trash3'), h('span', { class: 'sr-only' }, `Delete check ${i + 1}`))),
            h('div', { class: 'decon-grid' },
              field('Date', dateBox(r, i)),
              field('Event / Location', cellInput(r, 'event', { 'aria-label': `Check ${i + 1} event or location` }), 'decon-wide'),
              field('System', systemPick(r, i)),
              field('Deconfliction Number', cellInput(r, 'number', { 'aria-label': `Check ${i + 1} deconfliction number` })),
              field('Conflict', conflict),
              field('Notes', cellInput(r, 'notes', { 'aria-label': `Check ${i + 1} notes` }), 'decon-wide')));
          return card;
        }) : [h('p', { class: 'muted small empty-note' }, I('shield-check'), h('span', {}, 'No deconfliction yet.'))]));
      };
      draw();
      const add = h('button', { class: 'btn small', type: 'button', icon: 'plus-lg', onclick: () => {
        const row = { date: today(), event: '', system: '', number: '', conflict: '', notes: '' };
        c.deconfliction.push(row);
        draw(); save();
        const card = rows.children[c.deconfliction.indexOf(row)];
        const first = card && card.querySelector('.decon-wide input');
        if (first) { first.focus(); card.scrollIntoView({ block: 'nearest' }); }
      } }, 'Add Deconfliction');
      return h('section', { class: 'contacts deconfliction cv-boxed', 'aria-labelledby': 'decon-title' },
        h('h3', { id: 'decon-title', icon: 'shield-exclamation', title: 'Each deconfliction check for this case, and whether it showed a conflict.' }, 'Deconfliction'),
        rows,
        h('div', { class: 'contact-add' }, add));
    }

    /* v1.85: Case History: each status change and move, newest first. Cases from before v1.85 show
     * what their dates and closing history tell. */
    function historyOf(c) {
      const act = Array.isArray(c.activity) ? c.activity : [];
      // v1.89: "Opened as Open" was the day the case was put in CaseVault: it says so now. Your own
      // notes (a case migrated from before CaseVault, a transfer…) carry the day you give them.
      const rows = act.map((a, i) => {
        const m = /^Opened as (.+)$/.exec(a.what || '');
        return { at: a.day ? null : a.at, day: a.day || null, what: m ? `Added to CaseVault (${m[1]})` : a.what, note: !!a.note, index: i };
      });
      if (rows.length) {
        const added = act.find((a) => /^Opened as /.test(a.what || ''));
        const addedDay = added && added.at ? Vault.localDay(new Date(added.at)) : '';
        if (c.dates && c.dates.opened && c.dates.opened !== addedDay) rows.push({ day: c.dates.opened, what: 'Case opened (the Opened date on this tab)', derived: true });
      } else {
        if (c.dates && c.dates.opened) rows.push({ day: c.dates.opened, what: 'Opened' });
        for (const x of c.closureHistory || []) {
          const d = CVClosing.disposition(x.disposition);
          if (x.date || x.at) rows.push({ day: x.date, at: x.date ? null : x.at, what: `Closed: ${d ? d.label : x.disposition || ''}` });
          if (x.reopened) rows.push({ at: x.reopened, what: 'Reopened' });
        }
        if (c.closure) { const d = CVClosing.disposition(c.closure.disposition); rows.push({ day: c.closure.date, at: c.closure.date ? null : c.closure.at, what: `Closed: ${d ? d.label : ''}` }); }
        if (c.dates && c.dates.archived) rows.push({ day: c.dates.archived, what: `Archived${c.archiveReason ? `: ${c.archiveReason}` : ''}` });
      }
      const key = (r) => (r.at ? new Date(r.at).toISOString() : `${r.day}T12:00:00`);
      return rows.sort((a, b) => key(b).localeCompare(key(a)));
    }
    function caseHistorySection(c, save = null) {
      const list = h('ol', { class: 'history-list' });
      // v1.90: a note can be changed (its date and its words) with the pencil, or deleted with ×.
      const editRow = (r) => {
        const a = c.activity[r.index];
        const day = h('input', { type: 'date', value: a.day || today(), 'aria-label': 'Note date' });
        const text = h('input', { type: 'text', maxlength: 200, value: a.what || '', 'aria-label': 'Note' });
        const done = () => {
          const what = text.value.trim();
          if (!what) { text.focus(); return; }
          c.activity[r.index] = { ...a, day: day.value || a.day || today(), what, edited: new Date().toISOString() };
          save();
          draw();
        };
        text.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); draw(); } });
        const li = h('li', { class: 'history-note history-editing' },
          h('div', { class: 'history-add' }, field('Date', day), field('Note', text),
            h('span', { class: 'history-edit-actions' },
              h('button', { class: 'btn small', type: 'button', onclick: () => draw() }, 'Cancel'),
              h('button', { class: 'btn small primary', type: 'button', icon: 'check-circle-fill', onclick: done }, 'Save'))));
        setTimeout(() => text.focus(), 0);
        return li;
      };
      const draw = (editing = -1) => {
        const rows = historyOf(c);
        list.replaceChildren(...(rows.length ? rows.map((r) => (r.note && save && r.index === editing ? editRow(r) : h('li', { class: r.note ? 'history-note' : r.derived ? 'history-derived' : '' },
          h('span', { class: 'history-when' }, r.at ? fmtDateTime(Date.parse(r.at)) : r.day ? fmtDate(r.day) : ''),
          h('span', { class: 'history-what' }, r.note ? h('span', { class: 'history-tag' }, 'Note') : null, r.what),
          r.note && save ? h('span', { class: 'history-btns' },
            h('button', { class: 'icon-btn history-edit', type: 'button', title: 'Change this note', onclick: () => draw(r.index) }, I('pencil-fill'), h('span', { class: 'sr-only' }, 'Change note')),
            h('button', { class: 'icon-btn history-del', type: 'button', title: 'Delete this note', onclick: () => {
              c.activity.splice(r.index, 1);
              save();
              draw();
            } }, I('x-lg'), h('span', { class: 'sr-only' }, 'Delete note'))) : h('span')))) : [h('li', { class: 'muted small' }, 'Nothing yet.')]));
      };
      draw();
      // v1.89: add a note with its own date, e.g. "Case opened on paper; migrated to CaseVault".
      const day = h('input', { type: 'date', value: (c.dates && c.dates.opened) || today(), 'aria-label': 'Note date' });
      const text = h('input', { type: 'text', maxlength: 200, placeholder: 'e.g. Case opened before CaseVault', 'aria-label': 'Note' });
      const add = h('button', { class: 'btn small', type: 'button', icon: 'plus-lg', onclick: () => {
        const what = text.value.trim();
        if (!what) { text.focus(); return; }
        const d = day.value || today();
        c.activity = [...(Array.isArray(c.activity) ? c.activity : []), { day: d, what, note: true, added: new Date().toISOString() }];
        text.value = '';
        save();
        draw();
      } }, 'Add Note');
      text.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add.click(); } });
      return h('section', { class: 'contacts case-history cv-boxed', 'aria-labelledby': 'history-title' },
        h('h3', { id: 'history-title', icon: 'clock-history', title: 'Each change of status, closing, reopening, archiving and Mission move, newest first, and your own dated notes.' }, 'Case History'),
        list,
        save ? h('div', { class: 'history-add' }, field('Date', day), field('Note', text), add) : null);
    }

    return { suspectsSection, miniTimeline, caseTiles, partnersSection, contactsSection, deconflictionSection, historyOf, caseHistorySection };
  }

  root.CVCaseOverview = { init };
})(this);
