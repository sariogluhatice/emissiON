const express          = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const {
    getProfile,
    updateProfile,
    requestEmailChange,
    verifyEmailChange,
    requestPasswordChange,
    verifyPasswordChange,
    deleteAccount,
} = require('../controllers/profileController');

const router = express.Router();
router.use(authenticate);

router.get('/',                          getProfile);
router.put('/',                          updateProfile);
router.delete('/',                       deleteAccount);
router.post('/email-change/request',     requestEmailChange);
router.post('/email-change/verify',      verifyEmailChange);
router.post('/password-change/request',  requestPasswordChange);
router.post('/password-change/verify',   verifyPasswordChange);

module.exports = router;
