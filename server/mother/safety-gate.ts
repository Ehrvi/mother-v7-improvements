/**
 * MOTHER v79.0: Safety Gate — NC-SAFETY-001
 *
 * Constitutional safety layer for MOTHER's self-modification capabilities.
 * Every code write, patch, or commit must pass through this gate before execution.
 *
 * Scientific basis:
 * - Constitutional AI (Bai et al., arXiv:2212.08073, 2022): AI systems that follow
 *   a set of principles to avoid harmful outputs. Applied here to code generation.
 * - Darwin Gödel Machine (Sakana AI, arXiv:2505.22954, 2025): Empirical validation
 *   via benchmarks replaces formal proofs. Safety gates are the pre-validation layer.
 * - SWE-agent (Yang et al., arXiv:2405.15793, 2024): Agent-Computer Interfaces require
 *   strict path validation to prevent unintended filesystem modifications.
 *
 * Rules:
 * R1: FORBIDDEN_PATHS — files that MOTHER can NEVER modify autonomously
 * R2: MAX_FILE_SIZE — maximum 300 lines per file created by agent
 * R3: NO_ENV_MODIFICATION — no changes to environment variables or secrets
 * R4: WHITELISTED_PATHS_ONLY — only paths in WRITABLE_PATHS can be modified
 * R5: SANDBOX_FIRST — all code must pass sandbox test before commit
 * R6: MAX_ITERATIONS — hard limit of 5 iterations per agent task
 * R7: AUDIT_LOG — every action is logged with timestamp, task, and result
 *
 * Ciclo 107 — Fase 1: Safety gate for Milestone Zero (MOTHER writes first code)
 */

import { createLogger } from '../_core/logger';
const log = createLogger('SafetyGate');

// ============================================================
// CONSTANTS
// ============================================================

/**
 * Paths that MOTHER can NEVER modify, even with creator permission.
 * These are the core infrastructure files that define MOTHER's identity.
 */
export const FORBIDDEN_PATHS = [
  '.env',
  '.env.production',
  '.env.local',
  'secrets/',
  'cloudbuild.yaml',
  'Dockerfile',
  'drizzle/schema',
  'server/_core/trpc.ts',
  'server/_core/index.ts',
  'server/db.ts',
  'server/mother/safety-gate.ts',  // Safety gate cannot modify itself
  'server/mother/core-orchestrator.ts',  // Core pipeline protected
  'server/mother/core.ts',
];

/**
 * Paths where MOTHER can write code autonomously.
 * All paths are relative to project root.
 */
export const WRITABLE_PATHS = [
  'server/mother/',
  'server/routers/',
  'subprojects/',
  'tests/',
  'scripts/',
];

/**
 * Maximum lines per file created by agent (R2).
 * Prevents runaway code generation.
 */
export const MAX_FILE_LINES = 300;

/**
 * Maximum iterations per agent task (R6).
 * Hard limit to prevent infinite loops.
 */
export const MAX_AGENT_ITERATIONS = 5;

// ============================================================
// TYPES
// ============================================================

export interface SafetyCheckResult {
  allowed: boolean;
  violations: string[];
  warnings: string[];
}

export interface AgentAuditEntry {
  timestamp: string;
  taskId: string;
  action: string;
  filePath?: string;
  allowed: boolean;
  violations: string[];
  result?: 'success' | 'failure' | 'pending';
  commitHash?: string;
  iterationCount?: number;
}

// ============================================================
// SAFETY CHECK FUNCTIONS
// ============================================================

/**
 * Check if a file path is forbidden (R1).
 */
export function isForbiddenPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return FORBIDDEN_PATHS.some(forbidden => {
    const normalizedForbidden = forbidden.replace(/^\/+/, '');
    return normalized === normalizedForbidden ||
           normalized.startsWith(normalizedForbidden) ||
           normalized.includes('/' + normalizedForbidden);
  });
}

/**
 * Check if a file path is in the writable whitelist (R4).
 */
export function isWritablePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return WRITABLE_PATHS.some(allowed => normalized.startsWith(allowed));
}

/**
 * Check if code content exceeds maximum size (R2).
 */
export function isWithinSizeLimit(content: string): boolean {
  const lines = content.split('\n').length;
  return lines <= MAX_FILE_LINES;
}

/**
 * Check if content contains environment variable modifications (R3).
 */
export function hasEnvModification(content: string): boolean {
  const envPatterns = [
    /process\.env\s*\[.*\]\s*=/,
    /process\.env\.\w+\s*=/,
    /fs\.writeFileSync.*\.env/,
    /writeFile.*\.env/,
  ];
  return envPatterns.some(pattern => pattern.test(content));
}

/**
 * Main safety gate check — runs all rules.
 * Returns allowed=true only if ALL rules pass.
 *
 * @param filePath - Target file path (relative to project root)
 * @param content - File content to write
 * @param taskId - Agent task ID for audit logging
 */
export function checkSafetyGate(
  filePath: string,
  content: string,
  taskId: string
): SafetyCheckResult {
  const violations: string[] = [];
  const warnings: string[] = [];

  // R1: Check forbidden paths
  if (isForbiddenPath(filePath)) {
    violations.push(`R1_FORBIDDEN_PATH: "${filePath}" is in FORBIDDEN_PATHS and cannot be modified by agents`);
  }

  // R4: Check writable paths
  if (!isWritablePath(filePath) && !isForbiddenPath(filePath)) {
    violations.push(`R4_NOT_WHITELISTED: "${filePath}" is not in WRITABLE_PATHS. Allowed: ${WRITABLE_PATHS.join(', ')}`);
  }

  // R2: Check file size
  if (!isWithinSizeLimit(content)) {
    const lines = content.split('\n').length;
    violations.push(`R2_FILE_TOO_LARGE: ${lines} lines exceeds MAX_FILE_LINES (${MAX_FILE_LINES}). Split into smaller files.`);
  }

  // R3: Check for env modifications
  if (hasEnvModification(content)) {
    violations.push(`R3_ENV_MODIFICATION: Content contains environment variable modifications. This is forbidden.`);
  }

  // Warnings (non-blocking)
  if (content.split('\n').length > 200) {
    warnings.push(`W1_LARGE_FILE: File has ${content.split('\n').length} lines. Consider splitting for maintainability.`);
  }

  const allowed = violations.length === 0;

  // Audit log
  const auditEntry: AgentAuditEntry = {
    timestamp: new Date().toISOString(),
    taskId,
    action: 'write_file',
    filePath,
    allowed,
    violations,
    result: 'pending',
  };

  if (allowed) {
    log.info('SafetyGate: ALLOWED', { taskId, filePath, warnings });
  } else {
    log.warn('SafetyGate: BLOCKED', { taskId, filePath, violations });
  }

  return { allowed, violations, warnings };
}

/**
 * Log an agent action to the audit trail.
 * All agent actions are logged regardless of safety gate result.
 */
export function logAgentAction(entry: AgentAuditEntry): void {
  log.info('AgentAudit', {
    timestamp: entry.timestamp,
    taskId: entry.taskId,
    action: entry.action,
    filePath: entry.filePath,
    allowed: entry.allowed,
    violations: entry.violations,
    result: entry.result,
    commitHash: entry.commitHash,
    iterationCount: entry.iterationCount,
  });
}
