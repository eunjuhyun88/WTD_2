"""Agent chat SSE endpoint — PR2: real LLM conversation with tool-use.

POST /agent/chat
Body: { "message": str, "symbol"?: str, "timeframe"?: str, "user_id"?: str }

Streams: text/event-stream
  event: chunk       data: {"text": "..."}
  event: tool_call   data: {"name": "...", "input": {...}}
  event: tool_result data: {"name": "...", "preview": "..."}
  event: done        data: {"latency_ms": N, "tokens": N}
"""
from __future__ import annotations

import json
import logging
import time

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter()
log = logging.getLogger("engine.agent_chat")


class ChatRequest(BaseModel):
    message: str
    symbol: str = "BTCUSDT"
    timeframe: str = "4h"
    user_id: str | None = None


async def _chat_stream(req: ChatRequest):
    from agents.conversation import run_conversation_turn

    start = time.monotonic()
    try:
        async for chunk in run_conversation_turn(
            req.message,
            symbol=req.symbol,
            timeframe=req.timeframe,
            user_id=req.user_id,
        ):
            if "text" in chunk:
                yield f"event: chunk\ndata: {json.dumps({'text': chunk['text']})}\n\n"
            elif "tool_call" in chunk:
                yield f"event: tool_call\ndata: {json.dumps(chunk['tool_call'])}\n\n"
            elif "tool_result" in chunk:
                yield f"event: tool_result\ndata: {json.dumps(chunk['tool_result'])}\n\n"
            elif chunk.get("done"):
                yield (
                    f"event: done\ndata: {json.dumps({'latency_ms': chunk.get('latency_ms', 0), 'tokens': chunk.get('tokens', 0)})}\n\n"
                )
    except Exception as exc:
        log.error("[agent_chat] stream error: %s", exc)
        yield f"event: chunk\ndata: {json.dumps({'text': f'Error: {exc}'})}\n\n"
        yield (
            f"event: done\ndata: {json.dumps({'latency_ms': int((time.monotonic() - start) * 1000), 'tokens': 0})}\n\n"
        )


@router.post("/agent/chat")
async def agent_chat(req: ChatRequest):
    log.debug("[agent_chat] msg=%.80s sym=%s tf=%s", req.message, req.symbol, req.timeframe)
    return StreamingResponse(
        _chat_stream(req),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
