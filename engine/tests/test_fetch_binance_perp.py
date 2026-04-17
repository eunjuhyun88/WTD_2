from __future__ import annotations

import pandas as pd

from data_cache import fetch_binance_perp as perp_mod


def test_fetch_perp_max_forward_fills_recent_funding_into_hourly_grid(monkeypatch):
    funding_index = pd.to_datetime(
        ["2026-04-14T00:00:00Z", "2026-04-14T08:00:00Z"],
        utc=True,
    )
    funding = pd.DataFrame(
        {"funding_rate": [-0.001, 0.002]},
        index=funding_index,
    )

    oi_index = pd.date_range("2026-04-14T07:00:00Z", periods=4, freq="1h", tz="UTC")
    oi = pd.DataFrame(
        {
            "oi_change_1h": [0.01, 0.12, 0.04, 0.02],
            "oi_change_24h": [0.05, 0.18, 0.11, 0.08],
        },
        index=oi_index,
    )
    ls = pd.DataFrame(
        {"long_short_ratio": [1.1, 1.2, 1.3, 1.4]},
        index=oi_index,
    )

    monkeypatch.setattr(perp_mod, "fetch_funding_rate", lambda symbol: funding)
    monkeypatch.setattr(perp_mod, "fetch_oi_hist", lambda symbol: oi)
    monkeypatch.setattr(perp_mod, "fetch_ls_ratio", lambda symbol: ls)
    monkeypatch.setattr(perp_mod.time, "sleep", lambda _: None)

    merged = perp_mod.fetch_perp_max("PTBUSDT")

    assert merged.loc[pd.Timestamp("2026-04-14T08:00:00Z"), "funding_rate"] == 0.002
    assert merged.loc[pd.Timestamp("2026-04-14T09:00:00Z"), "funding_rate"] == 0.002
    assert merged.loc[pd.Timestamp("2026-04-14T10:00:00Z"), "funding_rate"] == 0.002
