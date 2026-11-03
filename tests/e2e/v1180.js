// v1.180: Continue in a New Case with a warrant check, and its Undo; Close Mission with each case
// number's own disposition (suggested) and every case number's loose ends; the Mission Closeout PDF
// saved in the Mission Folder; an arrest made later, on the closed Mission; archiving its case numbers
// together. All data is made up (Doe / Roe / Poe, Example City).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1180';

(async () => {
  require('fs').mkdirSync(SP, { recursive: true });
  const { b, p, errs } = await boot(1440, 950);
  const ids = await p.evaluate(async () => {
    const op = await Vault.createOperation({ number: 'OP-8', name: 'Example' });
    const out = { op: op.id };
    for (const [n, subj] of [['EX-801', 'John Doe'], ['EX-802', 'Sam Poe'], ['EX-803', 'Rick Roe']]) {
      const x = await Vault.createCase({ number: n, subject: subj, operationId: op.id });
      const c = await Vault.getCase(x.id);
      c.suspects = [{ name: 'John Doe', role: 'Primary', info: {} }, { name: 'Sam Poe', role: 'Secondary', info: {}, outcome: 'not-prosecuted' }, { name: 'Rick Roe', role: 'Secondary', info: {}, outcome: 'at-large' }];
      await Vault.saveCase(c);
      out[n] = x.id;
    }
    await Vault.writeCaseJSON(out['EX-801'], 'arrest.json', { schema: 2, arrestees: [{ firstName: 'John', lastName: 'Doe', date: '2026-10-01', charges: [{ statute: '720 ILCS 570/401', description: 'Delivery' }] }] });
    await Vault.writeCaseJSON(out['EX-801'], 'report-fields.json', { evidence: [{ number: '1', inventory: '7654321', type: 'Narcotics', drug: 'Cocaine', custody: [] }] });
    const t1 = await Vault.getTimeline(out['EX-801']);
    t1.events.push({ id: 'b1', kind: 'buy', date: '2026-09-01', title: 'Buy 1', suspect: 'John Doe', drug: 'Cocaine', qty: '3.5', unit: 'g', paid: '200' });
    await Vault.saveTimeline(out['EX-801'], t1);
    const t2 = await Vault.getTimeline(out['EX-802']);
    t2.events.push({ id: 'd1', kind: 'deadline', date: '2026-12-01', title: 'Lab results', done: false });
    await Vault.saveTimeline(out['EX-802'], t2);
    await Vault.updateSettings({ affiant: { name: 'P.O. Example 1234' } });
    return out;
  });
  const details = async (id) => {
    await p.evaluate((i) => { location.hash = '#/x'; location.hash = `#/case/${CVRoute.enc(i)}/details`; }, id);
    await p.waitForSelector('select[aria-label="Suspect 3 outcome"]', { state: 'attached', timeout: 20000 });
    await p.evaluate(() => { const s = document.querySelector('.suspects'); if (s && s.classList.contains('folded')) s.querySelector('.fold-btn').click(); });
  };
  const cont = async (number) => {
    await p.click('.suspect-continue');
    await p.waitForSelector('#dialog[open] .continue-form');
    await p.fill('#dialog[open] input[aria-label="New case number"]', number);
    await p.fill('#dialog[open] input[aria-label="Warrant number"]', 'W-77');
    await p.click('#dialog[open] button[type=submit]');
    await p.waitForSelector('.suspect-continued a', { timeout: 15000 });
    await p.waitForTimeout(2000);
  };

  // 1. Continue Rick Roe in EX-850, with a warrant check; then Undo.
  await details(ids['EX-801']);
  await cont('EX-850');
  let st = await p.evaluate(async () => {
    const e = Vault.data.cases.find((x) => x.number === 'EX-850');
    const tl = (await Vault.getTimeline(e.id)).events;
    return { id: e.id, check: tl.find((x) => x.kind === 'deadline'), from: (await Vault.getCase(e.id)).continuedFrom };
  });
  ok(st.check && st.check.title === 'Warrant check: Rick Roe (warrant W-77)' && st.from.warrant === 'W-77', `the new case has a warrant check: ${JSON.stringify(st.check)}`);
  const want = await p.evaluate(() => { const d = new Date(`${Vault.localDay()}T12:00:00`); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); });
  ok(st.check && st.check.date === want, `30 days after it opened: ${st.check && st.check.date}`);
  await p.click('.suspect-continue-undo');
  await p.waitForSelector('#dialog[open] >> text=Undo: remove case EX-850?');
  await p.click('#dialog[open] button:has-text("Remove It")');
  await p.waitForSelector('.suspect-continue', { timeout: 15000 });
  await p.waitForTimeout(2000);
  st = await p.evaluate(async (i) => ({ gone: !Vault.data.cases.some((x) => x.number === 'EX-850'), deleted: (await Vault.listDeleted()).some((x) => x.number === 'EX-850'),
    rick: (await Vault.getCase(i)).suspects.find((s) => s.name === 'Rick Roe'), tl: (await Vault.getTimeline(i)).events.map((e) => e.title) }), ids['EX-801']);
  ok(st.gone && st.deleted && st.rick.outcome === 'at-large' && !st.rick.continuedIn && !st.tl.some((t) => /continued in case EX-850/.test(t)), `Undo: EX-850 to Recently Deleted, Rick Roe At Large again: ${JSON.stringify(st)}`);

  // 2. Continue again (EX-851); Undo is refused once the new case has notes.
  await cont('EX-851');
  const n851 = await p.evaluate(async () => { const e = Vault.data.cases.find((x) => x.number === 'EX-851'); await Vault.saveNotes(e.id, 'Seen near 100 Example Street.'); return e.id; });
  await p.click('.suspect-continue-undo');
  await p.waitForSelector('.toast.error', { timeout: 10000 });
  ok(/already has work in it/.test(await p.textContent('.toast.error')) && await p.evaluate(() => Vault.data.cases.some((x) => x.number === 'EX-851')), 'Undo is refused once something was added to the new case');

  // 3. Close Mission: each case number with its own (suggested) disposition; every case number's loose ends.
  await p.evaluate((i) => { location.hash = '#/x'; location.hash = `#/operation/${encodeURIComponent(i)}`; }, ids.op);
  await p.waitForSelector('button:has-text("Close Mission")', { timeout: 15000 });
  await p.click('button:has-text("Close Mission")');
  await p.waitForSelector('#dialog[open] .close-pick-row', { timeout: 20000 });
  const dlg = await p.evaluate(() => ({
    rows: [...document.querySelectorAll('#dialog[open] .close-pick-row')].map((r) => [r.querySelector('strong').textContent, r.querySelector('.close-disp').value, r.querySelector('.close-reason').hidden ? '' : r.querySelector('.close-reason').value]),
    radios: document.querySelectorAll('#dialog[open] input[name=disposition]').length,
    loose: document.querySelector('#dialog[open] .close-loose-groups') ? document.querySelector('#dialog[open] .close-loose-groups').textContent : '',
  }));
  ok(JSON.stringify(dlg.rows) === JSON.stringify([['EX-801', 'arrest', ''], ['EX-802', 'exceptional', 'Prosecution declined'], ['EX-803', 'continued', '']]), `each case number's suggested disposition: ${JSON.stringify(dlg.rows)}`);
  ok(dlg.radios === 0, 'no single disposition for all');
  ok(/EX-802.*open deadline.*Lab results/.test(dlg.loose) && /EX-801.*No lab result yet/.test(dlg.loose), `loose ends grouped by case number: ${dlg.loose.slice(0, 300)}`);
  await p.locator('#dialog[open]').screenshot({ path: `${SP}/close-mission.png` }).catch(() => {});
  await p.click('#dialog[open] .close-form button[type=submit]');
  await p.waitForSelector('#dialog[open] >> text=Close the Mission too?', { timeout: 15000 });
  await p.click('#dialog[open] button:has-text("Close Mission")');
  await p.waitForTimeout(1500);
  const closed = await p.evaluate(async (ids) => Promise.all(['EX-801', 'EX-802', 'EX-803'].map(async (n) => { const c = await Vault.getCase(ids[n]); return [n, c.status, c.closure.disposition, c.closure.reason || '']; })), ids);
  ok(JSON.stringify(closed) === JSON.stringify([['EX-801', 'Closed', 'arrest', ''], ['EX-802', 'Closed', 'exceptional', 'Prosecution declined'], ['EX-803', 'Closed', 'continued', '']]), `closed, each its own way: ${JSON.stringify(closed)}`);
  ok(await p.evaluate((i) => Vault.getOperation(i).status, ids.op) === 'Closed', 'the Mission is closed');

  // 4. The Mission Closeout PDF, saved in the Mission Folder.
  await p.evaluate((i) => { location.hash = '#/x'; location.hash = `#/operation/${encodeURIComponent(i)}`; }, ids.op);
  await p.waitForSelector('.op-closeout-btn', { timeout: 15000 });
  await p.click('.op-closeout-btn');
  await p.waitForSelector('#dialog[open] .pdf-view', { timeout: 20000 });
  await p.click('#dialog[open] button:has-text("Save to the Mission Folder")');
  await p.waitForTimeout(1200);
  const saved = await p.evaluate(async (i) => (await Vault.listShared(`op-${i}`, 'Other')).map((f) => [f.base || f.name, f.size]), ids.op);
  ok(saved.some(([n, sz]) => n === 'OP-8 Mission Closeout.pdf' && sz > 1000), `saved in the Mission Folder: ${JSON.stringify(saved)}`);
  await p.click('#dialog[open] button:has-text("Done")');

  // 5. Rick Roe arrested later on EX-851: the closed Mission notes it.
  await p.evaluate(async (i) => {
    await Vault.writeCaseJSON(i, 'arrest.json', { schema: 2, arrestees: [{ firstName: 'Rick', lastName: 'Roe', date: Vault.localDay(), charges: [{ statute: '720 ILCS 570/401', description: 'Delivery' }] }] });
    const c = await Vault.getCase(i); c.arrest = true; await Vault.saveCase(c);
  }, n851);
  await p.evaluate((i) => { location.hash = '#/x'; location.hash = `#/case/${CVRoute.enc(i)}/details`; }, n851);
  await p.waitForSelector('button.action-btn:has-text("Close Case")', { timeout: 20000 });
  await p.click('button.action-btn:has-text("Close Case")');
  await p.waitForSelector('#dialog[open] .close-form');
  await p.check('#dialog[open] input[name=disposition][value=arrest]');
  await p.click('#dialog[open] .close-form button[type=submit]');
  await p.waitForSelector('#dialog[open] >> text=Note the arrest on the closed Mission?', { timeout: 15000 });
  await p.click('#dialog[open] button:has-text("Add It")');
  await p.waitForTimeout(1500);
  const later = await p.evaluate(async (ids) => ({ later: Vault.getOperation(ids.op).later, tl: (await Vault.getTimeline(ids['EX-801'])).events.map((e) => e.title) }), ids);
  ok(later.later.length === 1 && /^Later: Rick Roe arrested on case EX-851 on /.test(later.later[0]) && later.tl.includes('Rick Roe arrested on case EX-851'), `the closed Mission and the case it came from note the arrest: ${JSON.stringify(later)}`);

  // 6. Archive the closed Mission's case numbers together.
  await p.evaluate((i) => { location.hash = '#/x'; location.hash = `#/operation/${encodeURIComponent(i)}`; }, ids.op);
  await p.waitForSelector('.op-later', { timeout: 15000 });
  ok(/Rick Roe arrested on case EX-851/.test(await p.textContent('.op-outcome')), 'the Mission page shows the later arrest');
  await p.click('.op-archive-btn');
  await p.waitForSelector('#dialog[open] .arch-form');
  await p.check('#dialog[open] input[name=arch-folder][value=prosecution]');
  await p.click('#dialog[open] .arch-form button[type=submit]');
  await p.waitForFunction((ids) => ['EX-801', 'EX-802', 'EX-803'].every((n) => Vault.isArchived(ids[n])), ids, { timeout: 60000 }).catch(() => {});
  const arch = await p.evaluate((ids) => ({ all: ['EX-801', 'EX-802', 'EX-803'].map((n) => Vault.isArchived(ids[n])), other: Vault.isArchived(ids.n851) }), { ...ids, n851 });
  ok(arch.all.every(Boolean) && !arch.other, `the Mission's case numbers are archived, the continued case is not: ${JSON.stringify(arch)}`);
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
