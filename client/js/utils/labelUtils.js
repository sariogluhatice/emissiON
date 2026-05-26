// ============================================================
// labelUtils.js — Merkezi kategori ve faaliyet türü etiketleri
//
// Tüm sayfalarda CATEGORY_LABELS, ACTIVITY_TYPE_LABELS ve
// yardımcı fonksiyonlar buradan import edilmeli.
// Asla farklı dosyalarda ayrı ayrı tanımlanmamalı.
// ============================================================

// ── Kategori anahtarı → Türkçe etiket ───────────────────────
export const CATEGORY_LABELS = {
  energy:    'Enerji',
  water:     'Su',
  gas:       'Doğalgaz',
  transport: 'Ulaşım',
  materials: 'Malzeme',
  waste:     'Atık',
  food:      'Gıda',
  shopping:  'Alışveriş',
  other:     'Diğer',
};

// ── Faaliyet türü ID'si → Türkçe etiket ─────────────────────
// Hem güncel hem eski (backward compat) ID'leri kapsar.
export const ACTIVITY_TYPE_LABELS = {
  // Enerji
  electricity:      'Elektrik',
  natural_gas:      'Doğalgaz',
  // Su
  water_usage:      'Su Tüketimi',
  // Ulaşım
  car_petrol:       'Benzinli Araç',
  car_diesel:       'Dizel Araç',
  bus:              'Otobüs',
  train:            'Tren',
  flight:           'Uçuş',
  flight_domestic:  'Yurt İçi Uçuş',
  flight_international: 'Yurt Dışı Uçuş',
  flight_short:     'Yurt İçi Uçuş',
  flight_long:      'Yurt Dışı Uçuş',
  // Malzeme
  plastic:          'Plastik',
  paper:            'Kağıt',
  // Atık
  waste_general:    'Genel Atık',
  recycling:        'Geri Dönüşüm',
  // Gıda
  beef_red_meat:    'Sığır / Kırmızı Et',
  chicken:          'Tavuk',
  vegetables:       'Sebze / Meyve / Kuruyemiş',
  rice_grains:      'Pirinç / Tahıl',
  // Alışveriş
  shopping_general: 'Genel Alışveriş',
  office_supplies:  'Ofis Malzemeleri',
  electronics:      'Elektronik',
  // Eski kayıt ID'leri — geriye dönük uyumluluk
  gasoline_car:     'Benzinli Araç',
  diesel_car:       'Dizel Araç',
  water:            'Su Tüketimi',
  shopping:         'Alışveriş',
  food:             'Gıda',
  food_general:     'Genel Gıda',
  meat:             'Et Tüketimi',
};

// ── CBAM sektör etiketleri ───────────────────────────────────
export const CBAM_SECTOR_LABELS = {
  iron_steel:  'Demir ve Çelik',
  aluminium:   'Alüminyum',
  cement:      'Çimento',
  fertiliser:  'Gübre',
  hydrogen:    'Hidrojen',
  electricity: 'Elektrik',
  other:       'Diğer',
};

// ── Risk seviyeleri ──────────────────────────────────────────
export const RISK_LABELS = { low: 'Düşük', medium: 'Orta', high: 'Yüksek', critical: 'Kritik' };
export const RISK_COLORS = { low: '#16a34a', medium: '#f59e0b', high: '#dc2626', critical: '#7c3aed' };

// ── Türkçe kaynak metni → kategori anahtarı ─────────────────
// Eski kayıtlarda category sütunu boş olup source Türkçe metin içerebilir.
export const SOURCE_TO_CATEGORY = {
  'Elektrik':                    'energy',
  'Su Kullanımı':                'water',
  'Su Tüketimi':                 'water',
  'Doğalgaz':                    'gas',
  'Benzinli Araç':               'transport',
  'Dizel Araç':                  'transport',
  'Otobüs':                      'transport',
  'Kağıt':                       'materials',
  'Plastik':                     'materials',
  'Plastik / Ambalaj (Harcama)': 'materials',
  'Genel Atık':                  'waste',
  'Gıda Harcaması':              'food',
  'Sığır / Kırmızı Et':         'food',
  'Tavuk':                       'food',
  'Sebze / Meyve / Kuruyemiş':   'food',
  'Sebze':                       'food',
  'Pirinç / Tahıl':              'food',
  'Genel Gıda':                  'food',
  'Et Tüketimi':                 'food',
  'Genel Alışveriş':             'shopping',
  'Genel Perakende / Alışveriş': 'shopping',
  'Ofis Malzemeleri':            'shopping',
  'Elektronik':                  'shopping',
  'shopping':                    'shopping',
  'other':                       'other',
  'Diğer':                       'other',
};

// ── Yardımcı fonksiyonlar ────────────────────────────────────

/** Kategori anahtarından Türkçe etiket döndürür. */
export function getCategoryLabel(key) {
  return CATEGORY_LABELS[key] || key || '—';
}

/** Kategori anahtarından Türkçe etiket döndürür (emoji olmadan). */
export function getCategoryLabelWithEmoji(key) {
  return CATEGORY_LABELS[key] || key || 'Diğer';
}

/** Faaliyet türü ID'sinden Türkçe etiket döndürür. */
export function getActivityTypeLabel(id) {
  if (!id) return '—';
  return ACTIVITY_TYPE_LABELS[id] || id;
}

/**
 * Emisyon kaydından kategori anahtarını türetir.
 * Önce record.category'e bakar, yoksa source metninden çıkarsamaya çalışır.
 */
export function getCategoryKey(record) {
  if (record.category && CATEGORY_LABELS[record.category]) return record.category;

  const src = record.source || '';

  if (SOURCE_TO_CATEGORY[src]) return SOURCE_TO_CATEGORY[src];
  if (CATEGORY_LABELS[src])    return src;

  const lower = src.toLowerCase();
  if (lower.includes('uçuş') || lower.includes('flight') || lower.includes('araç') || lower.includes('otobüs') || lower.includes('bus')) return 'transport';
  if (lower.includes('elektrik') || lower.includes('electricity'))            return 'energy';
  if (lower.includes('su') || lower.includes('water'))                        return 'water';
  if (lower.includes('doğalgaz') || lower.includes('gaz') || lower.includes('gas')) return 'gas';
  if (lower.includes('atık') || lower.includes('waste'))                      return 'waste';
  if (lower.includes('gıda') || lower.includes('food'))                       return 'food';
  if (lower.includes('kağıt') || lower.includes('paper') || lower.includes('plastik') || lower.includes('malzeme')) return 'materials';
  if (lower.includes('alışveriş') || lower.includes('shop') || lower.includes('retail')) return 'shopping';

  return 'other';
}

/**
 * Emisyon kaydından faaliyet türü Türkçe etiketini döndürür.
 * activity_type varsa ondan, yoksa source alanından bakar.
 */
export function getActivityTypeLabelFromRecord(record) {
  if (record.activity_type) {
    return ACTIVITY_TYPE_LABELS[record.activity_type] || record.activity_type;
  }
  return record.source || '—';
}
