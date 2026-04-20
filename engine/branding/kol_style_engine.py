"""KOL 스타일 엔진 — 딸깍 전략 콘텐츠 브랜딩.

딸깍 원칙:
  "AI가 KOL 말투를 학습해서 콘텐츠를 자동 생성한다."
  "실제 트레이딩 결과를 투명하게 공유해 신뢰를 쌓는다."

Claude API를 통해 트레이드 결과를 KOL 스타일 텍스트로 변환.
환경변수 ANTHROPIC_API_KEY 없으면 plain text로 fallback.

KOL 스타일 특징 (딸깍 채널 분석 기반):
  - 직관적이고 간결한 한국어
  - 구체적 수치 강조 (+7.2%, 200U 손절)
  - 감정 배제, 팩트 중심
  - 자신감 있는 어조 (절대 "아마도", "같아요" 없음)
  - 한 줄 핵심 → 세부 근거 순서
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass

log = logging.getLogger("engine.branding.kol_style")

_ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
_MODEL = "claude-haiku-4-5-20251001"   # 빠르고 저렴한 Haiku 사용


@dataclass
class TradeCaption:
    """KOL 스타일 트레이드 캡션."""
    symbol: str
    direction: str          # "long" | "short"
    entry_price: float
    exit_price: float
    pnl_usdt: float         # +200 = 수익, -200 = 손절
    pnl_pct: float          # R/R 기준 %
    pattern_name: str       # 발동 패턴 이름
    hold_hours: float       # 보유 시간 (h)

    @property
    def is_win(self) -> bool:
        return self.pnl_usdt > 0


_SYSTEM_PROMPT = """\
너는 암호화폐 트레이딩 KOL이다.
딸깍 전략 (Small losses, Big wins) 을 운용하며,
투명한 P&L 공유로 팔로워 신뢰를 쌓는다.

스타일 규칙:
1. 한국어, 간결하게 3-5문장 이내
2. 구체적 수치 필수 (가격, USDT, %)
3. "아마도" / "같아요" / "것 같습니다" 금지
4. 첫 줄 = 결과 한 줄 요약
5. 손절은 당당하게 — 리스크 관리 성공으로 프레이밍
6. 이모지 1-2개만 (과하지 않게)
"""


def _plain_caption(trade: TradeCaption) -> str:
    """Claude API 없을 때 기본 텍스트 생성."""
    direction_kr = "롱" if trade.direction == "long" else "숏"
    result_kr = "청산" if trade.is_win else "손절"
    pnl_sign = "+" if trade.pnl_usdt >= 0 else ""

    if trade.is_win:
        return (
            f"{'✅'} {trade.symbol} {direction_kr} {result_kr}\n"
            f"진입 {trade.entry_price:,.4f} → 청산 {trade.exit_price:,.4f}\n"
            f"수익 {pnl_sign}{trade.pnl_usdt:.0f} USDT ({pnl_sign}{trade.pnl_pct:.1f}%)\n"
            f"패턴: {trade.pattern_name} | 보유 {trade.hold_hours:.1f}h\n"
            f"딸깍 전략 — 적게 잃고, 크게 먹는다."
        )
    else:
        return (
            f"{'🛑'} {trade.symbol} {direction_kr} 손절\n"
            f"진입 {trade.entry_price:,.4f} → 손절 {trade.exit_price:,.4f}\n"
            f"손실 {trade.pnl_usdt:.0f} USDT ({trade.pnl_pct:.1f}%) — 200U 리스크 관리 완료\n"
            f"패턴: {trade.pattern_name} | 보유 {trade.hold_hours:.1f}h\n"
            f"다음 기회를 기다린다. 손절은 전략의 일부."
        )


def generate_kol_caption(trade: TradeCaption) -> str:
    """트레이드 결과를 KOL 스타일 텍스트로 변환.

    Claude API 가용 시 AI 생성, 없으면 plain text fallback.

    Args:
        trade: 트레이드 결과 데이터

    Returns:
        SNS 게시용 KOL 스타일 텍스트
    """
    if not _ANTHROPIC_API_KEY:
        log.debug("ANTHROPIC_API_KEY not set — using plain caption")
        return _plain_caption(trade)

    try:
        return _call_claude(trade)
    except Exception as exc:
        log.warning("Claude API failed (%s) — fallback to plain caption", exc)
        return _plain_caption(trade)


def _call_claude(trade: TradeCaption) -> str:
    """Claude API 호출."""
    import anthropic  # lazy import — optional dep

    direction_kr = "롱" if trade.direction == "long" else "숏"
    pnl_sign = "+" if trade.pnl_usdt >= 0 else ""

    user_prompt = f"""다음 트레이드 결과를 KOL 스타일로 작성해줘:

심볼: {trade.symbol}
방향: {direction_kr}
진입가: {trade.entry_price:,.4f} USDT
청산가: {trade.exit_price:,.4f} USDT
손익: {pnl_sign}{trade.pnl_usdt:.0f} USDT ({pnl_sign}{trade.pnl_pct:.1f}%)
패턴: {trade.pattern_name}
보유시간: {trade.hold_hours:.1f}시간
결과: {'수익 실현' if trade.is_win else '손절 (200U 리스크 관리)'}

SNS 게시용 캡션만 출력해. 설명이나 주석 없이."""

    client = anthropic.Anthropic(api_key=_ANTHROPIC_API_KEY)
    msg = client.messages.create(
        model=_MODEL,
        max_tokens=256,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )
    return msg.content[0].text.strip()


def distill_kol_style(sample_posts: list[str]) -> str:
    """KOL 샘플 포스트에서 말투 패턴 추출.

    채널 게시물을 분석해 스타일 가이드를 반환.
    향후 _SYSTEM_PROMPT 갱신에 활용.

    Args:
        sample_posts: KOL 원문 게시물 목록 (10-50개 권장)

    Returns:
        스타일 분석 텍스트 (내부용)
    """
    if not _ANTHROPIC_API_KEY:
        return "ANTHROPIC_API_KEY required for style distillation"

    if not sample_posts:
        return "No sample posts provided"

    try:
        import anthropic
        samples_text = "\n---\n".join(sample_posts[:30])

        client = anthropic.Anthropic(api_key=_ANTHROPIC_API_KEY)
        msg = client.messages.create(
            model=_MODEL,
            max_tokens=512,
            messages=[{
                "role": "user",
                "content": (
                    f"다음 암호화폐 트레이딩 KOL 게시물들의 말투 특징을 분석해줘.\n"
                    f"어조, 문장 구조, 자주 쓰는 표현, 숫자 제시 방식을 정리해줘.\n\n"
                    f"{samples_text}"
                ),
            }],
        )
        return msg.content[0].text.strip()
    except Exception as exc:
        log.error("Style distillation failed: %s", exc)
        return f"Style distillation error: {exc}"
