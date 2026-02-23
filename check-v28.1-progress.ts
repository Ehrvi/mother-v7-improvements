/**
 * Check v28.1 H1 Validation Test Progress
 * 
 * Queries the database via tRPC API to check Knowledge Area status
 */

const PRODUCTION_URL = 'https://mother-interface-233196174701.australia-southeast1.run.app';
const KNOWLEDGE_AREA_ID = 180024;

async function checkProgress() {
  console.log('\n📊 Checking v28.1 H1 Validation Test Progress');
  console.log('=' .repeat(60));
  console.log(`Knowledge Area ID: ${KNOWLEDGE_AREA_ID}`);
  console.log('=' .repeat(60));

  try {
    // Get Knowledge Area details
    const areaResponse = await fetch(
      `${PRODUCTION_URL}/api/trpc/omniscient.getArea?batch=1&input=${encodeURIComponent(JSON.stringify({ '0': { json: { id: KNOWLEDGE_AREA_ID } } }))}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!areaResponse.ok) {
      throw new Error(`HTTP ${areaResponse.status}: ${areaResponse.statusText}`);
    }

    const areaData = await areaResponse.json();
    const area = areaData[0].result.data.json;

    console.log('\n📋 Knowledge Area Status:');
    console.log(`   Name: ${area.name}`);
    console.log(`   Status: ${area.status}`);
    console.log(`   Papers Count: ${area.papersCount}`);
    console.log(`   Chunks Count: ${area.chunksCount}`);
    console.log(`   Cost: $${area.cost}`);
    console.log(`   Created: ${area.createdAt}`);

    // Get Papers
    const papersResponse = await fetch(
      `${PRODUCTION_URL}/api/trpc/omniscient.getPapers?batch=1&input=${encodeURIComponent(JSON.stringify({ '0': { json: { knowledgeAreaId: KNOWLEDGE_AREA_ID } } }))}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (papersResponse.ok) {
      const papersData = await papersResponse.json();
      const papersList = papersData[0].result.data.json;

      console.log('\n📄 Papers:');
      papersList.forEach((paper: any, index: number) => {
        console.log(`   ${index + 1}. ${paper.title.substring(0, 60)}...`);
        console.log(`      arXiv ID: ${paper.arxivId}`);
        console.log(`      Status: ${paper.status || 'N/A'}`);
      });

      console.log(`\n✅ Total Papers: ${papersList.length}`);
    }

    // Validation result
    console.log('\n🧪 H1 Validation Result:');
    if (area.papersCount >= 9) {
      console.log(`   ✅ SUCCESS: ${area.papersCount}/10 papers processed (≥90%)`);
    } else if (area.papersCount > 0) {
      console.log(`   ⚠️  PARTIAL: ${area.papersCount}/10 papers processed (<90%)`);
    } else {
      console.log(`   ❌ FAILED: 0/10 papers processed`);
    }

  } catch (error) {
    console.error('\n❌ Failed to check progress:', error);
    process.exit(1);
  }
}

checkProgress();
