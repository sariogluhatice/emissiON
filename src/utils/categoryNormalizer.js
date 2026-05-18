// Canonical emission categories used across the entire application.
// CLIMATIQ CONSTRAINT: This module ONLY affects internal storage / display.
// Never pass these values to Climatiq — Climatiq uses its own activity_ids.

const CANONICAL = new Set([
    'energy', 'water', 'gas', 'transport', 'food', 'shopping', 'waste', 'materials', 'other',
]);

const CATEGORY_LABELS = {
    energy:    'Enerji',
    water:     'Su',
    gas:       'Doğalgaz',
    transport: 'Ulaşım',
    food:      'Gıda',
    shopping:  'Alışveriş',
    waste:     'Atık',
    materials: 'Malzeme',
    other:     'Diğer',
};

const ALIAS_MAP = {
    // energy
    electricity: 'energy',
    elektrik:    'energy',
    enerji:      'energy',
    // gas
    natural_gas: 'gas',
    doğalgaz:    'gas',
    dogalgaz:    'gas',
    // water
    water_usage:    'water',
    su:             'water',
    'su kullanımı': 'water',
    // shopping
    alışveriş:   'shopping',
    alisveris:   'shopping',
    // food
    gıda:        'food',
    gida:        'food',
    yemek:       'food',
    beslenme:    'food',
    // transport
    ulaşım:      'transport',
    ulasim:      'transport',
    // waste
    atık:        'waste',
    atik:        'waste',
    çöp:         'waste',
    cop:         'waste',
    // materials
    malzeme:     'materials',
};

/**
 * Maps any raw category string (Climatiq output, OCR, Turkish text, old DB value)
 * to the canonical lowercase key.  Returns 'other' for unrecognised values.
 */
function normalizeCategory(raw) {
    if (!raw) return 'other';
    const c = String(raw).toLowerCase().trim();
    if (CANONICAL.has(c)) return c;
    return ALIAS_MAP[c] || 'other';
}

/** Returns the Turkish display label for a canonical category key. */
function getCategoryLabel(canonical) {
    return CATEGORY_LABELS[canonical] || CATEGORY_LABELS.other;
}

/** True when the value is already a valid canonical key. */
function isCanonical(cat) {
    return CANONICAL.has(String(cat).toLowerCase().trim());
}

module.exports = { normalizeCategory, getCategoryLabel, isCanonical, CANONICAL, CATEGORY_LABELS };
