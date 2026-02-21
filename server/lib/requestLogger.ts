/**
 * Request Logging Middleware
 * 
 * Logs all API requests with correlation IDs for tracing.
 * 
 * Scientific Hypothesis:
 * Structured logging with correlation IDs reduces debugging time by 70%
 * and improves incident response time by 50%.
 */

import { v7 as uuidv7 } from 'uuid';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

/**
 * Request log entry
 */
export interface RequestLog {
  requestId: string;
  method: string;
  path: string;
  query: Record<string, any>;
  headers: Record<string, string>;
  body?: any;
  userId?: number;
  ip: string;
  userAgent: string;
  timestamp: string;
  duration?: number;
  status?: number;
  responseBody?: any;
  error?: any;
}

/**
 * Log configuration
 */
export interface LogConfig {
  logRequestBody: boolean;
  logResponseBody: boolean;
  logHeaders: boolean;
  excludePaths: string[];
  maxBodySize: number;  // Max bytes to log
}

/**
 * Default log configuration
 */
const DEFAULT_CONFIG: LogConfig = {
  logRequestBody: process.env.NODE_ENV === 'development',
  logResponseBody: process.env.NODE_ENV === 'development',
  logHeaders: false,  // Don't log headers by default (may contain sensitive data)
  excludePaths: ['/health', '/api/health'],  // Don't log health checks
  maxBodySize: 10000,  // 10 KB max
};

/**
 * Truncate large objects for logging
 * 
 * @param obj - Object to truncate
 * @param maxSize - Max size in bytes
 * @returns Truncated object or string
 */
function truncate(obj: any, maxSize: number): any {
  if (!obj) return obj;
  
  const str = JSON.stringify(obj);
  if (str.length <= maxSize) {
    return obj;
  }
  
  return `[Truncated: ${str.length} bytes, showing first ${maxSize}] ${str.substring(0, maxSize)}...`;
}

/**
 * Sanitize headers (remove sensitive data)
 * 
 * @param headers - Request headers
 * @returns Sanitized headers
 */
function sanitizeHeaders(headers: Record<string, any>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
  
  for (const [key, value] of Object.entries(headers)) {
    if (sensitiveHeaders.includes(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = String(value);
    }
  }
  
  return sanitized;
}

/**
 * Request logging middleware
 * 
 * Adds request ID to request object and logs request/response.
 * 
 * @param config - Log configuration
 * @returns Express middleware
 */
export function requestLogger(config: Partial<LogConfig> = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip excluded paths
    if (finalConfig.excludePaths.some(path => req.path.startsWith(path))) {
      return next();
    }
    
    // Generate request ID (UUID v7 - time-ordered)
    const requestId = uuidv7();
    
    // Attach request ID to request object
    (req as any).requestId = requestId;
    
    // Add request ID to response headers
    res.setHeader('X-Request-ID', requestId);
    
    // Start timer
    const startTime = Date.now();
    
    // Build request log
    const requestLog: RequestLog = {
      requestId,
      method: req.method,
      path: req.path,
      query: req.query as Record<string, any>,
      headers: finalConfig.logHeaders ? sanitizeHeaders(req.headers) : {},
      body: finalConfig.logRequestBody ? truncate(req.body, finalConfig.maxBodySize) : undefined,
      userId: (req as any).user?.id,
      ip: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.get('user-agent') || 'unknown',
      timestamp: new Date().toISOString(),
    };
    
    // Log request
    logger.info('[Request]', {
      requestId: requestLog.requestId,
      method: requestLog.method,
      path: requestLog.path,
      userId: requestLog.userId,
      ip: requestLog.ip,
    });
    
    // Capture response
    const originalSend = res.send;
    const originalJson = res.json;
    
    let responseBody: any;
    
    // Override res.send
    res.send = function(body: any) {
      responseBody = body;
      return originalSend.call(this, body);
    };
    
    // Override res.json
    res.json = function(body: any) {
      responseBody = body;
      return originalJson.call(this, body);
    };
    
    // Log response when finished
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      const responseLog: RequestLog = {
        ...requestLog,
        duration,
        status: res.statusCode,
        responseBody: finalConfig.logResponseBody ? truncate(responseBody, finalConfig.maxBodySize) : undefined,
      };
      
      // Log level based on status code
      if (res.statusCode >= 500) {
        logger.error('[Response]', responseLog);
      } else if (res.statusCode >= 400) {
        logger.warn('[Response]', responseLog);
      } else {
        logger.info('[Response]', {
          requestId: responseLog.requestId,
          method: responseLog.method,
          path: responseLog.path,
          status: responseLog.status,
          duration: `${responseLog.duration}ms`,
        });
      }
    });
    
    // Log errors
    res.on('error', (error: Error) => {
      logger.error('[Response Error]', {
        requestId,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      });
    });
    
    next();
  };
}

/**
 * Get request ID from request object
 * 
 * @param req - Express request
 * @returns Request ID
 */
export function getRequestId(req: Request): string {
  return (req as any).requestId || 'unknown';
}

/**
 * Create child logger with request context
 * 
 * @param req - Express request
 * @returns Logger function with request context
 */
export function createRequestLogger(req: Request) {
  const requestId = getRequestId(req);
  const userId = (req as any).user?.id;
  
  return {
    info: (message: string, data?: any) => {
      logger.info('[Request Log]', { requestId, userId, message, ...data });
    },
    warn: (message: string, data?: any) => {
      logger.warn('[Request Warn]', { requestId, userId, message, ...data });
    },
    error: (message: string, error?: any) => {
      logger.error('[Request Error]', {
        requestId,
        userId,
        message,
        error: error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : undefined,
      });
    },
  };
}

/**
 * Get request logs for analysis
 * 
 * In production, this would query a log aggregation service.
 * For now, it's a placeholder.
 * 
 * @param filters - Log filters
 * @returns Request logs
 */
export async function getRequestLogs(filters: {
  startTime?: Date;
  endTime?: Date;
  userId?: number;
  path?: string;
  status?: number;
  limit?: number;
}): Promise<RequestLog[]> {
  // TODO: Implement log aggregation query
  // This would typically query Elasticsearch, CloudWatch Logs, etc.
  return [];
}

/**
 * Analyze request logs for patterns
 * 
 * @param logs - Request logs
 * @returns Analysis results
 */
export function analyzeRequestLogs(logs: RequestLog[]): {
  totalRequests: number;
  avgDuration: number;
  errorRate: number;
  slowestEndpoints: Array<{ path: string; avgDuration: number }>;
  topUsers: Array<{ userId: number; requestCount: number }>;
} {
  if (logs.length === 0) {
    return {
      totalRequests: 0,
      avgDuration: 0,
      errorRate: 0,
      slowestEndpoints: [],
      topUsers: [],
    };
  }
  
  const totalRequests = logs.length;
  const avgDuration = logs.reduce((sum, log) => sum + (log.duration || 0), 0) / totalRequests;
  const errorCount = logs.filter(log => (log.status || 0) >= 400).length;
  const errorRate = errorCount / totalRequests;
  
  // Group by path for slowest endpoints
  const pathDurations: Record<string, number[]> = {};
  logs.forEach(log => {
    if (!pathDurations[log.path]) {
      pathDurations[log.path] = [];
    }
    pathDurations[log.path].push(log.duration || 0);
  });
  
  const slowestEndpoints = Object.entries(pathDurations)
    .map(([path, durations]) => ({
      path,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
    }))
    .sort((a, b) => b.avgDuration - a.avgDuration)
    .slice(0, 10);
  
  // Group by user for top users
  const userCounts: Record<number, number> = {};
  logs.forEach(log => {
    if (log.userId) {
      userCounts[log.userId] = (userCounts[log.userId] || 0) + 1;
    }
  });
  
  const topUsers = Object.entries(userCounts)
    .map(([userId, requestCount]) => ({
      userId: parseInt(userId, 10),
      requestCount,
    }))
    .sort((a, b) => b.requestCount - a.requestCount)
    .slice(0, 10);
  
  return {
    totalRequests,
    avgDuration,
    errorRate,
    slowestEndpoints,
    topUsers,
  };
}
