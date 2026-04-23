from __future__ import annotations

import pytest

from research.state_store import ResearchStateStore
from research.worker_control import (
    ResearchJobResult,
    ResearchJobSpec,
    ResearchMemoryInput,
    ResearchWorkerController,
    SelectionDecisionInput,
)


def test_worker_controller_records_successful_bounded_job(tmp_path) -> None:
    store = ResearchStateStore(tmp_path / "research_runtime.sqlite")
    controller = ResearchWorkerController(store)
    spec = ResearchJobSpec(
        pattern_slug="tradoor-oi-reversal-v1",
        objective_id="obj-reset-search",
        baseline_ref="baseline:candidate-v3",
        search_policy={"mode": "reset-search", "max_variants": 12},
        evaluation_protocol={"seed_starts": [0, 500, 1000, 2000], "min_seeds": 4},
        definition_ref={"definition_id": "tradoor-oi-reversal-v1:v1", "pattern_slug": "tradoor-oi-reversal-v1"},
    )

    timestamps = iter(
        [
            "2026-04-16T12:00:00+00:00",
            "2026-04-16T12:00:05+00:00",
            "2026-04-16T12:05:00+00:00",
            "2026-04-16T12:05:01+00:00",
        ]
    )

    def _now() -> str:
        return next(timestamps)

    def _execute(run):
        assert run.status == "running"
        return ResearchJobResult(
            disposition="train_candidate",
            winner_variant_ref="variant-44",
            handoff_payload={"model_key": "tradoor-oi-reversal-v1:1h:breakout_24h:fs1:lp1"},
            selection_decision=SelectionDecisionInput(
                decision_kind="train_candidate",
                rationale="Winner beat baseline on all seed starts.",
                baseline_ref="baseline:candidate-v3",
                selected_variant_ref="variant-44",
                metrics={"mean_edge": 0.22, "std_edge": 0.04},
            ),
            memory_notes=[
                ResearchMemoryInput(
                    note_kind="breakthrough",
                    summary="Reset search uncovered a better sizing regime.",
                    detail="The local sweep plateaued; reset-search found a lower-variance winner.",
                    tags=["reset-search", "variance"],
                )
            ],
        )

    completed = controller.run_bounded_job(spec, execute=_execute, now=_now)

    assert completed.status == "completed"
    assert completed.completion_disposition == "train_candidate"
    assert completed.winner_variant_ref == "variant-44"
    assert completed.definition_ref["definition_id"] == "tradoor-oi-reversal-v1:v1"
    assert completed.handoff_payload["model_key"].endswith(":fs1:lp1")

    runs = store.list_runs(pattern_slug="tradoor-oi-reversal-v1")
    assert len(runs) == 1
    decision = store.get_selection_decision(completed.research_run_id)
    assert decision is not None
    assert decision.decision_kind == "train_candidate"
    notes = store.list_memory_notes(research_run_id=completed.research_run_id)
    assert len(notes) == 1
    assert notes[0].note_kind == "breakthrough"


def test_worker_controller_marks_failed_run_and_reraises(tmp_path) -> None:
    store = ResearchStateStore(tmp_path / "research_runtime.sqlite")
    controller = ResearchWorkerController(store)
    spec = ResearchJobSpec(
        pattern_slug="tradoor-oi-reversal-v1",
        objective_id="obj-local-search",
        baseline_ref="baseline:shadow-v1",
        search_policy={"mode": "local-sweep", "radius": 1},
        evaluation_protocol={"seed_starts": [0, 500], "min_seeds": 2},
    )

    timestamps = iter(
        [
            "2026-04-16T13:00:00+00:00",
            "2026-04-16T13:00:02+00:00",
            "2026-04-16T13:00:10+00:00",
        ]
    )

    def _now() -> str:
        return next(timestamps)

    def _execute(_run):
        raise RuntimeError("evaluation protocol rejected all folds")

    with pytest.raises(RuntimeError, match="rejected all folds"):
        controller.run_bounded_job(spec, execute=_execute, now=_now)

    runs = store.list_runs(pattern_slug="tradoor-oi-reversal-v1")
    assert len(runs) == 1
    failed = runs[0]
    assert failed.status == "failed"
    assert failed.handoff_payload["error"] == "evaluation protocol rejected all folds"
    assert store.get_selection_decision(failed.research_run_id) is None
