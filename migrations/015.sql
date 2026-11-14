-- Virtual online tracks streamed directly via YouTube without occupying
-- local audio storage. Holds only lightweight metadata so favorites, playlists,
-- recent history, and synced lyrics persist across sessions with 0 bytes of
-- audio stored on disk.
CREATE TABLE IF NOT EXISTS online_tracks (
  trackhash TEXT PRIMARY KEY,
  video_id  TEXT NOT NULL UNIQUE,
  title     TEXT NOT NULL,
  artist    TEXT NOT NULL,
  album     TEXT NOT NULL DEFAULT 'YouTube',
  duration  REAL NOT NULL DEFAULT 0,
  thumbnail TEXT,
  added_at  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_online_tracks_added ON online_tracks(added_at DESC);
