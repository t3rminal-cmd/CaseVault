// v1.192: a floating list or calendar moves itself by where it landed (a window with a brightness
// filter measures "fixed" from its own corner).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('suggestion lists settle where they landed', () => {
  const src = read('js/combo.js');
  assert.match(src, /function settle\(el, z = 1\)/);
  assert.match(src, /settle\(list, z\);/);
  assert.match(src, /const api = \{ attach, filter, upgrade, settle \};/);
});

test('the calendar does too', () => {
  assert.match(read('js/formats.js'), /const got = pop\.getBoundingClientRect\(\);/);
});

test('a window still gets the brightness filter (the page has its veil)', () => {
  assert.match(read('css/app.css'), /html\.bright-adjusted dialog\[open\] \{ filter: brightness\(var\(--cv-brightness, 1\)\); \}/);
});
