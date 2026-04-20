"""Confirmation: holder concentration within acceptable range for pump strategy.

Screening criterion 9 from Binance Alpha analysis:
  - Top holders must be concentrated enough (low retail interference)
    for 10-30x pumps to be possible
  - But not so centralized that it's pure exit scam risk
  - Binance treasury presence is informational (not disqualifying)

Optimal zone (from empirical observation):
  top10_holder_pct: 0.50 - 0.90 (50-90% concentrated)
  - < 0.50: too distributed, retail can interfere = pump harder
  - > 0.90: near-total centralization, dump risk

Gracefully returns True (does not block) when holder data unavailable
(no BSCScan key or unknown contract address). Screening criterion still
applies — just not enforced at block level without data.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def holder_concentration_ok(
    ctx: Context,
    *,
    min_top10: float = 0.50,
    max_top10: float = 0.92,
) -> pd.Series:
    """Return bool Series where holder concentration is in the optimal pump zone.

    Fires when holder_top10_pct is between min_top10 and max_top10.

    If holder data is unavailable (column missing or all zeros), returns
    all True — does not block the pattern (data absence ≠ disqualification).

    Args:
        ctx:        Per-symbol Context.
        min_top10:  Minimum top-10 holder % (too distributed below this).
        max_top10:  Maximum top-10 holder % (dump risk above this).

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    feats = ctx.features

    if "holder_top10_pct" not in feats.columns:
        # No holder data: pass-through (don't block)
        return pd.Series(True, index=feats.index, dtype=bool)

    pct = feats["holder_top10_pct"]

    # All zeros = no data fetched yet (API key missing or unknown address)
    if (pct == 0.0).all():
        return pd.Series(True, index=feats.index, dtype=bool)

    in_zone = (pct >= min_top10) & (pct <= max_top10)

    # Forward-fill: holder data updates daily, not hourly
    in_zone = in_zone.replace(False, pd.NA).ffill(limit=24).fillna(False)

    return in_zone.reindex(feats.index, fill_value=True).astype(bool)
