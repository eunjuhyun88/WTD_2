"""Gainers 스크리너 — 딸깍 전략 진입 유니버스 필터.

딸깍 원칙:
  "상승률 상위(Gainers) 중 변동성이 가장 큰 코인을 우선순위로 공략"
  "최근 6개월 내 신규 상장주나 변동성 이력이 큰 코인 풀에 집중"

데이터 소스:
  Binance Futures 공개 API (인증 불필요):
    /fapi/v1/ticker/24hr   — 24h 가격 변화 + 거래량
    /fapi/v1/exchangeInfo  — 상장일 (onboardDate)
"""
from __future__ import annotations

import json
import logging
import time
import urllib.request
from dataclasses import dataclass

log = logging.getLogger("engine.universe.gainers")

_FUTURES_BASE = "https://fapi.binance.com"
_UA = "wtd-dalkkak-gainers/1.0"
_TIMEOUT = 15


def _fetch(path: str) -> dict | list:
    url = f"{_FUTURES_BASE}{path}"
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as r:
        return json.loads(r.read().decode("utf-8"))


@dataclass
class GainerCandidate:
    """딸깍 전략 진입 후보 심볼."""
    symbol: str
    price_change_24h_pct: float   # 24h 상승률 (%)
    atr_pct: float                 # 고저 범위 / 현재가 (변동성 proxy)
    volume_usdt_24h: float         # 24h 거래량 (USDT)
    listing_age_days: int          # 상장 후 경과일
    is_new_listing: bool           # True = 신규 상장 <180일
    composite_score: float         # 최종 순위 점수


def load_gainer_candidates(
    top_n: int = 10,
    min_volume_usdt: float = 5_000_000.0,   # 최소 500만 USDT 24h 거래량
    min_price_change_pct: float = 3.0,       # 최소 3% 상승
    new_listing_days: int = 180,             # 신규 상장 기준 (6개월)
    new_listing_boost: float = 1.5,          # 신규 상장 가중치
) -> list[GainerCandidate]:
    """딸깍 전략 진입 후보 유니버스 생성.

    Binance Futures API에서 실시간 데이터를 가져와
    composite score 기준으로 top_n 심볼을 반환.

    composite_score = price_change_24h * (1 + atr_pct/100)
                      * new_listing_boost (신규 상장 시)

    Args:
        top_n:                최종 반환 심볼 수 (default 10)
        min_volume_usdt:      최소 24h 거래량 필터 (default 500만 USDT)
        min_price_change_pct: 최소 상승률 필터 (default 3%)
        new_listing_days:     신규 상장 기준 경과일 (default 180)
        new_listing_boost:    신규 상장 점수 배율 (default 1.5x)

    Returns:
        GainerCandidate 목록 (composite_score 내림차순)

    Raises:
        RuntimeError: Binance API 접근 실패 시
    """
    try:
        tickers = _fetch("/fapi/v1/ticker/24hr")
        exchange_info = _fetch("/fapi/v1/exchangeInfo")
    except Exception as exc:
        raise RuntimeError(f"Binance API fetch failed: {exc}") from exc

    # 상장일 맵 구성 (symbol → onboardDate ms)
    now_ms = int(time.time() * 1000)
    listing_map: dict[str, int] = {}
    for s in exchange_info.get("symbols", []):
        if (
            s.get("status") == "TRADING"
            and s.get("contractType") == "PERPETUAL"
            and s.get("quoteAsset") == "USDT"
        ):
            listing_map[s["symbol"]] = int(s.get("onboardDate") or now_ms)

    candidates: list[GainerCandidate] = []

    for t in tickers:
        sym = t.get("symbol", "")
        if not sym.endswith("USDT"):
            continue
        if sym not in listing_map:
            continue

        # 거래량 필터
        try:
            vol = float(t.get("quoteVolume") or 0)
        except (ValueError, TypeError):
            continue
        if vol < min_volume_usdt:
            continue

        # 상승률 필터
        try:
            price_chg = float(t.get("priceChangePercent") or 0)
        except (ValueError, TypeError):
            continue
        if price_chg < min_price_change_pct:
            continue

        # 변동성 proxy: (고가 - 저가) / 현재가
        try:
            high  = float(t.get("highPrice") or 1)
            low   = float(t.get("lowPrice") or 1)
            close = float(t.get("lastPrice") or 1)
            atr_pct = (high - low) / close * 100 if close > 0 else 0.0
        except (ValueError, TypeError):
            atr_pct = 0.0

        # 상장 경과일
        age_ms = now_ms - listing_map[sym]
        age_days = max(0, int(age_ms / (1000 * 86400)))
        is_new = age_days < new_listing_days

        # Composite score
        score = price_chg * (1 + atr_pct / 100)
        if is_new:
            score *= new_listing_boost

        candidates.append(GainerCandidate(
            symbol=sym,
            price_change_24h_pct=round(price_chg, 2),
            atr_pct=round(atr_pct, 2),
            volume_usdt_24h=round(vol, 0),
            listing_age_days=age_days,
            is_new_listing=is_new,
            composite_score=round(score, 4),
        ))

    candidates.sort(key=lambda c: c.composite_score, reverse=True)
    result = candidates[:top_n]

    log.info(
        "Gainers screener: %d candidates → top %d | new_listings=%d",
        len(candidates),
        len(result),
        sum(1 for c in result if c.is_new_listing),
    )
    return result
