/**
 * Sync Knowledge to GCloud Database
 * 
 * This script parses cybersecurity knowledge and lessons learned,
 * then inserts them into the TiDB database used by GCloud deployment.
 * 
 * Usage: tsx scripts/sync-knowledge-to-gcloud.ts
 */

import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from '../drizzle/schema';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL || 'mysql://3QQhaXF1ucYHpuK.e4b7c6254861:B80oVFf7IFpU46HFTJ0z@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/25NeaJLRyMKQFYzeZChVTB?ssl={"rejectUnauthorized":true}';

interface KnowledgeEntry {
  title: string;
  content: string;
  category: string;
  tags: string[];
}

/**
 * Parse Cybersecurity Knowledge Document
 */
function parseCybersecurityKnowledge(): KnowledgeEntry[] {
  const content = readFileSync(join(__dirname, '../CYBERSECURITY-GOD-LEVEL-KNOWLEDGE.md'), 'utf-8');
  const entries: KnowledgeEntry[] = [];

  // OWASP Top 10 entries
  const owaspMatches = content.matchAll(/### (A\d+:2025 - [^\n]+)\n\*\*Risk Level:\*\* #(\d+)[^\n]*\n\n\*\*Description:\*\* ([^\n]+)\n\n\*\*Common Vulnerabilities:\*\*\n([\s\S]*?)\n\n\*\*Mitigation Strategies:\*\*([\s\S]*?)(?=\n---|\n### |\n## |$)/g);
  
  for (const match of owaspMatches) {
    const [, title, riskLevel, description, vulnerabilities, mitigations] = match;
    entries.push({
      title: title.trim(),
      content: `**Risk Level:** #${riskLevel}\n\n**Description:** ${description}\n\n**Common Vulnerabilities:**\n${vulnerabilities.trim()}\n\n**Mitigation Strategies:**${mitigations.trim()}`,
      category: 'cybersecurity',
      tags: ['OWASP', 'Top10', `Risk${riskLevel}`, 'WebSecurity'],
    });
  }

  // ISO 27001 entries
  const isoMatches = content.matchAll(/### (ISO \d+:\d+ - [^\n]+)\n\n\*\*Overview:\*\* ([^\n]+)\n\n([\s\S]*?)(?=\n---|\n### |\n## |$)/g);
  
  for (const match of isoMatches) {
    const [, title, overview, details] = match;
    entries.push({
      title: title.trim(),
      content: `**Overview:** ${overview}\n\n${details.trim()}`,
      category: 'cybersecurity',
      tags: ['ISO', 'Certification', 'Compliance', 'Standards'],
    });
  }

  // Penetration Testing Methodologies
  const ptestMatches = content.matchAll(/### (PTES|OSSTMM|MITRE ATT&CK Framework)\n\n\*\*Overview:\*\* ([^\n]+)\n\n([\s\S]*?)(?=\n---|\n### |\n## |$)/g);
  
  for (const match of ptestMatches) {
    const [, title, overview, details] = match;
    entries.push({
      title: title.trim(),
      content: `**Overview:** ${overview}\n\n${details.trim()}`,
      category: 'cybersecurity',
      tags: ['PenetrationTesting', 'Methodology', 'Security', 'Testing'],
    });
  }

  // Stress Testing
  entries.push({
    title: 'Load Testing Best Practices',
    content: content.match(/### Load Testing Best Practices\n\n([\s\S]*?)(?=\n---|\n### |\n## |$)/)?.[1]?.trim() || '',
    category: 'cybersecurity',
    tags: ['LoadTesting', 'Performance', 'StressTesting', 'k6'],
  });

  // CI/CD Security
  entries.push({
    title: 'CI/CD Pipeline Security',
    content: content.match(/### CI\/CD Pipeline Security\n\n([\s\S]*?)(?=\n---|\n### |\n## |$)/)?.[1]?.trim() || '',
    category: 'cybersecurity',
    tags: ['CICD', 'DevSecOps', 'Pipeline', 'Automation'],
  });

  // Incident Response
  entries.push({
    title: 'Incident Response - NIST Lifecycle',
    content: content.match(/### Incident Response\n\n([\s\S]*?)(?=\n---|\n### |\n## |$)/)?.[1]?.trim() || '',
    category: 'cybersecurity',
    tags: ['IncidentResponse', 'NIST', 'Security', 'Operations'],
  });

  // Monitoring & Observability
  entries.push({
    title: 'Monitoring & Observability - Three Pillars',
    content: content.match(/### Monitoring & Observability\n\n([\s\S]*?)(?=\n---|\n### |\n## |$)/)?.[1]?.trim() || '',
    category: 'cybersecurity',
    tags: ['Monitoring', 'Observability', 'Metrics', 'Logs', 'Traces'],
  });

  // Common Attack Vectors
  entries.push({
    title: 'Common Attack Vectors & Defense',
    content: content.match(/### Common Attack Vectors\n\n([\s\S]*?)(?=\n---|\n### |\n## |$)/)?.[1]?.trim() || '',
    category: 'cybersecurity',
    tags: ['Attacks', 'Defense', 'Hacking', 'Security'],
  });

  // Defense in Depth
  entries.push({
    title: 'Defense in Depth Strategy',
    content: content.match(/### Defense in Depth Strategy\n\n([\s\S]*?)(?=\n---|\n### |\n## |$)/)?.[1]?.trim() || '',
    category: 'cybersecurity',
    tags: ['DefenseInDepth', 'Security', 'Layers', 'Strategy'],
  });

  // Secure Development Lifecycle
  entries.push({
    title: 'Secure Development Lifecycle (SDLC)',
    content: content.match(/### Secure Development Lifecycle \(SDLC\)\n\n([\s\S]*?)(?=\n---|\n### |\n## |$)/)?.[1]?.trim() || '',
    category: 'cybersecurity',
    tags: ['SDLC', 'SecureCoding', 'Development', 'Microsoft'],
  });

  // Security Testing Tools
  entries.push({
    title: 'Security Testing Tools',
    content: content.match(/## 8\. Security Testing Tools\n\n([\s\S]*?)(?=\n---|\n## |$)/)?.[1]?.trim() || '',
    category: 'cybersecurity',
    tags: ['Tools', 'SAST', 'DAST', 'SCA', 'Testing'],
  });

  return entries.filter(e => e.content.length > 100);
}

/**
 * Parse Lessons Learned Document
 */
function parseLessonsLearned(): KnowledgeEntry[] {
  const content = readFileSync(join(__dirname, '../LESSONS-LEARNED-UPDATED.md'), 'utf-8');
  const entries: KnowledgeEntry[] = [];

  // Match all lessons (## 1. Title format)
  const lessonMatches = content.matchAll(/## (\d+)\. ([^\n]+)\n\n([\s\S]*?)(?=\n## \d+\.|\n## Summary:|$)/g);
  
  for (const match of lessonMatches) {
    const [, number, title, lessonContent] = match;
    
    // Extract key takeaway
    const keyTakeawayMatch = lessonContent.match(/\*\*Key Takeaway:\*\* ([^\n]+)/);
    const keyTakeaway = keyTakeawayMatch ? keyTakeawayMatch[1] : '';
    
    entries.push({
      title: title.trim(),
      content: lessonContent.trim(),
      category: 'learned',
      tags: ['LessonsLearned', 'Experience', 'BestPractices', keyTakeaway ? 'Critical' : 'Important'],
    });
  }

  return entries;
}

/**
 * Check if entry already exists (by title similarity)
 */
async function entryExists(db: any, title: string): Promise<boolean> {
  const existing = await db.select()
    .from(schema.knowledge)
    .where(eq(schema.knowledge.title, title))
    .limit(1);
  
  return existing.length > 0;
}

/**
 * Main sync function
 */
async function main() {
  console.log('🚀 Starting knowledge sync to GCloud database...\n');
  
  const connection = await mysql.createConnection(DATABASE_URL);
  const db = drizzle(connection, { schema, mode: 'default' });

  // Parse documents
  console.log('📖 Parsing cybersecurity knowledge...');
  const cybersecurityEntries = parseCybersecurityKnowledge();
  console.log(`   Found ${cybersecurityEntries.length} cybersecurity entries\n`);

  console.log('📖 Parsing lessons learned...');
  const lessonsEntries = parseLessonsLearned();
  console.log(`   Found ${lessonsEntries.length} lessons learned entries\n`);

  const allEntries = [...cybersecurityEntries, ...lessonsEntries];

  // Insert entries
  let inserted = 0;
  let skipped = 0;

  console.log('💾 Inserting entries into database...\n');

  for (const entry of allEntries) {
    const exists = await entryExists(db, entry.title);
    
    if (exists) {
      console.log(`   ⏭️  Skipped (exists): ${entry.title}`);
      skipped++;
      continue;
    }

    try {
      await db.insert(schema.knowledge).values({
        title: entry.title,
        content: entry.content,
        category: entry.category,
        tags: entry.tags.join(','),
        embedding: null, // Will be generated by MOTHER on first query
        embeddingModel: null,
      });

      console.log(`   ✅ Inserted: ${entry.title}`);
      inserted++;
    } catch (error) {
      console.error(`   ❌ Error inserting "${entry.title}":`, error);
    }
  }

  await connection.end();

  console.log('\n📊 Sync Summary:');
  console.log(`   Total entries: ${allEntries.length}`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Skipped (duplicates): ${skipped}`);
  console.log('\n✅ Knowledge sync complete!');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
