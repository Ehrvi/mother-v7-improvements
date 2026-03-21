const mysql = require('mysql2/promise');
const url = process.env.DATABASE_URL || '';
const urlObj = new URL(url.replace('mysql://', 'http://'));
const user = urlObj.username;
const pass = urlObj.password;
const host = urlObj.hostname;
const port = parseInt(urlObj.port) || 3306;
const db = urlObj.pathname.slice(1).split('?')[0];

async function main() {
  const conn = await mysql.createConnection({
    host, port, user, password: pass, database: db,
    ssl: { rejectUnauthorized: false }
  });
  const [rows] = await conn.execute('SELECT COUNT(*) as cnt FROM knowledge');
  console.log('Knowledge count:', rows[0].cnt);
  const [latest] = await conn.execute('SELECT id, title, domain FROM knowledge ORDER BY id DESC LIMIT 5');
  console.log('Latest entries:');
  for (const r of latest) {
    console.log(`  ID ${r.id}: [${r.domain}] ${r.title}`);
  }
  await conn.end();
}
main().catch(e => { console.error('Error:', e.message); process.exit(1); });
