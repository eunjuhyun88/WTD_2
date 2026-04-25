# Cloud Scheduler Setup — Engine Background Jobs

Manual steps to register the two HTTP scheduler jobs after GCP Cloud Run deploy.

## Prerequisites

- PR #252 merged and deployed (endpoints live on `cogotchi`)
- `SCHEDULER_SECRET` env var set on the `cogotchi` Cloud Run service
- `gcloud` CLI authenticated with the correct project

## Verify endpoints are live

```bash
curl -sf https://cogotchi-103912432221.asia-southeast1.run.app/jobs/status \
  -H "Authorization: Bearer $SCHEDULER_SECRET"
```

Expected: `{"jobs": [...], "ok": true}`

## Register job 1 — feature_materialization (every 15 min)

```bash
gcloud scheduler jobs create http feature-materialization-run \
  --location asia-southeast1 \
  --schedule "*/15 * * * *" \
  --uri "https://cogotchi-103912432221.asia-southeast1.run.app/jobs/feature_materialization/run" \
  --http-method POST \
  --headers "Authorization=Bearer $SCHEDULER_SECRET,Content-Type=application/json" \
  --message-body '{}' \
  --time-zone "UTC" \
  --attempt-deadline 840s
```

## Register job 2 — raw_ingest (every 60 min)

```bash
gcloud scheduler jobs create http raw-ingest-run \
  --location asia-southeast1 \
  --schedule "0 * * * *" \
  --uri "https://cogotchi-103912432221.asia-southeast1.run.app/jobs/raw_ingest/run" \
  --http-method POST \
  --headers "Authorization=Bearer $SCHEDULER_SECRET,Content-Type=application/json" \
  --message-body '{}' \
  --time-zone "UTC" \
  --attempt-deadline 3300s
```

## Verify jobs registered

```bash
gcloud scheduler jobs list --location asia-southeast1
```

## Manual trigger (test run)

```bash
gcloud scheduler jobs run feature-materialization-run --location asia-southeast1
gcloud scheduler jobs run raw-ingest-run --location asia-southeast1
```

Then check logs:

```bash
gcloud run services logs read cogotchi --region asia-southeast1 --limit 50
```

## Worker service trigger (if not yet configured)

If `cogotchi-worker` Cloud Build trigger is missing, add it in GCP Console:

1. Cloud Build → Triggers → Create Trigger
2. Name: `deploy-worker-on-main`
3. Event: Push to branch `^main$`
4. Configuration: Cloud Build configuration file
5. Location: `/cloudbuild.worker.yaml`
6. Service account: same as the API trigger

## Notes

- `SCHEDULER_SECRET` must match `ENGINE_SCHEDULER_SECRET` on the Cloud Run service
- The worker service (`cogotchi-worker`) runs with `ENGINE_ENABLE_SCHEDULER=true` and handles the actual job logic
- The API service (`cogotchi`) exposes the HTTP trigger endpoints; the worker holds the Redis distributed lock
- If you see `409 conflict` on a trigger, the previous job is still running — this is correct behavior (Redis lock prevents overlap)
