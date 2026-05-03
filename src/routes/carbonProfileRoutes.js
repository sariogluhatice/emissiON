const express          = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const {
    getCarbonProfile,
    updateCarbonProfile,
} = require('../controllers/carbonProfileController');

const router = express.Router();
router.use(authenticate);

router.get('/', getCarbonProfile);
router.put('/', updateCarbonProfile);

module.exports = router;
