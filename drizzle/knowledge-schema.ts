/**
 * MOTHER v14 Knowledge Database Schema
 * Drizzle ORM schema for structured knowledge storage
 */

import { mysqlTable, int, varchar, text, decimal, date, timestamp, index, unique } from "drizzle-orm/mysql-core";

// Main knowledge table
export const knowledge = mysqlTable("knowledge", {
  id: int("id").primaryKey().autoincrement(),
  phase: varchar("phase", { length: 50 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  impact: varchar("impact", { length: 20 }),
  confidence: decimal("confidence", { precision: 3, scale: 2 }),
  date: date("date").notNull(),
  version: varchar("version", { length: 40 }),
  hash: varchar("hash", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  phaseIdx: index("idx_phase").on(table.phase),
  categoryIdx: index("idx_category").on(table.category),
  typeIdx: index("idx_type").on(table.type),
  dateIdx: index("idx_date").on(table.date),
  hashIdx: unique("idx_hash").on(table.hash),
}));

// Learnings table
export const learnings = mysqlTable("learnings", {
  id: int("id").primaryKey().autoincrement(),
  knowledgeId: int("knowledge_id").references(() => knowledge.id, { onDelete: "cascade" }),
  problem: text("problem").notNull(),
  solution: text("solution").notNull(),
  learning: text("learning").notNull(),
  bestPractice: text("best_practice"),
  codeExample: text("code_example"),
  references: text("references"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  knowledgeIdx: index("idx_knowledge").on(table.knowledgeId),
}));

// Mistakes table
export const mistakes = mysqlTable("mistakes", {
  id: int("id").primaryKey().autoincrement(),
  knowledgeId: int("knowledge_id").references(() => knowledge.id, { onDelete: "cascade" }),
  mistake: text("mistake").notNull(),
  correction: text("correction").notNull(),
  rootCause: text("root_cause"),
  prevention: text("prevention"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  knowledgeIdx: index("idx_knowledge").on(table.knowledgeId),
}));

// Metrics table
export const metrics = mysqlTable("metrics", {
  id: int("id").primaryKey().autoincrement(),
  knowledgeId: int("knowledge_id").references(() => knowledge.id, { onDelete: "cascade" }),
  metricName: varchar("metric_name", { length: 100 }).notNull(),
  beforeValue: decimal("before_value", { precision: 10, scale: 4 }),
  afterValue: decimal("after_value", { precision: 10, scale: 4 }),
  improvementPct: decimal("improvement_pct", { precision: 5, scale: 2 }),
  unit: varchar("unit", { length: 20 }),
  confidence: decimal("confidence", { precision: 3, scale: 2 }),
  pValue: decimal("p_value", { precision: 10, scale: 8 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  knowledgeIdx: index("idx_knowledge").on(table.knowledgeId),
  metricNameIdx: index("idx_metric_name").on(table.metricName),
}));

// Best practices table
export const bestPractices = mysqlTable("best_practices", {
  id: int("id").primaryKey().autoincrement(),
  knowledgeId: int("knowledge_id").references(() => knowledge.id, { onDelete: "cascade" }),
  practice: text("practice").notNull(),
  rationale: text("rationale"),
  example: text("example"),
  category: varchar("category", { length: 50 }),
  priority: varchar("priority", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  knowledgeIdx: index("idx_knowledge").on(table.knowledgeId),
  categoryIdx: index("idx_category").on(table.category),
}));

// Tags table
export const knowledgeTags = mysqlTable("knowledge_tags", {
  id: int("id").primaryKey().autoincrement(),
  knowledgeId: int("knowledge_id").references(() => knowledge.id, { onDelete: "cascade" }),
  tag: varchar("tag", { length: 50 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  knowledgeIdx: index("idx_knowledge").on(table.knowledgeId),
  tagIdx: index("idx_tag").on(table.tag),
}));

// Search index table
export const knowledgeSearch = mysqlTable("knowledge_search", {
  id: int("id").primaryKey().autoincrement(),
  knowledgeId: int("knowledge_id").references(() => knowledge.id, { onDelete: "cascade" }),
  searchableText: text("searchable_text").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  knowledgeIdx: index("idx_knowledge").on(table.knowledgeId),
  // Note: FULLTEXT index needs to be added manually in migration
}));
