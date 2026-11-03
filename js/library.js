/* CaseVault — the Library the AI learns from, and its writing behaviors.
 *
 * Library (CaseVault-Data\library on the SSD): your own sample documents and directives.
 *   Report examples   finished reports written the way you want (DEA-6, DEA-7, DEA-202…)
 *   Warrant examples  affidavits and warrants to copy the structure of
 *   Directives        policies and directives the AI must follow and may cite
 *   Other             anything else to keep at hand
 * Draft with AI sends the chosen examples as "write like this" (never as facts) and the chosen
 * directives as rules, to the local AI only.
 *
 * Writing behaviors: the instruction prompt for how the AI writes (DEA-6 style by default). The
 * built-in ones can be edited, and you can add your own, in Vault → AI writing behavior.
 *
 * Plain logic, no DOM: the tests run it under Node.
 */
'use strict';

(function (root) {
  const CATEGORIES = [
    { key: 'examples', folder: 'Report examples', label: 'Report Examples', role: 'example', icon: 'journal-bookmark', hint: 'Finished reports written the way you want: DEA-6, DEA-7, DEA-202, supplementary reports.' },
    { key: 'warrants', folder: 'Warrant examples', label: 'Warrant Examples', role: 'example', icon: 'file-earmark-ruled', hint: 'Search and arrest warrants and affidavits to follow.' },
    { key: 'directives', folder: 'Directives', label: 'Directives', role: 'directive', icon: 'bookshelf', hint: 'Policies and directives the AI must follow and can cite.' },
    { key: 'other', folder: 'Other', label: 'Other', role: 'example', icon: 'folder', hint: 'Anything else to keep at hand.' },
  ];
  const category = (key) => CATEGORIES.find((c) => c.key === key) || null;
  const categoryOfFolder = (folder) => CATEGORIES.find((c) => c.folder === folder) || null;

  // Which document a sample is an example of (matches the draft's document type).
  const DOC_TYPES = [
    ['any', 'Any Document'], ['dea6', 'DEA Style'], ['dea7', 'DEA 7'], ['dea7a', 'DEA 7a'], ['dea202', 'DEA 202'],
    ['affidavit', 'Affidavit'], ['warrant', 'Warrant'], ['summary', 'Case Summary'], ['subpoena', 'Subpoena'], ['memo', 'Memo'], ['complaint', 'Criminal Complaint'],
  ];

  /** Best guess of what a sample file is, from its name. */
  function guessDocType(name) {
    const n = String(name || '').toLowerCase().replace(/[_]+/g, ' ');
    if (/dea[\s-]?6\b|dea[\s-]?6[^0-9]|report of investigation|\broi\b/.test(n)) return 'dea6';
    if (/dea[\s-]?7a\b|non[\s-]?drug/.test(n)) return 'dea7a';
    if (/dea[\s-]?7\b|drug (evidence|property|exhibit)/.test(n)) return 'dea7';
    if (/dea[\s-]?202\b|personal history/.test(n)) return 'dea202';
    if (/affidavit|affiant|probable cause/.test(n)) return 'affidavit';
    if (/warrant/.test(n)) return 'warrant';
    if (/subpoena/.test(n)) return 'subpoena';
    if (/summary/.test(n)) return 'summary';
    if (/memo/.test(n)) return 'memo';
    if (/complaint/.test(n)) return 'complaint';
    return 'any';
  }

  /**
   * The library items the AI should use for a draft: examples of this document type (then any-type
   * ones), and directives marked "always". items: [{ path, name, category, docType, always }].
   */
  function pickForDraft(items, docType, max = 3) {
    const examples = items.filter((i) => (category(i.category) || {}).role === 'example');
    const exact = examples.filter((i) => i.docType === docType);
    const any = examples.filter((i) => !i.docType || i.docType === 'any');
    const alsoAffidavit = docType === 'affidavit' ? examples.filter((i) => i.docType === 'warrant') : docType === 'warrant' ? examples.filter((i) => i.docType === 'affidavit') : [];
    const picked = [...exact, ...alsoAffidavit, ...(exact.length || alsoAffidavit.length ? [] : any)].slice(0, max);
    const directives = items.filter((i) => i.category === 'directives' && i.always);
    return { examples: picked.map((i) => i.path), directives: directives.map((i) => i.path) };
  }

  /* ---------- writing behaviors ---------- */

  const BUILTIN_BEHAVIORS = [
    {
      id: 'dea6',
      name: 'DEA Style - Report of Investigation',
      prompt: [
        'Write in the style of a DEA-6 Report of Investigation.',
        '- Third person, past tense, factual and objective. No opinions, speculation or conclusions the facts do not support.',
        '- Refer to agents and officers by title and surname: SA [surname], TFO [surname], GS [surname]. Write individuals\' surnames in capital letters (for example John DOE) as is customary.',
        '- Start with the header lines as placeholders when the facts are not in the material: File No., File Title, G-DEP Identifier, Program Code, By, At, Date Prepared.',
        '- Then SYNOPSIS: two or three sentences summarising the event.',
        '- Then DETAILS: numbered paragraphs in time order. Each paragraph covers one event and starts with the date, the approximate time and the place, for example "1. On March 14, 2026, at approximately 9:45 p.m., SA DOE …".',
        '- Refer to evidence as exhibits (Exhibit 1, Exhibit 2) and say that drug evidence is documented on a DEA-7.',
        '- End with INDEXING: each person, business, vehicle and telephone number mentioned, one per line, with the identifying details from the material and [CONFIRM: NADDIS] where it is missing.',
      ].join('\n'),
    },
    {
      id: 'narrative',
      name: 'Plain Narrative Police Report',
      prompt: [
        'Write a plain narrative police report in the first person ("I"), past tense, in time order.',
        '- Short paragraphs, each starting with the time where known.',
        '- Plain, specific language; say who, what, when, where and how, and quote statements exactly as recorded.',
        '- No opinions or legal conclusions beyond what the facts support.',
      ].join('\n'),
    },
    {
      id: 'legal',
      name: 'Affidavit - Formal Legal',
      prompt: [
        'Write formal, sworn-document language in the first person of the affiant.',
        '- Numbered paragraphs; first the affiant\'s training and experience, then the facts in time order, then why they establish probable cause.',
        '- Precise and conservative wording: attribute every fact to its source (a report, a witness, an observation).',
        '- End with signature and jurat placeholders.',
      ].join('\n'),
    },
    {
      id: 'brief',
      name: 'Brief Summary',
      prompt: 'Write briefly: a short overview paragraph, then bullet points with the key facts, dates and open questions. No filler.',
    },
  ];

  /** The behaviors to choose from: the saved list (built-ins edited or added), else the built-ins. */
  function behaviorsOf(settings) {
    const saved = settings && Array.isArray(settings.aiBehaviors) ? settings.aiBehaviors.filter((b) => b && b.id && b.name) : [];
    const out = BUILTIN_BEHAVIORS.map((b) => ({ ...b, builtin: true, ...(saved.find((s) => s.id === b.id) || {}) }));
    for (const s of saved) if (!out.some((b) => b.id === s.id)) out.push({ ...s, builtin: false });
    return out;
  }
  const defaultBehaviorId = (settings) => (settings && settings.aiBehaviorDefault) || 'dea6';
  const behaviorById = (settings, id) => behaviorsOf(settings).find((b) => b.id === id) || behaviorsOf(settings)[0];

  /* ---------- v1.183: the language bank: warrant and subpoena types ---------- */
  // Each type's required elements, as reminders: a draft that doesn't seem to cover one is flagged.
  // The checks look for the usual words only; they never judge whether the element is enough.
  const E = {
    affiant: ['The affiant\'s training and experience', /training and experience|\byears? (?:of|as an?|with)\b/i],
    pc: ['Probable cause stated', /probable cause/i],
    place: ['The place described in particular', /described as|located at|\bpremises\b|place to be searched|single[- ]family|apartment|unit \w+/i],
    items: ['The items to be seized', /to be seized|search(?:ed)? for and seiz|evidence of|\bseize\b/i],
    nexus: ['The link between the place and the crime', /(?:at|inside|in|from|into|out of) the (?:residence|premises|location|house|apartment|vehicle|garage)|stored at|kept at|returned to the/i],
    recent: ['How recent the information is', /within the (?:last|past)|\b(?:\d+|twenty[- ]four|forty[- ]eight|seventy[- ]two)\s+hours\b|days? (?:ago|before)|\brecent(?:ly)?\b/i],
    vehicle: ['The vehicle described (make, model, plate or VIN)', /\bVIN\b|license plate|\bplate\b|\bmake\b|\bmodel\b/i],
    device: ['The device or account described (number, IMEI, serial)', /\bIMEI\b|serial number|phone number|telephone number|account/i],
    data: ['The data to be searched for', /\bdata\b|records|messages|photographs|call logs|location information/i],
    person: ['The person described', /date of birth|\bDOB\b|described as|height|weight/i],
    sample: ['The sample to be taken', /buccal|\bswab|\bDNA\b|sample/i],
    install: ['Installing the device, and for how long', /(?:install|attach|place)\w*[\s\S]{0,200}?(?:\d+\s*days|period of)/i],
    relevance: ['Certified relevant to an ongoing investigation', /relevant to an ongoing (?:criminal )?investigation/i],
    trigger: ['The triggering event', /triggering|upon (?:the )?delivery|once the (?:package|parcel)/i],
    offense: ['The offense and the statute', /\bILCS\b|U\.S\.C\.|statute|in violation of|committed the offense/i],
    custodian: ['The custodian of records', /custodian of records|keeper of records/i],
    records: ['The records asked for', /records|subscriber|account|statements/i],
    range: ['The date range of the records', /(?:from|between)\b.{0,60}\b(?:to|and|through)\b/i],
    returnBy: ['When and where to produce them', /on or before|return(?:able)? (?:date|by)|produce\b/i],
  };
  const WARRANT_TYPES = [
    { key: 'residence', label: 'Search Warrant: Residence', doc: 'affidavit', elements: ['affiant', 'pc', 'place', 'items', 'nexus', 'recent'] },
    { key: 'vehicle', label: 'Search Warrant: Vehicle', doc: 'affidavit', elements: ['affiant', 'pc', 'vehicle', 'items', 'nexus', 'recent'] },
    { key: 'phone', label: 'Search Warrant: Phone or Electronic Data', doc: 'affidavit', elements: ['affiant', 'pc', 'device', 'data', 'nexus'] },
    { key: 'person', label: 'Search Warrant: Person or DNA', doc: 'affidavit', elements: ['affiant', 'pc', 'person', 'sample'] },
    { key: 'gps', label: 'GPS Tracking Warrant', doc: 'affidavit', elements: ['affiant', 'pc', 'vehicle', 'install'] },
    { key: 'pen', label: 'Pen Register / Trap and Trace', doc: 'affidavit', elements: ['device', 'relevance'] },
    { key: 'anticipatory', label: 'Anticipatory Search Warrant', doc: 'affidavit', elements: ['affiant', 'pc', 'place', 'items', 'trigger'] },
    { key: 'arrest', label: 'Arrest Warrant', doc: 'affidavit', elements: ['pc', 'person', 'offense'] },
    { key: 'sub-phone', label: 'Subpoena: Phone Records', doc: 'subpoena', elements: ['custodian', 'device', 'records', 'range', 'returnBy'] },
    { key: 'sub-bank', label: 'Subpoena: Bank Records', doc: 'subpoena', elements: ['custodian', 'records', 'range', 'returnBy'] },
    { key: 'sub-utility', label: 'Subpoena: Utility Records', doc: 'subpoena', elements: ['custodian', 'records', 'range', 'returnBy'] },
    { key: 'sub-other', label: 'Subpoena: Other Records', doc: 'subpoena', elements: ['custodian', 'records', 'returnBy'] },
  ];
  const warrantType = (key) => WARRANT_TYPES.find((t) => t.key === key) || null;
  const typesFor = (doc) => WARRANT_TYPES.filter((t) => t.doc === doc);
  /** The required elements of a type, each found in the text or not. -> [{ key, label, found }] */
  function elementCheck(text, key) {
    const t = warrantType(key);
    if (!t) return [];
    return t.elements.map((k) => ({ key: k, label: E[k][0], found: E[k][1].test(String(text || '')) }));
  }
  /** Your approved paragraphs for a type (settings.languageBank), as text for the AI. */
  function bankText(bank, key) {
    const list = (bank || []).filter((x) => x && x.type === key && String(x.text || '').trim());
    return list.map((x) => `### ${String(x.title || 'Paragraph').trim()}\n${String(x.text).trim()}`).join('\n\n');
  }

  const api = { WARRANT_TYPES, warrantType, typesFor, elementCheck, bankText, CATEGORIES, category, categoryOfFolder, DOC_TYPES, guessDocType, pickForDraft, BUILTIN_BEHAVIORS, behaviorsOf, defaultBehaviorId, behaviorById };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVLibrary = api;
})(this);
