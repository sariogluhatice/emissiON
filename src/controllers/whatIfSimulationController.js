const whatIfSimulationService = require('../services/whatIfSimulationService');

const simulate = async (req, res) => {
    try {
        const data = await whatIfSimulationService.simulate(req.user.id, req.body);
        return res.status(200).json({ success: true, ...data });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        console.error('[whatIfSimulation]', err.message);
        return res.status(500).json({ success: false, message: 'Sunucu hatası.' });
    }
};

module.exports = { simulate };
