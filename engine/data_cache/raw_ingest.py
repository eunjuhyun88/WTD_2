"""Canonical raw ingestion helpers."""
from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

from data_cache.fetch_binance import fetch_klines_max
from data_cache.binance_credentials import resolve_binance_api_key
from data_cache.fetch_binance_liquidations import (
    empty_force_orders_frame,
    fetch_force_orders_range,
)
from data_cache.liquidation_windows import build_liquidation_window_records
from data_cache.fetch_binance_perp import fetch_futures_klines_max, fetch_perp_raw
from data_cache.loader import CACHE_DIR, cache_path, perp_cache_path
from data_cache.resample import tf_string_to_minutes
from data_cache.raw_store import (
    DEFAULT_DB_PATH,
    CanonicalRawStore,
    RawLiquidationEventRecord,
    RawMarketBarRecord,
    MarketLiquidationWindowRecord,
    RawOrderflowMetricRecord,
    RawPerpMetricRecord,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_timestamp(value: object) -> pd.Timestamp:
    ts = pd.Timestamp(value)
    if ts.tzinfo is None:
        return ts.tz_localize("UTC")
    return ts.tz_convert("UTC")


def _freshness_ms(ingested_at: datetime, source_ts: pd.Timestamp) -> int:
    return max(0, int((ingested_at - source_ts.to_pydatetime()).total_seconds() * 1000))


def _bucket_timestamp(source_ts: pd.Timestamp, timeframe: str) -> pd.Timestamp:
    minutes = tf_string_to_minutes(timeframe)
    return source_ts.floor(f"{minutes}min")


def _persist_legacy_cache(df: pd.DataFrame, path: Path) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(path)


def _legacy_perp_cache_frame(perp_raw: pd.DataFrame) -> pd.DataFrame:
    perp_cache = perp_raw.copy()
    perp_cache["funding_rate"] = perp_cache["funding_rate"].sort_index().ffill(limit=8).fillna(0.0)
    perp_cache["oi_raw"] = perp_cache["oi_raw"].fillna(0.0)
    perp_cache["oi_change_1h"] = perp_cache["oi_change_1h"].fillna(0.0)
    perp_cache["oi_change_24h"] = perp_cache["oi_change_24h"].fillna(0.0)
    perp_cache["long_short_ratio"] = perp_cache["long_short_ratio"].fillna(1.0)
    return perp_cache


def fetch_binance_market_bars(symbol: str, timeframe: str) -> tuple[pd.DataFrame, str, str]:
    fallback_state = "none"
    try:
        return fetch_klines_max(symbol, timeframe), "binance_spot", fallback_state
    except RuntimeError as exc:
        message = str(exc)
        if "Invalid symbol" not in message and "no klines returned" not in message:
            raise
    return (
        fetch_futures_klines_max(symbol, timeframe),
        "binance_futures",
        "spot_invalid_symbol_futures",
    )


def _normalize_market_bars(
    *,
    symbol: str,
    timeframe: str,
    bars: pd.DataFrame,
    venue: str,
    fallback_state: str,
    ingested_at: datetime,
) -> list[RawMarketBarRecord]:
    rows: list[RawMarketBarRecord] = []
    for ts, row in bars.sort_index().iterrows():
        source_ts = _as_timestamp(ts)
        bucket_ts = _bucket_timestamp(source_ts, timeframe)
        rows.append(
            RawMarketBarRecord(
                provider="binance",
                venue=venue,
                symbol=symbol,
                timeframe=timeframe,
                ts=bucket_ts.to_pydatetime(),
                source_ts=source_ts.to_pydatetime(),
                ingested_at=ingested_at,
                freshness_ms=_freshness_ms(ingested_at, source_ts),
                quality_state="complete",
                fallback_state=fallback_state,
                open=float(row["open"]),
                high=float(row["high"]),
                low=float(row["low"]),
                close=float(row["close"]),
                volume=float(row["volume"]) if pd.notna(row.get("volume")) else None,
                quote_volume=float(row["quote_volume"]) if pd.notna(row.get("quote_volume")) else None,
                trade_count=int(row["trade_count"]) if pd.notna(row.get("trade_count")) else None,
                taker_buy_base_volume=(
                    float(row["taker_buy_base_volume"])
                    if pd.notna(row.get("taker_buy_base_volume"))
                    else None
                ),
                taker_buy_quote_volume=(
                    float(row["taker_buy_quote_volume"])
                    if pd.notna(row.get("taker_buy_quote_volume"))
                    else None
                ),
            )
        )
    return rows


def _normalize_orderflow_metrics(
    *,
    symbol: str,
    timeframe: str,
    bars: pd.DataFrame,
    venue: str,
    fallback_state: str,
    ingested_at: datetime,
) -> list[RawOrderflowMetricRecord]:
    rows: list[RawOrderflowMetricRecord] = []
    for ts, row in bars.sort_index().iterrows():
        source_ts = _as_timestamp(ts)
        bucket_ts = _bucket_timestamp(source_ts, timeframe)
        volume = float(row["volume"]) if pd.notna(row.get("volume")) else None
        taker_buy_volume = (
            float(row["taker_buy_base_volume"])
            if pd.notna(row.get("taker_buy_base_volume"))
            else None
        )
        taker_buy_quote_volume = (
            float(row["taker_buy_quote_volume"])
            if pd.notna(row.get("taker_buy_quote_volume"))
            else None
        )
        taker_sell_volume = None
        buy_sell_delta = None
        taker_buy_ratio = None
        if volume is not None and taker_buy_volume is not None:
            taker_sell_volume = max(0.0, volume - taker_buy_volume)
            buy_sell_delta = taker_buy_volume - taker_sell_volume
            taker_buy_ratio = taker_buy_volume / volume if volume > 0 else 0.5
        taker_sell_quote_volume = None
        quote_volume = float(row["quote_volume"]) if pd.notna(row.get("quote_volume")) else None
        if quote_volume is not None and taker_buy_quote_volume is not None:
            taker_sell_quote_volume = max(0.0, quote_volume - taker_buy_quote_volume)
        quality_state = "complete" if taker_buy_volume is not None else "partial"
        rows.append(
            RawOrderflowMetricRecord(
                provider="binance",
                venue=venue,
                symbol=symbol,
                timeframe=timeframe,
                ts=bucket_ts.to_pydatetime(),
                source_ts=source_ts.to_pydatetime(),
                ingested_at=ingested_at,
                freshness_ms=_freshness_ms(ingested_at, source_ts),
                quality_state=quality_state,
                fallback_state=fallback_state,
                taker_buy_volume=taker_buy_volume,
                taker_sell_volume=taker_sell_volume,
                buy_sell_delta=buy_sell_delta,
                taker_buy_quote_volume=taker_buy_quote_volume,
                taker_sell_quote_volume=taker_sell_quote_volume,
                taker_buy_ratio=taker_buy_ratio,
                trade_count=int(row["trade_count"]) if pd.notna(row.get("trade_count")) else None,
            )
        )
    return rows


def _normalize_perp_metrics(
    *,
    symbol: str,
    timeframe: str,
    perp: pd.DataFrame,
    ingested_at: datetime,
) -> list[RawPerpMetricRecord]:
    rows: list[RawPerpMetricRecord] = []
    for ts, row in perp.sort_index().iterrows():
        source_ts = _as_timestamp(ts)
        bucket_ts = _bucket_timestamp(source_ts, timeframe)
        observed_values = [
            row.get("funding_rate"),
            row.get("oi_raw"),
            row.get("long_short_ratio"),
        ]
        quality_state = "complete" if all(pd.notna(v) for v in observed_values) else "partial"
        rows.append(
            RawPerpMetricRecord(
                provider="binance",
                venue="binance_futures",
                symbol=symbol,
                timeframe=timeframe,
                ts=bucket_ts.to_pydatetime(),
                source_ts=source_ts.to_pydatetime(),
                ingested_at=ingested_at,
                freshness_ms=_freshness_ms(ingested_at, source_ts),
                quality_state=quality_state,
                fallback_state="none",
                funding_rate=float(row["funding_rate"]) if pd.notna(row.get("funding_rate")) else None,
                open_interest=float(row["oi_raw"]) if pd.notna(row.get("oi_raw")) else None,
                oi_change_1h=float(row["oi_change_1h"]) if pd.notna(row.get("oi_change_1h")) else None,
                oi_change_24h=float(row["oi_change_24h"]) if pd.notna(row.get("oi_change_24h")) else None,
                long_short_ratio=(
                    float(row["long_short_ratio"])
                    if pd.notna(row.get("long_short_ratio"))
                    else None
                ),
            )
        )
    return rows


def fetch_binance_liquidation_events(
    symbol: str,
    *,
    lookback_hours: int,
) -> tuple[pd.DataFrame, str]:
    if lookback_hours <= 0:
        return empty_force_orders_frame(), "disabled"
    try:
        frame = fetch_force_orders_range(symbol, lookback_hours=lookback_hours)
    except RuntimeError as exc:
        message = str(exc)
        if (
            "Invalid symbol" in message
            or "HTTP 401" in message
            or "HTTP 403" in message
            or "API-key" in message
        ):
            return empty_force_orders_frame(), "unavailable"
        raise
    return frame, ("ok" if not frame.empty else "empty")


def _normalize_liquidation_events(
    *,
    symbol: str,
    events: pd.DataFrame,
    ingested_at: datetime,
) -> list[RawLiquidationEventRecord]:
    rows: list[RawLiquidationEventRecord] = []
    for ts, row in events.sort_index().iterrows():
        source_ts = _as_timestamp(ts)
        side = str(row.get("side") or "")
        quality_state = (
            "complete"
            if side and (
                pd.notna(row.get("notional_usd"))
                or (
                    pd.notna(row.get("order_price"))
                    and (
                        pd.notna(row.get("executed_quantity"))
                        or pd.notna(row.get("quantity"))
                    )
                )
            )
            else "partial"
        )
        rows.append(
            RawLiquidationEventRecord(
                provider="binance",
                venue="binance_futures",
                symbol=symbol,
                ts=source_ts.to_pydatetime(),
                source_ts=source_ts.to_pydatetime(),
                ingested_at=ingested_at,
                freshness_ms=_freshness_ms(ingested_at, source_ts),
                quality_state=quality_state,
                fallback_state="none",
                event_id=str(row["event_id"]),
                side=side,
                order_price=float(row["order_price"]) if pd.notna(row.get("order_price")) else None,
                average_price=(
                    float(row["average_price"])
                    if pd.notna(row.get("average_price"))
                    else None
                ),
                quantity=float(row["quantity"]) if pd.notna(row.get("quantity")) else None,
                executed_quantity=(
                    float(row["executed_quantity"])
                    if pd.notna(row.get("executed_quantity"))
                    else None
                ),
                quote_quantity=(
                    float(row["quote_quantity"])
                    if pd.notna(row.get("quote_quantity"))
                    else None
                ),
                notional_usd=(
                    float(row["notional_usd"])
                    if pd.notna(row.get("notional_usd"))
                    else None
                ),
                order_type=str(row["order_type"]) if pd.notna(row.get("order_type")) else None,
                time_in_force=(
                    str(row["time_in_force"])
                    if pd.notna(row.get("time_in_force"))
                    else None
                ),
                status=str(row["status"]) if pd.notna(row.get("status")) else None,
            )
        )
    return rows


def _materialize_liquidation_windows(
    *,
    store: CanonicalRawStore,
    symbol: str,
    ingested_at: datetime,
    lookback_hours: int,
) -> int:
    if lookback_hours <= 0:
        return 0
    since = ingested_at - timedelta(hours=lookback_hours)
    event_rows = store.load_liquidation_events(symbol=symbol, since=since)
    window_rows: list[MarketLiquidationWindowRecord] = build_liquidation_window_records(
        symbol=symbol,
        events=event_rows,
        ingested_at=ingested_at,
    )
    return store.upsert_liquidation_windows(window_rows)


@dataclass(frozen=True)
class RawIngestionResult:
    symbol: str
    timeframe: str
    venue: str
    fallback_state: str
    market_bars_written: int
    orderflow_metrics_written: int
    perp_metrics_written: int
    liquidation_status: str
    liquidation_credential_state: str
    liquidation_credential_env: str | None
    liquidation_lookback_hours: int
    liquidation_events_written: int
    liquidation_windows_written: int
    liquidation_source_scope: str
    latest_market_bar_ts: str | None
    latest_perp_ts: str | None
    latest_liquidation_ts: str | None
    db_path: str
    ingested_at: str

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def ingest_binance_symbol_raw(
    symbol: str,
    *,
    timeframe: str = "1h",
    store: CanonicalRawStore | None = None,
    refresh_cache: bool = True,
    include_liquidations: bool = False,
    liquidation_lookback_hours: int = 24,
) -> RawIngestionResult:
    store = store or CanonicalRawStore()
    ingested_at = _utcnow()

    market_bars, venue, fallback_state = fetch_binance_market_bars(symbol, timeframe)
    perp = fetch_perp_raw(symbol)
    if include_liquidations:
        liquidation_key_resolution = resolve_binance_api_key()
        liquidation_events, liquidation_status = fetch_binance_liquidation_events(
            symbol,
            lookback_hours=liquidation_lookback_hours,
        )
    else:
        liquidation_key_resolution = resolve_binance_api_key()
        liquidation_events = empty_force_orders_frame()
        liquidation_status = "disabled_user_data"

    if refresh_cache:
        _persist_legacy_cache(market_bars, cache_path(symbol, timeframe))
        _persist_legacy_cache(_legacy_perp_cache_frame(perp), perp_cache_path(symbol))

    market_rows = _normalize_market_bars(
        symbol=symbol,
        timeframe=timeframe,
        bars=market_bars,
        venue=venue,
        fallback_state=fallback_state,
        ingested_at=ingested_at,
    )
    orderflow_rows = _normalize_orderflow_metrics(
        symbol=symbol,
        timeframe=timeframe,
        bars=market_bars,
        venue=venue,
        fallback_state=fallback_state,
        ingested_at=ingested_at,
    )
    perp_rows = _normalize_perp_metrics(
        symbol=symbol,
        timeframe=timeframe,
        perp=perp,
        ingested_at=ingested_at,
    )
    liquidation_rows = _normalize_liquidation_events(
        symbol=symbol,
        events=liquidation_events,
        ingested_at=ingested_at,
    )

    store.delete_symbol_timeframe("raw_market_bars", symbol=symbol, timeframe=timeframe)
    store.delete_symbol_timeframe("raw_orderflow_metrics", symbol=symbol, timeframe=timeframe)
    store.delete_symbol_timeframe("raw_perp_metrics", symbol=symbol, timeframe=timeframe)

    market_written = store.upsert_market_bars(market_rows)
    orderflow_written = store.upsert_orderflow_metrics(orderflow_rows)
    perp_written = store.upsert_perp_metrics(perp_rows)
    liquidation_written = store.upsert_liquidation_events(liquidation_rows)
    liquidation_window_written = _materialize_liquidation_windows(
        store=store,
        symbol=symbol,
        ingested_at=ingested_at,
        lookback_hours=max(liquidation_lookback_hours, 4),
    )

    latest_market_ts = store.latest_timestamp(
        "raw_market_bars",
        symbol=symbol,
        timeframe=timeframe,
    )
    latest_perp_ts = store.latest_timestamp(
        "raw_perp_metrics",
        symbol=symbol,
        timeframe=timeframe,
    )
    latest_liquidation_ts = store.latest_timestamp(
        "raw_liquidation_events",
        symbol=symbol,
    )

    return RawIngestionResult(
        symbol=symbol,
        timeframe=timeframe,
        venue=venue,
        fallback_state=fallback_state,
        market_bars_written=market_written,
        orderflow_metrics_written=orderflow_written,
        perp_metrics_written=perp_written,
        liquidation_status=liquidation_status,
        liquidation_credential_state=liquidation_key_resolution.state,
        liquidation_credential_env=liquidation_key_resolution.env_var,
        liquidation_lookback_hours=liquidation_lookback_hours,
        liquidation_events_written=liquidation_written,
        liquidation_windows_written=liquidation_window_written,
        liquidation_source_scope="user_data",
        latest_market_bar_ts=latest_market_ts.isoformat() if latest_market_ts is not None else None,
        latest_perp_ts=latest_perp_ts.isoformat() if latest_perp_ts is not None else None,
        latest_liquidation_ts=(
            latest_liquidation_ts.isoformat()
            if latest_liquidation_ts is not None
            else None
        ),
        db_path=str(store.db_path),
        ingested_at=ingested_at.isoformat(),
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Fetch Binance raw data into the canonical raw store.")
    parser.add_argument("symbol", help="Binance symbol, e.g. BTCUSDT")
    parser.add_argument("--timeframe", default="1h", help="Binance timeframe label, default: 1h")
    parser.add_argument(
        "--db-path",
        default=str(DEFAULT_DB_PATH),
        help="SQLite database path for the canonical raw store",
    )
    parser.add_argument(
        "--no-cache-refresh",
        action="store_true",
        help="Do not refresh the legacy CSV cache while ingesting raw rows",
    )
    parser.add_argument(
        "--liquidation-lookback-hours",
        type=int,
        default=24,
        help="Recent liquidation event lookback window in hours, default: 24",
    )
    parser.add_argument(
        "--include-liquidations",
        action="store_true",
        help="Opt into Binance user-data force-order ingestion for this run",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    store = CanonicalRawStore(args.db_path)
    result = ingest_binance_symbol_raw(
        args.symbol,
        timeframe=args.timeframe,
        store=store,
        refresh_cache=not args.no_cache_refresh,
        include_liquidations=args.include_liquidations,
        liquidation_lookback_hours=args.liquidation_lookback_hours,
    )
    print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
