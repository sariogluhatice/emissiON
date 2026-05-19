-- =============================================================
-- Migration 021 — Gamification Events Log
--
-- Event-based XP log. Enables per-event daily/lifetime limits
-- and full audit trail of how users earn XP.
-- =============================================================

CREATE TABLE IF NOT EXISTS gamification_events (
    id         SERIAL       PRIMARY KEY,
    user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(50)  NOT NULL,
    xp_awarded INTEGER      NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gamification_events_user_id   ON gamification_events(user_id);
CREATE INDEX IF NOT EXISTS idx_gamification_events_user_date ON gamification_events(user_id, created_at);
