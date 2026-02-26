/**
 * MOTHER v69.11: User Hierarchy Authorization Module
 * 
 * Implements a 4-tier principal hierarchy based on:
 * - NIST SP 800-162 (2014): Guide to ABAC Definition and Considerations
 * - NIST SP 800-53 Rev5 (2020): Security and Privacy Controls (AC-2, AC-3, AC-6)
 * - Anthropic Constitutional AI (2026): Principal Hierarchy (Anthropic > Operator > User)
 * - Ferraiolo & Kuhn (1992): Role-Based Access Controls (RBAC) — original NIST paper
 *
 * Hierarchy (highest to lowest trust):
 *   CREATOR   → Everton Garcia (elgarcia.eng@gmail.com) — system owner, full access
 *   ADMIN     → Trusted operators — can view metrics, manage users, approve proposals
 *   USER      → Authenticated users — can query MOTHER, view public metrics
 *   GUEST     → Unauthenticated — can query MOTHER (rate-limited), no metrics access
 *
 * Design principles:
 * 1. Least Privilege (NIST AC-6): each role has minimum permissions needed
 * 2. Separation of Duties (NIST AC-5): no single role can both propose AND approve changes
 * 3. Need-to-Know (Anthropic): users see MOTHER's power, not its implementation secrets
 * 4. Defense in Depth: authorization checked at both API and UI layers
 */

import type { User } from '../../drizzle/schema';

// ─── Role Definitions ──────────────────────────────────────────────────────────

export type UserRole = 'creator' | 'admin' | 'user' | 'guest';

/** The canonical creator email — single source of truth */
export const CREATOR_EMAIL = 'elgarcia.eng@gmail.com';

/**
 * Numeric trust levels for comparison.
 * Higher = more trusted.
 * Scientific basis: Hierarchical RBAC (Sandhu et al., 1996, IEEE Computer)
 */
export const ROLE_TRUST_LEVEL: Record<UserRole, number> = {
  creator: 100,
  admin:    50,
  user:     10,
  guest:     0,
};

// ─── Permission Definitions ────────────────────────────────────────────────────

/**
 * All permissions in the system.
 * Based on NIST RBAC permission model (Ferraiolo et al., 2001, ACM TISSEC)
 */
export type Permission =
  // Query permissions
  | 'query:basic'           // Send queries to MOTHER
  | 'query:unlimited'       // No rate limiting on queries
  | 'query:creator_bypass'  // Always routes to gpt-4o
  // Admin command permissions
  | 'admin:audit'           // Run /audit command
  | 'admin:status'          // Run /status command
  | 'admin:proposals'       // View DGM proposals
  | 'admin:approve'         // Approve DGM proposals (CREATOR ONLY)
  | 'admin:reject'          // Reject DGM proposals (CREATOR ONLY)
  | 'admin:users'           // Manage users (CREATOR ONLY)
  // Metrics permissions
  | 'metrics:session'       // View own session metrics
  | 'metrics:system'        // View system-wide metrics
  | 'metrics:history'       // View full query history
  | 'metrics:costs'         // View cost data
  // Knowledge permissions
  | 'knowledge:read'        // Read knowledge base entries
  | 'knowledge:write'       // Write to knowledge base (CREATOR ONLY)
  // Quality Lab permissions
  | 'qualitylab:run'        // Run G-Eval experiments
  | 'qualitylab:history'    // View experiment history
  | 'qualitylab:export'     // Export results
  | 'qualitylab:admin'      // Admin functions (CREATOR/ADMIN)
  // System permissions
  | 'system:read'           // Read system config
  | 'system:write'          // Write system config (CREATOR ONLY)
  | 'system:deploy'         // Trigger deployments (CREATOR ONLY)
  | 'system:secrets'        // View secrets/API keys (CREATOR ONLY)
  ;

/**
 * Role-Permission mapping.
 * Implements NIST RBAC hierarchical inheritance:
 * creator inherits all admin permissions
 * admin inherits all user permissions
 * user inherits all guest permissions
 */
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  guest: [
    'query:basic',
    'metrics:session',
  ],
  user: [
    'query:basic',
    'query:unlimited',
    'metrics:session',
    'metrics:history',
    'qualitylab:run',
    'qualitylab:history',
    'qualitylab:export',
  ],
  admin: [
    'query:basic',
    'query:unlimited',
    'admin:audit',
    'admin:status',
    'admin:proposals',
    'metrics:session',
    'metrics:system',
    'metrics:history',
    'metrics:costs',
    'knowledge:read',
    'qualitylab:run',
    'qualitylab:history',
    'qualitylab:export',
    'qualitylab:admin',
    'system:read',
  ],
  creator: [
    'query:basic',
    'query:unlimited',
    'query:creator_bypass',
    'admin:audit',
    'admin:status',
    'admin:proposals',
    'admin:approve',
    'admin:reject',
    'admin:users',
    'metrics:session',
    'metrics:system',
    'metrics:history',
    'metrics:costs',
    'knowledge:read',
    'knowledge:write',
    'qualitylab:run',
    'qualitylab:history',
    'qualitylab:export',
    'qualitylab:admin',
    'system:read',
    'system:write',
    'system:deploy',
    'system:secrets',
  ],
};

// ─── Authorization Functions ───────────────────────────────────────────────────

/**
 * Determine the effective role of a user.
 * 
 * Priority order (Constitutional AI principal hierarchy):
 * 1. Email match to CREATOR_EMAIL → always 'creator' (even if DB says 'admin')
 * 2. DB role field (creator/admin/user)
 * 3. Null user → 'guest'
 * 
 * Scientific basis: Anthropic (2026) — "Each principal is typically given greater
 * trust and their imperatives greater importance in roughly the order given above"
 */
export function getEffectiveRole(user: User | null): UserRole {
  if (!user) return 'guest';
  // Creator email always wins — defense against DB role being wrong
  if (user.email === CREATOR_EMAIL) return 'creator';
  // Use DB role if valid
  if (user.role === 'creator' || user.role === 'admin') return user.role;
  return 'user';
}

/**
 * Check if a user has a specific permission.
 * 
 * @param user - The authenticated user (or null for guests)
 * @param permission - The permission to check
 * @returns true if the user has the permission
 */
export function hasPermission(user: User | null, permission: Permission): boolean {
  const role = getEffectiveRole(user);
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Check if a user's role meets a minimum trust level.
 * 
 * @param user - The authenticated user (or null for guests)
 * @param minRole - The minimum required role
 * @returns true if user's trust level >= minRole's trust level
 */
export function hasMinRole(user: User | null, minRole: UserRole): boolean {
  const role = getEffectiveRole(user);
  return ROLE_TRUST_LEVEL[role] >= ROLE_TRUST_LEVEL[minRole];
}

/**
 * Get all permissions for a user.
 */
export function getUserPermissions(user: User | null): Permission[] {
  const role = getEffectiveRole(user);
  return ROLE_PERMISSIONS[role];
}

/**
 * Get a sanitized user context for the frontend.
 * Reveals capabilities without exposing implementation secrets.
 * 
 * Scientific basis: Need-to-Know principle (Anthropic, 2026):
 * "users see MOTHER's power, not its implementation secrets"
 */
export function getSanitizedUserContext(user: User | null): {
  role: UserRole;
  displayName: string;
  permissions: Permission[];
  isCreator: boolean;
  isAdmin: boolean;
  trustLevel: number;
} {
  const role = getEffectiveRole(user);
  return {
    role,
    displayName: user?.name ?? user?.username ?? 'Guest',
    permissions: getUserPermissions(user),
    isCreator: role === 'creator',
    isAdmin: role === 'admin' || role === 'creator',
    trustLevel: ROLE_TRUST_LEVEL[role],
  };
}

/**
 * Authorization middleware for tRPC procedures.
 * Usage: requirePermission('admin:approve')(ctx)
 */
export function requirePermission(permission: Permission) {
  return (user: User | null): void => {
    if (!hasPermission(user, permission)) {
      const role = getEffectiveRole(user);
      throw new Error(
        `Unauthorized: role '${role}' (trust=${ROLE_TRUST_LEVEL[role]}) lacks permission '${permission}'. ` +
        `Required: ${Object.entries(ROLE_PERMISSIONS)
          .filter(([, perms]) => perms.includes(permission))
          .map(([r]) => r)
          .join(' | ')}`
      );
    }
  };
}

/**
 * Rate limit configuration per role.
 * Scientific basis: Token bucket algorithm (Tanenbaum, Computer Networks, 2011)
 */
export const RATE_LIMITS: Record<UserRole, { queriesPerHour: number; queriesPerDay: number }> = {
  creator: { queriesPerHour: Infinity, queriesPerDay: Infinity },
  admin:   { queriesPerHour: 500,      queriesPerDay: 5000 },
  user:    { queriesPerHour: 100,      queriesPerDay: 1000 },
  guest:   { queriesPerHour: 10,       queriesPerDay: 50 },
};

/**
 * Quality Lab access rules — what each role can see in the Quality Lab.
 * Implements the "show power without revealing secrets" principle.
 */
export const QUALITY_LAB_ACCESS: Record<UserRole, {
  canRunExperiments: boolean;
  canViewHistory: boolean;
  canViewSystemMetrics: boolean;
  canViewCosts: boolean;
  canViewModelNames: boolean;  // Show "deepseek-chat" vs just "AI Model"
  canExport: boolean;
  canAdminister: boolean;
  visibleMetrics: string[];
}> = {
  guest: {
    canRunExperiments: false,
    canViewHistory: false,
    canViewSystemMetrics: false,
    canViewCosts: false,
    canViewModelNames: false,
    canExport: false,
    canAdminister: false,
    visibleMetrics: [],
  },
  user: {
    canRunExperiments: true,
    canViewHistory: true,
    canViewSystemMetrics: false,
    canViewCosts: false,
    canViewModelNames: false,  // Shows "AI Model" not "deepseek-chat"
    canExport: true,
    canAdminister: false,
    visibleMetrics: ['qualityScore', 'responseTime', 'faithfulness', 'relevancy'],
  },
  admin: {
    canRunExperiments: true,
    canViewHistory: true,
    canViewSystemMetrics: true,
    canViewCosts: true,
    canViewModelNames: true,
    canExport: true,
    canAdminister: true,
    visibleMetrics: ['qualityScore', 'responseTime', 'faithfulness', 'relevancy', 'cost', 'tier', 'provider'],
  },
  creator: {
    canRunExperiments: true,
    canViewHistory: true,
    canViewSystemMetrics: true,
    canViewCosts: true,
    canViewModelNames: true,
    canExport: true,
    canAdminister: true,
    visibleMetrics: ['qualityScore', 'responseTime', 'faithfulness', 'relevancy', 'cost', 'tier', 'provider', 'embedding', 'rawResponse'],
  },
};
