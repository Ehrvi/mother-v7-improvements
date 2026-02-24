/**
 * MOTHER Omniscient - Orchestrator Test
 * 
 * Test the full study pipeline with 10 papers
 */

import { studyKnowledgeArea } from './orchestrator';

async function main() {
  console.log('=== MOTHER Omniscient - Orchestrator Test ===\n');
  
  try {
    const result = await studyKnowledgeArea(
      'quantum computing',
      'Test study of quantum computing papers',
      { maxPapers: 10 }
    );
    
    console.log('\n=== Test Results ===');
    console.log(`Knowledge Area ID: ${result.knowledgeAreaId}`);
    console.log(`Papers Processed: ${result.papersProcessed}`);
    console.log(`Chunks Created: ${result.chunksCreated}`);
    console.log(`Total Cost: $${result.totalCost.toFixed(4)}`);
    console.log(`Job Status: ${result.job.status}`);
    console.log(`\n✅ Test PASSED`);
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test FAILED:', error);
    process.exit(1);
  }
}

main();
