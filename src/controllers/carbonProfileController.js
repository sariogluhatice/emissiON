const gamService          = require('../services/gamificationService');
const carbonProfileService = require('../services/carbonProfileService');

const getCarbonProfile = async (req, res) => {
    try {
        const data = await carbonProfileService.getCarbonProfile(req.user.id, req.user.role);
        return res.status(200).json(data);
    } catch (err) {
        console.error('[getCarbonProfile]', err.message);
        return res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

const updateCarbonProfile = async (req, res) => {
    const updates = req.body;

    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
        return res.status(400).json({ message: 'Geçersiz istek gövdesi.' });
    }

    try {
        await carbonProfileService.updateCarbonProfile(req.user.id, req.user.role, updates);
        gamService.awardXp(req.user.id, 'carbon_profile_updated').catch(() => {});
        return res.status(200).json({ message: 'Karbon profili başarıyla güncellendi.' });
    } catch (err) {
        console.error('[updateCarbonProfile]', err.message);
        return res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

module.exports = { getCarbonProfile, updateCarbonProfile };
