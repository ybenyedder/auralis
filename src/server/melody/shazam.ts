// Real Shazam — keyless global music recognition through Shazam's own
// endpoint (the "hold your phone to the speaker" experience).
//
// How it works: `shazamio-core` (a WASM port of shazamio's Rust core) decodes
// the recording and builds the same spectral-peak "signature" the Shazam app
// sends; we then POST it to Shazam's recognition endpoint exactly like the
// official client does. No API key, no account. Protocol mirrors the MIT
// `unofficial-shazam` / `shazamio` projects (shout-out!).
//
// Privacy note: this is the ONE recognition path that leaves the server — the
// 3-15 s signature (not the audio itself) is sent to Shazam. The local
// humming matcher (recognize.ts) stays fully offline.
//
// Server-only module.

import { randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { createLogger } from "../logger";
import { decodePcmBuffer, hasFfmpeg } from "./decode";

const log = createLogger("shazam");

export interface ShazamMatch {
  title: string;
  artists: string[];
  album: string | null;
  /** Shazam confidence (0..1) — its `tagged`/match quality; 1 when unknown. */
  score: number;
  source: "shazam";
}

export interface ShazamRecognizeOptions {
  /** When normal-speed recognition misses (or returns only a derivative edit),
   *  sweep speed/pitch scaling factors on the decoded PCM to catch slowed/sped
   *  TikTok edits. */
  speedSweep?: boolean;
  /** Predicate returning true for low-preference derivative versions (e.g.
   *  hardtek, slowed, sped up, nightcore, remix) so the sweep keeps looking
   *  for the clean original version before settling. */
  isDerivative?: (match: ShazamMatch) => boolean;
}

/** A couple of well-known mobile user agents (rotated), like the real client. */
const USER_AGENTS = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36",
];

function recognizeUrl(): string {
  return `https://amp.shazam.com/discovery/v5/en/US/iphone/-/tag/${randomUUID()}/${randomUUID()}?sync=true&webv3=true&sampling=true&connected=&shazamapiversion=v3&sharehub=true&hubv5minorversion=v5.1&hidelb=true&video=v3`;
}

interface ShazamResponse {
  matches?: unknown[];
  track?: {
    title?: string;
    subtitle?: string;
    sections?: Array<{ type?: string; metapages?: Array<{ caption?: string }> }>;
    hub?: { artists?: Array<{ id?: string; adamid?: string }> };
  };
}

interface RawSignature {
  uri: string;
  samplems: number;
}

interface ShazamCoreModule {
  recognizeBytes?: (bytes: Uint8Array, offset?: number, seconds?: number) => RawSignature[];
  /** wasm-bindgen static factory literally named `new` (not a constructor). */
  DecodedSignature?: { new: (f32: Float32Array, sampleRateHz: number, channels: number) => RawSignature };
  default?: ShazamCoreModule;
}

/** Linear-interpolate a 44.1 kHz mono Float32 PCM buffer by `rate` (>1 speeds up
 *  & pitches up to counter slowed clips; <1 slows down to counter sped-up clips). */
export function resamplePcmSpeed(pcm: Float32Array, rate: number): Float32Array {
  if (rate === 1 || pcm.length < 2) return pcm;
  const outLen = Math.floor(pcm.length / rate);
  if (outLen <= 1) return new Float32Array(0);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    const pos = i * rate;
    const idx = pos | 0;
    const frac = pos - idx;
    const a = pcm[idx];
    const b = idx + 1 < pcm.length ? pcm[idx + 1] : a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

function buildSignaturesFromPcm(core: ShazamCoreModule, pcm: Float32Array, maxWindows = 3): RawSignature[] {
  if (!core.DecodedSignature || pcm.length <= 44100) return [];
  const signatures: RawSignature[] = [];
  const windowSamples = 12 * 44100;
  for (let start = 0; start + 44100 < pcm.length && signatures.length < maxWindows; start += windowSamples) {
    const slice = pcm.subarray(start, Math.min(start + windowSamples, pcm.length));
    try {
      signatures.push(core.DecodedSignature.new(Float32Array.from(slice), 44100, 1));
    } catch {
      /* skip this window */
    }
  }
  return signatures;
}

/** Decode compressed audio once to 44.1 kHz mono PCM (up to 30 s) and remove
 *  the temporary file right after decoding. */
async function decodeAudioToPcm(audio: Buffer): Promise<Float32Array | null> {
  if (!(await hasFfmpeg())) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auralis-shazam-"));
  const file = path.join(dir, "take.audio");
  try {
    fs.writeFileSync(file, audio);
    return await decodePcmBuffer(file, { maxSeconds: 30, sampleRate: 44100 });
  } catch {
    return null;
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}

async function querySignatures(signatures: RawSignature[], maxTries = 3): Promise<ShazamMatch[]> {
  if (!signatures.length) return [];

  // Prefer full-length (~12 s) center/initial windows first, then fall back to
  // any remaining window (e.g., short 14 s TikTok clips produce [0..12s, 12..14s]
  // where starting solely at length/2 used to skip window 0 completely).
  const order: number[] = [];
  const fullIndices = signatures
    .map((s, idx) => ({ idx, ms: s?.samplems ?? 0 }))
    .filter((x) => x.ms >= 3500)
    .map((x) => x.idx);
  const pool = fullIndices.length ? fullIndices : signatures.map((_, idx) => idx);
  const mid = Math.floor(pool.length / 2);
  order.push(pool[mid]);
  for (let offset = 1; offset < pool.length; offset += 1) {
    if (mid - offset >= 0) order.push(pool[mid - offset]);
    if (mid + offset < pool.length) order.push(pool[mid + offset]);
  }
  for (let idx = 0; idx < signatures.length; idx += 1) {
    if (!order.includes(idx)) order.push(idx);
  }

  for (const i of order.slice(0, maxTries)) {
    const signature = signatures[i];
    if (!signature?.uri) continue;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(recognizeUrl(), {
        method: "POST",
        headers: {
          "X-Shazam-Platform": "IPHONE",
          "X-Shazam-AppVersion": "14.1.0",
          Accept: "*/*",
          "Content-Type": "application/json",
          "Accept-Language": "en",
          "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
        },
        body: JSON.stringify({
          timezone: "Etc/UTC",
          signature: { uri: signature.uri, samplems: signature.samplems },
          timestamp: Date.now(),
          context: {},
          geolocation: {},
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const body = (await res.json()) as ShazamResponse;
      const track = body.track;
      if (!track?.title) continue;
      const album =
        track.sections
          ?.flatMap((s) => s.metapages ?? [])
          ?.map((p) => p.caption ?? "")
          ?.find((c) => c) ?? null;
      return [
        {
          title: track.title,
          artists: track.subtitle ? [track.subtitle] : [],
          album: album || null,
          score: 1,
          source: "shazam",
        },
      ];
    } catch (err) {
      log.debug("shazam query failed", { error: err instanceof Error ? err.message.slice(0, 120) : String(err) });
    }
  }
  return [];
}

/** Pairs covering 0.69x..1.37x continuous speed/pitch offsets (given Shazam's ~±4% window). */
const SPEED_SWEEP_BATCHES: readonly (readonly number[])[] = [
  [1.07, 0.93],
  [1.15, 0.85],
  [1.23, 0.78],
  [1.32, 0.72],
];

/** Recognise a recording with Shazam. Returns [] on a miss; throws nothing —
 *  network/API problems degrade to "no result" so the local matcher still runs. */
export async function shazamRecognize(audio: Buffer, options: ShazamRecognizeOptions = {}): Promise<ShazamMatch[]> {
  // Shazam wants a few seconds of audio; cap what we ship.
  const sample = audio.subarray(0, 2_000_000);
  let mod: { default?: ShazamCoreModule; recognizeBytes?: ShazamCoreModule["recognizeBytes"] };
  try {
    mod = (await import("shazamio-core")) as unknown as typeof mod;
  } catch (err) {
    log.warn("shazam core load failed", { error: err instanceof Error ? err.message.slice(0, 200) : String(err) });
    return [];
  }
  const core = (mod.default ?? mod) as ShazamCoreModule;

  let pcm: Float32Array | null = null;
  let signatures: RawSignature[] = [];
  if (core.DecodedSignature) {
    pcm = await decodeAudioToPcm(sample);
    if (pcm && pcm.length > 44100) {
      signatures = buildSignaturesFromPcm(core, pcm, 3);
    }
  }
  if (!signatures.length && core.recognizeBytes) {
    try {
      signatures = core.recognizeBytes(new Uint8Array(sample), 0, Number.MAX_SAFE_INTEGER).filter((s) => s.samplems > 1500);
    } catch {
      signatures = [];
    }
  }

  const normalHits = await querySignatures(signatures, 3);
  const isDeriv = options.isDerivative;
  if (!options.speedSweep || !pcm || pcm.length <= 44100 * 2) {
    return normalHits;
  }
  if (normalHits.length > 0 && !(isDeriv?.(normalHits[0]))) {
    return normalHits;
  }

  let bestDerivative: ShazamMatch | null = normalHits[0] ?? null;
  for (const pair of SPEED_SWEEP_BATCHES) {
    const batchResults = await Promise.all(
      pair.map(async (rate) => {
        const resampled = resamplePcmSpeed(pcm, rate);
        if (resampled.length <= 44100 * 2) return [];
        const sigs = buildSignaturesFromPcm(core, resampled, 2);
        return querySignatures(sigs, 2);
      }),
    );
    for (const hits of batchResults) {
      const hit = hits[0];
      if (!hit) continue;
      if (!(isDeriv?.(hit))) return [hit];
      if (!bestDerivative) bestDerivative = hit;
    }
  }

  return bestDerivative ? [bestDerivative] : [];
}
