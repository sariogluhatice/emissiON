-- migration_020: Normalize non-canonical category values and add CHECK constraint
-- Safe to run multiple times (IF NOT EXISTS guard on constraint name).

-- 1. Normalize any stale non-canonical values to 'other'
UPDATE emission_records
SET category = 'other'
WHERE category IS NOT NULL
  AND category NOT IN ('energy','water','gas','transport','food','shopping','waste','materials','other');

-- 2. Add CHECK constraint (skip if already exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'emission_records'
          AND constraint_name = 'emission_records_category_check'
    ) THEN
        ALTER TABLE emission_records
            ADD CONSTRAINT emission_records_category_check
            CHECK (category IS NULL OR category IN
                ('energy','water','gas','transport','food','shopping','waste','materials','other'));
    END IF;
END $$;
