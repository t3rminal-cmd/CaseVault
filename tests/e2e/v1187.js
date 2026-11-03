// v1.187: Settings in the top-right menu; Suspect Search shows one row for a Mission's suspect whose
// arrest report has a middle name. All data is made up (Doe / Roe / Poe, Example City).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);

(async () => {
  const { b, p, errs } = await boot(1440, 950);
  await p.evaluate(async () => {
    const op = await Vault.createOperation({ number: 'OP-87', name: 'Example' });
    const ids = [];
    for (const n of ['EX-871', 'EX-872']) {
      const x = await Vault.createCase({ number: n, subject: 'John Doe', operationId: op.id });
      const c = await Vault.getCase(x.id);
      c.suspects = [{ name: 'John Doe', role: 'Primary', dob: '1990-02-03', info: {} }, { name: 'Rick Roe', role: 'Secondary', info: {} }];
      await Vault.saveCase(c);
      ids.push(x.id);
    }
    await Vault.writeCaseJSON(ids[1], 'arrest.json', { schema: 2, arrestees: [{ firstName: 'John', middleName: 'Allen', lastName: 'Doe', dob: '1990-02-03', date: '2026-04-01', charges: [{ statute: '720 ILCS 570/401', description: 'Delivery' }] }] });
  });

  // 1. Settings in the menu.
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.quick-actions');
  await p.click('#btn-menu');
  await p.waitForSelector('#app-menu:not([hidden])');
  const items = await p.$$eval('#app-menu .menu-item', (x) => x.map((e) => e.textContent.trim()).filter(Boolean));
  ok(items.includes('Settings') && !!(await p.$('#btn-settings svg')), `the menu has Settings, with its icon: ${items.join(', ')}`);
  await p.keyboard.press('Escape');

  // 2. Suspect Search: one John Doe.
  await p.click('.quick-actions .qa-tile:has-text("Suspect Search")');
  await p.waitForSelector('#dialog[open] .suspect-search');
  await p.fill('#dialog[open] .suspect-search input[type=search]', 'doe');
  await p.waitForTimeout(300);
  const rows = await p.$$eval('#dialog[open] .ss-row', (r) => r.map((x) => [...x.cells].map((c) => c.textContent.trim())));
  ok(rows.length === 1 && rows[0][0] === 'John Allen Doe' && rows[0][4] === '1' && /EX-871/.test(rows[0][5]) && /EX-872/.test(rows[0][5]), `one row for John Doe: ${JSON.stringify(rows)}`);
  // One line per person, nothing wrapped; the cases are a list.
  const look = await p.evaluate(() => {
    const r = document.querySelector('#dialog[open] .ss-row');
    const cells = [...r.cells].map((c) => Math.round(c.getBoundingClientRect().height));
    const sel = r.querySelector('select.ss-cases');
    return { tall: Math.max(...cells), first: sel && sel.options[0].textContent, n: sel && sel.options.length, headers: [...document.querySelectorAll('#dialog[open] .ss-table th')].map((t) => t.textContent) };
  });
  ok(look.tall < 50 && look.first === '3 Cases' && look.n === 4 && look.headers.join() === 'Name,DOB,Gender,IR #,Arrests,Cases', `one line, the cases in a list: ${JSON.stringify(look)}`);
  await p.click('#dialog[open] .ss-row td.ss-name');
  await p.waitForSelector('#dialog[open] .person-view', { timeout: 10000 });
  const pv = await p.textContent('#dialog[open] .person-view');
  ok(/EX-871/.test(pv) && /EX-872/.test(pv), 'their page lists both case numbers');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // 3. A case chosen in the list opens.
  await p.evaluate(() => { CVPersonView.search(CaseVaultUI, 'doe'); });
  await p.waitForSelector('#dialog[open] .ss-row select.ss-cases');
  const target = await p.$eval('#dialog[open] .ss-row select.ss-cases', (s) => [...s.options].find((o) => o.textContent === 'EX-872').value);
  await p.selectOption('#dialog[open] .ss-row select.ss-cases', target);
  await p.waitForTimeout(800);
  ok(await p.evaluate((i) => location.hash.includes(CVRoute.enc(i)) && !document.querySelector('#dialog[open] .suspect-search'), target), 'choosing a case number opens that case');

  // 4. Closing a case fills in each suspect's Outcome: Deceased for the death of the offender, At
  //    Large for the other; a box changed by hand stays; Undo puts them back.
  const solo = await p.evaluate(async () => {
    const x = await Vault.createCase({ number: 'EX-880', subject: 'Sam Poe' });
    const c = await Vault.getCase(x.id);
    c.suspects = [{ name: 'Sam Poe', role: 'Primary', info: {} }, { name: 'Jane Roe', role: 'Secondary', info: {} }, { name: 'Tom Doe', role: 'Secondary', info: {} }];
    await Vault.saveCase(c);
    return x.id;
  });
  await p.evaluate((i) => { location.hash = '#/x'; location.hash = `#/case/${CVRoute.enc(i)}/details`; }, solo);
  await p.waitForSelector('button.action-btn:has-text("Close Case")', { timeout: 20000 });
  await p.click('button.action-btn:has-text("Close Case")');
  await p.waitForSelector('#dialog[open] .close-form');
  const outs = async () => p.$$eval('#dialog[open] .close-outcome', (x) => x.map((s) => s.value));
  ok((await outs()).join() === 'at-large,at-large,at-large', `before a disposition: At Large: ${await outs()}`);
  await p.check('#dialog[open] input[name=disposition][value=exceptional]');
  await p.selectOption('#dialog[open] select[aria-label="Reason"]', 'Death of the offender');
  await p.waitForTimeout(200);
  ok((await outs()).join() === 'deceased,at-large,at-large', `the subject Deceased, the others At Large: ${await outs()}`);
  await p.selectOption('#dialog[open] select[aria-label="Tom Doe outcome"]', 'not-prosecuted');
  await p.selectOption('#dialog[open] select[aria-label="Reason"]', 'Prosecution declined');
  await p.waitForTimeout(200);
  ok((await outs()).join() === 'not-prosecuted,at-large,not-prosecuted', `follows the reason; one chosen by hand stays: ${await outs()}`);
  await p.fill('#dialog[open] input[aria-label="Closed by"]', 'SA Doe');
  await p.click('#dialog[open] .close-form button[type=submit]');
  await p.waitForTimeout(1200);
  const saved = await p.evaluate(async (i) => (await Vault.getCase(i)).suspects.map((x) => `${x.name}:${x.outcome}`), solo);
  ok(saved.join() === 'Sam Poe:not-prosecuted,Jane Roe:at-large,Tom Doe:not-prosecuted', `saved on the suspects: ${saved}`);
  await p.click('.toast .toast-undo');
  await p.waitForTimeout(1200);
  const back = await p.evaluate(async (i) => { const c = await Vault.getCase(i); return [c.status, ...c.suspects.map((x) => x.outcome || '')]; }, solo);
  ok(back[0] !== 'Closed' && back.slice(1).every((x) => !x), `Undo puts the outcomes back: ${back}`);
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
