-- EMISSION Project - Database Schema
-- Run this file once to set up the database.

-- Create a custom type for roles.
-- This enforces that only 'user' or 'admin' are valid values.
CREATE TYPE user_role AS ENUM ('user', 'admin');

-- Users table: stores all registered accounts.
CREATE TABLE IF NOT EXISTS users (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(100)  NOT NULL,
    email      VARCHAR(150)  NOT NULL CHECK (email = LOWER(email)),
    password   VARCHAR(255)  NOT NULL,          -- bcrypt hash, never plaintext
    role       user_role     NOT NULL DEFAULT 'user',
    created_at TIMESTAMP     NOT NULL DEFAULT NOW()
);

-- Case-insensitive unique index on email.
-- LOWER(email) ensures that 'User@Example.com' and 'user@example.com' are
-- treated as the same address, even if a value bypasses the application layer.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (LOWER(email));

-- Emission records table: stores CO₂ emission entries per user.
CREATE TABLE IF NOT EXISTS emission_records (
    id         SERIAL PRIMARY KEY,
    user_id    INT           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source     VARCHAR(100)  NOT NULL,
    amount     NUMERIC(10,2) NOT NULL CHECK (amount > 0),  -- kg CO₂, must be positive
    date       DATE          NOT NULL,
    created_at TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX ON emission_records (user_id, date DESC);
