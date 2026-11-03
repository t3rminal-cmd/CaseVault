// v1.184: Ask AI about a whole Mission; Timeline events from a report (duplicates unticked, quotes
// checked); Search All Cases; the Closing Summary memo saved in the Mission Folder. The AI engine on
// 127.0.0.1:11434 is faked. All data is made up (Doe / Roe / Poe, Example City).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);

(async () => {
  const { b, p, errs } = await boot(1440, 950);
  const asked = [];
  const stream = (t) => `${JSON.stringify({ message: { content: t }, done: false })}\n${JSON.stringify({ done: true })}\n`;
  const REPORT = 'On March 14, 2026, at 2:30 p.m., the UC bought 3.5 grams of cocaine from John Doe for $200. On April 1, 2026, at 6:10 a.m., officers arrested John Doe at 100 Example Street.';
  await p.route('http://127.0.0.1:11434/**', async (route) => {
    const r = route.request();
    if (/\/api\/tags/.test(r.url())) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [{ name: 'qwen2.5:7b', details: { parameter_size: '7.6B', family: 'qwen2' } }] }) });
    if (!/\/api\/chat/.test(r.url())) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    const body = JSON.parse(r.postData() || '{}');
    asked.push(body);
    const sys = body.messages[0].content; const user = body.messages[body.messages.length - 1].content;
    if (body.format) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ done: true, message: { content: JSON.stringify({ events: [
        { date: '2026-03-14', time: '14:30', kind: 'buy', title: 'Buy from John Doe', suspect: 'John Doe', drug: 'Cocaine', qty: '3.5', unit: 'g', paid: '200', quote: 'the UC bought 3.5 grams of cocaine from John Doe for $200.' },
        { date: '2026-04-01', time: '06:10', kind: 'arrest', title: 'Arrest of John Doe at 100 Example Street', suspect: 'John Doe', quote: 'officers arrested John Doe at 100 Example Street.' },
        { date: '2026-04-02', kind: 'court', title: 'Bond court', quote: 'He appeared in bond court the next day.' },
      ] }) } }) });
    }
    let answer;
    if (/You check a law-enforcement report/.test(sys)) answer = user.split('\nTEXT\n').pop().replace(/Sam Poe/g, '[CONFIRM: who drove]');
    else if (/closing summary memo/.test(sys)) answer = 'To: GS Example\nFrom: SA Doe\nDate: [CONFIRM: date]\nRe: OP-7 Example\n\nJohn Doe was arrested and charged. Sam Poe drove him.';
    else answer = 'Two case numbers; John Doe was arrested.';
    return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: stream(answer) });
  });
  const ids = await p.evaluate(async () => {
    const op = await Vault.createOperation({ number: 'OP-7', name: 'Example' });
    const out = { op: op.id };
    for (const [n, subj] of [['EX-701', 'John Doe'], ['EX-702', 'Rick Roe']]) {
      const x = await Vault.createCase({ number: n, subject: subj, operationId: op.id });
      const c = await Vault.getCase(x.id);
      c.suspects = [{ name: 'John Doe', role: 'Primary', info: {} }, { name: 'Rick Roe', role: 'Secondary', info: {}, outcome: 'at-large' }];
      await Vault.saveCase(c);
      out[n] = x.id;
    }
    const tl = await Vault.getTimeline(out['EX-701']);
    tl.events.push({ id: 'b1', kind: 'buy', date: '2026-03-14', time: '14:30', title: 'Buy 1', suspect: 'John Doe', drug: 'Cocaine', qty: '3.5', unit: 'g', paid: '200' });
    await Vault.saveTimeline(out['EX-701'], tl);
    await Vault.writeCaseJSON(out['EX-701'], 'arrest.json', { schema: 2, arrestees: [{ firstName: 'John', lastName: 'Doe', date: '2026-04-01', charges: [{ statute: '720 ILCS 570/401', description: 'Delivery' }] }] });
    await Vault.saveNotes(out['EX-702'], 'Rick Roe was seen in a white Impala.');
    const other = await Vault.createCase({ number: 'EX-799', subject: 'Sam Poe' });
    const oc = await Vault.getCase(other.id); oc.suspects = [{ name: 'Sam Poe', role: 'Primary', info: { marks: 'teardrop tattoo under the left eye' } }]; await Vault.saveCase(oc);
    out['EX-799'] = other.id;
    return out;
  });

  // 1. Ask AI about the whole Mission.
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/details`; }, ids['EX-701']);
  await p.waitForSelector('#btn-chat', { timeout: 20000 });
  await p.click('#btn-chat');
  await p.waitForSelector('#chat-float:not([hidden]) .chat-input');
  await p.waitForFunction(() => document.querySelector('#chat-float select[aria-label="Model"]').value, null, { timeout: 15000 });
  const opts = await p.$$eval('#chat-float select[aria-label="Case"] option', (o) => o.map((x) => x.textContent));
  ok(opts.includes('Mission OP-7 Example'), `the Mission can be chosen: ${opts.slice(0, 4).join(' | ')}`);
  await p.selectOption('#chat-float select[aria-label="Case"]', `op:${ids.op}`);
  await p.fill('#chat-float .chat-input', 'Who was arrested in this Mission?');
  await p.click('#chat-float .chat-send:not([hidden])');
  await p.waitForFunction(() => /Two case numbers/.test(document.querySelector('#chat-float .chat-thread').textContent), null, { timeout: 20000 });
  const m = asked.filter((x) => /QUESTION\n\nWho was arrested in this Mission\?/.test(x.messages[x.messages.length - 1].content)).pop().messages.pop().content;
  ok(/## Mission: OP-7 Example \(2 case numbers\)/.test(m) && /Suspects: Arrested: John Doe\. At Large: Rick Roe\./.test(m) && /### Case EX-701/.test(m) && /### Case EX-702/.test(m) && /white Impala/.test(m) && /720 ILCS 570\/401/.test(m) && /### Buys \(all case numbers\)/.test(m),
    'every case number, the suspects\' outcomes, the buys and the arrest report go with the question');
  await p.click('#chat-float button[title^="Close"]');

  // 2. Timeline events from a report.
  await p.evaluate((i) => { location.hash = '#/x'; location.hash = `#/case/${CVRoute.enc(i)}/timeline`; }, ids['EX-701']);
  await p.waitForSelector('.tl-from-report', { timeout: 20000 });
  await p.click('.tl-from-report');
  await p.waitForSelector('#dialog[open] .fr-form');
  await p.fill('#dialog[open] textarea[aria-label="Report text"]', REPORT);
  await p.click('#dialog[open] button:has-text("Find Events")');
  await p.waitForSelector('#dialog[open] .fr-row', { timeout: 20000 });
  const rows = await p.$$eval('#dialog[open] .fr-row', (r) => r.map((x) => ({ on: x.querySelector('input').checked, text: x.textContent })));
  ok(rows.length === 3 && !rows[0].on && /Already on the Timeline/.test(rows[0].text), 'the buy already on the Timeline starts unticked');
  ok(rows[1].on && !/Not found word for word/.test(rows[1].text) && /Not found word for word/.test(rows[2].text), 'a quote not in the report is marked to check');
  await p.click('#dialog[open] button:has-text("Add 2 Events")');
  await p.waitForTimeout(1500);
  const tl = await p.evaluate(async (i) => (await Vault.getTimeline(i)).events.map((e) => [e.kind, e.title, e.date, e.note || '']), ids['EX-701']);
  ok(tl.length === 3 && tl.some(([k, t, d, n]) => k === 'arrest' && /Arrest of John Doe/.test(t) && d === '2026-04-01' && /From the report: "officers arrested John Doe/.test(n)), `the events ticked are added, with their sentence: ${JSON.stringify(tl)}`);

  // 3. Search All Cases.
  await p.evaluate(() => { CVVaultSearch.open(CaseVaultUI); });
  await p.waitForSelector('#dialog[open] .vs-form');
  await p.fill('#dialog[open] .vs-input', 'teardrop tattoo');
  await p.press('#dialog[open] .vs-input', 'Enter');
  await p.waitForSelector('#dialog[open] .vs-hit', { timeout: 20000 });
  const hits = await p.$$eval('#dialog[open] .vs-hit', (x) => x.map((y) => y.textContent));
  ok(hits.length && /EX-799/.test(hits[0]) && /teardrop/.test(hits[0]), `the case with the tattoo comes first: ${hits[0]}`);
  await p.fill('#dialog[open] .vs-input', 'white Impala');
  await p.press('#dialog[open] .vs-input', 'Enter');
  await p.waitForFunction(() => /EX-702/.test((document.querySelector('#dialog[open] .vs-hit') || {}).textContent || ''), null, { timeout: 20000 });
  await p.click('#dialog[open] .vs-hit');
  await p.waitForTimeout(800);
  ok(await p.evaluate((i) => location.hash.includes(CVRoute.enc(i)), ids['EX-702']), 'a result opens its case');

  // 4. The Closing Summary.
  await p.evaluate((i) => { location.hash = '#/x'; location.hash = `#/operation/${encodeURIComponent(i)}`; }, ids.op);
  await p.waitForSelector('.op-memo-btn', { timeout: 20000 });
  await p.click('.op-memo-btn');
  await p.waitForSelector('#dialog[open] .memo-form');
  await p.waitForFunction(() => /Check every fact/.test(document.querySelector('#dialog[open] .memo-form').textContent), null, { timeout: 20000 });
  const memo = await p.inputValue('#dialog[open] .memo-text');
  const mreq = asked.find((x) => /closing summary memo/.test(x.messages[0].content)).messages[1].content;
  ok(/- EX-701 \(John Doe\): Open/.test(mreq) && /- John Doe: Arrested; charges: 720 ILCS 570\/401 Delivery/.test(mreq) && /Total paid: \$200/.test(mreq), 'the memo is asked from the Mission\'s facts');
  ok(/\[CONFIRM: who drove\] drove him\./.test(memo) && /Sam Poe/.test(await p.textContent('#dialog[open] .aie-flags')), 'the name the Mission doesn\'t have is checked again and marked [CONFIRM: …]');
  await p.click('#dialog[open] button:has-text("Save to the Mission Folder")');
  await p.waitForTimeout(1200);
  const saved = await p.evaluate(async (i) => (await Vault.listShared(`op-${i}`, 'Other')).map((f) => f.base || f.name), ids.op);
  ok(saved.includes('OP-7 Closing Summary.docx'), `saved in the Mission Folder as Word: ${saved}`);
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
