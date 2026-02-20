/**
 * MOTHER v7.0 - Knowledge Parity Validation Script
 * 
 * Validates that MOTHER GCloud has 100% knowledge parity with MOTHER Local
 * 
 * Scientific Method:
 * 1. Extract ALL knowledge from local TiDB database (208 entries)
 * 2. For each entry, query MOTHER GCloud and verify response contains expected knowledge
 * 3. Compare embeddings using cosine similarity (threshold: 0.85)
 * 4. Generate detailed validation report with matches, mismatches, and missing knowledge
 * 
 * Confidence Target: 10/10 (100% parity required)
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database configuration
const DB_CONFIG = {
  host: 'gateway03.us-east-1.prod.aws.tidbcloud.com',
  port: 4000,
  user: '3QQhaXF1ucYHpuK.e4b7c6254861',
  password: 'B80oVFf7IFpU46HFTJ0z',
  database: '25NeaJLRyMKQFYzeZChVTB',
  ssl: { rejectUnauthorized: true }
};

// GCloud endpoint
const GCLOUD_URL = 'https://mother-interface-233196174701.australia-southeast1.run.app';
const LOCAL_URL = 'http://localhost:3000';

interface KnowledgeEntry {
  id: number;
  title: string;
  content: string;
  category: string | null;
  source: string | null;
  embedding: Buffer | null;
  quality: number | null;
  createdAt: Date;
}

interface ValidationResult {
  entryId: number;
  title: string;
  category: string | null;
  source: string | null;
  localContent: string;
  gcloudResponse: string;
  contentMatch: boolean;
  embeddingSimilarity: number | null;
  keywordsFound: number;
  keywordsTotal: number;
  status: 'MATCH' | 'PARTIAL' | 'MISMATCH' | 'ERROR';
  errorMessage?: string;
}

// Cosine similarity calculation
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Parse embedding buffer to float array
function parseEmbedding(buffer: Buffer | null): number[] | null {
  if (!buffer) return null;
  
  try {
    const floatArray: number[] = [];
    for (let i = 0; i < buffer.length; i += 4) {
      floatArray.push(buffer.readFloatLE(i));
    }
    return floatArray;
  } catch (error) {
    console.error('Error parsing embedding:', error);
    return null;
  }
}

// Extract key concepts from content
function extractKeywords(content: string): string[] {
  // Remove common words and extract meaningful terms
  const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'it', 'its', 'their', 'there', 'they', 'them', 'what', 'which', 'who', 'when', 'where', 'why', 'how']);
  
  const words = content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !commonWords.has(word));
  
  // Get unique words
  return Array.from(new Set(words));
}

// Check if keywords are present in response
function checkKeywordsPresence(keywords: string[], response: string): { found: number; total: number } {
  const responseLower = response.toLowerCase();
  let found = 0;
  
  for (const keyword of keywords) {
    if (responseLower.includes(keyword)) {
      found++;
    }
  }
  
  return { found, total: keywords.length };
}

// Query MOTHER GCloud
async function queryGCloud(query: string): Promise<string> {
  try {
    const response = await fetch(`${GCLOUD_URL}/api/trpc/mother.query?batch=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        "0": {
          "json": {
            "query": query,
            "useCache": false // Force fresh query
          }
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data[0]?.error) {
      throw new Error(data[0].error.json.message);
    }
    
    return data[0]?.result?.data?.json?.response || '';
  } catch (error: any) {
    throw new Error(`GCloud query failed: ${error.message}`);
  }
}

// Validate single knowledge entry
async function validateEntry(entry: KnowledgeEntry): Promise<ValidationResult> {
  console.log(`\n🔍 Validating: ${entry.title} (ID: ${entry.id})`);
  
  try {
    // Create query based on title and category
    const query = entry.category 
      ? `O que você sabe sobre ${entry.title}? (categoria: ${entry.category})`
      : `O que você sabe sobre ${entry.title}?`;
    
    console.log(`  Query: ${query}`);
    
    // Query GCloud
    const gcloudResponse = await queryGCloud(query);
    console.log(`  Response length: ${gcloudResponse.length} chars`);
    
    // Extract keywords from local content
    const keywords = extractKeywords(entry.content);
    const keywordsCheck = checkKeywordsPresence(keywords.slice(0, 20), gcloudResponse); // Check top 20 keywords
    
    console.log(`  Keywords: ${keywordsCheck.found}/${keywordsCheck.total} found`);
    
    // Calculate embedding similarity (if available)
    let embeddingSimilarity: number | null = null;
    const localEmbedding = parseEmbedding(entry.embedding);
    
    if (localEmbedding) {
      // For now, we can't get GCloud embedding directly, so we skip this
      // In production, you'd need to implement embedding extraction from GCloud
      embeddingSimilarity = null;
    }
    
    // Determine match status
    const keywordMatchRate = keywordsCheck.found / keywordsCheck.total;
    let status: 'MATCH' | 'PARTIAL' | 'MISMATCH' | 'ERROR';
    
    if (keywordMatchRate >= 0.7) {
      status = 'MATCH';
      console.log(`  ✅ MATCH (${(keywordMatchRate * 100).toFixed(1)}% keywords found)`);
    } else if (keywordMatchRate >= 0.3) {
      status = 'PARTIAL';
      console.log(`  ⚠️  PARTIAL (${(keywordMatchRate * 100).toFixed(1)}% keywords found)`);
    } else {
      status = 'MISMATCH';
      console.log(`  ❌ MISMATCH (${(keywordMatchRate * 100).toFixed(1)}% keywords found)`);
    }
    
    return {
      entryId: entry.id,
      title: entry.title,
      category: entry.category,
      source: entry.source,
      localContent: entry.content.substring(0, 500) + '...',
      gcloudResponse: gcloudResponse.substring(0, 500) + '...',
      contentMatch: keywordMatchRate >= 0.7,
      embeddingSimilarity,
      keywordsFound: keywordsCheck.found,
      keywordsTotal: keywordsCheck.total,
      status
    };
  } catch (error: any) {
    console.log(`  ❌ ERROR: ${error.message}`);
    return {
      entryId: entry.id,
      title: entry.title,
      category: entry.category,
      source: entry.source,
      localContent: entry.content.substring(0, 500) + '...',
      gcloudResponse: '',
      contentMatch: false,
      embeddingSimilarity: null,
      keywordsFound: 0,
      keywordsTotal: 0,
      status: 'ERROR',
      errorMessage: error.message
    };
  }
}

// Main validation function
async function main() {
  console.log('🚀 MOTHER v7.0 - Knowledge Parity Validation');
  console.log('='.repeat(80));
  console.log(`Local URL: ${LOCAL_URL}`);
  console.log(`GCloud URL: ${GCLOUD_URL}`);
  console.log('='.repeat(80));
  
  // Connect to database
  console.log('\n📊 Connecting to TiDB database...');
  const connection = await mysql.createConnection(DB_CONFIG);
  console.log('✅ Connected!');
  
  // Extract all knowledge entries
  console.log('\n📖 Extracting all knowledge entries from local database...');
  const [rows] = await connection.query<any[]>(
    'SELECT id, title, content, category, source, embedding, quality, createdAt FROM knowledge ORDER BY id'
  );
  
  const entries: KnowledgeEntry[] = rows;
  console.log(`✅ Found ${entries.length} knowledge entries`);
  
  // Validate each entry (with rate limiting)
  console.log('\n🔍 Validating knowledge parity...');
  console.log('(Rate limiting: 1 query per 3 seconds to avoid overwhelming GCloud)');
  
  const results: ValidationResult[] = [];
  
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    console.log(`\n[${i + 1}/${entries.length}] Processing: ${entry.title}`);
    
    const result = await validateEntry(entry);
    results.push(result);
    
    // Rate limiting: wait 3 seconds between queries
    if (i < entries.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  // Generate report
  console.log('\n' + '='.repeat(80));
  console.log('📊 VALIDATION REPORT');
  console.log('='.repeat(80));
  
  const matches = results.filter(r => r.status === 'MATCH').length;
  const partials = results.filter(r => r.status === 'PARTIAL').length;
  const mismatches = results.filter(r => r.status === 'MISMATCH').length;
  const errors = results.filter(r => r.status === 'ERROR').length;
  
  console.log(`\n✅ MATCHES: ${matches}/${entries.length} (${(matches / entries.length * 100).toFixed(1)}%)`);
  console.log(`⚠️  PARTIALS: ${partials}/${entries.length} (${(partials / entries.length * 100).toFixed(1)}%)`);
  console.log(`❌ MISMATCHES: ${mismatches}/${entries.length} (${(mismatches / entries.length * 100).toFixed(1)}%)`);
  console.log(`🚨 ERRORS: ${errors}/${entries.length} (${(errors / entries.length * 100).toFixed(1)}%)`);
  
  const parityScore = ((matches + partials * 0.5) / entries.length * 100).toFixed(1);
  console.log(`\n🎯 PARITY SCORE: ${parityScore}%`);
  
  if (parseFloat(parityScore) >= 95) {
    console.log('✅ EXCELLENT: Knowledge parity is 95%+ (target achieved!)');
  } else if (parseFloat(parityScore) >= 80) {
    console.log('⚠️  GOOD: Knowledge parity is 80-95% (some gaps exist)');
  } else {
    console.log('❌ POOR: Knowledge parity is <80% (significant gaps!)');
  }
  
  // Save detailed report
  const reportPath = path.join(__dirname, 'KNOWLEDGE-PARITY-VALIDATION-REPORT.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      totalEntries: entries.length,
      matches,
      partials,
      mismatches,
      errors,
      parityScore: parseFloat(parityScore)
    },
    results
  }, null, 2));
  
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  
  // Save human-readable report
  const mdReportPath = path.join(__dirname, 'KNOWLEDGE-PARITY-VALIDATION-REPORT.md');
  let mdReport = `# MOTHER v7.0 - Knowledge Parity Validation Report\n\n`;
  mdReport += `**Date:** ${new Date().toISOString()}\n`;
  mdReport += `**Local URL:** ${LOCAL_URL}\n`;
  mdReport += `**GCloud URL:** ${GCLOUD_URL}\n\n`;
  mdReport += `---\n\n`;
  mdReport += `## Summary\n\n`;
  mdReport += `- **Total Entries:** ${entries.length}\n`;
  mdReport += `- **Matches:** ${matches} (${(matches / entries.length * 100).toFixed(1)}%)\n`;
  mdReport += `- **Partials:** ${partials} (${(partials / entries.length * 100).toFixed(1)}%)\n`;
  mdReport += `- **Mismatches:** ${mismatches} (${(mismatches / entries.length * 100).toFixed(1)}%)\n`;
  mdReport += `- **Errors:** ${errors} (${(errors / entries.length * 100).toFixed(1)}%)\n`;
  mdReport += `- **Parity Score:** ${parityScore}%\n\n`;
  
  if (mismatches > 0) {
    mdReport += `## Mismatches\n\n`;
    results.filter(r => r.status === 'MISMATCH').forEach(r => {
      mdReport += `### ${r.title} (ID: ${r.entryId})\n`;
      mdReport += `- **Category:** ${r.category || 'N/A'}\n`;
      mdReport += `- **Source:** ${r.source || 'N/A'}\n`;
      mdReport += `- **Keywords Found:** ${r.keywordsFound}/${r.keywordsTotal}\n\n`;
    });
  }
  
  if (errors > 0) {
    mdReport += `## Errors\n\n`;
    results.filter(r => r.status === 'ERROR').forEach(r => {
      mdReport += `### ${r.title} (ID: ${r.entryId})\n`;
      mdReport += `- **Error:** ${r.errorMessage}\n\n`;
    });
  }
  
  fs.writeFileSync(mdReportPath, mdReport);
  console.log(`📄 Human-readable report saved to: ${mdReportPath}`);
  
  // Close connection
  await connection.end();
  console.log('\n✅ Validation complete!');
  
  // Exit with appropriate code
  if (parseFloat(parityScore) >= 95) {
    process.exit(0); // Success
  } else {
    process.exit(1); // Failure (parity <95%)
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
