# Deploy Targets

## Engine — Cloud Run (canonical)

| Field | Value |
|---|---|
| Service name | `cogotchi` |
| Region | `asia-southeast1` |
| Build config | `cloudbuild.yaml` |
| Image name | `wtd-engine-api` |
| Canonical URL | `https://cogotchi-103912432221.asia-southeast1.run.app` |

The engine is deployed manually via `gcloud builds submit`. See [deploy-engine.md](./deploy-engine.md).

**Dead service**: `wtd-2-3u7pi6ndna-uk.a.run.app` — orphan Cloud Run service in a different region, not used by any current code. Delete via GCP console when confirmed.

## App — Vercel (canonical)

| Field | Value |
|---|---|
| Framework | SvelteKit |
| Adapter | `@sveltejs/adapter-vercel` |
| Production branch | `release` |
| Deploy trigger | commit message contains `[deploy]` (vercel.json guard) |
| Config | `app/vercel.json` |

Push to `release` branch with `[deploy]` in the commit message triggers Vercel auto-deploy.
Manual deploy: `vercel deploy --prod` from `app/` directory.

Cloud Run app (`app-web` service, `cloudbuild.app.yaml`) is **DEPRECATED for production** — Vercel is the canonical app host.

## Worker — Cloud Run

| Field | Value |
|---|---|
| Build config | `cloudbuild.worker.yaml` |
| Purpose | Background scan worker, separate from API |

Deployed alongside the engine. See [deploy-engine.md](./deploy-engine.md).

## Supabase (Database)

Project URL: `https://hbcgipcqpuintokoooyg.supabase.co`
Migrations live in `app/supabase/migrations/` — apply with Supabase CLI or dashboard SQL editor.
