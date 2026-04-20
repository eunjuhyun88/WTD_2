"""Confirmation: spot CVD recovering while futures shows whale short accumulation.

This is the core signal from the $IN (Infinit) analysis:
  - 현물 CVD 약간 회복 (spot buying pressure recovering)
  - 선물 CVD 완전 밀림 (futures CVD collapsing, funding goes negative)
  - 세력 숏 매집 (whales accumulating shorts to push price down)
  - 개미 롱 갈기 (retail going long = squeeze fuel)

Pattern context (Binance Alpha → Futures pump):
  This divergence precedes the actual pump. Whales suppress price with
  futures shorts while accumulating spot. When they flip (close shorts,
  go long), price explodes.

Firing condition:
  - spot: taker_buy_ratio_1h > threshold_spot (spot buyers present)
  - futures: funding_rate < threshold_funding (shorts dominant)
  - retail: long_short_ratio < threshold_ls (more accounts long than short
    = crowded retail long = squeeze fuel when whales flip)
  - persistence: conditions must hold for min_bars consecutive bars
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def spot_futures_cvd_divergence(
    ctx: Context,
    *,
    threshold_spot: float = 0.50,
    threshold_funding: float = -0.0001,
    threshold_ls: float = 1.05,
    min_bars: int = 2,
) -> pd.Series:
    """Return bool Series where spot-futures CVD divergence is active.

    The divergence fires when:
      1. Spot taker buy ratio >= threshold_spot (buyers still present on CEX spot)
      2. Funding rate < threshold_funding (futures crowded short, bears paying)
      3. Long/short account ratio >= threshold_ls (more accounts long = squeeze fuel)

    Requires min_bars consecutive bars of conditions 1+2 to filter noise.
    Condition 3 (ls_ratio) checked on current bar only (snapshot data).

    Args:
        ctx:               Per-symbol Context.
        threshold_spot:    Min taker_buy_ratio_1h (default 0.50 = balanced).
        threshold_funding: Max funding_rate to classify as short-dominant
                           (default -0.0001 = 0.01% negative funding).
        threshold_ls:      Min long_short_ratio to flag retail overlonging
                           (default 1.05 = 5% more long accounts than short).
        min_bars:          Consecutive bars conditions 1+2 must hold.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    feats = ctx.features

    # Spot: buying pressure recovering
    spot_buying = feats["taker_buy_ratio_1h"] >= threshold_spot

    # Futures: funding negative (shorts pay = bear/accumulation regime)
    futures_negative = feats["funding_rate"] < threshold_funding

    # Retail: accounts longing (crowded long = squeeze fuel)
    retail_longing = feats["long_short_ratio"] >= threshold_ls

    # Divergence condition: both spot buying + futures negative
    divergence = spot_buying & futures_negative

    # Persistence: must hold for min_bars consecutive bars
    if min_bars > 1:
        divergence = (
            divergence
            .rolling(min_bars, min_periods=min_bars)
            .min()
            .fillna(0)
            .astype(bool)
        )

    # Final: divergence + retail overlonging (confirms squeeze setup)
    result = divergence & retail_longing

    return result.reindex(feats.index, fill_value=False).astype(bool)
