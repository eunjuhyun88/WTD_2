"""Confirmation: per-venue OI divergence signal.

W-0122 Pillar 3 — Venue Divergence Radar. Complements the existing
`oi_exchange_divergence` (which reads a pre-aggregated concentration ratio)
by looking at *per-venue delta alignment*.

Signal:
  - ``bull_divergence``: Binance OI rising while Bybit/OKX lag
      → mainstream venue leading, potential trend confirmation
  - ``bear_divergence``: Bybit OI rising alone while Binance flat
      → isolated leveraged pump, typical short-trigger setup
      ("격리된 레버리지 펌프 → 청산 자석 형성 중")

Reads per-venue 1h OI change columns from `ctx.features`:
  - ``binance_oi_change_1h``
  - ``bybit_oi_change_1h``
  - ``okx_oi_change_1h``

These are populated by ``engine/data_cache/fetch_exchange_oi.py``.

Anchor: see W-0122 Pillar 3 + docs/product/competitive-indicator-analysis-2026-04-21.md
for why venue-level divergence is industry-unique to us.
"""
from __future__ import annotations

from typing import Literal

import pandas as pd

from building_blocks.context import Context

Mode = Literal["bull_divergence", "bear_divergence"]


def venue_oi_divergence(
    ctx: Context,
    *,
    mode: Mode = "bear_divergence",
    leader_threshold: float = 0.05,   # leader venue Δ 5%/1h
    follower_threshold: float = 0.01, # follower venue Δ ≤ 1%/1h
) -> pd.Series:
    """Return True where per-venue OI changes diverge in the requested pattern.

    bear_divergence (default): any single venue (Bybit preferred) running hot
    while at least one other venue lags — classic isolated leveraged pump.

    bull_divergence: Binance leading with others following — mainstream
    venue-driven trend confirmation.

    Args:
        ctx:                Per-symbol Context.
        mode:               "bear_divergence" or "bull_divergence".
        leader_threshold:   Required Δ magnitude for the leading venue.
        follower_threshold: Max Δ for a follower venue to count as lagging.

    Returns:
        Boolean pd.Series aligned with ctx.bars.index.
    """
    f = ctx.features
    binance = f.get("binance_oi_change_1h")
    bybit = f.get("bybit_oi_change_1h")
    okx = f.get("okx_oi_change_1h")

    # Graceful fallback: if any series is missing, return all-False aligned series.
    if binance is None or bybit is None or okx is None:
        return pd.Series(False, index=ctx.bars.index)

    if mode == "bull_divergence":
        # Binance leading, others following in same direction but less aggressively.
        return (
            (binance >= leader_threshold)
            & (bybit < binance * 0.6)
            & (okx < binance * 0.6)
        ).fillna(False)

    # bear_divergence: any single venue running hot while at least one other lags.
    bybit_isolated = (
        (bybit >= leader_threshold)
        & (binance.abs() < follower_threshold)
    )
    okx_isolated = (
        (okx >= leader_threshold)
        & (binance.abs() < follower_threshold)
    )
    binance_isolated_weak = (
        (binance >= leader_threshold)
        & (bybit.abs() < follower_threshold)
        & (okx.abs() < follower_threshold)
    )
    # Isolated-venue pump (any of the above).
    return (bybit_isolated | okx_isolated | binance_isolated_weak).fillna(False)
