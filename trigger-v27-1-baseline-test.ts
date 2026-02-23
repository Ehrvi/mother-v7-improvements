// Node 22 has built-in fetch

const API_URL = 'https://mother-interface-qtvghovzxa-ts.a.run.app/api/trpc/omniscient.createStudyJob?batch=1';

async function triggerBaselineTest() {
  try {
    const payload = {
      "0": {
        name: "v27.1 Baseline Test (10 papers)",
        description: "Validation of v23.1 baseline + 1GB memory",
        query: "machine learning optimization algorithms", // Simple query for baseline
        maxPapers: 10 // Reduced to 10 for baseline validation
      }
    };

    console.log('🚀 Triggering v27.1 baseline test...');
    console.log('Query:', payload[0].query);
    console.log('Max Papers:', payload[0].maxPapers);

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
    console.log('\n✅ Baseline test initiated successfully!');
    console.log('Knowledge Area ID:', result[0].result.data.id);
    console.log('Discovery Task:', result[0].result.data.discoveryTaskName);
    console.log('\nTest started at:', new Date().toISOString());
    console.log('\nSuccess Criteria:');
    console.log('- Papers processed: ≥9 out of 10 (≥90%)');
    console.log('- OOM errors: 0');
    console.log('- Expected throughput: ~0.43 papers/min (baseline)');
  } catch (error) {
    console.error('❌ Failed to trigger baseline test:', error);
    process.exit(1);
  }
}

triggerBaselineTest();
