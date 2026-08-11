// ============================================================================
// RECOMMENDATION ENGINE — TUNING CONFIGURATION
// ----------------------------------------------------------------------------
// Every magic number that shapes scoring used to live as scattered `const` in
// engine.ts / session.ts. Centralising them here makes the model's full knob
// set visible in one place — a prerequisite for any future offline evaluation
// (skip-prediction / NDCG@k) and calibration work. Tune here, nowhere else.
//
// Values are deliberately kept as-is (hand-tuned, "validated core" per the
// engine header); this extraction is a no-op refactor that only improves
// discoverability. The scoring maths in engine.ts are unchanged.
// ============================================================================

const DAY = 86_400_000;

/** Taste relevance half-life: a feedback signal's weight halves every 21 days. */
export const HALF_LIFE_MS = 21 * DAY;

/** "Just heard it" fatigue half-life — short, so recently played tracks fade fast. */
export const RECENT_HALF_LIFE_MS = 1.5 * DAY;

/** Events older than this decay to <0.3% of their original weight (8.5+ half-lives),
 *  so excluding them from the read leaves aggregates unchanged while bounding query
 *  cost for long-time users (the table itself is separately pruned at 400 days). */
export const EVENTS_WINDOW_MS = 180 * DAY;

/** Markov transition-probability half-life (old A→B habits fade). */
export const TRANSITION_HALF_LIFE_MS = 30 * DAY;

// --- Base signal strengths (before time-decay) -----------------------------
export const FAVORITE_WEIGHT = 2.5;
export const DISLIKE_WEIGHT = 3.5;

// --- Score-axis weights ----------------------------------------------------
// W_DIRECT / W_CONTENT / W_MOOD are the validated core; the rest are modest
// additive enrichments, each 0 when its data is missing.
export const W_DIRECT = 1.0;
export const W_CONTENT = 0.85;
export const W_MOOD = 0.6;
export const W_SESSION = 0.35;
export const W_TRANS = 0.3;
export const W_TIME = 0.22;
export const W_GRAPH = 0.3;
export const W_DEEP = 0.5;
export const W_DISS = 0.12;

// --- Diversity re-rank (MMR) -----------------------------------------------
/** MMR is skipped for tiny result sets (reordering noise + it would fight the
 *  deliberate ordering of unit-test-sized fixtures); real slates get diversified. */
export const MMR_MIN = 8;
/** Relevance-heavy: diversify without dropping strong picks. */
export const MMR_LAMBDA = 0.82;
