# Cloud Run App-Web Deploy

Canonical deploy path for `app-web` when the SvelteKit surface must run on Google Cloud Run instead of Vercel.

## Why This Path

`app-web` currently defaults to the Vercel adapter. Cloud Run needs a Node server build, so the deploy lane must switch the adapter to `@sveltejs/adapter-node` while preserving the existing Vercel path.

## Build Target

- default target: `APP_DEPLOY_TARGET=vercel`
- Cloud Run target: `APP_DEPLOY_TARGET=cloudrun`

Local verification:

```bash
cd app
APP_DEPLOY_TARGET=cloudrun npm run build
```

The Cloud Run target emits the Node adapter bundle at `app/build`, which is started with:

```bash
node build
```

## Cloud Build Config

Use `/cloudbuild.app.yaml` from the repo root.

Notes:

- `--update-env-vars` is encoded with a custom delimiter because `SECURITY_ALLOWED_HOSTS` contains commas.
- The Cloud Run runtime service account must have `roles/secretmanager.secretAccessor` on:
  - `app-web-engine-internal-secret`
  - `app-web-database-url`
  - `app-web-secrets-encryption-key`
- After the first successful deploy, confirm the actual `status.url` with `gcloud run services describe app-web --region us-east4` and ensure that host is included in both `PUBLIC_SITE_URL` and `SECURITY_ALLOWED_HOSTS`.

Required substitutions:

- `_AR_REGION`
- `_AR_REPOSITORY`
- `_IMAGE_NAME`
- `_SERVICE_NAME`
- `_SERVICE_REGION`
- `_ENGINE_URL`
- `_PUBLIC_SITE_URL`
- `_PUBLIC_SUPABASE_URL`
- `_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `_ALLOWED_HOSTS`
- `_ENGINE_INTERNAL_SECRET_SECRET`
- `_DATABASE_URL_SECRET`
- `_SECRETS_ENCRYPTION_KEY_SECRET`

## Manual Build

```bash
gcloud builds submit \
  --config cloudbuild.app.yaml \
  --substitutions _SERVICE_NAME=app-web,_SERVICE_REGION=us-east4,_IMAGE_TAG=latest \
  .
```

## Required Runtime Env

Non-secret env:

- `APP_DEPLOY_TARGET=cloudrun`
- `ENGINE_URL=https://<engine-host>`
- `PUBLIC_SITE_URL=https://<app-host>`
- `PUBLIC_SUPABASE_URL=https://<project>.supabase.co`
- `PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>`
- `SECURITY_ALLOWED_HOSTS=<app-host>,<cloud-run-host>`
- `SECURITY_TRUST_PROXY_HEADERS=true`

Secret Manager-backed env:

- `ENGINE_INTERNAL_SECRET`
- `DATABASE_URL`
- `SECRETS_ENCRYPTION_KEY`

## Verification

After deploy:

```bash
curl -fsS https://<app-host>/readyz
curl -I https://<app-host>
```

Current observed behavior on the direct `run.app` host:

- `/readyz` reaches the app and is the canonical external smoke endpoint.
- `/healthz` may return a Google 404 without reaching the app process.

If `/readyz` fails while the root still serves `200`, the usual cause is app → engine configuration (`ENGINE_URL` or `ENGINE_INTERNAL_SECRET`) rather than the Cloud Run app container itself.
