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
