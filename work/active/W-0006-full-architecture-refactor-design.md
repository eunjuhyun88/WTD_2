# W-0006 Full Architecture Refactor Design

CTO + AI Researcher perspective, covering every folder in the repository.

## Goal

Produce a pragmatic local-first refactor blueprint for a solo AI researcher that maximizes ML/research velocity, reproducibility, and inference-path correctness while preserving the `engine` as backend truth and `app` as surface/orchestration boundary.

## Owner

research

This is an umbrella architecture-program work item. Execution happens through child work items owned by `engine`, `app`, `contract`, or `research`.

## Scope

- every folder: `engine/`, `app/`, `docs/`, `research/`, `scripts/`, `work/`, root config
- structural, contract, test, observability, and research-integrity improvements with direct research ROI
- phased execution with measurable gates per phase
- program-level sequencing and decomposition for child work items

## Project Reality (Verified 2026-04-14)

- local development only
- no production deployment yet
- solo developer / solo AI researcher workflow
- priority order:
  1. ML/research pipeline
  2. inference-path correctness and local reliability
  3. first production deployment readiness
  4. scale-out architecture

Implication:
- production-style infrastructure work must justify itself by improving research throughput, local correctness, or future migration cost in a concrete way
- large infra programs with weak near-term research ROI should be deferred

## Non-Goals

- rewriting alpha/strategy hypotheses
- changing LightGBM to a different ML framework
- full UI visual redesign
- migrating off SvelteKit or FastAPI
- landing all phases in one PR or one branch
- treating 1000+ user public launch readiness as the current primary driver
- implementing multi-runtime split before the local research loop is healthy

## Canonical Files

- `work/active/W-0006-full-architecture-refactor-design.md`
- `work/active/W-0004-cto-ai-refactor-architecture.md`
- `work/active/W-0005-phase1-analyze-extraction.md`
- `work/active/W-0010-high-cost-api-rate-limit-cache.md`
- `work/active/W-0011-analyze-runtime-hardening.md`
- `work/active/W-0012-runtime-split-and-state-plane.md`
- `work/active/W-0013-launch-readiness-program.md`
- `AGENTS.md`
- `docs/architecture.md`
- `docs/domains/contracts.md`
- `docs/decisions/ADR-004-runtime-split-and-state-plane.md`
- `docs/runbooks/launch-readiness.md`
- `docs/domains/engine-pipeline.md`
- `docs/product/brief.md`

## Program Rules

- W-0006 is not an implementation slice. It is the umbrella program document.
- Every phase must break into explicit child work items before code edits begin.
- No phase merges without its gate passing and the affected canonical docs being updated.
- Any issue below is provisional until the referenced file/path is verified in the current repository.
- For the current project stage, research-loop ROI beats infrastructure purity.
- Deployment and scale architecture remain valid design lanes, but they should not outrank ML/eval throughput unless local work is blocked by them.

## Child Work Items

- `W-0004-cto-ai-refactor-architecture.md`: architecture and refactor framing
- `W-0005-phase1-analyze-extraction.md`: analyze hot-path extraction
- `W-0010-high-cost-api-rate-limit-cache.md`: cache/rate-limit hardening for heavy public reads
- `W-0011-analyze-runtime-hardening.md`: analyze request, cache, degraded-envelope, and telemetry hardening
- `W-0012-runtime-split-and-state-plane.md`: target runtime topology and state-plane definition
- `W-0013-launch-readiness-program.md`: launch-critical blocker inventory and execution order
- `W-0015-research-pipeline-canonicalization.md`: canonical thesis/eval/experiment record layer for the local research loop
- future child items should be created per phase or per bounded subsystem

## Repository Verification Snapshot

This section exists to separate verified reality from architectural intent.

| Area | Verified against repo now | Notes |
|------|---------------------------|-------|
| `engine/scanner`, `engine/building_blocks`, `engine/challenge`, `engine/scoring` | yes | confirmed present |
| `engine/api/routes/patterns.py` | yes | confirmed present |
| `app/src/routes/terminal`, `lab`, `dashboard` | yes | confirmed present |
| `app/src/lib/contracts/*` | yes | confirmed present |
| `docs/architecture.md` | yes | current architecture doc exists and should remain high-level |
| root CI workflows for app/engine/contract | yes | present; architectural issue is no longer "missing CI", but depth/scope of gates |
| `work/active/W-0004-cto-ai-refactor-architecture.md` | yes | actual file name differs from earlier shorthand |
| `work/active/W-0005-phase1-analyze-extraction.md` | yes | actual file name differs from earlier shorthand |
| `work/active/W-0010-high-cost-api-rate-limit-cache.md` | yes | public heavy-read hardening slice exists |
| `work/active/W-0011-analyze-runtime-hardening.md` | yes | analyze runtime hardening slice exists |
| `market_engine/pipeline.py`, `market_engine/l2/alpha.py`, `models/signal.py`, `api/cogochi/analyze/+server.ts` | pending file-by-file verification | treat design claims below as provisional until linked to exact current files |

---

## Program Delta (Verified 2026-04-14)

This umbrella document started as a broad diagnosis and now needs to distinguish completed foundations from open architecture work.

### Root correction

An earlier version of this umbrella plan overweighted production/launch architecture for the current project reality.

That was a poor fit because:

- the repository is still local-only
- there is no live production deployment to defend
- one solo developer must optimize for research throughput first
- a 50+ item infra program has weak ROI if the ML/eval loop is not yet the main bottleneck

Current stance:

- keep architectural target docs for future deployment
- prioritize research pipeline, reproducibility, contract safety, and hot-path correctness first
- treat launch-readiness and runtime split as deferred lanes unless they directly block local research work

### Already landed or partially landed

- root-level app CI exists
- root-level engine CI exists
- contract drift check exists between engine OpenAPI output and app generated types
- `docs/architecture.md` exists
- vitest exists and targeted server-side tests are now present
- public heavy-read hardening exists for key routes, including `analyze`
- `analyze` now has explicit degraded/error envelopes, request tracing, and short TTL shared-cache behavior
- a launch-readiness runbook now exists to translate architecture debt into release gates

### Still open at architecture level

- local-first research priorities are not yet reflected consistently across all child work ordering
- runtime split between public web traffic and control-plane workloads is not yet implemented, but this is a future deployment lane rather than the current primary driver
- Redis and Postgres are present as integration directions, but they should be adopted only where they concretely improve local iteration or future migration cost
- background scheduler/control-plane work is still too coupled to current runtime assumptions; fix when it blocks local correctness or before first deployment
- research canonicalization under `research/` is still incomplete
- large-file decomposition in engine/app hot zones remains unfinished

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
| E10 | Test depth | Engine CI exists, but coverage thresholds, perf gates, and richer observability assertions are still missing |

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
| A6 | Test depth | Vitest now exists with targeted tests, but route-level isolation and browser smoke coverage are still too thin for launch confidence |
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
| C1 | OpenAPI-driven sync exists, but some caller/callee assumptions still live outside the generated contract path and need stronger route-level validation |
| C2 | `app/contracts/` Zod schemas and `engine/models/signal.py` can drift independently |
| C3 | Contract checks exist, but route-level contract tests are still too shallow for the most important orchestrated paths |
| C4 | Mixed routing: some paths use `api/engine/[...path]` proxy, others call engine directly via `engineClient`, others are app-only — policy is now documented, but enforcement is still incomplete |
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
| D1 | failure-mode policy now exists, but it still needs broader route-by-route adoption and examples outside the first hardened paths |
| D2 | Architecture doc depth | `docs/architecture.md` exists, but target runtime split and state-plane rules must stay current as implementation advances |
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
| S1 | Script sprawl | Script inventory is large, but canonical launch/test/runtime wrappers are still not obvious |
| S2 | CI scope | Root CI exists for app, engine, and contracts, but deployment/control-plane and perf gates remain incomplete |
| S3 | No unified dev command (separate `cd engine && uv run` vs `npm --prefix app`) |
| S4 | Contract gate depth | Contract drift check exists in CI, but end-to-end caller/callee coverage is still partial |
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

- keep root `engine-ci` canonical and add stronger gates
- extend with coverage thresholds, contract-aware checks, and perf-sensitive smoke where justified

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

- expand the existing vitest harness beyond targeted unit tests
- add or deepen playwright coverage for critical path smoke tests
- target: analyze route, auth flow, terminal load
- keep `npm run test` canonical and add `npm run test:e2e` when browser smoke is ready

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

Keep `docs/architecture.md` current with Mermaid diagrams for:
- system context (browser → app → engine → data sources)
- data flow for analyze hot path
- component ownership map
- target runtime split (`app-web`, `engine-api`, `worker-control`) and state-plane roles

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

Keep the script surface small and canonical:
- retain `scripts/contract-check.sh` as the contract entrypoint
- add or standardize `scripts/engine-test.sh`, `scripts/app-check.sh`, and `scripts/dev.sh` only if they reduce ambiguity versus current commands
- avoid adding more wrappers unless they become the documented default

#### S2-fix: Engine CI

Extend the existing `/.github/workflows/engine-ci.yml`:
- keep trigger scope aligned to `engine/` and shared contract files
- steps should converge on `uv sync`, lint, pytest, and coverage reporting

#### S3-fix: Unified dev command

Add root `Makefile` or `scripts/dev.sh`:
```
make dev       → engine + app in parallel
make test      → engine tests + app checks
make contract  → contract validation
make baseline  → scripts/check-operating-baseline.sh
```

#### S4-fix: Contract CI gate

Deepen the existing root contract CI gate with route-level fixtures and broader caller/callee validation

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
| **P0 Critical** | R1, R3, R4, A1, A11, C1, C3 | research pipeline clarity, reproducibility, hot-path correctness, contract safety |
| **P1 High** | E1, E2, E6, E7, E9, A6, D4, S4 | engine decomposition with direct research ROI, test depth, research artifact activation |
| **P2 Medium** | A2, A7, A8, C2, C5, D1, R2, R5, S1, S2, S3, G2 | maintainability, local ops quality, gradual release discipline |
| **P3 Deferred** | E3, E4, E5, E8, W-0012, W-0013, S5, G1, G3 | deployment/scale architecture, broader observability, and future launch-readiness lanes |

---

## IV. Phased Execution Plan

### Phase 0 — Reality Alignment (largely completed)

- align umbrella docs to the real project stage
- keep root engine/app/contract CI healthy
- preserve minimal local test harness and baseline checks
- keep future deployment architecture documented, but not as the active driver

Deliverables:
- child work item(s) created and linked
- local-first priority order documented canonically
- baseline checks and core CI present
- future deployment/runbook docs explicitly treated as deferred lanes

Gate:
- project reality and priority order are explicit in canonical docs
- CI and baseline checks pass
- all changed paths are linked from the child work item

### Phase 1 — Research Pipeline Canonicalization

- populate `research/thesis/`, `research/evals/`, and `research/experiments/` with real artifacts
- move or wrap `autoresearch_*.py` and training entry points into a discoverable research CLI path
- define eval protocol and experiment recording with minimal local overhead
- define model/version lineage for local research runs

Deliverables:
- canonical research artifact structure is no longer placeholder-only
- a solo developer can find and rerun the main research/eval path from docs and scripts
- experiment inputs/outputs are recorded in files, not only comments or chat

Gate:
- research/eval path is runnable from canonical docs
- at least one current experiment and one current eval protocol are committed canonically
- model or experiment lineage can be reconstructed without ad hoc repo archaeology

### Phase 2 — Inference Hot Path And Contracts

- maintain generated TypeScript types from engine OpenAPI (C1)
- expand the contract test suite beyond drift checks (C3)
- decompose `analyze/+server.ts` (A1 — per W-0005)
- split `pipeline.py` where it directly blocks inference iteration (E1)
- fix fallback boundary (A11)
- separate `api/schemas.py` (E6)
- add SignalSnapshot versioning (E9)
- deepen contract CI (S4)

Deliverables:
- generated contract source of truth committed
- route-level and schema-level contract tests committed
- analyze hot path is more modular and easier to reason about locally
- versioning policy documented
- CI contract gate enabled

Gate:
- contract tests green in CI
- no manual type maintenance for the selected contract path
- docs, app types, engine types, and route validation updated together
- local inference path remains behaviorally stable while becoming easier to iterate on

### Phase 3 — Local Reliability And Developer Throughput

- add targeted tests for extracted modules and route-level failure modes (A6)
- add minimal smoke coverage only where it protects the research loop
- improve local observability where it helps debug inference/eval work
- add failure-mode docs (D1)
- standardize local dev/test commands only if they reduce friction

Deliverables:
- vitest coverage on extracted modules
- at least one local smoke path if it protects a real workflow
- useful local logs/traceability for inference and eval debugging
- failure-mode contract policy documented

Gate:
- new/refactored modules ship with targeted tests
- debugging the main research/inference loop is easier than before
- tooling overhead remains proportionate for one developer

### Phase 4 — First Deployment Readiness (optional lane)

- revisit runtime split, launch-readiness, and route inventory before first external deployment
- move scheduler/control-plane work if it becomes a real deployment blocker
- promote shared cache/rate-limit config where deployment actually requires it
- add broader release/runbook checks only when there is something to release externally

Deliverables:
- deployment lane is documented with concrete blockers
- future-facing runtime docs are refreshed against the then-current repo state
- no deployment work is done “just in case”

Gate:
- there is a real external deployment target
- deployment work is justified by an upcoming release rather than architectural anxiety

### Phase 5 — Scale Architecture (deferred)

- runtime split and worker/control-plane isolation
- cache/ledger/state-plane upgrades for scale
- stronger observability and performance gates
- broader governance and automation

Deliverables:
- future-scale architecture is implemented only when deployment and usage justify it
- scale work no longer competes with core research throughput

Gate:
- deployment exists and scale pain is real
- scale work has a measured bottleneck to solve

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

- one canonical research/eval path is runnable end-to-end locally
- one current experiment and one current eval protocol exist under `research/`
- analyze route: p95 latency ≤ 3s locally or materially lower variance than baseline
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
- local research throughput outranks premature production architecture
- phases can overlap but gate must pass before next phase merges to main
- W-0006 remains umbrella-only and should not be closed by a single implementation PR

## Next Steps

- realign child work items so P0/P1 research-first slices come before deployment/scale slices
- populate canonical `research/` artifacts instead of leaving them as placeholders
- continue analyze/contract hardening only where it directly improves local inference and evaluation work
- defer runtime-split and launch-readiness execution unless they start blocking local progress
- add per-phase deliverable checklist to each child work item before coding

## Exit Criteria

- every P0 and P1 item resolved and verified or explicitly deferred by ADR/work item
- CI pipeline covers engine tests, app checks, contract validation
- docs accurately reflect actual system structure and real project stage
- research eval protocol documented and runnable
- no god-files remain in the research/inference hot paths that actually slow iteration
- umbrella work item links all completed child work and resulting ADRs
