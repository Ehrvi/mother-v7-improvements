/**
 * Check v25.1 H1 validation test progress
 */

import { getDb } from './server/db';
import { knowledgeAreas, papers } from './drizzle/schema';
import { desc, eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Get latest knowledge area (v25.1 test)
  const [area] = await db
    .select()
    .from(knowledgeAreas)
    .orderBy(desc(knowledgeAreas.id))
    .limit(1);

  if (!area) {
    console.log('❌ No knowledge area found');
    return;
  }

  console.log(`\n📊 Knowledge Area: ${area.name} (ID: ${area.id})`);
  console.log(`Status: ${area.status}`);
  console.log(`Papers: ${area.papersCount}`);
  console.log(`Chunks: ${area.chunksCount}`);
  console.log(`Cost: $${area.cost.toFixed(4)}`);

  // Get paper status breakdown
  const allPapers = await db
    .select()
    .from(papers)
    .where(eq(papers.knowledgeAreaId, area.id));

  const completed = allPapers.filter(p => p.status === 'completed').length;
  const failed = allPapers.filter(p => p.status === 'failed').length;

  console.log(`\n📈 Paper Status:`);
  console.log(`  Completed: ${completed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total: ${allPapers.length}`);

  if (completed > 0) {
    const avgChunks = allPapers
      .filter(p => p.status === 'completed')
      .reduce((sum, p) => sum + (p.chunksCount || 0), 0) / completed;
    console.log(`  Avg chunks/paper: ${avgChunks.toFixed(1)}`);
  }

  // Calculate throughput
  const startTime = new Date(area.createdAt);
  const now = new Date();
  const elapsedMinutes = (now.getTime() - startTime.getTime()) / 1000 / 60;
  const throughput = completed / elapsedMinutes;

  console.log(`\n⏱️  Elapsed: ${elapsedMinutes.toFixed(1)} minutes`);
  console.log(`📊 Throughput: ${throughput.toFixed(2)} papers/min`);
  console.log(`\n🎯 H1 Target: >5 papers/min, 0 OOM errors`);
  console.log(`Status: ${throughput >= 5 ? '✅ PASS' : '⏳ In progress...'}`);
}

main().catch(console.error);
