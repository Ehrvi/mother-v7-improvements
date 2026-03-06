/**
 * C158 — zero-intervention-validator.ts
 * Fase 6C: Autonomia Total — Validador e certificador de zero-intervenção humana
 * 
 * Scientific basis:
 * - Nakamoto (2008): "Bitcoin: A Peer-to-Peer Electronic Cash System" — Proof-of-Work
 *   as cryptographic certificate of computational effort without central authority
 * - Constitutional AI (arXiv:2212.08073): "AI systems that follow principles autonomously"
 * - Lamport (1978): "Time, Clocks, and the Ordering of Events in a Distributed System"
 *   — Logical timestamps for ordering autonomous events
 * 
 * Purpose: Tracks all MOTHER operations, detects human intervention events,
 * and generates cryptographic certificates when the system operates autonomously
 * for the required 30-day period.
 */

import { createLogger } from '../_core/logger';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const logger = createLogger('zero-intervention-validator');

export interface InterventionEvent {
  timestamp: string;
  type: 'human_commit' | 'human_config_change' | 'human_api_call' | 'autonomous_action';
  source: string;
  description: string;
  isHumanIntervention: boolean;
}

export interface AutonomyCertificate {
  certificateId: string;
  issuedAt: string;
  validFrom: string;
  validTo: string;
  daysAutonomous: number;
  totalOperations: number;
  humanInterventions: number;
  autonomyRatio: number;
  passed: boolean;
  cryptographicProof: string;
  issuerVersion: string;
}

/**
 * ZeroInterventionValidator
 * Monitors MOTHER's operations and generates cryptographic certificates
 * when the system achieves sustained autonomous operation.
 * 
 * Certificate validity: 30 consecutive days with autonomy ratio >= 95%
 */
export class ZeroInterventionValidator {
  private readonly REQUIRED_DAYS = 30;
  private readonly AUTONOMY_THRESHOLD = 0.95; // 95% autonomous operations
  private readonly ISSUER_VERSION = 'C158-v1.0';
  private readonly LOG_DIR: string;

  constructor() {
    this.LOG_DIR = process.env.MOTHER_DIR
      ? path.join(process.env.MOTHER_DIR, 'autonomy-logs')
      : path.join(process.cwd(), 'autonomy-logs');
    
    if (!fs.existsSync(this.LOG_DIR)) {
      fs.mkdirSync(this.LOG_DIR, { recursive: true });
    }
  }

  /**
   * Record an operation event (autonomous or human intervention)
   */
  recordEvent(event: Omit<InterventionEvent, 'timestamp'>): void {
    const fullEvent: InterventionEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    const logFile = path.join(this.LOG_DIR, `events-${new Date().toISOString().slice(0, 10)}.jsonl`);
    fs.appendFileSync(logFile, JSON.stringify(fullEvent) + '\n');

    if (event.isHumanIntervention) {
      logger.warn(`Human intervention detected: ${event.type} — ${event.description}`);
    } else {
      logger.info(`Autonomous operation recorded: ${event.type}`);
    }
  }

  /**
   * Analyze operation history and generate autonomy certificate
   * if criteria are met (30 days, ≥ 95% autonomous)
   */
  async generateCertificate(fromDate?: Date): Promise<AutonomyCertificate> {
    const validFrom = fromDate || new Date(Date.now() - this.REQUIRED_DAYS * 24 * 60 * 60 * 1000);
    const validTo = new Date();

    const events = this.loadEvents(validFrom, validTo);
    const humanEvents = events.filter(e => e.isHumanIntervention);
    const autonomousEvents = events.filter(e => !e.isHumanIntervention);

    const totalOps = events.length;
    const humanInterventions = humanEvents.length;
    const autonomyRatio = totalOps > 0 ? autonomousEvents.length / totalOps : 1.0;
    const daysElapsed = Math.floor((validTo.getTime() - validFrom.getTime()) / (24 * 60 * 60 * 1000));

    const passed = daysElapsed >= this.REQUIRED_DAYS && autonomyRatio >= this.AUTONOMY_THRESHOLD;

    const certificateData = {
      validFrom: validFrom.toISOString(),
      validTo: validTo.toISOString(),
      daysAutonomous: daysElapsed,
      totalOperations: totalOps,
      humanInterventions,
      autonomyRatio: Math.round(autonomyRatio * 10000) / 10000,
      passed,
      issuerVersion: this.ISSUER_VERSION,
    };

    const cryptographicProof = crypto.createHash('sha256')
      .update(JSON.stringify(certificateData))
      .digest('hex');

    const certificate: AutonomyCertificate = {
      certificateId: `MOTHER-AUTONOMY-${Date.now()}`,
      issuedAt: new Date().toISOString(),
      ...certificateData,
      cryptographicProof,
      issuerVersion: this.ISSUER_VERSION,
    };

    // Save certificate
    const certPath = path.join(this.LOG_DIR, `certificate-${certificate.certificateId}.json`);
    fs.writeFileSync(certPath, JSON.stringify(certificate, null, 2));

    if (passed) {
      logger.info(`🏆 AUTONOMY CERTIFICATE ISSUED: ${certificate.certificateId} — ${daysElapsed} days, ${Math.round(autonomyRatio * 100)}% autonomous`);
    } else {
      logger.warn(`Certificate not yet earned: ${daysElapsed}/${this.REQUIRED_DAYS} days, ${Math.round(autonomyRatio * 100)}% autonomous (required: ${Math.round(this.AUTONOMY_THRESHOLD * 100)}%)`);
    }

    return certificate;
  }

  private loadEvents(from: Date, to: Date): InterventionEvent[] {
    const events: InterventionEvent[] = [];
    
    try {
      const files = fs.readdirSync(this.LOG_DIR).filter(f => f.startsWith('events-') && f.endsWith('.jsonl'));
      
      for (const file of files) {
        const content = fs.readFileSync(path.join(this.LOG_DIR, file), 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        
        for (const line of lines) {
          try {
            const event: InterventionEvent = JSON.parse(line);
            const eventTime = new Date(event.timestamp);
            if (eventTime >= from && eventTime <= to) {
              events.push(event);
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch {
      // No logs yet — return empty (system just started)
    }

    return events;
  }
}

// HTTP handler for GET /api/a2a/autonomy/certificate
export async function handleCertificateRequest(req: any, res: any): Promise<void> {
  const validator = new ZeroInterventionValidator();
  
  try {
    const certificate = await validator.generateCertificate();
    res.json({
      success: true,
      ...certificate,
      message: certificate.passed
        ? `✅ AUTONOMY CERTIFICATE ISSUED: ${certificate.daysAutonomous} days autonomous`
        : `Certificate pending: ${certificate.daysAutonomous}/30 days, ${Math.round(certificate.autonomyRatio * 100)}% autonomous`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
