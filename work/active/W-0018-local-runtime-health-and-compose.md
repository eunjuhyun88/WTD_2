# W-0018 Local Runtime Health and Compose

## Goal

Add a minimal local runtime scaffold that exposes app/engine readiness endpoints and Docker Compose entry points without pretending the full production runtime split is already implemented.

## Owner

contract

## Scope

- add local Dockerfiles for `app-web` and `engine-api`
- add base and development compose files for a local multi-service run
- add an app-side `/readyz` route that reflects engine readiness for local orchestration
- keep the scope limited to local runtime scaffolding and readiness signaling

## Non-Goals

- implementing the full `worker-control` runtime
- introducing cloud deployment manifests
- changing engine scoring or pattern semantics
- adding production secrets management

## Canonical Files

- `work/active/W-0018-local-runtime-health-and-compose.md`
- `.env.example`
- `app/Dockerfile`
- `engine/Dockerfile`
- `docker-compose.yml`
- `docker-compose.dev.yml`
- `app/src/routes/readyz/+server.ts`
- `docs/runbooks/env-vars.md`
- `scripts/migrate.sh`
- `work/active/W-0012-runtime-split-and-state-plane.md`
- `work/active/W-0013-launch-readiness-program.md`

## Decisions

- local compose is a developer scaffold, not proof that the future runtime split is complete
- app readiness should degrade explicitly when engine readiness fails
- Dockerfiles should target one process per runtime and keep the public app and engine surfaces separate

## Next Steps

- verify `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build` on a machine with Docker or another Compose-compatible runtime installed
- decide whether local compose should eventually include a `worker-control` service stub
- add a short runbook if containerized local development becomes a default path
- revisit health/readiness depth when Redis/Postgres become real engine dependencies instead of placeholders

## Exit Criteria

- the repo has a coherent local multi-service scaffold for app and engine
- app readiness reflects engine readiness in a machine-readable way
- the local runtime scaffold is documented as a child step of the broader runtime-split plan

## Verification Notes

- 2026-04-14: `docker`, `podman`, `colima`, and `nerdctl` were not available in the local PATH, so Compose config/build/up verification could not run in this environment.
- 2026-04-14: app route contract tests passed for `src/routes/api/engine`, `src/routes/api/market/snapshot`, `src/routes/api/auth/session`, and `src/routes/api/cogochi/thermometer`.
- 2026-04-14: engine contract/observability tests passed for `tests/test_observability_metrics.py`, `tests/test_snapshot_versioning.py`, `tests/test_contract_score_roundtrip.py`, and `tests/test_contract_deep_roundtrip.py`.
- 2026-04-14: engine OpenAPI type sync check passed with generated app contract types up to date.
