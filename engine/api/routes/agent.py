"""POST /agent/{explain,alpha-scan,similar,judge,save} — AI Agent LLM endpoints.

W-0378 Phase 1: explain, alpha-scan, similar
W-0387 Phase 2: judge, save
All endpoints call generate_llm_text() and log to agent_interactions.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from agents.llm_runtime import generate_llm_text, resolve_llm_settings
from agents.external_enrichment import fetch_news_context, extract_symbol_base, detect_risk_news
from agents.judge_runtime import (
    build_judge_prompt,
    parse_verdict,
    compute_rr,
    _JUDGE_SYSTEM,
)
from agents.save_runtime import (
    build_reason_prompt,
    promote_capture,
    _SAVE_REASON_SYSTEM,
)

log = logging.getLogger("engine.api.routes.agent")
router = APIRouter()


# ── Request / Response Models ─────────────────────────────────────────────────

class AgentResponse(BaseModel):
    text: str
    cmd: str
    latency_ms: int
    provider: str


class AnomalyFlag(BaseModel):
    severity: str
    description: str


class ExplainRequest(BaseModel):
    symbol: str
    timeframe: str = "4h"
    indicator_snapshot: dict[str, float] = Field(default_factory=dict)
    anomaly_flags: list[AnomalyFlag] = Field(default_factory=list)
    alpha_score: dict[str, Any] | None = None  # D1 fix: OI/funding via alpha composite
    user_id: str | None = None


class AlphaScanRequest(BaseModel):
    scores: list[dict[str, Any]]  # [{symbol, score, verdict, signals}]
    top_n: int = 5
    user_id: str | None = None


class SimilarSegment(BaseModel):
    symbol: str
    from_ts: str
    to_ts: str
    similarity_score: float
    forward_pnl_4h: float | None = None  # D2 fix: None allowed
    outcome: str | None = None


class SimilarResult(BaseModel):
    similar_segments: list[SimilarSegment]
    win_rate: float | None = None  # D3 fix: None allowed
    avg_pnl: float | None = None   # D3 fix: None allowed
    confidence: str = "low"


class SimilarRequest(BaseModel):
    symbol: str
    timeframe: str = "4h"
    similar: SimilarResult
    user_id: str | None = None


# ── System Prompts ────────────────────────────────────────────────────────────

_EXPLAIN_SYSTEM = """당신은 퀀트 트레이더 보조 AI입니다.
차트 구간의 지표 스냅샷과 최신 뉴스를 종합해 5문장 이내로 해석하세요.

지표 해석 기준:
- RSI > 70: 과매수 경고 | RSI < 30: 과매도 기회
- funding_rate 양수 크면 롱 쏠림, 음수 크면 숏 쏠림 (alpha_score에서)
- OI 변화 양수 + 가격 상승: 진짜 추세 / OI 감소 + 가격 상승: 숏 커버 (alpha_score에서)
- avg_volume_ratio > 2.0: 유효 브레이크아웃
- anomaly_flags severity=high: 반드시 언급

뉴스 컨텍스트가 있으면:
- 긍정 catalyst(ETF 승인, 기관 매입): 기술 신호를 강화
- 리스크 뉴스(해킹, 규제, 소송): ⚠️ 리스크 경고 추가
- 뉴스 없음: "뉴스 컨텍스트 없음"으로 명시

비용 가정: 수수료+슬리피지 최소 10bps. 순익 기대값 10bps 미만이면 관망 권장.
마지막 문장: 매수 / 매도 / 관망 판단 한 줄. 수치 직접 인용. 한국어."""

_SCAN_SYSTEM = """당신은 퀀트 트레이더 보조 AI입니다.
여러 심볼의 Alpha Score를 받아 Top 3 진입 기회를 추천하세요. 5문장 이내, 한국어.

규칙:
- score 수치 반드시 인용
- verdict STRONG_ALPHA/ALPHA만 진입 추천; WATCH는 관망; AVOID는 명시적 제외
- 비용 가정: 수수료+슬리피지 최소 10bps. 순익 기대값 낮으면 관망 권장
- 마지막 문장: 우선순위 1~3위 심볼 한 줄 요약"""

_SIMILAR_SYSTEM = """당신은 퀀트 트레이더 보조 AI입니다.
과거 유사구간 분석 결과를 받아 패턴 반복성을 해석하세요. 5문장 이내, 한국어.

규칙:
- win_rate 수치 반드시 인용 ("역사적 승률 X%"), 데이터 없으면 "데이터 부족"
- top 2~3 구간의 forward_pnl_4h 수치 언급, None이면 "미집계"로 표현
- confidence=low 또는 샘플 부족: "데이터가 충분하지 않아 참고 수준" 명시 후 판단
- confidence=high + win_rate >= 60%: "재현 가능성 높음" 판단 가능
- 비용 가정: 순익 기대값 10bps 미만이면 관망 권장"""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _sb():
    from supabase import create_client
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def _extract_verdict(text: str) -> str | None:
    """Extract buy/sell/watch signal from Korean LLM response for back-verification.

    Checks 관망 first so '과매수. 관망 권장.' → 'watch', not 'buy'.
    '매수' is checked as word boundary to skip '과매수'.
    """
    import re
    if "관망" in text:
        return "watch"
    if re.search(r"(?<!과)매수", text):
        return "buy"
    if "매도" in text:
        return "sell"
    return None


def _log_interaction(
    cmd: str,
    args: dict[str, Any],
    response: str,
    latency_ms: int,
    provider: str,
    error: str | None,
    user_id: str | None,
    llm_verdict: str | None,
    news_count: int = 0,
    has_risk_news: bool = False,
) -> None:
    try:
        _sb().table("agent_interactions").insert({
            "cmd": cmd,
            "args_json": args,
            "llm_response": response,
            "llm_verdict": llm_verdict,
            "latency_ms": latency_ms,
            "provider_used": provider,
            "error_detail": error,
            "user_id": user_id,
            "news_count": news_count,
            "has_risk_news": has_risk_news,
        }).execute()
    except Exception as exc:
        log.warning("agent_interactions log failed: %s", exc)


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/agent/explain", response_model=AgentResponse)
async def explain(req: ExplainRequest) -> AgentResponse:
    t0 = time.monotonic()
    cfg = resolve_llm_settings()
    symbol_base = extract_symbol_base(req.symbol)

    headlines = await fetch_news_context(symbol_base)
    risk_news = detect_risk_news(headlines)

    snapshot_text = "\n".join(f"  {k}: {v:.4f}" for k, v in req.indicator_snapshot.items())

    alpha_text = ""
    if req.alpha_score:
        alpha_text = f"\nAlpha Score: {req.alpha_score.get('score', 'N/A')} [{req.alpha_score.get('verdict', '')}]"
        for sig in req.alpha_score.get("signals", [])[:4]:
            alpha_text += f"\n  {sig.get('label', '')}: {sig.get('raw_value', '')}"

    if headlines:
        news_lines = "\n".join(f"  - {h}" for h in headlines)
        if risk_news:
            news_text = f"⚠️ 리스크 뉴스 감지:\n{news_lines}"
        else:
            news_text = news_lines
    else:
        news_text = "  없음"

    anomaly_text = (
        "\n".join(f"  [{f.severity}] {f.description}" for f in req.anomaly_flags)
        or "  없음"
    )

    user_text = (
        f"심볼: {req.symbol} ({req.timeframe})\n"
        f"지표 스냅샷 (OHLCV 기반):\n{snapshot_text}{alpha_text}\n"
        f"이상점:\n{anomaly_text}\n"
        f"최신 뉴스:\n{news_text}"
    )

    text = await generate_llm_text(
        _EXPLAIN_SYSTEM, user_text, max_tokens=512, temperature=0.1, settings=cfg
    )
    llm_verdict = _extract_verdict(text)
    latency = int((time.monotonic() - t0) * 1000)

    asyncio.ensure_future(asyncio.to_thread(
        _log_interaction,
        "explain",
        {"symbol": req.symbol, "has_alpha": req.alpha_score is not None},
        text, latency, cfg.provider, None, req.user_id,
        llm_verdict, len(headlines), risk_news,
    ))
    return AgentResponse(text=text, cmd="explain", latency_ms=latency, provider=cfg.provider)


@router.post("/agent/alpha-scan", response_model=AgentResponse)
async def alpha_scan(req: AlphaScanRequest) -> AgentResponse:
    t0 = time.monotonic()
    cfg = resolve_llm_settings()

    sorted_scores = sorted(req.scores, key=lambda x: x.get("score", 0), reverse=True)
    top = sorted_scores[: req.top_n]

    rows = "\n".join(
        f"  {s.get('symbol','?')}: score={s.get('score',0):.0f} [{s.get('verdict','?')}]"
        for s in top
    )
    user_text = f"Alpha Universe Top {len(top)}:\n{rows}"

    text = await generate_llm_text(
        _SCAN_SYSTEM, user_text, max_tokens=400, temperature=0.1, settings=cfg
    )
    latency = int((time.monotonic() - t0) * 1000)

    asyncio.ensure_future(asyncio.to_thread(
        _log_interaction,
        "scan",
        {"top_n": req.top_n, "symbols": [s.get("symbol") for s in top]},
        text, latency, cfg.provider, None, req.user_id,
        None, 0, False,
    ))
    return AgentResponse(text=text, cmd="scan", latency_ms=latency, provider=cfg.provider)


@router.post("/agent/similar", response_model=AgentResponse)
async def similar(req: SimilarRequest) -> AgentResponse:
    t0 = time.monotonic()
    cfg = resolve_llm_settings()

    sim = req.similar
    # D3 fix: None guards for win_rate and avg_pnl
    win_rate_str = f"{sim.win_rate * 100:.0f}%" if sim.win_rate is not None else "데이터 부족"
    avg_pnl_str = f"{sim.avg_pnl * 100:+.2f}%" if sim.avg_pnl is not None else "데이터 부족"

    seg_lines: list[str] = []
    for seg in sim.similar_segments[:5]:
        # D2 fix: is not None check for forward_pnl_4h (0.0 is valid)
        pnl = seg.forward_pnl_4h
        pnl_str = f"{pnl * 100:+.2f}%" if pnl is not None else "미집계"
        seg_lines.append(
            f"  {seg.symbol} {seg.from_ts[:10]}"
            f" sim={seg.similarity_score:.2f} pnl={pnl_str}"
        )

    segs_text = "\n".join(seg_lines) or "  유사구간 없음"
    user_text = (
        f"심볼: {req.symbol} ({req.timeframe})\n"
        f"유사구간 {len(sim.similar_segments)}개 [confidence={sim.confidence}]:\n{segs_text}\n"
        f"역사적 승률: {win_rate_str} | 평균 수익: {avg_pnl_str}"
    )

    text = await generate_llm_text(
        _SIMILAR_SYSTEM, user_text, max_tokens=400, temperature=0.1, settings=cfg
    )
    latency = int((time.monotonic() - t0) * 1000)

    asyncio.ensure_future(asyncio.to_thread(
        _log_interaction,
        "similar",
        {"symbol": req.symbol, "n_segments": len(sim.similar_segments), "confidence": sim.confidence},
        text, latency, cfg.provider, None, req.user_id,
        None, 0, False,
    ))
    return AgentResponse(text=text, cmd="similar", latency_ms=latency, provider=cfg.provider)


# ── W-0387: /agent/judge ──────────────────────────────────────────────────────

class JudgeRequest(BaseModel):
    symbol: str
    timeframe: str = "4h"
    indicator_snapshot: dict[str, float] = Field(default_factory=dict)
    alpha_score: dict[str, Any] | None = None
    last_price: float | None = None
    user_id: str | None = None


class JudgeResponse(BaseModel):
    verdict: str
    entry: float | None
    stop: float | None
    target: float | None
    p_win: float | None
    rr: float | None
    rationale: str
    text: str
    cmd: str
    latency_ms: int
    provider: str


@router.post("/agent/judge", response_model=JudgeResponse)
async def judge(req: JudgeRequest) -> JudgeResponse:
    t0 = time.monotonic()
    cfg = resolve_llm_settings()

    user_text = build_judge_prompt(
        req.symbol,
        req.timeframe,
        req.indicator_snapshot,
        req.alpha_score,
        req.last_price,
    )

    raw = await generate_llm_text(
        _JUDGE_SYSTEM, user_text, max_tokens=256, temperature=0.05, settings=cfg
    )
    parsed = parse_verdict(raw)
    rr = compute_rr(parsed["entry"], parsed["stop"], parsed["target"])
    latency = int((time.monotonic() - t0) * 1000)

    verdict_to_llm = {"bullish": "buy", "bearish": "sell", "neutral": "watch"}
    llm_verdict = verdict_to_llm.get(parsed["verdict"], "watch")

    asyncio.ensure_future(asyncio.to_thread(
        _log_interaction,
        "judge",
        {"symbol": req.symbol, "timeframe": req.timeframe},
        raw, latency, cfg.provider, None, req.user_id,
        llm_verdict, 0, False,
    ))

    return JudgeResponse(
        verdict=parsed["verdict"],
        entry=parsed["entry"],
        stop=parsed["stop"],
        target=parsed["target"],
        p_win=parsed["p_win"],
        rr=rr,
        rationale=parsed["rationale"],
        text=raw,
        cmd="judge",
        latency_ms=latency,
        provider=cfg.provider,
    )


# ── W-0387: /agent/save ───────────────────────────────────────────────────────

class SaveRequest(BaseModel):
    symbol: str
    timeframe: str = "4h"
    snapshot: dict[str, float] = Field(default_factory=dict)
    decision: dict[str, Any] = Field(default_factory=dict)
    trigger_origin: str = "agent_judge"
    user_id: str | None = None


class SaveResponse(BaseModel):
    capture_id: str
    dup_of: str | None
    reason_summary: str | None
    cmd: str
    latency_ms: int
    provider: str


@router.post("/agent/save", response_model=SaveResponse)
async def save(req: SaveRequest) -> SaveResponse:
    from fastapi import HTTPException

    if not req.user_id:
        raise HTTPException(status_code=400, detail="user_id required")

    t0 = time.monotonic()
    cfg = resolve_llm_settings()

    # Generate short reason summary (failure is non-fatal)
    reason: str | None = None
    try:
        reason_prompt = build_reason_prompt(
            req.symbol,
            req.timeframe,
            req.decision.get("verdict", "neutral"),
            req.decision.get("entry"),
            req.decision.get("stop"),
            req.decision.get("target"),
            req.decision.get("rationale", ""),
        )
        raw_reason = await generate_llm_text(
            _SAVE_REASON_SYSTEM, reason_prompt, max_tokens=100, temperature=0.1, settings=cfg
        )
        reason = raw_reason.strip()[:200] if raw_reason else None
    except Exception as exc:
        log.warning("save: reason LLM failed: %s", exc)

    result = await asyncio.to_thread(
        promote_capture,
        _sb(),
        req.user_id,
        req.symbol,
        req.timeframe,
        req.snapshot,
        req.decision,
        req.trigger_origin,
        reason,
    )
    latency = int((time.monotonic() - t0) * 1000)

    verdict_to_llm = {"bullish": "buy", "bearish": "sell", "neutral": "watch"}
    llm_verdict = verdict_to_llm.get(req.decision.get("verdict", "neutral"), "watch")

    asyncio.ensure_future(asyncio.to_thread(
        _log_interaction,
        "save",
        {"symbol": req.symbol, "dup_of": result.get("dup_of")},
        reason or "", latency, cfg.provider, None, req.user_id,
        llm_verdict, 0, False,
    ))

    return SaveResponse(
        capture_id=result["capture_id"],
        dup_of=result["dup_of"],
        reason_summary=reason,
        cmd="save",
        latency_ms=latency,
        provider=cfg.provider,
    )
