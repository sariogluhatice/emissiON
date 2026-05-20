// Canonical emission categories — frontend ES module mirror of src/utils/categoryNormalizer.js
// CLIMATIQ CONSTRAINT: Only affects internal storage / display; never passed to Climatiq.
import { CATEGORY_LABELS } from './labelUtils.js';
export { CATEGORY_LABELS };

export const CANONICAL = new Set([
    'energy', 'water', 'gas', 'transport', 'food', 'shopping', 'waste', 'materials', 'other',
]);

const ALIAS_MAP = {
    electricity:    'energy',
    elektrik:       'energy',
    enerji:         'energy',
    natural_gas:    'gas',
    doğalgaz:       'gas',
    dogalgaz:       'gas',
    water_usage:    'water',
    su:             'water',
    'su kullanımı': 'water',
    alışveriş:      'shopping',
    alisveris:      'shopping',
    gıda:           'food',
    gida:           'food',
    yemek:          'food',
    beslenme:       'food',
    ulaşım:         'transport',
    ulasim:         'transport',
    atık:           'waste',
    atik:           'waste',
    çöp:            'waste',
    cop:            'waste',
    malzeme:        'materials',
};

/** Maps any raw category string to the canonical lowercase key. */
export function normalizeCategory(raw) {
    if (!raw) return 'other';
    const c = String(raw).toLowerCase().trim();
    if (CANONICAL.has(c)) return c;
    return ALIAS_MAP[c] || 'other';
}

/** True when the value is already a valid canonical key. */
export function isCanonical(cat) {
    return CANONICAL.has(String(cat).toLowerCase().trim());
}
