// v1.182: Ask AI marks what its answer says that the case doesn't; Draft with AI writes one part at
// a time, then looks again at the facts the case doesn't have and marks the rest [CONFIRM: …].
// The AI engine on 127.0.0.1:11434 is faked. All data is made up (Doe / Roe / Poe, Example City).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);

(async () => {
  const { b, p, errs } = await boot(1440, 950);
  const asked = [];
  const stream = (t) => `${[t.slice(0, 15), t.slice(15)].map((x) => JSON.stringify({ message: { content: x }, done: false })).join('\n')}\n${JSON.stringify({ done: true })}\n`;
  await p.route('http://127.0.0.1:11434/**', async (route) => {
    const r = route.request();
    if (/\/api\/tags/.test(r.url())) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [{ name: 'qwen2.5:7b', details: { parameter_size: '7.6B', family: 'qwen2' } }] }) });
    if (!/\/api\/chat/.test(r.url())) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    const body = JSON.parse(r.postData() || '{}');
    asked.push(body);
    const sys = body.messages[0].content; const user = body.messages[body.messages.length - 1].content;
    let answer;
    if (/You check a law-enforcement report/.test(sys)) answer = user.split('\nTEXT\n').pop().replace(/Rick POE/g, '[CONFIRM: who drove]');
    else if (/Write ONLY the SYNOPSIS/.test(user)) answer = 'SYNOPSIS\nOn March 14, 2026, SA Doe bought cocaine from John ROE.';
    else if (/Write ONLY the DETAILS/.test(user)) answer = 'DETAILS\n1. On March 14, 2026, at 2:30 p.m., SA Doe paid John ROE $200. Rick POE drove.';
    else if (/Write ONLY the INDEXING/.test(user)) answer = 'INDEXING\nJohn ROE';
    else answer = 'On March 14, 2026 John Roe sold 3.5 g of cocaine for $200. Rick Poe drove him.';
    return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: stream(answer) });
  });
  const id = await p.evaluate(async () => {
    const x = await Vault.createCase({ number: 'EX-1182', subject: 'John Roe' });
    const c = await Vault.getCase(x.id); c.suspects = [{ name: 'John Roe', role: 'Primary', info: {} }]; await Vault.saveCase(c);
    const tl = await Vault.getTimeline(x.id);
    tl.events.push({ id: 'b1', kind: 'buy', date: '2026-03-14', time: '14:30', title: 'Buy 1: 3.5 g cocaine from John Roe for $200', suspect: 'John Roe' });
    await Vault.saveTimeline(x.id, tl);
    return x.id;
  });

  // 1. Ask AI about the case: what the case doesn't have is listed under the answer.
  await p.evaluate((i) => { location.hash = `#/case/${CVRoute.enc(i)}/details`; }, id);
  await p.waitForSelector('#btn-chat', { timeout: 20000 });
  await p.click('#btn-chat');
  await p.waitForSelector('#chat-float:not([hidden]) .chat-input');
  await p.waitForFunction(() => document.querySelector('#chat-float select[aria-label="Model"]') && document.querySelector('#chat-float select[aria-label="Model"]').value, null, { timeout: 15000 });
  await p.selectOption('#chat-float select[aria-label="Case"]', id);
  await p.fill('#chat-float .chat-input', 'Who sold what on March 14?');
  await p.click('#chat-float .chat-send:not([hidden])');
  await p.waitForSelector('#chat-float .chat-unsupported', { timeout: 20000 });
  const marked = await p.textContent('#chat-float .chat-unsupported');
  ok(/Rick Poe/.test(marked) && !/March 14|\$200|3\.5 g|John Roe/.test(marked), `Ask AI marks only what the case doesn't have: ${marked}`);
  await p.click('#chat-float button[title^="Close"]');

  // 2. Draft with AI, one part at a time, then the facts looked at again.
  await p.evaluate(async (i) => { localStorage.setItem('cv.editMode', 'markdown'); await Vault.saveDraft(i, 'roi', { title: 'ROI', type: 'dea6' }, ''); }, id);
  await p.evaluate((i) => CaseVaultUI.go(i, 'reports', 'roi'), id);
  await p.waitForSelector('.draft-actions-bar button:has-text("Draft with AI")', { timeout: 15000 });
  await p.click('.draft-actions-bar button:has-text("Draft with AI")');
  await p.waitForSelector('#dialog[open] .gen-form');
  const opts = await p.evaluate(() => ({ parts: !document.querySelector('#dialog[open] input[aria-label="One part at a time"]').closest('label').hidden, check: document.querySelector('#dialog[open] input[aria-label="Check its facts afterwards"]').checked }));
  ok(opts.parts && opts.check, `the DEA-6 offers one part at a time, and the fact check is on: ${JSON.stringify(opts)}`);
  await p.check('#dialog[open] input[aria-label="One part at a time"]');
  await p.click('#dialog[open] .gen-form button[type=submit]');
  await p.waitForFunction(() => /checked again/.test([...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' ')), null, { timeout: 30000 });
  const text = await p.inputValue('.editor-wrap textarea');
  ok(/^SYNOPSIS\n[\s\S]*\n\nDETAILS\n[\s\S]*\n\nINDEXING\nJohn ROE$/.test(text), `three parts, in order: ${JSON.stringify(text)}`);
  ok(/\[CONFIRM: who drove\] drove\./.test(text) && !/Rick POE/.test(text), 'the name the case doesn\'t have is [CONFIRM: …] after the second look');
  const parts = asked.filter((x) => /Write ONLY/.test(x.messages[1].content));
  ok(parts.length === 3 && /ALREADY WRITTEN[\s\S]*SYNOPSIS/.test(parts[1].messages[1].content) && /ALREADY WRITTEN[\s\S]*DETAILS/.test(parts[2].messages[1].content), 'each part knows what is already written');
  const fix = asked.find((x) => /You check a law-enforcement report/.test(x.messages[0].content));
  ok(fix && /CHECK\n- Rick POE\n/.test(fix.messages[1].content) && !/CHECK[\s\S]*- (March 14|\$200|John ROE)/.test(fix.messages[1].content), 'the second look is asked only about what the case doesn\'t have');
  await p.click('.toast button:has-text("Show the First Version")');
  await p.waitForTimeout(300);
  ok(/Rick POE drove\./.test(await p.inputValue('.editor-wrap textarea')), 'Show the First Version puts its first version back');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
