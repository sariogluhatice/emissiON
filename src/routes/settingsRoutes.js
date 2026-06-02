const express          = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { getSettings, updateSettings } = require('../controllers/settingsController');

const router = express.Router();
router.use(authenticate);

router.get('/', getSettings);
router.put('/', updateSettings);

module.exports = router;
