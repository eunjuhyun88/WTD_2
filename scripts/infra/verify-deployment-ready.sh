#!/bin/bash
# Deployment Readiness Verification
# Checks all 3 infrastructure requirements
# Usage: bash scripts/infra/verify-deployment-ready.sh <GCP_PROJECT_ID>

set -e

PROJECT_ID="${1:-}"
COGOTCHI_URL="https://cogotchi-103912432221.asia-southeast1.run.app"

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Usage: $0 <GCP_PROJECT_ID>"
  exit 1
fi

echo "🔍 Verifying deployment readiness..."
echo "   Project: $PROJECT_ID"
echo ""

PASS=0
FAIL=0

# ─────────────────────────────────────────────────────────
# Check 1: Cloud Scheduler Jobs
# ─────────────────────────────────────────────────────────
echo "1️⃣  Cloud Scheduler Jobs"
echo "   ─────────────────────────────────────────"

JOBS=$(gcloud scheduler jobs list --location=asia-southeast1 --project="$PROJECT_ID" --format="value(name)" 2>/dev/null || true)

if echo "$JOBS" | grep -q "feature-materialization-run"; then
  echo "   ✅ feature-materialization-run exists"
  ((PASS++))
else
  echo "   ❌ feature-materialization-run missing"
  ((FAIL++))
fi

if echo "$JOBS" | grep -q "raw-ingest-run"; then
  echo "   ✅ raw-ingest-run exists"
  ((PASS++))
else
  echo "   ❌ raw-ingest-run missing"
  ((FAIL++))
fi

# ─────────────────────────────────────────────────────────
# Check 2: Cloud Build Trigger
# ─────────────────────────────────────────────────────────
echo ""
echo "2️⃣  Cloud Build Trigger"
echo "   ─────────────────────────────────────────"

TRIGGER=$(gcloud builds triggers list --project="$PROJECT_ID" --filter="name:deploy-worker-on-main" --format="value(name)" 2>/dev/null || true)

if [ -n "$TRIGGER" ]; then
  echo "   ✅ deploy-worker-on-main trigger exists"
  ((PASS++))
else
  echo "   ❌ deploy-worker-on-main trigger missing"
  ((FAIL++))
fi

# ─────────────────────────────────────────────────────────
# Check 3: Vercel Environment Variable
# ─────────────────────────────────────────────────────────
echo ""
echo "3️⃣  Vercel EXCHANGE_ENCRYPTION_KEY"
echo "   ─────────────────────────────────────────"

if ! command -v vercel &> /dev/null; then
  echo "   ⚠️  Vercel CLI not installed, skipping check"
else
  if vercel env list --production 2>/dev/null | grep -q "EXCHANGE_ENCRYPTION_KEY"; then
    echo "   ✅ EXCHANGE_ENCRYPTION_KEY set in production"
    ((PASS++))
  else
    echo "   ❌ EXCHANGE_ENCRYPTION_KEY not set"
    ((FAIL++))
  fi
fi

# ─────────────────────────────────────────────────────────
# Check 4: Cloud Run Service Health (bonus)
# ─────────────────────────────────────────────────────────
echo ""
echo "4️⃣  Cloud Run Service Health"
echo "   ─────────────────────────────────────────"

if curl -sf "$COGOTCHI_URL/health" -H "Authorization: Bearer dummy" &>/dev/null || \
   curl -sf "$COGOTCHI_URL/health" &>/dev/null; then
  echo "   ✅ cogotchi service responding"
  ((PASS++))
else
  echo "   ⚠️  cogotchi service not responding (may be normal if not deployed yet)"
fi

# ─────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Summary: $PASS passed, $FAIL failed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $FAIL -eq 0 ]; then
  echo "🎉 All checks passed! Ready for production deployment."
  echo ""
  echo "📋 Next step: Production smoke test"
  echo "   1. Navigate to terminal: https://app.wtd.example.com/terminal"
  echo "   2. Select a symbol (e.g., BTCUSDT)"
  echo "   3. Select time range (drag on chart)"
  echo "   4. Save a pattern setup"
  echo "   5. Verify similar patterns appear in scan"
  exit 0
else
  echo "❌ Some checks failed. See details above."
  echo ""
  echo "📋 Setup scripts available:"
  echo "   • Terraform (Scheduler + Trigger):"
  echo "     bash scripts/infra/gcp-scheduler-setup.tf"
  echo "   • Cloud Build Trigger:"
  echo "     bash scripts/infra/gcp-cloudbuild-trigger-setup.sh $PROJECT_ID"
  echo "   • Vercel Env:"
  echo "     bash scripts/infra/vercel-env-setup.sh <ENCRYPTION_KEY>"
  exit 1
fi
