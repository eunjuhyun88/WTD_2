"""W-0400 Phase 2A: Indicator series API.

GET /indicators/catalog   — list all registered indicators (≥100)
GET /indicators/series    — compute indicator values for a symbol+timeframe
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
