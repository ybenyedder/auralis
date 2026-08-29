// ============================================================================
// TASTE CLUSTERS  —  the fix for the "single centroid lands on tepid pop" flaw
// ----------------------------------------------------------------------------
// The base engine models a user's positive taste as ONE centroid in feeling-space.
// That's a bug for anyone with split tastes: love calm jazz AND furious metal and
// the mean sits in the lukewarm middle, boosting exactly the mid-energy pop you'd
// never choose. We instead fit up to K weighted clusters (K-means++), so a user
// has SEVERAL taste pockets, and a candidate's content score is its proximity to
// the NEAREST pocket — never the average of contradictory ones.
//
// Operates on the existing 4-D FeatureVector via reco.ts's tuned distance, so with
// a single coherent taste (K collapses to 1) it reproduces the old behaviour
// exactly. Deterministic: the K-means++ seeding uses a data-seeded PRNG (no
// Math.random), so the same history always yields the same clusters — required
// for stable recs and for the engine's per-request memoisation.
// ============================================================================

import { featureDistance, featureSimilarity, type FeatureVector } from "@/lib/auralis/reco";

export interface WeightedPoint {
  vec: FeatureVector;
  weight: number;
}

export interface TasteCluster {
  centroid: FeatureVector;
  /** Total feedback weight that fell into this pocket (its strength). */
  weight: number;
}

// A tiny deterministic PRNG (mulberry32). Seeded from the data so clustering is
// reproducible run-to-run without pulling in Math.random (which would also break
// the engine's resume/memoisation guarantees).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(points: WeightedPoint[]): number {
  // Fold the points into a stable 32-bit seed (order-independent-ish, cheap).
  let h = 2166136261;
  for (const p of points) {
    const v = p.vec;
    h = (Math.imul(h, 16777619) ^ Math.round((v.arousal + v.valence + v.energy + v.tempo + p.weight) * 997)) >>> 0;
  }
  return h || 1;
}

const centroidOf = (pts: WeightedPoint[]): FeatureVector => {
  let a = 0, v = 0, e = 0, t = 0, w = 0;
  for (const p of pts) {
    a += p.vec.arousal * p.weight;
    v += p.vec.valence * p.weight;
    e += p.vec.energy * p.weight;
    t += p.vec.tempo * p.weight;
    w += p.weight;
  }
  if (w === 0) return { arousal: 0.5, valence: 0.5, energy: 0.5, tempo: 0.5 };
  return { arousal: a / w, valence: v / w, energy: e / w, tempo: t / w };
};

/** Choose K from the amount of evidence: never more clusters than the taste can
 *  actually support (≥3 weighted points per cluster), capped at 4 pockets. */
function chooseK(points: WeightedPoint[]): number {
  const n = points.length;
  if (n <= 2) return 1;
  return Math.max(1, Math.min(4, Math.floor(n / 3)));
}

/**
 * Fit up to K taste clusters over the user's positively-weighted tracks. Returns
 * a single cluster (the plain centroid) for small/coherent histories, so the
 * downstream content score degrades smoothly to the original behaviour.
 */
export function fitTasteClusters(points: WeightedPoint[]): TasteCluster[] {
  const pts = points.filter((p) => p.weight > 0);
  if (pts.length === 0) return [];
  const k = chooseK(pts);
  if (k === 1) return [{ centroid: centroidOf(pts), weight: pts.reduce((s, p) => s + p.weight, 0) }];

  const rng = mulberry32(seedFrom(pts));

  // --- K-means++ seeding: spread the initial centres by distance² (weighted). ---
  const centroids: FeatureVector[] = [];
  centroids.push(pts[Math.floor(rng() * pts.length)].vec);
  while (centroids.length < k) {
    const d2: number[] = pts.map((p) => {
      let best = Infinity;
      for (const c of centroids) best = Math.min(best, featureDistance(p.vec, c));
      return best * p.weight;
    });
    const total = d2.reduce((s, x) => s + x, 0);
    if (total <= 0) break;
    let r = rng() * total;
    let idx = 0;
    for (; idx < d2.length; idx++) {
      r -= d2[idx];
      if (r <= 0) break;
    }
    centroids.push(pts[Math.min(idx, pts.length - 1)].vec);
  }

  // --- Lloyd iterations (weighted assignment → weighted re-centre). ---
  const assign = new Array<number>(pts.length).fill(0);
  for (let iter = 0; iter < 16; iter++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const dd = featureDistance(pts[i].vec, centroids[c]);
        if (dd < bestD) {
          bestD = dd;
          best = c;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        moved = true;
      }
    }
    for (let c = 0; c < centroids.length; c++) {
      const members = pts.filter((_, i) => assign[i] === c);
      if (members.length) centroids[c] = centroidOf(members);
    }
    if (!moved && iter > 0) break;
  }

  // Emit non-empty clusters with their accumulated weight.
  const out: TasteCluster[] = [];
  for (let c = 0; c < centroids.length; c++) {
    const members = pts.filter((_, i) => assign[i] === c);
    const w = members.reduce((s, p) => s + p.weight, 0);
    if (w > 0) out.push({ centroid: centroids[c], weight: w });
  }
  return out.length ? out : [{ centroid: centroidOf(pts), weight: pts.reduce((s, p) => s + p.weight, 0) }];
}

/**
 * Content-fit of a track against a clustered taste: similarity to the NEAREST
 * pocket, with a gentle lift for pockets the user leans into more (weight share).
 * Returns 0 when there are no clusters (cold start) — identical to the base
 * engine's "no positive centroid yet" case.
 */
export function clusterAffinity(v: FeatureVector, clusters: TasteCluster[]): number {
  if (clusters.length === 0) return 0;
  const total = clusters.reduce((s, c) => s + c.weight, 0) || 1;
  let best = 0;
  for (const c of clusters) {
    const sim = featureSimilarity(v, c.centroid);
    // 0.8..1.0 multiplier by how dominant this pocket is — a match to your main
    // taste counts a touch more than a match to a fringe one, but never zeroes a
    // real match (so niche pockets still surface).
    const share = c.weight / total;
    const lift = 0.8 + 0.2 * share;
    const s = sim * lift;
    if (s > best) best = s;
  }
  return best;
}
