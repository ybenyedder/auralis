CREATE INDEX IF NOT EXISTS idx_recents_user_time ON recents(user_id, played_at DESC);
