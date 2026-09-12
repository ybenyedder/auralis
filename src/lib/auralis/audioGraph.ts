"use client";

// Lazy Web Audio graph over the single <audio> element. Built ONCE, on a user
// gesture (browsers suspend AudioContext until then). Topology:
//
//     <audio> ──source──▶ gain ──▶ [EQ f1…f6] ──▶ analyser ──▶ destination
//
// The analyser feeds the REAL visualizer (replacing the seeded fake); the gain node
// powers transparent volume normalization (ReplayGain); the six biquad filters
// between them form the real-time equalizer. One graph, reused — the
// foundation the audit called the keystone.
//
// Caveats baked in:
//  • createMediaElementSource throws if called twice on the same element, so we
//    guard on the bound element and build the source exactly once.
//  • The graph MUST terminate at ctx.destination or the element goes silent.
//  • A requested gain made BEFORE the graph exists is remembered and applied at
//    build time, so normalization on the very first track isn't dropped.
//  • Same for the EQ curve: setEqGains() before the first play stores a pending
//    curve that the filters adopt the moment they are created.

let ctx: AudioContext | null = null;
let source: MediaElementAudioSourceNode | null = null;
let gainNode: GainNode | null = null;
let eqFilters: BiquadFilterNode[] | null = null;
let analyser: AnalyserNode | null = null;
let boundEl: HTMLAudioElement | null = null;
let pendingGain = 1;
let pendingEq: { enabled: boolean; gains: number[] } = { enabled: true, gains: [0, 0, 0, 0, 0, 0] };

/** The six equalizer bands: center/corner frequency (Hz) + biquad type. */
export const EQ_BANDS = [
  { freq: 60, type: "lowshelf" },
  { freq: 200, type: "peaking" },
  { freq: 800, type: "peaking" },
  { freq: 2600, type: "peaking" },
  { freq: 8000, type: "peaking" },
  { freq: 14000, type: "highshelf" },
] as const;

/** Clamp a band gain to the ±12 dB slider range. */
function clampDb(db: number): number {
  return Math.max(-12, Math.min(12, db));
}

interface AudioGraph {
  analyser: AnalyserNode;
  gain: GainNode;
}

/** Build (once) and return the graph for `el`, or null if Web Audio is unavailable. */
export function ensureAudioGraph(el: HTMLAudioElement): AudioGraph | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    if (!ctx) ctx = new AC();
    if (!source || boundEl !== el) {
      // Local non-null alias: module-level `let` narrowing is dropped inside the
      // filter-creating closure below, so hand it a const the closure can trust.
      const audioCtx: AudioContext = ctx;
      source = audioCtx.createMediaElementSource(el);
      boundEl = el;
      gainNode = audioCtx.createGain();
      gainNode.gain.value = pendingGain;
      analyser = audioCtx.createAnalyser();
      // 2048 → 1024 frequency bins and a 2048-sample time-domain buffer: enough
      // resolution for the visualizer's log-frequency radial + smooth waveform modes.
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      // EQ chain: gain → f1 → … → f6 → analyser. Each filter adopts the pending
      // curve immediately, so a persisted EQ shapes the very first track too.
      eqFilters = EQ_BANDS.map((band, i) => {
        const filter = audioCtx.createBiquadFilter();
        filter.type = band.type;
        filter.frequency.value = band.freq;
        if (band.type === "peaking") filter.Q.value = 1.0;
        filter.gain.value = pendingEq.enabled ? clampDb(pendingEq.gains[i] ?? 0) : 0;
        return filter;
      });
      source.connect(gainNode);
      let node: AudioNode = gainNode;
      for (const filter of eqFilters) {
        node.connect(filter);
        node = filter;
      }
      node.connect(analyser);
      analyser.connect(audioCtx.destination);
    }
    return { analyser: analyser as AnalyserNode, gain: gainNode as GainNode };
  } catch {
    return null;
  }
}

/** Resume a suspended context (call from the play path — a user gesture). */
export function resumeAudioGraph(): void {
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

/** The live analyser, or null if the graph hasn't been built yet. */
export function getAnalyser(): AnalyserNode | null {
  return analyser;
}

/** Set a linear gain multiplier (1 = unchanged). Smoothly ramped to avoid clicks.
 *  Remembered even before the graph exists so it applies once it's built. */
export function setGraphGain(multiplier: number): void {
  // Ceiling at +6 dB: ReplayGain tags on quiet masters can ask for far more,
  // and EQ boosts stack on top — past this the float graph stays clean but the
  // DAC clamps at 1.0 and the track audibly clips. Attenuation is untouched.
  pendingGain = Math.max(0, Math.min(dbToGain(6), multiplier));
  if (gainNode && ctx) {
    try {
      gainNode.gain.setTargetAtTime(pendingGain, ctx.currentTime, 0.08);
    } catch {
      gainNode.gain.value = pendingGain;
    }
  }
}

/** dB → linear amplitude factor (e.g. -3 dB → ~0.71). */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/** Apply an equalizer curve — `gains` is one dB value per EQ_BANDS entry,
 *  clamped to ±12. Remembered before the graph exists (applied at build time);
 *  live filters ramp smoothly (50 ms time-constant) so dragging a slider never
 *  zipper-noises. `enabled: false` flattens every band to 0 dB on the graph while
 *  the caller keeps the user's curve — toggling back re-ramps it in. */
export function setEqGains(enabled: boolean, gains: number[]): void {
  const clamped = EQ_BANDS.map((_, i) => clampDb(gains[i] ?? 0));
  pendingEq = { enabled, gains: clamped };
  const filters = eqFilters;
  const audioCtx = ctx;
  if (!filters || !audioCtx) return;
  filters.forEach((filter, i) => {
    const target = enabled ? clamped[i] : 0;
    try {
      filter.gain.setTargetAtTime(target, audioCtx.currentTime, 0.05);
    } catch {
      filter.gain.value = target;
    }
  });
}

/** Fade the gain in from near-silence to `target` over `seconds` — a smooth track
 *  entry scaled by the crossfade setting (no hard starts). Falls back to an instant
 *  set when the graph isn't built. */
export function fadeInGain(target: number, seconds: number): void {
  pendingGain = Math.max(0, Math.min(8, target));
  if (!gainNode || !ctx) return;
  const t = ctx.currentTime;
  try {
    gainNode.gain.cancelScheduledValues(t);
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.linearRampToValueAtTime(pendingGain, t + Math.max(0.05, seconds));
  } catch {
    gainNode.gain.value = pendingGain;
  }
}
