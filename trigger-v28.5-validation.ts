/**
 * MOTHER v28.5 Validation Test
 * 
 * Executes 10-paper validation test with enhanced observability
 * Query: "episodic memory neural networks 2025"
 */

const API_URL = 'https://mother-interface-233196174701.australia-southeast1.run.app/api/trpc';

async function triggerValidationTest() {
  const startTime = Date.now();
  
  console.log('🧪 MOTHER v28.5 Validation Test');
  console.log('================================\n');
  
  const payload = {
    name: 'v28.5 Validation Test - Episodic Memory Neural Networks 2025',
    query: 'episodic memory neural networks 2025',
    maxPapers: 10,
  };
  
  console.log('📋 Test Parameters:');
  console.log(`   Name: ${payload.name}`);
  console.log(`   Query: ${payload.query}`);
  console.log(`   Max Papers: ${payload.maxPapers}\n`);
  
  try {
    const response = await fetch(`${API_URL}/omniscient.createStudyJob`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        0: {
          json: payload,
        },
      }),
    });
    
    const duration = Date.now() - startTime;
    
    if (!response.ok) {
      console.error(`❌ HTTP ${response.status}: ${response.statusText}`);
      const text = await response.text();
      console.error(`Response: ${text}`);
      process.exit(1);
    }
    
    const data = await response.json();
    const result = data[0]?.result?.data;
    
    console.log('✅ Test Initiated Successfully!\n');
    console.log('📊 Results:');
    console.log(`   Knowledge Area ID: ${result?.knowledgeAreaId || 'N/A'}`);
    console.log(`   Discovery Task Name: ${result?.discoveryTaskName || 'N/A'}`);
    console.log(`   Message: ${result?.message || 'N/A'}`);
    console.log(`   Duration: ${duration}ms\n`);
    
    console.log('📝 Next Steps:');
    console.log('   1. Wait 5 minutes for processing');
    console.log('   2. Check Cloud Logging for structured logs:');
    console.log('      - "📥 Paper Worker invoked" (with traceId)');
    console.log('      - "Processing paper started"');
    console.log('      - "Paper processed successfully"');
    console.log('   3. Verify ≥8 papers with status=completed\n');
    
    console.log('🔍 Monitoring Command:');
    console.log(`   gcloud logging read "resource.type=cloud_run_revision AND jsonPayload.knowledgeAreaId=${result?.knowledgeAreaId}" --limit=50 --freshness=10m\n`);
    
  } catch (error) {
    console.error('❌ Test Failed:', error);
    process.exit(1);
  }
}

triggerValidationTest();
