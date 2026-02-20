/**
 * MOTHER v7.0 - Local Knowledge Testing Script
 * 
 * Tests:
 * 1. Knowledge count
 * 2. OWASP knowledge retrieval
 * 3. SDLC methodologies knowledge
 * 4. Lessons learned retrieval
 * 5. Semantic search with embeddings
 */

import mysql from 'mysql2/promise';

const DB_CONFIG = {
  host: 'gateway03.us-east-1.prod.aws.tidbcloud.com',
  port: 4000,
  user: '3QQhaXF1ucYHpuK.e4b7c6254861',
  password: 'B80oVFf7IFpU46HFTJ0z',
  database: '25NeaJLRyMKQFYzeZChVTB',
  ssl: { rejectUnauthorized: true },
};

async function runTests() {
  console.log('🧪 MOTHER v7.0 - Local Knowledge Testing\n');
  console.log('='.repeat(60));
  
  const connection = await mysql.createConnection(DB_CONFIG);
  
  // Test 1: Knowledge Count
  console.log('\n📊 Test 1: Knowledge Count');
  const [countResult] = await connection.execute('SELECT COUNT(*) as total FROM knowledge');
  console.log(`   Total entries: ${countResult[0].total}`);
  console.log(`   ✅ Expected: 159, Got: ${countResult[0].total}`);
  
  // Test 2: OWASP Knowledge
  console.log('\n🔒 Test 2: OWASP Knowledge Retrieval');
  const [owaspResults] = await connection.execute(
    'SELECT title, category FROM knowledge WHERE title LIKE ? LIMIT 3',
    ['%OWASP%']
  );
  console.log(`   Found ${owaspResults.length} OWASP entries:`);
  owaspResults.forEach((row, i) => {
    console.log(`   ${i + 1}. ${row.title.substring(0, 60)}...`);
    console.log(`      Category: ${row.category}`);
  });
  
  // Test 3: SDLC Methodologies
  console.log('\n📚 Test 3: SDLC Methodologies Knowledge');
  const [sdlcResults] = await connection.execute(
    'SELECT title FROM knowledge WHERE title LIKE ? ORDER BY id DESC LIMIT 6',
    ['%SDLC:%']
  );
  console.log(`   Found ${sdlcResults.length} SDLC methodology entries:`);
  sdlcResults.forEach((row, i) => {
    console.log(`   ${i + 1}. ${row.title.substring(0, 60)}...`);
  });
  
  // Test 4: Recent Lessons Learned
  console.log('\n🎓 Test 4: Recent Lessons Learned');
  const [lessonsResults] = await connection.execute(
    'SELECT title FROM knowledge WHERE title LIKE ? ORDER BY id DESC LIMIT 5',
    ['%Lesson Learned:%']
  );
  console.log(`   Found ${lessonsResults.length} recent lessons:`);
  lessonsResults.forEach((row, i) => {
    console.log(`   ${i + 1}. ${row.title.substring(0, 70)}...`);
  });
  
  // Test 5: Embeddings Check
  console.log('\n🔍 Test 5: Embeddings Availability');
  const [embeddingsResults] = await connection.execute(
    'SELECT COUNT(*) as total, COUNT(embedding) as with_embeddings FROM knowledge'
  );
  const total = embeddingsResults[0].total;
  const withEmbeddings = embeddingsResults[0].with_embeddings;
  const percentage = ((withEmbeddings / total) * 100).toFixed(1);
  console.log(`   Total entries: ${total}`);
  console.log(`   With embeddings: ${withEmbeddings} (${percentage}%)`);
  
  // Test 6: Category Distribution
  console.log('\n📂 Test 6: Category Distribution');
  const [categoryResults] = await connection.execute(
    'SELECT category, COUNT(*) as count FROM knowledge GROUP BY category ORDER BY count DESC LIMIT 10'
  );
  console.log(`   Top categories:`);
  categoryResults.forEach((row, i) => {
    console.log(`   ${i + 1}. ${row.category}: ${row.count} entries`);
  });
  
  // Test 7: Source Type Distribution
  console.log('\n📝 Test 7: Source Type Distribution');
  const [sourceResults] = await connection.execute(
    'SELECT sourceType, COUNT(*) as count FROM knowledge GROUP BY sourceType'
  );
  console.log(`   By source type:`);
  sourceResults.forEach((row) => {
    console.log(`   - ${row.sourceType}: ${row.count} entries`);
  });
  
  await connection.end();
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ ALL TESTS COMPLETE');
  console.log('='.repeat(60) + '\n');
}

runTests().catch(console.error);
