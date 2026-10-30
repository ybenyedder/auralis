// Background melody indexer — the opt-in "hum to search" library pass.
//
// Heavy DSP (full decode + pitch tracking of every track), so it NEVER runs as
// part of a scan: the admin triggers it (POST /api/library/melody) and it
// chews through the pending tracks in the background with progress surfaced in
// the library snapshot's `scan` object. Single-flight and incremental: only
// tracks with no melody row — or a file changed since indexing — are decoded.
//
// Server-only module.

import fs from "fs";
import path from "path";
import { createLogger } from "../logger";
import { getConfig } from "../config";
import { getDb } from "../db";
import { streamPcm, hasFfmpeg } from "./decode";
import { ContourBuilder, encodeContour, melodyHistogram, CONTOUR_FPS } from "./contour";
import { updateScanProgress } from "../library/scanner";

const log = createLogger("melody");

/** Index at most the first 8 minutes of a track — plenty of melody, bounded
 *  CPU on long mixes. */
const MAX_INDEX_SECONDS = 480;

interface PendingRow {
  trackhash: string;
  filepath: string;
  mtime: number;
}

let indexing = false;

export function isIndexing(): boolean {
  return indexing;
}

export function melodyProgress(): { running: boolean; indexed: number; total: number } {
  const row = getDb().prepare("SELECT COUNT(*) AS n FROM melody").get() as { n: number };
  return { running: indexing, indexed: row.n, total: totalTracks() };
}

function totalTracks(): number {
  try {
    const row = getDb().prepare("SELECT COUNT(*) AS n FROM tracks").get() as { n: number };
    return row.n;
  } catch {
    return 0;
  }
}

/** Start an index pass. Safe to call repeatedly — no-ops while already running
 *  or when ffmpeg is missing. */
export async function runMelodyIndex(): Promise<void> {
  if (indexing) return;
  indexing = true;
  try {
    const db = getDb();
    const pending = db
      .prepare(
        `SELECT t.trackhash, t.filepath, t.mtime FROM tracks t
         LEFT JOIN melody m ON m.trackhash = t.trackhash
         WHERE m.trackhash IS NULL OR m.updated_at < t.mtime`,
      )
      .all() as PendingRow[];
    if (pending.length === 0) {
      log.info("melody index: nothing to do");
      return;
    }
    if (!(await hasFfmpeg())) {
      log.warn("ffmpeg unavailable — melody indexing skipped");
      return;
    }

    const { musicDir } = getConfig();
    const upsert = db.prepare(
      "INSERT OR REPLACE INTO melody (trackhash, fps, duration, contour, histogram, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    );
    log.info("melody indexing started", { total: pending.length });
    updateScanProgress({ melodyRunning: true, melodyIndexed: 0, melodyTotal: pending.length });

    let done = 0;
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const row = pending[cursor++];
        const abs = path.join(musicDir, row.filepath.split("/").join(path.sep));
        try {
          if (!fs.existsSync(abs)) {
            done++;
            continue;
          }
          const builder = new ContourBuilder();
          const ok = await streamPcm(abs, (samples) => builder.push(samples), {
            maxSeconds: MAX_INDEX_SECONDS,
          });
          if (!ok) {
            done++;
            continue;
          }
          const contour = builder.finish();
          if (contour.filter((v) => v > -1).length < 20) {
            // Effectively unpitched content (speech, ambience) — store nothing.
            done++;
            continue;
          }
          upsert.run(
            row.trackhash,
            CONTOUR_FPS,
            contour.length / CONTOUR_FPS,
            encodeContour(contour),
            Buffer.from(melodyHistogram(contour)),
            Date.now(),
          );
        } catch (err) {
          log.debug("melody indexing: track failed", {
            trackhash: row.trackhash,
            error: err instanceof Error ? err.message.slice(0, 120) : String(err),
          });
        }
        done++;
        updateScanProgress({ melodyIndexed: done, melodyTotal: pending.length });
      }
    };
    await Promise.all([worker(), worker()]);
    log.info("melody indexing complete", { indexed: done });
  } finally {
    indexing = false;
    updateScanProgress({ melodyRunning: false });
  }
}
