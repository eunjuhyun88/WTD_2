"""
Cogochi Context Builder
LLM 프롬프트 조립. 블록 순서 절대 변경 불가.
block_system → role → objective → signals → market → stage → skills → memories → schema
2026-03-31
"""

from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .battle_engine import BattleContext

TOKEN_BUDGET = {
    "system_role":  400,
    "scenario":     400,
    "market_stage": 400,
    "skills":       300,
    "memories":     300,
    "squad_schema": 200,
}

_ROLE_PROMPTS = {
    "CRUSHER": "You are aggressive. Prioritize CVD divergence and funding overheat. Bias toward SHORT on overextended longs.",
    "RIDER":   "You are trend-following. Wait for structure confirmation before entry. Avoid counter-trend trades.",
    "ORACLE":  "You specialize in divergence detection. Price vs orderflow discrepancies are your edge.",
    "GUARDIAN":"You are risk-first. Veto high-risk setups. Capital preservation over gains.",
}


def build(ctx: "BattleContext", agent: dict, scenario: dict) -> str:
    blocks: list[str] = []

    doctrine = agent.get("doctrine", {})
    weights  = doctrine.get("signal_weights", {})
    snap     = ctx.snapshot

    # 1. block_system
    blocks.append(
        f"[IDENTITY]\n"
        f"Name: {agent['name']} | Archetype: {agent['archetypeId']} | "
        f"Stage: {agent.get('stage', 0)} | Level: {agent.get('level', 1)}\n"
        f"Doctrine: {doctrine.get('systemPrompt', 'Trade with discipline.')}"
    )

    # 2. block_role
    role = _ROLE_PROMPTS.get(agent.get("archetypeId", ""), "")
    blocks.append(f"[ROLE]\n{role}")

    # 3. block_objective
    blocks.append(
        f"[OBJECTIVE]\n"
        f"Scenario: {scenario.get('id', '?')} | "
        f"Symbol: {scenario.get('symbol', 'BTCUSDT')} | "
        f"Timeframe: {scenario.get('interval', '15m')}\n"
        f"Decide: LONG, SHORT, or FLAT. Set SL and TP in price terms."
    )

    # 4. block_signals
    w_lines = "\n".join(
        f"  {k}: {v:.2f}" for k, v in weights.items()
    )
    blocks.append(f"[SIGNAL WEIGHTS]\n{w_lines}" if w_lines else "[SIGNAL WEIGHTS]\n  (default)")

    # 5. block_market
    blocks.append(
        f"[MARKET STATE]\n"
        f"  primaryZone:    {snap.get('primaryZone', '?')}\n"
        f"  cvdState:       {snap.get('cvdState', '?')} ({snap.get('cvdValue', 0):+.0f})\n"
        f"  oiChange1h:     {snap.get('oiChange1h', 0):+.1%}\n"
        f"  fundingRate:    {snap.get('fundingRate', 0):.4f} ({snap.get('fundingLabel', '?')})\n"
        f"  htfStructure:   {snap.get('htfStructure', '?')}\n"
        f"  atrPct:         {snap.get('atrPct', 0):.1f}%\n"
        f"  vwapDistance:   {snap.get('vwapDistance', 0):+.2f}%\n"
        f"  compositeScore: {snap.get('compositeScore', 0):.2f}\n"
        f"  currentPrice:   {snap.get('currentPrice', 0):,.1f}"
    )

    # 6. block_stage
    blocks.append(
        f"[STAGE]\n"
        f"  Stage {agent.get('stage', 0)} | Level {agent.get('level', 1)} | Bond {agent.get('bond', 0)}"
    )

    # 7. block_skills ★
    skill_lines = []
    for skill_id, result in ctx.skill_results.items():
        if result is not None:
            skill_lines.append(_summarize_skill(skill_id, result))
    if skill_lines:
        blocks.append("[SKILLS INTELLIGENCE]\n" + "\n".join(f"  {l}" for l in skill_lines))

    # 8. block_memories
    if ctx.memories:
        mem_lines = []
        for m in ctx.memories[:5]:
            kind    = m.get("kind", "?")
            content = m.get("content", "")[:120]
            mem_lines.append(f"  [{kind}] {content}")
        blocks.append("[PAST EXPERIENCE]\n" + "\n".join(mem_lines))

    # 10. block_schema (항상 마지막)
    blocks.append(
        '[OUTPUT]\n'
        'Respond with ONLY this JSON (no markdown, no explanation):\n'
        '{"action":"LONG|SHORT|FLAT","confidence":0.0,"thesis":"<30 words>","sl":0.0,"tp":0.0}'
    )

    return "\n\n".join(blocks)


def _summarize_skill(skill_id: str, result: dict) -> str:
    """Skills 결과를 1줄 (~50 토큰)로 압축"""
    try:
        if skill_id == "coingecko_price":
            return (
                f"coingecko: BTC ${result.get('btc_price', '?'):,} | "
                f"dom {result.get('btc_dominance', '?')}% | "
                f"24h {result.get('btc_24h_change', 0):+.1f}%"
            )
        elif skill_id == "coinglass_liquidation":
            nearest = result.get("nearest_cluster_pct", 99)
            long_liq = result.get("liq_24h_long_usd", 0)
            return (
                f"coinglass: nearest liq cluster {nearest:.1f}% away | "
                f"24h long liq ${long_liq/1e6:.0f}M"
            )
        elif skill_id == "nansen_smartmoney":
            flow = result.get("net_flow_usd", 0)
            direction = "inflow" if flow > 0 else "outflow"
            return f"nansen: smart money net {direction} ${abs(flow)/1e6:.0f}M last 24h"
        elif skill_id == "binance_market":
            ratio = result.get("depth_ratio", 1.0)
            pressure = "bid-heavy" if ratio > 1.2 else "ask-heavy" if ratio < 0.8 else "balanced"
            return (
                f"binance: orderbook {pressure} (ratio {ratio:.2f}) | "
                f"top ask ${result.get('top_ask_price', '?'):,}"
            )
    except Exception:
        pass
    return f"{skill_id}: data available"
