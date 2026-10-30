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

/** Shazam signatures for a PCM take — one per ~12 s window (its sweet spot).
 *  The WASM decoder is unreliable on compressed containers, so the server
 *  feeds it PCM it decoded itself (ffmpeg); raw-bytes mode is the last resort. */
async function buildSignatures(audio: Buffer): Promise<RawSignature[]> {
  const mod = (await import("shazamio-core")) as unknown as {
    recognizeBytes?: (bytes: Uint8Array, offset?: number, seconds?: number) => RawSignature[];
    default?: ShazamCoreModule;
  };
  const core = (mod.default ?? mod) as ShazamCoreModule;

  if (core.DecodedSignature && (await hasFfmpeg())) {
    const pcm = await decodePcmBuffer(writeTemp(audio), { maxSeconds: 30, sampleRate: 44100 });
    if (pcm && pcm.length > 44100) {
      const signatures: RawSignature[] = [];
      const windowSamples = 12 * 44100;
      for (let start = 0; start + 44100 < pcm.length && signatures.length < 3; start += windowSamples) {
        const slice = pcm.subarray(start, Math.min(start + windowSamples, pcm.length));
        try {
          signatures.push(core.DecodedSignature.new(Float32Array.from(slice), 44100, 1));
        } catch {
          /* skip this window */
        }
      }
      if (signatures.length) return signatures;
    }
  }
  // Fallback: let the WASM try to decode the container itself (it handles
  // WAV reliably, other formats poorly).
  if (core.recognizeBytes) {
    try {
      return core.recognizeBytes(new Uint8Array(audio), 0, Number.MAX_SAFE_INTEGER).filter((s) => s.samplems > 1500);
    } catch {
      return [];
    }
  }
  return [];
}

import fs from "fs";
import os from "os";
import path from "path";

function writeTemp(audio: Buffer): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auralis-shazam-"));
  const file = path.join(dir, "take.audio");
  fs.writeFileSync(file, audio);
  // decodePcmBuffer only reads the file; clean up right after is handled by
  // the caller's temp-file discipline below (best effort).
  setTimeout(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }, 60_000);
  return file;
}

/** Recognise a recording with Shazam. Returns [] on a miss; throws nothing —
 *  network/API problems degrade to "no result" so the local matcher still runs. */
export async function shazamRecognize(audio: Buffer): Promise<ShazamMatch[]> {
  // Shazam wants a few seconds of audio; cap what we ship.
  const sample = audio.subarray(0, 2_000_000);
  let signatures: RawSignature[];
  try {
    signatures = await buildSignatures(sample);
  } catch (err) {
    log.warn("shazam signature failed", { error: err instanceof Error ? err.message.slice(0, 200) : String(err) });
    return [];
  }
  if (!signatures.length) return [];

  // The reference client starts in the middle of the take and steps — each
  // signature is one query; stop at the first hit.
  for (let i = Math.floor(signatures.length / 2); i < signatures.length; i += 4) {
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
