-- ============================================================
-- emissiON — Shared Development Seed Data
--
-- Password for ALL test accounts: Test1234!
-- Hash generated with bcryptjs cost 10.
--
-- Accounts created:
--   bireysel@test.com   — individual role
--   hane@test.com       — household role (admin of "Test Hanesi")
--   sirket@test.com     — company role
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Test users
-- ─────────────────────────────────────────────────────────────
INSERT INTO users (name, email, password, role, is_verified, onboarding_completed) VALUES
    ('Ahmet Yılmaz',   'bireysel@test.com', '$2b$10$eJb8c75Pp.G/74AYRBDcDexmyGlYLtKzxZWcxAmCDzi8igArpXjIu', 'individual', true, true),
    ('Fatma Demir',    'hane@test.com',     '$2b$10$eJb8c75Pp.G/74AYRBDcDexmyGlYLtKzxZWcxAmCDzi8igArpXjIu', 'household',  true, true),
    ('Mehmet Kaya',    'sirket@test.com',   '$2b$10$eJb8c75Pp.G/74AYRBDcDexmyGlYLtKzxZWcxAmCDzi8igArpXjIu', 'company',    true, true)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- Individual profile
-- ─────────────────────────────────────────────────────────────
INSERT INTO individual_profiles (user_id, has_car, commute_mode, home_type, household_size, heating_type, diet_type)
SELECT id, true, 'car', 'apartment', 2, 'natural_gas', 'omnivore'
FROM users WHERE email = 'bireysel@test.com'
ON CONFLICT (user_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- Household profile + household entity + admin membership
-- ─────────────────────────────────────────────────────────────
INSERT INTO household_profiles (user_id, household_size, home_type, heating_type)
SELECT id, 4, 'detached_house', 'natural_gas'
FROM users WHERE email = 'hane@test.com'
ON CONFLICT (user_id) DO NOTHING;

WITH hane_user AS (SELECT id FROM users WHERE email = 'hane@test.com')
INSERT INTO households (name, admin_user_id, invite_code, monthly_target)
SELECT 'Test Hanesi', id, 'TEST-HANE-01', 350.00
FROM hane_user
ON CONFLICT DO NOTHING;

WITH hane_user AS (SELECT id FROM users WHERE email = 'hane@test.com'),
     hane      AS (SELECT id FROM households WHERE invite_code = 'TEST-HANE-01')
INSERT INTO household_members (household_id, user_id, role)
SELECT hane.id, hane_user.id, 'admin'
FROM hane_user, hane
ON CONFLICT (user_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- Company profile
-- ─────────────────────────────────────────────────────────────
INSERT INTO company_profiles (user_id, company_name, industry, employee_count_range, exports_to_eu, cbam_sector, country)
SELECT id, 'Test Şirketi A.Ş.', 'manufacturing', '50-249', true, 'steel', 'TR'
FROM users WHERE email = 'sirket@test.com'
ON CONFLICT (user_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- Sample emission records for the individual user (last 3 months)
-- ─────────────────────────────────────────────────────────────
WITH u AS (SELECT id FROM users WHERE email = 'bireysel@test.com')
INSERT INTO emission_records (user_id, source, amount, date, category, activity_type)
SELECT u.id, src, amt, dt::date, cat, act FROM u, (VALUES
    ('Araç yakıtı',          85.40,  '2026-02-10', 'transport',   'car'),
    ('Elektrik faturası',    42.10,  '2026-02-28', 'energy',      'electricity'),
    ('Doğalgaz faturası',    68.90,  '2026-02-28', 'energy',      'natural_gas'),
    ('Market alışverişi',    22.30,  '2026-02-15', 'food',        'shopping'),
    ('Araç yakıtı',          91.20,  '2026-03-12', 'transport',   'car'),
    ('Elektrik faturası',    39.50,  '2026-03-31', 'energy',      'electricity'),
    ('Doğalgaz faturası',    55.00,  '2026-03-31', 'energy',      'natural_gas'),
    ('Market alışverişi',    18.70,  '2026-03-20', 'food',        'shopping'),
    ('Uçuş - İstanbul/Ankara', 95.00, '2026-03-05', 'transport',  'flight'),
    ('Araç yakıtı',          78.60,  '2026-04-08', 'transport',   'car'),
    ('Elektrik faturası',    44.80,  '2026-04-30', 'energy',      'electricity'),
    ('Doğalgaz faturası',    32.10,  '2026-04-30', 'energy',      'natural_gas'),
    ('Market alışverişi',    25.40,  '2026-04-18', 'food',        'shopping')
) AS t(src, amt, dt, cat, act)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- Sample emission records for the household user
-- ─────────────────────────────────────────────────────────────
WITH u AS (SELECT id FROM users WHERE email = 'hane@test.com')
INSERT INTO emission_records (user_id, source, amount, date, category, activity_type)
SELECT u.id, src, amt, dt::date, cat, act FROM u, (VALUES
    ('Elektrik faturası',  110.20, '2026-03-31', 'energy',    'electricity'),
    ('Doğalgaz faturası',  145.80, '2026-03-31', 'energy',    'natural_gas'),
    ('Araç yakıtı',        120.50, '2026-03-15', 'transport', 'car'),
    ('Elektrik faturası',  102.40, '2026-04-30', 'energy',    'electricity'),
    ('Doğalgaz faturası',   98.60, '2026-04-30', 'energy',    'natural_gas'),
    ('Araç yakıtı',        115.30, '2026-04-12', 'transport', 'car')
) AS t(src, amt, dt, cat, act)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- Gamification rows for all three test users
-- ─────────────────────────────────────────────────────────────
INSERT INTO user_gamification (user_id, current_streak, longest_streak, last_entry_date, total_xp, level, badges)
SELECT id,
    CASE email
        WHEN 'bireysel@test.com' THEN 7
        WHEN 'hane@test.com'     THEN 3
        ELSE 1
    END,
    CASE email
        WHEN 'bireysel@test.com' THEN 14
        WHEN 'hane@test.com'     THEN 8
        ELSE 1
    END,
    CURRENT_DATE - INTERVAL '1 day',
    CASE email
        WHEN 'bireysel@test.com' THEN 320
        WHEN 'hane@test.com'     THEN 150
        ELSE 50
    END,
    CASE email
        WHEN 'bireysel@test.com' THEN 3
        WHEN 'hane@test.com'     THEN 2
        ELSE 1
    END,
    '[]'::jsonb
FROM users WHERE email IN ('bireysel@test.com', 'hane@test.com', 'sirket@test.com')
ON CONFLICT (user_id) DO NOTHING;
