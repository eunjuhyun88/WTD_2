from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class SearchCorpusWindowSummary(BaseModel):
    window_id: str
    symbol: str
    timeframe: str
    start_ts: str
    end_ts: str
    bars: int
    source: str
    signature: dict[str, Any] = Field(default_factory=dict)


class SearchCatalogResponse(BaseModel):
    ok: bool = True
    owner: Literal["engine"] = "engine"
    plane: Literal["search"] = "search"
    status: str
    generated_at: str
    total_windows: int
    windows: list[SearchCorpusWindowSummary] = Field(default_factory=list)
