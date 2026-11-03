// v1.188: the Library as folders, its files shown as they were saved (Word as a page, Markdown
// formatted), the examples by type as one list, Templates without Beta, a template From the Library,
// and Edit in Word / Bring Back From Word. All data is made up (Doe / Roe, Example City).
const boot = require('./boot.js');
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);

(async () => {
  const { b, p, errs } = await boot(1366, 900);
  await p.evaluate(async () => {
    await CVLazy.reports();
    const docx = CVDocx.buildDocx('# REPORT OF INVESTIGATION\n\n**Case No.** {{case.number}}\n\n1. On March 14, 2026, SA Doe bought **3.5 grams** of cocaine from John Roe.', { title: 'DEA-6 Example' });
    await Vault.saveLibraryFile('Report examples', 'DEA-6 Example Buy.docx', new File([docx], 'x.docx'));
    await Vault.saveLibraryFile('Report examples', 'DEA-7 Example.md', new File(['# DEA-7\n\n**Exhibit 1**: 3.5 g cocaine'], 'b.md'));
    await Vault.saveLibraryFile('Directives', 'Evidence Directive.txt', new File(['Handle evidence by the book.'], 'c.txt'));
    const meta = await Vault.readLibraryMeta();
    meta.items['Report examples/DEA-6 Example Buy.docx'] = { docType: 'dea6' };
    meta.items['Report examples/DEA-7 Example.md'] = { docType: 'dea7' };
    await Vault.writeLibraryMeta(meta);
    const box = document.createElement('div'); box.id = 'lib-test'; box.className = 'vault-content';
    box.append(CVLibraryUI.librarySection(), CVDraftsUI.templateSettings());
    document.querySelector('#main').replaceChildren(box);
  });
  await p.waitForSelector('.lib-folder-head');
  await p.waitForTimeout(600);

  // 1. Folders, closed to start; the examples by type in one list.
  const heads = await p.$$eval('.lib-folder-head', (x) => x.map((e) => [e.textContent.replace(/\s+/g, ' ').trim(), e.getAttribute('aria-expanded')]));
  ok(heads.length === 4 && heads.every(([, open]) => open === 'false') && /Report Examples\s*2 files/.test(heads[0][0]), `the Library's folders: ${JSON.stringify(heads)}`);
  ok(!(await p.$('.lib-cov')) && !!(await p.$('select.lib-type-filter')), 'the examples by type are one list, not a row of boxes');
  const opts = await p.$$eval('select.lib-type-filter option', (o) => o.map((x) => x.textContent));
  ok(opts[0] === 'All Types (3 files)' && opts.includes('DEA Style: 1 example') && opts.includes('DEA 7a: none yet'), `its choices: ${opts.slice(0, 4).join(' | ')}`);
  await p.selectOption('select.lib-type-filter', 'dea7');
  await p.waitForTimeout(400);
  const shown = await p.$$eval('.lib-open', (x) => x.map((e) => e.textContent.trim()));
  ok(shown.join() === 'DEA-7 Example', `choosing DEA 7 opens the folder with only those: ${shown}`);
  await p.selectOption('select.lib-type-filter', '');
  await p.waitForTimeout(400);

  // 2. Files open as they were saved.
  await p.click('.lib-open:has-text("DEA-6 Example Buy")');
  await p.waitForSelector('#dialog[open] .docx-page', { timeout: 10000 });
  await p.waitForFunction(() => /REPORT OF INVESTIGATION/.test(document.querySelector('#dialog[open] .docx-page').textContent));
  ok(!!(await p.$('#dialog[open] .docx-page strong')), 'a Word file is shown as a page, bold kept');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.click('.lib-open:has-text("DEA-7 Example")');
  await p.waitForSelector('#dialog[open] .preview-md h1, #dialog[open] .preview-md h2', { timeout: 10000 });
  ok(/Exhibit 1/.test(await p.textContent('#dialog[open] .preview-md strong')), 'a Markdown file is shown formatted');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // 3. Templates: no Beta; a template From the Library.
  ok(!(await p.$('[data-section="templates"] h3 .beta-tag')) && (await p.textContent('[data-section="templates"] h3')).trim() === 'Templates', 'Templates has no Beta mark');
  await p.waitForFunction(() => document.querySelectorAll('select.tpl-lib-pick option').length > 1);
  const libOpts = await p.$$eval('select.tpl-lib-pick option', (o) => o.map((x) => x.textContent));
  ok(libOpts.some((x) => /DEA-6 Example Buy\.docx/.test(x)) && libOpts.some((x) => /Evidence Directive\.txt/.test(x)), `the Library's files to start from: ${libOpts.join(' | ')}`);
  const pick = await p.$eval('select.tpl-lib-pick', (s) => [...s.options].find((o) => /DEA-6/.test(o.textContent)).value);
  await p.selectOption('select.tpl-lib-pick', pick);
  await p.waitForFunction(() => /REPORT OF INVESTIGATION/.test((document.querySelector('.template-editor:not([hidden]) .template-text') || {}).value || ''), null, { timeout: 10000 });
  ok((await p.inputValue('.template-name')) === 'DEA-6 Example Buy.md' && /\{\{case\.number\}\}/.test(await p.inputValue('.template-text')), 'the Word file is in the editor as a template, placeholders kept');
  await p.click('.template-editor button:has-text("Save template")');
  await p.waitForSelector('.template-list li', { timeout: 10000 });

  // 4. Edit in Word, then Bring Back From Word.
  await p.click('.template-list li .tpl-word');
  await p.waitForSelector('.template-list li .tpl-word-back', { timeout: 10000 });
  const word = await p.evaluate(async () => { const f = await Vault.readTemplateWord('DEA-6 Example Buy.md'); return f ? f.size : 0; });
  const toasts = (await p.$$eval('.toast', (x) => x.map((e) => e.textContent))).join(' | ');
  ok(word > 1000 && /templates \| word \| DEA-6 Example Buy\.docx/.test(toasts) && /Copy Path/.test(toasts), `a Word copy on the SSD, with its path: ${word} bytes; ${toasts.slice(0, 200)}`);
  // Word changes it (simulated: a new .docx saved over it).
  await p.evaluate(async () => { await Vault.writeTemplateWord('DEA-6 Example Buy.md', CVDocx.buildDocx('# REPORT OF INVESTIGATION\n\n**Case No.** {{case.number}}\n\nChanged in Word for {{case.subject}}.', { title: 'x' })); });
  await p.click('.template-list li .tpl-word-back');
  await p.waitForFunction(() => /Changed in Word/.test((document.querySelector('.template-editor:not([hidden]) .template-text') || {}).value || ''), null, { timeout: 10000 });
  await p.click('.template-editor button:has-text("Save template")');
  await p.waitForTimeout(600);
  const t = await p.evaluate(() => Vault.readTemplate('DEA-6 Example Buy.md'));
  ok(/Changed in Word for \{\{case\.subject\}\}/.test(t), 'Word\'s version is the template now');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
