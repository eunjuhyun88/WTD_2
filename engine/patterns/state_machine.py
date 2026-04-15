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

import logging
from datetime import datetime
from typing import Callable

from patterns.types import (
    PatternObject, PatternStateRecord, PhaseCondition, SymbolPhaseState, PhaseTransition
)

log = logging.getLogger("engine.patterns.state_machine")


class PatternStateMachine:
    def __init__(
        self,
        pattern: PatternObject,
        on_transition: Callable[[PhaseTransition], None] | None = None,
        on_entry_signal: Callable[[PhaseTransition], None] | None = None,
        on_success: Callable[[PhaseTransition], None] | None = None,
        on_invalidated: Callable[[str, str], None] | None = None,
    ):
        self.pattern = pattern
        self.on_transition = on_transition
        self.on_entry_signal = on_entry_signal
        self.on_success = on_success
        self.on_invalidated = on_invalidated
        self._states: dict[str, SymbolPhaseState] = {}

    def evaluate(
        self,
        symbol: str,
        blocks_triggered: list[str],
        timestamp: datetime,
        feature_snapshot: dict | None = None,
        scan_id: str | None = None,
        trigger_bar_ts: datetime | None = None,
        data_quality: dict | None = None,
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
                self._emit_transition(t)
                if self.on_invalidated:
                    self.on_invalidated(symbol, old_phase_id)
                return t

        # --- Check if we can advance to next phase ---
        next_phase_idx = state.current_phase_idx + 1
        if next_phase_idx < len(self.pattern.phases):
            next_phase = self.pattern.phases[next_phase_idx]

            # v2: min_bars enforcement — must stay in current phase long enough
            if state.phase_entered_at is not None and state.bars_in_phase < current_phase.min_bars:
                # Not enough bars in current phase yet — don't advance
                return None

            satisfied, confidence = self._phase_satisfied(next_phase, blocks_triggered)
            if satisfied:
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
                    confidence=confidence,
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

                log.info(
                    "TRANSITION: %s %s → %s (conf=%.0f%%) [%s]",
                    symbol, old_phase_id, next_phase.phase_id,
                    confidence * 100, self.pattern.slug,
                )

                self._emit_transition(t)

                return t
        else:
            # Already at last phase — success phase, reset after max_bars
            if state.bars_in_phase and state.bars_in_phase > current_phase.max_bars:
                self._reset(symbol, state)

        # No transition — if we're at phase 0 and haven't entered yet,
        # check if phase 0 conditions are met to "start" tracking
        if state.current_phase_idx == 0 and state.phase_entered_at is None:
            phase0 = self.pattern.phases[0]
            satisfied, _ = self._phase_satisfied(phase0, blocks_triggered)
            if satisfied:
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
                self._emit_transition(t)
                return t

        return None

    def _emit_transition(self, transition: PhaseTransition) -> None:
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
        for record in iterable:
            if record.pattern_slug != self.pattern.slug or record.invalidated or not record.active:
                continue
            if not (0 <= record.current_phase_idx < len(self.pattern.phases)):
                continue
            self._states[record.symbol] = SymbolPhaseState(
                symbol=record.symbol,
                pattern_slug=record.pattern_slug,
                current_phase_idx=record.current_phase_idx,
                phase_entered_at=record.entered_at,
                bars_in_phase=record.bars_in_phase,
                phase_history=[(record.current_phase, record.entered_at)] if record.entered_at else [],
                invalidated=record.invalidated,
            )

    def _phase_satisfied(
        self, phase: PhaseCondition, blocks: list[str]
    ) -> tuple[bool, float]:
        """Check if all required blocks fired and no disqualifiers fired.

        v2: returns (satisfied, confidence) where confidence includes optional blocks.
        """
        blocks_set = set(blocks)

        # All required must fire
        if not all(b in blocks_set for b in phase.required_blocks):
            return False, 0.0

        # No disqualifier may fire
        if any(b in blocks_set for b in phase.disqualifier_blocks):
            return False, 0.0

        # v2: Confidence = required (base) + optional (bonus)
        n_required = len(phase.required_blocks)
        n_optional = len(phase.optional_blocks)
        n_optional_hit = sum(1 for b in phase.optional_blocks if b in blocks_set)

        if n_optional > 0:
            confidence = (n_required + n_optional_hit) / (n_required + n_optional)
        else:
            confidence = 1.0

        return True, confidence

    def _reset(self, symbol: str, state: SymbolPhaseState) -> None:
        """Reset a symbol back to phase 0."""
        state.current_phase_idx = 0
        state.phase_entered_at = None
        state.bars_in_phase = 0
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
        if symbol in self._states:
            self._reset(symbol, self._states[symbol])

    def __repr__(self) -> str:
        n = len(self._states)
        candidates = len(self.get_entry_candidates())
        return f"PatternStateMachine({self.pattern.slug!r}, {n} symbols tracked, {candidates} entry candidates)"
