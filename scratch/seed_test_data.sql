
-- 1. Dummy Kullanıcılar Oluştur (Bireysel)
INSERT INTO users (name, email, password, role, onboarding_completed, is_verified)
VALUES 
('Ahmet Yeşil', 'ahmet@test.com', 'dummy_hash', 'individual', true, true),
('Ayşe Çevreci', 'ayse@test.com', 'dummy_hash', 'individual', true, true),
('Mehmet Karbon', 'mehmet@test.com', 'dummy_hash', 'individual', true, true)
ON CONFLICT (email) DO NOTHING;

-- 2. Bu Kullanıcılara Emisyon Kayıtları Ekle
-- Ahmet: Çok düşük emisyon (Ekolojik Kahraman adayı)
INSERT INTO emission_records (user_id, source, amount, date)
SELECT id, 'Elektrik', 40.5, CURRENT_DATE FROM users WHERE email = 'ahmet@test.com';
INSERT INTO emission_records (user_id, source, amount, date)
SELECT id, 'Su', 5.2, CURRENT_DATE FROM users WHERE email = 'ahmet@test.com';

-- Ayşe: Orta seviye emisyon (Türkiye Ortalaması civarı)
INSERT INTO emission_records (user_id, source, amount, date)
SELECT id, 'Elektrik', 120.0, CURRENT_DATE FROM users WHERE email = 'ayse@test.com';
INSERT INTO emission_records (user_id, source, amount, date)
SELECT id, 'Ulaşım', 250.0, CURRENT_DATE FROM users WHERE email = 'ayse@test.com';
INSERT INTO emission_records (user_id, source, amount, date)
SELECT id, 'Gıda', 80.0, CURRENT_DATE FROM users WHERE email = 'ayse@test.com';

-- Mehmet: Yüksek emisyon (Kritik seviye)
INSERT INTO emission_records (user_id, source, amount, date)
SELECT id, 'Elektrik', 300.0, CURRENT_DATE FROM users WHERE email = 'mehmet@test.com';
INSERT INTO emission_records (user_id, source, amount, date)
SELECT id, 'Doğalgaz', 450.0, CURRENT_DATE FROM users WHERE email = 'mehmet@test.com';
INSERT INTO emission_records (user_id, source, amount, date)
SELECT id, 'Uçuş', 600.0, CURRENT_DATE FROM users WHERE email = 'mehmet@test.com';

-- 3. Mevcut kullanıcıya da veri ekle (Eğer hiç yoksa)
-- Not: Mevcut kullanıcının kim olduğunu bilmediğimiz için tüm individual kullanıcılara 
-- (dummy olmayanlara) başlangıç verisi ekleyebiliriz.
INSERT INTO emission_records (user_id, source, amount, date)
SELECT id, 'Elektrik', 95.0, CURRENT_DATE 
FROM users 
WHERE role = 'individual' 
AND email NOT IN ('ahmet@test.com', 'ayse@test.com', 'mehmet@test.com')
AND NOT EXISTS (SELECT 1 FROM emission_records WHERE user_id = users.id);
