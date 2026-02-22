# MOTHER v14 - Git Remote Documentation

**Date**: 2026-02-22  
**Purpose**: Document all Git remote configurations for MOTHER v14  
**Status**: ✅ Verified Against Production

---

## Executive Summary

MOTHER v14 uses **dual Git remotes** for deployment and backup:
1. **`github`**: Production remote (GitHub) connected to Cloud Build
2. **`origin`**: Backup remote (Manus S3) for webdev checkpoints

**Key Points**:
- ✅ GitHub remote triggers automatic Cloud Build deployments
- ✅ Manus S3 remote stores webdev checkpoints (version history)
- ✅ Both remotes are synced (same commit: `8be3c51`)
- ✅ Repository is **private** (security best practice)

---

## Git Remotes

### 1. GitHub Remote (Production)

**Name**: `github`  
**URL**: `https://github.com/Ehrvi/mother-v7-improvements.git`  
**Type**: HTTPS  
**Purpose**: Production deployment + Cloud Build trigger

**Configuration**:
```bash
git remote -v
# github  https://github.com/Ehrvi/mother-v7-improvements.git (fetch)
# github  https://github.com/Ehrvi/mother-v7-improvements.git (push)
```

**Repository Details**:
- **Owner**: Ehrvi
- **Name**: mother-v7-improvements
- **Visibility**: PRIVATE ✅
- **Created**: 2026-02-19T07:29:34Z
- **Last Push**: 2026-02-22T03:51:45Z
- **Default Branch**: main
- **URL**: https://github.com/Ehrvi/mother-v7-improvements

**Cloud Build Integration**:
- ✅ Cloud Build trigger connected
- ✅ Automatic deployment on push to `main`
- ✅ Build configuration: `cloudbuild.yaml`
- ✅ Region: australia-southeast1

**Push Workflow**:
```bash
# 1. Make changes
git add -A
git commit -m "feat: your changes"

# 2. Push to GitHub (triggers Cloud Build)
git push github main

# 3. Monitor deployment
gcloud builds list --limit=1

# 4. Verify production
curl -s https://mother-interface-qtvghovzxa-ts.a.run.app/api/health | jq .
```

**Authentication**:
- Method: HTTPS (no SSH key required)
- Credentials: Stored in Git credential helper
- Token: GitHub Personal Access Token (PAT) with `repo` scope

---

### 2. Manus S3 Remote (Backup)

**Name**: `origin`  
**URL**: `s3://vida-prod-gitrepo/webdev-git/310419663030225316/25NeaJLRyMKQFYzeZChVTB`  
**Type**: S3  
**Purpose**: Webdev checkpoint storage + version history

**Configuration**:
```bash
git remote -v
# origin  s3://vida-prod-gitrepo/webdev-git/310419663030225316/25NeaJLRyMKQFYzeZChVTB (fetch)
# origin  s3://vida-prod-gitrepo/webdev-git/310419663030225316/25NeaJLRyMKQFYzeZChVTB (push)
```

**S3 Bucket Details**:
- **Bucket**: vida-prod-gitrepo
- **Path**: webdev-git/310419663030225316/25NeaJLRyMKQFYzeZChVTB
- **User ID**: 310419663030225316
- **Project ID**: 25NeaJLRyMKQFYzeZChVTB
- **Region**: (managed by Manus platform)

**Webdev Checkpoint Integration**:
- ✅ Automatic push on `webdev_save_checkpoint`
- ✅ Version history stored in S3
- ✅ Rollback support via `webdev_rollback_checkpoint`
- ✅ Checkpoint metadata stored in Manus database

**Push Workflow**:
```bash
# Automatic push via webdev_save_checkpoint tool
# Manual push (not recommended):
git push origin main
```

**Authentication**:
- Method: S3 credentials
- Credentials: Managed by Manus platform
- Access: Read/write for project owner only

---

## Git Configuration

### User Configuration

```bash
git config --list | grep user
# user.name=Manus
# user.email=dev-agent@manus.ai
# user.name=Ehrvi
# user.email=255472276+Ehrvi@users.noreply.github.com
```

**Active User** (for commits):
- Name: Manus
- Email: dev-agent@manus.ai

**GitHub User** (for authentication):
- Name: Ehrvi
- Email: 255472276+Ehrvi@users.noreply.github.com

---

### Branch Configuration

```bash
git branch -a
# * main
#   remotes/github/main
#   remotes/origin/HEAD -> origin/main
#   remotes/origin/main
```

**Local Branch**:
- Name: `main`
- Tracking: `origin/main` (default)
- Status: ✅ Up-to-date with both remotes

**Remote Branches**:
- `github/main`: Production branch (GitHub)
- `origin/main`: Backup branch (Manus S3)

**Branch Tracking**:
```bash
git config --list | grep branch
# branch.main.remote=origin
# branch.main.merge=refs/heads/main
```

---

## Deployment Workflow

### Standard Deployment (via GitHub)

**Step 1: Make Changes**
```bash
cd /home/ubuntu/mother-interface

# Edit code
vim server/routers.ts

# Run tests
pnpm test

# Check types
pnpm typecheck
```

**Step 2: Commit Changes**
```bash
git add -A
git commit -m "feat: add new feature"
```

**Step 3: Push to GitHub**
```bash
git push github main
```

**Step 4: Monitor Deployment**
```bash
# Watch Cloud Build
gcloud builds list --limit=1 --format="table(id,status,createTime,duration)"

# Follow logs
gcloud builds log <build-id> --stream
```

**Step 5: Verify Production**
```bash
# Health check
curl -s https://mother-interface-qtvghovzxa-ts.a.run.app/api/health | jq .

# Test query
curl -X POST "https://mother-interface-qtvghovzxa-ts.a.run.app/api/trpc/mother.query?batch=1" \
  -H "Content-Type: application/json" \
  -d '{"0":{"json":{"query":"test","useCache":false}}}'
```

---

### Webdev Checkpoint Deployment (via Manus)

**Step 1: Save Checkpoint**
```bash
# Use webdev_save_checkpoint tool in Manus
# This automatically:
# 1. Commits changes to Git
# 2. Pushes to origin (S3)
# 3. Creates checkpoint metadata in database
# 4. Generates checkpoint version ID
```

**Step 2: Push to GitHub**
```bash
# After checkpoint, manually push to GitHub for deployment
git push github main
```

**Step 3: Rollback (if needed)**
```bash
# Use webdev_rollback_checkpoint tool in Manus
# This automatically:
# 1. Fetches checkpoint from S3
# 2. Resets Git to checkpoint commit
# 3. Restores project files
# 4. Updates database metadata
```

---

## Git Commands Reference

### Remote Management

**List Remotes**:
```bash
git remote -v
```

**Add Remote**:
```bash
git remote add <name> <url>
```

**Remove Remote**:
```bash
git remote remove <name>
```

**Rename Remote**:
```bash
git remote rename <old-name> <new-name>
```

**Change Remote URL**:
```bash
git remote set-url <name> <new-url>
```

---

### Fetch & Pull

**Fetch from GitHub**:
```bash
git fetch github
```

**Fetch from Manus S3**:
```bash
git fetch origin
```

**Pull from GitHub**:
```bash
git pull github main
```

**Pull from Manus S3**:
```bash
git pull origin main
```

---

### Push

**Push to GitHub**:
```bash
git push github main
```

**Push to Manus S3**:
```bash
git push origin main
```

**Force Push** (⚠️ dangerous):
```bash
git push github main --force
```

---

### Branch Management

**List Branches**:
```bash
git branch -a
```

**Create Branch**:
```bash
git branch <branch-name>
```

**Switch Branch**:
```bash
git checkout <branch-name>
```

**Delete Branch**:
```bash
git branch -d <branch-name>
```

**Push Branch to Remote**:
```bash
git push github <branch-name>
```

---

## Troubleshooting

### Issue: Push to GitHub Fails

**Symptoms**:
```
error: failed to push some refs to 'https://github.com/Ehrvi/mother-v7-improvements.git'
hint: Updates were rejected because the remote contains work that you do not have locally.
```

**Diagnosis**:
```bash
# Check local vs remote commits
git log --oneline --graph --all --decorate

# Check remote status
git fetch github
git status
```

**Solutions**:

**Option A: Pull and Merge** (recommended)
```bash
git pull github main
# Resolve conflicts if any
git push github main
```

**Option B: Rebase** (cleaner history)
```bash
git pull --rebase github main
# Resolve conflicts if any
git push github main
```

**Option C: Force Push** (⚠️ dangerous, only if you're sure)
```bash
git push github main --force
```

---

### Issue: Authentication Failed

**Symptoms**:
```
remote: Invalid username or password.
fatal: Authentication failed for 'https://github.com/Ehrvi/mother-v7-improvements.git'
```

**Diagnosis**:
```bash
# Check stored credentials
git config --list | grep credential

# Test GitHub authentication
gh auth status
```

**Solutions**:

**Option A: Re-authenticate with GitHub CLI**
```bash
gh auth login
# Follow prompts to authenticate
```

**Option B: Update Git credentials**
```bash
# Remove old credentials
git credential reject
protocol=https
host=github.com

# Push again (will prompt for new credentials)
git push github main
```

**Option C: Use Personal Access Token**
```bash
# Generate PAT at https://github.com/settings/tokens
# Use PAT as password when prompted
git push github main
```

---

### Issue: Divergent Branches

**Symptoms**:
```
Your branch and 'github/main' have diverged,
and have 5 and 3 different commits each, respectively.
```

**Diagnosis**:
```bash
# Visualize divergence
git log --oneline --graph --all --decorate

# Check commits on each branch
git log github/main..main  # Local commits not on GitHub
git log main..github/main  # GitHub commits not local
```

**Solutions**:

**Option A: Merge** (preserves both histories)
```bash
git merge github/main
# Resolve conflicts if any
git push github main
```

**Option B: Rebase** (linear history)
```bash
git rebase github/main
# Resolve conflicts if any
git push github main --force-with-lease
```

**Option C: Reset** (⚠️ loses local commits)
```bash
git reset --hard github/main
git push github main --force
```

---

## Security Best Practices

### 1. Keep Repository Private

**Current Status**: ✅ PRIVATE

**Rationale**:
- Contains sensitive configuration (database URLs, API keys)
- Prevents unauthorized access to codebase
- Reduces attack surface

**Verification**:
```bash
gh repo view Ehrvi/mother-v7-improvements --json visibility
# Expected: "visibility": "PRIVATE"
```

---

### 2. Use HTTPS (not SSH)

**Current Status**: ✅ HTTPS

**Rationale**:
- No SSH key management required
- Works in Manus sandbox without additional setup
- Easier to rotate credentials (PAT)

**Configuration**:
```bash
git remote -v
# Expected: https://github.com/... (not git@github.com:...)
```

---

### 3. Rotate Personal Access Tokens

**Recommendation**: Rotate GitHub PAT every 90 days

**Steps**:
1. Generate new PAT at https://github.com/settings/tokens
2. Update Git credentials:
   ```bash
   git credential reject
   protocol=https
   host=github.com
   
   git push github main  # Will prompt for new PAT
   ```
3. Revoke old PAT in GitHub settings

---

### 4. Never Commit Secrets

**Current Status**: ✅ No secrets in Git

**Protection**:
- `.env` files in `.gitignore`
- Secrets stored in Google Secret Manager
- Environment variables injected at runtime

**Verification**:
```bash
# Check for accidentally committed secrets
git log --all --full-history -- .env
# Expected: (empty output)

# Scan for secrets in codebase
git secrets --scan
```

---

## Validation

This document was validated against actual Git configuration on 2026-02-22.

**Validation Commands**:
```bash
# Verify remotes
git remote -v | wc -l  # Expected: 4 (2 remotes × 2 operations)

# Verify GitHub remote
git remote get-url github  # Expected: https://github.com/Ehrvi/mother-v7-improvements.git

# Verify S3 remote
git remote get-url origin  # Expected: s3://vida-prod-gitrepo/...

# Verify branch tracking
git config branch.main.remote  # Expected: origin

# Verify last commit
git log -1 --oneline  # Expected: 8be3c51 (HEAD -> main, origin/main, github/main)
```

**Validation Status**: ✅ **100% ACCURATE**

---

## References

- [Git Documentation](https://git-scm.com/doc)
- [GitHub CLI Documentation](https://cli.github.com/manual/)
- [Google Cloud Build Triggers](https://cloud.google.com/build/docs/automating-builds/create-manage-triggers)
- [Manus Webdev Documentation](https://docs.manus.im/webdev)

---

**Document Version**: 1.0  
**Last Updated**: 2026-02-22  
**Status**: ✅ **VERIFIED AGAINST PRODUCTION**  
**Gap Resolved**: GAP-008 (Git Remotes Not Documented)
