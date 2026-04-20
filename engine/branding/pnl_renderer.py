"""P&L 카드 이미지 생성 — 딸깍 전략 브랜딩.

Pillow 기반 PNG 카드 생성.
디자인 에셋 의존 없이 텍스트만으로 구성.
Twitter 포스팅용 1200×675 (16:9) 기준.

출력 예시:
┌─────────────────────────────────────────┐
│  BTCUSDT  +24.3%  ✓ HIT               │
│                                         │
│  Entry   94,200  →  Target  117,100    │
│  Stop    93,990  (max -200 USDT)       │
│                                         │
│  P&L   +483 USDT                        │
│  Pattern: oi-presurge-long-v1          │
└─────────────────────────────────────────┘
"""
from __future__ import annotations

import io
from dataclasses import dataclass
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
    _PILLOW_OK = True
except ImportError:
    _PILLOW_OK = False


# ── 디자인 토큰 ────────────────────────────────────────────────────────────
_BG        = "#0d1117"   # 배경 (GitHub dark)
_GREEN     = "#00ff88"   # 수익 / 성공
_RED       = "#ff4d4d"   # 손실 / 손절
_BLUE      = "#4488ff"   # 패턴명 / 보조
_WHITE     = "#e6edf3"   # 기본 텍스트
_GREY      = "#8b949e"   # 보조 텍스트
_BORDER    = "#30363d"   # 테두리
_W, _H     = 1200, 675   # Twitter 권장 비율


def _get_font(size: int) -> "ImageFont.FreeTypeFont | ImageFont.ImageFont":
    candidates = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()


@dataclass
class TradeResult:
    symbol: str
    entry: float
    exit_price: float
    stop_price: float
    pnl_usdt: float
    pattern_slug: str
    hit: bool                    # True=익절, False=손절
    position_size_usdt: float = 0.0
    rr_ratio: float = 3.0


def render_pnl_card(result: TradeResult) -> bytes:
    """P&L 카드를 PNG bytes로 반환.

    Args:
        result: 거래 결과 데이터.

    Returns:
        PNG 이미지 bytes.

    Raises:
        ImportError: Pillow가 설치되지 않은 경우.
    """
    if not _PILLOW_OK:
        raise ImportError("Pillow required: uv add Pillow")

    img = Image.new("RGB", (_W, _H), color=_BG)
    draw = ImageDraw.Draw(img)

    # 테두리
    border_color = _GREEN if result.hit else _RED
    draw.rectangle([0, 0, _W - 1, _H - 1], outline=border_color, width=3)

    pct = (result.exit_price - result.entry) / result.entry * 100
    status_icon = "✓ HIT" if result.hit else "✗ STOP"
    pnl_color = _GREEN if result.pnl_usdt >= 0 else _RED

    # 헤더: 심볼 + 수익률 + 상태
    draw.text((50, 50),  result.symbol,              fill=_WHITE,     font=_get_font(52))
    draw.text((50, 115), f"{pct:+.1f}%",             fill=pnl_color,  font=_get_font(44))
    draw.text((320, 120), status_icon,               fill=pnl_color,  font=_get_font(36))

    # 구분선
    draw.line([(50, 180), (_W - 50, 180)], fill=_BORDER, width=1)

    # 가격 정보
    draw.text((50, 205),  "Entry",        fill=_GREY,  font=_get_font(24))
    draw.text((200, 205), f"{result.entry:,.2f}",  fill=_WHITE, font=_get_font(28))
    draw.text((50, 250),  "Exit",         fill=_GREY,  font=_get_font(24))
    draw.text((200, 250), f"{result.exit_price:,.2f}", fill=pnl_color, font=_get_font(28))
    draw.text((50, 295),  "Stop",         fill=_GREY,  font=_get_font(24))
    draw.text((200, 295), f"{result.stop_price:,.2f}  (max -200 USDT)", fill=_GREY, font=_get_font(22))

    # 구분선
    draw.line([(50, 350), (_W - 50, 350)], fill=_BORDER, width=1)

    # P&L 큰 글씨
    pnl_sign = "+" if result.pnl_usdt >= 0 else ""
    draw.text((50, 375), "P&L", fill=_GREY, font=_get_font(28))
    draw.text((160, 368), f"{pnl_sign}{result.pnl_usdt:,.0f} USDT",
              fill=pnl_color, font=_get_font(48))

    # R:R
    if result.hit and result.rr_ratio:
        draw.text((50, 445), f"R:R  1 : {result.rr_ratio:.1f}", fill=_BLUE, font=_get_font(24))

    # 포지션 사이즈
    if result.position_size_usdt > 0:
        draw.text((400, 445), f"Size  {result.position_size_usdt:,.0f} USDT",
                  fill=_GREY, font=_get_font(24))

    # 구분선
    draw.line([(50, 495), (_W - 50, 495)], fill=_BORDER, width=1)

    # 패턴명 + 워터마크
    draw.text((50, 515),  f"Pattern: {result.pattern_slug}", fill=_BLUE,  font=_get_font(22))
    draw.text((50, 555),  "Powered by WTD v2 · Small losses, Big wins",  fill=_GREY,  font=_get_font(18))

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def render_pnl_card_to_file(result: TradeResult, path: str) -> str:
    """P&L 카드를 파일로 저장하고 경로 반환."""
    data = render_pnl_card(result)
    with open(path, "wb") as f:
        f.write(data)
    return path
