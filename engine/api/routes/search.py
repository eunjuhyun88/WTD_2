from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from api.schemas_search import (
    ScanRequest,
    ScanResponse,
    SearchCandidate,
    SearchCatalogResponse,
    SearchCorpusWindowSummary,
    SeedSearchRequest,
    SeedSearchResponse,
)
from search.corpus import SearchCorpusStore
from search.runtime import get_scan, get_seed_search, run_scan, run_seed_search

router = APIRouter()


@router.get("/catalog", response_model=SearchCatalogResponse)
async def search_catalog(
    symbol: str | None = Query(None, min_length=3),
    timeframe: str | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
) -> SearchCatalogResponse:
    store = SearchCorpusStore()
    windows = store.list_windows(symbol=symbol, timeframe=timeframe, limit=limit)
    return SearchCatalogResponse(
        status="live" if windows else "empty",
        generated_at=datetime.now(timezone.utc).isoformat(),
        total_windows=store.count_windows(),
        windows=[
            SearchCorpusWindowSummary(
                window_id=window.window_id,
                symbol=window.symbol,
                timeframe=window.timeframe,
                start_ts=window.start_ts,
                end_ts=window.end_ts,
                bars=window.bars,
                source=window.source,
                signature=window.signature,
            )
            for window in windows
        ],
    )


@router.post("/seed", response_model=SeedSearchResponse)
async def search_seed(body: SeedSearchRequest) -> SeedSearchResponse:
    result = run_seed_search(body.model_dump(mode="json"))
    return _seed_response(result)


@router.get("/seed/{run_id}", response_model=SeedSearchResponse)
async def search_seed_result(run_id: str) -> SeedSearchResponse:
    result = get_seed_search(run_id)
    if result is None:
        raise HTTPException(status_code=404, detail={"code": "seed_run_not_found", "run_id": run_id})
    return _seed_response(result)


@router.post("/scan", response_model=ScanResponse)
async def search_scan(body: ScanRequest) -> ScanResponse:
    result = run_scan(body.model_dump(mode="json"))
    return _scan_response(result)


@router.get("/scan/{scan_id}", response_model=ScanResponse)
async def search_scan_result(scan_id: str) -> ScanResponse:
    result = get_scan(scan_id)
    if result is None:
        raise HTTPException(status_code=404, detail={"code": "scan_not_found", "scan_id": scan_id})
    return _scan_response(result)


def _seed_response(result: dict) -> SeedSearchResponse:
    return SeedSearchResponse(
        status=result["status"],
        generated_at=result["updated_at"],
        run_id=result["run_id"],
        request=result.get("request", {}),
        candidates=[_candidate(row) for row in result.get("candidates", [])],
    )


def _scan_response(result: dict) -> ScanResponse:
    return ScanResponse(
        status=result["status"],
        generated_at=result["updated_at"],
        scan_id=result["scan_id"],
        request=result.get("request", {}),
        candidates=[_candidate(row) for row in result.get("candidates", [])],
    )


def _candidate(row: dict) -> SearchCandidate:
    payload = row.get("payload", {})
    return SearchCandidate(
        candidate_id=row["candidate_id"],
        window_id=row.get("window_id") or payload.get("window_id"),
        symbol=row.get("symbol") or payload.get("symbol"),
        timeframe=row.get("timeframe") or payload.get("timeframe"),
        score=float(row.get("score", 0.0)),
        payload=payload,
    )
