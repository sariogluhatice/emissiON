-- Migration 022: track whether a verification code resend has occurred
-- Used to enforce: after the second 120s window expires, delete the unverified account.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS code_resent BOOLEAN NOT NULL DEFAULT FALSE;
