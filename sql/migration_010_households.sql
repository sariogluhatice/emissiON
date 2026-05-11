-- =============================================================
-- Migration 010 — Household Management
-- Creates: households, household_members, household_tasks,
--          emission_comments
-- Idempotent: safe to run multiple times (IF NOT EXISTS everywhere)
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- TABLE 1: households
--   One row per household group.
--   The admin_user_id is the user who created the household.
--   invite_code is a short, unique token members use to join.
--   monthly_target is an optional kg-CO₂ reduction goal.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS households (
    id             SERIAL        PRIMARY KEY,
    name           VARCHAR(150)  NOT NULL,
    admin_user_id  INTEGER       NOT NULL
                       REFERENCES users(id) ON DELETE CASCADE,
    invite_code    VARCHAR(20)   NOT NULL UNIQUE,
    monthly_target NUMERIC(10,2) CHECK (monthly_target > 0),  -- kg CO₂, optional
    created_at     TIMESTAMP     NOT NULL DEFAULT NOW()
);

-- Fast lookup by invite code (join flow) and by admin.
CREATE INDEX IF NOT EXISTS households_invite_code_idx
    ON households (invite_code);

CREATE INDEX IF NOT EXISTS households_admin_user_id_idx
    ON households (admin_user_id);

-- ─────────────────────────────────────────────────────────────
-- TABLE 2: household_members
--   One row per user-household relationship.
--   user_id is UNIQUE → a user can belong to only one household.
--   role CHECK ensures only 'admin' or 'member' are stored.
--   The admin row is inserted automatically when the household
--   is created (role = 'admin').
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS household_members (
    id           SERIAL      PRIMARY KEY,
    household_id INTEGER     NOT NULL
                     REFERENCES households(id) ON DELETE CASCADE,
    user_id      INTEGER     NOT NULL UNIQUE
                     REFERENCES users(id) ON DELETE CASCADE,
    role         VARCHAR(10) NOT NULL DEFAULT 'member'
                     CHECK (role IN ('admin', 'member')),
    joined_at    TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- Lookup all members of a household (most common query).
CREATE INDEX IF NOT EXISTS household_members_household_id_idx
    ON household_members (household_id);

-- user_id already has a unique index via the UNIQUE constraint,
-- but name it explicitly for clarity.
CREATE UNIQUE INDEX IF NOT EXISTS household_members_user_id_unique
    ON household_members (user_id);

-- ─────────────────────────────────────────────────────────────
-- TABLE 3: household_tasks
--   Tasks created by the admin and optionally assigned to one
--   member (assigned_to = NULL means the task applies to the
--   whole household).
--   ON DELETE SET NULL for assigned_to: if the assigned member
--   leaves/is deleted, the task survives as an unassigned task
--   rather than being deleted.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS household_tasks (
    id               SERIAL        PRIMARY KEY,
    household_id     INTEGER       NOT NULL
                         REFERENCES households(id) ON DELETE CASCADE,
    assigned_by      INTEGER       NOT NULL
                         REFERENCES users(id) ON DELETE CASCADE,
    assigned_to      INTEGER                            -- NULL = whole household
                         REFERENCES users(id) ON DELETE SET NULL,
    title            VARCHAR(200)  NOT NULL,
    description      TEXT,
    target_reduction NUMERIC(10,2) CHECK (target_reduction > 0),  -- kg CO₂ goal
    status           VARCHAR(20)   NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'in_progress', 'completed')),
    due_date         DATE,
    created_at       TIMESTAMP     NOT NULL DEFAULT NOW()
);

-- Fetch all tasks for a household (admin dashboard).
CREATE INDEX IF NOT EXISTS household_tasks_household_id_idx
    ON household_tasks (household_id);

-- Fetch tasks assigned to a specific member.
CREATE INDEX IF NOT EXISTS household_tasks_assigned_to_idx
    ON household_tasks (assigned_to);

-- Fetch tasks created by the admin (audit / history).
CREATE INDEX IF NOT EXISTS household_tasks_assigned_by_idx
    ON household_tasks (assigned_by);

-- ─────────────────────────────────────────────────────────────
-- TABLE 4: emission_comments
--   Admin-only comments on a specific emission record of a
--   specific household member.
--   emission_record_id CASCADE: if the record is deleted,
--   its comments are deleted too.
--   admin_user_id / member_user_id CASCADE: if either user is
--   deleted the comment loses meaning and is cleaned up.
--   household_id is stored so all comments can be scoped to
--   the household without extra joins.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emission_comments (
    id                 SERIAL    PRIMARY KEY,
    emission_record_id INTEGER   NOT NULL
                           REFERENCES emission_records(id) ON DELETE CASCADE,
    household_id       INTEGER   NOT NULL
                           REFERENCES households(id) ON DELETE CASCADE,
    admin_user_id      INTEGER   NOT NULL
                           REFERENCES users(id) ON DELETE CASCADE,
    member_user_id     INTEGER   NOT NULL
                           REFERENCES users(id) ON DELETE CASCADE,
    comment            TEXT      NOT NULL CHECK (TRIM(comment) <> ''),
    created_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Look up all comments on a specific emission record.
CREATE INDEX IF NOT EXISTS emission_comments_record_id_idx
    ON emission_comments (emission_record_id);

-- Look up all comments the admin has left within a household.
CREATE INDEX IF NOT EXISTS emission_comments_household_id_idx
    ON emission_comments (household_id);

-- Look up all comments made by a specific admin.
CREATE INDEX IF NOT EXISTS emission_comments_admin_user_id_idx
    ON emission_comments (admin_user_id);

-- Look up all comments visible to a specific member.
CREATE INDEX IF NOT EXISTS emission_comments_member_user_id_idx
    ON emission_comments (member_user_id);
