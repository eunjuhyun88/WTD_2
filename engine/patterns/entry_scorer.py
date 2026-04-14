"""Pattern-entry ML scoring helpers.

This module keeps pattern-entry scoring on the shared LightGBM engine while
letting the pattern layer stay thin and rule-first.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Mapping

from scoring.lightgbm_engine import get_engine

DEFAULT_ENTRY_P_WIN_THRESHOLD = 0.55

EntryScoreState = Literal["scored", "untrained", "missing_snapshot", "error"]


@dataclass(frozen=True)
class PatternEntryScore:
    state: EntryScoreState
    p_win: float | None
    model_version: str | None
    threshold: float
    threshold_passed: bool | None
    error: str | None = None


def score_entry_feature_snapshot(
    feature_snapshot: Mapping[str, Any] | None,
    *,
    user_id: str | None = None,
    threshold: float = DEFAULT_ENTRY_P_WIN_THRESHOLD,
) -> PatternEntryScore:
    """Score one persisted pattern-entry feature snapshot in shadow mode."""
    if not feature_snapshot:
        return PatternEntryScore(
            state="missing_snapshot",
            p_win=None,
            model_version=None,
            threshold=threshold,
            threshold_passed=None,
        )

    try:
        engine = get_engine(user_id)
        if not engine.is_trained:
            return PatternEntryScore(
                state="untrained",
                p_win=None,
                model_version=engine.model_version,
                threshold=threshold,
                threshold_passed=None,
            )

        p_win = engine.predict_feature_row(feature_snapshot)
        if p_win is None:
            return PatternEntryScore(
                state="untrained",
                p_win=None,
                model_version=engine.model_version,
                threshold=threshold,
                threshold_passed=None,
            )

        return PatternEntryScore(
            state="scored",
            p_win=p_win,
            model_version=engine.model_version,
            threshold=threshold,
            threshold_passed=p_win >= threshold,
        )
    except Exception as exc:
        return PatternEntryScore(
            state="error",
            p_win=None,
            model_version=None,
            threshold=threshold,
            threshold_passed=None,
            error=str(exc),
        )
