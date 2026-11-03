/* CaseVault — Mission Closeout (v1.180): a Mission on one page, as a PDF, for a supervisor or the
 * prosecutor: each case number with its disposition and close date, what became of each suspect and
 * their charges, the buys by suspect with the total paid, and where the evidence stands. Saved in the
 * Mission Folder (Other). rows() is plain logic, so the tests run it under Node; build() writes the
 * PDF with the small writer in js/report-pdf.js, like the Group Summary.
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const P = () => (isNode ? require('./report-pdf.js') : root.CVReportPdf);
  const K = () => (isNode ? require('./closing.js') : root.CVClosing);
  const clean = (v) => String(v == null ? '' : v).trim();
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const longDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(clean(iso)); return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : ''; };
  const money = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: (Number(n) || 0) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  const byNumber = (a, b) => a.number.localeCompare(b.number, undefined, { numeric: true });

  /**
   * What the PDF shows. cases: full case.json objects of the Mission; arrests: Map(case id ->
   * arrest.json); outcomes: CVClosing.suspectOutcomes rows; buys: CVOperation.buySummary groups;
   * evidence: Map(case id -> the Write Report tab's evidence list).
   */
  function rows({ cases = [], arrests = new Map(), outcomes = [], buys = [], evidence = new Map() } = {}) {
    const list = cases.filter(Boolean);
    const caseRows = list.map((c) => {
      const d = c.status === 'Closed' && c.closure ? K().disposition(c.closure.disposition) : null;
      return {
        number: clean(c.number) || 'No case number', subject: clean(c.subject), status: c.archived ? 'Archived' : clean(c.status) || 'Open',
        disposition: d ? `${d.label}${clean(c.closure.reason) ? ` (${clean(c.closure.reason)})` : ''}` : '',
        closed: c.status === 'Closed' ? longDate(c.dates && c.dates.closed) : '',
      };
    }).sort(byNumber);
    // Each suspect's charges, from every arrest report of the Mission that names them.
    const reports = list.flatMap((c) => (((arrests.get(c.id) || {}).arrestees) || []).map((a) => ({ a: K().normalizeArrestee(a), number: clean(c.number) })));
    const suspects = outcomes.map((r) => {
      const charges = [];
      for (const { a } of reports) {
        if (!K().samePerson(K().arresteeName(a), r.name)) continue;
        for (const ch of a.charges) { const t = [clean(ch.statute), clean(ch.description)].filter(Boolean).join(' '); if (t && !charges.includes(t)) charges.push(t); }
      }
      return { name: r.name, outcome: r.label, moved: r.continuedIn ? clean(r.continuedIn.number) : '', charges };
    });
    const buyRows = (buys || []).map((g) => ({
      name: g.name, count: g.buys.length, paid: g.paid,
      drugs: g.drugs.map((x) => [x.drug, x.amounts.map((a) => `${a.qty} ${a.unit}`).join(' + ')].filter(Boolean).join(' ')).join('; '),
    }));
    const evRows = list.map((c) => {
      const ex = (evidence.get(c.id) || []).filter((e) => clean(e.inventory) || clean(e.description) || clean(e.drug));
      const C = isNode ? require('./custody.js') : root.CVCustody;
      const open = ex.filter((e) => C.status(e.custody).state !== 'gone').length;
      const noLab = ex.filter((e) => /narcotic/i.test(clean(e.type)) && !C.normalize(e.custody).some((x) => x.action === 'Returned from Lab')).length;
      return { number: clean(c.number) || 'No case number', total: ex.length, open, noLab };
    }).filter((r) => r.total).sort(byNumber);
    return { cases: caseRows, suspects, buys: buyRows, totalPaid: buyRows.reduce((n, b) => n + (Number(b.paid) || 0), 0), evidence: evRows };
  }

  /** The PDF. title: the Mission's number and name; data: rows(); opts: { letterhead, printed, outcome, later }. */
  function build(title, data, opts = {}) {
    const R = P();
    const PAGE_W = R.PAGE_W; const PAGE_H = R.PAGE_H; const M = 40; const INNER = PAGE_W - 2 * M;
    const photos = [];
    const lh = R.withLogo(opts.letterhead, photos);
    const pages = [];
    let ops = null; let y = 0;
    const text = (x, yy, t, size = 10, bold = false) => { if (t !== '' && t != null) ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td ${R.pdfString(String(t))} Tj ET`); };
    const fill = (x, yy, w, hh, gray) => ops.push(`${gray} g ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${hh.toFixed(2)} re f 0 g`);
    const BOTTOM = M + 24;
    const newPage = (first) => {
      ops = [];
      pages.push({ ops, sigs: [], imgs: [], signed: true });
      y = PAGE_H - M;
      if (first) {
        y -= R.letterhead(ops, lh, M, y, INNER, 'helvetica');
        if (lh && lh.logo) pages[0].imgs.push(lh.logo.index);
        R.navy(ops, () => text(M, y - 18, 'MISSION CLOSEOUT', 18, true));
        y -= 26;
        text(M, y - 11, clean(title), 12, true); y -= 18;
      } else { text(M, y - 10, `MISSION CLOSEOUT (continued): ${clean(title)}`, 10, true); y -= 20; }
    };
    const para = (t, size = 10) => { for (const l of R.wrap(t, size, INNER, false)) { if (y - 13 < BOTTOM) newPage(false); text(M, y - 10, l, size); y -= 13; } };
    // A table: cols [{ label, at (0..1), w (0..1) }]; cells: one array of strings per row.
    const table = (heading, cols, cells, empty) => {
      if (y - 60 < BOTTOM) newPage(false);
      y -= 6;
      R.bandBox(ops, M, y - 18, INNER, 18); R.navy(ops, () => text(M + 6, y - 13.5, heading, 12, true)); y -= 24;
      if (!cells.length) { text(M + 4, y - 10, empty, 10); y -= 18; return; }
      const head = () => { fill(M, y - 12, INNER, 13, 0.94); cols.forEach((c) => text(M + 4 + INNER * c.at, y - 9.5, c.label, 10, true)); y -= 16; };
      head();
      cells.forEach((row, i) => {
        const lines = row.map((v, k) => R.wrap(clean(v) || '—', 10, INNER * cols[k].w - 8, false));
        const hh = Math.max(...lines.map((l) => l.length), 1) * 13 + 4;
        if (y - hh < BOTTOM) { newPage(false); head(); }
        if (i % 2 === 1) fill(M, y - hh + 2, INNER, hh, 0.97);
        lines.forEach((ls, k) => ls.forEach((l, n) => text(M + 4 + INNER * cols[k].at, y - 10 - n * 13, l, 10, k === 0)));
        y -= hh + 2;
      });
    };
    newPage(true);
    const closed = data.cases.filter((r) => r.status !== 'Open').length;
    para(`${data.cases.length} case number${data.cases.length === 1 ? '' : 's'}, ${closed} closed. ${data.suspects.length} suspect${data.suspects.length === 1 ? '' : 's'}.`);
    if (clean(opts.outcome)) para(clean(opts.outcome));
    y -= 4;
    table(`CASE NUMBERS (${data.cases.length})`, [{ label: 'Case Number', at: 0, w: 0.17 }, { label: 'Subject', at: 0.17, w: 0.24 }, { label: 'Status', at: 0.41, w: 0.1 }, { label: 'Disposition', at: 0.51, w: 0.3 }, { label: 'Closed', at: 0.81, w: 0.19 }],
      data.cases.map((r) => [r.number, r.subject, r.status, r.disposition, r.closed]), 'No case numbers.');
    table(`SUSPECTS (${data.suspects.length})`, [{ label: 'Name', at: 0, w: 0.24 }, { label: 'Outcome', at: 0.24, w: 0.26 }, { label: 'Charges', at: 0.5, w: 0.5 }],
      data.suspects.map((r) => [r.name, r.moved ? `${r.outcome} (case ${r.moved})` : r.outcome, r.charges.join('; ')]), 'No identified suspects.');
    table(`BUYS${data.buys.length ? ` (TOTAL PAID ${money(data.totalPaid)})` : ''}`, [{ label: 'Suspect', at: 0, w: 0.26 }, { label: 'Buys', at: 0.26, w: 0.1 }, { label: 'Bought', at: 0.36, w: 0.46 }, { label: 'Paid', at: 0.82, w: 0.18 }],
      data.buys.map((r) => [r.name, String(r.count), r.drugs, money(r.paid)]), 'No buys on the Timeline.');
    table('EVIDENCE', [{ label: 'Case Number', at: 0, w: 0.22 }, { label: 'Exhibits', at: 0.22, w: 0.16 }, { label: 'No Final Disposition', at: 0.38, w: 0.32 }, { label: 'No Lab Result', at: 0.7, w: 0.3 }],
      data.evidence.map((r) => [r.number, String(r.total), String(r.open), String(r.noLab)]), 'No exhibits on the Write Report tab.');
    if ((opts.later || []).length) { y -= 6; text(M, y - 10, 'Since the Mission closed', 10, true); y -= 15; for (const l of opts.later) para(l); }
    pages.forEach((pg, i) => {
      const t = `Page ${i + 1} of ${pages.length}`;
      pg.ops.push(`BT /F1 8 Tf ${(PAGE_W / 2 - R.width(t, 8) / 2).toFixed(2)} ${(M - 16).toFixed(2)} Td ${R.pdfString(t)} Tj ET`);
      if (opts.printed) pg.ops.push(`BT /F1 7.5 Tf ${M.toFixed(2)} ${(M - 16).toFixed(2)} Td ${R.pdfString(`Printed ${opts.printed}`)} Tj ET`);
    });
    return R.assemble(pages, { photos, title: `Mission Closeout ${clean(title)}`, face: 'helvetica' });
  }

  /** v1.184: the Closeout's facts as text, for the AI's Closing Summary memo. */
  function memoMaterial(data, { title = '', outcome = '', later = [] } = {}) {
    const lines = [`## Mission: ${clean(title)}`];
    if (clean(outcome)) lines.push(`Outcome: ${clean(outcome)}`);
    lines.push('## Case numbers', ...data.cases.map((r) => `- ${r.number}${r.subject ? ` (${r.subject})` : ''}: ${r.status}${r.disposition ? `, ${r.disposition}` : ''}${r.closed ? `, closed ${r.closed}` : ''}`));
    lines.push('## Suspects', ...(data.suspects.length ? data.suspects.map((r) => `- ${r.name}: ${r.outcome}${r.moved ? ` (continued in case ${r.moved})` : ''}${r.charges.length ? `; charges: ${r.charges.join('; ')}` : ''}`) : ['- (none identified)']));
    lines.push('## Buys', ...(data.buys.length ? [...data.buys.map((r) => `- ${r.name}: ${r.count} buy${r.count === 1 ? '' : 's'}, ${r.drugs || 'drugs not named'}, paid ${money(r.paid)}`), `- Total paid: ${money(data.totalPaid)}`] : ['- (no buys on the Timeline)']));
    lines.push('## Evidence', ...(data.evidence.length ? data.evidence.map((r) => `- ${r.number}: ${r.total} exhibit${r.total === 1 ? '' : 's'}, ${r.open} without a final disposition, ${r.noLab} without a lab result`) : ['- (no exhibits listed)']));
    if ((later || []).length) lines.push('## Since the Mission closed', ...later.map((l) => `- ${clean(l)}`));
    return lines.join('\n');
  }
  /** v1.184: the request for the Closing Summary memo. */
  function memoMessages(material, { behavior = '' } = {}) {
    return [
      { role: 'system', content: [
        'You write a short closing summary memo about a finished law-enforcement Mission, for a supervisor or a prosecutor.',
        '- Start with To:, From:, Date: and Re: lines; write [CONFIRM: …] for the ones the material doesn\'t give.',
        '- Then, in plain short paragraphs: what the Mission was and its outcome; each suspect and what became of them (arrested and charged, not prosecuted, continued in another case…); the case numbers and how each closed; the buys and the total paid; where the evidence stands; what is still open.',
        '- Use only the facts in the material. Never invent names, dates, amounts or charges; write [CONFIRM: …] instead.',
        '- Answer with the memo only.',
        behavior ? `\nHOUSE STYLE\n${behavior}` : '',
      ].filter(Boolean).join('\n') },
      { role: 'user', content: `MATERIAL\n${material}` },
    ];
  }

  const api = { rows, build, money, memoMaterial, memoMessages };
  if (isNode) module.exports = api;
  else root.CVMissionCloseout = api;
})(this);
