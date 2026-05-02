"""W-0384: Alpha composite score unit tests — 8 pure function tests.

All module functions (A~F) are pure IO-free so no mocks needed.
compute_alpha_score() integration test mocks HTTP to avoid network.
"""
from __future__ import annotations

import pytest


# ── Module A — OI Surge ───────────────────────────────────────────────────────

def test_module_a_extreme_surge_long():
    from alpha.composite_score import _score_oi_surge
    sig = _score_oi_surge(oi_current=600, oi_1h_ago=100, price_delta=50)
    assert sig is not None
    assert sig.score_delta == 18
    assert sig.dimension == "oi_surge"
    assert "EXTREME" in sig.label


def test_module_a_surge_short():
    """OI surge + price drop → bearish signal (negative)."""
    from alpha.composite_score import _score_oi_surge
    sig = _score_oi_surge(oi_current=600, oi_1h_ago=100, price_delta=-50)
    assert sig is not None
    assert sig.score_delta == -18


def test_module_a_no_signal():
    from alpha.composite_score import _score_oi_surge
    sig = _score_oi_surge(oi_current=100, oi_1h_ago=95, price_delta=10)
    assert sig is None


# ── Module B — Funding Heat ───────────────────────────────────────────────────

def test_module_b_long_overcrowded():
    from alpha.composite_score import _score_funding_heat
    sig = _score_funding_heat(funding_rate_pct=0.10, oi_change_pct_1h=5)
    assert sig is not None
    assert sig.score_delta == -12   # danger for longs


def test_module_b_short_squeeze_setup():
    from alpha.composite_score import _score_funding_heat
    sig = _score_funding_heat(funding_rate_pct=-0.09, oi_change_pct_1h=5)
    assert sig is not None
    assert sig.score_delta == 12    # squeeze upward


# ── Module C — Buy Pressure ───────────────────────────────────────────────────

def test_module_c_strong_buy():
    from alpha.composite_score import _score_buy_pressure
    sig = _score_buy_pressure(buy_pct=78)
    assert sig is not None
    assert sig.score_delta == 18


def test_module_c_sell_domination():
    from alpha.composite_score import _score_buy_pressure
    sig = _score_buy_pressure(buy_pct=32)
    assert sig is not None
    assert sig.score_delta == -12


def test_module_c_consecutive_buy_bonus():
    from alpha.composite_score import _score_buy_pressure
    sig = _score_buy_pressure(buy_pct=66, consecutive_buys=10)
    assert sig is not None
    assert sig.score_delta == 16   # 12 base + 4 bonus
    assert "조직적" in sig.label


# ── Module D — Kimchi Premium ─────────────────────────────────────────────────

def test_module_d_high_kimchi():
    from alpha.composite_score import _score_kimchi_premium
    sig = _score_kimchi_premium(3.5)
    assert sig is not None
    assert sig.score_delta == 10


def test_module_d_reverse():
    from alpha.composite_score import _score_kimchi_premium
    sig = _score_kimchi_premium(-3.0)
    assert sig is not None
    assert sig.score_delta == -10


def test_module_d_neutral():
    from alpha.composite_score import _score_kimchi_premium
    sig = _score_kimchi_premium(0.5)
    assert sig is None


# ── Module E — Binance Alpha List ─────────────────────────────────────────────

def test_module_e_in_list():
    from alpha.composite_score import _score_alpha_list
    sig = _score_alpha_list("ETH", {"BTC", "ETH", "SOL"})
    assert sig is not None
    assert sig.score_delta == 5


def test_module_e_not_in_list():
    from alpha.composite_score import _score_alpha_list
    sig = _score_alpha_list("DOGE", {"BTC", "ETH"})
    assert sig is None


# ── Module F — Orderbook Imbalance ────────────────────────────────────────────

def test_module_f_extreme_bid():
    from alpha.composite_score import _score_ob_imbalance
    sig = _score_ob_imbalance(bid_vol=400, ask_vol=100)
    assert sig is not None
    assert sig.score_delta == 12


def test_module_f_extreme_ask():
    from alpha.composite_score import _score_ob_imbalance
    sig = _score_ob_imbalance(bid_vol=20, ask_vol=100)
    assert sig is not None
    assert sig.score_delta == -12


# ── Verdict mapping ───────────────────────────────────────────────────────────

def test_verdict_mapping():
    from alpha.composite_score import _verdict
    assert _verdict(65) == "STRONG_ALPHA"
    assert _verdict(40) == "ALPHA"
    assert _verdict(20) == "WATCH"
    assert _verdict(0) == "NEUTRAL"
    assert _verdict(-20) == "AVOID"


# ── compute_alpha_score smoke test (mocked HTTP) ──────────────────────────────

@pytest.mark.asyncio
async def test_compute_alpha_score_smoke(monkeypatch):
    """Smoke test: all HTTP fetches stubbed → result is valid, no crash."""
    from unittest.mock import AsyncMock, patch
    from alpha.composite_score import _cache, AlphaScoreRequest, compute_alpha_score

    _cache.clear()

    # Patch individual fetchers so coroutines are properly closed
    with (
        patch("alpha.composite_score._fetch_oi_data", new=AsyncMock(return_value={})),
        patch("alpha.composite_score._fetch_premium_index", new=AsyncMock(return_value={})),
        patch("alpha.composite_score._fetch_klines", new=AsyncMock(return_value=[])),
        patch("alpha.composite_score._fetch_ob_depth", new=AsyncMock(return_value={})),
        patch("alpha.composite_score._fetch_krw_rate", new=AsyncMock(return_value=1330.0)),
        patch("alpha.composite_score._fetch_upbit_price", new=AsyncMock(return_value=None)),
        patch("alpha.composite_score._fetch_binance_alpha_set", new=AsyncMock(return_value=set())),
    ):
        result = await compute_alpha_score(AlphaScoreRequest(symbol="ETHUSDT"))

    assert 0 <= result.score <= 100
    assert result.symbol == "ETHUSDT"
    assert result.verdict in {"STRONG_ALPHA", "ALPHA", "WATCH", "NEUTRAL", "AVOID"}
