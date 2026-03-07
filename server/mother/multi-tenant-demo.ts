/**
 * multi-tenant-demo.ts — DEMO SOFTWARE — NÃO COMERCIAL
 *
 * ⚠️ AVISO IMPORTANTE — DIRETRIZ DO PROPRIETÁRIO (Everton Garcia, Wizards Down Under):
 * ═══════════════════════════════════════════════════════════════════════════════════
 * ESTE MÓDULO É APENAS DEMONSTRAÇÃO (DEMO SOFTWARE).
 * NÃO ESTÁ CONECTADO a nenhum endpoint de produção.
 * NÃO deve ser importado em production-entry.ts ou a2a-server.ts.
 * NÃO deve ser usado para fins comerciais até autorização explícita do proprietário.
 *
 * STATUS: DEMO-ONLY — NÃO CONECTADO (R33 — Ciclo 191)
 * CONEXÃO PLANEJADA: Apenas após MOTHER atingir Score de Maturidade ≥ 75/100
 * ═══════════════════════════════════════════════════════════════════════════════════
 *
 * Conselho C188 Seção 9.4 — Phase 7 — Multi-tenant (3 clientes ativos)
 * Base científica:
 *   - ISO/IEC 27001:2022 — Information security management (A.8.3)
 *   - NIST SP 800-53 Rev 5 — AC-4 (Information Flow Enforcement)
 *   - OWASP Multi-Tenancy Security — Tenant data isolation patterns
 *
 * Função (DEMO): Demonstra a arquitetura multi-tenant para SHMS Geotécnico.
 * Cada tenant (cliente) tem: MQTT namespace isolado, API key própria, storage prefix.
 *
 * @module multi-tenant-demo
 * @version 1.0.0-demo
 * @cycle C191
 * @status DEMO-ONLY — NOT CONNECTED
 * @council C188 Seção 9.4
 */

// ============================================================
// DEMO NOTICE — AVISO DE DEMO
// ============================================================
const DEMO_WARNING = `
⚠️  MULTI-TENANT DEMO — NÃO COMERCIAL
Este módulo é demonstração. MOTHER ainda não tem clientes reais.
Score de maturidade atual: ~52/100 (alvo para comercialização: ≥75/100)
Proprietário: Everton Garcia, Wizards Down Under
`;

export const DEMO_STATUS = {
  isDemo: true,
  isConnected: false,
  commercialReady: false,
  currentMaturityScore: 52,
  targetMaturityScore: 75,
  reason: 'MOTHER ainda é demo software. Comercialização requer Score ≥ 75/100 e aprovação do proprietário.',
  owner: 'Everton Garcia, Wizards Down Under',
  council: 'Conselho C188 Seção 9.4',
} as const;

// ============================================================
// TYPES (DEMO)
// ============================================================

export interface TenantConfig {
  tenantId: string;
  tenantName: string;
  plan: 'starter' | 'professional' | 'enterprise';
  mqttTopicPrefix: string;
  apiKeyPrefix: string;
  storagePrefix: string;
  maxSensors: number;
  createdAt: string;
}

export interface TenantStatus {
  tenantId: string;
  isActive: boolean;
  sensorCount: number;
  lastActivity: string;
  planLimits: {
    maxSensors: number;
    maxAlertsPerDay: number;
    maxApiCallsPerMonth: number;
  };
}

// ============================================================
// DEMO TENANT CONFIGURATIONS (3 clientes fictícios)
// ============================================================

/**
 * Configurações demo de 3 clientes fictícios.
 * Base científica: Conselho C188 Seção 9.4 — 3 clientes ativos como KPI C191
 *
 * ⚠️ DEMO ONLY — Dados fictícios para demonstração da arquitetura.
 */
export const DEMO_TENANTS: TenantConfig[] = [
  {
    tenantId: 'TENANT_DEMO_001',
    tenantName: 'Mineradora Alpha (DEMO)',
    plan: 'professional',
    mqttTopicPrefix: 'shms/tenant_demo_001',
    apiKeyPrefix: 'sk_demo_001_',
    storagePrefix: 'tenant-demo-001/',
    maxSensors: 10,
    createdAt: '2026-03-08T00:00:00Z',
  },
  {
    tenantId: 'TENANT_DEMO_002',
    tenantName: 'Construtora Beta (DEMO)',
    plan: 'starter',
    mqttTopicPrefix: 'shms/tenant_demo_002',
    apiKeyPrefix: 'sk_demo_002_',
    storagePrefix: 'tenant-demo-002/',
    maxSensors: 5,
    createdAt: '2026-03-08T00:00:00Z',
  },
  {
    tenantId: 'TENANT_DEMO_003',
    tenantName: 'Hidrelétrica Gamma (DEMO)',
    plan: 'enterprise',
    mqttTopicPrefix: 'shms/tenant_demo_003',
    apiKeyPrefix: 'sk_demo_003_',
    storagePrefix: 'tenant-demo-003/',
    maxSensors: 50,
    createdAt: '2026-03-08T00:00:00Z',
  },
];

// ============================================================
// DEMO FUNCTIONS (NÃO CONECTADAS)
// ============================================================

/**
 * Retorna configuração de tenant demo.
 * ⚠️ DEMO ONLY — não persiste dados, não usa BD real.
 */
export function getDemoTenantConfig(tenantId: string): TenantConfig | null {
  console.warn(DEMO_WARNING);
  return DEMO_TENANTS.find(t => t.tenantId === tenantId) ?? null;
}

/**
 * Retorna status demo de um tenant.
 * ⚠️ DEMO ONLY — dados sintéticos, não refletem clientes reais.
 */
export function getDemoTenantStatus(tenantId: string): TenantStatus {
  console.warn(DEMO_WARNING);
  const planLimits = {
    starter: { maxSensors: 5, maxAlertsPerDay: 10, maxApiCallsPerMonth: 1000 },
    professional: { maxSensors: 10, maxAlertsPerDay: 50, maxApiCallsPerMonth: 10000 },
    enterprise: { maxSensors: 50, maxAlertsPerDay: 500, maxApiCallsPerMonth: 100000 },
  };
  const tenant = DEMO_TENANTS.find(t => t.tenantId === tenantId);
  const plan = tenant?.plan ?? 'starter';
  return {
    tenantId,
    isActive: true,
    sensorCount: 0, // DEMO — sem sensores reais
    lastActivity: new Date().toISOString(),
    planLimits: planLimits[plan],
  };
}

/**
 * Retorna prefixo MQTT isolado para tenant.
 * ⚠️ DEMO ONLY — não conectado ao broker MQTT real.
 */
export function getDemoMqttTopicPrefix(tenantId: string): string {
  console.warn(DEMO_WARNING);
  return `shms/${tenantId.toLowerCase()}`;
}

/**
 * Lista todos os tenants demo.
 * ⚠️ DEMO ONLY — 3 clientes fictícios.
 */
export function listDemoTenants(): TenantConfig[] {
  console.warn(DEMO_WARNING);
  return DEMO_TENANTS;
}
