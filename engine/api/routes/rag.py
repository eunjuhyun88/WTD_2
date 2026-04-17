"""Deterministic RAG helper endpoints."""
from __future__ import annotations

from fastapi import APIRouter

from api.schemas import (
    RagDedupeHashRequest,
    RagDedupeHashResponse,
    RagQuickTradeEmbeddingRequest,
    RagSignalActionEmbeddingRequest,
    RagTerminalScanEmbeddingRequest,
    RagVectorResponse,
)
from rag.embedding import (
    compute_dedupe_hash,
    compute_quick_trade_embedding,
    compute_signal_action_embedding,
    compute_terminal_scan_embedding,
)

router = APIRouter()


@router.post("/terminal-scan", response_model=RagVectorResponse)
async def terminal_scan(req: RagTerminalScanEmbeddingRequest) -> RagVectorResponse:
    return RagVectorResponse(
        embedding=compute_terminal_scan_embedding(
            [signal.model_dump() for signal in req.signals],
            req.timeframe,
            req.dataCompleteness,
        )
    )


@router.post("/quick-trade", response_model=RagVectorResponse)
async def quick_trade(req: RagQuickTradeEmbeddingRequest) -> RagVectorResponse:
    return RagVectorResponse(embedding=compute_quick_trade_embedding(req.model_dump()))


@router.post("/signal-action", response_model=RagVectorResponse)
async def signal_action(req: RagSignalActionEmbeddingRequest) -> RagVectorResponse:
    return RagVectorResponse(embedding=compute_signal_action_embedding(req.model_dump()))


@router.post("/dedupe-hash", response_model=RagDedupeHashResponse)
async def dedupe_hash(req: RagDedupeHashRequest) -> RagDedupeHashResponse:
    return RagDedupeHashResponse(
        dedupeHash=compute_dedupe_hash(
            req.pair,
            req.timeframe,
            req.direction,
            req.regime,
            req.source,
            req.windowMinutes,
        )
    )
