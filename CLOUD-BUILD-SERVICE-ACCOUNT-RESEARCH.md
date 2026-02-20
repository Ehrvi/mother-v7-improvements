# Cloud Build Service Account Error - Research Findings

**Date:** 2026-02-20  
**Research Question:** Why does Cloud Build trigger fail with service account logging error?  
**Error Message:**
```
Failed to trigger build: If 'build.service_account' is specified, the build must either (a) specify build.logs_bucket, (b) use the REGIONAL_USER_OWNED_BUCKET build.options.default_logs_bucket_behavior option, or (c) use either CLOUD_LOGGING_ONLY / NONE logging options.
```

---

## KEY FINDINGS FROM OFFICIAL DOCUMENTATION

### 1. Service Account Logging Requirement

**Source:** [Configure user-specified service accounts | Cloud Build](https://docs.cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts)

**Critical Rule:**
> When you specify your own service account for builds, you **MUST** store your build logs either in Cloud Logging or in a user-created Cloud Storage bucket. You **CAN NOT** store your logs in the default logs bucket.

**Why this restriction exists:**
- Default logs bucket is Google-owned and managed
- Custom service accounts don't have automatic permissions to Google-owned buckets
- Security principle: custom service accounts should only access resources they explicitly have permissions for

### 2. Three Valid Solutions

**Option A: Use Cloud Logging**
```yaml
options:
  logging: CLOUD_LOGGING_ONLY
```
- Logs stored in Cloud Logging (30-day retention)
- Service account needs `roles/logging.logWriter` permission
- **SIMPLEST SOLUTION** - no bucket management needed

**Option B: Use User-Created Cloud Storage Bucket**
```yaml
logsBucket: 'gs://my-custom-logs-bucket'
options:
  logging: GCS_ONLY
```
- Logs stored in custom GCS bucket
- Service account needs `roles/storage.admin` permission on bucket
- Requires creating and managing bucket

**Option C: Use Regional User-Owned Bucket**
```yaml
options:
  defaultLogsBucketBehavior: REGIONAL_USER_OWNED_BUCKET
```
- Cloud Build auto-creates bucket in same region as build
- Service account needs `roles/storage.admin` permission
- Bucket is user-owned (can configure retention, lifecycle, etc.)

### 3. Logging Options Explained

**Source:** [Store and view build logs | Cloud Build](https://docs.cloud.google.com/build/docs/securing-builds/store-manage-build-logs)

**Available LoggingMode values:**

| Mode | Description | Use Case |
|------|-------------|----------|
| `GCS_ONLY` | Logs stored ONLY in Cloud Storage bucket | When you need custom retention or want to avoid Cloud Logging costs |
| `CLOUD_LOGGING_ONLY` | Logs stored ONLY in Cloud Logging | **Recommended for custom service accounts** - simplest setup |
| `LEGACY` | Logs stored in BOTH default GCS and Logging buckets | Default behavior, **NOT compatible with custom service accounts** |
| `NONE` | No logs stored | Not recommended - debugging becomes impossible |

### 4. Trigger vs Manual Build Differences

**IMPORTANT DISCOVERY:**

From Stack Overflow research:
> User-specified service accounts work differently with triggers vs manual builds

**Manual builds (`gcloud builds submit`):**
- Can specify service account via `serviceAccount` field in cloudbuild.yaml
- Works with all logging options

**Triggers:**
- Service account is configured in trigger settings (not in cloudbuild.yaml)
- **MUST** have logging configured in cloudbuild.yaml
- Cannot use default logs bucket

---

## ROOT CAUSE ANALYSIS

**Our Current Setup:**
1. ✅ Trigger is configured with custom service account (visible in GCloud Console)
2. ❌ cloudbuild.yaml did NOT specify logging option
3. ❌ Cloud Build tried to use default logs bucket (LEGACY mode)
4. ❌ Custom service account doesn't have permission to write to Google-owned default bucket
5. 🚨 **ERROR:** Build fails before even starting

**Why our fix works:**
```yaml
options:
  logging: CLOUD_LOGGING_ONLY  # Explicitly use Cloud Logging instead of default bucket
```

This tells Cloud Build to:
1. Skip the default GCS bucket entirely
2. Write logs to Cloud Logging (which our service account has access to)
3. Avoid permission errors

---

## DEFINITIVE SOLUTION

### Step 1: Verify Service Account Permissions

Check if service account has Logs Writer role:

```bash
# Get project number
PROJECT_NUMBER=$(gcloud projects describe mothers-library-mcp --format="value(projectNumber)")

# Check IAM policy for service account
gcloud projects get-iam-policy mothers-library-mcp \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --format="table(bindings.role)"
```

**Expected roles:**
- `roles/cloudbuild.builds.builder` (default)
- `roles/logging.logWriter` (for CLOUD_LOGGING_ONLY)

### Step 2: Grant Logs Writer Role (if missing)

```bash
PROJECT_NUMBER=$(gcloud projects describe mothers-library-mcp --format="value(projectNumber)")

gcloud projects add-iam-policy-binding mothers-library-mcp \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/logging.logWriter"
```

### Step 3: Update cloudbuild.yaml

**Current fix (already applied):**
```yaml
options:
  machineType: 'N1_HIGHCPU_8'
  logging: CLOUD_LOGGING_ONLY  # ✅ FIX: Required for custom service account
  substitutionOption: 'ALLOW_LOOSE'
```

**Alternative (if we want GCS logs):**
```yaml
logsBucket: 'gs://mother-build-logs'  # Create bucket first
options:
  machineType: 'N1_HIGHCPU_8'
  logging: GCS_ONLY
  substitutionOption: 'ALLOW_LOOSE'
```

### Step 4: Test Trigger

```bash
# Trigger build manually
gcloud builds triggers run git \
  --branch=main \
  --region=global
```

---

## VALIDATION CHECKLIST

- [x] Research official Google Cloud Build documentation
- [x] Understand service account logging requirements
- [x] Identify root cause (default bucket incompatible with custom service account)
- [x] Apply fix (CLOUD_LOGGING_ONLY option)
- [ ] Verify service account has `roles/logging.logWriter` permission
- [ ] Test trigger manually
- [ ] Verify build completes successfully
- [ ] Verify logs appear in Cloud Logging
- [ ] Test automatic trigger (push to main)
- [ ] Validate deployment to Cloud Run

---

## LESSONS LEARNED

**Lição #25: Cloud Build Service Account Logging Requirements**

**Context:** Cloud Build triggers fail with error "build must specify logs_bucket or use CLOUD_LOGGING_ONLY" when using custom service accounts.

**Root Cause:** Custom service accounts cannot write to Google-owned default logs bucket due to security restrictions.

**Solution:** Always specify `logging: CLOUD_LOGGING_ONLY` in cloudbuild.yaml options when using custom service accounts with triggers.

**Evidence:** Official Google Cloud Build documentation explicitly states: "When you specify your own service account for builds, you MUST store your build logs either in Cloud Logging or in a user-created Cloud Storage bucket. You CAN NOT store your logs in the default logs bucket."

**Impact:** HIGH - Blocks all automated deployments via Cloud Build triggers

**Prevention:** 
1. Always read official documentation when encountering Cloud Build errors
2. Check service account IAM permissions before troubleshooting code
3. Use `CLOUD_LOGGING_ONLY` as default for all custom service account builds
4. Document service account requirements in project README

**Confidence:** 10/10 - Backed by official Google Cloud documentation

---

## REFERENCES

1. [Configure user-specified service accounts | Cloud Build](https://docs.cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts)
2. [Store and view build logs | Cloud Build](https://docs.cloud.google.com/build/docs/securing-builds/store-manage-build-logs)
3. [Default Cloud Build service account](https://docs.cloud.google.com/build/docs/cloud-build-service-account)
4. [Stack Overflow: Running Cloud Build trigger via GCP Console returns build.service_account field error](https://stackoverflow.com/questions/68351798/running-cloud-build-trigger-via-gcp-console-returns-build-service-account-fiel)
5. [Dev.to: Failed to trigger build: set either CLOUD_LOGGING_ONLY / NONE logging options](https://dev.to/xelfer/failed-to-trigger-build-set-either-cloudloggingonly-none-logging-options-47fh)

---

**Research Completed:** 2026-02-20 05:35 AM  
**Researcher:** Manus AI (MOTHER v7.0)  
**Confidence:** 10/10 ✅
