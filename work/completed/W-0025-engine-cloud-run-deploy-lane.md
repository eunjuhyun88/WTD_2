# W-0025 Engine Cloud Run Deploy Lane

## Goal

Make `engine/` deployable to Google Cloud Run from this monorepo without relying on ambiguous source-repo auto-detection.

## Owner

engine

## Scope

- add canonical deployment artifacts for building the engine container from the repo root
- document the intended Cloud Run deploy path for `engine-api`
- keep the slice focused on deterministic build/deploy mechanics, not broader runtime refactors

## Non-Goals

- changing the app-web Vercel deployment path
- implementing IAM/IAP protection for engine routes
- extracting scheduler/control-plane work out of `engine-api`
- provisioning actual GCP resources from this task

## Canonical Files

- `work/active/W-0025-engine-cloud-run-deploy-lane.md`
- `engine/Dockerfile`
- `cloudbuild.engine.yaml`
- `.dockerignore`
- `docs/runbooks/cloud-run-engine-deploy.md`

## Decisions

- Cloud Run source-repo auto-build is not the canonical deployment lane for this repo because the monorepo contains multiple deployable surfaces
- the canonical engine image build uses the repo root as Docker build context and `engine/Dockerfile` as the Dockerfile path
- deployment should target a prebuilt container image in Artifact Registry, not rely on buildpack inference

## Next Steps

- validate the engine Docker build path locally or in Cloud Build
- add route/auth hardening once the public deployment path is stable
- separate scheduler/control-plane runtime from the public engine service before production hardening

## Exit Criteria

- a reproducible build config exists for producing the engine container image from this repo
- the deploy path is documented with the required substitutions and env vars
- future Cloud Run setup does not depend on trial-and-error in the console
