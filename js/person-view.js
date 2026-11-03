/* CaseVault — the person view (v1.119): every case and Mission a person appears in, as the subject,
 * a suspect (with their role) or an arrestee, and their timeline events. Names written another way
 * ("DOE, John", "Jon Doe") are matched too and shown as possibly the same person.
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const O = () => (isNode ? require('./operation.js') : root.CVOperation);
  const clean = (v) => String(v == null ? '' : v).trim();

  /** name; cases: full case objects (subject, suspects, people); timelines: { caseId: { events } }.
   * -> { rows: [{ c, roles, match: 'same'|'similar', names, events }], variants: [names written
   * another way] }, exact matches first, then by case number. */
  function appearances(name, cases, timelines = {}) {
    const Op = O();
    const want = Op.normName(name);
    const rows = [];
    const variants = new Map();
    for (const c of cases || []) {
      if (!c) continue;
      const roles = []; const names = []; let match = '';
      const see = (who, role) => {
        const m = Op.nameMatch(name, who);
        if (!m) return;
        if (!roles.includes(role)) roles.push(role);
        names.push(clean(who));
        match = match === 'same' || m === 'same' ? 'same' : 'similar';
        if (Op.normName(who) !== want) variants.set(Op.normName(who), clean(who));
      };
      see(c.subject, 'Subject');
      for (const sx of c.suspects || []) if (sx && !sx.notIdentified && clean(sx.name)) see(sx.name, sx.role || 'Suspect');
      for (const p of c.people || []) see(p, 'Arrestee');
      const events = (((timelines[c.id] || {}).events) || []).filter((ev) => ev && Op.nameMatch(name, ev.suspect));
      if (!match && events.length) { match = events.some((ev) => Op.nameMatch(name, ev.suspect) === 'same') ? 'same' : 'similar'; roles.push('On the timeline'); }
      if (match) rows.push({ c, roles, match, names: [...new Set(names)], events });
    }
    rows.sort((a, b) => (a.match === b.match ? 0 : a.match === 'same' ? -1 : 1) || String(a.c.number || '').localeCompare(String(b.c.number || '')));
    return { rows, variants: [...variants.values()] };
  }

  /* v1.175: the kinds of arrest: narcotics, battery, firearms, from a charge's statute (Illinois
   * citations: 720 ILCS 570 controlled substances, 550 cannabis, 646 meth, 600 paraphernalia;
   * 720 ILCS 5/12-3 battery; 720 ILCS 5/24 weapons, 430 ILCS 65 FOID, 66 concealed carry) or its words. */
  const KINDS = [
    ['narcotics', 'Narcotics', 'drug-powder', /\b720\s*ILCS\s*(570|550|646|600)\b|\b(narcotic|controlled substance|cocaine|crack|heroin|fentanyl|cannabis|marijuana|meth(amphetamine)?|mdma|ecstasy|pcp|lsd|oxycodone|opiate|opioid|drug|paraphernalia|possession with intent|PWID|PCS|MFG\/DEL)\b/i],
    ['battery', 'Battery', 'bandaid-fill', /\b720\s*ILCS\s*5\/12-3(\.\d+)?\b|\bbattery\b|\b(dom(estic)?\.? ?batt|agg(ravated)?\.? ?batt)/i],
    ['firearms', 'Firearms', 'pistol', /\b720\s*ILCS\s*5\/24(-|\b)|\b430\s*ILCS\s*(65|66)\b|\b(firearm|gun|handgun|pistol|revolver|rifle|shotgun|weapon|ammunition|ammo|UUW|AUUW|FOID|armed habitual|discharge)\b/i],
  ];
  /** The kinds a charge (or any text) is about. -> ['narcotics', 'battery', 'firearms'] in that order. */
  function chargeKinds(...texts) {
    const t = texts.flat().map((x) => (x && typeof x === 'object' ? [x.statute, x.description].join(' ') : clean(x))).join(' \n ');
    return KINDS.filter(([, , , re]) => re.test(t)).map(([k]) => k);
  }
  const kindInfo = (k) => { const x = KINDS.find((y) => y[0] === k); return x ? { key: x[0], label: x[1], icon: x[2] } : null; };

  /** v1.175: the arrests of a person on every case: arrest.json's arrestees with the name.
   * arrests: { caseId: arrest.json }. -> [{ c, a, name, date, time, location, charges, kinds, match }] by date. */
  function arrestsOf(name, cases, arrests = {}) {
    const Op = O();
    const out = [];
    for (const c of cases || []) {
      for (const a of ((arrests[c.id] || {}).arrestees) || []) {
        const who = [a.firstName, a.middleName, a.lastName].map(clean).filter(Boolean).join(' ');
        const m = who && Op.nameMatch(name, who);
        if (!m) continue;
        const charges = (a.charges || []).filter((x) => clean(x.statute) || clean(x.description));
        const narcotics = (a.narcotics || []).filter((x) => clean(x.drug));
        out.push({ c, a, name: who, date: clean(a.date), time: clean(a.time), location: clean(a.location), charges, match: m,
          kinds: [...new Set([...chargeKinds(charges), ...(narcotics.length ? ['narcotics'] : []), ...(clean(a.armedWith) && /gun|firearm|pistol|revolver|rifle|shotgun|weapon/i.test(a.armedWith) ? ['firearms'] : [])])].sort((x, y) => KINDS.findIndex((k) => k[0] === x) - KINDS.findIndex((k) => k[0] === y)) });
      }
    }
    return out.sort((x, y) => `${x.date}${x.time}`.localeCompare(`${y.date}${y.time}`));
  }

  /** v1.175: the person's police interactions on one timeline: their arrests (from the Arrest tab)
   * and every Timeline event that names them, oldest first. An arrest also on the Timeline (same
   * case and day) is shown once. -> [{ date, time, kind, title, detail, c, kinds }] */
  function interactions(rows, arrests) {
    const out = arrests.map((x) => ({ date: x.date, time: x.time, kind: 'arrest', title: 'Arrested', detail: x.charges.map((ch) => clean(ch.description) || clean(ch.statute)).filter(Boolean).join('; ') || x.location, c: x.c, kinds: x.kinds }));
    for (const r of rows) {
      for (const ev of r.events) {
        if (ev.kind === 'arrest' && out.some((o) => o.kind === 'arrest' && o.c.id === r.c.id && o.date === clean(ev.date))) continue;
        out.push({ date: clean(ev.date), time: clean(ev.time), kind: ev.kind || 'event', title: clean(ev.title) || 'Event', detail: ev.kind === 'buy' ? O().buyLine(ev) : clean(ev.note).slice(0, 160), c: r.c, kinds: chargeKinds(ev.kind === 'buy' ? 'narcotic' : '', ev.title, ev.note) });
      }
    }
    return out.sort((x, y) => `${x.date}${x.time}`.localeCompare(`${y.date}${y.time}`));
  }

  /** v1.175: what is known of the person: date of birth, gender, IR and CB numbers, from the
   * suspects and arrestees with the same name (the first one that has each). */
  function profileOf(name, cases, arrests = {}) {
    const Op = O();
    const p = { dob: '', gender: '', ir: '', cb: '', race: '' };
    const take = (k, v) => { if (!p[k] && clean(v) && clean(v) !== 'DNA') p[k] = clean(v); };
    for (const c of cases || []) {
      for (const sx of c.suspects || []) {
        if (!sx || sx.notIdentified || Op.nameMatch(name, sx.name) !== 'same') continue;
        const i = sx.info || {};
        take('dob', sx.dob); take('gender', i.gender); take('ir', i.irNumber); take('race', i.race);
      }
      for (const a of ((arrests[c.id] || {}).arrestees) || []) {
        if (Op.nameMatch(name, [a.firstName, a.middleName, a.lastName].map(clean).filter(Boolean).join(' ')) !== 'same') continue;
        take('dob', a.dob); take('gender', a.sex); take('ir', a.irNumber); take('cb', a.bookingNumber); take('race', a.race);
      }
    }
    return p;
  }

  /** v1.175: Suspect Search: every person on the SSD (subjects, suspects, arrestees, closed cases
   * included), one per name, with their details, case numbers and kinds of arrest. */
  function everyone(cases, arrests = {}) {
    const Op = O();
    const map = new Map();
    const add = (name, c, d = {}) => {
      const n = clean(name);
      if (!n || /^unknown/i.test(n)) return;
      const k = Op.normName(n);
      const cur = map.get(k) || { name: n, dob: '', gender: '', ir: '', numbers: [], cases: [], kinds: [], arrests: 0 };
      for (const f of ['dob', 'gender', 'ir']) if (!cur[f] && clean(d[f]) && clean(d[f]) !== 'DNA') cur[f] = clean(d[f]);
      if (c.number && !cur.numbers.includes(c.number)) cur.numbers.push(c.number);
      if (c.id && !cur.cases.some((x) => x.id === c.id)) cur.cases.push({ id: c.id, number: c.number || '' }); // v1.187: the Cases list opens them
      for (const x of d.kinds || []) if (!cur.kinds.includes(x)) cur.kinds.push(x);
      if (d.arrest) cur.arrests++;
      map.set(k, cur);
    };
    for (const c of cases || []) {
      for (const sx of c.suspects || []) if (sx && !sx.notIdentified) add(sx.name, c, { dob: sx.dob, gender: (sx.info || {}).gender, ir: (sx.info || {}).irNumber });
      for (const a of ((arrests[c.id] || {}).arrestees) || []) {
        const charges = (a.charges || []).filter((x) => clean(x.statute) || clean(x.description));
        add([a.firstName, a.middleName, a.lastName].map(clean).filter(Boolean).join(' '), c, { dob: a.dob, gender: a.sex, ir: a.irNumber, arrest: charges.length || clean(a.date), kinds: [...chargeKinds(charges), ...((a.narcotics || []).some((x) => clean(x.drug)) ? ['narcotics'] : [])] });
      }
      add(c.subject, c, {});
    }
    const order = (k) => KINDS.findIndex((x) => x[0] === k);
    return mergeSamePeople([...map.values()]).map((x) => ({ ...x, kinds: x.kinds.sort((a, b) => order(a) - order(b)) })).sort((a, b) => a.name.localeCompare(b.name));
  }

  /* v1.187: one row per person. The same person is often written two ways across a Mission's case
   * numbers: with and without a middle name or initial, an alias or Jr ("John Doe" on the suspects,
   * "John Allen Doe" on the arrest report). Two names are merged when every word of the shorter is
   * in the longer (an initial matches the word it starts) and nothing tells them apart: no date of
   * birth or IR number that differs, and the same date of birth, the same IR number or a case
   * number in common. */
  const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);
  const nameWords = (n) => O().normName(n).split(' ').filter((w) => w && !SUFFIXES.has(w));
  function wordsFit(a, b) {
    const wa = nameWords(a); const wb = nameWords(b);
    const [few, many] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
    if (few.length < 2) return false;
    const left = many.slice();
    return few.every((w) => {
      const i = left.findIndex((m) => m === w || (w.length === 1 && m[0] === w) || (m.length === 1 && w[0] === m));
      if (i < 0) return false;
      left.splice(i, 1);
      return true;
    });
  }
  function samePerson(x, y) {
    if (!wordsFit(x.name, y.name)) return false;
    if (x.dob && y.dob && x.dob !== y.dob) return false;
    if (x.ir && y.ir && x.ir !== y.ir) return false;
    return (x.dob && x.dob === y.dob) || (x.ir && x.ir === y.ir) || x.numbers.some((n) => y.numbers.includes(n));
  }
  function mergeSamePeople(list) {
    const out = [];
    // The fullest names first, so each row is shown with its longest name.
    for (const p of list.slice().sort((a, b) => nameWords(b.name).length - nameWords(a.name).length || b.name.length - a.name.length)) {
      const into = out.find((q) => samePerson(q, p));
      if (!into) { out.push({ ...p, numbers: p.numbers.slice(), cases: (p.cases || []).slice(), kinds: p.kinds.slice() }); continue; }
      for (const x of p.cases || []) if (!into.cases.some((y) => y.id === x.id)) into.cases.push(x);
      for (const f of ['dob', 'gender', 'ir']) if (!into[f] && p[f]) into[f] = p[f];
      for (const n of p.numbers) if (!into.numbers.includes(n)) into.numbers.push(n);
      for (const k of p.kinds) if (!into.kinds.includes(k)) into.kinds.push(k);
      into.arrests += p.arrests;
    }
    return out;
  }

  /** Every case, its timeline and its arrest details (browser only). */
  async function loadAll() {
    const cases = [];
    for (const e of (Vault.data.cases || []).slice()) { try { cases.push({ ...(await Vault.getCase(e.id)), status: e.status, archivedEntry: Vault.isArchived(e.id) }); } catch { /* moved or unreadable: skipped */ } }
    const timelines = {}; const arrests = {};
    await Promise.all(cases.map(async (c) => {
      try { timelines[c.id] = await Vault.getTimeline(c.id); } catch { /* none */ }
      try { arrests[c.id] = await Vault.readCaseJSON(c.id, 'arrest.json'); } catch { /* none */ }
    }));
    return { cases, timelines, arrests };
  }

  /** v1.175: the kinds of arrest as colour icons with their names. */
  function kindBadges(h, icon, kinds, { small = false } = {}) {
    return h('span', { class: `kind-badges${small ? ' small' : ''}` }, ...kinds.map(kindInfo).filter(Boolean).map((k) => h('span', { class: `kind-badge kind-${k.key}`, title: small ? k.label : null }, icon(k.icon), small ? h('span', { class: 'sr-only' }, k.label) : h('span', {}, k.label))));
  }

  /** Opens the person view (browser only). v1.175: a suspect profile: what is known of them, the
   * kinds of arrest, every case, their arrest reports and their police interactions in time order,
   * in a window wide enough to show it all. */
  async function open(name, ui, loaded = null) {
    const { h, openDialog, fmtDate, toast } = ui;
    const I = ui.icon;
    const who = clean(name);
    if (!who) return;
    const { cases, timelines, arrests } = loaded || await loadAll();
    const { rows, variants } = appearances(who, cases, timelines);
    const arr = arrestsOf(who, cases, arrests);
    for (const x of arr) if (!rows.some((r) => r.c.id === x.c.id)) rows.push({ c: x.c, roles: ['Arrestee'], match: x.match, names: [x.name], events: [] });
    const ops = new Map((Vault.data.operations || []).map((o) => [o.id, o]));
    const missions = [...new Set(rows.map((r) => r.c.operationId).filter(Boolean))].map((id) => ops.get(id)).filter(Boolean);
    if (!rows.length) { toast(`${who} isn't on any case.`, 'info'); return; }
    const prof = profileOf(who, cases, arrests);
    const kinds = [...new Set(arr.flatMap((x) => x.kinds))].sort((a, b) => KINDS.findIndex((k) => k[0] === a) - KINDS.findIndex((k) => k[0] === b));
    const life = interactions(rows, arr);
    // The arrest reports already made (PDFs named "… Arrest Report") in each case's Files.
    const pdfs = {};
    await Promise.all([...new Set(arr.map((x) => x.c.id))].map(async (id) => { try { pdfs[id] = (await Vault.listFiles(id)).filter((f) => /arrest report/i.test(f.name) && /\.pdf$/i.test(f.name)); } catch { pdfs[id] = []; } }));
    const caseLink = (c, done, tab = '') => h('a', { href: `#/case/${CVRoute.enc(c.id)}${tab ? `/${tab}` : ''}`, class: 'nowrap', onclick: () => done() }, c.number || 'No case number');
    const age = prof.dob && root.CVReportFields && root.CVReportFields.ageOn ? root.CVReportFields.ageOn(prof.dob, Vault.localDay()) : '';
    const facts = [['DOB', prof.dob ? `${fmtDate(prof.dob)}${age !== '' && age != null ? ` (${age})` : ''}` : ''], ['Gender', prof.gender], ['Race', prof.race], ['IR', prof.ir], ['CB', prof.cb]].filter(([, v]) => v);
    const KIND_ICON = { buy: 'cash-coin', arrest: 'person-exclamation', court: 'bank2', deadline: 'hourglass-split', surveillance: 'eye', event: 'calendar-event' };
    await openDialog((done) => h('div', { class: 'person-view' },
      h('div', { class: 'pv-head' },
        h('h2', { icon: 'person-lines-fill' }, who),
        kinds.length ? kindBadges(h, I, kinds) : null),
      facts.length ? h('div', { class: 'pv-facts' }, ...facts.map(([k, v]) => h('span', { class: 'pv-fact' }, h('span', { class: 'pv-fact-k' }, k), h('strong', {}, v)))) : null,
      h('p', { class: 'muted small' }, `${rows.length} case${rows.length === 1 ? '' : 's'}${missions.length ? ` in ${missions.length} Mission${missions.length === 1 ? '' : 's'}` : ''} · ${arr.length} arrest${arr.length === 1 ? '' : 's'} · ${life.length} police interaction${life.length === 1 ? '' : 's'}`),
      variants.length ? h('p', { class: 'person-variants' }, h('strong', {}, 'Possibly the same person: '), variants.join(', '), h('span', { class: 'muted small' }, '. Written another way on some cases; check before you treat them as one.')) : null,
      h('section', { class: 'pv-section' }, h('h3', {}, 'Cases'),
        h('table', { class: 'data-table person-table' },
          h('thead', {}, h('tr', {}, ...['Case Number', 'Mission', 'Status', 'Role', 'Written As', 'Arrests'].map((t) => h('th', {}, t)))),
          h('tbody', {}, ...rows.map((r) => {
            const op = ops.get(r.c.operationId);
            const k = [...new Set(arr.filter((x) => x.c.id === r.c.id).flatMap((x) => x.kinds))];
            return h('tr', { class: r.match === 'similar' ? 'similar-row' : '' },
              h('td', {}, caseLink(r.c, done)),
              h('td', {}, op ? h('a', { href: `#/operation/${encodeURIComponent(op.id)}`, onclick: () => done() }, op.number || op.name) : h('span', { class: 'muted' }, 'General Files')),
              h('td', { class: 'nowrap' }, r.c.archivedEntry ? 'Archived' : r.c.status || 'Open'),
              h('td', {}, r.roles.join(', ')),
              h('td', {}, r.names.join(', ') || '—'),
              h('td', {}, k.length ? kindBadges(h, I, k, { small: true }) : h('span', { class: 'muted' }, '—')));
          })))),
      arr.length ? h('section', { class: 'pv-section pv-arrests' }, h('h3', {}, 'Arrest Reports'),
        h('table', { class: 'data-table person-table' },
          h('thead', {}, h('tr', {}, ...['Date', 'Case Number', 'Charges', 'Location', 'Report'].map((t) => h('th', {}, t)))),
          h('tbody', {}, ...arr.map((x) => h('tr', {},
            h('td', { class: 'nowrap' }, x.date ? fmtDate(x.date) : '—', x.time ? h('span', { class: 'muted small block' }, x.time) : null),
            h('td', {}, caseLink(x.c, done)),
            h('td', {}, x.charges.length ? h('ul', { class: 'pv-charges' }, ...x.charges.map((ch) => h('li', {}, kindBadges(h, I, chargeKinds(ch), { small: true }), h('span', {}, [clean(ch.statute), clean(ch.description)].filter(Boolean).join(' — '))))) : h('span', { class: 'muted' }, 'No charges entered')),
            h('td', {}, x.location || '—'),
            h('td', {}, h('div', { class: 'pv-report' },
              h('a', { class: 'btn small', href: `#/case/${CVRoute.enc(x.c.id)}/arrest`, onclick: () => done() }, 'Arrest Tab'),
              ...(pdfs[x.c.id] || []).map((f) => h('button', { type: 'button', class: 'btn small', icon: 'file-earmark-pdf', onclick: () => { done(); ui.previewFile(x.c, f.name); } }, f.base || 'Arrest Report'))))))))) : null,
      life.length ? h('section', { class: 'pv-section person-events' }, h('h3', {}, 'Police Interactions'),
        h('ol', { class: 'person-event-list' }, ...life.map((ev) => h('li', { class: `pv-ev pv-ev-${ev.kind}` },
          h('span', { class: 'pv-ev-date' }, h('span', { class: 'nowrap' }, ev.date ? fmtDate(ev.date) : 'No date'), ev.time ? h('span', { class: 'muted small' }, ev.time) : null),
          h('span', { class: 'pv-ev-kind' }, I(KIND_ICON[ev.kind] || 'calendar-event'), h('span', {}, ev.kind === 'arrest' ? 'Arrest' : ev.kind === 'buy' ? 'Buy' : ev.kind === 'court' ? 'Court' : ev.kind === 'deadline' ? 'Deadline' : 'Event')),
          h('span', { class: 'pv-ev-text' }, h('strong', {}, ev.title), ev.detail ? h('span', { class: 'muted small' }, ev.detail) : null),
          ev.kinds.length ? kindBadges(h, I, ev.kinds, { small: true }) : h('span', {}),
          caseLink(ev.c, done, 'timeline'))))) : null,
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => done() }, 'Done'))));
  }

  /** v1.175: Suspect Search: everyone on the SSD (closed cases too), found by name, date of birth
   * or IR number, with the kinds of arrest; picking one opens their profile. */
  async function search(ui, q = '') {
    const { h, openDialog } = ui;
    const I = ui.icon;
    const loaded = await loadAll();
    const people = everyone(loaded.cases, loaded.arrests);
    const pick = await openDialog((done) => {
      const box = h('input', { type: 'search', autofocus: true, value: q, placeholder: 'Name, date of birth or IR number', 'aria-label': 'Search suspects', autocomplete: 'off' });
      const body = h('tbody', {});
      const count = h('p', { class: 'muted small', role: 'status' });
      const draw = () => {
        const words = clean(box.value).toLowerCase().split(/[\s,]+/).filter(Boolean);
        const hits = people.filter((x) => { const hay = [x.name, x.dob, x.ir, x.gender, ...x.numbers].join(' ').toLowerCase(); return words.every((w) => hay.includes(w)); }).slice(0, 200);
        count.textContent = `${hits.length}${hits.length === 200 ? '+' : ''} of ${people.length} people`;
        // v1.187: one line per person; the linked cases are a list that opens the case chosen.
        const casesList = (x) => {
          const list = (x.cases || []).slice().sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true }));
          if (!list.length) return '—';
          const sel = h('select', { class: 'ss-cases', 'aria-label': `Cases of ${x.name}`, title: 'Open one of their cases',
            onclick: (e) => e.stopPropagation(), onkeydown: (e) => e.stopPropagation() },
          h('option', { value: '', selected: true }, `${list.length} Case${list.length === 1 ? '' : 's'}`),
          ...list.map((y) => h('option', { value: y.id }, y.number || 'No case number')));
          sel.addEventListener('change', () => { if (sel.value) done({ caseId: sel.value }); });
          return sel;
        };
        body.replaceChildren(...(hits.length ? hits.map((x) => h('tr', { class: 'ss-row', tabindex: 0, title: `Open ${x.name}'s page`, onclick: () => done(x.name), onkeydown: (e) => { if (e.key === 'Enter') done(x.name); } },
          h('td', { class: 'ss-name' }, h('strong', {}, x.name)), h('td', {}, x.dob ? ui.fmtDate(x.dob) : '—'), h('td', {}, x.gender || '—'), h('td', { class: 'mono' }, x.ir || '—'),
          h('td', { class: 'ss-arrests' }, x.arrests ? String(x.arrests) : '—'), h('td', {}, casesList(x)))) : [h('tr', {}, h('td', { colspan: 6, class: 'muted empty-cell' }, 'No one matches.'))]));
      };
      box.addEventListener('input', draw);
      box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const first = body.querySelector('.ss-row'); if (first) { e.preventDefault(); first.click(); } } });
      draw();
      return h('div', { class: 'suspect-search' },
        h('h2', { icon: 'person-lines-fill' }, 'Suspect Search'),
        h('p', { class: 'muted small' }, 'Everyone on your cases, closed ones too: suspects, arrestees and subjects. Pick one to see their arrest reports and police interactions.'),
        box, count,
        h('div', { class: 'ss-scroll' }, h('table', { class: 'data-table ss-table' },
          h('thead', {}, h('tr', {}, ...['Name', 'DOB', 'Gender', 'IR #', 'Arrests', 'Cases'].map((t) => h('th', {}, t)))), body)),
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => done(null) }, 'Close')));
    });
    if (pick && pick.caseId) { ui.go(pick.caseId, 'details'); return; }
    if (pick) await open(pick, ui, loaded);
  }

  /** v1.153: when a suspect is added: the other cases with the same person (the same name, and the
   * same date of birth when both have one). person: { name, dob }; cases: full case objects; self:
   * the case being edited (it and the cases of its Mission are left out, they share suspects).
   * -> [{ c, name, dob, sameDob }] */
  function duplicates(person, cases, self = {}, { sameMission = false } = {}) {
    const Op = O();
    const name = clean(person && person.name);
    if (!name || Op.normName(name).length < 3) return [];
    const dob = clean(person.dob);
    const out = [];
    for (const c of cases || []) {
      // v1.171 sameMission: the cases of this case's Mission too (to update the person there).
      if (!c || c.id === self.id || (!sameMission && self.operationId && c.operationId === self.operationId)) continue;
      const hit = [...(c.suspects || []).filter((sx) => sx && !sx.notIdentified).map((sx) => ({ name: sx.name, dob: sx.dob, suspect: sx })), { name: c.subject, dob: '' }]
        .find((x) => clean(x.name) && Op.nameMatch(name, x.name) === 'same' && !(dob && clean(x.dob) && clean(x.dob) !== dob));
      // v1.168: the suspect's record too (to fill in the same person on this case), and how much it holds.
      if (hit) out.push({ c, name: clean(hit.name), dob: clean(hit.dob), sameDob: !!(dob && clean(hit.dob) === dob), ...(hit.suspect ? { suspect: hit.suspect, filled: filledCount(hit.suspect) } : {}) });
    }
    // The same date of birth first, then a case in a Mission (a group case), then the fullest record.
    return out.sort((a, b) => Number(b.sameDob) - Number(a.sameDob) || Number(!!b.c.operationId) - Number(!!a.c.operationId)
      || (b.filled || 0) - (a.filled || 0) || String(a.c.number || '').localeCompare(String(b.c.number || '')));
  }

  /** v1.168: how many details a suspect's record has (date of birth, residence, description). */
  function filledCount(sx) {
    return ['dob', 'residence'].filter((k) => clean(sx[k])).length + Object.values((sx && sx.info) || {}).filter((v) => clean(v)).length;
  }

  /**
   * v1.168: fills in a suspect from the same person's record on another case: only the empty boxes
   * (date of birth, residence, the description and record numbers); what is already typed stays.
   * -> the number of boxes filled.
   */
  function fillFrom(target, source) {
    let n = 0;
    for (const k of ['dob', 'residence']) if (!clean(target[k]) && clean(source[k])) { target[k] = clean(source[k]); n++; }
    if (!target.info || typeof target.info !== 'object') target.info = {};
    for (const [k, v] of Object.entries(source.info || {})) if (!clean(target.info[k]) && clean(v)) { target.info[k] = clean(v); n++; }
    return n;
  }

  // The cases read for duplicates(), kept while each case's "updated" stays the same.
  const caseMemo = new Map();
  async function allCases() {
    const entries = (Vault.data.cases || []).slice();
    const out = [];
    for (let i = 0; i < entries.length; i += 8) {
      await Promise.all(entries.slice(i, i + 8).map(async (e) => {
        const m = caseMemo.get(e.id);
        if (m && m.updated === (e.updated || '')) { out.push(m.c); return; }
        try { const c = await Vault.getCase(e.id); caseMemo.set(e.id, { updated: e.updated || '', c }); out.push(c); } catch { /* moved or unreadable */ }
      }));
    }
    return out;
  }
  /** Browser: duplicates() over every case on the SSD. */
  async function findDuplicates(person, self, opts) { return duplicates(person, await allCases(), self, opts); }

  /* v1.171: one record per person. The details of a suspect that differ from the same person's on
   * another case: [{ key, label, from (theirs), to (this case's) }], only where this case has one. */
  const PERSON_FIELDS = [['dob', 'Date of birth'], ['residence', 'Residence']];
  function personDiff(mine, theirs) {
    const out = [];
    for (const [k, label] of PERSON_FIELDS) if (clean(mine[k]) && clean(mine[k]) !== clean(theirs[k])) out.push({ key: k, label, from: clean(theirs[k]), to: clean(mine[k]) });
    for (const [k, v] of Object.entries(mine.info || {})) {
      if (clean(v) && clean(v) !== clean((theirs.info || {})[k])) out.push({ key: `info.${k}`, label: k.replace(/([A-Z])/g, ' $1').replace(/^./, (x) => x.toUpperCase()), from: clean((theirs.info || {})[k]), to: clean(v) });
    }
    return out;
  }
  /** v1.171: puts this case's details of the person on the other case's record (what this case has). -> fields changed */
  function updateFrom(target, source) {
    const diff = personDiff(source, target);
    if (!target.info || typeof target.info !== 'object') target.info = {};
    for (const d of diff) { if (d.key.startsWith('info.')) target.info[d.key.slice(5)] = d.to; else target[d.key] = d.to; }
    return diff.length;
  }

  /** v1.168: the identified suspects on the other cases (names for the Name box's suggestions),
   * those on a Mission's cases first. self: the case being edited. -> [{ name, dob, number }] */
  async function knownSuspects(self = {}) {
    const entries = new Map((Vault.data.cases || []).map((e) => [e.id, e]));
    return suspectsOf((await allCases()).map((c) => ({ ...c, status: (entries.get(c.id) || {}).status || c.status, archived: Vault.isArchived(c.id) })), self);
  }
  /** v1.174: a case that is closed (or archived): its suspects are not suggested any more. */
  const isClosedCase = (c) => !!(c && (c.archived || /^(closed|archived)$/i.test(String(c.status || ''))));
  /** v1.168, v1.174: the identified suspects of the open cases other than self, a Mission's first,
   * one per name, with what the New Case search shows (date of birth, gender, IR number). */
  function suspectsOf(cases, self = {}) {
    const seen = new Map();
    const list = (cases || []).filter((c) => c && c.id !== self.id && !isClosedCase(c)).sort((a, b) => Number(!!b.operationId) - Number(!!a.operationId));
    for (const c of list) for (const sx of c.suspects || []) {
      const name = sx && !sx.notIdentified ? clean(sx.name) : '';
      if (!name) continue;
      const k = name.toLowerCase();
      const cur = seen.get(k);
      const info = (sx && sx.info) || {};
      if (!cur) { seen.set(k, { name, dob: clean(sx.dob), gender: clean(info.gender), ir: clean(info.irNumber), number: c.number || '', numbers: [c.number || ''].filter(Boolean), suspect: sx }); continue; }
      // The same name on another case: fill in what the first record lacks.
      if (!cur.dob) cur.dob = clean(sx.dob);
      if (!cur.gender) cur.gender = clean(info.gender);
      if (!cur.ir) cur.ir = clean(info.irNumber);
      if (c.number && !cur.numbers.includes(c.number)) cur.numbers.push(c.number);
      if (filledCount(sx) > filledCount(cur.suspect)) cur.suspect = sx;
    }
    return [...seen.values()];
  }
  /** v1.174: the known suspects whose name, date of birth or IR number has the words typed. */
  function searchSuspects(list, q) {
    const words = clean(q).toLowerCase().split(/[\s,]+/).filter(Boolean);
    if (!words.length) return [];
    return (list || []).filter((x) => { const hay = [x.name, x.dob, x.ir, x.gender].join(' ').toLowerCase(); return words.every((w) => hay.includes(w)); });
  }

  const api = { wordsFit, mergeSamePeople, appearances, chargeKinds, arrestsOf, interactions, profileOf, everyone, search, duplicates, findDuplicates, fillFrom, filledCount, knownSuspects, suspectsOf, searchSuspects, isClosedCase, personDiff, updateFrom, open };
  if (isNode) module.exports = api;
  else root.CVPersonView = api;
})(this);
