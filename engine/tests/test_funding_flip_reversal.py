"""Tests for funding-flip-reversal-v1 pattern definition and registry.

Validates:
  1. Pattern loads from PATTERN_LIBRARY with correct structure
  2. All 5 phases present in correct order
  3. TRADOOR pattern is unaffected (regression)
  4. funding_extreme_short alias is registered in block_evaluator
  5. scan_all_patterns_live() exposes both patterns (smoke test)
"""
from __future__ import annotations

import pytest

from patterns.library import get_pattern, PATTERN_LIBRARY
from research.live_monitor import PROMOTED_PATTERNS, scan_all_patterns_live
from scoring.block_evaluator import _BLOCKS as BLOCK_REGISTRY


class TestFundingFlipReversalPattern:
    def test_pattern_registered(self):
        assert "funding-flip-reversal-v1" in PATTERN_LIBRARY

    def test_pattern_slug(self):
        p = get_pattern("funding-flip-reversal-v1")
        assert p.slug == "funding-flip-reversal-v1"

    def test_five_phases_in_order(self):
        p = get_pattern("funding-flip-reversal-v1")
        phase_ids = [ph.phase_id for ph in p.phases]
        assert phase_ids == [
            "SHORT_OVERHEAT",
            "COMPRESSION",
            "FLIP_SIGNAL",
            "ENTRY_ZONE",
            "SQUEEZE",
        ]

    def test_entry_and_target_phases(self):
        p = get_pattern("funding-flip-reversal-v1")
        assert p.entry_phase == "ENTRY_ZONE"
        assert p.target_phase == "SQUEEZE"

    def test_timeframe_and_universe(self):
        p = get_pattern("funding-flip-reversal-v1")
        assert p.timeframe == "1h"
        assert p.universe_scope == "binance_dynamic"

    def test_tags(self):
        p = get_pattern("funding-flip-reversal-v1")
        assert "funding_reversal" in p.tags
        assert "short_squeeze" in p.tags

    def test_flip_signal_required_blocks(self):
        p = get_pattern("funding-flip-reversal-v1")
        flip = next(ph for ph in p.phases if ph.phase_id == "FLIP_SIGNAL")
        assert "funding_flip" in flip.required_blocks
        assert "oi_expansion_confirm" in flip.required_blocks

    def test_entry_zone_required_blocks(self):
        p = get_pattern("funding-flip-reversal-v1")
        ez = next(ph for ph in p.phases if ph.phase_id == "ENTRY_ZONE")
        assert "higher_lows_sequence" in ez.required_blocks
        assert ez.phase_score_threshold == pytest.approx(0.70)

    def test_squeeze_required_blocks(self):
        p = get_pattern("funding-flip-reversal-v1")
        sq = next(ph for ph in p.phases if ph.phase_id == "SQUEEZE")
        assert "breakout_from_pullback_range" in sq.required_blocks
        assert "oi_expansion_confirm" in sq.required_blocks


class TestFundingExtremeShortAlias:
    def test_alias_registered(self):
        block_names = [name for name, _ in BLOCK_REGISTRY]
        assert "funding_extreme_short" in block_names


class TestTradoorRegressionGuard:
    def test_tradoor_still_registered(self):
        assert "tradoor-oi-reversal-v1" in PATTERN_LIBRARY

    def test_tradoor_five_phases(self):
        p = get_pattern("tradoor-oi-reversal-v1")
        phase_ids = [ph.phase_id for ph in p.phases]
        assert phase_ids == [
            "FAKE_DUMP",
            "ARCH_ZONE",
            "REAL_DUMP",
            "ACCUMULATION",
            "BREAKOUT",
        ]

    def test_tradoor_entry_target(self):
        p = get_pattern("tradoor-oi-reversal-v1")
        assert p.entry_phase == "ACCUMULATION"
        assert p.target_phase == "BREAKOUT"


class TestPromotedPatternsRegistry:
    def test_both_patterns_in_registry(self):
        slugs = [pat_slug for pat_slug, _, _ in PROMOTED_PATTERNS]
        assert "tradoor-oi-reversal-v1" in slugs
        assert "funding-flip-reversal-v1" in slugs

    def test_ffr_watch_phases(self):
        ffr = next(
            (wp for pat_slug, _, wp in PROMOTED_PATTERNS if pat_slug == "funding-flip-reversal-v1"),
            None,
        )
        assert ffr is not None
        assert "ENTRY_ZONE" in ffr
        assert "FLIP_SIGNAL" in ffr

    def test_scan_all_patterns_live_returns_list(self):
        # Smoke test: scan with a minimal universe. Uses offline=True cache only,
        # so results may be empty if cache is not available, but the call must not raise.
        results = scan_all_patterns_live(
            universe=["TRADOORUSDT"],
            window_bars=24,
            staleness_hours=72,
            warmup_bars=48,
            log_to_experiment=False,
        )
        assert isinstance(results, list)
        # Each result must have a pattern_slug field
        for r in results:
            assert r.pattern_slug in {"tradoor-oi-reversal-v1", "funding-flip-reversal-v1", "wyckoff-spring-reversal-v1"}
