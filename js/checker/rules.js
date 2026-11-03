/* CaseVault checker — Layer 1: rule-based, deterministic fact comparison.
 *
 * Extracts hard facts from every sentence (dates, times, names, case/report numbers, addresses,
 * plates, phone numbers, money amounts, counts), normalizes them, and compares them across the
 * affidavit and the reports, and across the reports themselves.
 *
 * Input documents: { id, name, role: 'affidavit' | 'report', paragraphs: [{ index, page, text }] }
 * Output flags:    see makeFlag() below.
 * Pure functions (no DOM), so they run under Node for the unit tests.
 */
'use strict';

(function (root) {
  const T = typeof module !== 'undefined' && module.exports ? require('./nlp.js') : root.CVText;

  /* ------------------------------------------------------------------ */
  /* Extraction                                                          */
  /* ------------------------------------------------------------------ */

  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const MONTH_RE = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUNE?|JULY?|AUG(?:UST)?|SEPT?(?:EMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)';
  const NUMBER_WORDS = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
    thirty: 30, forty: 40, fifty: 50, dozen: 12, single: 1, both: 2, several: null,
  };
  const pad2 = (n) => String(n).padStart(2, '0');

  const TYPE_LABEL = {
    date: 'Date', time: 'Time', name: 'Name', number: 'Case/report number', address: 'Address',
    plate: 'Licence plate', phone: 'Phone number', money: 'Amount', count: 'Count', weight: 'Weight',
    total: 'Total', buy: 'Buy', inventory: 'Inventory number', narrative: 'Narrative',
  };

  // Collects facts while remembering which characters are already used, so e.g. the digits of
  // a date are not also read as a count.
  function collector(sentence) {
    const facts = [];
    const used = new Uint8Array(sentence.length);
    return {
      facts,
      free(start, end) { for (let i = start; i < end; i++) if (used[i]) return false; return true; },
      add(type, value, start, end, extra = {}) {
        if (!this.free(start, end)) return false;
        used.fill(1, start, end);
        facts.push({ type, value, display: sentence.slice(start, end).trim(), start, end, ...extra });
        return true;
      },
    };
  }

  function each(re, s, fn) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))) { fn(m); if (m[0] === '') re.lastIndex++; }
  }

  function year4(y) {
    if (!y) return null;
    const n = Number(y);
    return y.length === 2 ? (n < 70 ? 2000 + n : 1900 + n) : n;
  }

  function dateValue(y, m, d) {
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    return `${y ? String(y) : 'XXXX'}-${pad2(m)}-${pad2(d)}`; // XXXX = year not stated
  }

  function extractDates(s, c) {
    each(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, s, (m) => {
      const v = dateValue(Number(m[1]), Number(m[2]), Number(m[3]));
      if (v) c.add('date', v, m.index, m.index + m[0].length);
    });
    each(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g, s, (m) => {
      let mo = Number(m[1]);
      let d = Number(m[2]);
      if (mo > 12 && d <= 12) [mo, d] = [d, mo]; // clearly day-first
      const v = dateValue(year4(m[3]), mo, d);
      if (v) c.add('date', v, m.index, m.index + m[0].length);
    });
    each(new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, 'g'), s, (m) => {
      const v = dateValue(year4(m[3]), MONTHS[m[1].slice(0, 3).toLowerCase()], Number(m[2]));
      if (v) c.add('date', v, m.index, m.index + m[0].length);
    });
    each(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:day\\s+of\\s+)?${MONTH_RE}\\.?,?(?:\\s+(\\d{4}))?\\b`, 'g'), s, (m) => {
      const v = dateValue(year4(m[3]), MONTHS[m[2].slice(0, 3).toLowerCase()], Number(m[1]));
      if (v) c.add('date', v, m.index, m.index + m[0].length);
    });
  }

  function timeValue(h, min) {
    if (!(h >= 0 && h <= 23 && min >= 0 && min <= 59)) return null;
    return `${pad2(h)}:${pad2(min)}`;
  }
  const to24 = (h, ap) => (ap === 'a' ? (h === 12 ? 0 : h) : (h === 12 ? 12 : h + 12));

  function extractTimes(s, c) {
    each(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])\.?\s?m\b\.?/gi, s, (m) => {
      const h = Number(m[1]);
      if (h < 1 || h > 12) return;
      const v = timeValue(to24(h, m[3].toLowerCase()), Number(m[2]));
      if (v) c.add('time', v, m.index, m.index + m[0].length);
    });
    each(/\b(\d{1,2})\s*([ap])\.?\s?m\b\.?/gi, s, (m) => {
      const h = Number(m[1]);
      if (h < 1 || h > 12) return;
      c.add('time', timeValue(to24(h, m[2].toLowerCase()), 0), m.index, m.index + m[0].length);
    });
    each(/\b([01]?\d|2[0-3])([0-5]\d)\s*(?:hours|hrs|hr)\b\.?/gi, s, (m) => {
      c.add('time', timeValue(Number(m[1]), Number(m[2])), m.index, m.index + m[0].length);
    });
    each(/\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/g, s, (m) => {
      c.add('time', timeValue(Number(m[1]), Number(m[2])), m.index, m.index + m[0].length);
    });
    each(/\b(noon|midnight)\b/gi, s, (m) => {
      c.add('time', m[1].toLowerCase() === 'noon' ? '12:00' : '00:00', m.index, m.index + m[0].length);
    });
  }

  function extractPhones(s, c) {
    each(/(?:\+?1[\s.-]?)?\(?\b(\d{3})\)?[\s.-]?(\d{3})[\s.-](\d{4})\b/g, s, (m) => {
      c.add('phone', m[1] + m[2] + m[3], m.index, m.index + m[0].length);
    });
  }

  function extractMoney(s, c) {
    const cents = (whole, frac) => String(Math.round(Number(whole.replace(/,/g, '')) * 100 + Number((frac || '0').padEnd(2, '0'))));
    each(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\b/g, s, (m) => c.add('money', cents(m[1], m[2]), m.index, m.index + m[0].length));
    each(/\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(?:dollars|USD)\b/gi, s, (m) => c.add('money', cents(m[1], m[2]), m.index, m.index + m[0].length));
  }

  /* v1.168: inventory numbers ("Inventory #12345678", "Inv. Nos. 12345678, 12345679 and 12345680"):
   * the evidence a buy produced, which the Buy report and its Surveillance report must both give. */
  const INV_RE = /\b(?:inventory|inv\.?)(?:\s+(?:numbers?|nos?\.?|nums?\.?|#'?s?))?\s*[:#]?\s*#?\s*(\d{5,10}(?:\s*(?:,|&|\/|\band\b|,\s*and\b)\s*#?\s*\d{5,10})*)\b/gi;
  function extractInventory(s, c) {
    each(INV_RE, s, (m) => {
      const listAt = m.index + m[0].length - m[1].length;
      each(/\d{5,10}/g, m[1], (n) => c.add('inventory', n[0], listAt + n.index, listAt + n.index + n[0].length));
    });
  }

  const NUMBER_LABELS = 'case|report|incident|file|docket|citation|cad|event|complaint|warrant|arrest|booking|item|evidence|property|offense|offence|tracking|receipt|serial|badge|vin';
  function extractNumbers(s, c) {
    const re = new RegExp(`\\b(${NUMBER_LABELS})(?:\\s+(?:number|no\\.?|num\\.?|nr\\.?)|\\s*#)?\\s*[:#=]?\\s*(?:#\\s*)?([A-Z0-9][A-Z0-9-]*\\d[A-Z0-9-]*)`, 'gi');
    each(re, s, (m) => {
      const value = m[2].toUpperCase().replace(/-+$/, '');
      if (value.replace(/-/g, '').length < 4) return;
      const at = m.index + m[0].length - m[2].length;
      c.add('number', value, at, at + m[2].length, { key: m[1].toLowerCase() });
    });
    each(/(?:\bNo\.|#)\s*([A-Z0-9][A-Z0-9-]*\d[A-Z0-9-]*)/g, s, (m) => {
      const value = m[1].toUpperCase().replace(/-+$/, '');
      if (value.replace(/-/g, '').length < 4) return;
      const at = m.index + m[0].length - m[1].length;
      c.add('number', value, at, at + m[1].length, { key: 'number' });
    });
  }

  // v1.162: the address is read into one canonical form (nlp.js normalizeAddress), so "1420 N. Fifth
  // Avenue, Apt. #3-B" and "1420 North 5th Ave #3B" are the same address. key = the street alone.
  function extractAddresses(s, c) {
    const re = /\b(\d{1,6})\s+((?:(?:N|S|E|W|NE|NW|SE|SW|North|South|East|West)\.?\s+)?(?:[A-Z0-9][A-Za-z0-9'.]*\s+){1,3}?)(Street|Str|St|Avenue|Ave|Av|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl|Highway|Hwy|Parkway|Pkwy|Terrace|Ter|Circle|Cir|Trail|Trl|Square|Sq|Alley|Aly|Expressway|Expy|Freeway|Fwy)\b\.?(?:,?\s*(?:Apt|Apartment|Unit|Suite|Ste|Room|Rm|#)\.?\s*#?\s*([A-Z0-9-]+))?/gi;
    each(re, s, (m) => {
      const value = T.normalizeAddress(m[0]);
      const key = value.replace(/^\d+\s+/, '').replace(/\s+#\S+$/, '');
      c.add('address', value, m.index, m.index + m[0].length, { key });
    });
  }

  // v1.162: weights, in grams, so "1 oz" and "28.35 grams" are the same amount.
  const GRAMS = { kg: 1000, kgs: 1000, kilo: 1000, kilos: 1000, kilogram: 1000, kilograms: 1000, g: 1, gm: 1, gms: 1, gram: 1, grams: 1,
    mg: 0.001, mgs: 0.001, milligram: 0.001, milligrams: 0.001, oz: 28.3495, ounce: 28.3495, ounces: 28.3495,
    lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592 };
  const gramsText = (g) => String(Math.round(g * 100) / 100);
  function extractWeights(s, c) {
    each(/(?<![\w.$])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)\s*(kilograms?|kilos?|kgs?|grams?|gms?|g|milligrams?|mgs?|ounces?|oz|pounds?|lbs?)\b\.?/gi, s, (m) => {
      const per = GRAMS[m[2].toLowerCase()];
      if (!per) return;
      const n = Number(m[1].replace(/,/g, ''));
      if (!Number.isFinite(n)) return;
      c.add('weight', gramsText(n * per), m.index, m.index + m[0].replace(/\.$/, '').trimEnd().length, { per });
    });
  }

  function extractPlates(s, c) {
    // Keyword is case-insensitive; the plate itself must be written in capitals (avoids ordinary words).
    each(/\b(?:licen[cs]e\s+plate|plate|tag|registration|reg\.|LP|lic\.)(?:\s+(?:number|no\.?|#))?/gi, s, (m) => {
      const from = m.index + m[0].length;
      const r = /^\s*(?:[:#=]\s*|reading\s+|of\s+|bearing\s+)?["']?([A-Z0-9]{1,4}(?:[ -]?[A-Z0-9]{1,5}){0,2})\b/.exec(s.slice(from));
      if (!r) return;
      let raw = r[1];
      let value = raw.replace(/[\s-]/g, '');
      if (value.length > 8 && raw.includes(' ')) { raw = raw.slice(0, raw.lastIndexOf(' ')); value = raw.replace(/[\s-]/g, ''); }
      if (value.length < 5 || value.length > 8 || !/\d/.test(value) || !/[A-Z]/.test(value)) return;
      const at = from + r[0].indexOf(raw);
      c.add('plate', value, at, at + raw.length);
    });
  }

  const COUNT_NOUN_EXCLUDE = new Set(['year', 'month', 'week', 'am', 'pm', 'hour', 'minute', 'second', 'percent']);
  function extractCounts(s, c) {
    const re = /\b(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|dozen|single|both)\s+((?:[a-z][a-z-]*\s+){0,2}?)([a-z]+s|men|women|people|children|feet|teeth|police)\b/gi;
    each(re, s, (m) => {
      const between = m[2].trim().split(/\s+/).filter(Boolean);
      if (between.some((w) => /^(of|the|a|an|and|or|to|in|on|at|by|for|with|from|who|that|which|was|were|is|are|had|has|have|times)$/i.test(w))) return;
      const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1].toLowerCase()];
      if (n == null) return;
      const noun = m[3].toLowerCase().replace(/(ies)$/, 'y').replace(/(ses|xes|ches|shes)$/, (x) => x.slice(0, -2)).replace(/s$/, '');
      if (COUNT_NOUN_EXCLUDE.has(noun)) return;
      c.add('count', String(n), m.index, m.index + m[0].length, { key: noun });
    });
  }

  const TITLES = 'Officer|Ofc\\.?|Sergeant|Sgt\\.?|Detective|Det\\.?|Deputy|Dep\\.?|Trooper|Tpr\\.?|Agent|Special Agent|SA|Lieutenant|Lt\\.?|Captain|Capt\\.?|Corporal|Cpl\\.?|Inspector|Chief|Mr\\.?|Mrs\\.?|Ms\\.?|Miss|Dr\\.?|Judge|Witness|Suspect|Victim|Defendant|Complainant|Affiant';
  const NOT_NAMES = new Set((
    'I The A An On In At Of And Or But If When While After Before During Upon This That These Those There Then He She They It We You ' +
    'His Her Their My Our Your Its Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July ' +
    'August September October November December Police Department Sheriff Office County City State Court District Street Avenue Road ' +
    'Boulevard Drive Lane Highway Report Case Incident Affidavit Warrant Exhibit Section Page Unit Apartment Suite North South East West ' +
    'Your Honor United States America Probable Cause Narrative Summary Supplement Officer Detective Sergeant Deputy Trooper Agent ' +
    'Suspect Victim Witness Defendant Vehicle Plate License Registration Evidence Property Item Number No Dispatch Dispatcher ' +
    'Emergency Room Hospital Medical Center Station Headquarters Mr Mrs Ms Dr Miss Lieutenant Captain Corporal Inspector Chief ' +
    'Sworn Subscribed Notary Public Signed Date Time Location Address Phone Statement Interview Body Camera Footage CAD'
  ).split(/\s+/));

  function titleCase(w) { return w.length > 1 ? w[0] + w.slice(1).toLowerCase() : w; }

  function extractNames(s, c) {
    // All-caps names are common in reports (DIAZ, MARIA). Compare them case-insensitively.
    const titled = new RegExp(`\\b(?:${TITLES})\\s+((?:[A-Z][A-Za-z'-]+\\.?\\s+){0,2}[A-Z][A-Za-z'-]+)`, 'g');
    const add = (text, at) => {
      // v1.162: each word keeps the other words of its full name (group), so the checker can tell
      // "Mary Poez" / "Mary Poes" (one person) from "John Doe" / "Joan Roe" (two people).
      const words = [...text.matchAll(/[A-Za-z'-]{3,}/g)].map((t) => ({ t, word: t[0].replace(/'s$/i, '') })).filter((x) => !NOT_NAMES.has(titleCase(x.word)));
      const group = words.map((x) => x.word.toLowerCase());
      for (const { t, word } of words) {
        const start = at + t.index;
        c.facts.push({ type: 'name', value: word.toLowerCase(), display: titleCase(word), start, end: start + t[0].length, group });
      }
    };
    each(titled, s, (m) => add(m[1], m.index + m[0].length - m[1].length));
    // Two or three capitalised words in a row, not at the start of the sentence.
    each(/(?<=\S\s+)((?:[A-Z][a-z'-]+|[A-Z]{3,})(?:\s+[A-Z]\.)?(?:\s+(?:[A-Z][a-z'-]+|[A-Z]{3,})){1,2})\b/g, s, (m) => {
      const words = m[1].split(/\s+/).filter((w) => !/^[A-Z]\.$/.test(w));
      if (words.some((w) => NOT_NAMES.has(titleCase(w)))) return;
      add(m[1], m.index);
    });
  }

  /** All facts in one sentence. */
  function extractFacts(sentence) {
    const c = collector(sentence);
    extractDates(sentence, c);
    extractInventory(sentence, c);
    extractPhones(sentence, c);
    extractTimes(sentence, c);
    extractMoney(sentence, c);
    extractWeights(sentence, c);
    extractNumbers(sentence, c);
    extractAddresses(sentence, c);
    extractPlates(sentence, c);
    extractCounts(sentence, c);
    extractNames(sentence, c);
    // De-duplicate names found by both name patterns.
    const seen = new Set();
    return c.facts.filter((f) => {
      if (f.type !== 'name') return true;
      const k = `${f.value}@${f.start}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /** Split documents into sentences, each with its facts and its location. */
  // Spreadsheet rows carry their sheet and row number as the location; XFA form fields their path.
  const cellOf = (p) => (p.sheet != null ? { sheet: p.sheet, row: p.row } : p.field != null ? { field: p.field } : {});

  function analyze(docs) {
    return docs.map((doc, d) => {
      const sents = [];
      for (const para of doc.paragraphs) {
        for (const s of T.sentences(para.text)) {
          const sent = { doc: d, paragraph: para.index, page: para.page ?? null, ...cellOf(para), text: s.text, start: s.start, end: s.end, facts: extractFacts(s.text) };
          // v1.162: a stated total ("a total of $1,100") is compared with totals only, never with a
          // single amount elsewhere; whether it adds up is checked by totalsCheck().
          for (const type of ['money', 'weight']) { const t = statedTotal(sent, type); if (t) t.total = true; }
          sents.push(sent);
        }
      }
      return { ...doc, sentences: sents };
    });
  }

  /* ------------------------------------------------------------------ */
  /* Comparison                                                          */
  /* ------------------------------------------------------------------ */

  const YEAR_PREFIX = /^(?:19|20)\d{2}-/;
  function sameValue(type, a, b) {
    // "00123" and "2026-00123" are the same case number (CaseVault names files <year>-<case no.>).
    if (type === 'number' && YEAR_PREFIX.test(a) !== YEAR_PREFIX.test(b)) return a.replace(YEAR_PREFIX, '') === b.replace(YEAR_PREFIX, '');
    if (type === 'weight') {
      // Rounding when a unit is converted (1 oz = 28.35 g) is not a difference: within 1%.
      const x = Number(a); const y = Number(b);
      return Math.abs(x - y) <= Math.max(0.01 * Math.max(x, y), 0.05);
    }
    if (type === 'date') {
      // A date without a year matches the same month and day in any year.
      if (a.startsWith('XXXX') || b.startsWith('XXXX')) return a.slice(5) === b.slice(5);
    }
    return a === b;
  }

  function display(f) {
    if (f.type === 'time') return `${f.display} (${f.value})`;
    return f.display;
  }

  function location(docs, sent) {
    return {
      doc: docs[sent.doc].name,
      docIndex: sent.doc,
      page: sent.page,
      ...cellOf(sent),
      paragraph: sent.paragraph,
      text: sent.text,
      start: sent.start,
      end: sent.end,
    };
  }

  let seq = 0;
  // v1.162: every flag has a confidence (how sure the checker is), apart from its severity (how
  // serious it would be): High, Medium or Low.
  // v1.170: fix: { from, to } — the statement's value and the one the source gives, for "Use this value".
  function makeFlag(docs, { severity, confidence = 'Medium', type, title, detail, statement, source, statementFact, sourceFact, sourceLabel, fix }) {
    const st = location(docs, statement);
    if (statementFact) st.highlight = [statementFact.start, statementFact.end];
    let src = null;
    if (source) {
      src = location(docs, source);
      if (sourceFact) src.highlight = [sourceFact.start, sourceFact.end];
    }
    return {
      id: `r${Date.now().toString(36)}${(seq++).toString(36)}`,
      layer: 'rules',
      severity,
      confidence,
      type,
      title,
      detail,
      statement: st,
      source: src,
      ...(sourceLabel ? { sourceLabel } : {}),
      ...(fix && fix.from && fix.to && fix.from !== fix.to ? { fix: { from: String(fix.from), to: String(fix.to) } } : {}),
      status: 'open',
      note: '',
    };
  }

  const TYPO_TYPES = new Set(['number', 'plate', 'phone', 'inventory']);

  /**
   * Compare documents. docs[i].role is 'affidavit' or 'report'.
   * ignore: text whose facts are never reported as "not found in the reports" — the author's own
   * details and today's date, which a template puts into every draft (signature block, "Prepared …").
   * Returns flags sorted by severity, then by document order.
   */
  /*
   * v1.162 options:
   *  aliases: groups of words that are one person (nlp.js parseAliases of the case's Known Aliases):
   *           a pair inside one group is never flagged as a spelling difference.
   *  buys:    the case's Timeline buys [{ date, suspect, drug, qty, unit, paid }] (the Buy Summary):
   *           each buy and the totals are checked against what the documents say.
   */
  function compare(inputDocs, { ignore = [], aliases = [], buys = [], pairs = null, evidence = [], kinds = {} } = {}) {
    const docs = analyze(inputDocs);
    const ignored = new Set(ignore.flatMap((t) => T.sentences(String(t || '')).flatMap((s) => extractFacts(s.text)))
      .map((f) => `${f.type}|${f.value}`));
    const flags = [];
    const keys = new Set();
    const push = (flag, key) => { if (!keys.has(key)) { keys.add(key); flags.push(flag); } };

    const affidavits = docs.map((d, i) => (d.role === 'affidavit' ? i : -1)).filter((i) => i >= 0);
    const reports = docs.map((d, i) => (d.role === 'report' ? i : -1)).filter((i) => i >= 0);
    // v1.168: the Buy and Surveillance pairs. Reports of two different buys tell different events,
    // so one pair's reports are not compared with another pair's ("$200" and "$300" are two buys).
    const pairList = pairs || pairReports(docs, { kinds });
    const pairOf = new Map();
    pairList.forEach((pr, n) => { pairOf.set(pr.buy, n); pairOf.set(pr.surv, n); });
    const sameBuy = (a, b) => !pairOf.has(a) || !pairOf.has(b) || pairOf.get(a) === pairOf.get(b);
    // v1.170: a Lab report's net weights aren't a report's field weights (labCheck() compares them).
    const isLab = docs.map((d) => d.role !== 'affidavit' && kindWith(kinds, d) === 'lab');
    const labApart = (f, a, b) => f.type === 'weight' && isLab[a] !== isLab[b] && docs[a].role !== 'affidavit' && docs[b].role !== 'affidavit';

    // Checks: every affidavit against all reports; every report against the reports after it.
    const plans = [
      ...affidavits.map((a) => ({ from: a, against: reports, affidavit: true })),
      ...reports.map((r, k) => ({ from: r, against: reports.slice(k + 1).filter((o) => sameBuy(r, o)), affidavit: false })),
    ];

    for (const plan of plans) {
      if (!plan.against.length) continue;
      const otherSents = plan.against.flatMap((d) => docs[d].sentences);
      // For "is it supported anywhere?" a report is checked against ALL other reports.
      const supportSents = plan.affidavit ? otherSents
        : reports.filter((r) => r !== plan.from && sameBuy(r, plan.from)).flatMap((d) => docs[d].sentences);

      for (const sent of docs[plan.from].sentences) {
        for (const f of sent.facts) {
          if (f.type === 'name') continue;
          if (f.type === 'inventory' && !plan.affidavit && pairOf.has(plan.from)) continue; // pairsCheck() does these
          const supported = supportSents.some((o) => !labApart(f, sent.doc, o.doc) && o.facts.some((g) => g.type === f.type && sameValue(f.type, f.value, g.value)
            && (f.type !== 'count' || g.key === f.key)));
          if (supported) continue;

          // Find the most similar sentence that states the same kind of fact differently.
          let best = null;
          for (const o of otherSents) {
            if (labApart(f, sent.doc, o.doc)) continue;
            // v1.162: a value that matches another fact of the same sentence is that fact's match, not a
            // conflicting one ("$200, $300 and $500" against a report's "$200": only $200 is matched).
            const cands = o.facts.filter((g) => g.type === f.type && (f.type !== 'count' || g.key === f.key) && !!g.total === !!f.total
              && !sent.facts.some((x) => x !== f && x.type === f.type && sameValue(f.type, x.value, g.value))
              && (f.type !== 'number' || g.key === f.key || g.key === 'number' || f.key === 'number'));
            if (!cands.length) continue;
            for (const g of cands) {
              let score = T.similarity(sent.text, o.text);
              if (TYPO_TYPES.has(f.type)) {
                const dist = T.levenshtein(f.value, g.value);
                if (dist > 2 || dist === 0) continue;
                score = Math.max(score, 1 - dist / 10); // a near-identical number is a likely typo, wherever it is
              } else if (f.type === 'address') {
                if (g.key === f.key) score = Math.max(score, 0.9); // same street, different number or unit
              }
              if (!best || score > best.score) best = { o, g, score };
            }
          }

          const label = TYPE_LABEL[f.type];
          if (best && best.score >= 0.3) {
            const a = f.value;
            const b = best.g.value;
            // Confidence: a near-identical number (one character off) or a closely matching statement
            // is High; a looser match is Medium (the two sentences may be about different events).
            const typo = TYPO_TYPES.has(f.type) ? T.levenshtein(a, b) : 0;
            const confidence = typo === 1 || best.score >= 0.6 ? 'High' : 'Medium';
            push(makeFlag(docs, {
              severity: 'High',
              confidence,
              type: f.type,
              title: `${label} mismatch: "${display(f)}" vs "${display(best.g)}"`,
              detail: `${docs[plan.from].name} says ${display(f)}; ${docs[best.o.doc].name} says ${display(best.g)} in a matching statement.`,
              statement: sent, statementFact: f, source: best.o, sourceFact: best.g, fix: { from: f.display, to: best.g.display },
            }), `m|${f.type}|${[`${sent.doc}:${sent.start}:${sent.paragraph}:${a}`, `${best.o.doc}:${best.o.start}:${best.o.paragraph}:${b}`].sort().join('|')}`);
          } else if (plan.affidavit && !ignored.has(`${f.type}|${f.value}`)) {
            push(makeFlag(docs, {
              severity: 'Low',
              confidence: 'Low',
              type: f.type,
              title: `${label} not found in the reports: "${display(f)}"`,
              detail: `No report mentions ${display(f)}.`,
              statement: sent, statementFact: f, source: null,
            }), `u|${f.type}|${sent.doc}:${sent.paragraph}:${sent.start}:${f.value}`);
          }
        }
      }
    }

    // Names: the same person spelled differently (Poez / Poes, Katherine / Catherine).
    const occurrences = new Map(); // value -> [{ sent, fact }]
    for (const d of docs) {
      for (const sent of d.sentences) {
        for (const f of sent.facts) {
          if (f.type !== 'name') continue;
          if (!occurrences.has(f.value)) occurrences.set(f.value, []);
          occurrences.get(f.value).push({ sent, fact: f });
        }
      }
    }
    const names = [...occurrences.keys()];
    const aliasGroups = aliases.map((g) => new Set(g));
    const sameAlias = (a, b) => aliasGroups.some((g) => g.has(a) && g.has(b));
    // The other words of a name's full names (Mary for Poez in "Mary Poez").
    const partners = (list, self) => {
      const out = new Set();
      for (const o of list) for (const w of o.fact.group || []) if (w !== self) out.add(w);
      return out;
    };
    const related = (p, q) => p === q || T.sameFirstName(p, q) || sameAlias(p, q) || isNameVariant(p, q) || isTransposition(p, q);
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = names[i];
        const b = names[j];
        if (!isNameVariant(a, b)) continue;
        // v1.162: nicknames (Rick / Rich, both Richard) and the case's Known Aliases are the same name.
        if (T.sameFirstName(a, b) || sameAlias(a, b)) continue;
        // Context: when both spellings come with the rest of a name, the other parts decide.
        // Same or related (Mary Poez / Mary Poes): one person spelled two ways, High confidence.
        // Clearly different (Jon Doe / Joan Roe): two people, not a spelling difference.
        // No other part on one side: Medium confidence.
        const pa = partners(occurrences.get(a), a);
        const pb = partners(occurrences.get(b), b);
        let confidence = 'Medium';
        if (pa.size && pb.size) {
          if (![...pa].some((p) => [...pb].some((q) => related(p, q)))) continue;
          confidence = 'High';
        }
        // Show the affidavit's spelling as the statement and, when there is one, a report's
        // spelling as the source (the affidavit may use both spellings itself).
        const inRole = (list, role) => list.find((o) => docs[o.sent.doc].role === role);
        const la = occurrences.get(a);
        const lb = occurrences.get(b);
        let st;
        let src;
        if (inRole(la, 'affidavit') && inRole(lb, 'report') && !inRole(la, 'report')) [st, src] = [inRole(la, 'affidavit'), inRole(lb, 'report')];
        else if (inRole(lb, 'affidavit') && inRole(la, 'report') && !inRole(lb, 'report')) [st, src] = [inRole(lb, 'affidavit'), inRole(la, 'report')];
        else {
          const oa = pickOccurrence(docs, la);
          const ob = pickOccurrence(docs, lb);
          [st, src] = docs[ob.sent.doc].role === 'affidavit' && docs[oa.sent.doc].role !== 'affidavit' ? [ob, oa] : [oa, ob];
        }
        push(makeFlag(docs, {
          severity: 'High',
          confidence,
          type: 'name',
          title: `Name spelled differently: "${st.fact.display}" vs "${src.fact.display}"`,
          detail: `"${st.fact.display}" (${docs[st.sent.doc].name}) and "${src.fact.display}" (${docs[src.sent.doc].name}) look like the same name spelled two ways.`,
          statement: st.sent, statementFact: st.fact, source: src.sent, sourceFact: src.fact, fix: { from: st.fact.display, to: src.fact.display },
        }), `n|${[a, b].sort().join('|')}`);
      }
    }

    totalsCheck(docs, push);
    if (buys && buys.length) buysCheck(docs, buys, push);
    // v1.168: each Buy report against its Surveillance report.
    pairsCheck(docs, pairList, push);
    // v1.169: and every inventory number against the evidence list.
    if (evidence && evidence.length) evidenceCheck(docs, evidence, push);
    labCheck(docs, kinds, push); // v1.170

    const rank = { High: 0, Medium: 1, Low: 2 };
    return flags.sort((x, y) => rank[x.severity] - rank[y.severity]
      || x.statement.docIndex - y.statement.docIndex || x.statement.paragraph - y.statement.paragraph || x.statement.start - y.statement.start);
  }

  /* ------------------------------------------------------------------ */
  /* v1.162: totals                                                      */
  /* ------------------------------------------------------------------ */

  const TOTAL_RE = /\b(?:total(?:ing|ed|s|ling|led)?|in all|altogether|combined|aggregate|sum of)\b/i;
  const EACH_RE = /^\s*(?:each|apiece|a piece|per\b|an? (?:gram|ounce|pound|kilo|unit|pill))/i;
  const BUY_RE = /\b(?:buys?|bought|purchas\w*|paid|pays?|sold|sells?|sale|exchanged|controlled|transaction)\b/i;
  const dollars = (cents) => { const n = Number(cents) / 100; return `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`; };
  // A weight in the unit the document used for its total (grams shown as written, e.g. "1.5 oz").
  const inUnit = (grams, f) => { const n = Math.round((grams / (f.per || 1)) * 100) / 100; return `${n} ${f.display.replace(/^[\d.,\s]+/, '').replace(/\.$/, '')}`; };
  const showSum = (type, v, f) => (type === 'money' ? dollars(v) : inUnit(v, f));
  const sumOf = (type, list) => (type === 'money' ? list.reduce((t, g) => t + Number(g.value), 0) : Math.round(list.reduce((t, g) => t + Number(g.value), 0) * 100) / 100);
  const agrees = (type, a, b) => (type === 'money' ? Number(a) === Number(b) : sameValue('weight', String(a), String(b)));

  /** The total a sentence states ("for a total of $1,100", "$1,100 in all"), nearest its keyword. */
  function statedTotal(sent, type) {
    const k = TOTAL_RE.exec(sent.text);
    if (!k) return null;
    const list = sent.facts.filter((f) => f.type === type);
    if (!list.length) return null;
    // "a total of $500": the amount after the word, when it follows closely; otherwise the nearest
    // one before it ("$1,100 in all").
    const after = list.filter((f) => f.start >= k.index && f.start - (k.index + k[0].length) <= 20);
    if (after.length) return after[0];
    const before = list.filter((f) => f.end <= k.index);
    return before.length ? before[before.length - 1] : list[0];
  }

  /**
   * A stated total against the amounts or weights listed with it: in the same sentence (High
   * confidence), or else in the sentences before it in the same paragraph (Medium). An amount said
   * to be "each" or "per gram" makes the sum unclear, so that paragraph is not checked.
   */
  function totalsCheck(docs, push) {
    for (const d of docs) {
      const paras = new Map();
      for (const sent of d.sentences) { if (!paras.has(sent.paragraph)) paras.set(sent.paragraph, []); paras.get(sent.paragraph).push(sent); }
      for (const list of paras.values()) {
        for (let i = 0; i < list.length; i++) {
          const sent = list[i];
          for (const type of ['money', 'weight']) {
            const total = statedTotal(sent, type);
            if (!total) continue;
            const each = (x) => list.some((s2) => s2.facts.some((f) => f.type === type && EACH_RE.test(s2.text.slice(f.end))));
            if (each()) continue;
            let parts = sent.facts.filter((f) => f.type === type && f !== total);
            let confidence = 'High';
            let from = sent;
            if (parts.length < 2) {
              if (parts.length) continue; // one other amount: a price, not a list
              const before = list.slice(0, i).filter((s2) => !TOTAL_RE.test(s2.text));
              parts = before.flatMap((s2) => s2.facts.filter((f) => f.type === type));
              if (parts.length < 2) continue;
              confidence = 'Medium';
              from = before.find((s2) => s2.facts.some((f) => f.type === type));
            }
            const sum = sumOf(type, parts);
            if (agrees(type, sum, total.value)) continue;
            const label = type === 'money' ? 'Total' : 'Total weight';
            const list2 = parts.map((g) => g.display).join(' + ');
            push(makeFlag(docs, {
              severity: 'High',
              confidence,
              type: 'total',
              title: `${label} doesn't add up: "${total.display}" but the ${type === 'money' ? 'amounts' : 'weights'} listed add up to ${showSum(type, sum, total)}`,
              detail: `${d.name}: ${list2} = ${showSum(type, sum, total)}, not ${total.display}.${confidence === 'Medium' ? ' (The amounts are in the sentences before the total; check that they all belong to it.)' : ''}`,
              statement: sent, statementFact: total, source: from === sent ? null : from, sourceFact: from === sent ? null : parts[0],
            }), `t|${type}|${sent.doc}:${sent.paragraph}:${sent.start}`);
          }
        }
      }
    }
  }

  /** v1.162: a buy's weight in grams, when its unit is a weight (not pills or units). */
  function buyGrams(b) {
    const per = GRAMS[String(b.unit || '').toLowerCase()];
    const n = Number(String(b.qty == null ? '' : b.qty).replace(/[,\s]/g, ''));
    return per && Number.isFinite(n) && n > 0 ? n * per : null;
  }
  const buyCents = (b) => { const n = Number(String(b.paid == null ? '' : b.paid).replace(/[$,\s]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null; };

  /**
   * The Timeline's buys (its Buy Summary) against the documents:
   *  - a sentence about a buy on a buy's date that gives a different amount paid or weight;
   *  - a stated total paid or total weight in a sentence about buys that matches neither all the
   *    buys together nor any one suspect's buys.
   * The source of these flags is the Timeline (sourceLabel), not a document.
   */
  function buysCheck(docs, buys, push) {
    const SRC = 'Timeline Buy Summary';
    const all = docs.flatMap((d) => d.sentences);
    for (const b of buys) {
      if (!b || !b.date) continue;
      const cents = buyCents(b);
      const grams = buyGrams(b);
      const when = /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : null;
      if (!when) continue;
      const who = b.suspect ? ` from ${b.suspect}` : '';
      for (const sent of all) {
        if (!BUY_RE.test(sent.text) || TOTAL_RE.test(sent.text)) continue;
        if (!sent.facts.some((f) => f.type === 'date' && sameValue('date', f.value, when))) continue;
        const money = sent.facts.filter((f) => f.type === 'money');
        if (cents && money.length && !money.some((f) => Number(f.value) === cents)) {
          push(makeFlag(docs, {
            severity: 'High', confidence: money.length === 1 ? 'High' : 'Medium', type: 'buy',
            title: `Buy on ${when}: "${money[0].display}" but the Timeline says ${dollars(cents)} was paid`,
            detail: `The Timeline's buy${who} on ${when} (${b.drug || 'buy'}) was ${dollars(cents)}; ${docs[sent.doc].name} says ${money.map((f) => f.display).join(', ')}.`,
            statement: sent, statementFact: money[0], source: null, sourceLabel: SRC, fix: money.length === 1 ? { from: money[0].display, to: dollars(cents) } : null,
          }), `b|m|${sent.doc}:${sent.start}|${when}|${cents}`);
        }
        const weights = sent.facts.filter((f) => f.type === 'weight');
        if (grams && weights.length && !weights.some((f) => sameValue('weight', f.value, gramsText(grams)))) {
          push(makeFlag(docs, {
            severity: 'High', confidence: weights.length === 1 ? 'High' : 'Medium', type: 'buy',
            title: `Buy on ${when}: "${weights[0].display}" but the Timeline says ${b.qty} ${b.unit}`,
            detail: `The Timeline's buy${who} on ${when} (${b.drug || 'buy'}) was ${b.qty} ${b.unit}; ${docs[sent.doc].name} says ${weights.map((f) => f.display).join(', ')}.`,
            statement: sent, statementFact: weights[0], source: null, sourceLabel: SRC,
          }), `b|w|${sent.doc}:${sent.start}|${when}|${b.qty}${b.unit}`);
        }
      }
    }

    // Totals: all buys, and each suspect's buys.
    const groups = new Map([['', buys]]);
    for (const b of buys) { const k = String(b.suspect || '').trim().toLowerCase(); if (k) { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b); } }
    const totals = { money: [], weight: [] };
    for (const list of groups.values()) {
      const c = list.map(buyCents).filter((x) => x != null);
      if (c.length) totals.money.push(c.reduce((t, x) => t + x, 0));
      const g = list.map(buyGrams).filter((x) => x != null);
      if (g.length) totals.weight.push(Math.round(g.reduce((t, x) => t + x, 0) * 100) / 100);
    }
    const grand = { money: totals.money[0], weight: totals.weight[0] };
    for (const sent of all) {
      if (!BUY_RE.test(sent.text)) continue;
      for (const type of ['money', 'weight']) {
        const total = statedTotal(sent, type);
        if (!total || grand[type] == null) continue;
        // A total of the amounts listed in the same sentence is a sum of its own (totalsCheck).
        if (sent.facts.filter((f) => f.type === type && f !== total).length >= 2) continue;
        if (totals[type].some((v) => agrees(type, v, total.value))) continue;
        const n = buys.filter((b) => (type === 'money' ? buyCents(b) : buyGrams(b)) != null).length;
        push(makeFlag(docs, {
          severity: 'Medium', confidence: 'Medium', type: 'buy',
          title: `${type === 'money' ? 'Total paid' : 'Total weight'} "${total.display}" doesn't match the Timeline's Buy Summary (${showSum(type, grand[type], total)})`,
          detail: `The Timeline has ${n} buy${n === 1 ? '' : 's'} adding up to ${showSum(type, grand[type], total)}${groups.size > 2 ? ', and no one suspect\'s buys add up to ' + total.display : ''}. ${docs[sent.doc].name} says ${total.display}.`,
          statement: sent, statementFact: total, source: null, sourceLabel: SRC,
        }), `b|t|${type}|${sent.doc}:${sent.start}`);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* v1.168: Buy and Surveillance reports, in pairs                      */
  /* ------------------------------------------------------------------ */

  const BUY_NAME = /\b(?:buy|buys|purchase|controlled[\s_-]*(?:buy|purchase)|uc[\s_-]*buy|undercover)\b|(?:^|[\s_-])buy\d/i;
  const SURV_NAME = /\bsurv(?:eillance|eil|\.)?\b|(?:^|[\s_-])surv\d/i;
  const LAB_NAME = /\b(?:lab|labs|laboratory|crime[\s_-]*lab|forensic|drug[\s_-]*analysis|chemistry)\b/i;
  const baseName = (name) => String(name || '').split('/').pop().replace(/\.[a-z0-9]+$/i, '');
  /** 'buy' | 'surveillance' | '' from a file name ("Buy 2.pdf", "SURV-2 Report.docx"). */
  function kindFromName(name) {
    const b = baseName(name).replace(/_/g, ' ');
    if (LAB_NAME.test(b)) return 'lab'; // v1.170: the lab's report on the drugs
    if (SURV_NAME.test(b)) return 'surveillance';
    if (BUY_NAME.test(b)) return 'buy';
    return '';
  }
  /** The kind of a read document: its name, else how its first lines describe it. */
  function reportKind(doc) {
    const byName = kindFromName(doc.name);
    if (byName) return byName;
    const head = (doc.paragraphs || []).slice(0, 4).map((p) => p.text).join(' ').slice(0, 600);
    if (/\b(?:laboratory|lab|forensic|chemistry)\s+(?:report|analysis|results?)\b|\bcontrolled\s+substance\s+analysis\b/i.test(head)) return 'lab';
    if (/\bsurveillance\s+(?:report|log|narrative|summary)\b/i.test(head)) return 'surveillance';
    if (/\b(?:buy|controlled\s+purchase|undercover\s+purchase)\s+(?:report|narrative|summary)\b/i.test(head)) return 'buy';
    return '';
  }
  // The buy's number in a file name ("Buy 2", "SURV-02", "Buy #3"), not a year or a case number.
  const nameNumber = (name) => { const m = /(?:^|[^\d])(\d{1,2})(?!\d)(?!.*[^\d]\d{1,2}(?!\d))/.exec(baseName(name)); return m ? Number(m[1]) : null; };
  const factValues = (doc, type) => new Set(doc.sentences.flatMap((x) => x.facts.filter((f) => f.type === type && !f.total).map((f) => f.value)));
  // The date a report is mostly about (the one it gives most often).
  function mainDate(doc) {
    const n = new Map();
    for (const x of doc.sentences) for (const f of x.facts) if (f.type === 'date' && !f.value.startsWith('XXXX')) n.set(f.value, (n.get(f.value) || 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  }
  /**
   * Pairs each Buy report with the Surveillance report of the same buy: the same number in their
   * names ("Buy 2" / "Surv 2"), the same date, the same inventory numbers. With one of each they are
   * a pair. docs: analyzed documents (or raw ones). -> [{ buy, surv, why }] (indexes into docs)
   */
  /** v1.169: a report's kind, the one chosen on the Checks tab first. */
  const kindWith = (kinds, d) => { const k = (kinds || {})[d.name]; return k === 'other' ? '' : ['buy', 'surveillance', 'lab'].includes(k) ? k : reportKind(d); };

  /* v1.170: drugs by name, the lab's words and the street's words as one ("crack" is cocaine). */
  const DRUGS = [
    ['cocaine', /\b(?:cocaine|crack|coke)\b/i], ['heroin', /\bheroin\b/i], ['fentanyl', /\b(?:fentanyl|fentanil|acetyl\s*fentanyl|carfentanil)\b/i],
    ['methamphetamine', /\b(?:meth(?:amphetamine)?|crystal\s+meth|ice)\b/i], ['cannabis', /\b(?:cannabis|marijuana|marihuana|weed|thc)\b/i],
    ['mdma', /\b(?:mdma|ecstasy|molly)\b/i], ['oxycodone', /\b(?:oxycodone|oxycontin|percocet)\b/i], ['alprazolam', /\b(?:alprazolam|xanax)\b/i],
    ['pcp', /\b(?:pcp|phencyclidine)\b/i], ['psilocybin', /\b(?:psilocybin|mushrooms)\b/i],
  ];
  // v1.183: plus the drug slang in Terminology marked "same as a drug" (js/terms.js; in the browser).
  const termDrugs = () => (root.CVTerms && root.CVTerms.drugWordsNow ? root.CVTerms.drugWordsNow() : []);
  const drugsIn = (text) => new Set([...DRUGS, ...termDrugs()].filter(([, re]) => re.test(text)).map(([n]) => n));
  /**
   * v1.170: a Lab report against the report of the buy its exhibits came from (the one that gives
   * the same inventory number): the lab's drug must be the one bought, and the lab's weight can't be
   * more than the weight in the field (the lab weighs the drug alone, without its packaging).
   */
  function labCheck(docs, kinds, push) {
    const labs = docs.map((d, i) => ({ d, i })).filter((x) => x.d.role !== 'affidavit' && kindWith(kinds, x.d) === 'lab');
    if (!labs.length) return;
    const others = docs.map((d, i) => ({ d, i })).filter((x) => x.d.role !== 'affidavit' && kindWith(kinds, x.d) !== 'lab');
    const g = (f) => Number(f.value);
    for (const lab of labs) {
      const done = new Set();
      for (const x of lab.d.sentences) {
        for (const f of x.facts) {
          if (f.type !== 'inventory' || done.has(f.value)) continue;
          done.add(f.value);
          const where = others.map((o) => ({ o, sents: o.d.sentences.filter((y) => y.facts.some((h) => h.type === 'inventory' && h.value === f.value)) })).filter((w) => w.sents.length);
          if (!where.length) {
            push(makeFlag(docs, {
              severity: 'Medium', confidence: 'Medium', type: 'inventory',
              title: `Inventory number ${f.display} in the Lab report is in no other report`,
              detail: `${lab.d.name} gives results for inventory number ${f.display}, but none of the other documents checked gives that number. Check the number, or add the report of that buy.`,
              statement: x, statementFact: f, source: null, sourceLabel: 'No report checked',
            }), `l|none|${lab.i}|${f.value}`);
            continue;
          }
          // The lab's sentence about this item (its paragraph when the sentence names no drug or weight).
          const para = lab.d.sentences.filter((y) => y.paragraph === x.paragraph);
          const labDrugs = drugsIn(x.text).size ? drugsIn(x.text) : drugsIn(para.map((y) => y.text).join(' '));
          const labW = (x.facts.some((h) => h.type === 'weight') ? x.facts : para.flatMap((y) => y.facts)).filter((h) => h.type === 'weight' && !h.total);
          for (const { o, sents } of where) {
            const s0 = sents[0];
            const fieldDrugs = drugsIn(sents.map((y) => y.text).join(' ')).size ? drugsIn(sents.map((y) => y.text).join(' ')) : drugsIn(o.d.sentences.map((y) => y.text).join(' '));
            if (labDrugs.size && fieldDrugs.size && ![...labDrugs].some((dn) => fieldDrugs.has(dn))) {
              push(makeFlag(docs, {
                severity: 'High', confidence: 'Medium', type: 'buy',
                title: `Drug differs for inventory ${f.display}: the lab found ${[...labDrugs].join(', ')}; ${o.d.name} says ${[...fieldDrugs].join(', ')}`,
                detail: `${lab.d.name} identifies the item under inventory number ${f.display} as ${[...labDrugs].join(', ')}; ${o.d.name} reports ${[...fieldDrugs].join(', ')}. The report may need a correction, or the inventory number may be wrong.`,
                statement: x, statementFact: f, source: s0, sourceFact: s0.facts.find((h) => h.type === 'inventory' && h.value === f.value),
              }), `l|drug|${lab.i}|${o.i}|${f.value}`);
            }
            const fieldW = (sents.some((y) => y.facts.some((h) => h.type === 'weight')) ? sents.flatMap((y) => y.facts) : []).filter((h) => h.type === 'weight' && !h.total);
            if (labW.length && fieldW.length) {
              const lw = Math.max(...labW.map(g)); const fw = Math.max(...fieldW.map(g));
              if (lw > fw * 1.1 + 0.05) {
                const lf = labW.find((h) => g(h) === lw); const ff = fieldW.find((h) => g(h) === fw);
                push(makeFlag(docs, {
                  severity: 'Medium', confidence: 'Medium', type: 'weight',
                  title: `Lab weight "${lf.display}" is more than the field weight "${ff.display}" (inventory ${f.display})`,
                  detail: `The lab weighs the drug without its packaging, so its weight is normally less than the weight in the field. ${lab.d.name} says ${lf.display}; ${o.d.name} says ${ff.display}.`,
                  statement: x, statementFact: lf.start != null && x.facts.includes(lf) ? lf : f, source: s0, sourceFact: s0.facts.includes(ff) ? ff : null,
                }), `l|w|${lab.i}|${o.i}|${f.value}`);
              }
            }
          }
        }
      }
    }
  }

  /*
   * v1.169 opts (chosen on the Checks tab, saved with the case):
   *  kinds: { fileName: 'buy' | 'surveillance' | 'other' } — what a report is, over its name;
   *  fixed: { buyFileName: survFileName | '' } — the Surveillance report a Buy report goes with
   *         ('' = none); the others are paired as before.
   */
  function pairReports(inputDocs, { kinds = {}, fixed = {} } = {}) {
    const docs = inputDocs.length && inputDocs[0].sentences ? inputDocs : analyze(inputDocs);
    const kindOf = (d) => kindWith(kinds, d);
    const reportsOnly = docs.map((d, i) => ({ d, i })).filter((x) => x.d.role !== 'affidavit');
    let buys = reportsOnly.filter((x) => kindOf(x.d) === 'buy');
    let survs = reportsOnly.filter((x) => kindOf(x.d) === 'surveillance');
    if (!buys.length || !survs.length) return [];
    const out = [];
    for (const b of buys) {
      if (!Object.prototype.hasOwnProperty.call(fixed, b.d.name)) continue;
      const v = survs.find((x) => x.d.name === fixed[b.d.name]);
      if (v) out.push({ buy: b.i, surv: v.i, why: 'paired by hand' });
    }
    // A Buy report set by hand (paired, or "Not paired") and its Surveillance report are taken.
    buys = buys.filter((b) => !Object.prototype.hasOwnProperty.call(fixed, b.d.name));
    survs = survs.filter((v) => !out.some((pr) => pr.surv === v.i));
    const scored = [];
    for (const b of buys) {
      for (const v of survs) {
        const why = [];
        let score = 0;
        const nb = nameNumber(b.d.name); const nv = nameNumber(v.d.name);
        if (nb != null && nb === nv) { score += 3; why.push(`both numbered ${nb}`); }
        const db = mainDate(b.d); const dv = mainDate(v.d);
        if (db && db === dv) { score += 2; why.push(`the same date (${db})`); }
        const ib = factValues(b.d, 'inventory'); const iv = factValues(v.d, 'inventory');
        if ([...ib].some((x) => iv.has(x))) { score += 2; why.push('the same inventory numbers'); }
        if (nb != null && nv != null && nb !== nv) score -= 3;
        if (db && dv && db !== dv) score -= 1;
        scored.push({ buy: b.i, surv: v.i, score, why });
      }
    }
    const one = buys.length === 1 && survs.length === 1;
    const used = new Set();
    for (const x of scored.sort((a, b) => b.score - a.score)) {
      if (used.has(`b${x.buy}`) || used.has(`s${x.surv}`)) continue;
      if (x.score <= 0 && !one) continue;
      used.add(`b${x.buy}`); used.add(`s${x.surv}`);
      out.push({ buy: x.buy, surv: x.surv, why: x.why.length ? x.why.join(', ') : 'the only Buy and Surveillance reports' });
    }
    return out.sort((a, b) => a.buy - b.buy);
  }

  /**
   * In each pair: every inventory number in one report must be in the other (a near-identical one is
   * a typo, High); a date, an amount paid or a plate one report gives and the other doesn't is
   * noted (Low: a surveillance officer may not have seen it).
   */
  function pairsCheck(docs, pairs, push) {
    const LABEL = (i) => (reportKind(docs[i]) === 'buy' ? 'Buy report' : 'Surveillance report');
    for (const pr of pairs) {
      for (const [from, to] of [[pr.buy, pr.surv], [pr.surv, pr.buy]]) {
        const mine = docs[from].sentences.flatMap((x) => x.facts.filter((f) => f.type === 'inventory').map((f) => ({ x, f })));
        const theirs = docs[to].sentences.flatMap((x) => x.facts.filter((f) => f.type === 'inventory').map((f) => ({ x, f })));
        const has = (list, v) => list.some((o) => o.f.value === v);
        // A number missing on one side and a near-identical one missing on the other are one typo;
        // each is matched once, the closest first.
        const nearOf = new Map();
        const taken = new Set();
        const cands = [];
        for (const m of mine) {
          if (has(theirs, m.f.value)) continue;
          for (const o of theirs) {
            if (has(mine, o.f.value)) continue;
            const dist = T.levenshtein(o.f.value, m.f.value);
            if (dist <= 2) cands.push({ m, o, dist });
          }
        }
        for (const k of cands.sort((a, b) => a.dist - b.dist)) {
          if (nearOf.has(k.m) || taken.has(k.o.f.value)) continue;
          nearOf.set(k.m, k.o); taken.add(k.o.f.value);
        }
        for (const m of mine) {
          const { x, f } = m;
          if (has(theirs, f.value)) continue;
          const near = nearOf.get(m);
          if (near) {
            const [a, b] = [`${from}:${x.start}:${x.paragraph}:${f.value}`, `${to}:${near.x.start}:${near.x.paragraph}:${near.f.value}`].sort();
            push(makeFlag(docs, {
              severity: 'High', confidence: 'High', type: 'inventory',
              title: `Inventory number mismatch: "${f.display}" vs "${near.f.display}"`,
              detail: `The ${LABEL(from)} (${docs[from].name}) gives inventory number ${f.display}; its ${LABEL(to)} (${docs[to].name}) gives ${near.f.display}. One of them is likely a typo.`,
              statement: x, statementFact: f, source: near.x, sourceFact: near.f, fix: { from: f.display, to: near.f.display },
            }), `m|inventory|${a}|${b}`);
            continue;
          }
          push(makeFlag(docs, {
            severity: 'High', confidence: theirs.length ? 'High' : 'Medium', type: 'inventory',
            title: `Inventory number ${f.display} is not in the ${LABEL(to)}`,
            detail: `${docs[from].name} gives inventory number ${f.display}; ${docs[to].name}, its ${LABEL(to)}, ${theirs.length ? `gives ${[...new Set(theirs.map((o) => o.f.display))].join(', ')} but not this one` : 'gives no inventory numbers'}.`,
            statement: x, statementFact: f, source: null, sourceLabel: docs[to].name,
          }), `p|inv|${from}|${to}|${f.value}`);
        }
        // Facts one report of the pair gives and the other doesn't.
        for (const type of ['date', 'money', 'plate']) {
          const other = factValues(docs[to], type);
          const seen = new Set();
          for (const x of docs[from].sentences) {
            for (const f of x.facts) {
              if (f.type !== type || f.total || seen.has(f.value)) continue;
              seen.add(f.value);
              if ([...other].some((v) => sameValue(type, f.value, v))) continue;
              push(makeFlag(docs, {
                severity: 'Low', confidence: 'Medium', type,
                title: `${TYPE_LABEL[type]} "${display(f)}" is not in the ${LABEL(to)}`,
                detail: `${docs[from].name} gives ${display(f)}; its ${LABEL(to)} (${docs[to].name}) doesn't mention it. It may simply not have been seen; check that the two reports tell the same buy.`,
                statement: x, statementFact: f, source: null, sourceLabel: docs[to].name,
              }), `p|${type}|${from}|${to}|${f.value}`);
            }
          }
        }
      }
    }
  }

  /**
   * v1.169: the inventory numbers of the documents against the case's evidence list (the exhibits
   * on the Write Report tab, each with its inventory number and chain of custody):
   *  - a number in a document that isn't on the list: a near-identical one on the list is a typo
   *    (High); otherwise it is missing from the list (Medium);
   *  - a number on the list that no document gives (Low: it may be in a report not checked).
   * evidence: [{ number, inventory }]; only exhibits with an inventory number count.
   */
  function evidenceCheck(docs, evidence, push) {
    const SRC = 'Evidence list (Write Report tab)';
    const listed = new Map();
    for (const e of evidence || []) {
      const v = String((e && e.inventory) || '').replace(/\D/g, '');
      if (v.length >= 5 && !listed.has(v)) listed.set(v, e);
    }
    if (!listed.size) return;
    const seen = new Map();
    for (const d of docs) for (const x of d.sentences) for (const f of x.facts) if (f.type === 'inventory' && !seen.has(f.value)) seen.set(f.value, { x, f });
    const exhibit = (e) => `Exhibit ${e.number || '?'}`;
    for (const [v, { x, f }] of seen) {
      if (listed.has(v)) continue;
      const near = [...listed.keys()].filter((w) => !seen.has(w) && T.levenshtein(v, w) <= 2).sort((a, b) => T.levenshtein(v, a) - T.levenshtein(v, b))[0];
      if (near) {
        push(makeFlag(docs, {
          severity: 'High', confidence: 'High', type: 'inventory',
          title: `Inventory number "${f.display}" vs ${exhibit(listed.get(near))}'s ${near}`,
          detail: `${docs[x.doc].name} gives inventory number ${f.display}; the evidence list has ${near} (${exhibit(listed.get(near))}) and not ${f.display}. One of them is likely a typo.`,
          statement: x, statementFact: f, source: null, sourceLabel: SRC, fix: { from: f.display, to: near },
        }), `e|near|${v}|${near}`);
        continue;
      }
      push(makeFlag(docs, {
        severity: 'Medium', confidence: 'Medium', type: 'inventory',
        title: `Inventory number ${f.display} is not on the evidence list`,
        detail: `${docs[x.doc].name} gives inventory number ${f.display}, but no exhibit on the Write Report tab has it. Add the exhibit, or check the number.`,
        statement: x, statementFact: f, source: null, sourceLabel: SRC,
      }), `e|miss|${v}`);
    }
    const first = docs.flatMap((d) => d.sentences)[0];
    if (!first) return;
    for (const [v, e] of listed) {
      if (seen.has(v) || [...seen.keys()].some((w) => T.levenshtein(v, w) <= 2)) continue;
      const fl = makeFlag(docs, {
        severity: 'Low', confidence: 'Medium', type: 'inventory',
        title: `${exhibit(e)} (Inventory ${v}) is not in the documents checked`,
        detail: `The evidence list has ${exhibit(e)}${e.description ? `, ${e.description}` : ''}, inventory number ${v}; none of the documents checked gives it. It may be in a report that wasn't chosen.`,
        statement: { ...first, text: `${exhibit(e)}: Inventory ${v}`, start: 0, end: 0 }, source: null, sourceLabel: 'Not in the documents checked',
      });
      fl.statement = { ...fl.statement, doc: SRC, page: null, paragraph: 0 }; // it is the list's, not a document's
      push(fl, `e|unsaid|${v}`);
    }
  }

  /**
   * v1.171: the order of events of one report: its sentences grouped under the time they happened
   * (a sentence with no time goes with the last time given before it; those before any time are
   * "Before"). doc: { paragraphs } -> [{ time: 'HH:MM' | '', sentences: [text] }] in the report's order.
   */
  function eventsByTime(doc) {
    const out = [];
    let cur = null;
    for (const p of doc.paragraphs || []) {
      for (const x of T.sentences(p.text || '')) {
        const t = extractFacts(x.text).find((f) => f.type === 'time');
        if (t || !cur) { cur = { time: t ? t.value : '', sentences: [] }; out.push(cur); }
        cur.sentences.push(x.text.trim());
      }
    }
    return out.filter((g) => g.sentences.length);
  }
  /** v1.171: two reports' events side by side, by time: [{ time, a: [text], b: [text] }], earliest first ('' = before any time). */
  function orderOfEvents(docA, docB) {
    const rows = new Map();
    const put = (list, side) => { for (const g of list) { if (!rows.has(g.time)) rows.set(g.time, { time: g.time, a: [], b: [] }); rows.get(g.time)[side].push(...g.sentences); } };
    put(eventsByTime(docA), 'a'); put(eventsByTime(docB), 'b');
    return [...rows.values()].sort((x, y) => (x.time === '' ? -1 : y.time === '' ? 1 : x.time.localeCompare(y.time)));
  }

  function pickOccurrence(docs, list) {
    return list.find((o) => docs[o.sent.doc].role === 'affidavit') || list[0];
  }

  // One pair of neighbouring letters swapped: the most common typing slip (Sampel / Sample).
  function isTransposition(a, b) {
    if (a.length !== b.length) return false;
    const diff = [];
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i);
    return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
  }

  const COMMON_WORDS = new Set(['were', 'where', 'there', 'their', 'then', 'than', 'that', 'this', 'with', 'from', 'said', 'side', 'time', 'item', 'items']);
  function isNameVariant(a, b) {
    if (a === b || a.length < 4 || b.length < 4) return false;
    if (COMMON_WORDS.has(a) || COMMON_WORDS.has(b)) return false;
    if (a.replace(/s$/, '') === b.replace(/s$/, '')) return false;
    if (isTransposition(a, b) && a[0] === b[0] && a.length >= 5) return true;
    const dist = T.levenshtein(a, b);
    const maxLen = Math.max(a.length, b.length);
    const sameSound = T.soundex(a).slice(1) === T.soundex(b).slice(1);
    if (dist === 1 && maxLen >= 4) return a[0] === b[0] || (sameSound && maxLen >= 6);
    if (dist === 2 && maxLen >= 7) return a[0] === b[0] && T.soundex(a) === T.soundex(b);
    // Different first letter but same sound (Katherine / Catherine, Kristopher / Christopher).
    if (dist <= 2 && maxLen >= 6 && T.soundex(a).slice(1) === T.soundex(b).slice(1) && a.slice(-3) === b.slice(-3)) return true;
    return false;
  }

  const api = { extractFacts, analyze, compare, isNameVariant, TYPE_LABEL, buyGrams, kindFromName, reportKind, pairReports, eventsByTime, orderOfEvents };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVRules = api;
})(this);
