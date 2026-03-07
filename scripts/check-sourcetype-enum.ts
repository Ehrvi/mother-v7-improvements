import mysql from 'mysql2/promise';

async function checkEnum() {
  const dbUrl = process.env.DATABASE_URL ?? '';
  const url = new URL(dbUrl.replace('mysql://', 'http://'));
  const conn = await mysql.createConnection({
    host: url.hostname,
    port: parseInt(url.port || '4000'),
    user: url.username,
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: false },
  });
  const [rows] = await conn.execute("SHOW COLUMNS FROM knowledge WHERE Field = 'sourceType'") as any[];
  console.log('sourceType column:', JSON.stringify(rows[0], null, 2));
  // Also check existing sourceType values
  const [existing] = await conn.execute("SELECT DISTINCT sourceType FROM knowledge LIMIT 20") as any[];
  console.log('Existing sourceType values:', JSON.stringify(existing, null, 2));
  await conn.end();
}

checkEnum().catch(console.error);
