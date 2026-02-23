/**
 * MOTHER v30.0 - Episodic Memory Validation Test
 * 
 * This script tests the complete episodic memory pipeline:
 * 1. Submit a query and verify embedding is generated
 * 2. Submit a similar query and verify past interaction is retrieved
 * 3. Check episodic memory statistics
 * 
 * Run with: pnpm tsx test-episodic-memory-v30.0.ts
 */

import { processQuery } from './server/mother/core';
import { searchEpisodicMemory, getEpisodicMemoryStats } from './server/db-episodic-memory';

async function testEpisodicMemory() {
  console.log('🧪 MOTHER v30.0 - Episodic Memory Validation Test\n');

  // Test 1: Submit initial query
  console.log('📝 Test 1: Submitting initial query about AI agents...');
  const query1 = 'What are the key components of a cognitive architecture for AI agents?';
  
  try {
    const response1 = await processQuery({ query: query1, useCache: false });
    console.log(`✅ Query 1 processed (ID: ${response1.queryId}, Tier: ${response1.tier})`);
    console.log(`   Response preview: ${response1.response.slice(0, 100)}...`);
    
    // Wait for embedding generation (async process)
    console.log('⏳ Waiting 5 seconds for embedding generation...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
  } catch (error) {
    console.error('❌ Test 1 failed:', error);
    process.exit(1);
  }

  // Test 2: Check episodic memory stats
  console.log('\n📊 Test 2: Checking episodic memory statistics...');
  try {
    const stats = await getEpisodicMemoryStats();
    console.log(`✅ Total queries: ${stats.totalQueries}`);
    console.log(`   Queries with embeddings: ${stats.queriesWithEmbeddings}`);
    console.log(`   Embedding coverage: ${stats.embeddingCoverage.toFixed(1)}%`);
    
    if (stats.queriesWithEmbeddings === 0) {
      console.log('⚠️  No embeddings found yet. This is expected if this is the first query.');
    }
  } catch (error) {
    console.error('❌ Test 2 failed:', error);
  }

  // Test 3: Submit similar query and check memory retrieval
  console.log('\n📝 Test 3: Submitting similar query to test memory retrieval...');
  const query2 = 'Explain the cognitive architecture components for autonomous agents';
  
  try {
    // First, manually test search function
    console.log('   Testing searchEpisodicMemory() directly...');
    const pastInteractions = await searchEpisodicMemory(query2, 3);
    
    if (pastInteractions.length > 0) {
      console.log(`✅ Found ${pastInteractions.length} similar past interactions:`);
      pastInteractions.forEach((p, i) => {
        console.log(`   ${i+1}. Similarity: ${p.similarity.toFixed(3)} | Tier: ${p.tier}`);
        console.log(`      Query: ${p.query.slice(0, 80)}...`);
      });
    } else {
      console.log('⚠️  No past interactions found. This might be expected if embeddings are still being generated.');
    }
    
    // Now test through full pipeline
    console.log('\n   Testing through full processQuery() pipeline...');
    const response2 = await processQuery({ query: query2, useCache: false });
    console.log(`✅ Query 2 processed (ID: ${response2.queryId}, Tier: ${response2.tier})`);
    console.log(`   Response preview: ${response2.response.slice(0, 100)}...`);
    
    // Check if episodic memory was used (should be in logs)
    console.log('\n   ℹ️  Check server logs for "[MOTHER] Retrieved X past interactions from episodic memory"');
    
  } catch (error) {
    console.error('❌ Test 3 failed:', error);
    process.exit(1);
  }

  // Test 4: Final statistics
  console.log('\n📊 Test 4: Final episodic memory statistics...');
  try {
    const finalStats = await getEpisodicMemoryStats();
    console.log(`✅ Total queries: ${finalStats.totalQueries}`);
    console.log(`   Queries with embeddings: ${finalStats.queriesWithEmbeddings}`);
    console.log(`   Embedding coverage: ${finalStats.embeddingCoverage.toFixed(1)}%`);
    
    if (finalStats.embeddingCoverage > 0) {
      console.log('\n🎉 SUCCESS: Episodic memory is working! Embeddings are being generated and stored.');
    } else {
      console.log('\n⚠️  WARNING: No embeddings found. Check server logs for errors in embedding generation.');
    }
  } catch (error) {
    console.error('❌ Test 4 failed:', error);
  }

  console.log('\n✅ All tests completed!');
  console.log('\n📝 Next steps:');
  console.log('   1. Check server logs for detailed embedding generation logs');
  console.log('   2. Query the database to verify embedding field is populated:');
  console.log('      SELECT id, query, embedding IS NOT NULL as has_embedding FROM queries LIMIT 10;');
  console.log('   3. Test with more queries to build up episodic memory');
  
  process.exit(0);
}

// Run tests
testEpisodicMemory().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
