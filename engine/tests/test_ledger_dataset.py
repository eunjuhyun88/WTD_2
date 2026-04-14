from __future__ import annotations

from datetime import datetime, timezone

from ledger.dataset import build_pattern_training_records, summarize_pattern_dataset
from ledger.types import PatternOutcome


def _outcome(
    *,
    outcome: str,
    idx: int,
    feature_snapshot: dict | None = None,
    entry_p_win: float | None = None,
    entry_ml_state: str | None = None,
    entry_threshold_passed: bool | None = None,
    entry_model_version: str | None = None,
) -> PatternOutcome:
    return PatternOutcome(
        pattern_slug="tradoor-oi-reversal-v1",
        symbol=f"SYM{idx}USDT",
        accumulation_at=datetime(2026, 4, 14, idx % 24, 0, tzinfo=timezone.utc),
        entry_price=100.0 + idx,
        outcome=outcome,  # type: ignore[arg-type]
        feature_snapshot=feature_snapshot,
        entry_p_win=entry_p_win,
        entry_ml_state=entry_ml_state,  # type: ignore[arg-type]
        entry_threshold_passed=entry_threshold_passed,
        entry_model_version=entry_model_version,
    )


def test_build_pattern_training_records_adds_required_metadata() -> None:
    outcome = _outcome(
        outcome="success",
        idx=1,
        feature_snapshot={"price": 101.0, "ema20_slope": 0.2, "regime": "risk_on"},
    )

    records = build_pattern_training_records([outcome])

    assert len(records) == 1
    record = records[0]
    assert record["outcome"] == 1
    assert record["snapshot"]["symbol"] == "SYM1USDT"
    assert record["snapshot"]["timestamp"] == outcome.accumulation_at.isoformat()
    assert record["snapshot"]["price"] == 101.0


def test_summarize_pattern_dataset_reports_shadow_readiness() -> None:
    outcomes = []
    for idx in range(1, 13):
        outcomes.append(
            _outcome(
                outcome="success" if idx % 3 == 0 else "failure",
                idx=idx,
                feature_snapshot={"price": 100.0 + idx, "ema20_slope": 0.1 * idx, "regime": "risk_on"},
                entry_p_win=0.72 if idx % 2 == 0 else 0.41,
                entry_ml_state="scored",
                entry_threshold_passed=idx % 2 == 0,
                entry_model_version="20260414_010203",
            )
        )
    for idx in range(13, 21):
        outcomes.append(
            _outcome(
                outcome="pending",
                idx=idx,
                feature_snapshot={"price": 100.0 + idx, "ema20_slope": 0.1 * idx, "regime": "risk_on"},
                entry_ml_state="untrained" if idx % 2 == 0 else "missing_snapshot",
            )
        )

    summary = summarize_pattern_dataset(outcomes)

    assert summary.total_entries == 20
    assert summary.decided_entries == 12
    assert summary.state_counts["scored"] == 12
    assert summary.scored_entries == 12
    assert summary.training_usable_count == 12
    assert summary.training_win_count == 4
    assert summary.training_loss_count == 8
    assert summary.ready_to_train is False
    assert summary.readiness_reason == "Need 8 more decided records"
    assert summary.last_model_version == "20260414_010203"
    assert summary.avg_p_win is not None
    assert summary.threshold_pass_rate == 0.5
    assert summary.above_threshold_success_rate is not None
    assert summary.below_threshold_success_rate is not None
