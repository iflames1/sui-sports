-- Iteration: profile polish, live-session state, notification indexes.

ALTER TABLE athlete_profiles
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS banner_url TEXT,
    ADD COLUMN IF NOT EXISTS verification_requested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_athlete_profiles_verified ON athlete_profiles (verified);

ALTER TABLE live_sessions
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'scheduled',
    ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_live_sessions_status ON live_sessions (status, starts_at);
CREATE INDEX IF NOT EXISTS idx_live_sessions_athlete_starts ON live_sessions (athlete_user_id, starts_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read
    ON notifications (user_id, read_at NULLS FIRST, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_items_athlete_created
    ON content_items (athlete_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_chat_session_created
    ON live_chat_messages (session_id, created_at);
