-- Instant Liner-style streaming placeholders: lets playlist imports insert
-- all unmatched tracks immediately (`yt:lzy_<hash>`) and resolve their YouTube
-- videoId lazily on first stream play or via background warming.
CREATE TABLE IF NOT EXISTS online_lazy_map (
  lazy_id     TEXT PRIMARY KEY,
  video_id    TEXT NOT NULL,
  resolved_at INTEGER NOT NULL
);
