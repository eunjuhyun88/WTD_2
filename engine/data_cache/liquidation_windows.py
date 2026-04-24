"""Canonical liquidation window materialization from raw event truth."""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime, timezone

import pandas as pd

from data_cache.raw_store import MarketLiquidationWindowRecord

DEFAULT_LIQUIDATION_WINDOW_TIMEFRAMES: tuple[str, ...] = ("1h", "4h")


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _series_or_default(frame: pd.DataFrame, column: str, default: object) -> pd.Series:
    if column in frame.columns:
        return frame[column]
    return pd.Series([default] * len(frame), index=frame.index)


def _coerce_events_frame(events: Sequence[Mapping[str, object]] | pd.DataFrame) -> pd.DataFrame:
    if isinstance(events, pd.DataFrame):
        frame = events.copy()
    else:
        frame = pd.DataFrame([dict(row) for row in events])
    if frame.empty:
        return pd.DataFrame()

    if "ts" in frame.columns:
        if pd.api.types.is_integer_dtype(frame["ts"]) or pd.api.types.is_float_dtype(frame["ts"]):
            timestamps = pd.to_datetime(frame["ts"], unit="ms", utc=True)
        else:
            timestamps = pd.to_datetime(frame["ts"], utc=True, format="mixed")
    else:
        timestamps = pd.to_datetime(frame.index, utc=True, format="mixed")

    frame = frame.copy()
    frame["timestamp"] = timestamps
    frame["provider"] = _series_or_default(frame, "provider", "binance").fillna("binance").astype(str)
    frame["venue"] = _series_or_default(frame, "venue", "binance_futures").fillna("binance_futures").astype(str)
    frame["quality_state"] = _series_or_default(frame, "quality_state", "complete").fillna("complete").astype(str)
    frame["fallback_state"] = _series_or_default(frame, "fallback_state", "none").fillna("none").astype(str)
    frame["side"] = _series_or_default(frame, "side", "").fillna("").astype(str).str.upper()

    for col in ("notional_usd", "order_price", "average_price", "quantity", "executed_quantity"):
        if col in frame.columns:
            frame[col] = pd.to_numeric(frame[col], errors="coerce")
        else:
            frame[col] = pd.Series(index=frame.index, dtype=float)

    missing_notional = frame["notional_usd"].isna() | (frame["notional_usd"] <= 0)
    fallback_price = frame["average_price"].where(frame["average_price"].notna(), frame["order_price"])
    fallback_qty = frame["executed_quantity"].where(frame["executed_quantity"].notna(), frame["quantity"])
    frame.loc[missing_notional, "notional_usd"] = fallback_price[missing_notional] * fallback_qty[missing_notional]
    frame["notional_usd"] = frame["notional_usd"].fillna(0.0)

    return frame.set_index("timestamp").sort_index()


def _single_or_mixed(values: pd.Series, default: str) -> str:
    uniques = {str(v) for v in values.dropna().tolist() if str(v)}
    if not uniques:
        return default
    if len(uniques) == 1:
        return next(iter(uniques))
    return "mixed"


def _derive_liquidation_side_metrics(
    *,
    short_liq_usd: float,
    long_liq_usd: float,
    total_liq_usd: float,
) -> tuple[str, float | None, float | None]:
    if total_liq_usd <= 0:
        return "none", None, None
    dominance_share = max(short_liq_usd, long_liq_usd) / total_liq_usd
    imbalance_ratio = (short_liq_usd - long_liq_usd) / total_liq_usd
    if short_liq_usd > long_liq_usd:
        return "short_liq", dominance_share, imbalance_ratio
    if long_liq_usd > short_liq_usd:
        return "long_liq", dominance_share, imbalance_ratio
    return "balanced", dominance_share, imbalance_ratio


def build_liquidation_window_records(
    *,
    symbol: str,
    events: Sequence[Mapping[str, object]] | pd.DataFrame,
    ingested_at: datetime,
    timeframes: Sequence[str] = DEFAULT_LIQUIDATION_WINDOW_TIMEFRAMES,
) -> list[MarketLiquidationWindowRecord]:
    frame = _coerce_events_frame(events)
    if frame.empty:
        return []

    ingested_at_utc = _ensure_utc(ingested_at)
    records: list[MarketLiquidationWindowRecord] = []

    for timeframe in timeframes:
        grouped = frame.copy()
        grouped["window_start"] = grouped.index.floor(timeframe)
        for window_start, batch in grouped.groupby("window_start", sort=True):
            window_start_ts = pd.Timestamp(window_start).tz_convert("UTC")
            window_end_ts = window_start_ts + pd.Timedelta(timeframe)
            notional = batch["notional_usd"].astype(float)
            short_mask = batch["side"] == "BUY"
            long_mask = batch["side"] == "SELL"

            short_liq_usd = float(notional[short_mask].sum())
            long_liq_usd = float(notional[long_mask].sum())
            total_liq_usd = float(notional.sum())
            net_liq_usd = short_liq_usd - long_liq_usd
            dominant_side, dominant_share, imbalance_ratio = _derive_liquidation_side_metrics(
                short_liq_usd=short_liq_usd,
                long_liq_usd=long_liq_usd,
                total_liq_usd=total_liq_usd,
            )

            largest_event_usd = None
            largest_event_side = None
            if notional.notna().any():
                largest_idx = notional.idxmax()
                largest_event_usd = float(notional.loc[largest_idx])
                largest_event_side = str(batch.loc[largest_idx, "side"]) or None

            source_start_ts = batch.index.min().to_pydatetime()
            source_end_ts = batch.index.max().to_pydatetime()
            freshness_ms = max(
                0,
                int((ingested_at_utc - _ensure_utc(source_end_ts)).total_seconds() * 1000),
            )

            records.append(
                MarketLiquidationWindowRecord(
                    provider=_single_or_mixed(batch["provider"], "binance"),
                    venue=_single_or_mixed(batch["venue"], "binance_futures"),
                    symbol=symbol,
                    timeframe=str(timeframe),
                    window_start_ts=window_start_ts.to_pydatetime(),
                    window_end_ts=window_end_ts.to_pydatetime(),
                    source_start_ts=source_start_ts,
                    source_end_ts=source_end_ts,
                    ingested_at=ingested_at_utc,
                    freshness_ms=freshness_ms,
                    quality_state=(
                        "complete"
                        if (batch["quality_state"] == "complete").all()
                        else "partial"
                    ),
                    fallback_state=_single_or_mixed(batch["fallback_state"], "none"),
                    event_count=int(len(batch)),
                    short_event_count=int(short_mask.sum()),
                    long_event_count=int(long_mask.sum()),
                    short_liq_usd=short_liq_usd,
                    long_liq_usd=long_liq_usd,
                    total_liq_usd=total_liq_usd,
                    net_liq_usd=net_liq_usd,
                    dominant_side=dominant_side,
                    dominance_share=dominant_share,
                    imbalance_ratio=imbalance_ratio,
                    largest_event_usd=largest_event_usd,
                    largest_event_side=largest_event_side,
                )
            )
    return records


def build_liquidation_window_records_from_history(
    *,
    symbol: str,
    timeframe: str,
    history: pd.DataFrame,
    ingested_at: datetime,
    provider: str = "coinalyze",
    venue: str = "coinalyze_market_wide",
) -> list[MarketLiquidationWindowRecord]:
    if history.empty:
        return []

    frame = history.copy()
    frame.index = pd.to_datetime(frame.index, utc=True, format="mixed")
    frame = frame.sort_index()
    frame["long_liq_usd"] = pd.to_numeric(frame.get("long_liq_usd"), errors="coerce").fillna(0.0)
    frame["short_liq_usd"] = pd.to_numeric(frame.get("short_liq_usd"), errors="coerce").fillna(0.0)

    window_delta = pd.Timedelta(timeframe)
    ingested_at_utc = _ensure_utc(ingested_at)
    records: list[MarketLiquidationWindowRecord] = []

    for window_start, row in frame.iterrows():
        window_start_ts = pd.Timestamp(window_start).tz_convert("UTC").floor(timeframe)
        window_end_ts = window_start_ts + window_delta
        short_liq_usd = float(row["short_liq_usd"])
        long_liq_usd = float(row["long_liq_usd"])
        total_liq_usd = short_liq_usd + long_liq_usd
        dominant_side, dominance_share, imbalance_ratio = _derive_liquidation_side_metrics(
            short_liq_usd=short_liq_usd,
            long_liq_usd=long_liq_usd,
            total_liq_usd=total_liq_usd,
        )
        quality_state = "complete" if pd.notna(row["short_liq_usd"]) and pd.notna(row["long_liq_usd"]) else "partial"
        freshness_ms = max(
            0,
            int((ingested_at_utc - window_end_ts.to_pydatetime()).total_seconds() * 1000),
        )

        records.append(
            MarketLiquidationWindowRecord(
                provider=provider,
                venue=venue,
                symbol=symbol,
                timeframe=timeframe,
                window_start_ts=window_start_ts.to_pydatetime(),
                window_end_ts=window_end_ts.to_pydatetime(),
                source_start_ts=window_start_ts.to_pydatetime(),
                source_end_ts=window_end_ts.to_pydatetime(),
                ingested_at=ingested_at_utc,
                freshness_ms=freshness_ms,
                quality_state=quality_state,
                fallback_state="none",
                event_count=0,
                short_event_count=0,
                long_event_count=0,
                short_liq_usd=short_liq_usd,
                long_liq_usd=long_liq_usd,
                total_liq_usd=total_liq_usd,
                net_liq_usd=short_liq_usd - long_liq_usd,
                dominant_side=dominant_side,
                dominance_share=dominance_share,
                imbalance_ratio=imbalance_ratio,
                largest_event_usd=None,
                largest_event_side=None,
            )
        )
    return records
