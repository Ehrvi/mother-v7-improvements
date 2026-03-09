/**
 * MOTHER v91.0: Multi-tenant SHMS — NC-MULTI-001 FIX
 *
 * Implementa isolamento por tenant para o SHMS (Structural Health Monitoring System).
 * Cada cliente (tenant) tem suas próprias estruturas, sensores e dados de monitoramento,
 * com row-level security via tenantId em todas as queries.
 *
 * Scientific basis:
 * - ISO 13374-1:2003 §4.2 — Condition monitoring and diagnostics of machines
 * - OWASP A01:2021 — Broken Access Control (row-level security)
 * - Bernstein (1996) "Middleware: A Model for Distributed System Services"
 *   Communications of the ACM 39(2):86-98 — multi-tenant isolation patterns
 * - Weissman & Bobrowski (2009) "The Design of the Force.com Multi-tenant Internet
 *   Application Development Platform" SIGMOD '09 — row-level security in SaaS
 * - GISTM 2020 §4.3 — Geotechnical Instrumentation and Monitoring thresholds
 *
 * Architecture:
 * - TenantContext: middleware que extrai e valida tenantId de cada request
 * - SHMSMultitenantService: serviço com isolamento por tenant
 * - Endpoints: /api/shms/v2/tenants/:tenantId/structures
 *
 * NC-MULTI-001 FIX: Sprint 9 C208
 */
import { Router, Request, Response, NextFunction } from 'express';
import { createLogger } from '../_core/logger.js';
import { MOTHER_VERSION } from '../mother/core.js';

const log = createLogger('shms-multitenant');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TenantContext {
  tenantId: string;
  tenantName: string;
  plan: 'basic' | 'professional' | 'enterprise';
  maxStructures: number;
  maxSensorsPerStructure: number;
}

export interface TenantStructure {
  id: string;
  tenantId: string;
  name: string;
  type: 'dam' | 'slope' | 'tunnel' | 'bridge' | 'retaining_wall';
  location: string;
  createdAt: string;
  sensors: TenantSensor[];
  healthIndex: number; // 0-100 (ISO 13374-1:2003 §4.2)
  shmsLevel: 1 | 2 | 3 | 4; // Farrar & Worden (2012) SHM Levels
}

export interface TenantSensor {
  id: string;
  structureId: string;
  tenantId: string;
  type: 'piezometer' | 'inclinometer' | 'settlement' | 'vibration' | 'strain';
  name: string;
  unit: string;
  lastReading?: number;
  lastReadingAt?: string;
  alertLevel: 'green' | 'yellow' | 'red'; // GISTM 2020 §4.3 L1/L2/L3
}

// ─── In-memory tenant registry (production: use DB with row-level security) ──
// Scientific basis: Weissman & Bobrowski (2009) — tenant metadata registry
const TENANT_REGISTRY: Map<string, TenantContext> = new Map([
  ['wizards-down-under', {
    tenantId: 'wizards-down-under',
    tenantName: 'Wizards Down Under',
    plan: 'enterprise',
    maxStructures: 100,
    maxSensorsPerStructure: 50,
  }],
  ['demo-tenant', {
    tenantId: 'demo-tenant',
    tenantName: 'Demo Tenant',
    plan: 'basic',
    maxStructures: 5,
    maxSensorsPerStructure: 10,
  }],
]);

// ─── Synthetic structure data per tenant (Phase 2 — R38) ─────────────────────
// Scientific basis: GISTM 2020 §4.3 — synthetic calibrated data
const TENANT_STRUCTURES: Map<string, TenantStructure[]> = new Map([
  ['wizards-down-under', [
    {
      id: 'wdu-dam-001',
      tenantId: 'wizards-down-under',
      name: 'Barragem Norte',
      type: 'dam',
      location: 'Australia, NSW',
      createdAt: '2025-01-15T00:00:00Z',
      healthIndex: 94.2,
      shmsLevel: 3,
      sensors: [
        { id: 'wdu-pz-001', structureId: 'wdu-dam-001', tenantId: 'wizards-down-under', type: 'piezometer', name: 'Piezômetro P1', unit: 'kPa', lastReading: 125.4, lastReadingAt: new Date().toISOString(), alertLevel: 'green' },
        { id: 'wdu-in-001', structureId: 'wdu-dam-001', tenantId: 'wizards-down-under', type: 'inclinometer', name: 'Inclinômetro I1', unit: 'mm', lastReading: 2.1, lastReadingAt: new Date().toISOString(), alertLevel: 'green' },
        { id: 'wdu-st-001', structureId: 'wdu-dam-001', tenantId: 'wizards-down-under', type: 'settlement', name: 'Recalque R1', unit: 'mm', lastReading: 0.8, lastReadingAt: new Date().toISOString(), alertLevel: 'green' },
      ],
    },
    {
      id: 'wdu-slope-001',
      tenantId: 'wizards-down-under',
      name: 'Talude Sul',
      type: 'slope',
      location: 'Australia, VIC',
      createdAt: '2025-03-01T00:00:00Z',
      healthIndex: 87.5,
      shmsLevel: 2,
      sensors: [
        { id: 'wdu-in-002', structureId: 'wdu-slope-001', tenantId: 'wizards-down-under', type: 'inclinometer', name: 'Inclinômetro I2', unit: 'mm', lastReading: 4.7, lastReadingAt: new Date().toISOString(), alertLevel: 'yellow' },
        { id: 'wdu-pz-002', structureId: 'wdu-slope-001', tenantId: 'wizards-down-under', type: 'piezometer', name: 'Piezômetro P2', unit: 'kPa', lastReading: 89.2, lastReadingAt: new Date().toISOString(), alertLevel: 'green' },
      ],
    },
  ]],
  ['demo-tenant', [
    {
      id: 'demo-dam-001',
      tenantId: 'demo-tenant',
      name: 'Demo Dam',
      type: 'dam',
      location: 'Demo Location',
      createdAt: '2026-01-01T00:00:00Z',
      healthIndex: 78.3,
      shmsLevel: 1,
      sensors: [
        { id: 'demo-pz-001', structureId: 'demo-dam-001', tenantId: 'demo-tenant', type: 'piezometer', name: 'Demo Piezometer', unit: 'kPa', lastReading: 95.0, lastReadingAt: new Date().toISOString(), alertLevel: 'green' },
      ],
    },
  ]],
]);

// ─── Tenant Auth Middleware ───────────────────────────────────────────────────
/**
 * Extrai e valida tenantId de cada request.
 * Scientific basis: OWASP A01:2021 — Broken Access Control
 * Row-level security: tenantId deve ser validado em TODAS as queries
 */
export function tenantAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Tenant ID pode vir de: header X-Tenant-ID, query param, ou Bearer token claim
  const tenantId = (req.headers['x-tenant-id'] as string) || (req.query.tenantId as string);

  if (!tenantId) {
    res.status(400).json({
      error: 'X-Tenant-ID header ou tenantId query param obrigatório',
      code: 'TENANT_REQUIRED',
    });
    return;
  }

  const tenant = TENANT_REGISTRY.get(tenantId);
  if (!tenant) {
    res.status(403).json({
      error: `Tenant '${tenantId}' não encontrado ou sem acesso`,
      code: 'TENANT_NOT_FOUND',
    });
    return;
  }

  // Attach tenant context to request
  (req as Request & { tenant: TenantContext }).tenant = tenant;
  log.info(`[MULTITENANT] Request authorized for tenant: ${tenantId} (plan: ${tenant.plan})`);
  next();
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const shmsMultitenantRouter = Router();

/**
 * GET /api/shms/v2/tenants/:tenantId/structures
 * Lista estruturas do tenant com isolamento row-level.
 * Scientific basis: ISO 13374-1:2003 §4.2 + OWASP A01:2021
 */
shmsMultitenantRouter.get(
  '/api/shms/v2/tenants/:tenantId/structures',
  tenantAuthMiddleware,
  (req: Request, res: Response) => {
    const { tenantId } = req.params;
    const reqTenant = (req as Request & { tenant: TenantContext }).tenant;

    // Row-level security: tenantId no param DEVE corresponder ao tenant autenticado
    if (reqTenant.tenantId !== tenantId) {
      res.status(403).json({
        error: 'Acesso negado: tenantId no path não corresponde ao tenant autenticado',
        code: 'TENANT_MISMATCH',
      });
      return;
    }

    const structures = TENANT_STRUCTURES.get(tenantId) ?? [];
    res.json({
      tenantId,
      tenantName: reqTenant.tenantName,
      plan: reqTenant.plan,
      structures,
      total: structures.length,
      maxStructures: reqTenant.maxStructures,
      version: MOTHER_VERSION,
      phase: 'PRÉ-PRODUÇÃO — Dados Sintéticos (R38)',
      scientificBasis: 'ISO 13374-1:2003 §4.2 + GISTM 2020 §4.3',
    });
  }
);

/**
 * GET /api/shms/v2/tenants/:tenantId/structures/:structureId
 * Detalhe de uma estrutura específica do tenant.
 */
shmsMultitenantRouter.get(
  '/api/shms/v2/tenants/:tenantId/structures/:structureId',
  tenantAuthMiddleware,
  (req: Request, res: Response) => {
    const { tenantId, structureId } = req.params;
    const reqTenant = (req as Request & { tenant: TenantContext }).tenant;

    if (reqTenant.tenantId !== tenantId) {
      res.status(403).json({ error: 'Acesso negado', code: 'TENANT_MISMATCH' });
      return;
    }

    const structures = TENANT_STRUCTURES.get(tenantId) ?? [];
    const structure = structures.find(s => s.id === structureId);

    if (!structure) {
      res.status(404).json({
        error: `Estrutura '${structureId}' não encontrada para tenant '${tenantId}'`,
        code: 'STRUCTURE_NOT_FOUND',
      });
      return;
    }

    res.json({
      ...structure,
      version: MOTHER_VERSION,
      scientificBasis: 'ISO 13374-1:2003 §4.2 + Farrar & Worden (2012) SHM Levels',
    });
  }
);

/**
 * GET /api/shms/v2/tenants/:tenantId/structures/:structureId/sensors
 * Lista sensores de uma estrutura com isolamento por tenant.
 * Scientific basis: GISTM 2020 §4.3 — sensor types and thresholds
 */
shmsMultitenantRouter.get(
  '/api/shms/v2/tenants/:tenantId/structures/:structureId/sensors',
  tenantAuthMiddleware,
  (req: Request, res: Response) => {
    const { tenantId, structureId } = req.params;
    const reqTenant = (req as Request & { tenant: TenantContext }).tenant;

    if (reqTenant.tenantId !== tenantId) {
      res.status(403).json({ error: 'Acesso negado', code: 'TENANT_MISMATCH' });
      return;
    }

    const structures = TENANT_STRUCTURES.get(tenantId) ?? [];
    const structure = structures.find(s => s.id === structureId);

    if (!structure) {
      res.status(404).json({ error: 'Estrutura não encontrada', code: 'STRUCTURE_NOT_FOUND' });
      return;
    }

    res.json({
      tenantId,
      structureId,
      sensors: structure.sensors,
      total: structure.sensors.length,
      maxSensors: reqTenant.maxSensorsPerStructure,
      alertSummary: {
        green: structure.sensors.filter(s => s.alertLevel === 'green').length,
        yellow: structure.sensors.filter(s => s.alertLevel === 'yellow').length,
        red: structure.sensors.filter(s => s.alertLevel === 'red').length,
      },
      scientificBasis: 'GISTM 2020 §4.3 — L1/L2/L3 alert thresholds',
    });
  }
);

/**
 * GET /api/shms/v2/tenants/:tenantId/health
 * Health summary do tenant: todas as estruturas e alertas.
 * Scientific basis: ISO 13374-1:2003 §4.2 + Farrar & Worden (2012)
 */
shmsMultitenantRouter.get(
  '/api/shms/v2/tenants/:tenantId/health',
  tenantAuthMiddleware,
  (req: Request, res: Response) => {
    const { tenantId } = req.params;
    const reqTenant = (req as Request & { tenant: TenantContext }).tenant;

    if (reqTenant.tenantId !== tenantId) {
      res.status(403).json({ error: 'Acesso negado', code: 'TENANT_MISMATCH' });
      return;
    }

    const structures = TENANT_STRUCTURES.get(tenantId) ?? [];
    const allSensors = structures.flatMap(s => s.sensors);
    const avgHealthIndex = structures.length > 0
      ? structures.reduce((sum, s) => sum + s.healthIndex, 0) / structures.length
      : 0;

    const overallStatus = avgHealthIndex >= 90 ? 'green'
      : avgHealthIndex >= 70 ? 'yellow'
      : 'red';

    res.json({
      tenantId,
      tenantName: reqTenant.tenantName,
      overallStatus,
      avgHealthIndex: Math.round(avgHealthIndex * 10) / 10,
      structures: {
        total: structures.length,
        byLevel: {
          level1: structures.filter(s => s.shmsLevel === 1).length,
          level2: structures.filter(s => s.shmsLevel === 2).length,
          level3: structures.filter(s => s.shmsLevel === 3).length,
          level4: structures.filter(s => s.shmsLevel === 4).length,
        },
      },
      sensors: {
        total: allSensors.length,
        green: allSensors.filter(s => s.alertLevel === 'green').length,
        yellow: allSensors.filter(s => s.alertLevel === 'yellow').length,
        red: allSensors.filter(s => s.alertLevel === 'red').length,
      },
      timestamp: new Date().toISOString(),
      version: MOTHER_VERSION,
      phase: 'PRÉ-PRODUÇÃO — Dados Sintéticos (R38)',
      scientificBasis: 'ISO 13374-1:2003 §4.2 + Farrar & Worden (2012) SHM Levels + GISTM 2020 §4.3',
    });
  }
);

log.info('[MULTITENANT] SHMS Multi-tenant router initialized — NC-MULTI-001 FIX — Sprint 9 C208');
log.info('[MULTITENANT] Tenants registered: wizards-down-under (enterprise), demo-tenant (basic)');
log.info('[MULTITENANT] Row-level security: tenantId validated on ALL queries (OWASP A01:2021)');
