/**
 * MOTHER v26.0 - Load Test Progress Monitor
 * 
 * Monitors the progress of a load test by querying the public API endpoint.
 * Usage: pnpm exec tsx check-load-test-progress.ts <knowledgeAreaId>
 */

const API_URL = 'https://mother-interface-qtvghovzxa-ts.a.run.app/api/trpc/omniscient.getArea';

interface KnowledgeArea {
  id: number;
  name: string;
  description: string | null;
  status: 'in_progress' | 'completed' | 'failed';
  papersCount: number;
  chunksCount: number;
  cost: number;
  createdAt: string;
  updatedAt: string;
}

async function checkProgress(knowledgeAreaId: number): Promise<KnowledgeArea> {
  // tRPC batch format with input: {"0":{"json":{"id":123}}}
  const payload = {
    "0": {
      "json": {
        id: knowledgeAreaId
      }
    }
  };

  const response = await fetch(`${API_URL}?batch=1&input=${encodeURIComponent(JSON.stringify(payload))}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  const result = await response.json();
  
  // tRPC batch response format: [{"result":{"data":{"json":{...}}}}]
  const data = result[0]?.result?.data?.json;
  
  if (!data) {
    throw new Error(`Unexpected response format: ${JSON.stringify(result)}`);
  }

  return data as KnowledgeArea;
}

async function monitorProgress(knowledgeAreaId: number): Promise<void> {
  console.log(`📊 Monitoring Knowledge Area ID: ${knowledgeAreaId}\n`);

  const area = await checkProgress(knowledgeAreaId);
  
  const startTime = new Date(area.createdAt);
  const now = new Date();
  const elapsedMinutes = (now.getTime() - startTime.getTime()) / 1000 / 60;
  const throughput = area.papersCount / elapsedMinutes;

  console.log(`📋 Knowledge Area: ${area.name}`);
  console.log(`   Status: ${area.status}`);
  console.log(`   Papers: ${area.papersCount}`);
  console.log(`   Chunks: ${area.chunksCount}`);
  console.log(`   Cost: $${area.cost.toFixed(4)}`);
  console.log(`\n⏱️  Elapsed: ${elapsedMinutes.toFixed(1)} minutes`);
  console.log(`📊 Throughput: ${throughput.toFixed(2)} papers/min`);
  
  if (area.papersCount > 0) {
    const avgChunks = area.chunksCount / area.papersCount;
    console.log(`   Avg chunks/paper: ${avgChunks.toFixed(1)}`);
  }

  console.log(`\n🎯 H1 Target: >8 papers/min, 100 papers in <12 minutes`);
  
  if (area.status === 'completed') {
    const success = throughput >= 8 && elapsedMinutes <= 12;
    console.log(`\n${success ? '✅' : '❌'} H1 Status: ${success ? 'PASS' : 'FAIL'}`);
    if (!success) {
      if (throughput < 8) {
        console.log(`   Throughput: ${throughput.toFixed(2)} papers/min < 8 papers/min target`);
      }
      if (elapsedMinutes > 12) {
        console.log(`   Time: ${elapsedMinutes.toFixed(1)} min > 12 min target`);
      }
    }
  } else {
    console.log(`Status: ⏳ In progress... (${(area.papersCount / 100 * 100).toFixed(0)}% complete)`);
  }
}

// Main execution
const knowledgeAreaId = parseInt(process.argv[2]);

if (isNaN(knowledgeAreaId)) {
  console.error('Usage: pnpm exec tsx check-load-test-progress.ts <knowledgeAreaId>');
  process.exit(1);
}

monitorProgress(knowledgeAreaId)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Progress check failed:', error);
    process.exit(1);
  });
