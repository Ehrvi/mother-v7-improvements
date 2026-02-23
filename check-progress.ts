import { getDb } from './server/db';

async function checkProgress() {
  const db = await getDb();
  const result = await db.execute(`
    SELECT 
      COUNT(*) as total_papers,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      NULL as avg_latency_sec,
      NULL as max_latency_sec
    FROM papers 
    WHERE knowledgeAreaId = 180011
  `);

  console.log(JSON.stringify(result[0], null, 2));
  process.exit(0);
}

checkProgress().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
