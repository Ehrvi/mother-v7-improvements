# MOTHER v19.0 Deploy & Final Delivery TODO

## Phase 1: Install and Configure gcloud CLI
- [ ] Install gcloud SDK to /home/ubuntu
- [ ] Add gcloud to PATH
- [ ] Authenticate using Application Default Credentials
- [ ] Set project to mothers-library-mcp

## Phase 2: Configure Cloud Run Environment Variables
- [ ] Update Cloud Run service with GCP_PROJECT_ID
- [ ] Update Cloud Run service with GCP_LOCATION
- [ ] Update Cloud Run service with GCP_SERVICE_ACCOUNT_EMAIL
- [ ] Update Cloud Run service with CLOUD_RUN_URL
- [ ] Verify environment variables are set correctly
- [ ] Grant run.invoker permission to service account
- [ ] Grant cloudtasks.enqueuer permission to service account

## Phase 3: Deploy v19.0 Code to Cloud Run
- [ ] Clone repository to /tmp/mother-v19
- [ ] Checkout feature/sota-evolution-v19-v22 branch
- [ ] Verify new files exist (cloudTasks.ts, worker.ts, orchestrator-async.ts)
- [ ] Deploy to Cloud Run using gcloud
- [ ] Verify deployment successful

## Phase 4: 5-Paper Validation Experiment
- [ ] Execute createStudyJob with maxPapers=5
- [ ] Verify response time < 30 seconds
- [ ] Verify papersEnqueued = 5
- [ ] Check Cloud Tasks dashboard for 5 tasks
- [ ] Record actual metrics (response time, papers enqueued)

## Phase 5: 100-Paper Scale Test
- [ ] Execute createStudyJob with maxPapers=100
- [ ] Wait 30-60 minutes for processing
- [ ] Query knowledge area status
- [ ] Verify papersCount >= 90 (90% success rate)
- [ ] Verify status = "completed"
- [ ] Record empirical metrics (papersCount, chunksCount, cost, time)
- [ ] Check Cloud Run logs for no timeout errors

## Phase 6: Download AI-INSTRUCTIONS.md from Google Drive
- [ ] Download AI-INSTRUCTIONS.md using rclone
- [ ] Copy to /tmp/mother-v19 repository
- [ ] Commit to Git with descriptive message
- [ ] Push to feature branch

## Phase 7: Generate Scientific Documentation
- [ ] Create README-V19.0.md with real experimental data
- [ ] Create AWAKE-V9.md with empirical metrics
- [ ] Replace all [VALOR REAL] placeholders with actual values
- [ ] Commit documentation to Git

## Phase 8: Create Pull Request and Deliver
- [ ] Push all changes to feature branch
- [ ] Create Pull Request with gh CLI
- [ ] Generate final delivery report with PR link
- [ ] Include README-V19.0.md content
- [ ] Include AWAKE-V9.md content
- [ ] Include Cloud Tasks dashboard URL
