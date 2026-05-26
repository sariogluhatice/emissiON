require('dotenv').config();

if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is not set.');
    process.exit(1);
}

const path      = require('path');
const express   = require('express');
const pool      = require('./config/db');
const authRoutes       = require('./routes/authRoutes');
const emissionRoutes   = require('./routes/emissionRoutes');
const ocrRoutes        = require('./routes/ocrRoutes');
const onboardingRoutes = require('./routes/onboardingRoutes');
const profileRoutes        = require('./routes/profileRoutes');
const carbonProfileRoutes        = require('./routes/carbonProfileRoutes');
const individualComparisonRoutes = require('./routes/individualComparisonRoutes');
const whatIfSimulationRoutes     = require('./routes/whatIfSimulationRoutes');
const settingsRoutes             = require('./routes/settingsRoutes');
const householdRoutes            = require('./routes/householdRoutes');
const companyRoutes              = require('./routes/companyRoutes');
const gamificationRoutes         = require('./routes/gamificationRoutes');

const app  = express();
const PORT = process.env.PORT || 3000;

// Gelen JSON istek gövdelerini ayrıştır (parse et)
app.use(express.json({ limit: '10mb' }));

// İstemci (frontend) dosyalarını statik varlıklar olarak sun
app.use(express.static(path.join(__dirname, '..', 'client')));

// Kimlik doğrulama rotalarını /api/auth altına bağla
app.use('/api/auth',     authRoutes);

// Emisyon kaydı rotalarını /api/emissions altına bağla
app.use('/api/emissions',  emissionRoutes);
app.use('/api/ocr',        ocrRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/profile',         profileRoutes);
app.use('/api/carbon-profile',         carbonProfileRoutes);
app.use('/api/individual-comparison',  individualComparisonRoutes);
app.use('/api/what-if-simulation',    whatIfSimulationRoutes);
app.use('/api/settings',              settingsRoutes);
app.use('/api/households',            householdRoutes);
app.use('/api/company',               companyRoutes);
app.use('/api/gamification',          gamificationRoutes);

// Sağlık kontrolü (Health check) — sunucunun çalıştığını teyit etmek için yararlıdır
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor`);
    pool.query('SELECT 1').then(() => {
        console.log('[DB] Veritabanı bağlantısı başarılı.');
    }).catch(err => {
        console.error(`[DB] HATA — Veritabanına bağlanılamadı: ${err.message}`);
    });
});
