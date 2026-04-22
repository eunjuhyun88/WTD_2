# W-0004 CTO + AI Researcher Refactor Architecture

## Goal

Design a staged refactor that improves reliability, contract safety, and research-to-product velocity without breaking the `engine` as backend truth and `app` as surface/orchestration boundary.

## Owner

contract

## Scope

- refactor the `app` analysis hot path into separable orchestration modules
- define app-engine contract hardening and automated drift detection
- standardize degradation/fallback behavior for engine partial failures
- add observability for latency, quality, and research signal health
- define rollout phases with measurable gates

## Non-Goals

- rewriting engine market logic (`market_engine`, `scoring`, `patterns`) in this slice
- changing core strategy hypotheses or alpha definitions
- full UI redesign of `terminal`, `lab`, or `dashboard`
- replacing existing storage stack or authentication provider

## Canonical Files

- `app/src/routes/api/cogochi/analyze/+server.ts`
- `app/src/lib/server/engineClient.ts`
- `app/src/routes/api/engine/[...path]/+server.ts`
- `engine/api/main.py`
- `engine/api/routes/deep.py`
- `engine/api/routes/score.py`
- `engine/api/routes/patterns.py`
- `app/src/lib/services/scanService.ts`
- `docs/domains/contracts.md`

## Current-State Diagnosis

### 1) Hot-path concentration risk

`/api/cogochi/analyze` currently owns too many concerns in one file:

- market raw-data fanout
- perp/derivatives derived-feature assembly
- engine deep/score orchestration
- fallback and degraded-mode behavior
- final response shaping for UI

This increases regression risk, slows review, and makes latency optimization difficult.

### 2) Contract drift risk (App TypeScript vs Engine Python)

`engineClient.ts` mirrors Python schemas manually.  
Without automated contract checks, API shape changes can fail late at runtime.

### 3) Boundary blur during fallback

Fallback logic inside app can duplicate parts of decision logic.  
When engine is unavailable, policy should degrade safely without becoming shadow business logic.

### 4) Incomplete production observability

Latency is not yet decomposed consistently into:

- data collection
- deep call
- score call
- merge/response

This makes SLO ownership ambiguous across app and engine teams.

## Target Architecture

### A. App orchestration modules (inside `app`)

Split analysis route into explicit modules:

- `AnalyzeRequestParser`  
  - validates symbol/timeframe inputs and request options
- `MarketDataCollector`  
  - fetches raw market/perp/orderbook/liquidation data concurrently
- `PerpFeatureBuilder`  
  - computes `oi_notional`, liq totals, taker ratios, etc.
- `EngineOrchestrator`  
  - executes `/deep` and `/score` with timeout, retries policy, and partial success handling
- `AnalyzeResponseMapper`  
  - maps internal payload to UI response schema
- `FallbackPolicy`  
  - centralized degraded-mode behavior; no silent logic creep

### B. Contract-hardening lane (`app` <-> `engine`)

- establish a generated contract artifact from engine OpenAPI
- add contract test suite that validates:
  - required fields
  - enum compatibility
  - backward compatibility expectations per endpoint
- enforce CI gate: app changes that touch `engineClient.ts` require contract check pass

### C. Reliability and degradation policy

Define explicit decision matrix:

- deep success + score success -> full response
- deep success + score failure -> deep-authoritative response with ml-null flags
- deep failure + score success -> score-limited response with reduced confidence label
- deep failure + score failure -> degraded fallback response with explicit status

No mode should pretend full confidence when major signals are missing.

### D. Observability model

Every analysis request emits:

- `trace_id`
- `symbol`, `timeframe`
- `collector_ms`, `deep_ms`, `score_ms`, `merge_ms`, `total_ms`
- `engine_partial` (bool), `fallback_used` (bool)
- error_code family for failure analysis

This enables p95 ownership and incident triage.

## CTO Risk and Cost Analysis

### Risks if not refactored

- hot-path outages are harder to isolate
- feature delivery velocity drops due to fear of regressions
- app-engine contract mismatch incidents increase
- fallback logic grows into accidental secondary backend

### Cost of refactor

- moderate short-term delivery slowdown (1-2 cycles)
- additional CI runtime for contract checks
- temporary dual-path complexity during migration

### Expected payoff

- lower MTTR and cleaner on-call boundaries
- faster, safer iteration on AI features
- clearer ownership across `app` and `engine`

## AI Researcher Requirements

Refactor must preserve research integrity:

- deterministic feature lineage for inference payloads
- transparent missing-signal handling in degraded mode
- confidence calibration must reflect missing channels
- experiment metadata (version/model/policy mode) should be traceable per response

## Phased Execution Plan

### Phase 0 - Baseline and instrumentation

- capture current p50/p95 latency and timeout/fallback rates
- define target SLO for terminal analyze path

### Phase 1 - Pure extraction (no behavior change)

- split `analyze` into modules without policy changes
- add unit tests around mapper and derived-feature builder

### Phase 2 - Contract hardening

- add OpenAPI-driven contract artifact
- implement app-engine contract CI checks

### Phase 3 - Degradation policy formalization

- move fallback into `FallbackPolicy`
- enforce explicit degraded response schema

### Phase 4 - Optimization and cleanup

- tune collector concurrency and timeout budgets
- remove dead path logic and finalize docs/runbooks

## Verification Plan

- app route tests for full/partial/failure modes
- contract tests for `deep`, `score`, `patterns`, `scanner`
- smoke tests for terminal flows (`symbol` switch, timeframe switch, pattern state load)
- latency regression check before/after each phase

## Success Metrics

- p95 analyze latency improved by at least 20% or kept stable with lower variance
- contract-related runtime failures reduced to near-zero
- fallback usage visible and auditable (100% traced)
- no boundary violations where app re-implements engine decision core

## Decisions

- prioritize structural decomposition over feature expansion in this slice
- keep `engine` as decision authority; app remains orchestrator and policy host
- enforce typed contract checks as a non-optional release gate
- expose degradation state explicitly to avoid hidden confidence inflation

## Next Steps

- create implementation work item for Phase 1 module extraction
- draft contract test harness and CI command
- define degraded-response schema and share with frontend consumers
- update `docs/domains/contracts.md` with failure-mode contract policy

## Exit Criteria

- analysis hot path is modular with explicit boundaries
- app-engine contract checks run in CI and block incompatible changes
- fallback behavior is centralized and documented
- latency/error telemetry supports SLO-based operations
