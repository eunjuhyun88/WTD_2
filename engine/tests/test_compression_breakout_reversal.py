"""Tests for compression-breakout-reversal-v1 pattern (CBR).

W-0104: 6th pattern — Compression Breakout Reversal.
Post-decline price coiling → range upper breakout. Pure OHLCV, spot-compatible.

Validates:
  1. Pattern in PATTERN_LIBRARY with correct slug / phases
  2. Phase structure: SETUP → COILING (entry) → BREAKOUT (target)
  3. Required blocks per phase
  4. CBR lambda blocks registered in block_evaluator
  5. Promotion gate: all 6 strict-path metrics pass
  6. live_monitor includes CBR in PROMOTED_PATTERNS
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from patterns.library import PATTERN_LIBRARY, get_pattern
from scoring.block_evaluator import _BLOCKS as BLOCK_REGISTRY

SLUG = "compression-breakout-reversal-v1"
PACK_PATH = (
    Path(__file__).parent.parent
    / "research/pattern_search/benchmark_packs/compression-breakout-reversal-v1__cbr-v1.json"
)


class TestCompressionBreakoutReversalPattern:

    def test_pattern_registered(self):
        assert SLUG in PATTERN_LIBRARY

    def test_pattern_slug(self):
        assert get_pattern(SLUG).slug == SLUG

    def test_three_phases_in_order(self):
        p = get_pattern(SLUG)
        phase_ids = [ph.phase_id for ph in p.phases]
        assert phase_ids == ["SETUP", "COILING", "BREAKOUT"]

    def test_entry_and_target_phases(self):
        p = get_pattern(SLUG)
        assert p.entry_phase == "BREAKOUT"
        assert p.target_phase == "BREAKOUT"

    def test_timeframe_and_universe(self):
        p = get_pattern(SLUG)
        assert p.timeframe == "1h"
        assert p.universe_scope == "binance_dynamic"

    def test_tags(self):
        p = get_pattern(SLUG)
        assert "spot_compatible" in p.tags
        assert "compression" in p.tags
        assert "breakout" in p.tags

    def test_setup_required_blocks(self):
        p = get_pattern(SLUG)
        phase = next(ph for ph in p.phases if ph.phase_id == "SETUP")
        assert "recent_decline" in phase.required_blocks

    def test_coiling_required_blocks(self):
        p = get_pattern(SLUG)
        phase = next(ph for ph in p.phases if ph.phase_id == "COILING")
        assert "sideways_compression_cbr" in phase.required_blocks
        assert "volume_dryup" in phase.optional_blocks
        assert "bollinger_squeeze" in phase.optional_blocks

    def test_coiling_phase_score_threshold(self):
        p = get_pattern(SLUG)
        phase = next(ph for ph in p.phases if ph.phase_id == "COILING")
        assert phase.phase_score_threshold == pytest.approx(0.55)

    def test_coiling_anchored_to_setup(self):
        p = get_pattern(SLUG)
        phase = next(ph for ph in p.phases if ph.phase_id == "COILING")
        assert phase.anchor_from_previous_phase is True
        assert phase.anchor_phase_id == "SETUP"

    def test_coiling_min_bars(self):
        p = get_pattern(SLUG)
        phase = next(ph for ph in p.phases if ph.phase_id == "COILING")
        assert phase.min_bars >= 6

    def test_breakout_required_blocks(self):
        p = get_pattern(SLUG)
        phase = next(ph for ph in p.phases if ph.phase_id == "BREAKOUT")
        assert "consolidation_breakout_cbr" in phase.required_blocks


class TestCBRBlocksRegistered:
    """CBR lambda blocks must appear in the block evaluator registry."""

    def _block_names(self):
        return {name for name, _ in BLOCK_REGISTRY}

    def test_sideways_compression_cbr_registered(self):
        assert "sideways_compression_cbr" in self._block_names()

    def test_consolidation_breakout_cbr_registered(self):
        assert "consolidation_breakout_cbr" in self._block_names()

    def test_recent_decline_registered(self):
        assert "recent_decline" in self._block_names()

    def test_volume_dryup_registered(self):
        assert "volume_dryup" in self._block_names()


class TestCBRBenchmarkPack:
    """Benchmark pack JSON is valid and has expected structure."""

    def test_pack_exists(self):
        assert PACK_PATH.exists(), f"Benchmark pack not found: {PACK_PATH}"

    def test_pack_has_four_cases(self):
        data = json.loads(PACK_PATH.read_text())
        assert len(data["cases"]) == 4

    def test_pack_has_reference_case(self):
        data = json.loads(PACK_PATH.read_text())
        roles = [c["role"] for c in data["cases"]]
        assert "reference" in roles

    def test_pack_has_three_holdouts(self):
        data = json.loads(PACK_PATH.read_text())
        holdouts = [c for c in data["cases"] if c["role"] == "holdout"]
        assert len(holdouts) == 3

    def test_all_cases_have_full_phase_path(self):
        data = json.loads(PACK_PATH.read_text())
        for case in data["cases"]:
            assert case["expected_phase_path"] == ["SETUP", "COILING", "BREAKOUT"]


@pytest.mark.skipif(
    not Path("engine/data_cache/cache/ALTUSDT_1h.csv").exists(),
    reason="ALTUSDT_1h klines cache not available (offline-only test)"
)
def test_cbr_promotion_gate():
    """Full promotion gate: all 6 strict-path metrics must pass."""
    from research.pattern_search import (
        ReplayBenchmarkPack,
        PatternVariantSpec,
        evaluate_variant_against_pack,
        build_promotion_report,
    )

    pack = ReplayBenchmarkPack.from_dict(json.loads(PACK_PATH.read_text()))
    variant = PatternVariantSpec(
        pattern_slug=SLUG,
        variant_slug="compression-breakout-reversal-v1__cbr-v1",
        timeframe="1h",
    )
    result = evaluate_variant_against_pack(pack, variant, warmup_bars=240)
    report = build_promotion_report(SLUG, result)

    assert report.reference_recall >= 0.5,  f"reference_recall={report.reference_recall}"
    assert report.phase_fidelity >= 0.5,    f"phase_fidelity={report.phase_fidelity}"
    assert report.lead_time_bars >= 0,      f"lead_time_bars={report.lead_time_bars}"
    assert report.false_discovery_rate <= 0.4, f"FDR={report.false_discovery_rate}"
    assert report.robustness_spread <= 0.3, f"robustness_spread={report.robustness_spread}"
    assert (report.holdout_passed or 0.0) >= 1.0, f"holdout_passed={report.holdout_passed}"
    assert report.decision == "promote_candidate", f"decision={report.decision}"


def test_cbr_in_promoted_patterns():
    """CBR must appear in live_monitor.PROMOTED_PATTERNS."""
    from research.live_monitor import PROMOTED_PATTERNS
    slugs = {slug for slug, _, _ in PROMOTED_PATTERNS}
    assert SLUG in slugs
