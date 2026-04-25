"""Confirmation: CVD delta flips (VAR-tuned variant).

A tighter variant of ``delta_flip_positive`` tuned for the Volume
Absorption Reversal (VAR) pattern's DELTA_FLIP phase.

Default parameters (w=3, 0.48→0.52) are calibrated for the VAR pattern
where the absorption window is shorter and the flip signal is intentionally
set to a lower threshold to avoid missing early-stage reversals.

See ``delta_flip_positive`` for the full literature trail.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context
from building_blocks.confirmations.delta_flip_positive import delta_flip_positive


def delta_flip_var(
    ctx: Context,
    *,
    window: int = 3,
    flip_from_below: float = 0.48,
    flip_to_at_least: float = 0.52,
) -> pd.Series:
    """Return a bool Series where the rolling taker-buy ratio just flipped.

    VAR-tuned defaults: window=3, flip_from_below=0.48, flip_to_at_least=0.52.
    Shorter window and tighter thresholds than the base delta_flip_positive
    to catch early-stage absorption completions in the VAR pattern.

    Args:
        ctx: Per-symbol Context.
        window: Rolling window (bars). Default 3.
        flip_from_below: Prior ratio must be below this. Default 0.48.
        flip_to_at_least: Current ratio must be at or above this. Default 0.52.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    return delta_flip_positive(
        ctx,
        window=window,
        flip_from_below=flip_from_below,
        flip_to_at_least=flip_to_at_least,
    )
