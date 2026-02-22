/**
 * MOTHER Omniscient - End-to-End Integration Test
 * 
 * Tests the complete workflow:
 * 1. Search arXiv for papers in a knowledge area
 * 2. Download PDFs
 * 3. Extract text and chunk
 * 4. Generate embeddings
 * 5. Store in database
 * 6. Perform vector search
 */

import { searchArxiv, downloadPdf } from './arxiv';
import { extractTextFromPdf, chunkText } from './pdf';
import { generateEmbedding, serializeEmbedding } from './embeddings';
import { searchSimilarChunks, getSearchStatistics } from './search';
import { drizzle } from 'drizzle-orm/mysql2';
import { eq } from 'drizzle-orm';
import mysql from 'mysql2/promise';
import { knowledgeAreas, papers, paperChunks } from '../../drizzle/schema';

/**
 * Study a knowledge area end-to-end
 * 
 * @param areaName - Name of the knowledge area (e.g., "quantum computing")
 * @param maxPapers - Maximum number of papers to process
 * @returns Study results
 */
export async function studyKnowledgeArea(
  areaName: string,
  maxPapers: number = 10
) {
  console.log(`\n=== MOTHER Omniscient: Studying "${areaName}" ===\n`);
  
  const startTime = Date.now();
  const results = {
    areaName,
    maxPapers,
    papersProcessed: 0,
    papersSkipped: 0,
    totalChunks: 0,
    totalTokens: 0,
    totalCost: 0,
    errors: [] as string[],
    duration: 0,
  };
  
  let connection: mysql.Connection | null = null;
  let areaId: number | null = null;
  
  try {
    // Connect to database
    connection = await mysql.createConnection(process.env.DATABASE_URL!);
    const db = drizzle(connection);
    
    // 1. Create knowledge area
    console.log(`[1/6] Creating knowledge area: "${areaName}"...`);
    const [area] = await db.insert(knowledgeAreas).values({
      name: areaName,
      description: `Study of ${areaName} from arXiv papers`,
      status: 'in_progress',
      papersCount: 0,
      chunksCount: 0,
    });
    areaId = Number(area.insertId);
    console.log(`✅ Knowledge area created (ID: ${areaId})\n`);
    
    // 2. Search arXiv for papers
    console.log(`[2/6] Searching arXiv for "${areaName}" papers...`);
    const searchResults = await searchArxiv({ query: areaName, maxResults: maxPapers });
    console.log(`✅ Found ${searchResults.length} papers\n`);
    
    if (searchResults.length === 0) {
      throw new Error(`No papers found for "${areaName}"`);
    }
    
    // 3. Process each paper
    console.log(`[3/6] Processing ${Math.min(maxPapers, searchResults.length)} papers...\n`);
    
    for (let i = 0; i < Math.min(maxPapers, searchResults.length); i++) {
      const paper = searchResults[i];
      console.log(`\n--- Paper ${i + 1}/${maxPapers} ---`);
      console.log(`Title: ${paper.title.substring(0, 80)}...`);
      console.log(`arXiv ID: ${paper.id}`);
      console.log(`Authors: ${paper.authors.slice(0, 3).join(', ')}...`);
      
      try {
        // 3a. Download PDF
        console.log(`Downloading PDF...`);
        const pdfBuffer = await downloadPdf(paper.pdfUrl);
        console.log(`✅ Downloaded ${(pdfBuffer.length / 1024).toFixed(1)} KB`);
        
        // 3b. Extract text
        console.log(`Extracting text...`);
        const text = await extractTextFromPdf(pdfBuffer);
        console.log(`✅ Extracted ${text.length} characters`);
        
        if (text.length < 100) {
          console.warn(`⚠️ Text too short, skipping paper`);
          results.papersSkipped++;
          continue;
        }
        
        // 3c. Chunk text
        console.log(`Chunking text...`);
        const chunks = chunkText(text, { chunkSize: 1000, overlap: 200 });
        console.log(`✅ Created ${chunks.length} chunks`);
        
        // 3d. Insert paper into database
        const [paperRecord] = await db.insert(papers).values({
          knowledgeAreaId: areaId,
          arxivId: paper.id,
          title: paper.title,
          authors: paper.authors.join(', '), // Join array to string
          abstract: paper.abstract,
          publishedDate: paper.publishedDate,
          pdfUrl: paper.pdfUrl,
          chunksCount: chunks.length,
        });
        const paperId = Number(paperRecord.insertId);
        
        // 3e. Generate embeddings and store chunks
        console.log(`Generating embeddings for ${chunks.length} chunks...`);
        for (const chunk of chunks) {
          try {
            const embedding = await generateEmbedding(chunk.text);
            const embeddingJson = serializeEmbedding(embedding);
            
            await db.insert(paperChunks).values({
              paperId,
              chunkIndex: chunk.index,
              text: chunk.text,
              embedding: embeddingJson,
              tokenCount: chunk.tokenCount,
            });
            
            results.totalChunks++;
            results.totalTokens += chunk.tokenCount;
          } catch (error) {
            console.error(`❌ Error processing chunk ${chunk.index}:`, error);
            results.errors.push(`Paper ${paper.id}, chunk ${chunk.index}: ${error}`);
          }
        }
        
        console.log(`✅ Paper processed successfully (${chunks.length} chunks stored)`);
        results.papersProcessed++;
        
      } catch (error) {
        console.error(`❌ Error processing paper ${paper.id}:`, error);
        results.errors.push(`Paper ${paper.id}: ${error}`);
        results.papersSkipped++;
      }
    }
    
    // 4. Update knowledge area status
    console.log(`\n[4/6] Updating knowledge area status...`);
    await db.update(knowledgeAreas)
      .set({
        status: 'completed',
        papersCount: results.papersProcessed,
      })
      .where(eq(knowledgeAreas.id, areaId));
    console.log(`✅ Knowledge area updated\n`);
    
    // 5. Calculate cost
    console.log(`[5/6] Calculating cost...`);
    // OpenAI text-embedding-3-small: $0.00002 per 1K tokens
    results.totalCost = (results.totalTokens / 1000) * 0.00002;
    console.log(`✅ Total cost: $${results.totalCost.toFixed(4)}\n`);
    
    // 6. Get statistics
    console.log(`[6/6] Getting statistics...`);
    const stats = await getSearchStatistics();
    console.log(`✅ Database statistics:`);
    console.log(`   - Total papers: ${stats.totalPapers}`);
    console.log(`   - Total chunks: ${stats.totalChunks}`);
    console.log(`   - Avg chunks/paper: ${stats.avgChunksPerPaper.toFixed(1)}\n`);
    
  } catch (error) {
    console.error(`\n❌ Fatal error:`, error);
    results.errors.push(`Fatal: ${error}`);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
  
  results.duration = Date.now() - startTime;
  
  // Print summary
  console.log(`\n=== Study Complete ===`);
  console.log(`Area: ${results.areaName}`);
  console.log(`Papers processed: ${results.papersProcessed}/${results.maxPapers}`);
  console.log(`Papers skipped: ${results.papersSkipped}`);
  console.log(`Total chunks: ${results.totalChunks}`);
  console.log(`Total tokens: ${results.totalTokens.toLocaleString()}`);
  console.log(`Total cost: $${results.totalCost.toFixed(4)}`);
  console.log(`Duration: ${(results.duration / 1000).toFixed(1)}s`);
  console.log(`Errors: ${results.errors.length}`);
  
  if (results.errors.length > 0) {
    console.log(`\nErrors:`);
    results.errors.forEach((error, i) => {
      console.log(`  ${i + 1}. ${error}`);
    });
  }
  
  return results;
}

/**
 * Test vector search with real queries
 * 
 * @param queries - Array of search queries
 * @param topK - Number of results per query
 */
export async function testVectorSearch(
  queries: string[],
  topK: number = 5
) {
  console.log(`\n=== Testing Vector Search ===\n`);
  
  for (const query of queries) {
    console.log(`\nQuery: "${query}"`);
    console.log(`---`);
    
    try {
      const results = await searchSimilarChunks(query, topK, 0.5);
      
      if (results.length === 0) {
        console.log(`No results found (similarity < 0.5)`);
        continue;
      }
      
      results.forEach((result, i) => {
        console.log(`\n${i + 1}. Similarity: ${result.similarity.toFixed(3)}`);
        console.log(`   Paper ID: ${result.paperId}`);
        console.log(`   Chunk: ${result.content.substring(0, 150)}...`);
      });
      
    } catch (error) {
      console.error(`❌ Error searching for "${query}":`, error);
    }
  }
  
  console.log(`\n=== Search Test Complete ===\n`);
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`Usage: tsx study-area-e2e.ts <area_name> [max_papers]`);
    console.log(`Example: tsx study-area-e2e.ts "quantum computing" 10`);
    process.exit(1);
  }
  
  const areaName = args[0];
  const maxPapers = args[1] ? parseInt(args[1]) : 10;
  
  studyKnowledgeArea(areaName, maxPapers)
    .then(async (results) => {
      // Test vector search
      if (results.totalChunks > 0) {
        await testVectorSearch([
          `What is ${areaName}?`,
          `Applications of ${areaName}`,
          `Future of ${areaName}`,
        ]);
      }
      
      process.exit(results.errors.length > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error(`Fatal error:`, error);
      process.exit(1);
    });
}
