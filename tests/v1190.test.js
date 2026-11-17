// v1.190: the calendar stays open on a scroll elsewhere; suggestion lists keep their height and
// side while you type; Certificate Details has a fixed size.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the calendar closes or moves only for a scroll that moves its box', () => {
  const src = read('js/formats.js');
  assert.match(src, /const moves = t === doc \|\| t === doc\.documentElement \|\| t === doc\.body \|\| \(t && t\.contains && t\.contains\(anchor\)\);/);
  assert.doesNotMatch(src, /const scrolled = \(e\) => \{ if \(!pop\.contains\(e\.target\)\) close\(\); \};/);
});

test('a suggestion list keeps the height and side it opened with while you type', () => {
  const src = read('js/combo.js');
  assert.match(src, /if \(held && held\.h\) list\.style\.minHeight = `\$\{held\.h\}px`;/);
  assert.match(src, /const above = held && held\.above !== null \? held\.above :/);
});

test('Certificate Details has a fixed size', () => {
  assert.match(read('js/app.js'), /\['form', '\.cert-form, /);
});
