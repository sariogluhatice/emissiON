-- Migration 007: User settings table.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS user_settings (
    id                          SERIAL    PRIMARY KEY,
    user_id                     INTEGER   NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    email_notifications         BOOLEAN   NOT NULL DEFAULT TRUE,
    carbon_tips_notifications   BOOLEAN   NOT NULL DEFAULT TRUE,
    created_at                  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMP NOT NULL DEFAULT NOW()
);
