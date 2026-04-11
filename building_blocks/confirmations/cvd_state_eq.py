"""Confirmation: CVD state matches a target value.

CVD (cumulative volume delta) state is derived from taker_buy_base_volume
ratio by `scanner.feature_calc._cvd_state` — one of {"buying", "selling",
"neutral"}. Use this block to gate a trigger on order-flow direction,
e.g. only accept breakouts that fire while taker aggression is buying.
"""
from __future__ import annotations

from typing import Literal

import pandas as pd

from building_blocks.context import Context

CvdStateValue = Literal["buying", "selling", "neutral"]


def cvd_state_eq(
    ctx: Context,
    *,
    state: CvdStateValue = "buying",
) -> pd.Series:
    """Return a bool Series where ctx.features['cvd_state'] == `state`.

    Args:
        ctx: Per-symbol Context. `ctx.features` must have a `cvd_state`
            column (it does — see scanner.feature_calc.FEATURE_COLUMNS).
        state: Target state. Must be one of {"buying", "selling", "neutral"}.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    valid = ("buying", "selling", "neutral")
    if state not in valid:
        raise ValueError(f"state must be one of {valid}, got {state!r}")

    cvd = ctx.features["cvd_state"]
    return (cvd == state).astype(bool)
