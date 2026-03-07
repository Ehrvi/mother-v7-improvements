/**
 * auth-router.ts — MOTHER v81.8 — Ciclo 189
 *
 * Authentication middleware and routes extracted from a2a-server.ts.
 * Part of NC-ARCH-002 resolution: decomposing God Object a2a-server.ts (2.268L).
 *
 * Scientific basis:
 * - Conselho C188 Seção 5.4 — NC-ARCH-002 God Object decomposition
 * - NIST SP 800-53 Rev 5 — IA-2: Identification and Authentication
 * - RFC 7519 — JSON Web Token (JWT)
 * - ISO/IEC 27001:2022 — A.9.4 System and application access control
 *
 * @module auth-router
 * @version 1.0.0
 * @cycle C189
 * @council C188 — NC-ARCH-002 resolution
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { createLogger } from '../logger.js';

const log = createLogger('auth-router');

export const authRouter = Router();

/**
 * A2A Authentication middleware.
 * Validates Bearer token from MANUS_A2A_TOKEN env var.
 * Dev mode: if MANUS_A2A_TOKEN is not set, all requests are allowed.
 *
 * Scientific basis: NIST SP 800-53 Rev 5 — IA-2
 */
export function authenticateA2A(req: Request, res: Response, next: NextFunction): void {
  const token = process.env.MANUS_A2A_TOKEN;
  if (!token) {
    // Dev mode: no token configured, allow all
    next();
    return;
  }

  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${token}`) {
    log.warn(`[AuthRouter] Unauthorized request from ${req.ip} — ${req.method} ${req.path}`);
    res.status(401).json({ error: 'Unauthorized — invalid or missing A2A token' });
    return;
  }

  next();
}

/**
 * GET /auth/health — Auth service health check (no auth required)
 */
authRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    authMode: process.env.MANUS_A2A_TOKEN ? 'bearer_token' : 'dev_mode_open',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /auth/status — Returns current auth configuration status
 */
authRouter.get('/status', authenticateA2A, (_req: Request, res: Response) => {
  res.json({
    authenticated: true,
    tokenConfigured: !!process.env.MANUS_A2A_TOKEN,
    jwtSecretConfigured: !!process.env.JWT_SECRET,
    timestamp: new Date().toISOString(),
  });
});
