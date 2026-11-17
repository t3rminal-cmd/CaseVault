// v1.153: Undo (file trash, report versions), Timeline templates and court dates, Copy Case Details,
// duplicate people, the Before You Send checklist, the discovery log, backups by count, the
// encrypted case export and Bigger Text. All data is synthetic (Doe / Roe / Poe, Example City).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { load, get } = require('./helpers/load-app.js');
const { MemDirectoryHandle } = require('./helpers/mem-fs.js');

const O = require('../js/operation.js');
const S = require('../js/case-summary.js');
const P = require('../js/person-view.js');
const F = require('../js/report-fields.js');
const DR = require('../js/discovery-receipt.js');
const X = require('../js/case-export.js');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('timeline templates: each fills the form; the follow-up deadline lands the right days later', () => {
  const warrant = O.TL_TEMPLATES.find((t) => t.id === 'warrant');
  assert.deepStrictEqual(O.templateFollowUp(warrant, '2026-03-25'), { kind: 'deadline', date: '2026-04-04', time: '', title: 'Search warrant return due' });
  assert.strictEqual(O.templateFollowUp(warrant, '2026-12-28', 5).date, '2027-01-02', 'days can be changed, across a year end');
  assert.strictEqual(O.templateFollowUp(warrant, '2026-03-25', '').date, '2026-04-04', 'an empty box keeps the template\'s days');
  assert.strictEqual(O.templateFollowUp(O.TL_TEMPLATES.find((t) => t.id === 'court'), '2026-03-25'), null, 'a court date adds no deadline');
  assert.strictEqual(O.templateFollowUp(warrant, ''), null);
  assert.ok(O.TL_TEMPLATES.some((t) => t.id === 'buy' && t.kind === 'buy'), 'Controlled Buy is a Buy');
  for (const t of O.TL_TEMPLATES) assert.ok(O.KIND_LABELS[t.kind], `${t.label} has a known kind`);
  assert.strictEqual(O.kindLabel('court'), 'Court');
  assert.strictEqual(O.kindLabel('nonsense'), 'Event');
  assert.strictEqual(O.plusDays('2028-02-28', 1), '2028-02-29', 'leap day');
  assert.strictEqual(O.daysBetween('2026-10-24', '2026-11-01'), 8);
});

test('court dates: reminders from 7 days before to the day; the next court date', () => {
  const ev = { kind: 'court', date: '2026-11-01', title: 'Preliminary hearing' };
  assert.strictEqual(O.courtReminder(ev, '2026-10-24'), null, '8 days out: not yet');
  assert.deepStrictEqual(O.courtReminder(ev, '2026-10-25'), { days: 7, text: 'Court in 7 days' });
  assert.strictEqual(O.courtReminder(ev, '2026-10-31').text, 'Court tomorrow');
  assert.strictEqual(O.courtReminder(ev, '2026-11-01').text, 'Court today');
  assert.strictEqual(O.courtReminder(ev, '2026-11-02'), null, 'past');
  assert.strictEqual(O.courtReminder({ ...ev, kind: 'event' }, '2026-10-31'), null, 'only Court entries');
  const events = [{ kind: 'court', date: '2026-09-01', title: 'Old' }, { kind: 'court', date: '2026-12-01', title: 'Trial' }, { kind: 'court', date: '2026-11-01', time: '09:30', title: 'Hearing' }];
  assert.deepStrictEqual(O.nextCourt(events, '2026-10-24'), { date: '2026-11-01', time: '09:30', title: 'Hearing' });
  assert.strictEqual(O.nextCourt([], '2026-10-24'), null);
});

test('Copy Case Details: number, subject, charges, next court date and next deadline', () => {
  const c = { number: 'EX-100', fileNumber: 'F-7', status: 'Open' };
  const arrest = { arrestees: [{ lastName: 'Doe', firstName: 'John', charges: [{ statute: '720 ILCS 570/401', description: 'Manufacture / delivery' }] }] };
  const timeline = { events: [
    { kind: 'court', date: '2026-11-03', time: '09:00', title: 'Preliminary hearing' },
    { kind: 'deadline', date: '2026-10-30', title: 'Lab results', done: false },
    { kind: 'deadline', date: '2026-10-26', title: 'Done already', done: true },
  ] };
  const text = S.detailsText({ c, subject: 'Doe, John', mission: 'OP-1 - Example City', arrest, timeline, today: '2026-10-24', fmtDate: (d) => d });
  assert.match(text, /^Case Number: EX-100 \(File Number F-7\)$/m);
  assert.match(text, /^Subject: Doe, John$/m);
  assert.match(text, /^Mission: OP-1 - Example City$/m);
  assert.match(text, /^Charges: .*570\/401/m);
  assert.match(text, /^Next Court Date: 2026-11-03 09:00 · Preliminary hearing$/m);
  assert.match(text, /^Next Deadline: 2026-10-30 · Lab results$/m);
  const empty = S.detailsText({ c: { number: 'EX-200' }, today: '2026-10-24' });
  assert.match(empty, /Charges: None entered/);
  assert.match(empty, /Next Court Date: None on the Timeline/);
  assert.match(empty, /Next Deadline: None open/);
  assert.ok(!/Mission:/.test(empty), 'no Mission line without one');
});

test('duplicate people: same name on another case, the date of birth decides when both have one', () => {
  const cases = [
    { id: 'a', number: 'EX-100', suspects: [{ name: 'John Doe', dob: '1990-01-02' }] },
    { id: 'b', number: 'EX-200', operationId: 'op1', suspects: [{ name: 'DOE, John', dob: '' }] },
    { id: 'c', number: 'EX-300', suspects: [{ name: 'John Doe', dob: '1985-05-05' }] },
    { id: 'd', number: 'EX-400', subject: 'Richard Roe', suspects: [] },
    { id: 'e', number: 'EX-500', operationId: 'op2', suspects: [{ name: 'John Doe', notIdentified: true }] },
  ];
  const hits = P.duplicates({ name: 'John Doe', dob: '1990-01-02' }, cases, { id: 'x' });
  assert.deepStrictEqual(hits.map((x) => [x.c.number, x.sameDob]), [['EX-100', true], ['EX-200', false]], 'EX-300 has another DOB; Not Identified is left out');
  assert.deepStrictEqual(P.duplicates({ name: 'John Doe' }, cases, { id: 'a' }).map((x) => x.c.number), ['EX-200', 'EX-300'], 'the case itself is left out');
  assert.deepStrictEqual(P.duplicates({ name: 'John Doe' }, cases, { id: 'x', operationId: 'op1' }).map((x) => x.c.number), ['EX-100', 'EX-300'], 'cases of the same Mission share suspects');
  assert.deepStrictEqual(P.duplicates({ name: 'Richard Roe' }, cases, { id: 'x' }).map((x) => x.c.number), ['EX-400'], 'a case subject counts too');
  assert.deepStrictEqual(P.duplicates({ name: 'Jo' }, cases, {}), [], 'too short to match');
  assert.deepStrictEqual(P.duplicates({ name: 'Mary Poe' }, cases, {}), []);
});

test('Before You Send: exhibits in the narrative against the evidence list, and the dates', () => {
  const d = F.normalize({
    narrative: 'On 03/04/2026 the UC bought (Exhibit 1). On March 2, 2026 Exhibits 2 and 3 were seized. DOB 01/01/1990. Additional Exhibit 1 is the photos. Exh. #7-8.',
    evidence: [{ number: '1' }, { number: '2' }, { number: '4' }],
  });
  assert.deepStrictEqual(F.narrativeExhibits(d.narrative), [1, 2, 3, 7, 8], '"Additional Exhibit" is numbered on its own; ranges count');
  assert.deepStrictEqual(F.narrativeDates(d.narrative).map((x) => x.iso), ['2026-03-04', '2026-03-02'], 'a date of birth is not a narrative date');
  const r = F.sendChecklist(d, '2026-10-24');
  const texts = r.items.map((x) => x.text);
  assert.ok(texts.some((t) => /mentions Exhibits 3, 7 and 8, which are not in the evidence list/.test(t)), texts.join(' | '));
  assert.ok(texts.some((t) => /Exhibit 4 is in the evidence list but not mentioned/.test(t)));
  assert.ok(texts.some((t) => /out of order: March 2, 2026 comes after 03\/04\/2026/.test(t)));
  assert.strictEqual(r.problems, 3);
  const good = F.sendChecklist(F.normalize({ narrative: 'On 2026-01-05 Exhibit 1 was bought. On January 9, 2026 Exhibit 2.', evidence: [{ number: '1' }, { number: '2' }] }), '2026-10-24');
  assert.strictEqual(good.problems, 0);
  assert.ok(good.items.every((x) => x.ok));
  const future = F.sendChecklist(F.normalize({ narrative: 'On 12/01/2026 something.' }), '2026-10-24');
  assert.ok(future.items.some((x) => /in the future/.test(x.text)));
  assert.ok(F.sendChecklist(F.normalize({}), '2026-10-24').items.some((x) => /Summary of Investigation is empty/.test(x.text)));
});

test('discovery log: grouped by recipient, in date order, printable as a PDF', () => {
  const prods = [
    { producedTo: 'Example City Public Defender', produced: '2026-02-01', prefix: 'EX', batesFirst: 41, batesLast: 80, items: [{ pages: 30 }, { pages: 10 }] },
    { producedTo: 'ASA Roe', produced: '2026-01-05', prefix: 'EX', batesFirst: 1, batesLast: 40, items: [{ pages: 40 }] },
    { producedTo: 'example city public defender', produced: '2026-01-20', prefix: 'EX', batesFirst: 81, batesLast: 81, items: [{ pages: 1 }] },
    { producedTo: '', produced: '2026-03-01', prefix: 'EX', batesFirst: 82, batesLast: 82, items: [] },
  ];
  const g = DR.byRecipient(prods);
  assert.deepStrictEqual(g.map((x) => x.to), ['ASA Roe', 'Example City Public Defender', 'No recipient named']);
  assert.deepStrictEqual(g[1].rows.map((r) => [r.produced, r.range]), [['2026-01-20', 'EX-000081'], ['2026-02-01', 'EX-000041 to EX-000080']]);
  assert.deepStrictEqual([g[1].files, g[1].pages], [3, 41]);
  const pdf = Buffer.from(DR.logPdf(prods, { caseLabel: 'Case EX-100', printed: '10/24/2026' })).toString('latin1');
  assert.ok(pdf.startsWith('%PDF-'));
  assert.match(pdf, /DISCOVERY LOG/);
  assert.match(pdf, /ASA Roe/);
  assert.match(pdf, /EX-000041 to EX-000080/);
  assert.match(Buffer.from(DR.logPdf([])).toString('latin1'), /No productions yet/);
});

test('encrypted case export: round trip, wrong password, a changed byte, and the trash left out', async () => {
  const big = new Uint8Array(2.5 * 1024 * 1024).map((_, i) => (i * 7) % 251);
  const files = [
    { path: 'case.json', blob: new Blob([JSON.stringify({ id: '2026-EX-100', number: 'EX-100', subject: 'Doe, John' })]) },
    { path: 'files/Photos/scene.bin', blob: new Blob([big]) },
    { path: 'files/empty.txt', blob: new Blob([]) },
    { path: 'files/.trash/1-old.txt', blob: new Blob(['gone']) },
    { path: '.casevault-move.json', blob: new Blob(['{}']) },
  ];
  const blob = await X.pack(files, 'correct horse 1', { caseId: '2026-EX-100', number: 'EX-100', subject: 'Doe, John' }, { iterations: 1000 });
  const raw = Buffer.from(await blob.arrayBuffer());
  assert.strictEqual(raw.subarray(0, 8).toString(), 'CVCASE01');
  const { header, dataStart } = await X.readHeader(blob);
  const head = raw.subarray(0, dataStart).toString('latin1');
  // v1.192: whole names, with characters base64 never has (a comma, a space, a dot), so the random
  // salt and sealed manifest can't spell one by chance ("Doe" did, about one run in 400).
  assert.ok(!/Doe, John|EX-100|scene\.bin|files\/Photos/.test(head), 'no name, number or file name readable without the password');
  assert.strictEqual(header.kind, 'case-export');
  const r = await X.unpack(blob, 'correct horse 1');
  assert.strictEqual(r.manifest.number, 'EX-100');
  assert.deepStrictEqual(r.files.map((f) => [f.path, f.data.size]), [['case.json', files[0].blob.size], ['files/Photos/scene.bin', big.length], ['files/empty.txt', 0]]);
  assert.ok(Buffer.from(await r.files[1].data.arrayBuffer()).equals(Buffer.from(big)), 'every byte back');
  await assert.rejects(X.unpack(blob, 'wrong'), { name: 'WrongPassword' });
  const bad = Buffer.from(raw); bad[bad.length - 100] ^= 1;
  await assert.rejects(X.unpack(new Blob([bad]), 'correct horse 1'), /changed or is damaged/);
  await assert.rejects(X.readHeader(new Blob(['not a case export at all'])), { name: 'FormatError' });
  assert.strictEqual(X.fileName('EX/100'), 'EX-100 Case Export.cvcase');
});

let AppVault;
function app() {
  if (!AppVault) {
    globalThis.location = new URL('http://127.0.0.1:8517/');
    load('js/checker/nlp.js', 'js/drafts/draft-core.js', 'js/casefiles.js', 'js/fs.js', 'js/helper-fs.js', 'js/operation.js', 'js/vault.js');
    AppVault = get('Vault');
  }
  return AppVault;
}

test('Undo: a deleted file waits in the case trash and comes back; a deleted report comes back', async () => {
  const Vault = app();
  await Vault.load(await Vault.create(new MemDirectoryHandle('V')));
  const c = await Vault.createCase({ title: 'Example', number: 'EX-100' });
  const added = await Vault.addFile(c.id, new File(['photo bytes'], 'scene.jpg', { type: 'image/jpeg' }), { folder: 'Case Overview' });
  const before = (await Vault.listFiles(c.id)).length;
  const t = await Vault.trashFile(c.id, added);
  assert.strictEqual((await Vault.listFiles(c.id)).length, before - 1, 'gone from Files');
  const back = await Vault.untrashFile(c.id, t);
  assert.strictEqual((await Vault.listFiles(c.id)).length, before, 'back in Files');
  assert.ok(back && /^Case Overview\//.test(back.path || back), 'back in its own folder');
  await Vault.emptyFileTrash(c.id);

  // Report versions: a version is kept on save (not more than one per 10 minutes) and on delete.
  await Vault.saveDraft(c.id, 'buy-report', { title: 'Buy Report', type: 'other' }, 'First text.');
  await Vault.saveDraft(c.id, 'buy-report', { title: 'Buy Report', type: 'other' }, 'Second text.');
  let versions = await Vault.listDraftVersions(c.id, 'buy-report');
  assert.strictEqual(versions.length, 1, 'the first text is kept');
  assert.strictEqual((await Vault.readDraftVersion(c.id, 'buy-report', versions[0].name)).body.trim(), 'First text.');
  await Vault.restoreDraftVersion(c.id, 'buy-report', versions[0].name);
  assert.strictEqual((await Vault.readDraft(c.id, 'buy-report')).body.trim(), 'First text.', 'put back');
  versions = await Vault.listDraftVersions(c.id, 'buy-report');
  assert.ok(versions.length >= 2, 'the text before putting back is kept too');
  await Vault.deleteDraft(c.id, 'buy-report');
  assert.deepStrictEqual((await Vault.listDrafts(c.id)).map((d) => d.slug), []);
  await Vault.undeleteDraft(c.id, 'buy-report');
  assert.deepStrictEqual((await Vault.listDrafts(c.id)).map((d) => d.slug), ['buy-report'], 'Undo brings it back');
  assert.strictEqual((await Vault.readDraft(c.id, 'buy-report')).body.trim(), 'First text.');
});

test('backup by count: each case save counts; a full backup starts it again', async () => {
  const Vault = app();
  await Vault.load(await Vault.create(new MemDirectoryHandle('W')));
  const c = await Vault.createCase({ title: 'Example', number: 'EX-200' });
  const n0 = Vault.data.settings.changesSinceBackup || 0;
  await Vault.saveCase({ ...(await Vault.getCase(c.id)), subject: 'Roe, Richard' });
  await Vault.saveTimeline(c.id, { events: [] });
  assert.strictEqual(Vault.data.settings.changesSinceBackup, n0 + 2);
  await Vault.recordManualBackup();
  assert.strictEqual(Vault.data.settings.changesSinceBackup, 0);
  const app_ = read('js/app.js');
  assert.match(app_, /FULL_BACKUP_CHANGES = 50/);
  assert.match(app_, /backupByCount\(\)/);
});

test('wiring: lazy Reports, Alt+digits, pinned in the sidebar, lock when the SSD is pulled, Bigger Text', () => {
  const html = read('index.html');
  for (const f of ['js/drafts/drafts-ui.js', 'js/report-fields-ui.js', 'js/drafts/ghost.js', 'js/drafts/review.js', 'js/case-export.js']) assert.ok(!html.includes(`<script src="${f}">`), `${f} loads on first use`);
  const sw = read('sw.js');
  for (const f of ['js/drafts/drafts-ui.js', 'js/report-fields-ui.js', 'js/case-export.js', 'js/case-export-ui.js']) assert.ok(sw.includes(`'./${f}'`), `${f} is in the offline cache`);
  const a = read('js/app.js');
  assert.match(a, /CVLazy\.reports = \(\) =>/);
  assert.match(a, /\^Digit\[1-9\]\$/);
  assert.match(a, /side-pinned/);
  assert.match(a, /dialog\[open\]'\)\) if \(d\.id !== 'privacy-screen'\)/);
  assert.match(a, /privacyPin && window\.CVPrivacy\) CVPrivacy\.lock\(\)/);
  assert.match(read('js/closing-ui.js'), /CVLazy\.reports\(\)/);
  const css = read('css/app.css');
  assert.match(css, /:root\[data-text="110"\]/);
  assert.match(css, /:root\[data-text="125"\]/);
  const opt = read('js/options.js');
  assert.match(opt, /TEXT_SIZES = \[100, 110, 125\]/);
});
