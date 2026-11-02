// v1.115: closing several case numbers of a Mission by arrest when only the last RD has the arrest
// report: the others point to it ("Arrest report on RD"). All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1115';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  const more = await p.evaluate(async (opId) => {
    const out = [];
    for (const n of ['EX-201', 'EX-202', 'EX-203']) { const x = await Vault.createCase({ number: n, subject: 'John Doe' }); await Vault.assignCase(x.id, opId); out.push(x.id); }
    // Only the last RD has the arrest report.
    const a = CVClosing.emptyArrest();
    Object.assign(a.arrestees[0], { firstName: 'John', lastName: 'DOE', date: '2026-09-30' });
    Object.assign(a.arrestees[0].charges[0], { statute: '720 ILCS 570/402(c)', description: 'Possession of a Controlled Substance' });
    await Vault.writeCaseJSON(out[2], 'arrest.json', a);
    return out;
  }, ids.op);
  // Close Mission from the Mission page: the first case has no arrest details.
  await p.evaluate((id) => { location.hash = `#/operation/${id}`; }, ids.op); await p.waitForTimeout(900);
  const btn = p.locator('button:has-text("Close Mission")').first();
  if (await btn.count()) await btn.click();
  else await p.evaluate(async (id) => { const open = Vault.data.cases.filter((x) => x.operationId === id && x.status !== 'Closed'); CVClosingUI.closeCaseDialog(await Vault.getCase(open[0].id), { operation: open }); }, ids.op);
  await p.waitForSelector('.close-form');
  // v1.180: from Close Mission each case number has its own disposition: all of them by arrest here.
  for (const sel of await p.locator('.close-form select.close-disp').all()) await sel.selectOption('arrest');
  await p.fill('.close-form input[aria-label="Closed by"]', 'Det. Example');
  await p.waitForTimeout(200);
  const ref = p.locator('.close-form select[aria-label="Arrest report on RD"]');
  ok(await ref.isVisible() && (await ref.inputValue()) === more[2], 'Arrest report on RD shows, set to the RD with the arrest report');
  const opts = await ref.locator('option').allTextContents();
  ok(opts.length === 2 && /EX-203: John DOE/.test(opts[1]), `only RDs with an arrest report are offered: ${opts.join(' | ')}`);
  const submit = p.locator('.close-form button[type=submit]');
  ok(!(await submit.isDisabled()), `Close passes with the RD chosen (${(await submit.textContent()).trim()})`);
  await p.locator('.close-form').screenshot({ path: `${SP}/close.png` }).catch(() => {});
  // Without an RD it does not pass.
  await ref.selectOption(''); await p.waitForTimeout(150);
  ok(await submit.isDisabled() && (await p.locator('.close-form .arrest-required').count()) === 1, 'without the RD, closing by arrest is blocked');
  await ref.selectOption(more[2]); await p.waitForTimeout(150);
  await submit.click(); await p.waitForTimeout(1200);
  // A "Close the Mission too?" question may follow.
  const keep = p.locator('dialog button:has-text("Keep it open")');
  if (await keep.count()) { await keep.click(); await p.waitForTimeout(400); }
  const res = await p.evaluate(async (list) => { const out = []; for (const id of list) { const c = await Vault.getCase(id); out.push({ n: c.number, s: c.status, ref: c.closure && c.closure.arrestRef, note: c.closure && c.closure.note, arrest: !!c.arrest }); } return out; }, more);
  ok(res.every((x) => x.s === 'Closed'), `all three closed: ${res.map((x) => `${x.n} ${x.s}`).join(', ')}`);
  ok(res[0].ref && res[0].ref.number === 'EX-203' && /Arrest report: see RD EX-203/.test(res[0].note) && res[1].ref && !res[2].ref && !res[0].arrest && res[2].arrest, `the others point to EX-203: ${JSON.stringify(res.map((x) => x.ref && x.ref.number))}`);
  // The Arrest tab of a case that points to another RD.
  await p.evaluate((id) => { location.hash = `#/case/${id}/arrest`; }, more[0]); await p.waitForSelector('.arrest-toolbar'); await p.waitForTimeout(500);
  const card = await p.textContent('.arrest-ref-card').catch(() => '');
  ok(/arrest report for this case is on RD EX-203/.test(card), `the Arrest tab says where the report is: ${card.trim().slice(0, 80)}`);
  await p.locator('.arrest-ref-card').screenshot({ path: `${SP}/ref.png` }).catch(() => {});
  await p.click('.arrest-ref-card button'); await p.waitForTimeout(600);
  ok((await p.evaluate((id) => location.hash.includes(CVRoute.enc(id)), more[2])), 'Open RD EX-203 goes to its Arrest Details');
  const sl = await p.evaluate(async (id) => CVClosingUI.statusLine(await Vault.getCase(id)), more[0]);
  ok(/Arrest report on RD EX-203/.test(sl), `status line: ${sl}`);
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
