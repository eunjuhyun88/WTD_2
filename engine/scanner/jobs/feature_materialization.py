"""Feature-plane materialization job.

This is the first executable bridge from cached market data into the durable
feature plane.
"""
from __future__ import annotations

from typing import Any

import pandas as pd

from data_cache.loader import load_klines, load_perp
from features.materialization import materialize_window_bundle
from features.materialization_store import FeatureMaterializationStore


def _raw_market_rows(bars: pd.DataFrame, *, venue: str, symbol: str, timeframe: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for ts, row in bars.iterrows():
        rows.append(
            {
                "venue": venue,
                "symbol": symbol,
                "timeframe": timeframe,
                "ts": ts.isoformat(),
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": float(row.get("volume", 0.0)),
                "quote_volume": float(row.get("quote_volume", 0.0)) if row.get("quote_volume") is not None else None,
                "trade_count": int(row.get("trade_count", 0)) if row.get("trade_count") is not None else None,
                "vwap": float(row.get("vwap")) if row.get("vwap") is not None else None,
            }
        )
    return rows


def _raw_perp_rows(
    perp: pd.DataFrame | None,
    *,
    venue: str,
    symbol: str,
    timeframe: str,
    index: pd.Index,
) -> list[dict[str, Any]]:
    if perp is None or perp.empty:
        return []
    aligned = perp.reindex(index, method="ffill")
    rows: list[dict[str, Any]] = []
    for ts, row in aligned.iterrows():
        rows.append(
            {
                "venue": venue,
                "symbol": symbol,
                "timeframe": timeframe,
                "ts": ts.isoformat(),
                "open_interest": float(row.get("open_interest")) if row.get("open_interest") is not None else None,
                "funding_rate": float(row.get("funding_rate")) if row.get("funding_rate") is not None else None,
                "long_short_ratio": float(row.get("long_short_ratio")) if row.get("long_short_ratio") is not None else None,
                "long_liq_value": float(row.get("long_liq_value")) if row.get("long_liq_value") is not None else None,
                "short_liq_value": float(row.get("short_liq_value")) if row.get("short_liq_value") is not None else None,
                "liq_density": float(row.get("liq_density")) if row.get("liq_density") is not None else None,
                "mark_price": float(row.get("mark_price")) if row.get("mark_price") is not None else None,
                "index_price": float(row.get("index_price")) if row.get("index_price") is not None else None,
            }
        )
    return rows


def _raw_orderflow_rows(bars: pd.DataFrame, *, venue: str, symbol: str, timeframe: str) -> list[dict[str, Any]]:
    taker_buy = bars["taker_buy_base_volume"] if "taker_buy_base_volume" in bars.columns else pd.Series(index=bars.index, data=0.0)
    volume = bars["volume"]
    taker_sell = (volume - taker_buy).clip(lower=0.0)
    delta = taker_buy - taker_sell
    cvd = delta.cumsum()
    denom = volume.replace(0.0, pd.NA)
    rows: list[dict[str, Any]] = []
    for idx, ts in enumerate(bars.index):
        imbalance_denominator = denom.iloc[idx]
        rows.append(
            {
                "venue": venue,
                "symbol": symbol,
                "timeframe": timeframe,
                "ts": ts.isoformat(),
                "cvd": float(cvd.iloc[idx]),
                "taker_buy_volume": float(taker_buy.iloc[idx]),
                "taker_sell_volume": float(taker_sell.iloc[idx]),
                "buy_sell_delta": float(delta.iloc[idx]),
                "bid_ask_imbalance": float(delta.iloc[idx] / imbalance_denominator)
                if pd.notna(imbalance_denominator)
                else 0.0,
            }
        )
    return rows


def materialize_symbol_window(
    *,
    symbol: str,
    timeframe: str = "1h",
    venue: str = "binance",
    window_bars: int = 64,
    pattern_family: str | None = None,
    offline: bool = False,
    store: FeatureMaterializationStore | None = None,
    bars: pd.DataFrame | None = None,
    perp: pd.DataFrame | None = None,
) -> dict[str, Any]:
    store = store or FeatureMaterializationStore()
    bars_df = bars if bars is not None else load_klines(symbol, timeframe, offline=offline)
    perp_df = perp if perp is not None else load_perp(symbol, offline=offline)

    window = bars_df.sort_index().tail(window_bars)
    store.upsert_market_bars(_raw_market_rows(window, venue=venue, symbol=symbol, timeframe=timeframe))
    store.upsert_orderflow_metrics(_raw_orderflow_rows(window, venue=venue, symbol=symbol, timeframe=timeframe))
    store.upsert_perp_metrics(
        _raw_perp_rows(perp_df, venue=venue, symbol=symbol, timeframe=timeframe, index=window.index)
    )

    bundle = materialize_window_bundle(
        bars_df,
        venue=venue,
        symbol=symbol,
        timeframe=timeframe,
        perp=perp_df,
        window_bars=window_bars,
        pattern_family=pattern_family,
    )
    store.upsert_feature_windows([bundle.feature_window])
    if bundle.pattern_event is not None:
        store.upsert_pattern_events([bundle.pattern_event])
    store.upsert_search_corpus_signatures([bundle.search_signature])

    return {
        "feature_window": bundle.feature_window,
        "pattern_event": bundle.pattern_event,
        "search_signature": bundle.search_signature,
    }
