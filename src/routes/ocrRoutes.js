const express                                          = require('express');
const { authenticate }                                 = require('../middleware/authMiddleware');
const { upload, uploadInvoice, uploadShoppingReceipt } = require('../controllers/ocrController');

const router = express.Router();

router.post('/upload',   authenticate, upload.single('invoice'), uploadInvoice);
router.post('/shopping', authenticate, upload.single('receipt'), uploadShoppingReceipt);

module.exports = router;
