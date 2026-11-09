/* CaseVault — Report Fields: the facts a supplementary report asks for, entered once per case
 * in Reports → Report Fields and kept in the case folder as report-fields.json.
 *
 * v1.21: victims, offenders, charges, gangs, persons not arrested, personnel and vehicles are lists
 * you add to; any part can be left out; exhibits can have photos.
 *
 * v1.20 lays them out like a narcotics supplementary report: case numbers, the offense, victims
 * and offenders, the assignment, update information and status, the officer's report lines,
 * evidence inventoried, the summary of investigation, and submission and approval. The printed
 * report (js/report-pdf.js) follows the same order. No agency's name or form number is written
 * into the app: the printed header uses the agency from Vault → My Profile.
 *
 * They fill {{report.*}} in templates, go to Draft with AI with the case, and "Create report from
 * fields" turns them into a report. Evidence gets exhibit numbers by itself: they count on across
 * every case with the same agency case number (an operation with several case numbers keeps one
 * exhibit sequence), and a number, once given, never changes.
 *
 * The field list and the text conversions are plain logic with no DOM, so the tests run them.
 */
'use strict';

(function (root) {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  /** "2026-09-30" -> "September 30, 2026" (v1.32: the long date everywhere). */
  const longDate = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || '')); return m ? `${MONTHS[Number(m[2]) - 1]} ${m[3]}, ${m[1]}` : String(v || ''); };

  // [key, label, kind, options]. kind: text, number, date, time, select, yesno, textarea, ucr,
  // location, check (a tick box), line (a long one-line entry, label on the left).
  const SECTIONS = [
    { id: 'numbers', title: 'Case Numbers', icon: 'hash', fields: [
      // v1.48: the R.D. Number is the report's number (the Agency Report Number box is gone).
      ['rdNumber', 'R.D. Number', 'text'],
      ['eventNumber', 'Event Number', 'text'],
      ['incidentNumber', 'Incident Number', 'text'],
      ['raidNumber', 'Raid Number', 'text'],
      ['activity', 'Officer Report Type', 'select', ['', 'Investigation', 'Purchase', 'Surveillance', 'Correction']],
    ] },
    { id: 'offense', title: 'Offense', icon: 'file-earmark-text', fields: [
      ['offense', 'Offense Classification / Last Report', 'text'],
      ['ucr', 'IUCR Code', 'ucr'],
      // v1.110: the long ones (Offense Classification, Address, Type of Location) are two columns wide.
      ['address', 'Address of Occurrence', 'text'],
      ['locationCode', 'Location Code', 'location'],
      ['locationType', 'Type of Location', 'text'],
      ['date', 'Date of Occurrence', 'date'],
      ['time', 'Time of Occurrence', 'time'],
      ['beatOccurrence', 'Beat of Occurrence', 'text'],
      ['beatAssigned', 'Beat Assigned', 'text'],
    ] },
    { id: 'people', title: 'Victims and Offenders', icon: 'people', fields: [
      ['victims', 'Number of Victims', 'number'],
      ['offenders', 'Number of Offenders', 'number'],
      ['arrested', 'Number Arrested', 'number'],
      ['methodCode', 'Method Code', 'text'],
    ], lists: ['victimsList', 'offendersList'] },
    { id: 'assignment', title: 'Assignment', icon: 'person-badge', fields: [
      ['method', 'Method Assigned', 'select', ['', 'Field', 'Supervisor', 'On View', 'OEMC']],
      ['unit', 'Unit Number', 'text'],
      ['safeMethod', 'Safe Method', 'text'],
      ['arrestUnit', 'Arrest Unit', 'text'],
      ['residence', 'If Residence, Where', 'text'],
      ['adults', 'Adults', 'number'],
      ['juveniles', 'Juveniles', 'number'],
      ['fire', 'Fire', 'yesno'],
      ['gang', 'Gang Related', 'yesno'],
    ] },
    { id: 'update', title: 'Update Information and Status', icon: 'list-check', fields: [
      ['victimVerified', 'Victim Verified', 'check'],
      ['offenderVerified', 'Offender Verified', 'check'],
      ['propertyVerified', 'Property Verified', 'check'],
      ['circumstancesVerified', 'Circumstances Verified', 'check'],
      ['victimUpdated', 'Victim Updated', 'check'],
      ['offenderUpdated', 'Offender Updated', 'check'],
      ['propertyUpdated', 'Property Updated', 'check'],
      ['circumstancesUpdated', 'Circumstances Updated', 'check'],
      // v1.48: spelled out (the codes saved before still read, see SPELLED).
      ['status', 'Status', 'select', ['', '0 - In Progress', '1 - Suspended', '2 - Unfounded', '3 - Cleared Closed', '4 - Cleared Open', '5 - Cleared Closed Exceptionally', '6 - Cleared Open Exceptionally', '7 - Closed, Non-Criminal']],
      ['cleared', 'How Cleared', 'select', ['', '1 - Arrest', '2 - Juvenile Court', '3 - Referred for Prosecution', '4 - Community Adjustment', '5 - Other', '6 - On Going']],
    ] },
    { id: 'report', title: "Officer's Report", icon: 'card-checklist', fields: [
      // v1.31: in this order; AUSA, IR and CB numbers added.
      ['operation', 'Operation / Mission Number', 'line'],
      ['within1000', 'Within 1000 FT Of', 'line'],
      ['courtBranch', 'Court Branch and Court Officer', 'line'],
      ['courtDate', 'Court Date', 'date'],
      ['searchWarrant', 'Search Warrant Number', 'line'],
      ['subpoenaGJ', 'Subpoena GJ Number', 'line'],
      ['asa', 'ASA Approving Search Warrant', 'line'],
      ['ausa', 'AUSA Approving Search Warrant', 'line'],
      ['judge', 'Judge Approving Search Warrant', 'line'],
      // v1.39: the purchase price, then each pre-recorded bill (denomination, serial number, recovered or not; v1.42: no quantity).
      ['buyFunds', 'Purchase Price', 'line'],
      ['funds', 'Pre-Recorded Funds', 'list'],
      ['fundSheet', 'Pre-Recorded Fund Sheet', 'line'],
      ['evidenceOfficer', 'Evidence Officer', 'line'],
      ['proofResidence', 'Proof of Residence', 'line'],
      // v1.86: no IR Number line: it is in each offender's info.
      ['cbNumber', 'CB Number', 'line'],
      // One line per narcotic (type, total weight, purchase price, street value), v1.25.
      ['narcotics', 'Narcotics Recovered', 'list'],
    ], lists: ['charges', 'gangs', 'notArrested', 'personnel', 'notifications'] }, // v1.94: vehicles are on each offender
    // One row per officer: name, star, date, time (v1.23; the Lieutenant lines were removed).
    { id: 'approval', title: 'Submission and Approval', icon: 'pencil-square', fields: [
      ['reportingOfficer', 'Reporting Officer', 'text'],
      ['reportingStar', 'Reporting Officer Star', 'text'],
      ['dateSubmitted', 'Date Submitted', 'date'],
      ['timeSubmitted', 'Time Submitted', 'time'],
      ['secondOfficer', 'Secondary Reporting Officer', 'text'],
      ['secondStar', 'Secondary Officer Star', 'text'],
      ['secondDate', 'Secondary Officer Date', 'date'],
      ['secondTime', 'Secondary Officer Time', 'time'],
      ['supervisor', 'Supervisor Approval', 'text'],
      ['supervisorStar', 'Supervisor Star', 'text'],
      ['dateApproved', 'Date Approved', 'date'],
      ['timeApproved', 'Time Approved', 'time'],
    ] },
  ];
  // Parts of the report that can be left out ("doesn't apply"): the sections above, and these.
  const EXTRA_PARTS = [{ id: 'evidence', title: 'Evidence Inventoried' }, { id: 'summary', title: 'Summary of Investigation' }];

  /* ---------------- lists you add to (v1.21) ---------------- */

  // [key, label, kind, options]. kind: text, date, select, phone, wide (a full-width entry), and
  // the pick-lists below (write-in allowed): victim, gang, hair, eyes.
  const PERSON = [
    ['name', 'Name', 'text'], ['relation', 'Relation Code', 'text'], ['dob', 'Date of Birth', 'date'], ['age', 'Age', 'age'],
    ['gender', 'Gender', 'select', ['', 'Male', 'Female', 'X', 'Unknown']],
    ['identity', 'Gender Identity', 'select', ['', 'Man', 'Woman', 'Transgender Man', 'Transgender Woman', 'Non-Binary', 'Other', 'Declined to State']],
    ['race', 'Race', 'select', ['', 'White', 'Black', 'White Hispanic', 'Black Hispanic', 'Asian / Pacific Islander', 'American Indian / Alaska Native', 'Unknown']],
    ['complexion', 'Complexion', 'select', ['', 'Light', 'Fair', 'Medium', 'Olive', 'Light Brown', 'Medium Brown', 'Dark Brown', 'Dark', 'Ruddy', 'Albino']],
    ['height', 'Height', 'height'], ['weight', 'Weight', 'weight'], ['hair', 'Hair Color', 'hair'], ['hairStyle', 'Hair Style', 'hairStyle'], ['eyes', 'Eye Color', 'eyes'],
    ['veteran', 'Veteran', 'select', ['', 'Yes', 'No']],
    ['marks', 'Tattoos / Scars', 'wide'], ['clothing', 'Clothing Description', 'wide'],
  ];
  // v1.69: an offender has the suspect's record numbers too, so both have the same fields
  // (the offender also has Clothing Description).
  const RECORD_NUMBERS = [['irNumber', 'IR Number', 'text'], ['fbiNumber', 'FBI Number', 'text'], ['idocNumber', 'IDOC Number', 'text']];
  // The officers' roles at the scene (Police Personnel).
  const ROLES = ['', 'Case', 'Affiant', 'Entry', 'Perimeter', 'UCO', 'Surveillance', 'Enforcement', 'Sergeant', 'Lieutenant', 'Agent', 'Other'];
  // Officer's Report lines that can be ticked off when they don't apply (v1.22; every line since
  // v1.34), and its lists (narcotics, charges, gangs…), which can be ticked off the same way.
  const OPTIONAL_LINES = SECTIONS.find((s) => s.id === 'report').fields.filter(([, , kind]) => kind !== 'list').map(([k]) => k);
  const OPTIONAL_LISTS = ['funds', 'narcotics', ...SECTIONS.find((s) => s.id === 'report').lists];
  /** The Court Branch line: [label, value] with the court date, each part left out when ticked off; null when both are. */
  const courtLine = (d, show) => {
    const hide = (k) => (d.hidden || []).includes(k);
    if (hide('courtBranch') && hide('courtDate')) return null;
    const parts = [hide('courtBranch') ? '' : show('courtBranch', d.courtBranch), hide('courtDate') ? '' : show('courtDate', d.courtDate)].filter(Boolean);
    return [hide('courtBranch') ? 'Court Date' : 'Court Branch and Court Officer', parts.join(', ')];
  };
  /** The short Status and How Cleared codes used before v1.48, spelled out. */
  const SPELLED = {
    '0 - Prog': '0 - In Progress', '1 - Sus': '1 - Suspended', '2 - Unf': '2 - Unfounded', '3 - C/C': '3 - Cleared Closed', '4 - C/O': '4 - Cleared Open',
    '5 - C/C/X': '5 - Cleared Closed Exceptionally', '6 - C/O/X': '6 - Cleared Open Exceptionally', '7 - C/N/C': '7 - Closed, Non-Criminal',
    '2 - Juv-Ct': '2 - Juvenile Court', '3 - Ref Pros': '3 - Referred for Prosecution', '4 - Comm Adj': '4 - Community Adjustment',
  };
  /** The short code of a spelled-out Status or How Cleared, for the PDF's row of circles. */
  const shortCode = (v) => Object.keys(SPELLED).find((k) => SPELLED[k] === v) || v;
  // Units the narcotic calculator prices by (js/reference).
  const NARCOTIC_UNITS = ['', 'gram', 'ounce', 'pound', 'kilogram', 'pill', 'mL'];
  const CUSTODY = ['', 'In Custody', 'Not in Custody']; // v1.81
  const DENOMINATIONS = ['', '$1', '$2', '$5', '$10', '$20', '$50', '$100', 'Electronic Funds']; // v1.80: Electronic Funds
  const RECOVERED = ['', 'Recovered', 'Not Recovered'];
  const LISTS = {
    narcotics: { title: 'Narcotics Recovered', item: 'Narcotic', fields: [['drug', 'Narcotics Type Recovered', 'narcotic'], ['amount', 'Total Weight', 'text'], ['unit', 'Unit', 'select', NARCOTIC_UNITS], ['price', 'Purchase Price', 'money'], ['value', 'Street Value', 'money']] },
    victimsList: { title: 'Victims', item: 'Victim', fields: [['name', 'Name', 'victim'], ['officer', 'Officer Name', 'text'], ...PERSON.slice(1)] },
    // v1.39: an offender's phone numbers and monikers (with the social media app each is used on).
    // v1.81: In Custody / Not in Custody, the residence, the CB number and the vehicle (as on the report).
    offendersList: { title: 'Offenders', item: 'Offender', fields: [PERSON[0], ['custody', 'Custody', 'select', CUSTODY], ...PERSON.slice(1), ...RECORD_NUMBERS, ['cbNumber', 'CB Number', 'text'], ['address', 'Residence', 'wide'], ['phones', 'Phone Numbers', 'phones'], ['socials', 'Monikers / Social Media', 'socials'], ['vehicles', 'Offender Vehicle(s)', 'vehicles']] }, // v1.94: one entry per vehicle (was Vehicle / VIN / Plates)
    // v1.54: one entry per denomination, with how many bills and their serial numbers; one Recovered
    // or Not Recovered for all of them (fundsRecovered).
    funds: { title: 'Pre-Recorded Funds', item: 'Denomination', fields: [['denomination', 'Denomination', 'select', DENOMINATIONS], ['quantity', 'Quantity', 'text'], ['serials', 'Serial Numbers', 'serials']] },
    charges: { title: 'Charges', item: 'Charge', fields: [['statute', 'Statute', 'charge'], ['description', 'Statute Description', 'chargeWide']] },
    gangs: { title: 'Gang Affiliations', item: 'Gang', fields: [['name', 'Gang', 'gang'], ['faction', 'Faction / Set', 'text']] },
    notArrested: { title: 'Persons Present Not Arrested', item: 'Person', fields: [['name', 'Name', 'text'], ['relation', 'Relationship', 'text'], ['phone', 'Contact Number', 'phone'], ['address', 'Address', 'wide']] },
    personnel: { title: 'Police Personnel on Scene', item: 'Officer', fields: [['name', 'Name', 'text'], ['star', 'Star Number', 'text'], ['unit', 'Unit', 'text'], ['role', 'Role', 'select', ROLES]] },
    notifications: { title: 'Notifications', item: 'Notification', fields: [['date', 'Date', 'date'], ['time', 'Time', 'time'], ['name', 'Person Notified', 'text'], ['by', 'Notified By', 'text']] }, // v1.42: no Notes; v1.82: Time
    vehicles: { title: 'Vehicles', item: 'Vehicle', fields: [['year', 'Year', 'text'], ['make', 'Make', 'text'], ['model', 'Model', 'text'], ['color', 'Color', 'text'], ['plate', 'License Plate', 'text'], ['state', 'Plate State', 'text'], ['vin', 'VIN', 'text'], ['disposition', 'Impound / Tow', 'select', ['', 'Impound', 'Tow', 'Other']], ['ownerName', 'Registered Owner', 'text'], ['ownerAddress', 'Registered Owner Address', 'wide'], ['notes', 'Notes', 'wide']] }, // v1.73: Registered Owner and Address
  };
  const PICKS = {
    // v1.108: the Federal Government as well as the State.
    victim: ['State of Illinois', 'Federal Government'],
    // v1.108: the confidential address used when the real one isn't written in the report
    // (v1.109: North and South).
    address: ['99 N Confidential Street', '99 S Confidential Street'],
    hair: ['Black', 'Brown', 'Blonde', 'Red', 'Gray', 'White', 'Bald', 'Dyed'],
    // v1.69
    hairStyle: ['Short', 'Medium', 'Long', 'Bald / Shaved', 'Buzz Cut', 'Fade', 'Afro', 'Braids', 'Cornrows', 'Dreadlocks', 'Twists', 'Ponytail', 'Bun', 'Curly', 'Wavy', 'Straight', 'Mohawk', 'Receding'],
    eyes: ['Brown', 'Black', 'Blue', 'Green', 'Hazel', 'Gray'],
    // Street gangs often named in Chicago reports, then national and foreign gangs and cartels.
    gang: ['Gangster Disciples', 'Black Disciples', 'Black P. Stones', 'Vice Lords', 'Conservative Vice Lords', 'Traveling Vice Lords', 'Four Corner Hustlers', 'Mickey Cobras', 'New Breeds', 'Black Souls',
      'Latin Kings', 'Maniac Latin Disciples', 'Spanish Cobras', 'Satan Disciples', 'Two-Six', 'La Raza', 'Ambrose', 'Latin Counts', 'Imperial Gangsters', 'Insane Unknowns', 'Latin Dragons', 'Harrison Gents', 'Party People', 'Spanish Gangster Disciples', 'Latin Saints', 'Ashland Vikings',
      'MS-13', '18th Street', 'Sureños', 'Norteños', 'Barrio Azteca', 'Tren de Aragua', 'Sinaloa Cartel', 'CJNG - Jalisco New Generation Cartel', 'Gulf Cartel', 'Los Zetas', 'Juárez Cartel', 'Hells Angels', 'Outlaws MC', 'Aryan Brotherhood', 'Crips', 'Bloods'],
  };

  const EVIDENCE_TYPES = ['Narcotics', 'Currency', 'Personal Currency', 'Personal Property', 'Personal Jewelry', 'Jewelry', 'Electronics', 'Video/Audio', 'Photograph', 'Packaging', 'Other'];
  const DRUG_TYPES = ['Cannabis', 'Cocaine', 'Crack Cocaine', 'Heroin', 'Fentanyl', 'Methamphetamine', 'MDMA / Ecstasy', 'PCP', 'Oxycodone', 'Hydrocodone', 'Alprazolam', 'Adderall', 'Ketamine', 'Psilocybin', 'LSD', 'Other Controlled Substance'];
  // Types saved before v1.20.
  /** v1.109: the Narcotics Recovered list: the calculator's narcotics (they have prices), then the
   * types it doesn't already cover (Cannabis is its Marijuana, Crack Cocaine its Cocaine (Crack)…). */
  const SAME_AS = { Cannabis: 'marijuana', 'Crack Cocaine': 'crack', 'MDMA / Ecstasy': 'mdma' };
  function narcoticChoices(data) {
    const names = Object.keys(data || {});
    const covered = (t) => names.some((n) => n.toLowerCase().includes(SAME_AS[t] || t.toLowerCase()));
    return [...names.map((k) => ({ value: k, label: k, hint: data[k].cat })), ...DRUG_TYPES.filter((t) => !covered(t)).map((t) => ({ value: t, label: t }))];
  }
  const OLD_TYPES = { Narcotic: 'Narcotics', 'Personal property': 'Personal Property', 'Personal currency': 'Personal Currency', 'Recording (audio/video)': 'Video/Audio' };
  // A 'list' entry in a section only marks where that list shows; it isn't a field of its own.
  const FIELDS = SECTIONS.flatMap((s) => s.fields).filter((f) => f[2] !== 'list');

  const empty = () => ({ schema: 4, ...Object.fromEntries(FIELDS.map(([k, , kind]) => [k, kind === 'check' ? false : ''])), ...Object.fromEntries(Object.keys(LISTS).map((k) => [k, []])), evidence: [], evidenceNote: '', narrative: '', hidden: [] });

  const MULTI = ['phones', 'socials', 'serials', 'vehicles']; // fields that hold several entries
  // v1.94: an offender's vehicles: one set of boxes each, and Impound / Tow / DNA as click boxes.
  const OFFENDER_VEHICLE = [['year', 'Year'], ['make', 'Make'], ['model', 'Model'], ['color', 'Color'], ['plate', 'License Plate'], ['state', 'Plate State'], ['vin', 'VIN'], ['owner', 'Registered Owner']];
  const VEHICLE_DISPOSITIONS = [['Impound', 'Impounded'], ['Tow', 'Towed'], ['DNA', 'DNA']];
  const blankVehicle = () => ({ ...Object.fromEntries(OFFENDER_VEHICLE.map(([k]) => [k, ''])), disposition: '' });
  /** "2015 Honda Accord, Black · Plate IL AB12345 · VIN … · Owner … · Impounded" */
  function vehicleLine(v) {
    const t = (k) => String((v && v[k]) || '').trim();
    const car = [t('year'), t('make'), t('model')].filter(Boolean).join(' ');
    const plate = [t('state'), t('plate')].filter(Boolean).join(' ');
    const disp = (VEHICLE_DISPOSITIONS.find(([k]) => k === t('disposition')) || [])[1] || '';
    return [[car, t('color')].filter(Boolean).join(', '), plate ? `Plate ${plate}` : '', t('vin') ? `VIN ${t('vin')}` : '', t('owner') ? `Registered Owner ${t('owner')}` : '', disp].filter(Boolean).join(' · ');
  }
  const SOCIAL_APPS = ['', 'Facebook', 'Instagram', 'Snapchat', 'TikTok', 'X (Twitter)', 'WhatsApp', 'Telegram', 'Signal', 'YouTube', 'Discord', 'Cash App', 'Other'];
  const blankItem = (list) => Object.fromEntries(LISTS[list].fields.map(([k, , kind]) => [k, MULTI.includes(kind) ? [] : '']));
  const hasText = (v) => (Array.isArray(v) ? v.some(hasText) : v && typeof v === 'object' ? Object.values(v).some(hasText) : !!String(v || '').trim());
  const filled = (item) => Object.values(item || {}).some(hasText);

  /* v1.108: "See DEA 6": a report kept for statistics only. Victims, Offenders, Charges and
   * Evidence Inventoried read "See DEA 6 for further information", and the Summary of
   * Investigation points to the DEA 6 reports under the Federal Case Number. */
  const SEE_DEA6 = 'See DEA 6 for further information';
  const dea6Narrative = (fed) => `This report is for statistical purposes only. For further information see DEA 6 reports under ${String(fed || '').trim() ? `Federal Case Number ${String(fed).trim()}` : 'the Federal Case Number'}. THIS CASE IS CLEAR/CLOSED.`;
  // The parts it fills, and where in each list the words go.
  const DEA6_LISTS = [['victimsList', 'name'], ['offendersList', 'name'], ['charges', 'description']];
 // v1.109: an entry reading SEE_DEA6 shows (and prints) only that box.
  const DEA6_KEY = Object.fromEntries(DEA6_LISTS);
  const isSee = (v) => String(v || '').trim().toLowerCase() === SEE_DEA6.toLowerCase();
  /** True for a victim, offender or charge that reads "See DEA 6 for further information". */
  const isSeeDea6 = (list, it) => !!DEA6_KEY[list] && !!it && (isSee(it[DEA6_KEY[list]]) || (list === 'charges' && isSee(it.statute)));
  const DEA6_PARTS = ['people', 'victimsList', 'offendersList', 'report', 'charges', 'evidence', 'summary'];
  /** Fills the form for "See DEA 6" (changes d): a list with no entries gets one reading
   * SEE_DEA6; entries already there are kept. The parts are put back in the report. */
  function seeDea6(d, fed) {
    for (const [list, k] of DEA6_LISTS) {
      if (!d[list].some(filled)) d[list] = [{ ...blankItem(list), [k]: SEE_DEA6 }];
    }
    d.evidenceNote = SEE_DEA6;
    d.narrative = dea6Narrative(fed);
    d.hidden = (d.hidden || []).filter((x) => !DEA6_PARTS.includes(x));
    return d;
  }

  /** Saved data brought up to date: older type names, missing fields, and the single entries of
   * v1.20 (victim's name, charges, vehicle…) moved into the lists. */
  /** v1.95: the charges' Statute Descriptions, in order, without repeats. */
  const chargeDescriptions = (d) => [...new Set(((d && d.charges) || []).map((x) => String((x && x.description) || '').trim()).filter((x) => x && x !== SEE_DEA6))];
  /* v1.110: the IUCR wording before it was written out: [code, old, new]. A Draft form whose
   * Offense Classification is still an old wording gets the new one when it opens (updateOldUcr). */
  const OLD_UCR = [["1025", "Agg: Arson", "Aggravated Arson"], ["051A", "Agg: Handgun", "Aggravated Assault: Handgun"], ["051B", "Agg: Other Firearm", "Aggravated Assault: Other Firearm"], ["0520", "Agg: Knife or Cutting Instrument", "Aggravated Assault: Knife or Cutting Instrument"], ["0530", "Agg: Other Dangerous Weapon", "Aggravated Assault: Other Dangerous Weapon"], ["041A", "Agg: Handgun", "Aggravated Battery: Handgun"], ["041B", "Agg: Other Firearm", "Aggravated Battery: Other Firearm"], ["0420", "Agg: Knife or Cutting Instrument", "Aggravated Battery: Knife or Cutting Instrument"], ["0430", "Agg: Other Dangerous Weapon", "Aggravated Battery: Other Dangerous Weapon"], ["0440", "Agg: Hands, Fist, Feet", "Aggravated Battery: Hands, Fist, Feet"], ["1811", "Poss: Cannabis 30 grms or less", "Possession: Cannabis, 30 Grams or Less"], ["1812", "Poss: Cannabis more than 30 grms", "Possession: Cannabis, More Than 30 Grams"], ["1821", "Delv: Cannabis 10 grms or less", "Manufacture and Delivery: Cannabis, 10 Grams or Less"], ["1822", "Delv: Cannabis over 10 grms", "Manufacture and Delivery: Cannabis, More Than 10 Grams"], ["2010", "Delv: Amphetamine", "Manufacture and Delivery: Amphetamine"], ["2012", "Delv: Cocaine", "Manufacture and Delivery: Cocaine"], ["2013", "Delv: Heroin (Tan)", "Manufacture and Delivery: Heroin (Tan)"], ["2014", "Delv: Heroin (White)", "Manufacture and Delivery: Heroin (White)"], ["2015", "Delv: Hallucinogens", "Manufacture and Delivery: Hallucinogen"], ["2016", "Delv: PCP", "Manufacture and Delivery: PCP"], ["2017", "Delv: Crack Cocaine", "Manufacture and Delivery: Crack Cocaine"], ["2018", "Delv: Synthetic Drugs", "Manufacture and Delivery: Synthetic Drug"], ["2020", "Poss: Amphetamine", "Possession: Amphetamine"], ["2022", "Poss: Cocaine", "Possession: Cocaine"], ["2023", "Poss: Heroin (Tan)", "Possession: Heroin (Tan)"], ["2024", "Poss: Heroin (White)", "Possession: Heroin (White)"], ["2025", "Poss: Hallucinogens", "Possession: Hallucinogen"], ["2026", "Poss: PCP", "Possession: PCP"], ["2027", "Poss: Crack Cocaine", "Possession: Crack Cocaine"], ["2028", "Poss: Synthetic Drugs", "Possession: Synthetic Drug"], ["2031", "Poss: Methamphetamine", "Possession: Methamphetamine"], ["2032", "Delv: Methamphetamine", "Manufacture and Delivery: Methamphetamine"], ["2091", "Forfiet Property: Narcotics", "Forfeited Property: Narcotics"], ["141A", "UUW: Handgun", "Unlawful Use of a Weapon: Handgun"], ["141B", "UUW: Other Firearm", "Unlawful Use of a Weapon: Other Firearm"], ["141C", "UUW: Other Dangerous Weapon", "Unlawful Use of a Weapon: Other Dangerous Weapon"]];
  /** Old short IUCR wording in Offense Classification -> the written-out wording (changes d). The
   * IUCR code entered picks between codes that shared a wording ("Agg: Handgun"); when it can't
   * tell, the wording is left as it is. -> true when changed. */
  function updateOldUcr(d) {
    const o = String((d && d.offense) || '').trim().toLowerCase();
    const hits = o ? OLD_UCR.filter(([, old]) => old.toLowerCase() === o) : [];
    if (!hits.length) return false;
    const code = String(d.ucr || '').trim().split(/\s+/)[0];
    const hit = hits.find(([c]) => c === code) || (new Set(hits.map((x) => x[2])).size === 1 ? hits[0] : null);
    if (!hit) return false;
    d.offense = hit[2];
    if (hit[0] === code) d.offenseFrom = 'ucr';
    return true;
  }

  /** Offense Classification = a charge's Statute Description (the first, unless it already is one),
   * or (v1.110) the IUCR code's description when that is where it came from (offenseFrom 'ucr'). */
  function syncOffense(d) {
    // Charges ticked off ("doesn't apply") leave the box as typed.
    if (Array.isArray(d.hidden) && d.hidden.includes('charges')) return d;
    // v1.110: wording that came from the IUCR code picked stays (the IUCR description wins).
    if (d.offenseFrom === 'ucr' && String(d.offense || '').trim()) return d;
    const descs = chargeDescriptions(d);
    if (descs.length && !descs.includes(String(d.offense || '').trim())) d.offense = descs[0];
    return d;
  }

  function normalize(data) {
    const src = data || {};
    const d = { ...empty(), ...src };
    d.evidence = (Array.isArray(d.evidence) ? d.evidence : []).map((e) => ({ number: e.number, inventory: e.inventory || '', type: OLD_TYPES[e.type] || e.type || '', drug: e.drug || '', weight: e.weight || '', description: e.description || '', photos: Array.isArray(e.photos) ? e.photos.filter((x) => typeof x === 'string') : [], photoLabels: [], ...(Array.isArray(e.custody) && e.custody.length ? { custody: e.custody.filter((x) => x && typeof x === 'object' && x.action).map((x) => Object.fromEntries(['date', 'time', 'action', 'from', 'to', 'purpose'].map((k) => [k, String(x[k] || '')]))) } : {}) }));
    // v1.156: each exhibit's chain of custody (js/custody.js) is kept when there is one.
    // Each photo's label (v1.34), kept in step with the photos.
    d.evidence.forEach((e, i) => { const src0 = (Array.isArray(src.evidence) && src.evidence[i]) || {}; const ls = Array.isArray(src0.photoLabels) ? src0.photoLabels : []; e.photoLabels = e.photos.map((_, j) => String(ls[j] || '')); });
    // A v1.21 single Notifications line becomes the first notification.
    if (typeof src.notifications === 'string') d.notifications = String(src.notifications).trim() ? [{ name: String(src.notifications).trim() }] : [];
    for (const k of Object.keys(LISTS)) d[k] = (Array.isArray(d[k]) ? d[k] : []).map((it) => ({ ...blankItem(k), ...(it && typeof it === 'object' ? it : {}) }));
    // v1.189: the Apartment location code is 090 (it was listed as 909, which is no code).
    if (String(d.locationCode || '').trim() === '909') d.locationCode = '090';
    // v1.93: the State of Illinois as victim gets Relation Code 024 when none is entered.
    for (const v of d.victimsList) if (isStateVictim('victimsList', v) && !String(v.relation || '').trim()) v.relation = govRelation(v);
    d.evidenceNote = String(src.evidenceNote || '');
    // v1.109: "See DEA 6" typed as a charge's statute goes in its description.
    for (const c of d.charges) if (isSee(c.statute)) { c.statute = ''; c.description = SEE_DEA6; }
    // v1.42: Notifications have no Notes box; notes without a name become the name.
    for (const n of d.notifications) if (n.notes && !String(n.name || '').trim()) n.name = n.notes;
    // v1.21's "Unit / Role" text goes to Unit when it isn't one of the roles.
    for (const p of d.personnel) if (p.role === 'UC') p.role = 'UCO'; // renamed in v1.31
    for (const p of d.personnel) if (p.role && !ROLES.includes(p.role)) { p.unit = p.unit || p.role; p.role = ''; }
    const old = (k) => String(src[k] || '').trim();
    if ((src.schema || 1) < 3) {
      if (!d.victimsList.length && (old('victimName') || old('victimDetails'))) d.victimsList.push({ ...blankItem('victimsList'), name: old('victimName') || old('victimDetails'), relation: old('victimRelation') });
      if (!d.offendersList.length && (old('offenderName') || old('offenderDetails'))) d.offendersList.push({ ...blankItem('offendersList'), name: old('offenderName') || old('offenderDetails'), relation: old('offenderRelation') });
      if (old('charges') && typeof src.charges === 'string') d.charges = [{ ...blankItem('charges'), description: old('charges') }];
      if (old('gangAffiliation')) d.gangs.push({ ...blankItem('gangs'), name: old('gangAffiliation') });
      if (old('notArrested') && typeof src.notArrested === 'string') d.notArrested = [{ ...blankItem('notArrested'), name: old('notArrested') }];
      if (old('personnel') && typeof src.personnel === 'string') d.personnel = [{ ...blankItem('personnel'), name: old('personnel') }];
      if (old('vehicle') || old('impound')) d.vehicles.push({ ...blankItem('vehicles'), notes: [old('vehicle'), old('impound')].filter(Boolean).join('; ') });
    }
    // v1.24 and before: one Total Weight / Street Value / Purchase Price line → the first narcotic.
    if (!d.narcotics.length && (old('totalWeight') || old('streetValue') || old('purchasePrice'))) {
      d.narcotics.push({ ...blankItem('narcotics'), amount: old('totalWeight'), value: old('streetValue'), price: old('purchasePrice') });
    }
    for (const o of d.offendersList) { o.unknown = !!o.unknown; if (o.unknown && !String(o.name || '').trim()) o.name = UNKNOWN; }
    // v1.86: the Officer's Report's own IR Number line is gone; one typed there goes to the first
    // offender without one (it stays saved otherwise, so nothing is lost).
    if (old('irNumber')) {
      const o = d.offendersList.find((x) => !String(x.irNumber || '').trim());
      if (o) { o.irNumber = old('irNumber'); delete d.irNumber; }
    }
    for (const k of ['victimName', 'victimRelation', 'victimDetails', 'offenderName', 'offenderRelation', 'offenderDetails', 'gangAffiliation', 'vehicle', 'impound', 'lieutenant', 'lieutenantStar', 'totalWeight', 'streetValue', 'purchasePrice']) delete d[k];
    d.hidden = Array.isArray(d.hidden) ? d.hidden.filter((x) => typeof x === 'string') : [];
    // v1.68: Additional Exhibits: photographs or text-message screenshots that are not tied to an
    // inventory number, numbered on their own (Additional Exhibit 1, photos 1a, 1b…).
    d.extraExhibits = (Array.isArray(src.extraExhibits) ? src.extraExhibits : []).filter((x) => x && typeof x === 'object').map((x) => {
      const photos = Array.isArray(x.photos) ? x.photos.filter((y) => typeof y === 'string') : [];
      const ls = Array.isArray(x.photoLabels) ? x.photoLabels : [];
      return { number: Number(x.number) > 0 ? Number(x.number) : 1, kind: x.kind === 'texts' ? 'texts' : 'photos', title: String(x.title || ''), description: String(x.description || ''), photos, photoLabels: photos.map((_, j) => String(ls[j] || '')) };
    });
    d.extraStart = Number(src.extraStart) > 0 ? Math.floor(Number(src.extraStart)) : 0;
    // v1.48: Status and How Cleared spelled out.
    if (SPELLED[d.status]) d.status = SPELLED[d.status];
    if (SPELLED[d.cleared]) d.cleared = SPELLED[d.cleared];
    // v1.48: a form saved with only the old Agency Report Number keeps it as the R.D. Number.
    if (!String(d.rdNumber || '').trim() && old('caseNumber')) d.rdNumber = old('caseNumber');
    delete d.caseNumber;
    // v1.54: bills saved one by one (denomination, serial, recovered) become one entry per denomination.
    const groups = [];
    for (const it of d.funds) {
      const serials = Array.isArray(it.serials) ? it.serials.map((x) => String(x || '').trim()).filter(Boolean) : [];
      if (it.serial && String(it.serial).trim()) serials.push(String(it.serial).trim());
      const isOld = 'serial' in it || ('recovered' in it && !('quantity' in it && it.quantity !== ''));
      const den = String(it.denomination || '').trim();
      const g = isOld && den ? groups.find((x) => x.denomination === den && x._old) : null;
      if (g) { g.serials.push(...serials); g.quantity = String(Number(g.quantity || 0) + 1); if (it.recovered) g._rec.push(it.recovered); continue; }
      groups.push({ denomination: den, quantity: String(it.quantity || (isOld && (den || serials.length) ? 1 : '') || ''), serials, _old: isOld, _rec: it.recovered ? [it.recovered] : [] });
    }
    const recs = [...new Set(groups.flatMap((g) => g._rec))];
    if (!d.fundsRecovered && recs.length === 1) d.fundsRecovered = recs[0];
    if (!RECOVERED.includes(d.fundsRecovered || '')) d.fundsRecovered = '';
    d.funds = groups.map(({ denomination, quantity, serials }) => ({ denomination, quantity, serials }));
    // v1.54: the Warrant/Subpoena, ASA/AUSA and Judge/Magistrate lines.
    if (!['searchWarrant', 'subpoenaGJ'].includes(d.docKind)) d.docKind = activeOf(d, 'doc');
    if (!['asa', 'ausa'].includes(d.prosKind)) d.prosKind = activeOf(d, 'pros');
    if (d.judgeTitle !== 'Magistrate') d.judgeTitle = 'Judge';
    delete d.extraCopies;
    d.schema = 4;
    // v1.94: an offender's Vehicle / VIN / Plates boxes become its first vehicle ("IL AB12345" splits
    // into the plate state and number); the Officer's Report Vehicles list moves to the first offender.
    for (const o of d.offendersList) {
      o.vehicles = (Array.isArray(o.vehicles) ? o.vehicles : []).map((v) => ({ ...blankVehicle(), ...(v && typeof v === 'object' ? v : {}) }));
      const ov = String(o.vehicle || '').trim(); const vin = String(o.vin || '').trim(); const pl = String(o.plates || '').trim();
      if (ov || vin || pl) {
        const m = /^([A-Za-z]{2})\s+(\S.*)$/.exec(pl);
        const y = /^((?:19|20)\d\d)\s+(.+)$/.exec(ov);
        o.vehicles.unshift({ ...blankVehicle(), year: y ? y[1] : '', make: y ? y[2] : ov, vin, plate: m ? m[2] : pl, state: m ? m[1].toUpperCase() : '' });
      }
      delete o.vehicle; delete o.vin; delete o.plates;
    }
    const oldVehicles = (d.vehicles || []).filter(filled);
    if (oldVehicles.length) {
      if (!d.offendersList.length) d.offendersList.push(blankItem('offendersList'));
      const o = d.offendersList[0];
      const key = (x) => String(x || '').replace(/\s+/g, '').toUpperCase();
      for (const v of oldVehicles) {
        // The same car already on the offender (same VIN or plate) keeps one entry, with the list's details.
        const same = o.vehicles.find((x) => (key(v.vin) && key(x.vin) === key(v.vin)) || (key(v.plate) && key(x.plate) === key(v.plate)));
        if (same) {
          for (const k of ['year', 'make', 'model', 'color', 'plate', 'state', 'vin']) if (String(v[k] || '').trim()) same[k] = String(v[k]).trim();
          if (v.disposition === 'Impound' || v.disposition === 'Tow') same.disposition = v.disposition;
          if (!same.owner) same.owner = [v.ownerName, v.ownerAddress, v.notes].map((x) => String(x || '').trim()).filter(Boolean).join(', ');
          continue;
        }
        // Notes (a v1.20 "vehicle" line) become the Make when there is none; otherwise they join the owner line.
        const notes = String(v.notes || '').trim();
        const make = String(v.make || '').trim() || notes;
        const owner = [v.ownerName, v.ownerAddress, make === notes ? '' : notes].map((x) => String(x || '').trim()).filter(Boolean).join(', ');
        const disposition = v.disposition === 'Impound' || v.disposition === 'Tow' ? v.disposition : /\btow/i.test(notes) ? 'Tow' : /\bimpound/i.test(notes) ? 'Impound' : '';
        o.vehicles.push({ ...blankVehicle(), year: v.year || '', make, model: v.model || '', color: v.color || '', plate: v.plate || '', state: v.state || '', vin: v.vin || '', owner, disposition });
      }
      o.noVehicle = false;
    }
    d.vehicles = [];
    // v1.95: Offense Classification is always one of the charges' Statute Descriptions, word for word
    // (the first one unless another charge's wording was picked). Applies to older drafts too.
    syncOffense(d);
    return d;
  }
  // v1.54: one line holds the search warrant or the subpoena number, one the ASA or the AUSA; the
  // other of each pair is left out of the report and the PDF.
  const SWITCH = { doc: ['searchWarrant', 'subpoenaGJ'], pros: ['asa', 'ausa'] };
  function activeOf(d, group) {
    const [a, b] = SWITCH[group];
    const want = d[`${group}Kind`];
    if (want === a || want === b) return want;
    return String(d[b] || '').trim() && !String(d[a] || '').trim() ? b : a;
  }
  const isHidden = (d, id) => (d.hidden || []).includes(id) || Object.keys(SWITCH).some((g) => SWITCH[g].includes(id) && activeOf(d, g) !== id);
  /** The label of an Officer's Report line, following the switches. */
  function lineLabel(d, k) {
    const doc = activeOf(d, 'doc') === 'subpoenaGJ' ? 'Subpoena' : 'Search Warrant';
    if (k === 'asa' || k === 'ausa') return `${k.toUpperCase()} Approving ${doc}`;
    if (k === 'judge') return `${d.judgeTitle === 'Magistrate' ? 'Magistrate' : 'Judge'} Approving ${doc}`;
    return (FIELDS.find(([key]) => key === k) || [k, k])[1];
  }
  /** Pre-recorded funds as lines: "$20 x 3 - Serial Numbers AA01, AA02, AA03", then the recovered line. */
  function fundsLines(d) {
    const out = (d.funds || []).filter(filled).map((g) => {
      const n = String(g.quantity || '').trim() || (g.serials && g.serials.length ? String(g.serials.length) : '');
      const serials = (g.serials || []).filter((x) => String(x || '').trim());
      const word = g.denomination === 'Electronic Funds' ? 'Reference Number' : 'Serial Number';
      return [[g.denomination, n ? `x ${n}` : ''].filter(Boolean).join(' '), serials.length ? `${word}${serials.length === 1 ? '' : 's'} ${serials.join(', ')}` : ''].filter(Boolean).join(' - ');
    });
    if (out.length && d.fundsRecovered) out.push(d.fundsRecovered);
    return out;
  }

  /** A photo's label under its exhibit: 1a, 1b … 1z, 1aa. */
  function photoLabel(n, j) {
    let x = j; let t = '';
    do { t = String.fromCharCode(97 + (x % 26)) + t; x = Math.floor(x / 26) - 1; } while (x >= 0);
    return `${n}${t}`;
  }

  /** Whole years from a date of birth to a day (both YYYY-MM-DD); '' when unknown. */
  function ageOn(dob, day) {
    const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob || ''); const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || '');
    if (!a || !b) return '';
    let n = Number(b[1]) - Number(a[1]);
    if (b[2] < a[2] || (b[2] === a[2] && b[3] < a[3])) n -= 1;
    return n >= 0 && n < 130 ? String(n) : '';
  }

  /* ---- height (feet and inches), weight (pounds), and ranges for an unknown offender (v1.25) ---- */

  /** "5'10\"", "5 10", "5-10", "5ft 10in", "70in" -> { ft: 5, in: 10 }; not a height -> null. */
  function parseHeight(text) {
    const t = String(text || '').trim().toLowerCase().replace(/[′’]/g, "'").replace(/[″”]/g, '"');
    if (!t) return null;
    let m = /^(\d{2,3})\s*(?:"|in|inches)$/.exec(t);
    if (m) { const n = Number(m[1]); return { ft: Math.floor(n / 12), in: n % 12 }; }
    m = /^(\d)\s*(?:'|ft|feet|-|\s)?\s*(\d{1,2})?\s*(?:"|in|inches)?$/.exec(t);
    if (!m) return null;
    const inch = m[2] ? Number(m[2]) : 0;
    return inch < 12 ? { ft: Number(m[1]), in: inch } : null;
  }
  const heightOf = (ft, inch) => (ft === '' || ft == null ? '' : `${Number(ft)}'${Number(inch || 0)}"`);
  /** The one or two heights in a stored value ("5'10\"" or "5'8\" - 5'11\""). */
  const heightParts = (v) => String(v || '').split(/\s+-\s+|\s*–\s*/).map(parseHeight);
  /** The one or two numbers in a stored weight or age ("180", "180 lbs", "170 - 190"). */
  const numParts = (v) => String(v || '').replace(/lbs?\.?|pounds?/gi, '').split(/\s*[-–]\s*/).map((x) => x.trim());
  const withLbs = (v) => (/^\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?$/.test(String(v || '').trim()) ? `${String(v).trim()} lbs` : String(v || '').trim());
  const UNKNOWN = 'Unknown Offender';

  /** A value as it reads in the report: weights get "lbs", a narcotic amount its unit. */
  function valueText(list, it, k, kind) {
    if (kind === 'phones' || kind === 'serials') return (Array.isArray(it[k]) ? it[k] : []).map((x) => String(x || '').trim()).filter(Boolean).join(', ');
    if (kind === 'vehicles') return (Array.isArray(it[k]) ? it[k] : []).map(vehicleLine).filter(Boolean).join('; ');
    if (kind === 'socials') return (Array.isArray(it[k]) ? it[k] : []).filter(hasText).map((x) => `${String(x.name || '').trim()}${x.app ? ` (${x.app})` : ''}`).join('; ');
    let v = String(it[k] == null ? '' : it[k]).trim();
    if (!v) return '';
    if (kind === 'date') v = longDate(v);
    if (kind === 'weight') v = withLbs(v);
    if (list === 'narcotics' && k === 'amount' && it.unit) v = `${v} ${it.unit}${/^1(\.0+)?$/.test(v) || it.unit === 'mL' || /s$/.test(it.unit) ? '' : 's'}`;
    return v;
  }
  /** The label of a field for an entry: an unknown offender's age, height and weight are ranges. */
  const labelFor = (it, k, label) => (it && it.unknown && ['age', 'height', 'weight'].includes(k) ? `${label} Range` : label);

  // v1.27: a victim that is the State of Illinois has only an officer's name; everyone else has no
  // officer box. isStateVictim is also used by the screen and the PDF.
  const STATE_VICTIM = 'State of Illinois';
  // v1.93: the State of Illinois as victim has Relation Code 024.
  const STATE_RELATION = '024';
  // v1.108: the Federal Government is a victim like the State: name, Relation Code and officer
  // (no Relation Code filled for it).
  const FEDERAL_VICTIM = 'Federal Government';
  const GOV_RELATION = { [STATE_VICTIM.toLowerCase()]: STATE_RELATION, [FEDERAL_VICTIM.toLowerCase()]: '' };
  const isStateVictim = (list, it) => list === 'victimsList' && Object.prototype.hasOwnProperty.call(GOV_RELATION, String((it && it.name) || '').trim().toLowerCase());
  /** The Relation Code a government victim gets when none is typed ('' for none). */
  const govRelation = (it) => GOV_RELATION[String((it && it.name) || '').trim().toLowerCase()] || '';
  /** The fields an entry uses. */
  function fieldsFor(list, it) {
    const all = LISTS[list].fields;
    // v1.109: a "See DEA 6" entry has just the box that says so.
    if (isSeeDea6(list, it)) return all.filter(([k]) => k === DEA6_KEY[list]);
    // v1.82: an offender ticked "No Vehicle" has no Vehicle, VIN or Plates boxes (and none on the PDF).
    if (list === 'offendersList') return it && it.noVehicle ? all.filter(([k]) => k !== 'vehicles') : all;
    if (list !== 'victimsList') return all;
    // The State of Illinois: name, Relation Code (024) and the officer, in that order.
    return isStateVictim(list, it) ? ['name', 'relation', 'officer'].map((k) => all.find(([x]) => x === k)).filter(Boolean) : all.filter(([k]) => k !== 'officer');
  }

  /** One list entry as text: "DOE, John, DOB 01.02.1990, 5'10\", 180 lbs, Black hair…" */
  function itemLine(list, it) {
    if (list === 'funds') return fundsLines({ funds: [it] })[0] || '';
    return fieldsFor(list, it).map(([k, label, kind]) => {
      if (list === 'narcotics' && k === 'unit') return ''; // shown with the amount
      const v = valueText(list, it, k, kind);
      if (!v) return '';
      return k === 'name' || k === 'statute' || k === 'drug' ? v : `${labelFor(it, k, label)}: ${v}`;
    }).filter(Boolean).join(', ');
  }

  // Offender fields copied from a suspect's saved details, if any (v1.23 kept them on the suspect): all but the three
  // on the suspect's own row (name, date of birth, age).
  const SUSPECT_INFO = [...PERSON.filter(([k]) => !['name', 'dob', 'age'].includes(k)), ...RECORD_NUMBERS];
  const nameKey = (n) => String(n || '').trim().replace(/\s+/g, ' ').toLowerCase();

  /** A Details suspect copied into the report's Offenders: the offender with the same name is
   * updated (or an empty one filled, or a new one added). Only filled suspect fields overwrite.
   * Returns { index, added }, or null when the suspect has no name. */
  function suspectToOffender(d, s, day) {
    const name = String((s && s.name) || '').trim();
    if (!name) return null;
    const list = d.offendersList;
    let index = list.findIndex((o) => nameKey(o.name) === nameKey(name));
    let added = false;
    if (index < 0) index = list.findIndex((o) => !filled(o));
    if (index < 0) { list.push(blankItem('offendersList')); index = list.length - 1; added = true; }
    const o = list[index];
    o.name = name;
    if (s.dob) { o.dob = s.dob; o.age = ageOn(s.dob, day); }
    const info = (s && s.info) || {};
    for (const [k] of SUSPECT_INFO) if (String(info[k] || '').trim()) o[k] = String(info[k]).trim();
    // v1.39: the suspect's phone joins the offender's phone numbers.
    const ph = String(info.phone || '').trim();
    if (ph) { o.phones = Array.isArray(o.phones) ? o.phones : []; if (!o.phones.includes(ph)) o.phones.push(ph); }
    // v1.69: and the suspect's moniker its Monikers / Social Media.
    const mon = String(info.moniker || '').trim();
    if (mon) { o.socials = Array.isArray(o.socials) ? o.socials : []; if (!o.socials.some((x) => x && nameKey(x.name) === nameKey(mon))) o.socials.push({ name: mon, app: '' }); }
    return { index, added };
  }

  /** The next exhibit number: one more than the highest used in this case or any case sharing its agency case number. */
  /** v1.42: numbering started again from `start`: the first number from there that this case's
   * exhibits don't use. */
  function nextFrom(start, used) {
    const taken = new Set((used || []).map((n) => parseInt(String(n).replace(/\D+/g, ''), 10)).filter(Number.isFinite));
    let n = Math.max(1, parseInt(start, 10) || 1);
    while (taken.has(n)) n++;
    return n;
  }
  /**
   * v1.107: the exhibits of the cases that share one sequence (one federal jacket number), numbered
   * again in date order: the case with the earliest Date of Occurrence (else its opened date) gets
   * the first numbers, each case keeping its own exhibits in their order. Numbering starts at the
   * lowest number in use (1 if none). Additional Exhibits are numbered on their own and left alone.
   * cases: [{ id, number, date, opened, evidence: [{ number }] }]
   * -> { order: [id], changes: { id: [[old, new], …] }, changed: bool }
   */
  function dateOrderPlan(cases) {
    const num = (n) => parseInt(String(n).replace(/\D+/g, ''), 10);
    const all = (cases || []).flatMap((c) => (c.evidence || []).map((e) => num(e.number))).filter(Number.isFinite);
    let next = all.length ? Math.max(1, Math.min(...all)) : 1;
    const key = (c) => String(c.date || c.opened || '9999-12-31');
    const sorted = [...(cases || [])].sort((a, b) => key(a).localeCompare(key(b)) || String(a.opened || '').localeCompare(String(b.opened || '')) || String(a.number || '').localeCompare(String(b.number || ''), undefined, { numeric: true }));
    const changes = {};
    let changed = false;
    for (const c of sorted) {
      const ev = [...(c.evidence || [])].sort((a, b) => (num(a.number) || 0) - (num(b.number) || 0));
      changes[c.id] = ev.map((e) => { const to = next++; if (num(e.number) !== to) changed = true; return [num(e.number), to]; });
    }
    return { order: sorted.map((c) => c.id), changes, changed };
  }

  function nextExhibit(numbersInUse) {
    const max = (numbersInUse || []).map((n) => parseInt(String(n).replace(/\D+/g, ''), 10)).filter(Number.isFinite).reduce((a, b) => Math.max(a, b), 0);
    return max + 1;
  }

  const shown = (key, v) => {
    const f = FIELDS.find(([k]) => k === key);
    if (!f) return String(v || '');
    if (f[2] === 'check') return v ? 'Yes' : '';
    if (f[2] === 'date') return longDate(v);
    if (f[2] === 'time') return militaryTime(v);
    return String(v == null ? '' : v).trim();
  };
  /** v1.44: military time as written on reports, without the colon: "14:35" -> "1435". */
  const militaryTime = (v) => { const t = String(v == null ? '' : v).trim(); const m = /^(\d{1,2}):(\d{2})$/.exec(t); return m ? `${m[1].padStart(2, '0')}${m[2]}` : t; };

  /** One exhibit as a line: "Exhibit 3, Inventory 123456: Narcotics, Cocaine, 12.4 g. Three bags…" */
  /** v1.68: the next Additional Exhibit number: from the chosen start, else one past the highest. */
  function nextExtra(d) {
    const used = new Set((d.extraExhibits || []).map((x) => Number(x.number)));
    let n = Number(d.extraStart) > 0 ? Number(d.extraStart) : Math.max(0, ...used) + 1;
    while (used.has(n)) n += 1;
    return n;
  }
  const EXTRA_KINDS = [['photos', 'Photographs'], ['texts', 'Text Messages']];
  /** "Additional Exhibit 2a - Text Messages: <title>. <label>" for a photo's caption. */
  function extraCaption(x, j) {
    const kind = (EXTRA_KINDS.find(([k]) => k === x.kind) || EXTRA_KINDS[0])[1];
    const label = String((x.photoLabels || [])[j] || '').trim();
    return `Additional Exhibit ${photoLabel(x.number, j)} - ${kind}${x.title ? `: ${x.title}` : ''}${label ? `. ${label}` : ''}`;
  }
  function extraLine(x) {
    const kind = (EXTRA_KINDS.find(([k]) => k === x.kind) || EXTRA_KINDS[0])[1];
    return `Additional Exhibit ${x.number}: ${kind}${x.title ? `, ${x.title}` : ''}${x.description ? `. ${x.description}` : ''} (${attachCount(x.photos)})`;
  }
  // v1.104: photos and PDFs attached to an exhibit, counted: "2 images", "1 image, 1 PDF".
  function attachCount(paths) {
    const pdf = paths.filter((p) => /\.pdf$/i.test(p)).length;
    const img = paths.length - pdf;
    return [img || !pdf ? `${img} ${img === 1 ? 'image' : 'images'}` : '', pdf ? `${pdf} PDF${pdf === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ');
  }

  function exhibitLine(e) {
    const what = [e.type, e.type === 'Narcotics' ? e.drug : '', e.type === 'Narcotics' ? e.weight : ''].filter(Boolean).join(', ');
    return `Exhibit ${e.number}${e.inventory ? `, Inventory ${e.inventory}` : ''}: ${[what, e.description].filter(Boolean).join('. ') || 'no description'}`;
  }

  /** {{report.*}} values for templates; {{report.evidence}} is the exhibit list, one per line. */
  function context(data) {
    const d = normalize(data);
    const ctx = {};
    for (const [k] of FIELDS) ctx[`report.${k}`] = shown(k, d[k]);
    for (const k of Object.keys(LISTS)) ctx[`report.${k}`] = d[k].filter(filled).map((it) => itemLine(k, it)).join('\n');
    ctx['report.evidence'] = [...d.evidence.map(exhibitLine), ...d.extraExhibits.map(extraLine)].join('\n');
    // Templates written for the single lines before v1.25 still fill in.
    const nar = d.narcotics.filter(filled);
    ctx['report.totalWeight'] = nar.map((n) => [n.drug, valueText('narcotics', n, 'amount')].filter(Boolean).join(' ')).filter(Boolean).join('; ');
    ctx['report.streetValue'] = nar.map((n) => n.value).filter(Boolean).join('; ');
    ctx['report.purchasePrice'] = nar.map((n) => n.price).filter(Boolean).join('; ');
    ctx['report.narrative'] = String(d.narrative || '').trim();
    return ctx;
  }

  /** The filled fields as plain lines, for the AI. Empty ones are left out. */
  function asText(data) {
    const d = normalize(data);
    const lines = [];
    for (const s of SECTIONS) {
      if (isHidden(d, s.id)) continue;
      for (const [k, label, kind] of s.fields) {
        if (kind === 'list') {
          if (isHidden(d, k)) continue;
          if (k === 'funds') { for (const l of fundsLines(d)) lines.push(`Pre-Recorded Funds: ${l}`); continue; }
          for (const it of d[k].filter(filled)) lines.push(`${LISTS[k].item}: ${itemLine(k, it)}`);
          continue;
        }
        if (isHidden(d, k)) continue;
        const v = shown(k, d[k]);
        if (v) lines.push(`${s.id === 'report' ? lineLabel(d, k) : label}: ${v.replace(/\s*\n\s*/g, '; ')}`);
      }
      for (const k of s.lists || []) if (!isHidden(d, k)) for (const it of d[k].filter(filled)) lines.push(`${LISTS[k].item}: ${itemLine(k, it)}`);
    }
    if (!isHidden(d, 'evidence') && String(d.evidenceNote || '').trim()) lines.push(`Evidence: ${String(d.evidenceNote).trim()}`);
    if (!isHidden(d, 'evidence')) for (const e of d.evidence) lines.push(`Evidence ${exhibitLine(e)}`);
    if (!isHidden(d, 'evidence')) for (const x of d.extraExhibits) lines.push(`Evidence ${extraLine(x)}`);
    if (!isHidden(d, 'summary') && String(d.narrative || '').trim()) lines.push(`Summary of investigation (the investigator's own words): ${String(d.narrative).trim()}`);
    return lines.join('\n');
  }

  /** A report (Markdown) made from the fields: a table per section, the evidence, the summary. */
  /**
   * The report as Markdown for the editor (Save as Report), laid out like the PDF (v1.31): each row
   * of boxes on the PDF is a small table, labels on top and the entries under them, in the same
   * order and sections, so the editable report reads like the form.
   */
  /** The report's title (v1.39): the Officer Report Type picked goes after it ("Supplementary Report - Purchase"). */
  const titleFor = (d) => (d && d.activity ? `Supplementary Report - ${d.activity}` : 'Supplementary Report');
  /** A report title not already in `taken` (lower-case titles): "X", then "X 2", "X 3" (v1.41). */
  function uniqueTitle(base, taken) {
    const has = (t) => taken.has(t.toLowerCase());
    if (!has(base)) return base;
    let n = 2;
    while (has(`${base} ${n}`)) n++;
    return `${base} ${n}`;
  }
  function toMarkdown(data, title = titleFor(data)) {
    const d = normalize(data);
    const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, '; ').trim();
    const label = (k) => (FIELDS.find(([key]) => key === k) || [k, k])[1];
    const out = [`# ${title}`, ''];
    // A row of boxes: | Label | Label |, then the entries.
    const row = (cells) => {
      const cs = cells.map((c) => (typeof c === 'string' ? [label(c), shown(c, d[c])] : c));
      out.push(`| ${cs.map(([l]) => esc(l)).join(' | ')} |`, `|${cs.map(() => '---').join('|')}|`, `| ${cs.map(([, v]) => esc(v) || ' ').join(' | ')} |`, '');
    };
    const table = (heads, rows) => { if (!rows.length) return; out.push(`| ${heads.map(esc).join(' | ')} |`, `|${heads.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map((v) => esc(v) || ' ').join(' | ')} |`), ''); };
    const band = (t) => out.push(`## ${t}`, '');
    const on = (id) => !isHidden(d, id);
    // A list: one table, a column per field.
    const list = (key) => {
      const L = LISTS[key];
      const items = d[key].filter(filled);
      if (!items.length || isHidden(d, key)) return;
      out.push(`**${L.title}**`, '');
      table(['#', ...L.fields.filter(([k]) => !(key === 'narcotics' && k === 'unit')).map(([, l]) => l)],
        items.map((it, i) => [String(i + 1), ...L.fields.filter(([k]) => !(key === 'narcotics' && k === 'unit')).map(([k, , kind]) => valueText(key, it, k, kind))]));
    };

    if (on('numbers')) { row(['rdNumber', 'eventNumber', 'incidentNumber', 'raidNumber']); row(['activity']); }
    if (on('offense')) {
      band('Offense');
      row(['offense', 'ucr']); row(['address', 'locationType', 'locationCode']); row(['date', 'time', 'beatOccurrence', 'beatAssigned']);
    }
    if (on('people')) {
      band('Victims and Offenders');
      row(['victims', 'offenders', 'arrested', 'methodCode']);
      list('victimsList'); list('offendersList');
    }
    if (on('assignment')) {
      band('Assignment');
      row(['method', 'unit', 'safeMethod', 'residence']); row(['arrestUnit', 'adults', 'juveniles', 'fire', 'gang']);
    }
    if (on('update')) {
      band('Update Information');
      const tick = (k) => [label(k), d[k] ? '[X]' : '[ ]'];
      row(['victimVerified', 'offenderVerified', 'propertyVerified', 'circumstancesVerified'].map(tick));
      row(['victimUpdated', 'offenderUpdated', 'propertyUpdated', 'circumstancesUpdated'].map(tick));
      row(['status', 'cleared']);
    }
    if (on('report')) {
      band(`Officer's Report${d.activity ? ` - ${d.activity}` : ''}`);
      const report = SECTIONS.find((s) => s.id === 'report');
      const lines = [];
      for (const [k, l, kind] of report.fields) {
        if (kind === 'list' || k === 'courtDate') continue;
        if (k === 'courtBranch') { const c = courtLine(d, shown); if (c) lines.push(c); continue; }
        if (isHidden(d, k)) continue;
        lines.push([lineLabel(d, k), shown(k, d[k])]);
      }
      table(["Officer's Report", 'Entry'], lines);
      if (!isHidden(d, 'funds') && fundsLines(d).length) table(['Pre-Recorded Funds'], fundsLines(d).map((x) => [x]));
      list('narcotics');
      for (const key of report.lists) list(key);
    }
    const evNote = String(d.evidenceNote || '').trim();
    if (on('evidence') && evNote) { band('Evidence Inventoried'); out.push(evNote, ''); }
    if (on('evidence') && d.evidence.length) {
      if (!evNote) band('Evidence Inventoried');
      table(['Exhibit', 'Inventory No.', 'Type', 'Narcotic Type', 'Weight', 'Description'],
        d.evidence.map((e) => [String(e.number), e.inventory, e.type, e.type === 'Narcotics' ? e.drug : '', e.type === 'Narcotics' ? e.weight : '', e.description]));
    }
    if (on('evidence') && d.extraExhibits.length) {
      if (!d.evidence.length && !evNote) band('Evidence Inventoried');
      table(['Additional Exhibit', 'Kind', 'Title', 'Images', 'Description'],
        d.extraExhibits.map((x) => [String(x.number), (EXTRA_KINDS.find(([k]) => k === x.kind) || EXTRA_KINDS[0])[1], x.title, String(x.photos.length), x.description]));
    }
    if (on('summary')) { band('Summary of Investigation'); out.push(String(d.narrative || '').trim() || '[CONFIRM: summary of investigation]', ''); }
    if (on('approval')) {
      band('Submission and Approval');
      table(['Officer', 'Name', 'Star', 'Date', 'Time', 'Signature'], [
        ['Reporting Officer', d.reportingOfficer, d.reportingStar, shown('dateSubmitted', d.dateSubmitted), d.timeSubmitted, ''],
        ['Secondary Reporting Officer', d.secondOfficer, d.secondStar, shown('secondDate', d.secondDate), d.secondTime, ''],
        ['Supervisor Approval', d.supervisor, d.supervisorStar, shown('dateApproved', d.dateApproved), d.timeApproved, ''],
      ]);
    }
    return out.join('\n');
  }

  const PLACEHOLDERS = [...FIELDS.map(([k]) => `report.${k}`), 'report.totalWeight', 'report.streetValue', 'report.purchasePrice', ...Object.keys(LISTS).map((k) => `report.${k}`), 'report.evidence', 'report.narrative'];

  /* v1.153: the checklist before Save as Report: the exhibits the narrative mentions against the
   * evidence list, and the narrative's dates in order (and none in the future). -> { items: [{ ok,
   * text }], problems } */
  const MONTHS_LC = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  function narrativeExhibits(text) {
    const out = new Set();
    const re = /(additional\s+)?\b(?:exhibits?|exh\.?|ex\.)\s*#?\s*(\d{1,4}(?:\s*(?:,|and|&|-|–|through|to)\s*#?\d{1,4})*)/gi;
    let m;
    while ((m = re.exec(String(text || '')))) {
      if (m[1]) continue; // "Additional Exhibit 2" is an additional exhibit, numbered on its own
      const parts = m[2].split(/\s*(,|and|&)\s*/i).filter((x) => /\d/.test(x));
      for (const p of parts) {
        const r = p.match(/(\d+)\s*(?:-|–|through|to)\s*#?(\d+)/i);
        if (r && Number(r[2]) >= Number(r[1]) && Number(r[2]) - Number(r[1]) < 200) for (let n = Number(r[1]); n <= Number(r[2]); n += 1) out.add(n);
        else for (const d of p.match(/\d+/g) || []) out.add(Number(d));
      }
    }
    return [...out].sort((a, b) => a - b);
  }
  function narrativeDates(text) {
    const s = String(text || '');
    const out = [];
    const pad = (n) => String(n).padStart(2, '0');
    const push = (at, y, mo, d, raw) => {
      if (y < 100) y += 2000;
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return;
      if (/\b(dob|born|d\.o\.b\.?|date of birth)\W{0,4}$/i.test(s.slice(Math.max(0, at - 18), at))) return;
      out.push({ at, iso: `${y}-${pad(mo)}-${pad(d)}`, raw });
    };
    let m;
    const num = /\b(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/g;
    while ((m = num.exec(s))) push(m.index, Number(m[3]), Number(m[1]), Number(m[2]), m[0]);
    const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
    while ((m = iso.exec(s))) push(m.index, Number(m[1]), Number(m[2]), Number(m[3]), m[0]);
    const long = new RegExp(`\\b(${MONTHS_LC.join('|')}|${MONTHS_LC.map((x) => x.slice(0, 3)).join('|')})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'gi');
    while ((m = long.exec(s))) push(m.index, Number(m[3]), MONTHS_LC.findIndex((x) => x.startsWith(m[1].toLowerCase().slice(0, 3))) + 1, Number(m[2]), m[0]);
    return out.sort((a, b) => a.at - b.at);
  }
  function sendChecklist(d, today) {
    const items = [];
    const text = String((d && d.narrative) || '');
    const listed = new Set(((d && d.evidence) || []).map((e) => parseInt(String(e.number).replace(/\D+/g, ''), 10)).filter(Number.isFinite));
    const said = narrativeExhibits(text);
    const missing = said.filter((n) => !listed.has(n));
    const unsaid = isHidden(d, 'evidence') || !text.trim() ? [] : [...listed].sort((a, b) => a - b).filter((n) => !said.includes(n));
    const ex = (ns) => `Exhibit${ns.length > 1 ? 's' : ''} ${ns.length > 1 ? `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}` : ns[0]}`;
    if (missing.length) items.push({ ok: false, text: `The narrative mentions ${ex(missing)}, which ${missing.length === 1 ? 'is' : 'are'} not in the evidence list.` });
    if (unsaid.length) items.push({ ok: false, text: `${ex(unsaid)} ${unsaid.length === 1 ? 'is' : 'are'} in the evidence list but not mentioned in the narrative.` });
    if (!missing.length && !unsaid.length && (said.length || listed.size)) items.push({ ok: true, text: 'The exhibits in the narrative match the evidence list.' });
    const dates = narrativeDates(text);
    let back = null;
    for (let i = 1; i < dates.length && !back; i += 1) if (dates[i].iso < dates[i - 1].iso) back = [dates[i - 1], dates[i]];
    if (back) items.push({ ok: false, text: `The dates are out of order: ${back[1].raw} comes after ${back[0].raw}.` });
    const future = today ? dates.filter((x) => x.iso > today) : [];
    if (future.length) items.push({ ok: false, text: `${future.map((x) => x.raw).join(', ')} ${future.length === 1 ? 'is' : 'are'} in the future.` });
    if (dates.length > 1 && !back && !future.length) items.push({ ok: true, text: 'The dates in the narrative are in order.' });
    if (!text.trim() && !isHidden(d, 'summary')) items.push({ ok: false, text: 'The Summary of Investigation is empty.' });
    return { items, problems: items.filter((x) => !x.ok).length };
  }

  const api = { narrativeExhibits, narrativeDates, sendChecklist, chargeDescriptions, syncOffense, OFFENDER_VEHICLE, VEHICLE_DISPOSITIONS, blankVehicle, vehicleLine, CUSTODY, SWITCH, activeOf, lineLabel, fundsLines, DENOMINATIONS, RECOVERED, SPELLED, shortCode, MULTI, SOCIAL_APPS, STATE_VICTIM, STATE_RELATION, FEDERAL_VICTIM, govRelation, isStateVictim, SEE_DEA6, dea6Narrative, seeDea6, isSeeDea6, narcoticChoices, updateOldUcr, fieldsFor, SECTIONS, FIELDS, LISTS, PICKS, ROLES, OPTIONAL_LINES, OPTIONAL_LISTS, courtLine, titleFor, uniqueTitle, militaryTime, NARCOTIC_UNITS, UNKNOWN, SUSPECT_INFO, suspectToOffender, parseHeight, heightOf, heightParts, numParts, withLbs, valueText, labelFor, ageOn, photoLabel, EXTRA_PARTS, EVIDENCE_TYPES, DRUG_TYPES, PLACEHOLDERS, empty, blankItem, filled, normalize, isHidden, nextExhibit, nextFrom, dateOrderPlan, exhibitLine, nextExtra, EXTRA_KINDS, extraCaption, extraLine, itemLine, shown, context, asText, toMarkdown };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVReportFields = api;
})(this);
