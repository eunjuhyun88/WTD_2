from __future__ import annotations

from research.state_store import ResearchStateStore


def test_research_run_lifecycle_persists(tmp_path) -> None:
    db_path = tmp_path / "research_runtime.sqlite"
    store = ResearchStateStore(db_path)

    run = store.create_run(
        pattern_slug="tradoor-oi-reversal-v1",
        objective_id="obj-precision-floor",
        baseline_ref="baseline:shadow-v1",
        search_policy={"mode": "reset-search", "max_variants": 24},
        evaluation_protocol={"seed_starts": [0, 500, 1000, 2000], "min_seeds": 4},
        created_at="2026-04-16T10:00:00+00:00",
    )
    assert run.status == "pending"
    assert run.handoff_payload == {}

    started = store.start_run(run.research_run_id, started_at="2026-04-16T10:05:00+00:00")
    assert started.status == "running"
    assert started.started_at == "2026-04-16T10:05:00+00:00"

    completed = store.complete_run(
        run.research_run_id,
        completed_at="2026-04-16T10:30:00+00:00",
        disposition="train_candidate",
        winner_variant_ref="variant-17",
        handoff_payload={
            "model_key": "tradoor-oi-reversal-v1:1h:breakout_24h:fs1:lp1",
            "threshold_policy_version": 1,
        },
    )
    assert completed.status == "completed"
    assert completed.completion_disposition == "train_candidate"
    assert completed.winner_variant_ref == "variant-17"
    assert completed.handoff_payload["threshold_policy_version"] == 1

    reloaded = ResearchStateStore(db_path)
    fetched = reloaded.get_run(run.research_run_id)
    assert fetched is not None
    assert fetched.status == "completed"
    assert fetched.search_policy["mode"] == "reset-search"
    assert fetched.evaluation_protocol["min_seeds"] == 4

    listed = reloaded.list_runs(pattern_slug="tradoor-oi-reversal-v1", status="completed")
    assert len(listed) == 1
    assert listed[0].research_run_id == run.research_run_id


def test_selection_decision_and_memory_notes_are_separate_from_run(tmp_path) -> None:
    db_path = tmp_path / "research_runtime.sqlite"
    store = ResearchStateStore(db_path)

    run = store.create_run(
        pattern_slug="tradoor-oi-reversal-v1",
        objective_id="obj-false-positive-regime",
        baseline_ref="baseline:candidate-v2",
        search_policy={"mode": "local-sweep", "radius": 2},
        evaluation_protocol={"seed_starts": [0, 500], "min_seeds": 2},
        created_at="2026-04-16T11:00:00+00:00",
    )

    decision = store.record_selection_decision(
        research_run_id=run.research_run_id,
        selected_variant_ref="variant-9",
        decision_kind="advance",
        rationale="Beat baseline on both seeds with lower variance.",
        baseline_ref="baseline:candidate-v2",
        metrics={"mean_edge": 0.18, "std_edge": 0.03},
        decided_at="2026-04-16T11:20:00+00:00",
    )
    assert decision.selected_variant_ref == "variant-9"
    assert decision.metrics["std_edge"] == 0.03

    note = store.append_memory_note(
        research_run_id=run.research_run_id,
        pattern_slug="tradoor-oi-reversal-v1",
        note_kind="dead_end",
        summary="Tighter cs=2 gating reduced coverage too much.",
        detail="False positives fell, but coverage dropped below the floor objective.",
        tags=["coverage", "cs2"],
        created_at="2026-04-16T11:25:00+00:00",
    )
    assert note.note_kind == "dead_end"
    assert note.tags == ["coverage", "cs2"]

    reloaded = ResearchStateStore(db_path)
    fetched_run = reloaded.get_run(run.research_run_id)
    fetched_decision = reloaded.get_selection_decision(run.research_run_id)
    notes = reloaded.list_memory_notes(pattern_slug="tradoor-oi-reversal-v1", note_kind="dead_end")

    assert fetched_run is not None
    assert fetched_run.winner_variant_ref is None
    assert fetched_decision is not None
    assert fetched_decision.rationale.startswith("Beat baseline")
    assert len(notes) == 1
    assert notes[0].memory_id == note.memory_id
