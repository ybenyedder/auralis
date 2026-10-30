// Tests for the "hum to search" melody engine: pitch detection on synthetic
// signals, contour building, and the transposition/tempo-invariant matcher.

import { test } from "vitest";
import assert from "node:assert/strict";
import { detectPitch } from "../src/server/melody/pitch";
import {
  ContourBuilder,
  melodyDeltas,
  melodyHistogram,
  encodeContour,
  decodeContour,
  medianFilter,
  UNVOICED,
} from "../src/server/melody/contour";
import { dtwScore, matchMelody } from "../src/server/melody/match";

const SR = 5512.5;

function sineFrame(freq: number, seconds = 512 / SR, amp = 0.5): Float32Array {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / SR);
  return out;
}

test("detectPitch finds a sine's fundamental within a few cents", () => {
  for (const freq of [110, 220, 440]) {
    const pitch = detectPitch(sineFrame(freq), SR);
    assert.ok(pitch, `no pitch for ${freq} Hz`);
    const cents = 1200 * Math.log2(pitch.f0 / freq);
    assert.ok(Math.abs(cents) < 20, `${freq} Hz detected as ${pitch.f0.toFixed(1)} Hz`);
    assert.ok(pitch.clarity > 0.8, "a pure sine is highly periodic");
  }
});

test("detectPitch ignores silence", () => {
  assert.equal(detectPitch(new Float32Array(512), SR), null);
});

test("ContourBuilder turns a melody of notes into the right semitone sequence", () => {
  // C4 D4 E4 G4 — 0.35 s each at 11025 Hz.
  const inSr = 11025;
  const notes = [261.63, 293.66, 329.63, 392.0];
  const pcm: number[] = [];
  for (const freq of notes) {
    for (let i = 0; i < 0.35 * inSr; i++) pcm.push(0.5 * Math.sin((2 * Math.PI * freq * i) / inSr));
    for (let i = 0; i < 0.05 * inSr; i++) pcm.push(0); // brief gap between notes
  }
  const builder = new ContourBuilder();
  // Feed in awkward chunk sizes to exercise the streaming buffer.
  const samples = Float32Array.from(pcm);
  for (let off = 0; off < samples.length; off += 777) {
    builder.push(samples.subarray(off, Math.min(off + 777, samples.length)));
  }
  const contour = builder.finish();

  // Expected MIDI: C4=60 D4=62 E4=64 G4=67.
  const voiced = Array.from(contour).filter((v) => v !== UNVOICED);
  assert.ok(voiced.length > 20, `expected a mostly-voiced contour, got ${voiced.length}`);
  for (const expected of [60, 62, 64, 67]) {
    const hit = voiced.filter((v) => Math.abs(v - expected) <= 1).length;
    assert.ok(hit >= 2, `note ${expected} missing from contour`);
  }
});

test("contour codecs round-trip and medianFilter kills single-frame glitches", () => {
  const contour = Int8Array.from([60, 60, 72, 60, UNVOICED, 64]);
  const buf = encodeContour(contour);
  assert.deepEqual(Array.from(decodeContour(buf)), Array.from(contour));

  const cleaned = medianFilter(contour, 5);
  assert.equal(cleaned[2], 60, "the +12 octave glitch is replaced by the run median");
  assert.equal(cleaned[4], UNVOICED, "unvoiced frames stay unvoiced");
});

test("matching is transposition- and tempo-invariant", () => {
  // A reference melody contour: C4 E4 G4 A4 G4 E4 D4 C4 (semitones).
  const melody = [60, 64, 67, 69, 67, 64, 62, 60];
  // Build a target contour: each note held 6 frames.
  const target = new Int8Array(melody.length * 6 + 20);
  target.fill(UNVOICED);
  melody.forEach((note, i) => {
    for (let k = 0; k < 6; k++) target[i * 6 + k] = note;
  });

  // Query: same melody hummed 3 semitones up, each note held 4 frames (faster),
  // embedded in the middle of a longer "recording".
  const query = new Int8Array(melody.length * 4 + 30);
  query.fill(UNVOICED);
  melody.forEach((note, i) => {
    for (let k = 0; k < 4; k++) query[i * 4 + 15 + k] = note + 3;
  });

  // A distractor with a different contour.
  const distractor = new Int8Array(target.length);
  distractor.fill(UNVOICED);
  const other = [67, 67, 66, 66, 64, 64, 62, 62, 60, 60];
  other.forEach((note, i) => {
    for (let k = 0; k < 6; k++) distractor[i * 6 + k] = note;
  });

  const queryDeltas = melodyDeltas(query);
  const matches = matchMelody(queryDeltas, melodyHistogram(query), [
    { id: "good", deltas: melodyDeltas(target), histogram: melodyHistogram(target) },
    { id: "bad", deltas: melodyDeltas(distractor), histogram: melodyHistogram(distractor) },
  ]);
  assert.ok(matches.length > 0, "the query should match something");
  assert.equal(matches[0].id, "good", "the transposed/tempo-shifted melody wins");
  assert.ok(matches[0].score > 0.4, `expected a confident score, got ${matches[0].score}`);
});

test("dtwScore is low for unrelated contours", () => {
  const a = Float32Array.from([1, 1, 1, 1, 1, 1, 2, 2, 2, -1, -1, -1]);
  const b = Float32Array.from([-2, 2, -2, 2, -2, 2, -2, 2, -2, 2, -2, 2]);
  assert.ok(dtwScore(a, b) < 0.5, `unrelated contours scored ${dtwScore(a, b)}`);
  assert.ok(dtwScore(a, a) > 0.85, `identical contours scored ${dtwScore(a, a)}`);
});

test("dtwScore rejects degenerate inputs", () => {
  assert.equal(dtwScore(Float32Array.from([1]), Float32Array.from([1, 2, 3, 4, 5])), 0);
});
