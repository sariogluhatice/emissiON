-- =============================================================
-- Migration 013 — CBAM ↔ Emission Records Integration
--
-- Extends cbam_entries to support auto-deriving embedded
-- emissions from the company's existing emission_records,
-- rather than requiring fully manual input every time.
--
-- Changes:
--   1. product_name becomes nullable (category is enough label).
--   2. Three new columns: destination_region,
--      source_emission_total (raw kg from records),
--      emission_factor_source ('auto' | 'manual').
--
-- Backward compatible: all new columns default gracefully so
-- existing rows created under migration_012 continue to work.
-- =============================================================

ALTER TABLE cbam_entries
    ALTER COLUMN product_name DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS destination_region      VARCHAR(100),
    ADD COLUMN IF NOT EXISTS source_emission_total   NUMERIC(15,4),
    ADD COLUMN IF NOT EXISTS emission_factor_source  VARCHAR(20) NOT NULL DEFAULT 'manual'
        CHECK (emission_factor_source IN ('auto', 'manual'));
