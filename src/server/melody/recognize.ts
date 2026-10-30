// "Hum to search" recognition — turns a recorded hum/sung fragment into
// matches. Two engines, both optional, both best-effort:
//
//   1. LOCAL  — subsequence-DTW melody matching against the user's own library
//               (the opt-in melody index, see indexer.ts). No account, works
//               offline, finds YOUR tracks.
//   2. REMOTE — ACRCloud (env-configured credentials) for the SoundHound
//               experience: identify ANY song in the world from humming or
//               ambient audio; the result carries title/artist so the client
//               can offer "download it" (the YouTube engine does the rest).
//
// Server-only module.

import fs from "fs";
import os from "os";
import path from "path";
import { createLogger } from "../logger";
import { getDb } from "../db";
import { artUrl } from "../library/repository";
import { decodePcmBuffer, hasFfmpeg } from "./decode";
import { ContourBuilder, melodyDeltas, melodyHistogram, decodeContour, histogramDistance, UNVOICED } from "./contour";
import { matchMelody, type MelodyCandidate } from "./match";
import { identifyWithAcrcloud, acrcloudConfigured, type AcrMatch } from "./acrcloud";

const log = createLogger("melody");

/** Recognition listens to at most this much audio. */
const MAX_QUERY_SECONDS = 30;

export interface RecognizeLocalMatch {
  trackhash: string;
  title: string;
  artist: string;
  album: string | null;
  image: string | null;
  duration: number;
  score: number;
}

export interface RecognizeResult {
  /** Local engine readiness (ffmpeg + a non-empty melody index). */
  available: boolean;
  /** Tracks currently in the melody index. */
  indexSize: number;
  local: RecognizeLocalMatch[];
  /** ACRCloud results, null when unconfigured/unreachable. */
  remote: AcrMatch[] | null;
}

export async function recognizeHum(audio: Buffer, contentType: string): Promise<RecognizeResult> {
  // The remote engine takes the raw recording — run it regardless of local
  // readiness so a server without a melody index can still be useful.
  const remotePromise = acrcloudConfigured()
    ? identifyWithAcrcloud(audio.subarray(0, 2_000_000), contentType)
    : Promise.resolve(null);

  const base: RecognizeResult = { available: false, indexSize: 0, local: [], remote: null };
  try {
    const row = getDb().prepare("SELECT COUNT(*) AS n FROM melody").get() as { n: number };
    base.indexSize = row.n;
    base.available = row.n > 0;
  } catch {
    /* no melody table yet */
  }

  let local: RecognizeLocalMatch[] = [];
  const ffmpeg = await hasFfmpeg();
  if (ffmpeg) {
    local = await matchLocal(audio);
    base.available = base.available || local.length > 0;
  }

  try {
    base.remote = await remotePromise;
  } catch {
    base.remote = null;
  }
  base.local = local;
  return base;
}

async function matchLocal(audio: Buffer): Promise<RecognizeLocalMatch[]> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auralis-rec-"));
  const file = path.join(dir, "query.audio");
  try {
    fs.writeFileSync(file, audio);
    const pcm = await decodePcmBuffer(file, { maxSeconds: MAX_QUERY_SECONDS });
    if (!pcm || pcm.length < 11025) return [];

    const builder = new ContourBuilder();
    builder.push(pcm);
    const queryContour = builder.finish();
    const voiced = queryContour.filter((v) => v !== UNVOICED).length;
    if (voiced < 20) {
      log.info("recognition query too unpitched for local matching", { voiced });
      return [];
    }
    const queryDeltas = melodyDeltas(queryContour);
    const queryHistogram = melodyHistogram(queryContour);

    // Two-phase candidate load: histograms are tiny (13 bytes), full contours
    // are pulled only for the pre-filtered shortlist.
    const rows = getDb()
      .prepare(
        `SELECT m.trackhash, m.contour, m.histogram FROM melody m
         JOIN tracks t ON t.trackhash = m.trackhash`,
      )
      .all() as Array<{ trackhash: string; contour: Buffer; histogram: Buffer }>;

    const preRanked = rows
      .map((r) => ({
        trackhash: r.trackhash,
        contour: r.contour,
        histogram: r.histogram,
        pre: histogramDistance(queryHistogram, new Uint8Array(r.histogram)),
      }))
      .sort((a, b) => a.pre - b.pre)
      .slice(0, 250);

    const candidates: MelodyCandidate[] = preRanked.map((r) => ({
      id: r.trackhash,
      deltas: melodyDeltas(decodeContour(r.contour)),
      histogram: new Uint8Array(r.histogram),
    }));
    const matches = matchMelody(queryDeltas, queryHistogram, candidates, { shortlist: 250, results: 8 });
    if (matches.length === 0) return [];

    const byId = new Map(matches.map((m) => [m.id, m.score]));
    const placeholders = matches.map(() => "?").join(",");
    const meta = getDb()
      .prepare(
        `SELECT trackhash, title, artist, album, duration, arthash FROM tracks WHERE trackhash IN (${placeholders})`,
      )
      .all(...matches.map((m) => m.id)) as Array<{
      trackhash: string;
      title: string;
      artist: string;
      album: string | null;
      duration: number;
      arthash: string | null;
    }>;
    return meta
      .map((m) => ({
        trackhash: m.trackhash,
        title: m.title,
        artist: m.artist,
        album: m.album,
        image: artUrl(m.arthash) ?? null,
        duration: m.duration,
        score: byId.get(m.trackhash) ?? 0,
      }))
      .sort((a, b) => b.score - a.score);
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}
