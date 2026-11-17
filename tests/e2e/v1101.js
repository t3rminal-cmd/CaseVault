// v1.101: Next Missing on the Draft and a shorter save message; General Files sorts by its headings
// and shows each case's Age; the sidebar can list cases by case number, oldest or newest; the
// INDEPENDENT CASES header doesn't overlap; the backup pop-up shows at most once a day.
const boot = require('./boot');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
(async () => { const { b, p, ids, errs } = await boot(1366, 900);
  const day = (k) => p.evaluate((k) => { const d = new Date(); d.setDate(d.getDate() - k); return Vault.localDay(d); }, k);
  for (const [n, k] of [['EX-500', 5], ['EX-600', 90], ['EX-700', 800]]) { const iso = await day(k); await p.evaluate(async ([n, iso]) => { await Vault.createCase({ number: n, subject: 'Jane Roe', opened: iso }); }, [n, iso]); }
  const past = await day(3);
  await p.evaluate(async ([id, d]) => { await Vault.saveTimeline(id, { events: [{ id: 'e1', date: d, title: 'Court', kind: 'deadline' }] }); }, [ids.c, past]);
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForTimeout(900);

  // sidebar order
  await p.evaluate(() => { const g = document.querySelector('.general-group'); if (g && !g.open) g.open = true; }); await p.waitForTimeout(300);
  const order = () => p.evaluate(() => [...document.querySelectorAll('.general-group .case-item .case-item-title')].map((x) => x.textContent.trim()));
  ok(JSON.stringify(await order()) === JSON.stringify(['EX-100', 'EX-500', 'EX-600', 'EX-700']), `by case number: ${await order()}`);
  await p.click('#btn-side-more'); await p.click('#btn-side-sort'); await p.waitForTimeout(400);
  ok(JSON.stringify(await order()) === JSON.stringify(['EX-700', 'EX-600', 'EX-500', 'EX-100']), `oldest first: ${await order()}`);
  await p.click('#btn-side-more'); await p.click('#btn-side-sort'); await p.waitForTimeout(400);
  ok((await order())[0] === 'EX-100' && (await order())[3] === 'EX-700', `newest first: ${await order()}`);
  ok(/Newest opened first/.test(await p.evaluate(() => { const b = document.querySelector('#btn-side-sort'); return b.title || b.dataset.tip || ''; })), 'the button says which order is on');
  await p.reload(); await p.waitForTimeout(1500);
  await p.evaluate(() => { const g = document.querySelector('.general-group'); if (g && !g.open) g.open = true; }); await p.waitForTimeout(300);
  ok(/Newest opened first/.test(await p.evaluate(() => { const b = document.querySelector('#btn-side-sort'); return b.title || b.dataset.tip || ''; }) || ''), 'the order is remembered');
  await p.click('#btn-side-more'); await p.click('#btn-side-sort'); await p.waitForTimeout(300);

  // INDEPENDENT CASES header: nothing overlaps
  const hd = await p.evaluate(() => { const g = document.querySelector('.general-group .op-head'); const r = (s) => g.querySelector(s) && g.querySelector(s).getBoundingClientRect();
    const name = r('.ind-name'); const count = r('.op-count'); const add = r('.general-add'); const bell = r('.folder-bell'); const folder = r('.op-folder');
    return { gapCount: count ? count.left - name.right : 99, gapAdd: add ? add.left - name.right : 99, noAdd: !add, bellOnFolder: !!bell && bell.left >= folder.left - 8 && bell.right <= folder.right + 8, bellNotOnName: !bell || bell.right <= name.left + 2, meta: g.querySelector('.op-meta').textContent }; });
  ok(hd.gapCount >= 4 && hd.noAdd, `the count keeps clear of the name (${hd.gapCount.toFixed(1)}px); no + since v1.165`);
  ok(hd.bellOnFolder && hd.bellNotOnName, 'the bell sits on the folder, not on the name');
  ok(/^\d+ cases?$/.test(hd.meta), `the line under it is short: "${hd.meta}"`);

  // v1.128: the backup reminder is a slim bar under the banner (never a pop-up over the page);
  // × hides it for the day, and it is back the next day.
  const toastNag = () => p.evaluate(() => [...document.querySelectorAll('.toast')].some((t) => /full backup/i.test(t.textContent)));
  const bar = () => p.locator('.dashboard .backup-bar').count();
  await p.reload(); await p.waitForSelector('.dashboard'); await p.waitForTimeout(1500);
  ok(!(await toastNag()) && (await bar()) === 1, 'no pop-up; the reminder bar is under the banner');
  await p.click('.backup-bar .backup-bar-close'); await p.waitForTimeout(200);
  await p.reload(); await p.waitForSelector('.dashboard'); await p.waitForTimeout(1200);
  ok((await bar()) === 0 && await p.locator('.hc-backup').count() === 1, 'hidden for today; the banner chip is still there');
  await p.evaluate(() => localStorage.setItem('cv-backup-bar', '2000-01-01')); await p.reload(); await p.waitForSelector('.dashboard'); await p.waitForTimeout(1200);
  ok((await bar()) === 1, 'a new day: the bar is back');

  // General Files: Age column and sorting
  await p.evaluate(() => { location.hash = '#/general'; }); await p.waitForTimeout(900);
  const rows = () => p.evaluate(() => [...document.querySelectorAll('.general-table tbody tr')].map((r) => [r.cells[0].textContent.trim(), (r.querySelector('.age-cell') || {}).textContent.trim()]));
  let r = await rows();
  ok(r.find((x) => x[0] === 'EX-500')[1] === '5d' && r.find((x) => x[0] === 'EX-600')[1] === '2mo' && r.find((x) => x[0] === 'EX-700')[1] === '2y', `Age column: ${JSON.stringify(r)}`);
  await p.click('.general-table th[data-sort="age"] button'); await p.waitForTimeout(300);
  r = await rows();
  ok(r[0][0] === 'EX-700', `Age sorts oldest first: ${r.map((x) => x[0])}`);
  await p.click('.general-table th[data-sort="age"] button'); await p.waitForTimeout(300);
  r = await rows();
  ok(r[r.length - 1][0] === 'EX-700', `click again: newest first: ${r.map((x) => x[0])}`);
  ok(await p.getAttribute('.general-table th[data-sort="age"]', 'aria-sort') === 'ascending', 'the heading shows the direction (youngest first)');
  await p.click('.general-table th[data-sort="subject"] button'); await p.waitForTimeout(300);
  r = await p.evaluate(() => [...document.querySelectorAll('.general-table tbody tr')].map((x) => x.cells[1].textContent.trim()));
  ok(r.join('|') === [...r].sort().join('|'), `Last Name sorts A–Z: ${r}`);
  await p.locator('.general-page').screenshot({ path: process.env.SP + '/v1101/general.png' });

  // Draft: Next Missing and the shorter message
  await p.evaluate((id) => { location.hash = `#/case/${id}/draft`; }, ids.c); await p.waitForTimeout(1500);
  ok(await p.locator('.rf-next-missing').isHidden(), 'no Next Missing before saving');
  await p.click('button:has-text("Save Changes")'); await p.waitForTimeout(800);
  const msg = await p.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).find((t) => /^Saved\./.test(t)) || '');
  ok(/^Saved\. \d+ fields? still blank \(outlined in red\)\.$/.test(msg), `short save message: "${msg}"`);
  const n = await p.evaluate(() => document.querySelectorAll('.rf-missing').length);
  ok(new RegExp(`^Next Missing \\(${n}\\)$`).test((await p.textContent('.rf-next-missing')).trim()), `Next Missing (${n}) shows`);
  const seen = [];
  for (let i = 0; i < 3; i += 1) {
    await p.click('.rf-next-missing'); await p.waitForTimeout(700);
    seen.push(await p.evaluate(() => { const all = [...document.querySelectorAll('.rf-missing')]; const a = document.activeElement; const i = all.findIndex((el) => el === a || el.contains(a)); const el = all[i]; const r = el ? el.getBoundingClientRect() : null; return { i, inView: !!r && r.top >= 0 && r.bottom <= innerHeight }; }));
  }
  ok(seen.map((x) => x.i).join(',') === '0,1,2' && seen.every((x) => x.inView), `each click moves to the next red field and shows it: ${JSON.stringify(seen)}`);
  // folded part: Next Missing opens it
  await p.click('button:has-text("Hide All")'); await p.waitForTimeout(400);
  await p.click('.rf-next-missing'); await p.waitForTimeout(700);
  ok(await p.evaluate(() => { const a = document.activeElement; const el = a && a.closest('.rf-missing, .rf-section'); return !!el && !!a.offsetParent; }), 'with the parts folded, Next Missing opens the part and goes to the field');
  await p.screenshot({ path: process.env.SP + '/v1101/draft.png' });
  console.log('errors', errs); await b.close(); })();
