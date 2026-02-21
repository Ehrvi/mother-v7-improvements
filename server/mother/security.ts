import { logger } from '../lib/logger';
/**
 * MOTHER v7.0 - Security Auditing and Monitoring System
 * Implements continuous security monitoring and threat detection
 * 
 * Improvement #4 from self-audit:
 * "Investir em auditorias regulares de segurança cibernética e na implementação de IA para detecção proativa de ameaças"
 */

export interface SecurityEvent {
  id: string;
  timestamp: Date;
  type: 'authentication' | 'authorization' | 'data_access' | 'api_call' | 'suspicious_activity';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: number;
  ipAddress?: string;
  userAgent?: string;
  endpoint?: string;
  details: Record<string, unknown>;
}

export interface ThreatDetectionResult {
  isThreat: boolean;
  confidence: number; // 0-1
  threatType?: 'sql_injection' | 'xss' | 'brute_force' | 'ddos' | 'data_exfiltration' | 'anomalous_behavior';
  recommendation?: string;
}

/**
 * Security Audit Logger
 * Logs all security-relevant events
 */
export class SecurityAuditLogger {
  private events: SecurityEvent[] = [];
  private maxEvents: number;
  
  constructor(maxEvents: number = 10000) {
    this.maxEvents = maxEvents;
  }
  
  /**
   * Log a security event
   */
  log(event: Omit<SecurityEvent, 'id' | 'timestamp'>): void {
    const fullEvent: SecurityEvent = {
      id: this.generateId(),
      timestamp: new Date(),
      ...event
    };
    
    this.events.push(fullEvent);
    
    // Trim old events if exceeding max
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
    
    // Log critical events immediately
    if (event.severity === 'critical') {
      logger.error('[SECURITY CRITICAL]', JSON.stringify(fullEvent));
    }
  }
  
  /**
   * Get recent events
   */
  getRecentEvents(limit: number = 100): SecurityEvent[] {
    return this.events.slice(-limit);
  }
  
  /**
   * Get events by severity
   */
  getEventsBySeverity(severity: SecurityEvent['severity']): SecurityEvent[] {
    return this.events.filter(e => e.severity === severity);
  }
  
  /**
   * Get events by type
   */
  getEventsByType(type: SecurityEvent['type']): SecurityEvent[] {
    return this.events.filter(e => e.type === type);
  }
  
  /**
   * Get events by user
   */
  getEventsByUser(userId: number): SecurityEvent[] {
    return this.events.filter(e => e.userId === userId);
  }
  
  /**
   * Generate unique event ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Export events for analysis
   */
  export(): SecurityEvent[] {
    return [...this.events];
  }
  
  /**
   * Clear all events
   */
  clear(): void {
    this.events = [];
  }
}

/**
 * AI-powered Threat Detection
 * Uses pattern matching and anomaly detection
 */
export class ThreatDetector {
  /**
   * Detect SQL injection attempts
   */
  detectSQLInjection(input: string): ThreatDetectionResult {
    const sqlPatterns = [
      /(\bor\b|\band\b)\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?/i,
      /union\s+select/i,
      /drop\s+table/i,
      /insert\s+into/i,
      /delete\s+from/i,
      /update\s+\w+\s+set/i,
      /exec(\s|\()/i,
      /--/,
      /\/\*/,
      /xp_/i
    ];
    
    const matches = sqlPatterns.filter(pattern => pattern.test(input));
    
    if (matches.length > 0) {
      return {
        isThreat: true,
        confidence: Math.min(matches.length * 0.3, 1),
        threatType: 'sql_injection',
        recommendation: 'Block request and log attempt'
      };
    }
    
    return { isThreat: false, confidence: 0 };
  }
  
  /**
   * Detect XSS attempts
   */
  detectXSS(input: string): ThreatDetectionResult {
    const xssPatterns = [
      /<script[^>]*>.*?<\/script>/i,
      /javascript:/i,
      /on\w+\s*=/i, // Event handlers
      /<iframe/i,
      /<embed/i,
      /<object/i,
      /eval\(/i,
      /expression\(/i
    ];
    
    const matches = xssPatterns.filter(pattern => pattern.test(input));
    
    if (matches.length > 0) {
      return {
        isThreat: true,
        confidence: Math.min(matches.length * 0.3, 1),
        threatType: 'xss',
        recommendation: 'Sanitize input and block request'
      };
    }
    
    return { isThreat: false, confidence: 0 };
  }
  
  /**
   * Detect brute force attempts
   */
  detectBruteForce(
    ipAddress: string,
    failedAttempts: number,
    timeWindow: number // milliseconds
  ): ThreatDetectionResult {
    const threshold = 5; // Failed attempts
    const windowMs = 60000; // 1 minute
    
    if (failedAttempts >= threshold && timeWindow <= windowMs) {
      return {
        isThreat: true,
        confidence: Math.min(failedAttempts / threshold, 1),
        threatType: 'brute_force',
        recommendation: 'Rate limit or block IP address'
      };
    }
    
    return { isThreat: false, confidence: 0 };
  }
  
  /**
   * Detect anomalous behavior
   * Uses statistical analysis
   */
  detectAnomalous(
    currentValue: number,
    historicalMean: number,
    historicalStdDev: number
  ): ThreatDetectionResult {
    // Z-score calculation
    const zScore = Math.abs((currentValue - historicalMean) / historicalStdDev);
    
    // Threshold: 3 standard deviations
    if (zScore > 3) {
      return {
        isThreat: true,
        confidence: Math.min(zScore / 5, 1),
        threatType: 'anomalous_behavior',
        recommendation: 'Investigate unusual activity pattern'
      };
    }
    
    return { isThreat: false, confidence: 0 };
  }
  
  /**
   * Comprehensive threat analysis
   */
  analyze(input: {
    query?: string;
    ipAddress?: string;
    failedAttempts?: number;
    requestRate?: number;
    historicalMean?: number;
    historicalStdDev?: number;
  }): ThreatDetectionResult[] {
    const results: ThreatDetectionResult[] = [];
    
    if (input.query) {
      results.push(this.detectSQLInjection(input.query));
      results.push(this.detectXSS(input.query));
    }
    
    if (input.ipAddress && input.failedAttempts !== undefined) {
      results.push(this.detectBruteForce(input.ipAddress, input.failedAttempts, 60000));
    }
    
    if (input.requestRate !== undefined && input.historicalMean !== undefined && input.historicalStdDev !== undefined) {
      results.push(this.detectAnomalous(input.requestRate, input.historicalMean, input.historicalStdDev));
    }
    
    return results.filter(r => r.isThreat);
  }
}

/**
 * Security Metrics Collector
 */
export class SecurityMetrics {
  private metrics: {
    totalRequests: number;
    blockedRequests: number;
    threatsDetected: number;
    falsePositives: number;
    averageResponseTime: number;
  };
  
  constructor() {
    this.metrics = {
      totalRequests: 0,
      blockedRequests: 0,
      threatsDetected: 0,
      falsePositives: 0,
      averageResponseTime: 0
    };
  }
  
  /**
   * Record a request
   */
  recordRequest(blocked: boolean, threatDetected: boolean, responseTime: number): void {
    this.metrics.totalRequests++;
    
    if (blocked) {
      this.metrics.blockedRequests++;
    }
    
    if (threatDetected) {
      this.metrics.threatsDetected++;
    }
    
    // Update average response time (running average)
    this.metrics.averageResponseTime = 
      (this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) + responseTime) / 
      this.metrics.totalRequests;
  }
  
  /**
   * Record false positive
   */
  recordFalsePositive(): void {
    this.metrics.falsePositives++;
  }
  
  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      blockRate: this.metrics.totalRequests > 0 
        ? (this.metrics.blockedRequests / this.metrics.totalRequests) * 100 
        : 0,
      threatRate: this.metrics.totalRequests > 0
        ? (this.metrics.threatsDetected / this.metrics.totalRequests) * 100
        : 0,
      falsePositiveRate: this.metrics.threatsDetected > 0
        ? (this.metrics.falsePositives / this.metrics.threatsDetected) * 100
        : 0
    };
  }
  
  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics = {
      totalRequests: 0,
      blockedRequests: 0,
      threatsDetected: 0,
      falsePositives: 0,
      averageResponseTime: 0
    };
  }
}

/**
 * Global security instances
 */
export const globalSecurityLogger = new SecurityAuditLogger();
export const globalThreatDetector = new ThreatDetector();
export const globalSecurityMetrics = new SecurityMetrics();

/**
 * Security middleware helper
 * Use in tRPC or Express middleware
 */
export function createSecurityMiddleware() {
  return {
    /**
     * Log security event
     */
    logEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>) {
      globalSecurityLogger.log(event);
    },
    
    /**
     * Check for threats
     */
    checkThreats(input: Parameters<ThreatDetector['analyze']>[0]): ThreatDetectionResult[] {
      return globalThreatDetector.analyze(input);
    },
    
    /**
     * Record metrics
     */
    recordMetrics(blocked: boolean, threatDetected: boolean, responseTime: number) {
      globalSecurityMetrics.recordRequest(blocked, threatDetected, responseTime);
    },
    
    /**
     * Get security status
     */
    getStatus() {
      return {
        recentEvents: globalSecurityLogger.getRecentEvents(10),
        metrics: globalSecurityMetrics.getMetrics(),
        criticalEvents: globalSecurityLogger.getEventsBySeverity('critical')
      };
    }
  };
}
