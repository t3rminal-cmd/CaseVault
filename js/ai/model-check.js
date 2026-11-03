/* CaseVault — Test the Models on This PC (v1.185; AI engine window). Each installed model gets the
 * same three small tests, on the self-test's made-up case (never your cases):
 *   Mistakes found  the affidavit and report with 5 planted differences (time, plate, count, amount,
 *                   name spelling): how many it finds, and false alarms (the address written
 *                   "Ave" and "Avenue" is the same address)
 *   Made-up facts   a short rewrite: dates, times, amounts or names it adds that weren't there
 *   Speed           words (tokens) per second, and the time taken
 * The best for this PC comes first; Use This One makes its profile (Quick, Light…) this PC's choice.
 *
 * The scoring has no DOM: the tests run it under Node.
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const Self = () => (isNode ? require('../selftest.js') : root.CVSelfTest);
  const Copilot = () => (isNode ? require('../drafts/copilot.js') : root.CVCopilot);

  // Each planted difference: what the affidavit says, and what the report says.
  const PLANTED = {
    time: [/21:?45/, /21:?40/], plate: [/TST-?1248/i, /TST-?1284/i], count: [/\bthree\b|\b3 shots/i, /\btwo\b|\b2 shots/i],
    money: [/2,?450/, /2,?540/], name: [/Sampel/i, /\bSample\b/i],
  };
  const SCHEMA = { type: 'object', properties: { differences: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, affidavit: { type: 'string' }, report: { type: 'string' } }, required: ['what', 'affidavit', 'report'] } } }, required: ['differences'] };
  const REWRITE_SOURCE = 'On 03/14/2026 at 2140 hours, Officer Alex Sample saw license plate TST-1284 at 1420 Example Avenue. The witness heard two shots.';

  /** The request for the mistakes test. */
  function mistakesMessages() {
    const M = Self().MINI_CASE;
    return [
      { role: 'system', content: 'You compare two law-enforcement documents about the same event. List every fact that differs between them (times, numbers, plates, amounts, the spelling of names). The same fact written another way is not a difference. Answer as JSON.' },
      { role: 'user', content: `AFFIDAVIT\n${M.affidavit}\n\nREPORT\n${M.report}` },
    ];
  }
  /** The request for the made-up facts test. */
  function rewriteMessages() {
    return [
      { role: 'system', content: 'Rewrite the text in the style of a police report: past tense, third person, short factual sentences. Keep every fact; add nothing. Answer with the text only.' },
      { role: 'user', content: REWRITE_SOURCE },
    ];
  }
  /** The mistakes test's answer, scored. -> { found: [keys], falseAlarms } */
  function scoreMistakes(answer) {
    let list = answer;
    if (typeof answer === 'string') { try { list = JSON.parse(answer); } catch { list = null; } }
    const items = (list && Array.isArray(list.differences) ? list.differences : []).map((d) => `${d.what || ''} | ${d.affidavit || ''} | ${d.report || ''}`);
    const found = Object.keys(PLANTED).filter((k) => items.some((t) => PLANTED[k][0].test(t) && PLANTED[k][1].test(t)));
    const falseAlarms = items.filter((t) => !Object.values(PLANTED).some(([a, b]) => a.test(t) && b.test(t)) && /\bave(nue)?\b|address/i.test(t)).length;
    return { found, falseAlarms };
  }
  /** The made-up facts test's answer, scored: what it added that the text didn't have. */
  const scoreRewrite = (out) => Copilot().newFacts(out, REWRITE_SOURCE);
  /** The models, best for this PC first: most mistakes found, fewest made-up facts and false alarms, then speed. */
  function rank(results) {
    return [...results].sort((a, b) => (b.found || []).length - (a.found || []).length || (a.madeUp || []).length - (b.madeUp || []).length
      || (a.falseAlarms || 0) - (b.falseAlarms || 0) || (b.tps || 0) - (a.tps || 0));
  }

  /* ---------- browser ---------- */
  async function runOne(model, { base, fetchImpl, numCtx, signal }) {
    const post = async (body) => {
      const res = await fetchImpl(`${base}/api/chat`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, stream: false, keep_alive: '1m', options: { temperature: 0, seed: 7, num_ctx: numCtx }, ...body }) });
      if (!res.ok) throw new Error(`the engine answered ${res.status}`);
      return res.json();
    };
    const t0 = Date.now();
    const a = await post({ messages: mistakesMessages(), format: SCHEMA });
    const m = scoreMistakes((a.message && a.message.content) || '');
    const b = await post({ messages: rewriteMessages() });
    const out = Copilot().cleanEdit((b.message && b.message.content) || '');
    const tps = b.eval_count && b.eval_duration ? b.eval_count / (b.eval_duration / 1e9) : a.eval_count && a.eval_duration ? a.eval_count / (a.eval_duration / 1e9) : 0;
    return { model, found: m.found, falseAlarms: m.falseAlarms, madeUp: scoreRewrite(out), tps: Math.round(tps * 10) / 10, secs: Math.round((Date.now() - t0) / 100) / 10 };
  }

  /** The Test the Models window. */
  async function open(ui) {
    const { h, openDialog, toast } = ui;
    const Engine = root.CVChecks.Engine;
    await Engine.refresh().catch(() => {});
    const det = Engine.detected;
    if (!det || det.status !== 'connected' || !det.chat.length) return toast('No AI engine with a model is running. Start Start-CaseVault.bat on the CV-AI drive, then try again.', 'error', 8000);
    const ctrl = new AbortController();
    const results = [];
    const profileOf = (model) => Object.entries(det.profiles || {}).find(([, m]) => m === model);
    const table = h('div', { class: 'mc-table' });
    const status = h('p', { class: 'small' });
    const draw = () => {
      const list = rank(results.filter((r) => !r.error));
      table.replaceChildren(h('table', { class: 'data-table mc' },
        h('thead', {}, h('tr', {}, ['Model', 'Mistakes Found', 'Made-Up Facts', 'Speed', ''].map((x) => h('th', {}, x)))),
        h('tbody', {}, ...list.map((r, i) => {
          const prof = profileOf(r.model);
          return h('tr', { class: i === 0 ? 'mc-best' : '' },
            h('td', {}, h('strong', {}, CVAI.modelName(r.model)), i === 0 ? h('span', { class: 'mc-badge small' }, ' Best on this PC') : ''),
            h('td', { title: `Found: ${r.found.join(', ') || 'none'}${r.falseAlarms ? `; ${r.falseAlarms} false alarm${r.falseAlarms === 1 ? '' : 's'}` : ''}` }, `${r.found.length} of 5${r.falseAlarms ? ` (+${r.falseAlarms} false)` : ''}`),
            h('td', { title: r.madeUp.join(', ') }, r.madeUp.length ? `${r.madeUp.length}: ${r.madeUp.slice(0, 3).join(', ')}` : 'None'),
            h('td', {}, `${r.tps || '—'} tokens/s · ${r.secs} s`),
            h('td', {}, prof ? h('button', { class: 'btn small', type: 'button', title: `Makes ${prof[0]} (this model) this PC's AI profile`, onclick: () => { CVHardware.setProfile(prof[0]); toast(`This PC now uses ${CVAI.modelName(r.model)} (${prof[0]}).`, 'success'); } }, 'Use This One') : h('span', { class: 'muted small' }, 'Not a profile')));
        })),
        ...results.filter((r) => r.error).map((r) => h('p', { class: 'muted small' }, `${CVAI.modelName(r.model)}: ${r.error}`))));
    };
    const dlg = openDialog((close) => h('div', { class: 'mc-form' },
      h('h2', { icon: 'bar-chart-line-fill' }, 'Test the Models on This PC'),
      h('p', { class: 'muted small' }, 'Each installed model reads the self-test\'s made-up affidavit and report (5 planted mistakes) and rewrites a short paragraph. It takes a minute or two per model. Your cases are not used.'),
      status, table,
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => { ctrl.abort(); close(); } }, 'Done'))));
    const models = det.chat.map((m) => m.name);
    for (let i = 0; i < models.length && !ctrl.signal.aborted; i++) {
      status.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), ` Testing ${CVAI.modelName(models[i])} (${i + 1} of ${models.length})… the first answer can take a while as the model loads.`);
      try {
        results.push(await CVActivity.exclusive('check', () => runOne(models[i], { base: det.base, fetchImpl: Engine.fetchImpl(), numCtx: CVAI.numCtxFor((profileOf(models[i]) || ['quick'])[0]), signal: ctrl.signal }), { label: 'Testing the models…', model: CVAI.modelName(models[i]) }));
      } catch (err) { if (ctrl.signal.aborted) break; results.push({ model: models[i], error: `could not finish: ${err.message}` }); }
      draw();
    }
    if (!ctrl.signal.aborted) status.textContent = `Done: ${models.length} model${models.length === 1 ? '' : 's'} tested. The best for this PC is at the top.`;
    await dlg;
  }

  const api = { PLANTED, SCHEMA, REWRITE_SOURCE, mistakesMessages, rewriteMessages, scoreMistakes, scoreRewrite, rank, open };
  if (isNode) module.exports = api;
  else root.CVModelCheck = api;
})(this);
