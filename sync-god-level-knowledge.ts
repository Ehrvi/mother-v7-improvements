import { getDb } from './server/db';
import { knowledge } from './drizzle/schema';
import * as fs from 'fs';
import * as path from 'path';
import { eq, and } from 'drizzle-orm';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.substring(0, 8000),
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

async function parseProjectManagement(content: string) {
  const entries: any[] = [];
  
  // Split by ## headers (major sections)
  const sections = content.split(/\n## /);
  
  for (const section of sections) {
    if (!section.trim() || section.startsWith('#') || section.startsWith('EXECUTIVE SUMMARY')) continue;
    
    const lines = section.split('\n');
    const title = lines[0].replace(/^#+\s*/, '').trim();
    
    // Skip if too short
    if (section.length < 200) continue;
    
    // Extract content (skip title line)
    const contentText = lines.slice(1).join('\n').trim();
    
    // Determine category based on title
    let category = 'project_management';
    if (title.includes('PMBOK')) category = 'standards';
    else if (title.includes('PMO')) category = 'governance';
    else if (title.includes('Agile') || title.includes('Scrum') || title.includes('Kanban')) category = 'methodologies';
    else if (title.includes('Risk')) category = 'risk_management';
    else if (title.includes('Quality')) category = 'quality_management';
    else if (title.includes('Stakeholder')) category = 'stakeholder_management';
    else if (title.includes('Leadership')) category = 'leadership';
    
    entries.push({
      title: `Project Management: ${title}`,
      content: contentText.substring(0, 5000), // Limit content length
      category,
      source: 'learning',
      quality_score: 95,
      confidence_score: 95,
    });
  }
  
  return entries;
}

async function parseInformationManagement(content: string) {
  const entries: any[] = [];
  
  const sections = content.split(/\n## /);
  
  for (const section of sections) {
    if (!section.trim() || section.startsWith('#') || section.startsWith('EXECUTIVE SUMMARY')) continue;
    
    const lines = section.split('\n');
    const title = lines[0].replace(/^#+\s*/, '').trim();
    
    if (section.length < 200) continue;
    
    const contentText = lines.slice(1).join('\n').trim();
    
    let category = 'information_management';
    if (title.includes('DAMA') || title.includes('DMBOK')) category = 'standards';
    else if (title.includes('Governance')) category = 'governance';
    else if (title.includes('Records') || title.includes('ISO 15489')) category = 'records_management';
    else if (title.includes('Architecture') || title.includes('Taxonomy') || title.includes('Ontology')) category = 'information_architecture';
    else if (title.includes('Metadata')) category = 'metadata';
    else if (title.includes('CMS') || title.includes('DMS') || title.includes('KMS')) category = 'systems';
    else if (title.includes('Security') || title.includes('Compliance')) category = 'security';
    else if (title.includes('Quality')) category = 'quality_management';
    
    entries.push({
      title: `Information Management: ${title}`,
      content: contentText.substring(0, 5000),
      category,
      source: 'learning',
      quality_score: 95,
      confidence_score: 95,
    });
  }
  
  return entries;
}

async function parseFileManagement(content: string) {
  const entries: any[] = [];
  
  const sections = content.split(/\n## /);
  
  for (const section of sections) {
    if (!section.trim() || section.startsWith('#') || section.startsWith('EXECUTIVE SUMMARY')) continue;
    
    const lines = section.split('\n');
    const title = lines[0].replace(/^#+\s*/, '').trim();
    
    if (section.length < 200) continue;
    
    const contentText = lines.slice(1).join('\n').trim();
    
    let category = 'file_management';
    if (title.includes('Git') || title.includes('Version Control')) category = 'version_control';
    else if (title.includes('Workflow') || title.includes('Gitflow') || title.includes('GitHub Flow')) category = 'workflows';
    else if (title.includes('Branch') || title.includes('Merge')) category = 'branching';
    else if (title.includes('Commit')) category = 'best_practices';
    else if (title.includes('Semantic Versioning') || title.includes('SemVer')) category = 'versioning';
    else if (title.includes('Naming') || title.includes('Organization')) category = 'organization';
    else if (title.includes('Backup') || title.includes('Cloud Storage')) category = 'backup';
    
    entries.push({
      title: `File Management: ${title}`,
      content: contentText.substring(0, 5000),
      category,
      source: 'learning',
      quality_score: 95,
      confidence_score: 95,
    });
  }
  
  return entries;
}

async function main() {
  console.log('🚀 Starting GOD-LEVEL knowledge synchronization...\n');
  
  // Read files
  const pmContent = fs.readFileSync(
    path.join(__dirname, 'GOD-LEVEL-PROJECT-MANAGEMENT-KNOWLEDGE.md'),
    'utf-8'
  );
  const imContent = fs.readFileSync(
    path.join(__dirname, 'GOD-LEVEL-INFORMATION-MANAGEMENT-KNOWLEDGE.md'),
    'utf-8'
  );
  const fmContent = fs.readFileSync(
    path.join(__dirname, 'GOD-LEVEL-FILE-MANAGEMENT-VERSION-CONTROL-KNOWLEDGE.md'),
    'utf-8'
  );
  
  console.log('📖 Parsing GOD-LEVEL knowledge files...');
  const pmEntries = await parseProjectManagement(pmContent);
  const imEntries = await parseInformationManagement(imContent);
  const fmEntries = await parseFileManagement(fmContent);
  
  console.log(`  ✅ Project Management: ${pmEntries.length} entries`);
  console.log(`  ✅ Information Management: ${imEntries.length} entries`);
  console.log(`  ✅ File Management: ${fmEntries.length} entries`);
  
  const allEntries = [...pmEntries, ...imEntries, ...fmEntries];
  console.log(`\n📊 Total entries to process: ${allEntries.length}\n`);
  
  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  
  for (const entry of allEntries) {
    try {
      // Check if already exists (by title)
      const db = await getDb();
      const existing = await db
        .select()
        .from(knowledge)
        .where(eq(knowledge.title, entry.title))
        .limit(1);
      
      if (existing.length > 0) {
        console.log(`  ⏭️  Skipped (duplicate): ${entry.title.substring(0, 60)}...`);
        skipped++;
        continue;
      }
      
      // Generate embedding
      const embedding = await generateEmbedding(entry.content);
      
      // Insert into database
      await db.insert(knowledge).values({
        ...entry,
        embedding: JSON.stringify(embedding),
        created_at: new Date(),
        updated_at: new Date(),
      });
      
      console.log(`  ✅ Inserted: ${entry.title.substring(0, 60)}...`);
      inserted++;
      
      // Rate limiting (OpenAI: 3 RPM for free tier)
      await new Promise(resolve => setTimeout(resolve, 20000)); // 20 seconds between requests
      
    } catch (error: any) {
      console.error(`  ❌ Failed: ${entry.title} - ${error.message}`);
      failed++;
    }
  }
  
  console.log('\n============================================================');
  console.log('📊 SYNCHRONIZATION COMPLETE');
  console.log('============================================================');
  console.log(`✅ Inserted: ${inserted}`);
  console.log(`⏭️  Skipped (duplicates): ${skipped}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📦 Total processed: ${allEntries.length}`);
  console.log('============================================================\n');
}

main().catch(console.error);
