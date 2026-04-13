require('dotenv').config();

const express        = require('express');
const authRoutes     = require('./routes/authRoutes');
const emissionRoutes = require('./routes/emissionRoutes');

const app  = express();
const PORT = process.env.PORT || 3000;

// Parse incoming JSON request bodies
app.use(express.json());

// Mount auth routes under /api/auth
app.use('/api/auth', authRoutes);

// Mount emission record routes under /api/emissions
app.use('/api/emissions', emissionRoutes);

// Health check — useful to confirm the server is running
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
