// ============================================================================
// SLATE DIVERSITY  —  Maximal Marginal Relevance (MMR)
// ----------------------------------------------------------------------------
// Taking the top-N by score alone produces a monotonous wall of near-identical
// tracks (10 songs from the same sub-genre in a row). A recommendation is a SLATE,
// not N independent picks, so we re-rank greedily by MMR:
//
//     MMR(i) = λ · relevance(i) − (1−λ) · max_{j∈chosen} similarity(i, j)
//
// At each step we add the candidate with the best trade-off between matching the
// user's taste (relevance) and being unlike what's already in the slate
// (novelty). λ near 1 keeps it faithful to the ranking; lower λ lets the mix
// "breathe". This is the deterministic, training-free core of what a slate-level
// RL policy learns — order a set for the whole session, not each item alone.
// ============================================================================

export interface RankItem {
  trackhash: string;
  score: number;
}

/**
 * Re-rank `items` (already sorted best-first) for diversity. `simFn(a, b)` returns
 * 0..1 similarity between two trackhashes (feeling / embedding space). `lambda`
 * biases relevance-vs-novelty; `k` bounds the output. A modest candidate pool
 * (top `poolCap`) keeps this O(k·pool) rather than O(k·N) on huge libraries.
 */
export function mmrRerank(
  items: RankItem[],
  simFn: (a: string, b: string) => number,
  lambda = 0.78,
  k = items.length,
  poolCap = 400,
): RankItem[] {
  const pool = items.slice(0, Math.min(poolCap, items.length));
  if (pool.length <= 2 || lambda >= 1) return items.slice(0, k);

  // Normalise relevance to 0..1 within the pool so it's comparable to similarity.
  const scores = pool.map((p) => p.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = max - min || 1;
  const rel = new Map<string, number>();
  for (const p of pool) rel.set(p.trackhash, (p.score - min) / span);

  const chosen: RankItem[] = [];
  const remaining = new Set(pool.map((p) => p.trackhash));
  const byHash = new Map(pool.map((p) => [p.trackhash, p]));

  // Seed with the single most relevant track.
  const first = pool[0];
  chosen.push(first);
  remaining.delete(first.trackhash);

  const limit = Math.min(k, pool.length);
  while (chosen.length < limit && remaining.size > 0) {
    let bestHash: string | null = null;
    let bestMmr = -Infinity;
    for (const h of remaining) {
      let maxSim = 0;
      for (const c of chosen) {
        const s = simFn(h, c.trackhash);
        if (s > maxSim) maxSim = s;
      }
      const mmr = lambda * (rel.get(h) ?? 0) - (1 - lambda) * maxSim;
      if (mmr > bestMmr) {
        bestMmr = mmr;
        bestHash = h;
      }
    }
    if (!bestHash) break;
    const pick = byHash.get(bestHash);
    if (pick) chosen.push(pick);
    remaining.delete(bestHash);
  }

  // Append any leftover pool tail (beyond k we don't reorder) + the rest of items.
  const chosenSet = new Set(chosen.map((c) => c.trackhash));
  const tail = items.filter((i) => !chosenSet.has(i.trackhash));
  return [...chosen, ...tail].slice(0, k);
}
