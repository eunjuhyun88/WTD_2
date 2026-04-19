"""Tests for institutional-distribution-v1 pattern (W-0109).

11th pattern — Institutional Distribution Short.
CVD-spot divergence (absorption → distribution) → OI weakening → bearish entry.

Validates:
  1. Pattern in PATTERN_LIBRARY with correct slug / phases
  2. Phase structure: CVD_DECOUPLING → LIQUIDITY_WEAKENING → SHORT_ENTRY
  3. Required blocks and disqualifiers per phase
  4. New disqualifier blocks registered in block_evaluator
  5. direction = "short"
  6. Tags include "distribution", "short", "cvd"
"""
from __future__ import annotations

import pytest

from patterns.library import PATTERN_LIBRARY, get_pattern
from scoring.block_evaluator import _BLOCKS as BLOCK_REGISTRY

SLUG = "institutional-distribution-v1"


class TestInstitutionalDistributionPattern:

    def test_pattern_registered(self):
        assert SLUG in PATTERN_LIBRARY

    def test_pattern_slug(self):
        assert get_pattern(SLUG).slug == SLUG

    def test_three_phases_in_order(self):
        p = get_pattern(SLUG)
        phase_ids = [ph.phase_id for ph in p.phases]
        assert phase_ids == ["CVD_DECOUPLING", "LIQUIDITY_WEAKENING", "SHORT_ENTRY"]

    def test_entry_and_target_phases(self):
        p = get_pattern(SLUG)
        assert p.entry_phase == "SHORT_ENTRY"
        assert p.target_phase == "SHORT_ENTRY"

    def test_direction_is_short(self):
        p = get_pattern(SLUG)
        assert p.direction == "short"

    def test_timeframe_and_universe(self):
        p = get_pattern(SLUG)
        assert p.timeframe == "1h"
        assert p.universe_scope == "binance_dynamic"

    def test_tags(self):
        p = get_pattern(SLUG)
        assert "distribution" in p.tags
        assert "short" in p.tags
        assert "cvd" in p.tags

    # --- Phase 1: CVD_DECOUPLING ---

    def test_cvd_decoupling_required_blocks(self):
        p = get_pattern(SLUG)
        phase = p.phases[0]
        assert phase.phase_id == "CVD_DECOUPLING"
        assert "recent_decline" in phase.required_blocks

    def test_cvd_decoupling_required_any_groups(self):
        p = get_pattern(SLUG)
        phase = p.phases[0]
        # Must have exactly one required_any_group with the two CVD blocks
        assert len(phase.required_any_groups) == 1
        group = phase.required_any_groups[0]
        assert "delta_flip_positive" in group
        assert "cvd_spot_price_divergence_bear" in group

    def test_cvd_decoupling_disqualifier(self):
        p = get_pattern(SLUG)
        phase = p.phases[0]
        assert "higher_lows_sequence" in phase.disqualifier_blocks

    def test_cvd_decoupling_bar_limits(self):
        p = get_pattern(SLUG)
        phase = p.phases[0]
        assert phase.min_bars >= 2
        assert phase.max_bars <= 24

    # --- Phase 2: LIQUIDITY_WEAKENING ---

    def test_liquidity_weakening_soft_blocks(self):
        p = get_pattern(SLUG)
        phase = p.phases[1]
        assert phase.phase_id == "LIQUIDITY_WEAKENING"
        assert "oi_exchange_divergence" in phase.soft_blocks
        assert "oi_spike_with_dump" in phase.soft_blocks
        assert "total_oi_spike" in phase.soft_blocks

    def test_liquidity_weakening_no_gating_required(self):
        """Phase 2 must be able to advance without OI data."""
        p = get_pattern(SLUG)
        phase = p.phases[1]
        assert phase.required_blocks == []
        # required_any_groups may be absent or empty
        assert not phase.required_any_groups or phase.required_any_groups == []

    # --- Phase 3: SHORT_ENTRY ---

    def test_short_entry_required_any_group(self):
        p = get_pattern(SLUG)
        phase = p.phases[2]
        assert phase.phase_id == "SHORT_ENTRY"
        assert len(phase.required_any_groups) == 1
        group = phase.required_any_groups[0]
        assert "bearish_engulfing" in group
        assert "long_upper_wick" in group
        assert "volume_surge_bear" in group

    def test_short_entry_disqualifier(self):
        p = get_pattern(SLUG)
        phase = p.phases[2]
        assert "bollinger_squeeze" in phase.disqualifier_blocks

    # --- Block Evaluator Registration ---

    def test_cvd_spot_price_divergence_bear_registered(self):
        block_names = {name for name, _ in BLOCK_REGISTRY}
        assert "cvd_spot_price_divergence_bear" in block_names, (
            "cvd_spot_price_divergence_bear must be in block_evaluator._BLOCKS"
        )

    def test_coinbase_premium_weak_registered(self):
        block_names = {name for name, _ in BLOCK_REGISTRY}
        assert "coinbase_premium_weak" in block_names, (
            "coinbase_premium_weak must be in block_evaluator._BLOCKS"
        )

    def test_new_blocks_are_callable(self):
        block_map = {name: fn for name, fn in BLOCK_REGISTRY}
        assert callable(block_map["cvd_spot_price_divergence_bear"])
        assert callable(block_map["coinbase_premium_weak"])
