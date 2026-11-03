// v1.186: Summaries (one home page tile: Week or Year) and the Narrative Helper (write and polish a
// narrative with the AI without opening a case; save it to a case's Reports). The AI engine on
// 127.0.0.1:11434 is faked. All data is made up (Doe / Roe / Poe, Example City).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);

(async () => {
  const { b, p, errs } = await boot(1440, 950);
  const asked = [];
  const NOTES = 'On 03/14/2026 at 1430 hours SA Doe bought 3.5 grams of cocaine from John Roe for $200 at 100 Example Street.';
  await p.route('http://127.0.0.1:11434/**', async (route) => {
    const r = route.request();
    if (/\/api\/tags/.test(r.url())) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [{ name: 'qwen2.5:7b', details: { parameter_size: '7.6B', family: 'qwen2' } }] }) });
    if (!/\/api\/chat/.test(r.url())) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    const body = JSON.parse(r.postData() || '{}');
    asked.push(body);
    const sys = body.messages[0].content; const user = body.messages[body.messages.length - 1].content;
    let answer;
    if (/You check a law-enforcement report/.test(sys)) answer = user.split('\nTEXT\n').pop().replace(/Rick Poe/g, '[CONFIRM: who drove]');
    else if (/Make this more concise/.test(user)) answer = 'SA Doe bought cocaine from John Roe.';
    else answer = 'On March 14, 2026, at 2:30 p.m., I, SA Doe, bought 3.5 grams of cocaine from John Roe for $200 at 100 Example Street. Rick Poe drove John Roe away.';
    const lines = [JSON.stringify({ message: { content: answer }, done: false }), JSON.stringify({ done: true })];
    return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: `${lines.join('\n')}\n` });
  });
  const id = await p.evaluate(async () => {
    const x = await Vault.createCase({ number: 'EX-1861', subject: 'John Roe' });
    await Vault.saveDraft(x.id, 'old-narrative', { title: 'Old Narrative', type: 'other' }, 'John Roe was seen at 100 Example Street.');
    await CVChecks.Engine.refresh();
    return x.id;
  });

  // 1. Summaries: one tile, Week or Year.
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.quick-actions'); await p.waitForTimeout(400);
  const tiles = await p.$$eval('.quick-actions .qa-tile', (x) => x.map((t) => t.textContent.trim()));
  ok(tiles.includes('Summaries') && tiles.includes('Narrative Helper') && !tiles.includes('Year Summary') && !tiles.includes('Weekly Summary'), `the tiles: ${tiles.join(', ')}`);
  const row = await p.$$eval('.quick-actions .qa-tile', (x) => new Set(x.map((t) => Math.round(t.getBoundingClientRect().top))).size);
  ok(row === 1, `the tiles still sit on one row (${row})`);
  await p.click('.quick-actions .qa-tile:has-text("Summaries")');
  await p.waitForSelector('#dialog[open] .sum-choice');
  const opts = await p.$$eval('#dialog[open] .sum-opt .sum-opt-label', (x) => x.map((e) => e.textContent));
  ok(opts.join() === 'Week,Year', `Week or Year: ${opts}`);
  await p.click('#dialog[open] .sum-opt:has-text("Week")');
  await p.waitForSelector('#dialog[open] .wk-view', { timeout: 10000 });
  ok(true, 'Week opens the Weekly Summary');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.click('.quick-actions .qa-tile:has-text("Summaries")'); await p.click('#dialog[open] .sum-opt:has-text("Year")');
  await p.waitForSelector('#dialog[open] .year-summary', { timeout: 10000 });
  ok(true, 'Year opens the Year Summary');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // 2. The Narrative Helper: a draft from typed facts, no case chosen.
  await p.click('.quick-actions .qa-tile:has-text("Narrative Helper")');
  await p.waitForSelector('.nh-page', { timeout: 15000 });
  ok(/#\/narrative/.test(await p.evaluate(() => location.hash)), 'its own page, #/narrative');
  await p.fill('.nh-notes', NOTES);
  await p.click('.nh-draft');
  await p.waitForSelector('#dialog[open] .aie-form');
  ok(/Write the narrative from the facts and notes/.test(await p.inputValue('#dialog[open] .aie-prompt')), 'Write a Draft fills in the prompt');
  ok(/only the facts and notes you typed/.test(await p.textContent('#dialog[open] .aie-form')), 'it says where the facts come from (no case)');
  await p.click('#dialog[open] .aie-run');
  await p.waitForFunction(() => /CONFIRM: who drove/.test(document.querySelector('#dialog[open] .aie-out').textContent), null, { timeout: 20000 });
  const req = asked.find((x) => /INSTRUCTION\nWrite the narrative/.test(x.messages[1].content)).messages[1].content;
  ok(/## Facts and notes from the investigator\n.*1430 hours SA Doe bought 3\.5 grams/.test(req), 'the typed facts go with the request');
  ok(/Rick Poe/.test(await p.textContent('#dialog[open] .aie-flags')), 'a name the facts don\'t have is marked');
  await p.click('#dialog[open] button:has-text("Replace the Narrative")');
  await p.waitForTimeout(300);
  const text = await p.inputValue('.nh-text');
  ok(/^On March 14, 2026, at 2:30 p\.m\., I, SA Doe/.test(text) && /\[CONFIRM: who drove\] drove/.test(text), `the draft is in: ${text.slice(0, 60)}`);
  ok(/\d+ words/.test(await p.textContent('.nh-count')), `word count: ${await p.textContent('.nh-count')}`);

  // 3. Ask AI to Edit on a selection.
  await p.evaluate(() => { const ta = document.querySelector('.nh-text'); ta.focus(); ta.setSelectionRange(0, ta.value.indexOf('. ') + 1); });
  await p.click('.nh-edit');
  await p.waitForSelector('#dialog[open] .aie-form');
  await p.fill('#dialog[open] .aie-prompt', 'Make this more concise');
  await p.click('#dialog[open] .aie-run');
  await p.waitForFunction(() => /SA Doe bought cocaine/.test(document.querySelector('#dialog[open] .aie-out').textContent), null, { timeout: 20000 });
  await p.waitForTimeout(400);
  await p.click('#dialog[open] button:has-text("Replace the Selection")');
  await p.waitForTimeout(300);
  ok(/^SA Doe bought cocaine from John Roe\. \[CONFIRM: who drove\]/.test(await p.inputValue('.nh-text')), 'only the selection is replaced');

  // 4. Kept while the app is open; saved to a case.
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForSelector('.quick-actions');
  await p.evaluate(() => { location.hash = '#/narrative'; }); await p.waitForSelector('.nh-page');
  ok(/^SA Doe bought cocaine/.test(await p.inputValue('.nh-text')) && (await p.inputValue('.nh-notes')) === NOTES, 'the text is still there after going home and back');
  await p.click('.nh-save');
  await p.waitForSelector('#dialog[open] .nh-save-form');
  await p.selectOption('#dialog[open] select[aria-label="Case"]', id);
  await p.fill('#dialog[open] input[aria-label="Report title"]', 'Buy Narrative');
  await p.click('#dialog[open] button:has-text("Save")');
  await p.waitForTimeout(800);
  const drafts = await p.evaluate(async (i) => Promise.all((await Vault.listDrafts(i)).map(async (d) => [d.title, (await Vault.readDraft(i, d.slug)).body])), id);
  ok(drafts.some(([t, body]) => t === 'Buy Narrative' && /^SA Doe bought cocaine/.test(body)), `saved in the case's Reports: ${JSON.stringify(drafts.map(([t]) => t))}`);
  ok(/Opened from EX-1861/.test(await p.textContent('.nh-opened')), 'it now says where it is saved');

  // 5. Open a report from a case, edit, save over it.
  await p.selectOption('.nh-case', id);
  await p.click('.nh-open');
  await p.waitForSelector('#dialog[open] .nh-open-form');
  await p.click('#dialog[open] .nh-report:has-text("Old Narrative")');
  await p.waitForSelector('#dialog[open] button:has-text("Open It")'); // it asks first: the narrative here is replaced
  await p.click('#dialog[open] button:has-text("Open It")');
  await p.waitForTimeout(400);
  ok((await p.inputValue('.nh-text')) === 'John Roe was seen at 100 Example Street.', 'a report from the case is opened');
  await p.fill('.nh-text', 'John Roe was seen at 100 Example Street at 1430 hours.');
  await p.click('.nh-save');
  await p.waitForSelector('#dialog[open] .nh-save-form');
  ok(await p.isChecked('#dialog[open] .nh-over input'), 'Save over the opened report is ticked');
  await p.click('#dialog[open] button:has-text("Save")');
  await p.waitForTimeout(800);
  const old = await p.evaluate(async (i) => ({ body: (await Vault.readDraft(i, 'old-narrative')).body, n: (await Vault.listDrafts(i)).length }), id);
  ok(old.body === 'John Roe was seen at 100 Example Street at 1430 hours.' && old.n === 2, `saved over it, no new report: ${JSON.stringify(old)}`);

  // 6. Nothing about it on the PC's own storage.
  const local = await p.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  ok(!/Example Street|John Roe/.test(local), 'no narrative text in the browser\'s storage');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
