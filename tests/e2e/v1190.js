// v1.190: Training: Certificate Details keeps its size and the Group list keeps its height as you
// type; the date button's calendar stays open while the page behind is still scrolling. All data is
// made up (Jane Doe, Example Police Academy).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);

(async () => {
  const { b, p, errs } = await boot(1366, 768);
  await p.evaluate(async () => {
    for (const n of ['CPR.pdf', 'Glock.pdf', 'Narc.pdf']) await Vault.addShared('other', 'Training', new File(['%PDF-1.4 x'], n, { type: 'application/pdf' }));
    await Vault.saveTraining({ 'CPR.pdf': { course: 'First Aid', group: 'Medical', expires: Vault.localDay() }, 'Glock.pdf': { course: 'Glock', group: 'Firearms Qualification' }, 'Narc.pdf': { course: 'Narcotics', group: 'Narcotics Investigations' } });
  });
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; });
  await p.waitForSelector('.attention-row.att-cert', { timeout: 8000 });
  // The reminder opens Training and scrolls the page to it; the details are opened at once.
  await p.click('.attention-row.att-cert');
  await p.waitForSelector('.cert-card[data-file="CPR.pdf"] .cert-edit', { timeout: 10000 });
  await p.click('.cert-card[data-file="CPR.pdf"] .cert-edit'); await p.waitForSelector('#dialog[open] .cert-form');
  ok(await p.evaluate(() => document.querySelector('#dialog').classList.contains('dialog-form')), 'Certificate Details has a fixed size');

  // 1. The calendar opens and stays open while the page behind is still scrolling.
  await p.click('#dialog[open] .date-field:has(input[aria-label="Date Completed"]) .date-btn');
  await p.waitForTimeout(700);
  ok(!!(await p.$('.cal-pop')), 'the calendar stays open');
  await p.click('.cal-pop .cal-act:has-text("Today")');
  await p.waitForTimeout(200);
  const day = await p.inputValue('#dialog[open] .date-field:has(input[aria-label="Date Completed"]) input.date-text');
  ok(!!day && !!(await p.$('#dialog[open] .cert-form')), `a day picked: ${day}`);

  // 2. Typing in Group: the window and the list keep their size.
  const size = () => p.evaluate(() => { const d = document.querySelector('#dialog[open]'); const ul = d.querySelector('.cert-form .combo-list'); return [Math.round(d.getBoundingClientRect().width), Math.round(d.getBoundingClientRect().height), ul && !ul.hidden ? Math.round(ul.getBoundingClientRect().height) : 0, ul && !ul.hidden ? Math.round(ul.getBoundingClientRect().top) : 0]; });
  await p.click('#dialog[open] input[aria-label="Group"]'); await p.keyboard.press('Control+a'); await p.keyboard.press('Delete');
  await p.keyboard.press('ArrowDown');
  const seen = [await size()];
  for (const ch of 'Narcotics') { await p.keyboard.type(ch); seen.push(await size()); }
  const same = (i) => new Set(seen.map((s) => s[i])).size === 1;
  ok(same(0) && same(1), `the window keeps its size: ${JSON.stringify(seen.map((s) => `${s[0]}x${s[1]}`))}`);
  ok(seen[0][2] > 0 && same(2) && same(3), `the list keeps its height and place: ${JSON.stringify(seen.map((s) => `${s[2]}@${s[3]}`))}`);
  await p.keyboard.press('Enter');
  ok((await p.inputValue('#dialog[open] input[aria-label="Group"]')) === 'Narcotics Investigations', 'Enter picks the one match');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
