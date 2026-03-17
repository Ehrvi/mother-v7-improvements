#!/usr/bin/env tsx
/**
 * scripts/db-migrate.ts
 * C6: Applies all pending Drizzle migrations from drizzle/migrations/.
 * Replaces broken "drizzle-kit generate && drizzle-kit migrate".
 *
 * Usage: pnpm db:push
 */
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { createPool } from "mysql2/promise";
import { validateMigrations } from "./validate-migrations.js";
import path from "path";

async function main() {
  const { valid, errors } = validateMigrations();
  if (!valid) {
    console.error("[db-migrate] Aborting: migration validation failed");
    errors.forEach(e => console.error(" ", e));
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error("[db-migrate] ERROR: DATABASE_URL not set"); process.exit(1); }

  const rawUrl = dbUrl.replace("mysql://", "http://").replace("@/", "@localhost/");
  const url = new URL(rawUrl);
  const socketPath = url.searchParams.get("unix_socket");

  const poolConfig = socketPath
    ? { user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
        database: url.pathname.slice(1), socketPath }
    : { host: url.hostname, port: url.port ? parseInt(url.port) : 3306,
        user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
        database: url.pathname.slice(1), ssl: { rejectUnauthorized: true } };

  const pool = createPool(poolConfig as any);
  const db = drizzle(pool);

  console.log("[db-migrate] Applying pending migrations ...");
  await migrate(db, { migrationsFolder: path.resolve("drizzle/migrations") });
  console.log("[db-migrate] Done.");
  await pool.end();
}

main().catch(err => { console.error("[db-migrate] Fatal:", err); process.exit(1); });
