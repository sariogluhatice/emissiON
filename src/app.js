require('dotenv').config();

const path      = require('path');
const express   = require('express');
const authRoutes    = require('./routes/authRoutes');
const emissionRoutes = require('./routes/emissionRoutes');

const app  = express();
const PORT = process.env.PORT || 3000;

// Gelen JSON istek gövdelerini ayrıştır (parse et)
app.use(express.json());

// İstemci (frontend) dosyalarını statik varlıklar olarak sun
app.use(express.static(path.join(__dirname, '..', 'client')));

// Kimlik doğrulama rotalarını /api/auth altına bağla
app.use('/api/auth',     authRoutes);

// Emisyon kaydı rotalarını /api/emissions altına bağla
app.use('/api/emissions', emissionRoutes);

// Sağlık kontrolü (Health check) — sunucunun çalıştığını teyit etmek için yararlıdır
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor`);
});
