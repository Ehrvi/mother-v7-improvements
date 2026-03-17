#!/usr/bin/env tsx
/**
 * scripts/validate-migrations.ts
 * Validates drizzle/migrations/ for gaps and duplicate numbers.
 * Run: pnpm tsx scripts/validate-migrations.ts
 */
import fs from "fs";
import path from "path";

const MIGRATIONS_DIR = path.resolve("drizzle/migrations");
const JOURNAL_PATH = path.resolve("drizzle/meta/_journal.json");

interface JournalEntry { idx: number; tag: string; }
interface Journal { entries: JournalEntry[]; }

export function validateMigrations(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith(".sql")).sort();

  const numMap = new Map<number, string[]>();
  for (const f of files) {
    const match = f.match(/^(\d+)_/);
    if (!match) { errors.push(`Non-numeric prefix: ${f}`); continue; }
    const n = parseInt(match[1], 10);
    if (!numMap.has(n)) numMap.set(n, []);
    numMap.get(n)!.push(f);
  }

  for (const [n, names] of numMap) {
    if (names.length > 1) {
      errors.push(`Duplicate migration ${String(n).padStart(4, "0")}: ${names.join(", ")}`);
    }
  }

  const journal: Journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf8"));
  const journalTags = new Set(journal.entries.map(e => e.tag));
  const fileTags = new Set(files.map(f => f.replace(".sql", "")));

  for (const tag of fileTags) {
    if (!journalTags.has(tag)) errors.push(`File ${tag}.sql not in _journal.json`);
  }
  for (const tag of journalTags) {
    if (!fileTags.has(tag)) errors.push(`Journal entry ${tag} has no .sql file`);
  }

  const valid = errors.length === 0;
  if (valid) console.log(`[validate-migrations] OK — ${files.length} migrations, 0 errors`);
  else errors.forEach(e => console.error(`[validate-migrations] ERROR: ${e}`));
  return { valid, errors };
}

const { valid } = validateMigrations();
if (!valid) process.exit(1);
