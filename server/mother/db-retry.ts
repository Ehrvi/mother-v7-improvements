import { logger } from "../lib/logger";
/**
 * Database Retry Logic
 * Fixes V2-001: DB connection failures without retry mechanism
 *
 * Implements exponential backoff retry strategy for transient DB failures
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 1000, // 1s
  maxDelay: 10000, // 10s
  backoffMultiplier: 2,
};

/**
 * Retry a database operation with exponential backoff
 */
export async function retryDbOperation<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;
  let delay = opts.initialDelay;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on the last attempt
      if (attempt === opts.maxAttempts) {
        break;
      }

      // Check if error is retryable (transient DB errors)
      if (!isRetryableError(error)) {
        throw error;
      }

      logger.info(
        `[DB Retry] Attempt ${attempt}/${opts.maxAttempts} failed: ${lastError.message}`
      );
      logger.info(`[DB Retry] Retrying in ${delay}ms...`);

      // Wait before retrying
      await sleep(delay);

      // Exponential backoff
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelay);
    }
  }

  throw new Error(
    `DB operation failed after ${opts.maxAttempts} attempts: ${lastError?.message}`
  );
}

/**
 * Check if error is retryable (transient)
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();

  // Common transient DB errors
  const retryablePatterns = [
    "connection",
    "timeout",
    "deadlock",
    "lock wait",
    "too many connections",
    "econnrefused",
    "econnreset",
    "etimedout",
  ];

  return retryablePatterns.some(pattern => message.includes(pattern));
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Warm up database connection pool
 * Prevents cold start issues in GCloud
 */
export async function warmUpDbConnection(
  getDb: () => Promise<any>
): Promise<void> {
  logger.info("[DB Warm-up] Starting connection pool warm-up...");

  try {
    const db = await retryDbOperation(getDb, { maxAttempts: 5 });

    // Execute simple query to warm up connection
    await db.execute("SELECT 1");

    logger.info("[DB Warm-up] Connection pool ready");
  } catch (error) {
    logger.error("[DB Warm-up] Failed:", error);
    throw error;
  }
}
