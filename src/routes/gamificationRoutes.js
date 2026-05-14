const express          = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const gamService       = require('../services/gamificationService');

const router = express.Router();
router.use(authenticate);

const ok     = (res, data) => res.json({ success: true, data });
const handle = (res, err)  => res.status(err.status || 500).json({ success: false, message: err.message });

// GET /api/gamification/stats
router.get('/stats', async (req, res) => {
    try { ok(res, await gamService.getStats(req.user.id)); }
    catch (err) { handle(res, err); }
});

// POST /api/gamification/process-entry
// Call after a successful emission entry save — awards XP, updates streak, unlocks badges.
router.post('/process-entry', async (req, res) => {
    try { ok(res, await gamService.processEntry(req.user.id)); }
    catch (err) { handle(res, err); }
});

module.exports = router;
