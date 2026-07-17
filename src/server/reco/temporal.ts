// ============================================================================
// TIME-AWARE CONTEXT  —  your taste isn't flat across the day
// ----------------------------------------------------------------------------
// People listen differently at 8am (focus / calm) than at 11pm (wind-down) or
// Saturday night (party). The base engine ignored the clock entirely. We learn a
// per-hour preference curve from your OWN completed listens: for each hour of the
// day, the average feeling-space position (arousal / valence) of what you actually
// finish. At recommendation time we bias tracks toward the vibe that matches the
// CURRENT hour — Tuesday-9am nudges toward what your past Tuesday-ish mornings
// looked like, Friday-11pm toward your late-night energy.
//
// Derived from played_at on the events already in memory (no schema change). The
// bonus only fires once an hour bucket has enough evidence, so it never fights the
// core taste score on thin data. Weekday/weekend is folded in as a light blend so
// a weekend afternoon can lean different from a Monday one without fragmenting the
// data into 168 sparse buckets.
// ============================================================================

import { featureSimilarity, type FeatureVector } from "@/lib/auralis/reco";

export interface TimeCurve {
  /** Per-hour accumulated (arousal, valence, weight); index 0..23. */
  hours: { arousal: number; valence: number; weight: number }[];
  /** Separate weekend curve so Sat/Sun can diverge from weekdays. */
  weekend: { arousal: number; valence: number; weight: number }[];
}

export interface TimeEvent {
  trackhash: string;
  played_at: number;
  kind: string;
}

const MIN_HOUR_WEIGHT = 3; // need a few listens in a bucket before trusting it

const empty = () => Array.from({ length: 24 }, () => ({ arousal: 0, valence: 0, weight: 0 }));

/** Fold completed listens into an hour-of-day (+ weekend) preference curve. */
export function buildTimeCurve(events: TimeEvent[], featById: Map<string, FeatureVector | null>): TimeCurve {
  const hours = empty();
  const weekend = empty();
  for (const e of events) {
    if (e.kind !== "complete") continue; // skips aren't a "what I want now" signal
    const v = featById.get(e.trackhash) ?? null;
    if (!v) continue;
    const d = new Date(e.played_at);
    const h = d.getHours();
    const bucket = hours[h];
    bucket.arousal += v.arousal;
    bucket.valence += v.valence;
    bucket.weight += 1;
    const day = d.getDay();
    if (day === 0 || day === 6) {
      const wb = weekend[h];
      wb.arousal += v.arousal;
      wb.valence += v.valence;
      wb.weight += 1;
    }
  }
  return { hours, weekend };
}

/** The learned target vibe for a given clock context, or null if too little data. */
function targetAt(curve: TimeCurve, hour: number, isWeekend: boolean): { target: FeatureVector; confidence: number } | null {
  const base = curve.hours[hour];
  const we = curve.weekend[hour];
  // Blend the weekend-specific bucket in on weekends when it has its own evidence.
  const wWe = isWeekend ? we.weight : 0;
  const totalW = base.weight + wWe;
  if (totalW < MIN_HOUR_WEIGHT) return null;
  const arousal = (base.arousal + (isWeekend ? we.arousal : 0)) / totalW;
  const valence = (base.valence + (isWeekend ? we.valence : 0)) / totalW;
  const target: FeatureVector = { arousal, valence, energy: arousal, tempo: arousal };
  const confidence = Math.min(1, totalW / 12); // saturates ~a dozen listens
  return { target, confidence };
}

/**
 * Bonus in ~0..1 for a candidate matching the CURRENT hour's learned vibe, scaled
 * by how confident that hour bucket is. `now` is threaded so a whole pass shares
 * one clock. Returns 0 when the hour has too little history.
 */
export function timeAffinity(candidate: FeatureVector | null, curve: TimeCurve, now: number): number {
  if (!candidate) return 0;
  const d = new Date(now);
  const t = targetAt(curve, d.getHours(), d.getDay() === 0 || d.getDay() === 6);
  if (!t) return 0;
  return featureSimilarity(candidate, t.target) * t.confidence;
}
