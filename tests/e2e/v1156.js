// v1.156: Password Manager (Department, Email in full, PIN, Linked to Google), aliases with a full
// profile (work history, family, mailbox, school, identity, age and zodiac worked out), and the
// Department filter (DEA / CPD …); then saved searches, recent cases on the rail, Select Cases, the
// chain of custody, the Deadline Calendar, the Weekly Summary, the duplicate file warning and Check
// the Vault. All data is made up (Doe / Roe / Poe, Example City).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1156';

(async () => {
  require('fs').mkdirSync(SP, { recursive: true });
  const { b, p, errs, ids } = await boot(1366, 900);
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.recent-section'); await p.waitForTimeout(500);
  await p.locator('a.ov-btn-locker').first().click(); await p.waitForSelector('.locker-card');
  await p.fill('input[aria-label="New locker password"]', 'correct horse 42');
  await p.fill('input[aria-label="The same password again"]', 'correct horse 42');
  await p.click('.locker-card button[type=submit]'); await p.waitForSelector('#dialog[open] .recovery-key', { timeout: 30000 });
  await p.check('#dialog[open] input[type=checkbox]'); await p.click('#dialog[open] button:has-text("Done")');
  await p.waitForSelector('.locker-open', { timeout: 30000 });
  const F = (label) => `#dialog[open] .locker-form .field:has(> span:text-is("${label}")) :is(input, select, textarea)`;

  // 1. Password Manager: Department, Email (long, shown in full), PIN, Linked to Google.
  const add = async (site, dept, email, google) => {
    await p.click('.locker-section button:has-text("Add Password")'); await p.waitForSelector('#dialog[open] .locker-form');
    await p.fill(F('Site / System'), site); await p.fill(F('Username'), 'jdoe');
    await p.fill('#dialog[open] .locker-form .field:has(> span:text-is("Password")) input', 'Synthetic-Pass-1');
    await p.fill('#dialog[open] .locker-form .field:has(> span:text-is("PIN")) input', '4321');
    await p.fill(F('Email'), email); await p.fill(F('Department'), dept);
    if (google) await p.check('#dialog[open] .locker-check input');
    await p.click('#dialog[open] button[type=submit]'); await p.waitForTimeout(700);
  };
  await add('Example County Portal', 'DEA', 'john.doe.investigator.longaddress@examplecity-police.gov', true);
  await add('Example City Mail', 'CPD', 'jdoe@examplecity.gov', false);
  const heads = await p.$$eval('.locker-rows thead th', (x) => x.map((e) => e.textContent).filter(Boolean));
  ok(JSON.stringify(heads) === JSON.stringify(['Site / System', 'Department', 'Username', 'Email', 'Password', 'PIN']), `Password Manager columns: ${JSON.stringify(heads)}`);
  const email = await p.evaluate(() => { const c = [...document.querySelectorAll('.locker-rows td.copy-cell .copy-text')].find((e) => /longaddress/.test(e.textContent)); return c ? { full: c.textContent, cut: c.scrollWidth > c.clientWidth + 1 } : null; });
  ok(email && /longaddress@examplecity-police\.gov$/.test(email.full) && !email.cut, `the email is shown in full: ${JSON.stringify(email)}`);
  ok((await p.$$('.locker-rows .google-tag')).length === 1, 'Linked to Google shows on one row');
  ok((await p.$$('.locker-rows td.secret-cell')).length === 4, 'Password and PIN are hidden until shown');
  await p.locator('.locker-section').first().screenshot({ path: `${SP}/passwords.png` }).catch(() => {});

  // 2. Department filter.
  await p.click('.locker-depts button:has-text("DEA")'); await p.waitForTimeout(400);
  let sites = await p.$$eval('.locker-rows tbody tr td:first-child', (x) => x.map((e) => e.textContent));
  ok(sites.length === 1 && /Example County Portal/.test(sites[0]), `DEA only: ${JSON.stringify(sites)}`);
  await p.click('.locker-depts button:has-text("All")'); await p.waitForTimeout(400);
  ok((await p.$$('.locker-rows tbody tr')).length === 2, 'All shows both');

  // 3. A covert alias with the full profile.
  await p.click('.locker-tabs button:has-text("Covert")'); await p.waitForSelector('.locker-section');
  await p.click('.locker-section button:has-text("Add Alias")'); await p.waitForSelector('#dialog[open] .locker-form-section');
  const sections = await p.$$eval('#dialog[open] .locker-form-section > h3', (x) => x.map((e) => e.textContent));
  ok(['Identity', 'Identification', 'Contact', 'School', 'Work History', 'Family', 'Backstory'].every((s) => sections.includes(s)), `alias sections: ${JSON.stringify(sections)}`);
  await p.fill(F('Alias Name'), 'Rick Poe'); await p.fill(F('Department'), 'CPD');
  await p.fill(F('Date of Birth Used'), '1990-03-25');
  const autos = await p.$$eval('#dialog[open] .locker-auto', (x) => x.map((e) => e.textContent));
  ok(autos.length === 2 && /^\d+$/.test(autos[0]) && autos[1] === 'Aries', `age and zodiac worked out: ${JSON.stringify(autos)}`);
  await p.selectOption(F('Gender'), 'Male'); await p.selectOption(F('Blood Type'), 'O+');
  await p.fill(F('Language (Native)'), 'English'); await p.fill(F('Language (Second)'), 'Spanish');
  await p.fill('#dialog[open] .locker-form .field:has(> span:text-is("Social Security Number")) input', '000-00-0000');
  await p.click('#dialog[open] button:has-text("Add Mailing Address")');
  await p.fill('#dialog[open] input[aria-label="Mailing Address 1 Address"]', '1 Example St, Example City');
  await p.fill(F('High School (Name, City, Years)'), 'Example City High, 2004-2008');
  await p.click('#dialog[open] button:has-text("Add Work")');
  await p.fill('#dialog[open] input[aria-label="Work 1 Employer"]', 'Example Logistics');
  await p.fill('#dialog[open] input[aria-label="Work 1 Position"]', 'Driver');
  await p.fill('#dialog[open] input[aria-label="Work 1 Years"]', '2015-2019');
  await p.click('#dialog[open] button:has-text("Add Family Member")');
  await p.fill('#dialog[open] input[aria-label="Family Member 1 Name"]', 'Jane Poe');
  await p.fill('#dialog[open] input[aria-label="Family Member 1 Relation"]', 'Sister');
  await p.screenshot({ path: `${SP}/alias-form.png`, fullPage: false });
  await p.click('#dialog[open] button[type=submit]'); await p.waitForTimeout(800);
  const aliasRow = await p.$eval('.locker-rows tbody tr', (e) => e.textContent);
  ok(/Rick Poe/.test(aliasRow) && /CPD/.test(aliasRow) && /\d\d/.test(aliasRow), `alias row: ${aliasRow}`);
  // Saved: open Edit again and the lists are back.
  await p.click('.locker-rows .locker-edit'); await p.waitForSelector('#dialog[open] .locker-form-section');
  const back = await p.evaluate(() => ({ work: document.querySelector('#dialog[open] input[aria-label="Work 1 Employer"]')?.value, family: document.querySelector('#dialog[open] input[aria-label="Family Member 1 Relation"]')?.value }));
  ok(back.work === 'Example Logistics' && back.family === 'Sister', `work history and family saved: ${JSON.stringify(back)}`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // The Department filter carries over to Covert.
  await p.click('.locker-depts button:has-text("DEA")'); await p.waitForTimeout(400);
  ok(/No covert aliases for DEA/.test(await p.textContent('.locker-section')), 'DEA filter: no CPD alias');
  await p.locator('.locker-open').screenshot({ path: `${SP}/covert.png` }).catch(() => {});
  // ---- Saved searches: words as filters, a quick filter chip, and a search kept under the box.
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.recent-section'); await p.waitForTimeout(400);
  const today = await p.evaluate(() => Vault.localDay());
  const plus = (n) => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  await p.evaluate(async ([i, d]) => { const tl = await Vault.getTimeline(i); tl.events = [...(tl.events || []), { id: 'dl1', kind: 'deadline', date: d, title: 'Lab report due' }]; await Vault.saveTimeline(i, tl); }, [ids.c2, plus(3)]);
  await p.click('#btn-side-search'); await p.waitForSelector('.saved-searches');
  await p.click('.saved-chip button.saved-run:has-text("Due This Week")'); await p.waitForTimeout(500);
  const dueList = await p.textContent('#case-list');
  ok(/EX-200/.test(dueList) && !/EX-100/.test(dueList) && !/EX-300/.test(dueList), `Due This Week: ${dueList.replace(/\s+/g, ' ')}`);
  await p.fill('#case-search', 'status:open roe'); await p.waitForTimeout(400);
  ok(await p.isVisible('.saved-searches .saved-add'), 'Save Search offered for a typed search');
  await p.click('.saved-searches .saved-add'); await p.waitForSelector('#dialog[open] input[aria-label="Name of the search"]');
  await p.fill('#dialog[open] input[aria-label="Name of the search"]', 'Open Roe'); await p.click('#dialog[open] button[type=submit]'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => (Vault.data.settings.savedSearches || []).some((x) => x.name === 'Open Roe' && x.q === 'status:open roe')), 'the search is saved in the vault');
  await p.locator('.sidebar-tools').screenshot({ path: `${SP}/saved-searches.png` }).catch(() => {});
  await p.fill('#case-search', ''); await p.dispatchEvent('#case-search', 'input'); await p.waitForTimeout(300);

  // ---- Last opened cases on the rail.
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/details`; }, ids.c); await p.waitForSelector('.tabs a.tab.active'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => (Vault.data.settings.recentOpened || [])[0]) === ids.c, 'the opened case is first in the recent list');
  ok(await p.$$eval('.rail-recent a.rail-case', (x) => x.length) >= 1, 'recent cases are on the rail');

  // ---- Select Cases: pin two cases at once.
  await p.click('#btn-side-more'); await p.click('#btn-side-bulk'); await p.waitForSelector('#dialog[open] .bulk-list, #dialog[open] input[type=checkbox]');
  await p.screenshot({ path: `${SP}/bulk.png` });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // ---- Chain of custody on an exhibit (Write Report tab), and its PDF.
  await p.evaluate(async (i) => { await CVLazy.reports(); const d = await CVReportFieldsUI.load({ id: i }); await Vault.writeCaseJSON(i, 'report-fields.json', { ...d, evidence: [{ number: 1, inventory: 'INV-1', type: 'Other', description: 'Synthetic phone', photos: [] }] }); }, ids.c);
  await p.evaluate((i) => { location.hash = '#/x'; location.hash = `#/case/${CVRoute.enc(i)}/draft`; }, ids.c); await p.waitForSelector('.rf-custody-btn', { state: 'attached', timeout: 15000 });
  await p.evaluate(() => document.querySelectorAll('.rf-fold[aria-expanded="false"]').forEach((x) => x.click())); await p.waitForTimeout(400);
  await p.click('.rf-custody-btn'); await p.waitForSelector('#dialog[open] .custody-form');
  await p.fill('#dialog[open] input[aria-label="Released by"]', 'John Doe'); await p.fill('#dialog[open] input[aria-label="Received by"]', 'Officer Roe');
  await p.click('#dialog[open] .custody-form button[type=submit]'); await p.waitForTimeout(300);
  ok(await p.inputValue('#dialog[open] select[aria-label="Custody action"]') === 'Checked Out' && await p.inputValue('#dialog[open] input[aria-label="Released by"]') === 'Officer Roe', 'the next entry is filled in from the last');
  await p.fill('#dialog[open] input[aria-label="Received by"]', 'Example City Lab'); await p.selectOption('#dialog[open] select[aria-label="Custody action"]', 'Sent to Lab');
  await p.click('#dialog[open] .custody-form button[type=submit]'); await p.waitForTimeout(300);
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/custody.png` }).catch(() => {});
  await p.click('#dialog[open] button:has-text("Done")'); await p.waitForTimeout(1500);
  ok(/2 entries · Out: Sent to Lab \(Example City Lab\)/.test(await p.textContent('.rf-custody-btn')), `custody line: ${await p.textContent('.rf-custody-btn')}`);
  await p.evaluate(() => Save.flushAll()).catch(() => {}); await p.waitForTimeout(800);
  const saved = await p.evaluate((i) => window.__readCaseJSON(i, 'report-fields.json'), ids.c);
  ok(saved.evidence[0].custody && saved.evidence[0].custody.length === 2, `custody saved: ${JSON.stringify(saved.evidence[0].custody)}`);
  await p.click('button:has-text("Chain of Custody PDF")'); await p.waitForSelector('#dialog[open] .pdf-view', { timeout: 10000 });
  ok(true, 'Chain of Custody PDF opens'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // ---- Deadline Calendar and Weekly Summary.
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.recent-section'); await p.waitForTimeout(400);
  await p.click('.quick-actions .qa-tile:has-text("Calendar")'); await p.waitForSelector('#dialog[open] .cal-view', { timeout: 10000 });
  const cal = await p.textContent('#dialog[open] .cal-grid');
  ok(/EX-200 Lab report due/.test(cal), 'the deadline is on the calendar');
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/calendar.png` }).catch(() => {});
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.click('.quick-actions .qa-tile:has-text("Summaries")'); await p.click('#dialog[open] .sum-opt:has-text("Week")'); await p.waitForSelector('#dialog[open] .wk-view', { timeout: 10000 });
  ok(/EX-100/.test(await p.textContent('#dialog[open] .wk-body')), 'the Weekly Summary lists a case changed this week');
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/weekly.png` }).catch(() => {});
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // ---- The same file twice, and Check the Vault.
  const dup = await p.evaluate(async (i) => {
    const f = new File(['Synthetic file for the duplicate check.'], 'note.txt', { type: 'text/plain' });
    await Vault.addFile(i, f, { keepName: true });
    const r = await Vault.findSameFiles(i, [new File(['Synthetic file for the duplicate check.'], 'other name.txt'), new File(['Different text.'], 'x.txt')]);
    return r.map((x) => !!x.same);
  }, ids.c);
  ok(dup[0] === true && dup[1] === false, `duplicate found by content: ${JSON.stringify(dup)}`);
  const chk = await p.evaluate(() => Vault.checkVault());
  ok(chk.cases >= 3 && chk.problems.length === 0, `Check the Vault: ${JSON.stringify({ cases: chk.cases, files: chk.files, problems: chk.problems })}`);

  ok(!errs.length, `no page errors${errs.length ? `: ${errs.join(' | ')}` : ''}`);
  await b.close();
})().catch((e) => { console.log('FAIL', e.stack); process.exit(1); });
