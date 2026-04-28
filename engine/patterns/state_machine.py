"""PatternStateMachine — tracks which Phase each symbol is in for a PatternObject.

Design:
- One StateMachine instance per PatternObject (not per symbol)
- evaluate() is called each bar for each symbol with fired block names
- Phase transitions are sequential (phase[0] → phase[1] → ...)
- timeout: if max_bars exceeded without transition → reset to phase[0]
- min_bars: phase must persist at least N bars before advancing (v2)
- entry_signal: emitted when entering entry_phase
- success: emitted when reaching target_phase

v2 improvements (CTO review):
- min_bars enforcement: prevent premature phase transitions
- feature_snapshot: captured at each transition for reproducibility
- optional_blocks tracking: confidence scoring (how many optional blocks fired)
- phase duration logging: track how long each symbol spent per phase
"""
from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
import logging
import threading
from datetime import datetime
from typing import Callable

from patterns.types import (
    PatternObject,
    PatternStateRecord,
    PhaseAttemptRecord,
    PhaseCondition,
    SymbolPhaseState,
    PhaseTransition,
)

log = logging.getLogger("engine.patterns.state_machine")


@dataclass
class _PhaseEvaluation:
    satisfied: bool
    confidence: float
    phase_score: float
    missing_blocks: list[str]
    failed_reason: str | None
    anchor_transition_id: str | None = None
    should_record_attempt: bool = False


class PatternStateMachine:
    def __init__(
        self,
        pattern: PatternObject,
        on_transition: Callable[[PhaseTransition], None] | None = None,
        on_entry_signal: Callable[[PhaseTransition], None] | None = None,
        on_success: Callable[[PhaseTransition], None] | None = None,
        on_invalidated: Callable[[str, str], None] | None = None,
        on_phase_attempt: Callable[[PhaseAttemptRecord], None] | None = None,
    ):
        self.pattern = pattern
        self.on_transition = on_transition
        self.on_entry_signal = on_entry_signal
        self.on_success = on_success
        self.on_invalidated = on_invalidated
        self.on_phase_attempt = on_phase_attempt
        self._states: dict[str, SymbolPhaseState] = {}
        # A3: per-machine RLock — protects _states from concurrent symbol evaluations
        self._lock = threading.RLock()
        # A1: in-memory LRU dedupe keyed by (symbol, to_phase, trigger_bar_ts_iso, pattern_version)
        self._emitted_keys: OrderedDict[tuple, None] = OrderedDict()
        self._EMIT_LRU = 4096

    def evaluate(
        self,
        symbol: str,
        blocks_triggered: list[str],
        timestamp: datetime,
        feature_snapshot: dict | None = None,
        scan_id: str | None = None,
        trigger_bar_ts: datetime | None = None,
        data_quality: dict | None = None,
        emit_callbacks: bool = True,
    ) -> PhaseTransition | None:
        """Evaluate one bar for a symbol.

        Args:
            symbol: e.g. "PTBUSDT"
            blocks_triggered: list of block names that fired this bar
            timestamp: bar open time (UTC)
            feature_snapshot: 92-dim feature dict at this bar (v2)

        Returns:
            PhaseTransition if a phase change occurred, None otherwise.
        """
        # A3: Hold lock for all state mutations; fire callbacks outside.
        with self._lock:
            t, invalidated_phase, attempt = self._evaluate_state(
                symbol=symbol,
                blocks_triggered=blocks_triggered,
                timestamp=timestamp,
                feature_snapshot=feature_snapshot,
                scan_id=scan_id,
                trigger_bar_ts=trigger_bar_ts,
                data_quality=data_quality,
            )

        # Callbacks run outside the lock so I/O (Supabase, ledger) never blocks
        # concurrent symbol evaluations.
        if emit_callbacks:
            if t is not None:
                self._emit_transition(t)
            if invalidated_phase and self.on_invalidated:
                self.on_invalidated(symbol, invalidated_phase)
            if attempt and self.on_phase_attempt:
                self.on_phase_attempt(attempt)

        return t

    def _evaluate_state(
        self,
        symbol: str,
        blocks_triggered: list[str],
        timestamp: datetime,
        feature_snapshot: dict | None,
        scan_id: str | None,
        trigger_bar_ts: datetime | None,
        data_quality: dict | None,
    ) -> tuple[PhaseTransition | None, str | None, PhaseAttemptRecord | None]:
        """State-mutation core of evaluate(); always called under self._lock.

        Returns:
            (transition, invalidated_old_phase_id, attempt_record)
        """
        state = self._states.get(symbol)
        if state is None or state.invalidated:
            state = SymbolPhaseState(
                symbol=symbol,
                pattern_slug=self.pattern.slug,
            )
            self._states[symbol] = state

        current_phase = self.pattern.phases[state.current_phase_idx]

        # --- Check timeout (only if we have entered the current phase) ---
        if state.phase_entered_at is not None:
            state.bars_in_phase += 1
            if state.bars_in_phase > current_phase.max_bars:
                old_phase_id = current_phase.phase_id
                log.debug(
                    "TIMEOUT: %s in %s for %d bars (max %d) [%s]",
                    symbol, old_phase_id, state.bars_in_phase,
                    current_phase.max_bars, self.pattern.slug,
                )
                self._reset(symbol, state)
                t = PhaseTransition(
                    symbol=symbol,
                    pattern_slug=self.pattern.slug,
                    from_phase=old_phase_id,
                    to_phase=self.pattern.phases[0].phase_id,
                    timestamp=timestamp,
                    reason="timeout",
                    transition_kind="timeout_reset",
                    feature_snapshot=feature_snapshot,
                    pattern_version=self.pattern.version,
                    timeframe=self.pattern.timeframe,
                    from_phase_idx=self._phase_idx(old_phase_id),
                    to_phase_idx=0,
                    trigger_bar_ts=trigger_bar_ts or timestamp,
                    scan_id=scan_id,
                    blocks_triggered=list(blocks_triggered),
                    block_scores=self._build_block_scores(blocks_triggered),
                    data_quality=data_quality,
                )
                state.last_transition_id = t.transition_id
                state.phase_transition_ids[self.pattern.phases[0].phase_id] = t.transition_id
                return t, old_phase_id, None

        # --- Check if we can advance to next phase ---
        next_phase_idx = state.current_phase_idx + 1
        if next_phase_idx < len(self.pattern.phases):
            next_phase = self.pattern.phases[next_phase_idx]

            # v2: min_bars enforcement — must stay in current phase long enough
            if state.phase_entered_at is not None and state.bars_in_phase < current_phase.min_bars:
                return None, None, None

            evaluation = self._phase_satisfied(
                state=state,
                current_phase=current_phase,
                next_phase=next_phase,
                blocks=blocks_triggered,
            )
            state.last_phase_scores[next_phase.phase_id] = evaluation.phase_score
            if evaluation.satisfied:
                old_phase_id = current_phase.phase_id
                state.current_phase_idx = next_phase_idx
                state.phase_entered_at = timestamp
                state.bars_in_phase = 1
                state.phase_history.append((next_phase.phase_id, timestamp))

                is_entry = next_phase.phase_id == self.pattern.entry_phase
                is_success = next_phase.phase_id == self.pattern.target_phase

                t = PhaseTransition(
                    symbol=symbol,
                    pattern_slug=self.pattern.slug,
                    from_phase=old_phase_id,
                    to_phase=next_phase.phase_id,
                    timestamp=timestamp,
                    reason="condition_met",
                    is_entry_signal=is_entry,
                    is_success=is_success,
                    confidence=evaluation.confidence,
                    feature_snapshot=feature_snapshot,
                    pattern_version=self.pattern.version,
                    timeframe=self.pattern.timeframe,
                    from_phase_idx=next_phase_idx - 1,
                    to_phase_idx=next_phase_idx,
                    trigger_bar_ts=trigger_bar_ts or timestamp,
                    scan_id=scan_id,
                    blocks_triggered=list(blocks_triggered),
                    block_scores=self._build_block_scores(blocks_triggered),
                    data_quality=data_quality,
                )
                state.last_transition_id = t.transition_id
                state.phase_transition_ids[next_phase.phase_id] = t.transition_id

                log.info(
                    "TRANSITION: %s %s → %s (conf=%.0f%%) [%s]",
                    symbol, old_phase_id, next_phase.phase_id,
                    evaluation.confidence * 100, self.pattern.slug,
                )

                return t, None, None

            if evaluation.should_record_attempt:
                attempt = PhaseAttemptRecord(
                    symbol=symbol,
                    pattern_slug=self.pattern.slug,
                    timeframe=self.pattern.timeframe,
                    from_phase=current_phase.phase_id,
                    attempted_phase=next_phase.phase_id,
                    attempted_at=timestamp,
                    phase_score=evaluation.phase_score,
                    missing_blocks=evaluation.missing_blocks,
                    failed_reason=evaluation.failed_reason or "unknown",
                    anchor_transition_id=evaluation.anchor_transition_id,
                    scan_id=scan_id,
                    blocks_triggered=list(blocks_triggered),
                    feature_snapshot=feature_snapshot,
                )
                return None, None, attempt
        else:
            # Already at last phase — success phase, reset after max_bars
            if state.bars_in_phase and state.bars_in_phase > current_phase.max_bars:
                self._reset(symbol, state)

        # No transition — if we're at phase 0 and haven't entered yet,
        # check if phase 0 conditions are met to "start" tracking
        if state.current_phase_idx == 0 and state.phase_entered_at is None:
            phase0 = self.pattern.phases[0]
            evaluation = self._phase0_satisfied(phase0, blocks_triggered)
            state.last_phase_scores[phase0.phase_id] = evaluation.phase_score
            if evaluation.satisfied:
                state.phase_entered_at = timestamp
                state.bars_in_phase = 1
                state.phase_history.append((phase0.phase_id, timestamp))
                t = PhaseTransition(
                    symbol=symbol,
                    pattern_slug=self.pattern.slug,
                    from_phase="NONE",
                    to_phase=phase0.phase_id,
                    timestamp=timestamp,
                    reason="condition_met",
                    transition_kind="phase_entered",
                    confidence=1.0,
                    feature_snapshot=feature_snapshot,
                    pattern_version=self.pattern.version,
                    timeframe=self.pattern.timeframe,
                    from_phase_idx=None,
                    to_phase_idx=0,
                    trigger_bar_ts=trigger_bar_ts or timestamp,
                    scan_id=scan_id,
                    blocks_triggered=list(blocks_triggered),
                    block_scores=self._build_block_scores(blocks_triggered),
                    data_quality=data_quality,
                )
                state.last_transition_id = t.transition_id
                state.phase_transition_ids[phase0.phase_id] = t.transition_id
                return t, None, None

        return None, None, None

    def _emit_transition(self, transition: PhaseTransition) -> None:
        # A1: LRU dedupe — skip if same (symbol, to_phase, trigger_bar_ts, version) already emitted.
        # Uses self._lock (RLock) so this method must NOT be called while holding the lock.
        key = (
            transition.symbol,
            transition.to_phase,
            (transition.trigger_bar_ts or transition.timestamp).isoformat(),
            transition.pattern_version,
        )
        with self._lock:
            if key in self._emitted_keys:
                return
            self._emitted_keys[key] = None
            if len(self._emitted_keys) > self._EMIT_LRU:
                self._emitted_keys.popitem(last=False)

        if self.on_transition:
            self.on_transition(transition)
        if transition.is_entry_signal and self.on_entry_signal:
            self.on_entry_signal(transition)
        if transition.is_success and self.on_success:
            self.on_success(transition)

    @staticmethod
    def _build_block_scores(blocks: list[str]) -> dict:
        return {block: {"passed": True, "score": 1.0} for block in blocks}

    def _phase_idx(self, phase_id: str) -> int | None:
        for idx, phase in enumerate(self.pattern.phases):
            if phase.phase_id == phase_id:
                return idx
        return None

    def hydrate_states(self, records: dict[str, PatternStateRecord] | list[PatternStateRecord]) -> None:
        """Restore current states from durable PatternStateRecord rows."""
        iterable = records.values() if isinstance(records, dict) else records
        new_states: dict[str, SymbolPhaseState] = {}
        for record in iterable:
            if record.pattern_slug != self.pattern.slug or record.invalidated or not record.active:
                continue
            if not (0 <= record.current_phase_idx < len(self.pattern.phases)):
                continue
            new_states[record.symbol] = SymbolPhaseState(
                symbol=record.symbol,
                pattern_slug=record.pattern_slug,
                current_phase_idx=record.current_phase_idx,
                phase_entered_at=record.entered_at,
                bars_in_phase=record.bars_in_phase,
                phase_history=[(record.current_phase, record.entered_at)] if record.entered_at else [],
                # A4: only current_phase here; full phase_transition_ids populated by
                # hydrate_transition_ids() after transition history is available.
                phase_transition_ids={record.current_phase: record.last_transition_id} if record.last_transition_id else {},
                last_transition_id=record.last_transition_id,
                invalidated=record.invalidated,
            )
        with self._lock:
            self._states.update(new_states)

    def hydrate_transition_ids(self, transitions_by_symbol: dict[str, list]) -> None:
        """A4: After hydrate_states(), backfill phase_transition_ids from full history.

        transitions_by_symbol: {symbol: [PhaseTransitionRecord, ...]} sorted by transitioned_at ASC.
        Last-write-wins per to_phase ensures each phase maps to its most recent transition.
        """
        with self._lock:
            for symbol, records in transitions_by_symbol.items():
                state = self._states.get(symbol)
                if state is None:
                    continue
                ids: dict[str, str] = {}
                for rec in records:
                    if rec.to_phase and rec.transition_id:
                        ids[rec.to_phase] = rec.transition_id
                # Merge into existing map (don't overwrite, just fill gaps)
                for phase_id, tid in ids.items():
                    state.phase_transition_ids.setdefault(phase_id, tid)

    def _phase_satisfied(
        self,
        *,
        state: SymbolPhaseState,
        current_phase: PhaseCondition,
        next_phase: PhaseCondition,
        blocks: list[str],
    ) -> _PhaseEvaluation:
        blocks_set = set(blocks)

        missing_required = [block for block in next_phase.required_blocks if block not in blocks_set]
        if missing_required:
            return _PhaseEvaluation(
                satisfied=False,
                confidence=0.0,
                phase_score=0.0,
                missing_blocks=missing_required,
                failed_reason="missing_required",
            )

        if any(block in blocks_set for block in next_phase.disqualifier_blocks):
            return _PhaseEvaluation(
                satisfied=False,
                confidence=0.0,
                phase_score=0.0,
                missing_blocks=[],
                failed_reason="disqualified",
            )

        missing_any_groups: list[str] = []
        for group in next_phase.required_any_groups:
            if not any(block in blocks_set for block in group):
                missing_any_groups.extend(group)

        anchor_transition_id = self._get_anchor_transition_id(state, current_phase, next_phase)
        if next_phase.anchor_from_previous_phase and anchor_transition_id is None:
            return _PhaseEvaluation(
                satisfied=False,
                confidence=0.0,
                phase_score=0.0,
                missing_blocks=missing_any_groups,
                failed_reason="anchor_missing",
                should_record_attempt=True,
            )

        if next_phase.anchor_from_previous_phase and not self._within_transition_window(state, next_phase):
            return _PhaseEvaluation(
                satisfied=False,
                confidence=0.0,
                phase_score=0.0,
                missing_blocks=missing_any_groups,
                failed_reason="outside_transition_window",
                anchor_transition_id=anchor_transition_id,
                should_record_attempt=True,
            )

        phase_score = self._compute_phase_score(next_phase, blocks_set)
        confidence = self._compute_confidence(next_phase, blocks_set, phase_score)

        if missing_any_groups:
            return _PhaseEvaluation(
                satisfied=False,
                confidence=confidence,
                phase_score=phase_score,
                missing_blocks=missing_any_groups,
                failed_reason="missing_any_group",
                anchor_transition_id=anchor_transition_id,
                should_record_attempt=True,
            )

        threshold = next_phase.phase_score_threshold
        if threshold is not None and phase_score < threshold:
            return _PhaseEvaluation(
                satisfied=False,
                confidence=confidence,
                phase_score=phase_score,
                missing_blocks=[],
                failed_reason="below_score_threshold",
                anchor_transition_id=anchor_transition_id,
                should_record_attempt=True,
            )

        return _PhaseEvaluation(
            satisfied=True,
            confidence=confidence,
            phase_score=phase_score,
            missing_blocks=[],
            failed_reason=None,
            anchor_transition_id=anchor_transition_id,
        )

    def _phase0_satisfied(self, phase: PhaseCondition, blocks: list[str]) -> _PhaseEvaluation:
        blocks_set = set(blocks)
        missing_required = [block for block in phase.required_blocks if block not in blocks_set]
        if missing_required:
            return _PhaseEvaluation(
                satisfied=False,
                confidence=0.0,
                phase_score=0.0,
                missing_blocks=missing_required,
                failed_reason="missing_required",
            )
        if any(block in blocks_set for block in phase.disqualifier_blocks):
            return _PhaseEvaluation(
                satisfied=False,
                confidence=0.0,
                phase_score=0.0,
                missing_blocks=[],
                failed_reason="disqualified",
            )
        phase_score = self._compute_phase_score(phase, blocks_set)
        return _PhaseEvaluation(
            satisfied=True,
            confidence=self._compute_confidence(phase, blocks_set, phase_score),
            phase_score=phase_score,
            missing_blocks=[],
            failed_reason=None,
        )

    @staticmethod
    def _compute_phase_score(phase: PhaseCondition, blocks_set: set[str]) -> float:
        if not phase.score_weights:
            return 1.0

        score = 0.0
        counted: set[str] = set()

        for block in phase.required_blocks:
            if block in blocks_set:
                score += phase.score_weights.get(block, 0.0)
                counted.add(block)

        for group in phase.required_any_groups:
            fired = [block for block in group if block in blocks_set]
            if fired:
                best = max(fired, key=lambda block: phase.score_weights.get(block, 0.0))
                score += phase.score_weights.get(best, 0.0)
                counted.add(best)

        for block in [*phase.optional_blocks, *phase.soft_blocks]:
            if block in blocks_set and block not in counted:
                score += phase.score_weights.get(block, 0.0)

        return score

    @staticmethod
    def _compute_confidence(phase: PhaseCondition, blocks_set: set[str], phase_score: float) -> float:
        if phase.phase_score_threshold is not None:
            return phase_score

        n_required = len(phase.required_blocks)
        n_optional = len(phase.optional_blocks)
        n_optional_hit = sum(1 for block in phase.optional_blocks if block in blocks_set)

        # required_any_groups: count each satisfied group as one contribution
        # so phases composed from OR-groups (no hard required_blocks) still
        # produce meaningful confidence instead of 0.0.
        n_any_groups = len(phase.required_any_groups)
        n_any_hit = sum(
            1
            for group in phase.required_any_groups
            if any(block in blocks_set for block in group)
        )

        n_total = n_required + n_any_groups + n_optional
        n_hit = n_required + n_any_hit + n_optional_hit
        if n_total > 0:
            return n_hit / n_total
        return 1.0

    def _get_anchor_transition_id(
        self,
        state: SymbolPhaseState,
        current_phase: PhaseCondition,
        next_phase: PhaseCondition,
    ) -> str | None:
        if not next_phase.anchor_from_previous_phase:
            return None
        anchor_phase_id = next_phase.anchor_phase_id or current_phase.phase_id
        anchor_idx = self._phase_idx(anchor_phase_id)
        if anchor_idx is None or state.current_phase_idx != anchor_idx:
            return None
        return state.phase_transition_ids.get(anchor_phase_id)

    @staticmethod
    def _within_transition_window(state: SymbolPhaseState, phase: PhaseCondition) -> bool:
        if phase.transition_window_bars is None:
            return True
        return state.bars_in_phase <= phase.transition_window_bars

    def _reset(self, symbol: str, state: SymbolPhaseState) -> None:
        """Reset a symbol back to phase 0."""
        state.current_phase_idx = 0
        state.phase_entered_at = None
        state.bars_in_phase = 0
        state.last_phase_scores = {}
        # Keep phase_history for debugging

    def get_current_phase(self, symbol: str) -> str:
        """Return current phase_id for a symbol, or 'NONE' if not tracked."""
        state = self._states.get(symbol)
        if not state or state.invalidated:
            return "NONE"
        return self.pattern.phases[state.current_phase_idx].phase_id

    def get_entry_candidates(self) -> list[str]:
        """Return symbols currently in entry_phase."""
        entry = self.pattern.entry_phase
        return [
            sym for sym, state in self._states.items()
            if not state.invalidated
            and self.pattern.phases[state.current_phase_idx].phase_id == entry
        ]

    def get_all_states(self) -> dict[str, str]:
        """Return {symbol: phase_id} for all tracked symbols."""
        result = {}
        for sym, state in self._states.items():
            if state.invalidated:
                result[sym] = "NONE"
            else:
                result[sym] = self.pattern.phases[state.current_phase_idx].phase_id
        return result

    def get_all_states_rich(self) -> dict[str, dict]:
        """Return rich state dict with phase timing and progress info."""
        result = {}
        for sym, state in self._states.items():
            if state.invalidated:
                continue
            phase = self.pattern.phases[state.current_phase_idx]
            result[sym] = {
                "phase_id": phase.phase_id,
                "phase_idx": state.current_phase_idx,
                "phase_label": phase.label,
                "entered_at": state.phase_entered_at.isoformat() if state.phase_entered_at else None,
                "bars_in_phase": state.bars_in_phase,
                "max_bars": phase.max_bars,
                "progress_pct": round(state.bars_in_phase / phase.max_bars * 100, 1) if phase.max_bars > 0 else 0,
                "total_phases": len(self.pattern.phases),
            }
        return result

    def reset_symbol(self, symbol: str) -> None:
        """Force reset a specific symbol."""
        with self._lock:
            self._states[symbol] = SymbolPhaseState(
                symbol=symbol,
                pattern_slug=self.pattern.slug,
            )

    def get_symbol_state(self, symbol: str) -> SymbolPhaseState | None:
        return self._states.get(symbol)

    def get_state_record(self, symbol: str, *, last_eval_at: datetime | None = None) -> PatternStateRecord | None:
        state = self._states.get(symbol)
        if state is None:
            return None
        phase = self.pattern.phases[state.current_phase_idx]
        return PatternStateRecord(
            symbol=symbol,
            pattern_slug=self.pattern.slug,
            pattern_version=self.pattern.version,
            timeframe=self.pattern.timeframe,
            current_phase=phase.phase_id,
            current_phase_idx=state.current_phase_idx,
            entered_at=state.phase_entered_at,
            bars_in_phase=state.bars_in_phase,
            last_eval_at=last_eval_at,
            last_transition_id=state.last_transition_id,
            active=not state.invalidated,
            invalidated=state.invalidated,
        )

    def __repr__(self) -> str:
        n = len(self._states)
        candidates = len(self.get_entry_candidates())
        return f"PatternStateMachine({self.pattern.slug!r}, {n} symbols tracked, {candidates} entry candidates)"
