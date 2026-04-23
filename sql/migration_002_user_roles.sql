-- Migration 002: Replace user/admin roles with individual/household/company
-- Safe to run on existing databases — uses IF NOT EXISTS and updates existing rows.

-- Add the three new role values to the existing enum type.
-- (Old values 'user' and 'admin' remain but will no longer be assigned.)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'individual';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'household';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'company';

-- Migrate existing rows: map the legacy 'user' role to 'individual'.
UPDATE users SET role = 'individual' WHERE role = 'user';

-- Change the column default to 'individual'.
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'individual';
