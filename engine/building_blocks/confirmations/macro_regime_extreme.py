"""Confirmation: macro regime is in an extreme state.

W-0338. Wraps the macro features already present in feature_calc:
  - fear_greed     (Fear & Greed Index, 0–100)
  - vix_close      (VIX closing level)
  - btc_dominance  (BTC market cap dominance %)

Four modes, each independently queryable via `mode=`:
  - ``fear``         fear_greed < 20   → extreme fear
  - ``greed``        fear_greed > 80   → extreme greed
  - ``vix_spike``    vix_close > 40    → volatility crisis
  - ``btc_dom_high`` btc_dominance > 60 → altcoin risk-off rotation

All thresholds have environment overrides for easy tuning.
"""
from __future__ import annotations

from typing import Literal

import pandas as pd

from building_blocks.context import Context

Mode = Literal["fear", "greed", "vix_spike", "btc_dom_high"]

_DEFAULTS: dict[Mode, tuple[str, str, float]] = {
    "fear":        ("fear_greed",    "<",  20.0),
    "greed":       ("fear_greed",    ">",  80.0),
    "vix_spike":   ("vix_close",     ">",  40.0),
    "btc_dom_high": ("btc_dominance", ">",  60.0),
}


def macro_regime_extreme(
    ctx: Context,
    *,
    mode: Mode = "fear",
    threshold: float | None = None,
) -> pd.Series:
    """Return True where the requested macro regime is in extreme territory.

    Args:
        ctx:       Per-symbol Context.
        mode:      Which extreme to test. One of: fear, greed, vix_spike, btc_dom_high.
        threshold: Override the default threshold for this mode.

    Returns:
        Boolean pd.Series aligned with ctx.features.index.
        Returns all-False gracefully when the required feature column is absent.
    """
    col, op, default_thresh = _DEFAULTS[mode]
    series = ctx.features.get(col)
    if series is None:
        return pd.Series(False, index=ctx.features.index)

    t = threshold if threshold is not None else default_thresh
    if op == "<":
        result = series < t
    else:
        result = series > t
    return result.fillna(False)
