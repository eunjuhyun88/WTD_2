# App / Engine Boundary

Status: canonical boundary doc for `app/` vs `engine/`.

Purpose:
- Fix the ownership line between presentation/orchestration and decision/execution truth.
- Stop new business logic from accreting in `app/`.
- Define what must be migrated out of `app/` over time.

This document is normative for future refactors.

## 1. One-Line Rule

`app` orchestrates, fetches, stores UI state, and renders.

`engine` computes, scores, simulates, decides, and validates.

If code answers questions like:
- "Should we trade?"
- "What is the score?"
- "What is expectancy / win rate / drawdown?"
- "Which signal is better?"

it belongs in `engine`, not `app`.

## 2. Responsibilities

### `app/` owns

- Svelte routes and components
- UI state and interaction flow
- BFF/API proxy routes
- auth/session/user preference handling
- request shaping and response rendering
- caching of already-computed results for UX
- page-level orchestration across multiple APIs
- dashboards, lists, forms, tables, charts

Typical examples:
- `/terminal`, `/lab`, `/dashboard` UI
- `/api/engine/*` proxying
- chart rendering
- alert presentation
- storing last selected symbol / filter / tab

### `engine/` owns

- feature calculation
- signal generation
- block evaluation
- ensemble scoring
- classifier scoring
- backtest simulation
- pnl truth
- regime filtering
- portfolio state transitions
- audit metrics and promotion gates
- realtime scanner logic

Typical examples:
- `predict P(win)`
- `run backtest`
- `walk_one_trade`
- `compute expectancy`
- `block signal because max_concurrent`

## 3. Hard Boundary Rules

### Rule A. `app` must not define decision truth

`app` must not contain the canonical implementation of:
- win rate
- expectancy
- sharpe / sortino / drawdown
- strategy scoring
- pattern verdicts
- entry/exit simulation
- portfolio admission logic

It may display these values, but must receive them from `engine`.

### Rule B. `app` may do local preview math only if clearly non-canonical

Allowed:
- temporary UI preview values
- toy visualizations
- optimistic placeholders

Required:
- the code must be explicitly labeled non-authoritative
- production actions must not depend on it

### Rule C. API routes in `app` are adapters, not alternate engines

An `app/src/routes/api/*` route may:
- validate request shape
- call `engine`
- call external providers
- merge responses
- transform schemas for UI convenience

It must not silently reimplement core scoring/simulation logic.

### Rule D. Shared contracts must be explicit

Any data crossing `app ↔ engine` should have a stable schema:
- request shape
- response shape
- field names
- units / percentages / timestamps

No inferred object shapes in page code.

## 4. Desired Runtime Topology

### The intended shape

1. `app` receives user intent.
2. `app` calls `engine` directly or through `/api/engine/*`.
3. `engine` returns typed results.
4. `app` renders those results.

### The wrong shape

1. `app` receives user intent.
2. `app` computes its own score/backtest/verdict locally.
3. `engine` computes a different version elsewhere.
4. UI and backend drift.

We are currently in a mixed transitional state and must converge to the intended shape.

## 5. Current Transitional Violations

These are the main places where `app` still contains engine-like logic.

### 5.1 Local backtest engine in `app`

Files:
- [app/src/lib/engine/backtestEngine.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/backtestEngine.ts)
- [app/src/routes/lab/+page.svelte](/Users/ej/Projects/wtd-v2/app/src/routes/lab/+page.svelte)
- [app/src/components/lab/ResultPanel.svelte](/Users/ej/Projects/wtd-v2/app/src/components/lab/ResultPanel.svelte)
- [app/src/components/lab/PositionBar.svelte](/Users/ej/Projects/wtd-v2/app/src/components/lab/PositionBar.svelte)
- [app/src/components/lab/StrategyBuilder.svelte](/Users/ej/Projects/wtd-v2/app/src/components/lab/StrategyBuilder.svelte)

Problem:
- `app` can still run local backtests and compute local performance summaries.
- This competes with `engine/backtest/*` as a source of truth.

Target:
- Lab UI should call `engine` backtest endpoints/contracts.
- `backtestEngine.ts` should become either:
  - a thin client adapter, or
  - a deprecated compatibility layer.

### 5.2 Local scanner/opportunity logic in `app`

Files:
- [app/src/lib/engine/opportunityScanner.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/opportunityScanner.ts)
- [app/src/routes/api/terminal/opportunity-scan/+server.ts](/Users/ej/Projects/wtd-v2/app/src/routes/api/terminal/opportunity-scan/+server.ts)
- [app/src/lib/server/scanEngine.ts](/Users/ej/Projects/wtd-v2/app/src/lib/server/scanEngine.ts)
- [app/src/lib/services/scanService.ts](/Users/ej/Projects/wtd-v2/app/src/lib/services/scanService.ts)

Problem:
- `app` still contains signal-like and scanner-like logic.
- This overlaps with:
  - [engine/scanner/realtime.py](/Users/ej/Projects/wtd-v2/engine/scanner/realtime.py)
  - [engine/scoring/ensemble.py](/Users/ej/Projects/wtd-v2/engine/scoring/ensemble.py)

Target:
- `app` scanner APIs should become adapters over `engine` scanner outputs.
- Any scoring that affects alerts or tradeability should move to `engine`.

### 5.3 Cogochi layer engine inside `app`

Files:
- [app/src/lib/engine/cogochi/layerEngine.ts](/Users/ej/Projects/wtd-v2/app/src/lib/engine/cogochi/layerEngine.ts)
- related files under [app/src/lib/engine/cogochi](/Users/ej/Projects/wtd-v2/app/src/lib/engine/cogochi)

Problem:
- This is historically important but semantically engine code living in `app`.
- It increases confusion about where decision truth lives.

Target:
- Either:
  - reclassify as legacy research logic and isolate it clearly, or
  - migrate the canonical parts into `engine`.

### 5.4 Server-side autoResearch logic in `app`

Files:
- [app/src/lib/server/autoResearch](/Users/ej/Projects/wtd-v2/app/src/lib/server/autoResearch)

Problem:
- Research/control-plane logic is acceptable in `app` temporarily.
- But any reusable scoring, evaluation, or execution math here should migrate to `engine`.

Target:
- Keep orchestration in `app`.
- Move reusable research primitives into `engine`.

## 6. What Is Already Correct

These patterns should be expanded.

### 6.1 Engine proxy route

File:
- [app/src/routes/api/engine/[...path]/+server.ts](/Users/ej/Projects/wtd-v2/app/src/routes/api/engine/[...path]/+server.ts)

Why it is correct:
- `app` acts as adapter/proxy
- `engine` remains the computation authority

### 6.2 UI consuming engine-like outputs

Files:
- [app/src/lib/server/engineClient.ts](/Users/ej/Projects/wtd-v2/app/src/lib/server/engineClient.ts)
- route and component code that only renders returned metrics

Why it is correct:
- keeps transport concerns in `app`
- keeps math in `engine`

## 7. Migration Policy

When migrating logic from `app` to `engine`, follow this order:

1. Move canonical types first.
2. Move pure computation second.
3. Move API callers third.
4. Remove duplicate logic last.

Do not delete local `app` logic until:
- equivalent `engine` contract exists
- UI has switched to it
- test coverage or smoke verification exists

## 8. Priority Migration List

### P0

- Replace local lab backtest truth with `engine/backtest/*`
- Stop UI-facing metrics from depending on `app/src/lib/engine/backtestEngine.ts`

### P1

- Move scanner scoring/decision truth from `app` server modules to `engine/scanner` + `engine/scoring`
- Keep `app` only as alert/render/orchestration surface

### P2

- Reconcile or retire `app/src/lib/engine/cogochi/*` as canonical engine logic

### P3

- Consolidate research helpers so `app` orchestrates and `engine` computes

## 9. Acceptance Criteria

We can say the boundary is healthy when:

1. No production win-rate / expectancy / sharpe computation lives in `app`.
2. `Lab` results come from `engine` contracts.
3. Realtime scanner decisions come from `engine`.
4. `app` routes mostly validate, proxy, merge, and render.
5. A new engineer can answer "where is trade truth?" with one path: `engine/`.

## 10. Summary

The future architecture is:

- `app = orchestration + presentation`
- `engine = decision + execution truth`

Any code that makes a trading claim must converge into `engine`.
