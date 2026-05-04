"""Agent chat SSE endpoint — PR1 shell (echo only, no LLM).

POST /agent/chat
Body: { "message": str, "symbol"?: str, "timeframe"?: str, "user_id"?: str }
Streams: text/event-stream, event: chunk, data: {"text": "..."}
         then event: done, data: {}
"""
from __future__ import annotations
import asyncio
import json
import logging
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

async def _echo_stream(message: str):
    """PR1 echo: stream back the message word-by-word."""
    words = message.split()
    for i, word in enumerate(words):
        chunk = word + (" " if i < len(words) - 1 else "")
        yield f"event: chunk\ndata: {json.dumps({'text': chunk})}\n\n"
        await asyncio.sleep(0.05)
    yield f"event: done\ndata: {{}}\n\n"

@router.post("/agent/chat")
async def agent_chat(req: ChatRequest):
    log.debug("[agent_chat] PR1 echo: %s", req.message[:80])
    return StreamingResponse(
        _echo_stream(req.message),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
