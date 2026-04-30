"""Tests for W-0342: _inject_ob_depth wires ob_bid_usd/ob_ask_usd into features.

Verifies:
1. Happy path: fetch succeeds → last bar has real ob_bid/ask values
2. Fallback: fetch fails → last bar gets 0.0 defaults
3. Historical bars are unaffected (only last bar is set)
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest


def _make_features(n: int = 10) -> pd.DataFrame:
    idx = pd.date_range("2026-01-01", periods=n, freq="h", tz="UTC")
    return pd.DataFrame({"close": np.full(n, 100.0)}, index=idx)


class TestInjectObDepth:
    def test_injects_real_values_when_fetch_succeeds(self, monkeypatch):
        from scanner.jobs.universe_scan import _inject_ob_depth

        monkeypatch.setattr(
            "scanner.jobs.universe_scan.fetch_orderbook_depth5",
            lambda symbol, perp=True: (500_000.0, 200_000.0),
        )
        df = _make_features(10)
        _inject_ob_depth(df, "BTCUSDT")
        assert df.iloc[-1]["ob_bid_usd"] == 500_000.0
        assert df.iloc[-1]["ob_ask_usd"] == 200_000.0

    def test_injects_zeros_when_fetch_returns_none(self, monkeypatch):
        from scanner.jobs.universe_scan import _inject_ob_depth

        monkeypatch.setattr(
            "scanner.jobs.universe_scan.fetch_orderbook_depth5",
            lambda symbol, perp=True: None,
        )
        df = _make_features(10)
        _inject_ob_depth(df, "XYZUSDT")
        assert df.iloc[-1]["ob_bid_usd"] == 0.0
        assert df.iloc[-1]["ob_ask_usd"] == 0.0

    def test_injects_zeros_when_fetch_raises(self, monkeypatch):
        from scanner.jobs.universe_scan import _inject_ob_depth

        def _raise(*args, **kwargs):
            raise RuntimeError("network error")

        monkeypatch.setattr(
            "scanner.jobs.universe_scan.fetch_orderbook_depth5",
            _raise,
        )
        df = _make_features(5)
        _inject_ob_depth(df, "ETHUSDT")
        assert df.iloc[-1]["ob_bid_usd"] == 0.0
        assert df.iloc[-1]["ob_ask_usd"] == 0.0

    def test_only_last_bar_is_modified(self, monkeypatch):
        from scanner.jobs.universe_scan import _inject_ob_depth

        monkeypatch.setattr(
            "scanner.jobs.universe_scan.fetch_orderbook_depth5",
            lambda symbol, perp=True: (999.0, 111.0),
        )
        df = _make_features(8)
        # No ob columns before injection
        assert "ob_bid_usd" not in df.columns
        _inject_ob_depth(df, "BTCUSDT")
        # Only last bar set — all prior bars are NaN (not filled)
        assert pd.isna(df["ob_bid_usd"].iloc[:-1]).all()
        assert df.iloc[-1]["ob_bid_usd"] == 999.0

    def test_spot_fallback_used_when_perp_fails(self, monkeypatch):
        from scanner.jobs.universe_scan import _inject_ob_depth

        def _fetch(symbol, perp=True):
            if perp:
                return None  # perp fails
            return (111.0, 222.0)  # spot succeeds

        monkeypatch.setattr("scanner.jobs.universe_scan.fetch_orderbook_depth5", _fetch)
        df = _make_features(5)
        _inject_ob_depth(df, "BTCUSDT")
        assert df.iloc[-1]["ob_bid_usd"] == 111.0
        assert df.iloc[-1]["ob_ask_usd"] == 222.0
