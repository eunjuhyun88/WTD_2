"""Tests for whale-accumulation-reversal-v1 pattern definition.

W-0097 P0.5: channel-analysis-based 3-phase pattern registration.

Validates:
  1. Pattern loads from PATTERN_LIBRARY with correct structure
  2. All 3 phases present in correct order
  3. Required blocks match channel-analysis spec:
     - WHALE_ACCUMULATION: oi_spike_with_dump + smart_money_accumulation + funding_extreme_short
     - BOTTOM_CONFIRM: higher_lows_sequence + ls_ratio_recovery (entry phase)
     - ENTRY_CONFIRM: coinbase_premium_positive + total_oi_spike (target phase)
  4. TRADOOR and FFR regression (unchanged)
  5. All referenced blocks are registered in block_evaluator
"""
from __future__ import annotations

import pytest

from patterns.library import get_pattern, PATTERN_LIBRARY
from scoring.block_evaluator import _BLOCKS as BLOCK_REGISTRY


SLUG = "whale-accumulation-reversal-v1"


class TestWhaleAccumulationReversalPattern:
    def test_pattern_registered(self):
        assert SLUG in PATTERN_LIBRARY

    def test_pattern_slug(self):
        p = get_pattern(SLUG)
        assert p.slug == SLUG

    def test_three_phases_in_order(self):
        p = get_pattern(SLUG)
        phase_ids = [ph.phase_id for ph in p.phases]
        assert phase_ids == [
            "WHALE_ACCUMULATION",
            "BOTTOM_CONFIRM",
            "ENTRY_CONFIRM",
        ]

    def test_entry_and_target_phases(self):
        p = get_pattern(SLUG)
        assert p.entry_phase == "BOTTOM_CONFIRM"
        assert p.target_phase == "ENTRY_CONFIRM"

    def test_timeframe_and_universe(self):
        p = get_pattern(SLUG)
        assert p.timeframe == "1h"
        assert p.universe_scope == "binance_dynamic"

    def test_tags(self):
        p = get_pattern(SLUG)
        assert "whale_accumulation" in p.tags
        assert "smart_money" in p.tags
        assert "onchain_confirm" in p.tags

    def test_whale_accumulation_required_blocks(self):
        p = get_pattern(SLUG)
        phase = next(ph for ph in p.phases if ph.phase_id == "WHALE_ACCUMULATION")
        # OR semantics: either cascade dump OR extreme funding triggers the phase.
        # required_blocks is empty; required_any_groups contains the OR group.
        assert phase.required_blocks == []
        assert ["oi_spike_with_dump", "funding_extreme_short"] in phase.required_any_groups
        # smart_money_accumulation is live-only (OKX API) → soft, not required.
        assert "smart_money_accumulation" in phase.soft_blocks

    def test_bottom_confirm_required_blocks(self):
        p = get_pattern(SLUG)
        phase = next(ph for ph in p.phases if ph.phase_id == "BOTTOM_CONFIRM")
        assert "higher_lows_sequence" in phase.required_blocks
        assert "ls_ratio_recovery" in phase.required_blocks
        assert phase.phase_score_threshold == pytest.approx(0.70)

    def test_bottom_confirm_anchored_to_whale_accumulation(self):
        p = get_pattern(SLUG)
        phase = next(ph for ph in p.phases if ph.phase_id == "BOTTOM_CONFIRM")
        assert phase.anchor_from_previous_phase is True
        assert phase.anchor_phase_id == "WHALE_ACCUMULATION"

    def test_bottom_confirm_disqualified_by_fresh_dump(self):
        p = get_pattern(SLUG)
        phase = next(ph for ph in p.phases if ph.phase_id == "BOTTOM_CONFIRM")
        # A new dump cascade must invalidate bottom-confirm in progress.
        assert "oi_spike_with_dump" in phase.disqualifier_blocks

    def test_entry_confirm_required_blocks(self):
        p = get_pattern(SLUG)
        phase = next(ph for ph in p.phases if ph.phase_id == "ENTRY_CONFIRM")
        # total_oi_spike (perp data) is required — historically detectable.
        assert "total_oi_spike" in phase.required_blocks
        # coinbase_premium_positive requires live coinbase_premium feature → optional.
        assert "coinbase_premium_positive" not in phase.required_blocks
        assert "coinbase_premium_positive" in phase.optional_blocks

    def test_entry_confirm_optional_divergence(self):
        p = get_pattern(SLUG)
        phase = next(ph for ph in p.phases if ph.phase_id == "ENTRY_CONFIRM")
        # Both institutional buy signal and exchange divergence are bonus confirmations.
        assert "oi_exchange_divergence" in phase.optional_blocks


class TestReferencedBlocksRegistered:
    """All blocks referenced by the pattern must exist in block_evaluator."""

    @pytest.fixture(scope="class")
    def block_names(self) -> set[str]:
        return {name for name, _ in BLOCK_REGISTRY}

    def test_whale_accumulation_blocks(self, block_names):
        for b in ("oi_spike_with_dump", "funding_extreme_short", "smart_money_accumulation"):
            assert b in block_names, f"{b!r} missing from block_evaluator"

    def test_bottom_confirm_blocks(self, block_names):
        for b in ("higher_lows_sequence", "ls_ratio_recovery", "smart_money_accumulation",
                  "volume_dryup", "bollinger_squeeze", "oi_spike_with_dump"):
            assert b in block_names, f"{b!r} missing from block_evaluator"

    def test_entry_confirm_blocks(self, block_names):
        for b in ("coinbase_premium_positive", "total_oi_spike", "oi_exchange_divergence"):
            assert b in block_names, f"{b!r} missing from block_evaluator"


class TestRegressionGuards:
    def test_tradoor_still_registered(self):
        assert "tradoor-oi-reversal-v1" in PATTERN_LIBRARY

    def test_ffr_still_registered(self):
        assert "funding-flip-reversal-v1" in PATTERN_LIBRARY

    def test_library_count(self):
        # TRADOOR + FFR + wyckoff-spring + whale-accumulation + VAR = 5 patterns registered.
        assert len(PATTERN_LIBRARY) == 5


class TestPhaseOrderMap:
    """live_monitor.PHASE_ORDER must include the new phases so ranking works."""

    def test_phase_order_entries(self):
        from research.live_monitor import PHASE_ORDER
        for phase_id in ("WHALE_ACCUMULATION", "BOTTOM_CONFIRM", "ENTRY_CONFIRM"):
            assert phase_id in PHASE_ORDER, f"{phase_id!r} missing from PHASE_ORDER"
