"""Read-only Coin Screener routes."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from screener.store import ScreenerStore

router = APIRouter()
_store = ScreenerStore()


@router.get("/runs/latest")
async def latest_run() -> dict:
    run = _store.get_latest_run()
    if run is None:
        return {"ok": True, "run": None}
    return {"ok": True, "run": run.to_dict()}


@router.get("/listings")
async def listings(
    grade: str | None = Query(default=None, description="A | B | C | excluded"),
    limit: int = Query(default=100, ge=1, le=500),
) -> dict:
    rows = _store.list_latest_listings(structural_grade=grade, limit=limit)
    return {
        "ok": True,
        "count": len(rows),
        "listings": [row.to_dict() for row in rows],
    }


@router.get("/assets/{symbol}")
async def asset_detail(symbol: str) -> dict:
    listing = _store.get_latest_listing(symbol)
    if listing is None:
        raise HTTPException(status_code=404, detail=f"Screener listing not found: {symbol.upper()}")
    overrides = [
        item.to_dict()
        for item in _store.list_active_overrides()
        if item.target.upper() == symbol.upper()
    ]
    return {
        "ok": True,
        "listing": listing.to_dict(),
        "overrides": overrides,
    }


@router.get("/universe")
async def filtered_universe(
    min_grade: str = Query(default="B", description="A | B"),
    limit: int = Query(default=300, ge=1, le=500),
) -> dict:
    grades = ("A",) if min_grade.upper() == "A" else ("A", "B")
    symbols = _store.list_filtered_symbols(structural_grades=grades, max_symbols=limit)
    latest_run = _store.get_latest_run()
    return {
        "ok": True,
        "symbols": symbols,
        "count": len(symbols),
        "fallback_active": len(symbols) == 0,
        "latest_run_id": latest_run.run_id if latest_run else None,
    }
