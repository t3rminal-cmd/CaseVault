// v1.137: the home page tiles (Year Summary has its icon, no Ask AI tile: it's the corner button), the
// top-bar icons without captions, and the banner's turning vault door. All data is made up.
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const SP = process.env.SP + '/v1137';

(async () => {
  const { b, p, errs } = await boot(1366, 900);
  await p.evaluate(() => { location.hash = '#/x'; location.hash = '#/'; }); await p.waitForSelector('.quick-actions'); await p.waitForTimeout(400);

  const tiles = await p.$$eval('.quick-actions .qa-tile', (x) => x.map((t) => [t.textContent.trim(), !!t.querySelector('svg')]));
  ok(!tiles.some(([t]) => t === 'Ask AI'), `no Ask AI tile: ${tiles.map(([t]) => t).join(', ')}`);
  ok(tiles.every(([, icon]) => icon), `every tile has its icon: ${JSON.stringify(tiles)}`);
  ok(tiles.some(([t, icon]) => t === 'Summaries' && icon), 'Summaries (v1.186: Week or Year) has an icon');
  const row = await p.$$eval('.quick-actions .qa-tile', (x) => new Set(x.map((t) => Math.round(t.getBoundingClientRect().top))).size);
  ok(row === 1, `the tiles sit on one row (${row})`);
  ok(await p.isVisible('#btn-chat'), 'Ask AI is still in the top bar');

  const caps = await p.$$eval('.tb-status > *', (x) => x.filter((e) => e.hasAttribute('data-cap')).length);
  ok(caps === 0, 'no captions under the top-bar icons');

  const vault = await p.evaluate(() => {
    const svg = document.querySelector('.hero .hero-side .hero-vault');
    return svg && { shield: !!document.querySelector('.hero-art svg.ci'), wheel: getComputedStyle(svg.querySelector('.hv-wheel')).animationName, w: Math.round(svg.getBoundingClientRect().width) };
  });
  ok(vault && !vault.shield && vault.wheel === 'cv-vault-turn' && vault.w > 40, `the banner shows a turning vault door: ${JSON.stringify(vault)}`);
  await p.screenshot({ path: `${SP}/home.png` });
  await p.locator('.hero').screenshot({ path: `${SP}/hero.png` });
  await p.locator('.topbar').screenshot({ path: `${SP}/topbar.png` });
  console.log('errors', errs); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
