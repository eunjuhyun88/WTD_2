# Engine Deploy — Cloud Run

Engine and worker are deployed manually via Cloud Build.

## Pre-deploy checklist

- [ ] `engine/` tests pass: `pytest engine/tests/`
- [ ] `BETA_OPEN` or job env flags set correctly (see [beta-flags.md](./beta-flags.md))
- [ ] Cloud Run env vars up to date (see [secrets.md](./secrets.md))
- [ ] Engine URL in Vercel env (`ENGINE_URL`) matches target service

## Deploy engine API

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_APP_ORIGIN=https://app.cogotchi.dev .
```

Service: `cogotchi` in `asia-southeast1`.

## Deploy worker

```bash
gcloud builds submit --config cloudbuild.worker.yaml .
```

## Post-deploy verify

```bash
# Readiness check — expect { "status": "ok" } or "degraded" (LightGBM untrained is ok)
curl https://cogotchi-103912432221.asia-southeast1.run.app/readyz

# Pattern states
curl https://cogotchi-103912432221.asia-southeast1.run.app/patterns/states | jq '.patterns | keys'

# Recent transitions
curl https://cogotchi-103912432221.asia-southeast1.run.app/patterns/transitions?limit=5
```

## Rollback

Cloud Run keeps previous revisions. To roll back:

```bash
gcloud run revisions list --service=cogotchi --region=asia-southeast1
gcloud run services update-traffic cogotchi \
  --region=asia-southeast1 \
  --to-revisions=REVISION_NAME=100
```

## Build substitutions

| Variable | Default | Description |
|---|---|---|
| `_IMAGE_NAME` | `wtd-engine-api` | Artifact Registry image name |
| `_SERVICE_NAME` | `cogotchi` | Cloud Run service name |
| `_AR_REGION` | `asia-southeast1` | Artifact Registry region |
| `_AR_REPOSITORY` | — | Artifact Registry repo name |
| `_APP_ORIGIN` | — | Allowed CORS origin for the app |

## Required Cloud Run Environment Variables

For 1-cycle pattern validation to work end-to-end, the following env vars must be set on the Cloud Run engine service:

| Variable | Default | Production Value | Purpose |
|---|---|---|---|
| `ENABLE_PATTERN_REFINEMENT_JOB` | `false` | `true` | Activates V-track re-validation after 10+ verdicts |
| `ENABLE_SEARCH_CORPUS_JOB` | `false` | `true` | Refreshes search corpus with new feature windows |

To apply:

```bash
gcloud run services update <ENGINE_SERVICE_NAME> \
  --region <REGION> \
  --set-env-vars "ENABLE_PATTERN_REFINEMENT_JOB=true,ENABLE_SEARCH_CORPUS_JOB=true"
```
