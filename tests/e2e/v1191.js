// v1.191: General Files: the Age column is short (10mo, 2y, in 38d) with the full wording on hover,
// so the table fits at 1366 wide however old the cases are. All data is made up (Doe / Roe / Poe).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);

(async () => {
  const { b, p, errs } = await boot(1366, 900);
  await p.evaluate(async () => {
    const back = (days) => { const d = new Date(); d.setDate(d.getDate() - days); return Vault.localDay(d); };
    for (const [n, s, days] of [['EX-911', 'DOE, John Quincy', 335], ['EX-912', 'ROE-POEZ, Mary', 1900], ['EX-913', 'Poe, Rick A.', -38], ['EX-914', 'ROE, Jane', 12]]) {
      await Vault.createCase({ number: n, subject: s, opened: back(days) });
    }
  });
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/general'; }); await p.waitForSelector('.general-table');
  await p.waitForTimeout(500);
  const ages = await p.$$eval('.general-table tbody tr', (rs) => Object.fromEntries(rs.map((r) => [r.cells[0].textContent.trim(), [(r.querySelector('.age-cell') || {}).textContent.trim(), ((r.querySelector('.age-cell span') || {}).title || '')]])));
  ok(ages['EX-911'][0] === '11mo' && /^11 months \(335 days\) since it was opened$/.test(ages['EX-911'][1]), `short, the full wording on hover: ${JSON.stringify(ages['EX-911'])}`);
  ok(ages['EX-912'][0] === '5y' && ages['EX-914'][0] === '12d' && /^in \d+d$/.test(ages['EX-913'][0]), `years, days and the future: ${ages['EX-912'][0]}, ${ages['EX-914'][0]}, ${ages['EX-913'][0]}`);
  const [w, c] = await p.evaluate(async () => { await document.fonts.ready; const t = document.querySelector('.general-table'); return [t.scrollWidth, t.closest('.table-wrap').clientWidth]; });
  ok(w <= c + 1, `the table fits at 1366 wide: ${w} / ${c}`);
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
