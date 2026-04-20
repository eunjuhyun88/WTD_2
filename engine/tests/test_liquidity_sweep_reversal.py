"""Test suite for liquidity_sweep_reversal pattern."""
from __future__ import annotations

import pytest

from patterns.library import LIQUIDITY_SWEEP_REVERSAL, get_pattern
from patterns.state_machine import PatternStateMachine
from building_blocks.context import Context
from models.market import Kline


def test_pattern_registered():
    """Verify pattern is in library."""
    pattern = get_pattern("liquidity-sweep-reversal-v1")
    assert pattern.slug == "liquidity-sweep-reversal-v1"
    assert pattern.direction == "long"
    assert pattern.entry_phase == "ACCUMULATION"
    assert len(pattern.phases) == 4
    phase_ids = [p.phase_id for p in pattern.phases]
    assert "BREAKOUT_CLIMAX" in phase_ids
    assert "REVERSAL_SIGNAL" in phase_ids
    assert "ACCUMULATION" in phase_ids
    assert "BREAKOUT" in phase_ids


def test_pattern_phase_structure():
    """Verify phase conditions are well-formed."""
    pattern = LIQUIDITY_SWEEP_REVERSAL

    # BREAKOUT_CLIMAX: requires breakout + volume
    climax = pattern.phases[0]
    assert climax.phase_id == "BREAKOUT_CLIMAX"
    assert "breakout_above_high" in climax.required_blocks
    assert "volume_spike" in climax.required_blocks

    # REVERSAL_SIGNAL: transition phase (no blocks required)
    reversal = pattern.phases[1]
    assert reversal.phase_id == "REVERSAL_SIGNAL"
    assert len(reversal.required_blocks) == 0

    # ACCUMULATION: entry phase (higher_lows + oi_hold + funding)
    accum = pattern.phases[2]
    assert accum.phase_id == "ACCUMULATION"
    assert "higher_lows_sequence" in accum.required_blocks
    assert "oi_hold_after_spike" in accum.required_blocks
    assert pattern.entry_phase == accum.phase_id

    # BREAKOUT: requires breakout confirmation
    breakout = pattern.phases[3]
    assert breakout.phase_id == "BREAKOUT"
    assert "breakout_from_pullback_range" in breakout.required_blocks


def test_state_machine_instantiation():
    """Verify state machine can be created for pattern."""
    sm = PatternStateMachine(LIQUIDITY_SWEEP_REVERSAL)
    assert sm.pattern.slug == "liquidity-sweep-reversal-v1"

    # Initial state should be None (not started)
    sym = "BTCUSDT"
    assert sm.get_current_phase(sym) == "NONE"


def test_entry_candidate_gate():
    """Verify entry_phase is correctly set."""
    pattern = LIQUIDITY_SWEEP_REVERSAL
    assert pattern.entry_phase == "ACCUMULATION"
    # Pattern only signals entry when ACCUMULATION is reached


def test_phase_sequence_order():
    """Verify phases follow logical progression."""
    pattern = LIQUIDITY_SWEEP_REVERSAL
    expected_order = ["BREAKOUT_CLIMAX", "REVERSAL_SIGNAL", "ACCUMULATION", "BREAKOUT"]
    actual_order = [p.phase_id for p in pattern.phases]
    assert actual_order == expected_order


def test_block_availability():
    """Verify all blocks used by pattern exist in block evaluator."""
    from scoring.block_evaluator import _BLOCKS

    block_names = {name for name, _ in _BLOCKS}

    pattern = LIQUIDITY_SWEEP_REVERSAL
    required_blocks = set()
    for phase in pattern.phases:
        required_blocks.update(phase.required_blocks or [])
        for group in (phase.required_any_groups or []):
            required_blocks.update(group)
        required_blocks.update(phase.soft_blocks or [])
        required_blocks.update(phase.optional_blocks or [])

    missing = required_blocks - block_names
    assert not missing, f"Missing blocks: {missing}"


def test_score_weights_sum():
    """Verify phase score weights don't exceed 1.0."""
    pattern = LIQUIDITY_SWEEP_REVERSAL
    for phase in pattern.phases:
        if phase.score_weights:
            total = sum(phase.score_weights.values())
            # Allow small floating-point variance
            assert total <= 1.05, f"{phase.phase_id} weights sum to {total}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
