-- =============================================================
-- Migration 016 — User Gamification
--
-- Streak tracking, XP, levels, and earned badges per user.
-- =============================================================

CREATE TABLE IF NOT EXISTS user_gamification (
    user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    current_streak  INTEGER      NOT NULL DEFAULT 0,
    longest_streak  INTEGER      NOT NULL DEFAULT 0,
    last_entry_date DATE,
    total_xp        INTEGER      NOT NULL DEFAULT 0,
    level           INTEGER      NOT NULL DEFAULT 1,
    badges          JSONB        NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_gamification_user_id ON user_gamification(user_id);
