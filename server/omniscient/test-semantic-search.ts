/**
 * MOTHER Omniscient - Semantic Search Test
 * 
 * Tests vector search on real stored chunks (250 quantum computing chunks)
 */

import { searchSimilarChunks } from './search';

async function testSemanticSearch() {
  console.log('=== MOTHER Omniscient - Semantic Search Test ===\n');
  
  const queries = [
    'quantum computing applications',
    'quantum error correction',
    'quantum algorithms',
    'quantum entanglement',
    'quantum superposition',
  ];
  
  for (const query of queries) {
    console.log(`\n📊 Query: "${query}"`);
    console.log('─'.repeat(60));
    
    try {
      const results = await searchSimilarChunks(query, 3, 0.0); // No threshold
      
      if (results.length === 0) {
        console.log('❌ No results found');
        continue;
      }
      
      console.log(`✅ Found ${results.length} results:\n`);
      
      results.forEach((result, index) => {
        console.log(`${index + 1}. Similarity: ${result.similarity.toFixed(3)}`);
        console.log(`   Paper ID: ${result.paperId}`);
        console.log(`   Chunk Index: ${result.chunkIndex}`);
        console.log(`   Content: ${result.content.substring(0, 150)}...`);
        console.log();
      });
    } catch (error) {
      console.error(`❌ Error: ${error}`);
    }
  }
  
  console.log('\n=== Test Complete ===');
}

testSemanticSearch();
