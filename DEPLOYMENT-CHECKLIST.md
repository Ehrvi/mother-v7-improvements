# 🚀 MOTHER v7.0 - Deployment Checklist

## Pre-Deployment

- [ ] All tests passing locally (`pnpm test`)
- [ ] TypeScript compilation successful (0 errors)
- [ ] Code changes committed
- [ ] Checkpoint saved with descriptive message

## Deployment

- [ ] Run `gcloud run deploy` command
- [ ] Wait for "Done" message
- [ ] Note new revision number (e.g., 00044-xyz)
- [ ] Verify Service URL returned

## Post-Deployment Validation

- [ ] Test health endpoint: `curl {URL}/api/trpc/mother.health`
- [ ] Test simple query: `curl -X POST {URL}/api/trpc/mother.query`
- [ ] Verify quality scores (should be 90-100)
- [ ] Check response time (<15s)
- [ ] Verify new features working (CoT, ReAct, etc.)

## Final Verification

- [ ] Run full test suite against GCloud URL
- [ ] Compare local vs production results
- [ ] Document revision number in checkpoint
- [ ] Confirm all metrics match expectations

## Lessons Applied

- **LEI 1 (Brutal Honesty):** Never claim "DONE" without full validation
- **LEI 4 (Persistence):** Complete entire cycle, no shortcuts
- **LEI 12 (Scientific Method):** Follow process rigorously

## Current Status

**Last Deployment:**
- Revision: 00043-znm
- Date: 2026-02-19
- Status: ⚠️ INCOMPLETE (Iteration 17 not deployed)

**Next Deployment:**
- Target: Iteration 17 (test fixes)
- Expected revision: 00044-xxx
- Status: 🔄 IN PROGRESS
