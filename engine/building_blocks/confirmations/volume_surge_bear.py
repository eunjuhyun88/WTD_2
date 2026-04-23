"""Confirmation: Elevated SELLING volume — taker sell volume spike.

Rationale:
    During a selling climax (especially on gap-fade setups), aggressive
    sellers overwhelm buyers. This manifests as a spike in taker-sell
    base volume — the volume of market sells executed at the ask.

    taker_sell_base_volume[t] / volume[t] should spike above neutral (0.5)
    when selling is climactic. We measure a rolling 3-bar taker-sell ratio
    and confirm it's sustained above the 0.60 threshold.

    This is the mirror of cvd_buying (taker_buy ratio > 0.55).

    Literature:
      - Easley, López de Prado & O'Hara (2021): order-flow imbalance is a
        leading indicator of price moves.
      - Weis (Wyckoff): volume expansion confirms the direction; selling
        climax = heavy volume on downside.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def volume_surge_bear(
    ctx: Context,
    *,
    taker_sell_window: int = 3,
    taker_sell_threshold: float = 0.60,
) -> pd.Series:
    """Return a bool Series where taker sell volume ratio is elevated.

    True when rolling taker-sell ratio exceeds the threshold, indicating
    heavy selling pressure (climbing volume, climactic dump).

    Args:
        ctx: Per-symbol Context. ``ctx.klines`` must have columns
            ``taker_sell_base_volume`` and ``volume``.
        taker_sell_window: Rolling window (bars) for averaging the taker-sell
            ratio. Default 3 (responsive to recent selling).
        taker_sell_threshold: Taker-sell ratio threshold for "heavy selling".
            Range [0, 1]. Default 0.60 (inverse of cvd_buying=0.55).

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True where selling
        volume is elevated.
    """
    if taker_sell_window < 1:
        raise ValueError(f"taker_sell_window must be >= 1, got {taker_sell_window}")
    if not 0.0 < taker_sell_threshold < 1.0:
        raise ValueError(
            f"taker_sell_threshold must be in (0, 1), got {taker_sell_threshold}"
        )

    if "volume" not in ctx.klines.columns:
        return pd.Series(False, index=ctx.features.index, dtype=bool)

    vol = ctx.klines["volume"].astype(float)
    if "taker_sell_base_volume" in ctx.klines.columns:
        tsv = ctx.klines["taker_sell_base_volume"].astype(float)
    elif "taker_buy_base_volume" in ctx.klines.columns:
        tsv = (vol - ctx.klines["taker_buy_base_volume"].astype(float)).clip(lower=0.0)
    else:
        return pd.Series(False, index=ctx.features.index, dtype=bool)

    # Per-bar taker-sell ratio; treat zero-volume bars as neutral (0.5)
    per_bar_ratio = (tsv / vol.replace(0, float("nan"))).fillna(0.5)

    # Rolling mean over taker_sell_window bars
    rolling_ratio = per_bar_ratio.rolling(
        taker_sell_window, min_periods=taker_sell_window
    ).mean()

    # True where taker-sell ratio is elevated
    heavy_selling = rolling_ratio >= taker_sell_threshold

    return (
        heavy_selling.fillna(False)
        .reindex(ctx.features.index, fill_value=False)
        .astype(bool)
    )
