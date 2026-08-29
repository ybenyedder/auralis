ALTER TABLE tracks ADD COLUMN embedding      BLOB;
  ALTER TABLE tracks ADD COLUMN stems          TEXT;
  ALTER TABLE tracks ADD COLUMN lyric_valence  REAL;
  ALTER TABLE tracks ADD COLUMN lyric_coverage REAL;
  ALTER TABLE tracks ADD COLUMN embedded_at    INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE tracks ADD COLUMN lyrics_sentiment_at INTEGER NOT NULL DEFAULT 0;
  CREATE INDEX IF NOT EXISTS idx_tracks_embedded  ON tracks(embedded_at);
  CREATE INDEX IF NOT EXISTS idx_tracks_lyricsent ON tracks(lyrics_sentiment_at);
