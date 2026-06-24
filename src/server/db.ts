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
  log.info("database ready", { dbPath });
  return db;
}

/** Close the connection — used by tests and graceful shutdown. */
export function closeDb(): void {
  connection?.close();
  connection = null;
}
