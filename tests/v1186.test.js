// v1.186: Summaries (Week or Year in one home page tile) and the Narrative Helper page.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('one Summaries tile instead of Weekly Summary and Year Summary; a Narrative Helper tile', () => {
  const app = read('js/app.js');
  const tiles = app.slice(app.indexOf('function quickActions'), app.indexOf('function heroVault'));
  assert.match(tiles, /tile\('Summaries', 'bar-chart-line-fill', \(\) => summariesDialog\(\)/);
  assert.match(tiles, /tile\('Narrative Helper', 'journal-text'/);
  assert.doesNotMatch(tiles, /tile\('Weekly Summary'|tile\('Year Summary'/);
  assert.match(app, /#\\\/narrative\\b\/\.test\(location\.hash\)\) return showNarrativeHelper\(\)/);
});

test('the Narrative Helper is cached for offline use and loads with the Reports code', () => {
  assert.match(read('sw.js'), /'\.\/js\/drafts\/narrative-helper\.js'/);
  assert.match(read('js/app.js'), /'js\/drafts\/ai-edit-ui\.js', 'js\/drafts\/narrative-helper\.js'\]/);
});

test('the Narrative Helper keeps its text in memory only, never in the browser\'s storage', () => {
  const src = read('js/drafts/narrative-helper.js');
  assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/);
  assert.match(src, /Vault\.saveDraft\(/);
});

test('Ask AI to Edit works without a case, with typed facts', () => {
  const src = read('js/drafts/ai-edit-ui.js');
  assert.match(src, /async function open\(\{ c = null, target, behaviorId = '', notes = '', prompt: startPrompt = '' \}\)/);
  assert.match(src, /c \? await material\(c\)/);
  assert.match(src, /## Facts and notes from the investigator/);
});
