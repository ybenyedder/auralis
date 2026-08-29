// ============================================================================
// DEEP AUDIO EMBEDDINGS  —  timbre/texture beyond the 4-D feeling vector
// ----------------------------------------------------------------------------
// arousal/valence/energy/tempo can't tell death metal from hardcore techno: same
// BPM, same loudness, opposite worlds. A learned audio embedding can, because it
// encodes TIMBRE and instrumentation. Those come from the optional Python
// extractor (scripts/extract_embeddings.py — librosa/OpenL3 + optional Demucs
// stems) and land in `tracks.embedding` as a packed Float32 blob, uniform length
// across the library.
//
// This module is the graceful bridge: when embeddings exist we add a deep-timbre
// term to scoring (cosine to the user's liked-embedding centroid); when they
// don't — the common case, extractor never run — every function returns null/0 and
// the engine runs exactly as before on the 4-D vector. Nothing here is required
// for the app to work; it's pure upside where the data is present.
// ============================================================================

import { cosine, normalize, unpackFloat32, weightedMean } from "@/lib/auralis/vector";

/** Decode a track's stored embedding blob to a unit vector, or null if absent. */
export function decodeEmbedding(blob: Buffer | Uint8Array | null | undefined): number[] | null {
  const v = unpackFloat32(blob);
  if (!v || v.length === 0) return null;
  return normalize(v);
}

/** The user's liked-embedding centroid: the weighted mean of the (unit) deep
 *  vectors of the tracks they finish/like, re-normalised. Null when fewer than a
 *  couple of the positive tracks actually have an embedding. */
export function deepCentroid(seeds: Map<string, number>, deepById: Map<string, number[] | null>): number[] | null {
  const vecs: number[][] = [];
  const weights: number[] = [];
  for (const [hash, w] of seeds) {
    const v = deepById.get(hash);
    if (v && w > 0) {
      vecs.push(v);
      weights.push(w);
    }
  }
  if (vecs.length < 2) return null; // not enough deep evidence to trust a centroid
  const mean = weightedMean(vecs, weights);
  return mean ? normalize(mean) : null;
}

/** Deep-timbre affinity of a candidate to the taste centroid, in 0..1 (negative
 *  cosine clamped to 0). 0 when either side lacks an embedding. */
export function deepAffinity(candidate: number[] | null, centroid: number[] | null): number {
  if (!candidate || !centroid) return 0;
  const c = cosine(candidate, centroid);
  return c > 0 ? c : 0;
}

/** Parse the optional per-stem feature summary the extractor writes to
 *  `tracks.stems` (JSON). Returned for API/telemetry use; the deep term already
 *  folds stem texture into the embedding when the extractor appended it. */
export interface StemSummary {
  vocals: number;
  bass: number;
  drums: number;
  other: number;
}
export function parseStems(json: string | null | undefined): StemSummary | null {
  if (!json) return null;
  try {
    const o = JSON.parse(json);
    const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
    return { vocals: num(o.vocals), bass: num(o.bass), drums: num(o.drums), other: num(o.other) };
  } catch {
    return null;
  }
}
