/**
 * MOTHER v27.0: H1 Validation Load Test
 * Query: "explainable ai in healthcare diagnostics"
 * Target: ≥95 papers in ≤720s
 */

const API_URL = "https://mother-interface-qtvghovzxa-ts.a.run.app";

async function triggerLoadTest() {
  const payload = {
    "0": {
      "json": {
        "name": "v27.0 H1 Validation Test",
        "query": "explainable ai in healthcare diagnostics",
        "description": "100-paper load test to validate H1: ≥95 papers in ≤720s with cpu=2, concurrency=10",
        "maxPapers": 100
      }
    }
  };

  try {
    console.log("🚀 Triggering v27.0 H1 validation load test...");
    console.log(`Query: "${payload["0"].json.query}"`);
    console.log(`Target: ≥95 papers in ≤720s\n`);

    const response = await fetch(`${API_URL}/api/trpc/omniscient.createStudyJob?batch=1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const result = data[0].result.data.json;

    console.log("✅ Load test initiated successfully!");
    console.log(`Knowledge Area ID: ${result.knowledgeAreaId}`);
    console.log(`Discovery Task: ${result.discoveryTaskName}`);
    console.log(`\nStart Time: ${new Date().toISOString()}`);
    console.log(`\nMonitor progress with:`);
    console.log(`pnpm exec tsx check-load-test-progress.ts ${result.knowledgeAreaId}`);
  } catch (error) {
    console.error("❌ Load test failed:", error);
    process.exit(1);
  }
}

triggerLoadTest();
