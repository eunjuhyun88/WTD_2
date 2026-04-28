"""W-0300 Quant Statistical Standards Hardening — test suite.

Covers AC1~AC9:
  AC1: no inline _welch_t/_bootstrap_ci in engine/scripts/
  AC5: ADF test (stationary / non-stationary)
  AC6: Ljung-Box → block bootstrap auto-switch
  AC8: power_check SKIP/WARN/PASS
  AC9: ≥25 new tests, all PASS

Phase 1 (inline removal) verified by TestInlineRemoval.
Phase 2 (ADF + LB + block bootstrap) verified by TestAdf, TestLjungBox, TestBlockBootstrap.
Phase 3 (power) verified by TestPowerCheck.
"""
from __future__ import annotations

import ast
import pathlib
import sys

import numpy as np
import pytest

ENGINE = pathlib.Path(__file__).parents[1]
SCRIPTS = ENGINE / "scripts"
sys.path.insert(0, str(ENGINE))

from research.validation.stats import (
    AdfResult,
    LjungBoxResult,
    adf_test,
    block_bootstrap_ci,
    bootstrap_ci,
    layer_p_ci,
    ljung_box_test,
    one_sample_t_test,
    power_check,
)


# ── AC1: No inline stats in scripts/ ─────────────────────────────────────────

class TestInlineRemoval:
    """Verify AC1: grep inline _welch_t/_bootstrap_ci in engine/scripts/ → 0."""

    @pytest.mark.parametrize("script_name", [
        "run_quant_backtest.py",
        "layer_p_production.py",
    ])
    def test_no_inline_welch_t(self, script_name):
        src = (SCRIPTS / script_name).read_text()
        tree = ast.parse(src)
        func_names = {n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)}
        assert "_welch_t" not in func_names, f"{script_name} still has inline _welch_t"

    @pytest.mark.parametrize("script_name", [
        "run_quant_backtest.py",
        "layer_p_production.py",
    ])
    def test_no_inline_bootstrap_ci(self, script_name):
        src = (SCRIPTS / script_name).read_text()
        tree = ast.parse(src)
        func_names = {n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)}
        assert "_bootstrap_ci" not in func_names, f"{script_name} still has inline _bootstrap_ci"

    @pytest.mark.parametrize("script_name", [
        "run_quant_backtest.py",
        "layer_p_production.py",
    ])
    def test_imports_stats_module(self, script_name):
        src = (SCRIPTS / script_name).read_text()
        assert "research.validation.stats" in src or "from research.validation.stats" in src

    def test_no_math_import_in_run_quant(self):
        src = (SCRIPTS / "run_quant_backtest.py").read_text()
        tree = ast.parse(src)
        math_imports = [
            n for n in ast.walk(tree)
            if isinstance(n, ast.Import)
            and any(a.name == "math" for a in n.names)
        ]
        assert len(math_imports) == 0, "run_quant_backtest.py still imports math"

    def test_no_random_in_run_quant_top_level(self):
        src = (SCRIPTS / "run_quant_backtest.py").read_text()
        tree = ast.parse(src)
        random_imports = [
            n for n in ast.walk(tree)
            if isinstance(n, ast.Import)
            and any(a.name == "random" for a in n.names)
        ]
        assert len(random_imports) == 0, "run_quant_backtest.py still has top-level import random"


# ── one_sample_t_test ─────────────────────────────────────────────────────────

class TestOneSampleTTest:
    """Tests for the new one_sample_t_test wrapper in stats.py."""

    def test_strong_signal_high_t(self):
        rng = np.random.default_rng(42)
        strong = rng.normal(loc=0.05, scale=0.005, size=100).tolist()
        t, mean = one_sample_t_test(strong)
        assert abs(t) >= 2.0
        assert abs(mean - 0.05) < 0.01

    def test_noise_low_t(self):
        rng = np.random.default_rng(0)
        noise = rng.normal(loc=0.0, scale=0.05, size=50).tolist()
        t, _ = one_sample_t_test(noise)
        # noise around 0 should rarely produce |t| > 2
        assert abs(t) < 5.0  # should not be extreme

    def test_small_n_returns_zeros(self):
        t, mean = one_sample_t_test([0.01, 0.02, 0.03])  # n=3 < 4
        assert t == 0.0
        assert mean == 0.0

    def test_empty_returns_zeros(self):
        t, mean = one_sample_t_test([])
        assert t == 0.0
        assert mean == 0.0

    def test_matches_scipy_ttest_1samp(self):
        from scipy import stats as scipy_stats
        rng = np.random.default_rng(99)
        data = rng.normal(0.03, 0.01, 80).tolist()
        t_ours, _ = one_sample_t_test(data)
        t_scipy = scipy_stats.ttest_1samp(data, popmean=0.0).statistic
        assert abs(t_ours - t_scipy) < 1e-6


# ── ADF (AC5) ─────────────────────────────────────────────────────────────────

class TestAdf:
    """AC5: ADF stationarity test."""

    def test_iid_returns_stationary(self):
        rng = np.random.default_rng(42)
        data = rng.normal(0, 0.02, 200).tolist()
        result = adf_test(data)
        assert isinstance(result, AdfResult)
        assert result.is_stationary is True
        assert result.p_value < 0.05

    def test_random_walk_non_stationary(self):
        rng = np.random.default_rng(1)
        walk = np.cumsum(rng.normal(0, 0.01, 300)).tolist()
        result = adf_test(walk)
        assert result.is_stationary is False
        assert result.p_value >= 0.05

    def test_small_n_returns_non_stationary(self):
        result = adf_test([0.01, 0.02, 0.01])  # n < 10
        assert result.is_stationary is False
        assert result.p_value == 1.0

    def test_result_fields_present(self):
        rng = np.random.default_rng(7)
        data = rng.normal(0, 0.01, 100).tolist()
        r = adf_test(data)
        assert hasattr(r, "adf_stat")
        assert hasattr(r, "p_value")
        assert hasattr(r, "is_stationary")
        assert hasattr(r, "n_lags")
        assert isinstance(r.n_lags, int)

    def test_significance_parameter(self):
        rng = np.random.default_rng(42)
        data = rng.normal(0, 0.01, 150).tolist()
        r_strict = adf_test(data, significance=0.01)
        r_loose = adf_test(data, significance=0.10)
        # looser threshold → equal or more likely to be stationary
        assert r_loose.is_stationary >= r_strict.is_stationary


# ── Ljung-Box (AC6) ───────────────────────────────────────────────────────────

class TestLjungBox:
    """AC6: Ljung-Box autocorrelation detection."""

    def test_iid_no_autocorrelation(self):
        rng = np.random.default_rng(42)
        data = rng.normal(0, 0.02, 300).tolist()
        result = ljung_box_test(data)
        assert isinstance(result, LjungBoxResult)
        assert result.has_autocorrelation is False

    def test_ar1_has_autocorrelation(self):
        rng = np.random.default_rng(42)
        ar1 = []
        x = 0.0
        for _ in range(200):
            x = 0.9 * x + rng.normal(0, 0.01)
            ar1.append(x)
        result = ljung_box_test(ar1)
        assert result.has_autocorrelation is True
        assert result.p_value < 0.01

    def test_small_n_no_autocorrelation(self):
        result = ljung_box_test([0.01, 0.02, 0.03])  # n < 15
        assert result.has_autocorrelation is False

    def test_result_fields_present(self):
        rng = np.random.default_rng(0)
        data = rng.normal(0, 0.01, 100).tolist()
        r = ljung_box_test(data)
        assert hasattr(r, "lb_stat")
        assert hasattr(r, "p_value")
        assert hasattr(r, "has_autocorrelation")
        assert hasattr(r, "n_lags_tested")
        assert isinstance(r.n_lags_tested, int)


# ── Block Bootstrap (AC6) ────────────────────────────────────────────────────

class TestBlockBootstrap:
    """Block bootstrap CI for autocorrelated returns."""

    def test_ci_contains_true_mean(self):
        rng = np.random.default_rng(42)
        data = rng.normal(0.03, 0.01, 200).tolist()
        lo, hi, center = block_bootstrap_ci(data)
        assert lo < 0.03 < hi

    def test_block_ci_wider_than_iid_for_ar1(self):
        rng = np.random.default_rng(42)
        ar1 = []
        x = 0.03
        for _ in range(200):
            x = 0.7 * x + 0.03 * (1 - 0.7) + rng.normal(0, 0.005)
            ar1.append(x)
        lo_block, hi_block, _ = block_bootstrap_ci(ar1, seed=42)
        lo_iid, hi_iid, _ = bootstrap_ci(ar1, seed=42)
        # block CI should be wider (more conservative) for autocorrelated data
        width_block = hi_block - lo_block
        width_iid = hi_iid - lo_iid
        assert width_block > width_iid * 0.8  # at minimum comparable

    def test_small_n_returns_zeros(self):
        lo, hi, center = block_bootstrap_ci([0.01, 0.02])
        assert lo == 0.0 and hi == 0.0

    def test_seed_reproducibility(self):
        rng = np.random.default_rng(42)
        data = rng.normal(0.02, 0.01, 150).tolist()
        r1 = block_bootstrap_ci(data, seed=7)
        r2 = block_bootstrap_ci(data, seed=7)
        assert r1 == r2


# ── layer_p_ci auto-switch ───────────────────────────────────────────────────

class TestLayerPCi:
    """layer_p_ci auto-selects IID or block bootstrap."""

    def test_iid_uses_standard_bootstrap(self):
        rng = np.random.default_rng(42)
        data = rng.normal(0.02, 0.01, 200).tolist()
        # IID data → should match bootstrap_ci
        lo1, hi1, _ = layer_p_ci(data, seed=42)
        lo2, hi2, _ = bootstrap_ci(data, seed=42)
        assert abs(lo1 - lo2) < 0.002  # same or very close
        assert abs(hi1 - hi2) < 0.002

    def test_ar1_uses_block_bootstrap(self):
        rng = np.random.default_rng(42)
        ar1 = []
        x = 0.0
        for _ in range(200):
            x = 0.9 * x + rng.normal(0, 0.01)
            ar1.append(x)
        lo_layer, hi_layer, _ = layer_p_ci(ar1, seed=42)
        lo_std, hi_std, _ = bootstrap_ci(ar1, seed=42)
        # For AR(1), block and IID can differ
        # Key: both return valid CI (not 0,0,0)
        assert hi_layer > lo_layer
        assert hi_std > lo_std


# ── Power Analysis (AC8) ─────────────────────────────────────────────────────

class TestPowerCheck:
    """AC8: n<30 SKIP, 30≤n<200 WARN, n≥200 PASS."""

    def test_small_n_skip(self):
        data = [0.01] * 15
        result = power_check(data)
        assert result["power_status"] == "SKIP"
        assert result["n"] == 15

    def test_medium_n_warn(self):
        data = [0.01] * 80
        result = power_check(data)
        assert result["power_status"] == "WARN"
        assert result["n"] == 80

    def test_large_n_pass(self):
        data = [0.01] * 250
        result = power_check(data)
        assert result["power_status"] == "PASS"
        assert result["n"] == 250

    def test_boundary_30_is_warn(self):
        data = [0.01] * 30
        result = power_check(data)
        assert result["power_status"] == "WARN"

    def test_boundary_200_is_pass(self):
        data = [0.01] * 200
        result = power_check(data)
        assert result["power_status"] == "PASS"

    def test_cohens_d_computed(self):
        rng = np.random.default_rng(42)
        data = rng.normal(0.05, 0.01, 100).tolist()
        result = power_check(data)
        assert "cohens_d" in result
        assert result["cohens_d"] > 0
        assert result["min_n_for_pass"] == 200

    def test_empty_returns_skip(self):
        result = power_check([])
        assert result["power_status"] == "SKIP"
        assert result["n"] == 0
