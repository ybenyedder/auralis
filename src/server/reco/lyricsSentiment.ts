// ============================================================================
// LYRIC SENTIMENT PASS  —  fills the "cognitive dissonance" feature
// ----------------------------------------------------------------------------
// A cheap background pass that reads the lyrics we ALREADY hold (Musixmatch /
// .lrc) and scores each track's emotional polarity with the sentiment lexicon
// (sentiment.ts), writing `lyric_valence` + `lyric_coverage` onto the track. The
// taste engine then knows whether the WORDS agree with the SOUND, powering the
// dissonance term (bright music / bleak lyrics, and the reverse).
//
// Pure TS, no ffmpeg, no model, no network — so it runs automatically after a scan
// (unlike the opt-in Python embedding extractor). Idempotent + resumable via the
// `lyrics_sentiment_at` work marker, and self-throttling (bounded batch) so it
// never competes with the audio-analysis pass for the event loop.
// ============================================================================

import { getDb } from "../db";
import { createLogger } from "../logger";
import { lyricValence } from "@/lib/auralis/sentiment";

const log = createLogger("lyrics-sentiment");

let running = false;
export function isScoringLyrics(): boolean {
  return running;
}

interface Row {
  trackhash: string;
  synced: string | null;
  plain: string | null;
}

/** Strip LRC "[mm:ss.xx]" / "[tag:value]" prefixes to recover the raw words. */
function stripLrc(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\[[^\]]*\]/g, " ").trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * Score every track that has lyrics but no sentiment yet. Safe to call repeatedly
 * (no-ops when nothing is pending) and to run alongside the audio-analysis pass.
 */
export async function runLyricsSentiment(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const db = getDb();
    // Join tracks needing sentiment against any lyrics row that carries text.
    const pending = db
      .prepare(
        `SELECT t.trackhash, l.synced, l.plain
         FROM tracks t
         JOIN lyrics l ON l.trackhash = t.trackhash
         WHERE t.lyrics_sentiment_at = 0
           AND (l.plain IS NOT NULL OR l.synced IS NOT NULL)`,
      )
      .all() as Row[];
    if (pending.length === 0) return;

    const upd = db.prepare(
      "UPDATE tracks SET lyric_valence = ?, lyric_coverage = ?, lyrics_sentiment_at = ? WHERE trackhash = ?",
    );
    const now = Date.now();
    let done = 0;
    // One transaction per modest chunk keeps write amplification low without
    // holding a single giant transaction across a 10k-track library.
    const CHUNK = 200;
    for (let i = 0; i < pending.length; i += CHUNK) {
      const slice = pending.slice(i, i + CHUNK);
      const tx = db.transaction((rows: Row[]) => {
        for (const r of rows) {
          const text = r.plain || (r.synced ? stripLrc(r.synced) : "");
          const s = lyricValence(text);
          upd.run(Math.round(s.valence * 1000) / 1000, Math.round(s.coverage * 1000) / 1000, now, r.trackhash);
          done++;
        }
      });
      tx(slice);
      // Yield so we don't monopolise the event loop between chunks.
      await new Promise((res) => setImmediate(res));
    }
    log.info("lyric sentiment scored", { tracks: done });
  } catch (error) {
    log.error("lyric sentiment pass failed", { message: error instanceof Error ? error.message : "unknown" });
  } finally {
    running = false;
  }
}

/** Mark a track's lyric sentiment stale (e.g. after re-fetching lyrics) so the
 *  next pass recomputes it. */
export function invalidateLyricSentiment(trackhash: string): void {
  try {
    getDb().prepare("UPDATE tracks SET lyrics_sentiment_at = 0 WHERE trackhash = ?").run(trackhash);
  } catch {
    /* best effort */
  }
}
