#!/bin/bash
# GCP Cloud Build Trigger Setup for cogotchi-worker
# Usage: bash scripts/infra/gcp-cloudbuild-trigger-setup.sh <GCP_PROJECT_ID>

set -e

PROJECT_ID="${1:-}"
GITHUB_OWNER="${GITHUB_OWNER:-eunjuhyun88}"
GITHUB_REPO="${GITHUB_REPO:-wtd-v2}"

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Usage: $0 <GCP_PROJECT_ID>"
  echo "   Example: $0 cogotchi-project-id"
  exit 1
fi

echo "🔧 Setting up Cloud Build trigger for cogotchi-worker..."
echo "   Project: $PROJECT_ID"
echo "   Repo: $GITHUB_OWNER/$GITHUB_REPO"
echo ""

# Check if trigger already exists
EXISTING=$(gcloud builds triggers list --project="$PROJECT_ID" --filter="name:deploy-worker-on-main" --format="value(name)" 2>/dev/null || true)

if [ -n "$EXISTING" ]; then
  echo "✅ Cloud Build trigger 'deploy-worker-on-main' already exists"
  echo "   Name: $EXISTING"
  exit 0
fi

# Create trigger
echo "📝 Creating Cloud Build trigger..."
gcloud builds triggers create github \
  --project="$PROJECT_ID" \
  --name="deploy-worker-on-main" \
  --repo-name="$GITHUB_REPO" \
  --repo-owner="$GITHUB_OWNER" \
  --branch-pattern="^main$" \
  --build-config="cloudbuild.worker.yaml" \
  --substitutions="_REGION=asia-southeast1" \
  --description="Deploy cogotchi-worker Cloud Run service on main branch push"

echo "✅ Cloud Build trigger created successfully!"
echo ""
echo "📋 Next steps:"
echo "   1. Verify trigger in Cloud Console:"
echo "      https://console.cloud.google.com/cloud-build/triggers?project=$PROJECT_ID"
echo "   2. Manual test run:"
echo "      gcloud builds triggers run deploy-worker-on-main --branch=main --project=$PROJECT_ID"
echo ""
