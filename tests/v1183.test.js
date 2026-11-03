// v1.183: the Library: Terminology (only the terms a text uses go to the AI; drug slang that counts as
// a drug), the Language Bank (approved paragraphs by kind of warrant or subpoena, and each kind's
// required elements), and what goes to the AI with a draft. Made-up names only (Doe / Roe / Poe).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const T = require('../js/terms.js');
const L = require('../js/library.js');
const C = require('../js/drafts/copilot.js');

test('Terminology: built-in terms and yours (yours win); only the terms a text uses', () => {
  const list = T.all([{ term: 'zip', meaning: 'one ounce here', kind: 'Quantity' }, { term: 'Example Park', meaning: 'the park on 100 Example Street', kind: 'Place' }, { term: '', meaning: 'x' }]);
  assert.strictEqual(list.filter((x) => x.term === 'zip').length, 1);
  assert.strictEqual(list.find((x) => x.term === 'zip').meaning, 'one ounce here');
  const used = T.termsIn('The CI said he sells a zip near example park; ci in small letters is not the abbreviation.', list).map((x) => x.term);
  assert.deepStrictEqual(used.sort(), ['CI', 'Example Park', 'zip']);
  assert.deepStrictEqual(T.termsIn('He zipped the bag.', list), [], 'whole words only');
  assert.strictEqual(T.glossaryText(T.termsIn('a zip', list)), '- zip: one ounce here');
  assert.ok(T.BUILTIN.every((x) => x.term && x.meaning && T.KINDS.includes(x.kind)));
});

test('Terminology: slang that counts as a drug', () => {
  const words = T.drugWords(T.all([{ term: 'snowball', meaning: 'cocaine', kind: 'Drug slang', drug: 'cocaine' }]));
  const cocaine = words.find(([d]) => d === 'cocaine');
  assert.ok(cocaine && cocaine[1].test('he sold a snowball') && cocaine[1].test('YAYO'));
  assert.ok(!words.some(([, re]) => re.test('he filled up with gas')), 'everyday words are not drugs');
});

test('Language Bank: the kinds, their required elements, and the approved paragraphs', () => {
  assert.deepStrictEqual(L.typesFor('affidavit').map((t) => t.key), ['residence', 'vehicle', 'phone', 'person', 'gps', 'pen', 'anticipatory', 'arrest']);
  assert.deepStrictEqual(L.typesFor('subpoena').map((t) => t.key), ['sub-phone', 'sub-bank', 'sub-utility', 'sub-other']);
  const text = 'SA Doe, with 12 years of experience, states probable cause exists. The residence located at 100 Example Street. On March 14 the CI went inside the residence within the last 72 hours.';
  const res = L.elementCheck(text, 'residence');
  assert.deepStrictEqual(res.filter((e) => !e.found).map((e) => e.key), ['items'], 'only the items to be seized are missing');
  assert.ok(res.every((e) => e.label.length > 5));
  assert.deepStrictEqual(L.elementCheck('anything', 'nope'), []);
  const bank = [{ type: 'residence', title: 'Training', text: 'Your affiant has [CONFIRM: years] years…' }, { type: 'vehicle', text: 'Other.' }, { type: 'residence', text: '  ' }];
  assert.strictEqual(L.bankText(bank, 'residence'), '### Training\nYour affiant has [CONFIRM: years] years…');
});

test('Draft with AI: terms, approved language and required elements go with it; none of them count as facts', () => {
  const m = C.draftMessages({ type: 'affidavit', caseObj: { number: 'EX-1' }, glossary: '## Terms (what these words mean here; not facts of the case)\n- zip: one ounce, about 28 grams',
    bank: '### Training\nYour affiant has [CONFIRM: years] years.', elements: ['Probable cause stated', 'The items to be seized'] });
  const u = m[1].content;
  assert.match(u, /## Terms \(what these words mean here/);
  assert.match(u, /## Approved language \(use it word for word where it fits; NOT facts of this case\)\n### Training/);
  assert.match(u, /Make sure the draft covers each of these[^\n]*\n- Probable cause stated\n- The items to be seized/);
  const f = C.factsOnly(m);
  assert.match(f, /Case number: EX-1/);
  assert.doesNotMatch(f, /28 grams|Your affiant has/);
});
