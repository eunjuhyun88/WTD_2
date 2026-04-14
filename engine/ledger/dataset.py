"""Helpers for converting ledger outcomes into trainable pattern datasets."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Literal

from ledger.types import PatternOutcome
from scoring.lightgbm_engine import MIN_TRAIN_RECORDS

TrainableOutcome = Literal["success", "failure", "timeout"]
LOSS_OUTCOMES: frozenset[TrainableOutcome] = frozenset({"failure", "timeout"})
TRAINABLE_OUTCOMES: frozenset[str] = frozenset({"success", "failure", "timeout"})
ENTRY_SCORE_STATES: tuple[str, ...] = ("scored", "untrained", "missing_snapshot", "error")


@dataclass(frozen=True)
class PatternDatasetSummary:
    total_entries: int
    decided_entries: int
    state_counts: dict[str, int]
    scored_entries: int
    scored_decided_entries: int
    score_coverage: float | None
    avg_p_win: float | None
    threshold_pass_count: int
    threshold_pass_rate: float | None
    above_threshold_success_rate: float | None
    below_threshold_success_rate: float | None
    training_usable_count: int
    training_win_count: int
    training_loss_count: int
    ready_to_train: bool
    readiness_reason: str
    last_model_version: str | None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def outcome_to_trade_record(outcome: PatternOutcome) -> dict[str, Any] | None:
    """Convert one decided ledger outcome into a canonical TrainRequest record."""
    if outcome.outcome not in TRAINABLE_OUTCOMES:
        return None
    if not outcome.feature_snapshot or not outcome.accumulation_at:
        return None

    snapshot = dict(outcome.feature_snapshot)
    snapshot.setdefault("symbol", outcome.symbol)
    snapshot.setdefault("timestamp", outcome.accumulation_at.isoformat())
    if outcome.entry_price is not None:
        snapshot.setdefault("price", outcome.entry_price)

    if snapshot.get("price") is None:
        return None

    return {
        "snapshot": snapshot,
        "outcome": 1 if outcome.outcome == "success" else 0,
    }


def build_pattern_training_records(outcomes: list[PatternOutcome]) -> list[dict[str, Any]]:
    """Return canonical TrainRequest records for a pattern ledger."""
    records: list[dict[str, Any]] = []
    for outcome in outcomes:
        record = outcome_to_trade_record(outcome)
        if record is not None:
            records.append(record)
    return records


def summarize_pattern_dataset(outcomes: list[PatternOutcome]) -> PatternDatasetSummary:
    """Summarize shadow-ML coverage and trainability for one pattern ledger."""
    total_entries = len(outcomes)
    decided = [o for o in outcomes if o.outcome in TRAINABLE_OUTCOMES]
    decided_entries = len(decided)

    state_counts = {state: 0 for state in ENTRY_SCORE_STATES}
    for outcome in outcomes:
        if outcome.entry_ml_state in state_counts:
            state_counts[outcome.entry_ml_state] += 1

    scored = [o for o in outcomes if o.entry_ml_state == "scored" and o.entry_p_win is not None]
    scored_entries = len(scored)
    scored_decided = [o for o in scored if o.outcome in TRAINABLE_OUTCOMES]
    scored_decided_entries = len(scored_decided)

    avg_p_win = (
        sum(float(o.entry_p_win) for o in scored if o.entry_p_win is not None) / scored_entries
        if scored_entries > 0
        else None
    )
    score_coverage = scored_entries / total_entries if total_entries > 0 else None

    threshold_pass = [o for o in scored if o.entry_threshold_passed is True]
    threshold_fail = [o for o in scored if o.entry_threshold_passed is False]
    threshold_pass_count = len(threshold_pass)
    threshold_pass_rate = threshold_pass_count / scored_entries if scored_entries > 0 else None

    def _success_rate(rows: list[PatternOutcome]) -> float | None:
        decided_rows = [o for o in rows if o.outcome in TRAINABLE_OUTCOMES]
        if not decided_rows:
            return None
        success_count = sum(1 for o in decided_rows if o.outcome == "success")
        return success_count / len(decided_rows)

    above_threshold_success_rate = _success_rate(threshold_pass)
    below_threshold_success_rate = _success_rate(threshold_fail)

    training_records = build_pattern_training_records(outcomes)
    training_usable_count = len(training_records)
    training_win_count = sum(1 for record in training_records if record["outcome"] == 1)
    training_loss_count = sum(1 for record in training_records if record["outcome"] == 0)
    ready_to_train = (
        training_usable_count >= MIN_TRAIN_RECORDS
        and training_win_count > 0
        and training_loss_count > 0
    )

    if training_usable_count < MIN_TRAIN_RECORDS:
        readiness_reason = f"Need {MIN_TRAIN_RECORDS - training_usable_count} more decided records"
    elif training_win_count == 0:
        readiness_reason = "Need at least one successful outcome"
    elif training_loss_count == 0:
        readiness_reason = "Need at least one failed outcome"
    else:
        readiness_reason = "Ready to train"

    last_model_version = next(
        (o.entry_model_version for o in outcomes if o.entry_model_version),
        None,
    )

    return PatternDatasetSummary(
        total_entries=total_entries,
        decided_entries=decided_entries,
        state_counts=state_counts,
        scored_entries=scored_entries,
        scored_decided_entries=scored_decided_entries,
        score_coverage=score_coverage,
        avg_p_win=avg_p_win,
        threshold_pass_count=threshold_pass_count,
        threshold_pass_rate=threshold_pass_rate,
        above_threshold_success_rate=above_threshold_success_rate,
        below_threshold_success_rate=below_threshold_success_rate,
        training_usable_count=training_usable_count,
        training_win_count=training_win_count,
        training_loss_count=training_loss_count,
        ready_to_train=ready_to_train,
        readiness_reason=readiness_reason,
        last_model_version=last_model_version,
    )
