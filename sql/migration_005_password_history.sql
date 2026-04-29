-- Migration 005: Add password history table.
-- Safe to run multiple times (CREATE TABLE/INDEX IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS password_history (
    id            SERIAL    PRIMARY KEY,
    user_id       INTEGER   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash TEXT      NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS password_history_user_id_idx
    ON password_history (user_id, created_at DESC);
