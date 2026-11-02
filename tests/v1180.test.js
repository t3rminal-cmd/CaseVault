// v1.180: closing a Mission: each case number's disposition suggested from what became of its
// suspect; the Mission Closeout PDF; the warrant check; Undo of Continue in a New Case; an arrest
// made later, on the closed Mission. Made-up names only (Doe / Roe / Poe).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const K = require('../js/closing.js');
const MC = require('../js/mission-closeout.js');

const rows = K.suspectOutcomes([
  { name: 'John Doe', outcome: 'arrested' },
  { name: 'Rick Roe', outcome: 'continued', continuedIn: { caseId: 'z', number: 'EX-950' } },
  { name: 'Sam Poe', outcome: 'not-prosecuted' },
  { name: 'Al Poe', outcome: 'deceased' },
  { name: 'Bo Roe', outcome: 'at-large' },
]);

test('the suggested disposition of each case number, from its subject\'s outcome', () => {
  const s = (subject, own = false) => K.suggestDisposition({ subject }, rows, own);
  assert.deepStrictEqual(s('DOE, John'), { disposition: 'arrest', reason: '' });
  assert.deepStrictEqual(s('Rick Roe'), { disposition: 'continued', reason: '' });
  assert.deepStrictEqual(s('Sam Poe'), { disposition: 'exceptional', reason: 'Prosecution declined' });
  assert.deepStrictEqual(s('Al Poe'), { disposition: 'exceptional', reason: 'Death of the offender' });
  assert.deepStrictEqual(s('Bo Roe'), { disposition: '', reason: '' }, 'still at large: no suggestion');
  assert.deepStrictEqual(s('Someone Else'), { disposition: '', reason: '' });
  assert.deepStrictEqual(s('Bo Roe', true), { disposition: 'arrest', reason: '' }, 'its own arrest report wins');
  assert.deepStrictEqual(K.suggestDisposition({ subject: 'Nobody' }, [rows[2]]), { disposition: 'exceptional', reason: 'Prosecution declined' }, 'the only suspect');
});

test('the warrant check: a deadline days after the new case opened', () => {
  const e = K.warrantCheckEvent('Rick Roe', 'W-77', '2026-12-15', 30, 'e1');
  assert.strictEqual(e.date, '2027-01-14');
  assert.strictEqual(e.title, 'Warrant check: Rick Roe (warrant W-77)');
  assert.ok(e.kind === 'deadline' && !e.done && e.suspect === 'Rick Roe' && e.id === 'e1');
  assert.strictEqual(K.warrantCheckEvent('Rick Roe', '', '2026-12-15', 0, 'e2').title, 'Warrant check: Rick Roe');
});

test('Undo of Continue in a New Case: only while nothing was added to the new case', () => {
  const base = { files: [{ path: 'case.json', size: 400 }, { path: 'notes.md', size: 0 }, { path: 'timeline.json', size: 90 }, { path: 'Photos/.keep', size: 0 }],
    events: [{ title: 'Continued from case EX-801 (Mission OP-8)' }, { title: 'Warrant check: Rick Roe' }], notes: '', status: 'Open' };
  assert.ok(K.continuedUntouched(base));
  assert.ok(!K.continuedUntouched({ ...base, files: [...base.files, { path: 'Photos/a.jpg', size: 10 }] }), 'a file');
  assert.ok(!K.continuedUntouched({ ...base, notes: 'Seen at 100 Example Street' }), 'notes');
  assert.ok(!K.continuedUntouched({ ...base, events: [...base.events, { title: 'Surveillance' }] }), 'a Timeline entry');
  assert.ok(!K.continuedUntouched({ ...base, status: 'Closed' }), 'closed');
});

test('an arrest made later, as a line on the closed Mission', () => {
  assert.strictEqual(K.laterArrestLine('Rick Roe', 'EX-950', '2026-12-03'), 'Later: Rick Roe arrested on case EX-950 on December 3, 2026.');
  assert.strictEqual(K.laterArrestLine('Rick Roe', '', ''), 'Later: Rick Roe arrested on case with no number.');
});

test('the Mission Closeout: case numbers, suspects with their charges, buys, evidence; and a PDF', () => {
  const cases = [
    { id: 'b', number: 'EX-802', subject: 'Sam Poe', status: 'Closed', dates: { closed: '2026-11-02' }, closure: { disposition: 'exceptional', reason: 'Prosecution declined' } },
    { id: 'a', number: 'EX-801', subject: 'John Doe', status: 'Closed', dates: { closed: '2026-11-02' }, closure: { disposition: 'arrest' } },
    { id: 'c', number: 'EX-803', subject: 'Rick Roe', status: 'Open', dates: {} },
  ];
  const arrests = new Map([['a', { arrestees: [{ firstName: 'John', lastName: 'Doe', charges: [{ statute: '720 ILCS 570/401', description: 'Delivery' }] }] }]]);
  const buys = [{ name: 'John Doe', buys: [{}, {}], paid: 450.5, drugs: [{ drug: 'Cocaine', amounts: [{ unit: 'g', qty: 7 }] }] }];
  const evidence = new Map([['a', [{ inventory: '123', type: 'Narcotics', drug: 'Cocaine', custody: [] }, { description: 'Phone', type: 'Other', custody: [{ action: 'Destroyed', date: '2026-10-01' }] }]]]);
  const d = MC.rows({ cases, arrests, outcomes: K.suspectOutcomes([{ name: 'John Doe' }, { name: 'Sam Poe', outcome: 'not-prosecuted' }], [...arrests.values()]), buys, evidence });
  assert.deepStrictEqual(d.cases.map((r) => [r.number, r.status, r.disposition, r.closed]), [
    ['EX-801', 'Closed', 'Cleared by arrest', 'November 2, 2026'], ['EX-802', 'Closed', 'Exceptionally cleared (Prosecution declined)', 'November 2, 2026'], ['EX-803', 'Open', '', '']]);
  assert.deepStrictEqual(d.suspects, [{ name: 'John Doe', outcome: 'Arrested', moved: '', charges: ['720 ILCS 570/401 Delivery'] }, { name: 'Sam Poe', outcome: 'Not Prosecuted', moved: '', charges: [] }]);
  assert.deepStrictEqual(d.buys, [{ name: 'John Doe', count: 2, paid: 450.5, drugs: 'Cocaine 7 g' }]);
  assert.strictEqual(MC.money(d.totalPaid), '$450.50');
  assert.strictEqual(MC.money(400), '$400');
  assert.deepStrictEqual(d.evidence, [{ number: 'EX-801', total: 2, open: 1, noLab: 1 }]);
  const pdf = MC.build('OP-8 Example', d, { printed: 'November 2, 2026', later: ['Later: Rick Roe arrested on case EX-950 on December 3, 2026.'] });
  assert.strictEqual(Buffer.from(pdf.slice(0, 5)).toString(), '%PDF-');
});
