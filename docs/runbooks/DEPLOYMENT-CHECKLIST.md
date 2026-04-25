# 🚀 Production Deployment Checklist

**Status:** Ready for deployment (2026-04-25)  
**Last Updated:** 2026-04-25  
**Audience:** Deployment operator with GCP + Vercel access

---

## 📋 Prerequisites

Before starting, you need:

- [ ] GCP `gcloud` CLI installed and authenticated
- [ ] Vercel CLI installed and authenticated (`npm i -g vercel && vercel login`)
- [ ] GCP Project ID (e.g., `cogotchi-xxxx`)
- [ ] Access to GitHub repo `eunjuhyun88/wtd-v2`
- [ ] SCHEDULER_SECRET from Cloud Run `cogotchi` service (get from GCP console)
- [ ] 32-byte hex encryption key (or generate new one below)

---

## 🔐 Generate EXCHANGE_ENCRYPTION_KEY

If you don't have a key, generate one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Output: 64 hex characters (32 bytes)
```

Save this safely — you'll use it in **Step 3**.

---

## ✅ Step 1: Setup Cloud Scheduler Jobs (Terraform)

**What:** Registers two recurring HTTP jobs (feature_materialization every 15min, raw_ingest every hour)

```bash
# Navigate to project root
cd /Users/ej/Projects/wtd-v2

# Create terraform variables file
cat > scripts/infra/terraform.tfvars <<EOF
gcp_project_id    = "YOUR_GCP_PROJECT_ID"
gcp_region        = "asia-southeast1"
scheduler_secret  = "YOUR_SCHEDULER_SECRET"
EOF

# Initialize and apply
cd scripts/infra
terraform init
terraform plan     # Review what will be created
terraform apply    # Create the jobs
cd ../../
```

**Verification:**
```bash
gcloud scheduler jobs list --location=asia-southeast1
# Should see: feature-materialization-run, raw-ingest-run
```

---

## ✅ Step 2: Setup Cloud Build Trigger

**What:** Auto-deploys `cogotchi-worker` service when main branch changes

```bash
bash scripts/infra/gcp-cloudbuild-trigger-setup.sh YOUR_GCP_PROJECT_ID
```

**Verification:**
```bash
gcloud builds triggers list --filter="name:deploy-worker-on-main"
# Should see: deploy-worker-on-main (GitHub, branch: main, config: cloudbuild.worker.yaml)
```

---

## ✅ Step 3: Setup Vercel Environment Variable

**What:** Sets `EXCHANGE_ENCRYPTION_KEY` in Vercel production environment

```bash
bash scripts/infra/vercel-env-setup.sh YOUR_64_HEX_ENCRYPTION_KEY
```

**Verification:**
```bash
vercel env list --production | grep EXCHANGE_ENCRYPTION_KEY
# Should show: EXCHANGE_ENCRYPTION_KEY (production)
```

---

## ✅ Step 4: Run Full Verification

**What:** Confirms all 3 infrastructure components are in place

```bash
bash scripts/infra/verify-deployment-ready.sh YOUR_GCP_PROJECT_ID
```

**Expected output:**
```
✅ feature-materialization-run exists
✅ raw-ingest-run exists
✅ deploy-worker-on-main trigger exists
✅ EXCHANGE_ENCRYPTION_KEY set in production
✅ cogotchi service responding

🎉 All checks passed! Ready for production deployment.
```

If any checks fail, the script will print which setup script to run.

---

## 🧪 Step 5: Production Smoke Test

Once all infrastructure is deployed, test the core loop:

1. **Open terminal**: https://app.wtd.example.com/terminal
2. **Select symbol** (e.g., BTCUSDT, ETHUSDT)
3. **Select timeframe** by dragging on chart
4. **Hit ANALYZE** button
5. **Check SCAN results** — should show 10 similar patterns
6. **Save a pattern** with save setup modal
7. **Navigate to JUDGE tab** — should show saved pattern
8. **View Dashboard** — should show recent capture

**What to expect:**
- **SCAN responds** in <2 sec with 10 patterns
- **Chart loads** with real-time data
- **Patterns save** to Supabase (check `capture_records` table)
- **No 500 errors** in Vercel logs or browser console

---

## 📊 Monitoring After Deployment

### Cloud Run Logs

```bash
# Watch live logs from cogotchi service
gcloud run services logs read cogotchi --region=asia-southeast1 --limit=50 --follow

# Check for errors
gcloud run services logs read cogotchi --region=asia-southeast1 --limit=100 | grep -i error
```

### Cloud Scheduler Job Runs

```bash
# Check if jobs are running
gcloud scheduler jobs describe feature-materialization-run --location=asia-southeast1
# Look for: nextExecutionTime, lastExecutionTime, state=ENABLED

# Manual trigger (for testing)
gcloud scheduler jobs run feature-materialization-run --location=asia-southeast1
```

### Vercel Deployment

```bash
# Check latest deployment status
vercel deployments list --limit=5

# View logs
vercel logs
```

### Database

```bash
# Check Supabase audit_log for job executions
# Navigate to: https://app.supabase.com → project → SQL Editor
SELECT * FROM audit_log 
WHERE event_type = 'job_execution' 
ORDER BY created_at DESC 
LIMIT 20;
```

---

## 🚨 Rollback Procedure

If something goes wrong:

### Option 1: Disable Scheduler Jobs (Quick)

```bash
# Pause jobs without deleting
gcloud scheduler jobs pause feature-materialization-run --location=asia-southeast1
gcloud scheduler jobs pause raw-ingest-run --location=asia-southeast1

# Resume later
gcloud scheduler jobs resume feature-materialization-run --location=asia-southeast1
gcloud scheduler jobs resume raw-ingest-run --location=asia-southeast1
```

### Option 2: Revert Vercel Deployment

```bash
# Rollback to previous production deployment
vercel rollback
```

### Option 3: Disable Cloud Build Trigger

```bash
# In GCP Console: Cloud Build → Triggers → deploy-worker-on-main → Disable
```

---

## 📞 Troubleshooting

### Cloud Scheduler: 409 Conflict on Trigger

**Symptom:** Job returns HTTP 409 when triggered manually

**Cause:** Previous job still running (Redis distributed lock active)

**Solution:** This is **normal behavior**. The Redis lock prevents overlapping runs. Just wait for the current job to complete.

---

### Vercel Deployment Stuck

**Symptom:** `vercel env add` hangs or fails

**Solution:**
```bash
# Check authentication
vercel whoami

# Re-authenticate if needed
vercel login

# Try again with explicit project
vercel env add EXCHANGE_ENCRYPTION_KEY --scope production
```

---

### Cloud Run Service 500 Errors

**Check logs:**
```bash
gcloud run services logs read cogotchi --region=asia-southeast1 --limit=50 | grep "ERROR\|Traceback"
```

**Common causes:**
- Missing `SCHEDULER_SECRET` env var → GCP Console → Cloud Run → cogotchi → Set env var
- Stale JWT key → Redeploy service to refresh JWKS cache
- Database migration missing → Check `engine/migrations/` version against prod DB

---

## ✅ Final Checklist

- [ ] GCP `gcloud` CLI ready
- [ ] Vercel CLI ready
- [ ] SCHEDULER_SECRET from Cloud Run noted
- [ ] EXCHANGE_ENCRYPTION_KEY generated and saved safely
- [ ] Step 1: Terraform Scheduler jobs deployed
- [ ] Step 2: Cloud Build trigger created
- [ ] Step 3: Vercel env var set
- [ ] Step 4: Full verification passed
- [ ] Step 5: Smoke test successful
- [ ] Cloud Run logs monitored for 24 hours
- [ ] Dashboard shows recent patterns

**Deployment complete!** 🎉

---

## 📚 Related Docs

- `docs/runbooks/cloud-scheduler-setup.md` — Manual scheduler setup (if not using Terraform)
- `work/active/CURRENT.md` — Current work status
- `AGENTS.md` — Team execution rules

