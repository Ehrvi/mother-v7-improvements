// File: server/shms/shms-alerts-endpoint.ts
// Sprint 2 — C195-3 — MOTHER v82.4 — Ciclo 195

/**
 * SHMS Alerts Endpoint — GET /api/shms/v2/alerts/:structureId
 *
 * Referências científicas:
 * - ICOLD Bulletin 158 (2014) §4.3: Real-time monitoring — historical alert analysis
 * - GISTM 2020 §8.2: Tailings dam monitoring — alert classification
 * - Roy Fielding (2000): REST — Architectural Styles and the Design of Network-based Software
 * - ISO/IEC 25010:2011: Software quality — usability and functional suitability
 * - OpenAPI 3.0 Specification (OAS3): https://spec.openapis.org/oas/v3.0.3
 *
 * R38 — MANDATÓRIO: Dados sintéticos em pré-produção. Sem dados reais de sensores.
 */

import { Router, Request, Response } from 'express';

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface SHMSAlert {
  id: string;
  structureId: string;
  sensorId: string;
  sensorType: 'piezometer' | 'inclinometer' | 'settlement' | 'seismic' | 'water_level';
  level: 'L1' | 'L2' | 'L3';
  value: number;
  threshold: number;
  unit: string;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  zone: string;
}

export interface AlertsQueryParams {
  level?: 'L1' | 'L2' | 'L3' | 'YELLOW' | 'RED';  // YELLOW=L1+L2, RED=L3
  hours?: number;
  acknowledged?: boolean;
  limit?: number;
  offset?: number;
}

export interface AlertsResponse {
  structureId: string;
  alerts: SHMSAlert[];
  total: number;
  filtered: number;
  queryParams: AlertsQueryParams;
  generatedAt: Date;
  dataSource: 'synthetic' | 'real';  // R38: sempre 'synthetic' em pré-produção
  icoldReference: string;
}

// ─── Dados sintéticos calibrados (R38 — PRÉ-PRODUÇÃO) ────────────────────────
// Alertas históricos sintéticos baseados em ICOLD Bulletin 158 thresholds
const SYNTHETIC_ALERTS: SHMSAlert[] = [
  {
    id: 'alert-001',
    structureId: 'STRUCTURE_001',
    sensorId: 'PIZ-002',
    sensorType: 'piezometer',
    level: 'L1',
    value: 1.35,
    threshold: 1.0,
    unit: 'bar',
    message: 'PIZ-002: piezometer = 1.35bar (L1 — ATENÇÃO)',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h atrás
    acknowledged: false,
    zone: 'downstream',
  },
  {
    id: 'alert-002',
    structureId: 'STRUCTURE_002',
    sensorId: 'INC-001',
    sensorType: 'inclinometer',
    level: 'L2',
    value: 1.25,
    threshold: 1.0,
    unit: 'degrees',
    message: 'INC-001: inclinometer = 1.25° (L2 — ALERTA)',
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4h atrás
    acknowledged: false,
    zone: 'crest',
  },
  {
    id: 'alert-003',
    structureId: 'STRUCTURE_003',
    sensorId: 'SET-001',
    sensorType: 'settlement',
    level: 'L3',
    value: 52.3,
    threshold: 50.0,
    unit: 'mm',
    message: 'SET-001: settlement = 52.3mm (L3 — EMERGÊNCIA)',
    timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6h atrás
    acknowledged: true,
    acknowledgedBy: 'engineer@intelltech.com.br',
    acknowledgedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
    zone: 'foundation',
  },
  {
    id: 'alert-004',
    structureId: 'STRUCTURE_001',
    sensorId: 'PIZ-003',
    sensorType: 'piezometer',
    level: 'L2',
    value: 2.15,
    threshold: 2.0,
    unit: 'bar',
    message: 'PIZ-003: piezometer = 2.15bar (L2 — ALERTA)',
    timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000), // 8h atrás
    acknowledged: false,
    zone: 'upstream',
  },
  {
    id: 'alert-005',
    structureId: 'STRUCTURE_001',
    sensorId: 'WL-001',
    sensorType: 'water_level',
    level: 'L1',
    value: 0.35,
    threshold: 0.3,
    unit: 'm',
    message: 'WL-001: water_level = 0.35m (L1 — ATENÇÃO)',
    timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12h atrás
    acknowledged: true,
    acknowledgedBy: 'operator@intelltech.com.br',
    acknowledgedAt: new Date(Date.now() - 11 * 60 * 60 * 1000),
    zone: 'reservoir',
  },
  // Alertas de 48h atrás (para testar filtro de horas)
  {
    id: 'alert-006',
    structureId: 'STRUCTURE_001',
    sensorId: 'PIZ-001',
    sensorType: 'piezometer',
    level: 'L1',
    value: 1.05,
    threshold: 1.0,
    unit: 'bar',
    message: 'PIZ-001: piezometer = 1.05bar (L1 — ATENÇÃO)',
    timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48h atrás
    acknowledged: true,
    acknowledgedBy: 'engineer@intelltech.com.br',
    acknowledgedAt: new Date(Date.now() - 47 * 60 * 60 * 1000),
    zone: 'upstream',
  },
];

// ─── Serviço de alertas ───────────────────────────────────────────────────────
export function queryAlerts(
  structureId: string,
  params: AlertsQueryParams,
): { alerts: SHMSAlert[]; total: number } {
  const {
    level,
    hours = 24,
    acknowledged,
    limit = 50,
    offset = 0,
  } = params;

  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  // Filtrar por structureId e janela temporal
  let filtered = SYNTHETIC_ALERTS.filter(
    a => a.structureId === structureId && a.timestamp >= since,
  );

  // Filtrar por nível ICOLD
  if (level) {
    if (level === 'YELLOW') {
      // YELLOW = L1 + L2 (atenção + alerta)
      filtered = filtered.filter(a => a.level === 'L1' || a.level === 'L2');
    } else if (level === 'RED') {
      // RED = L3 (emergência)
      filtered = filtered.filter(a => a.level === 'L3');
    } else {
      filtered = filtered.filter(a => a.level === level);
    }
  }

  // Filtrar por acknowledged
  if (acknowledged !== undefined) {
    filtered = filtered.filter(a => a.acknowledged === acknowledged);
  }

  // Ordenar por timestamp DESC (mais recente primeiro)
  filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const total = filtered.length;

  // Paginação
  const paginated = filtered.slice(offset, offset + limit);

  return { alerts: paginated, total };
}

// ─── Router Express ───────────────────────────────────────────────────────────
export const shmsAlertsRouter = Router();

/**
 * GET /api/shms/v2/alerts/:structureId
 *
 * Lista alertas históricos de uma estrutura
 *
 * Query params:
 * - level: L1 | L2 | L3 | YELLOW | RED (opcional)
 * - hours: número de horas retroativas (padrão: 24)
 * - acknowledged: true | false (opcional)
 * - limit: máximo de resultados (padrão: 50, máx: 200)
 * - offset: paginação (padrão: 0)
 *
 * Referência: ICOLD Bulletin 158 §4.3 — Historical alert analysis
 */
shmsAlertsRouter.get('/v2/alerts/:structureId', (req: Request, res: Response) => {
  const { structureId } = req.params;

  // Validar structureId
  if (!structureId || !/^[A-Z0-9_-]+$/.test(structureId)) {
    return res.status(400).json({
      error: 'INVALID_STRUCTURE_ID',
      message: 'structureId must contain only uppercase letters, numbers, underscores and hyphens',
      code: 'SHMS-001',
    });
  }

  // Parsear e validar query params
  const rawLevel = req.query.level as string | undefined;
  const validLevels = ['L1', 'L2', 'L3', 'YELLOW', 'RED'];
  if (rawLevel && !validLevels.includes(rawLevel)) {
    return res.status(400).json({
      error: 'INVALID_LEVEL',
      message: `level must be one of: ${validLevels.join(', ')}`,
      code: 'SHMS-002',
    });
  }

  const hours = parseInt(req.query.hours as string || '24', 10);
  if (isNaN(hours) || hours < 1 || hours > 8760) { // máx 1 ano
    return res.status(400).json({
      error: 'INVALID_HOURS',
      message: 'hours must be between 1 and 8760',
      code: 'SHMS-003',
    });
  }

  const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 200);
  const offset = parseInt(req.query.offset as string || '0', 10);

  let acknowledged: boolean | undefined;
  if (req.query.acknowledged !== undefined) {
    acknowledged = req.query.acknowledged === 'true';
  }

  const params: AlertsQueryParams = {
    level: rawLevel as AlertsQueryParams['level'],
    hours,
    acknowledged,
    limit,
    offset,
  };

  // Executar query
  const { alerts, total } = queryAlerts(structureId, params);

  const response: AlertsResponse = {
    structureId,
    alerts,
    total,
    filtered: alerts.length,
    queryParams: params,
    generatedAt: new Date(),
    dataSource: 'synthetic', // R38: sempre synthetic em pré-produção
    icoldReference: 'ICOLD Bulletin 158 §4.3 — Real-time monitoring requirements',
  };

  // Headers de cache (alertas mudam frequentemente — cache curto)
  res.setHeader('Cache-Control', 'public, max-age=30'); // 30s cache
  res.setHeader('X-Data-Source', 'synthetic-r38');
  res.setHeader('X-ICOLD-Reference', 'Bulletin-158');

  return res.status(200).json(response);
});

/**
 * POST /api/shms/v2/alerts/:structureId/:alertId/acknowledge
 *
 * Reconhecer um alerta
 * Referência: ICOLD Bulletin 158 §4.3 — Alert acknowledgment workflow
 */
shmsAlertsRouter.post('/v2/alerts/:structureId/:alertId/acknowledge', (req: Request, res: Response) => {
  const { structureId, alertId } = req.params;
  const { acknowledgedBy } = req.body;

  if (!acknowledgedBy) {
    return res.status(400).json({
      error: 'MISSING_ACKNOWLEDGED_BY',
      message: 'acknowledgedBy is required',
      code: 'SHMS-004',
    });
  }

  // Encontrar alerta (em produção: atualizar no TimescaleDB)
  const alert = SYNTHETIC_ALERTS.find(
    a => a.id === alertId && a.structureId === structureId,
  );

  if (!alert) {
    return res.status(404).json({
      error: 'ALERT_NOT_FOUND',
      message: `Alert ${alertId} not found for structure ${structureId}`,
      code: 'SHMS-005',
    });
  }

  if (alert.acknowledged) {
    return res.status(409).json({
      error: 'ALREADY_ACKNOWLEDGED',
      message: `Alert ${alertId} was already acknowledged by ${alert.acknowledgedBy}`,
      code: 'SHMS-006',
    });
  }

  // Atualizar (em memória — em produção: TimescaleDB UPDATE)
  alert.acknowledged = true;
  alert.acknowledgedBy = acknowledgedBy;
  alert.acknowledgedAt = new Date();

  return res.status(200).json({
    success: true,
    alertId,
    acknowledgedBy,
    acknowledgedAt: alert.acknowledgedAt,
    message: `Alert ${alertId} acknowledged successfully`,
  });
});

export { SYNTHETIC_ALERTS };
