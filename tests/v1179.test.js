// v1.179: what became of each suspect, a suspect still at large carried on in a new case, and the
// Mission's summary when it closes. Made-up names only (Doe / Roe / Poe).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const K = require('../js/closing.js');

const arrest = (first, last, middle = '') => ({ arrestees: [{ firstName: first, lastName: last, middleName: middle, charges: [{ statute: '720 ILCS 570/401', description: 'Delivery' }] }] });

test('the outcomes: set by hand, or Arrested when an arrest report names the suspect', () => {
  const rows = K.suspectOutcomes([
    { name: 'John Doe' }, // on the arrest report (with a middle name there)
    { name: 'DOE, Jane', outcome: 'not-prosecuted' },
    { name: 'Rick Roe', outcome: 'at-large' },
    { name: 'Sam Poe' },
    { name: '', notIdentified: true },
  ], [arrest('John', 'Doe', 'Q'), null]);
  assert.deepStrictEqual(rows.map((r) => [r.name, r.key, r.auto]), [['John Doe', 'arrested', true], ['DOE, Jane', 'not-prosecuted', false], ['Rick Roe', 'at-large', false], ['Sam Poe', '', false]]);
  assert.strictEqual(rows[3].label, 'Not set');
});

test('a name inside another counts as the same person; a different first name does not', () => {
  assert.ok(K.samePerson('John Q Doe', 'DOE, John'));
  assert.ok(K.samePerson('Doe John', 'john doe'));
  assert.ok(!K.samePerson('Jane Doe', 'John Doe'));
  assert.ok(!K.samePerson('Doe', 'John Doe'), 'one word is not enough');
});

test('"Moved to Another Case" needs the case it went to; without it the suspect is still at large', () => {
  const [a, b] = K.suspectOutcomes([
    { name: 'Rick Roe', outcome: 'continued', continuedIn: { caseId: 'c9', number: 'EX-900', date: '2026-11-02' } },
    { name: 'Tom Roe', outcome: 'continued' },
  ]);
  assert.strictEqual(a.key, 'continued');
  assert.deepStrictEqual(a.continuedIn, { caseId: 'c9', number: 'EX-900', date: '2026-11-02' });
  assert.strictEqual(b.key, 'at-large');
});

test('the summary: arrested first, the case each continued suspect went to, and who is still open', () => {
  const rows = K.suspectOutcomes([
    { name: 'Rick Roe', outcome: 'continued', continuedIn: { caseId: 'c9', number: 'EX-900' } },
    { name: 'John Doe', outcome: 'arrested' },
    { name: 'Jane Doe', outcome: 'not-prosecuted' },
    { name: 'Sam Poe', outcome: 'at-large' },
    { name: 'Al Poe' },
  ]);
  const s = K.outcomeSummary(rows);
  assert.strictEqual(s.text, 'Arrested: John Doe. Not Prosecuted: Jane Doe. Moved to Another Case: Rick Roe (case EX-900). At Large: Sam Poe. Not set: Al Poe.');
  assert.deepStrictEqual(s.open, ['Sam Poe', 'Al Poe']);
  assert.deepStrictEqual(K.outcomeSummary([]), { open: [], text: '' });
});

test('closing: a suspect still at large is a loose end (a reminder, not a block); one continued is not', () => {
  const rows = K.suspectOutcomes([{ name: 'Sam Poe', outcome: 'at-large' }, { name: 'Rick Roe', outcome: 'continued', continuedIn: { caseId: 'c9', number: 'EX-900' } }]);
  const loose = K.closeChecklist({ suspects: rows });
  assert.strictEqual(loose.length, 1);
  assert.match(loose[0].text, /^Sam Poe is still At Large\. Continue in a New Case/);
  assert.deepStrictEqual(K.closeChecklist({}), []);
  assert.ok(K.disposition('continued'), 'the disposition "Continued in another case"');
});

test('Continue in a New Case: one Timeline entry on each case, pointing to the other', () => {
  const ev = K.continuationEvents({ name: 'Rick Roe', from: 'EX-201', to: 'EX-900', mission: 'OP-1 Example', date: '2026-11-02', ids: ['e1', 'e2'] });
  assert.strictEqual(ev.from.title, 'Rick Roe continued in case EX-900');
  assert.strictEqual(ev.to.title, 'Continued from case EX-201 (Mission OP-1 Example)');
  assert.ok(ev.from.kind === 'event' && ev.to.kind === 'event' && ev.from.id === 'e1' && ev.to.id === 'e2' && ev.to.suspect === 'Rick Roe' && ev.to.date === '2026-11-02');
});
