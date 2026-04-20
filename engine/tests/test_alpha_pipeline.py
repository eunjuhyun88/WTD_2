"""Tests for W-0115 Alpha Universe data pipeline components.

Covers:
  - spot_futures_cvd_divergence building block
  - dex_buy_pressure building block
  - holder_concentration_ok building block
  - fetch_dexscreener helpers (offline, no network calls)
  - fetch_alpha_universe watchlist utilities
  - registry DEX_SOURCES + CHAIN_SOURCES registration
  - ALPHA_PRESURGE pattern registration
"""
from __future__ import annotations

import pandas as pd
import pytest


# ── spot_futures_cvd_divergence ───────────────────────────────────────────────

from building_blocks.confirmations.spot_futures_cvd_divergence import (
    spot_futures_cvd_divergence,
)


def test_spot_futures_divergence_fires_when_all_conditions_met(make_ctx):
    # spot buying (0.55) + negative funding + retail longing (ls_ratio 1.1)
    ctx = make_ctx(
        close=[100] * 5,
        features={
            "taker_buy_ratio_1h": [0.55, 0.55, 0.55, 0.55, 0.55],
            "funding_rate":       [-0.0002] * 5,
            "long_short_ratio":   [1.1] * 5,
        },
    )
    mask = spot_futures_cvd_divergence(ctx, min_bars=2)
    # min_bars=2: first bar cannot fire (no prior bar to roll over)
    assert mask.iloc[-1] is True or mask.iloc[-1] == True
    assert not mask.iloc[0]


def test_spot_futures_divergence_no_fire_when_spot_weak(make_ctx):
    ctx = make_ctx(
        close=[100] * 4,
        features={
            "taker_buy_ratio_1h": [0.40, 0.40, 0.40, 0.40],  # below threshold
            "funding_rate":       [-0.0002] * 4,
            "long_short_ratio":   [1.1] * 4,
        },
    )
    mask = spot_futures_cvd_divergence(ctx)
    assert not mask.any()


def test_spot_futures_divergence_no_fire_when_funding_positive(make_ctx):
    ctx = make_ctx(
        close=[100] * 4,
        features={
            "taker_buy_ratio_1h": [0.60] * 4,
            "funding_rate":       [0.0002] * 4,  # positive, bulls paying
            "long_short_ratio":   [1.1] * 4,
        },
    )
    mask = spot_futures_cvd_divergence(ctx)
    assert not mask.any()


def test_spot_futures_divergence_no_fire_when_retail_not_longing(make_ctx):
    ctx = make_ctx(
        close=[100] * 4,
        features={
            "taker_buy_ratio_1h": [0.60] * 4,
            "funding_rate":       [-0.0002] * 4,
            "long_short_ratio":   [0.90] * 4,  # shorts dominant = no squeeze fuel
        },
    )
    mask = spot_futures_cvd_divergence(ctx)
    assert not mask.any()


def test_spot_futures_divergence_result_aligned_to_index(make_ctx):
    ctx = make_ctx(
        close=[100] * 6,
        features={
            "taker_buy_ratio_1h": [0.55] * 6,
            "funding_rate":       [-0.0003] * 6,
            "long_short_ratio":   [1.15] * 6,
        },
    )
    mask = spot_futures_cvd_divergence(ctx)
    assert list(mask.index) == list(ctx.features.index)
    assert mask.dtype == bool


# ── dex_buy_pressure ─────────────────────────────────────────────────────────

from building_blocks.confirmations.dex_buy_pressure import dex_buy_pressure


def test_dex_buy_pressure_fires_when_buy_dominant(make_ctx):
    ctx = make_ctx(
        close=[100] * 4,
        features={
            "dex_buy_pct":    [0.60, 0.58, 0.62, 0.65],
            "dex_volume_h24": [50_000.0] * 4,
        },
    )
    mask = dex_buy_pressure(ctx, threshold=0.55, min_volume=10_000)
    assert mask.all()


def test_dex_buy_pressure_no_fire_when_sells_dominant(make_ctx):
    ctx = make_ctx(
        close=[100] * 4,
        features={
            "dex_buy_pct":    [0.40, 0.42, 0.45, 0.48],
            "dex_volume_h24": [50_000.0] * 4,
        },
    )
    mask = dex_buy_pressure(ctx, threshold=0.55)
    assert not mask.any()


def test_dex_buy_pressure_no_fire_below_min_volume(make_ctx):
    ctx = make_ctx(
        close=[100] * 3,
        features={
            "dex_buy_pct":    [0.65, 0.70, 0.72],
            "dex_volume_h24": [5_000.0] * 3,  # below min_volume
        },
    )
    mask = dex_buy_pressure(ctx, min_volume=10_000)
    assert not mask.any()


def test_dex_buy_pressure_returns_false_when_no_column(make_ctx):
    # No DEX data — block should not block the pattern
    ctx = make_ctx(close=[100] * 3)
    mask = dex_buy_pressure(ctx)
    assert not mask.any()
    assert len(mask) == 3


def test_dex_buy_pressure_returns_false_when_all_default(make_ctx):
    # All 0.5 = default padding = no data
    ctx = make_ctx(
        close=[100] * 4,
        features={
            "dex_buy_pct":    [0.5, 0.5, 0.5, 0.5],
            "dex_volume_h24": [100_000.0] * 4,
        },
    )
    mask = dex_buy_pressure(ctx)
    assert not mask.any()


# ── holder_concentration_ok ───────────────────────────────────────────────────

from building_blocks.confirmations.holder_concentration_ok import holder_concentration_ok


def test_holder_concentration_ok_fires_in_zone(make_ctx):
    ctx = make_ctx(
        close=[100] * 4,
        features={"holder_top10_pct": [0.70, 0.72, 0.68, 0.75]},
    )
    mask = holder_concentration_ok(ctx, min_top10=0.50, max_top10=0.92)
    assert mask.all()


def test_holder_concentration_blocks_when_too_centralized(make_ctx):
    ctx = make_ctx(
        close=[100] * 4,
        features={"holder_top10_pct": [0.95, 0.96, 0.97, 0.98]},
    )
    mask = holder_concentration_ok(ctx, max_top10=0.92)
    assert not mask.any()


def test_holder_concentration_blocks_when_too_distributed(make_ctx):
    ctx = make_ctx(
        close=[100] * 4,
        features={"holder_top10_pct": [0.30, 0.32, 0.28, 0.35]},
    )
    mask = holder_concentration_ok(ctx, min_top10=0.50)
    assert not mask.any()


def test_holder_concentration_passes_when_no_column(make_ctx):
    # No holder data → should NOT block (pass-through True)
    ctx = make_ctx(close=[100] * 4)
    mask = holder_concentration_ok(ctx)
    assert mask.all()


def test_holder_concentration_passes_when_all_zero(make_ctx):
    # All zeros = no API key / unknown address → pass-through
    ctx = make_ctx(
        close=[100] * 4,
        features={"holder_top10_pct": [0.0, 0.0, 0.0, 0.0]},
    )
    mask = holder_concentration_ok(ctx)
    assert mask.all()


# ── DexScreener helpers (offline) ─────────────────────────────────────────────

from data_cache.fetch_dexscreener import (
    _clean_symbol,
    _pick_best_pair,
    _extract_features,
    _snapshot_to_df,
)


def test_clean_symbol_strips_usdt():
    assert _clean_symbol("INUSDT") == "IN"
    assert _clean_symbol("BTCUSDT") == "BTC"
    assert _clean_symbol("ETHBUSD") == "ETH"
    assert _clean_symbol("NIGHTPERP") == "NIGHT"


def test_clean_symbol_passthrough():
    assert _clean_symbol("BTC") == "BTC"
    assert _clean_symbol("ETH") == "ETH"


def test_pick_best_pair_prefers_bsc():
    pairs = [
        {"chainId": "ethereum", "baseToken": {"symbol": "IN"}, "quoteToken": {"symbol": "USDT"},
         "liquidity": {"usd": 200_000}},
        {"chainId": "bsc", "baseToken": {"symbol": "IN"}, "quoteToken": {"symbol": "USDT"},
         "liquidity": {"usd": 100_000}},
    ]
    best = _pick_best_pair(pairs, "IN")
    assert best is not None
    assert best["chainId"] == "bsc"


def test_pick_best_pair_prefers_higher_liquidity_same_chain():
    pairs = [
        {"chainId": "bsc", "baseToken": {"symbol": "IN"}, "quoteToken": {"symbol": "USDT"},
         "liquidity": {"usd": 50_000}},
        {"chainId": "bsc", "baseToken": {"symbol": "IN"}, "quoteToken": {"symbol": "USDT"},
         "liquidity": {"usd": 500_000}},
    ]
    best = _pick_best_pair(pairs, "IN")
    assert best is not None
    assert (best.get("liquidity") or {}).get("usd") == 500_000


def test_pick_best_pair_returns_none_when_no_match():
    pairs = [
        {"chainId": "bsc", "baseToken": {"symbol": "OTHER"}, "quoteToken": {"symbol": "USDT"},
         "liquidity": {"usd": 100_000}},
    ]
    assert _pick_best_pair(pairs, "IN") is None


def test_extract_features_computes_buy_pct():
    pair = {
        "marketCap": 15_000_000,
        "fdv": 30_000_000,
        "liquidity": {"usd": 500_000},
        "volume": {"h24": 800_000},
        "txns": {"h24": {"buys": 600, "sells": 400}},
        "priceChange": {"h24": -3.2, "h6": -1.1},
        "info": {"socials": [{"platform": "twitter", "handle": "test"}]},
        "boosts": {"active": 2},
        "pairCreatedAt": None,
        "chainId": "bsc",
        "pairAddress": "0xabc",
        "baseToken": {"address": "0xdef", "symbol": "IN"},
    }
    feats = _extract_features(pair)
    assert feats["dex_market_cap"] == 15_000_000
    assert feats["dex_buy_pct"] == pytest.approx(0.6)
    assert feats["dex_has_twitter"] == 1.0
    assert feats["dex_boost_active"] == 2.0
    assert feats["_chain"] == "bsc"


def test_snapshot_to_df_shape_and_today_value():
    feats = {
        "dex_market_cap": 10_000_000.0,
        "dex_buy_pct": 0.65,
        "dex_volume_h24": 250_000.0,
    }
    df = _snapshot_to_df(feats, days=7)
    assert len(df) == 7
    assert df["dex_market_cap"].iloc[-1] == 10_000_000.0
    assert df["dex_buy_pct"].iloc[-1] == 0.65
    # Past rows padded to 0 (except dex_buy_pct which defaults to 0.5)
    assert df["dex_market_cap"].iloc[0] == 0.0
    assert df["dex_buy_pct"].iloc[0] == 0.5


# ── Alpha Universe helpers ────────────────────────────────────────────────────

from data_cache.fetch_alpha_universe import (
    ALPHA_WATCHLIST,
    get_watchlist_symbols,
)


def test_watchlist_has_grade_a_tokens():
    a_grade = [k for k, v in ALPHA_WATCHLIST.items() if v.get("grade") == "A"]
    assert len(a_grade) >= 10


def test_watchlist_has_grade_b_tokens():
    b_grade = [k for k, v in ALPHA_WATCHLIST.items() if v.get("grade") == "B"]
    assert len(b_grade) >= 5


def test_get_watchlist_symbols_all():
    symbols = get_watchlist_symbols()
    assert all(s.endswith("USDT") for s in symbols)
    assert "INUSDT" in symbols


def test_get_watchlist_symbols_grade_filter():
    a_syms = get_watchlist_symbols(grade_filter="A")
    b_syms = get_watchlist_symbols(grade_filter="B")
    assert "INUSDT" in a_syms
    assert not any(s in b_syms for s in a_syms)


# ── Registry integration ──────────────────────────────────────────────────────

from data_cache.registry import (
    DEX_SOURCES,
    CHAIN_SOURCES,
    all_dex_columns,
    all_chain_columns,
    dex_defaults,
    chain_defaults,
)


def test_dex_sources_registered():
    names = [s.name for s in DEX_SOURCES]
    assert "dex_token" in names


def test_dex_sources_have_required_columns():
    cols = all_dex_columns()
    required = [
        "dex_market_cap", "dex_liquidity_usd", "dex_volume_h24",
        "dex_buy_pct", "dex_buy_txns_h24", "dex_sell_txns_h24",
        "dex_has_twitter", "dex_boost_active",
    ]
    for col in required:
        assert col in cols, f"Missing DEX column: {col}"


def test_dex_defaults_cover_all_columns():
    cols = all_dex_columns()
    defaults = dex_defaults()
    for col in cols:
        assert col in defaults, f"Missing default for DEX column: {col}"


def test_chain_sources_registered():
    names = [s.name for s in CHAIN_SOURCES]
    assert "holder_concentration" in names


def test_chain_defaults_cover_all_columns():
    cols = all_chain_columns()
    defaults = chain_defaults()
    for col in cols:
        assert col in defaults, f"Missing default for chain column: {col}"


def test_dex_sources_scope_per_symbol():
    for src in DEX_SOURCES:
        assert src.scope == "per_symbol"
    for src in CHAIN_SOURCES:
        assert src.scope == "per_symbol"


# ── Pattern registration ──────────────────────────────────────────────────────

from patterns.library import PATTERN_LIBRARY, get_pattern


def test_alpha_presurge_registered():
    assert "alpha-presurge-v1" in PATTERN_LIBRARY


def test_alpha_presurge_has_three_phases():
    pattern = get_pattern("alpha-presurge-v1")
    assert len(pattern.phases) == 3
    phase_ids = [p.phase_id for p in pattern.phases]
    assert "SCREENING_GATE" in phase_ids
    assert "ACCUMULATION_ZONE" in phase_ids
    assert "SQUEEZE_TRIGGER" in phase_ids


def test_alpha_presurge_direction_long():
    pattern = get_pattern("alpha-presurge-v1")
    assert pattern.direction == "long"


def test_alpha_presurge_entry_phase():
    pattern = get_pattern("alpha-presurge-v1")
    assert pattern.entry_phase == "SQUEEZE_TRIGGER"


def test_alpha_presurge_accumulation_requires_divergence():
    pattern = get_pattern("alpha-presurge-v1")
    accum = next(p for p in pattern.phases if p.phase_id == "ACCUMULATION_ZONE")
    assert "spot_futures_cvd_divergence" in accum.required_blocks


def test_alpha_presurge_squeeze_requires_ls_recovery():
    pattern = get_pattern("alpha-presurge-v1")
    squeeze = next(p for p in pattern.phases if p.phase_id == "SQUEEZE_TRIGGER")
    assert "ls_ratio_recovery" in squeeze.required_blocks
