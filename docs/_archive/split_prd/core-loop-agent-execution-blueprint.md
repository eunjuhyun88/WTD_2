# Core Loop UX & Agent Execution Blueprint

## Purpose

Translate the Day-1 Cogochi core loop into an implementation-ready blueprint that both product builders and execution agents can use without re-deriving the system from external design drafts.

This document sits below the page specs and above code.
Use it to answer four questions:

1. what object is the user creating or acting on?
2. which surface owns the next decision?
3. which layer has authority to score, judge, or activate?
4. how should the work split across app, engine, contract, and research agents?

Supporting implementation documents:

- field-level object contracts: `docs/domains/core-loop-object-contracts.md`
- route and ownership contracts: `docs/domains/core-loop-route-contracts.md`
- allowed lifecycle transitions: `docs/product/core-loop-state-matrix.md`
- surface wireframes: `docs/product/core-loop-surface-wireframes.md`
- verification procedure: `docs/runbooks/core-loop-verification.md`
- staged migration plan: `docs/runbooks/core-loop-migration-plan.md`

## Product Definition

Cogochi is a personal judgment accumulation system:

`trade review -> Save Setup -> AutoResearch expansion -> verdict feedback -> refinement`

The user is not authoring rules first.
The user is saving reviewed evidence first, then letting the system search, monitor, and learn from it.

## Design Principles

1. `Capture before compose`
   - the primary Day-1 input is a reviewed chart segment, not an abstract strategy form
2. `AutoResearch expands; it does not invent`
   - every live search or alert must trace back to saved user evidence or an evaluated hypothesis
3. `Deterministic judgment authority`
   - LLM parses and explains; engine and deterministic ML layers score, evaluate, and judge
4. `One surface, one primary job`
   - terminal captures, lab evaluates and activates, dashboard monitors and judges
5. `Every click must move the loop forward`
   - avoid decorative analysis panes that do not create, evaluate, activate, or judge a setup

## Canonical Object Model

### `capture`

User-facing meaning:
- the exact reviewed chart range the trader meant

Created in:
- `/terminal`

Minimum payload:
- symbol
- timeframe
- selected range start and end
- selected OHLCV and indicator slices
- optional note or thesis
- optional candidate or alert linkage

Lifecycle:
- `draft selection -> saved capture -> linked to challenge or recall`

Authority:
- app may assemble UI context
- engine-facing persistence is the durable truth

### `challenge`

User-facing meaning:
- evaluated setup hypothesis derived from one or more captures or structured intent

Created or updated in:
- `/lab`

Minimum payload:
- stable slug or identifier
- source capture references
- executable evaluation definition
- latest evaluation summary

Lifecycle:
- `projected -> evaluated -> accepted or refined`

Authority:
- lab owns when it becomes an active evaluated artifact

### `pattern`

System meaning:
- reusable runtime/search representation derived from evaluation and refinement

Owned by:
- engine and research layers

Lifecycle:
- `candidate pattern -> monitored runtime -> improved thresholding`

Authority:
- never created implicitly by UI-only logic

### `watch`

User-facing meaning:
- active live monitoring registration for an evaluated setup

Created in:
- `/lab` only

Managed in:
- `/dashboard`

Lifecycle:
- `live -> paused -> resumed -> retired`

Authority:
- activation from lab
- pause/resume/status management from dashboard

### `alert`

User-facing meaning:
- live market event produced by AutoResearch for a watch or pattern context

Produced by:
- scanner and alert pipeline

Consumed in:
- `/dashboard`, drilldown in `/terminal`

Lifecycle:
- `pending -> manually judged and/or auto judged -> archived`

Authority:
- engine creates
- user feedback and auto-outcome update state

### `verdict`

Meaning:
- explicit judgment attached to an alert, instance, or saved setup outcome

Sources:
- manual user feedback
- automatic outcome logic

Rules:
- source must remain attributable
- manual and automatic judgments must remain distinguishable

### `ledger`

Meaning:
- durable record of outcome, feedback, and aggregate performance across captures, challenges, watches, and alerts

Owned by:
- engine and research layers

Purpose:
- improve ranking, thresholds, and later training

## Surface UX Architecture

### `/terminal` — Review and Capture Cockpit

Primary user job:
- inspect a real chart and turn that review into durable setup evidence

Above-the-fold priority:
1. chart and replay context
2. saveable range state
3. core evidence strip
4. next-step actions

Required UI regions:
- context bar: symbol, timeframe, replay source, candidate or alert source, freshness
- chart board: visible selected range and indicators
- evidence rail: OI, funding, volume, structure, note
- next-step cluster: `Save Setup`, `Open in Lab`, and status-only watch continuity cues when already active

Primary actions:
1. select or adjust reviewed range
2. write optional short thesis note
3. press `Save Setup`
4. inspect similar capture preview
5. hand off to lab when evaluation is needed

Day-1 modes:
1. reviewed range only
2. reviewed range + hint
3. explicit query or condition input

UI rules:
- the chart is the hero; AI text is supporting material
- `Save Setup` must stay visually stronger than `Run query`, `Analyze`, or other helper actions
- do not force the user into a form wizard before they can save what they are seeing
- if the range is not explicit, `Save Setup` must stay disabled with a visible reason

Success state:
- user sees exactly what was saved
- user sees whether similar captures already exist
- user sees the next valid action: `open in lab`, `already watching`, or `saved only`

Failure state:
- save failure never discards the selected range or note
- duplicate/near-duplicate cases should warn, not silently merge

### `/lab` — Evaluation and Activation Workbench

Primary user job:
- decide whether a saved setup generalizes enough to monitor live

Above-the-fold priority:
1. selected setup identity and source capture context
2. evaluation trigger and latest result
3. instance table and replay links
4. monitoring activation gate

Required UI regions:
- setup list or picker
- setup detail header with source capture summary
- evaluate run area with live progress
- results block with score, coverage, and outcome mix
- refinement block with similarity and failure-mode explanation
- activation card with monitoring state

Primary actions:
1. open projected challenge from a saved capture
2. run evaluation
3. inspect instances
4. refine the hypothesis or narrow scope
5. activate monitoring

UI rules:
- the page must answer `does this setup generalize?` before offering activation
- activation controls must remain downstream of evaluation context
- replay to terminal must always be available from evaluated instances
- refinement must explain, not mystify

Success state:
- user understands what worked, what failed, and what will now be monitored

Failure state:
- evaluation failures preserve logs and selected setup context
- low-sample or low-confidence results must degrade to `not enough evidence`, not false precision

### `/dashboard` — Monitoring and Judgment Inbox

Primary user job:
- review active monitoring state and return fast judgment on live alerts

Above-the-fold priority:
1. feedback-pending signal alerts
2. active watches
3. saved setups or challenge summaries
4. adapters placeholder

Required sections:
1. `Signal Alerts`
2. `Watching`
3. `Saved Setups`
4. `My Adapters`

Developer note:
- internal data source may still use `challenge`
- user-facing label should bias toward `saved setup` or `setup`, because this matches the loop the user actually understands

Primary actions:
1. open alert in terminal
2. record `agree` or `disagree`
3. pause or resume watch
4. return to a saved setup in lab

UI rules:
- pending alerts sort above judged alerts
- judgment actions must be one-tap and unambiguous
- the dashboard must feel like an inbox, not a secondary analysis surface
- setup summaries are secondary to live decisions

Success state:
- the user clears pending alerts quickly and can resume their loop from the right surface

Failure state:
- one broken section does not block other sections
- stale alert states must show freshness, not pretend to be live

## Cross-Surface Handoff Contract

### Terminal -> Lab

Trigger:
- user saved a capture and wants evaluation

Required handoff payload:
- source capture identity
- symbol and timeframe context
- selected range metadata
- optional note or hint

Rule:
- lab may project a challenge from this input, but terminal remains the source-of-review context

### Lab -> Dashboard

Trigger:
- user accepts or intentionally activates a monitored hypothesis

Required handoff payload:
- challenge or watch identity
- activation status
- monitoring scope
- last evaluation summary

Rule:
- dashboard does not invent watch semantics client-side

### Dashboard -> Terminal

Trigger:
- user opens a live alert or judged case for inspection

Required handoff payload:
- alert identity
- linked watch or challenge
- symbol, timeframe, timestamp
- known regime or phase summary if available

Rule:
- terminal opens into inspect mode, not blank query mode

## Action-State Contract

### `Save Setup`

Preconditions:
- symbol and timeframe resolved
- selected range exists

Effects:
- create capture
- persist note when present
- optionally fetch similar capture preview

Post-state:
- `saved`

### `Project to Challenge`

Preconditions:
- saved capture exists

Effects:
- create or update challenge projection for lab

Post-state:
- `ready_for_evaluate`

### `Run Evaluate`

Preconditions:
- selected challenge exists

Effects:
- run deterministic evaluation
- stream progress
- persist summary and instances

Post-state:
- `evaluated`

### `Activate Monitoring`

Preconditions:
- evaluated challenge exists
- user explicitly accepts activation

Effects:
- create or update live watch

Post-state:
- `watch_live`

### `Agree / Disagree`

Preconditions:
- alert exists and is feedback-capable

Effects:
- persist manual verdict
- keep source attribution

Post-state:
- `judged_manual`

### `Auto Outcome`

Preconditions:
- alert or instance reaches outcome window

Effects:
- persist auto verdict
- update ledger

Post-state:
- `judged_auto`

## Authority Split

### App

Owns:
- page composition
- local interaction state
- optimistic and degraded UX
- route orchestration

Must not own:
- scoring math
- pattern matching logic
- ledger judgment logic

### Engine

Owns:
- capture persistence truth
- evaluation truth
- monitoring truth
- verdict and ledger truth

Must not own:
- surface-only layout decisions
- client-side navigation semantics

### Contract

Owns:
- route and payload boundaries
- versioning and schema stability
- deep-link guarantees

Must not own:
- ad-hoc UX decisions that bypass page specs

### Research

Owns:
- similarity and ranking methodology
- pattern refinement policy
- feedback-to-improvement interpretation

Must not own:
- unversioned UI-only heuristics presented as truth

## Agent Execution Split

### App Agent

Ship in this order:
1. terminal capture UX and save states
2. lab evaluate and activation shell
3. dashboard alert inbox and watch controls

Deliverables:
- components
- routes
- loading or error states
- contract-safe request wiring

### Engine Agent

Ship in this order:
1. canonical capture endpoints and persistence
2. evaluated challenge or instance endpoints
3. watch, alert, verdict, and ledger endpoints

Deliverables:
- routes
- persistence
- deterministic evaluation and judgment semantics

### Contract Agent

Ship in this order:
1. object schema definitions
2. route payload compatibility checks
3. deep-link and replay contracts

Deliverables:
- type boundaries
- migration notes
- contract tests

### Research Agent

Ship in this order:
1. similar-capture retrieval baseline
2. ranking and refinement summaries
3. feedback aggregation policy for threshold improvement

Deliverables:
- reproducible search and ranking methods
- evaluation notes
- measured improvement criteria

## Recommended Implementation Slices

1. `Capture foundation`
   - canonical capture payload
   - terminal selected-range save
   - duplicate and error states

2. `Evaluation handoff`
   - capture-to-challenge projection
   - lab challenge selection and evaluate flow
   - instance replay to terminal

3. `Monitoring activation`
   - lab activation action
   - watch persistence
   - dashboard watch rendering

4. `Judgment inbox`
   - signal alerts section
   - agree/disagree actions
   - auto outcome and ledger linkage

5. `Research reinforcement`
   - similar capture preview
   - refinement explanations
   - ranked threshold improvement inputs

## Done Criteria

- a new agent can identify the user-facing loop and internal object model from files alone
- each surface exposes one primary job and one clear next action
- alert feedback and ledger accumulation are described as first-class system behavior
- the app, engine, contract, and research work can be split without inventing new product semantics
