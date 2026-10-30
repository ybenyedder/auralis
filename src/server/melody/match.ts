// Melody matching for "hum to search" — subsequence DTW over pitch intervals.
//
// The user's humming is transposed (people hum in whatever key), slightly
// out-of-tune and at a different tempo, so we compare FIRST DIFFERENCES of the
// semitone contour (transposition-invariant) with a free-start/free-end DTW
// (tempo-elastic: the query can match ANY window of the track).
//
// Pure module — no I/O.

const GAP_PENALTY = 0.12; // discourage pathological stretching
const COST_CLIP = 3; // semitones — an octave-jump glitch costs the same as a big miss

/** Normalised similarity of the query to a window of the target, in [0, 1].
 *  1 ≈ identical intervals, ≤ 0.2 ≈ unrelated. */
export function dtwScore(queryDeltas: Float32Array, targetDeltas: Float32Array): number {
  const m = queryDeltas.length;
  const n = targetDeltas.length;
  if (m < 4 || n < 4) return 0;

  const INF = 1e9;
  let prev = new Float32Array(n + 1);
  let cur = new Float32Array(n + 1);
  // Free start: the query may begin anywhere in the target.
  prev.fill(0);

  for (let i = 1; i <= m; i++) {
    cur[0] = INF;
    const q = queryDeltas[i - 1];
    for (let j = 1; j <= n; j++) {
      const diff = Math.abs(q - targetDeltas[j - 1]);
      // Concave cost: a 1-semitone interval miss already costs 0.58 (not 0.33),
      // which keeps repeating step patterns from loosely matching everything.
      const cost = Math.sqrt(Math.min(diff, COST_CLIP) / COST_CLIP);
      const diag = prev[j - 1];
      const up = prev[j] + GAP_PENALTY;
      const left = cur[j - 1] + GAP_PENALTY;
      cur[j] = cost + Math.min(diag, up, left);
    }
    const swap = prev;
    prev = cur;
    cur = swap;
  }

  // Free end: best alignment ending anywhere in the target.
  let best = INF;
  for (let j = 1; j <= n; j++) if (prev[j] < best) best = prev[j];
  if (!Number.isFinite(best)) return 0;
  return Math.max(0, Math.min(1, 1 - best / m));
}

export interface MelodyCandidate {
  id: string;
  deltas: Float32Array;
  histogram: Uint8Array;
}

export interface MelodyMatch {
  id: string;
  score: number;
}

/** Rank candidates against a hummed query: cheap histogram pre-filter to a
 *  shortlist, then subsequence DTW on the survivors. */
export function matchMelody(
  queryDeltas: Float32Array,
  queryHistogram: Uint8Array,
  candidates: Iterable<MelodyCandidate>,
  opts: { shortlist?: number; results?: number } = {},
): MelodyMatch[] {
  const shortlistSize = opts.shortlist ?? 250;
  const resultCount = opts.results ?? 8;

  // Pre-filter by interval-histogram distance (also discards candidates too
  // short to ever host the query).
  const ranked: { id: string; pre: number; deltas: Float32Array }[] = [];
  for (const candidate of candidates) {
    if (candidate.deltas.length < queryDeltas.length * 0.5) continue;
    ranked.push({ id: candidate.id, pre: histogramDistance(queryHistogram, candidate.histogram), deltas: candidate.deltas });
  }
  ranked.sort((a, b) => a.pre - b.pre);

  const matches: MelodyMatch[] = [];
  for (const candidate of ranked.slice(0, shortlistSize)) {
    const score = dtwScore(queryDeltas, candidate.deltas);
    if (score > 0.15) matches.push({ id: candidate.id, score: Number(score.toFixed(4)) });
  }
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, resultCount);
}

function histogramDistance(a: Uint8Array, b: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / (255 * a.length);
}
