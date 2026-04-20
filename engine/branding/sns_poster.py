"""SNS 자동 포스터 — 딸깍 전략 브랜딩 레이어.

거래 결과 → P&L 카드 생성 → Twitter 자동 포스팅.
"신뢰 자산화: 실시간 수익률을 투명하게 공유해 팔로워와 신뢰도를 동시에 확보"
"""
from __future__ import annotations

import logging
import os
import tempfile

from branding.pnl_renderer import TradeResult, render_pnl_card
from social.twitter_client import get_twitter_client

log = logging.getLogger("engine.branding.sns_poster")


def post_trade_result(result: TradeResult) -> dict:
    """거래 결과를 P&L 카드로 만들어 Twitter에 포스팅.

    Args:
        result: 거래 결과 데이터

    Returns:
        {"posted": bool, "tweet_id": str | None, "card_bytes": int}
    """
    client = get_twitter_client()

    # 1. P&L 카드 PNG 생성
    try:
        card_bytes = render_pnl_card(result)
    except ImportError:
        log.warning("Pillow not available — skipping card generation")
        return {"posted": False, "tweet_id": None, "card_bytes": 0}

    # 2. 캡션 생성
    caption = _build_caption(result)

    # 3. Twitter 포스팅 (token 없으면 None 반환)
    tweet_result = None
    if client.available:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            f.write(card_bytes)
            tmp_path = f.name
        try:
            tweet_result = client.post_pnl_card(text=caption, image_path=tmp_path)
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
    else:
        log.info("Twitter not available — card generated but not posted")

    tweet_id = (tweet_result or {}).get("data", {}).get("id")
    return {
        "posted":     tweet_result is not None,
        "tweet_id":   tweet_id,
        "card_bytes": len(card_bytes),
        "caption":    caption,
    }


def _build_caption(result: TradeResult) -> str:
    """KOL 스타일 캡션 생성.

    딸깍 전략 원칙:
    - 수익은 자랑 (신뢰 자산화)
    - 손절도 공유 (룰 지켰다는 신뢰)
    """
    symbol_clean = result.symbol.replace("USDT", "").replace("PERP", "")
    pct = (result.exit_price - result.entry) / result.entry * 100

    if result.hit:
        return (
            f"${symbol_clean} {pct:+.1f}% 💰\n"
            f"\n"
            f"Entry  {result.entry:,.0f}\n"
            f"Exit   {result.exit_price:,.0f}\n"
            f"P&L  +{result.pnl_usdt:,.0f} USDT\n"
            f"\n"
            f"Max risk was 200 USDT → {result.pnl_usdt:,.0f} USDT\n"
            f"OI 선취매 패턴 적중 📈\n"
            f"\n"
            f"#crypto #{symbol_clean} #trading"
        )
    else:
        return (
            f"${symbol_clean} 손절 ✂️\n"
            f"\n"
            f"Entry  {result.entry:,.0f}\n"
            f"Stop   {result.stop_price:,.0f}\n"
            f"Loss  -200 USDT (fixed)\n"
            f"\n"
            f"룰 지켰다. 다음 셋업 대기.\n"
            f"Small losses, Big wins 🎯\n"
            f"\n"
            f"#crypto #{symbol_clean} #trading"
        )
