# Cloud Run Engine Deploy

Canonical deploy path for `engine-api`.

## Why This Path

This repository is a monorepo with multiple deployable surfaces. Build the engine image from the `engine/` directory explicitly so Cloud Run and Cloud Build target the Python service only.

## Prerequisites

- Google Cloud project with Cloud Run, Cloud Build, and Artifact Registry APIs enabled
- Artifact Registry repository named `wtd`
- authenticated `gcloud` CLI

## Canonical Build

Build the engine container with the `engine/` directory as the Docker build context.

```bash
gcloud builds submit \
  --config cloudbuild.engine.yaml \
  --substitutions _IMAGE=us-east4-docker.pkg.dev/PROJECT_ID/wtd/engine-api:latest \
  .
```

Replace:

- `PROJECT_ID` with your GCP project id
- `us-east4` with your chosen Cloud Run / Artifact Registry region

If you use the Cloud Run console with source-repo deployment:

- build type: `Dockerfile`
- source location: `/engine/Dockerfile`

## Canonical Deploy

```bash
gcloud run deploy engine-api \
  --image us-east4-docker.pkg.dev/PROJECT_ID/wtd/engine-api:latest \
  --region us-east4 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars APP_ORIGIN=https://YOUR_VERCEL_DOMAIN,ENGINE_PORT=8000
```

Recommended starting flags:

- request-based billing
- minimum instances `0`
- maximum instances `3`
- CPU `1`
- memory `512MiB`
- container port `8000`

## Required Environment Variables

- `APP_ORIGIN=https://YOUR_VERCEL_DOMAIN`
- `ENGINE_PORT=8000`

Optional engine-side env vars should be added as needed for provider keys or background tasks.

## Health Checks

After deploy, verify:

- `/healthz`
- `/readyz`

Example:

```bash
curl -fsS https://engine-api-xxxx.REGION.run.app/healthz
curl -fsS https://engine-api-xxxx.REGION.run.app/readyz
```

## Notes

- `engine-api` is currently a public HTTP service if deployed with `--allow-unauthenticated`
- route hardening and control-plane extraction are separate tasks
