// Quick sample validation (first 5 entries only)
import mysql from 'mysql2/promise';

const DB_CONFIG = {
  host: 'gateway03.us-east-1.prod.aws.tidbcloud.com',
  port: 4000,
  user: '3QQhaXF1ucYHpuK.e4b7c6254861',
  password: 'B80oVFf7IFpU46HFTJ0z',
  database: '25NeaJLRyMKQFYzeZChVTB',
  ssl: { rejectUnauthorized: true }
};

const GCLOUD_URL = 'https://mother-interface-233196174701.australia-southeast1.run.app';

async function queryGCloud(query: string): Promise<string> {
  const response = await fetch(`${GCLOUD_URL}/api/trpc/mother.query?batch=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ "0": { "json": { "query": query, "useCache": false } } })
  });
  const data = await response.json();
  return data[0]?.result?.data?.json?.response || '';
}

async function main() {
  console.log('🚀 MOTHER Knowledge Parity - Quick Sample (5 entries)');
  const conn = await mysql.createConnection(DB_CONFIG);
  const [rows] = await conn.query<any[]>('SELECT id, title, content, category FROM knowledge ORDER BY id LIMIT 5');
  
  let matches = 0;
  for (const row of rows) {
    const query = `O que você sabe sobre ${row.title}?`;
    console.log(`\n[${row.id}] ${row.title}`);
    try {
      const response = await queryGCloud(query);
      const keywords = row.content.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4).slice(0, 10);
      const found = keywords.filter((k: string) => response.toLowerCase().includes(k)).length;
      const rate = found / keywords.length;
      console.log(`  Keywords: ${found}/${keywords.length} (${(rate * 100).toFixed(0)}%)`);
      if (rate >= 0.5) { matches++; console.log('  ✅ MATCH'); } else { console.log('  ❌ MISMATCH'); }
    } catch (e: any) {
      console.log(`  ❌ ERROR: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  
  console.log(`\n📊 Result: ${matches}/5 matches (${(matches/5*100).toFixed(0)}%)`);
  await conn.end();
}

main();
