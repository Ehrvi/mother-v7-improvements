/**
 * shms-auth-middleware.ts — MOTHER v81.8 — Ciclo 188 — Phase 4.4
 *
 * Express middleware for SHMS API authentication and billing enforcement.
 * Integrates with shms-api-gateway-saas.ts for multi-tenant API key auth.
 *
 * Security model:
 * - API key in X-API-Key header (NIST SP 800-53 Rev 5 — IA-2)
 * - Rate limiting per client per plan (RFC 6585 — 429 Too Many Requests)
 * - Audit log of all authenticated requests (ISO/IEC 27001:2022 — A.12.4)
 * - Fail-fast on missing/invalid API key (R11: secrets never hardcoded)
 *
 * Scientific basis:
 * - NIST SP 800-53 Rev 5 — Security and Privacy Controls
 * - ISO/IEC 27001:2022 — Information security management
 * - RFC 7519 — JSON Web Token (JWT)
 * - RFC 6585 — Additional HTTP Status Codes (429)
 *
 * @module shms-auth-middleware
 * @version 1.0.0
 * @cycle C188
 * @phase 4.4
 */

import type { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { createLogger } from '../_core/logger.js';
import {
  authenticateTenant,
  checkRateLimit,
  logGatewayRequest,
  generateRequestId,
  buildGatewayHeaders,
  buildUnauthorizedResponse,
  buildRateLimitResponse,
  type TenantContext,
} from './shms-api-gateway-saas.js';

const logger = createLogger('shms-auth-middleware');

// ─── Augment Express Request with tenant context ──────────────────────────────

declare global {
  namespace Express {
    interface Request {
      tenantContext?: TenantContext;
      requestId?: string;
    }
  }
}

// ─── SHMS API Key Authentication Middleware ───────────────────────────────────

/**
 * Middleware that validates X-API-Key header and attaches TenantContext.
 *
 * Routes protected: /api/shms/analyze, /api/shms/twin-state, /api/shms/alerts
 * Routes exempt: /api/shms/calibration (public documentation endpoint)
 *
 * Security: NIST SP 800-53 Rev 5 — IA-2 (Identification and Authentication)
 */
export async function shmsApiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const requestId = generateRequestId();
  req.requestId = requestId;

  // Skip auth for public endpoints
  const PUBLIC_PATHS = ['/api/shms/calibration', '/api/latency/report'];
  if (PUBLIC_PATHS.some(p => req.path.startsWith(p))) {
    next();
    return;
  }

  const apiKey = req.headers['x-api-key'] as string | undefined;

  if (!apiKey) {
    logger.warn(`[Auth] Missing X-API-Key header — requestId=${requestId} path=${req.path}`);
    const unauthorized = buildUnauthorizedResponse(requestId);
    res.status(401).set(unauthorized.headers).json(unauthorized.body);
    return;
  }

  // Authenticate tenant
  const tenant = await authenticateTenant(apiKey);
  if (!tenant) {
    logger.warn(`[Auth] Invalid API key — requestId=${requestId} path=${req.path}`);
    const unauthorized = buildUnauthorizedResponse(requestId);
    res.status(401).set(unauthorized.headers).json(unauthorized.body);
    return;
  }

  // Check rate limit
  const rateCheck = checkRateLimit(tenant.clientId, tenant.rateLimitPerMinute);
  if (!rateCheck.allowed) {
    logger.warn(`[Auth] Rate limit exceeded — clientId=${tenant.clientId} requestId=${requestId}`);
    const rateLimitResp = buildRateLimitResponse(rateCheck.state, requestId);
    res.status(429).set(rateLimitResp.headers).json(rateLimitResp.body);
    return;
  }

  // Attach tenant context and gateway headers
  req.tenantContext = tenant;
  const gatewayHeaders = buildGatewayHeaders(rateCheck.state, requestId);
  Object.entries(gatewayHeaders).forEach(([k, v]) => res.setHeader(k, v));

  // Log request asynchronously (non-blocking)
  // Note: logGatewayRequest requires (request, response, tenantContext)
  // We log at response finish to capture status code and duration
  const authStartMs = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - authStartMs;
    const gatewayReq = {
      method: req.method,
      path: req.path,
      clientId: tenant.clientId,
      apiKey: apiKey.slice(0, 8) + '***',
      body: req.body,
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([k, v]) => [k, String(v)])
      ),
      timestamp: new Date().toISOString(),
      requestId,
    };
    const gatewayResp = {
      statusCode: res.statusCode,
      body: {},
      headers: {},
      duration,
      requestId,
    };
    logGatewayRequest(gatewayReq, gatewayResp, tenant)
      .catch(err => logger.error('[Auth] Failed to log gateway request:', err));
  });

  logger.info(`[Auth] Authenticated — clientId=${tenant.clientId} plan=${tenant.plan} requestId=${requestId}`);
  next();
}

// ─── Billing Usage Tracker ────────────────────────────────────────────────────

/**
 * Middleware that tracks API usage for billing purposes.
 * Records each successful SHMS analyze call for monthly invoice generation.
 *
 * Scientific basis: SaaS Metrics 2.0 (David Skok, 2010) — usage-based billing
 */
export function shmsUsageTracker(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startMs = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startMs;
    const tenant = req.tenantContext;
    if (!tenant) return;

    // Only track successful analyze calls for billing
    if (req.path === '/api/shms/analyze' && res.statusCode === 200) {
      logger.info(
        `[Billing] Usage recorded — clientId=${tenant.clientId} ` +
        `plan=${tenant.plan} durationMs=${durationMs} ` +
        `requestId=${req.requestId}`
      );
      // In production: insert usage record into billing_usage table
      // For Phase 4 (synthetic data): log only, no DB write
    }
  });

  next();
}

// ─── SHMS API Key Generation Utility ─────────────────────────────────────────

/**
 * Generate a cryptographically secure SHMS API key.
 * Format: shms_<32-byte-hex>
 *
 * Security: NIST SP 800-132 — PBKDF recommendation for key derivation
 */
export function generateSHMSApiKey(): string {
  return `shms_${randomBytes(32).toString('hex')}`;
}

// ─── Health Check (no auth required) ─────────────────────────────────────────

/**
 * Returns API health status without requiring authentication.
 * Used by Cloud Run health checks and uptime monitors.
 */
export function shmsHealthCheck(req: Request, res: Response): void {
  res.json({
    ok: true,
    service: 'SHMS API',
    version: '1.0.0',
    cycle: 'C188',
    phase: '4.4',
    timestamp: new Date().toISOString(),
    authentication: 'X-API-Key header required for protected endpoints',
    publicEndpoints: ['/api/shms/calibration', '/api/latency/report', '/api/shms/health'],
  });
}
