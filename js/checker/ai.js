/* CaseVault checker — Layer 2: AI semantic review with a local Ollama engine.
 *
 * For each statement in the affidavit, the most relevant report passages are retrieved (BM25,
 * plus embeddings when an embedding model is installed) and the model classifies the statement
 * as Supported, Contradicted, or Not found, quoting the exact source sentence. Any answer whose
 * quote cannot be found verbatim in the report text is discarded (anti-hallucination check).
 *
 * Privacy: the only network address ever used is Ollama on this computer (127.0.0.1:11434).
 * The page's Content-Security-Policy blocks every other address.
 */
'use strict';

(function (root) {
  const T = typeof module !== 'undefined' && module.exports ? require('./nlp.js') : root.CVText;
  const BASES = ['http://127.0.0.1:11434']; // Start-CaseVault.bat binds Ollama to 127.0.0.1 only

  // Profiles by model size (billions of parameters). The app shows only profiles with a model installed.
  // numCtx is the context window asked of Ollama: a larger one costs GPU memory, and on a 6 GB card
  // the Quick model only stays fully on the GPU at 4096.
  const PROFILES = {
    quick: { label: 'Quick', hint: '~7–8B, fits in 6 GB of GPU memory', numCtx: 4096, min: 5.5, max: 9.5, prefer: ['qwen2.5:7b', 'llama3.1:8b', 'qwen3:8b', 'mistral:7b'] },
    thorough: { label: 'Thorough', hint: '~12–14B, split between GPU and RAM', numCtx: 8192, min: 9.5, max: 16, prefer: ['qwen2.5:14b', 'gemma3:12b', 'qwen3:14b', 'phi4:14b'] },
    light: { label: 'Light', hint: '~3–4B, runs on the CPU', numCtx: 4096, min: 1, max: 5.5, prefer: ['qwen2.5:3b', 'llama3.2:3b', 'phi4-mini', 'gemma3:4b'] },
  };
  const PROFILE_ORDER = ['quick', 'light', 'thorough']; // what "Auto" picks first
  const KEEP_ALIVE = '10m'; // keep the model loaded between requests, then free the GPU (the default)
  /* v1.165: how long the model stays loaded after it was used, chosen on this PC (Settings of the AI
   * engine): a shorter time frees the GPU memory sooner. '0' unloads it when a check or a draft is
   * done; during one it stays loaded (unloading between statements would load it again each time). */
  const KEEP_CHOICES = [['2m', '2 Minutes'], ['10m', '10 Minutes'], ['30m', '30 Minutes'], ['0', 'Unload When Done']];
  const KEEP_KEY = 'cv-ai-keep';
  function keepChoice() {
    try { const v = globalThis.localStorage && globalThis.localStorage.getItem(KEEP_KEY); return KEEP_CHOICES.some(([k]) => k === v) ? v : KEEP_ALIVE; } catch { return KEEP_ALIVE; }
  }
  function setKeepChoice(v) {
    try { if (!v || v === KEEP_ALIVE) globalThis.localStorage.removeItem(KEEP_KEY); else globalThis.localStorage.setItem(KEEP_KEY, v); } catch { /* this session only */ }
  }
  /** keep_alive for a request: the choice, or 2 minutes while a task runs when it is "when done". */
  const keepAlive = () => (keepChoice() === '0' ? '2m' : keepChoice());
  /** How long a model stays warm after an answer, in ms (for the "Loading model…" hint). */
  const keepMs = () => ({ '2m': 120e3, '10m': 600e3, '30m': 1800e3, 0: 120e3 })[keepChoice()] || 600e3;
  const DEFAULT_CTX = 4096;
  const numCtxFor = (profile) => (PROFILES[profile] && PROFILES[profile].numCtx) || DEFAULT_CTX;

  // Rough token count for English text (Ollama doesn't expose a tokenizer): ~3.5 characters a token.
  const tokensOf = (s) => Math.ceil(String(s || '').length / 3.5);

  function sizeB(m) {
    const ps = m.details && m.details.parameter_size;
    const parse = (s) => {
      const x = /([\d.]+)\s*([BM])/i.exec(s || '');
      return x ? Number(x[1]) / (x[2].toUpperCase() === 'M' ? 1000 : 1) : null;
    };
    return parse(ps) ?? parse((/:(\d+(?:\.\d+)?[bm])\b/i.exec(m.name) || [])[1]);
  }

  function isEmbedModel(m) {
    const fam = `${(m.details && m.details.family) || ''} ${((m.details && m.details.families) || []).join(' ')}`;
    return /embed|bge|minilm|e5-|gte-|arctic-embed/i.test(m.name) || /\bbert\b|nomic-bert/i.test(fam);
  }

  async function fetchJson(fetchImpl, url, opts = {}, timeoutMs = 0) {
    const ctrl = new AbortController();
    const outer = opts.signal;
    const onAbort = () => ctrl.abort();
    if (outer) outer.addEventListener('abort', onAbort);
    const timer = timeoutMs ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      const res = await fetchImpl(url, { ...opts, signal: ctrl.signal, headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) {
        let msg = `${res.status} ${res.statusText}`;
        try { msg = (await res.json()).error || msg; } catch { /* not JSON */ }
        throw new Error(`AI engine: ${msg}`);
      }
      return await res.json();
    } finally {
      if (timer) clearTimeout(timer);
      if (outer) outer.removeEventListener('abort', onAbort);
    }
  }

  /** Is Ollama running, and which models can be used? */
  async function detect({ fetchImpl = (...args) => globalThis.fetch(...args), timeoutMs = 2000 } = {}) {
    for (const base of BASES) {
      try {
        const data = await fetchJson(fetchImpl, `${base}/api/tags`, { method: 'GET' }, timeoutMs);
        const models = (data.models || []).map((m) => ({ name: m.name || m.model, size: sizeB(m), embed: isEmbedModel(m), details: m.details || {} }));
        const chat = models.filter((m) => !m.embed);
        const profiles = {};
        for (const [key, p] of Object.entries(PROFILES)) {
          const fits = chat.filter((m) => m.size != null && m.size >= p.min && m.size < p.max);
          const preferred = p.prefer.map((n) => fits.find((m) => m.name === n || m.name === `${n}:latest` || m.name.startsWith(`${n}-`))).find(Boolean);
          profiles[key] = (preferred || fits.sort((a, b) => b.size - a.size)[0] || {}).name || null;
        }
        const embed = (models.find((m) => m.embed && /nomic-embed-text/.test(m.name)) || models.find((m) => m.embed) || {}).name || null;
        return { status: 'connected', base, models, chat, embed, profiles };
      } catch { /* try the next address */ }
    }
    return { status: 'offline', base: null, models: [], chat: [], embed: null, profiles: {} };
  }

  /**
   * Resolve the user's setting ('auto', 'quick', 'thorough', 'light', 'rules-only') to a model.
   * autoOrder: the order "Auto" tries profiles in on this PC (see js/ai/hardware.js).
   */
  function choose(detected, setting, autoOrder = PROFILE_ORDER) {
    if (setting === 'rules-only' || !detected || detected.status !== 'connected') return null;
    const order = setting && setting !== 'auto' ? [setting, ...autoOrder] : autoOrder;
    for (const key of order) {
      if (detected.profiles[key]) return { profile: key, model: detected.profiles[key], requested: setting, fallback: setting !== 'auto' && key !== setting };
    }
    // A model we couldn't size: still usable.
    if (detected.chat.length) return { profile: 'custom', model: detected.chat[0].name, requested: setting, fallback: setting !== 'auto' };
    return null;
  }

  /* ---------------- statements and passages ---------------- */

  const BOILERPLATE = /\b(sworn|subscribed|notary|my commission|under penalty of perjury|affiant further sayeth|signature|signed this)\b/i;

  // Spreadsheet rows carry their sheet and row number as the location; XFA form fields their path.
  const cellOf = (p) => (p.sheet != null ? { sheet: p.sheet, row: p.row } : p.field != null ? { field: p.field } : {});

  function statementsOf(doc, limit = 250) {
    const out = [];
    for (const para of doc.paragraphs) {
      for (const s of T.sentences(para.text)) {
        const words = s.text.split(/\s+/).length;
        if (words < 6 || T.terms(s.text).length < 3) continue;
        if (s.text === s.text.toUpperCase() && words < 15) continue; // headings
        if (BOILERPLATE.test(s.text)) continue;
        out.push({ doc: doc.docIndex, paragraph: para.index, page: para.page ?? null, ...cellOf(para), text: s.text, start: s.start, end: s.end });
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  // Paragraph chunks of at most ~3 sentences / 700 characters, with offsets into the paragraph.
  function passagesOf(doc) {
    const out = [];
    for (const para of doc.paragraphs) {
      const sents = T.sentences(para.text);
      if (!sents.length) continue;
      let group = [];
      const flush = () => {
        if (!group.length) return;
        const start = group[0].start;
        const end = group[group.length - 1].end;
        out.push({ doc: doc.docIndex, docName: doc.name, promptName: doc.kind === 'image' ? `Photo ${doc.docIndex + 1}` : doc.name, paragraph: para.index, page: para.page ?? null, ...cellOf(para), start, end, text: para.text.slice(start, end), paraText: para.text });
        group = [];
      };
      for (const s of sents) {
        const len = group.length ? s.end - group[0].start : s.text.length;
        if (group.length && (group.length >= 3 || len > 700)) flush();
        group.push(s);
      }
      flush();
    }
    return out;
  }

  function cosine(a, b) {
    let dot = 0; let na = 0; let nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return dot / (Math.sqrt(na * nb) || 1);
  }

  /* ---------------- prompting ---------------- */

  // v1.162: a tighter prompt. The model is told what is NOT a contradiction (formatting, spelling,
  // abbreviations, nicknames, the same time written two ways), so it flags only differences that
  // change the meaning, and it says how sure it is.
  const SYSTEM = [
    'You check a sworn affidavit against police reports for consistency.',
    'You get ONE statement from the affidavit and numbered passages from the reports. Use ONLY those passages, never outside knowledge.',
    '',
    'Choose a verdict:',
    '- "supported": a passage states the same facts.',
    '- "contradicted": a passage states a fact that conflicts with the statement and changes its meaning: a different date, time, place, person, amount, weight, number, order of events, or action.',
    '- "not_found": the passages do not address the statement.',
    '',
    'These are NOT contradictions; treat them as the same:',
    '- spelling, capitals, punctuation and formatting (Poe / POE; 1,250 / 1250);',
    '- abbreviations (St / Street, Ave / Avenue, Apt / #, Ofc. / Officer, approx. / approximately);',
    '- the same time or date written another way (9:40 PM / 2140 hours; March 3 / 03/03/2026);',
    '- nicknames and the known aliases listed with the statement (Bill / William);',
    '- the same weight in another unit (1 oz / 28.35 grams);',
    '- a passage that gives fewer details than the statement, without conflicting with it (that is "supported" if the main facts match, otherwise "not_found").',
    '',
    'For "supported" or "contradicted", copy the single most relevant sentence from the passages into "quote" EXACTLY, character for character, and give its passage number. For "not_found" use an empty quote and passage 0.',
    'Set "confidence": "high" when the passage clearly states the fact, "medium" when it is likely but needs reading in context, "low" when unsure.',
    'Explain in one short sentence (at most 25 words) naming the fact that differs. Reply with JSON only.',
  ].join('\n');

  const SCHEMA = {
    type: 'object',
    properties: {
      verdict: { type: 'string', enum: ['supported', 'contradicted', 'not_found'] },
      passage: { type: 'integer' },
      quote: { type: 'string' },
      explanation: { type: 'string' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    },
    required: ['verdict', 'passage', 'quote', 'explanation', 'confidence'],
  };

  /** v1.162: the case's Known Aliases as a line for the prompt ("Ricky Poe = Rick Poe"). */
  function aliasLine(aliases) {
    const list = (aliases || []).map((g) => g.join(' ')).filter(Boolean);
    return list.length ? `\n\nKNOWN ALIASES (each line is one person; these names are the same person):\n${list.join('\n')}` : '';
  }

  function userPrompt(statement, passages, aliases = []) {
    // v1.69: a photo is named "Photo 2" here, never by its file name (a camera's IMG_20250312_1430
    // read as a date and time and was flagged).
    const list = passages.map((p, i) => `[${i + 1}] (${p.promptName || p.docName}${p.sheet != null ? `, ${p.sheet} row ${p.row}` : p.field != null ? `, ${p.field}` : p.page ? `, page ${p.page}` : ''})\n${p.promptText || p.text}`).join('\n\n');
    return `STATEMENT FROM THE AFFIDAVIT:\n${statement.text}${aliasLine(aliases)}\n\nPASSAGES FROM THE REPORTS:\n${list}`;
  }

  /**
   * Keep the retrieved passages (best first) that fit the model's context window, leaving room for
   * the instructions and the answer. The last one that only partly fits is shortened for the prompt
   * (promptText); its full text is still used to verify the quote.
   */
  function fitPassages(statement, passages, numCtx = DEFAULT_CTX) {
    const answer = 300;
    let budget = numCtx - answer - tokensOf(SYSTEM) - tokensOf(JSON.stringify(SCHEMA)) - tokensOf(statement.text) - 40;
    const out = [];
    for (const p of passages) {
      const cost = tokensOf(p.text) + 12;
      if (cost <= budget) { out.push(p); budget -= cost; continue; }
      if (!out.length || budget > 120) {
        const chars = Math.max(200, Math.floor((budget - 12) * 3.5));
        out.push({ ...p, promptText: `${p.text.slice(0, chars)} …` });
      }
      break;
    }
    return out;
  }

  function parseAnswer(content) {
    let obj;
    try { obj = JSON.parse(content); } catch {
      const m = /\{[\s\S]*\}/.exec(content || '');
      if (!m) return null;
      try { obj = JSON.parse(m[0]); } catch { return null; }
    }
    const verdict = String(obj.verdict || '').toLowerCase().replace(/[\s-]/g, '_');
    if (!['supported', 'contradicted', 'not_found'].includes(verdict)) return null;
    const c = String(obj.confidence || '').toLowerCase();
    const confidence = c === 'high' ? 'High' : c === 'low' ? 'Low' : 'Medium';
    return { verdict, passage: Number(obj.passage) || 0, quote: String(obj.quote || ''), explanation: String(obj.explanation || '').trim(), confidence };
  }

  /* ---------------- the review ---------------- */

  /**
   * docs: [{ name, role, docIndex, paragraphs }] (docIndex = position in the check's document list)
   * engine: { base, model, embed }
   * Returns { flags, stats: { statements, reviewed, supported, contradicted, notFound, discarded, errors }, complete, stopped }
   *
   * v1.162 options:
   *  aliases:      the case's Known Aliases (groups of words), given to the model with each statement.
   *  ruleFlags:    the rule layer's flags. A contradiction on a statement the rules also flagged gets
   *                High confidence (two independent checks agree).
   *  timeoutMs:    the longest one statement may take (a slow computer); 2 in a row stop the review.
   *  budgetMs:     the longest the whole review may take. When the model is too slow to finish in
   *                time, the review stops early (stopped: 'slow' or 'time') and the rule-based
   *                results stand for the rest; nothing already found is lost.
   */
  async function review({ docs, engine, fetchImpl, onProgress = () => {}, signal, aliases = [], ruleFlags = [], timeoutMs = 0, budgetMs = 0, now = () => Date.now(), quick = true } = {}) {
    fetchImpl = fetchImpl || ((...args) => globalThis.fetch(...args));
    const startedAt = now();
    let timeouts = 0;
    const ruleHit = new Set(ruleFlags.filter((f) => f.statement).map((f) => `${f.statement.docIndex}:${f.statement.start}`));
    // v1.165 (quick): statements the AI needn't read: one the rules already flagged as a sure
    // mismatch (High severity and confidence), and one a report repeats word for word.
    const ruleSure = new Set(ruleFlags.filter((f) => f.statement && f.layer === 'rules' && f.severity === 'High' && f.confidence === 'High')
      .map((f) => `${f.statement.docIndex}:${f.statement.start}`));
    const plain = (t) => T.normalize(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const affidavits = docs.filter((d) => d.role === 'affidavit');
    const reports = docs.filter((d) => d.role === 'report');
    const stats = { statements: 0, reviewed: 0, supported: 0, contradicted: 0, notFound: 0, discarded: 0, errors: 0, skipped: 0 };
    const flags = [];
    if (!affidavits.length || !reports.length) return { flags, stats, complete: true, stopped: null };

    const passages = reports.flatMap(passagesOf);
    const statements = affidavits.flatMap((d) => statementsOf(d));
    stats.statements = statements.length;
    const index = T.createIndex(passages);

    // Optional semantic retrieval with an embedding model.
    let passageVecs = null;
    const embedAll = async (inputs) => {
      // v1.185: each passage's numbers are kept on the SSD (js/ai/embed-cache.js), worked out once per model.
      const cache = typeof window !== 'undefined' && window.CVEmbedCache;
      if (cache) return cache.embed(inputs, { base: engine.base, model: engine.embed, fetchImpl: (u, o) => fetchImpl(u, { ...o, signal }), keepAlive: keepAlive() });
      const vecs = [];
      for (let i = 0; i < inputs.length; i += 32) {
        const data = await fetchJson(fetchImpl, `${engine.base}/api/embed`, { method: 'POST', body: JSON.stringify({ model: engine.embed, input: inputs.slice(i, i + 32), keep_alive: keepAlive() }), signal });
        vecs.push(...data.embeddings);
      }
      return vecs;
    };
    if (engine.embed && passages.length) {
      try {
        onProgress({ phase: 'embed', done: 0, total: statements.length });
        passageVecs = await embedAll(passages.map((p) => p.text));
      } catch (err) {
        if (signal && signal.aborted) throw err;
        passageVecs = null; // keyword retrieval still works
      }
    }

    let seq = 0;
    const loc = (doc, at, text, start, end, highlight) => ({
      doc: doc.name, docIndex: doc.docIndex, page: at.page, ...cellOf(at), paragraph: at.paragraph, text, start, end, ...(highlight ? { highlight } : {}),
    });
    const docByIndex = new Map(docs.map((d) => [d.docIndex, d]));

    for (let i = 0; i < statements.length; i++) {
      if (signal && signal.aborted) return { flags, stats, complete: false, stopped: null };
      // Time budget: stop when what is left would not fit (average so far × statements left).
      if (budgetMs && i > 0) {
        const spent = now() - startedAt;
        if (spent > budgetMs || (i >= 3 && spent + (spent / i) * (statements.length - i) > budgetMs * 1.5)) {
          return { flags, stats, complete: false, stopped: 'time' };
        }
      }
      const st = statements[i];
      onProgress({ phase: 'review', done: i, total: statements.length });
      if (quick && ruleSure.has(`${st.doc}:${st.start}`)) { stats.skipped++; continue; }

      // Retrieve: best keyword matches, plus best semantic matches when available.
      let picked = index.search(st.text, passageVecs ? 4 : 6);
      if (passageVecs) {
        try {
          const [qv] = await embedAll([st.text]);
          const sem = passages.map((p, k) => ({ p, s: cosine(qv, passageVecs[k]) })).sort((a, b) => b.s - a.s).slice(0, 4).map((x) => x.p);
          for (const p of sem) if (!picked.some((q) => q.doc === p.doc && q.paragraph === p.paragraph && q.start === p.start)) picked.push(p);
          picked = picked.slice(0, 6);
        } catch (err) {
          if (signal && signal.aborted) return { flags, stats, complete: false, stopped: null };
        }
      }

      // v1.165 (quick): a report sentence with the very same words (capitals, punctuation and spacing
      // aside) supports it. Only exact: one changed word ("north" / "south") still goes to the AI.
      if (quick && picked.length && picked.some((p) => T.sentences(p.text).some((x) => plain(x.text) === plain(st.text)))) {
        stats.reviewed++; stats.supported++; stats.skipped++;
        continue;
      }
      picked = fitPassages(st, picked, engine.numCtx || DEFAULT_CTX);
      const stDoc = docByIndex.get(st.doc);
      const statementLoc = loc(stDoc, st, st.text, st.start, st.end);
      const mk = (severity, title, detail, source, confidence = 'Low') => ({
        id: `a${Date.now().toString(36)}${(seq++).toString(36)}`,
        layer: 'ai', severity, confidence, type: 'statement', title, detail, statement: statementLoc, source, status: 'open', note: '',
      });

      if (!picked.length) {
        stats.reviewed++; stats.notFound++;
        flags.push(mk('Low', 'Not found in the reports', 'No report passage mentions anything in this statement.', null));
        continue;
      }

      let answer = null;
      // A per-statement time limit, so one slow answer can't hold up the whole check.
      const own = new AbortController();
      const onOuter = () => own.abort();
      if (signal) signal.addEventListener('abort', onOuter);
      let timedOut = false;
      const timer = timeoutMs ? setTimeout(() => { timedOut = true; own.abort(); }, timeoutMs) : null;
      try {
        const data = await fetchJson(fetchImpl, `${engine.base}/api/chat`, {
          method: 'POST',
          signal: own.signal,
          body: JSON.stringify({
            model: engine.model,
            stream: false,
            format: SCHEMA,
            keep_alive: keepAlive(),
            options: { temperature: 0, seed: 7, num_ctx: engine.numCtx || DEFAULT_CTX },
            messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userPrompt(st, picked, aliases) }],
          }),
        });
        answer = parseAnswer(data.message && data.message.content);
        timeouts = 0;
      } catch (err) {
        if (signal && signal.aborted) return { flags, stats, complete: false, stopped: null };
        if (timedOut) {
          // Too slow on this computer: two statements in a row over the limit end the AI review.
          timeouts++; stats.errors++;
          if (timeouts >= 2) return { flags, stats, complete: false, stopped: 'slow' };
          continue;
        }
        stats.errors++;
        if (stats.errors >= 3 && stats.errors > stats.reviewed) throw err; // engine is down, not a one-off
        continue;
      } finally {
        if (timer) clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onOuter);
      }
      stats.reviewed++;
      if (!answer) { stats.discarded++; continue; }

      if (answer.verdict === 'not_found') {
        stats.notFound++;
        flags.push(mk('Low', 'Not found in the reports', answer.explanation || 'The reports do not mention this.', null));
        continue;
      }

      // Anti-hallucination: the quote must exist verbatim in the passage (or another retrieved passage).
      const order = [picked[answer.passage - 1], ...picked].filter(Boolean);
      let hit = null;
      for (const p of order) {
        const at = T.findVerbatim(p.text, answer.quote);
        if (at) { hit = { p, at }; break; }
      }
      if (!hit) {
        stats.discarded++;
        if (answer.verdict === 'supported') {
          // Support that can't be shown is not support: leave it for a human to look at.
          flags.push(mk('Low', 'Not found in the reports', 'The AI said this was supported but could not quote the reports exactly, so the answer was not trusted.', null));
          stats.notFound++;
        }
        continue;
      }
      if (answer.verdict === 'supported') { stats.supported++; continue; }

      stats.contradicted++;
      const p = hit.p;
      // Widen the highlight to the whole sentence in the paragraph for context.
      const s0 = p.start + hit.at.start;
      const s1 = p.start + hit.at.end;
      const sent = T.sentences(p.paraText).find((s) => s.start <= s0 && s.end >= s1) || { text: p.paraText.slice(s0, s1), start: s0, end: s1 };
      const srcDoc = docByIndex.get(p.doc);
      // Confidence: the quote was found word for word, so at least Medium unless the model itself
      // was unsure; High when the rule layer flagged the same statement too.
      const agreed = ruleHit.has(`${st.doc}:${st.start}`);
      const confidence = agreed ? 'High' : answer.confidence === 'Low' ? 'Low' : 'Medium';
      flags.push(mk('Medium', `Contradicted by ${srcDoc.name}`, answer.explanation || 'The report says something different.',
        loc(srcDoc, p, sent.text, sent.start, sent.end, [s0 - sent.start, s1 - sent.start]), confidence));
    }
    onProgress({ phase: 'review', done: statements.length, total: statements.length });
    return { flags, stats, complete: true, stopped: null };
  }

  /* ---------------- v1.168: a Buy report and its Surveillance report ---------------- */

  // The two narratives of one buy, read side by side: the buying officer's and the surveillance
  // officer's. Only differences that change what happened are wanted; one report giving fewer
  // details (surveillance doesn't hear the deal) is normal.
  const PAIR_SYSTEM = [
    'You compare two police reports about the SAME controlled buy: the BUY report (written by the officer who made the buy) and the SURVEILLANCE report (written by the officer who watched it).',
    'Use ONLY the two reports, never outside knowledge.',
    '',
    'List every place where they CONTRADICT each other in a way that changes what happened:',
    '- a different date, time or order of events (who arrived, met, handed over, left first);',
    '- a different place, address, direction of travel or vehicle (make, colour, plate);',
    '- different people present, or a different person doing something;',
    '- a different amount paid, quantity, weight, drug or inventory number;',
    '- one report says something happened that the other says did not happen.',
    '',
    'These are NOT contradictions; do not list them:',
    '- one report giving details the other doesn\'t mention (surveillance cannot hear the conversation; the buyer may not see the surveillance positions);',
    '- different wording, spelling, abbreviations, or the same time written two ways (9:40 PM / 2140 hours);',
    '- the known aliases listed below (one person).',
    '',
    'For each contradiction copy ONE sentence from each report EXACTLY, character for character: "buy_quote" from the BUY report and "surveillance_quote" from the SURVEILLANCE report.',
    'Explain in one short sentence (at most 25 words) what differs. Set "confidence" to high, medium or low.',
    'If they agree, return an empty list. Reply with JSON only.',
  ].join('\n');
  const PAIR_SCHEMA = {
    type: 'object',
    properties: {
      issues: {
        type: 'array',
        maxItems: 8,
        items: {
          type: 'object',
          properties: { buy_quote: { type: 'string' }, surveillance_quote: { type: 'string' }, explanation: { type: 'string' }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] } },
          required: ['buy_quote', 'surveillance_quote', 'explanation', 'confidence'],
        },
      },
    },
    required: ['issues'],
  };
  /** A report's narrative for the prompt, cut to at most `chars` characters. */
  function narrativeOf(doc, chars) {
    const text = doc.paragraphs.map((p) => p.text.trim()).filter(Boolean).join('\n\n');
    return text.length <= chars ? { text, cut: false } : { text: `${text.slice(0, chars)} …`, cut: true };
  }
  function pairPrompt(buy, surv, aliases = [], numCtx = DEFAULT_CTX) {
    const room = Math.max(1200, Math.floor((numCtx - 700 - tokensOf(PAIR_SYSTEM) - tokensOf(JSON.stringify(PAIR_SCHEMA))) * 3.5));
    const lb = buy.paragraphs.reduce((t, p) => t + p.text.length + 2, 0);
    const ls = surv.paragraphs.reduce((t, p) => t + p.text.length + 2, 0);
    // Each gets half the room; one that needs less leaves the rest to the other.
    const half = Math.floor(room / 2);
    const forBuy = lb < half ? lb : ls < half ? room - ls : half;
    const b = narrativeOf(buy, forBuy);
    const v = narrativeOf(surv, room - Math.min(forBuy, b.text.length));
    return { text: `BUY REPORT (${buy.name}):\n${b.text}\n\nSURVEILLANCE REPORT (${surv.name}):\n${v.text}${aliasLine(aliases)}`, cut: b.cut || v.cut };
  }
  function parsePair(content) {
    let obj;
    try { obj = JSON.parse(content); } catch {
      const m = /\{[\s\S]*\}/.exec(content || '');
      if (!m) return null;
      try { obj = JSON.parse(m[0]); } catch { return null; }
    }
    const list = Array.isArray(obj && obj.issues) ? obj.issues : null;
    if (!list) return null;
    return list.map((x) => ({
      buyQuote: String((x && x.buy_quote) || ''), survQuote: String((x && x.surveillance_quote) || ''),
      explanation: String((x && x.explanation) || '').trim(),
      confidence: /^high$/i.test(x && x.confidence) ? 'High' : /^low$/i.test(x && x.confidence) ? 'Low' : 'Medium',
    }));
  }
  // Where a quote is in a document: its paragraph and whole sentence (null when it isn't there).
  function locate(doc, quote) {
    for (const para of doc.paragraphs) {
      const at = T.findVerbatim(para.text, quote);
      if (!at) continue;
      const sent = T.sentences(para.text).find((x) => x.start <= at.start && x.end >= at.end) || { text: para.text.slice(at.start, at.end), start: at.start, end: at.end };
      return { doc: doc.name, docIndex: doc.docIndex, page: para.page ?? null, ...cellOf(para), paragraph: para.index, text: sent.text, start: sent.start, end: sent.end, highlight: [at.start - sent.start, at.end - sent.start] };
    }
    return null;
  }
  /**
   * v1.168: the AI reads a Buy report and its Surveillance report together and lists where their
   * narratives contradict each other. Both quotes must be found word for word in the reports, or
   * the answer is dropped (as in review()). -> { flags, stats: { issues, kept, discarded }, cut }
   */
  async function comparePair({ buy, surv, engine, fetchImpl, signal, aliases = [], timeoutMs = 0 } = {}) {
    fetchImpl = fetchImpl || ((...args) => globalThis.fetch(...args));
    const prompt = pairPrompt(buy, surv, aliases, engine.numCtx || DEFAULT_CTX);
    const own = new AbortController();
    const onOuter = () => own.abort();
    if (signal) signal.addEventListener('abort', onOuter);
    const timer = timeoutMs ? setTimeout(() => own.abort(), timeoutMs) : null;
    let data;
    try {
      data = await fetchJson(fetchImpl, `${engine.base}/api/chat`, {
        method: 'POST',
        signal: own.signal,
        body: JSON.stringify({
          model: engine.model, stream: false, format: PAIR_SCHEMA, keep_alive: keepAlive(),
          options: { temperature: 0, seed: 7, num_ctx: engine.numCtx || DEFAULT_CTX },
          messages: [{ role: 'system', content: PAIR_SYSTEM }, { role: 'user', content: prompt.text }],
        }),
      });
    } finally {
      if (timer) clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onOuter);
    }
    const issues = parsePair(data && data.message && data.message.content) || [];
    const stats = { issues: issues.length, kept: 0, discarded: 0 };
    const flags = [];
    let seq = 0;
    const seen = new Set();
    for (const x of issues) {
      const a = locate(buy, x.buyQuote);
      const b = locate(surv, x.survQuote);
      if (!a || !b) { stats.discarded++; continue; } // a quote not in the report: not trusted
      const key = `${a.paragraph}:${a.start}|${b.paragraph}:${b.start}`;
      if (seen.has(key)) continue;
      seen.add(key);
      stats.kept++;
      flags.push({
        id: `p${Date.now().toString(36)}${(seq++).toString(36)}`,
        layer: 'ai', severity: 'Medium', confidence: x.confidence, type: 'narrative',
        title: `Buy and Surveillance narratives differ (${surv.name})`,
        detail: x.explanation || 'The two reports tell this part of the buy differently.',
        statement: a, source: b, status: 'open', note: '',
      });
    }
    return { flags, stats, cut: prompt.cut };
  }

  /* ---------------- v1.170: Explain this flag ---------------- */

  const EXPLAIN_SYSTEM = [
    'You help a police officer understand one finding of a consistency check between documents of the same case.',
    'You get the finding, the sentence it is about and, when there is one, the sentence it was compared with. Use ONLY these, never outside knowledge.',
    'In "explanation", say in plain words (at most 60 words) what differs and why it matters in a sworn document or a report. Do not decide which document is right; say what to check.',
    'In "suggestion", rewrite the first sentence so it agrees with the other one, changing only the differing detail and keeping everything else word for word. If the finding is not about a difference in wording (e.g. something is missing), or you are unsure, return an empty suggestion.',
    'Reply with JSON only.',
  ].join('\n');
  const EXPLAIN_SCHEMA = { type: 'object', properties: { explanation: { type: 'string' }, suggestion: { type: 'string' } }, required: ['explanation', 'suggestion'] };
  function explainPrompt(flag) {
    const st = flag.statement || {}; const src = flag.source || null;
    return [`FINDING: ${flag.title || ''}`, flag.detail ? `DETAIL: ${flag.detail}` : '', `SENTENCE (${st.doc || 'document'}): ${st.text || ''}`,
      src ? `COMPARED WITH (${src.doc || 'document'}): ${src.text || ''}` : `COMPARED WITH: ${flag.sourceLabel || 'nothing (the fact was not found)'}`].filter(Boolean).join('\n');
  }
  /** -> { explanation, suggestion } (suggestion '' when there is none). */
  async function explainFlag({ flag, engine, fetchImpl, signal, timeoutMs = 120000 } = {}) {
    fetchImpl = fetchImpl || ((...args) => globalThis.fetch(...args));
    const own = new AbortController();
    const onOuter = () => own.abort();
    if (signal) signal.addEventListener('abort', onOuter);
    const timer = timeoutMs ? setTimeout(() => own.abort(), timeoutMs) : null;
    try {
      const data = await fetchJson(fetchImpl, `${engine.base}/api/chat`, {
        method: 'POST', signal: own.signal,
        body: JSON.stringify({ model: engine.model, stream: false, format: EXPLAIN_SCHEMA, keep_alive: keepAlive(), options: { temperature: 0, seed: 7, num_ctx: engine.numCtx || DEFAULT_CTX },
          messages: [{ role: 'system', content: EXPLAIN_SYSTEM }, { role: 'user', content: explainPrompt(flag) }] }),
      });
      let obj = null;
      const content = data && data.message && data.message.content;
      try { obj = JSON.parse(content); } catch { const m = /\{[\s\S]*\}/.exec(content || ''); try { obj = m ? JSON.parse(m[0]) : null; } catch { obj = null; } }
      if (!obj || !String(obj.explanation || '').trim()) throw new Error('the AI gave no explanation');
      const suggestion = String(obj.suggestion || '').trim();
      // A suggestion that is the sentence unchanged, or a long way from it, isn't a rewording.
      const st = String((flag.statement && flag.statement.text) || '');
      const near = suggestion && suggestion !== st && T.similarity(suggestion, st) >= 0.5;
      return { explanation: String(obj.explanation).trim(), suggestion: near ? suggestion : '' };
    } finally {
      if (timer) clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onOuter);
    }
  }

  /** A model's name as shown on screen: first letter capital, no ":latest" (v1.28). The real name
   * (qwen3:8b) is still what is sent to Ollama. */
  const modelName = (m) => { const s = String(m || '').replace(/:latest$/, ''); return s ? s[0].toUpperCase() + s.slice(1) : s; };

  const api = { SYSTEM, aliasLine, modelName, PROFILES, KEEP_ALIVE, KEEP_CHOICES, keepChoice, setKeepChoice, keepAlive, keepMs, DEFAULT_CTX, numCtxFor, tokensOf, fitPassages, userPrompt, detect, choose, review, explainFlag, explainPrompt, comparePair, pairPrompt, parsePair, PAIR_SYSTEM, statementsOf, passagesOf, parseAnswer, sizeB };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVAI = api;
})(this);
