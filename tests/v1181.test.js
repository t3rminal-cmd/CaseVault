// v1.181: Ask AI to Edit: the request sent to the local AI, the answer cleaned, and the facts in the
// answer that the case doesn't have, marked to check. Made-up names only (Doe / Roe / Poe).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/drafts/copilot.js');

test('the request: the instruction, the text and the case material; the whole narrative or a part', () => {
  const [sys, user] = C.editMessages({ text: 'SA Doe met John Roe.', instruction: 'Make it more concise.', material: '## Timeline\n- 2026-03-14 Buy 1', behavior: 'DEA style.' });
  assert.match(sys.content, /Never invent facts/);
  assert.match(sys.content, /\[CONFIRM: what is needed\]/);
  assert.match(sys.content, /return only what replaces it/);
  assert.match(sys.content, /HOUSE STYLE\nDEA style\./);
  assert.match(user.content, /^CASE MATERIAL \(facts you may use\)\n## Timeline/);
  assert.match(user.content, /INSTRUCTION\nMake it more concise\.\n\nTEXT\nSA Doe met John Roe\.$/);
  assert.match(C.editMessages({ text: 'x', instruction: 'y', whole: true })[0].content, /return the whole narrative, edited/);
  assert.match(C.editMessages({ text: '', instruction: 'Write a paragraph about the arrest.' })[1].content, /TEXT\n\(empty: write new text\)/);
});

test('quick prompts: the built-in ones', () => {
  assert.deepStrictEqual(C.EDIT_PROMPTS.map((p) => p.label), ['Tighten', 'Third Person, Past Tense', 'Add Times and Places', 'Time Order', 'Grammar Only']);
  assert.ok(C.EDIT_PROMPTS.every((p) => p.prompt.length > 10));
});

test('the answer without an introduction, code fences or quotation marks', () => {
  assert.strictEqual(C.cleanEdit('Here is the edited text:\n\nSA DOE met John ROE.'), 'SA DOE met John ROE.');
  assert.strictEqual(C.cleanEdit('```\nSA DOE met John ROE.\n```'), 'SA DOE met John ROE.');
  assert.strictEqual(C.cleanEdit('"SA DOE met John ROE."'), 'SA DOE met John ROE.');
  assert.strictEqual(C.cleanEdit('Sure! The revised version:\nLine one.\n\nLine two.'), 'Line one.\n\nLine two.');
  assert.strictEqual(C.cleanEdit('He said "stop" and left.'), 'He said "stop" and left.', 'quotes inside are kept');
});

test('dates in any of the usual ways', () => {
  assert.deepStrictEqual([...C.datesIn('March 14, 2026; 3/4/2026; 2026-03-14 and May 1 2026')].sort(), ['2026-03-04', '2026-03-14', '2026-05-01']);
});

test('new facts: dates, times, amounts, weights and names the case does not have', () => {
  const material = '## Timeline\n- 2026-03-14 14:30 Buy 1: John Roe, Cocaine 3.5 g, paid $200\n- 0900 hours surveillance\nSuspect (Primary): John Roe';
  const text = 'SA Doe met him.';
  const out = 'On March 14, 2026, at 2:30 p.m., SA Doe bought 3.5 grams of cocaine from John ROE for $200. At 9:00 a.m. surveillance began. '
    + 'On March 15, 2026, at 3:15 PM, Rick Poe arrived with $500 and 7 grams. Exhibit 1 was sealed.';
  assert.deepStrictEqual(C.newFacts(out, text, material), ['March 15, 2026', '3:15 PM', '$500', '7 grams', 'Rick Poe']);
  assert.deepStrictEqual(C.newFacts('On 3/14/2026 at 1430 hours SA Doe met John Roe.', text, material), [], 'the same facts written another way');
  assert.deepStrictEqual(C.newFacts('On March 14, 2026 SA Doe met [CONFIRM: the location].', text, material), []);
});
