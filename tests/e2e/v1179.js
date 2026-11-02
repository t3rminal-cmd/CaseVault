// v1.179: each suspect's outcome; a suspect still at large carried on in a new independent case
// (linked both ways, on both Timelines); the Mission page's suspects; closing the Mission with
// what became of each suspect saved on it. All data is made up (Doe / Roe / Poe, Example City).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1179';

(async () => {
  require('fs').mkdirSync(SP, { recursive: true });
  const { b, p, errs } = await boot(1440, 950);
  const ids = await p.evaluate(async () => {
    const op = await Vault.createOperation({ number: 'OP-9', name: 'Example' });
    const out = { op: op.id };
    for (const n of ['EX-901', 'EX-902']) {
      const x = await Vault.createCase({ number: n, subject: 'John Doe', operationId: op.id });
      const c = await Vault.getCase(x.id);
      c.suspects = [{ name: 'John Doe', role: 'Primary', info: {} }, { name: 'Rick Roe', dob: '1991-05-06', role: 'Secondary', info: { gender: 'Male', irNumber: '7654321' } }];
      c.contacts = { prosecutor: { name: 'Ann Roe' } };
      await Vault.saveCase(c);
      out[n] = x.id;
    }
    await Vault.writeCaseJSON(out['EX-901'], 'arrest.json', { schema: 2, arrestees: [{ firstName: 'John', lastName: 'Doe', date: '2026-10-01', charges: [{ statute: '720 ILCS 570/401', description: 'Delivery' }] }] });
    await Vault.updateSettings({ affiant: { name: 'P.O. Example 1234' } });
    return out;
  });

  // 1. Rick Roe is At Large: Continue in a New Case.
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/details`; }, ids['EX-901']);
  await p.waitForSelector('select[aria-label="Suspect 2 outcome"]', { state: 'attached', timeout: 20000 });
  await p.evaluate(() => { const s = document.querySelector('.suspects'); if (s && s.classList.contains('folded')) s.querySelector('.fold-btn').click(); });
  await p.waitForSelector('select[aria-label="Suspect 2 outcome"]');
  ok(!(await p.locator('.suspect-continue').count()), 'no Continue button before the suspect is At Large');
  await p.selectOption('select[aria-label="Suspect 2 outcome"]', 'at-large');
  await p.waitForSelector('.suspect-continue');
  await p.click('.suspect-continue');
  await p.waitForSelector('#dialog[open] .continue-form');
  await p.fill('#dialog[open] input[aria-label="New case number"]', 'EX-901');
  ok(await p.evaluate(() => !document.querySelector('#dialog[open] .continue-form .error-text').hidden), 'a Case Number already used is refused');
  await p.fill('#dialog[open] input[aria-label="New case number"]', 'EX-950');
  await p.click('#dialog[open] button[type=submit]');
  await p.waitForSelector('.suspect-continued a', { timeout: 15000 });
  ok(/EX-950/.test(await p.textContent('.suspect-continued')), 'the suspect card says "Continued in case EX-950", with a link');
  await p.waitForTimeout(2500); // the save and the Mission's shared suspects

  const got = await p.evaluate(async (ids) => {
    const e = Vault.data.cases.find((x) => x.number === 'EX-950');
    const nc = await Vault.getCase(e.id);
    const a = await Vault.getCase(ids['EX-901']); const b2 = await Vault.getCase(ids['EX-902']);
    const rick = (c) => c.suspects.find((s) => s.name === 'Rick Roe') || {};
    const tl = async (id) => (await Vault.getTimeline(id)).events.map((x) => x.title);
    return { id: e.id, op: nc.operationId, from: nc.continuedFrom, sx: nc.suspects, contacts: nc.contacts, a: rick(a), b: rick(b2), tlFrom: await tl(ids['EX-901']), tlTo: await tl(e.id) };
  }, ids);
  ok(got.op === '' && got.from && got.from.caseId === ids['EX-901'] && got.from.number === 'EX-901' && /OP-9/.test(got.from.mission), `the new case is independent and points back: ${JSON.stringify(got.from)}`);
  ok(got.sx.length === 1 && got.sx[0].name === 'Rick Roe' && got.sx[0].outcome === 'at-large' && got.sx[0].info.irNumber === '7654321' && got.sx[0].role === 'Primary' && !got.sx[0].continuedIn, 'Rick Roe is its suspect, with his details, still At Large');
  ok(got.contacts && got.contacts.prosecutor && got.contacts.prosecutor.name === 'Ann Roe', 'the contacts come along');
  ok(got.a.outcome === 'continued' && got.a.continuedIn.number === 'EX-950' && got.b.outcome === 'continued', `"Moved to Another Case" on both case numbers of the Mission: ${got.a.outcome} / ${got.b.outcome}`);
  ok(got.tlFrom.includes('Rick Roe continued in case EX-950') && got.tlTo.some((t) => /^Continued from case EX-901 \(Mission OP-9/.test(t)), `each Timeline says so: ${JSON.stringify([got.tlFrom, got.tlTo])}`);

  // 2. The new case's Details tab points back.
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/details`; }, got.id);
  await p.waitForSelector('.continued-from', { timeout: 15000 });
  ok(/Continued from case EX-901 \(Mission OP-9.*for Rick Roe/.test(await p.textContent('.continued-from')), 'the new case says where it came from');

  // 3. The Mission page: every suspect accounted for (John Doe from the arrest report).
  await p.evaluate((i) => { location.hash = `#/operation/${encodeURIComponent(i)}`; }, ids.op);
  await p.waitForSelector('.op-suspects', { timeout: 15000 });
  const strip = await p.textContent('.op-suspects');
  ok(/2 of 2 suspects accounted for/.test(strip) && /John Doe\s*Arrested/.test(strip) && /Rick Roe\s*Moved to Another Case\s*case EX-950/.test(strip), `the Mission's suspects: ${strip}`);
  await p.locator('.op-progress').screenshot({ path: `${SP}/mission.png` }).catch(() => {});

  // 4. Close Mission: the suspects are listed, and the Mission keeps what became of them.
  await p.click('button:has-text("Close Mission")');
  await p.waitForSelector('#dialog[open] .close-form');
  const dlg = await p.textContent('#dialog[open] .close-suspects');
  ok(/John Doe: Arrested/.test(dlg) && /Rick Roe: Moved to Another Case in case EX-950/.test(dlg), `the Close Mission dialog lists the suspects: ${dlg}`);
  ok(!/still At Large/.test(await p.textContent('#dialog[open] .close-form')), 'no "still At Large" reminder once the suspect is continued');
  // v1.180: each case number's own disposition, suggested: both by arrest (John Doe's report, Rick Roe moved on).
  ok(JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('#dialog[open] .close-disp')].map((x) => x.value))) === '["arrest","arrest"]', 'both case numbers suggested Cleared by arrest');
  await p.click('#dialog[open] .close-form button[type=submit]');
  await p.waitForSelector('#dialog[open] >> text=Close the Mission too?', { timeout: 15000 });
  ok(/Suspects: Arrested: John Doe\. Moved to Another Case: Rick Roe \(case EX-950\)\./.test(await p.textContent('#dialog[open]')), 'the question shows what became of each suspect');
  await p.click('#dialog[open] button:has-text("Close Mission")');
  await p.waitForTimeout(1500);
  const op = await p.evaluate((i) => Vault.getOperation(i), ids.op);
  ok(op.status === 'Closed' && op.outcome === 'Arrested: John Doe. Moved to Another Case: Rick Roe (case EX-950).', `the Mission is closed with its suspects' outcome: ${op.status} ${op.outcome}`);
  const nc = await p.evaluate(async (i) => (await Vault.getCase(i)).status, got.id);
  ok(nc === 'Open', 'the new case stays open');
  await p.evaluate((i) => { location.hash = '#/x'; location.hash = `#/operation/${encodeURIComponent(i)}`; }, ids.op);
  await p.waitForSelector('.op-outcome', { timeout: 15000 });
  ok(/Moved to Another Case: Rick Roe/.test(await p.textContent('.op-outcome')), 'the closed Mission\'s page shows it');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
