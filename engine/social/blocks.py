"""소셜 신호 Building Blocks — 딸깍 전략 Layer 1.

registry.py → loader.py → feature_calc.py 파이프라인을 통해
features DataFrame에 주입된 소셜 컬럼을 읽는다.

데이터 소스 (Twitter 없이 실제 데이터):
  coingecko_trending  : CoinGecko 트렌딩 top 7 여부
  square_spike        : 바이낸스 스퀘어 포스트 급증 (봇 필터 적용)
  community_score     : CoinGecko 커뮤니티 강도 (0-100)
  sentiment_up_pct    : CoinGecko 긍정 투표 비율
  fear_greed          : Alternative.me F&G (이미 기존 파이프라인에 존재)

패턴 사용 위치:
  OI_PRESURGE_LONG Phase 2 SOCIAL_IGNITION
    required_any_groups: [["kol_signal", "social_sentiment_spike"]]
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def social_sentiment_spike(ctx: Context) -> pd.Series:
    """소셜 언급 급증 신호.

    CoinGecko trending OR 바이낸스 스퀘어 spike → True.
    컬럼 없으면 False (Twitter 미연결 등 graceful fallback).
    """
    feat = ctx.features

    trending = feat.get(
        "coingecko_trending",
        pd.Series(0.0, index=feat.index),
    ).fillna(0.0).astype(bool)

    square = feat.get(
        "square_spike",
        pd.Series(0.0, index=feat.index),
    ).fillna(0.0).astype(bool)

    return (trending | square).astype(bool)


def kol_signal(ctx: Context) -> pd.Series:
    """KOL 관심 신호.

    CoinGecko 트렌딩(= KOL들이 이미 언급한 코인) +
    community_score 급등(= 커뮤니티 주목도 높음) 조합.

    Twitter kol_mention_detect의 대리 지표.
    Twitter 토큰 복구 후 이 블록을 강화하거나 교체.
    """
    feat = ctx.features

    # CoinGecko trending = 이미 KOL 회자되는 코인
    trending = feat.get(
        "coingecko_trending",
        pd.Series(0.0, index=feat.index),
    ).fillna(0.0).astype(bool)

    # community_score > 50 = 커뮤니티 강도 높음
    community = feat.get(
        "community_score",
        pd.Series(0.0, index=feat.index),
    ).fillna(0.0)
    high_community = (community > 50).astype(bool)

    return (trending | high_community).astype(bool)


def fear_greed_rising(ctx: Context) -> pd.Series:
    """Fear & Greed 상승 신호 (개미 유입 시작 proxy).

    fear_greed > 60 AND 전일 대비 상승 → 탐욕 국면 진입 = 개미 유입.
    Alternative.me F&G는 이미 기존 파이프라인에서 global로 주입됨.
    """
    feat = ctx.features

    fg = feat.get(
        "fear_greed",
        pd.Series(50.0, index=feat.index),
    ).fillna(50.0)

    is_greed = fg > 60
    is_rising = fg.diff().fillna(0.0) > 0

    return (is_greed & is_rising).astype(bool)


def social_composite(ctx: Context) -> pd.Series:
    """소셜 복합 신호 — 3개 소스 중 2개 이상 동시 발화.

    social_sentiment_spike + kol_signal + fear_greed_rising 중
    2개 이상 True → 강한 소셜 모멘텀.
    """
    s1 = social_sentiment_spike(ctx).astype(int)
    s2 = kol_signal(ctx).astype(int)
    s3 = fear_greed_rising(ctx).astype(int)

    return ((s1 + s2 + s3) >= 2).astype(bool)
