/* CaseVault — Ask AI: the chat's messages. Plain logic, no DOM: the tests run it under Node.
 *
 * The chat talks only to the AI on this computer (Ollama at 127.0.0.1, or the in-browser engine),
 * like Draft with AI. The conversation lives in this window; nothing is saved unless you save it to
 * a case. With a case chosen, its details, timeline and notes (and, if asked, the most relevant
 * passages of its files) go with each question so the AI can answer about the case.
 */
'use strict';

(function (root) {
  const SYSTEM = [
    'You are CaseVault\'s assistant for a law-enforcement investigator. You run entirely on this computer; nothing leaves it.',
    'Answer clearly and to the point, in Markdown (short paragraphs, lists and tables where they help).',
    'When CASE MATERIAL is given, answer about the case from it, and say where each fact comes from (a timeline entry, the notes, or a document and page). If the material does not say, say so. Never invent case facts, names, dates or numbers.',
    'For legal or policy questions, give general information and say to confirm with the prosecutor or the department\'s policy.',
  ].join('\n');

  const chars = (tokens) => Math.floor(tokens * 3.5);
  const clip = (s, n) => { s = String(s || '').trim(); return s.length > n ? `${s.slice(0, Math.max(0, n - 20))} …[shortened]` : s; };

  // "Case officer: Name, email, phone" lines from the Details tab's contacts.
  function contactLines(k) {
    if (!k) return [];
    const line = (role, p) => { const bits = p ? [p.name, p.email, p.phone].map((x) => String(x || '').trim()).filter(Boolean) : []; return bits.length ? `${role}: ${bits.join(', ')}` : null; };
    return [line('Case officer', k.officer), line((k.prosecutor && k.prosecutor.title) || 'Prosecutor', k.prosecutor),
      ...(Array.isArray(k.others) ? k.others : []).map((o) => line(String(o.role || '').trim() || 'Contact', o))];
  }

  /** The case as text: { caseObj, timeline, notes, passages: [{ docName, page, text }] } -> string. */
  function caseMaterial({ caseObj = null, timeline = null, notes = '', passages = [] } = {}, budget = 6000) {
    if (!caseObj) return '';
    const c = caseObj;
    const d = c.dates || {};
    const facts = [
      `Title: ${c.title || '(none)'}`, c.fileNumber ? `File number: ${c.fileNumber}` : null, `Case number: ${c.number || '(none)'}`,
      c.client ? `Client: ${c.client}` : null, `Status: ${c.status || ''}`, d.opened ? `Opened: ${d.opened}` : null,
      c.tags && c.tags.length ? `Tags: ${c.tags.join(', ')}` : null,
      c.agencyNumber ? `Agency case number: ${c.agencyNumber}` : null,
      Array.isArray(c.partners) && c.partners.length && root.CVDraft ? `LEO partners: ${root.CVDraft.partnersText(c.partners)}` : null,
      ...(Array.isArray(c.suspects) ? c.suspects : []).filter((x) => x && x.name).map((x) => `Suspect (${!x.role || x.role === 'Main' ? 'Primary' : x.role}): ${[x.name, x.dob ? `DOB ${x.dob}` : '', x.residence].filter(Boolean).join(', ')}`),
      ...contactLines(c.contacts),
    ].filter(Boolean).join('\n');
    const events = ((timeline && timeline.events) || []).map((e) => `- ${e.date}${e.time ? ` ${e.time}` : ''} ${e.kind === 'deadline' ? '[deadline] ' : ''}${e.title}${e.note ? ` (${String(e.note).replace(/\s+/g, ' ')})` : ''}`).join('\n');
    const parts = [`## Case details\n${facts}`];
    let left = budget - parts[0].length;
    if (events) { const t = `## Timeline\n${clip(events, Math.max(400, Math.floor(left * 0.35)))}`; parts.push(t); left -= t.length; }
    if (String(notes).trim()) { const t = `## Notes\n${clip(notes, Math.max(400, Math.floor(left * 0.45)))}`; parts.push(t); left -= t.length; }
    const docs = [];
    for (const p of passages || []) {
      const where = p.sheet != null ? `${p.sheet} row ${p.row}` : p.page ? `page ${p.page}` : '';
      const block = `[${p.docName}${where ? `, ${where}` : ''}]\n${p.text}`;
      if (block.length > left) break;
      left -= block.length;
      docs.push(block);
    }
    if (docs.length) parts.push(`## Passages from the case files\n${docs.join('\n\n')}`);
    return parts.join('\n\n');
  }

  /**
   * v1.184: a whole Mission as text: its suspects' outcomes and buys, then each case number's
   * material (as caseMaterial), sharing the budget. cases: [{ caseObj, timeline, notes, arrest: text }].
   */
  function missionMaterial({ title = '', summary = '', buys = '', cases = [] } = {}, budget = 9000) {
    const head = [`## Mission: ${title || '(no name)'} (${cases.length} case number${cases.length === 1 ? '' : 's'})`,
      summary ? `Suspects: ${summary}` : '', buys ? `### Buys (all case numbers)\n${buys}` : ''].filter(Boolean).join('\n\n');
    const each = Math.max(700, Math.floor((budget - head.length) / Math.max(1, cases.length)));
    const parts = cases.map((x) => {
      const c = x.caseObj || {};
      const body = caseMaterial({ caseObj: c, timeline: x.timeline, notes: x.notes }, each).replace(/^## /gm, '#### ');
      return `### Case ${c.number || '(no number)'}${c.status ? ` (${c.status})` : ''}\n${body}${x.arrest ? `\n#### Arrest report\n${x.arrest}` : ''}`;
    });
    return [head, ...parts].join('\n\n');
  }

  /**
   * The messages for one question. history: [{ role: 'user'|'assistant', content }] (earlier turns,
   * oldest first); material: the case text or ''. Older turns are dropped first when the window is
   * full; the case material and the question always go.
   */
  function buildMessages({ history = [], question, material = '', numCtx = 8192, system = SYSTEM }) {
    const answerRoom = Math.round(numCtx / 4);
    let budget = chars(numCtx - answerRoom) - system.length - String(question).length - String(material).length - 200;
    const kept = [];
    for (let i = history.length - 1; i >= 0; i--) {
      const m = history[i];
      const len = String(m.content || '').length + 20;
      if (len > budget) break;
      budget -= len;
      kept.unshift({ role: m.role, content: String(m.content || '') });
    }
    const user = material ? `CASE MATERIAL\n\n${material}\n\n---\n\nQUESTION\n\n${question}` : String(question);
    return [{ role: 'system', content: system }, ...kept, { role: 'user', content: user }];
  }

  /** The conversation as Markdown, for saving to a case. */
  function transcript(turns, { title = 'Ask AI', model = '', when = new Date() } = {}) {
    const lines = [`# ${title}`, '', `> AI-assisted conversation${model ? ` (${model})` : ''}, ${when.toLocaleString()}. Verify every fact against the source.`, ''];
    for (const t of turns) lines.push(`**${t.role === 'user' ? 'Question' : 'Answer'}:**`, '', String(t.content || '').trim(), '');
    return `${lines.join('\n').trim()}\n`;
  }

  const api = { SYSTEM, caseMaterial, missionMaterial, buildMessages, transcript };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVChat = api;
})(this);
