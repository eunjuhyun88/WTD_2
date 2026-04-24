from __future__ import annotations

from datetime import datetime, timezone

from data_cache.liquidation_windows import build_liquidation_window_records


def test_build_liquidation_window_records_aggregates_1h_and_4h() -> None:
    ingested_at = datetime(2026, 4, 24, 2, 0, tzinfo=timezone.utc)
    events = [
        {
            "provider": "binance",
            "venue": "binance_futures",
            "side": "BUY",
            "notional_usd": 500.0,
            "quality_state": "complete",
            "fallback_state": "none",
            "ts": int(datetime(2026, 4, 24, 0, 15, tzinfo=timezone.utc).timestamp() * 1000),
        },
        {
            "provider": "binance",
            "venue": "binance_futures",
            "side": "SELL",
            "notional_usd": 300.0,
            "quality_state": "complete",
            "fallback_state": "none",
            "ts": int(datetime(2026, 4, 24, 0, 45, tzinfo=timezone.utc).timestamp() * 1000),
        },
        {
            "provider": "binance",
            "venue": "binance_futures",
            "side": "BUY",
            "notional_usd": 200.0,
            "quality_state": "complete",
            "fallback_state": "none",
            "ts": int(datetime(2026, 4, 24, 1, 10, tzinfo=timezone.utc).timestamp() * 1000),
        },
    ]

    records = build_liquidation_window_records(
        symbol="BTCUSDT",
        events=events,
        ingested_at=ingested_at,
    )

    one_hour = [row for row in records if row.timeframe == "1h"]
    four_hour = [row for row in records if row.timeframe == "4h"]

    assert len(one_hour) == 2
    assert len(four_hour) == 1

    first_hour = one_hour[0]
    assert first_hour.short_liq_usd == 500.0
    assert first_hour.long_liq_usd == 300.0
    assert first_hour.total_liq_usd == 800.0
    assert first_hour.dominant_side == "short_liq"

    aggregate = four_hour[0]
    assert aggregate.event_count == 3
    assert aggregate.short_liq_usd == 700.0
    assert aggregate.long_liq_usd == 300.0
    assert aggregate.total_liq_usd == 1000.0
    assert aggregate.dominant_side == "short_liq"
