const express          = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { simulate }     = require('../controllers/whatIfSimulationController');

const router = express.Router();
router.use(authenticate);

router.post('/', simulate);

module.exports = router;
