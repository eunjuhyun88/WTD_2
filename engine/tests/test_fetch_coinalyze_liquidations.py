from __future__ import annotations

from datetime import datetime, timezone

from data_cache import fetch_coinalyze_liquidations as liq_mod


def test_fetch_coinalyze_liquidation_history_normalizes_history(monkeypatch) -> None:
    end_time = datetime(2026, 4, 24, 2, 0, tzinfo=timezone.utc)
    captured: dict[str, object] = {}

    def _fake_fetch_json(endpoint: str, params: dict[str, str]) -> list[dict]:
        captured["endpoint"] = endpoint
        captured["params"] = params
        return [
            {
                "symbol": "BTCUSDT_PERP.A",
                "history": [
                    {"t": 1776992400, "l": 120.0, "s": 80.0},
                    {"t": 1776996000, "l": 95.0, "s": 140.0},
                ],
            }
        ]

    monkeypatch.setattr(liq_mod, "_fetch_json", _fake_fetch_json)

    frame = liq_mod.fetch_coinalyze_liquidation_history(
        "BTCUSDT",
        timeframe="1h",
        limit=2,
        end_time=end_time,
    )

    assert captured["endpoint"] == "liquidation-history"
    assert captured["params"] == {
        "symbols": "BTCUSDT_PERP.A",
        "interval": "1hour",
        "from": str(int(end_time.timestamp()) - 2 * 3600),
        "to": str(int(end_time.timestamp())),
    }
    assert list(frame.columns) == ["long_liq_usd", "short_liq_usd"]
    assert len(frame) == 2
    assert frame.iloc[0]["long_liq_usd"] == 120.0
    assert frame.iloc[1]["short_liq_usd"] == 140.0
