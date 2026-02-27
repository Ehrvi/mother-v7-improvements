import { getDb } from './server/db';
import { knowledge } from './drizzle/schema';

async function test() {
  const db = await getDb();
  if (!db) { console.log('no db'); process.exit(1); }
  try {
    await db.insert(knowledge).values({
      title: 'Test Entry Ciclo36',
      content: 'Test content for ciclo 36',
      domain: 'AI/ML',
      sourceType: 'learning',
    });
    console.log('SUCCESS');
  } catch(e: any) {
    console.log('FULL ERROR:', JSON.stringify(e, null, 2));
    console.log('CODE:', e.code);
    console.log('ERRNO:', e.errno);
    console.log('SQLSTATE:', e.sqlState);
  }
  process.exit(0);
}
test();
