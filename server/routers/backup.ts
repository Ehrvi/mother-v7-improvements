import { publicProcedure, router } from '../_core/trpc';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { logger } from '../lib/logger';

const execAsync = promisify(exec);

/**
 * Backup Router
 * Provides HTTP endpoint for triggering database backups
 * Designed to be called by Cloud Scheduler or manual triggers
 */
export const backupRouter = router({
  /**
   * Trigger database backup
   * POST /api/trpc/backup.trigger
   * 
   * Security: Protected by secret token to prevent unauthorized backups
   */
  trigger: publicProcedure
    .input(z.object({
      token: z.string().min(1, 'Backup token is required'),
    }))
    .mutation(async ({ input }) => {
      const BACKUP_TOKEN = process.env.BACKUP_TOKEN || 'change-me-in-production';
      
      // Verify token
      if (input.token !== BACKUP_TOKEN) {
        logger.warn('Unauthorized backup attempt', { 
          providedToken: input.token.substring(0, 4) + '***' 
        });
        throw new Error('Unauthorized: Invalid backup token');
      }

      try {
        logger.info('Starting scheduled database backup...');
        
        const scriptPath = path.join(process.cwd(), 'server/scripts/backup-database.ts');
        const { stdout, stderr } = await execAsync(`tsx ${scriptPath}`);
        
        logger.info('Database backup completed successfully', {
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });

        return {
          success: true,
          message: 'Database backup completed successfully',
          timestamp: new Date().toISOString(),
          output: stdout.trim(),
        };
      } catch (error) {
        logger.error('Database backup failed', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });

        throw new Error(`Backup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }),

  /**
   * Get backup status and history
   * GET /api/trpc/backup.status
   */
  status: publicProcedure
    .input(z.object({
      token: z.string().min(1, 'Backup token is required'),
    }))
    .query(async ({ input }) => {
      const BACKUP_TOKEN = process.env.BACKUP_TOKEN || 'change-me-in-production';
      
      if (input.token !== BACKUP_TOKEN) {
        throw new Error('Unauthorized: Invalid backup token');
      }

      try {
        const backupDir = path.join(process.cwd(), 'backups');
        const { stdout } = await execAsync(`ls -lh ${backupDir} | tail -n 10`);
        
        return {
          success: true,
          backupDirectory: backupDir,
          recentBackups: stdout.trim(),
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        logger.error('Failed to retrieve backup status', {
          error: error instanceof Error ? error.message : String(error),
        });

        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        };
      }
    }),
});
