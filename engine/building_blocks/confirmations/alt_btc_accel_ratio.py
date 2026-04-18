"""Confirmation: alt-coin volume acceleration exceeds BTC volume acceleration.

Rationale (ALPHA TERMINAL "골든 신호 조건 D", 2026-04-10):
    "알트코인 가속도가 BTC 가속도 대비 1.2배 이상 (비트 하락장 가짜 펌핑 차단)"
    Translation: "Alt acceleration must be ≥ 1.2× BTC acceleration — blocks
    fake alt pumps during BTC downtrends."

Volume acceleration = rolling_mean(volume, window) / rolling_mean(volume, 2*window)
for both the alt and BTC. When alt accelerates proportionally more than BTC,
the move is considered alt-native (real), not a BTC beta-lift.

BTC 1h klines are loaded once from the offline data cache
(``data_cache.loader.load_klines``). A ``CacheMiss`` is raised at construction
time if BTCUSDT 1h data is not cached; call
``data_cache.loader.load_klines("BTCUSDT", "1h")`` in your warmup script to
pre-cache it before running the block.
"""
from __future__ import annotations

import functools

import pandas as pd

from building_blocks.context import Context


@functools.lru_cache(maxsize=1)
def _load_btc_klines() -> pd.DataFrame:
    """Load BTCUSDT 1h klines from offline cache (cached for process lifetime)."""
    from data_cache.loader import load_klines  # local import avoids circular dep
    return load_klines("BTCUSDT", "1h", offline=True)


def _volume_acceleration(vol: pd.Series, window: int) -> pd.Series:
    """rolling_mean(vol, window) / rolling_mean(vol, 2*window)."""
    fast = vol.rolling(window, min_periods=window).mean()
    slow = vol.rolling(2 * window, min_periods=2 * window).mean()
    return (fast / slow.replace(0, float("nan"))).fillna(1.0)


def alt_btc_accel_ratio(
    ctx: Context,
    *,
    ratio_threshold: float = 1.2,
    window: int = 5,
) -> pd.Series:
    """Return a bool Series where alt volume acceleration ≥ ratio_threshold × BTC.

    Args:
        ctx: Per-symbol Context. ``ctx.klines`` must have a ``volume`` column.
        ratio_threshold: Minimum alt/BTC acceleration ratio. Default 1.2
            (ALPHA TERMINAL "골든 신호 조건 D").
        window: Short acceleration window in bars. Baseline is 2×window.
            Default 5 (covers the recent 5h on 1h timeframe).

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True where the alt is
        accelerating faster than BTC by at least ratio_threshold.

    Raises:
        data_cache.exceptions.CacheMiss: if BTCUSDT 1h data is not cached.
    """
    if ratio_threshold <= 0:
        raise ValueError(f"ratio_threshold must be > 0, got {ratio_threshold}")
    if window < 2:
        raise ValueError(f"window must be >= 2, got {window}")

    alt_vol = ctx.klines["volume"].astype(float)
    alt_accel = _volume_acceleration(alt_vol, window)

    btc_klines = _load_btc_klines()
    btc_vol = btc_klines["volume"].astype(float)
    btc_accel = _volume_acceleration(btc_vol, window)

    # Align BTC acceleration to the alt's index (forward-fill for minor gaps)
    btc_accel_aligned = btc_accel.reindex(alt_accel.index, method="ffill").fillna(1.0)

    result = alt_accel >= ratio_threshold * btc_accel_aligned
    return result.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
