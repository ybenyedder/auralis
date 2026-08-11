ALTER TABLE tracks ADD COLUMN mood        TEXT;
  ALTER TABLE tracks ADD COLUMN energy      REAL;
  ALTER TABLE tracks ADD COLUMN bpm         REAL;
  ALTER TABLE tracks ADD COLUMN analyzed_at INTEGER NOT NULL DEFAULT 0;
  CREATE INDEX IF NOT EXISTS idx_tracks_analyzed ON tracks(analyzed_at);
