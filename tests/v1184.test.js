// v1.184: Ask AI about a whole Mission; Timeline events from a report; Search All Cases; the
// Closing Summary memo. Made-up names only (Doe / Roe / Poe, Example City).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Chat = require('../js/ai/chat.js');
const C = require('../js/drafts/copilot.js');
const V = require('../js/ai/vault-search.js');
const T = require('../js/terms.js');
const MC = require('../js/mission-closeout.js');

test('a Mission as text: suspects, buys, then each case number', () => {
  const m = Chat.missionMaterial({ title: 'OP-9 Example', summary: 'Arrested: John Doe.', buys: '| Buy | … |', cases: [
    { caseObj: { number: 'EX-901', status: 'Closed', title: 'John Doe' }, timeline: { events: [{ date: '2026-03-14', title: 'Buy 1' }] }, notes: 'Seen at the park.', arrest: '- John Doe, arrested 2026-04-01' },
    { caseObj: { number: 'EX-902', status: 'Open', title: 'Rick Roe' } },
  ] });
  assert.match(m, /^## Mission: OP-9 Example \(2 case numbers\)\n\nSuspects: Arrested: John Doe\.\n\n### Buys \(all case numbers\)/);
  assert.match(m, /### Case EX-901 \(Closed\)\n#### Case details[\s\S]*Buy 1[\s\S]*Seen at the park\.\n#### Arrest report\n- John Doe, arrested 2026-04-01/);
  assert.match(m, /### Case EX-902 \(Open\)/);
});

test('events from a report: the request, the answer tidied, the quote checked, duplicates found', () => {
  const [sys, user] = C.eventsMessages('On 3/14/2026 the UC bought…', { suspects: ['John Roe'] });
  assert.match(sys.content, /quote: the sentence of the report the event comes from, copied word for word/);
  assert.match(user.content, /^SUSPECTS\nJohn Roe\n\nREPORT\nOn 3\/14\/2026/);
  const src = 'On March 14, 2026, at approximately 2:30 p.m., the UC bought 3.5 grams of cocaine from John Roe for $200.';
  const ev = C.parseEvents(JSON.stringify({ events: [
    { date: 'March 14, 2026', time: '2:30', kind: 'buy', title: 'Buy from John Roe', drug: 'Cocaine', qty: 'about 3.5', paid: '$200.00', quote: 'the UC bought 3.5 grams of cocaine from John Roe for $200.' },
    { date: '2026-03-15', kind: 'odd', title: 'Surveillance', quote: 'made up sentence that is not there' },
    { date: 'someday', kind: 'event', title: 'No date' },
  ] }), src);
  assert.strictEqual(ev.length, 2);
  assert.deepStrictEqual([ev[0].date, ev[0].time, ev[0].qty, ev[0].unit, ev[0].paid, ev[0].verified], ['2026-03-14', '02:30', '3.5', 'g', '200.00', true]);
  assert.deepStrictEqual([ev[1].kind, ev[1].verified], ['event', false]);
  assert.ok(C.sameEvent(ev[0], { date: '2026-03-14', kind: 'buy', title: 'Buy 1', paid: '200' }), 'same buy: same day and amount');
  assert.ok(!C.sameEvent(ev[0], { date: '2026-03-15', kind: 'buy', title: 'Buy from John Roe', paid: '200' }), 'another day');
  assert.deepStrictEqual(C.parseEvents('not json'), []);
});

test('Search All Cases: passages, the Terminology\'s words, snippets', async () => {
  const p = [...V.passagesOfCase({ caseObj: { id: 'a', number: 'EX-1', title: 'John Roe', suspects: [{ name: 'John Roe', info: { marks: 'teardrop tattoo under the left eye' } }] },
    timeline: { events: [{ date: '2026-03-14', title: 'Buy 1 near Example Park', drug: 'Cocaine', paid: '200' }] }, notes: 'Seen in a white Impala.',
    fields: { narrative: 'The UC met him.' }, drafts: [{ title: 'ROI', body: 'He drove away.' }] }),
  ...V.passagesOfCase({ caseObj: { id: 'b', number: 'EX-2', title: 'Rick Poe' }, notes: 'Sells snowball by the school.' })];
  assert.deepStrictEqual([...new Set(p.map((x) => x.where.split(',')[0]))], ['Details', 'Suspect', 'Timeline', 'Field Notes', 'Write Report', 'Report: ROI']);
  assert.deepStrictEqual((await V.search(p, 'teardrop tattoo')).map((x) => [x.number, x.tab]), [['EX-1', 'details']]);
  assert.deepStrictEqual((await V.search(p, 'white impala')).map((x) => x.number), ['EX-1']);
  const terms = T.all([{ term: 'snowball', meaning: 'cocaine', kind: 'Drug slang', drug: 'cocaine' }]);
  assert.strictEqual(V.expandQuery('cocaine', terms), 'cocaine yayo snowball', 'the built-in slang and yours');
  assert.strictEqual(V.expandQuery('who sells snowball', terms), 'who sells snowball cocaine');
  assert.deepStrictEqual((await V.search(p, 'cocaine', { terms })).map((x) => x.number).sort(), ['EX-1', 'EX-2'], '"cocaine" also finds "snowball"');
  const byMeaning = await V.search(p, 'impala', { embed: async (texts) => texts.map((t, i) => (i === 0 ? [1, 0] : /Impala/.test(t) ? [1, 0] : [0, 1])) });
  assert.strictEqual(byMeaning[0].number, 'EX-1');
  assert.match(V.snippet(`${'a'.repeat(300)} white Impala ${'b'.repeat(300)}`, 'white impala'), /^…a+ white Impala b+…$/);
});

test('the Closing Summary: the Closeout\'s facts as text, and the request', () => {
  const data = { cases: [{ number: 'EX-1', subject: 'John Doe', status: 'Closed', disposition: 'Cleared by arrest', closed: 'November 2, 2026' }],
    suspects: [{ name: 'John Doe', outcome: 'Arrested', moved: '', charges: ['720 ILCS 570/401 Delivery'] }, { name: 'Rick Roe', outcome: 'Moved to Another Case', moved: 'EX-950', charges: [] }],
    buys: [{ name: 'John Doe', count: 2, drugs: 'Cocaine 7 g', paid: 400 }], totalPaid: 400, evidence: [{ number: 'EX-1', total: 2, open: 1, noLab: 0 }] };
  const m = MC.memoMaterial(data, { title: 'OP-1 Example', outcome: 'Arrested: John Doe.', later: ['Later: Rick Roe arrested on case EX-950.'] });
  assert.match(m, /^## Mission: OP-1 Example\nOutcome: Arrested: John Doe\.\n## Case numbers\n- EX-1 \(John Doe\): Closed, Cleared by arrest, closed November 2, 2026/);
  assert.match(m, /- Rick Roe: Moved to Another Case \(continued in case EX-950\)/);
  assert.match(m, /- John Doe: 2 buys, Cocaine 7 g, paid \$400\n- Total paid: \$400/);
  assert.match(m, /## Since the Mission closed\n- Later: Rick Roe arrested on case EX-950\./);
  const [sys, user] = MC.memoMessages(m, { behavior: 'Plain.' });
  assert.match(sys.content, /To:, From:, Date: and Re:/);
  assert.match(sys.content, /Never invent names, dates, amounts or charges/);
  assert.match(sys.content, /HOUSE STYLE\nPlain\./);
  assert.strictEqual(user.content, `MATERIAL\n${m}`);
});
