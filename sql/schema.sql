-- EMISSION Project - Database Schema
-- Run this file once to set up the database.

-- Create a custom type for roles.
-- This enforces that only 'user' or 'admin' are valid values.
CREATE TYPE user_role AS ENUM ('user', 'admin');

-- Users table: stores all registered accounts.
CREATE TABLE IF NOT EXISTS users (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(100)  NOT NULL,
    email      VARCHAR(150)  NOT NULL UNIQUE,
    password   VARCHAR(255)  NOT NULL,          -- bcrypt hash, never plaintext
    role       user_role     NOT NULL DEFAULT 'user',
    created_at TIMESTAMP     NOT NULL DEFAULT NOW()
);
