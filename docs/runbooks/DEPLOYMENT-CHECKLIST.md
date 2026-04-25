# 🚀 Production Deployment Checklist

**Status:** Ready for deployment (2026-04-25)  
**Last Updated:** 2026-04-25  
**Audience:** Deployment operator with GCP + Vercel access

---

## 📋 Prerequisites

Before starting, you need:

- [ ] Python 3.11+ with uv or pip
- [ ] `google-cloud-scheduler` library: `pip install google-cloud-scheduler`
- [ ] `requests` library: `pip install requests`
- [ ] GCP `gcloud` CLI authenticated
- [ ] GCP Project ID
- [ ] SCHEDULER_SECRET from Cloud Run `cogotchi` service (GCP Console → Cloud Run → cogotchi → Environment tab)
- [ ] 32-byte hex encryption key (generate below)
- [ ] Vercel API token (or `VERCEL_TOKEN` env var)

---

## 🔐 Prepare Credentials

```bash
# Generate encryption key
export ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo "Your key: $ENCRYPTION_KEY"

# Get from GCP Console
export GCP_PROJECT_ID="your-project-id"
export SCHEDULER_SECRET="your-secret-from-gcp"

# Get from Vercel Settings
export VERCEL_TOKEN="your-vercel-api-token"
```

---

## ✅ One Command Setup

All infrastructure (Cloud Scheduler + Vercel Env) via one Python script:

```bash
cd /Users/ej/Projects/wtd-v2

python scripts/setup_infra.py \
  --gcp-project $GCP_PROJECT_ID \
  --scheduler-secret $SCHEDULER_SECRET \
  --encryption-key $ENCRYPTION_KEY \
  --vercel-token $VERCEL_TOKEN
```

**What it does:**
- ✅ Creates `feature-materialization-run` Cloud Scheduler job (every 15 min)
- ✅ Creates `raw-ingest-run` Cloud Scheduler job (every 60 min)
- ✅ Sets `EXCHANGE_ENCRYPTION_KEY` in Vercel production
- ✅ Verifies all 3 infrastructure pieces are live

---

## 🧪 Smoke Test

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

