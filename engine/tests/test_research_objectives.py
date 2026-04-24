from __future__ import annotations

from datetime import datetime, timezone

from ledger.store import LedgerStore
from ledger.types import PatternOutcome
from research.objectives import derive_pattern_research_objective
from research.state_store import ResearchStateStore


def _outcome(idx: int, *, outcome: str, model_version: str | None = None) -> PatternOutcome:
    return PatternOutcome(
        pattern_slug="tradoor-oi-reversal-v1",
        pattern_version=1,
        symbol=f"SYM{idx}USDT",
        accumulation_at=datetime(2026, 4, 14, idx % 24, 0, tzinfo=timezone.utc),
        entry_price=100.0 + idx,
        outcome=outcome,  # type: ignore[arg-type]
        feature_snapshot={"price": 100.0 + idx, "timestamp": datetime(2026, 4, 14, idx % 24, 0, tzinfo=timezone.utc).isoformat()},
        entry_model_version=model_version,
    )


def test_derive_pattern_objective_returns_dataset_readiness_when_not_ready(tmp_path) -> None:
    ledger = LedgerStore(tmp_path / "ledger_data")
    state_store = ResearchStateStore(tmp_path / "research_runtime.sqlite")
    for idx in range(1, 8):
        ledger.save(_outcome(idx, outcome="success" if idx % 2 == 0 else "failure"))

    objective = derive_pattern_research_objective(
        "tradoor-oi-reversal-v1",
        ledger_store=ledger,
        state_store=state_store,
    )

    assert objective.objective_kind == "dataset_readiness"
    assert "Need at least" in objective.rationale
    assert objective.baseline_ref_hint == "pattern-shadow:rule-first"
    assert objective.recommended_search_policy["policy"] == "readiness_accumulation"
    assert objective.recommended_evaluation_protocol["n_splits"] == 3
    assert objective.supporting_signals["recent_dead_end_count"] == 0


def test_derive_pattern_objective_returns_refresh_when_ready_with_model(tmp_path) -> None:
    ledger = LedgerStore(tmp_path / "ledger_data")
    state_store = ResearchStateStore(tmp_path / "research_runtime.sqlite")
    for idx in range(1, 25):
        ledger.save(
            _outcome(
                idx,
                outcome="success" if idx % 3 == 0 else "failure",
                model_version="20260416_120000",
            )
        )

    objective = derive_pattern_research_objective(
        "tradoor-oi-reversal-v1",
        ledger_store=ledger,
        state_store=state_store,
    )

    assert objective.objective_kind == "refresh_train_candidate"
    assert "20260416_120000" in objective.rationale
    assert objective.recommended_search_policy["policy"] == "local_refresh_sweep"
    assert objective.recommended_evaluation_protocol["n_splits"] == 5


def test_derive_pattern_objective_escalates_to_reset_after_recent_dead_ends(tmp_path) -> None:
    ledger = LedgerStore(tmp_path / "ledger_data")
    state_store = ResearchStateStore(tmp_path / "research_runtime.sqlite")
    for idx in range(1, 25):
        ledger.save(
            _outcome(
                idx,
                outcome="success" if idx % 3 == 0 else "failure",
                model_version="20260416_120000",
            )
        )

    for n in range(2):
        run = state_store.create_run(
            pattern_slug="tradoor-oi-reversal-v1",
            objective_id=f"obj-{n}",
            baseline_ref="baseline:candidate-v1",
            search_policy={"mode": "bounded-walk-forward-eval"},
            evaluation_protocol={"kind": "walk-forward"},
            created_at=f"2026-04-16T1{n}:00:00+00:00",
        )
        state_store.complete_run(
            run.research_run_id,
            completed_at=f"2026-04-16T1{n}:05:00+00:00",
            disposition="dead_end",
        )

    objective = derive_pattern_research_objective(
        "tradoor-oi-reversal-v1",
        ledger_store=ledger,
        state_store=state_store,
    )

    assert objective.objective_kind == "reset_search"
    assert objective.history_summary["recent_dead_end_count"] == 2
    assert objective.recommended_search_policy["policy"] == "reset_search"


def test_derive_pattern_objective_escalates_to_reset_on_plateau_without_advancing_candidate(tmp_path) -> None:
    ledger = LedgerStore(tmp_path / "ledger_data")
    state_store = ResearchStateStore(tmp_path / "research_runtime.sqlite")
    for idx in range(1, 25):
        ledger.save(
            _outcome(
                idx,
                outcome="success" if idx % 3 == 0 else "failure",
                model_version="20260416_120000",
            )
        )

    eval_snapshots = [
        ("2026-04-16T10:00:00+00:00", 0.571, 0.07),
        ("2026-04-16T11:00:00+00:00", 0.566, 0.08),
        ("2026-04-16T12:00:00+00:00", 0.569, 0.09),
    ]
    for idx, (created_at, mean_auc, std_auc) in enumerate(eval_snapshots):
        run = state_store.create_run(
            pattern_slug="tradoor-oi-reversal-v1",
            objective_id=f"obj-{idx}",
            baseline_ref="baseline:candidate-v1",
            search_policy={"mode": "stability-check"},
            evaluation_protocol={"kind": "walk-forward", "min_mean_auc": 0.57, "max_std_auc": 0.10},
            created_at=created_at,
        )
        state_store.complete_run(
            run.research_run_id,
            completed_at=created_at,
            disposition="dead_end",
        )
        state_store.record_selection_decision(
            research_run_id=run.research_run_id,
            selected_variant_ref=f"variant-{idx}",
            decision_kind="dead_end",
            rationale="Flat local sweep did not produce a promotable candidate.",
            baseline_ref="baseline:candidate-v1",
            metrics={"eval": {"mean_auc": mean_auc, "std_auc": std_auc}},
            decided_at=created_at,
        )

    objective = derive_pattern_research_objective(
        "tradoor-oi-reversal-v1",
        ledger_store=ledger,
        state_store=state_store,
    )

    assert objective.objective_kind == "reset_search"
    assert objective.history_summary["plateau_detected"] is True
    assert objective.history_summary["recent_high_variance_count"] == 0
    assert "flat with no advancing candidate" in objective.rationale


def test_derive_pattern_objective_detects_structural_scoring_drift(tmp_path) -> None:
    ledger = LedgerStore(tmp_path / "ledger_data")
    state_store = ResearchStateStore(tmp_path / "research_runtime.sqlite")
    for idx in range(1, 25):
        ledger.save(
            PatternOutcome(
                pattern_slug="tradoor-oi-reversal-v1",
                pattern_version=1,
                symbol=f"SYM{idx}USDT",
                accumulation_at=datetime(2026, 4, 14, idx % 24, 0, tzinfo=timezone.utc),
                entry_price=100.0 + idx,
                outcome="success" if idx % 3 == 0 else "failure",  # type: ignore[arg-type]
                feature_snapshot={"price": 100.0 + idx, "timestamp": datetime(2026, 4, 14, idx % 24, 0, tzinfo=timezone.utc).isoformat()},
                entry_ml_state="scored" if idx <= 6 else "untrained",
                entry_p_win=0.45 if idx <= 6 else None,
                entry_threshold_passed=False if idx <= 6 else None,
                entry_model_version="20260416_120000",
            )
        )
    run = state_store.create_run(
        pattern_slug="tradoor-oi-reversal-v1",
        objective_id="obj-train",
        baseline_ref="baseline:candidate-v1",
        search_policy={"mode": "bounded-walk-forward-eval"},
        evaluation_protocol={"kind": "walk-forward"},
        created_at="2026-04-16T17:00:00+00:00",
    )
    state_store.complete_run(
        run.research_run_id,
        completed_at="2026-04-16T17:05:00+00:00",
        disposition="train_candidate",
    )

    objective = derive_pattern_research_objective(
        "tradoor-oi-reversal-v1",
        ledger_store=ledger,
        state_store=state_store,
    )

    assert objective.objective_kind == "scoring_drift_review"
    assert objective.recommended_search_policy["policy"] == "dead_end_confirmation"
    assert objective.supporting_signals["scoring_drift_mode"] == "structural"
    assert objective.recommended_evaluation_protocol["n_splits"] == 4


def test_derive_pattern_objective_detects_incremental_scoring_drift(tmp_path) -> None:
    ledger = LedgerStore(tmp_path / "ledger_data")
    state_store = ResearchStateStore(tmp_path / "research_runtime.sqlite")
    for idx in range(1, 25):
        ledger.save(
            PatternOutcome(
                pattern_slug="tradoor-oi-reversal-v1",
                pattern_version=1,
                symbol=f"SYM{idx}USDT",
                accumulation_at=datetime(2026, 4, 14, idx % 24, 0, tzinfo=timezone.utc),
                entry_price=100.0 + idx,
                outcome="success" if idx % 3 == 0 else "failure",  # type: ignore[arg-type]
                feature_snapshot={"price": 100.0 + idx, "timestamp": datetime(2026, 4, 14, idx % 24, 0, tzinfo=timezone.utc).isoformat()},
                entry_ml_state="scored",
                entry_p_win=0.52,
                entry_threshold_passed=False,
                entry_model_version="20260416_120000",
            )
        )
    run = state_store.create_run(
        pattern_slug="tradoor-oi-reversal-v1",
        objective_id="obj-train",
        baseline_ref="baseline:candidate-v1",
        search_policy={"mode": "bounded-walk-forward-eval"},
        evaluation_protocol={"kind": "walk-forward"},
        created_at="2026-04-16T17:00:00+00:00",
    )
    state_store.complete_run(
        run.research_run_id,
        completed_at="2026-04-16T17:05:00+00:00",
        disposition="train_candidate",
    )

    objective = derive_pattern_research_objective(
        "tradoor-oi-reversal-v1",
        ledger_store=ledger,
        state_store=state_store,
    )

    assert objective.objective_kind == "scoring_drift_review"
    assert objective.recommended_search_policy["policy"] == "local_refresh_sweep"
    assert objective.recommended_search_policy["mode"] == "drift-refresh-probe"
    assert objective.supporting_signals["scoring_drift_mode"] == "incremental"
    assert objective.recommended_evaluation_protocol["n_splits"] == 5
