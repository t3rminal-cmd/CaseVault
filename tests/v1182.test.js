// v1.182: the facts the AI adds that the case doesn't have: looked at again, then marked
// [CONFIRM: …]; drafting one part at a time. Made-up names only (Doe / Roe / Poe).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/drafts/copilot.js');

test('the parts of the documents that are drafted one part at a time', () => {
  assert.strictEqual(C.sectionPlan('dea6').length, 3);
  assert.match(C.sectionPlan('dea6')[0], /SYNOPSIS/);
  assert.match(C.sectionPlan('dea6')[2], /INDEXING/);
  assert.ok(C.sectionPlan('affidavit') && C.sectionPlan('summary') && C.sectionPlan('supplemental'));
  assert.strictEqual(C.sectionPlan('memo'), null);
});

test('a part\'s request: only that part, what is written so far, no header after the first part', () => {
  const first = C.draftMessages({ type: 'dea6', header: true, part: { name: 'the SYNOPSIS', index: 0, total: 3, written: '' } })[1].content;
  assert.match(first, /Write one part of: DEA Style\./);
  assert.match(first, /Write ONLY the SYNOPSIS now \(part 1 of 3\)/);
  assert.match(first, /header block/);
  assert.doesNotMatch(first, /ALREADY WRITTEN/);
  const second = C.draftMessages({ type: 'dea6', header: true, part: { name: 'the DETAILS', index: 1, total: 3, written: 'SYNOPSIS\nSA Doe met John ROE.' } })[1].content;
  assert.match(second, /Write ONLY the DETAILS now \(part 2 of 3\)/);
  assert.match(second, /ALREADY WRITTEN \(do not repeat it; continue after it\):\nSYNOPSIS\nSA Doe met John ROE\./);
  assert.doesNotMatch(second, /header block/);
  const long = C.draftMessages({ type: 'dea6', part: { name: 'x', index: 2, total: 3, written: `start ${'a'.repeat(5000)} END` } })[1].content;
  assert.match(long, /ALREADY WRITTEN[^\n]*\n…a+ END/, 'the end of what is written, when it is long');
  assert.match(C.draftMessages({ type: 'dea6' })[1].content, /Write a first draft of: DEA Style\./, 'without parts, as before');
});

test('the facts of a request: not the Library examples, directives or reference lists', () => {
  const m = C.draftMessages({ type: 'dea6', caseObj: { title: 'John Roe', number: 'EX-1' }, examples: [{ title: 'Example', text: 'Jim Poe sold heroin.' }], directives: [{ title: 'Rule', text: 'Sam Doe policy.' }], references: [{ title: 'Values', text: 'Al Roe list.' }] });
  const f = C.factsOnly(m);
  assert.match(f, /Case number: EX-1/);
  assert.doesNotMatch(f, /Jim Poe|Sam Doe|Al Roe/);
});

test('the second pass: what to look at again, and the rest marked [CONFIRM: …]', () => {
  const [sys, user] = C.fixFactsMessages({ text: 'Rick Poe paid $500.', facts: ['Rick Poe', '$500'], material: 'Buy 1: John Roe, $200' });
  assert.match(sys.content, /replace it with \[CONFIRM: what is needed\]/);
  assert.match(sys.content, /Change nothing else/);
  assert.match(user.content, /CHECK\n- Rick Poe\n- \$500\n\nTEXT\nRick Poe paid \$500\.$/);
  assert.strictEqual(C.markUnsupported('Rick Poe paid $500 to Rick Poeson. [CONFIRM: Rick Poe] again.', ['Rick Poe', '$500']),
    '[CONFIRM: Rick Poe] paid [CONFIRM: $500] to Rick Poeson. [CONFIRM: Rick Poe] again.', 'whole words only, never inside a [CONFIRM: …]');
  assert.strictEqual(C.markUnsupported('Nothing to do.', []), 'Nothing to do.');
});
