# W-0006 Full Architecture Refactor Design

CTO + AI Researcher perspective, covering every folder in the repository.

## Goal

Produce a comprehensive refactor blueprint that reduces structural debt, hardens contracts, improves research velocity, and makes the system observable — while preserving the `engine` as backend truth and `app` as surface/orchestration boundary.

## Owner

research

This is an umbrella architecture-program work item. Execution happens through child work items owned by `engine`, `app`, `contract`, or `research`.

## Scope

- every folder: `engine/`, `app/`, `docs/`, `research/`, `scripts/`, `work/`, root config
- structural, contract, test, observability, and research-integrity improvements
- phased execution with measurable gates per phase
- program-level sequencing and decomposition for child work items

## Non-Goals

- rewriting alpha/strategy hypotheses
- changing LightGBM to a different ML framework
- full UI visual redesign
- migrating off SvelteKit or FastAPI
- landing all phases in one PR or one branch

## Canonical Files

- `work/active/W-0006-full-architecture-refactor-design.md`
- `work/active/W-0004-cto-ai-refactor-architecture.md`
- `work/active/W-0005-phase1-analyze-extraction.md`
- `AGENTS.md`
- `docs/domains/contracts.md`
- `docs/domains/engine-pipeline.md`
- `docs/product/brief.md`

## Program Rules

- W-0006 is not an implementation slice. It is the umbrella program document.
- Every phase must break into explicit child work items before code edits begin.
- No phase merges without its gate passing and the affected canonical docs being updated.
- Any issue below is provisional until the referenced file/path is verified in the current repository.

## Child Work Items

- `W-0004-cto-ai-refactor-architecture.md`: architecture and refactor framing
- `W-0005-phase1-analyze-extraction.md`: analyze hot-path extraction
- future child items should be created per phase or per bounded subsystem

## Repository Verification Snapshot

This section exists to separate verified reality from architectural intent.

| Area | Verified against repo now | Notes |
|------|---------------------------|-------|
| `engine/scanner`, `engine/building_blocks`, `engine/challenge`, `engine/scoring` | yes | confirmed present |
| `engine/api/routes/patterns.py` | yes | confirmed present |
| `app/src/routes/terminal`, `lab`, `dashboard` | yes | confirmed present |
| `app/src/lib/contracts/*` | yes | confirmed present |
| `work/active/W-0004-cto-ai-refactor-architecture.md` | yes | actual file name differs from earlier shorthand |
| `work/active/W-0005-phase1-analyze-extraction.md` | yes | actual file name differs from earlier shorthand |
| `market_engine/pipeline.py`, `market_engine/l2/alpha.py`, `models/signal.py`, `api/cogochi/analyze/+server.ts` | pending file-by-file verification | treat design claims below as provisional until linked to exact current files |

---

## I. Current-State Diagnosis (by area)

### 1. Engine (`engine/`)

**Strengths**
- clean domain packages: `market_engine/`, `scoring/`, `scanner/`, `patterns/`, `challenge/`, `backtest/`
- 64 test files under `tests/` — good coverage intention
- single `api/main.py` router consolidation — easy to audit
- `building_blocks/` organized by role (triggers/entries/confirmations/disqualifiers)

**Structural issues**

| ID | Area | Problem |
|----|------|---------|
| E1 | `market_engine/pipeline.py` | God-file: `run_deep_analysis` + `SniperGate` + `SignalHistory` + `score_to_verdict` + `compute_sector_scores` + L1 velocity all in one module (~multiple responsibilities) |
| E2 | `market_engine/l2/alpha.py` | S1–S20 alpha signals in a single file — hard to test/iterate individual signals |
| E3 | `data_cache/` | CSV-on-disk cache with no TTL policy, no invalidation contract, no cache health metrics |
| E4 | `ledger/store.py` | JSON file store — no concurrency safety, no backup/rotation, will break under parallel writes |
| E5 | `scanner/scheduler.py` | APScheduler + Supabase + Telegram + pattern dedup all in one module |
| E6 | `api/schemas.py` | Single file for all request/response schemas — no per-domain separation |
| E7 | Root scripts | `autoresearch_ml.py`, `autoresearch_real_data.py`, `train_lgbm.py` live at engine root — no clear entry point discipline |
| E8 | `observability/` | Only `logging.py` — no metrics, no tracing, no structured events |
| E9 | `models/signal.py` | `SignalSnapshot` is shared contract type but lives deep inside engine with no versioning |
| E10 | Test isolation | Tests exist but no CI integration visible from engine side; no coverage gate |

Execution note:
- Before implementing any `E*` item, add exact current path references and a `verified: yes/no` marker in the child work item that executes it.

### 2. App (`app/`)

**Strengths**
- `contracts/` layer with Zod validation — good type boundary intention
- `providers/` abstraction with `readRaw` dispatch — clean data source layer
- `engineClient.ts` — typed client with timeout/error handling
- `server/douni/` — well-separated LLM orchestration (context builder, intent classifier, tool executor)
- 3 SQL migration locations show DB schema evolution awareness

**Structural issues**

| ID | Area | Problem |
|----|------|---------|
| A1 | `api/cogochi/analyze/+server.ts` | 420-line god-route: data collection + feature assembly + engine calls + fallback + response mapping |
| A2 | `lib/server/` | 80+ files in flat structure — no subdomain grouping beyond `douni/`, `memory/`, `orpo/`, `providers/` |
| A3 | `lib/engine/` (client-side) | Parallel engine logic (layerEngine, indicators, cogochi layers) risks drift from Python engine truth |
| A4 | `lib/stores/` | 26 stores with no dependency graph or initialization order — hydration race risks |
| A5 | `lib/server/scanEngine.ts` vs `lib/services/scanService.ts` | Scan logic split across service + engine with unclear boundary |
| A6 | No test harness | Zero vitest/playwright — `npm run check` (svelte-check) is the only automated gate |
| A7 | `lib/server/intelPolicyRuntime.ts` | "Large module" per docs — likely another god-file candidate |
| A8 | Migration locations | 3 separate migration folders (`server/migrations/`, `db/migrations/`, `supabase/migrations/`) — no unified migration runner |
| A9 | `lib/data-engine/` | Client data pipeline (alignment, cache, context, normalization, providers, scheduler) — overlaps with server providers layer |
| A10 | `_archive/` | Legacy code still present in tree |
| A11 | Fallback in analyze | `_fallbackToLayerEngine` uses client-side engine code server-side — boundary violation |

Execution note:
- Any `A*` item touching live routes must identify current import graph and response-shape invariants before extraction.

### 3. App-Engine Contract Surface

| ID | Problem |
|----|---------|
| C1 | `engineClient.ts` TypeScript types are manually maintained mirrors of `api/schemas.py` Pydantic models — no automated sync |
| C2 | `app/contracts/` Zod schemas and `engine/models/signal.py` can drift independently |
| C3 | No contract test suite exists |
| C4 | Mixed routing: some paths use `api/engine/[...path]` proxy, others call engine directly via `engineClient`, others are app-only — no documented policy |
| C5 | `SignalSnapshot` is the most critical shared type but has no versioning or backward-compat policy |

Execution note:
- No `C*` item may land without paired docs, app types, engine types, and validation changes in the same slice.

### 4. Docs (`docs/`)

**Strengths**
- layered structure (product/domains/decisions/runbooks) — excellent
- ADRs for key decisions (engine canonical, app-engine boundary, challenge contract)

**Issues**

| ID | Problem |
|----|---------|
| D1 | `docs/domains/contracts.md` does not cover failure-mode policies |
| D2 | No architecture diagram (visual) exists anywhere |
| D3 | `app/docs/` legacy material still referenced but poorly gated |
| D4 | Research docs (`research/`) are all placeholder READMEs — no actual thesis/experiment records |

### 5. Research (`research/`)

| ID | Problem |
|----|---------|
| R1 | All 5 subdirectories contain only placeholder READMEs — no research artifacts |
| R2 | No experiment tracking integration (MLflow, W&B, or even structured JSONL) |
| R3 | `engine/autoresearch_*.py` scripts at root should be research entry points but aren't connected to `research/` |
| R4 | No eval protocol for comparing engine versions or alpha signal quality |
| R5 | Model versioning is implicit (LightGBM pickle files) — no registry |

### 6. Scripts & CI

| ID | Problem |
|----|---------|
| S1 | Only 2 scripts in `scripts/` — baseline check and archive split |
| S2 | CI lives only under `app/.github/` — engine has no CI workflow |
| S3 | No unified dev command (separate `cd engine && uv run` vs `npm --prefix app`) |
| S4 | No contract validation in CI pipeline |
| S5 | No performance regression gate |

### 7. Work Items & Governance

| ID | Problem |
|----|---------|
| G1 | W-0002 is missing (gap in sequence) |
| G2 | No PR template enforcing work-item linkage |
| G3 | No change-type tagging automation despite AGENTS.md policy |

---

## II. Target Architecture (by area)

### Engine Refactor Targets

#### E1-fix: Split `pipeline.py`

```
engine/market_engine/
  pipeline.py          → run_deep_analysis() only (thin orchestrator)
  verdict.py           → score_to_verdict(), verdict constants
  sector.py            → compute_sector_scores()
  sniper_gate.py       → SniperGate class
  signal_history.py    → SignalHistory class
  l1_velocity.py       → l1_velocity(), l1_rsi_realtime(), should_promote()
```

#### E2-fix: Split alpha signals

```
engine/market_engine/l2/alpha/
  __init__.py          → re-exports + alpha_score()
  s01_wyckoff_momentum.py
  s02_ema_spread.py
  ...per signal file...
  conflict_resolver.py → conflict resolution logic
  deflation.py         → score deflation rules
```

#### E3-fix: Cache contract

- add TTL metadata per cache entry
- add `cache_health()` endpoint returning staleness per symbol
- add cache invalidation hook for scanner refresh

#### E4-fix: Ledger store upgrade

- migrate from JSON files to SQLite or engine-local Postgres
- add write locking for concurrent scan/evaluate
- add backup rotation

#### E5-fix: Split scheduler

```
engine/scanner/
  scheduler.py         → job registration and lifecycle only
  jobs/
    universe_scan.py
    pattern_scan.py
    auto_evaluate.py
    alert_dispatch.py
```

#### E6-fix: Schema separation

```
engine/api/schemas/
  __init__.py          → barrel exports
  score.py
  deep.py
  patterns.py
  challenge.py
  backtest.py
  train.py
  verdict.py
  scanner.py
  shared.py            → KlineBar, PerpSnapshot, etc.
```

#### E7-fix: Research entry points

- move `autoresearch_*.py` and `train_lgbm.py` into `engine/cli/` or `engine/research_cli/`
- add CLI entry points in `pyproject.toml` `[project.scripts]`

#### E8-fix: Observability

- add `engine/observability/metrics.py` — timing decorators, counter helpers
- add `engine/observability/tracing.py` — request-id propagation from app
- structured JSON logging option via `ENGINE_LOG=structured`

#### E9-fix: SignalSnapshot versioning

- add `schema_version: int` field to `SignalSnapshot`
- add backward-compat adapter layer in `models/compat.py`
- enforce version check in API schemas

#### E10-fix: Engine CI

- add `.github/workflows/engine-ci.yml` at repo root
- gates: `uv run pytest`, `uv run ruff check`, coverage threshold

### App Refactor Targets

#### A1-fix: Analyze decomposition

(detailed in W-0005 — 7 extracted modules)

#### A2-fix: Server directory restructure

```
app/src/lib/server/
  auth/               → authGuard, authRepository, authSecurity, session, walletAuth
  market/             → marketDataService, marketFeedService, marketSnapshotService, providers/
  scan/               → scanEngine, scanner
  intel/              → intelPolicyRuntime, intelShadowAgent
  analyze/            → (new from A1-fix)
  douni/              → (already separated)
  memory/             → (already separated)
  orpo/               → (already separated)
  exchange/           → (already exists)
  research/           → autoResearch/*, researchView/
  onchain/            → (already exists)
  journal/            → (already exists)
  infra/              → db, rateLimit, distributedRateLimit, sharedCache, secretCrypto, telegram
  external/           → coinmarketcap, coinmetrics, cryptoquant, defillama, dune, etherscan, feargreed, fred, geckoWhale, lunarcrush, santiment, yahooFinance, gmxV2, polymarketClob
```

#### A3-fix: Client engine boundary

- document which client-side engine files are **read-only mirrors** vs **independent implementations**
- add lint rule: `cogochi/layers/` files must not import from `$lib/server/`
- long-term: remove client-side layers that duplicate engine logic; use engine API results only

#### A4-fix: Store dependency graph

- document store initialization order
- add hydration guard: stores that depend on auth must wait for session resolution
- consider store composition (fewer files, grouped by domain)

#### A5-fix: Scan boundary

- `scanEngine.ts` = data assembly (server, no policy)
- `scanService.ts` = auth + persistence + orchestration (policy)
- document this split; enforce via imports

#### A6-fix: Test harness

- add vitest config with server-side unit test support
- add playwright config for critical path smoke tests
- target: analyze route, auth flow, terminal load
- add `npm run test` and `npm run test:e2e` scripts

#### A7-fix: Intel policy split

- extract feature extraction, quality gates, and policy output into separate files under `server/intel/`

#### A8-fix: Migration unification

- choose one canonical migration runner (recommend `db/migrations/` with numbered SQL)
- deprecate `server/migrations/` and `supabase/migrations/` or make them shims
- document migration workflow in runbook

#### A9-fix: Data-engine clarification

- document `lib/data-engine/` as client-only real-time pipeline (WebSocket/polling)
- document `lib/server/providers/` as server-only REST pipeline
- no cross-imports between them

#### A10-fix: Archive cleanup

- remove `app/_archive/` from tree or move to `docs/archive/app/`
- ensure no imports reference archived code

#### A11-fix: Fallback boundary

- `_fallbackToLayerEngine` must not use `$lib/engine/cogochi/layerEngine`
- replace with explicit degraded-response schema (no analysis, status flag only)
- or: move TypeScript layer engine to `$lib/server/fallback/` with explicit "degraded" prefix

### Contract Surface Targets

#### C1-fix: Automated type sync

Option A (recommended): generate TypeScript types from engine OpenAPI spec
- engine: `fastapi` auto-generates OpenAPI at `/docs`
- app: `openapi-typescript` generates `engineTypes.d.ts` from spec
- CI: compare generated vs committed; fail on drift

Option B: contract snapshot tests
- maintain JSON samples for each endpoint
- validate both sides parse correctly

#### C2-fix: Zod ↔ Pydantic alignment

- `SignalSnapshot` Zod schema in `app/contracts/` must be derived from engine spec
- add CI check: Zod schema field set matches Pydantic model field set

#### C3-fix: Contract test suite

```
tests/contracts/
  test_score_contract.ts    → validates request/response shapes
  test_deep_contract.ts
  test_patterns_contract.ts
  test_scanner_contract.ts
```

#### C4-fix: Routing policy document

Add to `docs/domains/contracts.md`:
- **Proxy routes** (`api/engine/[...path]`): pass-through, no app logic allowed
- **Orchestrated routes** (`api/cogochi/analyze`): app collects data, calls engine, shapes response
- **App-domain routes** (`api/terminal/scan`): app owns full logic, engine not involved
- every new route must declare its type

#### C5-fix: SignalSnapshot versioning

(see E9-fix above; app side must handle version negotiation)

### Docs Targets

#### D1-fix: Failure-mode contract policy

Add section to `docs/domains/contracts.md`:
- per-endpoint failure modes
- degraded response schema
- SLO expectations

#### D2-fix: Architecture diagram

Add `docs/architecture.md` with Mermaid diagrams:
- system context (browser → app → engine → data sources)
- data flow for analyze hot path
- component ownership map

#### D3-fix: Legacy docs gating

- `app/docs/` should contain only `README.md` pointing to `docs/`
- move any remaining useful content to `docs/product/` or `docs/domains/`

#### D4-fix: Research docs activation

- populate `research/thesis/` with current alpha hypotheses
- populate `research/evals/` with eval protocol from `engine/tests/`
- link `research/experiments/` to engine autoresearch scripts

### Research Targets

#### R1-fix: Populate research artifacts

- extract current hypotheses from code comments into `research/thesis/`
- document current eval metrics in `research/evals/`

#### R2-fix: Experiment tracking

- add structured experiment log format (JSONL or YAML)
- recommend MLflow or simple file-based tracking for offline evals
- integrate with `engine/autoresearch_*.py` outputs

#### R3-fix: Research CLI

- `engine/cli/autoresearch.py` with subcommands
- registered in `pyproject.toml` as entry point
- outputs to `research/experiments/` by convention

#### R4-fix: Eval protocol

- define offline eval: feature stability, score distribution, backtest metrics
- define online eval: terminal usage, signal accuracy over time
- document in `research/evals/protocol.md`

#### R5-fix: Model registry

- add `engine/models/registry/` with version manifest
- track: model file path, training date, dataset version, eval metrics
- `GET /train/versions` endpoint to expose current model info

### Scripts & CI Targets

#### S1-fix: Essential scripts

Add to `scripts/`:
- `scripts/contract-check.sh` — run OpenAPI type diff + contract tests
- `scripts/engine-test.sh` — `cd engine && uv run pytest`
- `scripts/app-check.sh` — `cd app && npm run check && npm run test`
- `scripts/dev.sh` — unified dev startup (engine + app in parallel)

#### S2-fix: Engine CI

Add `/.github/workflows/engine-ci.yml`:
- trigger: changes in `engine/`
- steps: `uv sync`, `ruff check`, `pytest`, coverage report

#### S3-fix: Unified dev command

Add root `Makefile` or `scripts/dev.sh`:
```
make dev       → engine + app in parallel
make test      → engine tests + app checks
make contract  → contract validation
make baseline  → scripts/check-operating-baseline.sh
```

#### S4-fix: Contract CI gate

Add contract check step to `app/.github/workflows/ci.yml`

#### S5-fix: Performance gate

Add `scripts/perf-baseline.sh`:
- capture analyze route p50/p95 from local benchmark
- compare against stored baseline
- fail if regression > threshold

### Governance Targets

#### G1-fix: Sequence gap

- create `work/completed/W-0002-*.md` or document skip reason

#### G2-fix: PR template

Add `.github/pull_request_template.md`:
- work item reference
- change type (product/engine/contract/research)
- verification checklist

#### G3-fix: Change-type automation

Add CI label check or commit-message convention enforcement

---

## III. Priority Matrix

| Priority | Items | Rationale |
|----------|-------|-----------|
| **P0 Critical** | A1, A6, C1, C3, S2 | Hot-path reliability, test coverage, contract safety |
| **P1 High** | E1, E5, E6, E8, A2, A11, C4, D2, S3 | Maintainability, observability, boundary clarity |
| **P2 Medium** | E2, E3, E4, E7, E9, A3, A4, A7, A8, C2, C5, D1, R2, R4, S1, S4 | Research velocity, operational quality |
| **P3 Low** | A5, A9, A10, D3, D4, R1, R3, R5, S5, G1, G2, G3 | Polish, governance, long-term health |

---

## IV. Phased Execution Plan

### Phase 0 — Baseline (1 week)

- capture latency/error baselines for analyze path
- add engine CI workflow (S2)
- add vitest config to app (A6 — skeleton only)
- document routing policy (C4)

Deliverables:
- child work item(s) created and linked
- baseline metrics document committed
- engine CI workflow committed
- app test runner skeleton committed
- routing policy added to canonical docs

Gate:
- engine tests pass in CI
- app has `npm run test` command (even if 0 tests)
- baseline metrics are recorded in a canonical file, not chat
- all changed paths are linked from the child work item

### Phase 1 — Hot-path extraction (2 weeks)

- decompose `analyze/+server.ts` (A1 — per W-0005)
- split `pipeline.py` (E1)
- split `scheduler.py` (E5)
- add timing hooks (E8 — basic)
- fix fallback boundary (A11)

Deliverables:
- analyze route split into bounded modules
- engine hot-path file split where verified
- degraded fallback boundary documented
- timing instrumentation visible in logs

Gate:
- analyze route output unchanged
- latency within 10% of baseline
- integration coverage exists for full, partial, and failure path
- child work items enumerate moved files and invariants preserved

### Phase 2 — Contract hardening (2 weeks)

- generate TypeScript types from engine OpenAPI (C1)
- add contract test suite (C3)
- separate `api/schemas.py` (E6)
- add SignalSnapshot versioning (E9)
- add contract check to CI (S4)

Deliverables:
- generated or snapshotted contract source of truth
- contract tests committed
- versioning policy documented
- CI contract gate enabled

Gate:
- contract tests green in CI
- no manual type maintenance for the selected contract path
- docs, app types, engine types, and route validation updated together

### Phase 3 — Test and observability (2 weeks)

- add first vitest tests for extracted modules (A6)
- add playwright smoke for terminal (A6)
- add structured observability to engine (E8)
- add request-id propagation app → engine
- add failure-mode docs (D1)

Deliverables:
- vitest coverage on extracted modules
- playwright smoke for one critical path
- structured logging and request id propagation
- failure-mode contract policy documented

Gate:
- >50% coverage on new modules
- request traces visible in logs
- at least one smoke path runs in automation

### Phase 4 — Structure and research (2 weeks)

- restructure `app/src/lib/server/` directories (A2)
- split alpha signals (E2)
- populate research artifacts (R1, R4)
- add research CLI (R3)
- add architecture diagram (D2)
- unify migration locations (A8)

Deliverables:
- server tree reshaped or documented with transition shims
- research thesis/eval/protocol files populated
- research CLI path defined
- architecture diagram committed

Gate:
- research eval can run end-to-end
- server directory matches documented structure
- research artifacts are stored under `research/`, not only engine root scripts

### Phase 5 — Optimization and polish (1 week)

- cache contract and health endpoint (E3)
- ledger store upgrade (E4)
- store dependency graph (A4)
- performance baseline script (S5)
- PR template and governance (G2, G3)
- cleanup archives (A10)

Deliverables:
- cache/ledger/store-dependency upgrades landed or explicitly deferred
- performance baseline gate wired
- governance template/automation added
- archive cleanup completed or explicitly documented

Gate:
- all P0-P2 items resolved or explicitly deferred by ADR/work item
- docs match reality
- no unowned structural debt remains in hot paths

---

## V. AI Researcher Integrity Requirements

Throughout all phases:

- feature lineage must remain deterministic (same input → same features)
- degraded responses must explicitly flag missing channels
- confidence labels must reflect actual signal coverage (no inflation)
- model versions must be traceable per prediction
- experiment results must be reproducible from recorded parameters
- alpha signal changes require eval comparison before merge

Canonical homes:
- feature lineage rules: `docs/domains/engine-pipeline.md`
- contract-visible confidence semantics: `docs/domains/contracts.md`
- thesis and hypothesis statements: `research/thesis/`
- eval protocol and acceptance thresholds: `research/evals/`
- experiment runs and outputs: `research/experiments/`
- model registry and version manifests: `engine/models/registry/` or successor canonical location

Minimum verification per integrity item:
- feature lineage: deterministic test or fixture comparison
- degraded response visibility: contract test covering degraded schema
- confidence calibration: before/after eval snapshot recorded
- model versioning: manifest entry and retrieval path verified
- experiment reproducibility: rerun command and parameters recorded in artifact

---

## VI. Verification Plan

| Level | What | How |
|-------|------|-----|
| Unit | extracted modules, feature builders, mappers | vitest (app), pytest (engine) |
| Contract | app↔engine type alignment | OpenAPI diff + snapshot tests |
| Integration | analyze route full/partial/failure | vitest with mocked engine |
| Smoke | terminal load, symbol switch, TF switch | playwright |
| Performance | analyze p50/p95 | local benchmark + CI comparison |
| Research | eval protocol metrics stable | before/after eval run comparison |

Execution rule:
- every child work item must declare which rows of this table it touches
- no work item may claim completion without naming the exact commands or files that satisfied its verification rows

---

## VII. Success Metrics

- analyze route: p95 latency ≤ 3s (or 20% improvement from baseline)
- contract drift incidents: 0 per quarter
- fallback usage: 100% traced, ≤ 5% of requests
- test coverage: ≥ 50% on new/refactored modules
- engine CI: green on every PR touching `engine/`
- research eval: reproducible within 1% metric variance
- time-to-context for new contributor: ≤ 30 min (docs → first local run)

---

## Decisions

- all refactoring is behavioral-neutral unless explicitly marked otherwise
- engine remains sole decision authority; app never replicates scoring logic
- contract checks are mandatory CI gates, not optional
- research integrity is non-negotiable constraint on every phase
- phases can overlap but gate must pass before next phase merges to main
- W-0006 remains umbrella-only and should not be closed by a single implementation PR

## Next Steps

- create/align child work items for Phase 0 with exact file verification
- update `docs/domains/contracts.md` with routing policy and failure modes
- record current analyze-path baseline in a canonical artifact before refactor
- schedule architecture diagram review after Phase 1
- add per-phase deliverable checklist to each child work item before coding

## Exit Criteria

- every P0 and P1 item resolved and verified or explicitly deferred by ADR/work item
- CI pipeline covers engine tests, app checks, contract validation
- docs accurately reflect actual system structure
- research eval protocol documented and runnable
- no god-files remain in hot paths
- umbrella work item links all completed child work and resulting ADRs
