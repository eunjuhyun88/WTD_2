"""Tests for PatternStateMachine using TRADOOR_OI_REVERSAL pattern.

v2: Updated to respect min_bars enforcement. Each phase must be held for
at least `min_bars` quiet bars before the state machine will consider
advancing to the next phase.

TRADOOR phase min_bars:
  FAKE_DUMP=1, ARCH_ZONE=4, REAL_DUMP=1, ACCUMULATION=6, BREAKOUT=1
"""
from __future__ import annotations

import copy
from datetime import datetime, timezone, timedelta

import pytest

from patterns.library import TRADOOR_OI_REVERSAL
from patterns.state_machine import PatternStateMachine
from patterns.types import PhaseAttemptRecord, PhaseTransition


def ts(offset_hours: int = 0) -> datetime:
    """Return a UTC datetime with an offset in hours from a base time."""
    base = datetime(2025, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    return base + timedelta(hours=offset_hours)


# --- Block sets for each phase ---
FAKE_DUMP_BLOCKS = ["recent_decline", "funding_extreme"]
ARCH_ZONE_BLOCKS = ["sideways_compression"]
REAL_DUMP_BLOCKS = ["oi_spike_with_dump", "volume_spike"]
ACCUMULATION_BLOCKS = ["higher_lows_sequence", "positive_funding_bias", "oi_hold_after_spike"]
BREAKOUT_BLOCKS = ["breakout_above_high", "oi_change", "volume_spike"]

QUIET_BLOCKS: list[str] = []


def _advance_through(sm: PatternStateMachine, sym: str, blocks: list[str],
                     start_hour: int, min_bars: int) -> int:
    """Feed `min_bars` quiet bars (to satisfy min_bars), then feed the next phase's
    blocks. Returns the next available hour offset."""
    # Feed quiet bars to satisfy min_bars of current phase
    h = start_hour
    for _ in range(min_bars):
        sm.evaluate(sym, QUIET_BLOCKS, ts(h))
        h += 1
    # Feed the transition blocks
    sm.evaluate(sym, blocks, ts(h))
    h += 1
    return h


def _walk_to_accumulation(sm: PatternStateMachine, sym: str, start: int = 0) -> int:
    """Walk a symbol through FAKE_DUMP → ARCH_ZONE → REAL_DUMP → ACCUMULATION.
    Returns next available hour offset."""
    h = start
    # Enter FAKE_DUMP (phase 0)
    sm.evaluate(sym, FAKE_DUMP_BLOCKS, ts(h)); h += 1
    # FAKE_DUMP min_bars=1, then advance to ARCH_ZONE
    h = _advance_through(sm, sym, ARCH_ZONE_BLOCKS, h, min_bars=1)
    # ARCH_ZONE min_bars=4, then advance to REAL_DUMP
    h = _advance_through(sm, sym, REAL_DUMP_BLOCKS, h, min_bars=4)
    # REAL_DUMP min_bars=1, then advance to ACCUMULATION
    h = _advance_through(sm, sym, ACCUMULATION_BLOCKS, h, min_bars=1)
    return h


def _walk_to_real_dump(sm: PatternStateMachine, sym: str, start: int = 0) -> int:
    """Walk a symbol through FAKE_DUMP → ARCH_ZONE → REAL_DUMP."""
    h = start
    sm.evaluate(sym, FAKE_DUMP_BLOCKS, ts(h)); h += 1
    h = _advance_through(sm, sym, ARCH_ZONE_BLOCKS, h, min_bars=1)
    h = _advance_through(sm, sym, REAL_DUMP_BLOCKS, h, min_bars=4)
    return h


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

        # Walk to ACCUMULATION (entry phase)
        h = _walk_to_accumulation(sm, sym)
        assert sm.get_current_phase(sym) == "ACCUMULATION"
        assert len(entry_signals) == 1
        assert entry_signals[0].symbol == sym
        assert sym in sm.get_entry_candidates()

        # ACCUMULATION min_bars=6, then advance to BREAKOUT
        h = _advance_through(sm, sym, BREAKOUT_BLOCKS, h, min_bars=6)
        assert sm.get_current_phase(sym) == "BREAKOUT"
        assert len(success_signals) == 1
        assert sym not in sm.get_entry_candidates()

    def test_entry_signal_callback_fires_exactly_once(self) -> None:
        fired: list[PhaseTransition] = []
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL, on_entry_signal=fired.append)
        sym = "AAVEUSDT"

        _walk_to_accumulation(sm, sym)

        assert len(fired) == 1
        assert fired[0].to_phase == "ACCUMULATION"
        assert fired[0].is_entry_signal is True


class TestMinBars:
    """v2: min_bars enforcement prevents premature transitions."""

    def test_cannot_advance_before_min_bars(self) -> None:
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)
        sym = "TESTUSDT"

        # Enter FAKE_DUMP
        sm.evaluate(sym, FAKE_DUMP_BLOCKS, ts(0))
        assert sm.get_current_phase(sym) == "FAKE_DUMP"

        # Advance to ARCH_ZONE (FAKE_DUMP min_bars=1, so 1 quiet bar suffices)
        sm.evaluate(sym, QUIET_BLOCKS, ts(1))  # 1 bar in FAKE_DUMP
        t = sm.evaluate(sym, ARCH_ZONE_BLOCKS, ts(2))
        assert t is not None
        assert sm.get_current_phase(sym) == "ARCH_ZONE"

        # ARCH_ZONE min_bars=4 — try to advance immediately (should fail)
        t = sm.evaluate(sym, REAL_DUMP_BLOCKS, ts(3))
        assert t is None
        assert sm.get_current_phase(sym) == "ARCH_ZONE"

        # After 4 bars, should succeed
        for i in range(4, 7):
            sm.evaluate(sym, QUIET_BLOCKS, ts(i))
        t = sm.evaluate(sym, REAL_DUMP_BLOCKS, ts(7))
        assert t is not None
        assert sm.get_current_phase(sym) == "REAL_DUMP"


class TestConfidence:
    """v2: Confidence scoring from optional blocks."""

    def test_full_confidence_without_optional(self) -> None:
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)
        sym = "CONFUSDT"

        sm.evaluate(sym, FAKE_DUMP_BLOCKS, ts(0))
        sm.evaluate(sym, QUIET_BLOCKS, ts(1))
        t = sm.evaluate(sym, ARCH_ZONE_BLOCKS, ts(2))
        assert t is not None
        # ARCH_ZONE has 1 optional block (volume_dryup), so without it:
        # confidence = 1 / (1 + 1) = 0.5
        assert 0.4 < t.confidence < 0.6

    def test_higher_confidence_with_optional(self) -> None:
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)
        sym = "CONFUSDT"

        sm.evaluate(sym, FAKE_DUMP_BLOCKS, ts(0))
        sm.evaluate(sym, QUIET_BLOCKS, ts(1))
        t = sm.evaluate(sym, ARCH_ZONE_BLOCKS + ["volume_dryup"], ts(2))
        assert t is not None
        assert t.confidence == 1.0


class TestFeatureSnapshot:
    """v2: feature_snapshot is passed through transitions."""

    def test_snapshot_in_transition(self) -> None:
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)
        sym = "SNAPUSDT"

        sm.evaluate(sym, FAKE_DUMP_BLOCKS, ts(0), feature_snapshot={"rsi14": 25.0})
        sm.evaluate(sym, QUIET_BLOCKS, ts(1))
        t = sm.evaluate(sym, ARCH_ZONE_BLOCKS, ts(2), feature_snapshot={"rsi14": 35.0})
        assert t is not None
        assert t.feature_snapshot == {"rsi14": 35.0}


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

        # Advance to ARCH_ZONE
        sm.evaluate(sym, QUIET_BLOCKS, ts(1))
        sm.evaluate(sym, ARCH_ZONE_BLOCKS, ts(2))
        assert sm.get_current_phase(sym) == "ARCH_ZONE"

        # Feed 49 quiet bars (max_bars=48 → timeout on bar 49)
        t = None
        for i in range(3, 53):
            t = sm.evaluate(sym, QUIET_BLOCKS, ts(i))
            if t is not None:
                break

        assert t is not None
        assert t.reason == "timeout"
        assert t.from_phase == "ARCH_ZONE"
        assert t.to_phase == "FAKE_DUMP"
        assert sm.get_current_phase(sym) == "FAKE_DUMP"
        assert len(invalidated_calls) == 1
        assert invalidated_calls[0] == (sym, "ARCH_ZONE")

    def test_phase0_does_not_timeout_until_entered(self) -> None:
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)
        sym = "SOLUSDT"

        for i in range(100):
            sm.evaluate(sym, QUIET_BLOCKS, ts(i))

        assert sm.get_current_phase(sym) == "FAKE_DUMP"


class TestDisqualifiers:
    """Disqualifier blocks prevent transition."""

    def test_disqualifier_prevents_arch_zone_entry(self) -> None:
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)
        sym = "DOTUSDT"

        sm.evaluate(sym, FAKE_DUMP_BLOCKS, ts(0))
        assert sm.get_current_phase(sym) == "FAKE_DUMP"

        # ARCH_ZONE required + disqualifier
        blocks_with_disq = ["sideways_compression", "oi_spike_with_dump"]
        sm.evaluate(sym, QUIET_BLOCKS, ts(1))
        t = sm.evaluate(sym, blocks_with_disq, ts(2))
        assert t is None
        assert sm.get_current_phase(sym) == "FAKE_DUMP"

    def test_disqualifier_prevents_accumulation_entry(self) -> None:
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)
        sym = "LINKUSDT"

        h = _walk_to_real_dump(sm, sym)
        assert sm.get_current_phase(sym) == "REAL_DUMP"

        # ACCUMULATION required blocks + disqualifier
        blocks_with_disq = ACCUMULATION_BLOCKS + ["oi_spike_with_dump"]
        sm.evaluate(sym, QUIET_BLOCKS, ts(h))
        t = sm.evaluate(sym, blocks_with_disq, ts(h + 1))
        assert t is None
        assert sm.get_current_phase(sym) == "REAL_DUMP"


class TestScoreBasedAccumulation:
    def test_positive_funding_bias_satisfies_any_group(self) -> None:
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)
        sym = "ARBUSDT"

        _walk_to_accumulation(sm, sym)

        assert sm.get_current_phase(sym) == "ACCUMULATION"
        state = sm.get_symbol_state(sym)
        assert state is not None
        assert state.last_phase_scores["ACCUMULATION"] >= 0.85

    def test_missing_any_group_records_phase_attempt(self) -> None:
        attempts: list[PhaseAttemptRecord] = []
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL, on_phase_attempt=attempts.append)
        sym = "MKRUSDT"

        h = _walk_to_real_dump(sm, sym)
        sm.evaluate(sym, QUIET_BLOCKS, ts(h))
        t = sm.evaluate(sym, ["higher_lows_sequence", "oi_hold_after_spike"], ts(h + 1))

        assert t is None
        assert sm.get_current_phase(sym) == "REAL_DUMP"
        assert len(attempts) == 1
        assert attempts[0].failed_reason == "missing_any_group"
        assert "positive_funding_bias" in attempts[0].missing_blocks

    def test_transition_window_blocks_late_accumulation(self) -> None:
        pattern = copy.deepcopy(TRADOOR_OI_REVERSAL)
        real_dump = next(phase for phase in pattern.phases if phase.phase_id == "REAL_DUMP")
        real_dump.max_bars = 20

        attempts: list[PhaseAttemptRecord] = []
        sm = PatternStateMachine(pattern, on_phase_attempt=attempts.append)
        sym = "LATEUSDT"

        h = _walk_to_real_dump(sm, sym)
        for offset in range(13):
            sm.evaluate(sym, QUIET_BLOCKS, ts(h + offset))

        t = sm.evaluate(sym, ACCUMULATION_BLOCKS, ts(h + 13))

        assert t is None
        assert sm.get_current_phase(sym) == "REAL_DUMP"
        assert attempts[-1].failed_reason == "outside_transition_window"

    def test_custom_threshold_can_block_low_score(self) -> None:
        pattern = copy.deepcopy(TRADOOR_OI_REVERSAL)
        accumulation = next(phase for phase in pattern.phases if phase.phase_id == "ACCUMULATION")
        accumulation.phase_score_threshold = 0.95

        attempts: list[PhaseAttemptRecord] = []
        sm = PatternStateMachine(pattern, on_phase_attempt=attempts.append)
        sym = "THRESHUSDT"

        h = _walk_to_real_dump(sm, sym)
        sm.evaluate(sym, QUIET_BLOCKS, ts(h))
        t = sm.evaluate(sym, ACCUMULATION_BLOCKS, ts(h + 1))

        assert t is None
        assert sm.get_current_phase(sym) == "REAL_DUMP"
        assert attempts[-1].failed_reason == "below_score_threshold"


class TestMissingRequiredBlock:
    """Missing required block prevents transition."""

    def test_partial_required_blocks_no_transition(self) -> None:
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)
        sym = "ETHUSDT"

        sm.evaluate(sym, FAKE_DUMP_BLOCKS, ts(0))

        sm.evaluate(sym, QUIET_BLOCKS, ts(1))
        t = sm.evaluate(sym, ["volume_dryup"], ts(2))
        assert t is None
        assert sm.get_current_phase(sym) == "FAKE_DUMP"

    def test_partial_accumulation_blocks_no_transition(self) -> None:
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)
        sym = "BNBUSDT"

        h = _walk_to_real_dump(sm, sym)
        assert sm.get_current_phase(sym) == "REAL_DUMP"

        # Provide only 2 of 3 required ACCUMULATION blocks
        partial = ["higher_lows_sequence", "funding_flip"]
        sm.evaluate(sym, QUIET_BLOCKS, ts(h))
        t = sm.evaluate(sym, partial, ts(h + 1))
        assert t is None
        assert sm.get_current_phase(sym) == "REAL_DUMP"


class TestGetEntryCandidates:
    """get_entry_candidates() returns correct symbols."""

    def test_returns_symbols_in_accumulation(self) -> None:
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)

        sym_a = "AAVEUSDT"
        sym_b = "COMPUSDT"

        _walk_to_accumulation(sm, sym_a)
        # sym_b only at ARCH_ZONE
        sm.evaluate(sym_b, FAKE_DUMP_BLOCKS, ts(0))
        sm.evaluate(sym_b, QUIET_BLOCKS, ts(1))
        sm.evaluate(sym_b, ARCH_ZONE_BLOCKS, ts(2))

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

        _walk_to_real_dump(sm, sym_a)
        sm.evaluate(sym_b, FAKE_DUMP_BLOCKS, ts(0))

        assert sm.get_current_phase(sym_a) == "REAL_DUMP"
        assert sm.get_current_phase(sym_b) == "FAKE_DUMP"

    def test_timeout_affects_only_one_symbol(self) -> None:
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)

        sym_a = "MATICUSDT"
        sym_b = "AVAXUSDT"

        # Both reach ARCH_ZONE
        sm.evaluate(sym_a, FAKE_DUMP_BLOCKS, ts(0))
        sm.evaluate(sym_a, QUIET_BLOCKS, ts(1))
        sm.evaluate(sym_a, ARCH_ZONE_BLOCKS, ts(2))

        sm.evaluate(sym_b, FAKE_DUMP_BLOCKS, ts(0))
        sm.evaluate(sym_b, QUIET_BLOCKS, ts(1))
        sm.evaluate(sym_b, ARCH_ZONE_BLOCKS, ts(2))

        # Only sym_a receives many quiet bars → timeout
        for i in range(3, 53):
            sm.evaluate(sym_a, QUIET_BLOCKS, ts(i))

        assert sm.get_current_phase(sym_a) == "FAKE_DUMP"
        assert sm.get_current_phase(sym_b) == "ARCH_ZONE"

    def test_get_all_states_reflects_multiple(self) -> None:
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)

        sm.evaluate("SYM1", FAKE_DUMP_BLOCKS, ts(0))
        sm.evaluate("SYM2", FAKE_DUMP_BLOCKS, ts(0))
        sm.evaluate("SYM2", QUIET_BLOCKS, ts(1))
        sm.evaluate("SYM2", ARCH_ZONE_BLOCKS, ts(2))

        states = sm.get_all_states()
        assert states["SYM1"] == "FAKE_DUMP"
        assert states["SYM2"] == "ARCH_ZONE"

    def test_reset_symbol_returns_to_phase0(self) -> None:
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)
        sym = "RESETME"

        sm.evaluate(sym, FAKE_DUMP_BLOCKS, ts(0))
        sm.evaluate(sym, QUIET_BLOCKS, ts(1))
        sm.evaluate(sym, ARCH_ZONE_BLOCKS, ts(2))
        assert sm.get_current_phase(sym) == "ARCH_ZONE"

        sm.reset_symbol(sym)
        assert sm.get_current_phase(sym) == "FAKE_DUMP"

    def test_untracked_symbol_returns_none(self) -> None:
        sm = PatternStateMachine(TRADOOR_OI_REVERSAL)
        assert sm.get_current_phase("NOTHERE") == "NONE"
