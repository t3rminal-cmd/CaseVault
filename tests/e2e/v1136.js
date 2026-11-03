// v1.136: Year Summary (home page tile and Find) with its PDF, and the archive review after N years.
// All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1136';

(async () => {
  const { b, p, errs, ids } = await boot(1366, 900);
  const year = await p.evaluate(() => Vault.localDay().slice(0, 4));
  await p.evaluate(async ({ c, c3, year }) => {
    await Vault.writeCaseJSON(c, 'arrest.json', { schema: 2, arrestees: [{ firstName: 'John', lastName: 'Doe', date: `${year}-03-04`,
      charges: [{ statute: '720 ILCS 570/402(c)', description: 'Possession of a Controlled Substance', level: 'Felony', counts: '1' }],
      narcotics: [{ drug: 'Cocaine', amount: '3.5', unit: 'g' }] }] });
    await Vault.rebuildIndex();
  }, { c: ids.c, c3: ids.c3, year });
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.quick-actions');

  // Year Summary from its home page tile (v1.186: Summaries → Year).
  await p.click('.quick-actions .qa-tile:has-text("Summaries")'); await p.click('#dialog[open] .sum-opt:has-text("Year")'); await p.waitForSelector('#dialog[open] .year-summary');
  const stats = await p.$$eval('.ys-stat', (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  ok(stats.some((t) => /^3\s*Cases opened/.test(t)) && stats.some((t) => /^1\s*Arrests/.test(t)), `the year's numbers: ${stats.join(' | ')}`);
  const narc = await p.$$eval('.ys-table tbody tr', (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  ok(narc.some((t) => /Cocaine\s*3\.5 g\s*1/.test(t)), `narcotics recovered: ${narc.join(' | ')}`);
  const bars = await p.$$eval('.ys-bar', (x) => x.map((e) => e.style.height));
  ok(bars[2] === '100%' && bars[0] === '0%', `arrests by month (March): ${bars.slice(0, 4).join(',')}`);
  await p.locator('#dialog[open] .year-summary').screenshot({ path: `${SP}/year.png` });
  await p.click('#dialog[open] button:has-text("Print / PDF")'); await p.waitForTimeout(1500);
  ok(!!(await p.$('#dialog[open] canvas')), 'Print / PDF shows the PDF');
  await p.screenshot({ path: `${SP}/year-pdf.png` });
  await p.click('#dialog[open] button:has-text("Close")'); await p.waitForTimeout(300);
  // And from Find.
  await p.evaluate(() => document.activeElement.blur());
  await p.keyboard.press('Control+k'); await p.waitForSelector('#dialog[open] .find-form');
  await p.keyboard.type('year summary'); await p.waitForTimeout(200); await p.keyboard.press('Enter');
  ok(!!(await p.waitForSelector('#dialog[open] .year-summary', { timeout: 5000 }).catch(() => null)), 'Find opens it too');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // Archive review: off, then 5 years lists the archived case (EX-300, archived today) once "today"
  // is 10 years on (archived cases can't be changed, so the clock moves instead).
  ok(!(await p.$('.archived-section .ov-btn-review')), 'no Review button while it is off');
  await p.evaluate(() => { const real = Vault.localDay; Vault.localDay = (d) => (d ? real(d) : `${Number(real().slice(0, 4)) + 10}${real().slice(4)}`); });
  await p.selectOption('.archived-section select.ov-review-pick', '5'); await p.waitForTimeout(800);
  ok(await p.evaluate(() => Vault.data.settings.archiveReviewYears) === 5, 'kept with the vault');
  await p.click('.archived-section .ov-btn-review'); await p.waitForSelector('#dialog[open] .review-form');
  const rows = await p.$$eval('.review-table tbody tr', (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  ok(rows.length === 1 && /EX-300/.test(rows[0]) && /NOLLE PROSEQUI/.test(rows[0]), `the case archived 5+ years ago: ${rows.join(' | ')}`);
  await p.locator('#dialog[open] .review-form').screenshot({ path: `${SP}/review.png` });
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
