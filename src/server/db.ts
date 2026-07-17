// SQLite access layer (better-sqlite3). Single shared connection per process,
// WAL mode for concurrent reads during a scan, and a tiny forward-only migration
// runner keyed on PRAGMA user_version.

import Database from "better-sqlite3";
import type { Database as DB } from "better-sqlite3";
import { getConfig } from "./config";
import { createLogger } from "./logger";

const log = createLogger("db");

let connection: DB | null = null;

/** Ordered DDL migrations. Append-only; never edit a shipped migration in place. */
const MIGRATIONS: string[] = [
  // v1 — initial schema
  `
  CREATE TABLE IF NOT EXISTS tracks (
    trackhash    TEXT PRIMARY KEY,
    filepath     TEXT UNIQUE NOT NULL,
    title        TEXT NOT NULL,
    artist       TEXT,
    album        TEXT,
    albumhash    TEXT,
    artisthash   TEXT,
    albumartist  TEXT,
    duration     REAL NOT NULL DEFAULT 0,
    year         INTEGER,
    genre        TEXT,
    track_no     INTEGER,
    disc_no      INTEGER,
    bitrate      INTEGER,
    samplerate   INTEGER,
    channels     INTEGER,
    codec        TEXT,
    lossless     INTEGER NOT NULL DEFAULT 0,
    size         INTEGER NOT NULL DEFAULT 0,
    mtime        INTEGER NOT NULL DEFAULT 0,
    arthash      TEXT,
    folder       TEXT NOT NULL DEFAULT '/',
    has_lyrics   INTEGER NOT NULL DEFAULT 0,
    added_at     INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_tracks_album   ON tracks(albumhash);
  CREATE INDEX IF NOT EXISTS idx_tracks_artist  ON tracks(artisthash);
  CREATE INDEX IF NOT EXISTS idx_tracks_folder  ON tracks(folder);

  CREATE TABLE IF NOT EXISTS albums (
    albumhash   TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    albumartist TEXT,
    artisthash  TEXT,
    year        INTEGER,
    genre       TEXT,
    arthash     TEXT
  );

  CREATE TABLE IF NOT EXISTS artists (
    artisthash TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    arthash    TEXT
  );

  CREATE TABLE IF NOT EXISTS lyrics (
    trackhash    TEXT PRIMARY KEY,
    synced       TEXT,
    plain        TEXT,
    source       TEXT,
    status       TEXT NOT NULL DEFAULT 'unknown',
    instrumental INTEGER NOT NULL DEFAULT 0,
    fetched_at   INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS favorites (
    trackhash  TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS playlists (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    pinned      INTEGER NOT NULL DEFAULT 0,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT 0,
    updated_at  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id TEXT NOT NULL,
    trackhash   TEXT NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    added_at    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (playlist_id, trackhash)
  );
  CREATE INDEX IF NOT EXISTS idx_pltracks_pl ON playlist_tracks(playlist_id);

  CREATE TABLE IF NOT EXISTS playcounts (
    trackhash   TEXT PRIMARY KEY,
    count       INTEGER NOT NULL DEFAULT 0,
    last_played INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS recents (
    trackhash TEXT PRIMARY KEY,
    played_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_recents_time ON recents(played_at DESC);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS track_fts USING fts5(
    trackhash UNINDEXED, title, artist, album, genre,
    tokenize = 'unicode61 remove_diacritics 2'
  );
  `,
  // v2 — multi-user: per-account favorites, playlists, history and preferences.
  // Existing single-admin data is preserved by assigning it to user 1 (the admin
  // seeded in auth.ts from the previous settings-based credentials).
  `
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    is_default    INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL DEFAULT 0
  );

  ALTER TABLE favorites RENAME TO favorites_v1;
  CREATE TABLE favorites (
    user_id    INTEGER NOT NULL,
    trackhash  TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, trackhash)
  );
  INSERT INTO favorites (user_id, trackhash, created_at) SELECT 1, trackhash, created_at FROM favorites_v1;
  DROP TABLE favorites_v1;

  ALTER TABLE playcounts RENAME TO playcounts_v1;
  CREATE TABLE playcounts (
    user_id     INTEGER NOT NULL,
    trackhash   TEXT NOT NULL,
    count       INTEGER NOT NULL DEFAULT 0,
    last_played INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, trackhash)
  );
  INSERT INTO playcounts (user_id, trackhash, count, last_played) SELECT 1, trackhash, count, last_played FROM playcounts_v1;
  DROP TABLE playcounts_v1;

  ALTER TABLE recents RENAME TO recents_v1;
  CREATE TABLE recents (
    user_id   INTEGER NOT NULL,
    trackhash TEXT NOT NULL,
    played_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, trackhash)
  );
  INSERT INTO recents (user_id, trackhash, played_at) SELECT 1, trackhash, played_at FROM recents_v1;
  DROP TABLE recents_v1;
  CREATE INDEX IF NOT EXISTS idx_recents_time ON recents(played_at DESC);

  ALTER TABLE playlists ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1;
  CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id);

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER NOT NULL,
    key     TEXT NOT NULL,
    value   TEXT,
    PRIMARY KEY (user_id, key)
  );
  INSERT INTO user_settings (user_id, key, value) SELECT 1, substr(key, 6), value FROM settings WHERE key LIKE 'pref.%';
  DELETE FROM settings WHERE key LIKE 'pref.%';
  `,
  // v3 — append-only listening event log powering streaks + weekly recap. The
  // `recents` ring only keeps the latest play per track (so it can't tell that the
  // same five songs were played every day), which a day-by-day streak needs. The
  // log is pruned to ~400 days on write so it stays bounded while still allowing a
  // year-in-review.
  `
  CREATE TABLE IF NOT EXISTS play_events (
    user_id   INTEGER NOT NULL,
    trackhash TEXT NOT NULL,
    played_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_play_events_user_time ON play_events(user_id, played_at DESC);
  `,
  // v4 — session revocation. Stateless HMAC session tokens embed this counter; a
  // password change bumps it so previously-issued tokens (which carry the old
  // value) stop validating. Closes the "a leaked 30-day token still works after a
  // password reset" gap.
  `
  ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
  `,
  // v5 — composite index for the per-user recent-plays read. The history query is
  // `WHERE user_id = ? ORDER BY played_at DESC`; the v2 `idx_recents_time` only
  // covers the ordering, forcing a per-user filter+sort. This serves both the
  // equality predicate and the descending order from a single index.
  `
  CREATE INDEX IF NOT EXISTS idx_recents_user_time ON recents(user_id, played_at DESC);
  `,
  // v6 — audio analysis. A background pass decodes each track with ffmpeg and
  // derives real features (loudness/energy, tempo/bpm) to classify a `mood`,
  // replacing the genre-only heuristic. `analyzed_at` is the work-queue marker:
  // 0 = needs analysis (also reset when a file's bytes change on rescan).
  `
  ALTER TABLE tracks ADD COLUMN mood        TEXT;
  ALTER TABLE tracks ADD COLUMN energy      REAL;
  ALTER TABLE tracks ADD COLUMN bpm         REAL;
  ALTER TABLE tracks ADD COLUMN analyzed_at INTEGER NOT NULL DEFAULT 0;
  CREATE INDEX IF NOT EXISTS idx_tracks_analyzed ON tracks(analyzed_at);
  `,
  // v7 — feedback-driven recommendations. Two new signals join the existing
  // "complete listen" (the only thing recorded until now):
  //   • SKIPS — the event log gains a `kind` ('complete' | 'skip') plus how much
  //     of the track was actually heard (`ms_played`, `ratio`). Existing rows are
  //     all real listens, so they default to 'complete' (keeping streaks/recap
  //     unchanged). Skips feed the taste engine a negative signal.
  //   • DISLIKES — an explicit "not for me" per user, a hard exclude from recs
  //     (mirrors the favorites table, opposite polarity).
  // The composite index serves the engine's per-user, per-kind event scan.
  `
  ALTER TABLE play_events ADD COLUMN kind      TEXT NOT NULL DEFAULT 'complete';
  ALTER TABLE play_events ADD COLUMN ms_played INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE play_events ADD COLUMN ratio     REAL NOT NULL DEFAULT 1;
  CREATE INDEX IF NOT EXISTS idx_play_events_user_kind ON play_events(user_id, kind, played_at DESC);

  CREATE TABLE IF NOT EXISTS dislikes (
    user_id    INTEGER NOT NULL,
    trackhash  TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, trackhash)
  );
  `,
  // v8 — signature features foundation:
  //   • art_colors — dominant cover-art palette (shadow / base / highlight),
  //     keyed by arthash so it is shared across every track + album using that
  //     cover. Populated lazily when a thumbnail is first generated (art.ts), so
  //     existing libraries backfill as the user browses — no re-scan needed.
  //   • tracks.gain — per-track ReplayGain-style adjustment (dB toward -14 dBFS
  //     RMS), derived from the SAME ffmpeg decode the mood analyzer already runs.
  //   • playlists.rules — smart-playlist rule set (JSON); NULL = a normal static
  //     playlist that stores explicit trackhashes.
  //   • playlists.is_shared + playlist_collaborators — household collaborative
  //     playlists, co-editable by invited users on the same server.
  `
  CREATE TABLE IF NOT EXISTS art_colors (
    arthash TEXT PRIMARY KEY,
    accent  TEXT NOT NULL
  );

  ALTER TABLE tracks ADD COLUMN gain REAL;

  ALTER TABLE playlists ADD COLUMN rules     TEXT;
  ALTER TABLE playlists ADD COLUMN is_shared INTEGER NOT NULL DEFAULT 0;

  CREATE TABLE IF NOT EXISTS playlist_collaborators (
    playlist_id TEXT NOT NULL,
    user_id     INTEGER NOT NULL,
    added_at    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (playlist_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_plcollab_user ON playlist_collaborators(user_id);
  `,
  // v9 — custom playlist cover art. `image_hash` points into the SAME
  // content-addressed art cache tracks/albums use (art.ts cacheArtBuffer /
  // /api/art/[hash]); NULL = no custom cover, clients fall back to a
  // generated mosaic from the playlist's own tracks.
  `
  ALTER TABLE playlists ADD COLUMN image_hash TEXT;
  `,
  // v10 — SOTA recommendation substrate. All columns are OPTIONAL enrichment the
  // engine folds in when present and ignores when NULL, so an un-enriched library
  // scores exactly as before:
  //   • embedding — packed Float32 deep audio embedding (timbre/texture) from the
  //     optional Python extractor (scripts/extract_embeddings.py, librosa/OpenL3
  //     + optional Demucs stems). Uniform length across the library. NULL until
  //     extracted; powers the deep-timbre content term + taste clustering.
  //   • stems — JSON per-stem energy summary (vocals/bass/drums/other) from Demucs,
  //     for telemetry/UI (the extractor also appends stem dims to `embedding`).
  //   • lyric_valence / lyric_coverage — bag-of-words sentiment of the track's
  //     lyrics (sentiment.ts), 0..1 valence + how much signal there was. Feeds the
  //     "cognitive dissonance" term (happy sound / sad words). Filled by a
  //     background pass over tracks that already have lyrics; NULL otherwise.
  // `embedded_at` is the extractor's work-queue marker (0 = needs embedding),
  // mirroring `analyzed_at`.
  `
  ALTER TABLE tracks ADD COLUMN embedding      BLOB;
  ALTER TABLE tracks ADD COLUMN stems          TEXT;
  ALTER TABLE tracks ADD COLUMN lyric_valence  REAL;
  ALTER TABLE tracks ADD COLUMN lyric_coverage REAL;
  ALTER TABLE tracks ADD COLUMN embedded_at    INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE tracks ADD COLUMN lyrics_sentiment_at INTEGER NOT NULL DEFAULT 0;
  CREATE INDEX IF NOT EXISTS idx_tracks_embedded  ON tracks(embedded_at);
  CREATE INDEX IF NOT EXISTS idx_tracks_lyricsent ON tracks(lyrics_sentiment_at);
  `,
];

function migrate(db: DB) {
  const current = db.pragma("user_version", { simple: true }) as number;
  if (current >= MIGRATIONS.length) return;

  for (let version = current; version < MIGRATIONS.length; version++) {
    log.info("applying migration", { to: version + 1 });
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[version]);
      db.pragma(`user_version = ${version + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

let shutdownHooked = false;

// A SIGTERM/SIGINT lands mid-write without this (process manager restart,
// `docker stop`, Electron's `serverProcess.kill()` on quit — all send SIGTERM).
// Node's default reaction just dies immediately, leaving WAL frames unmerged
// into the main db file; better-sqlite3's own `.close()` only does a passive
// checkpoint attempt, not a guaranteed one. Hooked once per process, the first
// time a connection is opened, so every entrypoint (web, standalone, desktop's
// forked child) gets it for free without each needing its own shutdown wiring.
function hookGracefulShutdown(): void {
  if (shutdownHooked) return;
  shutdownHooked = true;
  const shutdown = (signal: string) => {
    log.info("shutting down", { signal });
    closeDb();
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

export function getDb(): DB {
  if (connection) return connection;

  const { dbPath } = getConfig();
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);

  connection = db;
  hookGracefulShutdown();
  log.info("database ready", { dbPath });
  return db;
}

/** Write a consistent point-in-time copy of the database to `destinationFile`,
 *  via SQLite's online backup API (better-sqlite3's `.backup()`) — safe to run
 *  against a live WAL-mode connection with concurrent readers/writers, unlike a
 *  plain filesystem copy of the .db file (which could grab it mid-write or miss
 *  data still sitting in the WAL). Used by the admin backup-download route. */
export async function backupDbTo(destinationFile: string): Promise<void> {
  await getDb().backup(destinationFile);
}

/** Close the connection — used by tests and graceful shutdown. */
export function closeDb(): void {
  if (connection) {
    // TRUNCATE forces a full checkpoint (merge WAL into the main file, then
    // reset it to empty) rather than the default PASSIVE mode's best-effort
    // partial checkpoint, so an interrupted shutdown never sees a fatter WAL
    // than the writes since the last natural checkpoint actually warranted.
    try {
      connection.pragma("wal_checkpoint(TRUNCATE)");
    } catch {
      // best effort — still close the handle below even if the checkpoint failed
    }
    connection.close();
  }
  connection = null;
}
