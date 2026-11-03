// v1.185: the passage-search memory (each passage's numbers kept on the SSD by a fingerprint of its
// text, worked out once per model) and Test the Models on This PC (scoring on the self-test's
// made-up case). Made-up data only.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/ai/embed-cache.js');
const M = require('../js/ai/model-check.js');

test('the fingerprint: the same text, the same fingerprint; any change, another one', () => {
  const a = E.fingerprint('SA Doe met John Roe at 100 Example Street.');
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.strictEqual(a, E.fingerprint('SA Doe met John Roe at 100 Example Street.'));
  assert.notStrictEqual(a, E.fingerprint('SA Doe met John Roe at 101 Example Street.'));
  assert.strictEqual(E.shardOf(a), a.slice(0, 2));
  assert.deepStrictEqual(E.compact([0.123456, -0.98765]), [0.1235, -0.9877]);
});

test('the memory: worked out once, then read from the SSD (another visit too)', async () => {
  const disk = new Map();
  const store = { read: async (sh) => disk.get(sh) || null, write: async (sh, map) => { disk.set(sh, JSON.parse(JSON.stringify(map))); } };
  let computed = [];
  const compute = async (list) => { computed.push(...list); return list.map((t) => [t.length / 100, 0.5]); };
  const v1 = await E.embedWith(['first passage', 'second passage', 'first passage'], { store, compute });
  assert.deepStrictEqual(computed, ['first passage', 'second passage'], 'each text worked out once');
  assert.deepStrictEqual(v1[0], v1[2]);
  computed = [];
  const v2 = await E.embedWith(['second passage', 'third one'], { store, compute, memo: new Map() });
  assert.deepStrictEqual(computed, ['third one'], 'a later visit reads the rest from the SSD');
  assert.deepStrictEqual(v2[0], v1[1]);
  assert.ok([...disk.values()].every((m) => Object.keys(m).every((k) => /^[0-9a-f]{16}$/.test(k))), 'only fingerprints and numbers are kept, never text');
});

test('the models test: the planted mistakes found, false alarms, made-up facts, and the order', () => {
  const answer = JSON.stringify({ differences: [
    { what: 'time', affidavit: '21:45 hours', report: '2140 hours' },
    { what: 'plate', affidavit: 'TST-1248', report: 'TST-1284' },
    { what: 'name', affidavit: 'Sampel', report: 'Sample' },
    { what: 'address', affidavit: '1420 Example Ave', report: '1420 Example Avenue' },
  ] });
  const s = M.scoreMistakes(answer);
  assert.deepStrictEqual(s.found, ['time', 'plate', 'name']);
  assert.strictEqual(s.falseAlarms, 1, '"Ave" and "Avenue" are the same address');
  assert.deepStrictEqual(M.scoreMistakes('not json'), { found: [], falseAlarms: 0 });
  assert.deepStrictEqual(M.scoreRewrite('At 2140 hours on 3/14/2026, Officer Alex Sample observed license plate TST-1284 at 1420 Example Avenue. The witness heard two shots.'), []);
  assert.deepStrictEqual(M.scoreRewrite('At 2140 hours Officer Alex Sample saw plate TST-1284. Officer Rick Poe arrived at 10:15.'), ['10:15', 'Rick Poe']);
  const ranked = M.rank([
    { model: 'fast-but-weak', found: ['time'], madeUp: [], falseAlarms: 0, tps: 90 },
    { model: 'good', found: ['time', 'plate', 'money', 'name'], madeUp: [], falseAlarms: 0, tps: 20 },
    { model: 'good-but-invents', found: ['time', 'plate', 'money', 'name'], madeUp: ['Rick Poe'], falseAlarms: 0, tps: 40 },
  ]).map((r) => r.model);
  assert.deepStrictEqual(ranked, ['good', 'good-but-invents', 'fast-but-weak']);
  assert.match(M.mistakesMessages()[1].content, /^AFFIDAVIT\nOn 03\/14\/2026[\s\S]*\n\nREPORT\nOn 03\/14\/2026/);
});
