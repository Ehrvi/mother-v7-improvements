# MOTHER v14 - Deployment Instructions

## Current Status

**Production URL**: https://mother-interface-233196174701.australia-southeast1.run.app

**Current Version**: Phase 1 (Security improvements only)
**New Version Ready**: Phase 2 (Checkpoint `6c568ff8` - Security + Stability)

## What's New in Phase 2

### ✅ Stability Improvements
1. **Winston Logging** - JSON structured logs with daily rotation
2. **Health Checks** - `/api/trpc/health.check` and `/api/trpc/health.detailed` endpoints
3. **Automated Backups** - HTTP endpoint for Cloud Scheduler integration
4. **Global Error Handling** - Comprehensive error mapping and async wrappers

### 🆕 New Endpoints
- `POST /api/trpc/backup.trigger` - Trigger database backup (requires BACKUP_TOKEN)
- `GET /api/trpc/backup.status` - Check backup status and history
- `GET /api/trpc/health.check` - Simple health check
- `GET /api/trpc/health.detailed` - Detailed system health with metrics

## Deployment Steps

### Option 1: Deploy via Manus UI (Recommended)

1. **Open the Manus Management UI**
   - Click the "Publish" button in the top-right corner
   - Select checkpoint `6c568ff8` (Phase 2 Complete + Deployment Tools)
   - Click "Deploy to Production"

2. **Wait for deployment** (2-5 minutes)
   - Google Cloud Build will automatically build and deploy
   - You'll receive a notification when complete

3. **Verify deployment**
   ```bash
   ./scripts/check-production-status.sh
   ```
   - All 5 checks should pass after deployment

### Option 2: Deploy via GitHub (Manual)

If you're using GitHub integration:

1. **Push to main branch**
   ```bash
   cd /home/ubuntu/mother-interface
   git push origin main
   ```

2. **Monitor Cloud Build**
   - Go to: https://console.cloud.google.com/cloud-build/builds?project=mothers-library-mcp
   - Watch the build progress
   - Deployment completes in 2-5 minutes

3. **Verify deployment**
   ```bash
   ./scripts/check-production-status.sh
   ```

## Post-Deployment: Setup Automated Backups

After deploying Phase 2, set up Cloud Scheduler for automated daily backups:

### Step 1: Generate Backup Token

```bash
# Generate a secure random token
BACKUP_TOKEN=$(openssl rand -hex 32)
echo "Save this token: $BACKUP_TOKEN"
```

### Step 2: Add Token to Cloud Run

```bash
gcloud run services update mother-interface \
  --region=australia-southeast1 \
  --update-env-vars=BACKUP_TOKEN=$BACKUP_TOKEN \
  --project=mothers-library-mcp
```

### Step 3: Create Cloud Scheduler Job

```bash
# Get service URL
SERVICE_URL="https://mother-interface-233196174701.australia-southeast1.run.app"

# Create daily backup job (2 AM Sydney time)
gcloud scheduler jobs create http mother-backup-daily \
  --location=australia-southeast1 \
  --schedule="0 2 * * *" \
  --time-zone="Australia/Sydney" \
  --uri="${SERVICE_URL}/api/trpc/backup.trigger" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --message-body="{\"token\":\"${BACKUP_TOKEN}\"}" \
  --project=mothers-library-mcp \
  --description="Daily database backup for MOTHER v14 at 2 AM Sydney time"
```

### Step 4: Test Backup

```bash
# Test the backup endpoint
curl -X POST "${SERVICE_URL}/api/trpc/backup.trigger" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"${BACKUP_TOKEN}\"}"

# Expected response:
# {
#   "success": true,
#   "message": "Database backup completed successfully",
#   "timestamp": "2026-02-21T04:30:00.000Z"
# }
```

## Monitoring Production

### Quick Health Check

```bash
./scripts/check-production-status.sh
```

Expected output after Phase 2 deployment:
```
========================================
MOTHER v14 - Production Status Check
========================================
✅ Service is reachable (HTTP 200)
✅ Health check PASSED
✅ Detailed health check PASSED
✅ MOTHER API endpoint is responding
✅ Response time is excellent (<1s)
========================================
📋 Summary
========================================
Checks passed: 5/5
✅ All systems operational
🎉 MOTHER v14 is healthy and running in production
========================================
```

### View Logs

```bash
# View recent logs
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=mother-interface" \
  --limit=50 \
  --project=mothers-library-mcp

# View errors only
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=mother-interface AND severity>=ERROR" \
  --limit=20 \
  --project=mothers-library-mcp
```

### Check Service Status

```bash
gcloud run services describe mother-interface \
  --region=australia-southeast1 \
  --project=mothers-library-mcp
```

## Rollback (If Needed)

If Phase 2 deployment has issues, rollback to Phase 1:

```bash
# List recent revisions
gcloud run revisions list \
  --service=mother-interface \
  --region=australia-southeast1 \
  --project=mothers-library-mcp

# Rollback to previous revision
gcloud run services update-traffic mother-interface \
  --region=australia-southeast1 \
  --to-revisions=<PREVIOUS_REVISION_NAME>=100 \
  --project=mothers-library-mcp
```

Or use Manus UI:
1. Go to Management UI → Checkpoints
2. Select previous checkpoint (`baa6ce44` - Phase 1)
3. Click "Rollback"
4. Click "Publish"

## Expected Results After Deployment

### ✅ Phase 1 (Already Deployed)
- Rate limiting active (100 req/15min global, 10 req/min MOTHER)
- Input validation with DOMPurify
- Database pooling (10 connections)
- HTTPS enforcement
- Security headers (Helmet)
- Request size limits (10MB)
- Graceful shutdown

### ✅ Phase 2 (Ready to Deploy - Checkpoint 6c568ff8)
- Winston logging (JSON + daily rotation)
- Health check endpoints
- Backup HTTP endpoints
- Global error handling
- Production monitoring tools

### 📊 Progress
- **Completed**: 11/35 corrections (31%)
- **Remaining**: 24 corrections (69%)
- **Next Phase**: Performance (Redis caching, message queue, optimization)

## Troubleshooting

### Health checks return 404
- **Cause**: Phase 2 not deployed yet
- **Solution**: Deploy checkpoint `6c568ff8`

### Backup endpoint returns 401
- **Cause**: `BACKUP_TOKEN` not set or incorrect
- **Solution**: Set environment variable in Cloud Run

### Service not responding
- **Check**: Cloud Run service status
- **Check**: Recent error logs
- **Check**: Database connectivity

## Support

For issues or questions:
- Check logs: `gcloud logging read ...`
- Monitor dashboard: https://console.cloud.google.com/run/detail/australia-southeast1/mother-interface?project=mothers-library-mcp
- Review checkpoint history in Manus UI

## Next Steps After Deployment

1. ✅ Verify all health checks pass
2. ✅ Set up Cloud Scheduler for automated backups
3. ✅ Test backup endpoint manually
4. 🔄 Continue to Phase 3 (Performance improvements)
5. 🔄 Add monitoring dashboards
6. 🔄 Set up alerting for failures

---

**Deployment Checklist**:
- [ ] Deploy checkpoint `6c568ff8` to production
- [ ] Run `./scripts/check-production-status.sh` to verify
- [ ] Generate and set `BACKUP_TOKEN` environment variable
- [ ] Create Cloud Scheduler job for daily backups
- [ ] Test backup endpoint manually
- [ ] Verify health checks return 200 OK
- [ ] Monitor logs for errors
- [ ] Document any issues encountered
