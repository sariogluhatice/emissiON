const express          = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { saveOnboarding, getOnboarding } = require('../controllers/onboardingController');

const router = express.Router();

router.use(authenticate);

router.get('/',  getOnboarding);   // GET  /api/onboarding
router.post('/', saveOnboarding);  // POST /api/onboarding

module.exports = router;
