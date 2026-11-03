// v1.181: Ask AI to Edit, on the Write Report tab's Summary of Investigation and in the Reports
// editor: the prompt box and quick prompts, the case's facts sent with it, the AI's version beside
// the text, new facts marked, Replace / Insert Below and Undo. The AI engine on 127.0.0.1:11434 is
// faked. All data is made up (Doe / Roe / Poe, Example City).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1181';

(async () => {
  require('fs').mkdirSync(SP, { recursive: true });
  const { b, p, errs } = await boot(1440, 950);
  const asked = [];
  await p.route('http://127.0.0.1:11434/**', async (route) => {
    const r = route.request();
    if (/\/api\/tags/.test(r.url())) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [{ name: 'qwen2.5:7b', details: { parameter_size: '7.6B', family: 'qwen2' } }] }) });
    if (/\/api\/chat/.test(r.url())) {
      const body = JSON.parse(r.postData() || '{}');
      asked.push(body);
      const whole = /return the whole narrative/.test(body.messages[0].content);
      // v1.182: the second look at the facts the case doesn't have.
      const fix = /You check a law-enforcement report/.test(body.messages[0].content);
      const answer = fix ? 'On March 14, 2026, at 2:30 p.m., SA DOE bought 3.5 grams of cocaine from John ROE for $200. [CONFIRM: who drove] drove the car.'
        : whole
        ? 'Here is the edited text:\n\nOn March 14, 2026, at 2:30 p.m., SA DOE bought 3.5 grams of cocaine from John ROE for $200. Rick POE drove the car.'
        : 'John ROE sold 3.5 grams of cocaine.';
      const lines = [answer.slice(0, 20), answer.slice(20)].map((t) => JSON.stringify({ message: { content: t }, done: false })).concat(JSON.stringify({ done: true }));
      return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: `${lines.join('\n')}\n` });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  const id = await p.evaluate(async () => {
    const x = await Vault.createCase({ number: 'EX-1181', subject: 'John Roe' });
    const c = await Vault.getCase(x.id); c.suspects = [{ name: 'John Roe', role: 'Primary', info: {} }]; await Vault.saveCase(c);
    const tl = await Vault.getTimeline(x.id);
    tl.events.push({ id: 'b1', kind: 'buy', date: '2026-03-14', time: '14:30', title: 'Buy 1', suspect: 'John Roe', drug: 'Cocaine', qty: '3.5', unit: 'g', paid: '200' });
    await Vault.saveTimeline(x.id, tl);
    await Vault.writeCaseJSON(x.id, 'arrest.json', { schema: 2, arrestees: [{ firstName: 'John', lastName: 'Roe', date: '2026-04-01', location: '100 Example Street, Example City', charges: [{ statute: '720 ILCS 570/401', description: 'Delivery' }] }] });
    await Vault.writeCaseJSON(x.id, 'report-fields.json', { narrative: 'SA Doe met John Roe. He gave him cocaine.' });
    return x.id;
  });

  // 1. Write Report tab, nothing selected: the whole narrative.
  await p.evaluate((i) => { localStorage.removeItem('casevault-folded-sections'); location.hash = `#/case/${CVRoute.enc(i)}/draft`; }, id);
  await p.waitForSelector('.rf-ask-edit', { state: 'attached', timeout: 20000 });
  await p.evaluate(() => document.querySelectorAll('.rf-section.rf-folded .rf-fold').forEach((x) => x.click()));
  await p.click('.rf-ask-edit');
  await p.waitForSelector('#dialog[open] .aie-form');
  ok(/whole narrative/.test(await p.textContent('#dialog[open] .aie-form > p')), 'with nothing selected it works on the whole narrative');
  const chips = await p.$$eval('#dialog[open] .aie-chip', (x) => x.map((y) => y.textContent));
  ok(chips.join('|') === 'Tighten|Third Person, Past Tense|Add Times and Places|Time Order|Grammar Only', `quick prompts: ${chips.join(', ')}`);
  await p.click('#dialog[open] .aie-chip:has-text("Add Times and Places")');
  ok(/Add the date, time and place/.test(await p.inputValue('#dialog[open] .aie-prompt')), 'a quick prompt fills the box');
  await p.click('#dialog[open] .aie-run');
  await p.waitForFunction(() => !document.querySelector('#dialog[open] .aie-form button.btn.primary:not(.aie-run)').disabled, null, { timeout: 15000 });
  const req = asked.filter((x) => /INSTRUCTION/.test(x.messages[1].content)).pop(); // the edit, not the second look (v1.182)
  ok(req && /Buy 1/.test(req.messages[1].content) && /720 ILCS 570\/401 — Delivery/.test(req.messages[1].content) && /Cocaine/.test(req.messages[1].content) && /INSTRUCTION\nAdd the date, time and place/.test(req.messages[1].content) && /SA Doe met John Roe\. He gave him cocaine\./.test(req.messages[1].content),
    'the timeline, the arrest report, the instruction and the narrative go to the AI');
  const shown = await p.evaluate(() => ({ out: document.querySelector('#dialog[open] .aie-out').textContent, flags: document.querySelector('#dialog[open] .aie-flags').hidden ? '' : document.querySelector('#dialog[open] .aie-flags').textContent }));
  ok(/^On March 14, 2026, at 2:30 p\.m\./.test(shown.out), `the AI's version, without its introduction: ${shown.out.slice(0, 60)}`);
  ok(/Rick POE/.test(shown.flags) && !/March 14|2:30|\$200|3\.5 grams|John ROE/.test(shown.flags), `only what the case doesn't have is marked: ${shown.flags}`);
  ok(/\[CONFIRM: who drove\] drove the car\.$/.test(shown.out) && /what is still missing is now \[CONFIRM/.test(shown.flags), `v1.182: checked again, and the name it made up is now [CONFIRM: …]: ${shown.out.slice(-50)}`);
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/ask-edit.png` }).catch(() => {});
  await p.click('#dialog[open] button:has-text("Replace the Narrative")');
  await p.waitForTimeout(1500);
  let saved = await p.evaluate(async (i) => (await Vault.readCaseJSON(i, 'report-fields.json')).narrative, id);
  ok(/^On March 14, 2026, at 2:30 p\.m\., SA DOE bought/.test(saved), `Replace puts it in (and saves): ${saved.slice(0, 50)}`);
  await p.click('.toast .toast-undo');
  await p.waitForTimeout(1500);
  saved = await p.evaluate(async (i) => (await Vault.readCaseJSON(i, 'report-fields.json')).narrative, id);
  ok(saved.trim() === 'SA Doe met John Roe. He gave him cocaine.', `Undo puts the narrative back: ${saved}`);

  // 2. Keep a prompt as a button, and remove it.
  await p.click('.rf-ask-edit');
  await p.waitForSelector('#dialog[open] .aie-form');
  await p.fill('#dialog[open] .aie-prompt', 'Use the suspect\'s full name the first time.');
  await p.click('#dialog[open] .aie-keep');
  await p.waitForSelector('#dialog[open] .aie-chip:has-text("Use the suspect")');
  ok((await p.evaluate(() => Vault.data.settings.aiEditPrompts)).some((x) => x.prompt === 'Use the suspect\'s full name the first time.'), 'Keep as a Button saves it (vault.json, on the SSD)');
  await p.click('#dialog[open] .aie-chip-del');
  await p.waitForTimeout(400);
  ok(!(await p.evaluate(() => (Vault.data.settings.aiEditPrompts || []).length)), 'and it can be removed');
  await p.click('#dialog[open] button:has-text("Cancel")');

  // 3. The Reports editor (plain text mode), a selection: only the selection is sent and replaced; Insert Below too.
  await p.evaluate(async (i) => { localStorage.setItem('cv.editMode', 'markdown'); await Vault.saveDraft(i, 'buy-narrative', { title: 'Buy Narrative', type: 'other' }, 'Intro line.\nHe gave him cocaine.\nLast line.'); }, id);
  await p.evaluate((i) => CaseVaultUI.go(i, 'reports', 'buy-narrative'), id);
  await p.waitForSelector('.draft-actions-bar button:has-text("Ask AI to Edit")', { timeout: 15000 });
  const select = () => p.evaluate(() => { const t = document.querySelector('.editor-wrap textarea'); const s = t.value.indexOf('He gave'); t.focus(); t.setSelectionRange(s, s + 'He gave him cocaine.'.length); });
  await select();
  await p.click('.draft-actions-bar button:has-text("Ask AI to Edit")');
  await p.waitForSelector('#dialog[open] .aie-form');
  ok((await p.textContent('#dialog[open] .aie-in')).trim() === 'He gave him cocaine.', 'the selection is what it works on');
  await p.fill('#dialog[open] .aie-prompt', 'Name who sold what.');
  await p.click('#dialog[open] .aie-run');
  await p.waitForFunction(() => !document.querySelector('#dialog[open] .aie-form button.btn.primary:not(.aie-run)').disabled, null, { timeout: 15000 });
  ok(/return only what replaces it/.test(asked[asked.length - 1].messages[0].content), 'the AI is told it has a part, not the whole');
  await p.click('#dialog[open] button:has-text("Replace the Selection")');
  await p.waitForTimeout(300);
  ok(await p.inputValue('.editor-wrap textarea') === 'Intro line.\nJohn ROE sold 3.5 grams of cocaine.\nLast line.', 'Replace changes only the selection');
  await p.evaluate(() => { const t = document.querySelector('.editor-wrap textarea'); t.focus(); t.setSelectionRange(0, 'Intro line.'.length); });
  await p.click('.draft-actions-bar button:has-text("Ask AI to Edit")');
  await p.waitForSelector('#dialog[open] .aie-form');
  await p.fill('#dialog[open] .aie-prompt', 'Write the next sentence.');
  await p.click('#dialog[open] .aie-run');
  await p.waitForFunction(() => !document.querySelector('#dialog[open] .aie-form button.btn.primary:not(.aie-run)').disabled, null, { timeout: 15000 });
  await p.click('#dialog[open] button:has-text("Insert Below")');
  await p.waitForTimeout(300);
  ok(await p.inputValue('.editor-wrap textarea') === 'Intro line.\n\nJohn ROE sold 3.5 grams of cocaine.\nJohn ROE sold 3.5 grams of cocaine.\nLast line.', 'Insert Below keeps the selection and adds the AI\'s text after it');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
