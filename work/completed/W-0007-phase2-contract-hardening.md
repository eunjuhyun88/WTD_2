# W-0007 Phase 2 Contract Hardening

## Goal

Execute Phase 2 contract hardening slices with clear ownership and verifiable outputs, starting from E6 schema separation while preserving `api.schemas` compatibility.

## Owner

contract

## Scope

- `engine/api` contract schema module separation (E6)
- keep route imports stable (`from api.schemas import ...`)
- prepare ground for C1/C3 follow-up (OpenAPI type sync + contract tests)

## Non-Goals

- changing endpoint behavior or payload semantics
- renaming route paths or altering HTTP status contracts
- implementing SignalSnapshot versioning in this slice

## Canonical Files

- `work/active/W-0007-phase2-contract-hardening.md`
- `engine/api/schemas.py`
- `engine/api/schemas_shared.py`
- `engine/api/schemas_score.py`
- `engine/api/schemas_backtest.py`
- `engine/api/schemas_challenge.py`
- `engine/api/schemas_train_deep_universe.py`
- `app/scripts/contracts/sync-engine-types.mjs`
- `app/package.json`
- `scripts/contract-check.sh`
- `.github/workflows/contract-ci.yml`
- `docs/domains/contracts.md`

## Decisions

- maintain `api.schemas` as the public barrel to avoid route churn
- split schema classes by endpoint domain into dedicated modules
- keep shared primitives (`KlineBar`, `PerpSnapshot`, etc.) in a shared schema module
- app-engine API contract validation must stay separate from repo task-contract checks
- add request-id propagation app -> engine (`x-request-id`) for cross-service traceability
- protect `analyze` hot path with per-IP rate limit + short TTL shared cache + in-flight dedupe

## Next Steps

- C1: wire generated app-side types against engine OpenAPI and add drift check command
- C3: add initial contract tests for `score` and `deep` request/response shapes
- S4: keep contract check gate in CI aligned with the generated type drift command
- E8+: add structured timing/error counters for `analyze` cache hit/miss/limited paths

## Exit Criteria

- all engine tests remain green after schema split
- no route import updates required for this refactor
- follow-up C1/C3 tasks tracked and executable from scripts/CI
- engine OpenAPI drift fails fast before app-engine contract changes merge
