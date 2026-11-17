// v1.192: with Brightness (Options) set, a window's suggestion list and calendar sit under their box,
// and typing in Training's Group box no longer stretches or scrolls the window (Firefox kept the
// setting; Edge didn't). All data is made up (Jane Doe).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);

(async () => {
  const { b, p, errs } = await boot(1366, 768);
  await p.evaluate(async () => {
    for (const n of ['CPR.pdf', 'Glock.pdf', 'Narc.pdf']) await Vault.addShared('other', 'Training', new File(['%PDF-1.4 x'], n, { type: 'application/pdf' }));
    await Vault.saveTraining({ 'CPR.pdf': { course: 'First Aid', group: 'Medical', expires: Vault.localDay() }, 'Glock.pdf': { course: 'Glock', group: 'Firearms Qualification' }, 'Narc.pdf': { course: 'Narcotics', group: 'Narcotics Investigations' } });
  });
  for (const [bright, zoom] of [[90, 100], [115, 125]]) {
    await p.evaluate(([bb, zz]) => { CVOptions.setBrightness(bb); CVOptions.setZoom(zz); }, [bright, zoom]);
    await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; });
    await p.waitForSelector('.attention-row.att-cert', { timeout: 8000 });
    await p.click('.attention-row.att-cert');
    await p.waitForSelector('.cert-card[data-file="CPR.pdf"] .cert-edit', { timeout: 10000 }); await p.waitForTimeout(1200);
    await p.click('.cert-card[data-file="CPR.pdf"] .cert-edit'); await p.waitForSelector('#dialog[open] .cert-form');
    ok(await p.evaluate(() => document.documentElement.classList.contains('bright-adjusted')), `brightness ${bright}% zoom ${zoom}% is on`);
    const m = () => p.evaluate(() => {
      const d = document.querySelector('#dialog[open]'); const g = d.querySelector('input[aria-label="Group"]'); const ul = g.closest('.combo').querySelector('.combo-list');
      const gr = g.getBoundingClientRect(); const lr = ul.hidden ? null : ul.getBoundingClientRect();
      return { left: Math.round(gr.left), scroll: [d.scrollHeight - d.clientHeight, d.scrollWidth - d.clientWidth, d.scrollTop, d.scrollLeft], under: lr ? Math.abs(lr.left - gr.left) < 2 && lr.top >= gr.bottom - 1 && lr.top - gr.bottom < 8 : null };
    });
    await p.click('#dialog[open] input[aria-label="Group"]'); await p.keyboard.press('Control+a'); await p.keyboard.press('Delete');
    await p.keyboard.press('ArrowDown');
    const seen = [await m()];
    for (const ch of 'Narc') { await p.keyboard.type(ch); seen.push(await m()); }
    ok(seen.every((s) => s.under === true), `the list sits right under the Group box: ${JSON.stringify(seen.map((s) => s.under))}`);
    ok(new Set(seen.map((s) => s.left)).size === 1 && seen.every((s) => s.scroll.every((x) => x <= 1)), `the box stays put and the window doesn't scroll: ${JSON.stringify(seen.map((s) => [s.left, ...s.scroll]))}`);
    await p.keyboard.press('Escape');
    // The calendar opens by its button.
    await p.click('#dialog[open] .date-field:has(input[aria-label="Expires"]) .date-btn'); await p.waitForTimeout(300);
    const cal = await p.evaluate(() => { const bt = document.querySelector('#dialog[open] .date-field:has(input[aria-label="Expires"]) .date-btn').getBoundingClientRect(); const c = document.querySelector('.cal-pop').getBoundingClientRect(); return { near: Math.abs(c.right - bt.right) < 3 && (Math.abs(c.top - bt.bottom) < 8 || Math.abs(c.bottom - bt.top) < 8), inside: c.top >= 0 && c.bottom <= innerHeight && c.left >= 0 && c.right <= innerWidth }; });
    ok(cal.near && cal.inside, `the calendar opens by its button, inside the window: ${JSON.stringify(cal)}`);
    await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    await p.evaluate(() => { const d = document.querySelector('#dialog'); if (d.open) d.close(); });
  }
  await p.evaluate(() => { CVOptions.setBrightness(100); CVOptions.setZoom(100); });
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
