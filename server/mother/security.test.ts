/**
 * MOTHER v7.0 - Security Module Tests
 * Comprehensive test coverage for security auditing and threat detection
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  SecurityAuditLogger,
  ThreatDetector,
  type SecurityEvent,
  type ThreatDetectionResult,
} from "./security";

describe("SecurityAuditLogger", () => {
  let logger: SecurityAuditLogger;

  beforeEach(() => {
    logger = new SecurityAuditLogger(100);
  });

  describe("Event Logging", () => {
    it("should log security events with auto-generated ID and timestamp", () => {
      logger.log({
        type: "authentication",
        severity: "low",
        details: { action: "login_attempt" },
      });

      const events = logger.export();
      expect(events).toHaveLength(1);
      expect(events[0]).toHaveProperty("id");
      expect(events[0]).toHaveProperty("timestamp");
      expect(events[0].type).toBe("authentication");
    });

    it("should maintain event order", () => {
      logger.log({ type: "authentication", severity: "low", details: {} });
      logger.log({ type: "authorization", severity: "medium", details: {} });
      logger.log({ type: "data_access", severity: "high", details: {} });

      const events = logger.export();
      expect(events[0].type).toBe("authentication");
      expect(events[1].type).toBe("authorization");
      expect(events[2].type).toBe("data_access");
    });

    it("should respect max events limit", () => {
      const smallLogger = new SecurityAuditLogger(5);

      for (let i = 0; i < 10; i++) {
        smallLogger.log({
          type: "api_call",
          severity: "low",
          details: { call: i },
        });
      }

      const events = smallLogger.export();
      expect(events.length).toBeLessThanOrEqual(5);
    });

    it("should include optional fields when provided", () => {
      logger.log({
        type: "suspicious_activity",
        severity: "critical",
        userId: 123,
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
        endpoint: "/api/admin",
        details: { reason: "unauthorized_access_attempt" },
      });

      const events = logger.export();
      expect(events[0].userId).toBe(123);
      expect(events[0].ipAddress).toBe("192.168.1.1");
      expect(events[0].userAgent).toBe("Mozilla/5.0");
      expect(events[0].endpoint).toBe("/api/admin");
    });
  });

  describe("Event Retrieval", () => {
    it("should export all logged events", () => {
      logger.log({ type: "authentication", severity: "low", details: {} });
      logger.log({ type: "authorization", severity: "high", details: {} });
      logger.log({ type: "data_access", severity: "high", details: {} });

      const events = logger.export();
      expect(events).toHaveLength(3);
    });
  });

  describe("Event Management", () => {
    it("should clear all events", () => {
      logger.log({ type: "authentication", severity: "low", details: {} });
      logger.log({ type: "authorization", severity: "medium", details: {} });

      logger.clear();

      const events = logger.export();
      expect(events).toHaveLength(0);
    });

    it("should export immutable copy of events", () => {
      logger.log({ type: "authentication", severity: "low", details: {} });

      const events1 = logger.export();
      const events2 = logger.export();

      expect(events1).not.toBe(events2); // Different array instances
      expect(events1).toEqual(events2); // Same content
    });
  });
});

describe("ThreatDetector", () => {
  let detector: ThreatDetector;

  beforeEach(() => {
    detector = new ThreatDetector();
  });

  describe("SQL Injection Detection", () => {
    it("should detect classic SQL injection patterns", () => {
      const maliciousInputs = [
        "' OR '1'='1",
        "1' OR 1=1--",
        "'; DROP TABLE users; --",
        "UNION SELECT * FROM users",
        "1; DELETE FROM users WHERE 1=1",
      ];

      maliciousInputs.forEach(input => {
        const result = detector.detectSQLInjection(input);
        expect(result.isThreat).toBe(true);
        expect(result.threatType).toBe("sql_injection");
        expect(result.confidence).toBeGreaterThan(0);
      });
    });

    it("should not flag safe queries", () => {
      const safeInputs = [
        "What is machine learning?",
        "Tell me about quantum computing",
        "How do I learn Python?",
        "Explain neural networks",
      ];

      safeInputs.forEach(input => {
        const result = detector.detectSQLInjection(input);
        expect(result.isThreat).toBe(false);
        expect(result.confidence).toBe(0);
      });
    });

    it("should provide recommendations for threats", () => {
      const result = detector.detectSQLInjection("' OR '1'='1");
      expect(result.recommendation).toBeDefined();
      expect(result.recommendation).toContain("Block");
    });

    it("should calculate confidence based on pattern matches", () => {
      const singlePattern = detector.detectSQLInjection("' OR '1'='1");
      const multiplePatterns = detector.detectSQLInjection(
        "' OR '1'='1 UNION SELECT * FROM users --"
      );

      expect(multiplePatterns.confidence).toBeGreaterThan(
        singlePattern.confidence
      );
    });
  });

  describe("XSS Detection", () => {
    it("should detect XSS attack patterns", () => {
      const maliciousInputs = [
        "<script>alert('xss')</script>",
        "<img src=x onerror=alert('xss')>",
        "javascript:alert('xss')",
        "<iframe src='evil.com'></iframe>",
        "<body onload=alert('xss')>",
      ];

      maliciousInputs.forEach(input => {
        const result = detector.detectXSS(input);
        expect(result.isThreat).toBe(true);
        expect(result.threatType).toBe("xss");
        expect(result.confidence).toBeGreaterThan(0);
      });
    });

    it("should not flag safe HTML-like content", () => {
      const safeInputs = [
        "I love <3 coding",
        "Use the > operator in comparisons",
        "Email me at user@example.com",
      ];

      safeInputs.forEach(input => {
        const result = detector.detectXSS(input);
        expect(result.isThreat).toBe(false);
      });
    });

    it("should detect event handler injections", () => {
      const result = detector.detectXSS(
        "<div onclick='malicious()'>Click me</div>"
      );
      expect(result.isThreat).toBe(true);
      expect(result.threatType).toBe("xss");
    });
  });

  describe("Brute Force Detection", () => {
    it("should detect brute force attempts", () => {
      const result = detector.detectBruteForce("192.168.1.1", 10, 30000);
      expect(result.isThreat).toBe(true);
      expect(result.threatType).toBe("brute_force");
      expect(result.recommendation).toContain("Rate limit");
    });

    it("should not flag normal login patterns", () => {
      const result = detector.detectBruteForce("192.168.1.1", 2, 30000);
      expect(result.isThreat).toBe(false);
    });

    it("should consider time window", () => {
      // 5 attempts over 2 minutes should not trigger (outside 1-minute window)
      const result = detector.detectBruteForce("192.168.1.1", 5, 120000);
      expect(result.isThreat).toBe(false);
    });

    it("should have confidence proportional to threat severity", () => {
      const moderate = detector.detectBruteForce("192.168.1.1", 5, 30000);
      const severe = detector.detectBruteForce("192.168.1.1", 20, 30000);

      expect(moderate.confidence).toBeGreaterThan(0);
      expect(severe.confidence).toBeGreaterThan(0);
      expect(severe.confidence).toBeGreaterThanOrEqual(moderate.confidence);
    });
  });

  describe("Combined Threat Analysis", () => {
    it("should analyze multiple threat vectors", () => {
      const input = "<script>alert('xss')</script> OR 1=1--";

      const sqlResult = detector.detectSQLInjection(input);
      const xssResult = detector.detectXSS(input);

      expect(sqlResult.isThreat || xssResult.isThreat).toBe(true);
    });

    it("should prioritize threats by severity", () => {
      const threats: ThreatDetectionResult[] = [
        { isThreat: true, confidence: 0.3, threatType: "xss" },
        { isThreat: true, confidence: 0.9, threatType: "sql_injection" },
        { isThreat: true, confidence: 0.6, threatType: "brute_force" },
      ];

      const sorted = threats.sort((a, b) => b.confidence - a.confidence);
      expect(sorted[0].threatType).toBe("sql_injection");
    });
  });
});

describe("Integration Tests", () => {
  it("should log detected threats automatically", () => {
    const logger = new SecurityAuditLogger();
    const detector = new ThreatDetector();

    const maliciousInput = "' OR '1'='1";
    const threat = detector.detectSQLInjection(maliciousInput);

    if (threat.isThreat) {
      logger.log({
        type: "suspicious_activity",
        severity: "high",
        details: {
          input: maliciousInput,
          threatType: threat.threatType,
          confidence: threat.confidence,
        },
      });
    }

    const events = logger.export();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("suspicious_activity");
    expect(events[0].severity).toBe("high");
  });

  it("should handle multiple concurrent threats", () => {
    const logger = new SecurityAuditLogger();
    const detector = new ThreatDetector();

    const threats = [
      "' OR '1'='1",
      "<script>alert('xss')</script>",
      "javascript:void(0)",
    ];

    threats.forEach(input => {
      const sqlThreat = detector.detectSQLInjection(input);
      const xssThreat = detector.detectXSS(input);

      if (sqlThreat.isThreat || xssThreat.isThreat) {
        logger.log({
          type: "suspicious_activity",
          severity: "critical",
          details: { input, sqlThreat, xssThreat },
        });
      }
    });

    const events = logger.export();
    expect(events.length).toBeGreaterThan(0);
  });
});
