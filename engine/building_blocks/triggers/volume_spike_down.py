"""Trigger: high-volume selling pressure — large down-move with volume spike.

Rationale:
    Volume Absorption Reversal (VAR) requires a SELLING_CLIMAX anchor: a bar
    or window where sellers are exhausting themselves at high volume while
    pushing price sharply lower. This is the starting event that sets up the
    subsequent absorption and markup phases.

    A selling climax is characterised by:
      (a) Volume well above the recent average (panic / capitulation),
      (b) Price closing materially lower than the open (directional sell).

    Literature:
      - Wyckoff (1911): "Selling Climax" is the terminal event of a decline;
        enormous volume + wide spread down bar.
      - Edwards & Magee (1948): climactic selling volume often 2-5x average.
      - Murphy (1999): high-volume down bars mark exhaustion, not acceleration.

    In practice we require close < open (the bar is red) AND current volume
    exceeds `multiple` × mean of the prior `vs_window` bars.  Both conditions
    must hold simultaneously so a flat-to-up bar with heavy volume (e.g. a
    breakout) does not trigger.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def volume_spike_down(
    ctx: Context,
    *,
    multiple: float = 3.0,
    vs_window: int = 24,
) -> pd.Series:
    """Return a bool Series where a bar is a high-volume down bar.

    True when:
      - close < open (red / bearish bar), AND
      - volume >= `multiple` × mean(volume over prior `vs_window` bars).

    Past-only: the rolling window is [t-vs_window : t-1], so the signal is
    fully causal — no look-ahead.

    Args:
        ctx: Per-symbol Context. ``ctx.klines`` must have ``open``,
            ``close``, and ``volume`` columns.
        multiple: Volume multiplier vs the prior average. Must be > 0.
            Default 3.0 (3× average) flags obvious capitulation while
            staying selective enough to avoid noise.
        vs_window: Rolling window length (bars). Must be > 0. Default 24
            (one day of 1h bars).

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True on bars where
        a selling climax is detected.
    """
    if multiple <= 0:
        raise ValueError(f"multiple must be > 0, got {multiple}")
    if vs_window <= 0:
        raise ValueError(f"vs_window must be > 0, got {vs_window}")

    o = ctx.klines["open"].astype(float)
    c = ctx.klines["close"].astype(float)
    vol = ctx.klines["volume"].astype(float)

    # Bearish bar: close strictly below open
    is_down = c < o

    # Volume spike vs past average (past-only — shift by 1 before rolling)
    avg_vol = vol.shift(1).rolling(vs_window, min_periods=vs_window).mean()
    is_spike = vol >= multiple * avg_vol

    result = is_down & is_spike
    return result.reindex(ctx.features.index, fill_value=False).astype(bool)
