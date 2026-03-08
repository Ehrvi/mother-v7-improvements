/**
 * CORS Patch Instructions — C195 (NC-001)
 *
 * Documentation-only file — no executable code.
 *
 * BEFORE (NC-001 — VULNERÁVEL):
 *   app.use(cors({ origin: '*' }));
 *   res.setHeader('Access-Control-Allow-Origin', '*');
 *
 * AFTER (Fix NC-001 — OWASP A01:2021):
 *   import { corsConfig } from './cors-config';
 *   app.use(corsConfig);
 *
 * Scientific basis: OWASP A01:2021 — Broken Access Control
 * Status: RESOLVED Sprint 1 (C195) ✅
 */
export const CORS_PATCH_NOTES = {
  nc: 'NC-001',
  status: 'RESOLVED',
  sprint: 'Sprint 1 (C195)',
  reference: 'OWASP A01:2021',
  fix: 'corsConfig whitelist applied in production-entry.ts and shms-api.ts',
} as const;
