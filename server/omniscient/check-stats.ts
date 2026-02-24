import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { knowledgeAreas, papers, paperChunks } from '../../drizzle/schema';

async function checkStats() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  const db = drizzle(connection);

  const areas = await db.select().from(knowledgeAreas);
  const allPapers = await db.select().from(papers);
  const chunks = await db.select().from(paperChunks);

  console.log('=== MOTHER Omniscient Database Statistics ===\n');
  console.log(`Knowledge Areas: ${areas.length}`);
  console.log(`Papers: ${allPapers.length}`);
  console.log(`Chunks: ${chunks.length}\n`);

  if (areas.length > 0) {
    console.log('Areas:');
    areas.forEach(area => {
      console.log(`  - ${area.name}: ${area.papersCount} papers, ${area.chunksCount} chunks (${area.status})`);
    });
  }

  await connection.end();
}

checkStats();
