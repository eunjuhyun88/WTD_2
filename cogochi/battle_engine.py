"""
Cogochi Battle Engine
상태머신: OBSERVE → RETRIEVE → REASON → DECIDE → RESOLVE → REFLECT
2026-03-31
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, AsyncGenerator, Callable

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────
# 상태 정의
# ──────────────────────────────────────────────

class BattleState(str, Enum):
    OBSERVE  = "OBSERVE"
    RETRIEVE = "RETRIEVE"
    REASON   = "REASON"
    DECIDE   = "DECIDE"
    RESOLVE  = "RESOLVE"
    REFLECT  = "REFLECT"


# ──────────────────────────────────────────────
# 배틀 컨텍스트 (단일 배틀의 모든 상태)
# ──────────────────────────────────────────────

@dataclass
class BattleContext:
    battle_id:     str
    agent_id:      str
    scenario_id:   str
    snapshot:      dict                          # SignalSnapshot
    candles:       list[dict]                    # OHLCV (결과 계산용)
    memories:      list[dict]  = field(default_factory=list)
    skill_results: dict        = field(default_factory=dict)
    llm_output:    dict | None = None
    trainer_action: str | None = None            # APPROVE | OVERRIDE_*
    outcome:       str | None  = None            # WIN | LOSS | DRAW
    pnl:           float | None = None
    reflection:    str | None  = None
    chain_hash:    str | None  = None
    xp_gained:     int         = 0
    bond_gained:   int         = 0
    started_at:    float       = field(default_factory=time.time)


# ──────────────────────────────────────────────
# SSE 이벤트 포맷
# ──────────────────────────────────────────────

def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# ──────────────────────────────────────────────
# GUARDIAN Veto
# ──────────────────────────────────────────────

def guardian_veto(ctx: BattleContext) -> tuple[bool, str]:
    """
    어떤 아키타입이든 이 조건을 만족하면 FLAT 강제.
    반환: (veto_triggered, reason)
    """
    s = ctx.snapshot
    action = (ctx.llm_output or {}).get("action", "FLAT")

    # 조건 1: 펀딩 과열 + 롱
    if s.get("fundingRate", 0) > 0.0015 and action == "LONG":
        return True, "funding_overheat_long"

    # 조건 2: ATR 폭발
    if s.get("atrPct", 0) > 8.0:
        return True, "atr_extreme"

    # 조건 3: 청산 클러스터 1.5% 이내 (Skills 데이터)
    liq = ctx.skill_results.get("coinglass_liquidation")
    if liq and liq.get("nearest_cluster_pct", 99) < 1.5:
        return True, "liq_cluster_near"

    # nofx 패턴: 최근 3회 연속 LOSS (메모리 기반)
    recent = [m for m in ctx.memories if m.get("kind") == "MATCH_SUMMARY"][-3:]
    if len(recent) == 3 and all(m.get("outcome") == "LOSS" for m in recent):
        return True, "three_consecutive_loss"

    return False, ""


# ──────────────────────────────────────────────
# 결과 계산
# ──────────────────────────────────────────────

def resolve_outcome(
    ctx: BattleContext,
    future_candles: list[dict],
) -> tuple[str, float]:
    """
    에이전트 action vs 실제 다음 캔들 방향으로 WIN/LOSS/DRAW 결정.
    PnL은 ATR 기준 비율로 계산.
    """
    action = (ctx.llm_output or {}).get("action", "FLAT")
    sl     = (ctx.llm_output or {}).get("sl")
    tp     = (ctx.llm_output or {}).get("tp")

    if action == "FLAT" or not future_candles:
        return "DRAW", 0.0

    entry  = ctx.snapshot.get("currentPrice", 0)
    atr    = ctx.snapshot.get("atrPct", 1.0) / 100 * entry

    if not (sl and tp):
        sl = entry - atr * 1.5 if action == "LONG" else entry + atr * 1.5
        tp = entry + atr * 2.0 if action == "LONG" else entry - atr * 2.0

    for candle in future_candles[:20]:   # 최대 20봉 이내
        high = candle.get("high", entry)
        low  = candle.get("low", entry)

        if action == "LONG":
            if high >= tp:
                pnl = (tp - entry) / entry
                return "WIN", round(pnl, 5)
            if low <= sl:
                pnl = (sl - entry) / entry
                return "LOSS", round(pnl, 5)
        else:  # SHORT
            if low <= tp:
                pnl = (entry - tp) / entry
                return "WIN", round(pnl, 5)
            if high >= sl:
                pnl = (entry - sl) / entry
                return "LOSS", round(pnl, 5)

    # 20봉 이내 TP/SL 미도달 → DRAW
    last_close = future_candles[-1].get("close", entry)
    if action == "LONG":
        pnl = (last_close - entry) / entry
    else:
        pnl = (entry - last_close) / entry
    outcome = "WIN" if pnl > 0 else "LOSS" if pnl < 0 else "DRAW"
    return outcome, round(pnl, 5)


# ──────────────────────────────────────────────
# XP / Bond 계산
# ──────────────────────────────────────────────

_XP_TABLE = {"WIN": 100, "LOSS": 30, "DRAW": 10}
_BOND_TABLE = {"WIN": 3, "LOSS": 1, "DRAW": 0}


def calc_xp_bond(outcome: str, confidence: float) -> tuple[int, int]:
    base_xp   = _XP_TABLE.get(outcome, 0)
    base_bond = _BOND_TABLE.get(outcome, 0)
    multiplier = 1.0 + (confidence - 0.5) * 0.5  # 0.75~1.25
    return int(base_xp * multiplier), base_bond


# ──────────────────────────────────────────────
# 리플렉션 생성
# ──────────────────────────────────────────────

async def generate_reflection(ctx: BattleContext, ollama_client) -> str:
    """2줄 리플렉션. LLM 실패 시 규칙 기반 폴백."""
    outcome  = ctx.outcome
    action   = (ctx.llm_output or {}).get("action", "FLAT")
    thesis   = (ctx.llm_output or {}).get("thesis", "")
    skills   = list(ctx.skill_results.keys())

    prompt = f"""You made a {action} decision with thesis: "{thesis}"
Result: {outcome} (pnl: {ctx.pnl:.4f})
Skills used: {', '.join(skills) if skills else 'none'}

Write EXACTLY 2 sentences: what you got right and what to improve next time.
Be specific about signals. No generic phrases."""

    try:
        result = await asyncio.wait_for(
            ollama_client.generate(prompt, max_tokens=80),
            timeout=4.0
        )
        return result.strip()
    except Exception:
        # 폴백: 규칙 기반
        if outcome == "WIN":
            return f"{action} decision validated by {thesis[:50]}. Confidence was well-calibrated."
        elif outcome == "LOSS":
            return f"{action} triggered stop-loss. Re-examine {ctx.snapshot.get('cvdState', 'signals')} threshold."
        else:
            return "Position closed at entry. Market was indecisive — FLAT was correct."


# ──────────────────────────────────────────────
# 메인 배틀 실행 (SSE Generator)
# ──────────────────────────────────────────────

async def run_battle(
    battle_id:      str,
    agent:          dict,          # OwnedAgent dict
    scenario:       dict,          # {id, snapshot, candles, future_candles}
    skill_registry,                # SkillRegistry 인스턴스
    memory_service,                # MemoryService 인스턴스
    context_builder,               # ContextBuilder 인스턴스
    ollama_client,                 # OllamaClient 인스턴스
    chain_service,                 # ChainService 인스턴스
    db,                            # Database 인스턴스
) -> AsyncGenerator[str, None]:
    """
    배틀 전체를 SSE 스트림으로 반환.
    각 상태 전환마다 event: state_change 이벤트를 emit.
    """

    ctx = BattleContext(
        battle_id=battle_id,
        agent_id=agent["id"],
        scenario_id=scenario["id"],
        snapshot=scenario["snapshot"],
        candles=scenario.get("candles", []),
    )

    # ── OBSERVE ──────────────────────────────
    yield _sse("state_change", {
        "state": BattleState.OBSERVE,
        "payload": {
            "scenario_id":    scenario["id"],
            "symbol":         scenario.get("symbol", "BTCUSDT"),
            "snapshot":       ctx.snapshot,
            "agent_name":     agent["name"],
            "archetype":      agent["archetypeId"],
        }
    })
    await asyncio.sleep(0.1)

    # ── RETRIEVE ─────────────────────────────
    try:
        ctx.memories = await asyncio.wait_for(
            memory_service.query(agent["id"], ctx.snapshot, top_k=5),
            timeout=3.0
        )
    except Exception as e:
        logger.warning(f"[battle:{battle_id}] memory query failed: {e}")
        ctx.memories = []

    yield _sse("state_change", {
        "state": BattleState.RETRIEVE,
        "payload": {
            "memories_count": len(ctx.memories),
            "memories": [
                {"kind": m.get("kind"), "content": m.get("content", "")[:100]}
                for m in ctx.memories
            ],
        }
    })
    await asyncio.sleep(0.05)

    # ── REASON ───────────────────────────────
    ctx.skill_results = await skill_registry.call_all_parallel(
        loadout=agent.get("skillLoadout", {}),
        snapshot=ctx.snapshot,
        budget_ms=agent.get("skillLoadout", {}).get("totalBudgetMs", 6000),
    )

    skill_summary = {
        skill_id: {
            "status":    "ok" if result is not None else "failed",
            "data":      result,
        }
        for skill_id, result in ctx.skill_results.items()
    }

    yield _sse("state_change", {
        "state": BattleState.REASON,
        "payload": {
            "skills_called":  list(ctx.skill_results.keys()),
            "skills_summary": skill_summary,
        }
    })
    await asyncio.sleep(0.05)

    # ── DECIDE ───────────────────────────────
    context_str = context_builder.build(ctx, agent, scenario)

    try:
        raw = await asyncio.wait_for(
            ollama_client.infer(
                model=agent.get("modelVersion") or "qwen2.5:1.5b",
                prompt=context_str,
            ),
            timeout=5.0
        )
        ctx.llm_output = _parse_llm_output(raw)
    except asyncio.TimeoutError:
        logger.warning(f"[battle:{battle_id}] LLM timeout → FLAT fallback")
        ctx.llm_output = {"action": "FLAT", "confidence": 0.0,
                          "thesis": "timeout_fallback", "sl": None, "tp": None}
    except Exception as e:
        logger.error(f"[battle:{battle_id}] LLM error: {e}")
        ctx.llm_output = {"action": "FLAT", "confidence": 0.0,
                          "thesis": "error_fallback", "sl": None, "tp": None}

    # GUARDIAN Veto
    veto, veto_reason = guardian_veto(ctx)
    if veto:
        original_action = ctx.llm_output["action"]
        ctx.llm_output["action"] = "FLAT"
        ctx.llm_output["veto"] = True
        ctx.llm_output["veto_reason"] = veto_reason
        logger.info(f"[battle:{battle_id}] GUARDIAN veto: {veto_reason} "
                    f"(was {original_action})")

    yield _sse("state_change", {
        "state": BattleState.DECIDE,
        "payload": {
            **ctx.llm_output,
            "awaiting_trainer": True,   # 트레이너 입력 대기
        }
    })

    # 트레이너 입력 대기 (최대 60초)
    trainer_event = asyncio.Event()
    _pending_trainer_actions[battle_id] = trainer_event

    try:
        await asyncio.wait_for(trainer_event.wait(), timeout=60.0)
    except asyncio.TimeoutError:
        ctx.trainer_action = "APPROVE"   # 타임아웃 → 자동 승인
    finally:
        _pending_trainer_actions.pop(battle_id, None)

    # OVERRIDE 처리
    if ctx.trainer_action and ctx.trainer_action.startswith("OVERRIDE_"):
        override_action = ctx.trainer_action.replace("OVERRIDE_", "")
        ctx.llm_output["action"] = override_action
        ctx.llm_output["overridden"] = True

    # ── RESOLVE ──────────────────────────────
    future_candles = scenario.get("future_candles", [])
    ctx.outcome, ctx.pnl = resolve_outcome(ctx, future_candles)
    ctx.xp_gained, ctx.bond_gained = calc_xp_bond(
        ctx.outcome,
        ctx.llm_output.get("confidence", 0.5)
    )

    yield _sse("state_change", {
        "state": BattleState.RESOLVE,
        "payload": {
            "outcome":    ctx.outcome,
            "pnl":        ctx.pnl,
            "xp_gained":  ctx.xp_gained,
            "bond_gained": ctx.bond_gained,
        }
    })
    await asyncio.sleep(0.1)

    # ── REFLECT ──────────────────────────────
    ctx.reflection = await generate_reflection(ctx, ollama_client)

    # 메모리 저장
    try:
        await memory_service.save_battle(ctx)
    except Exception as e:
        logger.error(f"[battle:{battle_id}] memory save failed: {e}")

    # 온체인 커밋
    try:
        ctx.chain_hash = await asyncio.wait_for(
            chain_service.commit_battle(ctx),
            timeout=10.0
        )
    except Exception as e:
        logger.warning(f"[battle:{battle_id}] chain commit failed: {e}")
        ctx.chain_hash = None

    # DB 저장
    try:
        await db.save_battle_result(ctx)
        await db.update_agent_stats(ctx.agent_id, ctx.outcome,
                                    ctx.xp_gained, ctx.bond_gained)
    except Exception as e:
        logger.error(f"[battle:{battle_id}] db save failed: {e}")

    yield _sse("state_change", {
        "state": BattleState.REFLECT,
        "payload": {
            "reflection":  ctx.reflection,
            "memory_saved": True,
            "chain_hash":   ctx.chain_hash,
        }
    })

    yield _sse("done", {
        "battle_id":  battle_id,
        "outcome":    ctx.outcome,
        "pnl":        ctx.pnl,
        "chain_hash": ctx.chain_hash,
    })


# ──────────────────────────────────────────────
# 트레이너 액션 등록 (별도 HTTP 엔드포인트에서 호출)
# ──────────────────────────────────────────────

_pending_trainer_actions: dict[str, asyncio.Event] = {}
_trainer_action_store:    dict[str, str]            = {}


def register_trainer_action(battle_id: str, action: str) -> bool:
    """
    POST /api/battle/{id}/action 에서 호출.
    action: APPROVE | OVERRIDE_LONG | OVERRIDE_SHORT | OVERRIDE_FLAT
    반환: True if battle was waiting, False if not found
    """
    event = _pending_trainer_actions.get(battle_id)
    if not event:
        return False
    _trainer_action_store[battle_id] = action
    event.set()
    return True


def get_trainer_action(battle_id: str) -> str:
    return _trainer_action_store.pop(battle_id, "APPROVE")


# ──────────────────────────────────────────────
# LLM 출력 파싱
# ──────────────────────────────────────────────

def _parse_llm_output(raw: str) -> dict:
    """
    LLM 출력에서 JSON 파싱.
    실패 시 FLAT 폴백.
    """
    try:
        # JSON 블록 추출
        start = raw.find("{")
        end   = raw.rfind("}") + 1
        if start == -1 or end == 0:
            raise ValueError("no json found")
        data = json.loads(raw[start:end])

        action = data.get("action", "FLAT").upper()
        if action not in ("LONG", "SHORT", "FLAT"):
            action = "FLAT"

        confidence = float(data.get("confidence", 0.5))
        confidence = max(0.0, min(1.0, confidence))

        return {
            "action":     action,
            "confidence": confidence,
            "thesis":     str(data.get("thesis", ""))[:200],
            "sl":         float(data["sl"]) if data.get("sl") else None,
            "tp":         float(data["tp"]) if data.get("tp") else None,
        }
    except Exception as e:
        logger.warning(f"LLM output parse failed: {e} | raw: {raw[:100]}")
        return {
            "action":     "FLAT",
            "confidence": 0.0,
            "thesis":     "parse_error_fallback",
            "sl":         None,
            "tp":         None,
        }
