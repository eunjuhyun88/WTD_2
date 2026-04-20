"""Social sentiment data fetchers — 딸깍 전략 소셜 레이어.

Twitter 없이 실제 데이터를 가져오는 3개 소스:

1. CoinGecko Trending  — 무료 API, 키 불필요
   https://api.coingecko.com/api/v3/search/trending
   상위 7개 트렌딩 코인 → per-symbol 트렌딩 여부 (daily)

2. Binance Square      — 바이낸스 내부 피드 API (공개 엔드포인트)
   https://www.binance.com/bapi/feed/v1/public/feed/post/query
   심볼 태그 포스트 수 → engagement spike 감지 (per-symbol)

3. Fear & Greed        — alternative.me (이미 fetch_macro.py에서 global로 존재)
   소셜 모멘텀 proxy: greed 상승 = 개미 유입 시작

이 모듈은 registry.py에 DataSource로 등록되어
loader.py → feature_calc.py → building_blocks 파이프라인에 자동 합류.
"""
from __future__ import annotations

import json
import logging
import time
import urllib.request
from datetime import datetime, timedelta, timezone

import pandas as pd

log = logging.getLogger("engine.data_cache.social")

_UA = "cogochi-autoresearch/social"
_TIMEOUT = 10


def _get_json(url: str, *, headers: dict | None = None) -> dict | list | None:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": _UA, "Accept": "application/json", **(headers or {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        log.debug("fetch failed [%s]: %s", url[:80], exc)
        return None


# ─────────────────────────────────────────────────────────────────────────────
# 1. CoinGecko Trending
# ─────────────────────────────────────────────────────────────────────────────

def fetch_coingecko_trending(symbol: str, days: int = 30) -> pd.DataFrame | None:
    """Per-symbol: 해당 코인이 CoinGecko 트렌딩 top 7에 있는지 (일별).

    CoinGecko trending은 실시간 snapshot이므로 오늘 날짜에만 True.
    과거 days는 False 패딩. feature_calc이 forward-fill로 처리.

    Args:
        symbol: Binance-style (e.g. "BTCUSDT", "SOLUSDT")
        days:   lookback window (default 30)

    Returns:
        DataFrame with column ["coingecko_trending"] indexed by UTC date.
        None on failure (caller uses default 0.0).
    """
    data = _get_json("https://api.coingecko.com/api/v3/search/trending")
    if not data or not isinstance(data, dict):
        return None

    # 심볼 정규화: BTCUSDT → BTC
    clean = symbol.upper().replace("USDT", "").replace("PERP", "")

    # trending coins 목록
    trending_coins = data.get("coins", [])
    trending_symbols = {
        c.get("item", {}).get("symbol", "").upper()
        for c in trending_coins
    }

    is_trending = clean in trending_symbols

    # 일별 인덱스 생성 (days 기간, 오늘만 True)
    today = datetime.now(tz=timezone.utc).date()
    dates = [today - timedelta(days=i) for i in range(days - 1, -1, -1)]
    idx = pd.DatetimeIndex([pd.Timestamp(d, tz="UTC") for d in dates])

    values = [False] * len(dates)
    values[-1] = is_trending  # 오늘만 현재 상태 반영

    return pd.DataFrame({"coingecko_trending": values}, index=idx)


# ─────────────────────────────────────────────────────────────────────────────
# 2. Binance Square Engagement
# ─────────────────────────────────────────────────────────────────────────────

# Binance Square 공개 피드 API
# 인증 불필요, 공개 엔드포인트
_BINANCE_SQUARE_URL = "https://www.binance.com/bapi/feed/v1/public/feed/topic/query"

_BOT_FILTER_MIN_FOLLOWERS = 100   # 팔로워 < 100 → 봇 제외
_SPIKE_THRESHOLD = 15             # 필터링 후 15개 이상 → spike


def fetch_binance_square_sentiment(symbol: str, days: int = 30) -> pd.DataFrame | None:
    """Per-symbol: 바이낸스 스퀘어 심볼 태그 포스트 engagement.

    봇 필터 적용 (팔로워 < 100 제외).
    오늘 날짜의 필터링 후 포스트 수를 반환. 과거는 0 패딩.

    Args:
        symbol: Binance-style (e.g. "BTCUSDT")
        days:   lookback window

    Returns:
        DataFrame with columns:
          ["square_post_count", "square_spike"]
        None on failure.
    """
    clean = symbol.upper().replace("USDT", "").replace("PERP", "")

    payload = json.dumps({
        "topicType": "COIN",
        "topicId": clean,
        "pageSize": 50,
        "pageIndex": 1,
    }).encode("utf-8")

    req = urllib.request.Request(
        _BINANCE_SQUARE_URL,
        data=payload,
        headers={
            "User-Agent": _UA,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        log.debug("Binance Square failed for %s: %s", symbol, exc)
        return _zero_square_df(days)

    posts = data.get("data", {})
    if isinstance(posts, dict):
        posts = posts.get("list", []) or posts.get("vos", []) or []

    # 봇 필터: 팔로워 < 100 제외
    filtered = [
        p for p in posts
        if _get_follower_count(p) >= _BOT_FILTER_MIN_FOLLOWERS
    ]

    count = len(filtered)
    spike = count >= _SPIKE_THRESHOLD

    today = datetime.now(tz=timezone.utc).date()
    dates = [today - timedelta(days=i) for i in range(days - 1, -1, -1)]
    idx = pd.DatetimeIndex([pd.Timestamp(d, tz="UTC") for d in dates])

    post_counts = [0] * len(dates)
    spikes = [False] * len(dates)
    post_counts[-1] = count
    spikes[-1] = spike

    return pd.DataFrame(
        {"square_post_count": post_counts, "square_spike": spikes},
        index=idx,
    )


def _get_follower_count(post: dict) -> int:
    """포스트 딕셔너리에서 팔로워 수 추출 (다양한 key 패턴 지원)."""
    user = (
        post.get("userInfo")
        or post.get("user")
        or post.get("author")
        or {}
    )
    return int(
        user.get("followerCount")
        or user.get("followers")
        or user.get("fans")
        or 0
    )


def _zero_square_df(days: int) -> pd.DataFrame:
    """API 실패 시 빈 DataFrame 반환 (graceful fallback)."""
    today = datetime.now(tz=timezone.utc).date()
    dates = [today - timedelta(days=i) for i in range(days - 1, -1, -1)]
    idx = pd.DatetimeIndex([pd.Timestamp(d, tz="UTC") for d in dates])
    return pd.DataFrame(
        {"square_post_count": [0] * days, "square_spike": [False] * days},
        index=idx,
    )


# ─────────────────────────────────────────────────────────────────────────────
# 3. CoinGecko 심볼별 소셜 볼륨 (선택적)
# ─────────────────────────────────────────────────────────────────────────────

# CoinGecko ID 맵 (주요 심볼만)
# 전체 목록: https://api.coingecko.com/api/v3/coins/list
_COINGECKO_ID_MAP: dict[str, str] = {
    "BTC":   "bitcoin",
    "ETH":   "ethereum",
    "SOL":   "solana",
    "BNB":   "binancecoin",
    "XRP":   "ripple",
    "DOGE":  "dogecoin",
    "ADA":   "cardano",
    "AVAX":  "avalanche-2",
    "DOT":   "polkadot",
    "LINK":  "chainlink",
    "UNI":   "uniswap",
    "MATIC": "matic-network",
    "POL":   "matic-network",
    "OP":    "optimism",
    "ARB":   "arbitrum",
    "SUI":   "sui",
    "APT":   "aptos",
    "INJ":   "injective-protocol",
    "SEI":   "sei-network",
    "TIA":   "celestia",
    "JTO":   "jito-governance-token",
    "PYTH":  "pyth-network",
    "WIF":   "dogwifcoin",
    "BONK":  "bonk",
    "PEPE":  "pepe",
    "SHIB":  "shiba-inu",
    "MEW":   "cat-in-a-dogs-world",
    "FLOKI": "floki",
    "POPCAT": "popcat",
}


def fetch_coingecko_social_volume(symbol: str, days: int = 30) -> pd.DataFrame | None:
    """Per-symbol: CoinGecko 소셜 볼륨 + 커뮤니티 데이터.

    community_score: CoinGecko가 계산한 커뮤니티 강도 (0-100)
    sentiment_votes_up_pct: 긍정 투표 비율

    Args:
        symbol: Binance-style (e.g. "BTCUSDT")
        days:   lookback window (데이터는 오늘 snapshot만, 과거는 패딩)

    Returns:
        DataFrame with columns:
          ["community_score", "sentiment_up_pct"]
        None on failure (graceful skip).
    """
    clean = symbol.upper().replace("USDT", "").replace("PERP", "")
    coin_id = _COINGECKO_ID_MAP.get(clean)
    if not coin_id:
        log.debug("No CoinGecko ID for %s — skipping social volume", clean)
        return None

    url = (
        f"https://api.coingecko.com/api/v3/coins/{coin_id}"
        f"?localization=false&tickers=false&market_data=false"
        f"&community_data=true&developer_data=false&sparkline=false"
    )
    data = _get_json(url)
    if not data or not isinstance(data, dict):
        return None

    community = data.get("community_data") or {}
    sentiment = data.get("sentiment_votes_up_percentage") or 50.0

    # community_score: twitter_followers + reddit_subscribers 합산 정규화
    twitter_f = community.get("twitter_followers") or 0
    reddit_s   = community.get("reddit_subscribers") or 0
    raw_score  = min(100.0, (twitter_f + reddit_s) / 10_000)

    today = datetime.now(tz=timezone.utc).date()
    dates = [today - timedelta(days=i) for i in range(days - 1, -1, -1)]
    idx = pd.DatetimeIndex([pd.Timestamp(d, tz="UTC") for d in dates])

    scores  = [0.0] * len(dates)
    sent_up = [50.0] * len(dates)
    scores[-1]  = raw_score
    sent_up[-1] = float(sentiment)

    return pd.DataFrame(
        {"community_score": scores, "sentiment_up_pct": sent_up},
        index=idx,
    )
