import { getDb } from './server/db';

async function checkKnowledgeArea() {
  const db = await getDb();
  const result = await db.execute(`
    SELECT id, name, description, papersCount, status, createdAt
    FROM knowledge_areas
    WHERE id = 180011
  `);

  console.log(JSON.stringify(result[0], null, 2));
  process.exit(0);
}

checkKnowledgeArea().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
