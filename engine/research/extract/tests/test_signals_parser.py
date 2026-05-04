"""Tests for engine.research.extract.parsers.signals"""

from __future__ import annotations

from pathlib import Path

import pytest

from research.extract.parsers.signals import (
    _extract_oi_divergence_min_pct,
    _extract_oi_surge_zscore,
    _extract_range_resistance_threshold,
    build_signal_specs_yaml_dict,
    extract_signal_specs,
)


class TestExtractRangeResistanceThreshold:
    def test_extracts_pct(self):
        signals = [
            {"signal_name": "range_resistance_touch", "detail": "Price 80000 within 0.9% of 56d high 80762"},
            {"signal_name": "range_resistance_touch", "detail": "Price 50000 within 1.2% of 56d high 50605"},
        ]
        result = _extract_range_resistance_threshold(signals)
        assert result == 1.2  # max

    def test_returns_none_when_no_signals(self):
        result = _extract_range_resistance_threshold([])
        assert result is None

    def test_ignores_unrelated_signals(self):
        signals = [{"signal_name": "vwap_reclaim", "detail": "some detail"}]
        result = _extract_range_resistance_threshold(signals)
        assert result is None


class TestExtractOiSurgeZscore:
    def test_extracts_min_zscore(self):
        signals = [
            {"signal_name": "oi_surge", "detail": "OI surged 0.2% in 4h ($1M; z=2.0)"},
            {"signal_name": "oi_surge", "detail": "OI surged 0.5% in 4h ($2M; z=3.5)"},
        ]
        result = _extract_oi_surge_zscore(signals)
        assert result == 2.0  # min = threshold

    def test_returns_none_when_no_signals(self):
        assert _extract_oi_surge_zscore([]) is None


class TestExtractOiDivergenceMinPct:
    def test_extracts_min_absolute_pct(self):
        signals = [
            {"signal_name": "oi_divergence_bullish", "value": -3.5},
            {"signal_name": "oi_divergence_bearish", "value": -2.0},
        ]
        result = _extract_oi_divergence_min_pct(signals)
        assert result == 2.0  # min absolute

    def test_returns_none_when_no_signals(self):
        assert _extract_oi_divergence_min_pct([]) is None


class TestExtractSignalSpecs:
    def test_returns_7_signals(self, minimal_dump_dir: Path):
        specs = extract_signal_specs(minimal_dump_dir)
        assert len(specs) == 7

    def test_all_conditions_populated(self, minimal_dump_dir: Path):
        specs = extract_signal_specs(minimal_dump_dir)
        for spec in specs:
            assert spec.get("condition") is not None, f"condition is None for {spec['name']}"
            cond = spec["condition"]
            assert cond.get("type") is not None, f"condition.type is None for {spec['name']}"

    def test_signal_names_are_canonical(self, minimal_dump_dir: Path):
        from research.extract.parsers.signals import _CANONICAL_SPECS
        specs = extract_signal_specs(minimal_dump_dir)
        spec_names = {s["name"] for s in specs}
        canonical_names = {s["name"] for s in _CANONICAL_SPECS}
        assert spec_names == canonical_names

    def test_build_yaml_dict_has_version(self, minimal_dump_dir: Path):
        result = build_signal_specs_yaml_dict(minimal_dump_dir)
        assert result["version"] == 1
        assert "captured_at" in result
        assert len(result["signals"]) == 7

    def test_range_resistance_threshold_enriched(self, minimal_dump_dir: Path):
        specs = extract_signal_specs(minimal_dump_dir)
        rr = next(s for s in specs if s["name"] == "range_resistance")
        # Should have been enriched from fixture data (0.9%)
        assert rr["condition"]["threshold_pct"] is not None

    def test_oi_surge_zscore_enriched(self, minimal_dump_dir: Path):
        specs = extract_signal_specs(minimal_dump_dir)
        oi = next(s for s in specs if s["name"] == "oi_surge")
        assert oi["condition"]["threshold"] is not None
        assert isinstance(oi["condition"]["threshold"], (int, float))
