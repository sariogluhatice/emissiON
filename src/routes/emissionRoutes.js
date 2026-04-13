const express    = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { getAll, create, update, remove } = require('../controllers/emissionController');

const router = express.Router();

// All emission routes require a valid JWT token
router.use(authenticate);

router.get('/',     getAll);   // GET    /api/emissions
router.post('/',    create);   // POST   /api/emissions
router.put('/:id',  update);   // PUT    /api/emissions/:id
router.delete('/:id', remove); // DELETE /api/emissions/:id

module.exports = router;
