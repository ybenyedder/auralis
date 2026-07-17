"use client";

// Lazy Web Audio graph over the single <audio> element. Built ONCE, on a user
// gesture (browsers suspend AudioContext until then). Topology:
//
//     <audio> ──source──▶ gain ──▶ analyser ──▶ destination
//
// The analyser feeds the REAL visualizer (replacing the seeded fake); the gain node
// powers transparent volume normalization (ReplayGain). One graph, reused — the
// foundation the audit called the keystone.
//
// Caveats baked in:
//  • createMediaElementSource throws if called twice on the same element, so we
//    guard on the bound element and build the source exactly once.
//  • The graph MUST terminate at ctx.destination or the element goes silent.
//  • A requested gain made BEFORE the graph exists is remembered and applied at
//    build time, so normalization on the very first track isn't dropped.

let ctx: AudioContext | null = null;
let source: MediaElementAudioSourceNode | null = null;
let gainNode: GainNode | null = null;
let analyser: AnalyserNode | null = null;
let boundEl: HTMLAudioElement | null = null;
let pendingGain = 1;

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
      source = ctx.createMediaElementSource(el);
      boundEl = el;
      gainNode = ctx.createGain();
      gainNode.gain.value = pendingGain;
      analyser = ctx.createAnalyser();
      // 2048 → 1024 frequency bins and a 2048-sample time-domain buffer: enough
      // resolution for the visualizer's log-frequency radial + smooth waveform modes.
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(gainNode);
      gainNode.connect(analyser);
      analyser.connect(ctx.destination);
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
  pendingGain = Math.max(0, Math.min(8, multiplier));
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
