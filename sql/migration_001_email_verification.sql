-- Migration 001: Add email verification columns to users table
-- Run this on an existing database that already has the users table.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_verified                 BOOLEAN   NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS verification_code_hash      TEXT,
    ADD COLUMN IF NOT EXISTS verification_code_expires_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS verified_at                 TIMESTAMP;
