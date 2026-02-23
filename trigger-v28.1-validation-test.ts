/**
 * MOTHER v28.1 H1 Validation Test
 * 
 * Tests Cloud Tasks infrastructure fixes with 10-paper load test.
 * 
 * SUCCESS CRITERIA:
 * - ≥9 papers processed successfully (90% success rate)
 * - 0 OOM errors in Cloud Run logs
 * - Discovery Worker invoked (logs show "Discovery task enqueued")
 * - Paper Workers invoked (logs show "Processing paper")
 * 
 * HYPOTHESIS (H1):
 * IAM fixes + code fixes will enable Cloud Tasks to invoke Discovery Worker,
 * which will enqueue Paper Workers, which will process papers successfully
 * using Python isolated process architecture (0 memory leaks by design).
 */

const PRODUCTION_URL = 'https://mother-interface-233196174701.australia-southeast1.run.app';

interface StudyResponse {
  result: {
    data: {
      json: {
        knowledgeAreaId: number;
        discoveryTaskName: string;
        message: string;
      };
    };
  };
}

async function triggerValidationTest() {
  console.log('\n🧪 MOTHER v28.1 H1 Validation Test');
  console.log('=' .repeat(60));
  console.log('Query: "machine learning reinforcement learning robotics"');
  console.log('Papers: 10');
  console.log('Expected: ≥9 papers processed, 0 OOM errors');
  console.log('=' .repeat(60));

  const payload = {
    '0': {
      json: {
        name: 'v28.1 H1 Validation Test',
        query: 'machine learning reinforcement learning robotics',
        description: 'Validation test for Cloud Tasks infrastructure fixes',
        maxPapers: 10,
      },
    },
  };

  try {
    console.log('\n📤 Sending request to production API...');
    const startTime = Date.now();

    const response = await fetch(
      `${PRODUCTION_URL}/api/trpc/omniscient.createStudyJob?batch=1`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as StudyResponse[];
    const result = data[0].result.data.json;

    console.log('\n✅ Request successful!');
    console.log(`   Response time: ${elapsed}ms`);
    console.log(`   Knowledge Area ID: ${result.knowledgeAreaId}`);
    console.log(`   Discovery Task: ${result.discoveryTaskName}`);
    console.log(`   Message: ${result.message}`);

    console.log('\n📊 Next Steps:');
    console.log('   1. Wait 2-3 minutes for processing');
    console.log('   2. Run: node check-load-test-progress.ts');
    console.log('   3. Check Cloud Run logs for Discovery Worker invocation');
    console.log('   4. Verify ≥9 papers processed with 0 OOM errors');

    console.log('\n🔍 Monitor Progress:');
    console.log(`   Knowledge Area ID: ${result.knowledgeAreaId}`);
    console.log(`   Database: SELECT * FROM knowledge_areas WHERE id = ${result.knowledgeAreaId};`);
    console.log(`   Logs: gcloud run services logs read mother-interface --region=australia-southeast1 --limit=100`);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

triggerValidationTest();
