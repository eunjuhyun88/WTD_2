# Surface System Application Guide

## Purpose

Apply one consistent product system to all Day-1 pages so implementation, copy, APIs, and QA all point to the same contract.

MANDATORY reading rule:

- Engineers and agents must read `docs/domains/contracts.md` first (Surface-Contract Index), then this file, then `docs/product/core-loop-agent-execution-blueprint.md`.
- When object semantics or lifecycle behavior is in scope, they must also read `docs/domains/core-loop-object-contracts.md` and `docs/product/core-loop-state-matrix.md` before touching code.
- When route shape, ownership, or migration behavior is in scope, they must also read `docs/domains/core-loop-route-contracts.md` and `docs/runbooks/core-loop-migration-plan.md`.
- Surface implementation work should then read the target page spec and `docs/product/core-loop-surface-wireframes.md`.
- Starting from implementation files without this read sequence is out-of-process.

## Day-1 Canonical Boundary

- Active pages: `/`, `/terminal`, `/lab`, `/dashboard`
- Deferred pages: `/create`, `/agent/[id]`, `/scanner` cockpit, `/screener`, character layer
- Engine authority: scoring/evaluation logic stays in engine-facing contracts
- App authority: orchestration, rendering, interaction, and persistence UX

## Freeze Policy

- `/` (home) is currently frozen: maintenance and regression fixes only.
- Active iteration focus is `/terminal`, `/lab`, `/dashboard`.

## Product Loop Contract

Day-1 loop is fixed:

1. Review and capture in `/terminal`
2. Evaluate and activate in `/lab`
3. Monitor, judge, and manage in `/dashboard`
4. Enter loop from `/` (home)

No page should duplicate another page's primary job.

Query/compose inside `/terminal` may still create a `challenge`, but it is a helper path.
It must not displace the canonical `inspect -> select range -> Save Setup` entry path.

Terminal registration may start from:

1. reviewed range only
2. reviewed range + short hint
3. explicit query/condition input

The first two are primary Day-1 modes.

AutoResearch is the cross-surface engine that sits between capture and feedback:

- it turns saved capture/challenge intent into market-wide monitoring
- it surfaces live candidates and alerts back into terminal/dashboard contexts
- it feeds judged outcomes into refinement without becoming a separate Day-1 page

## Shared Vocabulary (Required)

Use only these terms for Day-1 user-facing and developer-facing docs:

- `capture`: durable selected-range evidence saved from terminal trade review
- `challenge`: saved executable setup artifact for lab evaluation, replay, or structured compare
- `AutoResearch`: market-wide search and monitoring engine driven by saved captures/challenges
- `instance`: evaluated row/outcome for one matched case
- `evaluate`: deterministic challenge run (`prepare.py evaluate`)
- `watching`: saved live search context from terminal

Avoid legacy mixed terms in Day-1 surfaces (`agent object`, `stage`, `archetype`, `character HQ`).

## Cross-Surface Deep-Link Contract

- Terminal to Lab: `/lab?slug=<challenge>`
- Lab to Terminal replay: `/terminal?slug=<challenge>&instance=<timestamp>`
- Terminal seed query: `/terminal?symbol=<symbol>&tf=<tf>&q=<query>`

All deep links must remain stable unless documented in contracts + migration notes.

## UI Evidence Contract

Where AI or analysis conclusions appear, enforce:

`Verdict -> Action -> Evidence -> Sources -> Detail`

This applies to cards, detail panels, and mobile detail sheets.

## Ownership and Layering

- Surface pages own UX state and interactions.
- App routes own orchestration and response shaping.
- Engine routes remain decision authority for evaluate/score/verdict semantics.
- Surface code must not recreate engine block/feature/scoring logic.

## Data-State Minimum Contract

Every active page must handle explicit:

- loading
- empty
- degraded
- error
- stale/delayed data (when relevant)

Silent failures and hidden fallback states are disallowed.

## Shared Components Contract

All Day-1 pages should use one shared shell policy:

- Desktop top nav: logo, market ticker strip, primary route tabs, settings area
- Mobile nav: fixed bottom navigation with consistent route emphasis
- Shared toast semantics: success/error/info/warning with capped stack behavior
- Shared modal semantics: upgrade/paywall and destructive confirmation patterns
- Shared accessibility baseline: keyboard focusability, visible focus ring, reduced motion support

Visual token direction remains black-first and data-forward.
Do not introduce surface-local color systems that drift from global tokens.

## Commercial Gate Contract (Day-1)

If free-tier limits are shown, behavior should be explicit:

- block action with clear reason
- provide recoverable next action (wait, reduce scope, or upgrade)
- avoid fake-enabled controls that fail silently

Typical gated actions:

- challenge count limit
- daily analysis/evaluate session limit
- expanded symbol universe or alert channels

## Change Protocol

Every surface-affecting change should include:

1. page spec update in `docs/product/pages/*` when behavior changes
2. blueprint check against `docs/product/core-loop-agent-execution-blueprint.md` when object semantics, handoffs, or ownership changes
3. contract check against `docs/domains/contracts.md`
4. acceptance checklist evidence in the related work item

## Interaction Documentation Requirement

Every active/implemented surface spec must include a `Button Action -> Outcome Contract` section.

Minimum per button:

1. trigger
2. action (state/API/navigation)
3. expected result
4. failure result

Do not leave button semantics implicit.

## Global Acceptance Checklist

- [ ] Day-1 vocabulary is consistent (`capture`, `challenge`, `AutoResearch`, `instance`, `evaluate`, `watching`)
- [ ] Deferred features are not presented as active
- [ ] `/terminal`, `/lab`, `/dashboard` deep links work both directions
- [ ] AutoResearch-driven watch/alert feedback flow is visible across lab/dashboard contracts
- [ ] Loading/empty/error states are explicit and readable
- [ ] No engine decision logic duplicated in app surface code
- [ ] Evidence ordering is visible where recommendations are shown

## Current Route Implementation Snapshot

Observed app routes currently mounted:

- `/`
- `/terminal`
- `/lab`
- `/dashboard`
- `/patterns`
- `/settings`
- `/passport`
- `/agent` and `/agent/[id]` (both redirect to `/lab`)

Implementation status against Day-1 canonical loop:

1. `/terminal`: mostly implemented (cockpit, streaming, board, detail rails, mobile board/sheet, save modal)
2. `/lab`: partially aligned (active and rich UI exists, but still strategy/backtest-first flow)
3. `/dashboard`: partially aligned (inbox layout exists, but data comes from strategy store/static watching list)
4. `/`: implemented and active, but currently frozen by policy

Additional mounted pages not in Day-1 active surface spec:

- `/patterns` (pattern engine dashboard)
- `/settings` (preferences + AI runtime settings)
- `/passport` (profile/passport summary)

These are implemented surfaces and should be treated as existing product reality even when outside Day-1 canonical focus.
