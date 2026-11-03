// v1.187: Settings back in the menu; Suspect Search shows one row per person when a name is written
// with and without a middle name, initial, alias or Jr. Synthetic data only (Doe / Roe / Poe).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const PV = require('../js/person-view.js');
const Op = require('../js/operation.js');

test('Settings is in the top-right menu', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const menu = html.slice(html.indexOf('id="app-menu"'), html.indexOf('</div>', html.indexOf('id="app-menu"')));
  assert.match(menu, /id="btn-settings"[^>]*>Settings</);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'js/app.js'), 'utf8'), /\$\('#btn-settings'\)\.addEventListener\('click', \(\) => showVaultPanel\(\)\)/);
});

test('names that fit: a middle name, an initial, an alias, Jr; not a different first name', () => {
  assert.ok(PV.wordsFit('John Doe', 'John Allen Doe'));
  assert.ok(PV.wordsFit('John A. Doe', 'John Allen Doe'));
  assert.ok(PV.wordsFit('DOE, John', 'John "JJ" Doe'));
  assert.ok(PV.wordsFit('John Doe Jr.', 'John Doe'));
  assert.ok(!PV.wordsFit('John Doe', 'Jane Doe'));
  assert.ok(!PV.wordsFit('Doe', 'John Doe'), 'one word is not enough');
  assert.strictEqual(Op.nameMatch('John A. Doe', 'John Allen Doe'), 'similar');
});

test('one Suspect Search row for the same person across a Mission\'s case numbers', () => {
  const cases = [
    { id: 'a', number: 'EX-871', suspects: [{ name: 'John Doe', dob: '1990-02-03', info: {} }] },
    { id: 'b', number: 'EX-872', suspects: [{ name: 'John Doe', dob: '1990-02-03', info: {} }] },
  ];
  const arrests = { b: { arrestees: [{ firstName: 'John', middleName: 'Allen', lastName: 'Doe', dob: '1990-02-03', irNumber: '123456', date: '2026-04-01', charges: [{ statute: '720 ILCS 570/401', description: 'Delivery' }] }] } };
  const rows = PV.everyone(cases, arrests);
  assert.strictEqual(rows.length, 1, JSON.stringify(rows.map((r) => r.name)));
  assert.strictEqual(rows[0].name, 'John Allen Doe');
  assert.deepStrictEqual(rows[0].numbers.sort(), ['EX-871', 'EX-872']);
  assert.strictEqual(rows[0].ir, '123456');
  assert.strictEqual(rows[0].arrests, 1);
});

test('kept apart: a different date of birth, a different IR number, or nothing in common', () => {
  const dob = PV.everyone([{ id: 'a', number: 'EX-1', suspects: [{ name: 'John Doe', dob: '1990-02-03' }, { name: 'John Allen Doe', dob: '1975-06-07' }] }]);
  assert.strictEqual(dob.length, 2);
  const ir = PV.everyone([{ id: 'a', number: 'EX-1', suspects: [{ name: 'John Doe', info: { irNumber: '111' } }, { name: 'John A Doe', info: { irNumber: '222' } }] }]);
  assert.strictEqual(ir.length, 2);
  const apart = PV.everyone([{ id: 'a', number: 'EX-1', suspects: [{ name: 'John Doe' }] }, { id: 'b', number: 'EX-2', suspects: [{ name: 'John Allen Doe' }] }]);
  assert.strictEqual(apart.length, 2, 'no date of birth, IR number or case in common: could be two people');
});

test('outcomes at close: the arrest report, the disposition for the subject, At Large for the rest', () => {
  const K = require('../js/closing.js');
  const sus = [{ name: 'Sam Poe' }, { name: 'Jane Roe' }, { name: 'Tom Doe', outcome: 'deceased' }, { name: 'Rick Roe', outcome: 'at-large' }];
  const rows = K.suspectOutcomes(sus, [{ arrestees: [{ firstName: 'Rick', lastName: 'Roe', charges: [{ statute: '1' }] }] }]);
  const run = (d) => K.outcomesAtClose(rows, (r) => (r.name === 'Sam Poe' ? d : null)).map((x) => `${x.name}:${x.key}`).join();
  assert.strictEqual(run({ disposition: 'exceptional', reason: 'Death of the offender' }), 'Sam Poe:deceased,Jane Roe:at-large,Tom Doe:deceased,Rick Roe:arrested');
  assert.strictEqual(run({ disposition: 'exceptional', reason: 'Prosecution declined' }), 'Sam Poe:not-prosecuted,Jane Roe:at-large,Tom Doe:deceased,Rick Roe:arrested');
  assert.strictEqual(run({ disposition: 'arrest', reason: '' }), 'Sam Poe:arrested,Jane Roe:at-large,Tom Doe:deceased,Rick Roe:arrested');
  assert.strictEqual(run({ disposition: 'inactive', reason: '' }), 'Sam Poe:at-large,Jane Roe:at-large,Tom Doe:deceased,Rick Roe:arrested');
  assert.strictEqual(K.outcomesAtClose(rows, () => null)[3].why, 'On the arrest report');
});
