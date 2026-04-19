"""Tests for volume-absorption-reversal-v1 pattern definition.

W-0103 P0: 5th pattern — Volume Absorption Reversal (VAR).

Validates:
  1. Pattern loads from PATTERN_LIBRARY with correct structure
  2. All 4 phases present in correct order
  3. Required blocks match VAR spec:
     - SELLING_CLIMAX: volume_spike_down
     - ABSORPTION: volume_dryup (replaces absorption_signal — post-climax
       price is too volatile for absorption_signal's 0.5% price gate)
     - DELTA_FLIP: delta_flip_var (tuned w=3 lambda — replaces
       delta_flip_positive whose w=6 default is dominated by the climax bar)
     - MARKUP: breakout_above_high (target phase)
  4. Library count updated to 5
  5. All referenced blocks registered in block_evaluator
  6. PHASE_ORDER includes new phases
"""
from __future__ import annotations

import pytest

from patterns.library import PATTERN_LIBRARY, get_pattern
from scoring.block_evaluator import _BLOCKS as BLOCK_REGISTRY

SLUG = "volume-absorption-reversal-v1"


class TestVolumeAbsorptionReversalPattern:
    def test_pattern_registered(self):
        assert SLUG in PATTERN_LIBRARY

    def test_pattern_slug(self):
        p = get_pattern(SLUG)
        assert p.slug == SLUG

    def test_four_phases_in_order(self):
        p = get_pattern(SLUG)
        phase_ids = [ph.phase_id for ph in p.phases]
        assert phase_ids == ["SELLING_CLIMAX", "ABSORPTION", "DELTA_FLIP", "MARKUP"]

    def test_entry_and_target_phases(self):
        p = get_pattern(SLUG)
        assert p.entry_phase == "DELTA_FLIP"
        assert p.target_phase == "MARKUP"

    def test_timeframe_and_universe(self):
        p = get_pattern(SLUG)
        assert p.timeframe == "1h"
        assert p.universe_scope == "binance_dynamic"

    def test_tags(self):
        p = get_pattern(SLUG)
        assert "volume_absorption" in p.tags
        assert "cvd" in p.tags
        assert "selling_climax" in p.tags
        assert "spot_compatible" in p.tags

    def test_selling_climax_required_blocks(self):
        p = get_pattern(SLUG)
        phase = next(ph for ph in p.phases if ph.phase_id == "SELLING_CLIMAX")
        assert "volume_spike_down" in phase.required_blocks

    def test_absorption_required_blocks(self):
        p = get_pattern(SLUG)
        phase = next(ph for ph in p.phases if ph.phase_id == "ABSORPTION")
        # volume_dryup replaces absorption_signal: post-climax price is too volatile
        # for absorption_signal's flat-price gate (W-0103 CTO fix, Slice 3).
        assert "volume_dryup" in phase.required_blocks
        assert phase.phase_score_threshold == pytest.approx(0.55)

    def test_absorption_anchored_to_selling_climax(self):
        p = get_pattern(SLUG)
        phase = next(ph for ph in p.phases if ph.phase_id == "ABSORPTION")
        assert phase.anchor_from_previous_phase is True
        assert phase.anchor_phase_id == "SELLING_CLIMAX"

    def test_delta_flip_required_block(self):
        p = get_pattern(SLUG)
        phase = next(ph for ph in p.phases if ph.phase_id == "DELTA_FLIP")
        # delta_flip_var (w=3, 0.48→0.52) replaces delta_flip_positive
        # whose w=6 default is dominated by the high-volume climax bar.
        assert "delta_flip_var" in phase.required_blocks
        assert phase.phase_score_threshold == pytest.approx(0.60)

    def test_delta_flip_disqualified_by_fresh_climax(self):
        p = get_pattern(SLUG)
        phase = next(ph for ph in p.phases if ph.phase_id == "DELTA_FLIP")
        # A new selling climax invalidates the delta flip in progress.
        assert "volume_spike_down" in phase.disqualifier_blocks

    def test_markup_required_block(self):
        p = get_pattern(SLUG)
        phase = next(ph for ph in p.phases if ph.phase_id == "MARKUP")
        assert "breakout_above_high" in phase.required_blocks


class TestReferencedBlocksRegistered:
    """All blocks referenced by VAR must exist in block_evaluator."""

    @pytest.fixture(scope="class")
    def block_names(self) -> set[str]:
        return {name for name, _ in BLOCK_REGISTRY}

    def test_new_blocks_registered(self, block_names):
        # VAR-specific blocks: original detectors + VAR-tuned lambda.
        for b in ("volume_spike_down", "delta_flip_positive", "delta_flip_var"):
            assert b in block_names, f"{b!r} missing from block_evaluator"

    def test_reused_blocks_registered(self, block_names):
        for b in (
            "volume_dryup",
            "cvd_buying",
            "higher_lows_sequence",
            "breakout_above_high",
            "breakout_volume_confirm",
            "sideways_compression",
        ):
            assert b in block_names, f"{b!r} missing from block_evaluator"


class TestPhaseOrderMap:
    """live_monitor.PHASE_ORDER must include the new VAR phases."""

    def test_phase_order_entries(self):
        from research.live_monitor import PHASE_ORDER

        for phase_id in ("SELLING_CLIMAX", "ABSORPTION", "DELTA_FLIP", "MARKUP"):
            assert phase_id in PHASE_ORDER, f"{phase_id!r} missing from PHASE_ORDER"
