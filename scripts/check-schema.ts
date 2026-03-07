import { createConnection } from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  const conn = await createConnection({
    host: url.hostname, port: parseInt(url.port || '4000'),
    user: url.username, password: url.password,
    database: url.pathname.slice(1), ssl: { rejectUnauthorized: false }
  });
  const [rows] = await conn.execute('DESCRIBE knowledge');
  console.log('knowledge columns:', JSON.stringify(rows, null, 2));
  await conn.end();
}
main().catch(console.error);
