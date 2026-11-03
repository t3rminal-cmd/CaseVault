# CaseVault

An offline, browser-based case file manager that stores everything on your own external drive, with an offline consistency checker for affidavits. No cloud, no servers, no tracking.

- **Your data stays on your SSD.** CaseVault reads and writes the vault folder directly through the browser's File System Access API. The browser remembers only *which folder* to reconnect to, never its contents.
- **Works offline.** Run the copy on the SSD through the launcher, or install it as an app from GitHub Pages. There's no build step and nothing to download at runtime; every library is bundled in `vendor/`.
- **Private by design.** No CDNs, downloaded fonts, analytics, or network calls. A Content-Security-Policy restricts the page to its own files and the local AI engine on `127.0.0.1:11434`. CaseVault never connects to the internet.

**Open it:** `W:\Start-CaseVault.bat` in any browser, every day. The online copy at https://t3rminal-cmd.github.io/casevault/ (Chrome or Edge) is for now and then: it doesn't remember the vault folder (see [docs/SECURITY.md](docs/SECURITY.md)).

| Browser | Mode |
|---|---|
| Chrome, Edge | **Direct**: the File System Access API reads and writes the SSD folder. No helper needed. |
| Firefox | **Helper**: `tools/casevault-helper`, a PowerShell script started by `Start-CaseVault.bat`. It needs no install or admin rights, listens on 127.0.0.1 only, serves the app, and reads/writes `CaseVault-Data`. |

The app detects the browser and picks the mode by itself. The data format on the SSD is identical in both.

## What's New in v1.184

- **Ask AI about a whole Mission**; **Timeline events from a report**; **Search All Cases** in plain words
- **Closing Summary** memo of a Mission, drafted by the AI and saved to the Mission Folder

## What CaseVault Does

**Cases, Operations and Case Groups**
- Cases with a Case Number, File Number, Agency Case Number, subject, client and status (Open, Closed, Archived); several case numbers worked together as an **Operation** (a Mission; the MISSIONS folder), or kept as **Independent Cases**
- **Case Groups**: related independent cases kept together under a name you give (a suspect, a family, a crew), with their own page, without making an Operation
- Details tab: suspects, contacts (Case Officer, ASA/AUSA and others), LEO partners, deconfliction, and **Case History** with your own dated notes
- Closing asks for a disposition and the arrest report; archiving asks for a reason (EXPIRED, NOLLE PROSEQUI, PROSECUTION or your own); a closed case can be reopened and an archived one restored
- Timeline of events, buys and deadlines, coloured by suspect, a red bell for anything due, and the statute of limitations for narcotic charges
- **Buy Summary** (each suspect's buys with narcotic and money totals) and a **Timeline PDF** of just the events shown
- **Person view**: every case and Mission a person is on, with other spellings of the name flagged
- A Mission's closing progress, and closing several case numbers by one arrest report
- Delete Case asks twice (deleted cases go to a recycle bin first)

**Reports and PDFs**
- **Draft** tab: the Officer's Report entered once (offense, victims, offenders, narcotics, pre-recorded funds, evidence and exhibits, personnel, approvals), with green checks as each part is complete; Send to Files makes the PDF and empties the form (Undo brings it back)
- **Arrest** tab and Arrest Report PDF; **Case Summary** PDF for a supervisor; **Link Chart** with photos, money and narcotics links, as a portrait PDF
- Your department **letterhead** (logo and up to four header lines) across the top of the Report, Arrest Report and Link Chart PDFs; nothing built in
- **Reports** tab: written reports and Field Notes with a Word-like editor, AI Re-phrase and Review (totals checked by arithmetic), Word export

**Files and Discovery**
- Every case's documents in named folders (`2026-<CaseNo> <Type>.ext`), previewed in the app: PDF (CaseVault's own viewer), images, Word, Excel, audio and video
- **Discovery**: an encrypted, Bates-numbered production with its own viewer and a printable receipt; burns to CD or DVD

**Also**
- **Quick Links** (Reference, OSINT, LEO) in a panel that slides in from the right; **Reference** charts, codes and the narcotic street-value calculator
- **Secure Locker**: passwords (arranged your way, with each entry's old passwords), covert aliases and accounts, and confidential files marked Active or Inactive, all encrypted on the SSD
- **Settings** (gear on the home page): My Profile, letterhead, Library and templates, Quick links, mail, logs and backups

**Data safety**
- Everything is saved on the SSD as you type, with a **Saved to SSD** indicator; changes wait and are written when a disconnected SSD comes back
- **Updates** with the CaseVault Updater on the SSD (`updater\Check-For-Updates.bat`): a small window that fetches only the changed files from this repository, backs up what it replaces, and can undo the last update
- A daily backup of the vault index; **Back Up Everything** copies the whole vault to a second drive and checks every file (in Firefox through the helper)
- Privacy screen with a PIN and an idle timer; Power Off saves, closes and ejects the drives

**AI (on this PC)**
- Ask AI, Draft with AI and the Consistency Checker run on the local AI engine (Ollama, started by `Start-CaseVault.bat`); nothing leaves the PC. Quick (7–8B) on a PC with a graphics card, Light (3–4B) on one without; when the engine isn't running, the Checker's rule-based checks still run

## Beta Status and Known Issues

Case management (cases, Missions, the Draft and its PDFs, Files, Discovery, backups) is ready for beta testing. These parts carry a **Beta** tag in the app and still need work:

- **Templates** (Settings → Templates): placeholder filling is basic, and imported Word templates lose some layout
- **Consistency Checker** (Checks tab): expect false alarms on names and addresses; the AI layer is slow on a PC without a graphics card
- **Document Anonymizer** (⋮ → Options → Dev Tools): unusual names and some addresses can slip through; check the result before sharing it
- **Ask AI and Draft with AI** depend on the model installed; small models make mistakes, so read every answer

Use ⋮ → Report a Problem to save a report (with case details scrubbed) for the developer.

## Repository Layout

| Folder | What is in it |
|---|---|
| `index.html`, `css/`, `js/`, `icons/`, `vendor/` | The app itself (plain HTML, CSS and JavaScript; every library bundled) |
| `discovery/` | The viewer copied into every Discovery package |
| `tools/` | The launcher and the Firefox helper for the CV-AI drive |
| `updater/` | The CaseVault Updater for the SSD (Python, standard library only) and its tests |
| `docs/` | The guides below |
| `previous-versions/` | What every earlier version added, and its What's New notes (kept on GitHub; not copied to the SSD) |
| `tests/` | Unit tests and the browser tests (made-up Doe/Roe/Poe data only) |
| `scripts/` | The icon builder and the CI guard against committed case data |
| `.github/` | The publish workflow (tests, safety checks, GitHub Pages) and Dependabot |

## Guides

- [docs/SSD-SETUP.md](docs/SSD-SETUP.md): partitioning the SanDisk Extreme, drive letters, BitLocker To Go
- [docs/USING-CASEVAULT.md](docs/USING-CASEVAULT.md): everyday use
- [docs/AI-SETUP.md](docs/AI-SETUP.md): the launcher, the Firefox helper, portable Ollama and models on the CV-AI partition
- [docs/BACKUP-TO-ANOTHER-PC.md](docs/BACKUP-TO-ANOTHER-PC.md): backing up to a shared folder on another PC at home (e.g. a Beelink)
- [docs/SECURITY.md](docs/SECURITY.md): what protects your cases and the code, and the GitHub settings to turn on
- [previous-versions/](previous-versions/README.md): what each earlier version added, and [the What's New notes](previous-versions/WHATS-NEW.md) version by version

## Data layout on the SSD

```
CaseVault-Data/
  vault.json                 app version, settings (letterhead text, last full backup), Missions, case index
  cases/<case-id>/
    case.json                details, suspects, contacts, status, dates, Case History
    notes.md                 Field Notes
    timeline.json            dated events and deadlines
    report-fields.json       the Write Report tab (Officer's Report)
    arrest.json              the Arrest tab
    linkchart.json           the Link Chart
    files/<Document type>/   attached documents, named 2026-<CaseNo> <Type>.ext
    drafts/                  written reports: <slug>.md
    checks/                  consistency checks: <date>-check.json
    mail-log.json            department mail prepared from this case
  archive/<case-id>/         archived cases, same layout (read-only in the app)
  shared/                    Mission folders and Other Files (not tied to a case)
  locker/                    the Secure Locker, encrypted: locker.json, data.bin, f-<id>.bin
  templates/, library/       your report templates, and the examples the AI learns from
  chats/                     saved Ask AI conversations
  branding/logo.jpg          the letterhead logo
  backups/                   dated snapshots of vault.json
  exports/                   Report a Problem files
  logs/                      outbound-YYYY-MM.json: what left this PC, when and where (never the text)
```

## Code layout

| Path | What |
|---|---|
| `index.html` | App shell and Content-Security-Policy |
| `css/app.css` | Styles (layout, square corners, light/dark) |
| `css/theme.css` | The theme: every colour (light and dark), the status colours and the bundled font |
| `js/fs.js` | Folder-handle storage (IndexedDB, handle only) and SSD file helpers |
| `js/casefiles.js` | Document folders and the `2026-<CaseNo> <Type>` naming convention |
| `js/secure/pii.js` | PII scanner (mail check, Document Anonymizer) and redaction to placeholders |
| `js/secure/outbound.js` | Department mail check: the review screen (recipients, attachments, personal details) and the outbound log |
| `js/secure/mail.js`, `js/secure/mail-ui.js` | Department mail: domain rules, `.eml` Outlook draft builder, the Mail tab |
| `js/secure/settings-ui.js` | Settings window: PII watch list, department mail, outbound log |
| `js/secure/locker-core.js`, `js/locker-ui.js` | The Secure Locker: encryption (AES-GCM, a password and a recovery key) and its page |
| `js/ai/memory.js` | Memory indicator (app, Ollama model GPU/RAM, PC RAM and disk) |
| `js/vault.js` | Vault data model: cases, notes, timeline, files, index, backups, archive (verified folder moves) |
| `js/ai/activity.js` | AI activity tracker: header indicator, shared AI queue, tokens/s |
| `js/ai/hardware.js` | AI profile per PC, and what Auto picks from the GPU |
| `js/selftest.js` | Self-test with built-in made-up documents |
| `js/markdown.js` | Minimal, escaping Markdown previewer for notes |
| `js/report-pdf.js` | The Supplementary Report as a PDF (its own small PDF writer; signature fields for e-sign; the letterhead) |
| `js/report-fields.js`, `js/report-fields-ui.js` | The Write Report tab: the Officer's Report fields, their checks, and the form |
| `js/arrest-pdf.js`, `js/draft-pdf.js`, `js/case-summary.js`, `js/timeline-pdf.js` | The Arrest Report, a written report, the Case Summary, and the Timeline / Buy Summary as PDFs |
| `js/letterhead.js` | The department letterhead: logo square and header lines, for every PDF |
| `js/pdf-viewer.js` | CaseVault's own PDF viewer (zoom, pages, print, download) |
| `js/linkchart.js`, `js/linkchart-ui.js` | The Link Chart: layout and PDF, and the tab |
| `js/operation.js` | Missions: several case numbers under one Operation; timeline colours and the buy summary |
| `js/person-view.js` | The person view: every case a name is on, other spellings flagged |
| `js/limitations.js` | Statute of limitations for narcotic charges |
| `js/discovery-core.js`, `js/discovery-ui.js`, `js/discovery-receipt.js` | Discovery: encrypted Bates-numbered packages, the dialog, and the receipt PDF |
| `js/formats.js`, `js/combo.js`, `js/select.js` | One way to write dates, phones and SSNs; type-in drop-downs; square drop-down lists |
| `js/notes-float.js` | Field Notes in a floating box |
| `js/drafts/review.js` | Reports → Review: do the money and weight totals add up |
| `js/rich-editor.js` | Formatted view for notes and reports: edits in Word-like form, saved as Markdown; paste from Word, copy for Word |
| `js/app.js` | User interface, autosave, connect/reconnect |
| `js/case-overview.js`, `js/case-timeline.js`, `js/files-tab.js` | The Details tab's Case Overview (suspects, partners, contacts, deconfliction, Case History, the timeline line), the Timeline tab and the Files tab |
| `js/theme.js` | Light / dark / automatic theme (loaded first, so the page never flashes) |
| `js/icons.js`, `js/icons-data.js` | Icons as inline SVG (a subset of Bootstrap Icons, made by `scripts/make-icons.js`) |
| `js/reference/ref-data.js`, `js/reference/reference.js`, `js/reference/ref-ui.js`, `js/reference/links.js` | Reference: the data (values, codes), the logic (calculator, search, AI text), the screens and the Quick links (Reference, OSINT, LEO) |
| `js/library.js`, `js/library-ui.js` | The Library the AI learns from, and the writing behaviors (DEA-6 by default) |
| `js/ai/chat.js`, `js/ai/chat-ui.js` | Ask AI: the chat's messages and case material, and the floating chat box |
| `js/timefield.js` | Time boxes: type a time or pick it and press Set time |
| `js/options.js` | Menu → Options (zoom, brightness, Dev Tools "Make it fictitious") and Contact Dev |
| `js/format-bar.js` | The formatting bar over Notes and Drafts |
| `js/tooltip.js` | Hover boxes for every button |
| `js/case-search.js`, `js/backup-restore.js` | Search Inside Cases; finding the cases in a picked full-backup folder (v1.106) |
| `js/closing.js`, `js/closing-ui.js` | Status rules, Add Follow-up, Close case (dispositions, loose ends), Reopen, the Arrest details tab and `{{arrest.*}}` / `{{closure.*}}` values |
| `js/docxview.js` | Word (.docx) to a read-only preview, and to Markdown for template import |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable offline PWA |
| `js/helper-fs.js` | Helper mode: wraps the helper's API in FileSystemHandle-shaped objects |
| `js/checker/nlp.js` | Sentence splitting, similarity, BM25 retrieval, verbatim-quote finder |
| `js/checker/rules.js` | Layer 1: fact extraction and cross-document comparison |
| `js/checker/extract.js` | Text from PDF (pdf.js + OCR), DOCX, TXT, images (Tesseract) |
| `js/checker/xfa.js` | XFA (LiveCycle) PDF forms: reads the filled-in fields as checker text |
| `js/checker/ai.js` | Layer 2: Ollama detection, profiles, retrieval, classification, quote verification |
| `js/checker/checks-ui.js` | Checks tab, results, engine status and AI settings |
| `js/checker/sheets.js` | Spreadsheets (.xlsx/.xls/.csv) for the preview and the checker |
| `js/privacy.js` | Privacy screen: shortcut, cover, PIN hashing, idle timer |
| `js/drafts/draft-core.js` | Draft file format, [CONFIRM: ...] placeholders, templates, starter templates |
| `js/drafts/docx.js` | Markdown to .docx, with a tiny built-in zip writer |
| `js/drafts/ghost.js` | Inline suggestion (ghost text) logic |
| `js/drafts/copilot.js` | Local-AI calls for suggestions and Draft with AI |
| `js/drafts/drafts-ui.js` | Drafts tab, editor, export, template settings |
| `vendor/` | Bundled pdf.js, Tesseract.js, SheetJS and the Bootstrap Icons license (see `vendor/README.md` for versions, licenses and provenance) |
| `tools/Start-CaseVault.bat` | Launcher for the CV-AI partition: starts the helper and Ollama |
| `tools/casevault-helper/` | The Firefox helper (Windows PowerShell 5.1, 127.0.0.1 only). It also opens `.eml` mail drafts in Outlook, reports RAM and disk space for the memory indicator, copies and checks Back Up Everything onto another drive, and says whether each drive has BitLocker |
| `updater/` | The updater (Python, bundled on the SSD): checks GitHub for a new version and installs only the changed files; see `updater/README.md` |
| `discovery/viewer.html` | The recipient's viewer copied into every Discovery package |
| `tests/` | Unit tests (`node --test tests/*.test.js`) and a mock Ollama server |
| `tests/e2e/` | Browser tests: `node tests/e2e/run.js` drives the app in Chromium (Playwright) with made-up Doe/Roe/Poe cases; CI runs them before every publish |
| `scripts/check-no-case-data.sh` | CI guard: fails if anything resembling case data is committed |

Plain HTML, CSS, and JavaScript with classic `<script>` tags, so it also runs from `file://` (PDF reading and OCR need `http(s)`). To work on it locally, serve the folder (for example `python -m http.server`) and open it in Chrome or Edge. For the AI layer without a real model, run `node tests/mock-ollama.js`.

**Never commit case data.** This repository is public. `.gitignore` blocks case folders and documents, CI refuses to deploy if any slips through, and every test uses made-up people (Doe, Roe, Poe) in Example City.

## Deployment

`.github/workflows/pages.yml` publishes the app to GitHub Pages on every push to `main`. One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
