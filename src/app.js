require('dotenv').config();

const path      = require('path');
const express   = require('express');
const authRoutes       = require('./routes/authRoutes');
const emissionRoutes   = require('./routes/emissionRoutes');
const ocrRoutes        = require('./routes/ocrRoutes');
const onboardingRoutes = require('./routes/onboardingRoutes');
const profileRoutes    = require('./routes/profileRoutes');
const settingsRoutes   = require('./routes/settingsRoutes');

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
app.use('/api/profile',   profileRoutes);
app.use('/api/settings',  settingsRoutes);

// Sağlık kontrolü (Health check) — sunucunun çalıştığını teyit etmek için yararlıdır
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor`);
});
