# W-0049 Refinement Operator Control Plane

## Goal

Design the operator-facing control plane for refinement so `train_candidate` outcomes can be reviewed, approved, deferred, or rejected explicitly, recent research state is inspectable without reading raw SQLite rows, and scheduled refinement has guardrails beyond simple on/off flags.

## Owner

contract

## Scope

- define the operator decision surface for `train_candidate` outcomes
- define the first read-only inspection surface for `research_run`, `selection_decision`, `research_memory`, and training handoff state
- define scheduler guardrails that gate scheduled refinement and optional auto-train behavior
- keep the control-plane design separate from the research-policy design in W-0048

## Non-Goals

- implementing the control plane in this slice
- changing evidence-ledger or pattern-runtime semantics
- designing the research objective/search-policy logic itself
- adding public app-web product UX

## Canonical Files

- `AGENTS.md`
- `work/active/W-0049-refinement-operator-control-plane.md`
- `docs/domains/refinement-methodology.md`
- `docs/domains/refinement-policy-and-reporting.md`
- `docs/domains/refinement-operator-control-plane.md`
- `engine/research/state_store.py`
- `engine/research/train_handoff.py`
- `engine/worker/research_jobs.py`
- `engine/scanner/jobs/pattern_refinement.py`
- `engine/scanner/scheduler.py`

## Facts

- the system now produces durable `research_run`, `selection_decision`, `research_memory`, and optional training handoff results
- scheduled refinement and optional auto-train already exist as internal worker-control capabilities
- there is not yet an explicit operator approval state between `train_candidate` and actual handoff execution
- there is not yet a dedicated read-only surface for inspecting recent refinement runs without reading raw state files or CLI JSON blobs

## Assumptions

- operator review remains part of the safe control-plane baseline even when some refinement work is scheduled
- internal read-only surfaces may begin as CLI or engine-internal APIs before any app-web UI exists

## Open Questions

- whether approval state should live in the same SQLite store as `research_run` or in a separate control-plane table
- whether read-only inspection should begin as CLI-only, engine route(s), or both
- whether scheduler pause rules should be pattern-local only or also global

## Decisions

- separate the operator control plane from objective/search-policy design so ownership stays clean
- `train_candidate` should not imply immediate handoff once operator control is enabled
- read-only inspection is a first-class control-plane requirement, not a debugging convenience
- scheduler guardrails should be explicit policy, not scattered environment checks

## Next Steps

1. Finalize the control-plane design in `docs/domains/refinement-operator-control-plane.md`.
2. Define approval-state schema and read-only inspection contracts.
3. Define scheduler pause and escalation guardrails before enabling wider automation.

## Exit Criteria

- a canonical design exists for the operator control plane
- future implementation can proceed without re-deriving approval/read/guardrail behavior from chat
- W-0048 and W-0049 have clean, non-overlapping responsibilities

## Handoff Checklist

- this slice is design-only
- W-0048 owns policy and reporting; W-0049 owns operator control and guardrails
- future implementation should preserve that split
