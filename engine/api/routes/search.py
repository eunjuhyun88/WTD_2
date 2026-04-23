from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Query

from api.schemas_search import SearchCatalogResponse, SearchCorpusWindowSummary
from search.corpus import SearchCorpusStore

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
