require('dotenv').config();
const aiService = require('./src/services/aiService');

(async () => {
    try {
        console.log('Testing generateImpactInsight...');
        const insight = await aiService.generateImpactInsight('Elektrik', 150, 'kg', 'energy');
        console.log('AI Response:', insight);
    } catch (err) {
        console.error('AI Error:', err);
    }
})();
