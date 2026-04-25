from __future__ import annotations

import pandas as pd

from building_blocks.context import Context
from building_blocks.triggers.volume_spike import volume_spike


def _scale_window_by_timeframe(ctx: Context, base_bars: int) -> int:
    if len(ctx.features.index) < 2:
        return base_bars
    deltas = ctx.features.index.to_series().diff().dropna()
    if deltas.empty:
        return base_bars
    minutes = max(deltas.dt.total_seconds().median() / 60.0, 1.0)
    scaled = int(round(base_bars * (60.0 / minutes)))
    return max(1, scaled)


def volume_spike_cluster(
    ctx: Context,
    *,
    cluster_window_bars: int = 2,
) -> pd.Series:
    """Return True when a recent volume spike occurred in the same dump cluster.

    TRADOOR/PTB's intraday real-dump event can unfold across several 15m bars:
    the initial sell cascade prints the volume spike first, then the clearest
    OI-spike-with-dump confirmation can appear one or more bars later. The
    hourly pattern sees both on the same bar, but the 15m clone must tolerate a
    short cluster window without opening the door to unrelated pre-dump rallies.
    """
    if cluster_window_bars < 1:
        raise ValueError(
            f"cluster_window_bars must be >= 1, got {cluster_window_bars}"
        )
    window = _scale_window_by_timeframe(ctx, cluster_window_bars)
    mask = volume_spike(ctx).rolling(window, min_periods=1).max()
    return mask.fillna(False).astype(bool).reindex(ctx.features.index, fill_value=False)
