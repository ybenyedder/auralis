CREATE TABLE IF NOT EXISTS play_events (
    user_id   INTEGER NOT NULL,
    trackhash TEXT NOT NULL,
    played_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_play_events_user_time ON play_events(user_id, played_at DESC);
