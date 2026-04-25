from __future__ import annotations

from datetime import datetime, timezone

from data_cache import fetch_binance_liquidations as liq_mod


def _row(
    order_id: int,
    *,
    side: str,
    price: str,
    qty: str,
    event_time_ms: int,
    avg_price: str | None = None,
    executed_qty: str | None = None,
    cum_quote: str | None = None,
) -> dict[str, object]:
    return {
        "orderId": order_id,
        "symbol": "BTCUSDT",
        "side": side,
        "price": price,
        "avgPrice": avg_price or price,
        "origQty": qty,
        "executedQty": executed_qty or qty,
        "cumQuote": cum_quote or str(float(price) * float(qty)),
        "type": "LIMIT",
        "timeInForce": "IOC",
        "status": "FILLED",
        "time": event_time_ms,
        "updateTime": event_time_ms,
    }


def test_fetch_force_orders_range_paginates_and_normalizes(monkeypatch) -> None:
    end_time = datetime(2026, 4, 24, 2, 0, tzinfo=timezone.utc)
    first_event_ms = int(datetime(2026, 4, 24, 1, 40, tzinfo=timezone.utc).timestamp() * 1000)
    second_event_ms = int(datetime(2026, 4, 24, 1, 10, tzinfo=timezone.utc).timestamp() * 1000)
    older_event_ms = int(datetime(2026, 4, 23, 23, 30, tzinfo=timezone.utc).timestamp() * 1000)

    calls: list[str] = []
    batches = [
        [
            _row(2, side="BUY", price="100", qty="5", event_time_ms=first_event_ms),
            _row(1, side="SELL", price="99", qty="4", event_time_ms=second_event_ms),
        ],
        [
            _row(1, side="SELL", price="99", qty="4", event_time_ms=second_event_ms),
            _row(0, side="BUY", price="98", qty="3", event_time_ms=older_event_ms),
        ],
    ]

    def _fake_fetch_json(path: str) -> list[dict]:
        calls.append(path)
        if len(calls) <= len(batches):
            return batches[len(calls) - 1]
        return []

    monkeypatch.setattr(liq_mod, "_fetch_json", _fake_fetch_json)
    monkeypatch.setattr(liq_mod.time, "sleep", lambda _: None)

    frame = liq_mod.fetch_force_orders_range(
        "BTCUSDT",
        lookback_hours=2,
        end_time=end_time,
        limit=2,
        max_pages=5,
    )

    assert len(frame) == 2
    assert list(frame["event_id"]) == ["1", "2"]
    assert frame.iloc[0]["notional_usd"] == 396.0
    assert frame.iloc[1]["side"] == "BUY"
    assert len(calls) == 2
