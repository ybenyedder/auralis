// ============================================================================
// SESSION SEQUENCING  —  next-track modelling (Markov + self-attention)
// ----------------------------------------------------------------------------
// The base engine scores each track ABSOLUTELY — it knows you like a song, not
// what should follow the one now playing. Two training-free mechanisms add the
// sequential context real players rely on:
//
//   1. TRANSITIONS (a Markov chain over your own history). We count how often you
//      actually played B right after A within a listening session. P(B|A) is a
//      local, privacy-preserving stand-in for collaborative "these go together"
//      data — learned only from YOUR sequences, no other users, no cloud.
//
//   2. SELF-ATTENTION over the current session (the parameter-free core of what a
//      SASRec/BERT4Rec transformer does). We summarise the last few tracks into a
//      context vector using scaled attention weights — softmax over each track's
//      similarity to the query (the track now playing). A one-off anomaly (a piano
//      interlude dropped into a rap set) gets a LOW attention weight and barely
//      moves the context, so the mix picks the vibe back up instead of veering off.
//      The attention kernel here is fixed (feeling-space similarity) rather than
//      learned — same mechanism, no weights to train.
//
// Everything is derived from the play_events already logged, so no schema change
// and no client change: the most recent events ARE the live session.
// ============================================================================

import { featureSimilarity, type FeatureVector } from "@/lib/auralis/reco";
import { softmax } from "@/lib/auralis/vector";

const MINUTE = 60_000;
const SESSION_GAP_MS = 30 * MINUTE; // a >30-min silence starts a new session
const DAY = 86_400_000;
const TRANSITION_HALF_LIFE_MS = 30 * DAY; // old habits fade
const ATTENTION_WINDOW = 8; // how many recent tracks the attention head sees
const ATTENTION_TEMP = 3.0; // sharpness of the attention distribution

export interface SessionEvent {
  trackhash: string;
  played_at: number;
  kind: string; // 'complete' | 'skip'
}

export interface SessionModel {
  /** The track now anchoring the session (most recent event), or null. */
  lastHash: string | null;
  /** Attention-summarised "where the session is right now" in feeling-space. */
  contextVec: FeatureVector | null;
  /** Markov continuation strength for a candidate: how strongly it tends to
   *  follow the recent tracks in your own history. 0 when unseen. */
  transitionAffinity(hash: string): number;
}

const decay = (age: number, hl: number) => (age <= 0 ? 1 : Math.pow(0.5, age / hl));

/**
 * Build the session model from the (unordered) event window + each track's
 * feeling vector. Cheap: one sort + two linear passes.
 */
export function buildSession(events: SessionEvent[], featById: Map<string, FeatureVector | null>, now: number): SessionModel {
  if (events.length === 0) return { lastHash: null, contextVec: null, transitionAffinity: () => 0 };

  const ordered = [...events].sort((a, b) => a.played_at - b.played_at);

  // --- Markov transition counts over consecutive completes within a session. ---
  // from → (to → weight). Skips break the "and then I chose B" logic, so only
  // completed listens seed a transition edge.
  const trans = new Map<string, Map<string, number>>();
  let prev: SessionEvent | null = null;
  for (const e of ordered) {
    if (e.kind === "complete") {
      if (prev && e.played_at - prev.played_at <= SESSION_GAP_MS && prev.trackhash !== e.trackhash) {
        const w = decay(now - e.played_at, TRANSITION_HALF_LIFE_MS);
        let m = trans.get(prev.trackhash);
        if (!m) trans.set(prev.trackhash, (m = new Map()));
        m.set(e.trackhash, (m.get(e.trackhash) ?? 0) + w);
      }
      prev = e;
    } else {
      // A skip anchors the "current position" for recency but can't be a source.
      // Drop the anchor if the gap since it broke the session window.
      const gap = prev ? e.played_at - prev.played_at : Infinity;
      if (gap > SESSION_GAP_MS) prev = null;
    }
  }

  // Recent source tracks (most-recent completes), each weighted by recency, that
  // define "what am I likely to want next".
  const recentSources: { hash: string; w: number }[] = [];
  for (let i = ordered.length - 1; i >= 0 && recentSources.length < 4; i--) {
    if (ordered[i].kind === "complete") {
      recentSources.push({ hash: ordered[i].trackhash, w: decay(now - ordered[i].played_at, SESSION_GAP_MS * 4) });
    }
  }

  // Normalise each source row so a candidate's transition affinity is a proper
  // conditional probability blended over the recent sources.
  const transAffinity = (hash: string): number => {
    let acc = 0;
    let wsum = 0;
    for (const s of recentSources) {
      const row = trans.get(s.hash);
      if (!row) continue;
      let rowTotal = 0;
      for (const v of row.values()) rowTotal += v;
      if (rowTotal <= 0) continue;
      acc += s.w * ((row.get(hash) ?? 0) / rowTotal);
      wsum += s.w;
    }
    return wsum > 0 ? acc / wsum : 0;
  };

  // --- Self-attention context vector over the last ATTENTION_WINDOW tracks. ---
  const recent: { vec: FeatureVector; hash: string }[] = [];
  for (let i = ordered.length - 1; i >= 0 && recent.length < ATTENTION_WINDOW; i--) {
    const v = featById.get(ordered[i].trackhash) ?? null;
    if (v) recent.push({ vec: v, hash: ordered[i].trackhash });
  }
  let contextVec: FeatureVector | null = null;
  const lastHash = ordered[ordered.length - 1]?.trackhash ?? null;
  if (recent.length > 0) {
    const query = recent[0].vec; // the track now playing is the attention query
    // logits = similarity(query, key) / temperature, sharpened by softmax.
    const logits = recent.map((r) => featureSimilarity(query, r.vec) * ATTENTION_TEMP);
    const attn = softmax(logits);
    let a = 0, val = 0, e = 0, t = 0;
    for (let i = 0; i < recent.length; i++) {
      a += recent[i].vec.arousal * attn[i];
      val += recent[i].vec.valence * attn[i];
      e += recent[i].vec.energy * attn[i];
      t += recent[i].vec.tempo * attn[i];
    }
    contextVec = { arousal: a, valence: val, energy: e, tempo: t };
  }

  return { lastHash, contextVec, transitionAffinity: transAffinity };
}

/** How well a candidate continues the current session: its feeling-space match to
 *  the attention context (where the session sits right now). 0 with no session. */
export function sessionAffinity(candidate: FeatureVector | null, model: SessionModel): number {
  if (!candidate || !model.contextVec) return 0;
  return featureSimilarity(candidate, model.contextVec);
}
