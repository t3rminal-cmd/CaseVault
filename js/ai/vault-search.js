/* CaseVault — Search All Cases (v1.184): a question in plain words ("white Impala", "the man with the
 * teardrop tattoo", "buys near Example Park") across every open case: the details and suspects, the
 * timeline, the notes, the Write Report tab and the saved reports. Words match by keyword (with the
 * Terminology: "snowball" finds "cocaine"), then, when the AI engine has a passage-search model, the
 * closest by meaning come first. Everything is read from the SSD and searched on this PC.
 *
 * The plain logic (passages, query, snippets) has no DOM: the tests run it under Node.
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const clean = (v) => String(v == null ? '' : v).trim();

  /** A case's text, in passages: [{ caseId, number, title, where, tab, text }]. */
  function passagesOfCase({ caseObj = {}, timeline = { events: [] }, notes = '', fields = null, drafts = [] } = {}) {
    const c = caseObj; const out = [];
    const add = (where, tab, text) => { const t = clean(text); if (t.length >= 3) out.push({ caseId: c.id, number: clean(c.number), title: clean(c.title), where, tab, text: t }); };
    add('Details', 'details', [c.title, c.subject, c.fileNumber, c.agencyNumber].filter(Boolean).join(' · '));
    for (const s of c.suspects || []) {
      if (!s || s.notIdentified) continue;
      const i = s.info || {};
      add('Suspect', 'details', [s.name, s.dob ? `DOB ${s.dob}` : '', s.residence, i.gender, i.race, i.height, i.weight, i.hair, i.eyes, i.moniker, i.marks, i.irNumber ? `IR ${i.irNumber}` : '', i.phone].filter(Boolean).join(' · '));
    }
    for (const e of (timeline && timeline.events) || []) {
      add(`Timeline, ${e.date || ''}`, 'timeline', [e.title, e.suspect, e.drug, e.qty ? `${e.qty} ${e.unit || ''}` : '', e.paid ? `$${e.paid}` : '', e.note].filter(Boolean).join(' · '));
    }
    for (const para of String(notes || '').split(/\n\s*\n/)) add('Field Notes', 'reports', para);
    const n = fields && clean(fields.narrative);
    if (n) for (const para of n.split(/\n\s*\n/)) add('Write Report', 'draft', para);
    for (const v of (fields && fields.vehicles) || []) add('Write Report: vehicle', 'draft', Object.values(v || {}).filter((x) => typeof x === 'string').join(' '));
    for (const d of drafts || []) for (const para of String(d.body || '').split(/\n\s*\n/)) add(`Report: ${clean(d.title) || 'Untitled'}`, 'reports', para);
    return out;
  }

  /** The question, with the Terminology's words for the same thing ("snowball" also looks for "cocaine"). */
  function expandQuery(q, terms = []) {
    const words = [clean(q)];
    const low = clean(q).toLowerCase();
    for (const t of terms) {
      const term = t.term.toLowerCase(); const drug = (t.drug || '').toLowerCase();
      if (new RegExp(`(^|\\W)${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\W|$)`, 'i').test(low)) words.push(t.drug || t.meaning);
      else if (drug && new RegExp(`(^|\\W)${drug}(\\W|$)`).test(low)) words.push(t.term);
    }
    return words.join(' ');
  }

  /** A short piece of the passage around its first matching word, for the results list. */
  function snippet(text, q, max = 180) {
    const t = clean(text).replace(/\s+/g, ' ');
    const words = clean(q).toLowerCase().split(/\W+/).filter((w) => w.length > 2);
    const low = t.toLowerCase();
    const at = words.map((w) => low.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
    if (t.length <= max) return t;
    const start = Math.max(0, (at == null ? 0 : at) - 50);
    return `${start ? '…' : ''}${t.slice(start, start + max)}${start + max < t.length ? '…' : ''}`;
  }

  const cosine = (a, b) => { let d = 0; let x = 0; let y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return x && y ? d / Math.sqrt(x * y) : 0; };

  /**
   * The passages for a question: keyword search (BM25), then by meaning when embed(texts) is given
   * (the passage-search model). -> [{ ...passage, score }]
   */
  async function search(passages, q, { terms = [], k = 25, embed = null, T = null } = {}) {
    const text = (T || (isNode ? require('../checker/nlp.js') : root.CVText));
    const query = expandQuery(q, terms);
    let hits = text.createIndex(passages).search(query, embed ? Math.max(k, 40) : k);
    if (embed && hits.length) {
      try {
        const vecs = await embed([query, ...hits.map((x) => x.text.slice(0, 1200))]);
        hits = hits.map((x, i) => ({ ...x, score: cosine(vecs[0], vecs[i + 1]) })).sort((a, b) => b.score - a.score);
      } catch { /* keyword order is fine */ }
    }
    return hits.slice(0, k);
  }

  /* ---------- browser ---------- */

  /** The Search All Cases window. */
  async function open(ui) {
    const { h, openDialog } = ui;
    const I = ui.icon;
    const cases = (Vault.data.cases || []).filter((c) => !Vault.isArchived(c.id));
    let passages = null;
    const load = async (status) => {
      if (passages) return passages;
      const all = [];
      let n = 0;
      for (const e of cases) {
        status.textContent = `Reading ${++n} of ${cases.length} cases…`;
        try {
          const [caseObj, timeline, notes, fields, list] = await Promise.all([Vault.getCase(e.id), Vault.getTimeline(e.id).catch(() => null), Vault.getNotes(e.id).catch(() => ''),
            Vault.readCaseJSON(e.id, 'report-fields.json').catch(() => null), Vault.listDrafts(e.id).catch(() => [])]);
          const drafts = await Promise.all(list.map((d) => Vault.readDraft(e.id, d.slug).then((x) => ({ title: d.title, body: x ? x.body : '' }), () => ({ title: d.title, body: '' }))));
          all.push(...passagesOfCase({ caseObj, timeline, notes, fields, drafts }));
        } catch (err) { if (FS.isDisconnectError(err)) throw err; }
      }
      passages = all;
      return all;
    };
    await openDialog((close) => {
      const input = h('input', { type: 'search', class: 'vs-input', autofocus: true, placeholder: 'For example: white Impala · teardrop tattoo · buys near Example Park', 'aria-label': 'Search all cases' });
      const status = h('p', { class: 'muted small vs-status' }, `Searches the ${cases.length} open cases: details, suspects, timelines, notes and reports.`);
      const results = h('div', { class: 'vs-results' });
      const run = async () => {
        const q = input.value.trim();
        if (!q) return;
        results.replaceChildren(h('p', {}, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Searching…'));
        try {
          const list = await load(status);
          const Engine = root.CVChecks && root.CVChecks.Engine;
          const det = Engine && Engine.status() === 'connected' ? Engine.detected : null;
          const embed = det && det.embed ? (texts) => (root.CVEmbedCache ? root.CVEmbedCache.embed(texts, { base: det.base, model: det.embed, fetchImpl: Engine.fetchImpl() }) : defaultEmbed(texts, det, Engine)) : null;
          const hits = await search(list, q, { terms: root.CVTerms ? CVTerms.all(CVTerms.mine()) : [], embed });
          status.textContent = `${hits.length ? `${hits.length} passage${hits.length === 1 ? '' : 's'}` : 'Nothing found'} in ${cases.length} cases${embed ? ', closest in meaning first' : ''}.`;
          results.replaceChildren(...(hits.length ? hits.map((x) => h('a', { class: 'vs-hit', href: `#/case/${CVRoute.enc(x.caseId)}/${x.tab}`, onclick: () => close() },
            h('span', { class: 'vs-case' }, h('strong', {}, x.number || 'No case number'), ` ${x.title}`), h('span', { class: 'vs-where muted small' }, x.where),
            h('span', { class: 'vs-snip small' }, snippet(x.text, expandQuery(q, root.CVTerms ? CVTerms.all(CVTerms.mine()) : [])))))
            : [h('p', { class: 'muted empty-note' }, I('search'), h('span', {}, 'Nothing matches. Try other words.'))]));
        } catch (err) {
          if (root.FS && FS.isDisconnectError(err)) { close(); ui.onDriveLost(); return; }
          results.replaceChildren(h('p', { class: 'error-text small' }, `The search stopped: ${err.message}`));
        }
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
      return h('div', { class: 'vs-form' },
        h('h2', { icon: 'search' }, 'Search All Cases'),
        h('div', { class: 'row vs-bar' }, input, h('button', { class: 'btn primary', type: 'button', icon: 'search', onclick: run }, 'Search')),
        status, results,
        h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Close')));
    });
  }
  async function defaultEmbed(texts, det, Engine) {
    const res = await Engine.fetchImpl()(`${det.base}/api/embed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: det.embed, input: texts }) });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()).embeddings;
  }

  const api = { passagesOfCase, expandQuery, snippet, search, open };
  if (isNode) module.exports = api;
  else root.CVVaultSearch = api;
})(this);
