# W-0026 Runtime Deploy Hardening

## Goal

Make the repository deployable with explicit runtime separation between public `engine-api` traffic and background `worker-control` scheduling.

## Owner

engine

## Scope

- prevent the public engine API process from always starting scheduler/control-plane jobs
- add canonical build/deploy artifacts for `engine-api` and `worker-control`
- document the required Cloud Build trigger path and Cloud Run configuration for both runtimes

## Non-Goals

- changing app-web product behavior
- implementing full internal IAM auth for engine routes
- redesigning engine route contracts
- provisioning GCP resources automatically from this repository

## Canonical Files

- `work/active/W-0026-runtime-deploy-hardening.md`
- `engine/api/main.py`
- `engine/observability/health.py`
- `engine/Dockerfile`
- `engine/worker/Dockerfile`
- `cloudbuild.yaml`
- `cloudbuild.worker.yaml`
- `docs/runbooks/cloud-run-engine-deploy.md`

## Decisions

- `engine-api` must not implicitly run scheduler/control-plane jobs in public Cloud Run deployments
- scheduler startup is controlled via an explicit environment variable
- `worker-control` gets its own container image and Cloud Build config
- GitHub-triggered deployment must use Cloud Build configuration files, not Cloud Run source-Dockerfile inference

## Next Steps

- wire GCP trigger substitutions to real project values
- validate deployed `engine-api` with `/healthz` and `/readyz`
- decide whether internal routes need shared-secret or IAM protection

## Exit Criteria

- public engine API and worker scheduler have separate deploy paths
- public engine readiness is accurate when scheduler is disabled
- build/deploy no longer relies on Cloud Run Dockerfile auto-detection
