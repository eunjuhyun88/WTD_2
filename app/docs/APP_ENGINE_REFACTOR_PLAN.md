# App / Engine Refactor Plan

Status: active refactor analysis and migration order.

Related:
- [APP_ENGINE_BOUNDARY.md](/Users/ej/Projects/wtd-v2/app/docs/APP_ENGINE_BOUNDARY.md)
- [ENGINE_SPEC.md](/Users/ej/Projects/wtd-v2/engine/ENGINE_SPEC.md)

## 1. Executive Summary

The repo is in a transitional state:

- `engine/` already contains the new canonical decision system:
  - feature calculation
  - LightGBM scoring
  - ensemble scoring
  - pnl truth
  - portfolio simulator
  - realtime scanner
  - FastAPI routes
- `app/` still contains older local engine logic:
  - local backtesting
  - local/server scan scoring
  - Cogochi layer engine
  - research helpers with their own metrics

The highest-risk problem is not missing code. It is duplicated authority.

Right now the same product can answer "what is the score / backtest / signal?"
from more than one place. That is the core refactor target.

## 2. Refactor Goal

End state:

- `engine/` is the only authority for:
  - signal truth
  - execution truth
  - backtest truth
  - strategy metrics
  - promotion gates
- `app/` is the only authority for:
  - UX
  - request orchestration
  - auth/session
  - rendering
  - page-level workflow

The migration is successful when a new engineer can answer:

1. "Where is trading truth?" → `engine/`
2. "Where is user flow and rendering?" → `app/`

## 3. What Is Healthy Already

These parts are aligned with the target architecture.

### 3.1 Engine runtime core

Files:
- [engine/scanner/feature_calc.py](/Users/ej/Projects/wtd-v2/engine/scanner/feature_calc.py)
- [engine/scanner/pnl.py](/Users/ej/Projects/wtd-v2/engine/scanner/pnl.py)
- [engine/backtest/simulator.py](/Users/ej/Projects/wtd-v2/engine/backtest/simulator.py)
- [engine/backtest/portfolio.py](/Users/ej/Projects/wtd-v2/engine/backtest/portfolio.py)
- [engine/scanner/realtime.py](/Users/ej/Projects/wtd-v2/engine/scanner/realtime.py)
- [engine/scoring/lightgbm_engine.py](/Users/ej/Projects/wtd-v2/engine/scoring/lightgbm_engine.py)
- [engine/scoring/ensemble.py](/Users/ej/Projects/wtd-v2/engine/scoring/ensemble.py)

Why healthy:
- strong domain boundaries
- typed contracts
- explicit path-aware execution
- explicit portfolio constraints

### 3.2 Engine API layer

Files:
- [engine/api/main.py](/Users/ej/Projects/wtd-v2/engine/api/main.py)
- [engine/api/schemas.py](/Users/ej/Projects/wtd-v2/engine/api/schemas.py)
- [engine/api/routes/backtest.py](/Users/ej/Projects/wtd-v2/engine/api/routes/backtest.py)

Why healthy:
- external contract is centralized
- schemas are explicit
- route responsibilities are clear

### 3.3 App-side engine proxy pattern

Files:
- `app/src/routes/api/engine/[...path]/+server.ts`

Why healthy:
- app behaves as adapter/proxy
- engine remains the compute authority

## 4. Main Refactor Problems

## 4.1 Duplicate backtest authority

Files:
- [app/src/lib/engine/backtestEngine.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/backtestEngine.ts)
- [app/src/routes/lab/+page.svelte](/Users/ej/Projects/wtd-v2/app/src/routes/lab/+page.svelte)
- [app/src/components/lab/ResultPanel.svelte](/Users/ej/Projects/wtd-v2/app/src/components/lab/ResultPanel.svelte)
- [app/src/components/lab/PositionBar.svelte](/Users/ej/Projects/wtd-v2/app/src/components/lab/PositionBar.svelte)
- [app/src/components/lab/StrategyBuilder.svelte](/Users/ej/Projects/wtd-v2/app/src/components/lab/StrategyBuilder.svelte)
- [app/src/components/lab/LabToolbar.svelte](/Users/ej/Projects/wtd-v2/app/src/components/lab/LabToolbar.svelte)

Problem:
- `app` has a self-contained TypeScript backtest engine with its own:
  - indicators
  - trade simulation
  - costs
  - walk-forward logic
  - metrics
- `engine` now has the Python canonical version.

Risk:
- Lab results can diverge from engine results.
- Users can see one result in UI and another via engine API.

Verdict:
- This is the highest-priority refactor target.

## 4.2 Duplicate scan/scoring authority

Files:
- [app/src/lib/server/scanEngine.ts](/Users/ej/Projects/wtd-v2/app/src/lib/server/scanEngine.ts)
- [app/src/lib/services/scanService.ts](/Users/ej/Projects/wtd-v2/app/src/lib/services/scanService.ts)
- [app/src/lib/engine/opportunityScanner.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/opportunityScanner.ts)
- [app/src/routes/api/terminal/opportunity-scan/+server.ts](/Users/ej/Projects/wtd-v2/app/src/routes/api/terminal/opportunity-scan/+server.ts)
- [app/src/routes/api/terminal/compare/+server.ts](/Users/ej/Projects/wtd-v2/app/src/routes/api/terminal/compare/+server.ts)

Problem:
- `app` still hosts scoring-like server logic for opportunity scan / war room behavior.
- `engine/scanner/realtime.py` and `engine/scoring/*` are now the canonical direction.

Risk:
- alert and signal semantics drift
- frontend decisions depend on non-canonical scoring

Verdict:
- second-highest refactor target

## 4.3 Legacy Cogochi engine in app

Files:
- [app/src/lib/engine/cogochi/layerEngine.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/cogochi/layerEngine.ts)
- related files under [app/src/lib/engine/cogochi](/Users/ej/Projects/wtd-v2/app/src/lib/engine/cogochi)

Problem:
- these are semantically "engine" files but physically inside `app`
- some may still be product-relevant, some may be legacy

Risk:
- team keeps extending the wrong engine
- old layer logic quietly competes with `engine/`

Verdict:
- needs classification before migration:
  - `canonical`
  - `legacy but needed for UI display`
  - `archive / retire`

## 4.4 Research logic scattered in app server modules

Files:
- [app/src/lib/server/autoResearch](/Users/ej/Projects/wtd-v2/app/src/lib/server/autoResearch)
- [app/src/lib/research](/Users/ej/Projects/wtd-v2/app/src/lib/research)

Problem:
- some orchestration belongs in `app`
- but metric/scoring utilities here can become a parallel quant stack

Risk:
- research path and production engine path diverge

Verdict:
- keep orchestration in `app`
- move reusable numerical truth into `engine`

## 4.5 Deletion Tiers

This repo does not mainly have a "too many random dead files" problem.
It mainly has a "too many overlapping authorities" problem.

That means deletion must be staged in three grades:

### Grade A. Immediately deletable

Definition:
- no active runtime references
- no canonical ownership role
- low-confidence-value as archive material

Files:
- [app/src/lib/engine/cogochiTypes.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/cogochiTypes.ts)
- [app/src/lib/engine/fewShotBuilder.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/fewShotBuilder.ts)
- [app/src/lib/engine/chartPatterns.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/chartPatterns.ts)
- [app/src/lib/engine/exitOptimizer.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/exitOptimizer.ts)
- [app/src/lib/engine/specs.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/specs.ts)
- [app/src/lib/engine/events/base.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/events/base.ts)

Archive surfaces that are runtime-dead:
- [app/_archive](/Users/ej/Projects/wtd-v2/app/_archive)
- [app/docs/archive](/Users/ej/Projects/wtd-v2/app/docs/archive)

Notes:
- `_archive` and `docs/archive` are runtime-dead, but deleting them is a repo-hygiene decision, not an application refactor requirement.
- `cogochiTypes.ts` has already been superseded by [app/src/lib/contracts/signals.ts](/Users/ej/Projects/wtd-v2/app/src/lib/contracts/signals.ts).
- `specs.ts` is only mentioned in comments; no active import path remains.

### Grade B. Deletable after reference cutover

Definition:
- still used on active routes or API paths
- semantically duplicated by `engine/`
- should be retired after UI/API consumers switch to canonical engine contracts

Backtest duplication:
- [app/src/lib/engine/backtestEngine.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/backtestEngine.ts)
- [app/src/routes/lab/+page.svelte](/Users/ej/Projects/wtd-v2/app/src/routes/lab/+page.svelte)
- [app/src/components/lab/ResultPanel.svelte](/Users/ej/Projects/wtd-v2/app/src/components/lab/ResultPanel.svelte)
- [app/src/components/lab/PositionBar.svelte](/Users/ej/Projects/wtd-v2/app/src/components/lab/PositionBar.svelte)
- [app/src/components/lab/StrategyBuilder.svelte](/Users/ej/Projects/wtd-v2/app/src/components/lab/StrategyBuilder.svelte)
- [app/src/components/lab/LabToolbar.svelte](/Users/ej/Projects/wtd-v2/app/src/components/lab/LabToolbar.svelte)
- [app/src/lib/stores/strategyStore.ts](/Users/ej/Projects/wtd-v2/app/src/lib/stores/strategyStore.ts)
- [app/src/components/terminal/StrategyCard.svelte](/Users/ej/Projects/wtd-v2/app/src/components/terminal/StrategyCard.svelte)

Scanner and opportunity duplication:
- [app/src/lib/engine/opportunityScanner.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/opportunityScanner.ts)
- [app/src/lib/server/scanEngine.ts](/Users/ej/Projects/wtd-v2/app/src/lib/server/scanEngine.ts)
- [app/src/routes/api/terminal/opportunity-scan/+server.ts](/Users/ej/Projects/wtd-v2/app/src/routes/api/terminal/opportunity-scan/+server.ts)

Cogochi app-side engine candidates:
- [app/src/lib/engine/cogochi/layerEngine.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/cogochi/layerEngine.ts)
- [app/src/lib/engine/cogochi/supportResistance.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/cogochi/supportResistance.ts)
- [app/src/lib/engine/cogochi/hmac.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/cogochi/hmac.ts)
- [app/src/lib/engine/cogochi/types.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/cogochi/types.ts)
- [app/src/lib/engine/cogochi/douni/douniPersonality.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/cogochi/douni/douniPersonality.ts)

Notes:
- These are not dead today.
- These are the main reason the repo feels bigger than it should.
- The right order is cut over consumers first, then delete.

### Grade C. Must keep for now

Definition:
- active imports confirmed
- or relative-import subgraphs still used by active entry points
- deleting now would break runtime or type contracts

Files:
- [app/src/lib/engine/types.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/types.ts)
- [app/src/lib/engine/agents.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/agents.ts)
- [app/src/lib/engine/factorEngine.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/factorEngine.ts)
- [app/src/lib/engine/indicators.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/indicators.ts)
- [app/src/lib/engine/trend.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/trend.ts)
- [app/src/lib/engine/ragEmbedding.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/ragEmbedding.ts)
- [app/src/lib/engine/constants.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/constants.ts)
- [app/src/lib/engine/arenaWarTypes.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/arenaWarTypes.ts)
- [app/src/lib/engine/battleResolver.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/battleResolver.ts)
- [app/src/lib/engine/agentCharacter.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/agentCharacter.ts)
- [app/src/lib/engine/v2BattleTypes.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/v2BattleTypes.ts)
- [app/src/lib/engine/v4/types.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/v4/types.ts)
- [app/src/lib/engine/v4/battleStateMachine.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/v4/battleStateMachine.ts)
- [app/src/lib/engine/metrics/store.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/metrics/store.ts)

Notes:
- Individual zero-ref files under `metrics/*`, `v4/states/*`, and `cogochi/layers/*` are not safe to delete one-by-one without following their relative-import graph.
- `metrics/store.ts` is still used by live analysis paths.
- `v4/*` and battle files are legacy in product terms, but not dead in import terms.

### Practical refactor order implied by these tiers

1. Retire `backtestEngine.ts` from Lab.
2. Retire `scanEngine.ts` and `opportunityScanner.ts` from signal truth.
3. Classify `app/src/lib/engine/cogochi/*` into canonical display helper vs fallback vs archive.
4. Delete Grade A files.
5. Delete Grade B files only after cutover is complete.

## 5. Refactor Principles

### Principle 1. Move truth before UI

Before replacing any screen, first ensure the canonical contract exists in `engine`.

### Principle 2. Keep compatibility shims temporarily

Do not break Lab/Terminal immediately.
Wrap old `app` logic until the UI consumes engine outputs.

### Principle 3. Migrate types first

Before moving behavior, align request/response and metric types.

### Principle 4. No dual-write truth

If both `app` and `engine` still compute something, one must be explicitly labeled non-canonical.

## 6. Concrete Migration Phases

## Phase R1. Freeze contracts

Goal:
- define one typed contract between `app` and `engine`

Deliverables:
- extend engine schemas where needed
- add TS client types generated or mirrored from engine schemas
- ensure Lab/Scanner use these instead of local inferred objects

Primary files:
- [engine/api/schemas.py](/Users/ej/Projects/wtd-v2/engine/api/schemas.py)
- `app/src/lib/server/engineClient.ts`

Success criteria:
- no page code relies on ad hoc metric object shapes

## Phase R2. Replace Lab backtest truth

Goal:
- make Lab UI consume `engine` backtest responses

Migration:
1. add any missing fields to engine backtest response
2. create a thin TS adapter translating engine response to existing Lab display shape
3. switch [app/src/routes/lab/+page.svelte](/Users/ej/Projects/wtd-v2/app/src/routes/lab/+page.svelte) to call engine
4. deprecate [app/src/lib/engine/backtestEngine.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/backtestEngine.ts)

Success criteria:
- all displayed Lab metrics come from engine
- local TS backtest engine is no longer used on the main path

## Phase R3. Replace scan/opportunity truth

Goal:
- move signal scoring authority to `engine`

Migration:
1. identify which outputs `app` scanner consumers actually need
2. expose them through engine routes if missing
3. change `app` scanner/opportunity routes to proxy/merge engine outputs
4. stop using app-local scoring math for tradeability decisions

Primary files:
- [app/src/lib/server/scanEngine.ts](/Users/ej/Projects/wtd-v2/app/src/lib/server/scanEngine.ts)
- [engine/scanner/realtime.py](/Users/ej/Projects/wtd-v2/engine/scanner/realtime.py)
- [engine/scoring/ensemble.py](/Users/ej/Projects/wtd-v2/engine/scoring/ensemble.py)

Success criteria:
- emitted scanner signals have one canonical origin

## Phase R4. Classify Cogochi engine code

Goal:
- decide what to migrate, wrap, or retire under `app/src/lib/engine/cogochi/*`

Method:
- inventory all exports
- tag each file:
  - migrate to `engine`
  - keep as UI-only presentation helper
  - archive

Success criteria:
- no ambiguous "maybe-engine" code remains

## Phase R5. Consolidate research primitives

Goal:
- split orchestration from compute in app research modules

Move to `engine` if:
- function computes metrics
- function scores strategies
- function simulates trading
- function produces canonical research verdicts

Keep in `app` if:
- function schedules jobs
- aggregates progress
- streams logs
- coordinates UI workflows

## 7. Suggested File-Level Actions

### Immediate candidates to deprecate or wrap

- [app/src/lib/engine/backtestEngine.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/backtestEngine.ts)
  - convert to adapter over `engine`
  - then deprecate

- [app/src/lib/server/scanEngine.ts](/Users/ej/Projects/wtd-v2/app/src/lib/server/scanEngine.ts)
  - reduce to orchestration only
  - remove signal truth from here

- [app/src/lib/engine/opportunityScanner.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/opportunityScanner.ts)
  - either move core math to `engine` or mark UI-only

### Immediate candidates to expand

- [engine/api/schemas.py](/Users/ej/Projects/wtd-v2/engine/api/schemas.py)
  - become the stable contract source

- [engine/api/routes/backtest.py](/Users/ej/Projects/wtd-v2/engine/api/routes/backtest.py)
  - support the full Lab display if needed

- [engine/scanner/realtime.py](/Users/ej/Projects/wtd-v2/engine/scanner/realtime.py)
  - support scanner UI needs directly

## 8. Risk Ranking

### High

- dual backtest truth
- dual signal/scanner truth

### Medium

- app research metrics drifting from engine metrics
- app-local opportunity ranking diverging from engine ranking

### Low

- presentation-only helper duplication
- formatting-only differences

## 9. Recommended Execution Order

1. Contract freeze
2. Lab backtest migration
3. Scanner/opportunity migration
4. Cogochi engine classification
5. Research primitive migration

This order is important because it retires the most dangerous duplicated authority first.

## 10. Minimum Acceptable End State

The refactor is good enough when:

1. Lab no longer computes canonical backtest metrics in `app`.
2. Scanner tradeability decisions no longer originate in `app`.
3. `app/src/lib/engine/*` is either:
   - UI-only, or
   - explicitly deprecated, or
   - migrated out.
4. `engine/` is the one answer for:
   - score
   - signal
   - backtest
   - verdict

## 11. Immediate Recommendation

Do not start with a repo-wide rename or folder shuffle.

Start with the highest-leverage slice:

- Replace Lab's local `backtestEngine.ts` path with `engine/backtest` responses.

That single slice will:
- force the contract work
- remove the worst duplicate truth
- clarify how the rest of the migration should proceed
