# Cloud Scheduler Setup for Automated Backups

## Overview
This guide explains how to set up Google Cloud Scheduler to trigger automated daily database backups for MOTHER v14 running on Cloud Run.

## Prerequisites
- MOTHER v14 deployed to Google Cloud Run
- `gcloud` CLI installed and authenticated
- Project ID: `mothers-library-mcp`
- Region: `australia-southeast1`

## Step 1: Set Backup Token Secret

First, generate a secure random token for backup authentication:

```bash
# Generate a secure random token (save this!)
BACKUP_TOKEN=$(openssl rand -hex 32)
echo "Your backup token: $BACKUP_TOKEN"

# Add the token as a Cloud Run environment variable
gcloud run services update mother-interface \
  --region=australia-southeast1 \
  --update-env-vars=BACKUP_TOKEN=$BACKUP_TOKEN \
  --project=mothers-library-mcp
```

## Step 2: Create Cloud Scheduler Job

Create a scheduled job that runs daily at 2 AM (Australia/Sydney timezone):

```bash
# Get the Cloud Run service URL
SERVICE_URL=$(gcloud run services describe mother-interface \
  --region=australia-southeast1 \
  --project=mothers-library-mcp \
  --format='value(status.url)')

echo "Service URL: $SERVICE_URL"

# Create the Cloud Scheduler job
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

## Step 3: Test the Backup Job

Test the backup manually before waiting for the scheduled run:

```bash
# Trigger the job manually
gcloud scheduler jobs run mother-backup-daily \
  --location=australia-southeast1 \
  --project=mothers-library-mcp

# Check the logs
gcloud scheduler jobs describe mother-backup-daily \
  --location=australia-southeast1 \
  --project=mothers-library-mcp
```

## Step 4: Verify Backup Execution

You can also test the backup endpoint directly using curl:

```bash
# Replace with your actual backup token and service URL
curl -X POST "${SERVICE_URL}/api/trpc/backup.trigger" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"${BACKUP_TOKEN}\"}"
```

Expected response:
```json
{
  "success": true,
  "message": "Database backup completed successfully",
  "timestamp": "2026-02-21T04:30:00.000Z",
  "output": "Backup completed: backups/mother_backup_20260221_043000.sql.gz"
}
```

## Step 5: Monitor Backup Status

Check recent backups:

```bash
curl -X GET "${SERVICE_URL}/api/trpc/backup.status?token=${BACKUP_TOKEN}"
```

## Backup Retention Policy

The backup script automatically:
- Creates compressed SQL dumps in `backups/` directory
- Keeps backups for 30 days
- Deletes backups older than 30 days
- Logs all operations to Winston logger

## Troubleshooting

### Check Cloud Scheduler logs:
```bash
gcloud logging read "resource.type=cloud_scheduler_job AND resource.labels.job_id=mother-backup-daily" \
  --limit=10 \
  --project=mothers-library-mcp
```

### Check Cloud Run logs:
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=mother-interface" \
  --limit=50 \
  --project=mothers-library-mcp \
  | grep -i backup
```

### Common Issues:

1. **401 Unauthorized**: Check that `BACKUP_TOKEN` environment variable is set correctly in Cloud Run
2. **500 Internal Error**: Check Cloud Run logs for database connection issues
3. **Job not running**: Verify timezone and schedule format in Cloud Scheduler

## Security Notes

- The backup token is required for all backup operations
- Never commit the `BACKUP_TOKEN` to version control
- Rotate the token periodically (every 90 days recommended)
- Backups are stored locally on the Cloud Run instance (ephemeral storage)
- For production, consider using Cloud Storage for backup persistence

## Alternative: Cloud Storage Backup

For persistent backups, modify the backup script to upload to Cloud Storage:

```bash
# Install Google Cloud Storage client
pnpm add @google-cloud/storage

# Update backup script to upload to GCS bucket
# See: https://cloud.google.com/storage/docs/uploading-objects
```

## Cost Estimate

- Cloud Scheduler: $0.10/month (1 job, 30 executions)
- Cloud Run: Minimal (backup runs ~30 seconds/day)
- Total: ~$0.10-0.20/month

## Next Steps

1. Set up Cloud Storage bucket for persistent backup storage
2. Configure backup retention policies in Cloud Storage
3. Set up alerting for backup failures
4. Create restore procedures documentation
