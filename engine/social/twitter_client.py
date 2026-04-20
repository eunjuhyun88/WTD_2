"""GAME SDK Twitter 클라이언트 래퍼 — 딸깍 전략 소셜 레이어.

GAME_TWITTER_ACCESS_TOKEN 없거나 SDK 미설치 시 graceful fallback.
토큰 복구 후 .env에 추가하면 즉시 활성화.

Rate limit: 35 calls / 5분 (GAME API key 기준, X API Basic 불필요)
Auth: cd ~/Projects/wtd-v2/engine && uv run twitter-plugin-gamesdk auth -k <GAME_API_KEY>
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Optional

log = logging.getLogger("engine.social.twitter")


# ── KOL 화이트리스트 ────────────────────────────────────────────────────────
# 고래/인플루언서 계정 ID (Twitter user_id 기준)
# 추후 DB/설정 파일로 분리 예정
KOL_WHITELIST: dict[str, str] = {
    "cz_binance":         "902926941413453824",
    "binance":            "877807935493033984",
    "coinbase":           "574032254",
    "kucoin":             "915445726844657664",
    # 추가 KOL 계정은 여기에
}


@dataclass
class MentionHit:
    """KOL 언급 감지 결과."""
    kol_name: str
    kol_id: str
    tweet_id: str
    text: str
    created_at: str
    mention_strength: str  # "retweet" | "tag" | "post"
    public_metrics: dict = field(default_factory=dict)


@dataclass
class SentimentResult:
    """소셜 감성 분석 결과."""
    symbol: str
    tweet_count: int
    filtered_count: int   # 봇 제거 후
    signal: bool          # True = 언급 급증
    top_tweets: list[dict] = field(default_factory=list)
    kol_hits: list[MentionHit] = field(default_factory=list)


class WTDTwitterClient:
    """GAME SDK Twitter 래퍼.

    토큰 없으면 빈 결과 반환 (패턴은 social 블록 없이도 진행 가능).
    """

    def __init__(self) -> None:
        self._plugin = None
        self._available = False
        self._init_plugin()

    def _init_plugin(self) -> None:
        token = os.environ.get("GAME_TWITTER_ACCESS_TOKEN", "")
        if not token:
            log.info("GAME_TWITTER_ACCESS_TOKEN not set — Twitter layer disabled (graceful fallback)")
            return

        try:
            from twitter_plugin_gamesdk.twitter_plugin import TwitterPlugin
            self._plugin = TwitterPlugin({"game_twitter_access_token": token})
            self._available = True
            log.info("Twitter client initialized (GAME SDK)")
        except ImportError:
            log.warning("twitter_plugin_gamesdk not installed — Twitter layer disabled")
        except Exception as e:
            log.warning("Twitter client init failed: %s — graceful fallback", e)

    @property
    def available(self) -> bool:
        return self._available

    # ── 공개 API ──────────────────────────────────────────────────────────

    def search_symbol_sentiment(self, symbol: str, hours: int = 1) -> SentimentResult:
        """심볼 언급량 + 봇 필터링.

        Args:
            symbol: 예) "BTC", "BTCUSDT"
            hours:  최근 N시간 트윗 검색

        Returns:
            SentimentResult (token 없으면 빈 결과)
        """
        if not self._available:
            return SentimentResult(symbol=symbol, tweet_count=0, filtered_count=0, signal=False)

        clean = symbol.replace("USDT", "").replace("PERP", "")
        query = f"${clean} OR #{clean}USDT -is:retweet lang:en"

        try:
            result = self._plugin.search_recent_tweets(
                query=query,
                max_results=100,
                tweet_fields=["public_metrics", "author_id", "created_at"],
                user_fields=["public_metrics"],
                expansions=["author_id"],
            )
            raw = result.get("data") or []
            filtered = self._filter_bots(raw, result.get("includes", {}))

            # 간단한 spike 판정: 필터링 후 20건 이상 = 신호
            # TODO: rolling Z-score로 고도화 (Redis baseline 필요)
            signal = len(filtered) >= 20

            return SentimentResult(
                symbol=symbol,
                tweet_count=len(raw),
                filtered_count=len(filtered),
                signal=signal,
                top_tweets=filtered[:5],
            )
        except Exception as e:
            log.debug("search_symbol_sentiment failed for %s: %s", symbol, e)
            return SentimentResult(symbol=symbol, tweet_count=0, filtered_count=0, signal=False)

    def get_kol_mentions(self, symbol: str) -> list[MentionHit]:
        """KOL 화이트리스트 계정의 심볼 언급 감지.

        Args:
            symbol: 예) "BTC", "BTCUSDT"

        Returns:
            MentionHit 목록 (token 없으면 빈 리스트)
        """
        if not self._available:
            return []

        clean = symbol.replace("USDT", "").replace("PERP", "")
        hits: list[MentionHit] = []

        for name, user_id in KOL_WHITELIST.items():
            try:
                result = self._plugin.get_users_mentions(
                    id=user_id,
                    max_results=10,
                    tweet_fields=["created_at", "public_metrics"],
                )
                for tweet in (result.get("data") or []):
                    if clean.upper() in tweet.get("text", "").upper():
                        hits.append(MentionHit(
                            kol_name=name,
                            kol_id=user_id,
                            tweet_id=tweet["id"],
                            text=tweet["text"],
                            created_at=tweet.get("created_at", ""),
                            mention_strength=_classify_mention(tweet),
                            public_metrics=tweet.get("public_metrics", {}),
                        ))
            except Exception as e:
                log.debug("get_kol_mentions failed for %s/%s: %s", name, symbol, e)

        return hits

    def post_pnl_card(self, text: str, image_path: str) -> Optional[dict]:
        """P&L 카드 이미지 + 텍스트 트윗 포스팅.

        Args:
            text:       트윗 텍스트
            image_path: PNG 파일 경로

        Returns:
            트윗 결과 dict 또는 None
        """
        if not self._available:
            log.info("post_pnl_card skipped — Twitter not available")
            return None

        try:
            media = self._plugin.upload_media(image_path)
            return self._plugin.create_tweet(
                text=text,
                media_ids=[media["media_id"]],
            )
        except Exception as e:
            log.error("post_pnl_card failed: %s", e)
            return None

    # ── 내부 헬퍼 ─────────────────────────────────────────────────────────

    def _filter_bots(self, tweets: list[dict], includes: dict) -> list[dict]:
        """팔로워 수 기준 봇 필터링.

        팔로워 < 500 → 봇으로 간주하고 제외.
        """
        users = {u["id"]: u for u in includes.get("users", [])}
        result = []
        for tweet in tweets:
            author = users.get(tweet.get("author_id"), {})
            metrics = author.get("public_metrics", {})
            if metrics.get("followers_count", 0) >= 500:
                result.append(tweet)
        return result


def _classify_mention(tweet: dict) -> str:
    text = tweet.get("text", "")
    if "RT @" in text:
        return "retweet"
    if text.startswith("@"):
        return "tag"
    return "post"


# 전략 기본 인스턴스 (싱글턴 패턴)
_client: Optional[WTDTwitterClient] = None


def get_twitter_client() -> WTDTwitterClient:
    global _client
    if _client is None:
        _client = WTDTwitterClient()
    return _client
