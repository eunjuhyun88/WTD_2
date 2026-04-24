"""
/features — Canonical feature plane read routes.

Reads from FeatureMaterializationStore (feature_windows, pattern_events).
This is the primary surface-facing read path for the canonical feature
plane — replaces ad-hoc provider fan-out in surface components.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from features.materialization_store import FeatureMaterializationStore
from scanner.jobs.feature_materialization import materialize_symbol_window

log = logging.getLogger("engine.features")
router = APIRouter()

_store: FeatureMaterializationStore | None = None


def _get_store() -> FeatureMaterializationStore:
    global _store
    if _store is None:
        _store = FeatureMaterializationStore()
    return _store


@router.get("/window")
async def get_feature_window(
    symbol: str = Query(..., min_length=2),
    timeframe: str = Query("1h"),
    venue: str = Query("binance"),
) -> dict:
    """Latest materialized feature_window for symbol/timeframe.

    Computes and persists on-demand from local cache (offline=True) if not
    yet materialized. Never fans out to providers.
    """
    store = _get_store()
    try:
        result = materialize_symbol_window(
            symbol=symbol.upper(),
            timeframe=timeframe,
            venue=venue,
            offline=True,
            store=store,
        )
        return {"ok": True, "symbol": symbol.upper(), "timeframe": timeframe, **result}
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "no_cache",
                "message": f"No cached data for {symbol.upper()}/{timeframe}. Run ingestion first.",
            },
        )
    except Exception as exc:
        log.exception("feature_window error symbol=%s timeframe=%s", symbol, timeframe)
        raise HTTPException(
            status_code=500,
            detail={"code": "materialization_error", "message": str(exc)},
        )


@router.get("/pattern-events")
async def get_pattern_events(
    symbol: str = Query(..., min_length=2),
    timeframe: str = Query("1h"),
    venue: str = Query("binance"),
    pattern_family: str = Query("generic_feature_phase"),
) -> dict:
    """List persisted pattern_events for symbol/timeframe/pattern_family."""
    store = _get_store()
    events = store.list_pattern_events(
        venue=venue,
        symbol=symbol.upper(),
        timeframe=timeframe,
        pattern_family=pattern_family,
    )
    return {
        "ok": True,
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        "venue": venue,
        "pattern_family": pattern_family,
        "events": events,
        "count": len(events),
    }
