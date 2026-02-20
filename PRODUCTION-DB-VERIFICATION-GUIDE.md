# MOTHER v7.0 - Production Database Verification Guide

**Purpose:** Teach how to verify database content in production environment  
**Audience:** Everton Luís Garcia (Project Owner)  
**Date:** 2026-02-20

---

## OVERVIEW

This guide provides step-by-step instructions for verifying that the knowledge base in production database is accurate and complete. Use this to confirm that AI agents (like Manus) are not "hallucinating" about database content.

---

## CONNECTION DETAILS

### Database Information
- **Type:** TiDB (MySQL-compatible)
- **Host:** gateway03.us-east-1.prod.aws.tidbcloud.com
- **Port:** 4000
- **Database:** 25NeaJLRyMKQFYzeZChVTB
- **User:** 3QQhaXF1ucYHpuK.e4b7c6254861
- **Password:** B80oVFf7IFpU46HFTJ0z
- **SSL:** Required (rejectUnauthorized: true)

### Security Note
⚠️ **NEVER share these credentials publicly.** They provide full access to production database.

---

## METHOD 1: MySQL Command Line (Recommended)

### Prerequisites
- MySQL client installed (`mysql` command)
- Terminal/command prompt access

### Step 1: Connect to Database

```bash
mysql -h gateway03.us-east-1.prod.aws.tidbcloud.com \
  -P 4000 \
  -u 3QQhaXF1ucYHpuK.e4b7c6254861 \
  -p \
  --ssl-mode=REQUIRED \
  25NeaJLRyMKQFYzeZChVTB
```

When prompted, enter password: `B80oVFf7IFpU46HFTJ0z`

### Step 2: Verify Connection

```sql
SELECT DATABASE();
```

Expected output:
```
+---------------------------+
| DATABASE()                |
+---------------------------+
| 25NeaJLRyMKQFYzeZChVTB    |
+---------------------------+
```

### Step 3: Check Knowledge Count

```sql
SELECT COUNT(*) as total_entries FROM knowledge;
```

Expected output (as of 2026-02-20):
```
+---------------+
| total_entries |
+---------------+
|           159 |
+---------------+
```

### Step 4: Verify Recent Entries

```sql
SELECT id, title, category, sourceType, createdAt 
FROM knowledge 
ORDER BY id DESC 
LIMIT 10;
```

Expected: Recent entries include SDLC methodologies, Lessons #22-24

### Step 5: Check Embeddings Coverage

```sql
SELECT 
  COUNT(*) as total,
  COUNT(embedding) as with_embeddings,
  ROUND(COUNT(embedding) / COUNT(*) * 100, 1) as coverage_percentage
FROM knowledge;
```

Expected output:
```
+-------+-----------------+---------------------+
| total | with_embeddings | coverage_percentage |
+-------+-----------------+---------------------+
|   159 |             159 |               100.0 |
+-------+-----------------+---------------------+
```

### Step 6: Verify Categories

```sql
SELECT category, COUNT(*) as count 
FROM knowledge 
GROUP BY category 
ORDER BY count DESC 
LIMIT 10;
```

Expected: Top categories include "learned", "Cybersecurity", "Lessons Learned", "Software Engineering"

### Step 7: Search for Specific Knowledge

```sql
-- Search for OWASP knowledge
SELECT id, title, category 
FROM knowledge 
WHERE title LIKE '%OWASP%' 
LIMIT 5;

-- Search for SDLC methodologies
SELECT id, title 
FROM knowledge 
WHERE title LIKE '%SDLC:%' 
LIMIT 10;

-- Search for recent lessons
SELECT id, title 
FROM knowledge 
WHERE title LIKE '%Lesson Learned: 2%' 
ORDER BY id DESC 
LIMIT 5;
```

### Step 8: Verify Data Integrity

```sql
-- Check for NULL critical fields
SELECT COUNT(*) as entries_with_null_title 
FROM knowledge 
WHERE title IS NULL OR title = '';

SELECT COUNT(*) as entries_with_null_content 
FROM knowledge 
WHERE content IS NULL OR content = '';
```

Expected: Both should return 0 (no NULL or empty critical fields)

### Step 9: Exit

```sql
EXIT;
```

---

## METHOD 2: One-Line Commands (Quick Checks)

### Quick Count

```bash
echo "SELECT COUNT(*) as total FROM knowledge;" | \
  mysql -h gateway03.us-east-1.prod.aws.tidbcloud.com \
  -P 4000 \
  -u 3QQhaXF1ucYHpuK.e4b7c6254861 \
  -pB80oVFf7IFpU46HFTJ0z \
  --ssl-mode=REQUIRED \
  25NeaJLRyMKQFYzeZChVTB \
  2>&1 | grep -v "Warning"
```

### Quick Category Check

```bash
echo "SELECT category, COUNT(*) as count FROM knowledge GROUP BY category ORDER BY count DESC LIMIT 5;" | \
  mysql -h gateway03.us-east-1.prod.aws.tidbcloud.com \
  -P 4000 \
  -u 3QQhaXF1ucYHpuK.e4b7c6254861 \
  -pB80oVFf7IFpU46HFTJ0z \
  --ssl-mode=REQUIRED \
  25NeaJLRyMKQFYzeZChVTB \
  2>&1 | grep -v "Warning"
```

### Quick Search

```bash
echo "SELECT title FROM knowledge WHERE title LIKE '%OWASP%' LIMIT 3;" | \
  mysql -h gateway03.us-east-1.prod.aws.tidbcloud.com \
  -P 4000 \
  -u 3QQhaXF1ucYHpuK.e4b7c6254861 \
  -pB80oVFf7IFpU46HFTJ0z \
  --ssl-mode=REQUIRED \
  25NeaJLRyMKQFYzeZChVTB \
  2>&1 | grep -v "Warning"
```

---

## METHOD 3: Using Node.js Script

### Create Verification Script

```javascript
// verify-production-db.mjs
import mysql from 'mysql2/promise';

const DB_CONFIG = {
  host: 'gateway03.us-east-1.prod.aws.tidbcloud.com',
  port: 4000,
  user: '3QQhaXF1ucYHpuK.e4b7c6254861',
  password: 'B80oVFf7IFpU46HFTJ0z',
  database: '25NeaJLRyMKQFYzeZChVTB',
  ssl: { rejectUnauthorized: true },
};

async function verify() {
  const connection = await mysql.createConnection(DB_CONFIG);
  
  // Count
  const [countResult] = await connection.execute('SELECT COUNT(*) as total FROM knowledge');
  console.log(`Total entries: ${countResult[0].total}`);
  
  // Categories
  const [categoryResult] = await connection.execute(
    'SELECT category, COUNT(*) as count FROM knowledge GROUP BY category ORDER BY count DESC LIMIT 5'
  );
  console.log('\nTop categories:');
  categoryResult.forEach(row => console.log(`  - ${row.category}: ${row.count}`));
  
  // Embeddings
  const [embeddingResult] = await connection.execute(
    'SELECT COUNT(*) as total, COUNT(embedding) as with_embeddings FROM knowledge'
  );
  const coverage = (embeddingResult[0].with_embeddings / embeddingResult[0].total * 100).toFixed(1);
  console.log(`\nEmbeddings coverage: ${coverage}%`);
  
  await connection.end();
}

verify().catch(console.error);
```

### Run Script

```bash
node verify-production-db.mjs
```

---

## METHOD 4: Using Database Management UI

### TiDB Cloud Console

1. Go to https://tidbcloud.com/
2. Login with your account
3. Select cluster: `25NeaJLRyMKQFYzeZChVTB`
4. Click "SQL Editor"
5. Run queries from Method 1

### Advantages
- Visual interface
- Query history
- Export results to CSV/JSON
- No command line required

---

## VERIFICATION CHECKLIST

Use this checklist to ensure database is healthy:

- [ ] **Connection Test:** Can connect to database without errors
- [ ] **Entry Count:** Total entries matches expected (159 as of 2026-02-20)
- [ ] **Embeddings:** 100% of entries have embeddings
- [ ] **Categories:** Multiple categories present (learned, Cybersecurity, Lessons Learned, etc.)
- [ ] **Source Types:** user, learning, external all present
- [ ] **Recent Entries:** Latest entries include SDLC methodologies and Lessons #22-24
- [ ] **No NULL Fields:** No entries with NULL title or content
- [ ] **Search Works:** Can find specific knowledge (OWASP, SDLC, Lessons)

---

## COMMON ISSUES AND SOLUTIONS

### Issue 1: Connection Timeout

**Symptom:** `ERROR 2003 (HY000): Can't connect to MySQL server`

**Solutions:**
- Check internet connection
- Verify firewall allows port 4000
- Confirm SSL mode is set to REQUIRED
- Try from different network (VPN may block)

### Issue 2: Authentication Failed

**Symptom:** `ERROR 1045 (28000): Access denied`

**Solutions:**
- Double-check username (copy-paste to avoid typos)
- Double-check password (copy-paste to avoid typos)
- Ensure no extra spaces in credentials
- Verify credentials haven't been rotated

### Issue 3: Wrong Entry Count

**Symptom:** Count doesn't match expected (159)

**Solutions:**
- Check if sync script ran successfully
- Verify no entries were deleted
- Check for duplicate entries
- Review sync logs for errors

### Issue 4: Missing Embeddings

**Symptom:** Coverage < 100%

**Solutions:**
- Check if OpenAI API key is valid
- Review sync script logs for embedding errors
- Re-run sync script for entries without embeddings
- Verify OpenAI API quota not exceeded

---

## EXPECTED STATE (2026-02-20)

### Knowledge Base Statistics
- **Total Entries:** 159
- **User Entries:** 108
- **Learning Entries:** 44
- **External Entries:** 7
- **Embeddings Coverage:** 100%

### Top Categories
1. learned: 28 entries
2. Cybersecurity: 28 entries
3. Lessons Learned: 26 entries
4. Software Engineering: 16 entries
5. Architecture: 10 entries

### Recent Additions
- Lição #22: Knowledge Synchronization Strategy
- Lição #23: Comprehensive File Audit Strategy
- Lição #24: API Key Management in Production
- SDLC: Waterfall, Agile, Scrum, Kanban, DevOps, XP
- SDLC: Comparison Matrix, Hybrid Approaches, Key Takeaways

---

## MONITORING RECOMMENDATIONS

### Daily Checks
- Entry count (should only increase, never decrease)
- Embeddings coverage (should stay at 100%)

### Weekly Checks
- Category distribution (should be balanced)
- Search functionality (test with sample queries)
- Data integrity (no NULL fields)

### Monthly Checks
- Full verification checklist
- Review access logs
- Audit recent changes
- Performance metrics (query speed)

---

## SECURITY BEST PRACTICES

1. **Never commit credentials to Git**
   - Use environment variables
   - Use .env files (in .gitignore)
   - Use secrets manager (Google Secret Manager)

2. **Rotate credentials regularly**
   - Every 90 days minimum
   - Immediately if compromised
   - Update all environments after rotation

3. **Limit access**
   - Only owner and authorized personnel
   - Use read-only accounts for reporting
   - Log all access attempts

4. **Encrypt sensitive data**
   - Use SSL/TLS for connections
   - Encrypt backups
   - Encrypt data at rest

---

## BACKUP VERIFICATION

### Check Latest Backup

```sql
-- TiDB Cloud provides automatic backups
-- Verify backup settings in TiDB Cloud Console
```

### Manual Backup

```bash
# Export entire knowledge table
mysqldump -h gateway03.us-east-1.prod.aws.tidbcloud.com \
  -P 4000 \
  -u 3QQhaXF1ucYHpuK.e4b7c6254861 \
  -p \
  --ssl-mode=REQUIRED \
  25NeaJLRyMKQFYzeZChVTB \
  knowledge > knowledge_backup_$(date +%Y%m%d).sql
```

---

## TROUBLESHOOTING GUIDE

### Problem: Can't verify embeddings content

**Solution:** Embeddings are stored as JSON strings. To inspect:

```sql
SELECT id, title, 
  SUBSTRING(embedding, 1, 50) as embedding_preview,
  LENGTH(embedding) as embedding_length
FROM knowledge 
WHERE embedding IS NOT NULL 
LIMIT 5;
```

Expected: `embedding_length` should be ~20,000-30,000 characters (1536 floats as JSON)

### Problem: Slow queries

**Solution:** Check indexes:

```sql
SHOW INDEX FROM knowledge;
```

Expected: Indexes on `id`, `title`, `category`, `sourceType`

### Problem: Duplicate entries

**Solution:** Find duplicates:

```sql
SELECT title, COUNT(*) as count 
FROM knowledge 
GROUP BY title 
HAVING count > 1;
```

Expected: 0 rows (no duplicates)

---

## CONTACT AND SUPPORT

**Owner:** Everton Luís Garcia  
**Email:** elgarcia.eng@gmail.com  
**Project:** MOTHER v7.0  
**Last Updated:** 2026-02-20

---

**Status:** Production Database Verification Guide Complete  
**Version:** 1.0  
**Next Review:** 2026-03-20
