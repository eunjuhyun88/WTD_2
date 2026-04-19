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
    import pandas as pd
    with patch(
        "building_blocks.confirmations.smart_money_accumulation.load_signals_from_disk",
        return_value=pd.DataFrame(),
    ):
        mask = smart_money_accumulation(ctx)
    assert not mask.any()


def test_block_returns_false_when_below_min_wallets(make_ctx):
    ctx = make_ctx(close=[100, 100], features={})
    import pandas as pd
    signals_df = pd.DataFrame([
        {
            "timestamp": pd.Timestamp("2025-01-01 00:00:00", tz="UTC"),
            "walletType": 1,
            "amountUsd": 5000.0,
            "soldRatioPercent": 0.0,
            "triggerWalletAddress": "only_one_wallet",
            "fetch_timestamp": "2025-01-01T00:00:00+00:00",
        }
    ])
    with patch(
        "building_blocks.confirmations.smart_money_accumulation.load_signals_from_disk",
        return_value=signals_df,
    ):
        mask = smart_money_accumulation(ctx, min_buy_wallets=2)
    assert not mask.any()


def test_block_with_cache_signals(make_ctx):
    """Test that block uses load_signals_from_disk and returns False on empty cache."""
    import pandas as pd

    ctx = make_ctx(
        close=[100, 100, 100, 100],
        features={},
        symbol="WIFUSDT",
        start="2025-01-01",
        freq="1h",
    )

    # Empty cache → all False
    with patch(
        "building_blocks.confirmations.smart_money_accumulation.load_signals_from_disk",
        return_value=pd.DataFrame(),
    ):
        mask = smart_money_accumulation(ctx)
        assert not mask.any(), "Empty signals should return all False"

    # With signals but no accumulation → all False
    signals_df = pd.DataFrame([
        {
            "timestamp": pd.Timestamp.now(tz="UTC"),
            "walletType": 3,
            "amountUsd": 50000.0,
            "soldRatioPercent": 80.0,  # Whale distributing, not accumulating
            "triggerWalletAddress": "whale1",
            "fetch_timestamp": pd.Timestamp.now(tz="UTC").isoformat(),
        }
    ])
    with patch(
        "building_blocks.confirmations.smart_money_accumulation.load_signals_from_disk",
        return_value=signals_df,
    ):
        mask = smart_money_accumulation(ctx, min_buy_wallets=2)
        assert not mask.any(), "Distribution signals should return all False"
