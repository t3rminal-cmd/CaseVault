// v1.188: the Library as folders with files opened as saved, the examples by type as one list,
// Templates without Beta, a template From the Library, Edit in Word / Bring Back From Word.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('Templates has no Beta mark', () => {
  assert.match(read('js/drafts/drafts-ui.js'), /h\('h3', \{\}, 'Templates'\),/);
  assert.doesNotMatch(read('js/drafts/drafts-ui.js'), /'Templates', ui\.betaTag/);
});

test('the Library: folders, files opened as saved, the examples by type as one list', () => {
  const src = read('js/library-ui.js');
  assert.match(src, /class: 'lib-folder-head'/);
  assert.match(src, /ui\.previewFile\(\{ readFile: \(\) => Vault\.readLibraryFile\(it\.path\), where: 'library', formatted: true/);
  assert.match(src, /select', \{ class: 'lib-type-filter'/);
  assert.doesNotMatch(src, /class: `lib-cov/);
});

test('a template from the Library, and its Word copy kept in templates\\word on the SSD', () => {
  const ui = read('js/drafts/drafts-ui.js');
  assert.match(ui, /async function fromLibrary\(path\)/);
  assert.match(ui, /'Edit in Word'/);
  assert.match(ui, /'Bring Back From Word'/);
  const v = read('js/vault.js');
  assert.match(v, /FS\.getDir\(await templatesDir\(\), 'word', true\)/);
  assert.match(v, /return `templates\/word\/\$\{templateWordName\(file\)\}`/);
});

test('the helper still opens only mail drafts (Edit in Word shows the path instead)', () => {
  assert.match(read('tools/casevault-helper/casevault-helper.ps1'), /\$rel -notmatch '\^\(cases\|archive\)\/\[\^\/\]\+\/files\/Email\/\[\^\/\]\+\\\.eml\$'/);
  assert.doesNotMatch(read('js/drafts/drafts-ui.js'), /HelperFS\.openFile/);
});
