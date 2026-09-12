-- Purge performance: the scanner's cascade deletes by trackhash in these
-- tables, where trackhash is the 2nd PK column (or unindexed). Without these
-- indexes every pruned track costs a full table scan inside a write transaction.
CREATE INDEX IF NOT EXISTS idx_favorites_trackhash ON favorites(trackhash);
CREATE INDEX IF NOT EXISTS idx_dislikes_trackhash ON dislikes(trackhash);
CREATE INDEX IF NOT EXISTS idx_playcounts_trackhash ON playcounts(trackhash);
CREATE INDEX IF NOT EXISTS idx_recents_trackhash ON recents(trackhash);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_trackhash ON playlist_tracks(trackhash);
CREATE INDEX IF NOT EXISTS idx_play_events_trackhash ON play_events(trackhash);
