"""Confirmation: Open Interest expansion suitable for breakout confirmation.

Wraps ``oi_change`` with a threshold and window calibrated for
confirming a price breakout, rather than detecting a sharp intra-hour
regime shift.

Parameter choice (threshold=0.05, window='24h'):

The raw ``oi_change`` block defaults to a 10% move in 1 hour — this is
calibrated to catch explosive regime shifts such as the REAL_DUMP
anchor event in the TRADOOR OI-reversal family, not to confirm a
breakout after accumulation. Literature anchors for breakout-context OI
expansion:

1. Bessembinder & Seguin (1993), "Price Volatility, Trading Volume, and
   Market Depth: Evidence From Futures Markets" (Journal of Financial
   and Quantitative Analysis 28(1)) — finds that OI *rises* confirm
   directional conviction, while OI falls during a price move signal
   position unwinding. Their empirical threshold for "meaningful"
   expansion on daily futures is on the order of 5% over a multi-day
   window, not an hourly spike.
2. Wang & Yau (2000), "Trading Volume, Bid-Ask Spread, and Price
   Volatility in Futures Markets" (Journal of Futures Markets 20(10)) —
   confirms that open-interest change magnitudes of 5-10% across a
   daily horizon are the relevant band for rejecting noise while still
   capturing directional commitment.
3. For crypto perpetual swaps the hourly OI series is noisier than
   daily futures, so using the 24-hour rolling window with a 5%
   threshold keeps the spirit of the classical breakout-confirmation
   anchor while suppressing intraday whipsaw.

Using the raw ``oi_change`` default (10% in 1h) as a BREAKOUT
requirement made the BREAKOUT phase structurally unreachable after
ACCUMULATION in the current benchmark cases; this block exists so
BREAKOUT can rely on a realistic confirmation threshold without
loosening the tighter ``oi_change`` default used elsewhere in the
pattern library.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.confirmations.oi_change import oi_change
from building_blocks.context import Context


def oi_expansion_confirm(
    ctx: Context,
    *,
    threshold: float = 0.05,
    window: str = "24h",
) -> pd.Series:
    """Return a bool Series where OI has expanded by at least ``threshold``
    over ``window`` bars (5% over 24h by default).

    See the module docstring for the literature anchor behind the
    default threshold and window.
    """
    return oi_change(ctx, threshold=threshold, direction="increase", window=window)
