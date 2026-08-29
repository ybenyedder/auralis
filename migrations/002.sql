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
