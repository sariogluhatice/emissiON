const SYMBOL_MAP = { '₺': 'TRY', '€': 'EUR', '$': 'USD', '£': 'GBP', '¥': 'JPY', '¢': 'USD' };

const CURRENCY_ALIAS_MAP = {
    TL: 'TRY',
    TRY: 'TRY',
    'TURKISHLIRA': 'TRY',
    'TURK LIRASI': 'TRY',
    'TURK LIRASI.': 'TRY',
    'TURKISHLIRASI': 'TRY',
    'TURKISHLIRASI.': 'TRY'
};

function normalizeCurrency(raw) {
    const s = String(raw || '').trim();
    if (!s) return 'USD';

    if (SYMBOL_MAP[s]) {
        return SYMBOL_MAP[s];
    }

    const upper = s.toUpperCase();
    if (CURRENCY_ALIAS_MAP[upper]) {
        return CURRENCY_ALIAS_MAP[upper];
    }

    // Handle values that include extra text or punctuation around the currency hint.
    if (upper.includes('TRY') || upper.includes(' TL') || upper.endsWith('TL') || upper.includes('TURK')) {
        return 'TRY';
    }

    return upper;
}

function normalizeDateForFX(rawDate) {
    const s = String(rawDate || '').trim();

    if (!s) {
        return new Date().toISOString().slice(0, 10);
    }

    if (/^\d{4}-\d{2}$/.test(s)) {
        return `${s}-01`;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return s;
    }

    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
    }

    return new Date().toISOString().slice(0, 10);
}

async function convertToUSD(amount, fromCurrency, date) {
    const currency = normalizeCurrency(fromCurrency);
    if (currency === 'USD') return { usdAmount: parseFloat(amount.toFixed(2)), exchangeRate: 1, currency };

    // frankfurter.app — free ECB historical rates, no API key needed
    const dateStr = normalizeDateForFX(date);

    const candidates = [0, 1, 2, 3, 4, 5, 6, 7].map((offset) => {
        const d = new Date(dateStr);
        d.setDate(d.getDate() - offset);
        return d.toISOString().slice(0, 10);
    });

    let lastStatus = null;
    for (const candidate of candidates) {
        const url = `https://api.frankfurter.app/${candidate}?from=${currency}&to=USD`;
        const res = await fetch(url);

        if (!res.ok) {
            lastStatus = res.status;
            if (res.status === 404) {
                continue;
            }
            throw new Error(`Exchange rate API error: ${res.status}`);
        }

        const data = await res.json();
        const rate = data.rates?.USD;
        if (!rate) {
            lastStatus = 404;
            continue;
        }

        return {
            usdAmount: parseFloat((amount * rate).toFixed(2)),
            exchangeRate: rate,
            currency
        };
    }

    // Historical lookup failed; fall back to latest available rate so shopping OCR still works
    const latestUrl = `https://api.frankfurter.app/latest?from=${currency}&to=USD`;
    const latestRes = await fetch(latestUrl);
    if (latestRes.ok) {
        const latestData = await latestRes.json();
        const latestRate = latestData.rates?.USD;
        if (latestRate) {
            return {
                usdAmount: parseFloat((amount * latestRate).toFixed(2)),
                exchangeRate: latestRate,
                currency
            };
        }
    }

    throw new Error(`Exchange rate API error: ${lastStatus || latestRes.status || 404}`);
}

module.exports = { convertToUSD, normalizeCurrency, normalizeDateForFX };
