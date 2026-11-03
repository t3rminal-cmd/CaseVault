/* CaseVault — Case Health (v1.172): what is still open on a case, and the gaps a defense attorney
 * would find, in one list.
 *
 *   custodyGaps(exhibit)         holes in an exhibit's chain of custody
 *   arrestIssues({ arrest, ... }) the Arrest tab against the suspects, the Timeline and the evidence
 *   caseHealth({ ... })          everything open on a case: [{ area, severity, text, tab }]
 *   evidenceTable / buysTable    {{evidence}} and {{buys}} for templates
 *   aliasLines(suspects)         the suspects' monikers as Known Aliases lines for the checker
 *
 * Plain logic, no DOM: the tests run it under Node.
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const Custody = () => (isNode ? require('./custody.js') : root.CVCustody);
  const Op = () => (isNode ? require('./operation.js') : root.CVOperation);
  const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const RANK = { High: 0, Medium: 1, Low: 2 };
  const exhibitName = (e) => `Exhibit ${clean(e.number) || '?'}${clean(e.inventory) ? ` (Inventory #${clean(e.inventory)})` : ''}`;
  const when = (x) => [x.date, x.time].filter(Boolean).join(' ') || 'an undated entry';

  /**
   * Holes in one exhibit's chain of custody, in date order:
   *  checked out and never returned (High), taken to court while still checked out (High),
   *  anything after it was destroyed or released (High), sent to the lab with no return,
   *  a return with no checkout before it, a log that doesn't start with Received / Seized,
   *  entries with no date, narcotics never sent to the lab. -> [{ severity, text }]
   */
  function custodyGaps(exhibit) {
    const e = exhibit || {};
    const list = Custody().normalize(e.custody);
    const out = [];
    const add = (severity, text) => out.push({ severity, text: `${exhibitName(e)}: ${text}` });
    if (!list.length) {
      if (clean(e.inventory) || clean(e.description) || clean(e.drug)) add('Medium', 'no chain of custody entries yet.');
      return out;
    }
    if (!['Received / Seized', 'Placed in Evidence'].includes(list[0].action)) add('Low', `the log starts with "${list[0].action}" (${when(list[0])}), not Received / Seized.`);
    const undated = list.filter((x) => !x.date).length;
    if (undated) add('Low', `${undated} entr${undated === 1 ? 'y has' : 'ies have'} no date.`);
    let out1 = null; let lab = null; let court = null; let gone = null;
    for (const x of list) {
      if (gone) { add('High', `"${x.action}" on ${when(x)} comes after it was ${gone.action.toLowerCase()} on ${when(gone)}.`); continue; }
      switch (x.action) {
        case 'Checked Out':
          if (out1) add('Medium', `checked out again on ${when(x)} before it was returned (out since ${when(out1)}).`);
          out1 = x; break;
        case 'Returned':
          if (!out1) add('Medium', `returned on ${when(x)} with no checkout before it.`);
          out1 = null; break;
        case 'Sent to Lab': lab = x; break;
        case 'Returned from Lab':
          if (!lab) add('Medium', `returned from the lab on ${when(x)} but never sent there.`);
          lab = null; break;
        case 'Taken to Court':
          if (out1) add('High', `taken to court on ${when(x)} while still checked out (since ${when(out1)}).`);
          court = x; break;
        case 'Returned from Court':
          if (!court) add('Medium', `returned from court on ${when(x)} but never taken there.`);
          court = null; break;
        case 'Destroyed': case 'Released to Owner': gone = x; break;
        default: break;
      }
    }
    if (gone) return out; // destroyed or released: nothing is still out
    if (out1) add('High', `checked out on ${when(out1)}${clean(out1.to) ? ` to ${clean(out1.to)}` : ''} and never returned.`);
    if (lab) add('Medium', `sent to the lab on ${when(lab)}; no return from the lab yet.`);
    if (court) add('Medium', `taken to court on ${when(court)}; no return from court yet.`);
    if (/narcotic/i.test(clean(e.type)) && !list.some((x) => x.action === 'Sent to Lab') && !gone) add('Low', 'narcotics never sent to the lab.');
    return out;
  }

  /* The drugs a text names, street and lab words as one ("crack" is cocaine). */
  const DRUGS = [
    ['cocaine', /\b(?:cocaine|crack|coke)\b/i], ['heroin', /\bheroin\b/i], ['fentanyl', /\b(?:fentanyl|fentanil|carfentanil)\b/i],
    ['methamphetamine', /\b(?:meth(?:amphetamine)?|crystal\s+meth)\b/i], ['cannabis', /\b(?:cannabis|marijuana|marihuana|weed|thc)\b/i],
    ['mdma', /\b(?:mdma|ecstasy|molly)\b/i], ['oxycodone', /\b(?:oxycodone|oxycontin|percocet)\b/i], ['pcp', /\b(?:pcp|phencyclidine)\b/i],
  ];
  // v1.183: plus the drug slang in Terminology marked "same as a drug" (js/terms.js; in the browser).
  const termDrugs = () => (root.CVTerms && root.CVTerms.drugWordsNow ? root.CVTerms.drugWordsNow() : []);
  const drugsIn = (text) => new Set([...DRUGS, ...termDrugs()].filter(([, re]) => re.test(String(text || ''))).map(([n]) => n));
  const arresteeName = (a) => [a.firstName, a.middleName, a.lastName].map(clean).filter(Boolean).join(' ');

  /**
   * The Arrest tab against the rest of the case: each arrestee against the suspects (name, date
   * of birth), the arrest date against the Timeline's own arrest events, the charges against the
   * drugs bought or recovered, and the recovered narcotics' inventory numbers against the evidence list.
   * -> [{ severity, text }]
   */
  function arrestIssues({ arrest, caseObj = {}, timeline = { events: [] }, evidence = [], today = '' } = {}) {
    const out = [];
    const people = ((arrest && arrest.arrestees) || []).filter((a) => arresteeName(a));
    const suspects = (caseObj.suspects || []).filter((s) => s && !s.notIdentified && clean(s.name));
    const O = Op();
    const events = (timeline && timeline.events) || [];
    const buys = events.filter((e) => e.kind === 'buy');
    const listed = new Set((evidence || []).map((x) => clean(x.inventory).replace(/\D/g, '')).filter(Boolean));
    for (const a of people) {
      const name = arresteeName(a);
      const s = suspects.find((x) => O.nameMatch(name, x.name) === 'same');
      if (!s && suspects.length) out.push({ severity: 'Medium', text: `Arrestee ${name} is not one of this case's suspects (${suspects.map((x) => clean(x.name)).join(', ')}). Check the spelling, or add the suspect.` });
      if (s && clean(s.dob) && clean(a.dob) && clean(s.dob) !== clean(a.dob)) out.push({ severity: 'High', text: `${name}'s date of birth is ${clean(a.dob)} on the Arrest tab but ${clean(s.dob)} on the suspect.` });
      if (clean(a.date) && today && clean(a.date) > today) out.push({ severity: 'High', text: `${name}'s arrest date (${clean(a.date)}) is in the future.` });
      const own = events.filter((e) => e.kind === 'arrest' && !e.auto && clean(e.date) && O.nameMatch(name, e.suspect || '') === 'same');
      if (clean(a.date) && own.length && !own.some((e) => clean(e.date) === clean(a.date))) out.push({ severity: 'High', text: `${name} was arrested on ${clean(a.date)} on the Arrest tab, but the Timeline's arrest says ${own.map((e) => e.date).join(', ')}.` });
      // Charges against what was bought (from this person) or recovered.
      const charged = drugsIn((a.charges || []).map((c) => `${c.statute || ''} ${c.description || ''}`).join(' '));
      const hisBuys = buys.filter((b) => !clean(b.suspect) || O.nameMatch(name, b.suspect) === 'same');
      const had = drugsIn([...hisBuys.map((b) => b.drug), ...(a.narcotics || []).map((n) => `${n.drug || ''} ${n.description || ''}`)].join(' '));
      for (const d of charged) if (had.size && !had.has(d)) out.push({ severity: 'Medium', text: `${name} is charged with ${d}, but no buy from ${name} or recovered narcotic is ${d}.` });
      if (charged.size) for (const d of had) if (!charged.has(d)) out.push({ severity: 'Low', text: `${d[0].toUpperCase()}${d.slice(1)} was bought from or recovered on ${name}, but no charge names it.` });
      for (const n of a.narcotics || []) {
        const v = clean(n.inventory).replace(/\D/g, '');
        if (v && listed.size && !listed.has(v)) out.push({ severity: 'Medium', text: `Recovered ${clean(n.drug) || 'narcotics'} under Inventory #${clean(n.inventory)} (${name}) is not on the evidence list.` });
      }
    }
    return out;
  }

  /**
   * Everything still open on a case, most serious first:
   *  timeline: { events }; checks: [{ open, counts, stale }]; drafts: [{ title, confirm }];
   *  evidence: the Write Report tab's exhibits; arrest; caseObj; today ('YYYY-MM-DD').
   * -> [{ area, severity, text, tab }] (tab: where it is fixed)
   */
  function caseHealth({ caseObj = {}, timeline = { events: [] }, checks = [], drafts = [], evidence = [], arrest = null, today = '' } = {}) {
    const out = [];
    const add = (area, severity, text, tab) => out.push({ area, severity, text, tab });
    const overdue = (timeline.events || []).filter((e) => e.kind === 'deadline' && !e.done && e.date && today && e.date < today);
    if (overdue.length) add('Deadlines', 'High', `${overdue.length} overdue deadline${overdue.length === 1 ? '' : 's'}: ${overdue.slice(0, 3).map((e) => e.title || e.date).join('; ')}.`, 'timeline');
    const highOpen = checks.reduce((n, k) => n + (k.openHigh || 0), 0);
    const open = checks.reduce((n, k) => n + (Number(k.open) || 0), 0);
    if (open) add('Checks', highOpen ? 'High' : 'Medium', `${open} open consistency flag${open === 1 ? '' : 's'}${highOpen ? `, ${highOpen} of them High` : ''}.`, 'checks');
    const stale = checks.filter((k) => k.stale).length;
    if (stale) add('Checks', 'Medium', `${stale} check${stale === 1 ? ' is' : 's are'} out of date: a document changed since. Run again.`, 'checks');
    for (const d of drafts.filter((x) => x.confirm > 0)) add('Drafts', 'Medium', `"${d.title}" still has ${d.confirm} [CONFIRM: …] to fill.`, 'reports');
    const ex = (evidence || []).filter((e) => clean(e.inventory) || clean(e.description) || clean(e.drug));
    const noPhoto = ex.filter((e) => !(e.photos || []).length);
    if (noPhoto.length) add('Evidence', 'Low', `${noPhoto.length} exhibit${noPhoto.length === 1 ? ' has' : 's have'} no photo: ${noPhoto.slice(0, 4).map(exhibitName).join(', ')}.`, 'draft');
    for (const e of ex) for (const g of custodyGaps(e)) add('Custody', g.severity, g.text, 'draft');
    for (const g of arrestIssues({ arrest, caseObj, timeline, evidence, today })) add('Arrest', g.severity, g.text, 'arrest');
    return out.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  }

  /**
   * v1.172: before a case is closed, besides caseHealth(): narcotics with no lab result (never
   * back from the lab), and how many exhibits have no final disposition yet. -> [{ severity, text }]
   */
  function closeReadiness(evidence) {
    const out = [];
    const ex = (evidence || []).filter((e) => clean(e.inventory) || clean(e.description) || clean(e.drug));
    const noLab = ex.filter((e) => /narcotic/i.test(clean(e.type)) && !Custody().normalize(e.custody).some((x) => x.action === 'Returned from Lab'));
    if (noLab.length) out.push({ severity: 'Medium', text: `No lab result yet for ${noLab.map(exhibitName).join(', ')}.` });
    const open = ex.filter((e) => Custody().status(e.custody).state !== 'gone');
    if (open.length) out.push({ severity: 'Low', text: `${open.length} exhibit${open.length === 1 ? ' has' : 's have'} no final disposition (Destroyed or Released to Owner) yet. That is normal while the case is in court.` });
    return out;
  }

  /** v1.172 {{evidence}}: the exhibits as a table (Exhibit, Inventory #, Item, Weight, Custody). */
  function evidenceTable(evidence) {
    const ex = (evidence || []).filter((e) => clean(e.inventory) || clean(e.description) || clean(e.drug));
    if (!ex.length) return '';
    const esc = (s) => clean(s).replace(/\|/g, '/');
    const where = (e) => { const s = Custody().status(e.custody); return s.state === 'none' ? '—' : `${s.last.action}${s.last.date ? ` ${s.last.date}` : ''}`; };
    return ['| Exhibit | Inventory # | Item | Weight | Custody |', '|---|---|---|---|---|',
      ...ex.map((e) => `| ${esc(e.number)} | ${esc(e.inventory) || '—'} | ${esc([e.type === 'Narcotics' && e.drug ? e.drug : e.type, e.description].filter(Boolean).join(', ')) || '—'} | ${esc(e.weight) || '—'} | ${esc(where(e))} |`)].join('\n');
  }
  /** v1.172 {{buys}}: the Timeline's buys as a table, with the total paid. */
  function buysTable(events) {
    const buys = (events || []).filter((e) => e.kind === 'buy').sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`));
    if (!buys.length) return '';
    const esc = (s) => clean(s).replace(/\|/g, '/');
    const money = (v) => { const n = Number(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return Number.isFinite(n) && String(v).trim() !== '' ? n : null; };
    const fmt = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
    const total = buys.reduce((t, b) => t + (money(b.paid) || 0), 0);
    return ['| Buy | Date | Suspect | Narcotic | Amount | Paid |', '|---|---|---|---|---|---|',
      ...buys.map((b, i) => `| ${i + 1} | ${esc(b.date)}${b.time ? ` ${esc(b.time)}` : ''} | ${esc(b.suspect) || '—'} | ${esc(b.drug) || '—'} | ${clean(b.qty) ? `${esc(b.qty)} ${esc(b.unit || 'g')}` : '—'} | ${money(b.paid) != null ? fmt(money(b.paid)) : '—'} |`),
      `| | | | | **Total** | **${fmt(total)}** |`].join('\n');
  }
  /** v1.172: the template values: {{evidence}}, {{buys}}, {{buys.count}}, {{buys.total}}, {{inventory}}. */
  function templateValues({ evidence = [], events = [] } = {}) {
    const buys = (events || []).filter((e) => e.kind === 'buy');
    const total = buys.reduce((t, b) => { const n = Number(String(b.paid == null ? '' : b.paid).replace(/[$,\s]/g, '')); return t + (Number.isFinite(n) ? n : 0); }, 0);
    return {
      evidence: evidenceTable(evidence), buys: buysTable(events), 'buys.count': buys.length ? String(buys.length) : '',
      'buys.total': buys.length ? `$${total.toLocaleString('en-US', { minimumFractionDigits: total % 1 ? 2 : 0, maximumFractionDigits: 2 })}` : '',
      inventory: (evidence || []).map((e) => clean(e.inventory)).filter(Boolean).map((v) => `#${v}`).join(', '),
    };
  }

  /** v1.172: the suspects' monikers as Known Aliases lines ("Richard Poe, Rick, Ricky"), for the checker. */
  function aliasLines(suspects) {
    return (suspects || []).filter((s) => s && !s.notIdentified && clean(s.name) && clean(s.info && s.info.moniker))
      .map((s) => [clean(s.name), ...clean(s.info.moniker).split(/[,;/]|\baka\b|\ba\.k\.a\.?/i).map((x) => clean(x).replace(/^@/, '')).filter((x) => x.length >= 2)].join(', '));
  }

  const api = { custodyGaps, arrestIssues, caseHealth, closeReadiness, evidenceTable, buysTable, templateValues, aliasLines, drugsIn };
  if (isNode) module.exports = api;
  else root.CVHealth = api;
})(this);
