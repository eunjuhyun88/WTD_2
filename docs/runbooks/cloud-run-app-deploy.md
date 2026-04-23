# Cloud Run App Deploy

Canonical deploy path for `app-web` when the public surface runs on Google Cloud Run instead of Vercel.

## Why This Path

`app-web` is still surface and orchestration only, but the repo needs one fully server-operable topology:

- `app-web` on Cloud Run
- `engine-api` on Cloud Run
- `worker-control` on Cloud Run
- Postgres/Supabase + Redis as shared managed state

This runbook keeps that topology compatible with the existing Vercel lane by using a dual-target SvelteKit build. `APP_BUILD_TARGET=cloud-run` selects `@sveltejs/adapter-node`; the default build path remains Vercel.

## Prerequisites

- Google Cloud project with Cloud Run, Cloud Build, and Artifact Registry enabled
- Artifact Registry repository named `wtd`
- authenticated `gcloud` CLI
- deployed `engine-api` URL and `ENGINE_INTERNAL_SECRET`
- app runtime secrets prepared in Secret Manager or another managed secret source

## Required Runtime Inputs

Minimum app-web runtime env:

- `ENGINE_URL`
- `ENGINE_INTERNAL_SECRET`
- `DATABASE_URL`
- `PUBLIC_SITE_URL`
- `SECURITY_ALLOWED_HOSTS`

Strongly recommended:

- `SHARED_CACHE_REDIS_REST_URL`
- `SHARED_CACHE_REDIS_REST_TOKEN`
- `RATE_LIMIT_REDIS_REST_URL`
- `RATE_LIMIT_REDIS_REST_TOKEN`
- `TURNSTILE_SECRET_KEY`
- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SECRETS_ENCRYPTION_KEY`

Rules:

- never set `SUPABASE_SERVICE_ROLE_KEY` on `app-web`
- `DATABASE_URL` should use the least-privilege app role, not a privileged admin DSN
- `SECURITY_ALLOWED_HOSTS` should include the Cloud Run host and any custom domain

## Canonical Cloud Build Trigger

Use a Cloud Build trigger that points at:

- configuration path: `/cloudbuild.app.yaml`
- branch regex: `^main$`

Substitutions:

- `_AR_REGION`
- `_AR_REPOSITORY`
- `_IMAGE_NAME`
- `_SERVICE_NAME`
- `_SERVICE_REGION`

## Initial Bootstrap

The Cloud Build deploy config intentionally does not overwrite app env/secrets on every deploy. Bootstrap them once, then let `cloudbuild.app.yaml` roll images forward.

Example bootstrap:

```bash
export SERVICE=app-web
export REGION=us-east4

gcloud run services update "$SERVICE" \
  --region "$REGION" \
  --update-env-vars \
NODE_ENV=production,ENGINE_URL=https://engine-api-xxxx.us-east4.run.app,PUBLIC_SITE_URL=https://app-web-xxxx.us-east4.run.app,SECURITY_ALLOWED_HOSTS=app-web-xxxx.us-east4.run.app
```

Example secret attachment:

```bash
export SERVICE=app-web
export REGION=us-east4

gcloud run services update "$SERVICE" \
  --region "$REGION" \
  --update-secrets \
DATABASE_URL=app-db-url:latest,ENGINE_INTERNAL_SECRET=engine-internal-secret:latest,SECRETS_ENCRYPTION_KEY=secrets-encryption-key:latest,TURNSTILE_SECRET_KEY=turnstile-secret-key:latest,PUBLIC_SUPABASE_URL=public-supabase-url:latest,PUBLIC_SUPABASE_PUBLISHABLE_KEY=public-supabase-publishable-key:latest
```

Adjust names to your Secret Manager convention.

## Manual Build And Deploy

```bash
gcloud builds submit \
  --config cloudbuild.app.yaml \
  .
```

`cloudbuild.app.yaml` does the following:

- builds `app/Dockerfile` with `APP_BUILD_TARGET=cloud-run`
- pushes `app-web` image to Artifact Registry
- deploys the image to Cloud Run
- preserves previously configured runtime env/secrets

Recommended starting service shape:

- request-based billing
- minimum instances `0`
- maximum instances `3`
- CPU `1`
- memory `1Gi`
- container port `8080`

## Health Checks

After deploy, verify:

- `GET /healthz`
- `GET /readyz`
- one representative proxy route such as `GET /api/facts/reference-stack`

Example:

```bash
curl -fsS https://app-web-xxxx.us-east4.run.app/healthz
curl -fsS https://app-web-xxxx.us-east4.run.app/readyz
curl -fsS "https://app-web-xxxx.us-east4.run.app/api/facts/reference-stack?symbol=BTC&timeframe=1h"
```

`/readyz` returns `503` when `engine-api` is unreachable. That is expected and is the intended operator signal.

## Notes

- this path keeps `app-web` portable: Vercel remains the default build target, Cloud Run is the canonical full-server target
- keep `engine-api` and `worker-control` as separate Cloud Run services; do not collapse them back into app-web
- if you add custom domains, update both `PUBLIC_SITE_URL` and `SECURITY_ALLOWED_HOSTS`
