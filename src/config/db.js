const { Pool } = require('pg');

// Pool (Havuz), birden fazla veritabanı bağlantısını verimli bir şekilde yönetir.
// Her sorgu için yeni bir bağlantı açmak yerine mevcut bağlantıları tekrar kullanır.
const pool = new Pool({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT,
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

module.exports = pool;
