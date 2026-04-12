"""Entry: RSI(14) is above or below a numeric threshold.

Simple overbought / oversold filter using the canonical 14-period RSI
already computed in `ctx.features['rsi14']`. The two divergence entries
(`rsi_bullish_divergence`, `rsi_bearish_divergence`) look for structural
disagreements between price and RSI; this block is the blunt-force
sibling for people who just want "RSI under 30 on a hammer" setups.
"""
from __future__ import annotations

from typing import Literal

import pandas as pd

from building_blocks.context import Context

Direction = Literal["below", "above"]


def rsi_threshold(
    ctx: Context,
    *,
    threshold: float = 30.0,
    direction: Direction = "below",
) -> pd.Series:
    """Return a bool Series where ctx.features['rsi14'] is on the
    requested side of `threshold`.

    Args:
        ctx: Per-symbol Context.
        threshold: RSI level in (0, 100). Classic values: 30 (oversold),
            70 (overbought).
        direction: "below" matches bars with rsi14 < threshold. "above"
            matches bars with rsi14 > threshold.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if not 0.0 < threshold < 100.0:
        raise ValueError(f"threshold must be in (0, 100), got {threshold}")
    if direction not in ("below", "above"):
        raise ValueError(f"direction must be 'below' or 'above', got {direction!r}")

    rsi = ctx.features["rsi14"]
    if direction == "below":
        mask = rsi < threshold
    else:
        mask = rsi > threshold
    return mask.astype(bool)
