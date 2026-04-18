"""GET /chart/klines — Redis-first OHLCV endpoint.

Query params:
  symbol  str   default BTCUSDT
  tf      str   default 4h  (1m/5m/15m/30m/1h/2h/4h/6h/12h/1d/1w)
  limit   int   default 200 (max 1000)

Response:
  { symbol, tf, limit, cached, bars: [{t, o, h, l, c, v}, …] }

Fast path (Redis hit):  < 10 ms
Slow path (CSV + resample):  CSV I/O + pandas, result written to Redis.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query, Request

from api.limiter import limiter
from cache.kline_cache import get_klines, set_klines
from data_cache.loader import SUPPORTED_TF_STRINGS, load_klines

log = logging.getLogger("engine.chart")
router = APIRouter()

_MAX_LIMIT = 1000


@router.get("/klines")
@limiter.limit("120/minute")
async def chart_klines(
    request: Request,
    symbol: str = Query(default="BTCUSDT", description="Trading pair, e.g. BTCUSDT"),
    tf: str = Query(default="4h", description="Timeframe string, e.g. 1h / 4h / 1d"),
    limit: int = Query(default=200, ge=1, le=_MAX_LIMIT, description="Number of bars to return"),
) -> dict:
    symbol = symbol.upper()

    if tf not in SUPPORTED_TF_STRINGS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported tf '{tf}'. Valid: {sorted(SUPPORTED_TF_STRINGS)}",
        )

    # ── Redis fast path ──────────────────────────────────────────────────────
    cached_rows = await get_klines(symbol, tf)
    if cached_rows is not None:
        bars = cached_rows[-limit:]
        return {"symbol": symbol, "tf": tf, "limit": limit, "cached": True, "bars": bars}

    # ── CSV fallback ─────────────────────────────────────────────────────────
    try:
        df = load_klines(symbol, tf, offline=False)
    except Exception as exc:
        log.warning("chart_klines CSV fallback failed %s/%s: %s", symbol, tf, exc)
        raise HTTPException(status_code=502, detail=f"klines unavailable: {exc}") from exc

    rows: list[dict] = []
    for ts, row in df.iterrows():
        rows.append({
            "t": int(ts.timestamp() * 1000),
            "o": float(row["open"]),
            "h": float(row["high"]),
            "l": float(row["low"]),
            "c": float(row["close"]),
            "v": float(row["volume"]),
        })

    # Populate Redis so next request is fast
    await set_klines(symbol, tf, rows)

    bars = rows[-limit:]
    return {"symbol": symbol, "tf": tf, "limit": limit, "cached": False, "bars": bars}
