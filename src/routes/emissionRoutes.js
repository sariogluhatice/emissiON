const express    = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { getAll, getById, create, update, remove, calculate, generateInsight, extractOcrBillData, extractOcrFromImage, getSmartInsights, parseOcrWithGroq, getSimulationRoadmap } = require('../controllers/emissionController');

const router = express.Router();

// Tüm emisyon rotaları geçerli bir JWT token gerektirir
router.use(authenticate);

router.get('/',     getAll);    // GET    /api/emissions
router.post('/',    create);    // POST   /api/emissions
router.post('/calculate', calculate); // POST /api/emissions/calculate
router.post('/generate-insight', generateInsight); // POST /api/emissions/generate-insight
router.post('/extract-ocr', extractOcrBillData); // POST /api/emissions/extract-ocr
router.post('/extract-ocr-image', extractOcrFromImage); // POST /api/emissions/extract-ocr-image
router.post('/parse-ocr-groq', parseOcrWithGroq);       // POST /api/emissions/parse-ocr-groq
router.get('/smart-insights', getSmartInsights); // GET /api/emissions/smart-insights
router.post('/simulation-roadmap', getSimulationRoadmap); // POST /api/emissions/simulation-roadmap
router.get('/:id',    getById);  // GET    /api/emissions/:id
router.put('/:id',  update);    // PUT    /api/emissions/:id
router.delete('/:id', remove);  // DELETE /api/emissions/:id

module.exports = router;
