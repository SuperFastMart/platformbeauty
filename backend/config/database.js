const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 3000,
});

// Log connection status
pool.on('connect', () => {
  console.log('Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

// Query helpers
const query = (text, params) => pool.query(text, params);

const getOne = async (text, params) => {
  const result = await pool.query(text, params);
  return result.rows[0] || null;
};

const getAll = async (text, params) => {
  const result = await pool.query(text, params);
  return result.rows;
};

const run = async (text, params) => {
  const result = await pool.query(text, params);
  return result;
};

module.exports = { pool, query, getOne, getAll, run };
