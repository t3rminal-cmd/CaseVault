/* CaseVault — case status rules, closing a case, and arrest details.
 *
 *   Open      You are actively working the case. (A new case starts here.)
  *             (v1.105: there is no Pending. Waiting on a lab or the DA is Open, with a deadline
 *             on the timeline.)
 *   Closed    The investigation is finished, with a disposition (cleared by arrest, exceptionally
 *             cleared, unfounded, inactive, referred…). Set through "Close case…", which also
 *             lists loose ends (open deadlines, open check flags, [CONFIRM: …] left in drafts).
 *   Archived  Closed and out of the way: moved to archive/, read-only (see vault.js).
 *
 * Arrest details (arrestee, arrest, charges) are kept in cases/<id>/arrest.json and fill the
 * {{arrest.*}} placeholders in templates, for arrest reports.
 *
 * Plain logic, no DOM: the tests run it under Node.
 */
'use strict';

(function (root) {
  const STATUS_HELP = {
    Open: 'Open: you are actively working this case.',
    Closed: 'Closed: the investigation is finished, with a disposition. Use "Close case…" to close it.',
    Archived: 'Archived: closed and moved to the archive, read-only.',
  };

  // v1.106: Add Follow-up puts "Follow up: <what>" on the Timeline as a deadline.
  const FOLLOW_UP_REASONS = [
    'Lab results', 'Warrant signature', 'Prosecutor / DA review', 'Subpoena or records return', 'Suspect not located',
    'Witness or victim contact', 'Another agency', 'Court date', 'Other',
  ];

  const DISPOSITIONS = [
    { key: 'arrest', label: 'Cleared by arrest', hint: 'At least one person arrested and charged. Fill in the Arrest details.' },
    { key: 'exceptional', label: 'Exceptionally cleared', hint: 'Offender known and enough to charge, but something outside your control prevents it.',
      reasons: ['Death of the offender', 'Prosecution declined', 'Victim refused to cooperate', 'Extradition denied', 'Juvenile, no custody', 'Other'] },
    { key: 'unfounded', label: 'Unfounded', hint: 'The investigation showed no offense occurred.' },
    { key: 'inactive', label: 'Inactive / no further leads', hint: 'Nothing left to work and nothing to wait for: closed until new information comes in. Can be reopened. (Waiting on a lab or the DA: keep it Open, with a deadline on the Timeline.)' },
    { key: 'referred', label: 'Referred to another agency', hint: 'Handed to the agency with jurisdiction.' },
    { key: 'continued', label: 'Continued in another case', hint: 'The suspect still at large is carried on in a new case (Continue in a New Case, by the suspect on the Details tab); this case number closes.' },
    { key: 'other', label: 'Other', hint: 'Explain in the closing note.' },
  ];
  const disposition = (key) => DISPOSITIONS.find((d) => d.key === key) || null;

  // The fields of an arrest report (v1.30: laid out like an arrest report: the report numbers,
  // Offender, Incident, Charges, Recovered Narcotics, Warrant, Victim and Complainant, Arrestee
  // Vehicle, Properties, Incident Narrative, Court and Bond, Reporting Personnel). One report per
  // arrestee. type: text (default), date, time, select, textarea, yn (Yes / No).
  // Keys from before v1.30 are kept, so older arrest.json files and {{arrest.*}} still work.
  const SEX = ['', 'Male', 'Female', 'Other', 'Unknown'];
  const NUMBER_FIELDS = [
    { key: 'bookingNumber', label: 'CB #' }, { key: 'irNumber', label: 'IR #' }, { key: 'ydNumber', label: 'YD #' },
    { key: 'rdNumber', label: 'RD #' }, { key: 'eventNumber', label: 'Event #' },
  ];
  const ARRESTEE_FIELDS = [
    { key: 'lastName', label: 'Last name' }, { key: 'firstName', label: 'First name' }, { key: 'middleName', label: 'Middle name' },
    { key: 'address', label: 'Residence', type: 'textarea' }, { key: 'beatResidence', label: 'Beat' },
    { key: 'dob', label: 'Date of birth', type: 'date' }, { key: 'pob', label: 'Place of birth' },
    { key: 'idNumber', label: 'Driver\'s licence no. (DLN)' }, { key: 'armedWith', label: 'Armed with' },
    { key: 'ssn', label: 'SSN', format: 'ssn' }, { key: 'phone', label: 'Phone', type: 'tel' },
    { key: 'sex', label: 'Sex', type: 'select', options: SEX },
    { key: 'race', label: 'Race / ethnicity' }, { key: 'height', label: 'Height' }, { key: 'weight', label: 'Weight' },
    { key: 'eyes', label: 'Eyes' }, { key: 'hair', label: 'Hair' }, { key: 'hairStyle', label: 'Hair style' }, { key: 'complexion', label: 'Complexion' },
  ];
  const INCIDENT_FIELDS = [
    { key: 'date', label: 'Arrest date', type: 'date' }, { key: 'time', label: 'Arrest time', type: 'time' },
    { key: 'location', label: 'Location', type: 'textarea' }, { key: 'beat', label: 'Beat' },
    { key: 'facility', label: 'Holding facility' },
    { key: 'type', label: 'Type of arrest', type: 'select', options: ['', 'On-view', 'Warrant', 'Summons / citation', 'Turned self in', 'Other'] },
    { key: 'resisted', label: 'Resisted arrest?', type: 'yn' }, { key: 'cma', label: 'Declared CMA incident?', type: 'yn' },
    { key: 'trr', label: 'TRR completed?', type: 'yn' }, { key: 'totalArrested', label: 'Total no. arrested' },
    { key: 'coArrests', label: 'Co-arrests' }, { key: 'assocCases', label: 'Associated cases' },
    { key: 'dcfsWard', label: 'DCFS ward?', type: 'yn' }, { key: 'dependentChildren', label: 'Dependent children?', type: 'yn' },
    { key: 'miranda', label: 'Miranda', type: 'select', options: ['', 'Given and waived', 'Given, rights invoked', 'Not given, no questioning', 'Not given'] },
    { key: 'mirandaTime', label: 'Miranda time', type: 'time' },
  ];
  const VEHICLE_FIELDS = [
    { key: 'vehYear', label: 'Year' }, { key: 'vehMake', label: 'Make' }, { key: 'vehModel', label: 'Model' }, { key: 'vehStyle', label: 'Body style' },
    { key: 'vehColor', label: 'Color' }, { key: 'vin', label: 'VIN' }, { key: 'plate', label: 'Licence plate' }, { key: 'plateState', label: 'State' },
    { key: 'impounded', label: 'Vehicle impounded?', type: 'yn' }, { key: 'poundNumber', label: 'Pound #' }, { key: 'vehInventory', label: 'Inv #' },
    { key: 'vehDisposition', label: 'Disposition' },
  ];
  const COURT_FIELDS = [
    { key: 'desiredCourtDate', label: 'Desired court date', type: 'date' }, { key: 'courtBranch', label: 'Branch' },
    { key: 'courtSgt', label: 'Court sergeant handle?', type: 'yn' },
    { key: 'initialCourtDate', label: 'Initial court date', type: 'date' }, { key: 'initialBranch', label: 'Branch' },
    { key: 'docket', label: 'Docket #' },
  ];
  const BOND_FIELDS = [
    { key: 'bondDate', label: 'Bond date', type: 'date' }, { key: 'bondTime', label: 'Bond time', type: 'time' },
    { key: 'bondType', label: 'Type' }, { key: 'bondReceipt', label: 'Receipt #' }, { key: 'bond', label: 'Amount' },
  ];
  const PERSONNEL_FIELDS = [
    { key: 'attestingOfficer', label: 'Attesting officer' }, { key: 'attestingStar', label: 'Star #' },
    { key: 'attestingDate', label: 'Date', type: 'date' }, { key: 'attestingTime', label: 'Time', type: 'time' },
    { key: 'arrestingOfficer', label: '1st arresting officer' }, { key: 'arrestingStar', label: 'Star #' }, { key: 'arrestingBeat', label: 'Beat' },
    { key: 'secondOfficer', label: 'Second arresting officer' }, { key: 'secondStar', label: 'Star #' }, { key: 'secondBeat', label: 'Beat' },
    { key: 'assistingOfficers', label: 'Assisting officers' },
    { key: 'supervisor', label: 'Approving supervisor' }, { key: 'supervisorStar', label: 'Star #' },
    { key: 'approvalDate', label: 'Date', type: 'date' }, { key: 'approvalTime', label: 'Time', type: 'time' },
  ];
  // Every one-value field; ARREST_FIELDS is everything but the offender's own (kept as before).
  const ARREST_FIELDS = [...NUMBER_FIELDS, ...INCIDENT_FIELDS, ...VEHICLE_FIELDS, ...COURT_FIELDS, ...BOND_FIELDS, ...PERSONNEL_FIELDS,
    { key: 'warrantNumber', label: 'Warrant number' }];

  // Lists, one entry per row on the report.
  const CHARGE_FIELDS = [
    { key: 'statute', label: 'Offense as cited' }, { key: 'description', label: 'Charge' },
    { key: 'degree', label: 'Class', classPick: true },
    { key: 'level', label: 'Type', type: 'select', options: ['', 'Felony', 'Misdemeanor', 'Infraction / violation', 'Other'] },
    { key: 'counts', label: 'Counts' }, { key: 'victim', label: 'Victim' },
  ];
  const NARCOTIC_FIELDS = [
    { key: 'drug', label: 'Narcotic' }, { key: 'amount', label: 'Amount' },
    { key: 'unit', label: 'Unit', type: 'select', options: ['', 'g', 'kg', 'oz', 'lb', 'pills', 'units', 'ml'] },
    { key: 'inventory', label: 'Inventory #' }, { key: 'description', label: 'Description' },
  ];
  const WARRANT_FIELDS = [
    { key: 'number', label: 'Warrant #' },
    { key: 'kind', label: 'Type', type: 'select', options: ['', 'Arrest warrant', 'Bench warrant', 'Investigative alert', 'Other'] },
    { key: 'issuedBy', label: 'Issued by' }, { key: 'issued', label: 'Date issued', type: 'date' }, { key: 'offense', label: 'Offense' },
  ];
  // v1.114: confiscated properties, one row each: inventory number and a description to pick or type.
  const PROPERTY_KINDS = ['Prisoner Personal Property', 'Prisoner Jewelry', 'Prisoner Money', 'Prisoner Other'];
  const PROPERTY_FIELDS = [
    { key: 'inventory', label: 'Inventory #' }, { key: 'description', label: 'Description', propertyPick: true },
  ];
  // v1.133: the arrestee's phone calls: who was called, how they are related, the number called.
  const PHONE_CALL_FIELDS = [
    { key: 'name', label: 'Name (called who)' }, { key: 'relationship', label: 'Relationship' },
    { key: 'phone', label: 'Phone number called', type: 'tel' },
    { key: 'time', label: 'Time of call', type: 'time' }, // v1.135
  ];
  const NON_OFFENDER_FIELDS = [
    { key: 'role', label: 'Role', type: 'select', options: ['Victim', 'Complainant', 'Victim and complainant', 'Witness'] },
    { key: 'name', label: 'Name', victimPick: true }, { key: 'officer', label: 'Officer name' }, { key: 'address', label: 'Residence', type: 'textarea' }, { key: 'beat', label: 'Beat' },
    { key: 'phone', label: 'Phone', type: 'tel' }, { key: 'employer', label: 'Employer address', type: 'textarea' }, { key: 'employerBeat', label: 'Employer beat' },
    { key: 'sex', label: 'Sex', type: 'select', options: SEX }, { key: 'race', label: 'Race / ethnicity' },
    { key: 'dob', label: 'Date of birth', type: 'date' },
    { key: 'injured', label: 'Injured?', type: 'yn' }, { key: 'deceased', label: 'Deceased?', type: 'yn' },
    { key: 'hospitalized', label: 'Hospitalized?', type: 'yn' }, { key: 'treated', label: 'Treated and released?', type: 'yn' },
    { key: 'comments', label: 'Comments', type: 'textarea' },
  ];
  const LISTS = {
    charges: { fields: CHARGE_FIELDS, item: 'Charge', none: '' },
    narcotics: { fields: NARCOTIC_FIELDS, item: 'Narcotic', none: 'No narcotics recovered' },
    warrants: { fields: WARRANT_FIELDS, item: 'Warrant', none: 'No warrant identified' },
    nonOffenders: { fields: NON_OFFENDER_FIELDS, item: 'Person', none: 'None' },
    properties: { fields: PROPERTY_FIELDS, item: 'Property', none: 'No properties recorded' },
    phoneCalls: { fields: PHONE_CALL_FIELDS, item: 'Phone Call', none: 'No phone calls recorded' },
  };

  const blank = (fields) => Object.fromEntries(fields.map((f) => [f.key, f.key === 'counts' ? '1' : f.key === 'role' ? 'Victim' : '']));
  const emptyCharge = () => blank(CHARGE_FIELDS);
  const emptyItem = (list) => (list === 'charges' ? emptyCharge() : blank(LISTS[list].fields));
  const emptyArrestee = () => ({
    ...Object.fromEntries([...ARRESTEE_FIELDS, ...ARREST_FIELDS].map((f) => [f.key, ''])),
    photo: '', charges: [emptyCharge()], narcotics: [], warrants: [], nonOffenders: [], properties: [], phoneCalls: [], property: '', narrative: '', notes: '',
    // v1.113: ticked when the part doesn't apply (the report then says so). v1.133: refusedCall,
    // the arrestee refused a phone call.
    noVehicle: false, noNarcotics: false, noWarrant: false, refusedCall: false,
  });
  const emptyArrest = () => ({ schema: 2, arrestees: [emptyArrestee()] });
  /** v1.119: the same person arrested on another case of the Mission: their own details (name,
   * residence, date of birth, description) on a new arrestee with this case's RD number. The charges,
   * property, photo and narrative stay with the other case. */
  function copyArrestee(src, rdNumber = '') {
    const out = emptyArrestee();
    for (const f of ARRESTEE_FIELDS) out[f.key] = clean(src && src[f.key]);
    out.rdNumber = clean(rdNumber);
    return out;
  }

  /** An arrestee from any version: missing fields added; a warrant number from before v1.30 becomes a
   * Warrant entry; the old Notes become the Incident Narrative. */
  function normalizeArrestee(a) {
    const out = { ...emptyArrestee(), ...(a || {}) };
    for (const k of Object.keys(LISTS)) out[k] = Array.isArray(out[k]) ? out[k].map((x) => ({ ...emptyItem(k), ...(x || {}) })) : [];
    if (!out.charges.length) out.charges = [emptyCharge()];
    if (clean(out.warrantNumber) && !out.warrants.some((w) => clean(w.number) === clean(out.warrantNumber))) out.warrants.push({ ...emptyItem('warrants'), number: clean(out.warrantNumber) });
    if (!clean(out.narrative) && clean(out.notes)) { out.narrative = out.notes; out.notes = ''; }
    return out;
  }
  const normalizeArrest = (arrest) => ({ schema: 2, arrestees: ((arrest && arrest.arrestees) || []).map(normalizeArrestee) });
  const itemFilled = (it) => !!it && Object.entries(it).some(([k, v]) => k !== 'counts' && k !== 'role' && clean(v));

  /** Age in whole years on a day (both YYYY-MM-DD); '' when unknown. */
  function ageOn(dob, day) {
    const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(dob)); const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(day));
    if (!a || !b) return '';
    let n = Number(b[1]) - Number(a[1]);
    if (b[2] < a[2] || (b[2] === a[2] && b[3] < a[3])) n -= 1;
    return n >= 0 && n < 130 ? String(n) : '';
  }

  const clean = (s) => String(s == null ? '' : s).trim();
  const arresteeName = (a) => [a.firstName, a.middleName, a.lastName].map(clean).filter(Boolean).join(' ');

  function chargesText(charges) {
    return (charges || []).filter((c) => clean(c.statute) || clean(c.description)).map((c, i) => {
      const extra = [[clean(c.level), clean(c.degree)].filter(Boolean).join(', '), Number(c.counts) > 1 ? `${Number(c.counts)} counts` : ''].filter(Boolean).join('; ');
      return `${i + 1}. ${[clean(c.statute), clean(c.description)].filter(Boolean).join(' — ')}${extra ? ` (${extra})` : ''}`;
    }).join('\n');
  }

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  // The long date, as everywhere in CaseVault (v1.32): "September 30, 2026".
  const US = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(iso)); return m ? `${MONTHS[Number(m[2]) - 1]} ${m[3]}, ${m[1]}` : clean(iso); };

  /** v1.114: a property row as one line: "Inv. 1234567, Prisoner Money". */
  const propertyLine = (p) => [clean(p.inventory) && `Inv. ${clean(p.inventory)}`, clean(p.description)].filter(Boolean).join(', ');

  // v1.114: the class of the Illinois and federal charges in the Reference list, by statute
  // (longest match first). Only where the statute itself sets the class; check it against the
  // amount and the arrestee's history (a second offense can raise it). Can be changed.
  const CHARGE_CLASSES = ['Class X', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class A', 'Class B', 'Class C', 'Petty offense', 'Federal felony', 'Federal misdemeanor'];
  const STATUTE_CLASS = [
    ['720 ILCS 550/5(c)', 'Class 4'], ['720 ILCS 550/5(d)', 'Class 3'], ['720 ILCS 550/5(e)', 'Class 2'], ['720 ILCS 550/5(f)', 'Class 1'], ['720 ILCS 550/5(g)', 'Class X'],
    ['720 ILCS 550/4(b)', 'Class B'], ['720 ILCS 550/4(c)', 'Class A'], ['720 ILCS 550/4(d)', 'Class 4'], ['720 ILCS 550/4(e)', 'Class 3'], ['720 ILCS 550/4(f)', 'Class 2'], ['720 ILCS 550/4(g)', 'Class 1'],
    ['720 ILCS 570/401(a)', 'Class X'], ['720 ILCS 570/401(c)', 'Class 1'], ['720 ILCS 570/401(d)', 'Class 2'], ['720 ILCS 570/401(e)', 'Class 3'],
    ['720 ILCS 570/402(a)', 'Class 1'], ['720 ILCS 570/402(c)', 'Class 4'],
    ['720 ILCS 646/55(a)(2)(A)', 'Class 2'], ['720 ILCS 646/55(a)(2)(B)', 'Class 1'], ['720 ILCS 646/55(a)(2)(C)', 'Class X'], ['720 ILCS 646/55(a)(2)(D)', 'Class X'], ['720 ILCS 646/55(a)(2)(E)', 'Class X'], ['720 ILCS 646/55(a)(2)(F)', 'Class X'],
    ['720 ILCS 646/60(b)(1)', 'Class 3'], ['720 ILCS 646/60(b)(2)', 'Class 2'], ['720 ILCS 646/60(b)(3)', 'Class 1'], ['720 ILCS 646/60(b)(4)', 'Class X'], ['720 ILCS 646/60(b)(5)', 'Class X'], ['720 ILCS 646/60(b)(6)', 'Class X'],
    ['720 ILCS 570/405', 'Class X'], ['720 ILCS 5/24-1.1', 'Class 3'], ['720 ILCS 5/24-1.6', 'Class 4'],
    ['21 U.S.C. § 844', 'Federal misdemeanor'],
  ].sort((a, b) => b[0].length - a[0].length);
  // v1.135: the same statute with a different class by its wording (a subsequent offense).
  const WORDING_CLASS = [['720 ILCS 550/4(b)', /subsequent|second or|repeat/i, 'Class A']];
  const MISDEMEANOR_CLASSES = ['Class A', 'Class B', 'Class C', 'Federal misdemeanor'];
  /** The Type that goes with a class: Felony, Misdemeanor, or '' when the class says nothing. */
  function typeOfClass(cls) {
    const c = clean(cls);
    if (!c) return '';
    if (MISDEMEANOR_CLASSES.includes(c)) return 'Misdemeanor';
    if (c === 'Petty offense') return 'Infraction / violation';
    return CHARGE_CLASSES.includes(c) ? 'Felony' : '';
  }
  /** v1.114: { degree, level } for a statute ('' each when unknown). Federal statutes are felonies
   * unless listed; Illinois felony statutes with no fixed class get the Type only. */
  function chargeClass(statute, description = '') {
    const s = clean(statute).replace(/\s+/g, ' ');
    if (!s) return { degree: '', level: '' };
    const byWords = WORDING_CLASS.find(([k, re]) => s === k && re.test(clean(description)));
    if (byWords) return { degree: byWords[2], level: typeOfClass(byWords[2]) };
    const hit = STATUTE_CLASS.find(([k]) => s === k || (s.startsWith(k) && /^[(\s]/.test(s.slice(k.length)))); // 405 is not 405.1
    if (hit) return { degree: hit[1], level: typeOfClass(hit[1]) };
    if (/U\.S\.C\./.test(s)) return { degree: '', level: 'Felony' };
    if (/^720 ILCS (570|646|550)\/|^720 ILCS 5\/29B/.test(s)) return { degree: '', level: 'Felony' };
    return { degree: '', level: '' };
  }
  /** A charge picked from a statute and wording: its class and type go with it (another charge's go). */
  function withClass(ch, statute, description) {
    const k = chargeClass(statute, description);
    return { ...ch, statute: clean(statute), description: clean(description), degree: k.degree, level: k.level };
  }

  // v1.114: the victims to pick for a charge: those on the reports (Draft and sent) with the
  // arrestee's RD number, then the victims entered on this arrest, then the State of Illinois.
  const rdKey = (s) => clean(s).toUpperCase().replace(/[\s-]/g, '');
  const SEE_DEA6_RE = /^see dea ?6/i;
  /** forms: [{ rdNumber, victimsList, title }] -> [{ name, hint }] without repeats. */
  function victimChoices(forms, rdNumber, nonOffenders) {
    const out = []; const seen = new Set();
    const add = (name, hint) => { const n = clean(name); const k = n.toLowerCase(); if (!n || SEE_DEA6_RE.test(n) || seen.has(k)) return; seen.add(k); out.push({ name: n, hint }); };
    const rd = rdKey(rdNumber);
    for (const f of forms || []) if (f && rd && rdKey(f.rdNumber) === rd) for (const v of f.victimsList || []) add(v && v.name, `${f.title || 'Report'}, RD ${clean(f.rdNumber)}`);
    for (const p of nonOffenders || []) if (p && /victim/i.test(p.role || 'Victim')) add(p.name, 'Victim on this arrest');
    add(STATE_VICTIM, 'The State');
    return out;
  }

  /** {{arrest.*}} values: the first arrestee as arrest.x, every arrestee as arrest.N.x. */
  function arrestContext(arrest) {
    const ctx = {};
    const list = (arrest && arrest.arrestees) || [];
    list.forEach((a, i) => {
      const put = (k, v) => { ctx[`arrest.${i + 1}.${k}`] = v; if (i === 0) ctx[`arrest.${k}`] = v; };
      put('name', arresteeName(a));
      put('description', [clean(a.sex), clean(a.race), clean(a.height), clean(a.weight), clean(a.hair) && `${clean(a.hair)} hair`, clean(a.eyes) && `${clean(a.eyes)} eyes`].filter(Boolean).join(', '));
      const n = normalizeArrestee(a);
      for (const f of [...ARRESTEE_FIELDS, ...ARREST_FIELDS]) put(f.key, f.type === 'date' ? US(n[f.key]) : clean(n[f.key]));
      put('age', ageOn(n.dob, n.date));
      put('charges', chargesText(n.charges));
      put('vehicle', [n.vehYear, n.vehMake, n.vehModel, n.vehStyle].map(clean).filter(Boolean).join(' '));
      put('narcotics', n.narcotics.filter(itemFilled).map((x) => [clean(x.drug), [clean(x.amount), clean(x.unit)].filter(Boolean).join(' '), clean(x.inventory) && `Inv. ${clean(x.inventory)}`].filter(Boolean).join(', ')).join('\n'));
      put('warrants', n.warrants.filter(itemFilled).map((x) => [clean(x.number), clean(x.kind), clean(x.offense)].filter(Boolean).join(', ')).join('\n'));
      if (!clean(n.warrantNumber) && n.warrants[0]) put('warrantNumber', clean(n.warrants[0].number));
      // v1.133: "Jane Doe (Mother), (312) 555-0100", one call a line; or that the call was refused.
      put('phoneCalls', n.refusedCall ? 'Refused phone call' : n.phoneCalls.filter(itemFilled).map((x) => [[clean(x.name), clean(x.relationship) && `(${clean(x.relationship)})`].filter(Boolean).join(' '), clean(x.phone), clean(x.time) && `at ${clean(x.time)}`].filter(Boolean).join(', ')).join('\n'));
      put('property', [...n.properties.filter(itemFilled).map(propertyLine), clean(n.property)].filter(Boolean).join('\n')); put('narrative', clean(n.narrative)); put('notes', clean(n.narrative || n.notes));
    });
    ctx['arrest.count'] = String(list.filter((a) => arresteeName(a)).length);
    ctx['arrest.names'] = list.map(arresteeName).filter(Boolean).join('; ');
    return ctx;
  }

  /** v1.135: what an Arrest Report still leaves empty, before it's printed: [{ who, missing: [...] }]
   * for each arrestee with gaps. A part ticked as not applying (No narcotics recovered, Refused phone
   * call…) isn't a gap. */
  function arrestGaps(arrest) {
    const out = [];
    ((arrest && arrest.arrestees) || []).forEach((raw, i) => {
      const a = normalizeArrestee(raw);
      const missing = [];
      if (!arresteeName(a)) missing.push('the arrestee\'s name');
      if (!chargesText(a.charges)) missing.push('a charge');
      if (!clean(a.date) || !clean(a.time)) missing.push('the arrest date and time');
      if (!clean(a.miranda)) missing.push('Miranda');
      else if (/^Given/.test(clean(a.miranda)) && !clean(a.mirandaTime)) missing.push('the Miranda time');
      if (!a.noNarcotics && !a.narcotics.some(itemFilled)) missing.push('recovered narcotics (or tick No narcotics recovered)');
      if (!a.noWarrant && !a.warrants.some(itemFilled)) missing.push('a warrant (or tick No warrant identified)');
      if (!a.noVehicle && !VEHICLE_FIELDS.some((f) => clean(a[f.key]))) missing.push('the arrestee vehicle (or tick No arrestee vehicle information)');
      if (!a.refusedCall && !a.phoneCalls.some(itemFilled)) missing.push('a phone call (or tick Refused phone call)');
      if (!clean(a.narrative)) missing.push('the incident narrative');
      if (!clean(a.arrestingOfficer)) missing.push('the 1st arresting officer');
      if (missing.length) out.push({ who: arresteeName(a) || `Arrestee ${i + 1}`, missing });
    });
    return out;
  }

  /** v1.84: an arrest report good enough to close by arrest: an arrestee's name and a charge. */
  const arrestReady = (arrest) => ((arrest && arrest.arrestees) || []).some((a) => arresteeName(a) && chargesText(a.charges));
  /** v1.119: how far a Mission is from closed. cases: [{ id, number, status, archived, closure }];
   * arrests: Map(case id -> arrest.json). -> { done, total, rows: Map(id -> { state, text }) } where
   * state is closed | archived | ready (its own arrest report) | ref (can close by arrest with another
   * case number's report) | open (no arrest report yet). */
  function missionProgress(cases, arrests) {
    const list = (cases || []).filter(Boolean);
    const ready = list.filter((x) => x.status !== 'Closed' && !x.archived && arrestReady(arrests.get(x.id)));
    const anyReport = list.find((x) => arrestReady(arrests.get(x.id)));
    // text: the full sentence; short: what fits on one line in a Mission's case list (v1.131).
    const rows = new Map();
    for (const x of list) {
      const ref = x.closure && x.closure.arrestRef;
      if (x.archived) rows.set(x.id, { state: 'archived', text: 'Archived', short: 'Archived' });
      else if (x.status === 'Closed') rows.set(x.id, { state: 'closed', text: ref ? `Closed by arrest (report on RD ${ref.number})` : 'Closed', short: ref ? 'Closed by arrest' : 'Closed' });
      else if (ready.includes(x)) rows.set(x.id, { state: 'ready', text: 'Arrest report ready', short: 'Report ready' });
      else if (anyReport) rows.set(x.id, { state: 'ref', text: `Can close by arrest with RD ${anyReport.number}'s report`, short: 'Other RD report' });
      else rows.set(x.id, { state: 'open', text: 'No arrest report yet', short: 'No report yet' });
    }
    const done = [...rows.values()].filter((r) => r.state === 'closed' || r.state === 'archived').length;
    return { done, total: list.length, rows };
  }

  /* v1.179: what became of each suspect (kept as s.outcome; in a Mission every case number shares
   * the suspects, so it is the Mission's). "Moved to Another Case" is set by Continue in a New Case,
   * with s.continuedIn = { caseId, number, date }. */
  const SUSPECT_OUTCOMES = [
    { key: 'at-large', label: 'At Large', hint: 'Not arrested yet.' },
    { key: 'arrested', label: 'Arrested', hint: 'Arrested and charged.' },
    { key: 'not-prosecuted', label: 'Not Prosecuted', hint: 'Not charged, or the prosecutor declined.' },
    { key: 'deceased', label: 'Deceased', hint: '' },
    { key: 'continued', label: 'Moved to Another Case', hint: 'Carried on in a new case, with Continue in a New Case.' },
  ];
  const suspectOutcome = (key) => SUSPECT_OUTCOMES.find((o) => o.key === key) || null;
  /** Same person by name: the same words, or one name inside the other (a middle name). */
  function samePerson(a, b) {
    const x = personKey(a); const y = personKey(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const [s, l] = x.length < y.length ? [x, y] : [y, x];
    const big = new Set(l.split(' '));
    return s.split(' ').every((w) => big.has(w));
  }
  /** Each identified suspect with their outcome. One not set is "Arrested" when an arrest report of
   * the case (or of the Mission's case numbers) names them. arrests: arrest.json objects.
   * -> [{ s, name, key, label, auto, continuedIn }] */
  function suspectOutcomes(suspects, arrests = []) {
    const arrested = [...arrests].flatMap((a) => peopleOf(a));
    return (suspects || []).filter((s) => s && !s.notIdentified && clean(s.name)).map((s) => {
      let key = suspectOutcome(s.outcome) ? s.outcome : '';
      if (key === 'continued' && !(s.continuedIn && s.continuedIn.caseId)) key = 'at-large';
      const auto = !key && arrested.some((n) => samePerson(n, s.name));
      if (auto) key = 'arrested';
      return { s, name: clean(s.name), key, label: key ? suspectOutcome(key).label : 'Not set', auto, continuedIn: key === 'continued' ? s.continuedIn : null };
    });
  }
  /** The Mission's (or case's) suspects in one line, for the Mission page and its closing note.
   * -> { open: [names still at large or not set], text } */
  function outcomeSummary(rows) {
    const by = (k) => rows.filter((r) => r.key === k);
    const list = (xs) => xs.map((r) => r.name).join(', ');
    const parts = [];
    for (const o of ['arrested', 'not-prosecuted', 'deceased', 'continued', 'at-large'].map(suspectOutcome)) {
      const xs = by(o.key);
      if (!xs.length) continue;
      parts.push(o.key === 'continued'
        ? `${o.label}: ${xs.map((r) => `${r.name} (case ${r.continuedIn.number || 'no number'})`).join(', ')}`
        : `${o.label}: ${list(xs)}`);
    }
    const unset = by('');
    if (unset.length) parts.push(`Not set: ${list(unset)}`);
    return { open: [...by('at-large'), ...unset].map((r) => r.name), text: parts.length ? `${parts.join('. ')}.` : '' };
  }
  /** The Timeline entries of Continue in a New Case: one on the case it came from, one on the new one. */
  function continuationEvents({ name, from, to, mission = '', date, ids = [] }) {
    const at = new Date().toISOString();
    return {
      from: { id: ids[0], kind: 'event', date, time: '', title: `${name} continued in case ${to || 'with no number'}`, note: `Still at large. Carried on in a new independent case${mission ? `, outside Mission ${mission}` : ''}.`, suspect: name, done: false, created: at },
      to: { id: ids[1], kind: 'event', date, time: '', title: `Continued from case ${from || 'with no number'}${mission ? ` (Mission ${mission})` : ''}`, note: `${name} was still at large when the earlier case closed out.`, suspect: name, done: false, created: at },
    };
  }

  /** v1.115: closing several case numbers by arrest when only one RD has the arrest report.
   * picked: [{ id }]; ready: Set of case ids with their own arrest report; ref: the case id whose
   * report the others point to. -> { missing: [cases without their own], ok, refFor: [ids that point to ref] } */
  function arrestCoverage(picked, ready, ref) {
    const missing = (picked || []).filter((x) => !ready.has(x.id));
    const refOk = !!ref && ready.has(ref);
    return { missing, ok: !missing.length || refOk, refFor: refOk ? missing.map((x) => x.id) : [] };
  }

  /** {{closure.*}} values from case.json's closure. */
  function closureContext(closure) {
    const c = closure || {};
    const d = disposition(c.disposition);
    return { 'closure.disposition': d ? d.label : '', 'closure.reason': clean(c.reason), 'closure.date': US(c.date), 'closure.note': clean(c.note), 'closure.arrestRd': clean(c.arrestRef && c.arrestRef.number) };
  }

  /**
   * Loose ends before closing: { timeline, checks: [{ open }], drafts: [{ title, confirm }] } ->
   * [{ kind, text }]. Nothing here stops a case from closing; it's a reminder.
   */
  function closeChecklist({ timeline = { events: [] }, checks = [], drafts = [], suspects = null } = {}) {
    const out = [];
    // v1.179: suspects still at large (suspects: suspectOutcomes rows).
    const atLarge = (suspects || []).filter((r) => r.key === 'at-large').map((r) => r.name);
    if (atLarge.length) out.push({ kind: 'at-large', text: `${atLarge.join(', ')} ${atLarge.length === 1 ? 'is' : 'are'} still At Large. Continue in a New Case (by the suspect on the Details tab) carries ${atLarge.length === 1 ? 'them' : 'each'} on in a case of their own.` });
    const open = (timeline.events || []).filter((e) => e.kind === 'deadline' && !e.done);
    if (open.length) out.push({ kind: 'deadlines', text: `${open.length} open deadline${open.length === 1 ? '' : 's'} on the timeline: ${open.slice(0, 3).map((e) => e.title || e.date).join('; ')}${open.length > 3 ? '…' : ''}. Mark them done or delete them.` });
    const flags = checks.reduce((n, k) => n + (Number(k.open) || 0), 0);
    if (flags) out.push({ kind: 'flags', text: `${flags} consistency check flag${flags === 1 ? ' is' : 's are'} still open.` });
    const confirm = drafts.filter((d) => d.confirm > 0);
    if (confirm.length) out.push({ kind: 'confirm', text: `[CONFIRM: …] still in ${confirm.map((d) => `"${d.title}" (${d.confirm})`).join(', ')}.` });
    return out;
  }

  /** The timeline deadline Add Follow-up makes: "Follow up: Lab results — item 1". */
  function followUpEvent(reason, detail, date, id) {
    return { id, kind: 'deadline', date, time: '', title: `Follow up: ${[clean(reason), clean(detail)].filter(Boolean).join(' — ')}`, note: 'Added with Add Follow-up.', done: false };
  }

  /** People named in the arrest details, for the privacy scan (names CaseVault always hides). */
  const peopleOf = (arrest) => ((arrest && arrest.arrestees) || []).map(arresteeName).filter(Boolean);

  /* v1.111: cases on the same suspect. A name matches whatever its order or commas ("DOE, John" is
   * "John Doe"); a suspect marked Not Identified, or named Unknown, matches nothing. */
  const NO_NAME = new Set(['unknown', 'not identified', 'unk', 'n/a', 'na', 'none']);
  function personKey(name) {
    const t = String(name || '').toLowerCase().replace(/[^a-z0-9\s,'-]/g, ' ').replace(/[,]/g, ' ').trim().replace(/\s+/g, ' ');
    if (!t || NO_NAME.has(t)) return '';
    const words = t.split(' ').filter((w) => w.length > 1 && !['jr', 'sr', 'ii', 'iii', 'iv'].includes(w));
    return words.length >= 2 ? words.sort().join(' ') : '';
  }
  /** The people a case is about: its Subject Name and its identified suspects. -> [{ name, key }] */
  function peopleOfCase(c) {
    const out = [];
    const add = (n) => { const key = personKey(n); if (key && !out.some((x) => x.key === key)) out.push({ name: String(n).trim(), key }); };
    add(c && c.subject);
    for (const s of (c && c.suspects) || []) if (s && !s.notIdentified) add(s.name);
    return out;
  }
  /** Other open cases sharing a person with c. others: full cases. -> [{ c, names }] (by case number) */
  function sameSuspectCases(c, others) {
    const mine = new Map(peopleOfCase(c).map((p) => [p.key, p.name]));
    if (!mine.size) return [];
    return (others || []).filter((o) => o && o.id !== c.id && o.status !== 'Closed')
      .map((o) => ({ c: o, names: [...new Set(peopleOfCase(o).filter((p) => mine.has(p.key)).map((p) => mine.get(p.key)))] }))
      .filter((x) => x.names.length)
      .sort((a, b) => String(a.c.number || '').localeCompare(String(b.c.number || ''), undefined, { numeric: true }));
  }

  /* v1.113: the State of Illinois as a victim: only the role, the name and the officer's name. */
  const STATE_VICTIM = 'State of Illinois';
  const isStateVictim = (p) => clean(p && p.name).toLowerCase() === STATE_VICTIM.toLowerCase();
  /** The Victim and Complainant boxes a person uses. */
  const nonOffenderFields = (p) => (isStateVictim(p) ? NON_OFFENDER_FIELDS.filter((f) => ['role', 'name', 'officer'].includes(f.key)) : NON_OFFENDER_FIELDS.filter((f) => f.key !== 'officer'));

  /* v1.113: pick the arrestee from the case's suspects (Details) and the Write Report tab's offenders. */
  /** "DOE, John Q" or "John Q Doe" -> { lastName, firstName, middleName }. */
  function splitName(name) {
    const n = clean(name).replace(/\s+/g, ' ');
    if (!n) return { lastName: '', firstName: '', middleName: '' };
    if (n.includes(',')) {
      const [last, rest = ''] = n.split(',').map((x) => x.trim());
      const w = rest.split(' ').filter(Boolean);
      return { lastName: last.toUpperCase(), firstName: w[0] || '', middleName: w.slice(1).join(' ') };
    }
    const w = n.split(' ');
    if (w.length === 1) return { lastName: w[0].toUpperCase(), firstName: '', middleName: '' };
    let suffix = '';
    if (w.length > 2 && /^(jr|sr|ii|iii|iv)\.?$/i.test(w[w.length - 1])) suffix = ` ${w.pop().toUpperCase().replace(/\.$/, '')}`;
    return { lastName: `${w.pop().toUpperCase()}${suffix}`, firstName: w.shift(), middleName: w.join(' ') };
  }
  const NO_PERSON = /^(unknown|unknown offender|not identified|see dea 6 for further information)$/i;
  /** The people to pick from: [{ name, from, data }] (one per name; a Draft offender's details win,
   * the suspect's fill what it lacks). suspects: c.suspects; offenders: the Draft's offendersList. */
  function arresteeChoices(suspects, offenders) {
    const out = new Map();
    const key = (n) => clean(n).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').sort().join(' ');
    const put = (name, from, data) => {
      if (!clean(name) || NO_PERSON.test(clean(name))) return;
      const k = key(name);
      const cur = out.get(k);
      if (!cur) out.set(k, { name: clean(name), from, data: { ...data } });
      else { for (const [f, v] of Object.entries(data)) if (clean(v) && !clean(cur.data[f])) cur.data[f] = v; if (!cur.from.includes(from)) cur.from += ` and ${from}`; }
    };
    for (const o of offenders || []) if (o && !o.unknown) put(o.name, 'Draft offender', o);
    for (const s of suspects || []) if (s && !s.notIdentified) put(s.name, 'Details suspect', { ...(s.info || {}), dob: s.dob || '' });
    return [...out.values()];
  }
  /** The arrestee boxes a picked person fills (only those it has a value for). */
  function personToArrestee(p) {
    const d = (p && p.data) || {};
    const v = (k) => clean(d[k]);
    const sex = /^(male|female)$/i.test(v('gender')) ? v('gender')[0].toUpperCase() + v('gender').slice(1).toLowerCase() : '';
    const out = { ...splitName(p && p.name), dob: v('dob'), sex, race: v('race'), height: v('height'), weight: v('weight'), eyes: v('eyes'), hair: v('hair'),
      hairStyle: v('hairStyle'), complexion: v('complexion'), address: v('address'), phone: v('phone') || (Array.isArray(d.phones) ? clean(d.phones[0] && (d.phones[0].number || d.phones[0])) : ''),
      irNumber: v('irNumber'), bookingNumber: v('cbNumber') };
    return Object.fromEntries(Object.entries(out).filter(([, x]) => clean(x)));
  }
  /** Charges are blank (nothing typed yet). */
  const chargesBlank = (a) => !(a && a.charges || []).some((x) => clean(x.statute) || clean(x.description));

  const api = { SUSPECT_OUTCOMES, suspectOutcome, samePerson, suspectOutcomes, outcomeSummary, continuationEvents, arrestGaps, missionProgress, arrestReady, arrestCoverage, PROPERTY_KINDS, PROPERTY_FIELDS, propertyLine, CHARGE_CLASSES, chargeClass, typeOfClass, withClass, victimChoices, STATE_VICTIM, isStateVictim, nonOffenderFields, splitName, arresteeChoices, personToArrestee, chargesBlank, personKey, peopleOfCase, sameSuspectCases,
    STATUS_HELP, FOLLOW_UP_REASONS, DISPOSITIONS, disposition, copyArrestee, ARRESTEE_FIELDS, ARREST_FIELDS, CHARGE_FIELDS,
    NUMBER_FIELDS, INCIDENT_FIELDS, VEHICLE_FIELDS, COURT_FIELDS, BOND_FIELDS, PERSONNEL_FIELDS, NARCOTIC_FIELDS, WARRANT_FIELDS, NON_OFFENDER_FIELDS, LISTS,
    emptyArrest, emptyArrestee, emptyCharge, emptyItem, normalizeArrest, normalizeArrestee, itemFilled, ageOn, arresteeName, chargesText, arrestContext, closureContext, closeChecklist, followUpEvent, peopleOf,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVClosing = api;
})(this);
