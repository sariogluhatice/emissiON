const { Pool } = require('pg');

// Pool manages multiple DB connections efficiently.
// It reuses connections instead of opening a new one per query.
const pool = new Pool({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT,
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

module.exports = pool;
