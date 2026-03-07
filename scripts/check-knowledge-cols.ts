import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { sql } from 'drizzle-orm';

async function main() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  const db = drizzle(connection);
  const cols = await db.execute(sql`DESCRIBE knowledge`);
  console.log('Columns:', JSON.stringify((cols as any)[0] ?? cols, null, 2));
  // Also check a sample row
  const sample = await db.execute(sql`SELECT * FROM knowledge LIMIT 1`);
  console.log('Sample row keys:', Object.keys(((sample as any)[0]?.[0]) ?? {}));
  await connection.end();
}
main().catch(console.error);
