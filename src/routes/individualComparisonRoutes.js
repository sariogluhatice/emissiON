const express          = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const {
    getIndividualComparison,
} = require('../controllers/individualComparisonController');

const router = express.Router();
router.use(authenticate);

router.get('/', getIndividualComparison);

module.exports = router;
