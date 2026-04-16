# W-0049 Refinement Operator Control Plane

## Goal

Design the operator-facing control plane for refinement so `train_candidate` outcomes can be reviewed, approved, deferred, or rejected explicitly, recent research state is inspectable without reading raw SQLite rows, and scheduled refinement has guardrails beyond simple on/off flags.

## Owner

contract

## Scope

- implement the operator decision surface for `train_candidate` outcomes
- implement the first read-only inspection surface for `research_run`, `selection_decision`, `research_memory`, and training handoff state
- implement scheduler guardrails that gate scheduled refinement and optional auto-train behavior
- keep the control-plane implementation separate from the research-policy design in W-0048

## Non-Goals

- changing evidence-ledger or pattern-runtime semantics
- designing the research objective/search-policy logic itself
- adding public app-web product UX
- building a full promotion UI or non-CLI operator console

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
- operator approval state now exists in the same SQLite control-plane store as `research_run`
- read-only inspection now exists as store-backed helper views and CLI commands for recent runs, run detail, and pattern summary
- the implementation should fail closed: no pattern should auto-train without explicit control-plane allowance
- scheduler job now respects pattern-local pause, allowlist, approval-required, and cooldown semantics
- merge prep now runs on top of current `origin/main`; the validated refinement file set is being rebuilt there instead of rebasing the stale PR branch history directly

## Assumptions

- operator review remains part of the safe control-plane baseline even when some refinement work is scheduled
- internal read-only surfaces may begin as CLI or engine-internal APIs before any app-web UI exists

## Open Questions

- whether read-only inspection should remain CLI-first or also grow an engine route in the next slice
- whether scheduler pause rules should remain pattern-local only or also add a global kill switch

## Decisions

- separate the operator control plane from objective/search-policy design so ownership stays clean
- `train_candidate` should not imply immediate handoff once operator control is enabled
- read-only inspection is a first-class control-plane requirement, not a debugging convenience
- scheduler guardrails should be explicit policy, not scattered environment checks
- this slice should merge with the refinement-methodology engine/control-plane work, not with terminal UI or strategy-replication artifacts
- branch split reason: commit `7b845a7` mixed refinement/control-plane work with strategy-replication and chart-range spec work, so this slice needs its own execution branch and PR boundary
- operator approval state and pattern scheduler control state should live in the same SQLite control-plane store as `research_run`
- inspection should begin as CLI and store-backed helper functions, not new app routes
- scheduler should fail closed for auto-train: `approval_required=true`, `auto_train_allowed=false` by default
- train handoff should enforce operator approval whenever `approval_required=true`
- scheduler should auto-pause on repeated dead ends and should not auto-train during cooldown

## Next Steps

1. Revalidate the rebuilt `origin/main`-based refinement branch and replace the stale PR branch history with the clean merge unit.
2. Decide whether to expose read-only inspection through engine routes in addition to CLI.
3. Add a global scheduler kill switch if pattern-local guardrails are not sufficient operationally.

## Exit Criteria

- operator approval state is durable and queryable
- read-only inspection exists without opening raw SQLite rows
- scheduler guardrails fail closed for auto-train
- W-0048 and W-0049 keep clean, non-overlapping responsibilities

## Handoff Checklist

- W-0048 owns policy and reporting; W-0049 owns operator control and guardrails
- future implementation should preserve that split
- implementation landed in `engine/research/state_store.py`, `engine/research/inspection.py`, `engine/research/cli.py`, `engine/research/train_handoff.py`, and `engine/scanner/jobs/pattern_refinement.py`
- verify with `uv run pytest tests/test_research_state_store.py tests/test_train_handoff.py tests/test_pattern_refinement_job.py tests/test_research_inspection.py`
