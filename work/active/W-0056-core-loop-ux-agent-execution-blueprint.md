# W-0056 Core Loop UX Agent Execution Blueprint

## Goal

Specify the Day-1 Cogochi core loop at an implementation-ready level so app, engine, contract, and research agents can build from the same object model, surface responsibilities, and handoff contracts without re-deriving the product from chat or external drafts.

## Owner

contract

## Scope

- define the canonical Day-1 object model across capture, challenge, pattern, watch, alert, verdict, and ledger terms
- specify the primary UX flows and screen contracts for `/terminal`, `/lab`, and `/dashboard`
- define surface-to-surface handoff rules and action/state contracts that agents can implement independently
- publish an agent execution blueprint that splits the work into app, engine, contract, and research responsibilities
- add field-level object contracts, allowed state transitions, surface wireframes, and verification runbook coverage for core-loop implementation work
- add canonical route/API contracts and a staged legacy-to-capture-first migration plan

## Non-Goals

- changing runtime behavior or shipping UI implementation in this slice
- renaming internal persisted `challenge` identifiers across the codebase
- designing Phase-2 training marketplace or adapter UX

## Canonical Files

- `AGENTS.md`
- `work/active/W-0056-core-loop-ux-agent-execution-blueprint.md`
- `docs/domains/contracts.md`
- `docs/domains/core-loop-object-contracts.md`
- `docs/domains/core-loop-route-contracts.md`
- `docs/product/pages/00-system-application.md`
- `docs/product/pages/02-terminal.md`
- `docs/product/pages/03-lab.md`
- `docs/product/pages/04-dashboard.md`
- `docs/product/core-loop-state-matrix.md`
- `docs/product/core-loop-surface-wireframes.md`
- `docs/domains/terminal.md`
- `docs/domains/autoresearch-ml.md`
- `docs/domains/scanner-alerts.md`
- `docs/domains/dashboard.md`
- `docs/product/core-loop-agent-execution-blueprint.md`
- `docs/runbooks/core-loop-verification.md`
- `docs/runbooks/core-loop-migration-plan.md`

## Facts

- the canonical Day-1 loop is already defined as `terminal capture -> lab evaluate/activate -> dashboard monitor/judge`
- current surface docs are directionally aligned but still leave component priority, object semantics, and implementation boundaries implicit
- download design drafts consistently treat saved review evidence plus AutoResearch expansion plus verdict accumulation as the moat
- multiple drafts agree that LLM may parse/explain but deterministic engine or ML layers retain scoring and judgment authority
- the implementation-ready blueprint now lives in `docs/product/core-loop-agent-execution-blueprint.md`
- agents still need field-level contracts, allowed state transitions, wireframes, and verification rules to implement without re-deriving details
- route/API ownership is still split across current app routes, engine routes, and legacy names such as `wizard`, `watchlist`, and `cogochi/alerts`
- the execution pack now also includes canonical route targets and a staged migration plan for retiring fallback semantics safely
- the current repo has a dirty worktree, so this slice must stay documentation-only and avoid interfering with unrelated runtime changes

## Assumptions

- a single implementation blueprint doc is preferable to spreading agent handoff rules across many page specs
- Day-1 can keep `capture` as the user-facing core input while preserving `challenge` as the lab-owned evaluation artifact

## Open Questions

- whether the blueprint should later be elevated into an ADR once the first implementation slices land

## Decisions

- create one new canonical blueprint doc that combines UX architecture, object model, action/state contracts, and agent work split
- keep the surface page specs as user-facing contracts, and use the new blueprint as the implementation and handoff layer beneath them
- refine the system and surface docs only where needed to point at the new blueprint and remove ambiguity
- make dashboard an alert-first inbox in the canonical docs, while allowing internal `challenge` artifacts to remain behind user-facing `Saved Setups` language
- add four supporting documents for field-level contracts, state rules, wireframes, and verification so execution agents can start from files alone
- add one route contract doc and one migration plan doc so agents can implement toward a stable target without guessing how legacy routes should evolve

## Next Steps

1. use the execution pack to open implementation work items for capture routes, lab projection/evaluate routes, watch extraction, and alert feedback
2. align route-level comments and schemas in code to the documented canonical routes
3. retire documented fallback behavior slice-by-slice instead of through one rewrite

## Exit Criteria

- agents can identify the canonical object model and ownership boundaries without consulting chat history
- surface flows specify enough UI/action/state detail to break implementation into clean slices
- the blueprint explains how captures become evaluated challenges, live alerts, and judged feedback
- supporting docs define fields, states, wireframes, and verification gates clearly enough for independent implementation and QA
- route targets and migration sequencing are explicit enough to replace legacy fallback decisions with planned implementation slices

## Handoff Checklist

- this slice is documentation and execution-planning only
- do not treat `LLM parse/explain` as scoring authority in any downstream implementation
- preserve `engine` as backend truth and keep `app` limited to surface and orchestration concerns
