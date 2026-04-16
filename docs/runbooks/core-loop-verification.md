# Core Loop Verification

## Purpose

Define the minimum verification workflow for the Day-1 core loop:

`terminal capture -> lab evaluate/activate -> dashboard alert feedback -> ledger accumulation`

Use this runbook before merging any core-loop product, contract, engine, or research change.

## Required Reading

1. `docs/product/pages/00-system-application.md`
2. `docs/product/core-loop-agent-execution-blueprint.md`
3. `docs/domains/core-loop-object-contracts.md`
4. `docs/product/core-loop-state-matrix.md`
5. relevant surface page spec and domain doc

## Verification Lanes

| Lane | Focus | Minimum Evidence |
|---|---|---|
| app | surface rendering, CTA flow, degraded states | targeted app checks plus manual flow confirmation |
| contract | payload shape, deep-link stability, state legality | contract tests or schema checks |
| engine | persistence, evaluate logic, alert/verdict/ledger semantics | targeted engine tests |
| research | similarity and ranking summaries, threshold logic | reproducible sample outputs or eval note |

## Core Scenarios

### 1. Terminal Capture Happy Path

Steps:

1. open `/terminal` with symbol and timeframe context
2. select an explicit chart range
3. add optional note
4. press `Save Setup`

Expected:

- capture save succeeds
- saved confirmation shows symbol, timeframe, and selected range
- selected range is not lost after save
- next valid action is visible

### 2. Terminal Capture Failure Path

Steps:

1. attempt save without selected range
2. attempt save with upstream failure or invalid payload

Expected:

- `Save Setup` is disabled or rejected with clear reason when range is missing
- failure preserves selected context and note
- no silent fallback to generic bookmark behavior

### 3. Capture to Lab Projection

Steps:

1. open a saved capture in lab projection flow
2. verify source capture summary appears in lab

Expected:

- challenge projection preserves capture linkage
- source range and note remain understandable in lab context

### 4. Evaluate Happy Path

Steps:

1. select projected challenge
2. trigger `Run Evaluate`
3. wait for completion

Expected:

- progress stream or equivalent visible run status
- deterministic summary fields render
- instance list refreshes
- replay link to terminal works

### 5. Evaluate Failure Path

Steps:

1. trigger a failed or malformed run

Expected:

- selected challenge context persists
- logs or failure details stay visible
- retry path is explicit

### 6. Monitoring Activation

Steps:

1. activate monitoring from evaluated challenge

Expected:

- activation only available from valid evaluated context
- resulting watch appears in dashboard
- watch status is `live`

### 7. Dashboard Alert Feedback

Steps:

1. open dashboard with pending alerts
2. open one alert in terminal
3. record `agree` or `disagree`

Expected:

- pending alerts sort above judged alerts
- judgment persists without ambiguity
- terminal drilldown opens with valid replay context

### 8. Auto Outcome and Ledger

Steps:

1. allow alert or instance to reach outcome window
2. inspect stored outcome and ledger linkage

Expected:

- auto outcome remains distinct from manual verdict
- ledger row links back to upstream ids
- no destructive overwrite of prior verdict history

## Illegal State Tests

The following cases must fail safely:

1. creating a watch directly from terminal
2. creating a watch from dashboard without evaluated challenge context
3. alert creation without drilldown context
4. collapsing manual and auto verdicts into one shared mutable field
5. challenge acceptance without evaluated summary

## Degraded Mode Checks

| Degraded Condition | Expected Behavior |
|---|---|
| market data stale in terminal | stale badge visible; capture still possible if reviewed range is stable |
| evaluation partial failure | challenge detail remains mounted; logs preserved |
| dashboard section fetch failure | one section degrades while others still render |
| ledger aggregation delay | upstream objects remain usable; delayed analytics clearly marked |

## Automation Minimum

### App Changes

Run at minimum:

```bash
cd app
npm run check -- --fail-on-warnings
```

Add route or component tests when changing:

- terminal capture save flow
- lab evaluate UI
- dashboard alert feedback UI

### Engine Changes

Run targeted tests first:

```bash
uv run pytest engine/tests/<targeted_test>.py
```

Expand to related suites when changing:

- capture persistence
- challenge evaluation
- alert emission
- verdict storage
- ledger aggregation

### Contract Changes

Verify:

1. app type or schema updates
2. route payload compatibility
3. deep-link shape stability
4. state transitions against `docs/product/core-loop-state-matrix.md`

## Merge Gate

Before merge or handoff:

1. relevant docs updated
2. active work item updated
3. targeted checks completed
4. manual core scenario coverage noted
5. known gaps explicitly listed

## Handoff Note Template

Every handoff for core-loop work should state:

1. active work item
2. touched surface or lane
3. verification completed
4. remaining blockers
5. whether any object-contract or state-matrix changes were introduced
