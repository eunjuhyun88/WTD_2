"""Tests for engine.research.extract.parsers.buckets"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest

from research.extract.parsers.buckets import (
    _beta_posterior,
    _bin_regime,
    _bin_risk_pct,
    _bin_slot_util,
    _bin_tier2,
    _get_dominant_signal,
    _is_win,
    extract_bucket_priors,
)


class TestBinFunctions:
    def test_bin_tier2_low(self):
        assert _bin_tier2(0.5) == "[0,1]"

    def test_bin_tier2_mid(self):
        assert _bin_tier2(3.0) == "[2,5]"

    def test_bin_tier2_high(self):
        assert _bin_tier2(7.0) == "[6,inf)"

    def test_bin_tier2_none_defaults_to_mid(self):
        assert _bin_tier2(None) == "[2,5]"

    def test_bin_regime_up(self):
        assert _bin_regime("bullish") == "up"
        assert _bin_regime("uptrend") == "up"

    def test_bin_regime_sideways(self):
        assert _bin_regime("range") == "sideways"
        assert _bin_regime("neutral") == "sideways"

    def test_bin_regime_down(self):
        assert _bin_regime("bearish") == "down"
        assert _bin_regime("downtrend") == "down"

    def test_bin_regime_none(self):
        assert _bin_regime(None) == "sideways"

    def test_bin_slot_util_low(self):
        assert _bin_slot_util(0.1) == "low"

    def test_bin_slot_util_mid(self):
        assert _bin_slot_util(0.5) == "mid"

    def test_bin_slot_util_high(self):
        assert _bin_slot_util(0.8) == "high"

    def test_bin_risk_pct_small(self):
        assert _bin_risk_pct(0.5) == "small"

    def test_bin_risk_pct_mid(self):
        assert _bin_risk_pct(1.5) == "mid"

    def test_bin_risk_pct_large(self):
        assert _bin_risk_pct(3.0) == "large"


class TestBetaPosterior:
    def test_wins_only(self):
        alpha, beta_val, mean, std = _beta_posterior(10, 0)
        assert alpha == 11
        assert beta_val == 1
        assert mean > 0.9

    def test_equal_wins_losses(self):
        alpha, beta_val, mean, std = _beta_posterior(5, 5)
        assert abs(mean - 0.5) < 0.01

    def test_no_data_uninformative(self):
        alpha, beta_val, mean, std = _beta_posterior(0, 0)
        assert alpha == 1
        assert beta_val == 1
        assert abs(mean - 0.5) < 0.01  # Beta(1,1) = Uniform


class TestIsWin:
    def test_tp3_is_win(self):
        assert _is_win({"exit_reason": "tp3"}) is True

    def test_tp1_is_win(self):
        assert _is_win({"exit_reason": "tp1"}) is True

    def test_stop_is_loss(self):
        assert _is_win({"exit_reason": "stop"}) is False

    def test_timeout_is_loss(self):
        assert _is_win({"exit_reason": "timeout"}) is False

    def test_pnl_positive_is_win(self):
        assert _is_win({"exit_reason": "", "pnl_pct": 1.5}) is True

    def test_pnl_negative_is_loss(self):
        assert _is_win({"exit_reason": "", "pnl_pct": -1.5}) is False


class TestGetDominantSignal:
    def test_from_entry_meta_json(self):
        import json
        trade = {"entry_meta_json": json.dumps({"dominant_signal_name": "vwap_reclaim"})}
        assert _get_dominant_signal(trade) == "vwap_reclaim"

    def test_canonical_mapping_applied(self):
        import json
        trade = {"entry_meta_json": json.dumps({"dominant_signal_name": "range_resistance_touch"})}
        assert _get_dominant_signal(trade) == "range_resistance"

    def test_fallback_to_window_signals(self):
        import json
        trade = {
            "entry_meta_json": None,
            "window_signals_json": json.dumps([{"name": "oi_surge", "tier": 1}]),
        }
        assert _get_dominant_signal(trade) == "oi_surge"

    def test_default_on_empty(self):
        assert _get_dominant_signal({}) == "vwap_reclaim"


class TestExtractBucketPriors:
    def test_returns_dataframe(self, minimal_dump_dir: Path):
        df = extract_bucket_priors(minimal_dump_dir)
        assert isinstance(df, pd.DataFrame)

    def test_has_required_columns(self, minimal_dump_dir: Path):
        df = extract_bucket_priors(minimal_dump_dir)
        required = [
            "signal_type", "tier2_bin", "regime_bin", "slot_util_bin", "risk_pct_bin",
            "n", "wins", "losses", "posterior_alpha", "posterior_beta",
            "posterior_mean", "posterior_std", "avg_pnl", "avg_holding_h",
            "stop_rate", "tp3_rate",
        ]
        for col in required:
            assert col in df.columns, f"Missing column: {col}"

    def test_posterior_mean_in_01(self, minimal_dump_dir: Path):
        df = extract_bucket_priors(minimal_dump_dir)
        if not df.empty:
            assert (df["posterior_mean"] >= 0).all()
            assert (df["posterior_mean"] <= 1).all()

    def test_wins_plus_losses_eq_n(self, minimal_dump_dir: Path):
        df = extract_bucket_priors(minimal_dump_dir)
        if not df.empty:
            assert ((df["wins"] + df["losses"]) == df["n"]).all()

    def test_nonempty_from_fixture(self, minimal_dump_dir: Path):
        df = extract_bucket_priors(minimal_dump_dir)
        assert len(df) > 0, "Expected at least 1 bucket cell from fixture trades"
