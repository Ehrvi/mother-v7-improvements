import mysql from 'mysql2/promise';

async function checkSchema() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL ?? '');
  const [rows] = await conn.execute('DESCRIBE knowledge');
  console.log('knowledge table columns:');
  console.log(JSON.stringify(rows, null, 2));
  await conn.end();
}

checkSchema().catch(console.error);
