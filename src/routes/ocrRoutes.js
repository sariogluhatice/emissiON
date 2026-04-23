const express = require('express');
const multer = require('multer');
const { authenticate } = require('../middleware/authMiddleware');
const textractService = require('../services/textractService');
const { normalizeExpenseData } = require('../utils/ocrNormalizer');

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        cb(null, allowed.includes(file.mimetype));
    }
});

router.post('/upload', authenticate, upload.single('invoice'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded or unsupported format. Use JPEG, PNG, or WEBP.' });
    }

    try {
        const expenseDoc = await textractService.analyzeExpenseFromBuffer(req.file.buffer, req.file.mimetype);
        if (!expenseDoc) {
            return res.status(422).json({ message: 'Textract returned no expense document for this image.' });
        }

        const result = normalizeExpenseData(expenseDoc);
        res.json(result);
    } catch (err) {
        console.error('[OCR] AnalyzeExpense failed:', err);
        res.status(500).json({ message: err.message || 'OCR processing failed.' });
    }
});

module.exports = router;
