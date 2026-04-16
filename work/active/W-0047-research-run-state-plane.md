# W-0047 Research Run State Plane

## Goal

Introduce a Phase A `research_run` state plane under `worker-control` so methodology-owned search and evaluation state is durable without polluting the pattern evidence ledger.

## Owner

engine

## Scope

- define the initial `research_run` persistence shape for `worker-control`
- define the minimal schemas for `research_run`, `selection_decision`, and compact `research_memory`
- choose the first filesystem or storage location for Phase A durability
- document how `research_run` hands off to `training_run` without collapsing the two concepts

## Non-Goals

- implementing full swarm orchestration in this slice
- adding public app-web routes
- moving existing pattern ledger records to a new store
- automatic model promotion

## Canonical Files

- `AGENTS.md`
- `work/active/W-0047-research-run-state-plane.md`
- `docs/domains/refinement-methodology.md`
- `docs/domains/pattern-ml.md`
- `docs/decisions/ADR-004-runtime-split-and-state-plane.md`
- `engine/worker/main.py`
- `engine/ledger/types.py`
- `engine/ledger/store.py`

## Facts

- the methodology architecture now defines `Research Run` as the first durable methodology artifact
- `worker-control` is already the intended home for training, scheduler, and report-generation control-plane work
- the pattern ledger currently records evidence and promotion-adjacent artifacts such as `training_run` and `model`
- exploratory methodology state should stay separate from the pattern ledger in Phase A
- the repo already uses local durable stores for control-plane state, including SQLite-backed `memory/state_store.py` and file-backed `patterns/model_registry.py`
- `engine/research/state_store.py` now provides a SQLite WAL-backed `ResearchStateStore`
- the first slice persists `research_runs`, `research_selection_decisions`, and `research_memory_notes` separately
- targeted verification passes with `uv run pytest tests/test_research_state_store.py`
- `engine/research/worker_control.py` now provides a bounded-job orchestration helper that drives `create_run -> start_run -> complete_run/fail_run`
- worker-control orchestration records `selection_decision` and `research_memory` before completing a successful run
- targeted verification now passes with `uv run pytest tests/test_research_state_store.py tests/test_research_worker_control.py`
- `engine/research/pattern_refinement.py` now wires one concrete bounded evaluation job from pattern ledger evidence to `train_candidate` handoff logic
- `uv run python -m research.cli pattern-bounded-eval --slug tradoor-oi-reversal-v1 --splits 4` runs end-to-end and currently returns `no_op` because the real ledger is not yet train-ready
- runtime SQLite artifacts now live under ignored paths via `engine/.gitignore`
- `engine/patterns/training_service.py` now holds the canonical internal pattern-training logic used by both the route and worker-control handoff
- `engine/research/train_handoff.py` now executes a completed `train_candidate` handoff into the training lane and writes the training result back into `research_run.handoff_payload`
- targeted verification passes for research lifecycle, train handoff, and route regression
- `engine/research/objectives.py` now derives bounded refinement objectives from the current ledger state
- `engine/worker/research_jobs.py` now provides a worker-control one-shot trigger that derives an objective and runs one bounded refinement cycle
- targeted verification now passes for objective derivation and worker one-shot trigger behavior
- `engine/scanner/jobs/pattern_refinement.py` now provides a scheduled worker-control job wrapper for bounded refinement cycles, with optional automatic train handoff
- `engine/scanner/scheduler.py` now supports `ENABLE_PATTERN_REFINEMENT_JOB`, `PATTERN_REFINEMENT_INTERVAL_SECONDS`, and `PATTERN_REFINEMENT_AUTO_TRAIN`
- targeted verification now passes for scheduler job wrapping as well

## Assumptions

- Phase A can start with filesystem-backed or JSON-backed state if the schemas and ownership boundaries are explicit
- the first `research_run` slice should optimize for resumability and auditability, not for multi-tenant scale

## Open Questions

- whether `research_memory` should be colocated with `research_run` records or generated from completed runs

## Decisions

- `research_run` is a control-plane artifact, not an evidence-ledger artifact
- handoff from methodology to training must be explicit: a `research_run` may end in `no-op`, `dead-end`, or `train-candidate`
- initial storage may be file-backed if it preserves reproducible metadata and clean ownership
- Phase A will use a SQLite-backed `worker-control` state store so run lifecycle updates remain atomic and resumable
- `selection_decision` will be stored as a separate table keyed by `research_run_id`, not embedded into the run row
- `research_memory` will start as compact stored notes linked to completed runs rather than a derived-only view
- `research_run` lifecycle methods in Phase A are `create_run`, `start_run`, `complete_run`, and `fail_run`
- handoff to training remains payload-based on the completed research run and does not emit ledger `training_run` records automatically
- Phase A orchestration uses `ResearchWorkerController.run_bounded_job(...)` as the first worker-control execution boundary
- the first concrete Phase A job is a bounded walk-forward evaluation over ledger-derived pattern training records
- successful `train_candidate` runs hand off through an internal service, not by reimplementing route logic inside worker-control
- bounded refinement no longer requires a manually supplied objective id; worker-control can derive one from ledger readiness and prior model state
- PR split is intentional: W-0047 carries the durable research-run foundation and bounded refinement loop; W-0048 carries policy gating and operator report artifacts

## Next Steps

1. Open this foundation branch as the base for the W-0048 policy/reporting branch.
2. Keep policy gating and report artifacts out of this PR.

## Exit Criteria

- a canonical work item exists for `research_run` state-plane implementation
- the owner, storage boundary, and handoff semantics are explicit
- the next implementation turn can start from files without reconstructing the design from chat

## Handoff Checklist

- this work item is the next execution slice after W-0046
- do not collapse `research_run` into `training_run`
- keep public runtime and evidence-ledger boundaries intact
- implementation landed in `engine/research/state_store.py` with tests in `engine/tests/test_research_state_store.py`
- orchestration landed in `engine/research/worker_control.py` with tests in `engine/tests/test_research_worker_control.py`
- concrete bounded eval landed in `engine/research/pattern_refinement.py` with tests in `engine/tests/test_pattern_refinement.py`
- training handoff landed in `engine/research/train_handoff.py` with tests in `engine/tests/test_train_handoff.py`
- shared training core landed in `engine/patterns/training_service.py` and route regression still passes
- objective derivation landed in `engine/research/objectives.py` with tests in `engine/tests/test_research_objectives.py`
- worker one-shot trigger landed in `engine/worker/research_jobs.py` with tests in `engine/tests/test_worker_research_jobs.py`
- scheduled refinement job landed in `engine/scanner/jobs/pattern_refinement.py` with tests in `engine/tests/test_pattern_refinement_job.py`
- follow-on policy/reporting design moved to `work/active/W-0048-refinement-policy-and-reporting.md`
- no public routes were added in this slice
- PR branch: `codex/w-0047-research-run-state-plane-clean`
