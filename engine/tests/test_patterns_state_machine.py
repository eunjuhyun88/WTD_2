"""Tests for PatternStateMachine using TRADOOR_OI_REVERSAL pattern."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

import pytest

from patterns.library import TRADOOR_OI_REVERSAL
from patterns.state_machine import PatternStateMachine
from patterns.types import PhaseTransition


def ts(offset_hours: int = 0) -> datetime:
    """Return a UTC datetime with an offset in hours from a base time."""
    base = datetime(2025, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    return base + timedelta(hours=offset_hours)


# --- Block sets for each phase ---
FAKE_DUMP_BLOCKS = ["recent_decline", "funding_extreme"]
ARCH_ZONE_BLOCKS = ["sideways_compression"]
REAL_DUMP_BLOCKS = ["oi_spike_with_dump", "volume_spike"]
ACCUMULATION_BLOCKS = ["higher_lows_sequence", "funding_flip", "oi_hold_after_spike"]
BREAKOUT_BLOCKS = ["breakout_above_high", "oi_change", "volume_spike"]

# No blocks at all (quiet bar)
QUIET_BLOCKS: list[str] = []


class TestHappyPath:
    """Full happy path: FAKE_DUMP → ARCH_ZONE → REAL_DUMP → ACCUMULATION → BREAKOUT."""

    def test_full_pattern_walk(self) -> None:
        entry_signals: list[PhaseTransition] = []
        success_signals: list[PhaseTransition] = []

        sm = PatternStateMachine(
            TRADOOR_OI_REVERSAL,
            on_entry_signal=entry_signals.append,
            on_success=success_signals.append,
        )

        sym = "PTBUSDT"

        # Bar 0: FAKE_DUMP phase 0 starts
        t = sm.evaluate(sym, FAKE_DUMP_BLOCKS, ts(0))
        assert t is None  # phase 0 just entered, no transition emitted
        assert sm.get_current_phase(sym) == "FAKE_DUMP"

        # Bar 1: ARCH_ZONE blocks fired → advance to phase 1
        t = sm.evaluate(sym, ARCH_ZONE_BLOCKS, ts(1))
        assert t is not None
        assert t.from_phase == "FAKE_DUMP"
        assert t.to_phase == "ARCH_ZONE"
        assert t.reason == "condition_met"
        assert not t.is_entry_signal
        assert not t.is_success
        assert sm.get_current_phase(sym) == "ARCH_ZONE"

        # Bar 2: REAL_DUMP blocks fired → advance to phase 2
        t = sm.evaluate(sym, REAL_DUMP_BLOCKS, ts(2))
        assert t is not None
        assert t.from_phase == "ARCH_ZONE"
        assert t.to_phase == "REAL_DUMP"
        assert not t.is_entry_signal
        assert sm.get_current_phase(sym) == "REAL_DUMP"

        # Bar 3: ACCUMULATION blocks fired → advance to phase 3 (entry_phase)
        t = sm.evaluate(sym, ACCUMULATION_BLOCKS, ts(3))
        assert t is not None
        assert t.from_phase == "REAL_DUMP"
        assert t.to_phase == "ACCUMULATION"
        assert t.is_entry_signal
        assert not t.is_success
        assert sm.get_current_phase(sym) == "ACCUMULATION"
        assert len(entry_signals) == 1
        assert entry_signals[0].symbol == sym

        # Check entry candidates
        assert sym in sm.get_entry_candidates()

        # Bar 4: BREAKOUT blocks fired → advance to phase 4 (target_phase = success)
        t = sm.evaluate(sym, BREAKOUT_BLOCKS, ts(4))
        assert t is not None
        assert t.from_phase == "ACCUMULATION"
        assert t.to_phase == "BREAKOUT"
        assert not t.is_entry_signal
        assert t.is_success
        assert len(success_signals) == 1

        # No longer an entry candidate
        assert sym not in sm.get_entry_candidates()

    def test_entry_signal_callback_fires_exactly_once(self) -> None:
        fired: list[PhaseTransition] = []
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL, on_entry_signal=fired.append)
        sym = "AAVEUSDT"

        sm.evaluate(sym, FAKE_DUMP_BLOCKS, ts(0))
        sm.evaluate(sym, ARCH_ZONE_BLOCKS, ts(1))
        sm.evaluate(sym, REAL_DUMP_BLOCKS, ts(2))
        sm.evaluate(sym, ACCUMULATION_BLOCKS, ts(3))

        assert len(fired) == 1
        assert fired[0].to_phase == "ACCUMULATION"
        assert fired[0].is_entry_signal is True


class TestTimeout:
    """Timeout resets state to phase 0."""

    def test_phase1_timeout_resets(self) -> None:
        invalidated_calls: list[tuple[str, str]] = []
        sm = PatternStateMachine(
            TRADOOR_OI_REVERSAL,
            on_invalidated=lambda sym, ph: invalidated_calls.append((sym, ph)),
        )
        sym = "XRPUSDT"

        # Enter phase 0
        sm.evaluate(sym, FAKE_DUMP_BLOCKS, ts(0))
        assert sm.get_current_phase(sym) == "FAKE_DUMP"

        # Advance to ARCH_ZONE (phase 1, max_bars=48)
        sm.evaluate(sym, ARCH_ZONE_BLOCKS, ts(1))
        assert sm.get_current_phase(sym) == "ARCH_ZONE"

        # Feed 49 quiet bars (max_bars=48 → timeout on bar 49)
        t = None
        for i in range(2, 52):
            t = sm.evaluate(sym, QUIET_BLOCKS, ts(i))
            if t is not None:
                break

        assert t is not None
        assert t.reason == "timeout"
        assert t.from_phase == "ARCH_ZONE"
        assert t.to_phase == "FAKE_DUMP"  # reset to phase 0
        assert sm.get_current_phase(sym) == "FAKE_DUMP"
        assert len(invalidated_calls) == 1
        assert invalidated_calls[0] == (sym, "ARCH_ZONE")

    def test_phase0_does_not_timeout_until_entered(self) -> None:
        """Phase 0 has no timeout until it is actually entered."""
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)
        sym = "SOLUSDT"

        # Many quiet bars without entering phase 0
        for i in range(100):
            sm.evaluate(sym, QUIET_BLOCKS, ts(i))

        # Symbol should still be at phase 0 but untracked (phase_entered_at=None)
        assert sm.get_current_phase(sym) == "FAKE_DUMP"


class TestDisqualifiers:
    """Disqualifier blocks prevent transition."""

    def test_disqualifier_prevents_arch_zone_entry(self) -> None:
        """oi_spike_with_dump disqualifies ARCH_ZONE transition."""
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)
        sym = "DOTUSDT"

        sm.evaluate(sym, FAKE_DUMP_BLOCKS, ts(0))
        assert sm.get_current_phase(sym) == "FAKE_DUMP"

        # ARCH_ZONE required block present BUT disqualifier also present
        blocks_with_disq = ["sideways_compression", "oi_spike_with_dump"]
        t = sm.evaluate(sym, blocks_with_disq, ts(1))
        assert t is None
        assert sm.get_current_phase(sym) == "FAKE_DUMP"

    def test_disqualifier_prevents_accumulation_entry(self) -> None:
        """oi_spike_with_dump disqualifies ACCUMULATION transition."""
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)
        sym = "LINKUSDT"

        sm.evaluate(sym, FAKE_DUMP_BLOCKS, ts(0))
        sm.evaluate(sym, ARCH_ZONE_BLOCKS, ts(1))
        sm.evaluate(sym, REAL_DUMP_BLOCKS, ts(2))
        assert sm.get_current_phase(sym) == "REAL_DUMP"

        # ACCUMULATION required blocks + disqualifier
        blocks_with_disq = ACCUMULATION_BLOCKS + ["oi_spike_with_dump"]
        t = sm.evaluate(sym, blocks_with_disq, ts(3))
        assert t is None
        assert sm.get_current_phase(sym) == "REAL_DUMP"


class TestMissingRequiredBlock:
    """Missing required block prevents transition."""

    def test_partial_required_blocks_no_transition(self) -> None:
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)
        sym = "ETHUSDT"

        sm.evaluate(sym, FAKE_DUMP_BLOCKS, ts(0))

        # ARCH_ZONE needs sideways_compression — don't provide it
        t = sm.evaluate(sym, ["volume_dryup"], ts(1))
        assert t is None
        assert sm.get_current_phase(sym) == "FAKE_DUMP"

    def test_partial_accumulation_blocks_no_transition(self) -> None:
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)
        sym = "BNBUSDT"

        sm.evaluate(sym, FAKE_DUMP_BLOCKS, ts(0))
        sm.evaluate(sym, ARCH_ZONE_BLOCKS, ts(1))
        sm.evaluate(sym, REAL_DUMP_BLOCKS, ts(2))

        # Provide only 2 of the 3 required ACCUMULATION blocks
        partial = ["higher_lows_sequence", "funding_flip"]
        t = sm.evaluate(sym, partial, ts(3))
        assert t is None
        assert sm.get_current_phase(sym) == "REAL_DUMP"


class TestGetEntryCandidates:
    """get_entry_candidates() returns correct symbols."""

    def test_returns_symbols_in_accumulation(self) -> None:
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)

        sym_a = "AAVEUSDT"
        sym_b = "COMPUSDT"

        # Walk sym_a to ACCUMULATION
        sm.evaluate(sym_a, FAKE_DUMP_BLOCKS, ts(0))
        sm.evaluate(sym_a, ARCH_ZONE_BLOCKS, ts(1))
        sm.evaluate(sym_a, REAL_DUMP_BLOCKS, ts(2))
        sm.evaluate(sym_a, ACCUMULATION_BLOCKS, ts(3))

        # sym_b only at ARCH_ZONE
        sm.evaluate(sym_b, FAKE_DUMP_BLOCKS, ts(0))
        sm.evaluate(sym_b, ARCH_ZONE_BLOCKS, ts(1))

        candidates = sm.get_entry_candidates()
        assert sym_a in candidates
        assert sym_b not in candidates

    def test_no_candidates_initially(self) -> None:
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)
        assert sm.get_entry_candidates() == []


class TestMultipleSymbolsIndependent:
    """Multiple symbols are tracked independently."""

    def test_two_symbols_in_different_phases(self) -> None:
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)

        sym_a = "BTCUSDT"
        sym_b = "ETHUSDT"

        # sym_a: walk to REAL_DUMP
        sm.evaluate(sym_a, FAKE_DUMP_BLOCKS, ts(0))
        sm.evaluate(sym_a, ARCH_ZONE_BLOCKS, ts(1))
        sm.evaluate(sym_a, REAL_DUMP_BLOCKS, ts(2))

        # sym_b: only entered FAKE_DUMP
        sm.evaluate(sym_b, FAKE_DUMP_BLOCKS, ts(0))

        assert sm.get_current_phase(sym_a) == "REAL_DUMP"
        assert sm.get_current_phase(sym_b) == "FAKE_DUMP"

    def test_timeout_affects_only_one_symbol(self) -> None:
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)

        sym_a = "MATICUSDT"
        sym_b = "AVAXUSDT"

        # Both reach ARCH_ZONE
        sm.evaluate(sym_a, FAKE_DUMP_BLOCKS, ts(0))
        sm.evaluate(sym_a, ARCH_ZONE_BLOCKS, ts(1))

        sm.evaluate(sym_b, FAKE_DUMP_BLOCKS, ts(0))
        sm.evaluate(sym_b, ARCH_ZONE_BLOCKS, ts(1))

        # Only sym_a receives many quiet bars → timeout
        for i in range(2, 52):
            sm.evaluate(sym_a, QUIET_BLOCKS, ts(i))

        # sym_a should have timed out to FAKE_DUMP; sym_b still at ARCH_ZONE
        assert sm.get_current_phase(sym_a) == "FAKE_DUMP"
        assert sm.get_current_phase(sym_b) == "ARCH_ZONE"

    def test_get_all_states_reflects_multiple(self) -> None:
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)

        sm.evaluate("SYM1", FAKE_DUMP_BLOCKS, ts(0))
        sm.evaluate("SYM2", FAKE_DUMP_BLOCKS, ts(0))
        sm.evaluate("SYM2", ARCH_ZONE_BLOCKS, ts(1))

        states = sm.get_all_states()
        assert states["SYM1"] == "FAKE_DUMP"
        assert states["SYM2"] == "ARCH_ZONE"

    def test_reset_symbol_returns_to_phase0(self) -> None:
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)
        sym = "RESETME"

        sm.evaluate(sym, FAKE_DUMP_BLOCKS, ts(0))
        sm.evaluate(sym, ARCH_ZONE_BLOCKS, ts(1))
        assert sm.get_current_phase(sym) == "ARCH_ZONE"

        sm.reset_symbol(sym)
        assert sm.get_current_phase(sym) == "FAKE_DUMP"

    def test_untracked_symbol_returns_none(self) -> None:
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)
        assert sm.get_current_phase("NOTHERE") == "NONE"
