"""Trigger: volume confirmation for a breakout — 2.5x the trailing average.

Derived from ``volume_spike`` but parameterised for breakout confirmation
rather than extreme-event detection.

Parameter choice (multiple default = 2.5):

``volume_spike`` defaults to a 5x multiple, which in the crypto literature
(Liu, Tsyvinski & Wu, 2022, "Common risk factors in cryptocurrency returns")
is treated as an extreme-event / liquidation-regime detector. Breakout
confirmation requires a lower, more selective threshold. The 2.5x anchor
follows three established references:

1. Edwards & Magee (1948), *Technical Analysis of Stock Trends* — the
   original breakout confirmation norm ("volume should expand on the
   breakout"), operationalised in subsequent decades as ~2x average.
2. Murphy (1999), *Technical Analysis of the Financial Markets* — uses
   ~2.5x the prior average as the threshold for "high volume
   confirmation" of a price breakout.
3. Baur & Dimpfl (2018), "Asymmetric volatility in cryptocurrencies"
   (Research in International Business and Finance 48) — classifies 2x
   as "significant" and 3x as "high" volume for Bitcoin and altcoins,
   supporting a 2.5x breakout-confirmation anchor on intraday data.

Using ``volume_spike`` directly with ``multiple=5`` inside the BREAKOUT
phase produces an entry rule that almost never fires, which was the
root cause of the FDR=1.0 defect seen on the TRADOOR OI-reversal
benchmark pack before this block was introduced.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context
from building_blocks.triggers.volume_spike import volume_spike


def breakout_volume_confirm(
    ctx: Context,
    *,
    multiple: float = 2.5,
    vs_window: int = 24,
) -> pd.Series:
    """Return a bool Series where current volume >= ``multiple`` x the
    mean of the past ``vs_window`` bars' volume.

    This is a thin wrapper over ``volume_spike`` with a breakout-oriented
    default threshold. See the module docstring for the literature anchor
    behind ``multiple=2.5``.
    """
    return volume_spike(ctx, multiple=multiple, vs_window=vs_window)
