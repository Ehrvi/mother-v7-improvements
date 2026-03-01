const mysql = require('mysql2/promise');

async function fixSchema() {
  const url = new URL(process.env.DATABASE_URL.replace('mysql://', 'http://'));
  const sslParam = url.searchParams.get('ssl');
  let ssl = { rejectUnauthorized: false };
  if (sslParam) { try { ssl = JSON.parse(sslParam); } catch {} }
  
  const conn = await mysql.createConnection({
    host: url.hostname,
    port: parseInt(url.port) || 4000,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl,
    connectTimeout: 30000
  });
  
  console.log('Connected to production database');
  
  // Get current columns for papers
  const [paperCols] = await conn.execute('DESCRIBE papers');
  const paperColNames = paperCols.map(c => c.Field);
  console.log('Current papers columns:', paperColNames.join(', '));
  
  // Add missing columns to papers table
  const papersAlterations = [
    { col: 'pdf_url', sql: "ALTER TABLE papers ADD COLUMN `pdf_url` varchar(500) DEFAULT NULL" },
    { col: 'doi', sql: "ALTER TABLE papers ADD COLUMN `doi` varchar(100) DEFAULT NULL" },
    { col: 'citation_count', sql: "ALTER TABLE papers ADD COLUMN `citation_count` int DEFAULT 0" },
    { col: 'quality_score', sql: "ALTER TABLE papers ADD COLUMN `quality_score` varchar(20) DEFAULT NULL" },
    { col: 'chunks_count', sql: "ALTER TABLE papers ADD COLUMN `chunks_count` int DEFAULT 0" },
  ];
  
  for (const alt of papersAlterations) {
    if (!paperColNames.includes(alt.col)) {
      try {
        await conn.execute(alt.sql);
        console.log('Added column papers.' + alt.col);
      } catch (err) {
        console.error('Error adding papers.' + alt.col + ':', err.message);
      }
    } else {
      console.log('Column papers.' + alt.col + ' already exists');
    }
  }
  
  // Also check if published_date needs to be changed from DATE to TIMESTAMP
  const pubDateCol = paperCols.find(c => c.Field === 'published_date');
  if (pubDateCol && pubDateCol.Type === 'date') {
    try {
      await conn.execute("ALTER TABLE papers MODIFY COLUMN `published_date` timestamp DEFAULT NULL");
      console.log('Changed papers.published_date from DATE to TIMESTAMP');
    } catch (err) {
      console.error('Error changing published_date type:', err.message);
    }
  }
  
  // Also check if abstract and authors need to be nullable
  // The migration had them as NOT NULL but schema has them nullable
  
  // Check paper_chunks columns
  const [chunkCols] = await conn.execute('DESCRIBE paper_chunks');
  const chunkColNames = chunkCols.map(c => c.Field);
  console.log('Current paper_chunks columns:', chunkColNames.join(', '));
  
  // Verify final state
  const [finalPaperCols] = await conn.execute('DESCRIBE papers');
  console.log('Final papers columns:', finalPaperCols.map(c => c.Field).join(', '));
  
  await conn.end();
  console.log('Schema fix complete');
}

fixSchema().catch(err => {
  console.error('Schema fix failed:', err);
  process.exit(1);
});
