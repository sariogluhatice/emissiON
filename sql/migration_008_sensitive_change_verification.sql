-- Migration 008: Pending email and password change verification tables.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS pending_email_changes (
    id          SERIAL    PRIMARY KEY,
    user_id     INTEGER   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    new_email   VARCHAR(150) NOT NULL,
    code_hash   TEXT      NOT NULL,
    expires_at  TIMESTAMP NOT NULL,
    consumed_at TIMESTAMP,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pending_email_changes_user_idx
    ON pending_email_changes (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pending_password_changes (
    id                SERIAL    PRIMARY KEY,
    user_id           INTEGER   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    new_password_hash TEXT      NOT NULL,
    code_hash         TEXT      NOT NULL,
    expires_at        TIMESTAMP NOT NULL,
    consumed_at       TIMESTAMP,
    created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pending_password_changes_user_idx
    ON pending_password_changes (user_id, created_at DESC);
