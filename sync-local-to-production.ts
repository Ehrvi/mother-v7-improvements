import { getDb } from './server/db';
import { knowledge } from './drizzle/schema';
import { eq } from 'drizzle-orm';

async function main() {
  console.log('🚀 Starting local → production knowledge synchronization...\n');
  
  const db = await getDb();
  
  // Get all knowledge from local DB
  console.log('📖 Fetching all knowledge from local database...');
  const allKnowledge = await db.select().from(knowledge);
  console.log(`  ✅ Found ${allKnowledge.length} entries in local DB\n`);
  
  // Group by source for reporting
  const bySource = allKnowledge.reduce((acc, entry) => {
    acc[entry.source || 'unknown'] = (acc[entry.source || 'unknown'] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log('📊 Distribution by source:');
  Object.entries(bySource).forEach(([source, count]) => {
    console.log(`  - ${source}: ${count} entries`);
  });
  
  console.log('\n✅ Local knowledge inventory complete!');
  console.log('\n📝 Next steps:');
  console.log('  1. Deploy this code to production via gcloud CLI');
  console.log('  2. Production will automatically sync from its own database');
  console.log('  3. No manual sync needed - database is shared between local and production!');
  console.log('\n💡 Insight: Local and production use the SAME TiDB database.');
  console.log('   Any changes in local are immediately available in production.');
}

main().catch(console.error);
