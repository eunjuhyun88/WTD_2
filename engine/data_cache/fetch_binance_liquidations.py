"""Binance USDT-M force-order fetcher for canonical raw liquidation events."""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

import pandas as pd

from data_cache.binance_credentials import resolve_binance_api_key

_FUTURES_URL = "https://fapi.binance.com"
_UA = "cogochi-autoresearch/data_cache"
_FORCE_ORDER_LIMIT = 100
_SLEEP_BETWEEN = 0.25

_FRAME_COLUMNS = [
    "event_id",
    "side",
    "order_price",
    "average_price",
    "quantity",
    "executed_quantity",
    "quote_quantity",
    "notional_usd",
    "order_type",
    "time_in_force",
    "status",
]


def _fetch_json(path: str) -> list[dict]:
    url = f"{_FUTURES_URL}{path}"
    headers = {"User-Agent": _UA}
    resolution = resolve_binance_api_key()
    if resolution.present and resolution.value is not None:
        headers["X-MBX-APIKEY"] = resolution.value
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:200]
        raise RuntimeError(f"HTTP {exc.code} for {path}: {body}") from exc
    if isinstance(payload, list):
        return payload
    if payload:
        return [payload]
    return []


def empty_force_orders_frame() -> pd.DataFrame:
    return pd.DataFrame(columns=_FRAME_COLUMNS)


def _row_event_time_ms(row: dict) -> int:
    value = row.get("time") or row.get("updateTime") or 0
    return int(value or 0)


def _float_or_none(value: object) -> float | None:
    if value in (None, ""):
        return None
    return float(value)


def _normalize_event_id(row: dict) -> str:
    order_id = row.get("orderId")
    if order_id not in (None, ""):
        return str(order_id)
    return ":".join(
        [
            str(row.get("side") or ""),
            str(_row_event_time_ms(row)),
            str(row.get("price") or ""),
            str(row.get("origQty") or row.get("executedQty") or ""),
        ]
    )


def _build_frame(rows: list[dict], *, start_ms: int, end_ms: int) -> pd.DataFrame:
    normalized: list[dict[str, object]] = []
    for row in rows:
        event_time_ms = _row_event_time_ms(row)
        if event_time_ms <= 0 or event_time_ms < start_ms or event_time_ms > end_ms:
            continue
        order_price = _float_or_none(row.get("price"))
        average_price = _float_or_none(row.get("avgPrice"))
        quantity = _float_or_none(row.get("origQty"))
        executed_quantity = _float_or_none(row.get("executedQty"))
        quote_quantity = _float_or_none(row.get("cumQuote"))
        price_for_notional = average_price if average_price not in (None, 0.0) else order_price
        quantity_for_notional = (
            executed_quantity
            if executed_quantity not in (None, 0.0)
            else quantity
        )
        notional_usd = quote_quantity
        if notional_usd in (None, 0.0) and price_for_notional is not None and quantity_for_notional is not None:
            notional_usd = price_for_notional * quantity_for_notional
        normalized.append(
            {
                "timestamp": pd.to_datetime(event_time_ms, unit="ms", utc=True),
                "event_id": _normalize_event_id(row),
                "side": str(row.get("side") or ""),
                "order_price": order_price,
                "average_price": average_price,
                "quantity": quantity,
                "executed_quantity": executed_quantity,
                "quote_quantity": quote_quantity,
                "notional_usd": notional_usd,
                "order_type": row.get("type"),
                "time_in_force": row.get("timeInForce"),
                "status": row.get("status"),
            }
        )
    if not normalized:
        return empty_force_orders_frame()

    frame = pd.DataFrame(normalized).sort_values(["timestamp", "event_id"])
    frame = frame.drop_duplicates(subset=["event_id"], keep="last")
    frame = frame.set_index("timestamp").sort_index()
    return frame[_FRAME_COLUMNS]


def fetch_force_orders_range(
    symbol: str,
    *,
    lookback_hours: int = 24,
    end_time: datetime | None = None,
    limit: int = _FORCE_ORDER_LIMIT,
    max_pages: int = 50,
) -> pd.DataFrame:
    """Fetch recent Binance futures force orders for `symbol`.

    The Binance endpoint is inherently recent-window oriented, so this fetcher
    pages backwards over a bounded horizon and returns normalized event rows
    indexed by UTC event timestamp.
    """
    if lookback_hours <= 0:
        return empty_force_orders_frame()

    limit = max(1, min(limit, _FORCE_ORDER_LIMIT))
    end_dt = end_time.astimezone(timezone.utc) if end_time is not None else datetime.now(timezone.utc)
    start_dt = end_dt - timedelta(hours=lookback_hours)
    requested_end_ms = int(end_dt.timestamp() * 1000)
    start_ms = int(start_dt.timestamp() * 1000)
    next_end_ms = requested_end_ms
    collected: list[dict] = []

    for page in range(max_pages):
        path = (
            f"/fapi/v1/forceOrders?symbol={symbol}"
            f"&limit={limit}&startTime={start_ms}&endTime={next_end_ms}"
        )
        batch = _fetch_json(path)
        if not batch:
            break
        collected.extend(batch)
        event_times = [_row_event_time_ms(row) for row in batch if _row_event_time_ms(row) > 0]
        if not event_times:
            break
        oldest_event_ms = min(event_times)
        if oldest_event_ms <= start_ms:
            break
        candidate_next_end_ms = oldest_event_ms - 1
        if candidate_next_end_ms >= next_end_ms:
            break
        next_end_ms = candidate_next_end_ms
        if page + 1 < max_pages:
            time.sleep(_SLEEP_BETWEEN)

    return _build_frame(collected, start_ms=start_ms, end_ms=requested_end_ms)
