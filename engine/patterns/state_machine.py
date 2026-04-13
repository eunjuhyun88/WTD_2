"""PatternStateMachine — tracks which Phase each symbol is in for a PatternObject.

Design:
- One StateMachine instance per PatternObject (not per symbol)
- evaluate() is called each bar for each symbol with fired block names
- Phase transitions are sequential (phase[0] → phase[1] → ...)
- timeout: if max_bars exceeded without transition → reset to phase[0]
- entry_signal: emitted when entering entry_phase
- success: emitted when reaching target_phase

Block names are checked by string: the StateMachine doesn't call blocks itself.
The caller (scanner) runs blocks and passes the list of triggered block names.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Callable

from patterns.types import (
    PatternObject, PhaseCondition, SymbolPhaseState, PhaseTransition
)

log = logging.getLogger("engine.patterns.state_machine")


class PatternStateMachine:
    def __init__(
        self,
        pattern: PatternObject,
        on_entry_signal: Callable[[PhaseTransition], None] | None = None,
        on_success: Callable[[PhaseTransition], None] | None = None,
        on_invalidated: Callable[[str, str], None] | None = None,
    ):
        self.pattern = pattern
        self.on_entry_signal = on_entry_signal
        self.on_success = on_success
        self.on_invalidated = on_invalidated
        self._states: dict[str, SymbolPhaseState] = {}

    def evaluate(
        self,
        symbol: str,
        blocks_triggered: list[str],
        timestamp: datetime,
    ) -> PhaseTransition | None:
        """
        Evaluate one bar for a symbol.

        Args:
            symbol: e.g. "PTBUSDT"
            blocks_triggered: list of block names that fired this bar
                e.g. ["oi_spike_with_dump", "volume_spike", "recent_decline"]
            timestamp: bar open time (UTC)

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
                self._reset(symbol, state)
                t = PhaseTransition(
                    symbol=symbol,
                    pattern_slug=self.pattern.slug,
                    from_phase=old_phase_id,
                    to_phase=self.pattern.phases[0].phase_id,
                    timestamp=timestamp,
                    reason="timeout",
                )
                if self.on_invalidated:
                    self.on_invalidated(symbol, old_phase_id)
                return t

        # --- Check if we can advance to next phase ---
        next_phase_idx = state.current_phase_idx + 1
        if next_phase_idx < len(self.pattern.phases):
            next_phase = self.pattern.phases[next_phase_idx]
            if self._phase_satisfied(next_phase, blocks_triggered):
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
                )

                if is_entry and self.on_entry_signal:
                    self.on_entry_signal(t)
                if is_success and self.on_success:
                    self.on_success(t)

                return t
        else:
            # Already at last phase — success phase, reset after max_bars
            if state.bars_in_phase and state.bars_in_phase > current_phase.max_bars:
                self._reset(symbol, state)

        # No transition — if we're at phase 0 and haven't entered yet,
        # check if phase 0 conditions are met to "start" tracking
        if state.current_phase_idx == 0 and state.phase_entered_at is None:
            phase0 = self.pattern.phases[0]
            if self._phase_satisfied(phase0, blocks_triggered):
                state.phase_entered_at = timestamp
                state.bars_in_phase = 1
                state.phase_history.append((phase0.phase_id, timestamp))

        return None

    def _phase_satisfied(self, phase: PhaseCondition, blocks: list[str]) -> bool:
        """Check if all required blocks fired and no disqualifiers fired."""
        blocks_set = set(blocks)
        if not all(b in blocks_set for b in phase.required_blocks):
            return False
        if any(b in blocks_set for b in phase.disqualifier_blocks):
            return False
        return True

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

    def reset_symbol(self, symbol: str) -> None:
        """Force reset a specific symbol."""
        if symbol in self._states:
            self._reset(symbol, self._states[symbol])

    def __repr__(self) -> str:
        n = len(self._states)
        candidates = len(self.get_entry_candidates())
        return f"PatternStateMachine({self.pattern.slug!r}, {n} symbols tracked, {candidates} entry candidates)"
