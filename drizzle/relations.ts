import { relations } from "drizzle-orm";
import { users, queries, selfProposals, auditLog } from "./schema";

/**
 * C5: Drizzle relations definitions
 * Enables type-safe JOINs and eager loading via drizzle's query API.
 */

// users ↔ queries (one-to-many)
export const usersRelations = relations(users, ({ many }) => ({
  queries: many(queries),
}));

export const queriesRelations = relations(queries, ({ one }) => ({
  user: one(users, {
    fields: [queries.userId],
    references: [users.id],
  }),
}));

// selfProposals ↔ auditLog (one-to-many — logical, not FK)
// auditLog.targetType = 'self_proposal' AND auditLog.targetId = selfProposals.id::string
export const selfProposalsRelations = relations(selfProposals, ({ many }) => ({
  auditEntries: many(auditLog),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  selfProposal: one(selfProposals, {
    fields: [auditLog.targetId],
    references: [selfProposals.id],
  }),
}));

/**
 * TODO (deferred): queries → knowledge relation
 * Requires a join table: query_knowledge_hits(query_id, knowledge_id, score)
 * Track under: C5-deferred-knowledge-relation
 */
