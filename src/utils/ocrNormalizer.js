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
            const raw = m[1].replace(/,/g, '');
            const quantity = parseFloat(raw);
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

module.exports = { normalizeExpenseData };
