const multer           = require('multer');
const textractService  = require('../services/textractService');
const { normalizeExpenseData, extractShoppingData } = require('../utils/ocrNormalizer');
const { convertToUSD } = require('../utils/currencyConverter');
const climatiqService  = require('../services/climatiqService');

const ALLOWED_IMAGE = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_ALL   = [...ALLOWED_IMAGE, 'application/pdf'];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => cb(null, ALLOWED_ALL.includes(file.mimetype))
});

const uploadInvoice = async (req, res) => {
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
};

const uploadShoppingReceipt = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded. Use JPEG, PNG, WEBP, or PDF.' });
    }

    try {
        let expenseDoc;

        if (req.file.mimetype === 'application/pdf') {
            const { bucket, key } = await textractService.uploadImageToS3(
                req.file.buffer.toString('base64'),
                req.file.mimetype
            );
            expenseDoc = await textractService.analyzeExpenseFromS3(bucket, key);
        } else {
            expenseDoc = await textractService.analyzeExpenseFromBuffer(req.file.buffer, req.file.mimetype);
        }
        if (!expenseDoc) {
            return res.status(422).json({ message: 'Textract returned no expense document for this image.' });
        }

        console.log('[OCR Shopping] SummaryFields:',
            JSON.stringify((expenseDoc.SummaryFields || []).map(f => ({
                type:  f?.Type?.Text,
                label: f?.LabelDetection?.Text,
                value: f?.ValueDetection?.Text,
            })), null, 2)
        );
        console.log('[OCR Shopping] LINE blocks:',
            (expenseDoc.Blocks || [])
                .filter(b => b.BlockType === 'LINE')
                .map(b => b.Text)
                .join(' | ')
        );

        const { totalAmount, currency, date } = extractShoppingData(expenseDoc);
        if (!totalAmount || totalAmount <= 0) {
            return res.status(422).json({ message: 'Could not extract a valid total amount from this receipt.' });
        }

        const { usdAmount, exchangeRate } = await convertToUSD(totalAmount, currency, date);

        const calc = await climatiqService.calculateEmission(
            'general_retail-type_nonstore_retailers',
            usdAmount,
            'usd'
        );

        res.json({
            originalAmount: totalAmount,
            currency,
            usdAmount,
            exchangeRate,
            co2e: calc.co2e,
            date
        });
    } catch (err) {
        console.error('[OCR Shopping]', err);
        res.status(500).json({ message: err.message || 'Shopping receipt processing failed.' });
    }
};

module.exports = { upload, uploadInvoice, uploadShoppingReceipt };
