/* CaseVault — the vault on the SSD.
 *
 * CaseVault-Data/
 *   vault.json            app version, settings, case index, Operations (v1.46)
 *   cases/<case-id>/
 *     case.json           title, number, subject, client, status, dates, operationId (v1.46)
 *     notes.md            free-form notes
 *     timeline.json       dated events and deadlines
 *     files/<Category>/   attached documents, copied in, one folder per document type
 *                         (Affidavits, Arrest Report, ... Other; see js/casefiles.js)
 *     mail-log.json       department mail hand-offs
 *     drafts/, checks/    drafts and consistency checks
 *   archive/<case-id>/    archived cases (same layout, read-only in the app)
 *   templates/            document templates
 *   library/              samples and directives the AI learns from (Report examples, Warrant examples, Directives, Other)
 *   chats/                Ask AI conversations you keep (delete them in Ask AI → History)
 *   backups/              dated snapshots of vault.json
 *   logs/                 outbound-YYYY-MM.json: everything that left this computer (never its content)
 *
 * case.json and timeline.json are the source of truth. The index inside vault.json is
 * a fast lookup that gets rebuilt from them every time the vault is opened.
 */
'use strict';

const Vault = (() => {
  const APP_VERSION = '1.181.0';
  const SCHEMA = 1;
  const OPERATIONS_VERSION = 1; // v1.46: Operations are records; cases link to one by operationId
  const DATA_DIR = 'CaseVault-Data';
  const STATUSES = ['Open', 'Closed', 'Archived']; // v1.105: no Pending
  const DEFAULT_SETTINGS = { backupsToKeep: 30, aiProfile: 'auto', privacyPin: null, privacyIdleMinutes: 15, affiant: null, sidebarCollapsed: false, mail: null, online: null, piiWatchlist: [] };

  let root = null;   // handle to CaseVault-Data
  let vault = null;  // parsed vault.json
  let lastBackupDay = null;

  // One write at a time per file, in order, so rapid autosaves never interleave.
  const chains = new Map();
  function serial(key, fn) {
    const next = (chains.get(key) || Promise.resolve()).catch(() => {}).then(fn);
    const cleanup = () => { if (chains.get(key) === next) chains.delete(key); };
    next.then(cleanup, cleanup);
    chains.set(key, next);
    return next;
  }

  const pad = (n) => String(n).padStart(2, '0');
  // v1.85: a case's history (Details tab → Case History): what changed and when.
  const logActivity = (c, what) => { c.activity = [...(Array.isArray(c.activity) ? c.activity : []), { at: new Date().toISOString(), what }].slice(-300); return c; };
  function localDay(d = new Date()) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const nowISO = () => new Date().toISOString();

  function newId(prefix = '') {
    const rand = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).padStart(6, '0').slice(-6);
    return prefix + localDay().replace(/-/g, '') + '-' + rand;
  }

  /* ---------- opening a vault ---------- */

  // Accepts whatever folder the user picked: CaseVault-Data itself, or the folder that
  // contains it (for example the root of V:).
  async function resolve(picked) {
    await picked.keys().next(); // throws NotFoundError if the drive is unplugged
    if (await FS.exists(picked, 'vault.json')) return { dir: picked, found: true };
    const sub = await FS.getDir(picked, DATA_DIR);
    if (sub && (await FS.exists(sub, 'vault.json'))) return { dir: sub, found: true };
    return { dir: null, found: false, parent: picked };
  }

  async function create(parent) {
    const dir = parent.name === DATA_DIR ? parent : await FS.getDir(parent, DATA_DIR, true);
    if (await FS.exists(dir, 'vault.json')) return dir;
    await FS.getDir(dir, 'cases', true);
    await FS.getDir(dir, 'backups', true);
    await FS.writeJSON(dir, 'vault.json', {
      app: 'CaseVault',
      appVersion: APP_VERSION,
      schema: SCHEMA,
      vaultId: crypto.randomUUID(),
      created: nowISO(),
      updated: nowISO(),
      settings: { ...DEFAULT_SETTINGS, templatesTrimmed: true },
      cases: [],
      operations: [],
      operationsVersion: OPERATIONS_VERSION,
    });
    return dir;
  }

  async function load(dir) {
    const data = await FS.readJSON(dir, 'vault.json');
    if (!data || data.app !== 'CaseVault') {
      const err = new Error('This folder does not contain a CaseVault vault.');
      err.name = 'NotAVaultError';
      throw err;
    }
    if ((data.schema || 1) > SCHEMA) {
      const err = new Error('This vault was saved by a newer version of CaseVault. Update the app before opening it.');
      err.name = 'NewerSchemaError';
      throw err;
    }
    root = dir;
    vault = data;
    vault.settings = { ...DEFAULT_SETTINGS, ...(vault.settings || {}) };
    // v1 stored 'rules-only' without asking; from v1.5 the user picks, and "Auto" is the default.
    if (!vault.settings.aiProfileChosen) vault.settings.aiProfile = 'auto';
    vault.cases = Array.isArray(vault.cases) ? vault.cases : [];
    vault.operations = Array.isArray(vault.operations) ? vault.operations.filter((o) => o && o.id) : [];
    // v1.178: a vault made before vaultId existed gets one, so the helper (1.17) can recognise this
    // vault and never open another drive's in its place.
    const newId = !vault.vaultId;
    if (newId) vault.vaultId = crypto.randomUUID();
    lastBackupDay = null;
    await FS.getDir(root, 'cases', true);
    await FS.getDir(root, 'backups', true);
    await dailyBackup();
    await removeOnlineLeftovers();
    await tidyDeleted();
    await rebuildIndex();
    await retirePending();
    if ((vault.operationsVersion || 0) < OPERATIONS_VERSION) await migrateOperations();
    else await reconcileOperations();
    if (newId) await saveVault();
    return vault;
  }

  function close() {
    retiredChecked = false;
    root = null;
    vault = null;
  }

  // Cheap check used as a heartbeat to notice when the SSD is unplugged.
  async function ping() {
    if (!root) return false;
    await root.getFileHandle('vault.json');
    return true;
  }

  /* ---------- vault.json + backups ---------- */

  function saveVault() {
    return serial('vault.json', async () => {
      await dailyBackup();
      vault.appVersion = APP_VERSION;
      vault.updated = nowISO();
      await FS.writeJSON(root, 'vault.json', vault);
    });
  }

  // Before vault.json is first changed each day, keep a copy of it as backups/vault-YYYY-MM-DD.json.
  async function dailyBackup() {
    const day = localDay();
    if (lastBackupDay === day) return;
    const backups = await FS.getDir(root, 'backups', true);
    const name = `vault-${day}.json`;
    if (!(await FS.exists(backups, name))) {
      const text = await FS.readText(root, 'vault.json');
      if (text != null) await FS.writeText(backups, name, text);
    }
    lastBackupDay = day;
    await pruneBackups();
  }

  async function backupNow() {
    const d = new Date();
    const name = `vault-${localDay(d)}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.json`;
    const backups = await FS.getDir(root, 'backups', true);
    await serial('vault.json', async () => {
      await FS.writeText(backups, name, (await FS.readText(root, 'vault.json')) || '');
    });
    await pruneBackups();
    return name;
  }

  /* v1.85: a full backup of CaseVault-Data into a folder on another drive: every file copied, read
   * back and compared byte for byte. destParent is a folder the user picked (not inside the vault). */
  async function fullBackup(destParent, onFile) {
    if (!root) throw new Error('No vault is open.');
    let inside = null;
    try { inside = await root.resolve(destParent); } catch { /* other drive: cannot resolve */ }
    if (inside) {
      const err = new Error('That folder is inside the vault. Pick a folder on a different drive.');
      err.name = 'BackupTargetError';
      throw err;
    }
    let around = null;
    try { around = await destParent.resolve(root); } catch { /* not related */ }
    if (around) {
      const err = new Error('That folder is on the vault\'s own drive. A backup must go on a different drive, so it survives if the SSD is lost.');
      err.name = 'BackupTargetError';
      throw err;
    }
    try { if (await destParent.isSameEntry(root)) throw Object.assign(new Error('That is the vault itself. Pick a folder on a different drive.'), { name: 'BackupTargetError' }); } catch (e) { if (e.name === 'BackupTargetError') throw e; }
    await saveVault();
    const d = new Date();
    const folder = `CaseVault-Backup-${localDay(d)}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const dst = await FS.getDir(destParent, folder, true);
    const tally = { files: 0, bytes: 0 };
    const copy = async (src, to, path) => {
      for (const e of await FS.list(src)) {
        if (e.name === MOVE_MARKER || e.name === RENAME_MARKER) continue;
        if (e.kind === 'directory') { await copy(e.handle, await FS.getDir(to, e.name, true), `${path}${e.name}/`); continue; }
        const file = await e.handle.getFile();
        await FS.writeData(to, e.name, file);
        const back = await FS.getFile(to, e.name);
        if (!(await sameBytes(file, back))) {
          const err = new Error(`The copy of ${path}${e.name} does not match the original. The backup is not complete; try again or use another drive.`);
          err.name = 'BackupVerifyError';
          throw err;
        }
        tally.files++;
        tally.bytes += file.size;
        if (onFile) onFile(tally.files, `${path}${e.name}`, tally.bytes);
      }
    };
    await copy(root, dst, '');
    const info = { app: 'CaseVault', kind: 'full-backup', appVersion: APP_VERSION, vaultId: vault.vaultId || '', at: nowISO(), files: tally.files, bytes: tally.bytes, verified: true };
    await FS.writeJSON(dst, 'backup-info.json', info);
    vault.settings.lastFullBackup = { at: info.at, files: tally.files, bytes: tally.bytes, folder, where: destParent.name || '', verified: true };
    addBackupHistory(vault.settings.lastFullBackup);
    await saveVault();
    return { folder, ...tally };
  }

  /* v1.149: the last 10 full backups (Settings → Backups): when, which drive or folder, how big. */
  const BACKUP_HISTORY_MAX = 10;
  function backupHistoryWith(list, entry) {
    const keep = (Array.isArray(list) ? list : []).filter((x) => x && typeof x === 'object' && x.at);
    const row = { at: String(entry.at || ''), files: Number(entry.files) || 0, bytes: Number(entry.bytes) || 0, folder: String(entry.folder || ''), where: String(entry.where || ''), verified: !!entry.verified };
    if (entry.by) row.by = String(entry.by);
    if (entry.manual) row.manual = true;
    return [row, ...keep.filter((x) => x.at !== row.at)].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, BACKUP_HISTORY_MAX);
  }
  function addBackupHistory(entry) { vault.settings.backupHistory = backupHistoryWith(vault.settings.backupHistory, entry); vault.settings.changesSinceBackup = 0; }

  /** v1.87: a backup the helper made and checked (Firefox). */
  async function recordHelperBackup({ folder = '', files = 0, bytes = 0, at = '', drive = '' } = {}) {
    vault.settings.lastFullBackup = { at: at || nowISO(), files, bytes, folder: String(folder).split(/[\\/]/).pop(), where: drive, verified: true, by: 'helper' };
    addBackupHistory(vault.settings.lastFullBackup);
    await saveVault();
    return vault.settings.lastFullBackup;
  }

  /** v1.85: helper mode cannot reach another drive; the user copies the folder and says so here. */
  async function recordManualBackup() {
    vault.settings.lastFullBackup = { at: nowISO(), manual: true, verified: false };
    addBackupHistory(vault.settings.lastFullBackup);
    await saveVault();
    return vault.settings.lastFullBackup;
  }

  /** v1.85: put a vault.json backup back. The current vault.json is backed up first. */
  async function restoreBackup(name) {
    if (!/^vault-[\w-]+\.json$/.test(name)) throw new Error('Not a vault backup.');
    const backups = await FS.getDir(root, 'backups', true);
    const text = await FS.readText(backups, name);
    let data = null;
    try { data = JSON.parse(text || ''); } catch { /* checked below */ }
    if (!data || data.app !== 'CaseVault' || !Array.isArray(data.cases)) throw new Error(`${name} is not a readable vault backup.`);
    if ((data.schema || 1) > SCHEMA) throw new Error(`${name} was saved by a newer version of CaseVault.`);
    const safety = await backupNow();
    await serial('vault.json', async () => { await FS.writeText(root, 'vault.json', text); });
    await load(root);
    return { safety, cases: vault.cases.length };
  }

  async function listBackups() {
    const backups = await FS.getDir(root, 'backups', true);
    return (await FS.list(backups))
      .filter((e) => e.kind === 'file' && /^vault-.*\.json$/.test(e.name))
      .map((e) => e.name)
      // Newest first. v1.85: by the name without ".json", so vault-<day>-<time> sorts after vault-<day>.
      .sort((a, b) => b.replace(/\.json$/, '').localeCompare(a.replace(/\.json$/, '')));
  }

  async function pruneBackups() {
    const keep = Math.max(1, Number(vault.settings.backupsToKeep) || DEFAULT_SETTINGS.backupsToKeep);
    const names = await listBackups();
    const backups = await FS.getDir(root, 'backups', true);
    for (const name of names.slice(keep)) await FS.remove(backups, name);
  }

  /* ---------- case index ---------- */

  function nextDeadline(timeline) {
    const open = (timeline?.events || [])
      .filter((e) => e.kind === 'deadline' && !e.done && e.date)
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    if (!open.length) return null;
    // v1.148: a snoozed deadline ("remind me in 3 days") keeps its date; the next one not snoozed is
    // kept too, so the case can still ring for another deadline while one is snoozed.
    const pick = (e) => ({ date: e.date, time: e.time || '', title: e.title || '' });
    const out = pick(open[0]);
    if (open[0].snooze) {
      out.snooze = open[0].snooze;
      const other = open.find((e) => !e.snooze);
      if (other) out.other = { ...pick(other), snoozeOf: '' };
      const later = open.filter((e) => e.snooze && e !== open[0]).map((e) => ({ ...pick(e), snooze: e.snooze }));
      if (later.length) out.snoozed = later;
    }
    return out;
  }

  function indexEntry(c, timeline, prev, location = 'active') {
    return {
      id: c.id,
      location,
      title: c.title || '',
      number: c.number || '',
      subject: c.subject || '',
      operationId: c.operationId || '',
      fileNumber: c.fileNumber || '',
      agencyNumber: c.agencyNumber || '',
      client: c.client || '',
      status: c.status || 'Open',
      tags: Array.isArray(c.tags) ? c.tags : [],
      opened: c.dates?.opened || '',
      // v1.134: for CLOSED FILES and ARCHIVED by year on the home page.
      closed: c.dates?.closed || '', archived: c.dates?.archived || '',
      updated: [c.dates?.updated, prev?.updated].filter(Boolean).sort().pop() || '',
      nextDeadline: nextDeadline(timeline),
      // v1.67: the statute of limitations (narcotic charges, 3 years; v1.134: 18 months for misdemeanors) and the archive sub-folder.
      sol: prev?.sol || null,
      archiveFolder: c.archiveFolder || '',
      // v1.145: independent cases kept together under a suspect's name (not a Mission).
      suspectGroup: c.suspectGroup || '',
      // v1.157: an arrest was made (the case has its Arrest details): marked in the case list.
      arrested: !!(c.arrest || (c.closure && c.closure.disposition === 'arrest' && !c.arrestRemoved)),
      // v1.90: Case History notes, so the case list search finds them.
      notes: (Array.isArray(c.activity) ? c.activity.filter((a) => a.note && a.what).map((a) => a.what).join(' \n ') : '').slice(0, 4000),
    };
  }

  /** v1.67: { occurred, expires } for a case folder, from its Draft and Arrest details. */
  async function solOfDir(dir, override = {}) {
    const L = globalThis.CVLimits;
    if (!L) return null;
    const fields = 'fields' in override ? override.fields : await FS.readJSON(dir, 'report-fields.json').catch(() => null);
    const arrest = 'arrest' in override ? override.arrest : await FS.readJSON(dir, 'arrest.json').catch(() => null);
    return L.compute(fields, arrest);
  }

  // Rebuild the index from the case folders (cases/ and archive/) so vault.json can never drift
  // out of sync. Also settles a move that was interrupted (see moveCaseFolder).
  async function rebuildIndex() {
    const casesDir = await FS.getDir(root, 'cases', true);
    const archiveDir = await FS.getDir(root, 'archive'); // created on first archive
    const prevById = new Map(vault.cases.map((c) => [c.id, c]));
    const dirsIn = async (parent) => (parent ? (await FS.list(parent)).filter((e) => e.kind === 'directory') : []);
    await settleRenames(casesDir);
    const active = await dirsIn(casesDir);
    const archived = await dirsIn(archiveDir);
    const archivedNames = new Set(archived.map((e) => e.name));
    const found = [];
    for (const e of active) found.push({ ...e, location: 'active' });
    for (const e of archived) found.push({ ...e, location: 'archive' });

    // The same case in both folders means a move was interrupted. Keep the right copy.
    const settled = new Set();
    for (const e of active) {
      if (!archivedNames.has(e.name)) continue;
      const keep = await settleInterruptedMove(e.name, prevById.get(e.name));
      settled.add(`${e.name}:${keep === 'active' ? 'archive' : 'active'}`); // the copy to leave out
    }

    const rebuilt = (await Promise.all(found.map(async ({ name, handle, location }) => {
      if (settled.has(`${name}:${location}`)) return null;
      try {
        const c = await FS.readJSON(handle, 'case.json');
        if (!c) return null;
        c.id = name; // the folder name is the id
        const tl = await FS.readJSON(handle, 'timeline.json').catch(() => null);
        const entry = indexEntry(c, tl, prevById.get(name), location);
        entry.sol = await solOfDir(handle).catch(() => null);
        return entry;
      } catch (err) {
        if (FS.isDisconnectError(err)) throw err;
        console.warn('Skipping unreadable case folder', name, err);
        return null;
      }
    }))).filter(Boolean);
    rebuilt.sort((a, b) => a.id.localeCompare(b.id));
    const before = JSON.stringify([...vault.cases].sort((a, b) => a.id.localeCompare(b.id)));
    vault.cases = rebuilt;
    if (JSON.stringify(rebuilt) !== before) await saveVault();
  }

  /** v1.156: the monthly self-check. Compares the case folders on the SSD with the case list and reads
   * each case's data files; nothing is changed. -> { cases, files, problems: [{ id, number, what }] } */
  const CHECK_JSON = ['case.json', 'timeline.json', 'report-fields.json', 'arrest.json'];
  async function checkVault() {
    const problems = [];
    const numberOf = (id) => ((vault.cases.find((c) => c.id === id) || {}).number || '');
    const seen = new Set();
    let files = 0;
    for (const where of ['active', 'archive']) {
      const parent = await FS.getDir(root, FOLDERS[where]);
      if (!parent) continue;
      for (const e of (await FS.list(parent)).filter((x) => x.kind === 'directory' && !x.name.startsWith('.'))) {
        seen.add(e.name);
        const entry = vault.cases.find((c) => c.id === e.name);
        if (!entry) problems.push({ id: e.name, number: '', what: `The folder ${FOLDERS[where]}\\${e.name} is on the SSD but not in the case list.` });
        else if ((entry.location === 'archive' ? 'archive' : 'active') !== where) problems.push({ id: e.name, number: entry.number || '', what: `The case is listed as ${entry.location === 'archive' ? 'archived' : 'active'} but its folder is in ${FOLDERS[where]}\\.` });
        for (const name of CHECK_JSON) {
          try {
            const v = await FS.readJSON(e.handle, name);
            if (name === 'case.json' && !v) problems.push({ id: e.name, number: numberOf(e.name), what: 'case.json is missing.' });
          } catch (err) {
            if (FS.isDisconnectError(err)) throw err;
            problems.push({ id: e.name, number: numberOf(e.name), what: `${name} is damaged and could not be read.` });
          }
        }
        if (!entry) continue;
        try {
          for (const f of await listFiles(e.name)) {
            files++;
            if (!f.size) problems.push({ id: e.name, number: entry.number || '', what: `files\\${f.name.replace(/\//g, '\\')} is empty (0 bytes).` });
          }
        } catch (err) { if (FS.isDisconnectError(err)) throw err; }
      }
    }
    for (const c of vault.cases) if (!seen.has(c.id)) problems.push({ id: c.id, number: c.number || '', what: 'In the case list, but its folder is not on the SSD.' });
    vault.settings.lastVaultCheck = { at: nowISO(), problems: problems.length };
    await saveVault();
    return { cases: seen.size, files, problems };
  }

  function upsertIndex(entry) {
    const i = vault.cases.findIndex((c) => c.id === entry.id);
    if (i >= 0) vault.cases[i] = entry;
    else vault.cases.push(entry);
  }

  // v1.153: changes since the last full backup (each case save), for the reminder after 50.
  function countChange() { if (vault && vault.settings) vault.settings.changesSinceBackup = (Number(vault.settings.changesSinceBackup) || 0) + 1; }
  function touchIndex(id, patch = {}) {
    const entry = vault.cases.find((c) => c.id === id);
    if (entry) Object.assign(entry, patch, { updated: nowISO() });
    countChange();
    return saveVault();
  }

  /* ---------- cases ---------- */

  // Active cases live in cases/, archived ones in archive/. The index entry's `location` says which.
  const FOLDERS = { active: 'cases', archive: 'archive', deleted: 'deleted', restoring: 'restore-tmp' }; // v1.106: deleted/ is Recently Deleted
  const locationOf = (id) => ((vault.cases.find((c) => c.id === id) || {}).location === 'archive' ? 'archive' : 'active');
  const isArchived = (id) => !!vault && locationOf(id) === 'archive';

  async function caseDir(id, create = false) {
    const where = locationOf(id);
    let dir = await FS.getDir(await FS.getDir(root, FOLDERS[where], true), id, create);
    if (!dir && !create) {
      // The index may be out of date (e.g. a restored vault.json backup): look in the other folder.
      const other = await FS.getDir(root, FOLDERS[where === 'archive' ? 'active' : 'archive']);
      dir = other ? await FS.getDir(other, id) : null;
    }
    if (!dir) {
      const err = new Error('This case folder no longer exists on the SSD.');
      err.name = 'CaseMissingError';
      throw err;
    }
    return dir;
  }

  // Archived cases are read-only: every write to one is refused here, whatever the screen allows.
  function assertWritable(id) {
    if (!isArchived(id)) return;
    const err = new Error('This case is archived, so it is read-only. Restore it to active cases to change it.');
    err.name = 'ReadOnlyError';
    throw err;
  }

  // cases/2026-00123 for case number 00123 opened in 2026 (then -2, -3 if taken); a case without a
  // number gets a dated id like 20260928-k3j9x2, and can be renamed once it has one.
  async function freeCaseId(base) {
    const casesDir = await FS.getDir(root, 'cases', true);
    const archiveDir = await FS.getDir(root, 'archive');
    const taken = async (name) => vault.cases.some((x) => x.id === name)
      || (await FS.exists(casesDir, name, 'directory')) || (archiveDir ? await FS.exists(archiveDir, name, 'directory') : false);
    for (let n = 1; ; n++) {
      const candidate = n === 1 ? base : `${base}-${n}`;
      if (!(await taken(candidate))) return candidate;
    }
  }

  async function ensureCategoryFolders(dir) {
    const files = await FS.getDir(dir, 'files', true);
    for (const folder of CVCaseFiles.FOLDERS) {
      let dir = files;
      for (const part of folder.split('/')) dir = await FS.getDir(dir, part, true);
    }
    return files;
  }

  async function createCase(fields) {
    // v1.46: Case Numbers are unique across the vault (archived cases count).
    const dup = CVOperation.caseWithNumber(vault.cases, fields.number);
    if (dup) throw validationError(`Case Number ${String(fields.number).trim()} already exists${dup.location === 'archive' ? ' (archived)' : ''}. Case Numbers must be unique.`);
    const op = fields.operationId ? getOperation(fields.operationId) : null;
    if (fields.operationId && !op) throw validationError('That Mission no longer exists.');
    const draft = { number: fields.number || '', dates: { opened: fields.opened || localDay() } };
    const base = CVCaseFiles.caseFolderName(draft);
    const id = base ? await freeCaseId(base) : newId();
    const now = nowISO();
    const c = {
      schema: SCHEMA,
      id,
      title: CVOperation.caseTitle({ subject: fields.subject, title: fields.title }, op),
      number: String(fields.number || '').trim(),
      subject: String(fields.subject || '').trim(),
      operationId: op ? op.id : '',
      operation: op ? { number: op.number, name: op.name } : null,
      fileNumber: fields.fileNumber || '',
      agencyNumber: fields.agencyNumber || '',
      client: fields.client || '',
      status: STATUSES.includes(fields.status) ? fields.status : 'Open',
      tags: fields.tags || [],
      dates: { opened: fields.opened || localDay(), closed: '', created: now, updated: now },
    };
    logActivity(c, `Opened as ${c.status}`);
    const dir = await caseDir(id, true);
    await ensureCategoryFolders(dir);
    await FS.writeJSON(dir, 'case.json', c);
    await FS.writeText(dir, 'notes.md', '');
    await FS.writeJSON(dir, 'timeline.json', { schema: SCHEMA, events: [] });
    upsertIndex(indexEntry(c, null));
    await saveVault();
    return c;
  }

  async function getCase(id) {
    const c = await FS.readJSON(await caseDir(id), 'case.json');
    if (!c) {
      const err = new Error('case.json is missing for this case.');
      err.name = 'CaseMissingError';
      throw err;
    }
    c.id = id;
    c.tags = Array.isArray(c.tags) ? c.tags : [];
    c.subject = c.subject || '';
    c.operationId = c.operationId || '';
    c.dates = { opened: '', closed: '', created: '', updated: '', ...(c.dates || {}) };
    return c;
  }

  function saveCase(c) {
    return serial(`case:${c.id}`, async () => {
      assertWritable(c.id);
      const dir = await caseDir(c.id);
      c.dates.updated = nowISO();
      await FS.writeJSON(dir, 'case.json', c);
      const prev = vault.cases.find((e) => e.id === c.id);
      upsertIndex({ ...indexEntry(c, null, prev, locationOf(c.id)), nextDeadline: prev ? prev.nextDeadline : null });
      countChange();
      await saveVault();
    });
  }

  // Permanent: removes the case folder (active or archived) with everything in it. No trash.
  /** v1.106: Delete Case moves the case to Recently Deleted (deleted/<id>) for BIN_DAYS days, from
   * where it can be restored. After that, or with Delete Now, it is gone for good. */
  const BIN_DAYS = 30;
  function deleteCase(id) {
    return serial(`case:${id}`, () => binCase(id));
  }
  async function binCase(id) {
    const from = locationOf(id);
    const parent = await FS.getDir(root, FOLDERS[from], true);
    if (await FS.exists(parent, id, 'directory')) {
      const dir = await FS.getDir(parent, id);
      const c = await FS.readJSON(dir, 'case.json').catch(() => null);
      if (c) {
        c.deleted = { at: nowISO(), from, until: new Date(Date.now() + BIN_DAYS * 864e5).toISOString().slice(0, 10) };
        logActivity(c, 'Deleted (kept in Recently Deleted)');
        await FS.writeJSON(dir, 'case.json', c);
        await moveCaseFolder(id, from, 'deleted');
      } else {
        await FS.remove(parent, id, true); // nothing readable to keep
      }
    }
    vault.cases = vault.cases.filter((c) => c.id !== id);
    await saveVault();
  }

  /* v1.154: Export Encrypted saves on the SSD, never on the PC: in CaseVault-Data/exports/, in a
   * folder you pick or make there. The file is read back and compared before it counts as saved. */
  const EXPORTS = 'exports';
  /** [{ name, files: [{ name, size, modified }] }], folders by name, newest file first. */
  async function listExportFolders() {
    const base = await FS.getDir(root, EXPORTS);
    if (!base) return [];
    const out = [];
    for (const e of await FS.list(base)) {
      if (e.kind !== 'directory') continue;
      const files = [];
      for (const f of await FS.list(e.handle)) {
        if (f.kind !== 'file' || !/\.cvcase$/i.test(f.name)) continue;
        const file = await f.handle.getFile();
        files.push({ name: f.name, size: file.size, modified: file.lastModified });
      }
      out.push({ name: e.name, files: files.sort((x, y) => y.modified - x.modified) });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }
  /** Saves an export into exports/<folder> (made if new). -> { folder, name, path } */
  async function saveExport(folder, name, blob) {
    const f = String(folder || '').trim() ? FS.safeName(String(folder).trim()) : '';
    if (!f) throw Object.assign(new Error('Pick a folder or type a name for a new one.'), { name: 'SyntaxError' });
    const dir = await FS.getDir(await FS.getDir(root, EXPORTS, true), f, true);
    const file = await FS.uniqueName(dir, name);
    await FS.writeData(dir, file, blob);
    if (!(await sameBytes(blob, await FS.getFile(dir, file)))) {
      await FS.remove(dir, file).catch(() => {});
      throw new Error('The copy on the SSD does not match. Nothing was saved; try again.');
    }
    return { folder: f, name: file, path: `CaseVault-Data\\${EXPORTS}\\${f}\\${file}` };
  }
  /** An export saved on the SSD, as a File (for Import Case). */
  async function readExport(folder, name) {
    const dir = await FS.getDir(await FS.getDir(root, EXPORTS), FS.safeName(folder));
    const file = dir && (await FS.getFile(dir, name));
    if (!file) throw Object.assign(new Error(`${name} is no longer on the SSD.`), { name: 'NotFoundError' });
    return file;
  }

  /** v1.153: every file in a case folder, for Export Encrypted: [{ path, blob }] (paths inside the folder). */
  async function caseFolderFiles(id) {
    const dir = await caseDir(id);
    if (!dir) throw Object.assign(new Error('This case folder is not on the SSD.'), { name: 'NotFoundError' });
    const out = [];
    const walk = async (d, path) => {
      for (const e of await FS.list(d)) {
        if (e.kind === 'directory') { if (e.name !== TRASH) await walk(e.handle, `${path}${e.name}/`); continue; }
        out.push({ path: `${path}${e.name}`, blob: await e.handle.getFile() });
      }
    };
    await walk(dir, '');
    return out;
  }

  /**
   * v1.106: put one case back from a full backup. files: [{ path, data }] with paths relative to
   * the case folder ("case.json", "files/Photos/x.jpg"). They are written to restore-tmp/<id>
   * first and moved in only when all are there. A case with the same id in the vault goes to
   * Recently Deleted first, so nothing is lost. -> the restored case.
   */
  function restoreCaseFromBackup(id, location, files, onFile = () => {}, note = 'Restored from a full backup') {
    return serial(`case:${id}`, async () => {
      if (!/^[A-Za-z0-9][\w.-]*$/.test(id)) throw Object.assign(new Error(`"${id}" is not a case folder name.`), { name: 'SyntaxError' });
      const to = location === 'archive' ? 'archive' : 'active';
      const tmpParent = await FS.getDir(root, FOLDERS.restoring, true);
      if (await FS.exists(tmpParent, id, 'directory')) await FS.remove(tmpParent, id, true);
      const tmp = await FS.getDir(tmpParent, id, true);
      try {
        for (const f of files) {
          const parts = String(f.path).split('/').filter(Boolean);
          if (!parts.length || parts.some((x) => x === '..' || x === '.')) continue;
          let d = tmp;
          for (const part of parts.slice(0, -1)) d = await FS.getDir(d, part, true);
          await FS.writeData(d, parts[parts.length - 1], f.data);
          onFile(f.path);
        }
        const c = await FS.readJSON(tmp, 'case.json');
        if (!c) throw Object.assign(new Error('The backup has no readable case.json for this case.'), { name: 'NotReadableError' });
        c.id = id;
        delete c.deleted;
        logActivity(c, note);
        await FS.writeJSON(tmp, 'case.json', c);
        // The copy in the vault now (if any) waits in Recently Deleted; an older one there makes way.
        if (vault.cases.some((e) => e.id === id)) {
          const bin = await FS.getDir(root, FOLDERS.deleted);
          if (bin && await FS.exists(bin, id, 'directory')) await FS.remove(bin, id, true);
          await binCase(id);
        }
        await moveCaseFolder(id, 'restoring', to);
        const at = await FS.getDir(await FS.getDir(root, FOLDERS[to]), id);
        const tl = await FS.readJSON(at, 'timeline.json').catch(() => null);
        upsertIndex(indexEntry(c, tl, null, to));
        await reconcileOperations(); // its Mission is made again if this vault doesn't have it
        await saveVault();
        return c;
      } catch (err) {
        await FS.remove(tmpParent, id, true).catch(() => {});
        throw err;
      }
    });
  }

  /** The cases in Recently Deleted, newest first: { id, number, subject, title, deletedAt, until, from }. */
  async function listDeleted() {
    const bin = await FS.getDir(root, FOLDERS.deleted);
    if (!bin) return [];
    const out = [];
    for (const e of await FS.list(bin)) {
      if (e.kind !== 'directory') continue;
      const c = await FS.readJSON(e.handle, 'case.json').catch(() => null);
      if (!c || !c.deleted) continue;
      out.push({ id: e.name, number: c.number || '', subject: c.subject || '', title: c.title || '', deletedAt: c.deleted.at, until: c.deleted.until, from: c.deleted.from === 'archive' ? 'archive' : 'active' });
    }
    return out.sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
  }

  /** Put a case back where it was deleted from (cases/ or archive/). */
  function restoreDeleted(id) {
    return serial(`case:${id}`, async () => {
      const bin = await FS.getDir(root, FOLDERS.deleted);
      const dir = bin && await FS.getDir(bin, id);
      const c = dir && await FS.readJSON(dir, 'case.json').catch(() => null);
      if (!c) throw Object.assign(new Error('That case is no longer in Recently Deleted.'), { name: 'CaseMissingError' });
      const to = c.deleted && c.deleted.from === 'archive' ? 'archive' : 'active';
      if (await FS.exists(await FS.getDir(root, FOLDERS[to], true), id, 'directory')) throw Object.assign(new Error('A case with the same folder is already in the vault.'), { name: 'InvalidStateError' });
      delete c.deleted;
      logActivity(c, 'Restored from Recently Deleted');
      if (c.operationId && !getOperation(c.operationId)) { c.operationId = ''; c.operation = null; c.title = CVOperation.caseTitle(c, null); }
      c.dates = { ...(c.dates || {}), updated: nowISO() };
      await FS.writeJSON(dir, 'case.json', c);
      await moveCaseFolder(id, 'deleted', to);
      const at = await FS.getDir(await FS.getDir(root, FOLDERS[to]), id);
      const tl = await FS.readJSON(at, 'timeline.json').catch(() => null);
      upsertIndex(indexEntry(c, tl, null, to));
      await saveVault();
      return c;
    });
  }

  /** Delete Now: gone from the SSD for good, with its traces in the vault.json backups and chats. */
  function purgeDeleted(id) {
    return serial(`case:${id}`, async () => {
      const bin = await FS.getDir(root, FOLDERS.deleted);
      if (bin && await FS.exists(bin, id, 'directory')) await FS.remove(bin, id, true);
      await scrubCase(id);
    });
  }

  async function countFiles(dir) {
    let n = 0;
    for (const x of await FS.list(dir)) n += x.kind === 'directory' ? await countFiles(x.handle) : (x.name === MOVE_MARKER ? 0 : 1);
    return n;
  }

  /** On open: finish a delete or restore that was interrupted, and empty what is past its 30 days. */
  async function tidyDeleted() {
    // A restore from a backup that was cut off leaves restore-tmp/: nothing in it was moved in.
    if (await FS.getDir(root, FOLDERS.restoring)) await FS.remove(root, FOLDERS.restoring, true).catch(() => {});
    const bin = await FS.getDir(root, FOLDERS.deleted);
    if (!bin) return;
    const today = localDay();
    for (const e of await FS.list(bin)) {
      if (e.kind !== 'directory') continue;
      try {
        for (const where of ['active', 'archive']) {
          const parent = await FS.getDir(root, FOLDERS[where]);
          if (!parent || !(await FS.exists(parent, e.name, 'directory'))) continue;
          // In both places (a delete or a restore was cut off): a copy with the move marker is the
          // finished one. With no marker, the copy with fewer files is the unfinished one; when
          // they match, the case stays in the vault (the safe side).
          const inVault = await FS.getDir(parent, e.name);
          let keepBin;
          if (await FS.exists(e.handle, MOVE_MARKER)) keepBin = true;
          else if (await FS.exists(inVault, MOVE_MARKER)) keepBin = false;
          else keepBin = (await countFiles(e.handle)) > (await countFiles(inVault));
          if (keepBin) { await FS.remove(parent, e.name, true); await FS.remove(e.handle, MOVE_MARKER).catch(() => {}); continue; }
          await FS.remove(bin, e.name, true);
          await FS.remove(inVault, MOVE_MARKER).catch(() => {});
          const c = await FS.readJSON(inVault, 'case.json').catch(() => null);
          if (c && c.deleted) { delete c.deleted; await FS.writeJSON(inVault, 'case.json', c); }
        }
        if (!(await FS.exists(bin, e.name, 'directory'))) continue;
        const c = await FS.readJSON(e.handle, 'case.json').catch(() => null);
        if (c && c.deleted && c.deleted.until && c.deleted.until < today) { await FS.remove(bin, e.name, true); await scrubCase(e.name); }
      } catch (err) { if (FS.isDisconnectError(err)) throw err; console.warn('Recently Deleted: could not tidy', e.name, err); }
    }
  }

  /** v1.28: a deleted case leaves no trace elsewhere in the vault: its line in the older copies of
   * vault.json (backups/) and the Ask AI chats about it go too. */
  async function scrubCase(id) {
    try {
      const backups = await FS.getDir(root, 'backups');
      if (backups) {
        for (const e of await FS.list(backups)) {
          if (e.kind !== 'file' || !/\.json$/i.test(e.name)) continue;
          let v = null;
          try { v = await FS.readJSON(backups, e.name); } catch { continue; }
          if (!v || !Array.isArray(v.cases) || !v.cases.some((c) => c && c.id === id)) continue;
          v.cases = v.cases.filter((c) => !c || c.id !== id);
          await FS.writeJSON(backups, e.name, v);
        }
      }
      const chats = await FS.getDir(root, 'chats');
      if (chats) {
        for (const e of await FS.list(chats)) {
          if (e.kind !== 'file' || !/\.json$/i.test(e.name)) continue;
          let ch = null;
          try { ch = await FS.readJSON(chats, e.name); } catch { continue; }
          if (ch && ch.caseId === id) await FS.remove(chats, e.name);
        }
      }
    } catch (err) { if (FS.isDisconnectError(err)) throw err; console.warn('Could not tidy up after the deleted case', err); }
  }

  /** Emergency Purge (v1.28): delete everything in CaseVault-Data (cases, archive, drafts, files,
   * backups, chats, logs, templates, library, API keys, vault.json). The CaseVault-Data folder
   * itself is left, empty. progress(done, total, name). There is no undo. */
  async function purgeAll(progress = () => {}) {
    if (!root) throw new Error('No vault is open.');
    const entries = await FS.list(root);
    let done = 0;
    const failed = [];
    for (const e of entries) {
      progress(done, entries.length, e.name);
      try { await FS.remove(root, e.name, e.kind === 'directory'); } catch (err) { if (FS.isDisconnectError(err)) throw err; failed.push(e.name); }
      done += 1;
    }
    progress(done, entries.length, '');
    retiredChecked = false;
    root = null;
    vault = null;
    return { removed: done - failed.length, failed };
  }

  /* ---------- archive: move a case folder between cases/ and archive/ ---------- */

  // Written into the copy once every file has been copied and checked. If the original can't be
  // removed afterwards (the SSD unplugged at that moment), the next rebuild sees the marker and
  // finishes the move; without it, the copy is incomplete and the original is kept.
  const MOVE_MARKER = '.casevault-move.json';
  const CHUNK = 4 * 1024 * 1024;

  async function sameBytes(a, b) {
    if (!a || !b || a.size !== b.size) return false;
    for (let at = 0; at < a.size; at += CHUNK) {
      const [x, y] = await Promise.all([a.slice(at, at + CHUNK).arrayBuffer(), b.slice(at, at + CHUNK).arrayBuffer()]);
      const u = new Uint8Array(x);
      const v = new Uint8Array(y);
      if (u.length !== v.length) return false;
      for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return false;
    }
    return true;
  }

  // Copy every file and folder of src into dst, then read both back and compare byte for byte.
  // Returns the number of files. Throws (leaving src untouched) if anything differs.
  async function copyTree(src, dst, onFile) {
    let n = 0;
    for (const e of await FS.list(src)) {
      if (e.name === MOVE_MARKER || e.name === RENAME_MARKER) continue;
      if (e.kind === 'directory') {
        n += await copyTree(e.handle, await FS.getDir(dst, e.name, true), onFile);
      } else {
        const file = await e.handle.getFile();
        await FS.writeData(dst, e.name, file);
        const copy = await FS.getFile(dst, e.name);
        if (!(await sameBytes(file, copy))) {
          const err = new Error(`The copy of ${e.name} does not match the original, so the case was not moved.`);
          err.name = 'MoveVerifyError';
          throw err;
        }
        n++;
        if (onFile) onFile(n, e.name);
      }
    }
    return n;
  }

  /** Move cases/<id> <-> archive/<id>: copy, verify every file, then remove the original. */
  async function moveCaseFolder(id, from, to, onFile) {
    const fromParent = await FS.getDir(root, FOLDERS[from], true);
    const toParent = await FS.getDir(root, FOLDERS[to], true);
    const src = await FS.getDir(fromParent, id);
    if (!src) {
      const err = new Error('This case folder no longer exists on the SSD.');
      err.name = 'CaseMissingError';
      throw err;
    }
    const stale = await FS.getDir(toParent, id);
    if (stale) {
      // A copy left by an earlier move. Complete (marker): that move only needs finishing.
      if (await FS.exists(stale, MOVE_MARKER)) {
        await FS.remove(fromParent, id, true);
        await FS.remove(stale, MOVE_MARKER);
        return;
      }
      await FS.remove(toParent, id, true); // incomplete: the original is intact, start again
    }
    const dst = await FS.getDir(toParent, id, true);
    try {
      await copyTree(src, dst, onFile);
    } catch (err) {
      // Leave only the untouched original behind.
      try { await FS.remove(toParent, id, true); } catch { /* the next move or rebuild tidies up */ }
      throw err;
    }
    await FS.writeJSON(dst, MOVE_MARKER, { from: FOLDERS[from], to: FOLDERS[to], at: nowISO() });
    await FS.remove(fromParent, id, true);
    await FS.remove(dst, MOVE_MARKER);
  }

  // Both cases/<id> and archive/<id> exist: a move was interrupted. Returns which copy to keep.
  async function settleInterruptedMove(id, prevEntry) {
    const casesDir = await FS.getDir(root, 'cases', true);
    const archiveDir = await FS.getDir(root, 'archive', true);
    const inActive = await FS.getDir(casesDir, id);
    const inArchive = await FS.getDir(archiveDir, id);
    try {
      if (await FS.exists(inArchive, MOVE_MARKER)) { // archiving had copied everything
        await FS.remove(casesDir, id, true);
        await FS.remove(inArchive, MOVE_MARKER);
        return 'archive';
      }
      if (await FS.exists(inActive, MOVE_MARKER)) { // restoring had copied everything
        await FS.remove(archiveDir, id, true);
        await FS.remove(inActive, MOVE_MARKER);
        return 'active';
      }
    } catch (err) {
      if (FS.isDisconnectError(err)) throw err;
      console.warn('Could not finish an interrupted move', id, err);
    }
    // No marker: the copy is incomplete. The original is where the index last put the case.
    return prevEntry && prevEntry.location === 'archive' ? 'archive' : 'active';
  }

  /**
   * Archive a case: status Archived, closed date filled in if empty, folder moved to archive/.
   * Returns the updated case.
   */
  function archiveCase(id, onFile, folder = '', reason = '') {
    return serial(`case:${id}`, async () => {
      if (isArchived(id)) return getCase(id);
      const c = await getCase(id);
      const before = structuredClone(c);
      c.archiveFolder = ARCHIVE_FOLDERS.some(([k]) => k === folder) ? folder : '';
      // v1.84: why it was archived.
      c.archiveReason = String(reason || '').trim().slice(0, 500);
      if (c.status !== 'Archived') c.statusBeforeArchive = c.status;
      c.status = 'Archived';
      if (!c.dates.closed) c.dates.closed = localDay();
      c.dates.archived = localDay();
      c.dates.updated = nowISO();
      logActivity(c, `Archived${c.archiveReason ? `: ${c.archiveReason}` : ''}`);
      // case.json is updated first so the copy carries it. If the move fails, the case stays
      // active exactly as it was.
      const dir = await caseDir(id);
      await FS.writeJSON(dir, 'case.json', c);
      try {
        await moveCaseFolder(id, 'active', 'archive', onFile);
      } catch (err) {
        if (await FS.exists(await FS.getDir(root, 'cases', true), id, 'directory').catch(() => false)) {
          await FS.writeJSON(dir, 'case.json', before).catch(() => {});
        }
        throw err;
      }
      const prev = vault.cases.find((e) => e.id === id);
      const tl = await FS.readJSON(await FS.getDir(await FS.getDir(root, 'archive'), id), 'timeline.json').catch(() => null);
      upsertIndex(indexEntry(c, tl, prev, 'archive'));
      await saveVault();
      return c;
    });
  }

  /** Restore an archived case to cases/, with the status it had before (Closed if unknown). */
  function restoreCase(id, onFile) {
    return serial(`case:${id}`, async () => {
      if (!isArchived(id)) return getCase(id);
      await moveCaseFolder(id, 'archive', 'active', onFile);
      const prev = vault.cases.find((e) => e.id === id);
      if (prev) prev.location = 'active';
      const dir = await caseDir(id);
      const c = await getCase(id);
      c.status = c.statusBeforeArchive && STATUSES.includes(c.statusBeforeArchive) && c.statusBeforeArchive !== 'Archived' ? c.statusBeforeArchive : (c.dates.closed ? 'Closed' : 'Open');
      delete c.statusBeforeArchive;
      delete c.dates.archived;
      delete c.archiveFolder;
      delete c.archiveReason;
      logActivity(c, `Restored from the archive as ${c.status}`);
      // v1.46: its Operation was deleted while it was archived: it comes back as an independent case.
      if (c.operationId && !getOperation(c.operationId)) { c.operationId = ''; c.operation = null; c.title = CVOperation.caseTitle(c, null); }
      c.dates.updated = nowISO();
      await FS.writeJSON(dir, 'case.json', c);
      const tl = await FS.readJSON(dir, 'timeline.json').catch(() => null);
      upsertIndex(indexEntry(c, tl, prev, 'active'));
      await saveVault();
      return c;
    });
  }

  /** What must be typed to delete a case: its number, or its title when it has no number. */
  function deleteConfirmText(c) {
    return String((c && (String(c.number || '').trim() || c.title)) || '').trim();
  }
  const deleteConfirmMatches = (c, typed) => {
    const want = deleteConfirmText(c);
    return !!want && String(typed || '').trim() === want;
  };

  /* ---------- renaming a case folder to the 2026-<CaseNo> convention ---------- */

  // Written into the new folder before copying ("copying") and after every file is verified
  // ("copied"). The next rebuild finishes or undoes an interrupted rename from it.
  const RENAME_MARKER = '.casevault-rename.json';

  /** The folder name the convention wants for this case, or null (no number, or already named so). */
  function conventionalId(c) {
    const base = CVCaseFiles.caseFolderName(c);
    if (!base || c.id === base || new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+$`).test(c.id)) return null;
    return base;
  }

  /** Rename cases/<id> to cases/<2026-CaseNo>: copy, verify every file, then remove the original. */
  function renameCaseFolder(id, onFile) {
    return serial(`case:${id}`, async () => {
      assertWritable(id);
      const c = await getCase(id);
      const base = conventionalId(c);
      if (!base) return c;
      const newCaseId = await freeCaseId(base);
      const casesDir = await FS.getDir(root, 'cases', true);
      const src = await caseDir(id);
      const dst = await FS.getDir(casesDir, newCaseId, true);
      await FS.writeJSON(dst, RENAME_MARKER, { from: id, state: 'copying', at: nowISO() });
      try {
        await copyTree(src, dst, onFile);
      } catch (err) {
        try { await FS.remove(casesDir, newCaseId, true); } catch { /* the next rebuild tidies up */ }
        throw err;
      }
      c.id = newCaseId;
      c.previousIds = [...new Set([...(c.previousIds || []), id])];
      c.dates.updated = nowISO();
      await FS.writeJSON(dst, 'case.json', c);
      await FS.writeJSON(dst, RENAME_MARKER, { from: id, state: 'copied', at: nowISO() });
      await FS.remove(casesDir, id, true);
      await FS.remove(dst, RENAME_MARKER);
      const prev = vault.cases.find((e) => e.id === id);
      vault.cases = vault.cases.filter((e) => e.id !== id);
      const tl = await FS.readJSON(dst, 'timeline.json').catch(() => null);
      upsertIndex(indexEntry(c, tl, prev, 'active'));
      await saveVault();
      return c;
    });
  }

  async function settleRenames(casesDir) {
    for (const e of await FS.list(casesDir)) {
      if (e.kind !== 'directory') continue;
      let marker = null;
      try { marker = await FS.readJSON(e.handle, RENAME_MARKER); } catch (err) { if (FS.isDisconnectError(err)) throw err; }
      if (!marker) continue;
      try {
        if (marker.state === 'copied') {
          if (marker.from && marker.from !== e.name && (await FS.exists(casesDir, marker.from, 'directory'))) await FS.remove(casesDir, marker.from, true);
          await FS.remove(e.handle, RENAME_MARKER);
        } else {
          // The copy never finished: the original is intact, so drop the partial copy.
          await FS.remove(casesDir, e.name, true);
        }
      } catch (err) {
        if (FS.isDisconnectError(err)) throw err;
        console.warn('Could not finish an interrupted rename', e.name, err);
      }
    }
  }

  /* ---------- Operations (v1.46) ----------
   * vault.json holds the Operations; each case.json says which one it belongs to (operationId) and
   * keeps a copy of its number and name, so the link survives an older vault.json being restored.
   * Linking, unlinking and deleting an Operation never move, copy or delete a case or a file. */

  function validationError(message) {
    const err = new Error(message);
    err.name = 'ValidationError';
    return err;
  }
  const listOperations = () => (vault ? vault.operations : []);
  const getOperation = (id) => (id && vault ? vault.operations.find((o) => o.id === id) || null : null);
  /** The Operation a case (id or index entry) belongs to, or null. */
  const operationOf = (c) => getOperation((typeof c === 'string' ? vault.cases.find((x) => x.id === c) || {} : c || {}).operationId);
  /** Index entries of an Operation's cases (archived ones too). */
  const operationMembers = (opId) => (opId && vault ? vault.cases.filter((c) => c.operationId === opId) : []);
  const caseNumberTaken = (number, exceptId = '') => !!CVOperation.caseWithNumber(vault.cases, number, exceptId);

  function cleanOperation(fields, prev = {}) {
    const t = (v) => String(v == null ? '' : v).trim();
    return {
      ...prev,
      number: t(fields.number ?? prev.number),
      name: t(fields.name ?? prev.name).replace(/\s+/g, ' '),
      status: CVOperation.OP_STATUSES.includes(fields.status) ? fields.status : (prev.status || 'Open'),
      start: t(fields.start ?? prev.start),
      end: t(fields.end ?? prev.end),
      notes: String(fields.notes ?? prev.notes ?? ''),
      outcome: String(fields.outcome ?? prev.outcome ?? ''), // v1.179: what became of its suspects, set when it closes
      later: (Array.isArray(fields.later) ? fields.later : Array.isArray(prev.later) ? prev.later : []).map(String), // v1.180: arrests made later on the cases it carried on in
    };
  }

  async function createOperation(fields) {
    const op = cleanOperation(fields);
    const errs = CVOperation.validateOperation(op, vault.operations);
    if (errs.length) throw validationError(errs.join(' '));
    const now = nowISO();
    Object.assign(op, { id: newId('op-'), created: now, updated: now });
    vault.operations.push(op);
    await saveVault();
    return op;
  }

  /** A case.json change that is about the Operation link only (also on archived cases: their link
   * is kept up to date even though they are read-only otherwise). */
  function writeLink(id, mutate) {
    return serial(`case:${id}`, async () => {
      const dir = await caseDir(id);
      const c = await FS.readJSON(dir, 'case.json');
      if (!c) return null;
      c.id = id;
      if (mutate(c) === false) return c;
      c.dates = { ...(c.dates || {}), updated: nowISO() };
      await FS.writeJSON(dir, 'case.json', c);
      const prev = vault.cases.find((e) => e.id === id);
      upsertIndex({ ...indexEntry(c, null, prev, locationOf(id)), nextDeadline: prev ? prev.nextDeadline : null });
      return c;
    });
  }

  async function updateOperation(id, fields) {
    const prev = getOperation(id);
    if (!prev) throw validationError('That Mission no longer exists.');
    const op = cleanOperation(fields, prev);
    const errs = CVOperation.validateOperation(op, vault.operations, id);
    if (errs.length) throw validationError(errs.join(' '));
    op.updated = nowISO();
    const renamed = op.number !== prev.number || op.name !== prev.name;
    Object.assign(prev, op);
    if (renamed) {
      // Rename once: every case of the Operation takes the new number and name.
      for (const m of operationMembers(id)) {
        await writeLink(m.id, (c) => { c.operation = { number: prev.number, name: prev.name }; c.title = CVOperation.caseTitle(c, prev); });
      }
    }
    await saveVault();
    return prev;
  }

  /** Link a case to an Operation. A case already in another Operation is refused: unlink it first. */
  async function assignCase(caseId, opId) {
    const op = getOperation(opId);
    if (!op) throw validationError('That Mission no longer exists.');
    const entry = vault.cases.find((c) => c.id === caseId);
    if (!entry) throw validationError('That case no longer exists.');
    if (entry.operationId === opId) throw validationError(`Case ${entry.number || entry.title} is already in this Mission.`);
    const cur = getOperation(entry.operationId);
    if (cur) throw validationError(`Case ${entry.number || entry.title} is already assigned to ${CVOperation.opLabel(cur)}. Unlink it there first.`);
    assertWritable(caseId);
    const c = await writeLink(caseId, (x) => { x.operationId = op.id; x.operation = { number: op.number, name: op.name }; x.suspectGroup = ''; /* v1.145: a Mission case leaves its suspect folder */ x.title = CVOperation.caseTitle(x, op); logActivity(x, `Moved into Mission ${CVOperation.opLabel(op)}`); });
    await saveVault();
    return c;
  }

  /** Take a case out of its Operation. The case and every file in it stay, in General Files. */
  async function unlinkCase(caseId) {
    assertWritable(caseId);
    const c = await writeLink(caseId, (x) => {
      if (!x.operationId) return false;
      const was = getOperation(x.operationId);
      logActivity(x, `Taken out of Mission ${was ? CVOperation.opLabel(was) : ''}: now an independent case`.replace('Mission :', 'its Mission:'));
      x.operationId = '';
      x.operation = null;
      x.title = CVOperation.caseTitle(x, null);
      return true;
    });
    await saveVault();
    return c;
  }

  /** Delete an Operation: its cases (archived ones too) become independent cases in General Files.
   * Nothing else is removed. Returns how many cases were unlinked. */
  async function deleteOperation(id) {
    const op = getOperation(id);
    if (!op) return 0;
    const members = operationMembers(id);
    for (const m of members) {
      await writeLink(m.id, (x) => { x.operationId = ''; x.operation = null; x.title = CVOperation.caseTitle(x, null); });
    }
    vault.operations = vault.operations.filter((o) => o.id !== id);
    const folded = (vault.settings.foldedOps || []).filter((k) => k !== id);
    vault.settings.foldedOps = folded;
    await saveVault();
    return members.length;
  }

  /** Every case.json, active and archived: [{ id, location, c }]. */
  async function readAllCases() {
    const out = [];
    for (const e of vault.cases) {
      try { const c = await FS.readJSON(await caseDir(e.id), 'case.json'); if (c) { c.id = e.id; out.push({ id: e.id, location: e.location, c }); } } catch (err) {
        if (FS.isDisconnectError(err)) throw err;
      }
    }
    return out;
  }

  /** v1.46, once per vault: vault.json is backed up, then cases that share a Title become one
   * Operation (named after it), and each case gets a Subject Name from its first suspect. */
  async function migrateOperations() {
    if (vault.cases.length) await backupNow();
    const all = await readAllCases();
    const plan = CVOperation.planMigration(all.map((x) => x.c), vault.operations);
    const now = nowISO();
    const opOfCase = new Map();
    for (const p of plan.operations) {
      const op = { id: newId('op-'), number: p.number, name: p.name, status: p.status, start: p.start, end: p.end, notes: '', created: now, updated: now };
      vault.operations.push(op);
      for (const id of p.caseIds) opOfCase.set(id, op);
    }
    for (const { id, c } of all) {
      const op = opOfCase.get(id);
      const subject = plan.subjects[id];
      if (!op && !subject && 'subject' in c && 'operationId' in c) continue;
      await writeLink(id, (x) => {
        if (subject) x.subject = subject;
        if (!('subject' in x)) x.subject = '';
        if (op) { x.operationId = op.id; x.operation = { number: op.number, name: op.name }; x.title = op.name; }
        if (!('operationId' in x)) { x.operationId = ''; x.operation = null; }
      });
    }
    vault.operationsVersion = OPERATIONS_VERSION;
    // Folded operations were kept by title; now they're kept by Operation.
    const folded = new Set((vault.settings.foldedOps || []).map(String));
    vault.settings.foldedOps = vault.operations.filter((o) => folded.has(CVOperation.opKey(o.name))).map((o) => o.id);
    await saveVault();
  }

  /** Cases that name an Operation vault.json doesn't have (an older vault.json was restored): the
   * Operation is made again from the number and name the cases keep. */
  async function reconcileOperations() {
    const missing = new Map();
    for (const e of vault.cases) if (e.operationId && !getOperation(e.operationId)) missing.set(e.operationId, [...(missing.get(e.operationId) || []), e]);
    if (!missing.size) return;
    const now = nowISO();
    for (const [id, members] of missing) {
      let snap = null;
      for (const m of members) { try { const c = await FS.readJSON(await caseDir(m.id), 'case.json'); if (c && c.operation) { snap = c.operation; break; } } catch (err) { if (FS.isDisconnectError(err)) throw err; } }
      const number = snap && snap.number && !vault.operations.some((o) => CVOperation.normNumber(o.number) === CVOperation.normNumber(snap.number)) ? snap.number : CVOperation.nextOpNumber(vault.operations);
      vault.operations.push({ id, number, name: (snap && snap.name) || members[0].title || 'Mission', status: CVOperation.statusFrom(members.map((m) => m.status)), start: members.map((m) => m.opened).filter(Boolean).sort()[0] || '', end: '', notes: '', created: now, updated: now });
    }
    await saveVault();
  }

  /* ---------- notes ---------- */

  /* v1.111: the Secure Locker (CaseVault-Data\\locker): locker.json holds the data key locked with
   * the password and with the recovery key; data.bin (the tables and the file list) and f-<id>.bin
   * (each Confidential File) are encrypted by js/secure/locker-core.js. Nothing in the folder is
   * readable without the password or the recovery key. Only these names are read or written. */
  const LOCKER_NAME = /^(locker\.json|data\.bin|f-[a-z0-9]{8,40}\.bin)$/;
  const lockerName = (name) => { if (!LOCKER_NAME.test(String(name))) throw Object.assign(new Error('Not a locker file.'), { name: 'TypeError' }); return name; };
  async function lockerDir(create = false) {
    if (!root) throw new Error('No vault is open.');
    return FS.getDir(root, 'locker', create);
  }
  /** locker.json, or null when there is no locker yet. */
  async function lockerHeader() { const d = await lockerDir(); return d ? FS.readJSON(d, 'locker.json') : null; }
  /** An encrypted file's bytes, or null. */
  async function lockerRead(name) {
    const d = await lockerDir();
    const f = d ? await FS.getFile(d, lockerName(name)) : null;
    return f ? new Uint8Array(await f.arrayBuffer()) : null;
  }
  function lockerWrite(name, data) {
    return serial(`locker:${lockerName(name)}`, async () => {
      const d = await lockerDir(true);
      if (name === 'locker.json') await FS.writeJSON(d, name, data);
      else await FS.writeData(d, name, data);
    });
  }
  async function lockerRemove(name) {
    const d = await lockerDir();
    if (d && await FS.exists(d, lockerName(name), 'file')) await FS.remove(d, name);
  }

  async function getNotes(id) {
    return (await FS.readText(await caseDir(id), 'notes.md')) || '';
  }

  function saveNotes(id, text) {
    return serial(`notes:${id}`, async () => {
      assertWritable(id);
      await FS.writeText(await caseDir(id), 'notes.md', text);
      await touchIndex(id);
    });
  }

  /* ---------- timeline ---------- */

  async function getTimeline(id) {
    const tl = await FS.readJSON(await caseDir(id), 'timeline.json');
    return { schema: SCHEMA, events: [], ...(tl || {}) };
  }

  function sortEvents(events) {
    return events.sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')));
  }

  function saveTimeline(id, tl) {
    return serial(`timeline:${id}`, async () => {
      assertWritable(id);
      sortEvents(tl.events);
      await FS.writeJSON(await caseDir(id), 'timeline.json', tl);
      await touchIndex(id, { nextDeadline: nextDeadline(tl) });
    });
  }

  /* ---------- files (files/<Category>/<name>) ---------- */
  // A file is addressed by its path inside files/: "Arrest Report/2026-00123 Arrest Report.pdf".
  // Files from versions before 1.9 sit directly in files/ and are listed as unsorted (folder '').

  async function filesDir(id) {
    return (await FS.getDir(await caseDir(id), 'files', !isArchived(id))) || emptyDir;
  }

  // Stands in for a sub-folder an archived case never had (it can't be created: read-only).
  const emptyDir = {
    kind: 'directory', name: '',
    async *entries() { /* nothing */ },
    async getFileHandle() { throw Object.assign(new Error('Not found'), { name: 'NotFoundError' }); },
    async getDirectoryHandle() { throw Object.assign(new Error('Not found'), { name: 'NotFoundError' }); },
  };

  /** Create any missing document-type folders (so they show in File Explorer too). */
  async function ensureFolders(id) {
    if (isArchived(id)) return;
    await ensureCategoryFolders(await caseDir(id));
  }

  // The folder a file lives in. Only the known document folders (or '' for unsorted) are allowed.
  async function folderDir(id, folder, create = false) {
    const files = await filesDir(id);
    if (!folder) return files;
    if (!CVCaseFiles.isCategory(folder)) {
      const err = new Error(`Unknown document folder: ${folder}`);
      err.name = 'TypeError';
      throw err;
    }
    let dir = files;
    for (const part of folder.split('/')) {
      dir = await FS.getDir(dir, part, create && !isArchived(id));
      if (!dir) return emptyDir;
    }
    return dir;
  }

  async function fileInfo(e, folder) {
    const base = { name: CVCaseFiles.joinPath(folder, e.name), folder, base: e.name };
    if (e.handle.meta) return { ...base, size: e.handle.meta.size, type: '', modified: e.handle.meta.mtime }; // helper mode
    const f = await e.handle.getFile();
    return { ...base, size: f.size, type: f.type, modified: f.lastModified };
  }

  // [{ name: 'Arrest Report/2026-00123 Arrest Report.pdf', folder, base, size, type, modified }]
  async function listFiles(id) {
    const dir = await filesDir(id);
    const out = [];
    for (const e of await FS.list(dir)) {
      if (e.kind === 'file') out.push(await fileInfo(e, CVCaseFiles.UNSORTED));
      else if (e.kind === 'directory' && CVCaseFiles.isCategory(e.name)) {
        for (const f of await FS.list(e.handle)) {
          if (f.kind === 'file' && !f.name.startsWith('.')) out.push(await fileInfo(f, e.name));
          // Sub-folders such as Recordings/Video.
          else if (f.kind === 'directory' && CVCaseFiles.isCategory(`${e.name}/${f.name}`)) {
            for (const g of await FS.list(f.handle)) if (g.kind === 'file' && !g.name.startsWith('.')) out.push(await fileInfo(g, `${e.name}/${f.name}`));
          }
        }
      }
    }
    const order = (f) => (f.folder ? CVCaseFiles.ALL_FOLDERS.indexOf(f.folder) : 999);
    const stem = (f) => f.base.replace(/\.[^.]{1,10}$/, ''); // "X.pdf" before "X (2).pdf"
    return out.sort((a, b) => order(a) - order(b) || stem(a).localeCompare(stem(b), undefined, { numeric: true }) || a.base.localeCompare(b.base));
  }

  /**
   * Copy a file into the case. With { folder } it goes into that document folder and is named by
   * the convention ("2026-00123 Arrest Report.pdf"; { description } adds " - <description>";
   * { keepName: true } keeps the original name). Without a folder it goes into files/ unchanged.
   * Returns the new file's path.
   */
  async function addFile(id, file, opts = {}) {
    assertWritable(id);
    const folder = opts.folder || CVCaseFiles.UNSORTED;
    const dir = await folderDir(id, folder, true);
    let wanted = file.name;
    if (folder && !opts.keepName) wanted = CVCaseFiles.fileName(await getCase(id), folder, file.name, opts.description || '');
    // opts.replace (v1.32): a generated report saved again takes the place of the one saved before,
    // under the same name, instead of piling up "(2)", "(3)".
    const name = opts.replace ? FS.safeName(wanted) : await FS.uniqueName(dir, wanted);
    await FS.writeData(dir, name, file);
    await touchIndex(id);
    return CVCaseFiles.joinPath(folder, name);
  }

  /* ---------- v1.68: folders not tied to a case number ----------
   * CaseVault-Data/shared/other/                 OTHER FILES on the Overview (no sub-folders)
   * CaseVault-Data/shared/op-<id>/<Folder>/      an Operation's own folder: Subpoenas, Affidavits,
   *                                              Operation Plans, Maps, Subject Data, Vehicle List
   */
  const OP_FOLDERS = ['Subpoenas', 'Affidavits', 'Operation Plans', 'Maps', 'Subject Data', 'Vehicle List', 'Other']; // v1.73: was Running Vehicle List
  const sharedKeyOk = (key) => key === 'other' || /^op-[A-Za-z0-9_-]{1,80}$/.test(key);
  // v1.71: Other Files has folders: USPIS, DEA, INET, Training, and any you make; "Other" is the
  // top of Other Files itself (where files added before v1.71 are).
  const OTHER_FOLDERS = [
    { name: 'USPIS Files', desc: 'US Postal Inspection Service' },
    { name: 'DEA Files', desc: 'Drug Enforcement Administration' },
    { name: 'INET Files', desc: 'Internet Narcotics Enforcement Team' },
    { name: 'Training', desc: 'Training material and certificates' },
    { name: '', label: 'Other', desc: 'Anything else' },
  ];
  const folderNameOk = (f) => typeof f === 'string' && f.length <= 60 && f === FS.safeName(f) && !/[\\/]/.test(f) && !f.startsWith('.');
  const sharedFolderOk = (key, folder) => (key === 'other' ? (!folder || folderNameOk(folder)) : OP_FOLDERS.includes(folder));
  /** The folders made in Other Files besides the built-in ones. */
  async function otherCustomFolders() {
    const dir = await sharedDir('other', '').catch(() => null);
    if (!dir) return [];
    const builtIn = new Set(OTHER_FOLDERS.map((f) => f.name.toLowerCase()));
    return (await FS.list(dir)).filter((e) => e.kind === 'directory' && !e.name.startsWith('.') && !builtIn.has(e.name.toLowerCase())).map((e) => e.name).sort((a, b) => a.localeCompare(b));
  }
  /** A new folder in Other Files -> its name (cleaned). */
  async function addOtherFolder(name) {
    const n = FS.safeName(String(name || '').trim()).slice(0, 60).trim();
    if (!n || !folderNameOk(n)) throw Object.assign(new Error('Give the folder a name.'), { name: 'TypeError' });
    if (OTHER_FOLDERS.some((f) => f.name.toLowerCase() === n.toLowerCase()) || (await otherCustomFolders()).some((f) => f.toLowerCase() === n.toLowerCase())) throw Object.assign(new Error(`There is already a folder named ${n}.`), { name: 'TypeError' });
    await sharedDir('other', n, true);
    return n;
  }
  /** Removes a folder you made in Other Files; only when it is empty. */
  async function removeOtherFolder(name) {
    if (!folderNameOk(name) || OTHER_FOLDERS.some((f) => f.name === name)) throw Object.assign(new Error('That folder can\'t be removed.'), { name: 'TypeError' });
    if ((await listShared('other', name)).length) throw Object.assign(new Error('Move or delete its files first.'), { name: 'TypeError' });
    await FS.remove(await sharedDir('other', ''), name, true);
  }
  // v1.73: an Operation's "Running Vehicle List" folder becomes "Vehicle List" (its files moved).
  const vehicleMoved = new Set();
  async function moveOldVehicleDir(opDir, key) {
    if (vehicleMoved.has(key)) return;
    vehicleMoved.add(key);
    const old = await FS.getDir(opDir, 'Running Vehicle List');
    if (!old) return;
    const dest = await FS.getDir(opDir, 'Vehicle List', true);
    for (const e of await FS.list(old)) {
      if (e.kind !== 'file') continue;
      const f = await FS.getFile(old, e.name);
      const name = (await FS.exists(dest, e.name)) ? await FS.uniqueName(dest, e.name) : e.name;
      await FS.writeData(dest, name, f);
    }
    await FS.remove(opDir, 'Running Vehicle List', true);
  }
  async function sharedDir(key, folder = '', create = false) {
    if (!sharedKeyOk(key) || !sharedFolderOk(key, folder)) throw Object.assign(new Error('Unknown folder.'), { name: 'TypeError' });
    let dir = await FS.getDir(root, 'shared', create);
    if (dir) dir = await FS.getDir(dir, key, create);
    if (dir && key.startsWith('op-') && folder === 'Vehicle List') await moveOldVehicleDir(dir, key).catch(() => {});
    if (dir && folder) dir = await FS.getDir(dir, folder, create);
    return dir;
  }
  /** [{ folder, base, size, modified }] in that folder (or every Operation folder with folder '*'). */
  async function listShared(key, folder = '') {
    const folders = folder === '*' ? OP_FOLDERS : [folder];
    const out = [];
    for (const f of folders) {
      const dir = await sharedDir(key, f).catch(() => null);
      if (!dir) continue;
      for (const e of await FS.list(dir)) {
        if (e.kind !== 'file' || e.name.startsWith('.')) continue;
        out.push(await fileInfo(e, f));
      }
    }
    return out.sort((a, b) => a.base.localeCompare(b.base, undefined, { numeric: true }));
  }
  /* v1.165: small pictures of a shared file's first page (the Training cards), saved once in a hidden
   * .thumbs folder beside the files, so they aren't drawn again from the PDF at every start. The
   * name says which version of the file it was made from; listShared() never shows dot-names. */
  async function readSharedThumb(key, folder, name) {
    const dir = await sharedDir(key, folder).catch(() => null);
    const t = dir ? await FS.getDir(dir, '.thumbs').catch(() => null) : null;
    return t ? FS.getFile(t, name).catch(() => null) : null;
  }
  async function saveSharedThumb(key, folder, name, blob) {
    const dir = await sharedDir(key, folder, true);
    const t = await FS.getDir(dir, '.thumbs', true);
    // Older pictures of the same file (it was replaced) go.
    const stem = name.replace(/~[^~]*$/, '~');
    for (const e of await FS.list(t).catch(() => [])) if (e.kind === 'file' && e.name !== name && e.name.startsWith(stem)) await FS.remove(t, e.name).catch(() => {});
    await FS.writeData(t, name, blob);
  }
  async function addShared(key, folder, file) {
    const dir = await sharedDir(key, folder, true);
    const name = await FS.uniqueName(dir, file.name);
    await FS.writeData(dir, name, file);
    return name;
  }
  /** v1.73: an Operation's vehicles (Vehicle List): [{ id, year, make, model, …, ownerName,
   * ownerAddress, photo }], kept in the folder as .vehicles.json (hidden from the file list). */
  async function readOpVehicles(opId) {
    const dir = await sharedDir(`op-${opId}`, 'Vehicle List').catch(() => null);
    const v = dir ? await FS.readJSON(dir, '.vehicles.json').catch(() => null) : null;
    return Array.isArray(v) ? v : [];
  }
  async function saveOpVehicles(opId, list) {
    const dir = await sharedDir(`op-${opId}`, 'Vehicle List', true);
    await FS.writeJSON(dir, '.vehicles.json', list);
  }
  // v1.80: a Mission's Subject Data sheet: [{ id, name, dob, …, photo }] as .subjects.json in the
  // Subject Data folder (hidden from the file list); photos are files in that folder.
  async function readOpList(opId, folder, file) {
    const dir = await sharedDir(`op-${opId}`, folder).catch(() => null);
    const v = dir ? await FS.readJSON(dir, file).catch(() => null) : null;
    return Array.isArray(v) ? v : [];
  }
  async function saveOpList(opId, folder, file, list) {
    const dir = await sharedDir(`op-${opId}`, folder, true);
    await FS.writeJSON(dir, file, list);
  }
  async function readShared(key, folder, base) { return FS.getFile(await sharedDir(key, folder), base); }
  async function deleteShared(key, folder, base) {
    await FS.remove(await sharedDir(key, folder), base);
    // v1.140: a certificate's details go with it.
    if (key === 'other' && folder === 'Training') { const m = await readTraining(); if (m[base]) { delete m[base]; await saveTraining(m); } }
  }
  /** v1.140: the certificates' details in Other Files → Training, as .training.json (hidden from the
   * file list): { "<file name>": { course, provider, date, hours, expires } }. */
  async function readTraining() {
    const dir = await sharedDir('other', 'Training').catch(() => null);
    const v = dir ? await FS.readJSON(dir, '.training.json').catch(() => null) : null;
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  }
  async function saveTraining(meta) {
    const dir = await sharedDir('other', 'Training', true);
    await FS.writeJSON(dir, '.training.json', meta || {});
  }
  /** v1.140: the Training certificates with their details (CVTraining.rows), newest first. */
  async function trainingRows() {
    const T = typeof module !== 'undefined' && module.exports ? require('./training.js') : globalThis.CVTraining;
    if (!T) return [];
    const files = await listShared('other', 'Training').catch(() => []);
    return T.rows(files, files.length ? await readTraining() : {});
  }

  /** v1.156: for each file about to be added, the case file with the same content (same size, then
   * the same bytes), or none. -> [{ file, same: path | '' }] */
  async function findSameFiles(id, files) {
    const have = await listFiles(id).catch(() => []);
    const sameBytes = async (a, b) => {
      const STEP = 4 * 1024 * 1024;
      for (let at = 0; at < a.size; at += STEP) {
        const [x, y] = await Promise.all([a.slice(at, at + STEP).arrayBuffer(), b.slice(at, at + STEP).arrayBuffer()]);
        const u = new Uint8Array(x); const v = new Uint8Array(y);
        if (u.length !== v.length) return false;
        for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return false;
      }
      return true;
    };
    const out = [];
    for (const file of files) {
      let same = '';
      for (const f of have.filter((x) => x.size === file.size && file.size > 0)) {
        try { if (await sameBytes(file, await readFile(id, f.name))) { same = f.name; break; } } catch (err) { if (FS.isDisconnectError(err)) throw err; }
      }
      out.push({ file, same });
    }
    return out;
  }

  async function readFile(id, path) {
    const { folder, base } = CVCaseFiles.splitPath(path);
    return FS.getFile(await folderDir(id, folder), base);
  }

  async function deleteFile(id, path) {
    assertWritable(id);
    const { folder, base } = CVCaseFiles.splitPath(path);
    await FS.remove(await folderDir(id, folder), base);
    await touchIndex(id);
  }

  /* v1.153: Undo for a deleted file. The file is moved (copied, checked, removed) into the case's
   * hidden .trash folder instead of being removed at once; untrashFile puts it back, emptyFileTrash
   * removes it for good (a few seconds later, when Undo is gone). -> { trash, path } */
  const TRASH = '.trash';
  async function trashFile(id, path) {
    assertWritable(id);
    const { folder, base } = CVCaseFiles.splitPath(path);
    const src = await folderDir(id, folder);
    const file = await FS.getFile(src, base);
    if (!file) throw Object.assign(new Error(`${base} is no longer in this case.`), { name: 'NotFoundError' });
    const bin = await FS.getDir(await caseDir(id), TRASH, true);
    // Left over from a CaseVault closed while Undo was still showing: gone after an hour.
    for (const e of await FS.list(bin)) { const t = Number(e.name.split('-')[0]); if (t && Date.now() - t > 3600000) await FS.remove(bin, e.name).catch(() => {}); }
    const name = await FS.uniqueName(bin, `${Date.now()}-${base}`);
    await FS.writeData(bin, name, file);
    if (!(await sameBytes(file, await FS.getFile(bin, name)))) { await FS.remove(bin, name).catch(() => {}); throw new Error(`${base} could not be set aside, so it was not deleted.`); }
    await FS.remove(src, base);
    await touchIndex(id);
    return { trash: name, path };
  }
  async function untrashFile(id, token) {
    assertWritable(id);
    const bin = await FS.getDir(await caseDir(id), TRASH);
    const file = bin && (await FS.getFile(bin, token.trash));
    if (!file) throw Object.assign(new Error('That file can no longer be brought back.'), { name: 'NotFoundError' });
    const { folder, base } = CVCaseFiles.splitPath(token.path);
    const dst = await folderDir(id, folder, true);
    const name = await FS.uniqueName(dst, base);
    await FS.writeData(dst, name, file);
    await FS.remove(bin, token.trash).catch(() => {});
    await touchIndex(id);
    return CVCaseFiles.joinPath(folder, name);
  }
  async function emptyFileTrash(id) {
    if (isArchived(id)) return;
    const dir = await caseDir(id);
    if (await FS.exists(dir, TRASH)) await FS.remove(dir, TRASH, true);
  }

  /**
   * Move a file to another document folder (or rename it in place), naming it by the convention.
   * The copy is verified byte for byte before the original is removed. Returns the new path.
   */
  async function moveFile(id, path, toFolder, opts = {}) {
    assertWritable(id);
    const { folder, base } = CVCaseFiles.splitPath(path);
    const src = await folderDir(id, folder);
    const file = await FS.getFile(src, base);
    if (!file) throw Object.assign(new Error(`${base} is no longer in this case.`), { name: 'NotFoundError' });
    const dst = await folderDir(id, toFolder, true);
    const c = await getCase(id);
    // v1.153: opts.name puts it back under a given name (Undo of a move or rename).
    const wanted = opts.name ? FS.safeName(opts.name) : opts.keepName ? base : CVCaseFiles.fileName(c, toFolder, base, opts.description || '');
    if (folder === toFolder && wanted === base) return path;
    const name = await FS.uniqueName(dst, wanted);
    await FS.writeData(dst, name, file);
    if (!(await sameBytes(file, await FS.getFile(dst, name)))) {
      await FS.remove(dst, name).catch(() => {});
      throw Object.assign(new Error(`The copy of ${base} did not match, so it was not moved.`), { name: 'MoveVerifyError' });
    }
    await FS.remove(src, base);
    await touchIndex(id);
    return CVCaseFiles.joinPath(toFolder, name);
  }

  /** Text-only record kept inside the case folder, e.g. mail-log.json. */
  async function readCaseJSON(id, name) {
    return FS.readJSON(await caseDir(id), name);
  }
  function writeCaseJSON(id, name, data) {
    return serial(`casejson:${id}:${name}`, async () => {
      assertWritable(id);
      const dir = await caseDir(id);
      await FS.writeJSON(dir, name, data);
      // v1.67: a change to the Draft or the Arrest details can change the statute of limitations.
      if (name === 'report-fields.json' || name === 'arrest.json') {
        const sol = await solOfDir(dir, name === 'arrest.json' ? { arrest: data } : { fields: data }).catch(() => null);
        const entry = vault.cases.find((c) => c.id === id);
        if (entry && JSON.stringify(entry.sol || null) !== JSON.stringify(sol)) { entry.sol = sol; await saveVault(); }
      }
    });
  }

  /** v1.67: the archive sub-folder of an archived case: 'expired', 'nolle', 'prosecution' or ''. */
  const ARCHIVE_FOLDERS = [['expired', 'EXPIRED'], ['nolle', 'NOLLE PROSEQUI'], ['prosecution', 'PROSECUTION']];
  /** v1.145: put an independent case in a Case Group (v1.146; was "suspect folder": several related cases, kept
   * together in INDEPENDENT CASES without making a Mission), or take it out (name ''). */
  function setSuspectGroup(id, name) {
    assertWritable(id);
    return serial(`case:${id}`, async () => {
      const g = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      const dir = await caseDir(id);
      const c = await FS.readJSON(dir, 'case.json');
      if (!c) throw new Error('The case was not found.');
      if ((c.suspectGroup || '') === g) return c;
      logActivity(c, g ? `Put in the Case Group ${g}` : `Taken out of the Case Group ${c.suspectGroup}`);
      c.suspectGroup = g;
      await FS.writeJSON(dir, 'case.json', c);
      const entry = vault.cases.find((e) => e.id === id);
      if (entry) entry.suspectGroup = g;
      await saveVault();
      return c;
    });
  }
  /** v1.145: the suspect folders in use, A to Z. */
  const suspectGroups = () => [...new Set((vault?.cases || []).map((c) => c.suspectGroup).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  /** v1.145: an archive folder's name: yours (Archived → Rename Folders, kept in vault.json) or the
   * standard one. k: 'expired', 'nolle', 'prosecution' or 'other'. Renaming never moves a case. */
  function archiveFolderName(k) {
    const own = vault && vault.settings && vault.settings.archiveFolderNames;
    const name = own && typeof own[k] === 'string' ? own[k].trim().slice(0, 40) : '';
    return name || (k === 'other' || !k ? 'Other' : (ARCHIVE_FOLDERS.find(([x]) => x === k) || [, 'Other'])[1]);
  }
  function setArchiveFolder(id, folder) {
    return serial(`case:${id}`, async () => {
      const f = ARCHIVE_FOLDERS.some(([k]) => k === folder) ? folder : '';
      const dir = await caseDir(id);
      const c = await FS.readJSON(dir, 'case.json');
      if (!c) throw new Error('The case was not found.');
      c.archiveFolder = f;
      await FS.writeJSON(dir, 'case.json', c);
      const entry = vault.cases.find((e) => e.id === id);
      if (entry) entry.archiveFolder = f;
      await saveVault();
      return c;
    });
  }

  /** v1.49: a case's discovery records (the index PDFs) in cases/<id>/discovery/. */
  function saveDiscoveryFile(id, name, data) {
    return serial(`discovery:${id}`, async () => {
      assertWritable(id);
      const dir = await FS.getDir(await caseDir(id), 'discovery', true);
      const free = await FS.uniqueName(dir, FS.safeName(name));
      await FS.writeData(dir, free, data);
      return free;
    });
  }
  async function readDiscoveryFile(id, name) {
    const dir = await FS.getDir(await caseDir(id), 'discovery');
    return dir ? FS.getFile(dir, name) : null;
  }

  /* ---------- logs/ (vault level) ---------- */

  /** Append an entry to logs/<name>-YYYY-MM.json (a JSON array). */
  function appendLog(name, entry) {
    const file = `${name}-${localDay().slice(0, 7)}.json`;
    return serial(`log:${file}`, async () => {
      const dir = await FS.getDir(root, 'logs', true);
      let list = [];
      try { list = (await FS.readJSON(dir, file)) || []; } catch (err) { if (FS.isDisconnectError(err)) throw err; list = []; }
      if (!Array.isArray(list)) list = [];
      list.push({ at: nowISO(), ...entry });
      await FS.writeJSON(dir, file, list);
    });
  }

  async function readLogs(name, months = 3) {
    const dir = await FS.getDir(root, 'logs');
    if (!dir) return [];
    const files = (await FS.list(dir)).filter((e) => e.kind === 'file' && e.name.startsWith(`${name}-`)).map((e) => e.name).sort().reverse().slice(0, months);
    const out = [];
    for (const f of files) { try { out.push(...((await FS.readJSON(dir, f)) || [])); } catch { /* skip a damaged log */ } }
    return out.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  }

  /** v1.59: the log files for a name: [{ name, month, size }], newest first. */
  async function logFiles(name) {
    const dir = await FS.getDir(root, 'logs');
    if (!dir) return [];
    const out = [];
    for (const e of await FS.list(dir)) {
      if (e.kind !== 'file' || !e.name.startsWith(`${name}-`) || !e.name.endsWith('.json')) continue;
      let size = 0;
      try { size = e.handle.meta ? e.handle.meta.size : (await e.handle.getFile()).size; } catch { /* unknown */ }
      out.push({ name: e.name, month: e.name.slice(name.length + 1, -5), size });
    }
    return out.sort((x, y) => y.month.localeCompare(x.month));
  }
  /** v1.59: deletes a log's monthly files: all of them, or only months before `keepFrom` (YYYY-MM). -> count deleted */
  async function deleteLogs(name, keepFrom = '') {
    const dir = await FS.getDir(root, 'logs');
    if (!dir) return 0;
    let n = 0;
    for (const f of await logFiles(name)) {
      if (keepFrom && f.month >= keepFrom) continue;
      await serial(`log:${f.name}`, () => FS.remove(dir, f.name));
      n += 1;
    }
    return n;
  }

  /* v1.91: the online AI features and the in-browser AI are gone. Any online AI key saved on the
   * SSD (secrets/) is deleted, and their settings dropped. lastCleanup says what was removed. */
  let lastCleanup = null;
  /** v1.105: Pending is gone. A Pending case (or Mission) is Open again; its follow-up date stays
   * on the timeline, and the case's history says so. An archived case that was Pending before
   * comes back Open when it is restored. */
  async function retirePending() {
    for (const e of vault.cases.filter((x) => x.status === 'Pending' || x.statusBeforeArchive === 'Pending')) {
      await writeLink(e.id, (c) => {
        if (c.status !== 'Pending' && c.statusBeforeArchive !== 'Pending') return false;
        if (c.status === 'Pending') { c.status = 'Open'; c.pending = null; logActivity(c, 'Pending was retired (v1.105): the case is Open again'); }
        if (c.statusBeforeArchive === 'Pending') c.statusBeforeArchive = 'Open';
        return true;
      }).catch((err) => { if (FS.isDisconnectError(err)) throw err; });
    }
    let ops = false;
    for (const o of vault.operations) if (o.status === 'Pending') { o.status = 'Open'; ops = true; }
    if (ops) await saveVault();
  }

  async function removeOnlineLeftovers() {
    lastCleanup = null;
    let keys = 0;
    const dir = await FS.getDir(root, 'secrets').catch(() => null);
    if (dir) {
      keys = (await FS.list(dir).catch(() => [])).filter((e) => e.kind === 'file').length;
      await FS.remove(root, 'secrets', true).catch(() => {});
    }
    const stale = ['online', 'webllm', 'webllmModel'].filter((k) => k in vault.settings);
    for (const k of stale) delete vault.settings[k];
    if (stale.length) await saveVault();
    if (keys) lastCleanup = { keys };
  }

  /* ---------- Ask AI conversations (CaseVault-Data/chats/<id>.json, v1.18) ---------- */

  const chatName = (id) => { if (!/^[a-z0-9-]{4,64}$/i.test(String(id))) throw new Error(`Not a chat id: ${id}`); return `${id}.json`; };

  /** Saved conversations, newest first: [{ id, title, caseId, model, updated, turns }]. */
  async function listChats() {
    const dir = await FS.getDir(root, 'chats');
    if (!dir) return [];
    const out = [];
    for (const e of await FS.list(dir)) {
      if (e.kind !== 'file' || !/\.json$/i.test(e.name)) continue;
      try { const c = await FS.readJSON(dir, e.name); if (c && c.id) out.push({ id: c.id, title: c.title || 'Chat', caseId: c.caseId || '', model: c.model || '', updated: c.updated || '', turns: (c.turns || []).length }); } catch { /* skip a damaged file */ }
    }
    return out.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  }
  async function readChat(id) {
    const dir = await FS.getDir(root, 'chats');
    return dir ? FS.readJSON(dir, chatName(id)).catch(() => null) : null;
  }
  function saveChat(chat) {
    return serial(`chat:${chat.id}`, async () => FS.writeJSON(await FS.getDir(root, 'chats', true), chatName(chat.id), { ...chat, updated: nowISO() }));
  }
  async function deleteChat(id) {
    const dir = await FS.getDir(root, 'chats');
    if (dir && await FS.exists(dir, chatName(id))) await FS.remove(dir, chatName(id));
  }

  /* ---------- consistency checks (cases/<id>/checks/) ---------- */

  async function checksDir(id) {
    return (await FS.getDir(await caseDir(id), 'checks', !isArchived(id))) || emptyDir;
  }

  // Newest first: [{ name, created, affidavit, reports, counts, open }]
  async function listChecks(id) {
    const dir = await checksDir(id);
    const out = [];
    for (const e of await FS.list(dir)) {
      if (e.kind !== 'file' || !/-check\.json$/.test(e.name)) continue;
      try {
        const c = await FS.readJSON(dir, e.name);
        const counts = { High: 0, Medium: 0, Low: 0 };
        let open = 0;
        let openHigh = 0; // v1.172: for Case Health
        for (const f of c.flags || []) { counts[f.severity] = (counts[f.severity] || 0) + 1; if (f.status === 'open') { open++; if (f.severity === 'High') openHigh++; } }
        out.push({ name: e.name, created: c.created, affidavit: c.affidavit, reports: c.reports || [], engine: c.engine, counts, open, openHigh, complete: c.complete !== false,
          documents: (c.documents || []).map((d) => ({ name: d.name, size: d.size, modified: d.modified, draft: d.draft || null, skipped: !!d.skipped })) }); // v1.169: to tell when a file changed
      } catch (err) {
        if (FS.isDisconnectError(err)) throw err;
        out.push({ name: e.name, damaged: true });
      }
    }
    return out.sort((a, b) => (b.created || b.name).localeCompare(a.created || a.name));
  }

  // cases/<id>/checks/<YYYY-MM-DD>-check.json, then -2-check.json, -3-check.json on the same day.
  async function newCheckName(id) {
    const dir = await checksDir(id);
    const day = localDay();
    for (let n = 1; ; n++) {
      const name = n === 1 ? `${day}-check.json` : `${day}-${n}-check.json`;
      if (!(await FS.exists(dir, name))) return name;
    }
  }

  async function readCheck(id, name) {
    return FS.readJSON(await checksDir(id), name);
  }

  function saveCheck(id, name, data) {
    return serial(`check:${id}:${name}`, async () => {
      assertWritable(id);
      data.updated = nowISO();
      await FS.writeJSON(await checksDir(id), name, data);
      await touchIndex(id);
    });
  }

  async function deleteCheck(id, name) {
    assertWritable(id);
    await FS.remove(await checksDir(id), name);
  }

  // Text read out of a document (OCR is slow) is kept on the SSD, keyed by file name, size and date.
  function cacheKey(fileName, size, modified) {
    return FS.safeName(`${fileName}--${size}-${modified}`).slice(0, 150) + '.json';
  }

  async function readTextCache(id, fileName, size, modified) {
    const dir = await FS.getDir(await checksDir(id), 'text-cache', !isArchived(id));
    if (!dir) return null;
    try { return await FS.readJSON(dir, cacheKey(fileName, size, modified)); } catch (err) {
      if (FS.isDisconnectError(err)) throw err;
      return null; // damaged cache entry: just read the document again
    }
  }

  async function writeTextCache(id, fileName, size, modified, data) {
    if (isArchived(id)) return; // read-only: the text is simply read again next time
    const dir = await FS.getDir(await checksDir(id), 'text-cache', true);
    // Drop older cache entries for the same file.
    for (const e of await FS.list(dir)) {
      if (e.kind === 'file' && e.name.startsWith(FS.safeName(`${fileName}--`)) && e.name !== cacheKey(fileName, size, modified)) await FS.remove(dir, e.name);
    }
    await FS.writeJSON(dir, cacheKey(fileName, size, modified), data);
  }

  /* ---------- drafts (cases/<id>/drafts/<slug>.md) ---------- */
  // Created on first use, so vaults from older versions open unchanged.

  async function draftsDir(id) {
    return (await FS.getDir(await caseDir(id), 'drafts', !isArchived(id))) || emptyDir;
  }

  // Newest first: [{ slug, title, type, ai, created, updated, size }]
  async function listDrafts(id) {
    const dir = await draftsDir(id);
    const out = [];
    for (const e of await FS.list(dir)) {
      if (e.kind !== 'file' || !/\.md$/i.test(e.name)) continue;
      const slug = e.name.replace(/\.md$/i, '');
      const f = await e.handle.getFile();
      const { meta } = CVDraft.parseDraft(await f.text());
      out.push({ slug, title: meta.title || slug, type: meta.type || 'other', ai: !!meta.ai, fromFields: !!meta.fromFields, fromLinkChart: !!meta.fromLinkChart, chartPath: meta.chartPath || '', created: meta.created || '', updated: meta.updated || new Date(f.lastModified).toISOString(), size: f.size });
    }
    return out.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  }

  async function readDraft(id, slug) {
    const text = await FS.readText(await draftsDir(id), `${slug}.md`);
    if (text == null) return null;
    const { meta, body } = CVDraft.parseDraft(text);
    return { slug, meta: { title: slug, type: 'other', ...meta }, body };
  }

  async function newDraftSlug(id, title) {
    const dir = await draftsDir(id);
    const base = CVDraft.slugify(title);
    for (let n = 1; ; n++) {
      const slug = n === 1 ? base : `${base}-${n}`;
      if (!(await FS.exists(dir, `${slug}.md`))) return slug;
    }
  }

  /* v1.153: earlier versions of a report: drafts/.versions/<slug>/<time>.md, the last 10, at most
   * one every 10 minutes while it is being edited (and always one when it is deleted). */
  const VERSIONS = '.versions';
  const VERSION_KEEP = 10;
  const VERSION_EVERY_MS = 10 * 60 * 1000;
  const versionStamp = () => new Date().toISOString().replace(/[:.]/g, '-');
  const stampTime = (name) => { const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/.exec(name); return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) : 0; };
  async function keepVersion(id, slug, text, force) {
    const vdir = await FS.getDir(await FS.getDir(await draftsDir(id), VERSIONS, true), slug, true);
    const names = (await FS.list(vdir)).filter((e) => e.kind === 'file' && /\.md$/.test(e.name)).map((e) => e.name).sort();
    const last = names[names.length - 1];
    if (!force && last && Date.now() - stampTime(last) < VERSION_EVERY_MS) return;
    if (last && (await FS.readText(vdir, last)) === text) return;
    await FS.writeText(vdir, `${versionStamp()}.md`, text);
    for (const old of names.slice(0, Math.max(0, names.length + 1 - VERSION_KEEP))) await FS.remove(vdir, old).catch(() => {});
  }
  /** Newest first: [{ name, at, size }] */
  async function listDraftVersions(id, slug) {
    const v = await FS.getDir(await draftsDir(id), VERSIONS);
    const vdir = v && (await FS.getDir(v, slug));
    if (!vdir) return [];
    const out = [];
    for (const e of await FS.list(vdir)) if (e.kind === 'file' && /\.md$/.test(e.name)) out.push({ name: e.name, at: new Date(stampTime(e.name)).toISOString(), size: (await e.handle.getFile()).size });
    return out.sort((a, b) => b.name.localeCompare(a.name));
  }
  async function readDraftVersion(id, slug, name) {
    const v = await FS.getDir(await draftsDir(id), VERSIONS);
    const vdir = v && (await FS.getDir(v, slug));
    const text = vdir && (await FS.readText(vdir, name));
    if (text == null) return null;
    const { meta, body } = CVDraft.parseDraft(text);
    return { meta: { title: slug, type: 'other', ...meta }, body };
  }
  /** Put a version back (the current text is kept as a version first). */
  async function restoreDraftVersion(id, slug, name) {
    const v = await readDraftVersion(id, slug, name);
    if (!v) throw Object.assign(new Error('That version is no longer there.'), { name: 'NotFoundError' });
    const cur = await FS.readText(await draftsDir(id), `${slug}.md`);
    if (cur != null) await keepVersion(id, slug, cur, true);
    return saveDraft(id, slug, v.meta, v.body, { noVersion: true });
  }

  function saveDraft(id, slug, meta, body, opts = {}) {
    return serial(`draft:${id}:${slug}`, async () => {
      assertWritable(id);
      const m = { ...meta, updated: nowISO() };
      if (!m.created) m.created = m.updated;
      if (!opts.noVersion) {
        const before = await FS.readText(await draftsDir(id), `${slug}.md`).catch(() => null);
        if (before != null) await keepVersion(id, slug, before, false).catch(() => {});
      }
      await FS.writeText(await draftsDir(id), `${slug}.md`, CVDraft.serializeDraft(m, body));
      await touchIndex(id);
      return m;
    });
  }

  async function deleteDraft(id, slug) {
    assertWritable(id);
    // v1.153: kept as a version first, so Undo (and Versions) can bring it back.
    const text = await FS.readText(await draftsDir(id), `${slug}.md`).catch(() => null);
    if (text != null) await keepVersion(id, slug, text, true).catch(() => {});
    await FS.remove(await draftsDir(id), `${slug}.md`);
    await touchIndex(id);
  }
  /** v1.153: Undo of Delete: the report back as it was. */
  async function undeleteDraft(id, slug) {
    const [last] = await listDraftVersions(id, slug);
    if (!last) throw Object.assign(new Error('That report can no longer be brought back.'), { name: 'NotFoundError' });
    const v = await readDraftVersion(id, slug, last.name);
    return saveDraft(id, slug, v.meta, v.body, { noVersion: true });
  }

  /* ---------- templates (CaseVault-Data/templates/*.md) ---------- */

  async function templatesDir() {
    return FS.getDir(root, 'templates', true);
  }

  // v1.28: the retired generic templates leave the SSD, unless you changed one (it no longer
  // carries the "Generic example" line).
  let retiredChecked = false;
  async function removeRetiredTemplates(dir) {
    if (retiredChecked) return;
    retiredChecked = true;
    for (const file of CVDraft.RETIRED_TEMPLATES || []) {
      try {
        if (!(await FS.exists(dir, file))) continue;
        if (/Generic example, not a legal form/.test(await FS.readText(dir, file))) await FS.remove(dir, file);
      } catch { /* left as it is */ }
    }
  }

  /** v1.48, once per vault: only the DEA 6 sample stays under Templates. The others are moved (not
   * deleted) to templates\removed-v1.48, where they can be taken back from. */
  async function trimTemplates(dir) {
    if (!vault || vault.settings.templatesTrimmed) return;
    const moved = [];
    for (const e of await FS.list(dir)) {
      if (e.kind !== 'file' || !/\.md$/i.test(e.name)) continue;
      const text = await FS.readText(dir, e.name);
      if (CVDraft.docTypeOf(`${e.name} ${CVDraft.templateTitle(text, e.name)}`) === 'dea6') continue;
      const keep = await FS.getDir(dir, 'removed-v1.48', true);
      await FS.writeText(keep, await FS.uniqueName(keep, e.name), text);
      await FS.remove(dir, e.name);
      moved.push(e.name);
    }
    vault.settings.templatesTrimmed = true;
    await saveVault();
    return moved;
  }

  async function listTemplates() {
    const dir = await templatesDir();
    await removeRetiredTemplates(dir);
    await trimTemplates(dir).catch((err) => { if (FS.isDisconnectError(err)) throw err; console.warn('Could not tidy the templates', err); });
    const out = [];
    for (const e of await FS.list(dir)) {
      if (e.kind !== 'file' || !/\.md$/i.test(e.name)) continue;
      const text = await (await e.handle.getFile()).text();
      out.push({ file: e.name, title: CVDraft.templateTitle(text, e.name) });
    }
    return out.sort((a, b) => a.title.localeCompare(b.title));
  }

  async function readTemplate(file) {
    return FS.readText(await templatesDir(), file);
  }

  function saveTemplate(file, text) {
    return serial(`template:${file}`, async () => FS.writeText(await templatesDir(), FS.safeName(file), text));
  }

  async function deleteTemplate(file) {
    await FS.remove(await templatesDir(), file);
  }

  // Copies the generic starter templates in; never overwrites a file the user already has.
  async function addStarterTemplates() {
    const dir = await templatesDir();
    const added = [];
    for (const [file, text] of Object.entries(CVDraft.STARTER_TEMPLATES)) {
      if (await FS.exists(dir, file)) continue;
      await FS.writeText(dir, file, text);
      added.push(file);
    }
    return added;
  }

  /* ---------- Library (CaseVault-Data/library/<category>/...) ---------- */
  // Sample reports, warrants and directives the AI learns from (js/library.js). Paths are relative
  // to library/, e.g. "Report examples/DEA-6 sample.pdf". library.json keeps each file's settings
  // (category, document type, "always use"); .cache/ keeps the text read from each file.

  const libParts = (path) => {
    const parts = String(path || '').split(/[\\/]/).filter(Boolean);
    if (!parts.length || parts.some((p) => p === '.' || p === '..' || p.startsWith('.'))) throw new Error(`Not a library path: ${path}`);
    return parts;
  };

  async function libraryDir(parts = [], create = false) {
    let dir = await FS.getDir(root, 'library', create);
    for (const p of parts) { if (!dir) return null; dir = await FS.getDir(dir, p, create); }
    return dir;
  }

  /** Every file in the library's category folders: [{ path, folder, name, size, modified }]. */
  async function listLibrary() {
    const base = await libraryDir([], false);
    if (!base) return [];
    const out = [];
    for (const d of await FS.list(base)) {
      if (d.kind !== 'directory' || d.name.startsWith('.')) continue;
      for (const e of await FS.list(d.handle)) {
        if (e.kind !== 'file' || e.name.startsWith('.')) continue;
        const f = e.handle.meta ? { size: e.handle.meta.size, lastModified: e.handle.meta.mtime } : await e.handle.getFile();
        out.push({ path: `${d.name}/${e.name}`, folder: d.name, name: e.name, size: f.size, modified: f.lastModified });
      }
    }
    return out.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
  }

  async function readLibraryFile(path) {
    const parts = libParts(path);
    const dir = await libraryDir(parts.slice(0, -1), false);
    return dir ? FS.getFile(dir, parts[parts.length - 1]) : null;
  }

  /** Save a file into a library folder under a free name; returns its path. */
  function saveLibraryFile(folder, name, data) {
    return serial(`library:${folder}`, async () => {
      const dir = await libraryDir(libParts(folder), true);
      const free = await FS.uniqueName(dir, FS.safeName(name));
      await FS.writeData(dir, free, data);
      return `${folder}/${free}`;
    });
  }

  async function deleteLibraryFile(path) {
    const parts = libParts(path);
    const dir = await libraryDir(parts.slice(0, -1), false);
    if (dir) await FS.remove(dir, parts[parts.length - 1]);
  }

  async function moveLibraryFile(path, toFolder) {
    const file = await readLibraryFile(path);
    if (!file) throw Object.assign(new Error('That library file is gone.'), { name: 'NotFoundError' });
    const to = await saveLibraryFile(toFolder, libParts(path).pop(), file);
    await deleteLibraryFile(path);
    return to;
  }

  async function readLibraryMeta() {
    const dir = await libraryDir([], false);
    const meta = dir ? await FS.readJSON(dir, 'library.json').catch(() => null) : null;
    return meta && typeof meta === 'object' && meta.items ? meta : { schema: 1, items: {} };
  }

  function writeLibraryMeta(meta) {
    return serial('library-meta', async () => FS.writeJSON(await libraryDir([], true), 'library.json', meta));
  }

  async function readLibraryText(path, size, modified) {
    const dir = await libraryDir(['.cache'], false);
    if (!dir) return null;
    try { const c = await FS.readJSON(dir, cacheKey(path.replace(/\//g, '__'), size, modified)); return c && typeof c.text === 'string' ? c.text : null; } catch (err) {
      if (FS.isDisconnectError(err)) throw err;
      return null;
    }
  }

  async function writeLibraryText(path, size, modified, text) {
    const dir = await libraryDir(['.cache'], true);
    await FS.writeJSON(dir, cacheKey(path.replace(/\//g, '__'), size, modified), { path, size, modified, text });
  }

  /* ---------- settings ---------- */

  /* v1.85: the letterhead's logo (CaseVault-Data\\branding\\logo.jpg). Its header text is in settings. */
  const BRANDING = 'branding';
  const LOGO = 'logo.jpg';
  async function readLetterheadLogo() {
    if (!root) return null;
    const dir = await FS.getDir(root, BRANDING);
    if (!dir) return null;
    return FS.getFile(dir, LOGO);
  }
  function saveLetterheadLogo(data) {
    return serial('branding', async () => { await FS.writeData(await FS.getDir(root, BRANDING, true), LOGO, data); });
  }
  function deleteLetterheadLogo() {
    return serial('branding', async () => { const dir = await FS.getDir(root, BRANDING); if (dir && (await FS.exists(dir, LOGO))) await FS.remove(dir, LOGO); });
  }

  function updateSettings(patch) {
    Object.assign(vault.settings, patch);
    return saveVault();
  }

  return {
    APP_VERSION, DATA_DIR, STATUSES,
    get root() { return root; },
    get data() { return vault; },
    get lastCleanup() { return lastCleanup; },
    newId, localDay, logActivity,
    resolve, create, load, close, ping,
    backupNow, listBackups, rebuildIndex, updateSettings, fullBackup, recordManualBackup, recordHelperBackup, backupHistoryWith, restoreBackup, readLetterheadLogo, saveLetterheadLogo, deleteLetterheadLogo,
    createCase, getCase, saveCase, deleteCase, restoreCaseFromBackup, caseFolderFiles, findSameFiles, checkVault, listExportFolders, saveExport, readExport, listDeleted, restoreDeleted, purgeDeleted, BIN_DAYS,
    listOperations, getOperation, operationOf, operationMembers, caseNumberTaken, createOperation, updateOperation, deleteOperation, assignCase, unlinkCase,
    archiveCase, restoreCase, isArchived, setArchiveFolder, ARCHIVE_FOLDERS, archiveFolderName, setSuspectGroup, suspectGroups,
    OP_FOLDERS, OTHER_FOLDERS, readOpVehicles, saveOpVehicles, readOpList, saveOpList, otherCustomFolders, addOtherFolder, removeOtherFolder, listShared, readSharedThumb, saveSharedThumb, addShared, readShared, deleteShared, readTraining, saveTraining, trainingRows, deleteConfirmText, deleteConfirmMatches, MOVE_MARKER,
    lockerHeader, lockerRead, lockerWrite, lockerRemove,
    getNotes, saveNotes, listChats, readChat, saveChat, deleteChat,
    getTimeline, saveTimeline, sortEvents,
    listFiles, addFile, readFile, deleteFile, trashFile, untrashFile, emptyFileTrash, moveFile, ensureFolders, renameCaseFolder, conventionalId, RENAME_MARKER,
    readCaseJSON, writeCaseJSON, saveDiscoveryFile, readDiscoveryFile, appendLog, readLogs, logFiles, deleteLogs,
    listChecks, newCheckName, readCheck, saveCheck, deleteCheck, readTextCache, writeTextCache,
    listDrafts, readDraft, newDraftSlug, saveDraft, deleteDraft, undeleteDraft, listDraftVersions, readDraftVersion, restoreDraftVersion,
    listTemplates, readTemplate, saveTemplate, deleteTemplate, addStarterTemplates, purgeAll,
    listLibrary, readLibraryFile, saveLibraryFile, deleteLibraryFile, moveLibraryFile, readLibraryMeta, writeLibraryMeta, readLibraryText, writeLibraryText,
  };
})();
