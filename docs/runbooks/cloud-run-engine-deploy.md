# Cloud Run Engine Deploy

Canonical deploy path for `engine-api` and `worker-control`.

## Why This Path

This repository is a monorepo with multiple deployable surfaces. Use an explicit Cloud Build config so GitHub pushes build and deploy the engine service deterministically.

## Prerequisites

- Google Cloud project with Cloud Run, Cloud Build, and Artifact Registry APIs enabled
- Artifact Registry repository named `wtd`
- authenticated `gcloud` CLI

## Canonical Continuous Deploy

Use a Cloud Build trigger that points at the repository root config file for the public API:

- configuration type: `Cloud Build configuration file`
- configuration path: `/cloudbuild.yaml`
- branch regex: `^main$`

This matches the official Cloud Build + Cloud Run flow, where a trigger reads a config file that builds the image, pushes it to Artifact Registry, and then deploys to Cloud Run. [Google Cloud Build: Deploying to Cloud Run](https://docs.cloud.google.com/build/docs/deploying-builds/deploy-cloud-run)

Set these substitutions in `cloudbuild.yaml` before enabling the trigger:

- `_AR_REGION`
- `_AR_REPOSITORY`
- `_IMAGE_NAME`
- `_SERVICE_NAME`
- `_SERVICE_REGION`
- `_APP_ORIGIN`

For `worker-control`, create a second trigger:

- configuration type: `Cloud Build configuration file`
- configuration path: `/cloudbuild.worker.yaml`
- branch regex: `^main$`

Set these substitutions in `cloudbuild.worker.yaml` before enabling the trigger:

- `_AR_REGION`
- `_AR_REPOSITORY`
- `_IMAGE_NAME`
- `_SERVICE_NAME`
- `_SERVICE_REGION`

## Manual Build

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

- do not use the `Dockerfile` configuration mode
- use `Cloud Build configuration file`
- point it at `/cloudbuild.yaml` for the public API
- point it at `/cloudbuild.worker.yaml` for worker-control

## Canonical Deploy

```bash
gcloud run deploy engine-api \
  --image us-east4-docker.pkg.dev/PROJECT_ID/wtd/engine-api:latest \
  --region us-east4 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars APP_ORIGIN=https://YOUR_VERCEL_DOMAIN,ENGINE_PORT=8000
```

Recommended starting flags for `engine-api`:

- request-based billing
- minimum instances `0`
- maximum instances `3`
- CPU `1`
- memory `512MiB`
- container port `8000`

`cloudbuild.yaml` deploys `engine-api` with:

- `ENGINE_ENABLE_SCHEDULER=false`
- `APP_ORIGIN=https://YOUR_VERCEL_DOMAIN`
- `ENGINE_PORT=8000`

## Worker Deploy

`cloudbuild.worker.yaml` deploys a separate `worker-control` service using `engine/worker/Dockerfile`.

Recommended starting flags for `worker-control`:

- request-based billing or instance-based depending on run cadence
- no public access
- minimum instances `0`
- maximum instances `1`
- CPU `1`
- memory `512MiB`
- `ENGINE_ENABLE_SCHEDULER=true`

## Required Environment Variables

- `APP_ORIGIN=https://YOUR_VERCEL_DOMAIN`
- `ENGINE_PORT=8000`

Optional engine-side env vars should be added as needed for provider keys or background tasks.

If worker jobs need Supabase or provider credentials, add them to the worker service rather than the public API service unless they are also needed by request/response routes.

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
- `worker-control` should not be exposed publicly
- route hardening remains a separate task, but control-plane extraction is now represented in the deploy lane
