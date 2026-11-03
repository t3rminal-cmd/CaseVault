// v1.185: the passage-search memory on the SSD (each passage worked out once per model) and Test the
// Models on This PC. The AI engine on 127.0.0.1:11434 is faked: two chat models and a passage-search
// model. All data is made up (Doe / Roe / Poe, Example City).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);

(async () => {
  const { b, p, errs } = await boot(1440, 950);
  const embedded = [];
  await p.route('http://127.0.0.1:11434/**', async (route) => {
    const r = route.request();
    if (/\/api\/tags/.test(r.url())) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [
      { name: 'qwen2.5:7b', details: { parameter_size: '7.6B', family: 'qwen2' } },
      { name: 'llama3.2:3b', details: { parameter_size: '3.2B', family: 'llama' } },
      { name: 'nomic-embed-text:latest', details: { parameter_size: '137M', family: 'nomic-bert' } },
    ] }) });
    const body = JSON.parse(r.postData() || '{}');
    if (/\/api\/embed/.test(r.url())) {
      embedded.push(...body.input);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ embeddings: body.input.map((t) => [/Impala/i.test(t) ? 1 : 0.1, 0.2, t.length / 1000]) }) });
    }
    if (/\/api\/chat/.test(r.url())) {
      const strong = body.model === 'qwen2.5:7b';
      if (body.format) {
        const all = [{ what: 'time', affidavit: '21:45', report: '2140' }, { what: 'plate', affidavit: 'TST-1248', report: 'TST-1284' }, { what: 'amount', affidavit: '$2,450', report: '$2,540' }, { what: 'name', affidavit: 'Sampel', report: 'Sample' }];
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ done: true, eval_count: 100, eval_duration: strong ? 5e9 : 2e9, message: { content: JSON.stringify({ differences: strong ? all : all.slice(0, 2) }) } }) });
      }
      const text = strong ? 'At 2140 hours on 03/14/2026, Officer Alex Sample saw license plate TST-1284 at 1420 Example Avenue. The witness heard two shots.'
        : 'At 2140 hours Officer Alex Sample saw plate TST-1284. Officer Rick Poe arrived.';
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ done: true, eval_count: 60, eval_duration: strong ? 3e9 : 1e9, message: { content: text } }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await p.evaluate(async () => {
    for (const [n, note] of [['EX-1851', 'Rick Roe drives a white Impala.'], ['EX-1852', 'John Doe walks to the park.']]) {
      const x = await Vault.createCase({ number: n, subject: 'John Doe' });
      await Vault.saveNotes(x.id, note);
    }
    await CVChecks.Engine.refresh();
  });

  // 1. Search All Cases twice: the passages are worked out the first time only.
  const search = async (q) => {
    await p.evaluate(() => { CVVaultSearch.open(CaseVaultUI); });
    await p.waitForSelector('#dialog[open] .vs-form');
    await p.fill('#dialog[open] .vs-input', q);
    await p.press('#dialog[open] .vs-input', 'Enter');
    await p.waitForSelector('#dialog[open] .vs-hit', { timeout: 20000 });
    const first = await p.textContent('#dialog[open] .vs-hit');
    await p.click('#dialog[open] button:has-text("Close")');
    return first;
  };
  const first = await search('white Impala car');
  const n1 = embedded.length;
  ok(/EX-1851/.test(first) && n1 > 1, `by meaning, with the passage-search model: ${first.slice(0, 40)} (${n1} worked out)`);
  await search('Impala driven by Rick');
  ok(embedded.length - n1 === 1, `the second time only the new question is worked out: ${embedded.length - n1}`);
  const disk = await p.evaluate(async () => ({ size: await Vault.embedCacheSize(), shard: await Vault.readEmbedShard('nomic-embed-text:latest', CVEmbedCache.shardOf(CVEmbedCache.fingerprint('Rick Roe drives a white Impala.'))) }));
  ok(disk.size.files > 0 && disk.shard && Object.keys(disk.shard).includes((await p.evaluate(() => CVEmbedCache.fingerprint('Rick Roe drives a white Impala.')))), `kept on the SSD by fingerprint (${disk.size.files} files, ${disk.size.bytes} bytes)`);
  ok(!JSON.stringify(disk.shard).includes('Impala'), 'no text is kept, only numbers');
  await p.evaluate(() => Vault.clearEmbedCache());
  ok((await p.evaluate(() => Vault.embedCacheSize())).files === 0, 'Empty It removes it');

  // 2. Test the Models on This PC.
  await p.evaluate(() => { CVModelCheck.open(CaseVaultUI); });
  await p.waitForSelector('#dialog[open] .mc-form');
  await p.waitForFunction(() => /Done: 2 models tested/.test(document.querySelector('#dialog[open] .mc-form').textContent), null, { timeout: 30000 });
  const rows = await p.$$eval('#dialog[open] .mc tbody tr', (r) => r.map((x) => [...x.cells].map((c) => c.textContent)));
  ok(rows.length === 2 && /qwen2\.5/i.test(rows[0][0]) && /Best on this PC/.test(rows[0][0]) && rows[0][1] === '4 of 5' && rows[0][2] === 'None', `the best first: ${JSON.stringify(rows[0])}`);
  ok(/llama3\.2/i.test(rows[1][0]) && rows[1][1] === '2 of 5' && /Rick Poe/.test(rows[1][2]) && /^20 tokens\/s/.test(rows[0][3]) && /^60 tokens\/s/.test(rows[1][3]), `the other, with its made-up name: ${JSON.stringify(rows[1])}`);
  await p.click('#dialog[open] .mc tbody tr:nth-child(2) button:has-text("Use This One")');
  await p.waitForTimeout(300);
  ok(await p.evaluate(() => CVChecks.Engine.choice().model) === 'llama3.2:3b', 'Use This One makes it this PC\'s model');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
