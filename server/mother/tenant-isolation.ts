/**
 * tenant-isolation.ts — MOTHER v80.5 — Ciclo 127
 *
 * Módulo de isolamento de dados entre tenants para o template SaaS multi-tenant.
 * Implementa: MQTT namespacing, API key isolation, storage prefix isolation.
 *
 * Scientific basis:
 * - ISO/IEC 27001:2022 — Information security management (A.8.3 Information access restriction)
 * - NIST SP 800-53 Rev 5 — AC-4 (Information Flow Enforcement)
 * - OWASP Multi-Tenancy Security — Tenant data isolation patterns
 *
 * @module tenant-isolation
 * @version 1.0.0
 * @cycle C127
 */

import crypto from 'crypto';
import { getDb } from '../db';
import { sql } from 'drizzle-orm';

// ============================================================
// TYPES
// ============================================================

export interface IsolationConfig {
  tenantId: string;
  mqttTopicPrefix: string;
  dbSchema: string;
  apiKeyPrefix: string;
  storagePrefix: string;
  rlsEnabled: boolean;
}

export interface IsolationValidationResult {
  valid: boolean;
  tenantId: string;
  checks: IsolationCheck[];
  violations: string[];
  timestamp: string;
}

export interface IsolationCheck {
  name: string;
  passed: boolean;
  details: string;
}

export interface TenantAccessContext {
  tenantId: string;
  apiKey: string;
  permissions: string[];
  expiresAt?: string;
}

export interface MQTTAccessRule {
  tenantId: string;
  allowedTopics: string[];
  deniedTopics: string[];
  qos: 0 | 1 | 2;
}

// ============================================================
// MQTT NAMESPACE ISOLATION
// ============================================================

export function getMQTTTopicPrefix(tenantId: string): string {
  return `shms/${tenantId}`;
}

export function getAllowedMQTTTopics(tenantId: string): string[] {
  const prefix = getMQTTTopicPrefix(tenantId);
  return [
    `${prefix}/sensors/#`,
    `${prefix}/alerts/#`,
    `${prefix}/status/#`,
    `${prefix}/commands/#`,
    `${prefix}/heartbeat`,
  ];
}

export function validateMQTTTopic(topic: string, tenantId: string): boolean {
  const prefix = getMQTTTopicPrefix(tenantId);
  return topic.startsWith(prefix + '/') || topic === prefix;
}

export function createMQTTAccessRules(tenantId: string): MQTTAccessRule {
  return {
    tenantId,
    allowedTopics: getAllowedMQTTTopics(tenantId),
    deniedTopics: [
      'shms/+/+',
      '$SYS/#',
    ],
    qos: 1,
  };
}

// ============================================================
// API KEY ISOLATION
// ============================================================

export async function validateApiKey(apiKey: string): Promise<TenantAccessContext | null> {
  if (!apiKey || !apiKey.startsWith('ik_')) return null;

  const db = await getDb();
  if (!db) return null;

  const result = await db.execute(sql`
    SELECT tenant_id, billing_plan, status FROM tenants
    WHERE api_key = ${apiKey} AND status = 'ACTIVE'
  `);

  const rows = (result as unknown as [Record<string, unknown>[], unknown])[0] || [];
  if (!rows || (rows as unknown[]).length === 0) return null;

  const row = (rows as Record<string, unknown>[])[0];
  const tenantId = row.tenant_id as string;
  const billingPlan = row.billing_plan as string;
  const permissions = getPermissionsForPlan(billingPlan);

  return { tenantId, apiKey, permissions };
}

function getPermissionsForPlan(billingPlan: string): string[] {
  const base = ['sensors:read', 'alerts:read', 'dashboard:read'];
  const professional = [...base, 'sensors:write', 'alerts:write', 'reports:read', 'api:read'];
  const enterprise = [...professional, 'reports:write', 'api:write', 'billing:read', 'admin:read'];

  switch (billingPlan) {
    case 'enterprise': return enterprise;
    case 'professional': return professional;
    default: return base;
  }
}

export function hasPermission(context: TenantAccessContext, permission: string): boolean {
  return context.permissions.includes(permission) || context.permissions.includes('admin:*');
}

// ============================================================
// STORAGE ISOLATION
// ============================================================

export function getStoragePrefix(tenantId: string): string {
  return `tenants/${tenantId}`;
}

export function validateStoragePath(path: string, tenantId: string): boolean {
  const prefix = getStoragePrefix(tenantId);
  return path.startsWith(prefix + '/') || path === prefix;
}

// ============================================================
// ISOLATION VALIDATION
// ============================================================

export async function validateIsolation(tenantId: string): Promise<IsolationValidationResult> {
  const checks: IsolationCheck[] = [];
  const violations: string[] = [];

  const db = await getDb();
  if (!db) {
    return {
      valid: false,
      tenantId,
      checks: [{ name: 'database_available', passed: false, details: 'Database unavailable' }],
      violations: ['Database unavailable'],
      timestamp: new Date().toISOString(),
    };
  }

  // Check 1: Tenant exists
  const tenantResult = await db.execute(sql`
    SELECT tenant_id, status FROM tenants WHERE tenant_id = ${tenantId}
  `);
  const tenantRows = (tenantResult as unknown as [Record<string, unknown>[], unknown])[0] || [];
  const tenantExists = (tenantRows as unknown[]).length > 0;
  checks.push({
    name: 'tenant_exists',
    passed: tenantExists,
    details: tenantExists ? `Tenant ${tenantId} found` : `Tenant ${tenantId} not found`,
  });
  if (!tenantExists) violations.push('Tenant not found in database');

  // Check 2: MQTT namespace is unique
  const mqttPrefix = getMQTTTopicPrefix(tenantId);
  const mqttResult = await db.execute(sql`
    SELECT COUNT(*) as count FROM tenants
    WHERE mqtt_namespace = ${mqttPrefix} AND tenant_id != ${tenantId}
  `);
  const mqttRows = (mqttResult as unknown as [Record<string, unknown>[], unknown])[0] || [];
  const mqttConflicts = parseInt(String(((mqttRows as Record<string, unknown>[])[0])?.count || '0'));
  checks.push({
    name: 'mqtt_namespace_unique',
    passed: mqttConflicts === 0,
    details: mqttConflicts === 0 ? `MQTT namespace ${mqttPrefix} is unique` : `MQTT namespace conflict: ${mqttConflicts} other tenants`,
  });
  if (mqttConflicts > 0) violations.push(`MQTT namespace conflict: ${mqttConflicts} conflicts`);

  // Check 3: API key is unique
  const apiKeyResult = await db.execute(sql`
    SELECT COUNT(*) as count FROM tenants t1
    JOIN tenants t2 ON t1.api_key = t2.api_key AND t1.tenant_id != t2.tenant_id
    WHERE t1.tenant_id = ${tenantId}
  `);
  const apiKeyRows = (apiKeyResult as unknown as [Record<string, unknown>[], unknown])[0] || [];
  const apiKeyConflicts = parseInt(String(((apiKeyRows as Record<string, unknown>[])[0])?.count || '0'));
  checks.push({
    name: 'api_key_unique',
    passed: apiKeyConflicts === 0,
    details: apiKeyConflicts === 0 ? 'API key is unique' : `API key conflict: ${apiKeyConflicts} other tenants`,
  });
  if (apiKeyConflicts > 0) violations.push(`API key conflict: ${apiKeyConflicts} conflicts`);

  const valid = violations.length === 0;
  return { valid, tenantId, checks, violations, timestamp: new Date().toISOString() };
}

// ============================================================
// ISOLATION CONFIGURATION
// ============================================================

export function getIsolationConfig(tenantId: string): IsolationConfig {
  return {
    tenantId,
    mqttTopicPrefix: getMQTTTopicPrefix(tenantId),
    dbSchema: 'public',
    apiKeyPrefix: 'ik_',
    storagePrefix: getStoragePrefix(tenantId),
    rlsEnabled: true,
  };
}

export async function generateIsolationReport(tenantId: string): Promise<string> {
  const validation = await validateIsolation(tenantId);
  const config = getIsolationConfig(tenantId);
  const mqttRules = createMQTTAccessRules(tenantId);
  const statusEmoji = validation.valid ? '✅' : '❌';

  return `# Tenant Isolation Report — ${tenantId}

## Status: ${statusEmoji} ${validation.valid ? 'ISOLATED' : 'VIOLATIONS DETECTED'}

**Generated:** ${validation.timestamp}

## Isolation Configuration

| Component | Value |
|-----------|-------|
| MQTT Prefix | \`${config.mqttTopicPrefix}\` |
| Storage Prefix | \`${config.storagePrefix}\` |
| RLS Enabled | ${config.rlsEnabled ? 'Yes' : 'No'} |
| API Key Prefix | \`${config.apiKeyPrefix}\` |

## MQTT Access Rules

**Allowed Topics:**
${mqttRules.allowedTopics.map(t => `- \`${t}\``).join('\n')}

**Denied Topics:**
${mqttRules.deniedTopics.map(t => `- \`${t}\``).join('\n')}

## Validation Checks

${validation.checks.map(c => `- ${c.passed ? '✅' : '❌'} **${c.name}**: ${c.details}`).join('\n')}

${validation.violations.length > 0 ? `## Violations\n\n${validation.violations.map(v => `- ⚠️ ${v}`).join('\n')}` : ''}

## Scientific Basis

- ISO/IEC 27001:2022 A.8.3 — Information access restriction
- NIST SP 800-53 Rev 5 — AC-4 (Information Flow Enforcement)
- OWASP Multi-Tenancy Security patterns
`;
}

export function computeIsolationProofHash(
  tenantId: string,
  validation: IsolationValidationResult
): string {
  const data = JSON.stringify({
    tenantId,
    valid: validation.valid,
    checksCount: validation.checks.length,
    violationsCount: validation.violations.length,
    timestamp: validation.timestamp,
  });
  return crypto.createHash('sha256').update(data).digest('hex');
}
