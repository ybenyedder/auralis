-- Manifest of on-demand downloads ("Télécharger" → Auralis Downloads).
-- One row per successfully imported online download. Unlike the tracks table
-- it is NEVER pruned by the scanner: it is the authoritative list of "titles
-- this server downloaded", so when the downloads folder is wiped (Docker
-- container re-created on an ephemeral /music, unmounted volume, storage
-- cleaner...) the titles are re-downloaded from here instead of being lost —
-- the "downloaded titles disappear after every update" bug.
CREATE TABLE IF NOT EXISTS downloads (
  video_id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  -- Library-relative posix path of the imported file, used to detect loss.
  filepath TEXT NOT NULL DEFAULT '',
  trackhash TEXT,
  requested_by TEXT,
  created_at INTEGER NOT NULL,
  -- Automatic re-download attempts already spent for this title. A deliberate
  -- user re-download resets it; when it reaches the cap the title is dropped
  -- from the manifest (being deleted on purpose — stop resurrecting it).
  restore_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_downloads_trackhash ON downloads(trackhash);
