from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from ledger.store import LedgerStore
from ledger.types import PatternOutcome
from research.objectives import derive_pattern_research_objective


def _outcome(
    idx: int,
    *,
    outcome: str,
    model_version: str | None = None,
    entry_ml_state: str | None = None,
    entry_p_win: float | None = None,
    entry_threshold_passed: bool | None = None,
) -> PatternOutcome:
    return PatternOutcome(
        pattern_slug="tradoor-oi-reversal-v1",
        symbol=f"SYM{idx}USDT",
        accumulation_at=datetime(2026, 4, 14, idx % 24, 0, tzinfo=timezone.utc),
        entry_price=100.0 + idx,
        outcome=outcome,  # type: ignore[arg-type]
        feature_snapshot={"price": 100.0 + idx, "timestamp": datetime(2026, 4, 14, idx % 24, 0, tzinfo=timezone.utc).isoformat()},
        entry_model_version=model_version,
        entry_ml_state=entry_ml_state,  # type: ignore[arg-type]
        entry_p_win=entry_p_win,
        entry_threshold_passed=entry_threshold_passed,
    )


def test_derive_pattern_objective_returns_dataset_readiness_when_not_ready(tmp_path) -> None:
    ledger = LedgerStore(tmp_path / "ledger_data")
    for idx in range(1, 8):
        ledger.save(_outcome(idx, outcome="success" if idx % 2 == 0 else "failure"))

    objective = derive_pattern_research_objective("tradoor-oi-reversal-v1", ledger_store=ledger)

    assert objective.objective_kind == "dataset_readiness"
    assert "Need at least" in objective.rationale
    assert objective.readiness_plan["train_ready"] is False
    assert objective.readiness_plan["state"] == "needs_more_records"
    assert objective.readiness_plan["deficits"][0]["kind"] == "usable_decided_records"
    assert objective.recommended_search_policy["mode"] == "readiness_accumulation"
    assert objective.recommended_search_policy["allowed_train_handoff"] is False
    assert objective.recommended_evaluation_protocol["kind"] == "readiness-only"


def test_derive_pattern_objective_returns_refresh_when_ready_with_model(tmp_path) -> None:
    ledger = LedgerStore(tmp_path / "ledger_data")
    for idx in range(1, 25):
        ledger.save(
            _outcome(
                idx,
                outcome="success" if idx % 3 == 0 else "failure",
                model_version="20260416_120000",
            )
        )

    objective = derive_pattern_research_objective("tradoor-oi-reversal-v1", ledger_store=ledger)

    assert objective.objective_kind == "refresh_train_candidate"
    assert "20260416_120000" in objective.rationale
    assert objective.readiness_plan["train_ready"] is True
    assert objective.recommended_search_policy["mode"] == "local_refresh_sweep"


def test_derive_pattern_objective_keeps_low_score_coverage_as_warning(tmp_path) -> None:
    ledger = LedgerStore(tmp_path / "ledger_data")
    for idx in range(1, 25):
        is_scored = idx <= 3
        ledger.save(
            _outcome(
                idx,
                outcome="success" if idx % 3 == 0 else "failure",
                entry_ml_state="scored" if is_scored else "untrained",
                entry_p_win=0.72 if is_scored else None,
                entry_threshold_passed=True if is_scored else None,
            )
        )

    objective = derive_pattern_research_objective("tradoor-oi-reversal-v1", ledger_store=ledger)

    assert objective.objective_kind == "first_train_candidate"
    assert objective.readiness_plan["train_ready"] is True
    assert objective.readiness_plan["state"] == "train_ready"
    assert objective.readiness_plan["deficits"] == []
    assert objective.readiness_plan["warnings"][0]["kind"] == "score_coverage"
    assert objective.supporting_signals["readiness_warning_kinds"] == ["score_coverage"]


def test_derive_pattern_objective_returns_reset_search_after_repeated_dead_ends(tmp_path) -> None:
    ledger = LedgerStore(tmp_path / "ledger_data")
    for idx in range(1, 25):
        ledger.save(_outcome(idx, outcome="success" if idx % 3 == 0 else "failure"))

    class _HistoryStore:
        def list_runs(self, **kwargs):
            return [SimpleNamespace(completion_disposition="dead_end") for _ in range(3)]

    objective = derive_pattern_research_objective(
        "tradoor-oi-reversal-v1",
        ledger_store=ledger,
        state_store=_HistoryStore(),
    )

    assert objective.objective_kind == "reset_search"
    assert objective.recommended_search_policy["mode"] == "reset_search"
    assert objective.supporting_signals["recent_dead_end_count"] == 3
