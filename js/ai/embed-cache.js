/* CaseVault — passage-search memory (v1.185). The passage-search model turns each passage into
 * numbers (an embedding) so passages can be found by meaning; that is the slow part of Checks, Ask
 * AI's file search, Draft with AI and Search All Cases on a PC without a graphics card. Each passage's
 * numbers are kept on the SSD (CaseVault-Data\ai-cache\embeddings\<model>), found again by a
 * fingerprint of the passage's text, so a passage is only ever worked out once per model. Nothing
 * else is kept: the fingerprint can't be turned back into the text.
 *
 * The plain logic (fingerprint, shard, rounding) has no DOM: the tests run it under Node.
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;

  /** A 16-hex-digit fingerprint of a text (two FNV-1a hashes). */
  function fingerprint(text) {
    const s = String(text || '');
    let a = 0x811c9dc5; let b = 0x01000193 ^ s.length;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193) >>> 0;
      b = Math.imul(b ^ c ^ (i & 0xff), 0x01000193) >>> 0;
    }
    return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
  }
  /** Which of the 256 files a fingerprint is kept in. */
  const shardOf = (fp) => fp.slice(0, 2);
  /** The numbers, shortened to 4 decimals (a third of the space, the same ranking). */
  const compact = (vec) => (vec || []).map((x) => Math.sign(x) * Math.round(Math.abs(x) * 1e4) / 1e4);

  /**
   * The embeddings of texts, from the memory first, the engine for the rest. store: { read(shard) ->
   * {fp: vec} | null, write(shard, map) }; compute(texts) -> vectors. -> vectors, in order.
   */
  async function embedWith(texts, { store, compute, memo = new Map(), batch = 32 }) {
    const fps = texts.map(fingerprint);
    const out = new Array(texts.length);
    const shards = new Map();
    const loadShard = async (sh) => {
      if (!shards.has(sh)) shards.set(sh, { map: (await store.read(sh).catch(() => null)) || {}, dirty: false });
      return shards.get(sh);
    };
    const missing = new Map(); // fingerprint -> the places it goes (the same text twice is worked out once)
    for (let i = 0; i < texts.length; i++) {
      if (memo.has(fps[i])) { out[i] = memo.get(fps[i]); continue; }
      const sh = await loadShard(shardOf(fps[i]));
      const v = sh.map[fps[i]];
      if (v) { memo.set(fps[i], v); out[i] = v; } else missing.set(fps[i], [...(missing.get(fps[i]) || []), i]);
    }
    const todo = [...missing.entries()];
    for (let k = 0; k < todo.length; k += batch) {
      const part = todo.slice(k, k + batch);
      const vecs = await compute(part.map(([, at]) => texts[at[0]]));
      part.forEach(([fp, at], j) => {
        const v = compact(vecs[j]);
        for (const i of at) out[i] = v;
        memo.set(fp, v);
        const sh = shards.get(shardOf(fp));
        sh.map[fp] = v; sh.dirty = true;
      });
    }
    for (const [sh, x] of shards) if (x.dirty) await store.write(sh, x.map).catch(() => {});
    return out;
  }

  /* ---------- browser ---------- */
  const memos = new Map(); // model -> Map(fingerprint -> vector), this visit
  /** The embeddings of texts with a model on the engine at base, kept on the SSD. */
  function embed(texts, { base, model, fetchImpl, keepAlive }) {
    if (!memos.has(model)) memos.set(model, new Map());
    const compute = async (list) => {
      const res = await (fetchImpl || ((...a) => globalThis.fetch(...a)))(`${base}/api/embed`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: list, ...(keepAlive ? { keep_alive: keepAlive } : {}) }) });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()).embeddings;
    };
    const store = typeof Vault !== 'undefined' && Vault.readEmbedShard
      ? { read: (sh) => Vault.readEmbedShard(model, sh), write: (sh, map) => Vault.writeEmbedShard(model, sh, map) }
      : { read: async () => null, write: async () => {} };
    return embedWith(texts, { store, compute, memo: memos.get(model) });
  }

  const api = { fingerprint, shardOf, compact, embedWith, embed };
  if (isNode) module.exports = api;
  else root.CVEmbedCache = api;
})(this);
