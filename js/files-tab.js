/* CaseVault — the Files tab: folders, files, arranging, moving and previewing them.
 * Moved out of app.js in v1.98 (same code): app.js hands over the shared helpers with init(kit). */
'use strict';

(function (root) {
  function init(kit) {
    const { state, h, I, toast, Save, showCase, FOLDER_ICONS, onDriveLost, confirmDialog, fmtDate,
      fileTypeLabel, fileKind, FILE_ICONS, fmtSize, fmtDateTime, fmtTime, openDialog, field } = kit;

    /* ---------- Files ---------- */

    const PREVIEWABLE = {
      pdf: 'pdf', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', bmp: 'image', svg: 'image-svg',
      txt: 'text', md: 'text', json: 'text', log: 'text', xml: 'text', docx: 'docx', docm: 'docx',
      csv: 'sheet', tsv: 'sheet', xlsx: 'sheet', xlsm: 'sheet', xls: 'sheet', ods: 'sheet',
      mp3: 'audio', wav: 'audio', m4a: 'audio', ogg: 'audio', mp4: 'video', webm: 'video', mov: 'video',
    };
    const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };
    const extOf = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');

    // Folders whose sub-folders are showing (Recordings → Video, Audio), for this window.
    const openFolders = new Set();

    // Files tab: the case's document folders on the left, the chosen folder's files on the right.
    // sub (from the address) is the folder being shown; '' = all folders.
    async function renderFiles(panel, c, token, sub) {
      const archived = Vault.isArchived(c.id);
      if (!archived) await Vault.ensureFolders(c.id).catch((err) => { if (FS.isDisconnectError(err)) throw err; });
      const files = await Vault.listFiles(c.id);
      if (token !== state.renderToken) return;
      const CF = CVCaseFiles;
      try { sub = sub ? decodeURIComponent(sub) : sub; } catch { /* keep as is */ }
      // 'photos' (v1.29): every picture in the case, whatever folder it's in.
      const current = CF.isCategory(sub) ? sub : (sub === 'unsorted' || sub === 'photos' ? sub : '');
      const isPhoto = (f) => /\.(jpe?g|png|gif|webp|bmp|heic|heif|tiff?)$/i.test(f.name || '');
      const special = current === 'unsorted' || current === 'photos';
      const inFolder = (f) => (current === 'unsorted' ? !f.folder : current === 'photos' ? isPhoto(f) : !current || f.folder === current);
      const shown = files.filter(inFolder);
      const count = (folder) => files.filter((f) => f.folder === folder).length;
      const unsorted = files.filter((f) => !f.folder);
      const prefix = CF.casePrefix(c);

      const input = h('input', { type: 'file', multiple: true, hidden: true });
      input.addEventListener('change', () => { addFiles([...input.files]); input.value = ''; });
      const target = current && !special ? current : '';
      const dropTip = target
        ? `Saved as "${CF.fileName(c, target, 'x.pdf').replace(/\.pdf$/, '')}…" in ${CVFormat.pathText(`files\\${target}`)}. The originals are not changed.`
        : 'You pick the document type for each file next. They are copied to the SSD and named by the case number; the originals are not changed.';
      const drop = h('div', { class: 'dropzone', tabindex: '0', role: 'button', 'aria-label': 'Add files', title: dropTip },
        I('upload', { cls: 'drop-icon' }),
        h('strong', {}, target ? `Drop files into ${target.replace('/', ' › ')}` : 'Drop files here'), ' or ', h('span', { class: 'link' }, 'Choose Files'));
      drop.addEventListener('click', () => input.click());
      drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', (e) => {
        e.preventDefault();
        drop.classList.remove('over');
        addFiles([...e.dataTransfer.files]);
      });

      async function addFiles(list) {
        if (!list.length) return;
        // v1.156: a file already in the case (the same content, whatever its name) is pointed out first.
        let dups = [];
        try { dups = (await Vault.findSameFiles(c.id, list)).filter((x) => x.same); } catch (err) { if (FS.isDisconnectError(err)) return onDriveLost(); }
        if (dups.length) {
          const addAnyway = await confirmDialog({ title: dups.length === 1 ? 'This File Is Already in the Case' : `${dups.length} Files Are Already in the Case`, confirmText: 'Add Anyway', cancelText: 'Skip Duplicates',
            message: h('div', { class: 'dup-files' }, h('p', {}, 'Same content as a file this case already has:'),
              h('ul', {}, dups.map((x) => h('li', {}, h('strong', {}, x.file.name), ' is the same as ', CVFormat.pathText(`files\\${x.same.replace(/\//g, '\\')}`))))) });
          if (!addAnyway) list = list.filter((f) => !dups.some((x) => x.file === f));
          if (!list.length) return;
        }
        const plan = await chooseTypes(c, list, target);
        if (!plan) return;
        const note = toast(`Copying ${list.length} file${list.length === 1 ? '' : 's'} to SSD…`, 'info', 600000);
        const saved = [];
        for (const { file, folder, description } of plan) {
          try {
            saved.push(await Save.track(`file:${c.id}:${file.name}`, () => Vault.addFile(c.id, file, { folder, description })));
          } catch { break; }
        }
        note.remove();
        if (saved.length) toast(saved.length === 1 ? `Saved as ${CF.splitPath(saved[0]).base}` : `Saved ${saved.length} files to the SSD.`, 'success', 6000);
        if (state.caseId === c.id && state.tab === 'files') showCase(c.id, 'files', current || null);
      }

      // ---- folder list: your order (drag a folder to move it; Alt+↑/↓ with the keyboard), with
      // sub-folders under their parent. Legacy folders only show when they hold files.
      const settings = Vault.data.settings;
      const topFolders = CF.ALL_FOLDERS.filter((f) => !CF.parentOf(f));
      const saved = Array.isArray(settings.folderOrder) ? settings.folderOrder.filter((f) => topFolders.includes(f)) : [];
      const ordered = [...saved, ...topFolders.filter((f) => !saved.includes(f))];
      const visible = (f) => !(CF.byFolder(f) || {}).legacy || count(f) + CF.childrenOf(f).reduce((n, k) => n + count(k), 0) > 0;
      const saveFolderOrder = (order) => Save.track('settings', () => Vault.updateSettings({ folderOrder: order })).catch(() => {});

      const folderBtn = (key, label, n, { child = false, top = null } = {}) => {
        const a = h('a', {
          href: `#/case/${CVRoute.enc(c.id)}/files${key ? `/${CVRoute.enc(key)}` : ''}`,
          // v1.151: a folder with nothing in it is greyed, so the ones that hold files stand out.
          class: `folder-item ${current === key ? 'active' : ''} ${child ? 'child' : ''}${key && !n ? ' empty' : ''}`, 'data-ro-ok': 'true', 'aria-current': current === key ? 'page' : null,
          title: top ? `${label}. Drag to reorder the folders (or Alt+↑/↓). Drop a file here to move it into this folder.` : null,
          draggable: top && !archived ? 'true' : null,
        }, h('span', { class: 'folder-name' }, label), h('span', { class: 'folder-count muted' }, n ? String(n) : ''), h('span', { class: 'folder-icon' }, I(FOLDER_ICONS[key] || 'folder')));
        // Drop a file onto a folder to move it there.
        if (key && key !== 'unsorted' && key !== 'photos' && !archived) {
          a.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('application/x-casevault-file') || e.dataTransfer.types.includes('application/x-casevault-folder')) { e.preventDefault(); a.classList.add('drop-target'); } });
          a.addEventListener('dragleave', () => a.classList.remove('drop-target'));
          a.addEventListener('drop', async (e) => {
            a.classList.remove('drop-target');
            const file = e.dataTransfer.getData('application/x-casevault-file');
            const folder = e.dataTransfer.getData('application/x-casevault-folder');
            e.preventDefault();
            if (file) {
              const f = files.find((x) => x.name === file);
              if (!f || f.folder === key) return;
              try {
                const to = await Save.track(`file-move:${c.id}:${f.name}`, () => Vault.moveFile(c.id, f.name, key, {}));
                showCase(c.id, 'files', current || null);
                CVKit.undoToast(toast, h, `Moved to ${key.replace('/', ' › ')}: ${CF.splitPath(to).base}.`, async () => {
                  await Save.track(`file-move:${c.id}:${to}`, () => Vault.moveFile(c.id, to, f.folder, { name: f.base }));
                  if (state.caseId === c.id && state.tab === 'files') showCase(c.id, 'files', current || null);
                });
              } catch { /* reported by Save */ }
            } else if (folder && top && folder !== top) {
              const order = ordered.filter((x) => x !== folder);
              order.splice(order.indexOf(top), 0, folder);
              await saveFolderOrder(order);
              showCase(c.id, 'files', current || null);
            }
          });
        }
        if (top && !archived) {
          a.addEventListener('dragstart', (e) => { e.dataTransfer.setData('application/x-casevault-folder', top); e.dataTransfer.effectAllowed = 'move'; });
          a.addEventListener('keydown', async (e) => {
            if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
            e.preventDefault();
            const order = [...ordered];
            const i = order.indexOf(top);
            const j = e.key === 'ArrowUp' ? i - 1 : i + 1;
            if (j < 0 || j >= order.length) return;
            [order[i], order[j]] = [order[j], order[i]];
            await saveFolderOrder(order);
            await showCase(c.id, 'files', current || null);
            const again = [...document.querySelectorAll('.folder-nav .folder-item')].find((x) => x.dataset.top === top);
            if (again) again.focus();
          });
          a.dataset.top = top;
        }
        return a;
      };

      const nav = h('nav', { class: 'folder-nav', 'aria-label': 'Document folders' },
        folderBtn('', 'All Documents', files.length),
        folderBtn('photos', 'Photos', files.filter(isPhoto).length),
        ordered.filter(visible).map((f) => {
          const kids = CF.childrenOf(f);
          const btn = folderBtn(f, f, count(f) + kids.reduce((n, k) => n + count(k), 0), { top: f });
          if (!kids.length) return btn;
          // Sub-folders (Recordings: Video, Audio) fold away until you click the folder or its arrow.
          if (current === f || kids.includes(current)) openFolders.add(f);
          const open = openFolders.has(f);
          const box = h('div', { class: 'folder-children', hidden: !open }, kids.map((k) => folderBtn(k, CF.shortName(k), count(k), { child: true })));
          const toggle = h('button', { class: 'folder-toggle', type: 'button', 'data-ro-ok': 'true', 'aria-expanded': String(open), title: open ? `Hide ${kids.map(CF.shortName).join(' and ')}` : `Show ${kids.map(CF.shortName).join(' and ')}` },
            I(open ? 'chevron-down' : 'chevron-right'), h('span', { class: 'sr-only' }, `${f}: sub-folders`));
          toggle.addEventListener('click', (e) => {
            e.preventDefault();
            const now = box.hidden;
            box.hidden = !now;
            if (now) openFolders.add(f); else openFolders.delete(f);
            toggle.setAttribute('aria-expanded', String(now));
            toggle.replaceChildren(I(now ? 'chevron-down' : 'chevron-right'), h('span', { class: 'sr-only' }, `${f}: sub-folders`));
          });
          btn.classList.add('has-children');
          return h('div', { class: 'folder-parent' }, h('div', { class: 'folder-parent-row' }, btn, toggle), box);
        }),
        unsorted.length ? folderBtn('unsorted', 'Unsorted', unsorted.length) : null,
        // v1.76: "Arrange", boxed like the Discovery button.
        archived ? null : h('button', { class: 'btn small folder-reset folder-arrange', type: 'button', icon: 'list-ol', title: 'Put the folders in your own order, with up and down buttons. You can also drag a folder in this list.', onclick: async () => {
          const order = await arrangeFoldersDialog(ordered.filter(visible));
          if (!order) return;
          await saveFolderOrder(order);
          showCase(c.id, 'files', current || null);
        } }, 'Arrange'),
        // v1.49: a password-protected, view-and-print-only package of chosen files, for discovery.
        archived ? null : h('button', { class: 'btn small folder-reset disc-open', type: 'button', icon: 'shield-lock-fill', title: 'Make a password-protected discovery package of chosen files, with Bates numbers, for a USB drive or a DVD.', onclick: () => CVLazy.discovery().then((D) => D.open(c)).catch((err) => { if (FS.isDisconnectError(err)) onDriveLost(); else toast(`Could not open Discovery: ${err.message}`, 'error'); }) }, 'Discovery'));

      // A folder from an older version (Warrants Signed…): offer to move its files into the folder
      // that replaced it.
      const legacy = CF.byFolder(current);
      const mergeNote = legacy && legacy.mergeInto && shown.length && !archived
        ? h('p', { class: 'hint merge-hint' }, `${current} is no longer used; ${legacy.mergeInto} replaces it. `,
          h('button', { class: 'btn small', type: 'button', icon: 'arrow-left-right', onclick: async () => {
            if (!(await confirmDialog({ title: `Move ${shown.length} file${shown.length === 1 ? '' : 's'} to ${legacy.mergeInto}?`, message: legacy.keepName ? 'The files keep their names.' : `Each file is renamed by the convention for ${legacy.mergeInto}.`, confirmText: 'Move' }))) return;
            let moved = 0;
            for (const f of shown) {
              try { await Save.track(`file-move:${c.id}:${f.name}`, () => Vault.moveFile(c.id, f.name, legacy.mergeInto, { keepName: !!legacy.keepName })); moved++; } catch { break; }
            }
            if (moved) toast(`Moved ${moved} file${moved === 1 ? '' : 's'} to ${legacy.mergeInto}.`, 'success', 5000);
            location.hash = `#/case/${CVRoute.enc(c.id)}/files/${CVRoute.enc(legacy.mergeInto)}`;
          } }, `Move them to ${legacy.mergeInto}`))
        : null;

      // ---- file table: Name, Type, Size, Added. Click a heading to sort; "Custom" is your own
      // order (drag the rows), kept per folder in the case's file-order.json.
      const sortPref = settings.filesSort && typeof settings.filesSort === 'object' ? settings.filesSort : { key: 'custom', dir: 1 };
      const inOneFolder = current && !special;
      let fileOrder = {};
      try { fileOrder = (await Vault.readCaseJSON(c.id, 'file-order.json')) || {}; } catch (err) { if (FS.isDisconnectError(err)) throw err; }
      if (token !== state.renderToken) return;
      const custom = (fileOrder[current || ''] || []);
      const byCustom = (a, b) => {
        const ia = custom.indexOf(a.base); const ib = custom.indexOf(b.base);
        return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
      };
      // The Document column: what the file is (its folder's document type), e.g. "Arrest Report".
      const docLabel = (f) => (f.folder ? (CF.byFolder(f.folder) || {}).label || f.folder : 'Unsorted');
      // v1.27: Name "2024-JH123456 | Arrest Report" (no extension), File ".docx", Added "09.30 08.57".
      const extOf = (base) => ((/(\.[a-z0-9]{1,6})$/i.exec(base) || [])[1] || '').toLowerCase();
      // v1.70: an Additional Exhibit's photos show as "Exhibit 1a" here (the file keeps its name).
      // v1.76: "2026-EX-100 | Purchase": the document type is left out (the Document column shows it),
      // unless it is all the name has.
      const nameOf = (base, f) => {
        const stem = base.slice(0, base.length - extOf(base).length).replace(/\bAdditional (?=Exhibit\b)/g, '');
        if (prefix && stem.toLowerCase().startsWith(prefix.toLowerCase()) && stem.length > prefix.length) {
          let rest = stem.slice(prefix.length).replace(/^[\s_-]+/, '');
          const label = f && f.folder ? docLabel(f) : '';
          // v1.79: only "Type - Description" loses its type ("Exhibit 3b" stays "Exhibit 3b").
          const m = label ? new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+-\\s+(.+)$`, 'i').exec(rest) : null;
          if (m && !/^\(\d+\)$/.test(m[1])) rest = m[1];
          return rest ? `${stem.slice(0, prefix.length)} | ${rest}` : stem;
        }
        return stem || base;
      };
      const addedText = (ms) => (ms ? fmtDate(Vault.localDay(new Date(ms))) : '—');
      const cmp = {
        custom: (a, b) => byCustom(a, b), // v1.79: every view has its own order, All documents too
        name: (a, b) => a.base.localeCompare(b.base, undefined, { numeric: true }),
        type: (a, b) => docLabel(a).localeCompare(docLabel(b)) || a.base.localeCompare(b.base),
        ext: (a, b) => extOf(a.base).localeCompare(extOf(b.base)) || a.base.localeCompare(b.base),
        size: (a, b) => (a.size || 0) - (b.size || 0),
        added: (a, b) => (a.modified || 0) - (b.modified || 0),
      };
      const rows = [...shown].sort((a, b) => (cmp[sortPref.key] || cmp.custom)(a, b) * (sortPref.key === 'custom' ? 1 : sortPref.dir));
      const setSort = (key) => {
        const next = { key, dir: sortPref.key === key && key !== 'custom' ? -sortPref.dir : 1 };
        Save.track('settings', () => Vault.updateSettings({ filesSort: next })).catch(() => {});
        showCase(c.id, 'files', current || null);
      };
      const th = (key, label, cls = '') => h('th', { class: `${cls} sortable ${sortPref.key === key ? 'sorted' : ''}`, 'aria-sort': sortPref.key === key ? (sortPref.dir > 0 ? 'ascending' : 'descending') : null },
        h('button', { type: 'button', class: 'th-btn', 'data-ro-ok': 'true', title: `Sort by ${label.toLowerCase()}`, onclick: () => setSort(key) },
          label, sortPref.key === key ? I(sortPref.dir > 0 ? 'chevron-down' : 'chevron-up', { cls: 'sort-icon' }) : null));
      const dragRows = sortPref.key === 'custom' && !archived;
      const saveCustom = async (list) => {
        fileOrder[current || ''] = list;
        await Save.track(`file-order:${c.id}`, () => Vault.writeCaseJSON(c.id, 'file-order.json', fileOrder)).catch(() => {});
      };

      const table = shown.length
        ? h('div', { class: 'files-table-wrap' }, h('table', { class: `files${shown.some((f) => f.folder === 'Link Charts' && /\.pdf$/i.test(f.base)) ? ' has-lc' : ''}` },
          h('colgroup', {}, dragRows ? h('col', { class: 'col-grip' }) : null, h('col', { class: 'col-name' }), h('col', { class: 'col-type' }), h('col', { class: 'col-ext' }), h('col', { class: 'col-size' }), h('col', { class: 'col-added' }), h('col', { class: 'col-actions' })),
          h('thead', {}, h('tr', {},
            dragRows ? h('th', { class: 'grip-cell', title: 'Your own order: drag the rows' }, h('span', { class: 'sr-only' }, 'Order')) : null,
            th('name', 'Name'), th('type', 'Document'), th('ext', 'File', 'fext-head'), th('size', 'Size', 'num'), th('added', 'Updated', 'date-cell'),
            h('th', { class: 'actions-head' }, !archived
              ? h('button', { type: 'button', class: `th-btn small ${sortPref.key === 'custom' ? 'sorted' : ''}`, 'data-ro-ok': 'true', icon: 'list-check', title: 'Your own order for this folder: drag the rows to arrange them.', onclick: () => setSort('custom') }, 'Custom')
              : h('span', { class: 'sr-only' }, 'Actions')))),
          h('tbody', {}, rows.map((f) => {
            const tr = h('tr', { 'data-base': f.base, draggable: !archived ? 'true' : null },
              dragRows ? h('td', { class: 'grip-cell', title: 'Drag to reorder' }, I('grip-vertical')) : null,
              h('td', { class: 'fname' },
                h('span', { class: 'fname-text' },
                  h('button', { 'data-ro-ok': 'true', class: 'linkish fname-link', type: 'button', title: f.base, onclick: () => previewFile(c, f.name) }, ((nm) => { const i = nm.indexOf(' | '); return i < 0 ? nm : [h('span', { class: 'fn-pre' }, `${nm.slice(0, i)} |`), ` ${nm.slice(i + 3)}`]; })(nameOf(f.base, f))),
                  !inOneFolder ? h('span', { class: 'fname-folder muted small' }, (f.folder || 'Unsorted').replace('/', ' › ')) : null),
                f.folder && prefix && !CF.followsConvention(c, f.folder, f.base) ? h('span', { class: 'pill warn-pill', title: `Not named ${prefix}-<file name>` }, 'name') : null),
              // v1.79: the Document column shows the file's icon (its type in the hover box).
              h('td', { class: 'ftype fdoc-icon', title: `${docLabel(f)} · ${fileTypeLabel(f.base)}` }, h('span', { class: `file-icon ${fileKind(f.base)}` }, I(FILE_ICONS[fileKind(f.base)])), h('span', { class: 'sr-only' }, docLabel(f))),
              h('td', { class: 'fext muted', title: fileTypeLabel(f.base) }, extOf(f.base) || '—'),
              h('td', { class: 'num muted' }, fmtSize(f.size)),
              h('td', { class: 'muted fadded date-cell', title: `Last updated ${fmtDateTime(f.modified)}` }, h('span', { class: 'fadded-day' }, addedText(f.modified)), f.modified ? h('span', { class: 'fadded-time' }, fmtTime(f.modified)) : null),
              h('td', { class: 'actions' },
                // v1.56: a Link Chart PDF goes back to the Link Chart tab.
                f.folder === 'Link Charts' && /\.pdf$/i.test(f.base) ? h('button', { class: 'icon-btn', type: 'button', title: 'Open in Link Chart: send this chart back to the Link Chart tab to change it', onclick: async () => { if (await (await CVLazy.linkChart()).openFromFile(c, f.name)) showCase(c.id, 'linkchart'); } }, I('diagram-3-fill'), h('span', { class: 'sr-only' }, `Open ${f.base} in Link Chart`)) : null,
                h('button', { class: 'icon-btn', type: 'button', title: f.folder ? 'Rename or move to another folder' : 'File it in a folder', onclick: () => moveFileDialog(c, f, current) }, I('pencil-square'), h('span', { class: 'sr-only' }, `Rename or move ${f.base}`)),
                h('button', { class: 'icon-btn danger-icon', type: 'button', title: 'Delete from the SSD', onclick: async () => {
                  if (!(await confirmDialog({ title: 'Delete this file?', message: `"${f.base}" will be deleted from the SSD. Undo brings it back for a few seconds.`, confirmText: 'Delete', danger: true }))) return;
                  try {
                    // v1.153: set aside first, so Undo can bring it back; removed for good after that.
                    const token = await Save.track(`file-del:${c.id}:${f.name}`, () => Vault.trashFile(c.id, f.name));
                    showCase(c.id, 'files', current || null);
                    CVKit.undoToast(toast, h, `Deleted ${f.base}.`, async () => {
                      await Save.track(`file-undel:${c.id}:${f.name}`, () => Vault.untrashFile(c.id, token));
                      if (state.caseId === c.id && state.tab === 'files') showCase(c.id, 'files', current || null);
                    }, { onDone: () => Vault.emptyFileTrash(c.id) });
                  } catch { /* reported by Save */ }
                } }, I('trash3'), h('span', { class: 'sr-only' }, `Delete ${f.base}`))));
            if (!archived) {
              tr.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('application/x-casevault-file', f.name);
                e.dataTransfer.effectAllowed = 'move';
                tr.classList.add('dragging');
              });
              tr.addEventListener('dragend', () => tr.classList.remove('dragging'));
            }
            if (dragRows) {
              tr.addEventListener('dragover', (e) => {
                if (!e.dataTransfer.types.includes('application/x-casevault-file')) return;
                e.preventDefault();
                const r = tr.getBoundingClientRect();
                tr.classList.toggle('drop-before', e.clientY < r.top + r.height / 2);
                tr.classList.toggle('drop-after', e.clientY >= r.top + r.height / 2);
              });
              tr.addEventListener('dragleave', () => tr.classList.remove('drop-before', 'drop-after'));
              tr.addEventListener('drop', async (e) => {
                const name = e.dataTransfer.getData('application/x-casevault-file');
                const after = tr.classList.contains('drop-after');
                tr.classList.remove('drop-before', 'drop-after');
                const moving = rows.find((x) => x.name === name);
                if (!moving || moving === f) return;
                e.preventDefault();
                const list = rows.map((x) => x.base).filter((b) => b !== moving.base);
                list.splice(list.indexOf(f.base) + (after ? 1 : 0), 0, moving.base);
                await saveCustom(list);
                showCase(c.id, 'files', current || null);
              });
            }
            return tr;
          }))))
        : h('p', { class: 'muted' }, current ? (current === 'photos' ? 'No photos in this case yet.' : `No documents in ${current === 'unsorted' ? 'Unsorted' : current.replace('/', ' › ')} yet.`) : 'No files attached yet.');

      const where = CVFormat.pathText(`${archived ? 'archive' : 'cases'}\\${c.id}\\files${current && !special ? `\\${current}` : ''}`);
      panel.replaceChildren(...[
        prefix ? null : h('p', { class: 'hint' }, 'This case has no case number yet, so files are named ', h('code', {}, `${new Date().getFullYear()}-NOCASENO …`), '. Add the number on the Details tab first to have them named ', h('code', {}, '2026-<CaseNo> <Type>'), '.'),
        mergeNote,
        unsorted.length && !archived ? h('p', { class: 'hint' }, `${unsorted.length} file${unsorted.length === 1 ? ' was' : 's were'} added before document folders existed. Open "Unsorted" and use "File it…" to move each into its folder with a conventional name.`) : null,
        h('div', { class: 'files-layout' }, nav,
          h('div', { class: 'files-main' }, drop, input,
            h('div', { class: 'files-where-row' },
              // v1.118: the folder in words; where it is on the SSD in the hover box.
              h('p', { class: 'muted small files-where', title: `On the SSD: CaseVault-Data\\${where}` }, `${shown.length} file${shown.length === 1 ? '' : 's'} in ${!current ? 'All Documents' : current === 'photos' ? 'Photos' : current === 'unsorted' ? 'Unsorted' : current.replace('/', ' › ')}${dragRows && shown.length > 1 ? ' · drag rows to arrange them' : ''}${!archived && shown.length ? ' · drag a file onto a folder to move it' : ''}`),
              // v1.76: arrange the files of a folder (up and down buttons, or drag), like the folders.
              !archived && shown.length > 1 ? h('button', { class: 'btn small files-arrange', type: 'button', icon: 'list-ol', title: 'Put the files of this folder in your own order', onclick: async () => {
                const ordered = [...shown].sort(byCustom).map((f) => f.base);
                const byBase = new Map(shown.map((f) => [f.base, f]));
                const order = await arrangeFoldersDialog(ordered, {
                  title: 'Arrange files', note: `The order of the files in ${current ? (current === 'unsorted' ? 'Unsorted' : current === 'photos' ? 'Photos' : current.replace('/', ' › ')) : 'All documents'}. Drag a file or use the arrows.`,
                  label: (b) => nameOf(b, byBase.get(b)), icon: (b) => I(FILE_ICONS[fileKind(b)]),
                  standard: () => [...ordered].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), standardLabel: 'By name', standardTitle: 'Put the files back in name order.',
                });
                if (!order) return;
                await saveCustom(order);
                if (sortPref.key !== 'custom') await Save.track('settings', () => Vault.updateSettings({ filesSort: { key: 'custom', dir: 1 } })).catch(() => {});
                showCase(c.id, 'files', current || null);
              } }, 'Arrange') : null),
            table))].filter(Boolean));
    }

    // The folder list in your own order: ↑/↓ buttons (or drag a row). Resolves the new order, or null.
    // v1.76: the same dialog arranges the files of one folder (opts: title, note, label, icon, standard).
    function arrangeFoldersDialog(folders, opts = {}) {
      const order = [...folders];
      const labelOf = opts.label || ((f) => f);
      const iconOf = opts.icon || ((f) => I(FOLDER_ICONS[f] || 'folder'));
      return openDialog((close) => {
        const list = h('ol', { class: 'arrange-list' });
        let dragging = null;
        const move = (i, j) => { if (j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; draw(order[j]); };
        function draw(focusName) {
          list.replaceChildren(...order.map((f, i) => {
            const li = h('li', { class: 'arrange-item', draggable: 'true' },
              h('span', { class: 'grip-cell', 'aria-hidden': 'true' }, I('grip-vertical')),
              h('span', { class: 'folder-icon' }, iconOf(f)),
              h('span', { class: 'arrange-name' }, labelOf(f)),
              h('button', { class: 'icon-btn', type: 'button', title: 'Move up', disabled: i === 0, 'data-dir': 'up', onclick: () => move(i, i - 1) }, I('arrow-up'), h('span', { class: 'sr-only' }, `Move ${labelOf(f)} up`)),
              h('button', { class: 'icon-btn', type: 'button', title: 'Move down', disabled: i === order.length - 1, 'data-dir': 'down', onclick: () => move(i, i + 1) }, I('arrow-down'), h('span', { class: 'sr-only' }, `Move ${labelOf(f)} down`)));
            li.addEventListener('dragstart', (e) => { dragging = f; e.dataTransfer.setData('text/plain', f); e.dataTransfer.effectAllowed = 'move'; li.classList.add('dragging'); });
            li.addEventListener('dragend', () => { dragging = null; li.classList.remove('dragging'); });
            li.addEventListener('dragover', (e) => { if (dragging && dragging !== f) { e.preventDefault(); li.classList.add('drop-target'); } });
            li.addEventListener('dragleave', () => li.classList.remove('drop-target'));
            li.addEventListener('drop', (e) => {
              e.preventDefault();
              li.classList.remove('drop-target');
              if (!dragging || dragging === f) return;
              const moving = dragging;
              const from = order.indexOf(moving);
              order.splice(from, 1);
              // Dragged down: lands after this folder; dragged up: before it.
              order.splice(order.indexOf(f) + (from < i ? 1 : 0), 0, moving);
              draw(moving);
            });
            return li;
          }));
          if (focusName) {
            const li = list.children[order.indexOf(focusName)];
            const btn = li && (li.querySelector('button:not([disabled])'));
            if (btn) btn.focus();
          }
        }
        draw();
        return h('form', { class: 'arrange-form', onsubmit: (e) => { e.preventDefault(); close([...order]); } },
          h('h2', { icon: 'list-ol' }, opts.title || 'Arrange folders'),
          h('p', { class: 'muted small explain' }, opts.note || 'The order is the same for every case. Sub-folders such as Video and Audio stay under their folder.'),
          list,
          h('div', { class: 'dialog-actions' },
            h('button', { class: 'btn ghost', type: 'button', icon: 'arrow-counterclockwise', title: opts.standardTitle || 'Put the folders back in the standard order.', onclick: () => close(opts.standard ? opts.standard() : CVCaseFiles.ALL_FOLDERS.filter((f) => !CVCaseFiles.parentOf(f))) }, opts.standardLabel || 'Standard order'),
            h('div', { class: 'spacer' }),
            h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
            h('button', { class: 'btn primary', type: 'submit' }, 'Save order')));
      });
    }

    function chooseTypes(c, list, preset) {
      const CF = CVCaseFiles;
      return openDialog((close) => {
        const rows = list.map((file) => {
          const folder = h('select', { 'aria-label': `Document type for ${file.name}` },
            CF.FOLDERS.map((f) => h('option', { value: f, selected: f === (preset || CF.guessFolder(file.name)) }, f.replace('/', ' › '))));
          const desc = h('input', { type: 'text', maxlength: 80, 'aria-label': `File name for ${file.name}` }); // v1.76: no placeholder (it was cut off)
          const result = h('code', { class: 'small' });
          const show = () => { result.textContent = CF.fileName(c, folder.value, file.name, desc.value); };
          folder.addEventListener('change', show);
          desc.addEventListener('input', show);
          show();
          return { file, folder, desc, el: h('tr', {}, h('td', { class: 'small' }, file.name), h('td', {}, folder), h('td', {}, desc), h('td', {}, result)) };
        });
        return h('form', { class: 'type-form', onsubmit: (e) => {
          e.preventDefault();
          close(rows.map((r) => ({ file: r.file, folder: r.folder.value, description: r.desc.value.trim() })));
        } },
        h('h2', {}, `Add ${list.length} file${list.length === 1 ? '' : 's'} to the case`),
        h('p', { class: 'muted small explain' }, 'Each file goes into its document folder and is named ', h('code', {}, '<year>-<case no.> <document type>'), '. A number like (2) is added when the name is taken.'),
        // v1.76: fixed column widths, so the boxes stay put while "Saved as" changes with the typing.
        h('div', { class: 'table-scroll' }, h('table', { class: 'files type-table' },
          h('colgroup', {}, h('col', { class: 'tt-file' }), h('col', { class: 'tt-type' }), h('col', { class: 'tt-name' }), h('col', { class: 'tt-saved' })),
          h('thead', {}, h('tr', {}, h('th', {}, 'File'), h('th', {}, 'Document type'), h('th', {}, 'File name'), h('th', {}, 'Saved as'))),
          h('tbody', {}, rows.map((r) => r.el)))),
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit', autofocus: true }, 'Save to SSD')));
      });
    }

    async function moveFileDialog(c, f, current) {
      const CF = CVCaseFiles;
      const plan = await openDialog((close) => {
        const folder = h('select', {}, CF.FOLDERS.map((x) => h('option', { value: x, selected: x === (f.folder || CF.guessFolder(f.base)) }, x.replace('/', ' › '))));
        const desc = h('input', { type: 'text', maxlength: 80 });
        const keep = h('input', { type: 'checkbox' });
        const result = h('code', {});
        const show = () => { result.textContent = keep.checked ? f.base : CF.fileName(c, folder.value, f.base, desc.value); desc.disabled = keep.checked; };
        for (const el of [folder, desc, keep]) el.addEventListener('input', show);
        keep.addEventListener('change', show);
        show();
        return h('form', { onsubmit: (e) => { e.preventDefault(); close({ folder: folder.value, description: desc.value.trim(), keepName: keep.checked }); } },
          // v1.80: one Save for both: a new name, another folder, or both.
          h('h2', {}, f.folder ? 'Rename or Move' : 'File This Document'),
          h('p', { class: 'muted small' }, f.base),
          h('p', { class: 'muted small' }, 'Type a new name, pick another folder, or both, then click Save.'),
          field('Document folder', folder),
          field('File name', desc, '', 'Optional: the name after the year and case number. Empty keeps the current name.'),
          h('label', { class: 'check-row' }, keep, h('span', {}, 'Keep the current file name')),
          h('p', {}, 'New name: ', result),
          h('div', { class: 'dialog-actions' },
            h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancel'),
            h('button', { class: 'btn primary', type: 'submit' }, 'Save')));
      });
      if (!plan) return;
      try {
        const to = await Save.track(`file-move:${c.id}:${f.name}`, () => Vault.moveFile(c.id, f.name, plan.folder, plan));
        // v1.79: a renamed file keeps its place in your own order.
        const newBase = String(to).split(/[\\/]/).pop();
        if (newBase && newBase !== f.base) {
          try {
            const order = (await Vault.readCaseJSON(c.id, 'file-order.json')) || {};
            let changed = false;
            for (const k of Object.keys(order)) if (Array.isArray(order[k]) && order[k].includes(f.base)) { order[k] = order[k].map((b) => (b === f.base ? newBase : b)); changed = true; }
            if (changed) await Vault.writeCaseJSON(c.id, 'file-order.json', order);
          } catch (err) { if (FS.isDisconnectError(err)) throw err; }
        }
        showCase(c.id, 'files', current || null);
        // v1.153: Undo puts it back where it was, with its old name.
        if (to !== f.name) {
          CVKit.undoToast(toast, h, `Saved as ${CVFormat.pathText(to)}.`, async () => {
            await Save.track(`file-move:${c.id}:${to}`, () => Vault.moveFile(c.id, to, f.folder, { name: f.base }));
            if (state.caseId === c.id && state.tab === 'files') showCase(c.id, 'files', current || null);
          });
        }
      } catch (err) { if (!FS.isDisconnectError(err)) { /* reported by Save */ } }
    }

    // Spreadsheet preview: one scrollable table per sheet, with sheet tabs. Cell text is only ever
    // set with textContent (via h()), never as HTML. `at` = { sheet, row } highlights a row.
    const PREVIEW_ROWS = 2000;

    function sheetTable(sheet, targetRow) {
      if (!sheet.rows.length) return h('p', { class: 'muted' }, 'This sheet is empty.');
      const shown = sheet.rows.slice(0, PREVIEW_ROWS);
      const cols = Array.from({ length: sheet.columns }, (_, i) => CVSheets.columnLetter((sheet.startCol || 0) + i));
      const table = h('table', { class: 'sheet-table' },
        h('thead', {}, h('tr', {}, h('th', { class: 'rownum' }, ''), cols.map((l) => h('th', {}, l)))),
        h('tbody', {}, shown.map((r) => h('tr', { class: r.row === targetRow ? 'target' : null, 'data-row': r.row },
          h('th', { class: 'rownum' }, String(r.row)),
          cols.map((_, i) => h('td', {}, r.cells[i] || ''))))));
      const more = sheet.rows.length > PREVIEW_ROWS || sheet.truncated;
      return h('div', {}, table, more ? h('p', { class: 'muted small' }, `Showing the first ${shown.length} rows. Open the file in Excel to see everything.`) : null);
    }

    function sheetPreview(sheets, at) {
      const view = h('div', { class: 'sheet-view' });
      const tabs = h('div', { class: 'sheet-tabs', role: 'tablist' });
      const show = (i) => {
        [...tabs.children].forEach((b, k) => { b.classList.toggle('active', k === i); b.setAttribute('aria-selected', String(k === i)); });
        const sheet = sheets[i];
        view.replaceChildren(sheetTable(sheet, at && at.sheet === sheet.name ? at.row : null));
        const target = view.querySelector('tr.target');
        if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'center' }));
      };
      sheets.forEach((sheet, i) => tabs.append(h('button', { type: 'button', role: 'tab', class: 'sheet-tab', onclick: () => show(i) }, sheet.name)));
      const start = Math.max(0, at ? sheets.findIndex((s) => s.name === at.sheet) : 0);
      if (sheets.length) show(start);
      else view.append(h('p', { class: 'muted' }, 'This spreadsheet has no sheets.'));
      return [sheets.length > 1 ? tabs : null, view];
    }

    async function previewFile(c, name, page = null, at = null) {
      let file;
      try {
        // v1.68: a folder not tied to a case passes its own reader.
        file = c.readFile ? await c.readFile(name) : await Vault.readFile(c.id, name);
        if (!file) throw Object.assign(new Error('File not found'), { name: 'NotFoundError' });
      } catch (err) {
        if (FS.isDisconnectError(err) && err.name !== 'NotFoundError') return onDriveLost();
        return toast(`Could not open ${name}: ${err.message}`, 'error');
      }
      const ext = extOf(name);
      const kind = PREVIEWABLE[ext];
      const urls = [];
      const blobUrl = (blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; };
      const typed = MIME[ext] ? new Blob([file], { type: MIME[ext] }) : file;
      let viewer = null; let pdfBytes = null;

      await openDialog((close) => {
        let body;
        if (kind === 'pdf') {
          // XFA forms (Adobe LiveCycle) only say "Please wait..." in the browser's PDF viewer, so
          // CaseVault draws them itself; ordinary PDFs use the browser's viewer.
          body = h('div', { class: 'xfa-preview' }, h('p', { class: 'muted' }, 'Opening…'));
          // v1.89: CaseVault's own viewer (square, like the report PDFs), not the browser's.
          const pdfFrame = () => {
            viewer = CVPdfViewer.create(new Uint8Array(pdfBytes), { h, icon: I, title: name, fileName: name, page });
            return h('div', { class: 'pdf-view preview-pdf' }, viewer);
          };
          file.arrayBuffer().then(async (buf) => {
            const data = new Uint8Array(buf);
            pdfBytes = buf.slice(0);
            const fields = await CVExtract.readXfaFields(data);
            if (!fields.xfa) return body.replaceWith(pdfFrame());
            const view = h('div', { class: 'xfa-view' });
            const note = h('p', { class: 'muted small' }, 'XFA form, shown read-only.');
            const showFields = () => CVExtract.renderXfa(view, data, fields, at && at.field, { fieldsOnly: true });
            const showForm = () => CVExtract.renderXfa(view, data, fields, at && at.field);
            const toggle = h('button', { class: 'btn small ghost', type: 'button', onclick: () => {
              const toFields = toggle.dataset.mode !== 'fields';
              toggle.dataset.mode = toFields ? 'fields' : 'form';
              toggle.textContent = toFields ? 'Show the form' : 'Show filled-in fields';
              view.replaceChildren(h('p', { class: 'muted' }, 'Opening…'));
              (toFields ? showFields : showForm)();
            } });
            // Coming from a check result: start on the fields list with that field highlighted.
            const startFields = !!(at && at.field);
            toggle.dataset.mode = startFields ? 'fields' : 'form';
            toggle.textContent = startFields ? 'Show the form' : 'Show filled-in fields';
            body.replaceChildren(h('div', { class: 'xfa-bar' }, note, fields.paragraphs.length ? toggle : null), view);
            const mode = await (startFields ? showFields() : showForm());
            if (mode === 'fields' && !startFields) toggle.remove();
          }).catch((err) => body.replaceChildren(h('p', { class: 'error-text' }, `Could not open this PDF: ${err.message}`)));
        } else if (kind === 'image') body = h('img', { class: 'preview-img', src: blobUrl(typed), alt: name });
        else if (kind === 'image-svg') body = h('img', { class: 'preview-img', src: blobUrl(new Blob([file], { type: 'image/svg+xml' })), alt: name });
        else if (kind === 'audio') body = h('audio', { controls: true, src: blobUrl(typed) });
        else if (kind === 'video') body = h('video', { class: 'preview-img', controls: true, src: blobUrl(typed) });
        else if (kind === 'sheet') {
          body = h('div', { class: 'sheet-preview' }, h('p', { class: 'muted' }, 'Reading the spreadsheet…'));
          CVSheets.read(file, name)
            .then((sheets) => body.replaceChildren(...sheetPreview(sheets, at).filter(Boolean)))
            .catch((err) => body.replaceChildren(h('p', { class: 'error-text' }, `Could not read this spreadsheet: ${err.message}`)));
        } else if (kind === 'docx') {
          // Word: drawn by CaseVault from the file's text and structure (no Word needed). The layout is
          // simplified; the file itself is unchanged and opens in Word as usual.
          body = h('div', { class: 'docx-preview' }, h('p', { class: 'muted' }, 'Reading the Word document…'));
          file.arrayBuffer().then(async (buf) => {
            const xml = await CVExtract.unzipEntry(buf, 'word/document.xml');
            if (!xml) throw new Error('it has no document body');
            const numbering = await CVExtract.unzipEntry(buf, 'word/numbering.xml').catch(() => null);
            const blocks = CVDocxView.parse(xml, numbering || '');
            body.replaceChildren(
              h('p', { class: 'muted small docx-note' }, 'Word document, shown read-only. Headings, bold/italic, lists and tables are kept; fonts, spacing and images are not. The file itself is unchanged: open it in Word for the exact layout.'),
              h('div', { class: 'docx-page' }, blocks.length ? CVDocxView.render(blocks) : h('p', { class: 'muted' }, 'This document has no text.')));
          }).catch((err) => body.replaceChildren(h('p', { class: 'error-text' }, `Could not read this Word file: ${err.message}. Open it in Word from the SSD.`)));
        } else if (kind === 'text' && ext === 'md' && c.formatted) {
          // v1.188: a Library Markdown file is shown formatted, as it reads (headings, bold, lists, tables).
          body = h('div', { class: 'docx-page markdown-body preview-md' }, 'Loading…');
          file.slice(0, 2_000_000).text().then((t) => { body.innerHTML = Markdown.render(t) || ''; });
        } else if (kind === 'text') {
          body = h('pre', { class: 'preview-text' }, 'Loading…');
          file.slice(0, 2_000_000).text().then((t) => { body.textContent = t; });
        } else {
          body = h('div', { class: 'preview-none' },
            h('p', {}, 'This file type can\'t be shown inside CaseVault.'),
            ext === 'doc' ? h('p', { class: 'small' }, 'This is an old-style Word file (.doc). Open it in Word and use File → Save As → Word Document (.docx): CaseVault can show and check .docx files.') : null,
            h('p', {}, 'Open it straight from the SSD in its normal program:'),
            h('code', { class: 'path' }, CVFormat.pathText(c.pathText ? c.pathText : c.readFile ? `${Vault.root.name}\\shared\\${c.where}\\${name}` : `${Vault.root.name}\\${Vault.isArchived(c.id) ? 'archive' : 'cases'}\\${c.id}\\files\\${name}`)),
            h('p', { class: 'muted small explain' }, 'Tip: in File Explorer, paste the folder part of that path after your CaseVault drive letter.'));
        }
        return h('div', { class: 'preview' },
          h('div', { class: 'preview-head' },
            h('h2', {}, name),
            h('span', { class: 'muted small' }, fmtSize(file.size)),
            h('div', { class: 'spacer' }),
            h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Close')),
          body);
      });
      urls.forEach((u) => URL.revokeObjectURL(u));
      if (viewer) viewer.destroy();
    }

    return { renderFiles, previewFile };
  }

  root.CVFilesTab = { init };
})(this);
