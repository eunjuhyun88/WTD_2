# Core Loop State Matrix

## Purpose

Define the allowed Day-1 state transitions for the capture-first core loop so agents can implement lifecycle behavior without inventing implicit states or cross-surface shortcuts.

Use this document with:

- `docs/product/core-loop-agent-execution-blueprint.md`
- `docs/domains/core-loop-object-contracts.md`

## Global Loop Progression

The canonical Day-1 system progression is:

`reviewing -> captured -> projected -> evaluated -> watch_live -> alert_pending -> judged -> ledgered`

Not every capture must become a live watch.
Not every alert must produce both manual and automatic verdicts.
But no later state may appear without a valid upstream state.

## Surface Responsibility Summary

| Action | From | To | Surface Owner |
|---|---|---|---|
| select range | reviewed chart | capture draft | terminal |
| save setup | capture draft | capture saved | terminal |
| project setup | capture saved | challenge projected | lab |
| run evaluate | challenge projected | challenge evaluated | lab |
| accept and activate | challenge evaluated | watch live | lab |
| pause or resume | watch live/paused | watch paused/live | dashboard |
| emit alert | watch live | alert pending | scanner/alerts |
| manual feedback | alert pending | alert judged_manual | dashboard |
| auto outcome | alert pending | alert judged_auto | engine |
| aggregate evidence | judged states | ledgered | engine/research |

## `capture` State Matrix

| State | Meaning | Entered By | Allowed Next States | Forbidden Next States |
|---|---|---|---|---|
| `draft` | reviewed range exists in UI only | terminal selection | `saved`, `discarded` | `projected`, `archived` |
| `saved` | durable capture persisted | `Save Setup` | `projected`, `archived` | `draft` |
| `discarded` | unsaved local review abandoned | terminal clear or route leave | none | all durable states |
| `archived` | intentionally retired from active reuse | explicit archive action | none | `projected`, `saved` |

Rules:

- `Save Setup` is the only Day-1 transition from `draft` to `saved`
- `projected` is a challenge state, not a capture state

## `challenge` State Matrix

| State | Meaning | Entered By | Allowed Next States | Forbidden Next States |
|---|---|---|---|---|
| `projected` | capture-derived or query-derived evaluated hypothesis exists | lab projection | `queued`, `running`, `archived` | `accepted` without evaluate |
| `queued` | evaluation requested and waiting | evaluate request | `running`, `failed` | `accepted`, `rejected` |
| `running` | deterministic evaluation in progress | lab run start | `evaluated`, `failed` | `accepted`, `watch_live` |
| `evaluated` | evaluation completed with summary and instances | run completion | `accepted`, `rejected`, `running`, `archived` | `projected` |
| `accepted` | user accepts evaluated hypothesis for monitoring or continued use | explicit lab accept | `watch_live`, `archived` | `queued` |
| `rejected` | user rejects evaluated hypothesis for live use | explicit lab reject | `projected`, `archived` | `watch_live` |
| `failed` | run failed or parse failed | evaluation failure | `queued`, `running`, `archived` | `accepted` |
| `archived` | retired from active workflow | explicit archive action | none | any active state |

Rules:

- no `accepted` without an `evaluated` result
- `rejected` may be reworked back into `projected`

## `watch` State Matrix

| State | Meaning | Entered By | Allowed Next States | Forbidden Next States |
|---|---|---|---|---|
| `live` | actively monitored in production flow | lab activation | `paused`, `retired` | `draft`, `queued` |
| `paused` | monitoring temporarily suspended | dashboard pause | `live`, `retired` | `projected` |
| `retired` | monitoring intentionally ended | lab or dashboard retire | none | `live`, `paused` |

Rules:

- new `live` watches may only be created from `challenge.accepted`
- dashboard may manage continuity, but may not create a new watch from scratch

## `alert` State Matrix

| State | Meaning | Entered By | Allowed Next States | Forbidden Next States |
|---|---|---|---|---|
| `pending` | alert emitted and awaiting judgment | scanner/alerts | `judged_manual`, `judged_auto`, `archived` | `live` |
| `judged_manual` | manual agreement/disagreement recorded | dashboard action | `judged_manual_and_auto`, `archived` | `pending` |
| `judged_auto` | automatic outcome recorded | engine outcome logic | `judged_manual_and_auto`, `archived` | `pending` |
| `judged_manual_and_auto` | both manual and automatic judgments exist | second judgment source added | `archived` | `pending` |
| `archived` | alert no longer active in inbox | retention or explicit archive | none | any active state |

Rules:

- manual and automatic judgments are additive
- no state may collapse both sources into one hidden boolean

## `verdict` State Matrix

Verdict records are append-first, not mutable state containers.

| Event | Result |
|---|---|
| manual feedback submitted | create new manual verdict row |
| automatic outcome computed | create new auto verdict row |
| manual note edited | create new revision or update allowed metadata only if audit-safe |

Rules:

- do not overwrite prior verdict source history
- the alert or instance state may summarize verdict presence, but verdict rows remain durable records

## `ledger_entry` State Matrix

Ledger entries are append-only evidence rows.

| State | Meaning | Entered By | Allowed Next States |
|---|---|---|---|
| `recorded` | evidence row persisted | engine/research aggregation | none |

Rules:

- recalculation should create new aggregate outputs, not mutate historical raw rows destructively

## Hard Gates

1. `watch.live` requires `challenge.accepted`
2. `alert.pending` requires `watch.live` or active runtime pattern context
3. `judged_manual` requires valid alert identity and human action
4. `judged_auto` requires valid outcome window or deterministic auto-judge event
5. `ledger_entry.recorded` requires at least one upstream durable object id and outcome evidence

## Prohibited Cross-Surface Shortcuts

1. terminal -> new watch live
2. dashboard -> new challenge projection
3. dashboard -> monitoring activation without evaluated lab context
4. lab -> manual alert feedback mutation without dashboard or engine contract
5. app-only local pattern activation with no engine-backed object

## Failure and Recovery Rules

| Failure Point | Allowed Recovery |
|---|---|
| capture save fails | retry save without losing selected range or note |
| challenge run fails | rerun from `failed` or `queued` with preserved logs |
| watch activation fails | remain in `evaluated` or `accepted` with explicit failure state |
| alert feedback save fails | rollback alert UI to prior state and allow retry |
| ledger aggregation fails | keep upstream objects intact and mark aggregation degraded |

## QA Focus

The highest-risk illegal transitions to test are:

1. creating a watch before evaluation
2. losing source capture linkage during challenge projection
3. collapsing manual and auto judgments into one state
4. navigating to terminal from an alert without drilldown context
