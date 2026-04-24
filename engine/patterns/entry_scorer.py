"""Pattern-entry ML scoring helpers.

This module keeps pattern-entry scoring on the shared LightGBM engine while
letting the pattern layer stay thin and rule-first.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Mapping

from patterns.definitions import current_definition_id
from patterns.model_registry import MODEL_REGISTRY_STORE
from scoring.lightgbm_engine import get_engine

DEFAULT_ENTRY_P_WIN_THRESHOLD = 0.55

EntryScoreState = Literal["scored", "untrained", "missing_snapshot", "error"]
EntryRolloutState = Literal["candidate", "active"] | None


@dataclass(frozen=True)
class PatternEntryScore:
    state: EntryScoreState
    p_win: float | None
    model_key: str | None
    model_version: str | None
    rollout_state: EntryRolloutState
    threshold: float
    threshold_passed: bool | None
    error: str | None = None
    model_key: str | None = field(default=None, kw_only=True)
    rollout_state: EntryRolloutState = field(default=None, kw_only=True)


def score_entry_feature_snapshot(
    feature_snapshot: Mapping[str, Any] | None,
    *,
    pattern_slug: str | None = None,
    threshold: float = DEFAULT_ENTRY_P_WIN_THRESHOLD,
) -> PatternEntryScore:
    """Score one persisted pattern-entry feature snapshot in shadow mode."""
    if not feature_snapshot:
        return PatternEntryScore(
            state="missing_snapshot",
            p_win=None,
            model_key=None,
            model_version=None,
            rollout_state=None,
            threshold=threshold,
            threshold_passed=None,
        )

    try:
        if not pattern_slug:
            return PatternEntryScore(
                state="untrained",
                p_win=None,
                model_key=None,
                model_version=None,
                rollout_state=None,
                threshold=threshold,
                threshold_passed=None,
            )

        definition_id = current_definition_id(pattern_slug)
        model_ref = MODEL_REGISTRY_STORE.get_preferred_scoring_model(
            pattern_slug,
            definition_id=definition_id,
        )
        if model_ref is None and definition_id is not None:
            model_ref = MODEL_REGISTRY_STORE.get_preferred_scoring_model(pattern_slug)
        if model_ref is None:
            return PatternEntryScore(
                state="untrained",
                p_win=None,
                model_key=None,
                model_version=None,
                rollout_state=None,
                threshold=threshold,
                threshold_passed=None,
            )

        engine = get_engine(model_ref.model_key)
        if not engine.is_trained:
            return PatternEntryScore(
                state="untrained",
                p_win=None,
                model_key=model_ref.model_key,
                model_version=engine.model_version or model_ref.model_version,
                rollout_state=model_ref.rollout_state,
                threshold=threshold,
                threshold_passed=None,
            )

        p_win = engine.predict_feature_row(feature_snapshot)
        if p_win is None:
            return PatternEntryScore(
                state="untrained",
                p_win=None,
                model_key=model_ref.model_key,
                model_version=engine.model_version or model_ref.model_version,
                rollout_state=model_ref.rollout_state,
                threshold=threshold,
                threshold_passed=None,
            )

        return PatternEntryScore(
            state="scored",
            p_win=p_win,
            model_key=model_ref.model_key,
            model_version=engine.model_version or model_ref.model_version,
            rollout_state=model_ref.rollout_state,
            threshold=threshold,
            threshold_passed=p_win >= threshold,
        )
    except Exception as exc:
        return PatternEntryScore(
            state="error",
            p_win=None,
            model_key=None,
            model_version=None,
            rollout_state=None,
            threshold=threshold,
            threshold_passed=None,
            error=str(exc),
        )
