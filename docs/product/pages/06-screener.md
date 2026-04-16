# Surface Spec: Screener (`/screener`)

## Status

Deferred surface.

This page is not part of the current Day-1 active page set and should not be implemented before the engine Screener contracts are stable.

## Role

Research-grade upstream filter for symbol selection.

Screener answers:

- which names deserve attention first?
- how strong is the name structurally?
- how interesting is the timing right now?

It does not answer:

- exactly when to enter
- whether a setup already triggered

Those remain Pattern Engine and `/terminal` responsibilities.

## Core Contract

Screener page should support:

`rank -> inspect -> open in terminal/patterns -> watch grade change`

The page must show why a symbol is ranked, not just the rank.

The page must not collapse:

- structural quality
- timing quality
- confidence

into one unlabeled score.

## Primary Sections

Exactly four sections:

1. Run Summary
2. Grade Tabs
3. Symbol Breakdown Table
4. Detail Drawer

## Section 1: Run Summary

Purpose:

- show freshness and trust state of the latest Screener run

Required fields:

- last base refresh time
- last live overlay refresh time
- structural grade counts (`A/B/C/excluded`)
- fallback status (`screened_ab` live vs fallback to dynamic universe)

## Section 2: Grade Tabs

Tabs:

- `A`
- `B`
- `C`
- `Excluded` (optional behind advanced toggle)

Purpose:

- quickly narrow the list by actionability

## Section 3: Symbol Breakdown Table

Required columns:

- symbol
- structural grade
- timing state
- confidence
- composite sort score
- pattern phase
- market cap band
- drawdown band
- supply concentration badge
- freshness

Optional sortable columns:

- composite sort score
- structural score
- timing score
- market cap
- phase

## Section 4: Detail Drawer

Purpose:

- show one symbol's detailed criterion breakdown and route-out actions

Required blocks:

1. Score Summary
2. Criterion Breakdown
3. Confidence / Coverage
4. Raw Metric Evidence
5. Pattern Status
6. Applied Overrides
7. Actions

## Required States

- loading
- empty
- degraded
- stale
- fallback active

The page must make stale or fallback Screener output explicit.

## Data Contract

The page reads engine-owned Screener contracts only.

It must not:

- recompute grades client-side
- invent derived criterion scores
- hide missing criteria behind local defaults

## Default User Flow

1. user opens `/screener`
2. page loads latest run summary and `A` grade tab first
3. user sorts or filters the table
4. user opens one symbol detail drawer
5. user checks structural grade, timing state, and confidence separately
6. user routes to `/terminal?symbol=<symbol>&tf=4h` or `/patterns`

## Filters

Allowed filters:

- grade
- sector
- market cap band
- current phase
- minimum freshness

Disallowed in first surface:

- user-authored custom weighting
- client-only hidden heuristics

## Sorting Contract

Default sort:

- `composite_sort_score desc`

Secondary tie-break:

- `timing_score desc`
- then `symbol asc`

## Button Action -> Outcome Contract

### Global Actions

1. `Refresh`
   - action: request latest Screener run payload
   - expected result: run summary and table refresh
   - failure result: stale data remains visible with refresh error notice

2. `Open Patterns`
   - action: navigate to `/patterns`
   - expected result: user lands in pattern dashboard
   - failure result: navigation error notice

### Table Actions

1. `Row click`
   - action: open detail drawer for selected symbol
   - expected result: detailed criterion breakdown is visible
   - failure result: keep table state and show symbol-detail load error

2. `Open Terminal`
   - action: navigate to `/terminal?symbol=<symbol>&tf=4h`
   - expected result: terminal opens on that symbol
   - failure result: navigation error notice

3. `Open Patterns`
   - action: navigate to `/patterns` with symbol context if supported
   - expected result: pattern dashboard opens with symbol-relevant context
   - failure result: navigation error notice

### Detail Drawer Actions

1. `Watch Grade`
   - action: save watch/alert preference for grade changes
   - expected result: user receives future Screener-driven updates
   - failure result: no silent success; preference remains unchanged

2. `Open Terminal`
   - action: deep-link into terminal
   - expected result: symbol loads with timing workflow intact
   - failure result: route error notice

## Non-Goals

- no inline order entry
- no duplication of terminal chart workflow
- no challenge composer
- no pattern verdict workflow

## Acceptance Checks

- [ ] latest run freshness and fallback state are explicit
- [ ] structural grade, timing state, and confidence are all visible without opening detail
- [ ] grade tabs and table sorting work from engine-provided data
- [ ] per-symbol detail explains criterion breakdown and missing criteria clearly
- [ ] routing into `/terminal` is the primary action
- [ ] page does not recreate Pattern Engine timing logic
