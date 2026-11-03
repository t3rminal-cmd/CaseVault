// v1.183: Terminology and the Language Bank (Vault); what goes to the AI with Draft with AI and Ask
// AI (only the terms used, the approved paragraphs, the required elements, Library passages with names
// scrubbed); the required elements checked; Use as AI Example offered on export. The AI engine on
// 127.0.0.1:11434 is faked. All data is made up (Doe / Roe / Poe, Example City).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);

(async () => {
  const { b, p, errs } = await boot(1440, 950);
  const asked = [];
  const stream = (t) => `${JSON.stringify({ message: { content: t }, done: false })}\n${JSON.stringify({ done: true })}\n`;
  await p.route('http://127.0.0.1:11434/**', async (route) => {
    const r = route.request();
    if (/\/api\/tags/.test(r.url())) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [{ name: 'qwen2.5:7b', details: { parameter_size: '7.6B', family: 'qwen2' } }] }) });
    if (!/\/api\/chat/.test(r.url())) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    const body = JSON.parse(r.postData() || '{}');
    asked.push(body);
    const answer = /CASEVAULT_ASK/.test(JSON.stringify(body.messages)) ? 'A zip is one ounce.'
      : 'Your affiant, SA Doe, has probable cause to believe narcotics are kept at the residence located at 100 Example Street, where the CI went inside within the last 72 hours.';
    return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: stream(answer) });
  });
  const id = await p.evaluate(async () => {
    const x = await Vault.createCase({ number: 'EX-1183', subject: 'John Roe' });
    await Vault.saveNotes(x.id, 'The CI said John Roe sells a zip of snowball from the house.');
    // A Library example with a phone number and a known subject's name in it ("kept as it is").
    const ex = 'AFFIDAVIT\n\nYour affiant has been a police officer for [CONFIRM: years] years and knows the trade.\n\nJohn Roe was called at 312-555-0147 by the CI.';
    const path = await Vault.saveLibraryFile('Warrant examples', 'sample affidavit.md', new File([ex], 'sample affidavit.md', { type: 'text/markdown' }));
    const meta = await Vault.readLibraryMeta(); meta.items[path] = { docType: 'affidavit' }; await Vault.writeLibraryMeta(meta);
    return x.id;
  });

  // 1. Vault → Terminology: a drug slang term that counts as cocaine; Language Bank: an approved paragraph.
  // The two sections on their own (the Vault panel reopens the saved folder, which crashes this
  // container's Chromium; CI is the same either way).
  await p.evaluate(() => { const box = document.createElement('div'); box.id = 'lib-test'; box.append(CVLibraryUI.termsSection(), CVLibraryUI.languageSection()); document.querySelector('#main').replaceChildren(box); });
  await p.waitForSelector('[data-section="terms"]', { timeout: 15000 });
  await p.fill('[data-section="terms"] input[aria-label="Term"]', 'snowball');
  await p.fill('[data-section="terms"] input[aria-label="Meaning"]', 'cocaine');
  await p.selectOption('[data-section="terms"] select[aria-label="Kind"]', 'Drug slang');
  await p.selectOption('[data-section="terms"] select[aria-label="Same as a drug"]', 'cocaine');
  await p.click('[data-section="terms"] button:has-text("Add Term")');
  await p.waitForTimeout(500);
  const t = await p.evaluate(() => ({ saved: Vault.data.settings.terms, drug: [...CVHealth.drugsIn('He sold a snowball.')], row: [...document.querySelectorAll('[data-section="terms"] .terms-table td strong')].some((x) => x.textContent === 'snowball') }));
  ok(t.saved && t.saved[0].term === 'snowball' && t.saved[0].drug === 'cocaine' && t.row, `the term is kept (vault.json) and listed: ${JSON.stringify(t.saved)}`);
  ok(t.drug.join() === 'cocaine', `the checks count it as cocaine: ${t.drug}`);
  await p.selectOption('[data-section="language"] select[aria-label="Kind of warrant or subpoena"]', 'residence');
  ok(/Required elements:.*Probable cause stated/.test(await p.textContent('[data-section="language"] .bank-list')), 'the kind\'s required elements are listed');
  await p.fill('[data-section="language"] input[aria-label="Paragraph title"]', 'Training');
  await p.fill('[data-section="language"] textarea[aria-label="Approved paragraph"]', 'Your affiant has been employed by the Example City Police Department for [CONFIRM: years] years.');
  await p.click('[data-section="language"] button:has-text("Add Paragraph")');
  await p.waitForTimeout(500);
  ok((await p.evaluate(() => Vault.data.settings.languageBank || [])).some((x) => x.type === 'residence' && x.title === 'Training'), 'the paragraph is kept for that kind');

  // 2. Draft with AI, an affidavit for a residence: the terms used, the approved paragraph, the elements; the example scrubbed.
  await p.evaluate(async (i) => { localStorage.setItem('cv.editMode', 'markdown'); await Vault.saveDraft(i, 'aff', { title: 'Affidavit', type: 'affidavit' }, ''); }, id);
  await p.evaluate((i) => CaseVaultUI.go(i, 'reports', 'aff'), id);
  await p.waitForSelector('.draft-actions-bar button:has-text("Draft with AI")', { timeout: 15000 });
  await p.click('.draft-actions-bar button:has-text("Draft with AI")');
  await p.waitForSelector('#dialog[open] .gen-form');
  ok(await p.isVisible('#dialog[open] select[aria-label="Kind of warrant or subpoena"]'), 'an affidavit asks for the kind of warrant');
  await p.selectOption('#dialog[open] select[aria-label="Kind of warrant or subpoena"]', 'residence');
  await p.click('#dialog[open] .gen-form button[type=submit]');
  await p.waitForFunction(() => /doesn't seem to cover/.test([...document.querySelectorAll('.toast')].map((x) => x.textContent).join(' ')), null, { timeout: 30000 });
  const req = asked.find((x) => /Write a first draft of: Affidavit/.test(x.messages[1].content)).messages[1].content;
  ok(/## Terms[^\n]*\n[\s\S]*- zip: one ounce/.test(req) && /- snowball: cocaine/.test(req) && !/- 8-ball/.test(req), 'only the terms the case uses go with it');
  ok(/## Approved language[^\n]*\n### Training\nYour affiant has been employed/.test(req), 'the approved paragraph for the kind goes with it');
  ok(/Make sure the draft covers each of these[\s\S]*- The items to be seized/.test(req), 'and the kind\'s required elements');
  ok(/Your affiant has been a police officer/.test(req) && !/312-555-0147/.test(req), 'the Library example goes with its phone number swapped for a placeholder');
  ok(/The items to be seized/.test([...await p.$$eval('.toast', (x) => x.map((y) => y.textContent))].join(' ')), 'what the draft doesn\'t cover is said');
  await p.click('.draft-actions-bar button:has-text("Review")');
  await p.waitForSelector('#dialog[open] .review-elements');
  const rev = await p.textContent('#dialog[open] .review-elements');
  ok(/⚠ Not found: The items to be seized/.test(rev) && /✓ Probable cause stated/.test(rev), `Review lists the required elements: ${rev.replace(/\s+/g, ' ').slice(0, 160)}`);
  await p.click('#dialog[open] button:has-text("Done")');

  // 3. Exported: Use as AI Example is offered (once).
  await p.click('.export-menu summary');
  await p.click('.export-menu button:has-text("Save to Case Files")');
  await p.waitForSelector('#dialog[open] >> text=Teach the AI with your final version?', { timeout: 15000 }).catch(() => {});
  const offered = await p.isVisible('#dialog[open] >> text=Teach the AI with your final version?').catch(() => false);
  if (offered) await p.click('#dialog[open] button:has-text("Not This One")');
  ok(offered && await p.evaluate(async (i) => (await Vault.readDraft(i, 'aff')).meta.exampleOffered === true, id), 'exporting an AI-started report offers Use as AI Example, once');

  // 4. Ask AI: the Library's passages go with the question (how to write), the terms too.
  await p.click('#btn-chat');
  await p.waitForSelector('#chat-float:not([hidden]) .chat-input');
  await p.waitForFunction(() => document.querySelector('#chat-float select[aria-label="Model"]').value, null, { timeout: 15000 });
  await p.selectOption('#chat-float select[aria-label="Case"]', id);
  await p.fill('#chat-float .chat-input', 'CASEVAULT_ASK how do I write the affiant\'s years as a police officer, for a zip case?');
  await p.click('#chat-float .chat-send:not([hidden])');
  await p.waitForFunction(() => /one ounce/.test(document.querySelector('#chat-float .chat-thread').textContent), null, { timeout: 20000 });
  const chat = JSON.stringify(asked.filter((x) => /CASEVAULT_ASK/.test(JSON.stringify(x.messages))).pop().messages);
  ok(/From the Library/.test(chat) && /Your affiant has been a police officer/.test(chat) && !/312-555-0147/.test(chat) && /- zip: one ounce/.test(chat), 'Ask AI gets the closest Library passage (scrubbed) and the terms');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
