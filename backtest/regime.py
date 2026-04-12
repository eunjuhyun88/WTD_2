"""Regime labeler — D12 stub, D15 full implementation.

A regime is a coarse market state label attached to every timestamp,
used by the simulator to skip signals whose conditions don't match the
strategy's expected operating regime.

Phase D12 ships a **stub**: every timestamp gets ``"unknown"``. This
preserves the interface shape (so ``simulator.run_backtest`` can be
adapted in D15 without API churn) while keeping the MVP honest about
the fact that no regime filtering is actually happening yet.

The preregistered D15 rule (documented here for a future implementer):

    bull if BTCUSDT 30d return > +10%
    bear if BTCUSDT 30d return < -10%
    chop otherwise

That's a deliberately crude filter; the point of D15 is to tune it.
D12's job is to not lie about running it.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import pandas as pd


Regime = Literal["bull", "bear", "chop", "unknown"]


@dataclass(frozen=True)
class RegimeLabel:
    time: pd.Timestamp
    regime: Regime


def label_regime_stub(timestamps: list[pd.Timestamp]) -> list[RegimeLabel]:
    """Return ``"unknown"`` for every timestamp.

    This is the D12 stub. The real implementation in D15 will accept a
    BTCUSDT klines DataFrame alongside the timestamps and compute a
    rolling 30-day return at each timestamp.
    """
    return [RegimeLabel(time=t, regime="unknown") for t in timestamps]


def label_regime_by_btc_30d(
    timestamps: list[pd.Timestamp],
    btc_klines: pd.DataFrame,
    *,
    threshold: float = 0.10,
    window_bars: int = 30 * 24,
) -> list[RegimeLabel]:
    """Label regimes by BTCUSDT's trailing 30-day return.

    **Not wired into the simulator yet** — Phase D15 will switch
    ``simulator.run_backtest`` to consume these labels as a signal
    filter. Phase D12 ships the function so the tests can pin its
    behavior and there's no surprise when D15 starts calling it.

    Args:
        timestamps: list of UTC timestamps to label. Must be a subset
            of ``btc_klines.index`` (or missing timestamps will be
            labeled ``"unknown"``).
        btc_klines: BTCUSDT 1h OHLC DataFrame indexed by UTC
            DatetimeIndex.
        threshold: absolute threshold on the 30d return (default 10%).
        window_bars: lookback length in bars (default 720 = 30 × 24).

    Returns:
        One ``RegimeLabel`` per input timestamp, in the same order.
    """
    if "close" not in btc_klines.columns:
        raise ValueError("btc_klines must have a 'close' column")

    closes = btc_klines["close"]
    out: list[RegimeLabel] = []
    for t in timestamps:
        try:
            end_loc_raw = btc_klines.index.get_loc(t)
        except KeyError:
            out.append(RegimeLabel(time=t, regime="unknown"))
            continue
        # get_loc can return a slice / ndarray on duplicate indices.
        if not isinstance(end_loc_raw, int):
            out.append(RegimeLabel(time=t, regime="unknown"))
            continue
        end_loc = int(end_loc_raw)
        start_loc = end_loc - window_bars
        if start_loc < 0:
            out.append(RegimeLabel(time=t, regime="unknown"))
            continue
        ret_30d = (closes.iloc[end_loc] - closes.iloc[start_loc]) / closes.iloc[start_loc]
        if ret_30d > threshold:
            out.append(RegimeLabel(time=t, regime="bull"))
        elif ret_30d < -threshold:
            out.append(RegimeLabel(time=t, regime="bear"))
        else:
            out.append(RegimeLabel(time=t, regime="chop"))
    return out
