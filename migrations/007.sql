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
