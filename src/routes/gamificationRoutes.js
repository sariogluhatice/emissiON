const express                        = require('express');
const { authenticate }               = require('../middleware/authMiddleware');
const { getStats, processEntry }     = require('../controllers/gamificationController');

const router = express.Router();
router.use(authenticate);

// GET /api/gamification/stats
router.get('/stats', getStats);

// POST /api/gamification/process-entry  (backward-compat alias)
router.post('/process-entry', processEntry);

module.exports = router;
