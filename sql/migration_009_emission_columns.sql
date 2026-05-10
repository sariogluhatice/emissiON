-- Migration 009: Add category and activity_type columns to emission_records
ALTER TABLE emission_records
    ADD COLUMN IF NOT EXISTS category      VARCHAR(50),
    ADD COLUMN IF NOT EXISTS activity_type VARCHAR(50);
