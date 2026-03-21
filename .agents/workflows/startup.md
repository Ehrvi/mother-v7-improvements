---
description: How to start the MOTHER development environment locally
---

# MOTHER Local Development Startup

## Critical Info

> **DATABASE_URL in `.env` points to PRODUCTION MySQL** (`mother_v7_prod` at `127.0.0.1:3306`).
> There is NO local MySQL installed. The app has a **dev mode bypass** that auto-logs in
> without a database when `NODE_ENV=development`.

## Steps

// turbo-all

1. Start the dev server:
```
npm run dev
```
This sets `NODE_ENV=development` via `cross-env` and starts on `http://localhost:3000`.

2. Open http://localhost:3000 in the browser.

3. Login with **any email/password** — the dev bypass in `server/routers/auth.ts` will auto-authenticate as Dev Admin when the database is unavailable.

## What if MySQL IS needed?

The user does NOT have MySQL installed locally. The production DB is on Cloud SQL (Sydney).
To connect to production, a Cloud SQL Auth Proxy would be needed — **do NOT attempt to start MySQL locally**.

## Common Issues

| Issue | Cause | Fix |
|---|---|---|
| Login fails with "Banco de dados indisponível" | `NODE_ENV` not set to `development` | Use `npm run dev` (sets it automatically) |
| Server not responding on port 3000 | Dev server crashed or not started | Run `npm run dev` again |
| `[Database] DATABASE_URL not set` warning | Normal in dev mode | Ignore — dev bypass handles it |
