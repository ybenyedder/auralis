-- Melody index for "hum to search" (query by humming).
-- One row per track: a quantised pitch contour (Int8 semitone frames at
-- `fps`, -127 = unvoiced) plus its coarse interval histogram used to
-- pre-filter candidates before the DTW pass. Computed by the opt-in
-- background indexer (POST /api/library/melody) — heavy DSP, never a scan job.
CREATE TABLE IF NOT EXISTS melody (
  trackhash TEXT PRIMARY KEY,
  fps REAL NOT NULL,
  duration REAL NOT NULL,
  contour BLOB NOT NULL,
  histogram BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);
