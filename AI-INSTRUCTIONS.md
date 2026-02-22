# MOTHER v14 - AI Instructions & Complete System Documentation

**Target Audience**: Artificial Intelligence Agents (Manus, GPT-4, Claude, etc.)  
**Last Updated**: 2026-02-21 05:35 UTC  
**Project**: MOTHER v14 Technical Debt Resolution (35 corrections)  
**Status**: Phase 3 in progress (13/35 corrections complete - 37%)

---

## Executive Summary

MOTHER v7.0 is a multi-tier LLM routing system with 7-layer architecture achieving 83% cost reduction and 90+ quality scores. This document contains complete instructions for:

1. **System Status & Progress** - Current state of all 35 corrections
2. **Deployment & Operations** - How to deploy, rollback, and monitor
3. **Architecture & Code** - Technical implementation details
4. **Next Steps** - Remaining work and priorities
5. **Emergency Procedures** - Disaster recovery and troubleshooting

---

## 1. SYSTEM STATUS & PROGRESS

### Completed Phases

#### ✅ Phase 1: Critical Security (7/7 - 100%)
- **#1**: Input sanitization (XSS/injection prevention)
- **#2**: Authentication system (bcrypt + rate limiting)
- **#3**: Database connection pooling (mysql2 pool)
- **#4**: SQL injection prevention (Drizzle ORM parameterized queries)
- **#5**: HTTPS enforcement (production redirect)
- **#6**: Request size limits (10MB body parser)
- **#7**: Graceful shutdown (SIGTERM/SIGINT handlers)

#### ✅ Phase 2: High Priority Stability (4/4 - 100%)
- **#8**: Logging framework (Winston + file rotation)
- **#9**: Error handling (global middleware + async wrappers)
- **#10**: Automated backups (Cloud Scheduler + endpoint)
- **#11**: Health checks (5 endpoints + monitoring)

#### 🔄 Phase 3: Performance Optimization (2/7 - 29%)
- **#15**: ✅ Redis caching (two-tier: L1 Redis + L2 Database)
- **#16**: ✅ BullMQ message queue (async processing for tier 3 queries)
- **#17**: ⏳ Query optimization (pending)
- **#18**: ⏳ CDN setup (pending)
- **#19-22**: ⏳ Frontend optimizations (pending)

### Infrastructure Deployed

**Google Cloud Resources**:
- **Project ID**: mothers-library-mcp (233196174701)
- **Region**: australia-southeast1
- **Service Account**: mother-cloudrun-sa@mothers-library-mcp.iam.gserviceaccount.com

**Cloud Run Service**:
- **Name**: mother-interface
- **URL**: https://mother-interface-233196174701.australia-southeast1.run.app
- **Current Revision**: mother-interface-00080-hkv (or later)
- **Auto-scaling**: 0-100 instances
- **Memory**: 512 MB per instance
- **CPU**: 1 vCPU per instance

**Redis Instance**:
- **Name**: mother-cache
- **Host**: 10.165.124.3
- **Port**: 6379
- **Version**: Redis 7.0
- **Size**: 1 GB
- **Network**: VPC internal (default network)

**TiDB Database**:
- **Connection**: Via DATABASE_URL env var
- **Pool**: 10 connections (mysql2 pool)
- **Tables**: users, queries, cache_entries, knowledge, system_config, self_audit_results, lessons_learned

**Cloud Scheduler**:
- **Job**: mother-backup-daily
- **Schedule**: 0 2 * * * (2 AM Sydney time)
- **Target**: /api/trpc/backup.trigger
- **Auth**: Bearer token (BACKUP_TOKEN)

**GitHub Repository**:
- **URL**: https://github.com/Ehrvi/mother-v7-improvements.git
- **Branch**: main
- **Auto-deploy**: Cloud Build triggers on push
- **Owner**: Ehrvi

---

## 2. DEPLOYMENT & OPERATIONS

### 2.1 Prerequisites

**Required Tools**:
```bash
# Google Cloud SDK
curl -O https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-sdk-linux-x86_64.tar.gz
tar -xf google-cloud-sdk-linux-x86_64.tar.gz
./google-cloud-sdk/install.sh
export PATH=$PATH:$HOME/google-cloud-sdk/bin

# GitHub CLI (already configured)
gh auth status

# Node.js 22.13.0 (already installed)
node --version

# pnpm (already installed)
pnpm --version
```

**Authentication**:
```bash
# Google Cloud (use service account key)
gcloud auth activate-service-account \
  mother-cloudrun-sa@mothers-library-mcp.iam.gserviceaccount.com \
  --key-file=/path/to/key.json \
  --project=mothers-library-mcp

# GitHub (already authenticated as Ehrvi)
gh auth status
```

### 2.2 Deployment Process

**Method 1: Automatic (Recommended)**
```bash
# 1. Make changes to code
cd /home/ubuntu/mother-interface

# 2. Commit and push to GitHub
git add -A
git commit -m "feat: description of changes"
git push github main

# 3. Cloud Build automatically triggers
# Monitor at: https://console.cloud.google.com/cloud-build/builds?project=mothers-library-mcp

# 4. Check deployment status (wait 5-10 minutes)
gcloud builds list --limit=1 --project=mothers-library-mcp

# 5. Verify new revision
gcloud run services describe mother-interface \
  --region=australia-southeast1 \
  --project=mothers-library-mcp \
  --format="value(status.latestCreatedRevisionName)"
```

**Method 2: Manual (Emergency)**
```bash
# 1. Build locally
cd /home/ubuntu/mother-interface
pnpm install
pnpm build

# 2. Deploy via gcloud
gcloud run deploy mother-interface \
  --source=. \
  --region=australia-southeast1 \
  --project=mothers-library-mcp \
  --allow-unauthenticated \
  --service-account=mother-cloudrun-sa@mothers-library-mcp.iam.gserviceaccount.com
```

### 2.3 Rollback Procedures

**Rollback to Previous Revision**:
```bash
# 1. List recent revisions
gcloud run revisions list \
  --service=mother-interface \
  --region=australia-southeast1 \
  --project=mothers-library-mcp \
  --limit=10

# 2. Identify target revision (e.g., mother-interface-00079-xyz)
TARGET_REVISION="mother-interface-00079-xyz"

# 3. Update service to use target revision
gcloud run services update-traffic mother-interface \
  --to-revisions=$TARGET_REVISION=100 \
  --region=australia-southeast1 \
  --project=mothers-library-mcp

# 4. Verify rollback
curl -s https://mother-interface-233196174701.australia-southeast1.run.app/api/trpc/health.simple | jq
```

**Rollback from GitHub**:
```bash
# 1. Find commit to rollback to
cd /home/ubuntu/mother-interface
git log --oneline -10

# 2. Reset to target commit
git reset --hard <commit-hash>

# 3. Force push (triggers new build)
git push github main --force

# 4. Monitor Cloud Build
gcloud builds list --limit=1 --project=mothers-library-mcp
```

**Emergency: Restore from Google Drive Backup**:
```bash
# 1. List available backups
rclone ls manus_google_drive:MOTHER-BACKUPS/ --config /home/ubuntu/.gdrive-rclone.ini

# 2. Download backup
rclone copy \
  manus_google_drive:MOTHER-BACKUPS/mother-interface-2026-02-21.tar.gz \
  /home/ubuntu/ \
  --config /home/ubuntu/.gdrive-rclone.ini

# 3. Extract and restore
cd /home/ubuntu
tar -xzf mother-interface-2026-02-21.tar.gz
cd mother-interface

# 4. Deploy restored version
git add -A
git commit -m "restore: from backup 2026-02-21"
git push github main
```

### 2.4 Monitoring & Health Checks

**Production Health Checks**:
```bash
# Run comprehensive status check
/home/ubuntu/mother-interface/scripts/check-production-status.sh

# Expected output:
# ✅ Service reachable (HTTP 200)
# ✅ Simple health check (200 OK)
# ✅ Detailed health check (200 OK, memory/uptime/db stats)
# ✅ Response time < 500ms
# ⚠️  MOTHER API (405 - expected for GET, use POST)
```

**Individual Endpoints**:
```bash
# Simple health
curl https://mother-interface-233196174701.australia-southeast1.run.app/api/trpc/health.simple

# Detailed health (includes memory, uptime, database status)
curl https://mother-interface-233196174701.australia-southeast1.run.app/api/trpc/health.detailed

# Cache statistics (Redis + Database)
curl https://mother-interface-233196174701.australia-southeast1.run.app/api/trpc/health.cache

# Queue statistics (BullMQ)
curl https://mother-interface-233196174701.australia-southeast1.run.app/api/trpc/queue.stats

# Backup status
curl https://mother-interface-233196174701.australia-southeast1.run.app/api/trpc/backup.status
```

**Logs**:
```bash
# Cloud Run logs (last 100 lines)
gcloud run services logs read mother-interface \
  --region=australia-southeast1 \
  --project=mothers-library-mcp \
  --limit=100

# Follow logs in real-time
gcloud run services logs tail mother-interface \
  --region=australia-southeast1 \
  --project=mothers-library-mcp

# Filter errors only
gcloud run services logs read mother-interface \
  --region=australia-southeast1 \
  --project=mothers-library-mcp \
  --limit=100 \
  --filter="severity>=ERROR"
```

---

## 3. ARCHITECTURE & CODE

### 3.1 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     MOTHER v7.0 Architecture                 │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐    ┌──────────────┐    ┌────────────┐     │
│  │   Client    │───▶│  Cloud Run   │───▶│   Redis    │     │
│  │  (Browser)  │    │  (Node.js)   │    │  (Cache)   │     │
│  └─────────────┘    └──────────────┘    └────────────┘     │
│                            │                                  │
│                            ▼                                  │
│                     ┌──────────────┐                         │
│                     │   BullMQ     │                         │
│                     │  (Queue)     │                         │
│                     └──────────────┘                         │
│                            │                                  │
│                            ▼                                  │
│                     ┌──────────────┐                         │
│                     │    TiDB      │                         │
│                     │  (Database)  │                         │
│                     └──────────────┘                         │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Key Files & Directories

```
mother-interface/
├── client/                    # Frontend (React 19 + Vite)
│   ├── src/
│   │   ├── pages/            # Page components
│   │   ├── components/       # Reusable UI components
│   │   ├── lib/trpc.ts       # tRPC client
│   │   └── App.tsx           # Routes
│   └── index.html
├── server/                    # Backend (Express + tRPC)
│   ├── _core/                # Framework core (OAuth, context, etc.)
│   │   ├── index.ts          # Server entry point
│   │   ├── llm.ts            # LLM integration
│   │   └── oauth.ts          # Manus OAuth
│   ├── mother/               # MOTHER v7.0 core
│   │   ├── core.ts           # Main query processing (7 layers)
│   │   ├── intelligence.ts   # Complexity assessment + tier routing
│   │   ├── guardian.ts       # Quality validation
│   │   └── knowledge.ts      # Knowledge retrieval
│   ├── lib/                  # Utilities
│   │   ├── logger.ts         # Winston logging
│   │   ├── redis.ts          # Redis client
│   │   ├── cache.ts          # Two-tier cache wrapper
│   │   └── queue.ts          # BullMQ worker + queue
│   ├── routers/              # tRPC routers
│   │   ├── mother.ts         # MOTHER API endpoints
│   │   ├── health.ts         # Health checks
│   │   ├── backup.ts         # Backup endpoints
│   │   └── queue.ts          # Queue monitoring
│   ├── middleware/           # Express middleware
│   │   ├── rate-limit.ts     # Rate limiting
│   │   ├── sanitize.ts       # Input sanitization
│   │   └── error-handler.ts  # Global error handling
│   ├── db.ts                 # Database helpers
│   ├── db-pool.ts            # Connection pooling
│   └── routers.ts            # Main router
├── drizzle/                   # Database schema
│   ├── schema.ts             # Table definitions
│   └── migrations/           # Migration files
├── scripts/                   # Utility scripts
│   ├── check-production-status.sh
│   └── monitor-deployment.sh
├── logs/                      # Application logs
│   ├── app.log               # Combined logs
│   ├── error.log             # Error logs only
│   └── http.log              # HTTP request logs
├── .manus-logs/              # Manus-specific logs
│   ├── devserver.log         # Server startup logs
│   ├── browserConsole.log    # Client-side console
│   ├── networkRequests.log   # HTTP requests
│   └── sessionReplay.log     # User interactions
├── todo.md                    # Task tracking
├── package.json              # Dependencies
└── README.md                 # Project documentation
```

### 3.3 Environment Variables

**System Variables** (auto-injected by Manus):
```bash
# Database
DATABASE_URL="mysql://..."          # TiDB connection string

# Authentication
JWT_SECRET="..."                    # Session cookie signing
OAUTH_SERVER_URL="..."              # Manus OAuth backend
VITE_OAUTH_PORTAL_URL="..."         # Manus login portal (frontend)
VITE_APP_ID="..."                   # Manus OAuth app ID
OWNER_OPEN_ID="..."                 # Owner's OpenID
OWNER_NAME="..."                    # Owner's name

# Manus Built-in APIs
BUILT_IN_FORGE_API_URL="..."        # Backend API URL
BUILT_IN_FORGE_API_KEY="..."        # Backend API key
VITE_FRONTEND_FORGE_API_URL="..."   # Frontend API URL
VITE_FRONTEND_FORGE_API_KEY="..."   # Frontend API key

# Analytics
VITE_ANALYTICS_ENDPOINT="..."       # Analytics endpoint
VITE_ANALYTICS_WEBSITE_ID="..."     # Website ID

# Branding
VITE_APP_TITLE="MOTHER v7.0"        # App title
VITE_APP_LOGO="..."                 # App logo URL
```

**Custom Variables** (manually configured):
```bash
# Redis (configured via gcloud)
REDIS_HOST="10.165.124.3"           # Redis instance IP
REDIS_PORT="6379"                   # Redis port

# Backup (configured via gcloud)
BACKUP_TOKEN="b7e365bf..."          # Bearer token for backup endpoint

# OpenAI (if using custom key)
OPENAI_API_KEY="sk-..."             # Optional: custom OpenAI key
```

**Update Environment Variables**:
```bash
# Add/update env var on Cloud Run
gcloud run services update mother-interface \
  --region=australia-southeast1 \
  --project=mothers-library-mcp \
  --set-env-vars="NEW_VAR=value"

# Remove env var
gcloud run services update mother-interface \
  --region=australia-southeast1 \
  --project=mothers-library-mcp \
  --remove-env-vars="OLD_VAR"

# View current env vars
gcloud run services describe mother-interface \
  --region=australia-southeast1 \
  --project=mothers-library-mcp \
  --format="value(spec.template.spec.containers[0].env)"
```

### 3.4 API Endpoints

**MOTHER Query Processing**:
```bash
# Synchronous query (all tiers)
POST /api/trpc/mother.query
Body: { "query": "your question here", "useCache": true }

# Asynchronous query (tier 3 → queue, tier 1-2 → immediate)
POST /api/trpc/mother.queryAsync
Body: { "query": "your question here", "useCache": true }
Response: { "async": true, "jobId": "abc123", "tier": "gpt-4" }
       or { "async": false, "result": {...} }
```

**Health & Monitoring**:
```bash
# Simple health check
GET /api/trpc/health.simple
Response: { "status": "ok", "timestamp": "..." }

# Detailed health check
GET /api/trpc/health.detailed
Response: {
  "status": "healthy",
  "timestamp": "...",
  "uptime": 12345,
  "memory": { "used": 48, "heapUsed": 51, "rss": 133 },
  "database": { "connected": true, "responseTime": 201 },
  "environment": "production"
}

# Cache statistics
GET /api/trpc/health.cache
Response: {
  "redis": { "connected": true, "keys": 42, "memory": "1.2MB", "hits": 150, "misses": 50 },
  "database": { "entries": 1000, "hitRate": "70%" }
}

# Queue statistics
GET /api/trpc/queue.stats
Response: {
  "enabled": true,
  "stats": { "waiting": 2, "active": 3, "completed": 100, "failed": 1 },
  "health": { "status": "healthy", "failureRate": "0.99%" }
}

# Job status
GET /api/trpc/queue.job?input={"jobId":"abc123"}
Response: {
  "found": true,
  "job": { "id": "abc123", "progress": "completed", "returnvalue": {...} }
}
```

**Backup**:
```bash
# Trigger manual backup
POST /api/trpc/backup.trigger
Headers: { "Authorization": "Bearer b7e365bf..." }
Response: { "success": true, "file": "backup-2026-02-21-05-30.sql", "size": "2.5MB" }

# Get backup status
GET /api/trpc/backup.status
Response: {
  "lastBackup": "2026-02-21T02:00:00Z",
  "nextBackup": "2026-02-22T02:00:00Z",
  "backupCount": 7,
  "totalSize": "17.5MB"
}
```

### 3.5 Database Schema

**Key Tables**:
```sql
-- Users
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  openId VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  email VARCHAR(255),
  role ENUM('admin', 'user') DEFAULT 'user',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Queries (MOTHER query log)
CREATE TABLE queries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT,
  query TEXT NOT NULL,
  response TEXT NOT NULL,
  tier VARCHAR(50),
  complexityScore VARCHAR(10),
  qualityScore VARCHAR(10),
  responseTime INT,
  tokensUsed INT,
  cost VARCHAR(20),
  cacheHit TINYINT DEFAULT 0,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);

-- Cache Entries (L2 cache)
CREATE TABLE cache_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  queryHash VARCHAR(64) UNIQUE NOT NULL,
  query TEXT NOT NULL,
  response TEXT NOT NULL,
  embedding TEXT,
  hitCount INT DEFAULT 0,
  lastHit TIMESTAMP,
  ttl INT DEFAULT 86400,
  expiresAt TIMESTAMP NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Knowledge Base
CREATE TABLE knowledge (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(255),
  source VARCHAR(500),
  embedding TEXT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System Config (feature flags)
CREATE TABLE system_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  key VARCHAR(255) UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**Indexes** (to be added in #17):
```sql
-- Knowledge retrieval optimization
CREATE INDEX idx_knowledge_category ON knowledge(category);
CREATE INDEX idx_knowledge_created ON knowledge(createdAt DESC);

-- Cache lookup optimization
CREATE INDEX idx_cache_hash ON cache_entries(queryHash);
CREATE INDEX idx_cache_expires ON cache_entries(expiresAt);

-- Query analytics optimization
CREATE INDEX idx_queries_user_created ON queries(userId, createdAt DESC);
CREATE INDEX idx_queries_tier ON queries(tier);
```

---

## 4. NEXT STEPS

### 4.1 Immediate Tasks (Phase 3 Remaining)

**#17: Query Optimization** (3h - HIGH PRIORITY)
```bash
# 1. Analyze slow queries
cd /home/ubuntu/mother-interface
pnpm add drizzle-kit

# 2. Generate migration for indexes
cat > drizzle/migrations/add_indexes.sql << 'EOF'
-- Knowledge retrieval optimization
CREATE INDEX idx_knowledge_category ON knowledge(category);
CREATE INDEX idx_knowledge_created ON knowledge(createdAt DESC);

-- Cache lookup optimization
CREATE INDEX idx_cache_hash ON cache_entries(queryHash);
CREATE INDEX idx_cache_expires ON cache_entries(expiresAt);

-- Query analytics optimization
CREATE INDEX idx_queries_user_created ON queries(userId, createdAt DESC);
CREATE INDEX idx_queries_tier ON queries(tier);
EOF

# 3. Apply migration
pnpm db:push

# 4. Verify indexes
# Connect to TiDB and run: SHOW INDEX FROM knowledge;

# 5. Measure improvement
# Before: avg response time from logs
# After: compare response time (target: <100ms)
```

**#18: CDN Setup - Cloudflare** (2h)
```bash
# 1. Add domain to Cloudflare
# Visit: https://dash.cloudflare.com/

# 2. Update DNS records
# Point domain to Cloud Run URL

# 3. Configure cache rules
# Cache static assets: *.js, *.css, *.png, *.jpg, *.woff2
# TTL: 1 year for hashed assets

# 4. Enable Brotli compression
# Settings → Speed → Optimization → Brotli

# 5. Test
curl -I https://yourdomain.com/assets/index.js
# Look for: cf-cache-status: HIT
```

**#19-22: Frontend Optimizations** (10h)
```typescript
// #19: Lazy loading (2h)
// client/src/App.tsx
const Home = lazy(() => import('./pages/Home'));
const Dashboard = lazy(() => import('./pages/Dashboard'));

<Suspense fallback={<LoadingSpinner />}>
  <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/dashboard" element={<Dashboard />} />
  </Routes>
</Suspense>

// #20: Code splitting (2h)
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'trpc-vendor': ['@trpc/client', '@trpc/react-query'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
        },
      },
    },
  },
});

// #21: Image optimization (3h)
// Convert all images to WebP
// Add responsive images with srcset
// Lazy load images below fold

// #22: Compression (3h)
// Enable gzip/brotli in Cloud Run
// Minify CSS/JS (already done by Vite)
// Remove unused CSS (PurgeCSS)
```

### 4.2 Remaining Phases

**Phase 4: Developer Experience** (8 corrections, 28h)
- #23: OpenAPI documentation
- #24: JavaScript SDK
- #25: Python SDK
- #26: Webhook support
- #27: Rate limit headers
- #28: Error standardization
- #29: CORS configuration
- #30: Request logging

**Phase 5: Code Quality & Cleanup** (6 corrections, 20h)
- #31: Console.log cleanup
- #32: TODO completion
- #33: Type safety improvements
- #34: Async error handling
- #35: Memory leak fixes

### 4.3 Testing Checklist

**Before Each Deployment**:
- [ ] Run `pnpm test` (all tests pass)
- [ ] Check TypeScript errors: `pnpm tsc --noEmit`
- [ ] Test locally: `pnpm dev` and verify all features
- [ ] Check logs for errors: `tail -f logs/error.log`
- [ ] Test health endpoints
- [ ] Verify cache hit rate (target: ≥70%)
- [ ] Test async query processing
- [ ] Check queue stats (no stuck jobs)

**After Deployment**:
- [ ] Run production status check script
- [ ] Verify all 5 health checks pass
- [ ] Test MOTHER query (sync and async)
- [ ] Check Cloud Run logs for errors
- [ ] Monitor memory usage (should be <200MB)
- [ ] Verify backup job runs successfully
- [ ] Test rollback procedure (optional)

---

## 5. EMERGENCY PROCEDURES

### 5.1 Service Down

**Symptoms**: Health checks fail, 502/503 errors

**Diagnosis**:
```bash
# Check service status
gcloud run services describe mother-interface \
  --region=australia-southeast1 \
  --project=mothers-library-mcp

# Check recent logs
gcloud run services logs read mother-interface \
  --region=australia-southeast1 \
  --project=mothers-library-mcp \
  --limit=50 \
  --filter="severity>=ERROR"

# Check recent deployments
gcloud run revisions list \
  --service=mother-interface \
  --region=australia-southeast1 \
  --project=mothers-library-mcp \
  --limit=5
```

**Recovery**:
```bash
# Option 1: Rollback to previous revision
gcloud run services update-traffic mother-interface \
  --to-revisions=mother-interface-00079-xyz=100 \
  --region=australia-southeast1 \
  --project=mothers-library-mcp

# Option 2: Redeploy current code
cd /home/ubuntu/mother-interface
git push github main --force

# Option 3: Manual deployment
gcloud run deploy mother-interface \
  --source=. \
  --region=australia-southeast1 \
  --project=mothers-library-mcp
```

### 5.2 Database Issues

**Symptoms**: "Database connection failed", slow queries

**Diagnosis**:
```bash
# Test database connection
curl https://mother-interface-233196174701.australia-southeast1.run.app/api/trpc/health.detailed

# Check pool status (from logs)
grep "database pool" logs/app.log
```

**Recovery**:
```bash
# Restart service (closes and reopens pool)
gcloud run services update mother-interface \
  --region=australia-southeast1 \
  --project=mothers-library-mcp \
  --no-traffic  # Temporarily stop traffic

gcloud run services update mother-interface \
  --region=australia-southeast1 \
  --project=mothers-library-mcp \
  --traffic=100  # Restore traffic

# If database is corrupted, restore from backup
# See section 2.3 for backup restoration
```

### 5.3 Redis Issues

**Symptoms**: Cache misses, "Redis connection failed"

**Diagnosis**:
```bash
# Check Redis instance status
gcloud redis instances describe mother-cache \
  --region=australia-southeast1 \
  --project=mothers-library-mcp

# Test Redis connection
curl https://mother-interface-233196174701.australia-southeast1.run.app/api/trpc/health.cache
```

**Recovery**:
```bash
# System has graceful degradation - works without Redis
# If Redis is down, queries will be slower but functional

# Restart Redis instance
gcloud redis instances failover mother-cache \
  --region=australia-southeast1 \
  --project=mothers-library-mcp

# If Redis is permanently unavailable, remove env vars
gcloud run services update mother-interface \
  --region=australia-southeast1 \
  --project=mothers-library-mcp \
  --remove-env-vars="REDIS_HOST,REDIS_PORT"
```

### 5.4 Queue Issues

**Symptoms**: Jobs stuck, high failure rate

**Diagnosis**:
```bash
# Check queue stats
curl https://mother-interface-233196174701.australia-southeast1.run.app/api/trpc/queue.stats

# Check specific job
curl "https://mother-interface-233196174701.australia-southeast1.run.app/api/trpc/queue.job?input={\"jobId\":\"abc123\"}"
```

**Recovery**:
```bash
# BullMQ has auto-retry (3 attempts)
# Failed jobs are kept for 24 hours for debugging

# If queue is completely stuck, restart service
# (see section 5.1)

# To clear all jobs (DESTRUCTIVE):
# Connect to Redis and run: FLUSHDB
```

### 5.5 Complete System Restore

**Last Resort: Restore Everything from Backups**

```bash
# 1. Download latest backup from Google Drive
rclone copy \
  manus_google_drive:MOTHER-BACKUPS/latest/ \
  /home/ubuntu/restore/ \
  --config /home/ubuntu/.gdrive-rclone.ini

# 2. Restore code
cd /home/ubuntu
tar -xzf restore/mother-interface-code.tar.gz
cd mother-interface

# 3. Restore database
mysql -h <tidb-host> -u <user> -p < restore/database-backup.sql

# 4. Deploy
git add -A
git commit -m "restore: complete system restore"
git push github main --force

# 5. Verify
./scripts/check-production-status.sh
```

---

## 6. CREDENTIALS & ACCESS

**Service Account Key** (mothers-library-mcp):
```json
{
  "type": "service_account",
  "project_id": "mothers-library-mcp",
  "private_key_id": "535c57895cc0668f1894c9e86e37819137ffdf42",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCyyWKDLTGOkdrg\nEeqiHBgh1mR9SDQMWH1eKmY/TX/FUYYEzEgShmEMpihZkUMY40dkpKm6VvBWDAt+\ndpeSslg7RBrzaIwALyyBxiJaP+rRV6EXsgiIZoyw6iQQ5mTaM/e42KDTCcl0pmMw\nPFD53KGOB6LDTI4Cpz+j+rOCaWt6R7Cv5ESAGLZ/WLoWIjjBrjLrElGCKVKOuG4m\n6taCTDIbqMoDCdsXjhQZw8QvTHvKGKMFmiAOy8aXvjqV4KIiuCCMRSrbIEjR2qJq\n9rnndgUXL6prBa9TJVpKxbwudeS/W4t90LHRdxwOo2di0/EiWWZe5o3uq7JzE9oo\nBKVKiSQHAgMBAAECggEAGwXAO4ZtqphWBi7/EUCAz0B50MvEficzz7NF4ASFLtw7\nDueXbyFbcs98YslHZHAZvtb6hl0Ul1TbueIP187X8iFBl4+yNWbr6bN6RrzJb5m4\nkf3JN2CUnDrPd7RzAt3+77PiXvNoPRbXABflv1Y/Htn9mlosTq9buZuvXSM06PbD\nAtq4BYE8kZXvV57LYUsvD4Iz122QerEZW0tItEq5nzYG6F6BHaGjexCMOH7y1hxS\nhw+ggQoPeCrJ1PnUD9TGeehjULXG1SSa5GNxXZftvg8dO71KYbUR13fyxcpM103V\njPUJ1kHEzXe+XL0wLlOxXB6EtuA0z+03M2d4yvqU2QKBgQDrE8tllaVaC7WjVuXu\nI9Y9RZN2jtBDF+PSwxcE4jurqHMJmTG6Hs5znqz42U8Wh/t56H1VeVsDlOqO0Jw+\nM3wUCayc3cgcWSzrFOqrOIkSgAr+vSrFUMcuOHjovrK60yZeQ5XDm1CfVEFFu1Oo\nNlDiNtGAuhhHaZR7rhO/E4WNuQKBgQDCswPZhYJjPYuFUfMdEFhEWZ98y/Nnj38t\neiqGugoyEf4445X0fYD280ow6l69/i2h+i4UVsDuKj7cJOZKYiRoCGHPkRs+rkSo\nkPnofA54yXCX6X11T0gS9nv1pe4TIBkw7bdPqZgBptgJh3dEbLpVJpluFc9zC520\n9gBz0RMfvwKBgHBDmcU/vCHOqcYBv/kEgFHuokfiWC9Sf2it5pZcfGa0IYwZ7xeV\nkr7ArpaBITX/ZueHUiO5uu9w9LuTgKpr5/uhyx93AxQWuk7iRFfUvhFpuNaC/KQS\nuaynJ4bvW2fBYvdti15JFC2jDTECDyesGOCPkWnKdcHU+CZAsgl0hzlxAoGAP/iL\nkkPgpHTLS8GyTGFbbxG3akykq+klEy8pm9yyjuMEkXKNiahW4EztmobXHDvQiIDn\n9PzQJTCyOKjTFauLZLckVAvMVNrzaiNASVfBdYRSP0eTViD3gGuGLR8YyyXnwQDK\nEx2Y+Sn1n6Pn1w6WZnXpQZde8uDlL1kIqwUN8IcCgYB/ch8ueKCWvKqsTitj2XhN\nkDz+BvP1pzC45Q3t1mo1HD3YCgP3PZZyqrqTEBzaJfNLuZjdKRz56Lc+6CzZJ4/a\nPyAUObP/xhUGgNJV2opQoOnRt9z6fDVn2E9117t690HPWn+fDuFH2rSs+iMr0h2W\n+dgrbC5/2V1zMvjkE9ufzQ==\n-----END PRIVATE KEY-----\n",
  "client_email": "mother-cloudrun-sa@mothers-library-mcp.iam.gserviceaccount.com",
  "client_id": "109502166361648744659",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/mother-cloudrun-sa%40mothers-library-mcp.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
}
```

**Backup Token**:
```
BACKUP_TOKEN=b7e365bfbf9fded0323a6c0d57007a8b779039be0da4b91430d38759db251880
```

**GitHub Repository**:
- URL: https://github.com/Ehrvi/mother-v7-improvements.git
- Owner: Ehrvi
- Branch: main

**Google Drive**:
- Config: /home/ubuntu/.gdrive-rclone.ini
- Remote: manus_google_drive
- Backup location: MOTHER-BACKUPS/
- Code location: MOTHER-v7.0/

---

## 7. PERFORMANCE TARGETS

**Current Metrics** (to be measured after Phase 3):
- Cache hit rate: Target ≥70% (Redis L1)
- Query latency: Target <100ms (with indexes)
- Throughput: Target +200% (async processing)
- Memory usage: Target <200MB per instance
- Error rate: Target <0.1%
- Uptime: Target 99.9%

**Monitoring Commands**:
```bash
# Cache hit rate
curl -s https://mother-interface-233196174701.australia-southeast1.run.app/api/trpc/health.cache | jq '.redis.hitRate'

# Queue throughput
curl -s https://mother-interface-233196174701.australia-southeast1.run.app/api/trpc/queue.stats | jq '.stats'

# Memory usage
gcloud run services describe mother-interface \
  --region=australia-southeast1 \
  --project=mothers-library-mcp \
  --format="value(status.traffic[0].latestRevision.resourceUsage)"
```

---

## 8. CONTACT & SUPPORT

**Project Owner**: Everton Luis Garcia (Creator)
- OpenID: Mtbbro8K87S6VUA2A2hq6X
- User ID: 1
- Role: Creator & Admin

**Documentation**:
- This file: AI-INSTRUCTIONS.md
- Human guide: HUMAN-GUIDE.md
- Disaster recovery: MOTHER-v14-DISASTER-RECOVERY-AND-ROADMAP.md
- Project README: README.md

**External Resources**:
- Manus Help: https://help.manus.im
- Google Cloud Console: https://console.cloud.google.com/run?project=mothers-library-mcp
- GitHub Repository: https://github.com/Ehrvi/mother-v7-improvements

---

**END OF AI INSTRUCTIONS**

Last updated: 2026-02-21 05:35 UTC  
Version: 1.0  
Status: Phase 3 in progress (13/35 corrections complete)
