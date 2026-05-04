"""Tests for engine.research.extract.parsers.gates"""

from __future__ import annotations

from pathlib import Path

import pytest

from research.extract.parsers.gates import (
    build_gate_specs_yaml_dict,
    extract_gate_specs,
)


class TestExtractGateSpecs:
    def test_returns_4_gates(self, minimal_dump_dir: Path):
        gates = extract_gate_specs(minimal_dump_dir)
        assert set(gates.keys()) == {
            "G1_tier2_score",
            "G2_regime_penalty",
            "G3_portfolio_capacity",
            "G4_position_sizing",
        }

    def test_g1_has_3_bins(self, minimal_dump_dir: Path):
        gates = extract_gate_specs(minimal_dump_dir)
        g1 = gates["G1_tier2_score"]
        bins = g1.get("bins", {})
        assert "[0,1]" in bins, f"[0,1] not in bins: {list(bins.keys())}"
        assert "[2,5]" in bins, f"[2,5] not in bins: {list(bins.keys())}"
        assert "[6,inf)" in bins, f"[6,inf) not in bins: {list(bins.keys())}"

    def test_g1_bins_have_required_fields(self, minimal_dump_dir: Path):
        gates = extract_gate_specs(minimal_dump_dir)
        g1_bins = gates["G1_tier2_score"]["bins"]
        for bin_name, bin_data in g1_bins.items():
            assert "observed_n" in bin_data, f"observed_n missing in {bin_name}"
            assert "accept_rate" in bin_data, f"accept_rate missing in {bin_name}"
            assert "stop_rate" in bin_data, f"stop_rate missing in {bin_name}"

    def test_g3_has_slot_util_bins(self, minimal_dump_dir: Path):
        gates = extract_gate_specs(minimal_dump_dir)
        g3 = gates["G3_portfolio_capacity"]
        slot_bins = g3.get("slot_util_bins", {})
        assert "[0,33]" in slot_bins, f"[0,33] not in slot_util_bins"
        assert "[34,66]" in slot_bins, f"[34,66] not in slot_util_bins"
        assert "[67,99]" in slot_bins, f"[67,99] not in slot_util_bins"

    def test_g3_slot_bins_have_accept_rate(self, minimal_dump_dir: Path):
        gates = extract_gate_specs(minimal_dump_dir)
        g3_bins = gates["G3_portfolio_capacity"]["slot_util_bins"]
        for bin_name, bin_data in g3_bins.items():
            assert "accept_rate" in bin_data, f"accept_rate missing in {bin_name}"
            ar = bin_data["accept_rate"]
            assert 0.0 <= ar <= 1.0, f"accept_rate={ar} out of range in {bin_name}"

    def test_g3_accept_rates_decrease_with_utilization(self, minimal_dump_dir: Path):
        """Higher slot utilization should have lower accept_rate."""
        gates = extract_gate_specs(minimal_dump_dir)
        g3_bins = gates["G3_portfolio_capacity"]["slot_util_bins"]
        low_ar = g3_bins["[0,33]"]["accept_rate"]
        high_ar = g3_bins["[67,99]"]["accept_rate"]
        assert low_ar > high_ar, f"Expected low_ar ({low_ar}) > high_ar ({high_ar})"

    def test_build_yaml_dict_has_version(self, minimal_dump_dir: Path):
        result = build_gate_specs_yaml_dict(minimal_dump_dir)
        assert result["version"] == 1
        assert "gates" in result
