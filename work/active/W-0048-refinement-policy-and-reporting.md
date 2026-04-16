# W-0048 Refinement Policy and Reporting

## Goal

Implement the next refinement-methodology upgrade so objective derivation and train-readiness reporting become explicit control-plane behavior instead of a shallow no-op rationale.

## Owner

research

## Scope

- enrich objective derivation with a structured readiness plan, recommended search policy, evaluation protocol, and supporting signals
- make `dataset_readiness` no-op runs record actionable next data requirements in `selection_decision` and `research_memory`
- include recent research-run history as an optional policy input for reset-search branching
- keep bounded eval and train handoff behavior unchanged only when the derived policy allows the current bounded-eval executor
- separate trainability deficits from quality warnings so score-coverage warnings do not change train-ready state
- emit one compact operator-readable report artifact per completed bounded refinement run

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
- `engine/research/reporting.py`
- `engine/research/state_store.py`
- `engine/research/train_handoff.py`
- `engine/tests/test_research_objectives.py`
- `engine/tests/test_pattern_refinement.py`
- `engine/tests/test_train_handoff.py`
- `engine/worker/research_jobs.py`
- `engine/scanner/jobs/pattern_refinement.py`

## Facts

- the current core loop executes `ledger -> objective -> policy gate -> bounded eval -> research_run -> optional train_candidate handoff`
- objective derivation now returns structured readiness, search policy, evaluation protocol, and recent-run supporting signals
- readiness plans separate trainability deficits from quality warnings such as low score coverage
- bounded eval can only create a train candidate for policies that explicitly allow the bounded-eval executor
- real-environment bounded refinement can return `no_op` when data is insufficient and `dead_end` when policy requires a different executor
- completed bounded refinement runs now need a durable report artifact for scheduler/operator review

## Assumptions

- the next improvement should increase decision quality before adding more execution breadth
- operator readability matters because refinement remains a supervised control-plane activity even when parts are scheduled

## Open Questions

- whether reset-search should later include broader plateau/variance policy beyond recent dead-end count
- whether train handoff should remain operator-triggered by default even after scheduled refinement is enabled

## Decisions

- design-first upgrade focuses on policy quality, not on adding more search backends
- objective derivation must consider recent research history, not only current ledger readiness
- search-policy branching should be explicit and finite rather than implicit in code paths
- report artifacts should be durable, compact, and operator-readable; they are part of the control plane, not a chat byproduct
- rollout of scheduled refinement and auto-train must remain separately configurable
- a `no_op` from insufficient ledger evidence is a valid completed research result, but it must include structured deficits and next data actions
- the first readiness engine can be deterministic and small: it should improve operator clarity before adding new search backends
- policy must control execution: reset-search and drift-review policies must not accidentally produce a train-candidate through the bounded-eval executor
- this slice is stacked on the W-0047 research-run foundation branch so the PR diff stays limited to policy gating and report artifacts
- report artifacts belong under engine research runtime and should summarize DB state rather than duplicate business logic

## Next Steps

1. Add compact report writer and emit reports after completed bounded refinement runs.
2. Split the stacked W-0047 foundation from this W-0048 readiness-policy slice before PR.
3. Consider splitting `objectives.py` into readiness, policy, and objective modules once the next policy branch is added.

## Exit Criteria

- objective derivation returns structured readiness, search-policy, evaluation-policy, and supporting-signal fields
- no-op bounded eval runs record actionable readiness deficits instead of only a plain text reason
- reset-search or drift-review policies cannot produce `train_candidate` until a matching executor exists
- score-coverage gaps appear as warnings, not trainability deficits
- completed bounded refinement runs write a compact JSON report with run metadata, policy, decision, memory excerpts, and operator recommendation
- targeted engine tests pass for objective derivation and bounded no-op recording

## Handoff Checklist

- active branch: `codex/w-0048-refinement-policy-reporting-clean`
- PR base branch: `codex/w-0047-research-run-state-plane-clean`
- verification passed: `uv run pytest tests/test_research_state_store.py tests/test_research_worker_control.py tests/test_train_handoff.py tests/test_pattern_refinement.py tests/test_pattern_refinement_job.py tests/test_research_objectives.py tests/test_worker_research_jobs.py`
- this slice preserves train-candidate handoff only for bounded policies that explicitly allow it
