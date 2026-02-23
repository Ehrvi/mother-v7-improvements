/**
 * MOTHER v26.0 - Load Test Trigger
 * 
 * Bypasses Cloud Tasks credentials by calling the public API endpoint directly.
 * This script triggers a 100-paper load test via the web interface.
 */

const API_URL = 'https://mother-interface-qtvghovzxa-ts.a.run.app/api/trpc/omniscient.createStudyJob?batch=1';

interface LoadTestConfig {
  name: string;
  query: string;
  description: string;
  maxPapers: number;
}

async function triggerLoadTest(config: LoadTestConfig): Promise<{ knowledgeAreaId: number; discoveryTaskName: string }> {
  // tRPC batch format: {"0":{"json":{...}}}
  const payload = {
    "0": {
      "json": config
    }
  };

  console.log(`🚀 Triggering load test: ${config.name}`);
  console.log(`   Query: "${config.query}"`);
  console.log(`   Max papers: ${config.maxPapers}`);
  console.log(`   API: ${API_URL}`);

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
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

  console.log(`✅ Load test started!`);
  console.log(`   Knowledge Area ID: ${data.knowledgeAreaId}`);
  console.log(`   Discovery Task: ${data.discoveryTaskName}`);
  console.log(`   Message: ${data.message}`);
  console.log(`\n📊 Test started at: ${new Date().toISOString()}`);
  console.log(`\nMonitor progress with:`);
  console.log(`  pnpm exec tsx check-load-test-progress.ts ${data.knowledgeAreaId}`);

  return {
    knowledgeAreaId: data.knowledgeAreaId,
    discoveryTaskName: data.discoveryTaskName,
  };
}

// Main execution
const config: LoadTestConfig = {
  name: 'v26.0 H1 Validation Test',
  query: 'machine learning neural networks optimization',
  description: '100-paper load test to validate batch embeddings + Cloud Run tuning (target: >8 papers/min)',
  maxPapers: 100,
};

triggerLoadTest(config)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Load test failed:', error);
    process.exit(1);
  });
