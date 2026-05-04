"""Live indicator snapshot fetcher for AI agent enrichment.

When /agent/judge is called without an indicator_snapshot, this module
auto-fetches recent klines from Binance and computes RSI/MACD/BB/ATR
indicators so the LLM has real data to reason about.

Usage:
    snapshot = await fetch_indicator_snapshot("BTCUSDT", "4h")
    # -> {"rsi": 54.2, "macd_hist": 123.4, "bb_pct_b": 0.62, ...}

Falls back to empty dict on any error (non-fatal — judge degrades gracefully).
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

log = logging.getLogger("engine.agents.live_snapshot")

# How many recent bars to keep for indicator computation.
# 100 bars is enough for MACD(26) + some history buffer.
_SNAPSHOT_BARS = 100

# Timeframe -> Binance interval string mapping
_TF_TO_BINANCE: dict[str, str] = {
    "1m": "1m",
    "3m": "3m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1h",
    "2h": "2h",
    "4h": "4h",
    "6h": "6h",
    "8h": "8h",
    "12h": "12h",
    "1d": "1d",
    "3d": "3d",
    "1w": "1w",
}


def _compute_snapshot_sync(symbol: str, timeframe: str) -> dict[str, float]:
    """Synchronous: load cached klines, extend with recent bars, compute indicators."""
    import math
    import pandas as pd
    from data_cache.loader import load_klines
    from data_cache.indicator_calc import IndicatorEngine

    # 1. Try loading from cache (offline first — fast)
    df: pd.DataFrame | None = None
    try:
        df = load_klines(symbol, timeframe, offline=True)
    except Exception:
        pass

    # 2. If cache miss or stale (>4 bars old), fetch recent bars from Binance
    if df is None or df.empty:
        try:
            from data_cache.fetch_binance import _fetch_batch
            import time as _time
            from datetime import datetime, timezone

            binance_tf = _TF_TO_BINANCE.get(timeframe, "1h")
            end_ms = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
            batch = _fetch_batch(symbol, binance_tf, end_ms)
            if not batch:
                log.warning("[live_snapshot] no Binance data for %s/%s", symbol, timeframe)
                return {}

            recent = pd.DataFrame(
                batch,
                columns=[
                    "open_time", "open", "high", "low", "close", "volume",
                    "close_time", "quote_volume", "trades",
                    "taker_buy_base_volume", "taker_buy_quote_volume", "ignore",
                ],
            )
            for col in ["open", "high", "low", "close", "volume"]:
                recent[col] = recent[col].astype(float)
            recent["timestamp"] = pd.to_datetime(recent["open_time"], unit="ms", utc=True)
            df = recent.set_index("timestamp")[["open", "high", "low", "close", "volume"]]
        except Exception as exc:
            log.warning("[live_snapshot] Binance fetch failed for %s: %s", symbol, exc)
            return {}

    # 3. Keep last N bars for indicator computation
    df = df.tail(_SNAPSHOT_BARS).copy()
    if len(df) < 30:
        log.warning("[live_snapshot] too few bars (%d) for %s/%s", len(df), symbol, timeframe)
        return {}

    # 4. Compute indicators
    try:
        eng = IndicatorEngine()
        df_ind = eng.compute(df)
        row = df_ind.iloc[-1]

        snapshot: dict[str, float] = {}
        for col in ["rsi", "macd", "macd_signal", "macd_hist",
                    "bb_upper", "bb_lower", "bb_pct_b",
                    "atr", "atr_pct",
                    "vol_ratio", "vol_ma_20",
                    "ret_1h", "ret_4h", "ret_24h",
                    "ema_9", "ema_21", "ema_cross"]:
            val = row.get(col)
            if val is not None:
                try:
                    f = float(val)
                    if math.isfinite(f):
                        snapshot[col] = round(f, 6)
                except (TypeError, ValueError):
                    pass

        # Add current close price for context
        close = row.get("close")
        if close is not None:
            try:
                snapshot["price"] = round(float(close), 4)
            except (TypeError, ValueError):
                pass

        log.debug("[live_snapshot] computed %d indicators for %s/%s", len(snapshot), symbol, timeframe)
        return snapshot

    except Exception as exc:
        log.warning("[live_snapshot] indicator compute failed for %s: %s", symbol, exc)
        return {}


async def fetch_indicator_snapshot(symbol: str, timeframe: str) -> dict[str, float]:
    """Async wrapper: fetch + compute indicator snapshot in a worker thread.

    Returns {} on any error — caller should treat empty dict as degraded mode.
    """
    try:
        return await asyncio.to_thread(_compute_snapshot_sync, symbol, timeframe)
    except Exception as exc:
        log.warning("[live_snapshot] unexpected error for %s/%s: %s", symbol, timeframe, exc)
        return {}
