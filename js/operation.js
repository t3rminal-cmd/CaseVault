/* CaseVault — operations (v1.27): several case numbers under one Title or Operation Name.
 * v1.46: an Operation is its own record in vault.json ({ id, number, name, status, start, end,
 * notes }); a case belongs to none or one of them through case.operationId. Every case lives in
 * General Files; an Operation's Files are a view of its linked cases, never a copy.
 *
 * An operation shares one Case Overview (suspects, contacts, deconfliction) and one Timeline:
 *   - the overview is kept in every case of the operation (case.json), the same in each, so a case
 *     still carries everything when it's archived or copied on its own. mergeOverview() joins what
 *     the cases have (cases made before v1.27 each had their own lists);
 *   - the timeline stays one timeline.json per case; mergeEvents() shows them as one, each event
 *     marked with its case number.
 * Plain logic, no DOM: the tests run it under Node.
 */
'use strict';

(function (root) {
  const opKey = (t) => String(t || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();
  const filled = (o) => !!o && Object.values(o).some((v) => String(v == null ? '' : v).trim());

  /** Items of several lists, each once (by key); empty ones are kept only from the first list. */
  function union(lists, keyOf) {
    const out = [];
    const seen = new Set();
    lists.forEach((list, i) => {
      for (const it of Array.isArray(list) ? list : []) {
        if (!it || typeof it !== 'object') continue;
        if (!filled(it)) { if (i === 0) out.push(it); continue; }
        const k = keyOf(it);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(it);
      }
    });
    return out;
  }

  /** The Case Overview of an operation: its cases' suspects, contacts and deconfliction, joined.
   * cases[0] is the case on screen: its own entries come first, in its own order. */
  function mergeOverview(cases) {
    const list = (cases || []).filter(Boolean);
    const suspects = union(list.map((c) => c.suspects), (s) => norm(s.name) || JSON.stringify(s));
    const contactOf = (c) => Object.assign({ officer: {}, prosecutor: {}, others: [] }, c.contacts || {});
    const cs = list.map(contactOf);
    const first = (k) => (cs.find((x) => filled(x[k])) || {})[k] || {};
    const contacts = {
      ...(cs[0] || {}),
      officer: first('officer'),
      prosecutor: first('prosecutor'),
      others: union(cs.map((x) => x.others), (o) => `${norm(o.role)}|${norm(o.name)}|${norm(o.email)}`),
    };
    const deconfliction = union(list.map((c) => c.deconfliction), (r) => [r.date, r.event, r.system, r.number].map(norm).join('|'));
    return { suspects, contacts, deconfliction };
  }

  const pick = (c) => ({ suspects: c.suspects || [], contacts: Object.assign({ officer: {}, prosecutor: {}, others: [] }, c.contacts || {}), deconfliction: c.deconfliction || [] });
  /** Do two cases hold the same overview? */
  const sameOverview = (a, b) => JSON.stringify(pick(a)) === JSON.stringify(pick(b));

  /** One timeline for the operation: [{ caseId, number, ev }] in date and time order.
   * timelines: [{ caseId, number, events }]. */
  function mergeEvents(timelines) {
    const out = [];
    for (const t of timelines || []) for (const ev of (t.events || [])) out.push({ caseId: t.caseId, number: t.number || '', ev });
    return out.sort((a, b) => String(a.ev.date || '').localeCompare(String(b.ev.date || ''))
      || String(a.ev.time || '').localeCompare(String(b.ev.time || ''))
      || String(a.ev.created || '').localeCompare(String(b.ev.created || '')));
  }

  /* ---------- v1.46: Operations as records ---------- */

  const OP_STATUSES = ['Open', 'Closed']; // v1.105: no Pending
  /** A number compared for duplicates: trimmed, single spaces, upper case. */
  const normNumber = (n) => String(n == null ? '' : n).trim().replace(/\s+/g, ' ').toUpperCase();
  /** "Number - Name" (just the one that's there when the other is empty). */
  const opLabel = (op) => (op ? [String(op.number || '').trim(), String(op.name || '').trim()].filter(Boolean).join(' - ') : '');

  /** A person's name for comparing: lower case, letters, digits and single spaces, words sorted
   * (so "Doe, John" and "John Doe" are the same name). */
  function normName(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
  }
  function editDistance(a, b) {
    if (a === b) return 0;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  /** 'same', 'similar' or '' for two subject names. Similar: one or two letters apart, or one name
   * holds every word of the other ("John Doe" and "John A. Doe"). Never merged, only flagged. */
  function nameMatch(a, b) {
    const x = normName(a); const y = normName(b);
    if (!x || !y) return '';
    if (x === y) return 'same';
    const short = Math.min(x.length, y.length);
    if (short >= 5 && editDistance(x, y) <= (short >= 10 ? 2 : 1)) return 'similar';
    const wx = x.split(' '); const wy = y.split(' ');
    const [few, many] = wx.length <= wy.length ? [wx, wy] : [wy, wx];
    // v1.187: an initial matches the word it starts ("John A. Doe" and "John Allen Doe").
    if (few.length >= 2 && few.every((w) => many.some((m) => m === w || (w.length === 1 && m[0] === w) || (m.length === 1 && w[0] === m)))) return 'similar';
    return '';
  }
  /** Cases (index entries) whose subject is the same as, or close to, `subject`.
   * Returns { same: [...], similar: [...] }; the case `exceptId` is left out. */
  function subjectMatches(cases, subject, exceptId = '') {
    const out = { same: [], similar: [] };
    for (const c of cases || []) {
      if (!c || c.id === exceptId) continue;
      const m = nameMatch(subject, c.subject);
      if (m) out[m].push(c);
    }
    return out;
  }
  /** The case using this Case Number already (archived ones count), or null. */
  function caseWithNumber(cases, number, exceptId = '') {
    const n = normNumber(number);
    return n ? (cases || []).find((c) => c && c.id !== exceptId && normNumber(c.number) === n) || null : null;
  }
  /** Case Numbers used by more than one case (made before v1.46): Map(normalized number → [cases]). */
  function duplicateNumbers(cases) {
    const m = new Map();
    for (const c of cases || []) { const n = normNumber(c && c.number); if (n) m.set(n, [...(m.get(n) || []), c]); }
    for (const [k, v] of m) if (v.length < 2) m.delete(k);
    return m;
  }

  /** What's wrong with an Operation's fields, as messages (none: it can be saved). */
  function validateOperation(op, operations, exceptId = '') {
    const errs = [];
    const number = String((op && op.number) || '').trim();
    const name = String((op && op.name) || '').trim();
    if (!number) errs.push('Mission Number is required.');
    if (!name) errs.push('Mission Name is required.');
    if (number && (operations || []).some((o) => o && o.id !== exceptId && normNumber(o.number) === normNumber(number))) errs.push(`Mission Number ${number} is already used by another Mission.`);
    if (op && op.status && !OP_STATUSES.includes(op.status)) errs.push('Status must be Open or Closed.');
    if (op && op.start && op.end && String(op.end) < String(op.start)) errs.push('End Date is before Start Date.');
    return errs;
  }
  /** What's wrong with a new case's Case Number and Subject Name, as messages. */
  function validateCase(fields, cases, exceptId = '') {
    const errs = [];
    const number = String((fields && fields.number) || '').trim();
    if (!number) errs.push('Case Number is required.');
    if (!String((fields && fields.subject) || '').trim()) errs.push('Subject Name is required.');
    const dup = caseWithNumber(cases, number, exceptId);
    if (dup) errs.push(`Case Number ${number} already exists${dup.location === 'archive' ? ' (archived)' : ''}. Case Numbers must be unique.`);
    return errs;
  }

  /** The next free OP-001, OP-002, ... */
  function nextOpNumber(operations, taken = []) {
    const used = new Set([...(operations || []).map((o) => normNumber(o.number)), ...taken.map(normNumber)]);
    for (let n = 1; ; n++) { const v = `OP-${String(n).padStart(3, '0')}`; if (!used.has(v)) return v; }
  }
  /** An Operation's status from its cases' (when it's made from them): Open if any is open (or
   * was Pending, before v1.105), else Closed. */
  function statusFrom(statuses) {
    const s = (statuses || []).map((x) => (x === 'Archived' ? 'Closed' : x));
    return s.includes('Open') || s.includes('Pending') || !s.length ? 'Open' : 'Closed';
  }

  /** The first suspect's name (Primary first), for a case made before Subject Name existed. */
  function firstSuspect(c) {
    const sus = (Array.isArray(c && c.suspects) ? c.suspects : []).filter((x) => x && String(x.name || '').trim());
    const main = sus.find((x) => x.role === 'Primary' || x.role === 'Main') || sus[0];
    return main ? String(main.name).trim() : '';
  }

  /**
   * v1.46 migration plan. Cases (full case.json objects, archived ones included) that share a Title
   * become one Operation named after it; a case with a Title of its own stays independent.
   * Operation Number: the group's File Number when it has one no other Operation uses, else OP-001...
   * Returns { operations: [{ key, number, name, status, start, end, caseIds }], subjects: { id: name } }.
   */
  function planMigration(cases, existing = []) {
    const groups = new Map();
    for (const c of cases || []) {
      if (!c || c.operationId) continue;
      const k = opKey(c.title);
      if (!k) continue;
      groups.set(k, [...(groups.get(k) || []), c]);
    }
    const operations = [];
    const taken = (existing || []).map((o) => o.number);
    const byFirst = [...groups.entries()].filter(([, g]) => g.length >= 2)
      .map(([key, g]) => [key, [...g].sort((a, b) => String((a.dates && a.dates.opened) || '').localeCompare(String((b.dates && b.dates.opened) || '')) || String(a.number || '').localeCompare(String(b.number || ''), undefined, { numeric: true }))])
      .sort((a, b) => String((a[1][0].dates && a[1][0].dates.opened) || '').localeCompare(String((b[1][0].dates && b[1][0].dates.opened) || '')) || a[0].localeCompare(b[0]));
    for (const [key, g] of byFirst) {
      const file = g.map((c) => String(c.fileNumber || '').trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0] || '';
      const number = file && !taken.some((t) => normNumber(t) === normNumber(file)) ? file : nextOpNumber(existing, taken);
      taken.push(number);
      const opened = g.map((c) => (c.dates && c.dates.opened) || '').filter(Boolean).sort();
      const status = statusFrom(g.map((c) => c.status));
      const closed = g.map((c) => (c.dates && c.dates.closed) || '').filter(Boolean).sort();
      operations.push({ key, number, name: String(g[0].title).trim().replace(/\s+/g, ' '), status, start: opened[0] || '', end: status === 'Closed' ? closed[closed.length - 1] || '' : '', caseIds: g.map((c) => c.id) });
    }
    const subjects = {};
    for (const c of cases || []) if (c && !String(c.subject || '').trim()) subjects[c.id] = firstSuspect(c);
    return { operations, subjects };
  }

  /** A case's title: its Operation's name, else its Subject Name, else what it had. */
  const caseTitle = (c, op) => (op && String(op.name || '').trim()) || String((c && c.subject) || '').trim() || String((c && c.title) || '').trim() || 'Untitled case';

  /* v1.97: a Subject Name shown the same way everywhere: "LAST, First" ("John Doe" and
   * "doe, john" both read "DOE, John"). Only a person's name is turned around; anything else
   * (one word, numbers, several people, "Unknown Offender", a group) shows as typed. The saved
   * Subject Name never changes. */
  const SUFFIX = /^(jr|sr|ii|iii|iv|v)\.?$/i;
  const PARTICLE = /^(de|del|della|la|las|los|van|von|der|den|da|di|du|le|st\.?|bin|al|el|mac|ter)$/i;
  const NOT_A_NAME = /^(unknown|unidentified|not|identified|offender|offenders|subject|subjects|suspect|suspects|gang|group|crew|dto|organization|org|inc\.?|llc|co\.?|company|et|al\.?|and|the|of|aka|a\.k\.a\.?|state|people|county|city|village|usa|united|states)$/i;
  const WORD = /^[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F'’.-]*$/;
  const titleWord = (w) => w.toLowerCase().replace(/(^|[-'’ ])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  const ROMAN = /^(ii|iii|iv|v)\.?$/i;
  // First names typed all in capitals or all in small letters get capitals; mixed ones stay as typed.
  const firstPart = (t) => (t !== t.toUpperCase() && t !== t.toLowerCase() ? t
    : t.split(' ').map((w) => (ROMAN.test(w) ? w.toUpperCase() : titleWord(w))).join(' '));
  function subjectLabel(subject) {
    const s = String(subject || '').replace(/\s+/g, ' ').trim();
    if (!s || /\d|[&/;()]|\s\+\s|\s(v|vs)\.?\s/i.test(s)) return s; // a caption (State v. Doe) stays
    const parts = s.split(',').map((x) => x.trim());
    let last; let first;
    if (parts.length === 3 && SUFFIX.test(parts[2])) parts.splice(1, 2, `${parts[1]} ${parts[2]}`);
    if (parts.length === 2 && parts[0] && parts[1]) [last, first] = parts;
    else if (parts.length === 1) {
      const w = s.split(' ');
      if (w.length < 2 || w.length > 5) return s;
      let suffix = '';
      if (SUFFIX.test(w[w.length - 1]) && w.length > 2) suffix = w.pop();
      let i = w.length - 1;
      while (i > 1 && PARTICLE.test(w[i - 1])) i -= 1;
      last = w.slice(i).join(' ');
      first = [...w.slice(0, i), suffix].filter(Boolean).join(' ');
    } else return s;
    const words = `${last} ${first}`.split(' ');
    if (!words.every((x) => WORD.test(x)) || words.some((x) => NOT_A_NAME.test(x))) return s;
    return `${last.toUpperCase()}, ${firstPart(first)}`;
  }

  /** v1.111: a person's name in parts (General Files columns): "John Michael Doe" or "DOE, John
   * Michael" -> { last: 'DOE', first: 'John', middle: 'Michael' }. Anything that isn't a person's
   * name (a caption, one word, a group) -> { last: <as typed>, first: '', middle: '', whole: true }. */
  function nameParts(subject) {
    const label = subjectLabel(subject);
    const m = /^([^,]+), (.+)$/.exec(label);
    if (!m) return { last: label, first: '', middle: '', whole: true };
    const rest = m[2].split(' ');
    let last = m[1];
    if (rest.length > 1 && SUFFIX.test(rest[rest.length - 1])) last = `${last} ${rest.pop().toUpperCase().replace(/\.$/, '')}`;
    return { last, first: rest[0] || '', middle: rest.slice(1).join(' '), whole: false };
  }

  /* v1.117: timeline colours, to tell apart at a glance which buys (events) go with which suspect
   * in a large Mission. An event can name a suspect and carry a colour; a suspect's colour is the one
   * on their latest coloured event, or the next free one of the palette. */
  const TL_COLORS = [['Blue', '#1f6fd1'], ['Red', '#d1453b'], ['Green', '#2a9d6f'], ['Orange', '#e08a1e'], ['Purple', '#7b4fd8'],
    ['Teal', '#1a9aa0'], ['Pink', '#d14a8b'], ['Brown', '#8a5a2b'], ['Olive', '#7a8a1e'], ['Slate', '#55606e']];
  const isColor = (c) => /^#[0-9a-f]{6}$/i.test(String(c || ''));
  const suspectKey = (n) => String(n || '').trim().replace(/\s+/g, ' ').toLowerCase();
  /** rows: mergeEvents() output. -> Map(suspect key -> { name, color, count }), in order of first event. */
  function suspectColors(rows) {
    const out = new Map();
    for (const { ev } of rows || []) {
      const k = suspectKey(ev && ev.suspect);
      if (!k) continue;
      const cur = out.get(k) || { name: String(ev.suspect).trim(), color: '', count: 0 };
      cur.count += 1;
      if (isColor(ev.color)) cur.color = ev.color; // rows are in date order: the latest wins
      out.set(k, cur);
    }
    const used = new Set([...out.values()].map((x) => x.color.toLowerCase()).filter(Boolean));
    for (const x of out.values()) {
      if (x.color) continue;
      const free = TL_COLORS.find(([, c]) => !used.has(c.toLowerCase())) || TL_COLORS[used.size % TL_COLORS.length];
      x.color = free[1]; used.add(free[1].toLowerCase());
    }
    return out;
  }
  /** The colour an event shows: its own, else its suspect's, else none. */
  const eventColor = (ev, colors) => (ev && isColor(ev.color) ? ev.color : (colors && ev && colors.get(suspectKey(ev.suspect)) || {}).color || '');

  /* v1.119: a Buy on the timeline carries what was bought and paid: { kind: 'buy', drug, qty, unit,
   * paid }. buySummary() groups the buys by suspect, in the suspects' colours, with totals. */
  const BUY_UNITS = ['g', 'kg', 'oz', 'lb', 'pills', 'units'];
  const num = (v) => { const n = Number(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : 0; };
  const round = (n) => Math.round(n * 1000) / 1000;
  /** "Cocaine · 3.5 g · $200" (only the parts given). */
  function buyLine(ev) {
    if (!ev) return '';
    const amount = String(ev.qty == null ? '' : ev.qty).trim();
    return [String(ev.drug || '').trim(), amount ? `${amount} ${ev.unit || 'g'}` : '', String(ev.paid == null ? '' : ev.paid).trim() ? money(num(ev.paid)) : ''].filter(Boolean).join(' · ');
  }
  /** v1.160: what the Paid box shows while it is typed in: "$1,234.5"; done = true (on leaving the
   * box) gives the cents too: "$1,234.50". Anything but digits and one point is dropped. */
  function moneyTyped(v, done) {
    let t = String(v == null ? '' : v).replace(/[^0-9.]/g, '');
    const dot = t.indexOf('.');
    if (dot >= 0) t = t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, '').slice(0, 2);
    if (!t) return '';
    let [whole, cents] = t.split('.');
    whole = whole.replace(/^0+(?=\d)/, '') || '0';
    whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (done) return `$${whole}.${(cents || '').padEnd(2, '0')}`;
    return `$${whole}${cents != null ? `.${cents}` : ''}`;
  }
  function money(n) { return `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`; }
  /** rows: mergeEvents() output -> [{ key, name, color, buys: [{ date, time, number, title, drug, qty, unit, paid }],
   * paid, drugs: [{ drug, amounts: [{ unit, qty }] }] }], suspects in order of their first buy; buys
   * with no suspect named come last, as "No suspect named". */
  function buySummary(rows) {
    const buys = (rows || []).filter(({ ev }) => ev && ev.kind === 'buy');
    const colors = suspectColors(rows);
    const out = new Map();
    for (const { ev, number } of buys) {
      const key = suspectKey(ev.suspect);
      const g = out.get(key) || { key, name: key ? String(ev.suspect).trim() : 'No suspect named', color: key ? (colors.get(key) || {}).color || '' : '', buys: [], paid: 0, byDrug: new Map() };
      const b = { date: ev.date || '', time: ev.time || '', number: number || '', title: ev.title || '', drug: String(ev.drug || '').trim(), qty: num(ev.qty), unit: ev.unit || 'g', paid: num(ev.paid) };
      g.buys.push(b);
      g.paid = round(g.paid + b.paid);
      if (b.drug || b.qty) {
        const d = g.byDrug.get(b.drug || 'Not named') || new Map();
        d.set(b.unit, round((d.get(b.unit) || 0) + b.qty));
        g.byDrug.set(b.drug || 'Not named', d);
      }
      out.set(key, g);
    }
    const list = [...out.values()].map(({ byDrug, ...g }) => ({ ...g, drugs: [...byDrug.entries()].map(([drug, m]) => ({ drug, amounts: [...m.entries()].map(([unit, qty]) => ({ unit, qty })) })) }));
    return [...list.filter((g) => g.key), ...list.filter((g) => !g.key)];
  }

  /**
   * v1.141: the events grouped by suspect, for Timeline → Group by Suspect and its PDF: [{ key, name,
   * color, rows }], suspects by name, then the events without a suspect ("No Suspect"). Each group's
   * rows stay in date order.
   */
  function suspectGroups(rows) {
    const colors = suspectColors(rows);
    const out = new Map();
    for (const r of rows || []) {
      const key = suspectKey(r.ev && r.ev.suspect);
      const g = out.get(key) || { key, name: key ? (colors.get(key) || {}).name || String(r.ev.suspect).trim() : 'No Suspect', color: key ? (colors.get(key) || {}).color || '' : '', rows: [] };
      g.rows.push(r);
      out.set(key, g);
    }
    const named = [...out.values()].filter((g) => g.key).sort((a, b) => a.name.localeCompare(b.name));
    return [...named, ...[...out.values()].filter((g) => !g.key)];
  }


  /* v1.153: the kinds of Timeline entry (Court is new), and Quick Add templates: each fills the form
   * and can add the deadline that usually follows it (a warrant return 10 days after the warrant is
   * served). */
  const KIND_LABELS = { event: 'Event', buy: 'Buy', arrest: 'Arrest', deadline: 'Deadline', court: 'Court' };
  const kindLabel = (k) => KIND_LABELS[k] || 'Event';
  const TL_TEMPLATES = [
    { id: 'warrant', label: 'Search Warrant Served', kind: 'event', title: 'Search warrant served', follow: { days: 10, title: 'Search warrant return due' } },
    { id: 'buy', label: 'Controlled Buy', kind: 'buy', title: 'Controlled buy', follow: { days: 3, title: 'Submit buy evidence to the lab' } },
    { id: 'arrest', label: 'Arrest', kind: 'arrest', title: 'Arrest', follow: { days: 1, title: 'Arrest report due' } },
    { id: 'court', label: 'Court Date', kind: 'court', title: 'Court date', follow: null },
    { id: 'subpoena', label: 'Grand Jury Subpoena Served', kind: 'event', title: 'Grand jury subpoena served', follow: { days: 14, title: 'Subpoena records due' } },
    { id: 'phone', label: 'Phone Extraction Requested', kind: 'event', title: 'Phone extraction requested', follow: { days: 14, title: 'Follow up on the phone extraction' } },
    { id: 'lab', label: 'Evidence Sent to the Lab', kind: 'event', title: 'Evidence sent to the lab', follow: { days: 30, title: 'Follow up on the lab results' } },
  ];
  /** "2026-03-01" + n days (local calendar, no time zone slips). */
  function plusDays(iso, n) {
    const [y, m, d] = String(iso).split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + Number(n || 0)));
    return t.toISOString().slice(0, 10);
  }
  /** Whole days from `from` to `to` (both "YYYY-MM-DD"). */
  function daysBetween(from, to) {
    const ms = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((ms(to) - ms(from)) / 86400000);
  }
  /** The deadline a template adds after an entry on `date` (days may be changed), or null. */
  function templateFollowUp(tpl, date, days) {
    if (!tpl || !tpl.follow || !date) return null;
    const n = Math.max(1, Math.min(365, Math.round(Number(days == null || days === '' ? tpl.follow.days : days)) || tpl.follow.days));
    return { kind: 'deadline', date: plusDays(date, n), time: '', title: tpl.follow.title };
  }
  /** A court date's reminder: from 7 days before to the day itself ({ days, text }), else null. */
  function courtReminder(ev, today) {
    if (!ev || ev.kind !== 'court' || !ev.date || !today) return null;
    const n = daysBetween(today, ev.date);
    if (n < 0 || n > 7) return null;
    return { days: n, text: n === 0 ? 'Court today' : n === 1 ? 'Court tomorrow' : `Court in ${n} days` };
  }
  /** The next court date on a timeline from today on: { date, time, title } or null. */
  function nextCourt(events, today) {
    const next = (events || []).filter((e) => e && e.kind === 'court' && e.date && e.date >= today)
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))[0];
    return next ? { date: next.date, time: next.time || '', title: next.title || '' } : null;
  }

  const api = {
    KIND_LABELS, kindLabel, TL_TEMPLATES, plusDays, daysBetween, templateFollowUp, courtReminder, nextCourt,
    BUY_UNITS, buyLine, buySummary, money, moneyTyped, suspectGroups,
    subjectLabel, nameParts, TL_COLORS, isColor, suspectKey, suspectColors, eventColor,
    opKey, mergeOverview, sameOverview, mergeEvents,
    OP_STATUSES, normNumber, opLabel, normName, nameMatch, subjectMatches, caseWithNumber, duplicateNumbers,
    validateOperation, validateCase, nextOpNumber, statusFrom, firstSuspect, planMigration, caseTitle,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVOperation = api;
})(this);
