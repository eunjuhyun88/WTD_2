"""Agent chat SSE endpoint — litellm multi-provider conversation with tool-use.

POST /agent/chat
Body: { "message": str, "symbol"?: str, "timeframe"?: str, "model"?: str }

user_id and tier are resolved server-side from the JWT — never from the request body.

Streams: text/event-stream
  event: chunk       data: {"text": "..."}
  event: tool_call   data: {"name": "...", "input": {...}}
  event: tool_result data: {"name": "...", "preview": "..."}
  event: done        data: {"latency_ms": N, "tokens": N}

GET /agent/chat/models  → list of available models for UI selector
"""
from __future__ import annotations

import json
import logging
import time

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.limiter import limiter

router = APIRouter()
log = logging.getLogger("engine.agent_chat")

# Allowlisted model strings — must match AVAILABLE_MODELS ids in conversation.py.
# Any model not in this set is silently replaced by the tier default.
_ALLOWED_MODELS: frozenset[str] = frozenset([
    "groq/llama-3.3-70b-versatile",
    "groq/llama-3.1-8b-instant",
    "anthropic/claude-sonnet-4-5",
    "anthropic/claude-haiku-3-5",
    "gemini/gemini-2.0-flash",
    "deepseek/deepseek-chat",
    "cerebras/llama-3.3-70b",
    "ollama/qwen3.5:latest",
])

# Allowed symbols and timeframes — basic server-side guard on LLM-controlled args.
_SYMBOL_RE_MAX = 20  # e.g. "BTCUSDT" = 6 chars
_ALLOWED_TIMEFRAMES: frozenset[str] = frozenset([
    "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h",
    "1d", "3d", "1w", "1M",
])


class ChatRequest(BaseModel):
    message: str
    symbol: str = "BTCUSDT"
    timeframe: str = "4h"
    # user_id and tier are intentionally excluded from the request body.
    # They are resolved from the authenticated JWT by the route handler.
    model: str | None = None  # e.g. "groq/llama-3.3-70b-versatile"


def _resolve_user_id(request: Request) -> str | None:
    """Return user_id from JWT-authenticated state, never from the request body."""
    return getattr(request.state, "user_id", None)


def _resolve_tier(user_id: str | None) -> str:
    """Resolve tier from DB (Redis-cached, TTL 60s). Defaults to 'free'."""
    if not user_id:
        return "free"
    try:
        from api.middleware.tier_gate import _resolve_tier as _db_resolve
        info = _db_resolve(user_id)
        return info.tier
    except Exception:
        return "free"


def _sanitize_model(model: str | None) -> str | None:
    """Accept only allowlisted model strings; drop anything else."""
    if model and model.strip() in _ALLOWED_MODELS:
        return model.strip()
    return None


def _sanitize_symbol(symbol: str) -> str:
    """Keep only alphanumeric chars, cap length."""
    cleaned = "".join(c for c in symbol if c.isalnum()).upper()
    return cleaned[:_SYMBOL_RE_MAX] if cleaned else "BTCUSDT"


def _sanitize_timeframe(timeframe: str) -> str:
    return timeframe if timeframe in _ALLOWED_TIMEFRAMES else "4h"


@router.get("/agent/chat/models")
async def get_available_models():
    """Return available models for UI model selector."""
    from agents.conversation import AVAILABLE_MODELS
    return {"models": AVAILABLE_MODELS}


async def _chat_stream(req: ChatRequest, user_id: str | None, tier: str):
    from agents.conversation import run_conversation_turn

    start = time.monotonic()
    try:
        async for chunk in run_conversation_turn(
            req.message,
            symbol=_sanitize_symbol(req.symbol),
            timeframe=_sanitize_timeframe(req.timeframe),
            user_id=user_id,
            tier=tier,
            model=_sanitize_model(req.model),
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
        # Return a generic message — never leak internal exception details to the client.
        yield f"event: chunk\ndata: {json.dumps({'text': '오류가 발생했습니다. 잠시 후 다시 시도해주세요.'})}\n\n"
        yield (
            f"event: done\ndata: {json.dumps({'latency_ms': int((time.monotonic() - start) * 1000), 'tokens': 0})}\n\n"
        )


@router.post("/agent/chat")
@limiter.limit("30/minute")
async def agent_chat(request: Request, req: ChatRequest):
    user_id = _resolve_user_id(request)
    tier = _resolve_tier(user_id)
    log.debug(
        "[agent_chat] msg=%.80s sym=%s tf=%s tier=%s uid=%.8s",
        req.message, req.symbol, req.timeframe, tier,
        user_id or "anon",
    )
    return StreamingResponse(
        _chat_stream(req, user_id, tier),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
