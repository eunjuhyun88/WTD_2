from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from market_engine.fact_plane import FactContextBuildError
from market_engine.fact_read_models import (
    build_confluence_context,
    build_perp_context,
    build_price_context,
    build_reference_stack,
)
from market_engine.indicator_catalog import build_indicator_catalog, normalize_indicator_catalog_filters

router = APIRouter()


def _raise_fact_http_error(exc: FactContextBuildError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.to_detail()) from exc


def _invalid_filter_error(exc: ValueError) -> None:
    message = str(exc)
    code = "invalid_filter"
    if message.startswith("status must be one of"):
        code = "invalid_status"
    elif message.startswith("family must be one of"):
        code = "invalid_family"
    elif message.startswith("stage must be one of"):
        code = "invalid_stage"
    raise HTTPException(status_code=400, detail={"code": code, "message": message}) from exc


@router.get("/price-context")
async def facts_price_context(
    symbol: str = Query(..., min_length=3),
    timeframe: str = Query("1h"),
    offline: bool = Query(True),
) -> dict:
    try:
        return build_price_context(symbol=symbol, timeframe=timeframe, offline=offline)
    except FactContextBuildError as exc:
        _raise_fact_http_error(exc)


@router.get("/perp-context")
async def facts_perp_context(
    symbol: str = Query(..., min_length=3),
    timeframe: str = Query("1h"),
    offline: bool = Query(True),
) -> dict:
    try:
        return build_perp_context(symbol=symbol, timeframe=timeframe, offline=offline)
    except FactContextBuildError as exc:
        _raise_fact_http_error(exc)


@router.get("/reference-stack")
async def facts_reference_stack(
    symbol: str = Query("BTCUSDT", min_length=3),
    timeframe: str = Query("1h"),
    offline: bool = Query(True),
) -> dict:
    try:
        return build_reference_stack(symbol=symbol, timeframe=timeframe, offline=offline)
    except FactContextBuildError as exc:
        _raise_fact_http_error(exc)


@router.get("/confluence")
async def facts_confluence(
    symbol: str = Query(..., min_length=3),
    timeframe: str = Query("1h"),
    offline: bool = Query(True),
) -> dict:
    try:
        return build_confluence_context(symbol=symbol, timeframe=timeframe, offline=offline)
    except FactContextBuildError as exc:
        _raise_fact_http_error(exc)


@router.get("/indicator-catalog")
async def facts_indicator_catalog(
    status: str | None = Query(None),
    family: str | None = Query(None),
    stage: str | None = Query(None),
    query: str | None = Query(None),
) -> dict:
    try:
        filters = normalize_indicator_catalog_filters(
            status=status,
            family=family,
            stage=stage,
            query=query,
        )
    except ValueError as exc:
        _invalid_filter_error(exc)
    return build_indicator_catalog(
        status=filters["status"],
        family=filters["family"],
        stage=filters["stage"],
        query=filters["query"],
    )
