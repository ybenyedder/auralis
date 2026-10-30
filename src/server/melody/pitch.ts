// YIN pitch detection (de Cheveigné & Kawahara, 2002) — the front-end of the
// "hum to search" feature. Pure math on a Float32 frame, no I/O, no deps, so it
// unit-tests on synthetic signals.
//
// The classic algorithm: difference function → cumulative-mean-normalised
// difference → absolute threshold → first minimum → parabolic interpolation.

export interface PitchResult {
  /** Fundamental frequency in Hz. */
  f0: number;
  /** 0..1 — how periodic the frame is (1 - d'(tau*)). */
  clarity: number;
}

export interface PitchOptions {
  /** Absolute threshold on the normalised difference (YIN paper: 0.1-0.2). */
  threshold?: number;
  /** Lowest/highest fundamental to accept (humming range: ~60-800 Hz). */
  fMin?: number;
  fMax?: number;
}

/** Detect the fundamental of one frame. Returns null for silence/unpitched. */
export function detectPitch(frame: Float32Array, sampleRate: number, opts: PitchOptions = {}): PitchResult | null {
  const threshold = opts.threshold ?? 0.15;
  const fMin = opts.fMin ?? 60;
  const fMax = opts.fMax ?? 800;

  const tauMin = Math.max(2, Math.floor(sampleRate / fMax));
  const tauMax = Math.min(Math.floor(sampleRate / fMin), frame.length >> 1);
  if (tauMax <= tauMin + 1) return null;

  // Silence gate — a mostly-silent frame has no pitch to find.
  let energy = 0;
  for (let i = 0; i < frame.length; i++) energy += frame[i] * frame[i];
  energy /= frame.length;
  if (energy < 1e-6) return null;

  // Difference function over a fixed window (frame.length - tauMax samples) so
  // every lag is averaged over the same number of terms.
  const w = frame.length - tauMax;
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < w; i++) {
      const diff = frame[i] - frame[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  // Cumulative mean normalised difference d'(tau).
  const dn = new Float32Array(tauMax + 1);
  dn[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    dn[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }

  // First minimum under the absolute threshold.
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (dn[t] < threshold) {
      while (t + 1 <= tauMax && dn[t + 1] < dn[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    // Nothing under threshold — fall back to the global minimum if it is
    // periodic enough, else call the frame unpitched.
    let best = tauMin;
    for (let t = tauMin + 1; t <= tauMax; t++) if (dn[t] < dn[best]) best = t;
    if (dn[best] > 0.45) return null;
    tau = best;
  }

  // Parabolic interpolation around the minimum for sub-sample precision.
  let tauRefined = tau;
  if (tau > tauMin && tau < tauMax) {
    const s0 = dn[tau - 1];
    const s1 = dn[tau];
    const s2 = dn[tau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (Math.abs(denom) > 1e-12) tauRefined = tau + (s2 - s0) / denom;
  }

  const f0 = sampleRate / tauRefined;
  if (!Number.isFinite(f0) || f0 < fMin * 0.9 || f0 > fMax * 1.1) return null;
  return { f0, clarity: Math.max(0, Math.min(1, 1 - dn[tau])) };
}
