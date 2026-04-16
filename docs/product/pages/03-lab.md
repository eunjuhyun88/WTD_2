# Surface Spec: Lab (`/lab`)

## Role

Canonical Day-1 workbench where saved captures become evaluable challenges/patterns, are tested against history, and are prepared for live AutoResearch monitoring.

Implementation detail for evaluation-stage UX priority, activation gates, and agent execution split lives in `docs/product/core-loop-agent-execution-blueprint.md`.
Surface layout and CTA hierarchy detail lives in `docs/product/core-loop-surface-wireframes.md`.

## Core Contract

Everything after `Save Setup` but before feedback returns to the dashboard is organized in lab:

`open saved challenge -> inspect definition -> evaluate -> review instances -> activate monitoring -> iterate`

Lab is the only active Day-1 surface that owns challenge run state.
Lab is also the surface that converts one saved review into a reusable monitored hypothesis.

## Capture-to-Lab Contract

Lab does not replace `Save Setup`.
Its job begins after terminal has already created durable capture evidence.

Day-1 baseline:

1. terminal capture is projected or linked into a `challenge`
2. lab shows the resulting challenge definition and evaluation state
3. lab lets the user decide whether the setup generalizes enough to monitor live
4. live monitoring status then returns through dashboard alerts/watching

## Layout Contract

- Left pane: My Challenges list
- Right pane: Selected challenge detail
- Run area: evaluate trigger + streamed output
- Result area: score summary + instances table + monitoring handoff

## Challenge List Requirements

Each row should include:

- slug/name
- last score (if available)
- last run time or never-run state
- visual priority state (star/pinned where supported)

Selecting a row must load the matching right-pane detail.

## Detail Pane Requirements

- identity summary (slug, direction, universe, timeframe)
- one-line description from challenge metadata
- upstream capture context or source-review hint when available
- block breakdown (trigger/confirmations/entry/disqualifiers)
- read-only match script view or safe open path

## Evaluate Run Contract

`Run Evaluate` must:

1. trigger backend run endpoint for selected slug
2. stream stdout/stderr progress via SSE
3. parse terminal summary block (`SCORE`, `N_INSTANCES`, etc.)
4. refresh instance rows after completion

Evaluation answers the question:

- did this saved setup generalize beyond one reviewed chart segment?

## Pattern Refinement Contract

Lab should not only say "pass/fail."
It should help the user understand how one reviewed setup might generalize into a reusable monitored pattern.

Day-1 refinement questions:

1. which historical cases look structurally similar?
2. what did the evaluated challenge actually capture well?
3. is the setup good enough to monitor live?

Useful Day-1 outputs when available:

- similar-case counts and baseline hit/miss split
- top contributing factors or block groups
- failure mode summary (`too broad`, `too sparse`, `late`, `noisy`)

Design rule:

- refinement explains or narrows the hypothesis
- it does not secretly rewrite the canonical challenge without user-visible intent

## Monitoring Activation Contract

After a successful or intentionally accepted evaluation, lab may activate live monitoring:

1. create or update `watching` / pattern-monitoring context
2. hand off the live feedback loop to scanner/alerts
3. return active alerts and watch state through dashboard

Day-1 rule:

- activation is allowed only from lab-owned evaluated context, not from arbitrary dashboard controls
- activation should expose enough context for the user to know what exactly is being monitored after the handoff

## Instances Contract

Render from instance output shape:

- symbol
- timestamp
- outcome fields (and/or upside/downside/verdict depending contract)

Row click deep-link:

`/terminal?slug=<challenge>&instance=<timestamp>`

## Data/Bridge Dependencies

- challenge metadata source (filesystem-backed bridge)
- instance read source (filesystem-backed bridge)
- runner subprocess bridge (`prepare.py evaluate`)
- explicit error envelope for partial/failed runs

## Required States

- no challenge selected
- run in progress (live stream visible)
- run success with parsed summary
- run failed with actionable error
- empty instances after run

## Non-Goals (Day-1)

- No character/agent HQ semantics
- No adapter training controls
- No alternate legacy backtest-builder as primary workflow

## Acceptance Checks

- [ ] Challenge list and selected detail remain slug-consistent
- [ ] Evaluate run streams progress and emits final summary parse
- [ ] Instances refresh after run and deep-link back to terminal
- [ ] Refinement outputs help the user understand whether the saved setup generalized or failed
- [ ] Monitoring activation handoff is explicit in the evaluated challenge flow
- [ ] Lab remains the canonical evaluation-and-activation page for Day-1

## Evaluate Summary Contract Fields

Lab summary parser should support these run footer fields:

- `SCORE`
- `N_INSTANCES`
- `N_SYMBOLS_HIT`
- `MEAN_OUTCOME`
- `POSITIVE_RATE`
- `TOTAL_SECONDS`

If `N_INSTANCES` is below minimum threshold, score semantics should reflect contract behavior (e.g. sentinel low score).

## Challenge Artifact Expectations

Lab should treat challenge directory artifacts as canonical:

- `answers.yaml` (spec source)
- `match.py` (generated/editable implementation)
- `prepare.py` (runner entry)
- `output/instances.jsonl` (evaluation rows)

## UX Rules

1. User creates and captures in terminal, not lab.
2. User evaluates, decides generalization, and activates monitoring in lab.
3. User reviews alert feedback and continuity state in dashboard.
4. All instance replay paths should resolve back to terminal context.

## Error and Degradation Rules

- Show streamed run errors in context (not generic toast-only failure).
- Preserve partial logs when run fails.
- Keep selected challenge panel stable during failures.

## Operational Notes (Day-1)

- Character/agent semantics remain removed.
- Adapter training controls remain out of scope.
- Lab should not expose hidden "advanced builder" surfaces by default navigation.

## Scorecard Extension Fields (Optional UI)

When available from evaluation outputs, lab may render extended risk/performance fields:

- EXPECTANCY
- WIN_RATE
- RISK_REWARD
- PROFIT_FACTOR
- MAX_DRAWDOWN
- COVERAGE
- SORTINO
- TAIL_RATIO

These fields are additive. Core run contract fields remain required baseline.

## Stage-Gate Messaging Contract

Lab may show stage-gate pass/fail messaging, but should not change scoring authority.
Any stage labeling must be derived from contract-safe metrics and explicit threshold rules.

## Evaluate Lifecycle Controls

Recommended run lifecycle support:

- run start
- run progress stream
- optional user cancel
- completed parse summary
- failed state with preserved stream logs

## Instance Table Ergonomics

Instance table may support:

- filter by outcome class
- sort by timestamp, symbol, or pnl-related field
- pagination/virtualization for large result sets

Deep-link to terminal replay remains mandatory.

## Current Implementation Snapshot

Implemented now:

- full lab page with chart replay workspace, builder panel, result panel, and manual replay mode
- cycle-based backtest execution flow with local result rendering
- strategy CRUD interactions through client store integration

Partially implemented:

- challenge-like workflow language appears in UI, but data model is strategy/backtest-centered
- result and trade visualization are present, but not mapped to canonical `answers.yaml` and `instances.jsonl` artifacts
- monitoring activation and AutoResearch handoff are not yet the primary user story in this page

Not yet aligned with page contract:

- canonical challenge filesystem bridge (`challengesApi`) is not the active primary flow
- evaluate via `prepare.py evaluate` SSE stream parser contract is not the active run path
- `/lab?slug=<slug>` and `/terminal?slug=<slug>&instance=<ts>` challenge-instance deep-link contract is not primary
- saved capture -> evaluated challenge -> monitoring activation flow is not yet expressed as one coherent path

## Button Action -> Outcome Contract

### Challenge List Actions

1. `Challenge row click`
   - action: set selected challenge slug/context
   - expected result: right pane loads matching detail
   - failure result: selected row state reverts with explicit detail-load error

2. `Star / pin toggle`
   - action: toggle priority state for challenge row
   - expected result: row order/visual priority updates
   - failure result: toggle reverts and shows save-state error

3. `New from Terminal`
   - action: navigate to `/terminal`
   - expected result: user can review/capture a setup and project it into a new challenge
   - failure result: visible navigation failure notice

### Detail / Evaluate Actions

1. `Run Evaluate`
   - action: start evaluate request for selected slug
   - expected result: live stream output appears and summary fields parse on completion
   - failure result: run error shown inline with preserved logs

2. `Cancel Run` (if exposed)
   - action: stop active evaluate process
   - expected result: run status switches to canceled and UI remains stable
   - failure result: warning message and safe fallback to non-running state

3. `Open match.py` / `Copy`
   - action: open read view or copy content
   - expected result: user can inspect/copy without mutating canonical artifacts
   - failure result: inline action error without breaking detail panel

4. `Activate Monitoring` (when exposed)
   - action: create or update live monitoring/watch context for the selected evaluated challenge
   - expected result: dashboard/alerts begin tracking the setup as active monitoring work
   - failure result: inline activation error without losing evaluation state

### Instance Table Actions

1. `Instance row click`
   - action: navigate to `/terminal?slug=<slug>&instance=<timestamp>`
   - expected result: terminal opens replay context for selected instance
   - failure result: navigation error notice and row remains selectable

2. `Filter / Sort controls`
   - action: apply local table state transform
   - expected result: rows reorder/filter deterministically
   - failure result: controls reset to last valid state
