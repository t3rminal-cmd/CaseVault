/* CaseVault — Terminology (v1.183): the words of the trade and what they mean: drug slang, quantity
 * slang, abbreviations, statutes, local place names. A short list is built in (general terms only);
 * your own are kept in vault.json on the SSD (settings.terms). Only the terms a text uses go to the
 * AI with it (Ask AI, Draft with AI, Ask AI to Edit), so it stays fast; drug slang you mark "Same
 * as a drug" also counts as that drug for the Consistency Checker and Smart Paste ("girl" and
 * "cocaine" in two reports are the same drug).
 *
 * Plain logic, no DOM: the tests run it under Node.
 */
'use strict';

(function (root) {
  const clean = (v) => String(v == null ? '' : v).trim();
  const KINDS = ['Drug slang', 'Quantity', 'Abbreviation', 'Statute', 'Place', 'Other'];

  // General terms only (nothing about any case or agency). Drug slang here is for the AI's
  // understanding; slang that is also an everyday word ("gas", "dope") is not matched as a drug.
  const BUILTIN = [
    ['8-ball', 'one eighth of an ounce, about 3.5 grams', 'Quantity'], ['eight ball', 'one eighth of an ounce, about 3.5 grams', 'Quantity'],
    ['teener', 'one sixteenth of an ounce, about 1.75 grams', 'Quantity'], ['zip', 'one ounce, about 28 grams', 'Quantity'],
    ['half zip', 'half an ounce, about 14 grams', 'Quantity'], ['QP', 'a quarter pound, about 113 grams', 'Quantity'],
    ['brick', 'a kilogram (about 1,000 grams), pressed', 'Quantity'], ['key', 'a kilogram (about 1,000 grams)', 'Quantity'],
    ['dime bag', 'a small bag sold for $10', 'Quantity'], ['nickel bag', 'a small bag sold for $5', 'Quantity'],
    ['yayo', 'cocaine', 'Drug slang', 'cocaine'], ['blow', 'cocaine', 'Drug slang'], ['girl', 'cocaine', 'Drug slang'], ['rock', 'crack cocaine', 'Drug slang'],
    ['fetty', 'fentanyl', 'Drug slang', 'fentanyl'], ['fent', 'fentanyl', 'Drug slang', 'fentanyl'], ['boy', 'heroin', 'Drug slang'],
    ['tina', 'methamphetamine', 'Drug slang'], ['glass', 'methamphetamine', 'Drug slang'], ['shards', 'methamphetamine', 'Drug slang', 'methamphetamine'],
    ['loud', 'high-grade cannabis', 'Drug slang'], ['kush', 'cannabis', 'Drug slang', 'cannabis'], ['blues', 'counterfeit oxycodone (M30) pills, often fentanyl', 'Drug slang'],
    ['SA', 'Special Agent', 'Abbreviation'], ['TFO', 'Task Force Officer', 'Abbreviation'], ['GS', 'Group Supervisor', 'Abbreviation'],
    ['UC', 'undercover officer', 'Abbreviation'], ['CI', 'confidential informant', 'Abbreviation'], ['CS', 'confidential source', 'Abbreviation'],
    ['ASA', 'Assistant State\'s Attorney', 'Abbreviation'], ['AUSA', 'Assistant United States Attorney', 'Abbreviation'],
    ['NADDIS', 'the DEA\'s Narcotics and Dangerous Drugs Information System', 'Abbreviation'], ['ILCS', 'Illinois Compiled Statutes', 'Abbreviation'],
    ['OAF', 'official advanced funds (buy money)', 'Abbreviation'], ['PC', 'probable cause', 'Abbreviation'],
  ].map(([term, meaning, kind, drug]) => ({ term, meaning, kind, ...(drug ? { drug } : {}), builtin: true }));

  /** One of your terms, tidied. */
  function normalize(x) {
    const o = { term: clean(x && x.term).slice(0, 60), meaning: clean(x && x.meaning).slice(0, 300), kind: KINDS.includes(x && x.kind) ? x.kind : 'Other' };
    if (x && clean(x.drug)) o.drug = clean(x.drug).toLowerCase();
    return o;
  }
  /** The built-in terms and yours (yours win when the term is the same). */
  function all(mine = []) {
    const own = (mine || []).map(normalize).filter((x) => x.term && x.meaning);
    const keys = new Set(own.map((x) => x.term.toLowerCase()));
    return [...BUILTIN.filter((x) => !keys.has(x.term.toLowerCase())), ...own];
  }
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Abbreviations match in capitals only ("CI", not "ci"); other terms in any case, as whole words.
  const reOf = (t) => (t.kind === 'Abbreviation' || /^[A-Z0-9]{2,}$/.test(t.term)
    ? new RegExp(`(^|[^\\w])${esc(t.term)}(?![\\w])`)
    : new RegExp(`(^|[^\\w])${esc(t.term)}(?![\\w])`, 'i'));
  /** The terms a text uses. */
  function termsIn(text, list) {
    const t = String(text || '');
    if (!t.trim()) return [];
    return (list || []).filter((x) => reOf(x).test(t));
  }
  /** The terms as a short list for the AI (meanings, not facts of the case). */
  function glossaryText(terms) {
    if (!(terms || []).length) return '';
    return terms.map((x) => `- ${x.term}: ${x.meaning}`).join('\n');
  }
  /**
   * Slang that counts as a drug for the checks: [[drug, RegExp]], from the terms with a drug set
   * (yours, or the built-in ones that aren't everyday words).
   */
  function drugWords(list) {
    const out = new Map();
    for (const x of list || []) {
      if (!x.drug) continue;
      if (!out.has(x.drug)) out.set(x.drug, []);
      out.get(x.drug).push(esc(x.term));
    }
    return [...out.entries()].map(([drug, words]) => [drug, new RegExp(`\\b(?:${words.join('|')})\\b`, 'i')]);
  }

  /* ---------- browser ---------- */
  const mineNow = () => (typeof Vault !== 'undefined' && Vault.data && Vault.data.settings && Array.isArray(Vault.data.settings.terms) ? Vault.data.settings.terms : []);
  /** The glossary block for a request: the terms used in these texts, or '' when none. */
  function forText(...texts) {
    const used = termsIn(texts.join('\n'), all(mineNow()));
    return used.length ? `## Terms (what these words mean here; not facts of the case)\n${glossaryText(used)}` : '';
  }
  const drugWordsNow = () => drugWords(all(mineNow()));

  const api = { KINDS, BUILTIN, normalize, all, termsIn, glossaryText, drugWords, forText, drugWordsNow, mine: mineNow };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVTerms = api;
})(this);
