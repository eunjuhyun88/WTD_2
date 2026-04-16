# Core Loop Migration Plan

## Purpose

Define the staged migration from the current mixed `challenge / strategy / watchlist / alert-rule` landscape to the canonical capture-first core loop.

This runbook is for implementation planning, not a one-shot rewrite.

## Migration Goal

Reach this Day-1 stable loop without breaking active user flows:

`review in terminal -> save capture -> project challenge in lab -> evaluate -> activate watch -> review alerts -> accumulate verdict/ledger evidence`

## Starting State

Current repo reality includes:

- `Save Setup` and pattern capture persistence in app-local terminal routes
- `wizard` challenge composition for explicit query flow
- lab UI that still contains strategy/backtest-first assumptions
- dashboard using strategy summaries and local/static watch continuity
- `terminal/alerts` used for alert rules, not live signal alerts
- `cogochi/alerts` used as raw live alert feed
- engine-side capture and pattern routes that are not yet the single browser-facing contract pack

## Migration Principles

1. no big-bang rewrite
2. preserve user-facing routes where already good enough
3. introduce new canonical routes before deleting old ones
4. treat aliases and adapters as temporary, documented migration tools
5. every phase must preserve the state-matrix rules

## Artifact Mapping

| Current Artifact | Current Meaning | Target Meaning | Migration Action |
|---|---|---|---|
| `terminal_pattern_captures` | terminal-side saved review records | canonical `capture` object | keep and evolve behind capture contract |
| `terminal_watchlist` | continuity list and active symbol state | temporary watch continuity cache, not canonical `watch` | alias during migration; replace with `watch` object routes |
| `terminal_alert_rules` | local alert settings | alert-rule settings only, outside live alert object | keep separate; do not overload as live alert state |
| `engine_alerts` | raw scanner alert rows | upstream source for canonical `alert` object | wrap behind `/api/alerts` |
| `answers.yaml` / challenge files | evaluated setup definition | canonical `challenge` artifact | keep and expose through lab routes |
| local strategy store summaries | dashboard/lab summary source | transient summary adapter | retire once challenge/watch/alert summaries are canonical |
| `POST /api/wizard` | query-to-challenge helper | explicit query helper only | keep as secondary path |

## Phase Plan

### Phase 0: Contract Freeze

Goal:
- stop redefining product semantics while implementation proceeds

Deliver:

- blueprint
- object contracts
- state matrix
- route contracts
- wireframes
- verification runbook

Exit:

- all new work items cite these docs instead of external drafts

### Phase 1: Capture Foundation Stabilization

Goal:
- make `Save Setup` succeed or fail as a true capture action

Work:

- keep `/api/terminal/pattern-captures` as canonical browser-facing capture route
- ensure selected-range evidence is mandatory
- remove any `Save Setup -> challenge/create` fallback behavior
- make similar-capture preview clearly helper-only

Verification focus:

- terminal capture happy/failure paths
- duplicate and retry behavior

### Phase 2: Projection Bridge

Goal:
- make capture-to-challenge projection explicit instead of implicit or ad hoc

Work:

- add `/api/lab/challenges/project`
- expose source capture linkage in lab
- keep `/api/wizard` only for explicit query path
- stop treating lab as original authoring surface

Verification focus:

- projected challenge always retains `source_capture_ids`
- query-derived challenges and capture-derived challenges remain distinguishable

### Phase 3: Evaluation Route Unification

Goal:
- give lab one canonical evaluate route

Work:

- add `/api/lab/challenges/{slug}/evaluate`
- keep existing engine or runner implementations behind adapter/orchestration layers
- stop coupling lab UI directly to strategy-local result shapes

Verification focus:

- summary fields stable
- instance replay returns to terminal
- failed run preserves logs and selection

### Phase 4: Watch Object Extraction

Goal:
- separate canonical `watch` from terminal watchlist continuity UI

Work:

- add `/api/lab/challenges/{slug}/activate`
- add `/api/watches` and `/api/watches/{id}`
- keep `terminal/watchlist` as continuity alias only while dashboard still depends on it
- prevent dashboard from creating watches directly

Verification focus:

- watch activation only from evaluated challenge
- pause/resume/retire actions use canonical watch object

### Phase 5: Alert Object Separation

Goal:
- separate live signal alerts from local alert rules

Work:

- add canonical `/api/alerts`
- add `/api/alerts/{id}/verdict`
- treat `/api/cogochi/alerts` as upstream feed or alias source only
- leave `/api/terminal/alerts` as alert-rule settings route

Verification focus:

- pending alerts sort first
- manual and auto verdict states remain distinct
- terminal drilldown context is always present

### Phase 6: Ledger and Summary Unification

Goal:
- retire strategy-store or ad hoc summary surfaces in favor of canonical evidence-backed summaries

Work:

- add `/api/ledger/summary` and `/api/ledger/entries`
- source dashboard saved setup summaries from challenge and watch objects
- source dashboard alert state from canonical alert object
- phase out local strategy summary assumptions

Verification focus:

- summary views trace back to upstream ids
- ledger entries remain append-first evidence

### Phase 7: Legacy Retirement

Goal:
- remove confusing fallbacks and aliases once canonical routes are proven

Candidate retirements:

- `Save Setup` fallback to challenge creation
- direct surface dependence on local strategy store for day-1 summaries
- direct browser consumption of raw `/api/cogochi/alerts`
- treating `terminal/watchlist` as if it were canonical monitoring state

Rules:

- retire only after replacement routes have passed the verification runbook
- document any deprecation window in the relevant work item

## Recommended Execution Order by Lane

### Contract Lane

1. capture route contract
2. projection and evaluate contracts
3. watch and alert contracts
4. ledger contracts

### App Lane

1. terminal save states
2. lab projection and evaluate UI
3. dashboard alert-first inbox
4. watch continuity migration

### Engine Lane

1. capture persistence alignment
2. evaluate adapter alignment
3. alert/verdict persistence
4. ledger summary exposure

### Research Lane

1. similar capture retrieval quality
2. refinement summary quality
3. threshold and ranking use of verdict/ledger outputs

## Slice Boundaries

Keep slices narrow.

Good slice examples:

1. terminal capture route + UI state only
2. lab project + evaluate bridge only
3. watch activation + dashboard watch rendering only
4. alerts inbox + manual verdict only

Bad slice examples:

1. full core-loop rewrite in one PR
2. renaming every internal `challenge` identifier before route contracts are stable
3. mixing watch extraction, alert refactor, and ledger rewrite in one change set

## Rollback Rules

If a migration slice fails:

1. preserve old route behavior until replacement is verified
2. keep adapters explicit, not hidden
3. prefer feature-flag or route-level fallback over silent semantic drift

## Done Condition

The migration is complete when:

1. terminal capture is the unambiguous primary entry path
2. lab owns projection, evaluation, and activation with canonical routes
3. dashboard consumes canonical watch and alert objects
4. manual and automatic verdicts flow into ledger-backed summaries
5. remaining legacy routes are either helper-only or retired
