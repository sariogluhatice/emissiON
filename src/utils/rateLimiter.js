// Shared in-memory rate limiter.
// Resets on server restart — lightweight guard, no Redis dependency.
const _store = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [k, e] of _store) if (now - e.firstAt > e.windowMs) _store.delete(k);
}, 5 * 60 * 1000);

/**
 * Throws a 429-shaped error if key has exceeded max attempts within windowMs.
 * @param {string} key        — e.g. "join:127.0.0.1"
 * @param {number} max        — maximum allowed attempts
 * @param {number} windowMs   — sliding window in milliseconds
 */
function checkRateLimit(key, max, windowMs) {
    const now = Date.now();
    const e   = _store.get(key);
    if (!e || now - e.firstAt > windowMs) {
        _store.set(key, { count: 1, firstAt: now, windowMs });
        return;
    }
    e.count++;
    if (e.count > max) {
        const secsLeft = Math.ceil((e.firstAt + windowMs - now) / 1000);
        const err = new Error(`Çok fazla deneme. ${secsLeft} saniye sonra tekrar deneyin.`);
        err.status = 429;
        throw err;
    }
}

module.exports = { checkRateLimit };
