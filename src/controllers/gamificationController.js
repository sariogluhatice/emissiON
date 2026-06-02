const gamService = require('../services/gamificationService');

const ok     = (res, data) => res.json({ success: true, data });
const handle = (res, err)  => res.status(err.status || 500).json({ success: false, message: err.message });

const getStats = async (req, res) => {
    try { ok(res, await gamService.getStats(req.user.id)); }
    catch (err) { handle(res, err); }
};

const processEntry = async (req, res) => {
    try { ok(res, await gamService.processEntry(req.user.id)); }
    catch (err) { handle(res, err); }
};

module.exports = { getStats, processEntry };
