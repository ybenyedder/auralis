// ============================================================================
// RECOMMENDATION FEATURE MODEL  (shared client ⇄ server)
// ----------------------------------------------------------------------------
// The reco engine reasons about every track as a point in a small "feeling
// space" derived from the real audio-analysis features (energy/bpm) plus the
// classifier's mood verdict. Skips push the user's taste away from a region of
// this space; completed listens / likes pull it closer. Keeping the math here —
// pure and dependency-free — lets the server engine and any client fallback
// agree on exactly how a track is placed.
// ============================================================================

import { moodForGenre } from "./mood";

/** A track's position in feeling-space, all axes normalised to 0..1. */
export interface FeatureVector {
  /** Activation / intensity (loud + fast → high). */
  arousal: number;
  /** Positivity / brightness (happy/major → high, sombre → low). */
  valence: number;
  /** Raw measured loudness energy (0..1) from analysis. */
  energy: number;
  /** Tempo folded to a 70–150 "feel" band and normalised 0..1. */
  tempo: number;
}

// (arousal, valence) anchor per mood — mirrors the server classifier PROTOTYPES
// (server/library/analysis.ts) so a track's *mood* alone implies a place in the
// space even when raw energy/bpm are absent (genre-only fallback tracks).
export const MOOD_POINT: Record<string, { arousal: number; valence: number }> = {
  party: { arousal: 0.82, valence: 0.82 },
  energetic: { arousal: 0.84, valence: 0.4 },
  happy: { arousal: 0.55, valence: 0.82 },
  chill: { arousal: 0.3, valence: 0.6 },
  focus: { arousal: 0.58, valence: 0.3 },
  melancholy: { arousal: 0.24, valence: 0.24 },
};

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Octave-fold a tempo into the 70–150 perceptual band, then normalise to 0..1.
 *  Matches the folding the server classifier applies so the two never disagree. */
export function normalizeTempo(bpm?: number | null): number | null {
  if (!bpm || !Number.isFinite(bpm) || bpm <= 0) return null;
  let feel = bpm;
  while (feel < 70) feel *= 2;
  while (feel > 150) feel /= 2;
  return clamp01((feel - 70) / 80);
}

/** The mood id we'll attribute to a track for reco purposes: the analysis verdict
 *  if present, else the genre heuristic, else null. */
export function recoMood(t: { mood?: string | null; genre?: string | null }): string | null {
  if (t.mood && MOOD_POINT[t.mood]) return t.mood;
  return moodForGenre(t.genre);
}

/**
 * Place a track in feeling-space. Leans on the classifier's mood (which already
 * folded in timbre/brightness) for valence, and refines arousal with the raw
 * measured energy + tempo so two tracks of the same mood are still distinguished
 * by how hard they actually hit. Returns null for tracks we can't place at all
 * (no mood, no usable genre) — the engine scores those as neutral.
 */
export function featureVector(t: {
  energy?: number | null;
  bpm?: number | null;
  mood?: string | null;
  genre?: string | null;
}): FeatureVector | null {
  const moodId = recoMood(t);
  const anchor = moodId ? MOOD_POINT[moodId] : null;
  const energyN = t.energy != null && Number.isFinite(t.energy) ? clamp01(t.energy) : null;
  const tempoN = normalizeTempo(t.bpm);

  // Need at least one real signal to place the track.
  if (!anchor && energyN == null && tempoN == null) return null;

  // Arousal: blend the mood anchor with the two measured signals when present.
  const baseArousal = anchor ? anchor.arousal : 0.5;
  const measured: number[] = [];
  if (energyN != null) measured.push(energyN);
  if (tempoN != null) measured.push(tempoN);
  const measuredArousal = measured.length ? measured.reduce((a, b) => a + b, 0) / measured.length : null;
  const arousal =
    measuredArousal == null ? baseArousal : anchor ? 0.55 * baseArousal + 0.45 * measuredArousal : measuredArousal;

  // Valence comes mainly from the mood (timbre/brightness-derived). With no mood,
  // approximate from tempo (faster → a touch brighter) around a neutral midpoint.
  const valence = anchor
    ? clamp01(anchor.valence + (tempoN != null ? (tempoN - 0.5) * 0.12 : 0))
    : clamp01(0.45 + ((tempoN ?? 0.5) - 0.5) * 0.2);

  return {
    arousal: clamp01(arousal),
    valence,
    energy: energyN ?? baseArousal,
    tempo: tempoN ?? baseArousal,
  };
}

/** Squared Euclidean distance in feeling-space (arousal/valence weighted higher
 *  than the raw energy/tempo axes, which already feed arousal). */
export function featureDistance(a: FeatureVector, b: FeatureVector): number {
  return (
    1.4 * (a.arousal - b.arousal) ** 2 +
    1.4 * (a.valence - b.valence) ** 2 +
    0.6 * (a.energy - b.energy) ** 2 +
    0.6 * (a.tempo - b.tempo) ** 2
  );
}

/** 0..1 similarity (1 = identical) from the weighted distance above. */
export function featureSimilarity(a: FeatureVector, b: FeatureVector): number {
  // Max weighted squared distance is 4 (all four axes at the extremes); scale so
  // a typical "different vibe" lands around 0.3–0.5 and a near-match near 1.
  return clamp01(1 - featureDistance(a, b) / 2.2);
}

// ---------------------------------------------------------------------------
// DTOs exchanged over the API (see /api/recommend and /api/recap).
// ---------------------------------------------------------------------------

/** A scored recommendation: the trackhash + why it surfaced. The client resolves
 *  the hash against its in-memory library snapshot (it already holds every track),
 *  so the wire stays light and art/url logic lives in one place. */
export interface RecoTrack {
  trackhash: string;
  score: number;
  /** Short human reason ("Vous adorez ce titre", "Dans votre humeur Détente"…). */
  reason: string;
}

export interface MoodAffinity {
  mood: string;
  /** Signed taste weight, normalised roughly to [-1, 1]. */
  weight: number;
}

export interface RecoProfile {
  /** Total weighted feedback events folded into the profile. */
  signals: number;
  /** The user's centre of gravity in feeling-space (null until they've listened). */
  centroid: FeatureVector | null;
  /** Moods sorted by how much the user gravitates to (positive) / rejects (negative) them. */
  moods: MoodAffinity[];
  /** Trackhashes the user explicitly disliked (hard-excluded from recs). */
  disliked: string[];
}

export interface RecommendResponse {
  profile: RecoProfile;
  /** The personalised "Made for you" mix. */
  forYou: RecoTrack[];
}

export interface RadioResponse {
  seed: string | null;
  tracks: RecoTrack[];
}

// ---------------------------------------------------------------------------
// Monthly mood recap DTOs.
// ---------------------------------------------------------------------------

export interface MoodShare {
  mood: string;
  /** Share of the month's listening attributed to this mood, 0..1. */
  share: number;
  plays: number;
}

export interface RecapTrackRef {
  trackhash: string;
  plays: number;
}

export interface RecapArtistRef {
  artisthash: string;
  name: string;
  plays: number;
}

export interface MonthlyRecap {
  /** Local month key, e.g. "2026-06". */
  month: string;
  /** Human month label, e.g. "Juin 2026". */
  label: string;
  /** True while the month is still in progress (recap is provisional). */
  inProgress: boolean;
  totalPlays: number;
  listeningSeconds: number;
  distinctTracks: number;
  /** The dominant mood id, or null if there isn't enough data. */
  dominantMood: string | null;
  /** One-word emotional descriptor of the month (the "depressive / happy" headline). */
  moodWord: string | null;
  /** Average position in feeling-space across the month. */
  arousal: number;
  valence: number;
  moods: MoodShare[];
  topTracks: RecapTrackRef[];
  topArtists: RecapArtistRef[];
  /** A generated French narrative sentence summarising the month's mood. */
  narrative: string;
  /** Dominant mood of the previous month, for the "more X than last month" delta. */
  previousMood: string | null;
}
