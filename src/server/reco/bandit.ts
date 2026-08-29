// ============================================================================
// EXPLORATION  —  UCB1 replaces the static "+0.18 for unheard" heuristic
// ----------------------------------------------------------------------------
// The base engine nudged unplayed tracks by a flat constant. That's crude: it
// treats a track you skipped past 40 times the same as one you've genuinely never
// been offered. The bandit view is exact — each track is an "arm", and the value
// of pulling it is its predicted reward PLUS an uncertainty bonus that shrinks as
// you sample it:
//
//     UCB(i) = μ̂_i + c · sqrt( ln(t) / n_i )
//
// μ̂_i is the taste score, t the total recent interactions, n_i how many times
// THIS track was surfaced/heard, c the exploration temperature. Fresh tracks carry
// high uncertainty → they get lifted (optimism under uncertainty); once sampled a
// few times their bonus decays and the taste score takes over. This is the
// principled version of "explore vs exploit" the static constant only gestured at.
// ============================================================================

/** The uncertainty bonus for a track surfaced `plays` times, given `total`
 *  interactions in the recent window. Bounded so a single arm can't dominate the
 *  slate. `c` tunes how adventurous the mix is. */
export function ucbBonus(plays: number, total: number, c = 0.28): number {
  const t = Math.max(2, total); // ln needs t ≥ 1; floor keeps early bonuses sane
  const n = plays + 1; // +1 → an unheard track has finite (large) uncertainty
  const bonus = c * Math.sqrt(Math.log(t) / n);
  // Cap at ~c so the exploration term stays a nudge, not an override of taste.
  return Math.min(c * 1.3, bonus);
}
