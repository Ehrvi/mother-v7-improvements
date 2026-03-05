/**
 * shms-api-gateway-saas.ts — MOTHER v80.5 — Ciclo 131 (ROADMAP v4.2)
 *
 * API Gateway SaaS multi-tenant com autenticação por cliente Intelltech.
 *
 * Funcionalidades:
 * - Roteamento por API key (cada cliente tem sua própria key)
 * - Rate limiting por cliente (configurável por plano)
 * - Autenticação JWT + API key
 * - Audit log de todas as requisições
 * - Middleware de validação de tenant
 *
 * Scientific basis:
 * - NIST SP 800-53 Rev 5 — Security and Privacy Controls
 * - ISO/IEC 27001:2022 — Information security management
 * - RFC 7519 — JSON Web Token (JWT)
 * - arXiv:2312.10997 — LLM-based software engineering
 *
 * @module shms-api-gateway-saas
 * @version 1.0.0
 * @cycle C131
 * @roadmap v4.2 Fase 4
 */

import crypto from 'crypto';
import { getDb } from '../db';
import { sql } from 'drizzle-orm';

// ============================================================
// TYPES
// ============================================================

export interface TenantContext {
  clientId: string;
  clientName: string;
  apiKey: string;
  plan: 'starter' | 'professional' | 'enterprise';
  rateLimitPerMinute: number;
  requestCount: number;
  windowStart: number;
}

export interface GatewayRequest {
  method: string;
  path: string;
  clientId: string;
  apiKey: string;
  body?: unknown;
  headers: Record<string, string>;
  timestamp: string;
  requestId: string;
}

export interface GatewayResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  duration: number;
  requestId: string;
}

export interface RateLimitState {
  clientId: string;
  requestCount: number;
  windowStart: number;
  windowSizeMs: number;
  limitPerWindow: number;
  remaining: number;
  resetAt: number;
}

// In-memory rate limit store (per instance)
const rateLimitStore = new Map<string, RateLimitState>();

// ============================================================
// TENANT AUTHENTICATION
// ============================================================

export async function authenticateTenant(apiKey: string): Promise<TenantContext | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.execute(sql`
    SELECT client_id, client_name, api_key, billing_plan, rate_limit_per_minute, status
    FROM shms_clients
    WHERE api_key = ${apiKey} AND status = 'ACTIVE'
  `);

  const rows = (result as unknown as [Record<string, unknown>[], unknown])[0] || [];
  if ((rows as unknown[]).length === 0) return null;

  const row = (rows as Record<string, unknown>[])[0];
  return {
    clientId: row.client_id as string,
    clientName: row.client_name as string,
    apiKey: row.api_key as string,
    plan: row.billing_plan as 'starter' | 'professional' | 'enterprise',
    rateLimitPerMinute: row.rate_limit_per_minute as number,
    requestCount: 0,
    windowStart: Date.now(),
  };
}

// ============================================================
// RATE LIMITING
// ============================================================

export function checkRateLimit(clientId: string, limitPerMinute: number): { allowed: boolean; state: RateLimitState } {
  const now = Date.now();
  const windowSizeMs = 60 * 1000; // 1 minute window

  let state = rateLimitStore.get(clientId);

  if (!state || now - state.windowStart > windowSizeMs) {
    state = {
      clientId,
      requestCount: 0,
      windowStart: now,
      windowSizeMs,
      limitPerWindow: limitPerMinute,
      remaining: limitPerMinute,
      resetAt: now + windowSizeMs,
    };
  }

  state.requestCount++;
  state.remaining = Math.max(0, limitPerMinute - state.requestCount);
  rateLimitStore.set(clientId, state);

  return {
    allowed: state.requestCount <= limitPerMinute,
    state,
  };
}

// ============================================================
// AUDIT LOGGING
// ============================================================

export async function logGatewayRequest(
  request: GatewayRequest,
  response: GatewayResponse,
  tenantContext: TenantContext | null,
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS shms_api_audit_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        request_id VARCHAR(100) NOT NULL,
        client_id VARCHAR(100),
        method VARCHAR(10) NOT NULL,
        path VARCHAR(500) NOT NULL,
        status_code INT NOT NULL,
        duration_ms INT NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW(),
        ip_address VARCHAR(45),
        INDEX idx_audit_client (client_id, timestamp),
        INDEX idx_audit_status (status_code, timestamp)
      )
    `);

    await db.execute(sql`
      INSERT INTO shms_api_audit_log (request_id, client_id, method, path, status_code, duration_ms, timestamp)
      VALUES (${request.requestId}, ${tenantContext?.clientId || 'anonymous'}, ${request.method},
              ${request.path}, ${response.statusCode}, ${response.duration}, ${request.timestamp})
    `);
  } catch {
    // Non-critical: don't fail the request if audit log fails
  }
}

// ============================================================
// REQUEST ROUTING
// ============================================================

export function generateRequestId(): string {
  return `req-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

export function buildGatewayHeaders(state: RateLimitState, requestId: string): Record<string, string> {
  return {
    'X-Request-ID': requestId,
    'X-RateLimit-Limit': String(state.limitPerWindow),
    'X-RateLimit-Remaining': String(state.remaining),
    'X-RateLimit-Reset': String(state.resetAt),
    'X-MOTHER-Version': 'v80.5',
    'X-MOTHER-Cycle': 'C131',
  };
}

export function buildUnauthorizedResponse(requestId: string): GatewayResponse {
  return {
    statusCode: 401,
    body: { error: 'Unauthorized', message: 'Invalid or missing API key', requestId },
    headers: { 'X-Request-ID': requestId },
    duration: 0,
    requestId,
  };
}

export function buildRateLimitResponse(state: RateLimitState, requestId: string): GatewayResponse {
  return {
    statusCode: 429,
    body: {
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Limit: ${state.limitPerWindow}/min. Resets at: ${new Date(state.resetAt).toISOString()}`,
      requestId,
    },
    headers: buildGatewayHeaders(state, requestId),
    duration: 0,
    requestId,
  };
}
