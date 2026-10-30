// Melody contours for the "hum to search" engine: a streaming builder that
// turns PCM chunks into a quantised pitch contour (one semitone value per
// frame), plus the tiny codecs that store it in SQLite and the interval
// histogram used to pre-filter candidates before the (expensive) DTW pass.
//
// Everything here is pure (no I/O) and unit-testable.

import { detectPitch } from "./pitch";

/** Contour frame rate (frames per second) — the builder decimates the input ×2
 *  and hops 256 samples at 5512.5 Hz. */
export const CONTOUR_FPS = 5512.5 / 256;

/** Sentinel for an unvoiced frame (humming pauses, breath, noise). */
export const UNVOICED = -127;

const FRAME = 512;
const HOP = 256;

/** Streaming pitch-contour builder. Feed it PCM chunks (any chunking), then
 *  read `finish()`. Keeps only the samples still awaiting a full frame. */
export class ContourBuilder {
  private pending: number[] = [];
  private readonly frames: number[] = [];
  private acc0 = 0;
  private acc1 = 0;
  private accN = 0;

  /** @param samples mono PCM, any sample rate (it is decimated ×2 internally —
   *  designed for 11 025 Hz input, i.e. ~5 512 Hz after decimation). */
  push(samples: Float32Array): void {
    for (let i = 0; i < samples.length; i++) {
      // 2-tap box low-pass then decimate by 2 (cheap anti-aliasing).
      if (this.accN === 0) this.acc0 = samples[i];
      else this.acc1 = samples[i];
      this.accN++;
      if (this.accN === 2) {
        this.pending.push((this.acc0 + this.acc1) * 0.5);
        this.accN = 0;
        if (this.pending.length >= FRAME) {
          const frame = Float32Array.from(this.pending.slice(0, FRAME));
          this.pending = this.pending.slice(HOP);
          this.pushFrame(frame);
        }
      }
    }
  }

  private pushFrame(frame: Float32Array): void {
    const pitch = detectPitch(frame, 5512.5, { fMin: 60, fMax: 800 });
    let midi = UNVOICED;
    if (pitch && pitch.clarity > 0.55) {
      const value = Math.round(69 + 12 * Math.log2(pitch.f0 / 440));
      if (value >= 24 && value <= 108) midi = value;
    }
    this.frames.push(midi);
  }

  /** Median-filter the contour (kills octave-tracking glitches) and return it. */
  finish(): Int8Array {
    // Flush any remaining full frame.
    while (this.pending.length >= FRAME) {
      const frame = Float32Array.from(this.pending.slice(0, FRAME));
      this.pending = this.pending.slice(HOP);
      this.pushFrame(frame);
    }
    return medianFilter(Int8Array.from(this.frames), 5);
  }
}

/** Median filter over voiced runs only (unvoiced sentinels stay put). */
export function medianFilter(contour: Int8Array, width: number): Int8Array {
  const out = new Int8Array(contour.length);
  const half = width >> 1;
  for (let i = 0; i < contour.length; i++) {
    if (contour[i] === UNVOICED) {
      out[i] = UNVOICED;
      continue;
    }
    const values: number[] = [];
    for (let j = Math.max(0, i - half); j <= Math.min(contour.length - 1, i + half); j++) {
      if (contour[j] !== UNVOICED) values.push(contour[j]);
    }
    if (values.length === 0) {
      out[i] = UNVOICED;
      continue;
    }
    values.sort((a, b) => a - b);
    out[i] = values[values.length >> 1];
  }
  return out;
}

// ---- storage codecs ---------------------------------------------------------

/** Contours are stored as raw Int8 frames (UNVOICED = -127). */
export function encodeContour(contour: Int8Array): Buffer {
  return Buffer.from(contour.buffer, contour.byteOffset, contour.byteLength);
}

export function decodeContour(buf: Buffer): Int8Array {
  return new Int8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

// ---- matching features ------------------------------------------------------

const HIST_BINS = 13; // clipped interval histogram: -6 .. +6 semitones

/** Interval (first-difference) sequence over voiced runs — transposition- and
 *  octave-invariant by construction. Gaps ≤ 2 frames are bridged. */
export function melodyDeltas(contour: Int8Array): Float32Array {
  const deltas: number[] = [];
  let prev: number | null = null;
  let gap = 0;
  for (let i = 0; i < contour.length; i++) {
    const value = contour[i];
    if (value === UNVOICED) {
      gap++;
      if (gap > 2) prev = null;
      continue;
    }
    if (prev !== null) deltas.push(value - prev);
    prev = value;
    gap = 0;
  }
  return Float32Array.from(deltas);
}

/** Coarse interval histogram (13 bins, normalised to 0..255) — the cheap
 *  pre-filter that keeps the DTW pass off the obviously-wrong 99 % of tracks. */
export function melodyHistogram(contour: Int8Array): Uint8Array {
  const hist = new Uint8Array(HIST_BINS);
  const deltas = melodyDeltas(contour);
  for (let i = 0; i < deltas.length; i++) {
    const bin = Math.max(0, Math.min(HIST_BINS - 1, Math.round(deltas[i]) + 6));
    hist[bin]++;
  }
  let max = 1;
  for (const v of hist) if (v > max) max = v;
  for (let i = 0; i < HIST_BINS; i++) hist[i] = Math.round((hist[i] / max) * 255);
  return hist;
}

/** L1 distance between two normalised histograms (0 = identical). */
export function histogramDistance(a: Uint8Array, b: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < HIST_BINS; i++) sum += Math.abs(a[i] - b[i]);
  return sum / (255 * HIST_BINS);
}
