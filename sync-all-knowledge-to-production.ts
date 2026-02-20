/**
 * MOTHER v7.0 - Comprehensive Knowledge Synchronization Script
 * 
 * Purpose: Sync ALL local knowledge documentation to production database
 * Sources:
 * - CYBERSECURITY-GOD-LEVEL-KNOWLEDGE.md (985 lines)
 * - LESSONS-LEARNED-UPDATED.md (807 lines - 21 lessons)
 * - GOD-LEVEL-SOFTWARE-ENGINEERING-KNOWLEDGE.md (348 lines - SDLC)
 * 
 * Strategy:
 * 1. Parse each markdown file into structured knowledge entries
 * 2. Generate embeddings for semantic search
 * 3. Check for duplicates (avoid re-inserting existing knowledge)
 * 4. Insert new entries into production database
 */

import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { knowledge } from './drizzle/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// OpenAI API for embeddings
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

interface KnowledgeEntry {
  title: string;
  content: string;
  category: string;
  tags: string;
  source: string;
  sourceType: 'user' | 'external';
}

/**
 * Generate embeddings using OpenAI API
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text.substring(0, 8000), // Limit to 8000 chars
      }),
    });

    if (!response.ok) {
      console.error('Embedding API error:', await response.text());
      return [];
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    return [];
  }
}

/**
 * Parse CYBERSECURITY-GOD-LEVEL-KNOWLEDGE.md
 */
function parseCybersecurityKnowledge(): KnowledgeEntry[] {
  const filePath = path.join(__dirname, 'CYBERSECURITY-GOD-LEVEL-KNOWLEDGE.md');
  const content = fs.readFileSync(filePath, 'utf-8');
  
  const entries: KnowledgeEntry[] = [];
  
  // Split by ## headers (major sections)
  const sections = content.split(/^## /m).filter(s => s.trim());
  
  for (const section of sections) {
    const lines = section.split('\n');
    const title = lines[0].trim();
    
    if (!title || title.includes('GOD-LEVEL CYBERSECURITY KNOWLEDGE')) continue;
    
    const sectionContent = lines.slice(1).join('\n').trim();
    
    if (sectionContent.length < 100) continue; // Skip tiny sections
    
    // Determine category and tags
    let category = 'Cybersecurity';
    let tags = 'cybersecurity, security, OWASP';
    
    if (title.includes('OWASP')) {
      category = 'OWASP Top 10';
      tags = 'OWASP, web security, vulnerabilities';
    } else if (title.includes('ISO')) {
      category = 'ISO Standards';
      tags = 'ISO 27001, ISO 27002, ISO 9001, compliance';
    } else if (title.includes('PTES')) {
      category = 'Penetration Testing';
      tags = 'PTES, penetration testing, security assessment';
    } else if (title.includes('MITRE')) {
      category = 'Threat Intelligence';
      tags = 'MITRE ATT&CK, threat intelligence, tactics';
    } else if (title.includes('Stress Testing')) {
      category = 'Performance Testing';
      tags = 'stress testing, load testing, performance';
    } else if (title.includes('CI/CD')) {
      category = 'DevSecOps';
      tags = 'CI/CD, DevSecOps, security automation';
    }
    
    entries.push({
      title: title.substring(0, 500),
      content: sectionContent.substring(0, 10000),
      category,
      tags,
      source: 'CYBERSECURITY-GOD-LEVEL-KNOWLEDGE.md',
      sourceType: 'user',
    });
  }
  
  return entries;
}

/**
 * Parse LESSONS-LEARNED-UPDATED.md
 */
function parseLessonsLearned(): KnowledgeEntry[] {
  const filePath = path.join(__dirname, 'LESSONS-LEARNED-UPDATED.md');
  const content = fs.readFileSync(filePath, 'utf-8');
  
  const entries: KnowledgeEntry[] = [];
  
  // Split by ## headers (individual lessons)
  const sections = content.split(/^## /m).filter(s => s.trim());
  
  for (const section of sections) {
    const lines = section.split('\n');
    const title = lines[0].trim();
    
    if (!title || title.includes('LESSONS LEARNED')) continue;
    
    const sectionContent = lines.slice(1).join('\n').trim();
    
    if (sectionContent.length < 100) continue;
    
    entries.push({
      title: `Lesson Learned: ${title}`.substring(0, 500),
      content: sectionContent.substring(0, 10000),
      category: 'Lessons Learned',
      tags: 'lessons learned, best practices, experience',
      source: 'LESSONS-LEARNED-UPDATED.md',
      sourceType: 'user',
    });
  }
  
  return entries;
}

/**
 * Parse GOD-LEVEL-SOFTWARE-ENGINEERING-KNOWLEDGE.md
 */
function parseSoftwareEngineeringKnowledge(): KnowledgeEntry[] {
  const filePath = path.join(__dirname, 'GOD-LEVEL-SOFTWARE-ENGINEERING-KNOWLEDGE.md');
  const content = fs.readFileSync(filePath, 'utf-8');
  
  const entries: KnowledgeEntry[] = [];
  
  // Split by ### and #### headers (SDLC phases and sub-sections)
  const sections = content.split(/^####? /m).filter(s => s.trim());
  
  for (const section of sections) {
    const lines = section.split('\n');
    const title = lines[0].trim();
    
    if (!title || title.includes('GOD-LEVEL SOFTWARE')) continue;
    
    const sectionContent = lines.slice(1).join('\n').trim();
    
    if (sectionContent.length < 100) continue;
    
    let category = 'Software Engineering';
    let tags = 'software engineering, SDLC, development';
    
    if (title.includes('Phase')) {
      category = 'SDLC Phases';
      tags = 'SDLC, software development lifecycle, phases';
    } else if (title.includes('Testing')) {
      category = 'Software Testing';
      tags = 'testing, QA, quality assurance';
    } else if (title.includes('Design')) {
      category = 'Software Design';
      tags = 'design, architecture, patterns';
    }
    
    entries.push({
      title: `SDLC: ${title}`.substring(0, 500),
      content: sectionContent.substring(0, 10000),
      category,
      tags,
      source: 'GOD-LEVEL-SOFTWARE-ENGINEERING-KNOWLEDGE.md',
      sourceType: 'user',
    });
  }
  
  return entries;
}

/**
 * Check if knowledge entry already exists (by title similarity)
 */
async function isDuplicate(db: any, title: string): Promise<boolean> {
  try {
    const existing = await db.select()
      .from(knowledge)
      .where(eq(knowledge.title, title))
      .limit(1);
    
    return existing.length > 0;
  } catch (error) {
    console.error('Error checking duplicate:', error);
    return false;
  }
}

/**
 * Main sync function
 */
async function syncAllKnowledge() {
  console.log('🚀 Starting comprehensive knowledge synchronization...\n');
  
  // Connect to database
  const connection = await mysql.createConnection({
    host: 'gateway03.us-east-1.prod.aws.tidbcloud.com',
    port: 4000,
    user: '3QQhaXF1ucYHpuK.e4b7c6254861',
    password: 'B80oVFf7IFpU46HFTJ0z',
    database: '25NeaJLRyMKQFYzeZChVTB',
    ssl: { rejectUnauthorized: true },
  });
  
  const db = drizzle(connection);
  
  // Parse all knowledge files
  console.log('📖 Parsing knowledge files...');
  const cybersecurityEntries = parseCybersecurityKnowledge();
  console.log(`  ✅ Cybersecurity: ${cybersecurityEntries.length} entries`);
  
  const lessonsEntries = parseLessonsLearned();
  console.log(`  ✅ Lessons Learned: ${lessonsEntries.length} entries`);
  
  const softwareEntries = parseSoftwareEngineeringKnowledge();
  console.log(`  ✅ Software Engineering: ${softwareEntries.length} entries`);
  
  const allEntries = [
    ...cybersecurityEntries,
    ...lessonsEntries,
    ...softwareEntries,
  ];
  
  console.log(`\n📊 Total entries to process: ${allEntries.length}\n`);
  
  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  
  for (const entry of allEntries) {
    try {
      // Check for duplicates
      const exists = await isDuplicate(db, entry.title);
      
      if (exists) {
        console.log(`  ⏭️  Skipped (duplicate): ${entry.title.substring(0, 60)}...`);
        skipped++;
        continue;
      }
      
      // Generate embedding
      console.log(`  🔄 Processing: ${entry.title.substring(0, 60)}...`);
      const embedding = await generateEmbedding(entry.content);
      const embeddingJson = embedding.length > 0 ? JSON.stringify(embedding) : null;
      
      // Insert into database
      await db.insert(knowledge).values({
        title: entry.title,
        content: entry.content,
        category: entry.category,
        tags: entry.tags,
        source: entry.source,
        sourceType: entry.sourceType,
        embedding: embeddingJson,
        embeddingModel: embedding.length > 0 ? 'text-embedding-3-small' : null,
        accessCount: 0,
        lastAccessed: null,
      });
      
      console.log(`  ✅ Inserted: ${entry.title.substring(0, 60)}...`);
      inserted++;
      
      // Rate limiting (avoid overwhelming OpenAI API)
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.error(`  ❌ Failed: ${entry.title.substring(0, 60)}...`, error);
      failed++;
    }
  }
  
  await connection.end();
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 SYNCHRONIZATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`✅ Inserted: ${inserted}`);
  console.log(`⏭️  Skipped (duplicates): ${skipped}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📦 Total processed: ${allEntries.length}`);
  console.log('='.repeat(60) + '\n');
}

// Run sync
syncAllKnowledge().catch(console.error);
