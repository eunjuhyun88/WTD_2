# Domain: Pattern Engine Runtime

## Goal

Define the actual and target architecture for the pattern engine based on the current repository, not on the earlier greenfield design.

This document is the canonical runtime view for the TRADOOR/PTB-style pattern system. It supersedes any assumption that the pattern engine is still mostly unbuilt.

## Source Inputs

This rearchitecture is derived from:

- [`app/docs/PATTERN_ENGINE.md`](/Users/ej/Projects/wtd-v2/app/docs/PATTERN_ENGINE.md)
- [`app/docs/PATTERN_ENGINE_VALIDATION.md`](/Users/ej/Projects/wtd-v2/app/docs/PATTERN_ENGINE_VALIDATION.md)
- implemented code under `engine/patterns`, `engine/ledger`, `engine/universe`, `engine/api/routes/patterns.py`
- implemented app routes and terminal components under `app/src/routes/api/patterns`, `app/src/components/terminal/workspace`, and `app/src/routes/terminal/+page.svelte`

## Executive View

The original pattern-engine design was directionally right and operationally naive.

It was right about:

- the product moat living in `Pattern Object -> State Machine -> Result Ledger -> User Refinement`
- the importance of `ACCUMULATION` as the action zone
- the need for new blocks, dynamic universe scanning, and phase-aware tracking

It was naive about:

- how much already existed in `challenge`, `scoring`, and `autoresearch`
- how much of the new system would quickly become a contract and state-management problem rather than a pure feature gap
- how dangerous it is for the app layer to reshape engine truth into ad hoc UI-specific envelopes

Current reality:

- the pattern runtime exists
- the ledger exists
- the dynamic universe exists
- the chart surface exists
- the API exists

The new problem is not "build the missing product from scratch."

The new problem is:

- close the broken loop edges
- remove duplicated or lossy contracts
- separate runtime planes cleanly
- make the current implementation survive restart, scale, and future ML rollout

## Comparison: Old Design vs Current Reality

| Layer | Old design claim | Current repo reality | Verdict |
|---|---|---|---|
| Pattern Object | missing | `engine/patterns/types.py`, `engine/patterns/library.py` exist | implemented, but hardcoded |
| State Machine | missing | `engine/patterns/state_machine.py` exists | implemented, but in-memory only |
| Result Ledger | missing | `engine/ledger/store.py`, `engine/ledger/types.py`, `engine/ledger/dataset.py` exist | implemented, but still shadow-grade |
| Dynamic universe | missing | `engine/universe/dynamic.py` exists | implemented |
| New block set | missing | new confirmations are registered in `engine/scoring/block_evaluator.py` | implemented |
| Pattern scan API | missing | `engine/api/routes/patterns.py` exists | implemented |
| Chart review surface | missing | `ChartBoard.svelte`, `PatternStatusBar.svelte`, terminal integration exist | implemented |
| User refinement | mostly missing | ML shadow scoring, dataset generation, verdict route exist | partial |
| Pattern-model registry | not defined in implementation | still generic `get_engine(user_id)` path in `engine/patterns/entry_scorer.py` | missing |
| Durable state plane | not discussed deeply | machines are process-memory singletons | missing |
| Save Setup -> pattern ledger loop | assumed | current UI capture path is not the canonical pattern-capture plane | missing |

## What Is Actually Implemented

### 1. Rule-First Pattern Runtime

Implemented in:

- [`engine/patterns/types.py`](/Users/ej/Projects/wtd-v2/engine/patterns/types.py)
- [`engine/patterns/library.py`](/Users/ej/Projects/wtd-v2/engine/patterns/library.py)
- [`engine/patterns/state_machine.py`](/Users/ej/Projects/wtd-v2/engine/patterns/state_machine.py)
- [`engine/patterns/scanner.py`](/Users/ej/Projects/wtd-v2/engine/patterns/scanner.py)

What is good:

- the repo now has a real `PatternObject`
- the repo now has a real sequential state machine
- phase transitions capture feature snapshots and block coverage
- entry and success callbacks are wired into the ledger

What is not yet structurally safe:

- machines live as in-process singletons
- process restart loses all phase state
- multi-instance runtime would diverge immediately
- a symbol already in `ACCUMULATION` at first observation may be invisible if the process did not witness earlier phases

Interpretation:

- this is a valid local-first runtime
- it is not yet a durable pattern-state plane

### 2. Result Ledger and Dataset Projection

Implemented in:

- [`engine/ledger/store.py`](/Users/ej/Projects/wtd-v2/engine/ledger/store.py)
- [`engine/ledger/types.py`](/Users/ej/Projects/wtd-v2/engine/ledger/types.py)
- [`engine/ledger/dataset.py`](/Users/ej/Projects/wtd-v2/engine/ledger/dataset.py)

What is good:

- entry events are persisted
- success/failure/timeout logic exists
- summary stats exist
- ML shadow readiness and dataset previews exist

What is structurally weak:

- the ledger is still one JSON-record family wearing multiple responsibilities
- entry, score, outcome, model, and training-run records are not separated as independent logical planes
- user verdict is attached at the route layer without a full refinement lifecycle behind it
- JSON file storage is acceptable for local work, but not durable state truth for multi-process or long-lived audit needs

Interpretation:

- this is no longer "missing"
- it is a development ledger, not the final pattern ledger plane

### 3. Dynamic Universe and Runtime Scan Integration

Implemented in:

- [`engine/universe/dynamic.py`](/Users/ej/Projects/wtd-v2/engine/universe/dynamic.py)
- loader wiring through the engine scan path

What is good:

- the pattern engine is no longer conceptually trapped in a fixed 30-symbol watchlist

What remains weak:

- scan health and perp coverage are still runtime concerns more than durable observability concerns
- there is no explicit universe snapshot record tied to a scan cycle

Interpretation:

- the acquisition layer is present
- the observability and reproducibility layer around it is thin

### 4. App Surface and Pattern Visibility

Implemented in:

- [`app/src/components/terminal/workspace/ChartBoard.svelte`](/Users/ej/Projects/wtd-v2/app/src/components/terminal/workspace/ChartBoard.svelte)
- [`app/src/components/terminal/workspace/PatternStatusBar.svelte`](/Users/ej/Projects/wtd-v2/app/src/components/terminal/workspace/PatternStatusBar.svelte)
- [`app/src/routes/terminal/+page.svelte`](/Users/ej/Projects/wtd-v2/app/src/routes/terminal/+page.svelte)
- `app/src/routes/api/patterns/*`
- [`app/src/routes/api/chart/klines/+server.ts`](/Users/ej/Projects/wtd-v2/app/src/routes/api/chart/klines/+server.ts)

What is good:

- there is a real chart-and-alert surface
- chart rendering is inside the product loop now, not left to external tools
- pattern state and stats are visible to the app

What is structurally wrong:

- app routes are reshaping engine truth into custom UI envelopes instead of exposing canonical engine contracts
- [`app/src/routes/api/patterns/+server.ts`](/Users/ej/Projects/wtd-v2/app/src/routes/api/patterns/+server.ts) hardcodes entry phase semantics and fabricates `since`
- [`app/src/routes/api/patterns/states/+server.ts`](/Users/ej/Projects/wtd-v2/app/src/routes/api/patterns/states/+server.ts) inverts and renames engine data instead of preserving engine-owned meaning
- chart data is fetched directly from Binance through app orchestration, which is acceptable for display but not canonical engine truth
- the current `Save Setup` path is not the canonical pattern-capture path that closes into the pattern ledger and refinement loop

Interpretation:

- the app surface exists
- the app-contract layer is currently too lossy and too clever

## Structural Gaps

The repository is no longer missing the pattern engine. It is missing the correct planes between the pieces.

### Gap 1: Durable Pattern State Plane

Current issue:

- phase state lives only in memory inside process singletons

Required target:

- a durable state store for `symbol + pattern_slug + current_phase + entered_at + bars_in_phase + last_transition_at`
- local fallback can remain file-backed or SQLite
- production target should move to DB or shared hot-state

Reason:

- without this, restart and multi-instance behavior invalidate the system

### Gap 2: Canonical Pattern Registry

Current issue:

- built-in patterns live in code only
- there is no durable registry for user-defined or versioned pattern contracts

Required target:

- separate `pattern definition registry` from `runtime state`
- built-in code patterns can seed the registry
- every persisted pattern needs explicit version and source metadata

Reason:

- `PatternObject` should be data-backed, not just import-backed

### Gap 3: Split Ledger Planes

Current issue:

- one JSON ledger record carries too many concerns

Required target planes:

1. entry record
2. score record
3. outcome record
4. model record
5. training-run record
6. user verdict / refinement event record

Reason:

- current summary logic works
- future reproducibility, calibration, and personalization require logical separation

### Gap 4: Pattern-Model Identity

Current issue:

- [`engine/patterns/entry_scorer.py`](/Users/ej/Projects/wtd-v2/engine/patterns/entry_scorer.py) still calls generic `get_engine(user_id)`

Required target:

- pattern-specific model identity
- model key should follow:

```text
pattern_slug + timeframe + target_name + feature_schema_version + label_policy_version
```

Reason:

- pattern runtime is rule-first
- ML should score a committed pattern entry, not a generic user-scoped feature row

### Gap 5: Save Setup Is Not Yet A First-Class Pattern Capture Plane

Current issue:

- the user can save and review, but the runtime architecture still treats this as adjacent UI flow rather than the canonical pattern-capture event

Required target:

- `Save Setup` must emit a canonical capture record
- capture should be linkable to:
  - symbol
  - timeframe
  - chart context
  - active pattern or candidate pattern
  - user notes
  - later outcome and verdict

Reason:

- this is the bridge between human labeling and model-ready data

### Gap 6: App Contract Discipline

Current issue:

- app pattern routes are normalizing, flattening, or inventing fields

Required target:

- app routes should proxy canonical engine envelopes with minimal shaping
- if the UI needs a view model, derive it inside the component or a typed adapter layer, not by mutating the contract boundary

Reason:

- current shape drift will break every future rearchitecture slice

### Gap 7: Alert Policy Plane

Current issue:

- entry candidates flow straight to UI visibility
- ML shadow metrics exist but do not yet participate in explicit policy

Required target:

- explicit alert policy plane with states such as:
  - `shadow`
  - `visible_ungated`
  - `ranked`
  - `gated`
  - `paused`

Reason:

- pattern runtime and alert policy must remain separable

## Optimal Target Structure

The optimal structure from the current codebase is this:

### 1. Pattern Definition Plane

Owns:

- `PatternObject`
- phase definitions
- block requirements
- pattern versions
- built-in and user-defined registry entries

Canonical home:

- engine-owned pattern registry

### 2. Pattern Runtime Plane

Owns:

- symbol evaluation
- phase transitions
- transition events
- current pattern state

Rules:

- rule-first source of truth
- no model training logic
- no app-owned semantics

### 3. Pattern Ledger Plane

Owns:

- entries
- scores
- outcomes
- verdicts
- training projections

Rules:

- append-friendly
- reproducible
- durable enough to survive runtime restarts

### 4. Pattern ML Plane

Owns:

- entry scoring
- dataset generation
- training readiness
- calibration
- promotion candidates

Rules:

- pattern-keyed model identity
- never becomes the source of truth for phase semantics

### 5. Alert Policy Plane

Owns:

- whether an entry is only stored, surfaced, ranked, or gated
- rollout state and threshold policy version

Rules:

- separate from model artifact
- separate from app presentation

### 6. App Presentation Plane

Owns:

- chart review
- candidate inspection
- Save Setup UI
- stats rendering

Rules:

- display engine truth
- do not reinterpret core phase semantics at the API boundary

## Recommended Migration Order

### Slice 1: Contract Cleanup

Do first.

- stop app routes from fabricating pattern fields such as synthetic `since`
- expose engine-rich state and candidates with stable app-side types
- move UI-only reshaping into typed adapters

Why first:

- every other change gets harder if app contracts keep drifting

### Slice 2: Durable State Plane

Do second.

- persist current symbol-pattern phase state
- restore state on restart
- make scan cycles idempotent relative to stored state

Why second:

- current in-memory state is the biggest runtime correctness hole

### Slice 3: Save Setup Capture Plane

Do third.

- connect `Save Setup` to canonical pattern capture
- tie saved records to pattern candidates and later outcomes

Why third:

- this closes the human-labeling half of the moat

### Slice 4: Split Ledger Records

Do fourth.

- separate entry, score, outcome, verdict, and training-run projections logically

Why fourth:

- this unlocks cleaner ML and refinement work without throwing away the current JSON baseline immediately

### Slice 5: Pattern Registry

Do fifth.

- promote hardcoded library patterns into registry-backed definitions
- keep built-in code seeding if useful

Why fifth:

- current hardcoded library is acceptable while contracts and state are unstable

### Slice 6: Pattern-Specific ML Registry and Alert Policy

Do sixth.

- replace generic `get_engine(user_id)` scoring path
- add pattern-model identity
- add explicit rollout and alert policy controls

Why sixth:

- this should land only after the rule runtime and ledger planes are stable

## Implemented / Partial / Missing

### Implemented

- rule-first pattern types and library
- sequential pattern state machine
- pattern scanner integration
- JSON result ledger
- dataset summary and training preview
- dynamic universe loading
- engine pattern routes
- terminal chart board
- terminal entry-signal bar

### Partial

- user verdict and refinement loop
- ML shadow scoring on committed entry events
- app pattern contracts
- save and review capture flow
- scan observability and reproducibility

### Missing

- durable pattern state plane
- registry-backed pattern definitions
- logical split of ledger record families
- pattern-keyed model registry
- explicit alert policy plane
- canonical save-to-ledger-to-refinement closure

## Product Rule

The repository should now optimize for this:

1. keep pattern semantics engine-owned and rule-first
2. make runtime state durable before making ML more powerful
3. make `Save Setup` a canonical capture event, not a side action
4. keep app contracts thin and lossless
5. let ML score, calibrate, and refine the loop only after the loop is structurally closed

Anything else is secondary to closing the loop cleanly.
