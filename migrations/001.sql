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
