require('dotenv').config();
const aiService = require('./src/services/aiService');

(async () => {
    try {
        console.log('Testing getSmartInsights...');
        const history = [{ month: '2026-04', total_amount: 500 }];
        const categories = [{ category: 'electricity', total: 400 }, { category: 'flight', total: 100 }];
        const profile = { type: 'Ev Tipi' };
        
        const insights = await aiService.getSmartInsights(history, profile, categories);
        console.log('AI Parsed Output:', insights);
    } catch (err) {
        console.error('AI Error:', err);
    }
})();
