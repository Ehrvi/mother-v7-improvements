# MOTHER v7.0 - Cloud Build + GitHub Setup Guide

**Repository:** mother-v7-improvements  
**URL:** https://github.com/Ehrvi/mother-v7-improvements  
**Status:** ✅ Already connected to local project

---

## 🎯 OBJECTIVE

Configure Google Cloud Build to automatically build and deploy MOTHER v7.0 to Cloud Run whenever code is pushed to the `mother-v7-improvements` repository.

---

## 📋 PREREQUISITES

- [x] GitHub repository: `Ehrvi/mother-v7-improvements` (already connected)
- [x] Google Cloud Project: `mothers-library-mcp`
- [x] Cloud Run service: `mother-interface` (already deployed)
- [x] Dockerfile in repository root (already exists)
- [ ] GitHub App permissions (needs fixing)
- [ ] Cloud Build trigger (needs creation)

---

## 🚀 STEP-BY-STEP SETUP

### Step 1: Fix GitHub App Permissions

**Problem:** Workflow file was removed due to GitHub App permission issue.

**Solution:**

1. Go to GitHub repository: https://github.com/Ehrvi/mother-v7-improvements
2. Click "Settings" tab
3. Navigate to "Integrations" → "GitHub Apps" in left sidebar
4. Find "Google Cloud Build" app
5. Click "Configure"
6. Ensure these permissions are enabled:
   - ✅ **Repository permissions:**
     - Contents: Read access
     - Metadata: Read access
     - Checks: Read and write
     - Deployments: Read and write
     - Pull requests: Read and write
   - ✅ **Organization permissions:**
     - Members: Read access
7. Click "Save"

**Verification:**
```bash
# Check if GitHub App is properly configured
gh api repos/Ehrvi/mother-v7-improvements/installation
```

---

### Step 2: Create Cloud Build Trigger

**Method 1: Via GCloud Console (RECOMMENDED)**

1. Open Google Cloud Console: https://console.cloud.google.com
2. Select project: `mothers-library-mcp`
3. Navigate to "Cloud Build" → "Triggers"
4. Click "CREATE TRIGGER"
5. Configure trigger:

   **Basic Settings:**
   - Name: `mother-interface-deploy`
   - Description: `Auto-deploy MOTHER v7.0 to Cloud Run on push to main`
   - Region: `australia-southeast1` (match Cloud Run region)
   - Tags: `mother, production, auto-deploy`

   **Event:**
   - Event: `Push to a branch`

   **Source:**
   - Repository: Click "CONNECT NEW REPOSITORY"
   - Select source: `GitHub (Cloud Build GitHub App)`
   - Authenticate with GitHub (if needed)
   - Select repository: `Ehrvi/mother-v7-improvements`
   - Click "CONNECT"
   
   **Configuration:**
   - Branch: `^main$` (regex to match only main branch)
   - Comment control: `Required except for owners and collaborators`

   **Build Configuration:**
   - Type: `Cloud Build configuration file (yaml or json)`
   - Location: `/cloudbuild.yaml`
   
   **Advanced (Optional):**
   - Substitution variables:
     - `_REGION`: `australia-southeast1`
     - `_SERVICE_NAME`: `mother-interface`
   - Service account: `<PROJECT_NUMBER>@cloudbuild.gserviceaccount.com`
   - Machine type: `N1_HIGHCPU_8` (faster builds)
   - Timeout: `1200s` (20 minutes)

6. Click "CREATE"

**Method 2: Via gcloud CLI**

```bash
gcloud builds triggers create github \
  --name="mother-interface-deploy" \
  --repo-name="mother-v7-improvements" \
  --repo-owner="Ehrvi" \
  --branch-pattern="^main$" \
  --build-config="cloudbuild.yaml" \
  --region="australia-southeast1" \
  --description="Auto-deploy MOTHER v7.0 to Cloud Run on push to main"
```

---

### Step 3: Create `cloudbuild.yaml`

Create file in repository root: `/home/ubuntu/mother-interface/cloudbuild.yaml`

```yaml
# MOTHER v7.0 - Cloud Build Configuration
# Auto-deploy to Cloud Run on push to main branch

steps:
  # Step 1: Build Docker image
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'gcr.io/$PROJECT_ID/mother-interface:$COMMIT_SHA'
      - '-t'
      - 'gcr.io/$PROJECT_ID/mother-interface:$SHORT_SHA'
      - '-t'
      - 'gcr.io/$PROJECT_ID/mother-interface:latest'
      - '--build-arg'
      - 'NODE_ENV=production'
      - '.'
    id: 'build-image'
    
  # Step 2: Push image to Container Registry
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'push'
      - 'gcr.io/$PROJECT_ID/mother-interface:$COMMIT_SHA'
    id: 'push-commit-sha'
    waitFor: ['build-image']
  
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'push'
      - 'gcr.io/$PROJECT_ID/mother-interface:$SHORT_SHA'
    id: 'push-short-sha'
    waitFor: ['build-image']
  
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'push'
      - 'gcr.io/$PROJECT_ID/mother-interface:latest'
    id: 'push-latest'
    waitFor: ['build-image']
  
  # Step 3: Deploy to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'mother-interface'
      - '--image'
      - 'gcr.io/$PROJECT_ID/mother-interface:$COMMIT_SHA'
      - '--region'
      - 'australia-southeast1'
      - '--platform'
      - 'managed'
      - '--allow-unauthenticated'
      - '--min-instances'
      - '0'
      - '--max-instances'
      - '10'
      - '--memory'
      - '512Mi'
      - '--cpu'
      - '1'
      - '--timeout'
      - '300'
      - '--set-env-vars'
      - 'NODE_ENV=production,DATABASE_URL=${_DATABASE_URL},OPENAI_API_KEY=${_OPENAI_API_KEY},JWT_SECRET=${_JWT_SECRET}'
    id: 'deploy-cloud-run'
    waitFor: ['push-commit-sha']

# Images to be pushed to Container Registry
images:
  - 'gcr.io/$PROJECT_ID/mother-interface:$COMMIT_SHA'
  - 'gcr.io/$PROJECT_ID/mother-interface:$SHORT_SHA'
  - 'gcr.io/$PROJECT_ID/mother-interface:latest'

# Build options
options:
  machineType: 'N1_HIGHCPU_8'
  logging: CLOUD_LOGGING_ONLY
  substitutionOption: 'ALLOW_LOOSE'

# Timeout for entire build
timeout: '1200s'

# Substitution variables (can be overridden in trigger)
substitutions:
  _REGION: 'australia-southeast1'
  _SERVICE_NAME: 'mother-interface'
  _DATABASE_URL: '' # Set in Cloud Build trigger
  _OPENAI_API_KEY: '' # Set in Cloud Build trigger
  _JWT_SECRET: 'mother-v7-production-secret-2026-ultra-secure-key-everton-garcia'
```

**IMPORTANT:** Environment variables like `DATABASE_URL` and `OPENAI_API_KEY` should be set in Cloud Build trigger settings as **secret variables**, NOT in `cloudbuild.yaml`.

---

### Step 4: Configure Secret Variables

**Method 1: Via GCloud Console**

1. Go to Cloud Build trigger settings
2. Scroll to "Substitution variables"
3. Add variables:
   - `_DATABASE_URL`: (paste full DATABASE_URL)
   - `_OPENAI_API_KEY`: (paste full OPENAI_API_KEY)
4. Click "SAVE"

**Method 2: Via Secret Manager (RECOMMENDED)**

1. Create secrets in Secret Manager:
```bash
# Create DATABASE_URL secret
echo -n "mysql://user:pass@host:port/db?ssl=true" | \
  gcloud secrets create mother-database-url --data-file=-

# Create OPENAI_API_KEY secret
echo -n "sk-proj-..." | \
  gcloud secrets create mother-openai-api-key --data-file=-
```

2. Grant Cloud Build access to secrets:
```bash
PROJECT_NUMBER=$(gcloud projects describe mothers-library-mcp --format="value(projectNumber)")

gcloud secrets add-iam-policy-binding mother-database-url \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding mother-openai-api-key \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

3. Update `cloudbuild.yaml` to use secrets:
```yaml
availableSecrets:
  secretManager:
    - versionName: projects/$PROJECT_ID/secrets/mother-database-url/versions/latest
      env: 'DATABASE_URL'
    - versionName: projects/$PROJECT_ID/secrets/mother-openai-api-key/versions/latest
      env: 'OPENAI_API_KEY'

steps:
  # ... (previous steps)
  
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'mother-interface'
      # ... (other args)
      - '--set-env-vars'
      - 'NODE_ENV=production,DATABASE_URL=$$DATABASE_URL,OPENAI_API_KEY=$$OPENAI_API_KEY,JWT_SECRET=${_JWT_SECRET}'
    secretEnv: ['DATABASE_URL', 'OPENAI_API_KEY']
```

---

### Step 5: Commit and Push `cloudbuild.yaml`

```bash
cd /home/ubuntu/mother-interface

# Create cloudbuild.yaml (already created in Step 3)

# Add to git
git add cloudbuild.yaml

# Commit
git commit -m "Add Cloud Build configuration for auto-deploy"

# Push to GitHub
git push github main
```

---

### Step 6: Test Deployment

**Manual Trigger (First Time):**

1. Go to Cloud Build → Triggers
2. Find `mother-interface-deploy` trigger
3. Click "RUN"
4. Select branch: `main`
5. Click "RUN TRIGGER"
6. Monitor build logs

**Automatic Trigger (After Setup):**

1. Make a test commit:
```bash
cd /home/ubuntu/mother-interface

# Make a small change
echo "# Test Cloud Build" >> README.md

# Commit and push
git add README.md
git commit -m "Test: Trigger Cloud Build auto-deploy"
git push github main
```

2. Verify trigger activation:
   - Go to Cloud Build → History
   - Check for new build with commit message "Test: Trigger Cloud Build auto-deploy"
   - Monitor build logs
   - Verify deployment to Cloud Run

---

## 🔍 VERIFICATION CHECKLIST

- [ ] GitHub App permissions configured
- [ ] Cloud Build trigger created
- [ ] `cloudbuild.yaml` committed to repository
- [ ] Secret variables configured (DATABASE_URL, OPENAI_API_KEY)
- [ ] Manual trigger test successful
- [ ] Automatic trigger test successful (push to main)
- [ ] Cloud Run service updated with new revision
- [ ] Production URL accessible: https://mother-interface-233196174701.australia-southeast1.run.app
- [ ] API key working (no 401 errors)
- [ ] Knowledge queries returning correct results

---

## 🚨 TROUBLESHOOTING

### Issue 1: Trigger Not Activating

**Symptoms:** Push to main branch doesn't trigger Cloud Build

**Causes:**
1. GitHub App permissions not configured
2. Branch pattern mismatch
3. Trigger disabled

**Solutions:**
1. Check GitHub App permissions (Step 1)
2. Verify branch pattern: `^main$` (exact match)
3. Enable trigger in Cloud Build console

### Issue 2: Build Fails with "Permission Denied"

**Symptoms:** Build fails with error "Permission denied: Unable to access secret"

**Causes:**
1. Cloud Build service account doesn't have access to Secret Manager
2. Secret doesn't exist

**Solutions:**
1. Grant secretAccessor role (Step 4, Method 2)
2. Verify secret exists: `gcloud secrets list`

### Issue 3: Deployment Fails with "Invalid Image"

**Symptoms:** Deploy step fails with "The provided image is not valid"

**Causes:**
1. Image not pushed to Container Registry
2. Image name mismatch

**Solutions:**
1. Check Container Registry: `gcloud container images list`
2. Verify image name matches in deploy step

### Issue 4: Environment Variables Not Set

**Symptoms:** Cloud Run service starts but fails with missing env vars

**Causes:**
1. Substitution variables not configured
2. Secret Manager not properly configured

**Solutions:**
1. Set substitution variables in trigger settings
2. Use Secret Manager (Step 4, Method 2)

---

## 📊 MONITORING

### Build Logs

View build logs in real-time:
```bash
# List recent builds
gcloud builds list --limit=10

# View specific build
gcloud builds log <BUILD_ID>
```

### Cloud Run Logs

View Cloud Run logs:
```bash
# Stream logs
gcloud run services logs read mother-interface \
  --region=australia-southeast1 \
  --limit=50 \
  --format="table(timestamp,severity,textPayload)"

# Follow logs (live)
gcloud run services logs tail mother-interface \
  --region=australia-southeast1
```

### Deployment History

View deployment history:
```bash
# List revisions
gcloud run revisions list \
  --service=mother-interface \
  --region=australia-southeast1 \
  --format="table(name,status,trafficPercent,creationTimestamp)"
```

---

## 🎯 BEST PRACTICES

1. **Always test manually first** before relying on automatic triggers
2. **Use Secret Manager** for sensitive data (DATABASE_URL, API keys)
3. **Tag images** with commit SHA for traceability
4. **Set build timeout** to prevent hanging builds (default: 10 minutes)
5. **Monitor build costs** - Cloud Build charges per build minute
6. **Use build cache** to speed up builds (Docker layer caching)
7. **Implement rollback strategy** - keep previous revisions available
8. **Set up notifications** for build failures (email, Slack, etc.)

---

## 📝 NEXT STEPS

1. ✅ Complete Step 1-6 above
2. ⏭️ Set up build notifications (optional)
3. ⏭️ Configure staging environment (optional)
4. ⏭️ Implement blue-green deployment (optional)
5. ⏭️ Add automated testing in build pipeline (optional)

---

**Guide Created:** 2026-02-20 05:20 AM  
**Author:** Manus AI (MOTHER v7.0)  
**Confidence:** 10/10 ✅
