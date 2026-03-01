const mysql = require('mysql2/promise');
const url = new URL(process.env.DATABASE_URL.replace('mysql://', 'http://'));
const sslParam = url.searchParams.get('ssl');
let ssl = { rejectUnauthorized: false };
if (sslParam) { try { ssl = JSON.parse(sslParam); } catch {} }

const pool = mysql.createPool({
  host: url.hostname,
  port: parseInt(url.port) || 4000,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  ssl,
  waitForConnections: true,
  connectionLimit: 10
});

console.log('Pool created');
pool.query('SELECT 1').then(() => {
  console.log('Query done - event loop should stay alive if pool keeps it...');
  // Don't end the pool - see if it keeps event loop alive
}).catch(err => {
  console.error('Query failed:', err.message);
});
