import { getDb } from './server/db.js';

(async () => {
  const db = await getDb();
  const result = await db.execute(`
    SELECT 
      COUNT(*) as total_papers,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
    FROM papers 
    WHERE knowledgeAreaId = 180014
  `);

  console.log(JSON.stringify(result[0], null, 2));
  process.exit(0);
})();
