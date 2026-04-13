require('dotenv').config();

const path      = require('path');
const express   = require('express');
const authRoutes    = require('./routes/authRoutes');

const app  = express();
const PORT = process.env.PORT || 3000;

// Parse incoming JSON request bodies
app.use(express.json());

// Serve client files as static assets
app.use(express.static(path.join(__dirname, '..', 'client')));

// Mount auth routes under /api/auth
app.use('/api/auth',     authRoutes);

// Health check — useful to confirm the server is running
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
