const mysql = require('mysql2/promise');
const fs = require('fs');

async function runMigration() {
  const rawUrl = process.env.DATABASE_URL.replace('mysql://', 'http://');
  const url = new URL(rawUrl);
  const sslParam = url.searchParams.get('ssl');
  let ssl = { rejectUnauthorized: false };
  if (sslParam) {
    try { ssl = JSON.parse(sslParam); } catch (e) {}
  }
  
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
  
  // Check if paper_chunks exists
  const [rows] = await conn.execute("SHOW TABLES LIKE 'paper_chunks'");
  console.log('paper_chunks exists:', rows.length > 0);
  
  if (rows.length === 0) {
    const sqlContent = fs.readFileSync('/tmp/mother-repo/drizzle/migrations/0003_omniscient_tables.sql', 'utf-8');
    // Split by semicolons, filter empty and comment-only lines
    const rawStmts = sqlContent.split(';');
    const stmts = rawStmts.map(s => s.trim()).filter(s => {
      if (s.length === 0) return false;
      const lines = s.split('\n').filter(l => l.trim().length > 0 && !l.trim().startsWith('--'));
      return lines.length > 0;
    });
    
    for (const stmt of stmts) {
      const cleanStmt = stmt.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').trim();
      if (cleanStmt.length === 0) continue;
      try {
        await conn.execute(cleanStmt);
        console.log('OK:', cleanStmt.split('\n')[0].substring(0, 80));
      } catch (err) {
        console.error('ERR:', cleanStmt.split('\n')[0].substring(0, 80), '-', err.message);
      }
    }
  }
  
  const [rows2] = await conn.execute("SHOW TABLES LIKE 'paper_chunks'");
  console.log('paper_chunks after migration:', rows2.length > 0 ? 'EXISTS' : 'MISSING');
  
  const [rows3] = await conn.execute("SHOW TABLES LIKE 'papers'");
  console.log('papers table:', rows3.length > 0 ? 'EXISTS' : 'MISSING');
  
  // Also check all tables
  const [allTables] = await conn.execute("SHOW TABLES");
  console.log('All tables:', allTables.map(r => Object.values(r)[0]).join(', '));
  
  await conn.end();
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
