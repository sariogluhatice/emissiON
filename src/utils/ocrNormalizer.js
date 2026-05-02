const MONTH_MAP = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12',
    jan: '01', feb: '02', mar: '03', apr: '04',
    jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

function detectCategory(text) {
    const t = text.toLowerCase();
    if (/natural[\s-]?gas|gaz fatura|therm|\bbtu\b/.test(t)) return 'natural_gas';
    if (/\bwater\b|water supply|su fatura|litre|liter|\bgallon\b/.test(t)) return 'water';
    if (/\bkwh\b|kilowatt|electricit|electric supply/.test(t)) return 'electricity';
    return null;
}

function extractQuantityAndUnit(text) {
    const patterns = [
        { re: /(\d[\d,.]*)[\s]*(kWh)/i,         unit: 'kWh' },
        { re: /(\d[\d,.]*)[\s]*(therm)/i,        unit: 'therm' },
        { re: /(\d[\d,.]*)[\s]*(m3|m³|m\^3)/i,  unit: 'm3' },
        { re: /(\d[\d,.]*)[\s]*(litre|liter|l)\b/i, unit: 'l' },
    ];

    for (const { re, unit } of patterns) {
        const m = text.match(re);
        if (m) {
            const raw = parseTurkishNumber(m[1]);
            const quantity = raw;
            if (Number.isFinite(quantity) && quantity > 0) {
                return { quantity, unit };
            }
        }
    }
    return { quantity: null, unit: null };
}

function normalizeToYearMonth(raw) {
    if (!raw) return null;
    const s = raw.trim();

    // YYYY-MM-DD or YYYY/MM/DD
    let m = s.match(/^(\d{4})[-/](\d{1,2})[-/]\d{1,2}$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;

    // DD/MM/YYYY or DD-MM-YYYY (European)
    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (m) {
        const [, dd, mm, yyyy] = m;
        const day = parseInt(dd, 10);
        const month = parseInt(mm, 10);
        // If dd > 12, it must be day-first format
        if (day > 12) return `${yyyy}-${mm.padStart(2, '0')}`;
        // Otherwise assume European (day/month/year)
        return `${yyyy}-${mm.padStart(2, '0')}`;
    }

    // "March 2026" or "Mar 2026"
    m = s.match(/^([A-Za-z]+)[\s,]+(\d{4})$/);
    if (m) {
        const monthNum = MONTH_MAP[m[1].toLowerCase()];
        if (monthNum) return `${m[2]}-${monthNum}`;
    }

    // "2026 March"
    m = s.match(/^(\d{4})[\s,]+([A-Za-z]+)$/);
    if (m) {
        const monthNum = MONTH_MAP[m[2].toLowerCase()];
        if (monthNum) return `${m[1]}-${monthNum}`;
    }

    // Already YYYY-MM
    m = s.match(/^(\d{4})-(\d{2})$/);
    if (m) return s;

    return null;
}

function extractDate(summaryFields, rawText) {
    // Prefer structured Textract summary fields
    const dateTypes = ['INVOICE_RECEIPT_DATE', 'DUE_DATE', 'ORDER_DATE', 'SERVICE_DATE'];
    for (const field of summaryFields) {
        if (dateTypes.includes(field?.Type?.Text)) {
            const val = field?.ValueDetection?.Text;
            const normalized = normalizeToYearMonth(val);
            if (normalized) return normalized;
        }
    }

    // Fallback: scan raw text for date-like patterns
    const datePatterns = [
        /\b(\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/,
        /\b(\d{1,2}[-/]\d{1,2}[-/]\d{4})\b/,
        /\b([A-Za-z]+ \d{4})\b/,
    ];
    for (const re of datePatterns) {
        const m = rawText.match(re);
        if (m) {
            const normalized = normalizeToYearMonth(m[1]);
            if (normalized) return normalized;
        }
    }

    return null;
}

function normalizeExpenseData(expenseDoc) {
    const lines = (expenseDoc.Blocks || [])
        .filter(b => b.BlockType === 'LINE' && b.Text)
        .map(b => b.Text.trim());
    const rawText = lines.join('\n');

    const category = detectCategory(rawText);
    const { quantity, unit } = extractQuantityAndUnit(rawText);
    const date = extractDate(expenseDoc.SummaryFields || [], rawText);

    return { category, quantity, unit, date };
}

// Turkish grand-total label patterns on e-fatura / receipts
const TR_TOTAL_RE = /genel toplam|toplam tutar|ödenecek tutar|ödenecek|kdv dahil|genel tutar/i;

/**
 * Türkçe ve İngilizce sayı formatlarını float'a çevirir.
 * TR: 1.268,86 → 1268.86  |  268,86 → 268.86
 * EN: 1,268.86 → 1268.86  |  268.86 → 268.86
 * Ambiguous (Textract virgülü nokta olarak okursa): 1.268.86 → 1268.86
 */
function parseTurkishNumber(str) {
    let t = String(str || '').trim();
    if (!t) return null;

    // TR thousands + decimal: 1.268,86  /  12.345.678,90
    if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(t)) {
        const n = parseFloat(t.replace(/\./g, '').replace(',', '.'));
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    // EN thousands + decimal: 1,268.86
    if (/^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(t)) {
        const n = parseFloat(t.replace(/,/g, ''));
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    // Ambiguous two-dot (Textract OCR'd comma as dot): 1.268.86
    // Heuristic: middle group(s) have 3 digits, last group has 1-2 digits → TR decimal
    if (/^\d{1,3}(\.\d{3})+\.\d{1,2}$/.test(t)) {
        const lastDot = t.lastIndexOf('.');
        const n = parseFloat(t.slice(0, lastDot).replace(/\./g, '') + '.' + t.slice(lastDot + 1));
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    // Pure thousands groups: 1.392 or 1,392
    if (/^\d{1,3}([.,]\d{3})+$/.test(t)) {
        const n = parseFloat(t.replace(/[.,]/g, ''));
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    // TR decimal comma (no thousands): 392,86
    if (/^\d+,\d{1,2}$/.test(t)) {
        const n = parseFloat(t.replace(',', '.'));
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    // EN decimal dot (no thousands): 392.86
    if (/^\d+\.\d{1,2}$/.test(t)) {
        const n = parseFloat(t);
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    // Integer
    if (/^\d+$/.test(t)) {
        const n = parseFloat(t);
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    return null;
}

function parseAmount(str) {
    const raw = String(str || '')
        .replace(/[₺€$£¥]/g, ' ')
        .replace(/(TRY|EUR|USD|GBP|JPY|TL)(?![A-Za-z])/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!raw) return null;

    const tokens = raw.match(/\d[\d.,]*/g) || [];

    const parseTokenAmount = (token) => parseTurkishNumber(token);

    const values = tokens
        .map(parseTokenAmount)
        .filter((n) => Number.isFinite(n) && n > 0);

    if (!values.length) return null;

    // Prefer the largest numeric candidate for total-like fields.
    return values.sort((a, b) => b - a)[0];
}

function parseCurrency(str) {
    const s = String(str || '');
    if (/₺/.test(s))                              return 'TRY';
    if (/(TRY|TL)(?![A-Za-z])/i.test(s))         return 'TRY';  // catches "30TL" (no space)
    if (/€/.test(s))                              return 'EUR';
    if (/\bEUR\b/i.test(s))                      return 'EUR';
    if (/\$/.test(s))                             return 'USD';
    if (/\bUSD\b/i.test(s))                      return 'USD';
    if (/£/.test(s))                              return 'GBP';
    if (/\bGBP\b/i.test(s))                      return 'GBP';
    return null;
}

function detectCurrencyFromAllFields(summaryFields) {
    for (const field of summaryFields) {
        const cur = parseCurrency(field?.ValueDetection?.Text || '')
                 || parseCurrency(field?.LabelDetection?.Text  || '');
        if (cur) return cur;
    }
    return null;
}

// Raw-text fallback: find amount on the same line or the next line after a TR total keyword
function extractTotalFromLines(lineArr) {
    // Ordered from most-specific to least-specific
    const kwPatterns = [
        /genel toplam/i,
        /toplam tutar/i,
        /ödenecek tutar/i,
        /kdv dahil/i,
        /genel tutar/i,
        /ödenecek/i,
        /toplam/i,           // generic — checked last
    ];

    const bannedHint = /(kdv|vergi|tax|indirim|discount|ara toplam|subtotal)/i;
    const found = [];

    for (const kw of kwPatterns) {
        for (let i = 0; i < lineArr.length; i++) {
            if (!kw.test(lineArr[i])) continue;

            // Skip obvious tax/subtotal lines for generic total heuristics.
            if (kw.source === 'toplam' && bannedHint.test(lineArr[i])) continue;

            // Try to parse an amount from the same line (after the keyword)
            const afterKw = lineArr[i].replace(kw, '').trim();
            const sameAmt = parseAmount(afterKw);
            if (sameAmt) found.push(sameAmt);

            // Try the next line
            if (i + 1 < lineArr.length) {
                if (kw.source === 'toplam' && bannedHint.test(lineArr[i + 1])) continue;
                const nextAmt = parseAmount(lineArr[i + 1]);
                if (nextAmt) found.push(nextAmt);
            }
        }
    }

    if (!found.length) return null;
    return found.sort((a, b) => b - a)[0];
}

function extractShoppingData(expenseDoc) {
    const summaryFields = expenseDoc.SummaryFields || [];

    const lineArr = (expenseDoc.Blocks || [])
        .filter(b => b.BlockType === 'LINE' && b.Text)
        .map(b => b.Text.trim());
    const rawText = lineArr.join('\n');

    // ── Step 1: structured SummaryFields ──────────────────────────
    const candidates = [];
    for (const field of summaryFields) {
        const typeText  = field?.Type?.Text  || '';
        const labelText = field?.LabelDetection?.Text  || '';
        const valText   = field?.ValueDetection?.Text || '';

        let priority = null;
        if (typeText === 'TOTAL')                priority = 1;
        else if (TR_TOTAL_RE.test(labelText))    priority = 2;
        else if (typeText === 'AMOUNT_PAID')     priority = 3;
        else if (typeText === 'SUBTOTAL')        priority = 4;

        if (priority === null) continue;

        const amount   = parseAmount(valText);
        const currency = parseCurrency(valText) || parseCurrency(labelText);

        if (amount) candidates.push({ priority, amount, currency });
    }

    // Prefer strong total signals (TOTAL or TR grand-total labels), then choose largest.
    const strong = candidates.filter((c) => c.priority <= 2);
    const pool = strong.length ? strong : candidates;
    pool.sort((a, b) => b.amount - a.amount || a.priority - b.priority);
    const best = pool[0] || null;

    // ── Step 2: raw-text fallback if structured extraction found nothing ──
    const totalAmount = best?.amount || extractTotalFromLines(lineArr) || null;

    const currency = best?.currency
        || detectCurrencyFromAllFields(summaryFields)
        || parseCurrency(rawText)
        || 'TRY';

    const date = extractDate(summaryFields, rawText);

    return { totalAmount, currency, date };
}

module.exports = { normalizeExpenseData, extractShoppingData };
