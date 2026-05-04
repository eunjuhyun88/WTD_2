"""Tool registry for the AI agent conversation engine.

Each tool wraps an existing engine capability via direct function calls
(no internal HTTP round-trips):

  explain       → fetch_indicator_snapshot + generate_llm_text
  similar       → fetch_indicator_snapshot + search_similar_patterns (real DB search)
  judge         → fetch_indicator_snapshot + judge_runtime + generate_llm_text
  save          → save_runtime.promote_capture (requires user_id + confirm=True)
  live_snapshot → live_snapshot.fetch_indicator_snapshot
  get_binance_balance    → binance_tools.get_binance_balance
  get_binance_positions  → binance_tools.get_binance_positions

Existing /agent/* HTTP routes are NOT modified.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

log = logging.getLogger("engine.agents.tools.registry")


# ── Tool schemas (Anthropic tool-use format) ──────────────────────────────────
# litellm/OpenAI format is auto-derived via to_openai_tools() below.

TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "name": "explain",
        "description": "현재 심볼의 가격 움직임과 기술적 지표를 자연어로 설명합니다.",
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": "e.g. BTCUSDT"},
                "timeframe": {"type": "string", "description": "e.g. 4h"},
            },
            "required": ["symbol", "timeframe"],
        },
    },
    {
        "name": "similar",
        "description": "현재 지표 스냅샷과 유사한 과거 패턴을 DB에서 실제로 검색합니다 (최대 5개).",
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string"},
                "timeframe": {"type": "string"},
            },
            "required": ["symbol", "timeframe"],
        },
    },
    {
        "name": "judge",
        "description": "현재 차트를 분석하고 bullish/bearish/neutral 판정을 내립니다. entry/stop/target 포함.",
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string"},
                "timeframe": {"type": "string"},
            },
            "required": ["symbol", "timeframe"],
        },
    },
    {
        "name": "save",
        "description": "현재 분석을 사용자의 패턴 라이브러리에 저장합니다. confirm=true가 필요합니다.",
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string"},
                "timeframe": {"type": "string"},
                "verdict": {"type": "string", "enum": ["bullish", "bearish", "neutral"]},
                "confirm": {
                    "type": "boolean",
                    "description": "Must be true — user must explicitly agree",
                },
            },
            "required": ["symbol", "timeframe", "verdict", "confirm"],
        },
    },
    {
        "name": "live_snapshot",
        "description": "실시간 기술적 지표(RSI, MACD, BB 등)를 가져옵니다.",
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string"},
                "timeframe": {"type": "string"},
            },
            "required": ["symbol", "timeframe"],
        },
    },
    {
        "name": "get_binance_balance",
        "description": "사용자의 Binance 스팟 계정 잔고를 조회합니다. 비어있지 않은 자산만 반환.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_binance_positions",
        "description": "사용자의 Binance Futures 오픈 포지션을 조회합니다.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
]


def to_openai_tools(schemas: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """Convert Anthropic-format tool schemas → litellm/OpenAI function-calling format.

    Anthropic: {"name": ..., "description": ..., "input_schema": {...}}
    OpenAI:    {"type": "function", "function": {"name": ..., "description": ..., "parameters": {...}}}
    """
    src = schemas or TOOL_SCHEMAS
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t.get("description", ""),
                "parameters": t.get("input_schema", {"type": "object", "properties": {}}),
            },
        }
        for t in src
    ]


# ── Tool dispatcher ───────────────────────────────────────────────────────────

async def dispatch_tool(
    tool_name: str,
    tool_input: dict[str, Any],
    *,
    user_id: str | None = None,
) -> str:
    """Execute a named tool and return a JSON-serialised result string.

    Never raises — errors are caught and returned as {"error": "..."}.
    """
    try:
        if tool_name == "live_snapshot":
            return await _call_live_snapshot(tool_input)

        if tool_name == "explain":
            return await _call_explain(tool_input)

        if tool_name == "similar":
            return await _call_similar(tool_input)

        if tool_name == "judge":
            return await _call_judge(tool_input)

        if tool_name == "get_binance_balance":
            return await _call_binance_balance(tool_input, user_id)

        if tool_name == "get_binance_positions":
            return await _call_binance_positions(tool_input, user_id)

        if tool_name == "save":
            if not tool_input.get("confirm"):
                return json.dumps({"error": "confirm must be true — ask user first"})
            if not user_id:
                return json.dumps({"error": "authentication required for save"})
            return await _call_save(tool_input, user_id)

        return json.dumps({"error": f"unknown tool: {tool_name}"})

    except Exception as exc:
        log.warning("[tool:%s] error: %s", tool_name, exc)
        return json.dumps({"error": str(exc)})


# ── Private helpers ───────────────────────────────────────────────────────────

async def _call_live_snapshot(tool_input: dict[str, Any]) -> str:
    from agents.live_snapshot import fetch_indicator_snapshot

    symbol = tool_input["symbol"]
    timeframe = tool_input["timeframe"]
    result = await fetch_indicator_snapshot(symbol, timeframe)
    return json.dumps(result)


async def _call_explain(tool_input: dict[str, Any]) -> str:
    from agents.llm_runtime import generate_llm_text
    from agents.live_snapshot import fetch_indicator_snapshot

    symbol = tool_input["symbol"]
    timeframe = tool_input["timeframe"]

    snapshot = await fetch_indicator_snapshot(symbol, timeframe)
    snapshot_text = "\n".join(f"  {k}: {v:.4f}" for k, v in snapshot.items()) or "  (지표 없음)"

    _EXPLAIN_SYSTEM = (
        "당신은 퀀트 트레이더 보조 AI입니다.\n"
        "차트 구간의 지표 스냅샷을 종합해 5문장 이내로 해석하세요.\n"
        "마지막 문장: 매수 / 매도 / 관망 판단 한 줄. 수치 직접 인용. 한국어."
    )
    user_text = (
        f"심볼: {symbol} ({timeframe})\n"
        f"지표 스냅샷:\n{snapshot_text}"
    )
    text = await generate_llm_text(_EXPLAIN_SYSTEM, user_text, max_tokens=512, temperature=0.1)
    return json.dumps({"text": text})


async def _call_similar(tool_input: dict[str, Any]) -> str:
    """Find historically similar patterns using real DB search (3-layer scoring).

    Replaces the hallucinating LLM-only implementation.
    Flow: fetch_indicator_snapshot → SearchQuerySpec → search_similar_patterns (sync DB).
    """
    from agents.live_snapshot import fetch_indicator_snapshot
    from alpha.scroll_similar_compose import _build_query_spec
    from research.discovery.candidate_search import search_similar_patterns

    symbol = tool_input["symbol"]
    timeframe = tool_input["timeframe"]

    snapshot = await fetch_indicator_snapshot(symbol, timeframe)
    spec = _build_query_spec(snapshot, timeframe, symbol)

    result = await asyncio.to_thread(
        search_similar_patterns,
        spec,
        top_k=5,
        since_days=365,
    )

    candidates = []
    for c in result.candidates[:5]:
        candidates.append({
            "symbol": c.symbol,
            "timeframe": c.timeframe,
            "similarity": round(float(c.final_score), 3),
            "layer_scores": {
                "feature": round(float(c.layer_a_score or 0), 3),
                "sequence": round(float(c.layer_b_score or 0), 3),
                "ml": round(float(c.layer_c_score or 0), 3),
            },
        })

    return json.dumps({
        "symbol": symbol,
        "timeframe": timeframe,
        "similar_count": len(candidates),
        "candidates": candidates,
    })


async def _call_judge(tool_input: dict[str, Any]) -> str:
    from agents.judge_runtime import build_judge_prompt, parse_verdict, compute_rr, _JUDGE_SYSTEM
    from agents.llm_runtime import generate_llm_text
    from agents.live_snapshot import fetch_indicator_snapshot

    symbol = tool_input["symbol"]
    timeframe = tool_input.get("timeframe", "4h")

    snapshot = await fetch_indicator_snapshot(symbol, timeframe)
    prompt = build_judge_prompt(symbol, timeframe, snapshot, None, None)
    raw = await generate_llm_text(_JUDGE_SYSTEM, prompt, max_tokens=256, temperature=0.05)
    verdict_data = parse_verdict(raw)
    rr = compute_rr(verdict_data.get("entry"), verdict_data.get("stop"), verdict_data.get("target"))
    return json.dumps({**verdict_data, "rr": rr, "symbol": symbol, "timeframe": timeframe})


async def _call_save(tool_input: dict[str, Any], user_id: str) -> str:
    import os
    from agents.save_runtime import promote_capture

    symbol = tool_input["symbol"]
    timeframe = tool_input["timeframe"]
    verdict = tool_input["verdict"]

    decision = {"verdict": verdict}
    snapshot: dict[str, float] = {}

    def _sb():
        from supabase import create_client
        return create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        )

    result = await asyncio.to_thread(
        promote_capture,
        _sb(),
        user_id,
        symbol,
        timeframe,
        snapshot,
        decision,
        "agent_chat",
        None,
    )
    return json.dumps(result)


async def _call_binance_balance(tool_input: dict[str, Any], user_id: str | None) -> str:
    from agents.tools.binance_tools import get_binance_balance

    result = await get_binance_balance(user_id)
    return json.dumps(result)


async def _call_binance_positions(tool_input: dict[str, Any], user_id: str | None) -> str:
    from agents.tools.binance_tools import get_binance_positions

    result = await get_binance_positions(user_id)
    return json.dumps(result)
