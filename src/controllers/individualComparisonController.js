const individualComparisonService = require('../services/individualComparisonService');

const getIndividualComparison = async (req, res) => {
    if (req.user.role !== 'individual') {
        return res.status(403).json({
            success: false,
            message: 'Bu özellik yalnızca bireysel kullanıcılar için kullanılabilir.',
        });
    }

    try {
        const data = await individualComparisonService.getIndividualComparison(req.user.id);
        return res.status(200).json({ success: true, ...data });
    } catch (err) {
        console.error('[getIndividualComparison]', err.message);
        return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
    }
};

module.exports = { getIndividualComparison };
