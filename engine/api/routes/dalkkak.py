"""딸깍 전략 API 라우터.

엔드포인트:
  GET  /dalkkak/gainers          — 실시간 상승률 상위 유니버스
  GET  /dalkkak/positions        — 현재 열린 포지션 (단방향 가드 상태)
  POST /dalkkak/positions/open   — 포지션 등록 (주문 집행 후 호출)
  POST /dalkkak/positions/close  — 포지션 닫기
  POST /dalkkak/caption          — 트레이드 결과 → KOL 캡션 생성
  GET  /dalkkak/risk             — 리스크 플랜 계산 (진입가 + ATR 기반)
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from patterns.position_guard import Direction, OpenPosition, get_guard
from patterns.risk_policy import DEFAULT_POLICY
from branding.kol_style_engine import TradeCaption, generate_kol_caption

log = logging.getLogger("engine.dalkkak")
router = APIRouter()


# ─── Schema ─────────────────────────────────────────────────────────────────

class OpenPositionRequest(BaseModel):
    symbol:      str   = Field(description="예: BTCUSDT")
    direction:   str   = Field(description="long | short")
    entry_price: float = Field(description="진입가 USDT")
    size_coin:   float = Field(description="포지션 크기 (코인 수)")
    stop_price:  float = Field(description="손절가 USDT")
    target_price: float = Field(description="목표가 USDT")


class CaptionRequest(BaseModel):
    symbol:       str   = Field(description="예: BTCUSDT")
    direction:    str   = Field(description="long | short")
    entry_price:  float
    exit_price:   float
    pnl_usdt:     float = Field(description="손익 USDT (+수익 / -손실)")
    pnl_pct:      float = Field(description="손익 %")
    pattern_name: str   = Field(description="발동 패턴 이름")
    hold_hours:   float = Field(description="보유 시간 (h)")


# ─── Routes ─────────────────────────────────────────────────────────────────

@router.get("/gainers")
async def gainers(
    top_n:               int   = Query(default=10, ge=1, le=50),
    min_volume_usdt:     float = Query(default=5_000_000.0, description="최소 24h 거래량"),
    min_price_change_pct: float = Query(default=3.0,       description="최소 상승률 %"),
    new_listing_days:    int   = Query(default=180,         description="신규 상장 기준일"),
    new_listing_boost:   float = Query(default=1.5,         description="신규 상장 가중치"),
) -> dict:
    """실시간 Binance Futures 상승률 상위 후보 유니버스.

    딸깍 전략 원칙: 24h 상승률 + 변동성(ATR%) + 신규 상장 여부를
    composite score로 조합해 진입 우선순위를 결정.
    """
    try:
        from universe.gainers import load_gainer_candidates
        candidates = load_gainer_candidates(
            top_n=top_n,
            min_volume_usdt=min_volume_usdt,
            min_price_change_pct=min_price_change_pct,
            new_listing_days=new_listing_days,
            new_listing_boost=new_listing_boost,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return {
        "ok":    True,
        "count": len(candidates),
        "gainers": [
            {
                "symbol":               c.symbol,
                "price_change_24h_pct": c.price_change_24h_pct,
                "atr_pct":              c.atr_pct,
                "volume_usdt_24h":      c.volume_usdt_24h,
                "listing_age_days":     c.listing_age_days,
                "is_new_listing":       c.is_new_listing,
                "composite_score":      c.composite_score,
            }
            for c in candidates
        ],
    }


@router.get("/positions")
async def list_positions() -> dict:
    """단방향 가드에 등록된 현재 열린 포지션 목록."""
    guard = get_guard()
    return {
        "ok":       True,
        "count":    len(guard.open_symbols()),
        "positions": guard.summary(),
    }


@router.post("/positions/open")
async def open_position(req: OpenPositionRequest) -> dict:
    """포지션 등록 — 단방향 원칙 검사 후 가드에 기록.

    이 엔드포인트는 실제 주문 집행 후 호출한다.
    주문 집행 자체는 클라이언트 / 별도 자동매매 모듈이 담당.
    """
    guard = get_guard()

    try:
        direction = Direction(req.direction.lower())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid direction: {req.direction}")

    can, reason = guard.can_enter(req.symbol, direction)
    if not can:
        raise HTTPException(status_code=409, detail=reason)

    pos = OpenPosition(
        symbol=req.symbol,
        direction=direction,
        entry_price=req.entry_price,
        size_coin=req.size_coin,
        stop_price=req.stop_price,
        target_price=req.target_price,
    )
    guard.register(pos)

    log.info(
        "Position opened: %s %s @ %.4f | stop=%.4f | target=%.4f",
        req.symbol, direction.value, req.entry_price, req.stop_price, req.target_price,
    )

    return {"ok": True, "symbol": req.symbol, "direction": direction.value}


@router.post("/positions/close")
async def close_position(symbol: str = Query(description="심볼 예: BTCUSDT")) -> dict:
    """포지션 닫기 — 가드에서 제거."""
    guard = get_guard()
    pos = guard.get_position(symbol)
    if pos is None:
        raise HTTPException(status_code=404, detail=f"No open position for {symbol}")

    guard.close(symbol)
    log.info("Position closed: %s", symbol)
    return {"ok": True, "symbol": symbol, "closed": True}


@router.post("/caption")
async def caption(req: CaptionRequest) -> dict:
    """트레이드 결과를 KOL 스타일 SNS 캡션으로 변환.

    Claude API (ANTHROPIC_API_KEY) 없으면 plain text fallback.
    """
    trade = TradeCaption(
        symbol=req.symbol,
        direction=req.direction,
        entry_price=req.entry_price,
        exit_price=req.exit_price,
        pnl_usdt=req.pnl_usdt,
        pnl_pct=req.pnl_pct,
        pattern_name=req.pattern_name,
        hold_hours=req.hold_hours,
    )
    text = generate_kol_caption(trade)
    return {"ok": True, "caption": text}


@router.get("/risk")
async def risk_plan(
    entry_price: float = Query(description="진입가 USDT"),
    atr:         float = Query(description="현재 ATR (USDT)"),
) -> dict:
    """200 USDT 고정 손절 기반 포지션 플랜 계산.

    진입가와 ATR을 받아서:
      - stop 가격 (1.5 ATR, 최대 200U 손실 제한)
      - 포지션 크기 (코인 수)
      - 목표가 (3:1 R/R)
    를 반환.
    """
    if entry_price <= 0:
        raise HTTPException(status_code=400, detail="entry_price must be > 0")
    if atr <= 0:
        raise HTTPException(status_code=400, detail="atr must be > 0")

    plan = DEFAULT_POLICY.summary(entry_price, atr)
    return {"ok": True, "plan": plan}
