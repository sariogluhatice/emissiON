/**
 * Normalize a person's display name:
 *   - Strip leading/trailing whitespace, collapse internal runs of spaces
 *   - Title-case each word with Turkish-aware toUpperCase for the first letter
 *
 * Examples:
 *   "hatice sarıoğlu"   → "Hatice Sarıoğlu"
 *   "  HATİCE  SARIOĞLU " → "Hatice Sarıoğlu"
 */
function normalizeName(raw) {
    if (!raw || typeof raw !== 'string') return '';

    return raw
        .trim()
        .replace(/\s+/g, ' ')
        .split(' ')
        .map(word => {
            if (!word) return '';
            // Turkish-aware first-letter uppercase:
            // 'i' → 'İ'  (not 'I' as ASCII toUpperCase would produce)
            const first = word.charAt(0);
            const upper = first === 'i' ? 'İ' : first.toLocaleUpperCase('tr-TR');
            const rest  = word.slice(1).toLocaleLowerCase('tr-TR');
            return upper + rest;
        })
        .join(' ');
}

module.exports = { normalizeName };
