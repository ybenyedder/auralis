// ============================================================================
// MUSIC KNOWLEDGE GRAPH  —  the GNN-equivalent (spreading activation)
// ----------------------------------------------------------------------------
// Audio features can't see that two very different-SOUNDING tracks belong to the
// same musical world (same artist, scene, era, mood). Collaborative filtering
// captures that from crowds; with no crowd we build a local KNOWLEDGE GRAPH and
// propagate taste across it — the training-free twin of a Graph Neural Network's
// message passing.
//
// Nodes: tracks + attribute nodes (artist, genre, decade, mood). Edges: a track
// to each of its attributes. We seed activation on the tracks you like/finish and
// run two hops of degree-normalised propagation (personalised-PageRank style):
//
//     track → attribute (spread your taste onto the artists/genres/eras you love)
//     attribute → track (pull in every track that shares those attributes)
//
// Degree normalisation (÷√deg) stops a giant "pop" genre node from drowning the
// signal, so a niche artist you love counts for more than a broad tag. The result
// is a `graphAffinity` per track: high for tracks culturally adjacent to your
// taste even when their audio sits nowhere near your centroid.
// ============================================================================

interface GraphTrackRow {
  trackhash: string;
  artisthash: string | null;
  genre: string | null;
  year: number | null;
  mood: string | null;
}

// Relative pull of each attribute type. Same artist ≫ same mood > same genre >
// same era — tuned so the graph expresses "musical kinship", not just "both are pop".
const EDGE_WEIGHT = { artist: 1.0, mood: 0.5, genre: 0.42, decade: 0.3 } as const;

function attributesOf(t: GraphTrackRow): { id: string; w: number }[] {
  const attrs: { id: string; w: number }[] = [];
  if (t.artisthash) attrs.push({ id: "a:" + t.artisthash, w: EDGE_WEIGHT.artist });
  if (t.mood) attrs.push({ id: "m:" + t.mood, w: EDGE_WEIGHT.mood });
  if (t.genre) attrs.push({ id: "g:" + t.genre.toLowerCase().trim(), w: EDGE_WEIGHT.genre });
  if (t.year && t.year > 0) attrs.push({ id: "d:" + Math.floor(t.year / 10), w: EDGE_WEIGHT.decade });
  return attrs;
}

/**
 * Compute each track's cultural affinity to a seeded taste. `seeds` maps a
 * trackhash to how much the user likes it (the positive aggregate weight). Returns
 * a Map of trackhash → affinity in 0..1 (max-normalised). Empty when there are no
 * seeds (cold start) so the caller's graph term contributes nothing.
 */
export function buildGraphAffinity(tracks: GraphTrackRow[], seeds: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  if (seeds.size === 0 || tracks.length === 0) return out;

  // --- Degrees (how many tracks touch each attribute node). ---
  const nodeDegree = new Map<string, number>();
  const trackAttrs = new Map<string, { id: string; w: number }[]>();
  for (const t of tracks) {
    const attrs = attributesOf(t);
    trackAttrs.set(t.trackhash, attrs);
    for (const a of attrs) nodeDegree.set(a.id, (nodeDegree.get(a.id) ?? 0) + 1);
  }

  // --- Hop 1: tracks → attribute nodes (degree-normalised spread of the seed). ---
  const nodeAct = new Map<string, number>();
  for (const [hash, seedW] of seeds) {
    const attrs = trackAttrs.get(hash);
    if (!attrs || seedW <= 0) continue;
    for (const a of attrs) {
      const deg = nodeDegree.get(a.id) ?? 1;
      nodeAct.set(a.id, (nodeAct.get(a.id) ?? 0) + (seedW * a.w) / Math.sqrt(deg));
    }
  }

  // --- Hop 2: attribute nodes → tracks (pull activation back, degree-normalised). ---
  let max = 0;
  for (const t of tracks) {
    const attrs = trackAttrs.get(t.trackhash);
    if (!attrs) continue;
    let score = 0;
    for (const a of attrs) {
      const act = nodeAct.get(a.id);
      if (!act) continue;
      const deg = nodeDegree.get(a.id) ?? 1;
      score += (act * a.w) / Math.sqrt(deg);
    }
    if (score > 0) {
      out.set(t.trackhash, score);
      if (score > max) max = score;
    }
  }

  // Max-normalise to 0..1 so the engine's W_GRAPH weight has a predictable range.
  if (max > 0) for (const [k, v] of out) out.set(k, v / max);
  return out;
}
