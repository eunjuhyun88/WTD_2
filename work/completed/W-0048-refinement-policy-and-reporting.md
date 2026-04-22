# W-0048 Refinement Policy and Reporting

## Goal

Implement the next refinement-methodology upgrade so objective derivation, search-policy branching, and operator-readable reporting become explicit control-plane behavior instead of ad-hoc defaults.

## Owner

research

## Scope

- define the policy inputs used to derive refinement objectives from current pattern evidence and recent research history
- define the first non-trivial search-policy branching rules beyond simple readiness gating
- define the durable report artifact path and shape for completed research runs
- define the operator and scheduler rollout policy for bounded refinement and optional train handoff

## Non-Goals

- redesigning pattern runtime or evidence-ledger semantics
- exposing new public app routes
- introducing full swarm orchestration or speculative multi-agent infrastructure

## Canonical Files

- `AGENTS.md`
- `work/active/W-0048-refinement-policy-and-reporting.md`
- `docs/domains/refinement-methodology.md`
- `docs/domains/refinement-policy-and-reporting.md`
- `docs/domains/pattern-ml.md`
- `engine/research/objectives.py`
- `engine/research/pattern_refinement.py`
- `engine/research/state_store.py`
- `engine/worker/research_jobs.py`
- `engine/scanner/jobs/pattern_refinement.py`

## Facts

- the current core loop executes `ledger -> objective -> bounded eval -> research_run -> optional train_candidate handoff`
- objective derivation now emits canonical policy fields: `baseline_ref_hint`, `recommended_search_policy`, `recommended_evaluation_protocol`, and `supporting_signals`
- search-policy branching now covers `dataset_readiness`, `scoring_drift_review`, `first_train_candidate`, `refresh_train_candidate`, and `reset_search`
- `scoring_drift_review` now splits into structural drift (`dead_end_confirmation`) and incremental drift (`local_refresh_sweep`)
- `reset_search` no longer depends on dead-end count alone; recent high-variance runs and flat local-eval plateaus also trigger escalation
- completed refinement runs now emit markdown reports under `engine/research/state/reports/`, and the report path is written back into `research_run.handoff_payload`
- runtime one-shot execution now keeps `research_run.search_policy` aligned with the derived objective instead of falling back to a local default
- reports now expose baseline reference plus gate-relative and recent-best-relative evaluation deltas
- reports now surface scoring-drift mode and give different operator guidance for structural vs incremental drift

## Assumptions

- the next improvement should increase decision quality before adding more execution breadth
- operator readability matters because refinement remains a supervised control-plane activity even when parts are scheduled

## Open Questions

- whether baseline comparison should stay "recent best eval" in Phase A or move to a model-registry-backed incumbent metric once that exists

## Decisions

- design-first upgrade focuses on policy quality, not on adding more search backends
- objective derivation must consider recent research history, not only current ledger readiness
- search-policy branching should be explicit and finite rather than implicit in code paths
- report artifacts should be durable, compact, and operator-readable; they are part of the control plane, not a chat byproduct
- Phase A report artifacts live under `engine/research/state/reports/`, not under `docs/generated/`
- rollout of scheduled refinement and auto-train must remain separately configurable
- bounded refinement jobs must persist the same policy that objective derivation recommended; `objective_id` alone is not sufficient context

## Next Steps

1. Tighten report content further with curated baseline/incumbent comparison once registry-side performance snapshots exist.
2. Keep operator approval/read-surface/scheduler-guardrail work in `work/active/W-0049-refinement-operator-control-plane.md`.

## Exit Criteria

- refinement objective derivation uses canonical policy fields from the domain design
- completed research runs persist a durable report artifact reference
- future implementation can resume from files without relying on chat context

## Handoff Checklist

- design is now reflected in `docs/domains/refinement-policy-and-reporting.md`
- implementation landed in `engine/research/objectives.py`, `engine/research/reporting.py`, and `engine/worker/research_jobs.py`
- runtime alignment fix landed in `engine/research/pattern_refinement.py` so derived policy survives one-shot execution
- plateau/variance-aware reset escalation is now covered by `engine/tests/test_research_objectives.py`
- report delta rendering is now covered by `engine/tests/test_refinement_reporting.py`
- scoring-drift split between structural and incremental paths is now covered by `engine/tests/test_research_objectives.py` and `engine/tests/test_refinement_reporting.py`
- verify with `uv run python -m research.cli pattern-refinement-once --slug tradoor-oi-reversal-v1`
- future implementation should treat this work item as the primary source for deeper policy branching behavior
- W-0049 separately owns operator control, inspection, and scheduler guardrails
