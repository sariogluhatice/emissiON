-- Migration 004: Add password reset token columns to users table.
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS).

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reset_token_hash        TEXT,
    ADD COLUMN IF NOT EXISTS reset_token_expires_at  TIMESTAMP;
