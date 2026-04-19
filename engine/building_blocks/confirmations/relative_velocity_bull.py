"""Confirmation: this symbol's volume acceleration exceeds BTC's by a minimum ratio.

Rationale (Signal Radar v4.0 GOLDEN 필터 D, 2026-04-19):
    "velocity/btcVelocity ≥ 1.2"
    Translation: "Alt-coin volume velocity must be at least 1.2× BTC's velocity —
    blocks fake alt pumps that are just BTC beta-lift."

This block is a semantic alias for ``alt_btc_accel_ratio``, named
``relative_velocity_bull`` to match the Signal Radar GOLDEN signal vocabulary
and make pattern definitions self-documenting.

Both blocks share identical logic: rolling volume acceleration ratio (alt / BTC)
above a threshold. Use ``alt_btc_accel_ratio`` in Wyckoff/flow patterns and
``relative_velocity_bull`` in Signal Radar / momentum patterns to clarify intent.

Requires BTCUSDT 1h klines in the offline data cache
(``data_cache.loader.load_klines``).
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context
from building_blocks.confirmations.alt_btc_accel_ratio import alt_btc_accel_ratio


def relative_velocity_bull(
    ctx: Context,
    *,
    min_ratio: float = 1.2,
    window: int = 5,
) -> pd.Series:
    """Return True where alt volume acceleration >= min_ratio × BTC acceleration.

    Args:
        ctx: Per-symbol Context. ``ctx.klines`` must have a ``volume`` column.
        min_ratio: Minimum alt/BTC velocity ratio. Default 1.2
            (Signal Radar GOLDEN filter D: velocity/btcVelocity ≥ 1.2).
        window: Short acceleration window in bars. Baseline is 2×window.
            Default 5 (matches Signal Radar's ~5-bar momentum window).

    Returns:
        pd.Series[bool] aligned to ctx.features.index.

    Raises:
        data_cache.exceptions.CacheMiss: if BTCUSDT 1h data is not cached.
    """
    if min_ratio <= 0:
        raise ValueError(f"min_ratio must be > 0, got {min_ratio}")
    return alt_btc_accel_ratio(ctx, ratio_threshold=min_ratio, window=window)
