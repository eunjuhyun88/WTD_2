from __future__ import annotations

import pytest

from building_blocks.triggers import volume_spike_cluster


def test_volume_spike_cluster_holds_recent_spike_for_intraday_dump(make_ctx) -> None:
    closes = [100.0] * 32
    volumes = [100.0] * 24 + [650.0, 620.0] + [120.0] * 6
    ctx = make_ctx(
        close=closes,
        overrides={"volume": volumes},
        freq="15min",
        features={"vol_zscore": [0.0] * 24 + [3.5, 3.0] + [0.1] * 6},
    )

    mask = volume_spike_cluster(ctx, cluster_window_bars=2)

    assert bool(mask.iloc[24]) is True
    assert bool(mask.iloc[26]) is True


def test_volume_spike_cluster_rejects_invalid_window(make_ctx) -> None:
    ctx = make_ctx(close=[100.0] * 12)
    with pytest.raises(ValueError):
        volume_spike_cluster(ctx, cluster_window_bars=0)
