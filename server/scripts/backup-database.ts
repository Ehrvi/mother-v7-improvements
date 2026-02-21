#!/usr/bin/env node
/**
 * Automated Database Backup Script (#10: Backup automatizado)
 * 
 * Usage:
 *   node server/scripts/backup-database.ts
 * 
 * Schedule with cron (daily at 2 AM):
 *   0 2 * * * cd /path/to/project && node server/scripts/backup-database.ts
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
const DATABASE_URL = process.env.DATABASE_URL!;
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '30');

async function backupDatabase() {
  console.log('[Backup] Starting database backup...');
  
  try {
    // Create backup directory if it doesn't exist
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    
    // Parse database URL
    const url = new URL(DATABASE_URL.replace('mysql://', 'http://'));
    const host = url.hostname;
    const port = url.port || '3306';
    const username = url.username;
    const password = url.password;
    const database = url.pathname.slice(1).split('?')[0];
    
    // Generate backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupFile = path.join(BACKUP_DIR, `backup-${database}-${timestamp}.sql`);
    
    // Run mysqldump
    const command = `mysqldump -h ${host} -P ${port} -u ${username} -p${password} ${database} > ${backupFile}`;
    
    console.log(`[Backup] Dumping database: ${database}`);
    await execAsync(command);
    
    // Compress backup
    const gzipFile = `${backupFile}.gz`;
    await execAsync(`gzip ${backupFile}`);
    
    console.log(`[Backup] Backup created: ${gzipFile}`);
    
    // Get backup size
    const stats = await fs.stat(gzipFile);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`[Backup] Backup size: ${sizeMB} MB`);
    
    // Clean old backups
    await cleanOldBackups();
    
    console.log('[Backup] Backup completed successfully');
    return gzipFile;
  } catch (error) {
    console.error('[Backup] Backup failed:', error);
    throw error;
  }
}

async function cleanOldBackups() {
  console.log(`[Backup] Cleaning backups older than ${RETENTION_DAYS} days...`);
  
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const now = Date.now();
    const maxAge = RETENTION_DAYS * 24 * 60 * 60 * 1000;
    
    let deletedCount = 0;
    
    for (const file of files) {
      if (!file.startsWith('backup-') || !file.endsWith('.sql.gz')) {
        continue;
      }
      
      const filePath = path.join(BACKUP_DIR, file);
      const stats = await fs.stat(filePath);
      const age = now - stats.mtimeMs;
      
      if (age > maxAge) {
        await fs.unlink(filePath);
        deletedCount++;
        console.log(`[Backup] Deleted old backup: ${file}`);
      }
    }
    
    console.log(`[Backup] Cleaned ${deletedCount} old backup(s)`);
  } catch (error) {
    console.error('[Backup] Failed to clean old backups:', error);
  }
}

// Run backup if called directly
if (require.main === module) {
  backupDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { backupDatabase, cleanOldBackups };
