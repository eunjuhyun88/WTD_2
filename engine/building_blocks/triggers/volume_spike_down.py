"""Trigger: volume spike on a downward bar — "selling climax".

Detects a capitulation-style bar where volume explodes relative to recent
history AND price closes below open by at least `price_drop_pct`. This is
the entry event for the Volume Absorption Reversal (VAR) pattern:

    SELLING_CLIMAX (this block) → ABSORPTION → BASE → MARKUP

Distinct from ``volume_spike`` in two ways:
  1. Directional: requires a bearish bar (close < open by threshold).
  2. Self-contained: computes against the same-bar percentage drop rather
     than requiring ``features['price_change_1h']`` to be present.

References:
  - Wyckoff (1931), "Selling Climax" — high-volume single-bar panic marks
    the end of the previous downtrend.
  - Koutmos (2019), Finance Research Letters 28 — classifies hourly
    intra-bar moves above 3% as "significant" for perpetual-style
    instruments on altcoins.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def volume_spike_down(
    ctx: Context,
    *,
    multiple: float = 3.0,
    vs_window: int = 24,
    price_drop_pct: float = 0.03,
) -> pd.Series:
    """Return a bool Series where this bar is a down-bar with volume >=
    `multiple` × average past volume.

    Args:
        ctx: Per-symbol Context. ``ctx.klines`` must have columns
            ``volume``, ``open``, ``close``.
        multiple: Multiplier vs average volume. Must be > 0. Default 3.0.
        vs_window: Past window length in bars. Must be > 0. Default 24.
        price_drop_pct: Minimum fractional drop from open to close required
            for the bar to count as a down-bar. Must be > 0. Default 0.03
            (3%).

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if multiple <= 0:
        raise ValueError(f"multiple must be > 0, got {multiple}")
    if vs_window <= 0:
        raise ValueError(f"vs_window must be > 0, got {vs_window}")
    if price_drop_pct <= 0:
        raise ValueError(f"price_drop_pct must be > 0, got {price_drop_pct}")

    vol = ctx.klines["volume"].astype(float)
    open_ = ctx.klines["open"].astype(float)
    close = ctx.klines["close"].astype(float)

    avg = vol.shift(1).rolling(vs_window, min_periods=vs_window).mean()
    spike = vol >= multiple * avg

    # Fractional drop from open to close; positive number means price fell.
    drop_frac = (open_ - close) / open_.replace(0, float("nan"))
    is_down_bar = drop_frac >= price_drop_pct

    mask = spike & is_down_bar
    return mask.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
