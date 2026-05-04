"""W-0400 Phase 2A: Indicator series API.

GET /indicators/catalog          — list all registered indicators (≥100)
GET /indicators/series           — compute indicator values for a symbol+timeframe
GET /indicators/aggregated/{type} — raw perp/kline aggregated series for chart sub-panes
                                    types: funding, oi, liq, vol, returns
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request

from api.limiter import limiter
from indicators.registry import REGISTRY, IndicatorMeta
from indicators.cache import TTLCache, Singleflight

log = logging.getLogger("engine.api.indicators")
router = APIRouter()

# ---------------------------------------------------------------------------
# Module-level cache / singleflight instances
# ---------------------------------------------------------------------------
_cache = TTLCache(max_size=256, ttl=60.0)
_singleflight = Singleflight()

_MAX_LIMIT = 1500


# ---------------------------------------------------------------------------
# Compute dispatch
# ---------------------------------------------------------------------------

def _dispatch_compute(indicator_id: str, params: dict[str, Any], df) -> dict[str, Any]:  # noqa: ANN001
    """Run the compute function for the given indicator and return serialisable result.

    Returns a dict where:
    - single-output indicators: {"points": [{"t": ms, "v": float}, ...]}
    - multi-output indicators: {output_name: [{"t": ms, "v": float}, ...], ...}
    """
    from indicators import compute as C
    import pandas as pd

    meta: IndicatorMeta = REGISTRY[indicator_id]
    fn_name: str = meta.compute_fn or indicator_id

    # Build kwargs from meta.params updated with caller-supplied params
    merged: dict[str, Any] = {**meta.params, **params}

    # Resolve compute function
    fn = getattr(C, fn_name, None)
    if fn is None:
        raise HTTPException(status_code=500, detail=f"No compute function for '{fn_name}'")

    close: pd.Series = df["close"]
    high: pd.Series = df["high"]
    low: pd.Series = df["low"]
    volume: pd.Series = df["volume"]
    open_: pd.Series = df.get("open", close)

    # Map fn_name → call signature
    OHLCV_FMAP: dict[str, callable] = {
        "sma": lambda: fn(close, **{k: v for k, v in merged.items() if k in ("length",)}),
        "ema": lambda: fn(close, **{k: v for k, v in merged.items() if k in ("length",)}),
        "wma": lambda: fn(close, **{k: v for k, v in merged.items() if k in ("length",)}),
        "dema": lambda: fn(close, **{k: v for k, v in merged.items() if k in ("length",)}),
        "tema": lambda: fn(close, **{k: v for k, v in merged.items() if k in ("length",)}),
        "hma": lambda: fn(close, **{k: v for k, v in merged.items() if k in ("length",)}),
        "kama": lambda: fn(close, **{k: v for k, v in merged.items() if k in ("length",)}),
        "trima": lambda: fn(close, **{k: v for k, v in merged.items() if k in ("length",)}),
        "zlema": lambda: fn(close, **{k: v for k, v in merged.items() if k in ("length",)}),
        "alma": lambda: fn(close, **{k: v for k, v in merged.items() if k in ("length", "offset", "sigma")}),
        "vwma": lambda: fn(close, volume, **{k: v for k, v in merged.items() if k in ("length",)}),
        "psar": lambda: fn(high, low, **{k: v for k, v in merged.items() if k in ("step", "max_step")}),
        "rsi": lambda: fn(close, **{k: v for k, v in merged.items() if k in ("length",)}),
        "macd": lambda: fn(close, **{k: v for k, v in merged.items() if k in ("fast", "slow", "signal")}),
        "stoch": lambda: fn(high, low, close, **{k: v for k, v in merged.items() if k in ("k", "d")}),
        "cci": lambda: fn(high, low, close, **{k: v for k, v in merged.items() if k in ("length",)}),
        "roc": lambda: fn(close, **{k: v for k, v in merged.items() if k in ("length",)}),
        "momentum": lambda: fn(close, **{k: v for k, v in merged.items() if k in ("length",)}),
        "williams_r": lambda: fn(high, low, close, **{k: v for k, v in merged.items() if k in ("length",)}),
        "cmo": lambda: fn(close, **{k: v for k, v in merged.items() if k in ("length",)}),
        "ppo": lambda: fn(close, **{k: v for k, v in merged.items() if k in ("fast", "slow")}),
        "trix": lambda: fn(close, **{k: v for k, v in merged.items() if k in ("length",)}),
        "dpo": lambda: fn(close, **{k: v for k, v in merged.items() if k in ("length",)}),
        "ultimate_osc": lambda: fn(high, low, close, **{k: v for k, v in merged.items() if k in ("s", "m", "l")}),
        "bb": lambda: fn(close, **{k: v for k, v in merged.items() if k in ("length", "std")}),
        "atr": lambda: fn(high, low, close, **{k: v for k, v in merged.items() if k in ("length",)}),
        "keltner": lambda: fn(high, low, close, **{k: v for k, v in merged.items() if k in ("length", "mult")}),
        "donchian": lambda: fn(high, low, **{k: v for k, v in merged.items() if k in ("length",)}),
        "chop": lambda: fn(high, low, close, **{k: v for k, v in merged.items() if k in ("length",)}),
        "mass_index": lambda: fn(high, low, **{k: v for k, v in merged.items() if k in ("length",)}),
        "adx": lambda: fn(high, low, close, **{k: v for k, v in merged.items() if k in ("length",)}),
        "aroon": lambda: fn(high, low, **{k: v for k, v in merged.items() if k in ("length",)}),
        "vwap": lambda: fn(high, low, close, volume),
        "obv": lambda: fn(close, volume),
        "mfi": lambda: fn(high, low, close, volume, **{k: v for k, v in merged.items() if k in ("length",)}),
        "cmf": lambda: fn(high, low, close, volume, **{k: v for k, v in merged.items() if k in ("length",)}),
        "elder_ray": lambda: fn(high, low, close, **{k: v for k, v in merged.items() if k in ("length",)}),
        "balance_power": lambda: fn(open_, high, low, close),
        "ease_of_movement": lambda: fn(high, low, volume, **{k: v for k, v in merged.items() if k in ("length",)}),
        "force_index": lambda: fn(close, volume, **{k: v for k, v in merged.items() if k in ("length",)}),
        "nvi": lambda: fn(close, volume),
        "pvi": lambda: fn(close, volume),
        "volume_sma": lambda: fn(volume, **{k: v for k, v in merged.items() if k in ("length",)}),
        "volume_ema": lambda: fn(volume, **{k: v for k, v in merged.items() if k in ("length",)}),
        "volume_rsi": lambda: fn(volume, **{k: v for k, v in merged.items() if k in ("length",)}),
        "pivot_points": lambda: fn(high, low, close),
        "funding_sma": lambda: fn(close, **{k: v for k, v in merged.items() if k in ("length",)}),
        "basis": lambda: fn(close, volume),  # placeholder; real usage needs spot+perp
    }

    call_fn = OHLCV_FMAP.get(fn_name)
    if call_fn is None:
        raise HTTPException(status_code=500, detail=f"No dispatch mapping for '{fn_name}'")

    raw = call_fn()

    # Serialise result
    def _series_to_points(s: pd.Series) -> list[dict[str, Any]]:
        s = s.dropna()
        points = []
        for ts, val in s.items():
            t = int(ts.timestamp() * 1000) if hasattr(ts, "timestamp") else int(ts)
            points.append({"t": t, "v": float(val)})
        return points

    if isinstance(raw, dict):
        return {k: _series_to_points(v) for k, v in raw.items()}
    else:
        return {"points": _series_to_points(raw)}


def _parse_params_string(params_str: str | None, meta: IndicatorMeta) -> dict[str, Any]:
    """Parse 'key:value,key:value' string and validate against known param keys."""
    if not params_str:
        return {}
    result: dict[str, Any] = {}
    for token in params_str.split(","):
        token = token.strip()
        if not token:
            continue
        if ":" not in token:
            raise HTTPException(
                status_code=400, detail=f"Invalid param token '{token}' — expected key:value"
            )
        key, raw_val = token.split(":", 1)
        key = key.strip()
        raw_val = raw_val.strip()
        if meta.params and key not in meta.params:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown param '{key}' for indicator '{meta.id}'. "
                       f"Known params: {list(meta.params.keys())}",
            )
        # Type-coerce: try int, then float, then string
        default = meta.params.get(key)
        try:
            if isinstance(default, int) and not isinstance(default, bool):
                result[key] = int(raw_val)
            elif isinstance(default, float):
                result[key] = float(raw_val)
            else:
                # try numeric conversion as a convenience
                try:
                    result[key] = int(raw_val)
                except ValueError:
                    try:
                        result[key] = float(raw_val)
                    except ValueError:
                        result[key] = raw_val
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid value '{raw_val}' for param '{key}': {exc}",
            ) from exc
    return result


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/catalog")
@limiter.limit("120/minute")
async def get_catalog(request: Request) -> dict:
    """Return all registered indicators as a JSON list."""
    return {
        "indicators": [asdict(v) for v in REGISTRY.values()],
        "count": len(REGISTRY),
    }


@router.get("/series")
@limiter.limit("60/minute")
async def get_series(
    request: Request,
    symbol: str = Query(default="BTCUSDT", description="Trading pair, e.g. BTCUSDT"),
    timeframe: str = Query(default="15m", description="Timeframe, e.g. 15m / 1h"),
    indicator: str = Query(description="Indicator ID from /catalog"),
    params: str | None = Query(default=None, description="Param overrides: length:20,std:2.0"),
    limit: int = Query(default=200, ge=1, le=_MAX_LIMIT, description="Number of input bars"),
) -> dict:
    """Compute an indicator series for a symbol+timeframe."""
    symbol = symbol.upper()

    # 1. Validate indicator
    if indicator not in REGISTRY:
        raise HTTPException(status_code=404, detail=f"Indicator '{indicator}' not found in registry")

    meta = REGISTRY[indicator]

    # 2. Parse & validate params
    caller_params = _parse_params_string(params, meta)
    merged_params = {**meta.params, **caller_params}

    # 3. Build cache key
    cache_key = f"{symbol}:{timeframe}:{indicator}:{sorted(merged_params.items())}"

    # 4. Use singleflight to avoid duplicate computation
    async def _compute() -> dict:
        cached = _cache.get(cache_key)
        if cached is not None:
            return cached

        # Load klines
        try:
            from data_cache.loader import load_klines
            df = await asyncio.get_event_loop().run_in_executor(
                None, lambda: load_klines(symbol, timeframe).tail(limit + 300)
            )
        except Exception as exc:
            log.warning("load_klines failed for %s/%s: %s", symbol, timeframe, exc)
            raise HTTPException(status_code=502, detail=f"Failed to load kline data: {exc}") from exc

        result = _dispatch_compute(indicator, caller_params, df)
        _cache.set(cache_key, result)
        return result

    data = await _singleflight.call(cache_key, _compute)

    # 5. Shape the response
    is_multi = len(meta.outputs) > 1

    if is_multi:
        # Multi-output: trim each output series to `limit` points
        trimmed = {k: v[-limit:] for k, v in data.items()}
        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "indicator": indicator,
            "params": merged_params,
            "outputs": trimmed,
            "count": max((len(v) for v in trimmed.values()), default=0),
        }
    else:
        points = data.get("points", [])[-limit:]
        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "indicator": indicator,
            "params": merged_params,
            "points": points,
            "count": len(points),
        }


# ---------------------------------------------------------------------------
# Aggregated sub-pane series
# ---------------------------------------------------------------------------

_AGG_CACHE = TTLCache(max_size=128, ttl=120.0)  # 2-min TTL for perp data
_AGG_SF = Singleflight()

_AGG_TYPES = frozenset({"funding", "oi", "liq", "vol", "returns"})


def _fetch_aggregated_sync(type_: str, symbol: str, limit: int, period: str) -> dict:
    """Blocking fetch for one aggregated series type. Runs in executor."""
    import pandas as pd
    from data_cache.fetch_binance_perp import fetch_funding_rate, fetch_oi_hist
    from data_cache.loader import load_klines

    def to_points(series: pd.Series) -> list[dict]:
        out = []
        for idx, val in series.dropna().tail(limit).items():
            t = int(idx.timestamp() * 1000) if hasattr(idx, "timestamp") else int(idx)
            out.append({"t": t, "v": float(val)})
        return out

    if type_ == "funding":
        df = fetch_funding_rate(symbol, limit=min(limit, 1000))
        points = to_points(df["funding_rate"])

    elif type_ == "oi":
        df = fetch_oi_hist(symbol, period=period, limit=min(limit, 500))
        points = to_points(df["oi_raw"])

    elif type_ == "liq":
        # Proxy: taker-buy ratio (%) from futures klines — buy aggression pressure
        df = load_klines(symbol, "1h").tail(limit + 1)
        if "taker_buy_base_volume" in df.columns and "volume" in df.columns:
            buy_ratio = (df["taker_buy_base_volume"] / df["volume"].replace(0.0, float("nan"))) * 100.0
            points = to_points(buy_ratio)
        else:
            from data_cache.fetch_binance_perp import fetch_ls_ratio
            df_ls = fetch_ls_ratio(symbol, period=period, limit=min(limit, 500))
            points = to_points(df_ls["long_short_ratio"])

    elif type_ == "vol":
        df = load_klines(symbol, "1h").tail(limit)
        points = to_points(df["volume"])

    elif type_ == "returns":
        df = load_klines(symbol, "1h").tail(limit + 1)
        returns = df["close"].pct_change().tail(limit)
        points = to_points(returns)

    else:
        raise ValueError(f"Unknown aggregated type: {type_!r}")

    return {"type": type_, "symbol": symbol, "points": points, "count": len(points)}


@router.get("/aggregated/{type}")
@limiter.limit("60/minute")
async def get_aggregated(
    request: Request,
    type: str,
    symbol: str = Query(default="BTCUSDT", description="Trading pair, e.g. BTCUSDT"),
    limit: int = Query(default=500, ge=1, le=2000, description="Max output points"),
    period: str = Query(default="1h", description="OI/LS period bucket (1h, 4h, ...)"),
) -> dict:
    """Return a raw aggregated data series for a chart sub-pane.

    Types:
      - funding  — 8h funding rate history (Binance /fapi/v1/fundingRate)
      - oi       — open interest (sumOpenInterest, hourly)
      - liq      — taker-buy ratio % (aggression proxy; falls back to LS ratio)
      - vol      — futures volume (hourly klines)
      - returns  — close pct_change (hourly klines)

    Response: {"type": str, "symbol": str, "points": [{"t": ms, "v": float}], "count": int}
    """
    if type not in _AGG_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown type {type!r}. Supported: {sorted(_AGG_TYPES)}",
        )

    symbol = symbol.upper()
    cache_key = f"agg:{type}:{symbol}:{period}:{limit}"

    async def _compute() -> dict:
        cached = _AGG_CACHE.get(cache_key)
        if cached is not None:
            return cached
        result = await asyncio.get_event_loop().run_in_executor(
            None, lambda: _fetch_aggregated_sync(type, symbol, limit, period)
        )
        _AGG_CACHE.set(cache_key, result)
        return result

    try:
        return await _AGG_SF.call(cache_key, _compute)
    except Exception as exc:
        log.warning("aggregated fetch failed type=%s sym=%s: %s", type, symbol, exc)
        raise HTTPException(status_code=502, detail=f"Failed to fetch aggregated data: {exc}") from exc
