/**
 * MOTHER v27.0: Direct Database Query for H1 Validation
 * Bypasses API to get results directly from MySQL
 */

import { getDb } from './server/db';
import { knowledgeAreas, papers } from './drizzle/schema';
import { eq, and, sql } from 'drizzle-orm';

async function checkProgress(areaId: number) {
  const db = await getDb();
  
  if (!db) {
    console.error('❌ Database not available');
    process.exit(1);
  }

  try {
    console.log(`📊 Querying database for Knowledge Area ID: ${areaId}\n`);

    // Get knowledge area details
    const area = await db
      .select()
      .from(knowledgeAreas)
      .where(eq(knowledgeAreas.id, areaId))
      .limit(1);

    if (area.length === 0) {
      console.error(`❌ Knowledge Area ${areaId} not found`);
      process.exit(1);
    }

    const ka = area[0];

    // Get papers count by status
    const paperStats = await db
      .select({
        status: papers.status,
        count: sql<number>`count(*)`.as('count'),
      })
      .from(papers)
      .where(eq(papers.knowledgeAreaId, areaId))
      .groupBy(papers.status);

    // Calculate metrics
    const startTime = new Date(ka.createdAt);
    const now = new Date();
    const elapsedMs = now.getTime() - startTime.getTime();
    const elapsedMin = elapsedMs / 1000 / 60;
    const elapsedSec = elapsedMs / 1000;

    const completedCount = paperStats.find(s => s.status === 'completed')?.count || 0;
    const failedCount = paperStats.find(s => s.status === 'failed')?.count || 0;
    const inProgressCount = paperStats.find(s => s.status === 'in_progress')?.count || 0;
    const totalPapers = completedCount + failedCount + inProgressCount;

    const throughput = completedCount / elapsedMin;

    // Display results
    console.log(`📋 Knowledge Area Details:`);
    console.log(`  Name: ${ka.name}`);
    console.log(`  Status: ${ka.status}`);
    console.log(`  Created: ${ka.createdAt}`);
    console.log(`  Updated: ${ka.updatedAt}`);
    console.log(``);

    console.log(`📊 Paper Processing Status:`);
    console.log(`  Completed: ${completedCount}`);
    console.log(`  Failed: ${failedCount}`);
    console.log(`  In Progress: ${inProgressCount}`);
    console.log(`  Total: ${totalPapers}`);
    console.log(``);

    console.log(`⏱️  Performance Metrics:`);
    console.log(`  Elapsed Time: ${elapsedMin.toFixed(2)} min (${elapsedSec.toFixed(0)}s)`);
    console.log(`  Throughput: ${throughput.toFixed(2)} papers/min`);
    console.log(`  Success Rate: ${totalPapers > 0 ? ((completedCount / totalPapers) * 100).toFixed(1) : 0}%`);
    console.log(``);

    // H1 Validation
    console.log(`🎯 H1 Validation (≥95 papers in ≤720s):`);
    const h1Target = completedCount >= 95 && elapsedSec <= 720;
    const h1Status = h1Target ? '✅ PASS' : '❌ FAIL';
    console.log(`  Papers: ${completedCount}/95 ${completedCount >= 95 ? '✅' : '❌'}`);
    console.log(`  Time: ${elapsedSec.toFixed(0)}/720s ${elapsedSec <= 720 ? '✅' : '❌'}`);
    console.log(`  Result: ${h1Status}`);
    console.log(``);

    if (!h1Target) {
      console.log(`⚠️  H1 validation failed. Possible causes:`);
      if (completedCount < 95) {
        console.log(`  - Low throughput: ${throughput.toFixed(2)} papers/min (need ~7.9 papers/min)`);
        console.log(`  - Failed papers: ${failedCount} (investigate errors)`);
      }
      if (elapsedSec > 720) {
        console.log(`  - Exceeded time limit: ${(elapsedSec - 720).toFixed(0)}s over`);
      }
    }

    process.exit(h1Target ? 0 : 1);
  } catch (error) {
    console.error('❌ Database query failed:', error);
    process.exit(1);
  }
}

const areaId = parseInt(process.argv[2]);
if (isNaN(areaId)) {
  console.error('Usage: tsx check-db-direct.ts <knowledge_area_id>');
  process.exit(1);
}

checkProgress(areaId);
