"""Tests for smart_money_accumulation block and OKX fetcher helpers."""
from __future__ import annotations

from unittest.mock import patch

from building_blocks.confirmations.smart_money_accumulation import smart_money_accumulation
from data_cache.fetch_okx_smart_money import compute_smart_money_score


# ── compute_smart_money_score unit tests ────────────────────────────────────

def test_score_accumulating_when_mostly_buying():
    signals = [
        {
            "amountUsd": "10000",
            "soldRatioPercent": "10",  # 10% sold = accumulating
            "triggerWalletAddress": "wallet_a,wallet_b,wallet_c",
            "timestamp": "9999999999000",
        },
    ]
    score = compute_smart_money_score(signals)
    assert score["buy_wallet_count"] == 3
    assert score["net_buy_usd"] > 0
    assert score["accumulating"] is True


def test_score_not_accumulating_when_mostly_selling():
    signals = [
        {
            "amountUsd": "5000",
            "soldRatioPercent": "80",  # 80% sold = distribution
            "triggerWalletAddress": "wallet_x",
            "timestamp": "9999999999000",
        },
    ]
    score = compute_smart_money_score(signals)
    assert score["sell_wallet_count"] == 1
    assert score["net_buy_usd"] < 0
    assert score["accumulating"] is False


def test_score_empty_signals():
    score = compute_smart_money_score([])
    assert score["buy_wallet_count"] == 0
    assert score["accumulating"] is False


def test_score_deduplicates_wallets():
    signals = [
        {
            "amountUsd": "3000",
            "soldRatioPercent": "5",
            "triggerWalletAddress": "wallet_a,wallet_b",
            "timestamp": "9999999999000",
        },
        {
            "amountUsd": "2000",
            "soldRatioPercent": "0",
            "triggerWalletAddress": "wallet_a,wallet_c",  # wallet_a seen again
            "timestamp": "9999999999001",
        },
    ]
    score = compute_smart_money_score(signals)
    assert score["buy_wallet_count"] == 3  # a,b,c deduplicated


# ── block tests ─────────────────────────────────────────────────────────────

def test_block_returns_false_for_btc(make_ctx):
    ctx = make_ctx(close=[100, 100], features={}, symbol="BTCUSDT")
    mask = smart_money_accumulation(ctx)
    assert not mask.any()


def test_block_returns_false_when_no_signals(make_ctx):
    ctx = make_ctx(close=[100, 100, 100], features={})
    with patch(
        "building_blocks.confirmations.smart_money_accumulation.get_smart_money_signals",
        return_value=[],
    ):
        mask = smart_money_accumulation(ctx)
    assert not mask.any()


def test_block_returns_false_when_below_min_wallets(make_ctx):
    ctx = make_ctx(close=[100, 100], features={})
    signals = [
        {
            "amountUsd": "5000",
            "soldRatioPercent": "0",
            "triggerWalletAddress": "only_one_wallet",
            "timestamp": "9999999999000",
        }
    ]
    with patch(
        "building_blocks.confirmations.smart_money_accumulation.get_smart_money_signals",
        return_value=signals,
    ):
        mask = smart_money_accumulation(ctx, min_buy_wallets=2)
    assert not mask.any()


def test_block_marks_recent_bars_true(make_ctx):
    import time
    from unittest.mock import patch as _patch

    # make_ctx uses start="2025-01-01", freq="1h"
    # We mock time.time() to return a value 2h after bar index 2 (bar3)
    # so bars 0,1 (hours 0,1) are > 2h old, bars 2,3 are within 2h
    import pandas as pd
    epoch_bar0 = int(pd.Timestamp("2025-01-01 00:00:00", tz="UTC").timestamp())
    fake_now = epoch_bar0 + 3 * 3600 + 30  # now = bar0 + 3.5h

    ctx = make_ctx(
        close=[100, 100, 100, 100],
        features={},
        symbol="WIFUSDT",
        start="2025-01-01",
        freq="1h",
    )
    signals = [
        {
            "amountUsd": "8000",
            "soldRatioPercent": "5",
            "triggerWalletAddress": "addr1,addr2,addr3",
            "timestamp": str(fake_now * 1000),
        }
    ]
    with patch(
        "building_blocks.confirmations.smart_money_accumulation.get_smart_money_signals",
        return_value=signals,
    ), _patch("time.time", return_value=fake_now):
        mask = smart_money_accumulation(ctx, max_age_hours=2.0, min_buy_wallets=2)

    # bar0 (00:00) and bar1 (01:00) are > 2h before fake_now (03:30) → False
    # bar2 (02:00) and bar3 (03:00) are within 2h → True
    assert list(mask) == [False, False, True, True]
