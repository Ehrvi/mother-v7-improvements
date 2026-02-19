import { processQuery } from './server/mother/core';
import { getAllKnowledge } from './server/db';

async function testContinuousLearning() {
  console.log('=== TESTING CONTINUOUS LEARNING (Iteration 18) ===\n');
  
  // Get initial knowledge count
  const initialKnowledge = await getAllKnowledge(1000);
  console.log(`📊 Initial knowledge entries: ${initialKnowledge.length}\n`);
  
  // Trigger 3 high-quality queries
  const queries = [
    'Explain the CAP theorem in distributed systems with practical examples',
    'What are the key differences between REST and GraphQL APIs, including performance implications?',
    'Describe the SOLID principles in software engineering with code examples'
  ];
  
  for (let i = 0; i < queries.length; i++) {
    console.log(`\n🧪 Query ${i+1}: "${queries[i].substring(0, 60)}..."`);
    
    const result = await processQuery({
      query: queries[i],
      userId: 1,
      useCache: false,
    });
    
    console.log(`   Quality: ${result.quality.qualityScore}/100`);
    console.log(`   Completeness: ${result.quality.completenessScore}/100`);
    console.log(`   Accuracy: ${result.quality.accuracyScore}/100`);
    console.log(`   Relevance: ${result.quality.relevanceScore}/100`);
    console.log(`   Tier: ${result.tier}`);
    console.log(`   Complexity: ${result.complexityScore}`);
    
    if (result.quality.qualityScore > 95) {
      console.log(`   ✅ Quality >95% → Learning should be triggered!`);
    } else {
      console.log(`   ⚠️  Quality ${result.quality.qualityScore}% (needs >95% for learning)`);
    }
    
    // Wait 2s for async learning to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Check for new learned entries
  console.log(`\n\n📊 Checking for learned entries...`);
  await new Promise(resolve => setTimeout(resolve, 3000)); // Extra wait
  
  const finalKnowledge = await getAllKnowledge(1000);
  const learnedEntries = finalKnowledge.filter(k => k.category === 'learned');
  
  console.log(`\n=== RESULTS ===`);
  console.log(`Initial entries: ${initialKnowledge.length}`);
  console.log(`Final entries: ${finalKnowledge.length}`);
  console.log(`Learned entries: ${learnedEntries.length}`);
  console.log(`New entries added: ${finalKnowledge.length - initialKnowledge.length}`);
  
  if (learnedEntries.length > 0) {
    console.log(`\n✅ CONTINUOUS LEARNING WORKING!`);
    console.log(`\nLearned entries:`);
    learnedEntries.slice(0, 5).forEach(e => {
      console.log(`  - ${e.title} (${e.category})`);
    });
  } else {
    console.log(`\n⚠️  No learned entries found (may need higher quality responses)`);
  }
}

testContinuousLearning().catch(console.error);
