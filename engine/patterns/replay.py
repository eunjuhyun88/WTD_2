"""Replay helpers for replay-first pattern state restoration."""
from __future__ import annotations

from datetime import datetime

import pandas as pd

from data_cache.loader import load_klines, load_perp
from exceptions import CacheMiss
from patterns.library import get_pattern
from patterns.state_machine import PatternStateMachine
from patterns.types import ReplayStateResult
from scanner.feature_calc import compute_features_table
from scoring.block_evaluator import evaluate_block_masks


def _referenced_blocks_for_pattern(machine: PatternStateMachine) -> set[str]:
    refs: set[str] = set()
    for phase in machine.pattern.phases:
        refs.update(phase.required_blocks)
        refs.update(phase.optional_blocks)
        refs.update(phase.soft_blocks)
        refs.update(phase.disqualifier_blocks)
        for group in phase.required_any_groups:
            refs.update(group)
    return refs


def _row_snapshot(row: pd.Series) -> dict:
    snapshot: dict[str, float | str | None] = {}
    for key, value in row.items():
        if value is None or pd.isna(value):
            snapshot[key] = None
        elif hasattr(value, "__float__"):
            snapshot[key] = float(value)
        else:
            snapshot[key] = str(value)
    return snapshot


def _pattern_block_names(machine: PatternStateMachine) -> set[str]:
    names: set[str] = set()
    for phase in machine.pattern.phases:
        names.update(phase.required_blocks)
        names.update(phase.optional_blocks)
        names.update(phase.soft_blocks)
        names.update(phase.disqualifier_blocks)
        for group in phase.required_any_groups:
            names.update(group)
    return names


def replay_pattern_frames(
    machine: PatternStateMachine,
    symbol: str,
    *,
    features_df: pd.DataFrame,
    klines_df: pd.DataFrame,
    timestamp_limit: datetime | None = None,
    lookback_bars: int = 336,
    data_quality: dict | None = None,
    emit_attempts: bool = False,
) -> ReplayStateResult:
    """Replay recent bars into a state machine without emitting side effects."""
    machine.reset_symbol(symbol)
    if features_df.empty:
        return ReplayStateResult(
            pattern_slug=machine.pattern.slug,
            symbol=symbol,
            timeframe=machine.pattern.timeframe,
            current_phase="NONE",
            phase_history=[],
        )

    masks = evaluate_block_masks(
        features_df,
        klines_df,
        symbol,
        requested_blocks=_referenced_blocks_for_pattern(machine),
    )
    end_idx = len(features_df)
    if timestamp_limit is not None:
        matching = features_df.index[features_df.index < timestamp_limit]
        end_idx = len(matching)
    start_idx = max(0, end_idx - lookback_bars)

    phase_scores_by_bar: list[dict] = []
    for idx in range(start_idx, end_idx):
        timestamp = features_df.index[idx]
        blocks_triggered = [
            name
            for name, mask in masks.items()
            if len(mask) > idx and bool(mask.iloc[idx])
        ]
        machine.evaluate(
            symbol=symbol,
            blocks_triggered=blocks_triggered,
            timestamp=timestamp.to_pydatetime() if hasattr(timestamp, "to_pydatetime") else timestamp,
            feature_snapshot=_row_snapshot(features_df.iloc[idx]),
            trigger_bar_ts=timestamp.to_pydatetime() if hasattr(timestamp, "to_pydatetime") else timestamp,
            data_quality=data_quality,
            emit_callbacks=emit_attempts,
        )
        state = machine.get_symbol_state(symbol)
        if state is not None:
            phase_scores_by_bar.append(
                {
                    "timestamp": timestamp.isoformat() if hasattr(timestamp, "isoformat") else str(timestamp),
                    "phase_scores": dict(state.last_phase_scores),
                    "current_phase": machine.get_current_phase(symbol),
                }
            )

    state = machine.get_symbol_state(symbol)
    if state is None:
        return ReplayStateResult(
            pattern_slug=machine.pattern.slug,
            symbol=symbol,
            timeframe=machine.pattern.timeframe,
            current_phase="NONE",
            phase_history=[],
        )

    anchor_phase_id = next(
        (
            phase.anchor_phase_id
            for phase in machine.pattern.phases
            if phase.phase_id == machine.pattern.entry_phase and phase.anchor_phase_id
        ),
        None,
    )
    last_anchor_transition_id = state.phase_transition_ids.get(anchor_phase_id) if anchor_phase_id else None
    current_phase = machine.get_current_phase(symbol)
    candidate_status = "entry" if current_phase == machine.pattern.entry_phase else "none"
    if current_phase not in {"NONE", machine.pattern.entry_phase}:
        candidate_status = "tracking"

    return ReplayStateResult(
        pattern_slug=machine.pattern.slug,
        symbol=symbol,
        timeframe=machine.pattern.timeframe,
        current_phase=current_phase,
        phase_history=list(state.phase_history),
        last_anchor_transition_id=last_anchor_transition_id,
        candidate_status=candidate_status,
        phase_scores_by_bar=phase_scores_by_bar,
    )


def replay_pattern_window(
    pattern_slug: str,
    symbol: str,
    *,
    timeframe: str | None = None,
    lookback_bars: int = 336,
) -> ReplayStateResult:
    """Load recent data for one pattern/symbol and replay it from scratch."""
    pattern = get_pattern(pattern_slug)
    timeframe = timeframe or pattern.timeframe
    try:
        klines_df = load_klines(symbol, timeframe, offline=True)
    except CacheMiss:
        return ReplayStateResult(
            pattern_slug=pattern_slug,
            symbol=symbol,
            timeframe=timeframe,
            current_phase="NONE",
            phase_history=[],
        )

    perp_df = load_perp(symbol, offline=True)
    features_df = compute_features_table(klines_df, symbol, perp=perp_df)
    machine = PatternStateMachine(pattern)
    return replay_pattern_frames(
        machine,
        symbol,
        features_df=features_df,
        klines_df=klines_df,
        lookback_bars=lookback_bars,
        data_quality={"has_perp": perp_df is not None and not perp_df.empty},
    )
