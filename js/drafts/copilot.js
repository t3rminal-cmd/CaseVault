/* CaseVault drafts — the local AI calls: inline suggestions and "Draft with AI".
 *
 * Everything goes to the Ollama engine on this computer (127.0.0.1:11434) found by the checker's
 * engine detection (js/checker/ai.js). The page's Content-Security-Policy blocks every other
 * address, so nothing typed in a draft can leave the machine.
 */
'use strict';

(function (root) {
  const T = typeof module !== 'undefined' && module.exports ? require('../checker/nlp.js') : root.CVText;
  const AI = typeof module !== 'undefined' && module.exports ? require('../checker/ai.js') : root.CVAI;
  const D = typeof module !== 'undefined' && module.exports ? require('./draft-core.js') : root.CVDraft;
  // v1.165: the time chosen on this PC (js/checker/ai.js keepAlive), read at each request.
  const keepAlive = () => (AI.keepAlive ? AI.keepAlive() : AI.KEEP_ALIVE);

  /** Smallest installed chat model (fast enough for suggestions while typing). */
  function fastModel(detected) {
    if (!detected || detected.status !== 'connected') return null;
    if (detected.profiles && detected.profiles.light) return detected.profiles.light;
    const sized = detected.chat.filter((m) => m.size != null && m.size >= 0.5).sort((a, b) => a.size - b.size);
    return (sized[0] || detected.chat[0] || {}).name || null;
  }

  /**
   * Context size for a model: that of the profile it belongs to. Every request to one model uses
   * the same num_ctx, because Ollama reloads the model whenever it changes.
   */
  function numCtxForModel(detected, model) {
    const profiles = (detected && detected.profiles) || {};
    const key = Object.keys(profiles).find((k) => profiles[k] === model);
    return AI.numCtxFor(key);
  }

  /** "Small" models (under 5B parameters) are fine for suggestions but weak for whole drafts. */
  function isSmallModel(detected, model) {
    const m = ((detected && detected.chat) || []).find((x) => x.name === model);
    return !!(m && m.size != null && m.size < 5);
  }

  /* ---------------- inline suggestions ---------------- */

  const SUGGEST_SYSTEM = [
    'You are the autocomplete in a text editor for case documents.',
    'Continue the user\'s text with the next few words, at most ONE sentence.',
    'Only use facts that appear in the case context or the text. If a fact is unknown, stop before it.',
    'Output only the continuation text: no quotes, no explanations, no repetition of the text.',
  ].join(' ');

  function suggestPrompt(before, caseInfo) {
    const ctx = caseInfo ? [caseInfo.title && `Case: ${caseInfo.title}`, caseInfo.number && `Number: ${caseInfo.number}`, caseInfo.client && `Client: ${caseInfo.client}`].filter(Boolean).join('\n') : '';
    return `${ctx ? `CASE CONTEXT\n${ctx}\n\n` : ''}TEXT SO FAR (continue it)\n${String(before).slice(-1500)}`;
  }

  async function suggest({ base, model, before, caseInfo, signal, fetchImpl, numCtx = AI.DEFAULT_CTX }) {
    fetchImpl = fetchImpl || ((...a) => globalThis.fetch(...a));
    const res = await fetchImpl(`${base}/api/generate`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        system: SUGGEST_SYSTEM,
        prompt: suggestPrompt(before, caseInfo),
        stream: false,
        keep_alive: keepAlive(),
        options: { num_predict: 40, temperature: 0.2, top_p: 0.9, stop: ['\n\n'], num_ctx: numCtx },
      }),
    });
    if (!res.ok) throw new Error(`AI engine: ${res.status}`);
    return (await res.json()).response || '';
  }

  /* ---------------- Draft with AI ---------------- */

  const DRAFT_RULES = [
    'You write draft documents for a case file.',
    'Use ONLY facts that appear in the CASE MATERIAL below. Never invent names, dates, times, places, numbers, badge numbers, courts, charges or quotes.',
    'Wherever a needed fact is missing or uncertain, write a placeholder in exactly this form: [CONFIRM: what is needed]. For example [CONFIRM: affiant badge number] or [CONFIRM: court name].',
    'When you state a fact from a report, keep its wording and numbers exactly as in the material.',
    'Reference material (the street value chart, code lists) is only for wording, street values and codes: never treat it as facts about this case.',
    'Writing examples only show HOW to write (structure, headings, tone, phrasing). Their names, dates, places, numbers and events belong to other cases and must never appear in this draft.',
    'Directives are rules to follow. Where the draft relies on one, you may cite it by its title.',
    'Write in Markdown: # headings, short paragraphs, numbered paragraphs where the document type expects them.',
    'Output only the document itself, with no introduction or closing remarks.',
  ].join('\n');

  function clip(s, n) {
    s = String(s || '').trim();
    return s.length > n ? `${s.slice(0, n)} …[shortened]` : s;
  }

  const notesChars = (numCtx) => (numCtx >= 8192 ? 4000 : 2000);

  /**
   * Build the chat messages for a first draft. All inputs are plain data (easy to test):
   * { type, template, instructions, caseObj, timeline, notes, passages: [{ docName, page, sheet, row, text }],
   *   references: [{ title, text }], examples: [{ title, text }], directives: [{ title, text }], behavior }
   *   references are lists to follow (the value chart, code lists); examples are Library samples to
   *   write like (never their facts); directives are Library rules; behavior is the writing
   *   instruction prompt (DEA-6 style by default, js/library.js).
   */
  // header: true starts the draft with a header block (officer, ASA/AUSA, numbers); false (the
  // default) starts straight with the summary. fields: the case's Report Fields as text.
  function draftMessages({ type = 'other', template = '', instructions = '', caseObj = {}, timeline = { events: [] }, notes = '', passages = [], references = [], examples = [], directives = [], behavior = '', numCtx = 8192, header = false, fields = '', part = null }) {
    const t = D.DOC_TYPES[type] || D.DOC_TYPES.other;
    const c = caseObj || {};
    const d = c.dates || {};
    const facts = [
      `Title: ${c.title || '(none)'}`, `File number: ${c.fileNumber || '(none)'}`, `Case number: ${c.number || '(none)'}`, `Client: ${c.client || '(none)'}`,
      `Status: ${c.status || '(none)'}`, `Opened: ${d.opened || '(none)'}`, c.tags && c.tags.length ? `Tags: ${c.tags.join(', ')}` : null,
      c.agencyNumber ? `Agency case number: ${c.agencyNumber}` : null,
      Array.isArray(c.partners) && c.partners.length && root.CVDraft ? `LEO partners: ${root.CVDraft.partnersText(c.partners)}` : null,
      ...(Array.isArray(c.suspects) ? c.suspects : []).filter((x) => x && x.name).map((x) => `Suspect (${!x.role || x.role === 'Main' ? 'Primary' : x.role}): ${[x.name, x.dob ? `DOB ${x.dob}` : '', x.residence].filter(Boolean).join(', ')}`),
      ...contactLines(c.contacts),
    ].filter(Boolean).join('\n');
    const events = (timeline.events || []).map((e) => `- ${e.date}${e.time ? ` ${e.time}` : ''} [${e.kind === 'deadline' ? 'deadline' : 'event'}${e.done ? ', done' : ''}] ${e.title}${e.note ? ` (${e.note.replace(/\s+/g, ' ')})` : ''}`).join('\n');
    // Room for the case material: the context window, less the answer (~1/3 of it), the rules,
    // the template and the other material. Passages (best first) are dropped when they don't fit.
    const reserve = Math.round(numCtx / 3);
    // Library and reference material share at most a third of the window: directives first, then
    // examples (each shortened to fit), then the reference lists.
    let refBudget = Math.floor((numCtx / 3) * 3.5);
    const take = (list) => {
      const out = [];
      const items = (list || []).filter((r) => String(r.text || '').trim());
      items.forEach((r, i) => {
        if (refBudget < 200) return;
        const text = String(r.text).trim();
        const share = Math.floor(refBudget / (items.length - i));
        const block = `### ${r.title}\n${text.length > share ? `${text.slice(0, Math.max(0, share - 40))} …[shortened]` : text}`;
        refBudget -= block.length;
        out.push(block);
      });
      return out.join('\n\n');
    };
    const dirText = take(directives);
    const exText = take(examples);
    const refText = take(references);
    const fixed = AI.tokensOf(dirText) + AI.tokensOf(exText) + AI.tokensOf(refText) + AI.tokensOf(behavior) + AI.tokensOf(DRAFT_RULES) + AI.tokensOf(template) + AI.tokensOf(instructions) + AI.tokensOf(facts) + AI.tokensOf(events)
      + AI.tokensOf(clip(notes, notesChars(numCtx))) + 200;
    let budget = Math.max(1200, Math.floor((numCtx - reserve - fixed) * 3.5));
    const docs = [];
    for (const p of passages) {
      const where = p.sheet != null ? `${p.sheet} row ${p.row}` : p.page ? `page ${p.page}` : '';
      const block = `[${p.docName}${where ? `, ${where}` : ''}]\n${p.text}`;
      if (block.length > budget) break;
      budget -= block.length;
      docs.push(block);
    }
    const material = [
      `## Case details\n${facts}`,
      `## Timeline\n${events || '(no timeline entries)'}`,
      fields ? `## Report fields (entered by the investigator)\n${fields}` : null,
      `## Notes\n${clip(notes, notesChars(numCtx)) || '(no notes)'}`,
      `## Passages from attached documents\n${docs.join('\n\n') || '(no documents)'}`,
      dirText ? `## Directives to follow (rules; cite them where relevant)\n${dirText}` : null,
      exText ? `## Writing examples (copy their structure, headings, tone and phrasing; NEVER their facts, names, dates or numbers)\n${exText}` : null,
      refText ? `## Reference material (lists to follow for wording, values and codes; NOT facts of this case)\n${refText}` : null,
    ].filter(Boolean).join('\n\n');
    // v1.182: one part at a time (small models do better with a short, focused request).
    const partLine = part ? `Write ONLY ${part.name} now (part ${part.index + 1} of ${part.total}). Do not write any other part, and no heading for a part you were not asked for.${String(part.written || '').trim() ? `\n\nALREADY WRITTEN (do not repeat it; continue after it):\n${String(part.written).trim().length > 3000 ? `…${String(part.written).trim().slice(-3000)}` : String(part.written).trim()}` : ''}` : '';
    const task = [
      part ? `Write one part of: ${t.label}.` : `Write a first draft of: ${t.label}.`,
      t.guide,
      template ? `Follow this template's structure and wording. Replace every [CONFIRM: ...] you can fill from the material with the fact; leave the rest as [CONFIRM: ...]:\n\n${template}` : '',
      part && part.index > 0 ? '' : header
        ? 'Start with a header block that lists the case officer, the prosecutor (ASA or AUSA), the file number, case number and federal jacket number, and the date, taken from the case details (write [CONFIRM: ...] for any that are missing).'
        : 'Do not write a header block of names, officers or numbers. Begin directly with the summary (SYNOPSIS) of the report.',
      instructions ? `Extra instructions from the user: ${instructions}` : '',
      partLine,
    ].filter(Boolean).join('\n\n');
    return [
      { role: 'system', content: behavior ? `${DRAFT_RULES}\n\nHOW TO WRITE\n${behavior}` : DRAFT_RULES },
      { role: 'user', content: `CASE MATERIAL\n\n${material}\n\n---\n\nTASK\n\n${task}` },
    ];
  }

  // "Case officer: Name, email, phone" lines from the Details tab's contacts.
  function contactLines(k) {
    if (!k) return [];
    const line = (role, p) => { const bits = p ? [p.name, p.email, p.phone].map((x) => String(x || '').trim()).filter(Boolean) : []; return bits.length ? `${role}: ${bits.join(', ')}` : null; };
    return [line('Case officer', k.officer), line((k.prosecutor && k.prosecutor.title) || 'Prosecutor', k.prosecutor),
      ...(Array.isArray(k.others) ? k.others : []).map((o) => line(String(o.role || '').trim() || 'Contact', o))].filter(Boolean);
  }

  /** Re-phrase a passage the way DEA reports are written (Reports → Re-phrase). */
  const DEA_STANDARD = [
    'Rewrite the text the way a DEA Report of Investigation (DEA-6) is written:',
    '- past tense, third person ("SA Doe observed…"); no "I" unless the text is an affidavit;',
    '- short, factual sentences; one fact per sentence; no opinions, adjectives or speculation;',
    '- exact dates (month day, year), 24-hour times, full names on first use and surnames after;',
    '- agents and officers by title (SA, TFO, Det.); defendants and subjects in capitals as SURNAME, First where the original does;',
    '- amounts written exactly as in the original (never change a number, weight, date or name).',
    'Keep every fact, number, name and [CONFIRM: ...] marker exactly. Do not add facts. Output only the rewritten text.',
  ].join('\n');
  function rephraseMessages(text, behavior = '') {
    return [
      { role: 'system', content: behavior ? `${DEA_STANDARD}\n\nHOUSE STYLE\n${behavior}` : DEA_STANDARD },
      { role: 'user', content: text },
    ];
  }

  /* v1.181: Ask AI to Edit: a selection (or the whole narrative) changed the way the investigator
   * asks, with the case's facts at hand. */
  const EDIT_PROMPTS = [
    { id: 'tighten', label: 'Tighten', prompt: 'Make it more concise without losing any fact.' },
    { id: 'tense', label: 'Third Person, Past Tense', prompt: 'Write it in the third person and the past tense.' },
    { id: 'times', label: 'Add Times and Places', prompt: 'Add the date, time and place of each event, from the case material.' },
    { id: 'order', label: 'Time Order', prompt: 'Put the events in time order.' },
    { id: 'grammar', label: 'Grammar Only', prompt: 'Fix spelling, grammar and punctuation only. Do not change the wording otherwise.' },
  ];
  /** The messages for an edit. text: the selection, or the whole narrative (whole: true); material: the case's facts as text. */
  function editMessages({ text = '', instruction = '', whole = false, material = '', behavior = '' } = {}) {
    const system = [
      'You edit part of a law-enforcement report exactly as the investigator asks.',
      '- Do what is asked and nothing more. Keep every fact, name, date, time, amount, weight and exhibit number that you are not asked to change.',
      '- Take any new fact only from CASE MATERIAL. When a fact you need is not there, write [CONFIRM: what is needed] instead. Never invent facts.',
      '- Answer with the edited text only: no introduction, no explanation, no quotation marks or code fences around it.',
      whole ? '- TEXT is the whole narrative: return the whole narrative, edited.' : '- TEXT is a part of the narrative: return only what replaces it (or, when asked to write something new, only the new text).',
      behavior ? `\nHOUSE STYLE\n${behavior}` : '',
    ].filter(Boolean).join('\n');
    const user = `${material ? `CASE MATERIAL (facts you may use)\n${material}\n\n` : ''}INSTRUCTION\n${String(instruction).trim()}\n\nTEXT\n${String(text).trim() || '(empty: write new text)'}`;
    return [{ role: 'system', content: system }, { role: 'user', content: user }];
  }
  /** The AI's answer without a "Here is the edited text:" line or code fences around it. */
  function cleanEdit(out) {
    let t = String(out || '').replace(/\r\n?/g, '\n').trim();
    t = t.replace(/^```[a-z]*\n([\s\S]*?)\n```$/i, '$1').trim();
    t = t.replace(/^(?:here(?:'s| is)|sure[,!]?|below is|the (?:edited|revised|rewritten) (?:text|version|narrative))[^\n]{0,80}:\s*\n+/i, '').trim();
    if (/^"[\s\S]*"$/.test(t) && !/"/.test(t.slice(1, -1))) t = t.slice(1, -1).trim();
    return t;
  }
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  /** The dates in a text, as YYYY-MM-DD (March 14, 2026 · 3/14/2026 · 2026-03-14). */
  function datesIn(text) {
    const out = new Set(); const t = String(text || '');
    const pad = (n) => String(n).padStart(2, '0');
    for (const m of t.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) out.add(`${m[1]}-${pad(m[2])}-${pad(m[3])}`);
    for (const m of t.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) out.add(`${m[3]}-${pad(m[1])}-${pad(m[2])}`);
    for (const m of t.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/gi)) out.add(`${m[3]}-${pad(MONTHS.indexOf(m[1].toLowerCase()) + 1)}-${pad(m[2])}`);
    return out;
  }
  /**
   * What the AI's text says that neither the text it was given nor the case material does: dates,
   * times, dollar amounts, weights and capitalised names. -> [strings], to check before using it.
   */
  function newFacts(out, ...sources) {
    const src = sources.map((x) => String(x || '')).join('\n');
    const low = src.toLowerCase().replace(/\s+/g, ' ');
    const has = (x) => low.includes(String(x).toLowerCase().replace(/\s+/g, ' '));
    const found = [];
    const add = (x) => { if (!found.includes(x)) found.push(x); };
    const srcDates = datesIn(src);
    const o = String(out || '');
    for (const m of o.matchAll(/\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/gi)) {
      const [iso] = [...datesIn(m[0])];
      if (iso && !srcDates.has(iso)) add(m[0]);
    }
    const digits = (x) => String(x).replace(/[^\d.]/g, '');
    // Times as 24-hour H:MM, so 2:30 p.m., 14:30 and 1430 hours are the same time.
    const TIME = /\b(\d{1,2}):(\d{2})\s*([ap])?\.?\s?m?\.?(?![\w])|\b(\d{2})(\d{2})\s*(?:hours|hrs)\b/gi;
    const timeKey = (m) => {
      if (m[4]) return `${Number(m[4])}:${m[5]}`;
      let hh = Number(m[1]);
      const ap = (m[3] || '').toLowerCase();
      if (ap === 'p' && hh < 12) hh += 12;
      if (ap === 'a' && hh === 12) hh = 0;
      return `${hh}:${m[2]}`;
    };
    const srcTimes = new Set([...src.matchAll(TIME)].map(timeKey));
    for (const m of o.matchAll(TIME)) if (!srcTimes.has(timeKey(m))) add(m[3] ? m[0].trim() : m[0].trim().replace(/\.+$/, ''));
    const srcNums = new Set([...src.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(digits(m[0]))));
    for (const m of o.matchAll(/\$\s?\d[\d,]*(?:\.\d{2})?|\b\d+(?:\.\d+)?\s?(?:grams?|g|kilograms?|kg|ounces?|oz|pounds?|lbs?)\b/gi)) {
      if (!srcNums.has(Number(digits(m[0])))) add(m[0].trim());
    }
    const skip = new Set(['The', 'On', 'At', 'In', 'During', 'After', 'Before', 'Then', 'SA', 'TFO', 'GS', 'Exhibit', 'CONFIRM', 'DETAILS', 'SYNOPSIS', 'INDEXING', 'Det', 'Officer', 'Agent', 'Special', 'Task', 'Force']);
    for (const m of o.matchAll(/\b([A-Z][a-z]+|[A-Z]{2,})(?:\s+(?:[A-Z]\.\s+)?([A-Z][a-z]+|[A-Z]{2,}))+\b/g)) {
      const words = m[0].split(/\s+/).filter((w) => !skip.has(w.replace(/\.$/, '')));
      if (words.length < 2) continue;
      if (MONTHS.includes(words[0].toLowerCase())) continue;
      if (!words.every((w) => has(w.replace(/\.$/, '')))) add(words.join(' '));
    }
    return found;
  }

  /* v1.182: drafting one part at a time, for the document types with known parts. */
  const SECTION_PLANS = {
    dea6: ['the SYNOPSIS (two or three sentences)', 'the DETAILS (numbered paragraphs in time order)', 'the INDEXING (each person, business, vehicle and telephone number, one per line)'],
    affidavit: ['the affiant\'s introduction, training and experience', 'the facts that establish probable cause, in numbered paragraphs in time order', 'the conclusion and what is asked of the court'],
    summary: ['the overview paragraph and the parties involved', 'the dated chronology of key events', 'the evidence and documents, and the open questions'],
    supplemental: ['the narrative of what happened, in time order', 'the evidence and property, and what is still to be done'],
  };
  const sectionPlan = (type) => SECTION_PLANS[type] || null;

  /** v1.182: the case's facts in a request, without the Library's examples, the directives and the reference lists (which are not this case's facts). */
  function factsOnly(messages) {
    const text = (messages || []).filter((m) => m.role !== 'system').map((m) => String(m.content || '')).join('\n\n');
    return text.replace(/## (?:Directives to follow|Writing examples|Reference material)[^\n]*\n[\s\S]*?(?=\n## |\n---\n|$)/g, '');
  }
  /** v1.182: the second pass: the AI looks again at what it wrote that the case doesn't have. */
  function fixFactsMessages({ text = '', facts = [], material = '' } = {}) {
    return [
      { role: 'system', content: [
        'You check a law-enforcement report against the case material, and correct it.',
        '- The items listed under CHECK appear in the TEXT but were not found in the CASE MATERIAL.',
        '- For each one: if the CASE MATERIAL does support it (written another way), keep it. Otherwise replace it with [CONFIRM: what is needed].',
        '- Change nothing else: same wording, same order, same formatting.',
        '- Answer with the whole corrected text only: no introduction, no explanation.',
      ].join('\n') },
      { role: 'user', content: `CASE MATERIAL\n${material}\n\nCHECK\n${facts.map((f) => `- ${f}`).join('\n')}\n\nTEXT\n${text}` },
    ];
  }
  /** v1.182: what is still not in the case after the second pass, put in [CONFIRM: …] (never inside one already). */
  function markUnsupported(text, facts) {
    let out = String(text || '');
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const f of [...new Set(facts || [])].filter(Boolean).sort((a, b) => b.length - a.length)) {
      const parts = out.split(/(\[CONFIRM:[^\]]*\])/);
      out = parts.map((seg, i) => (i % 2 ? seg : seg.replace(new RegExp(`(^|[^\\w$])${esc(f)}(?![\\w])`, 'g'), (m, pre) => `${pre}[CONFIRM: ${f}]`))).join('');
    }
    return out;
  }

  /** Review a report for consistency (Reports → Review). math: the arithmetic check's findings as text. */
  function reviewMessages(text, { facts = '', math = '' } = {}) {
    return [
      { role: 'system', content: [
        'You review a law-enforcement report before it is filed. Report problems only; do not rewrite the report.',
        'Check: names spelled the same way throughout; dates, times and the order of events agree; the same amounts, weights, exhibit numbers and case numbers everywhere; totals that add up (money especially); statements that contradict each other or the case details; missing who/what/when/where; leftover [CONFIRM: ...] markers.',
        'Answer as a short Markdown list, one problem per line, quoting the words concerned. If you find nothing, say "No problems found." Never invent facts.',
      ].join('\n') },
      { role: 'user', content: `${facts ? `CASE DETAILS\n${facts}\n\n` : ''}${math ? `ARITHMETIC CHECK (already done by CaseVault)\n${math}\n\n` : ''}REPORT\n\n${text}` },
    ];
  }

  /** Pick the most relevant passages for the draft (BM25, plus embeddings when available). */
  async function relevantPassages({ docs, query, engine, k = 14, fetchImpl }) {
    const passages = docs.flatMap((d) => AI.passagesOf(d));
    if (!passages.length) return [];
    const picked = T.createIndex(passages).search(query, k);
    if (engine && engine.embed && engine.base) {
      try {
        const post = async (input) => {
          const res = await (fetchImpl || globalThis.fetch)(`${engine.base}/api/embed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: engine.embed, input, keep_alive: keepAlive() }) });
          if (!res.ok) throw new Error(String(res.status));
          return (await res.json()).embeddings;
        };
        const [qv] = await post([query]);
        const vecs = [];
        for (let i = 0; i < passages.length; i += 32) vecs.push(...await post(passages.slice(i, i + 32).map((p) => p.text)));
        const cos = (a, b) => { let x = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { x += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return x / (Math.sqrt(na * nb) || 1); };
        const sem = passages.map((p, i) => ({ p, s: cos(qv, vecs[i]) })).sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.p);
        for (const p of sem) if (!picked.some((q) => q.doc === p.doc && q.paragraph === p.paragraph && q.start === p.start)) picked.push(p);
      } catch { /* keyword search alone is fine */ }
    }
    // Keep document order so the model reads each report in sequence.
    return picked.slice(0, k * 2).sort((a, b) => a.doc - b.doc || a.paragraph - b.paragraph || a.start - b.start);
  }

  /** Stream a chat completion; onText(chunk) receives the text as it arrives. Returns the full text. */
  async function streamChat({ base, model, messages, onText, signal, fetchImpl, numCtx = AI.DEFAULT_CTX }) {
    fetchImpl = fetchImpl || ((...a) => globalThis.fetch(...a));
    const res = await fetchImpl(`${base}/api/chat`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true, keep_alive: keepAlive(), options: { temperature: 0.2, num_ctx: numCtx } }),
    });
    if (!res.ok || !res.body) {
      let msg = `${res.status}`;
      try { msg = (await res.json()).error || msg; } catch { /* not JSON */ }
      throw new Error(`AI engine: ${msg}`);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let full = '';
    const handle = (line) => {
      if (!line.trim()) return;
      const obj = JSON.parse(line);
      if (obj.error) throw new Error(`AI engine: ${obj.error}`);
      const piece = obj.message && obj.message.content;
      if (piece) { full += piece; onText(piece); }
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, nl)); buf = buf.slice(nl + 1); }
    }
    handle(buf);
    return full;
  }

  const api = { SECTION_PLANS, sectionPlan, factsOnly, fixFactsMessages, markUnsupported, EDIT_PROMPTS, editMessages, cleanEdit, datesIn, newFacts, contactLines, rephraseMessages, reviewMessages, DEA_STANDARD, KEEP_ALIVE: AI.KEEP_ALIVE, keepAlive, fastModel, numCtxForModel, isSmallModel, suggest, suggestPrompt, draftMessages, relevantPassages, streamChat, DRAFT_RULES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVCopilot = api;
})(this);
