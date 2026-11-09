// v1.189: Write Report: Unit Number offers DNA; Persons Present Not Arrested has a Relationship; the
// Apartment location code is 090. All data is made up (Doe / Roe, Example City).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);

(async () => {
  const { b, p, errs } = await boot(1366, 900);
  const id = await p.evaluate(async () => (await Vault.createCase({ number: 'EX-1890', subject: 'John Doe' })).id);
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/draft`; }, id);
  await p.waitForSelector('input[placeholder="Unit Number"]', { state: 'attached', timeout: 20000 });
  // Open every folded section.
  await p.evaluate(() => { document.querySelectorAll('.rf-section.rf-folded .rf-fold').forEach((x) => x.click()); });
  await p.waitForTimeout(500);
  const unit = await p.evaluate(() => { const i = document.querySelector('input[placeholder="Unit Number"]'); return !!(i.closest('.combo') && i.parentElement.querySelector('.combo-toggle')); });
  ok(unit, 'Unit Number has a list');
  await p.evaluate(() => { const i = document.querySelector('input[placeholder="Unit Number"]'); i.scrollIntoView(); i.parentElement.querySelector('.combo-toggle').click(); });
  await p.waitForTimeout(300);
  const opts = await p.evaluate(() => [...document.querySelectorAll('[role=option]')].filter((x) => x.offsetParent).map((x) => x.textContent));
  ok(opts.some((t) => /^DNA/.test(t)), `with DNA: ${opts.join(' | ')}`);
  await p.keyboard.press('Escape');
  // Location code list: 090 Apartment.
  const loc = await p.evaluate(() => CVRefData.LOCATION_CODES.flatMap((g) => g.codes).filter(([, d]) => d === 'Apartment'));
  ok(JSON.stringify(loc) === '[["090","Apartment"]]', `Apartment is 090: ${JSON.stringify(loc)}`);
  // Persons Present Not Arrested: Relationship.
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Add Person'); b.scrollIntoView(); b.click(); });
  await p.waitForTimeout(400);
  const rel = await p.$$eval('input', (x) => x.filter((i) => /Relationship/i.test(i.placeholder || i.getAttribute('aria-label') || '')).length);
  ok(rel >= 1, `a Relationship box for a person not arrested (${rel})`);
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
