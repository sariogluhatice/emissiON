const MONTH_MAP = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12',
    jan: '01', feb: '02', mar: '03', apr: '04',
    jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

// Keywords that indicate the DOCUMENT FORMAT is electronic — not an electricity bill.
// "Elektronik Olarak İletilmiştir", "e-Arşiv Fatura", "Belge Tipi: ELEKTRONIK" etc.
const E_INVOICE_RE = /e-ar[sş]iv|e-fatura|efatura|earsivfatura|belge.{0,15}elektronik|elektronik olarak|e-archive|e-invoice/i;

// Shopping / e-commerce positive signals.
const SHOPPING_RE = /satış internet üzerinden|mağaza adı|sipariş|kargo|kredi kartı|birim fiyat|web adresi|ürün|mal hizmet|adet/i;

// Genuine electricity consumption signals — "elektronik" is explicitly excluded.
const ELEC_CONSUMPTION_RE = /\bkwh\b|kilowatt|aktif enerji|tesisat no|sayaç|dağıtım bedeli|enerji bedeli|elektrik tüketimi|elektrik faturası|electric supply/i;

// Fuel receipt keyword patterns
const PETROL_RE   = /\b(benzin|kurşunsuz|gasoline|kursunsuz|95\s*oktan|98\s*oktan|super\s*benzin)\b/i;
const DIESEL_RE   = /\b(motorin|dizel|diesel)\b/i;
const FUEL_GENERIC_RE = /\b(akaryakıt|akaryakit|yakit|yakıt|fuel)\b/i;
const LITRE_RE    = /(\d[\d,.]*)[\s]*(litre|liter|(?<!\d)lt(?!\w)|(?<!\w)l(?=\s*\d{0,1}[\r\n\s,]))/i;

/**
 * Detects if the OCR text is a fuel receipt and extracts fuel type and litre amount.
 * Returns null if the text is not a fuel receipt.
 */
function detectFuelInfo(text) {
    const isPetrol  = PETROL_RE.test(text);
    const isDiesel  = DIESEL_RE.test(text);
    const isGeneric = FUEL_GENERIC_RE.test(text);

    if (!isPetrol && !isDiesel && !isGeneric) return null;

    // Extract litre amount — patterns: "42 L", "35.7 lt", "51 litre"
    let litreAmount = null;
    const litrePatterns = [
        /(\d[\d,.]*)\s*litre/i,
        /(\d[\d,.]*)\s*liter/i,
        /(\d[\d,.]*)\s*lt\b/i,
        /(\d[\d,.]*)\s*L\b/,
    ];
    for (const re of litrePatterns) {
        const m = text.match(re);
        if (m) {
            const parsed = parseTurkishNumber(m[1]);
            if (parsed && parsed > 0 && parsed < 5000) { // sanity check: 0–5000 L
                litreAmount = parsed;
                break;
            }
        }
    }

    let fuelType = null;
    if (isPetrol && !isDiesel) fuelType = 'petrol';
    else if (isDiesel && !isPetrol) fuelType = 'diesel';
    // both or only generic → ambiguous → fuelType stays null

    return { fuelType, litreAmount };
}

function detectCategory(text) {
    const t = text.toLowerCase();
    const isEInvoice  = E_INVOICE_RE.test(t);
    const isShopping  = SHOPPING_RE.test(t);

    // Shopping signals win over any weak utility signal.
    if (isShopping) return null; // null → caller treats as shopping

    if (/natural[\s-]?gas|gaz fatura|therm|\bbtu\b|doğalgaz|dogalgaz/.test(t)) return 'gas';
    if (/water supply|su fatura|su tüketimi|tüketim.*su/.test(t))               return 'water';
    if (/\bwater\b/.test(t) && !isShopping)                                     return 'water';

    // Electricity: require genuine consumption signals; e-invoice markers disqualify.
    if (!isEInvoice && ELEC_CONSUMPTION_RE.test(t))                             return 'energy';
    // "elektrik" alone is enough only when there's a corroborating consumption word.
    if (!isEInvoice && /\belektrik\b/.test(t) && /kwh|tüketim|sayaç|abonelik|tesisat/.test(t)) return 'energy';

    // Fuel receipts → transport
    if (PETROL_RE.test(t) || DIESEL_RE.test(t) || FUEL_GENERIC_RE.test(t)) return 'transport';

    console.log('[detectCategory] reason=no_match isEInvoice=%s isShopping=%s', isEInvoice, isShopping);
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

    // Fuel receipt enrichment
    const fuelInfo = detectFuelInfo(rawText);
    if (fuelInfo) {
        return {
            category: 'transport',
            quantity: fuelInfo.litreAmount ?? quantity,
            unit: fuelInfo.litreAmount ? 'l' : unit,
            date,
            fuelType: fuelInfo.fuelType,      // 'petrol' | 'diesel' | null
            litreAmount: fuelInfo.litreAmount, // raw litre value from receipt
        };
    }

    return { category, quantity, unit, date };
}

// Turkish grand-total label patterns on e-fatura / receipts
const TR_TOTAL_RE = /ödenecek tutar|vergiler dahil toplam|genel toplam|toplam tutar|ödenecek|kdv dahil|genel tutar/i;

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

// Raw-text fallback: find amount using strict priority order.
// Returns the amount found for the HIGHEST-PRIORITY label, not the largest number.
function extractTotalFromLines(lineArr) {
    // These labels are intermediate subtotals — never use them as final amount.
    const SUBTOTAL_LABELS = /(kdv matrah|vergi hariç|mal hizmet toplam|hizmet matrah|teslim.{0,10}matrah|ara toplam|subtotal|indirim|discount)/i;

    // Checked in strict priority order — returns on the FIRST label that yields a valid amount.
    const PRIORITY_PATTERNS = [
        { re: /ödenecek tutar/i,          label: 'ödenecek tutar'          }, // 1 — final payable
        { re: /vergiler dahil toplam/i,   label: 'vergiler dahil toplam'   }, // 2
        { re: /genel toplam/i,            label: 'genel toplam'             }, // 3
        { re: /toplam tutar/i,            label: 'toplam tutar'             }, // 4
        { re: /ödenecek/i,                label: 'ödenecek'                 }, // 5
        { re: /kdv dahil/i,               label: 'kdv dahil'                }, // 6
        { re: /genel tutar/i,             label: 'genel tutar'              }, // 7
        { re: /toplam/i,                  label: 'toplam (generic)'         }, // 8 — lowest
    ];

    const amountCandidates = []; // debug only

    for (const { re, label } of PRIORITY_PATTERNS) {
        const hits = [];
        for (let i = 0; i < lineArr.length; i++) {
            if (!re.test(lineArr[i]))              continue;
            if (SUBTOTAL_LABELS.test(lineArr[i])) continue; // skip subtotal rows

            const afterKw = lineArr[i].replace(re, '').trim();
            const sameAmt = parseAmount(afterKw);
            if (sameAmt) hits.push({ amt: sameAmt, src: `${label} (same line)` });

            if (i + 1 < lineArr.length && !SUBTOTAL_LABELS.test(lineArr[i + 1])) {
                const nextAmt = parseAmount(lineArr[i + 1]);
                if (nextAmt) hits.push({ amt: nextAmt, src: `${label} (next line)` });
            }
        }

        if (hits.length) {
            const best = hits.sort((a, b) => b.amt - a.amt)[0];
            amountCandidates.push(...hits);
            console.log('[extractTotalFromLines] selected amount=%s source="%s" candidates=%j',
                best.amt, best.src, amountCandidates);
            return best.amt;
        }
    }

    console.log('[extractTotalFromLines] no amount found in lines');
    return null;
}

// Labels that indicate an intermediate subtotal — not the final payable amount.
const SUBTOTAL_TYPE_RE = /SUBTOTAL|TAX|DISCOUNT/i;
const SUBTOTAL_LABEL_RE = /(kdv matrah|vergi hariç|mal hizmet toplam|hizmet matrah|ara toplam|subtotal|indirim)/i;

function extractShoppingData(expenseDoc) {
    const summaryFields = expenseDoc.SummaryFields || [];

    const lineArr = (expenseDoc.Blocks || [])
        .filter(b => b.BlockType === 'LINE' && b.Text)
        .map(b => b.Text.trim());
    const rawText = lineArr.join('\n');

    // ── Step 1: structured SummaryFields ──────────────────────────────────────
    const candidates = [];
    for (const field of summaryFields) {
        const typeText  = field?.Type?.Text  || '';
        const labelText = field?.LabelDetection?.Text  || '';
        const valText   = field?.ValueDetection?.Text || '';

        // Skip known subtotal/tax field types
        if (SUBTOTAL_TYPE_RE.test(typeText))  continue;
        if (SUBTOTAL_LABEL_RE.test(labelText)) continue;

        let priority = null;
        if (/ödenecek tutar/i.test(labelText))      priority = 1; // highest
        else if (/vergiler dahil toplam/i.test(labelText)) priority = 2;
        else if (typeText === 'TOTAL')               priority = 3;
        else if (TR_TOTAL_RE.test(labelText))        priority = 4;
        else if (typeText === 'AMOUNT_PAID')         priority = 5;

        if (priority === null) continue;

        const amount   = parseAmount(valText);
        const currency = parseCurrency(valText) || parseCurrency(labelText);

        if (amount) {
            candidates.push({ priority, amount, currency, label: labelText || typeText });
        }
    }

    console.log('[extractShoppingData] amount candidates: %j', candidates);

    // Choose by priority first, then by largest amount within same priority level.
    candidates.sort((a, b) => a.priority - b.priority || b.amount - a.amount);
    const best = candidates[0] || null;

    // ── Step 2: raw-text fallback if structured extraction found nothing ──────
    const totalAmount = best?.amount || extractTotalFromLines(lineArr) || null;

    const currency = best?.currency
        || detectCurrencyFromAllFields(summaryFields)
        || parseCurrency(rawText)
        || 'TRY';

    const date = extractDate(summaryFields, rawText);

    console.log('[extractShoppingData] selected amount=%s currency=%s source="%s"',
        totalAmount, currency, best?.label || 'raw-text fallback');

    return { totalAmount, currency, date };
}

module.exports = { normalizeExpenseData, extractShoppingData, detectFuelInfo };
