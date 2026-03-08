// File: server/_core/cors-config.ts
// Fix NC-001: CORS Whitelist

/**
 * CORS Configuration for MOTHER v82.4
 * 
 * Fix NC-001: Substituir wildcard '*' por whitelist de origens permitidas
 * 
 * Referências científicas:
 * - OWASP CORS Cheat Sheet 2024 (https://owasp.org/www-community/attacks/CORS_OriginHeaderScrutiny)
 * - RFC 6454: The Web Origin Concept (https://tools.ietf.org/html/rfc6454)
 * - OWASP Top 10 2021: A01 Broken Access Control
 * - NIST SP 800-95: Guide to Secure Web Services
 */

import cors from 'cors';
import { Request, Response, NextFunction } from 'express';

// Origens permitidas por ambiente
const ALLOWED_ORIGINS: Record<string, string[]> = {
  development: [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
  ],
  staging: [
    'https://mother-staging.web.app',
    'https://mother-staging-qtvghovzxa-ts.a.run.app',
  ],
  production: [
    'https://mother-interface-qtvghovzxa-ts.a.run.app',
    'https://mother.intelltech.com.br',
    'https://shms.intelltech.com.br',
    'https://dashboard.intelltech.com.br',
  ],
};

// Padrões regex para Cloud Run (revisões dinâmicas)
const CLOUD_RUN_PATTERN = /^https:\/\/mother-interface-[a-z0-9]+-ts\.a\.run\.app$/;

/**
 * Verifica se uma origem é permitida
 */
function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) {
    // Requisições server-to-server sem Origin header são permitidas
    return true;
  }

  const env = process.env.NODE_ENV || 'development';
  const allowedForEnv = ALLOWED_ORIGINS[env] || ALLOWED_ORIGINS.development;

  // Verificar lista estática
  if (allowedForEnv.includes(origin)) {
    return true;
  }

  // Verificar padrão Cloud Run (produção)
  if (env === 'production' && CLOUD_RUN_PATTERN.test(origin)) {
    return true;
  }

  return false;
}

/**
 * Configuração CORS com whitelist
 * Substitui o wildcard '*' por validação de origem
 */
export const corsConfig = cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      // Log para auditoria de segurança
      console.warn(`[SECURITY] CORS blocked origin: ${origin}`);
      callback(new Error(`CORS: Origin '${origin}' not in whitelist`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-ID',
    'X-Session-ID',
  ],
  exposedHeaders: ['X-Request-ID', 'X-Rate-Limit-Remaining'],
  credentials: true,
  maxAge: 86400, // 24h cache para preflight
  optionsSuccessStatus: 204,
});

/**
 * Middleware adicional para validação de Origin em endpoints sensíveis
 * Usar em rotas que requerem autenticação
 */
export function strictOriginCheck(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  
  if (!isOriginAllowed(origin)) {
    res.status(403).json({
      error: 'CORS_VIOLATION',
      message: 'Origin not authorized',
      code: 'SEC-001',
    });
    return;
  }
  
  next();
}

// Exportar lista de origens para uso em testes
export { ALLOWED_ORIGINS, isOriginAllowed };
