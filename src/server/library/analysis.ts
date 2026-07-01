// ============================================================================
// AUDIO ANALYSIS — the real mood classifier.
// ----------------------------------------------------------------------------
// We have no audio-feature tags, so we compute them ourselves: decode a slice of
// each track with ffmpeg to mono PCM, then derive three cheap, robust features
//   • energy   — RMS loudness (perceived intensity / arousal)
//   • bpm      — tempo via onset-envelope autocorrelation
//   • brightness — high-frequency energy ratio (timbre / valence proxy)
// and map (arousal, valence) to one of the six moods by nearest prototype.
//
// Runs as a throttled BACKGROUND pass after a scan; progress is surfaced through
// the scanner's progress channel. Degrades gracefully: if ffmpeg is missing the
// pass aborts and the app falls back to the genre→mood heuristic.
// ============================================================================

import { spawn } from "child_process";
import path from "path";
import { getConfig } from "../config";
import { getDb } from "../db";
import { createLogger } from "../logger";
import { MOODS } from "@/lib/auralis/mood";
import { updateScanProgress } from "./scanner";

const log = createLogger("analysis");

const SAMPLE_RATE = 22050; // mono decode rate — plenty for energy/tempo/timbre
const WINDOW_SECONDS = 60; // analysed slice length
const FRAME = 1024;
const HOP = 512;
const FRAMES_PER_SEC = SAMPLE_RATE / HOP; // ≈ 43.07
const CONCURRENCY = 2; // parallel ffmpeg decodes

export interface AudioFeatures {
  energy: number; // 0..1 RMS loudness
  bpm: number; // estimated tempo
  brightness: number; // 0..1 HF energy ratio
  mood: string; // MOODS id
  gain: number; // ReplayGain-style adjustment in dB (toward -14 dBFS RMS)
}

// --- ffmpeg availability (checked once, cached) ------------------------------
let ffmpegOk: boolean | undefined;
function ffmpegBin(): string {
  return process.env.FFMPEG_PATH || "ffmpeg";
}
async function hasFfmpeg(): Promise<boolean> {
  if (ffmpegOk !== undefined) return ffmpegOk;
  ffmpegOk = await new Promise<boolean>((resolve) => {
    try {
      const p = spawn(/*turbopackIgnore: true*/ ffmpegBin(), ["-version"], { stdio: "ignore" });
      p.on("error", () => resolve(false));
      p.on("close", (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
  return ffmpegOk;
}

/** Decode a mono PCM slice of the file to a Float32Array, or null on failure. */
function decodePcm(absPath: string, startSec: number): Promise<Float32Array | null> {
  return new Promise((resolve) => {
    const args = [
      "-v", "error", "-nostdin",
      "-ss", String(Math.max(0, Math.round(startSec))),
      "-t", String(WINDOW_SECONDS),
      "-i", absPath,
      "-map", "0:a:0",
      "-ac", "1",
      "-ar", String(SAMPLE_RATE),
      "-f", "f32le",
      "-",
    ];
    let proc;
    try {
      proc = spawn(/*turbopackIgnore: true*/ ffmpegBin(), args);
    } catch {
      resolve(null);
      return;
    }
    const chunks: Buffer[] = [];
    let bytes = 0;
    const CAP = (WINDOW_SECONDS + 2) * SAMPLE_RATE * 4; // guard against runaway
    // `-t` above bounds ffmpeg's OUTPUT duration, not its wall-clock run time — a
    // stuck demuxer (corrupt file, a stalled network-mounted music dir) can hang
    // with no 'data'/'close'/'error' ever firing, which previously stalled this
    // Promise forever and — with CONCURRENCY workers all landing on bad files —
    // could wedge the whole background analysis pass permanently. 30s is generous
    // headroom over the ~60s of audio actually being decoded on any real hardware.
    const killTimer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve(null);
    }, 30_000);
    proc.stdout.on("data", (c: Buffer) => {
      bytes += c.length;
      if (bytes <= CAP) chunks.push(c);
    });
    proc.on("error", () => {
      clearTimeout(killTimer);
      resolve(null);
    });
    proc.on("close", () => {
      clearTimeout(killTimer);
      if (!chunks.length) {
        resolve(null);
        return;
      }
      const buf = Buffer.concat(chunks);
      const n = Math.floor(buf.length / 4);
      if (n < SAMPLE_RATE) {
        resolve(null); // less than ~1s decoded — unusable
        return;
      }
      resolve(new Float32Array(buf.buffer, buf.byteOffset, n));
    });
  });
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** RMS loudness of the decoded slice in dBFS — the basis for BOTH the perceptual
 *  energy feature and the normalization gain (previously this dBFS was thrown away). */
function loudnessDbfs(x: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
  const rms = Math.sqrt(sum / x.length) || 1e-7;
  return 20 * Math.log10(rms);
}

/** dBFS RMS → perceptual 0..1 energy. Calibrated on real (loudness-normalised)
 *  masters, which cluster around -14…-6 dBFS RMS. */
function energyFromDb(db: number): number {
  return clamp01((db + 18) / 13); // -18 dB → 0, -5 dB → 1
}

// Bring every track's RMS toward roughly -14 dBFS (Spotify/ReplayGain-ish), clamped
// so a pathological master can't produce a wild ±boost. RMS-dBFS isn't true LUFS, but
// it's a consistent RELATIVE measure across the library — exactly what equal-loudness
// playback needs.
const GAIN_TARGET_DBFS = -14;
function gainFromDb(db: number): number {
  return Math.max(-12, Math.min(12, Math.round((GAIN_TARGET_DBFS - db) * 10) / 10));
}

/** Brightness from the high-frequency (first-difference) energy ratio. The raw
 *  ratio is tiny and skewed, so we sqrt it for a usable 0..1 spread. */
function computeBrightness(x: Float32Array): number {
  let hi = 0;
  let tot = 0;
  let prev = x[0];
  for (let i = 1; i < x.length; i++) {
    const d = x[i] - prev;
    hi += d * d;
    tot += x[i] * x[i];
    prev = x[i];
  }
  if (tot < 1e-9) return 0;
  return clamp01(Math.sqrt(hi / tot) * 1.7);
}

/** Tempo via autocorrelation of a half-wave-rectified energy-flux onset envelope. */
function computeBpm(x: Float32Array): number {
  const frameCount = Math.floor((x.length - FRAME) / HOP);
  if (frameCount < 8) return 0;

  // Per-frame log energy → flux (positive change) → onset envelope.
  const env = new Float32Array(frameCount);
  let prevE = 0;
  for (let f = 0; f < frameCount; f++) {
    const start = f * HOP;
    let e = 0;
    for (let i = 0; i < FRAME; i++) {
      const s = x[start + i];
      e += s * s;
    }
    const logE = Math.log(1 + e);
    env[f] = f === 0 ? 0 : Math.max(0, logE - prevE);
    prevE = logE;
  }

  // Zero-mean the envelope so the autocorrelation reflects periodicity, not DC.
  let mean = 0;
  for (let f = 0; f < frameCount; f++) mean += env[f];
  mean /= frameCount;
  for (let f = 0; f < frameCount; f++) env[f] -= mean;

  // Search plausible tempi (60–180 BPM) with a soft log-Gaussian prior around
  // 120 BPM to damp the classic half/double-tempo octave errors.
  const minBpm = 60;
  const maxBpm = 180;
  const minLag = Math.round((60 * FRAMES_PER_SEC) / maxBpm);
  const maxLag = Math.round((60 * FRAMES_PER_SEC) / minBpm);
  let bestLag = 0;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    for (let f = 0; f < frameCount - lag; f++) acc += env[f] * env[f + lag];
    const bpm = (60 * FRAMES_PER_SEC) / lag;
    const prior = Math.exp(-0.5 * Math.pow(Math.log(bpm / 120) / 0.5, 2));
    const score = acc * (0.6 + 0.4 * prior);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestLag <= 0) return 0;
  return Math.round((60 * FRAMES_PER_SEC) / bestLag);
}

// Mood prototypes on the (arousal, valence) plane. Nearest one wins. Tuned so a
// real, diverse library spreads across all six rather than collapsing to a corner.
const PROTOTYPES: { id: string; arousal: number; valence: number }[] = [
  { id: "party", arousal: 0.82, valence: 0.82 },
  { id: "energetic", arousal: 0.84, valence: 0.4 },
  { id: "happy", arousal: 0.55, valence: 0.82 },
  { id: "chill", arousal: 0.3, valence: 0.6 },
  { id: "focus", arousal: 0.58, valence: 0.3 },
  { id: "melancholy", arousal: 0.24, valence: 0.24 },
];
const MOOD_IDS = new Set(MOODS.map((m) => m.id));

function classify(energy: number, bpm: number, brightness: number): string {
  // Octave-fold the tempo into a 70–150 "feel" band: autocorrelation often locks
  // onto half/double the perceived beat, which otherwise flips a track's arousal.
  let feel = bpm || 110;
  while (feel < 70) feel *= 2;
  while (feel > 150) feel /= 2;
  const tempo = clamp01((feel - 70) / 70);
  const arousal = clamp01(0.42 * energy + 0.43 * tempo + 0.15 * brightness);
  const valence = clamp01(0.58 * brightness + 0.3 * tempo + 0.12 * energy);
  let best = "chill";
  let bestD = Infinity;
  for (const p of PROTOTYPES) {
    if (!MOOD_IDS.has(p.id)) continue;
    const d = (p.arousal - arousal) ** 2 + (p.valence - valence) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p.id;
    }
  }
  return best;
}

/** Full analysis for one file. Returns null if it couldn't be decoded. */
export async function analyzeFile(absPath: string, duration: number): Promise<AudioFeatures | null> {
  const start = duration > 90 ? Math.min(60, duration * 0.15) : Math.min(10, duration * 0.1);
  const pcm = await decodePcm(absPath, start);
  if (!pcm) return null;
  const db = loudnessDbfs(pcm);
  const energy = energyFromDb(db);
  const brightness = computeBrightness(pcm);
  const bpm = computeBpm(pcm);
  const mood = classify(energy, bpm, brightness);
  return { energy: Math.round(energy * 1000) / 1000, bpm, brightness, mood, gain: gainFromDb(db) };
}

// --- background runner -------------------------------------------------------
let analyzing = false;
export function isAnalyzing(): boolean {
  return analyzing;
}

interface PendingRow {
  trackhash: string;
  filepath: string;
  duration: number;
}

/**
 * Analyse every track that still needs it (analyzed_at = 0), throttled. Safe to
 * call repeatedly — it no-ops while already running and exits early when ffmpeg
 * is unavailable (leaving rows unmarked so a later run can pick them up).
 */
export async function runAnalysis(): Promise<void> {
  if (analyzing) return;

  const db = getDb();
  const pending = db
    .prepare("SELECT trackhash, filepath, duration FROM tracks WHERE analyzed_at = 0")
    .all() as PendingRow[];
  if (pending.length === 0) return;

  if (!(await hasFfmpeg())) {
    log.warn("ffmpeg unavailable — skipping audio analysis (genre fallback in use)");
    return;
  }

  analyzing = true;
  const { musicDir } = getConfig();
  const update = db.prepare(
    "UPDATE tracks SET mood = ?, energy = ?, bpm = ?, gain = ?, analyzed_at = ? WHERE trackhash = ?",
  );
  const total = pending.length;
  let done = 0;
  log.info("audio analysis started", { total });
  updateScanProgress({ analyzing: true, analyzed: 0, analyzeTotal: total });

  let cursor = 0;
  const worker = async () => {
    while (cursor < pending.length) {
      const row = pending[cursor++];
      const abs = path.join(musicDir, row.filepath.split("/").join(path.sep));
      let features: AudioFeatures | null = null;
      try {
        features = await analyzeFile(abs, row.duration || 0);
      } catch {
        features = null;
      }
      // Always stamp analyzed_at so a hard-failing file isn't retried forever;
      // a null result just leaves mood NULL → genre fallback for that track.
      const now = Date.now();
      try {
        update.run(features?.mood ?? null, features?.energy ?? null, features?.bpm ?? null, features?.gain ?? null, now, row.trackhash);
      } catch {
        /* row vanished mid-run */
      }
      done++;
      if (done % 5 === 0 || done === total) {
        updateScanProgress({ analyzed: done, analyzeTotal: total });
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, () => worker()));
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('analyzedAt', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    ).run(String(Date.now()));
    // Refresh the catalogue cache: the analysis pass just changed mood/energy/bpm,
    // bumping the library version, so rebuild it off the request path for the
    // auto-reload that follows.
    void import("./repository").then((m) => m.getSnapshot()).catch(() => {/* best effort */});
    log.info("audio analysis complete", { analyzed: done });
  } catch (error) {
    log.error("audio analysis failed", { message: error instanceof Error ? error.message : "unknown" });
  } finally {
    analyzing = false;
    updateScanProgress({ analyzing: false, analyzed: done, analyzeTotal: total });
  }
}
