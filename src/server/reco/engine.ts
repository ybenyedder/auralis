// ============================================================================
// TASTE ENGINE  —  feedback-driven recommendations
// ----------------------------------------------------------------------------
// Learns a per-user taste profile from real listening feedback and scores every
// track against it. The signals, oldest-to-strongest:
//
//   complete listen  → positive, scaled by how much of the track was heard
//   skip             → negative, stronger the earlier the bail
//   favourite (like) → strong positive
//   dislike          → strong negative + HARD exclude from every recommendation
//
// Every signal decays with a ~3-week half-life, so the engine tracks where your
// taste is *now*, not a year ago. Each track is scored on four axes:
//
//   direct   — your own history with THIS exact track (finished vs skipped)
//   content  — how close the track sits, in audio feeling-space (energy/bpm/mood),
//              to the centre of what you complete/like (and away from what you skip)
//   mood     — your standing affinity for the track's mood bucket
//   explore  — a gentle nudge toward under-heard tracks, minus a short-term
//              "you just heard this" penalty so the mix doesn't loop
//
// The content axis is what makes a single skip generalise: skip a few high-energy
// party tracks and the whole high-arousal corner of your library cools down, even
// titles you've never played. That's the "use audio data (energy/bpm)" goal.
// ============================================================================

import { getDb } from "../db";
import {
  featureVector,
  featureSimilarity,
  recoMood,
  type FeatureVector,
  type RecoTrack,
  type RecoProfile,
  type MoodAffinity,
} from "@/lib/auralis/reco";
import { moodById } from "@/lib/auralis/mood";

const DAY = 86_400_000;
const HALF_LIFE_MS = 21 * DAY; // taste relevance half-life
const RECENT_HALF_LIFE_MS = 1.5 * DAY; // "just heard it" fatigue half-life
// Events older than this decay to <0.3% of their original weight (8.5+ half-lives),
// so excluding them from the read leaves aggregates unchanged while bounding query
// cost for long-time users (the table itself is separately pruned at 400 days).
const EVENTS_WINDOW_MS = 180 * DAY;

// Base signal strengths before time-decay.
const FAVORITE_WEIGHT = 2.5;
const DISLIKE_WEIGHT = 3.5;

// Score-axis weights.
const W_DIRECT = 1.0;
const W_CONTENT = 0.85;
const W_MOOD = 0.6;

interface TrackRow {
  trackhash: string;
  mood: string | null;
  genre: string | null;
  energy: number | null;
  bpm: number | null;
  playcount: number;
  last_played: number;
}

interface EventRow {
  trackhash: string;
  played_at: number;
  kind: string;
  ratio: number;
}

interface Aggregates {
  /** Decayed positive weight per track (completes + favourite). */
  pos: Map<string, number>;
  /** Decayed negative weight per track (skips + dislike). */
  neg: Map<string, number>;
  /** Positive taste centroid in feeling-space. */
  posCentroid: FeatureVector | null;
  /** Negative centroid (what you reject). */
  negCentroid: FeatureVector | null;
  /** Signed, normalised affinity per mood id. */
  moodAffinity: Map<string, number>;
  /** Total weighted signals folded in (profile strength). */
  signals: number;
  disliked: Set<string>;
  /** Feature vector per track, computed once and reused by the scorer. */
  featById: Map<string, FeatureVector | null>;
  /** Reco mood id per track, computed once and reused by the scorer. */
  moodById: Map<string, string | null>;
}

const tanh = Math.tanh;
const decay = (ageMs: number, halfLife: number): number => (ageMs <= 0 ? 1 : Math.pow(0.5, ageMs / halfLife));

// A tiny per-user memo so a burst of calls (forYou + radio fire together on a
// feedback event) computes the profile once. Cheap to recompute, so the TTL is short.
const cache = new Map<number, { at: number; tracks: TrackRow[]; agg: Aggregates }>();
const CACHE_TTL_MS = 2500;

function buildAggregates(userId: number, tracks: TrackRow[]): Aggregates {
  const db = getDb();
  const now = Date.now();
  const featById = new Map<string, FeatureVector | null>();
  const moodById2 = new Map<string, string | null>();
  for (const t of tracks) {
    featById.set(t.trackhash, featureVector(t));
    moodById2.set(t.trackhash, recoMood(t));
  }

  const pos = new Map<string, number>();
  const neg = new Map<string, number>();
  const moodSigned = new Map<string, number>();

  // Weighted accumulators for the two centroids.
  const posAcc = { arousal: 0, valence: 0, energy: 0, tempo: 0, w: 0 };
  const negAcc = { arousal: 0, valence: 0, energy: 0, tempo: 0, w: 0 };
  let signals = 0;

  const addCentroid = (acc: typeof posAcc, v: FeatureVector, w: number) => {
    acc.arousal += v.arousal * w;
    acc.valence += v.valence * w;
    acc.energy += v.energy * w;
    acc.tempo += v.tempo * w;
    acc.w += w;
  };
  const bumpMood = (hash: string, signed: number) => {
    const m = moodById2.get(hash);
    if (m) moodSigned.set(m, (moodSigned.get(m) ?? 0) + signed);
  };

  // --- play / skip events ---------------------------------------------------
  const events = db
    .prepare("SELECT trackhash, played_at, kind, ratio FROM play_events WHERE user_id = ? AND played_at >= ?")
    .all(userId, now - EVENTS_WINDOW_MS) as EventRow[];
  for (const e of events) {
    const d = decay(now - e.played_at, HALF_LIFE_MS);
    const r = Math.max(0, Math.min(1, e.ratio ?? (e.kind === "complete" ? 1 : 0)));
    const v = featById.get(e.trackhash) ?? null;
    if (e.kind === "skip") {
      const w = (0.9 * (1 - r) + 0.1) * d; // early bail → near 1, late skip → ~0.1
      neg.set(e.trackhash, (neg.get(e.trackhash) ?? 0) + w);
      bumpMood(e.trackhash, -w);
      if (v) addCentroid(negAcc, v, w);
      signals += w;
    } else {
      const w = (0.5 + 0.5 * r) * d; // partial listen → 0.5, full → 1
      pos.set(e.trackhash, (pos.get(e.trackhash) ?? 0) + w);
      bumpMood(e.trackhash, w);
      if (v) addCentroid(posAcc, v, w);
      signals += w;
    }
  }

  // --- favourites (strong positive) ----------------------------------------
  const favs = db.prepare("SELECT trackhash, created_at FROM favorites WHERE user_id = ?").all(userId) as {
    trackhash: string;
    created_at: number;
  }[];
  for (const f of favs) {
    const w = FAVORITE_WEIGHT * decay(now - (f.created_at || now), HALF_LIFE_MS);
    pos.set(f.trackhash, (pos.get(f.trackhash) ?? 0) + w);
    bumpMood(f.trackhash, w);
    const v = featById.get(f.trackhash);
    if (v) addCentroid(posAcc, v, w);
    signals += w;
  }

  // --- dislikes (strong negative + hard exclude) ---------------------------
  const dislikedRows = db.prepare("SELECT trackhash, created_at FROM dislikes WHERE user_id = ?").all(userId) as {
    trackhash: string;
    created_at: number;
  }[];
  const disliked = new Set<string>();
  for (const d0 of dislikedRows) {
    disliked.add(d0.trackhash);
    const w = DISLIKE_WEIGHT * decay(now - (d0.created_at || now), HALF_LIFE_MS);
    neg.set(d0.trackhash, (neg.get(d0.trackhash) ?? 0) + w);
    bumpMood(d0.trackhash, -w);
    const v = featById.get(d0.trackhash);
    if (v) addCentroid(negAcc, v, w);
    signals += w;
  }

  const finishCentroid = (acc: typeof posAcc): FeatureVector | null =>
    acc.w > 0
      ? { arousal: acc.arousal / acc.w, valence: acc.valence / acc.w, energy: acc.energy / acc.w, tempo: acc.tempo / acc.w }
      : null;

  // Normalise mood weights to a signed affinity in ~[-1, 1].
  const moodAffinity = new Map<string, number>();
  const scale = Math.max(1, ...[...moodSigned.values()].map((v) => Math.abs(v)));
  for (const [m, v] of moodSigned) moodAffinity.set(m, tanh((v / scale) * 1.5));

  return {
    pos,
    neg,
    posCentroid: finishCentroid(posAcc),
    negCentroid: finishCentroid(negAcc),
    moodAffinity,
    signals,
    disliked,
    featById,
    moodById: moodById2,
  };
}

function getState(userId: number): { tracks: TrackRow[]; agg: Aggregates } {
  const hit = cache.get(userId);
  const now = Date.now();
  if (hit && now - hit.at < CACHE_TTL_MS) return { tracks: hit.tracks, agg: hit.agg };

  const tracks = getDb()
    .prepare(
      `SELECT t.trackhash, t.mood, t.genre, t.energy, t.bpm,
              COALESCE(pc.count, 0) AS playcount, COALESCE(pc.last_played, 0) AS last_played
       FROM tracks t
       LEFT JOIN playcounts pc ON pc.trackhash = t.trackhash AND pc.user_id = ?`,
    )
    .all(userId) as TrackRow[];
  const agg = buildAggregates(userId, tracks);
  cache.set(userId, { at: now, tracks, agg });
  return { tracks, agg };
}

/** Drop a user's memoised profile so the next request recomputes (called after a
 *  feedback write). Best-effort: the TTL would catch it anyway. */
export function invalidateReco(userId: number): void {
  cache.delete(userId);
}

interface Scored {
  trackhash: string;
  score: number;
  reason: string;
}

/** Score one track against a user's profile. Returns null for disliked tracks
 *  (hard-excluded). `now` is threaded in so a whole pass shares one clock. */
function scoreTrack(t: TrackRow, agg: Aggregates, now: number): Scored | null {
  if (agg.disliked.has(t.trackhash)) return null;

  const pos = agg.pos.get(t.trackhash) ?? 0;
  const neg = agg.neg.get(t.trackhash) ?? 0;
  const direct = tanh(pos - neg); // your own verdict on this exact track

  // Reuse the vector/mood computed once in buildAggregates (no recomputation).
  const v = agg.featById.get(t.trackhash) ?? null;
  let content = 0;
  if (v) {
    if (agg.posCentroid) content += featureSimilarity(v, agg.posCentroid);
    if (agg.negCentroid) content -= 0.6 * featureSimilarity(v, agg.negCentroid);
  }

  const mood = agg.moodById.get(t.trackhash) ?? null;
  const moodAff = mood ? agg.moodAffinity.get(mood) ?? 0 : 0;

  // Exploration: lift unheard / barely-heard tracks a touch; fade the over-played.
  const pc = t.playcount;
  const explore = pc === 0 ? 0.18 : pc <= 2 ? 0.08 : -0.03 * Math.min(pc, 12) / 12;

  // Short-term fatigue: penalise anything heard in the last couple of days.
  const fatigue = t.last_played ? -0.6 * decay(now - t.last_played, RECENT_HALF_LIFE_MS) : 0;

  const score = W_DIRECT * direct + W_CONTENT * content + W_MOOD * moodAff + explore + fatigue;

  // Pick the most salient reason for the UI.
  let reason = "Recommandé pour vous";
  if (pos - neg > 0.8) reason = "Vous adorez ce titre";
  else if (mood && moodAff > 0.25) reason = `Dans votre humeur ${moodById(mood)?.label ?? mood}`;
  else if (v && agg.posCentroid && featureSimilarity(v, agg.posCentroid) > 0.78) reason = "Proche de ce que vous écoutez";
  else if (pc === 0) reason = "À découvrir";

  return { trackhash: t.trackhash, score, reason };
}

function buildProfile(agg: Aggregates): RecoProfile {
  const moods: MoodAffinity[] = [...agg.moodAffinity.entries()]
    .map(([mood, weight]) => ({ mood, weight }))
    .sort((a, b) => b.weight - a.weight);
  return {
    signals: Math.round(agg.signals * 10) / 10,
    centroid: agg.posCentroid,
    moods,
    disliked: [...agg.disliked],
  };
}

/** The personalised "Made for you" mix: every (non-disliked) track scored and
 *  ranked. Returns the top `limit`, plus the profile that produced them. */
export function recommend(userId: number, limit = 80): { profile: RecoProfile; forYou: RecoTrack[] } {
  const { tracks, agg } = getState(userId);
  const now = Date.now();
  const scored: Scored[] = [];
  for (const t of tracks) {
    const s = scoreTrack(t, agg, now);
    if (s) scored.push(s);
  }
  scored.sort((a, b) => b.score - a.score);
  return {
    profile: buildProfile(agg),
    forYou: scored.slice(0, Math.max(1, Math.min(500, limit))).map((s) => ({
      trackhash: s.trackhash,
      score: Math.round(s.score * 1000) / 1000,
      reason: s.reason,
    })),
  };
}

/** Personalised radio around a seed track: tracks closest to the seed in feeling-
 *  space, re-ranked by the user's taste score, excluding the seed/queue/dislikes. */
export function recommendRadio(userId: number, seedHash: string | null, limit = 25, exclude: string[] = []): RecoTrack[] {
  const { tracks, agg } = getState(userId);
  const now = Date.now();
  const skip = new Set([...(seedHash ? [seedHash] : []), ...exclude]);
  const seedVec = seedHash ? agg.featById.get(seedHash) ?? null : null;

  const scored: { trackhash: string; score: number; reason: string }[] = [];
  for (const t of tracks) {
    if (skip.has(t.trackhash) || agg.disliked.has(t.trackhash)) continue;
    const base = scoreTrack(t, agg, now);
    if (!base) continue;
    let s = base.score;
    if (seedVec) {
      const v = agg.featById.get(t.trackhash) ?? null;
      // Pull the mix toward the seed's vibe; the taste score still breaks ties.
      s = s * 0.6 + (v ? featureSimilarity(v, seedVec) : 0) * 1.4;
    }
    scored.push({ trackhash: t.trackhash, score: s, reason: base.reason });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, Math.min(100, limit))).map((s) => ({
    trackhash: s.trackhash,
    score: Math.round(s.score * 1000) / 1000,
    reason: s.reason,
  }));
}

// Named mood arcs in (arousal, valence) space — start anchor → end anchor. This
// exploits Auralis's REAL per-track arousal/valence coordinates (Spotify killed its
// audio-features API), so a "wind-down to sleep" or "warm-up" set is irreproducible
// by a catalogue-only clone.
const TRAJECTORIES: Record<string, { from: { arousal: number; valence: number }; to: { arousal: number; valence: number } }> = {
  winddown: { from: { arousal: 0.8, valence: 0.62 }, to: { arousal: 0.18, valence: 0.3 } },
  warmup: { from: { arousal: 0.32, valence: 0.5 }, to: { arousal: 0.86, valence: 0.82 } },
  focusflow: { from: { arousal: 0.5, valence: 0.42 }, to: { arousal: 0.62, valence: 0.34 } },
  uplift: { from: { arousal: 0.4, valence: 0.28 }, to: { arousal: 0.7, valence: 0.85 } },
};

/** A radio that MOVES through feeling-space along a named arc: at each step pick the
 *  non-disliked track nearest the interpolated target, taste-score breaking ties, no
 *  repeats. The whole set glides from one vibe to another. */
export function recommendTrajectory(userId: number, path: string, limit = 30): RecoTrack[] {
  const { tracks, agg } = getState(userId);
  const arc = TRAJECTORIES[path] ?? TRAJECTORIES.winddown;
  const steps = Math.max(1, Math.min(100, limit));
  const used = new Set<string>();
  const pool = tracks.filter((t) => !agg.disliked.has(t.trackhash) && agg.featById.get(t.trackhash));
  const out: RecoTrack[] = [];
  for (let i = 0; i < steps; i++) {
    const f = steps === 1 ? 0 : i / (steps - 1);
    const a = arc.from.arousal + (arc.to.arousal - arc.from.arousal) * f;
    const v = arc.from.valence + (arc.to.valence - arc.from.valence) * f;
    const target: FeatureVector = { arousal: a, valence: v, energy: a, tempo: a };
    let best: TrackRow | null = null;
    let bestScore = -Infinity;
    for (const t of pool) {
      if (used.has(t.trackhash)) continue;
      const vec = agg.featById.get(t.trackhash);
      if (!vec) continue;
      const taste = tanh((agg.pos.get(t.trackhash) ?? 0) - (agg.neg.get(t.trackhash) ?? 0));
      const score = featureSimilarity(vec, target) + 0.22 * taste;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    if (!best) break;
    used.add(best.trackhash);
    out.push({ trackhash: best.trackhash, score: Math.round(bestScore * 1000) / 1000, reason: "Trajectoire d'humeur" });
  }
  return out;
}

function mergeSum(a: Map<string, number>, b: Map<string, number>): Map<string, number> {
  const out = new Map(a);
  for (const [k, v] of b) out.set(k, (out.get(k) ?? 0) + v);
  return out;
}
function avgCentroid(a: FeatureVector | null, b: FeatureVector | null): FeatureVector | null {
  if (!a) return b;
  if (!b) return a;
  return { arousal: (a.arousal + b.arousal) / 2, valence: (a.valence + b.valence) / 2, energy: (a.energy + b.energy) / 2, tempo: (a.tempo + b.tempo) / 2 };
}

/** Blend two users' tastes into one mix: average centroids + mood affinities, sum
 *  the per-track weights, UNION the dislikes (a hard no from EITHER is respected),
 *  then score the catalogue against the blended profile. The household-Blend Spotify
 *  charges for, here free + instant on the LAN. */
export function recommendBlend(userA: number, userB: number, limit = 80): { forYou: RecoTrack[]; match: number } {
  const a = getState(userA);
  const b = getState(userB);
  const blended: Aggregates = {
    pos: mergeSum(a.agg.pos, b.agg.pos),
    neg: mergeSum(a.agg.neg, b.agg.neg),
    posCentroid: avgCentroid(a.agg.posCentroid, b.agg.posCentroid),
    negCentroid: avgCentroid(a.agg.negCentroid, b.agg.negCentroid),
    moodAffinity: (() => {
      const m = new Map(a.agg.moodAffinity);
      for (const [k, v] of b.agg.moodAffinity) m.set(k, m.has(k) ? ((m.get(k) ?? 0) + v) / 2 : v);
      return m;
    })(),
    signals: a.agg.signals + b.agg.signals,
    disliked: new Set([...a.agg.disliked, ...b.agg.disliked]),
    featById: a.agg.featById, // same catalogue → reuse one user's precomputed vectors
    moodById: a.agg.moodById,
  };
  // Compatibility score: cosine-ish similarity of the two positive centroids, 0..100.
  let match = 50;
  if (a.agg.posCentroid && b.agg.posCentroid) {
    match = Math.round(featureSimilarity(a.agg.posCentroid, b.agg.posCentroid) * 100);
  }
  const now = Date.now();
  const scored: Scored[] = [];
  for (const t of a.tracks) {
    const s = scoreTrack(t, blended, now);
    if (s) scored.push(s);
  }
  scored.sort((x, y) => y.score - x.score);
  return {
    match,
    forYou: scored.slice(0, Math.max(1, Math.min(200, limit))).map((s) => ({
      trackhash: s.trackhash,
      score: Math.round(s.score * 1000) / 1000,
      reason: "Blend",
    })),
  };
}

/** Average the feeling-space vectors of a set of seed tracks into one centroid —
 *  the "vibe" the user hand-picked. Null when none of the seeds can be placed. */
function seedCentroid(agg: Aggregates, seeds: Iterable<string>): FeatureVector | null {
  const acc = { arousal: 0, valence: 0, energy: 0, tempo: 0, w: 0 };
  for (const h of seeds) {
    const v = agg.featById.get(h) ?? null;
    if (!v) continue;
    acc.arousal += v.arousal;
    acc.valence += v.valence;
    acc.energy += v.energy;
    acc.tempo += v.tempo;
    acc.w++;
  }
  return acc.w > 0
    ? { arousal: acc.arousal / acc.w, valence: acc.valence / acc.w, energy: acc.energy / acc.w, tempo: acc.tempo / acc.w }
    : null;
}

export interface SeedPlaylist {
  /** Auto-generated French name, e.g. "Mix IA · Énergique". */
  name: string;
  /** Dominant mood id across the seeds (drives the name + a scoring bump), or null. */
  mood: string | null;
  /** Recommended additions, best-first (does NOT include the seeds themselves). */
  tracks: RecoTrack[];
}

/**
 * The "select a few tracks → AI builds a playlist from them + your taste" feature.
 * Places the hand-picked seeds in feeling-space, averages them into one centroid
 * (the vibe you asked for), then ranks the rest of the library by how close each
 * track sits to that centroid — with your personal taste score refining the order
 * and a nudge toward the seeds' dominant mood. Seeds, dislikes and anything the
 * caller excludes are left out. Pure taste + real audio features, no cloud, no API.
 */
export function recommendFromSeeds(userId: number, seedHashes: string[], limit = 30, exclude: string[] = []): SeedPlaylist {
  const { tracks, agg } = getState(userId);
  const now = Date.now();
  // Keep only seeds that actually exist in the catalogue.
  const seeds = seedHashes.filter((h) => agg.featById.has(h));
  const skip = new Set([...seeds, ...exclude]);
  const centroid = seedCentroid(agg, seeds);

  // Dominant mood across the seeds → name + a small same-mood bonus.
  const moodCount = new Map<string, number>();
  for (const h of seeds) {
    const m = agg.moodById.get(h);
    if (m) moodCount.set(m, (moodCount.get(m) ?? 0) + 1);
  }
  const dominantMood = [...moodCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const scored: Scored[] = [];
  for (const t of tracks) {
    if (skip.has(t.trackhash) || agg.disliked.has(t.trackhash)) continue;
    const base = scoreTrack(t, agg, now);
    if (!base) continue;
    // Seed vibe dominates the order; the taste score breaks ties so the picks still
    // skew toward what THIS user finishes/likes — "grâce à mes goûts".
    const v = agg.featById.get(t.trackhash) ?? null;
    const sim = centroid && v ? featureSimilarity(v, centroid) : 0;
    const moodBonus = dominantMood && agg.moodById.get(t.trackhash) === dominantMood ? 0.15 : 0;
    const score = base.score * 0.5 + sim * 1.5 + moodBonus;
    const reason = sim > 0.8 ? "Dans la vibe de votre sélection" : base.reason;
    scored.push({ trackhash: t.trackhash, score, reason });
  }
  scored.sort((a, b) => b.score - a.score);

  const moodLabel = dominantMood ? moodById(dominantMood)?.label ?? null : null;
  const name = moodLabel ? `Mix IA · ${moodLabel}` : "Mix IA";
  return {
    name,
    mood: dominantMood,
    tracks: scored.slice(0, Math.max(1, Math.min(100, limit))).map((s) => ({
      trackhash: s.trackhash,
      score: Math.round(s.score * 1000) / 1000,
      reason: s.reason,
    })),
  };
}

/** Discovery mix: only tracks the user has NEVER played, ranked by taste-fit — the
 *  "Discover Weekly" engine. The caller freezes a weekly slice client-side. */
export function recommendDiscovery(userId: number, limit = 60): RecoTrack[] {
  const { tracks, agg } = getState(userId);
  const now = Date.now();
  const scored: Scored[] = [];
  for (const t of tracks) {
    if (agg.disliked.has(t.trackhash) || t.playcount > 0) continue;
    const base = scoreTrack(t, agg, now);
    if (!base) continue;
    scored.push({ ...base, score: base.score + 0.2, reason: "À découvrir" });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, Math.min(200, limit))).map((s) => ({
    trackhash: s.trackhash,
    score: Math.round(s.score * 1000) / 1000,
    reason: s.reason,
  }));
}
