/**
 * Manually trigger v25.1 H1 validation test
 * Creates knowledge area and enqueues discovery task
 */

import { getDb } from './server/db';
import { knowledgeAreas } from './drizzle/schema';
import { CloudTasksClient } from '@google-cloud/tasks';

const DISCOVERY_QUEUE = 'projects/mothers-library-mcp/locations/asia-southeast1/queues/discovery-queue';
const DISCOVERY_WORKER_URL = 'https://mother-interface-qtvghovzxa-ts.a.run.app/api/omniscient/discovery-worker';

async function main() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // 1. Create knowledge area
  const result = await db.insert(knowledgeAreas).values({
    name: 'v25.1 H1 Validation Test',
    description: '100-paper load test to validate chunking O(1) + database batch optimizations',
    status: 'in_progress',
    papersCount: 0,
    chunksCount: 0,
    cost: 0,
  });

  const knowledgeAreaId = Number(result[0].insertId);
  console.log(`✅ Knowledge area created: ID=${knowledgeAreaId}`);

  // 2. Enqueue discovery task
  const client = new CloudTasksClient();
  
  const task = {
    httpRequest: {
      url: DISCOVERY_WORKER_URL,
      httpMethod: 'POST' as const,
      headers: {
        'Content-Type': 'application/json',
      },
      body: Buffer.from(JSON.stringify({
        knowledgeAreaId,
        name: 'deep learning optimization techniques', // arXiv query
        maxPapers: 100,
      })).toString('base64'),
    },
  };

  const [response] = await client.createTask({
    parent: DISCOVERY_QUEUE,
    task,
  });

  console.log(`✅ Discovery task enqueued: ${response.name}`);
  console.log(`\n📊 Test started at: ${new Date().toISOString()}`);
  console.log(`\nMonitor progress with:`);
  console.log(`  cd /home/ubuntu/mother-interface && pnpm exec tsx check-v25-1-progress.ts`);
}

main().catch(console.error);
