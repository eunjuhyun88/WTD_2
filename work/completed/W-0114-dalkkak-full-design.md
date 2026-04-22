# W-0114 — 딸깍 전략 전체 설계 문서

## 전략 원칙

> "AI가 분석+트레이딩+브랜딩을 동시에 수행하는 에이전트 모델.  
> 적게 여러 번 잃고, 크게 몇 번 먹는다. 24시간 지치지 않고 실행."

---

## 전략 구조 전체도

```
┌─────────────────────────────────────────────────────────────────────┐
│                      딸깍 전략 실행 루프 (매 5분)                    │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  LAYER 1: 유니버스 필터 (어떤 코인을 볼 것인가)               │  │
│  │  gainers_momentum_rank  ← Binance /ticker/24hr               │  │
│  │  listing_age_filter     ← 신규 상장 <6개월 가중치 1.5x        │  │
│  │  dynamic_universe       ← 기존 infrastructure 재활용          │  │
│  └───────────────────────┬──────────────────────────────────────┘  │
│                           │ top 10 심볼                             │
│  ┌────────────────────────▼─────────────────────────────────────┐  │
│  │  LAYER 2: 소셜 신호 (언제 개미가 몰리기 시작하는가)           │  │
│  │  social_sentiment_spike  ← GAME SDK Twitter 검색              │  │
│  │  kol_mention_detect      ← CZ/KOL 화이트리스트 모니터링       │  │
│  │  binance_square_signal   ← Binance Square 봇 필터 (예정)      │  │
│  └───────────────────────┬──────────────────────────────────────┘  │
│                           │ 소셜 신호 강도                          │
│  ┌────────────────────────▼─────────────────────────────────────┐  │
│  │  LAYER 3: 패턴 매칭 (OI_PRESURGE_LONG 상태머신)              │  │
│  │  Phase 1: QUIET_ACCUMULATION  ← oi_price_lag_detect          │  │
│  │  Phase 2: SOCIAL_IGNITION     ← kol_mention_detect (트리거)   │  │
│  │  Phase 3: BREAKOUT_CONFIRM    ← breakout_above_high + volume  │  │
│  │  Phase 4: TARGET              ← 3:1 R/R 달성                 │  │
│  └───────────────────────┬──────────────────────────────────────┘  │
│                           │ 진입 신호                               │
│  ┌────────────────────────▼─────────────────────────────────────┐  │
│  │  LAYER 4: 리스크 관리 (감정 없는 규칙 집행)                   │  │
│  │  FixedStopPolicy       ← 200 USDT 고정 손절                   │  │
│  │  단방향 원칙            ← 오픈 포지션 중복 진입 방지            │  │
│  │  포지션 사이징          ← 200 USDT / 단위당 리스크 역산        │  │
│  └───────────────────────┬──────────────────────────────────────┘  │
│                           │ 거래 결과                               │
│  ┌────────────────────────▼─────────────────────────────────────┐  │
│  │  LAYER 5: 브랜딩 자동화 (신뢰 자산화)                         │  │
│  │  pnl_renderer          ← P&L 카드 PNG 생성                    │  │
│  │  kol_style_engine      ← Claude API 스타일 증류 캡션          │  │
│  │  sns_poster            ← Twitter 자동 포스팅                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 구현 현황

| 항목 | 파일 | 상태 |
|---|---|---|
| OI 선취매 블록 | `building_blocks/confirmations/oi_price_lag_detect.py` | ✅ 완료 |
| OI_PRESURGE_LONG 패턴 | `patterns/library.py` | ✅ 완료 |
| 200 USDT 고정 손절 | `patterns/risk_policy.py` | ✅ 완료 |
| P&L 카드 생성 | `branding/pnl_renderer.py` | ✅ 완료 |
| SNS 포스터 | `branding/sns_poster.py` | ✅ 완료 |
| Twitter 클라이언트 | `social/twitter_client.py` | ✅ Stub (토큰 대기) |
| **Gainers 스크리너** | `universe/gainers.py` | ❌ 미구현 |
| **신규 상장 필터** | `universe/dynamic.py` 확장 | ❌ 미구현 |
| **소셜 블록 등록** | `scoring/block_evaluator.py` | ❌ 미구현 (토큰 후) |
| **단방향 원칙** | `patterns/position_guard.py` | ❌ 미구현 |
| **KOL 스타일 엔진** | `branding/kol_style_engine.py` | ❌ 미구현 |
| **Binance Square** | `social/binance_square_client.py` | ❌ 미구현 |
| **FastAPI 라우트** | `api/routes/dalkkak.py` | ❌ 미구현 |

---

## 미구현 상세 설계

---

### [미구현 1] Gainers 스크리너 + 신규 상장 필터

**파일:** `engine/universe/gainers.py` (신규)

**역할:** 전략의 진입 유니버스를 결정한다. 전체 300개 심볼 중 딸깍 전략이 볼 만한 top 10만 추린다.

**로직:**
```
1. Binance /fapi/v1/ticker/24hr 에서 전체 USDT 퍼프 24h 데이터 가져오기
2. 24h 상승률 상위 30개 선정 (gainers top 30)
3. 각 심볼의 최근 4h ATR% 계산 (변동성 큰 코인 우선)
4. 신규 상장 <180일 심볼: 점수 1.5x 가중치
5. 최종 composite score 기준 top 10 반환
```

**신규 상장 판단:** Binance `/fapi/v1/exchangeInfo`의 `onboardDate` 필드

```python
# engine/universe/gainers.py

from __future__ import annotations
import json, urllib.request, time
from dataclasses import dataclass

_FUTURES_BASE = "https://fapi.binance.com"

@dataclass
class GainerCandidate:
    symbol: str
    price_change_24h_pct: float  # 24h 상승률
    atr_pct_4h: float            # 4h ATR / 현재가 %
    listing_age_days: int        # 상장 후 경과일
    composite_score: float       # 최종 순위 점수

def load_gainer_candidates(
    top_n: int = 10,
    min_volume_usdt: float = 5_000_000.0,  # 최소 500만 USDT 거래량
    new_listing_days: int = 180,           # 신규 상장 기준
    new_listing_boost: float = 1.5,        # 신규 상장 가중치
) -> list[GainerCandidate]:
    """딸깍 전략용 진입 후보 유니버스 생성."""
    tickers = _fetch("/fapi/v1/ticker/24hr")
    exchange_info = _fetch("/fapi/v1/exchangeInfo")

    # 상장일 맵
    listing_map = {
        s["symbol"]: s.get("onboardDate", 0)
        for s in exchange_info.get("symbols", [])
        if s.get("status") == "TRADING" and s.get("contractType") == "PERPETUAL"
    }

    now_ms = int(time.time() * 1000)
    candidates = []

    for t in tickers:
        sym = t["symbol"]
        if not sym.endswith("USDT"):
            continue
        vol = float(t.get("quoteVolume", 0))
        if vol < min_volume_usdt:
            continue

        price_chg = float(t.get("priceChangePercent", 0))
        if price_chg <= 0:
            continue  # 상승 코인만

        # 상장 경과일
        onboard = listing_map.get(sym, now_ms)
        age_days = (now_ms - onboard) / (1000 * 86400)

        # ATR proxy: highPrice - lowPrice / closePrice (단순화)
        high = float(t.get("highPrice", 1))
        low  = float(t.get("lowPrice",  1))
        close = float(t.get("lastPrice", 1))
        atr_pct = (high - low) / close * 100 if close > 0 else 0

        # Composite score
        score = price_chg * (1 + atr_pct / 100)
        if age_days < new_listing_days:
            score *= new_listing_boost

        candidates.append(GainerCandidate(
            symbol=sym,
            price_change_24h_pct=price_chg,
            atr_pct_4h=atr_pct,
            listing_age_days=int(age_days),
            composite_score=score,
        ))

    candidates.sort(key=lambda c: c.composite_score, reverse=True)
    return candidates[:top_n]

def _fetch(path: str) -> dict | list:
    url = f"{_FUTURES_BASE}{path}"
    req = urllib.request.Request(url, headers={"User-Agent": "wtd-dalkkak/1.0"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())
```

**통합 지점:** `scanner.py`의 universe 로딩 직전에 `load_gainer_candidates()` 호출 → 반환된 symbol 목록을 scan 대상으로 사용

---

### [미구현 2] 소셜 블록 → block_evaluator 등록

**파일:** `engine/social/blocks.py` (신규) + `scoring/block_evaluator.py` 수정

**역할:** Twitter 기반 소셜 신호를 기존 블록 평가 시스템에 통합한다.

**설계 제약:** 블록은 `Context(klines, features, symbol) → pd.Series[bool]` 인터페이스.
소셜 신호는 외부 API 호출이므로 **features DataFrame에 미리 주입**하는 방식으로 처리.

```python
# engine/social/blocks.py

import pandas as pd
from building_blocks.context import Context

def social_sentiment_spike(ctx: Context) -> pd.Series:
    """
    features["social_spike"] 컬럼이 True인 바에서 발화.
    
    주입 방식:
      scan 루프에서 Twitter API 호출 결과를 features에 미리 추가.
      컬럼 없으면 전부 False (graceful fallback).
    """
    col = ctx.features.get(
        "social_spike",
        pd.Series(False, index=ctx.features.index)
    )
    return col.fillna(False).astype(bool)

def kol_mention_detect(ctx: Context) -> pd.Series:
    """
    features["kol_mention"] 컬럼이 True인 바에서 발화.
    CZ/인플루언서 언급 시 즉시 True.
    """
    col = ctx.features.get(
        "kol_mention",
        pd.Series(False, index=ctx.features.index)
    )
    return col.fillna(False).astype(bool)
```

**features 주입 위치:** `scanner.py`의 feature 계산 이후, 블록 평가 직전

```python
# scanner.py (기존 코드에 추가)
from social.twitter_client import get_twitter_client

client = get_twitter_client()

for symbol in symbols:
    # ... 기존 feature 계산 ...
    
    # 소셜 신호 주입 (Twitter 토큰 없으면 False로 채워짐)
    sentiment = client.search_symbol_sentiment(symbol)
    kol_hits  = client.get_kol_mentions(symbol)
    
    features_df["social_spike"] = sentiment.signal
    features_df["kol_mention"]  = len(kol_hits) > 0
```

**block_evaluator.py 추가:**
```python
from social.blocks import social_sentiment_spike, kol_mention_detect

# _BLOCKS 리스트에 추가
("social_sentiment_spike", social_sentiment_spike),
("kol_mention_detect",     kol_mention_detect),
```

**OI_PRESURGE_LONG SOCIAL_IGNITION 업데이트:**
```python
# 토큰 복구 후: proxy 제거하고 실제 소셜 블록으로 교체
PhaseCondition(
    phase_id="SOCIAL_IGNITION",
    required_blocks=[],
    required_any_groups=[
        ["kol_mention_detect", "social_sentiment_spike"],  # 실제 소셜 신호
        ["oi_price_lag_detect_strong", "relative_velocity_bull"],  # fallback
    ],
    ...
)
```

---

### [미구현 3] 단방향 원칙 강제

**파일:** `engine/patterns/position_guard.py` (신규)

**역할:** 같은 심볼에 이미 오픈 포지션이 있으면 추가 진입 신호를 억제한다.

```python
# engine/patterns/position_guard.py

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime

@dataclass
class OpenPosition:
    symbol: str
    pattern_slug: str
    entry_price: float
    stop_price: float
    target_price: float
    opened_at: datetime
    direction: str = "long"

class PositionGuard:
    """단방향 원칙: 심볼당 포지션 1개 제한.
    
    딸깍 원칙:
      "헷징이나 반대 포지션 없이 명확한 추세에만 베팅."
      → 같은 심볼에 두 번 진입 금지
      → 반대 방향 포지션 금지
    """
    
    def __init__(self):
        self._positions: dict[str, OpenPosition] = {}  # symbol → position
    
    def can_enter(self, symbol: str, direction: str = "long") -> bool:
        """진입 가능 여부 판단."""
        if symbol not in self._positions:
            return True
        existing = self._positions[symbol]
        # 같은 방향도 중복 진입 금지
        return False
    
    def register(self, position: OpenPosition) -> None:
        """포지션 등록."""
        self._positions[position.symbol] = position
    
    def close(self, symbol: str) -> None:
        """포지션 종료."""
        self._positions.pop(symbol, None)
    
    def open_symbols(self) -> list[str]:
        return list(self._positions.keys())
    
    def summary(self) -> dict:
        return {
            "open_count": len(self._positions),
            "symbols": self.open_symbols(),
        }

# 전략 싱글턴
POSITION_GUARD = PositionGuard()
```

**통합 지점:** 패턴 BREAKOUT_CONFIRM 발화 시 `POSITION_GUARD.can_enter(symbol)` 체크

---

### [미구현 4] KOL 스타일 엔진

**파일:** `engine/branding/kol_style_engine.py` (신규)

**역할:** 유명 KOL의 포스팅 스타일을 Claude API로 학습하여 상황별 캡션을 자동 생성한다.

**2단계 구조:**

**Stage 1 — 스타일 수집 (1회성):**
```python
# 타겟 KOL 계정의 최근 500 포스트 수집
# → 패턴 분석: 이모지 밀도, 문장 길이, 해시태그 수, 톤(공격적/차분)
# → style_profile.json 저장
```

**Stage 2 — 실시간 캡션 생성:**
```python
# engine/branding/kol_style_engine.py

import os, json
import anthropic

STYLE_PROMPT_TEMPLATE = """
당신은 크립토 트레이더 KOL입니다.
아래 스타일 프로필을 따라 거래 결과 포스트를 작성하세요.

스타일 프로필:
{style_profile}

거래 정보:
- 심볼: {symbol}
- 방향: {direction}
- 진입가: {entry}
- 결과: {result}  (HIT / STOP)
- P&L: {pnl_usdt} USDT
- 패턴: {pattern}

규칙:
1. 280자 이내 (Twitter 제한)
2. 수익은 자신감 있게, 손절도 당당하게 (룰 지켰다는 서사)
3. 해시태그 최대 3개
4. 가격/수익은 구체적 숫자 표기
"""

class KolStyleEngine:
    def __init__(self, style_profile_path: str = "branding/style_profiles/default.json"):
        self._client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
        self._style = self._load_style(style_profile_path)
    
    def generate_caption(
        self,
        symbol: str,
        entry: float,
        exit_price: float,
        pnl_usdt: float,
        pattern_slug: str,
        hit: bool,
    ) -> str:
        """Claude API로 KOL 스타일 캡션 생성."""
        prompt = STYLE_PROMPT_TEMPLATE.format(
            style_profile=json.dumps(self._style, ensure_ascii=False),
            symbol=symbol.replace("USDT", ""),
            direction="LONG",
            entry=f"{entry:,.0f}",
            result="HIT" if hit else "STOP",
            pnl_usdt=f"{pnl_usdt:+,.0f}",
            pattern=pattern_slug,
        )
        
        msg = self._client.messages.create(
            model="claude-haiku-4-5-20251001",  # 비용 최소화
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}]
        )
        return msg.content[0].text.strip()
    
    def distill_style_from_kol(self, kol_posts: list[str]) -> dict:
        """KOL 포스트 목록에서 스타일 프로필 추출 (1회성 실행)."""
        corpus = "\n---\n".join(kol_posts[:100])
        
        prompt = f"""
다음 크립토 트레이더의 포스트들을 분석하여 스타일 프로필을 JSON으로 추출하세요.

포스트:
{corpus}

추출 항목:
- tone: 공격적/자신감/차분/교육적
- emoji_density: 없음/낮음/높음
- avg_length: 짧음(<100자)/중간/긺
- hashtag_style: 없음/심볼만/다수
- win_expression: 수익 표현 방식 (예시 문장)
- loss_expression: 손절 표현 방식 (예시 문장)
- signature_phrases: 자주 쓰는 표현 목록
"""
        msg = self._client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt}]
        )
        return json.loads(msg.content[0].text)
    
    def _load_style(self, path: str) -> dict:
        try:
            with open(path) as f:
                return json.load(f)
        except FileNotFoundError:
            # 기본 스타일 프로필
            return {
                "tone": "자신감",
                "emoji_density": "중간",
                "win_expression": "패턴 적중 🎯",
                "loss_expression": "룰 지켰다 ✂️",
                "signature_phrases": ["Small losses Big wins", "OI 선취매"],
            }
```

---

### [미구현 5] Binance Square 클라이언트

**파일:** `engine/social/binance_square_client.py` (신규)

**역할:** 바이낸스 스퀘어 고트래픽 포스트에서 봇 제거 후 실제 사람 반응만 수집.

**현실적 제약:**
- Binance Square 공식 API 없음
- 비공개 엔드포인트 역공학 필요 또는 RSS/웹 크롤링
- Twitter 대비 구현 복잡도 높음

**구현 방향 (단계적):**

```
Phase A (지금): Twitter로 대체 (구현 완료)
Phase B (추후): Binance Square 비공개 API 분석
  → https://www.binance.com/bapi/feed/v1/public/feed/post/query
  → 심볼 태그 기반 포스트 조회
Phase C: 봇 필터링 (계정 나이, 좋아요/댓글 비율, 팔로워 분포)
```

**임시 설계 (Phase B 기준):**
```python
# engine/social/binance_square_client.py

import httpx

class BinanceSquareClient:
    BASE = "https://www.binance.com/bapi/feed/v1/public/feed"
    
    async def search_symbol_posts(self, symbol: str, limit: int = 50) -> list[dict]:
        """바이낸스 스퀘어 심볼 태그 포스트 검색."""
        clean = symbol.replace("USDT", "")
        async with httpx.AsyncClient() as c:
            r = await c.post(
                f"{self.BASE}/post/query",
                json={"tag": clean, "pageSize": limit},
                headers={"Content-Type": "application/json"},
                timeout=10,
            )
            data = r.json()
        posts = data.get("data", {}).get("list", [])
        return self._filter_bots(posts)
    
    def _filter_bots(self, posts: list[dict]) -> list[dict]:
        """
        봇 필터 기준:
        1. 팔로워 < 100 AND 게시물 수 > 100/일 → 봇
        2. 좋아요 0 + 댓글 0 → 노이즈
        3. 계정 생성 < 7일 → 의심
        """
        return [
            p for p in posts
            if p.get("userInfo", {}).get("followerCount", 0) >= 100
            and (p.get("likeCount", 0) + p.get("commentCount", 0)) > 0
        ]
```

---

### [미구현 6] FastAPI 통합 라우트

**파일:** `engine/api/routes/dalkkak.py` (신규)

**역할:** 딸깍 전략 전체 파이프라인을 단일 API로 노출.

```python
# engine/api/routes/dalkkak.py

from fastapi import APIRouter
from universe.gainers import load_gainer_candidates
from patterns.risk_policy import DEFAULT_POLICY
from social.twitter_client import get_twitter_client
from branding.pnl_renderer import TradeResult, render_pnl_card
from branding.sns_poster import post_trade_result

router = APIRouter(prefix="/dalkkak", tags=["dalkkak"])


@router.get("/universe")
async def get_dalkkak_universe():
    """딸깍 전략 진입 후보 유니버스 반환."""
    candidates = load_gainer_candidates(top_n=10)
    return {
        "ok": True,
        "candidates": [
            {
                "symbol":              c.symbol,
                "price_change_24h":    c.price_change_24h_pct,
                "atr_pct":             c.atr_pct_4h,
                "listing_age_days":    c.listing_age_days,
                "composite_score":     c.composite_score,
                "is_new_listing":      c.listing_age_days < 180,
            }
            for c in candidates
        ]
    }


@router.get("/social/{symbol}")
async def get_social_signal(symbol: str):
    """심볼 소셜 신호 조회."""
    client = get_twitter_client()
    sentiment = client.search_symbol_sentiment(symbol)
    kol_hits  = client.get_kol_mentions(symbol)
    return {
        "ok":            True,
        "symbol":        symbol,
        "twitter_available": client.available,
        "sentiment":     {
            "signal":          sentiment.signal,
            "tweet_count":     sentiment.tweet_count,
            "filtered_count":  sentiment.filtered_count,
        },
        "kol_hits": [
            {
                "kol":      h.kol_name,
                "strength": h.mention_strength,
                "text":     h.text[:100],
            }
            for h in kol_hits
        ],
    }


@router.post("/risk/calc")
async def calc_risk(entry: float, atr: float):
    """200 USDT 고정 손절 기반 포지션 플랜 계산."""
    return {"ok": True, "plan": DEFAULT_POLICY.summary(entry=entry, atr=atr)}


@router.post("/branding/post")
async def post_result(
    symbol: str,
    entry: float,
    exit_price: float,
    stop_price: float,
    pnl_usdt: float,
    pattern_slug: str,
    hit: bool,
):
    """거래 결과 → P&L 카드 → Twitter 포스팅."""
    result = TradeResult(
        symbol=symbol,
        entry=entry,
        exit_price=exit_price,
        stop_price=stop_price,
        pnl_usdt=pnl_usdt,
        pattern_slug=pattern_slug,
        hit=hit,
    )
    outcome = post_trade_result(result)
    return {"ok": True, **outcome}
```

---

## 전체 구현 로드맵

```
현재 (완료)
  ✅ oi_price_lag_detect
  ✅ OI_PRESURGE_LONG 패턴 (14번째)
  ✅ FixedStopPolicy
  ✅ pnl_renderer.py
  ✅ sns_poster.py
  ✅ twitter_client.py (stub)
  1128 tests pass

Sprint 1 (Twitter 토큰 대기 중 병렬 진행)
  □ gainers_momentum_rank (universe/gainers.py)
  □ position_guard.py (단방향 원칙)
  □ api/routes/dalkkak.py (통합 라우트)
  □ 테스트 작성

Sprint 2 (Twitter 토큰 복구 후)
  □ social/blocks.py → block_evaluator.py 등록
  □ OI_PRESURGE_LONG SOCIAL_IGNITION → 실제 소셜 블록으로 교체
  □ 소셜 신호 features 주입 (scanner.py)

Sprint 3 (브랜딩 완성)
  □ kol_style_engine.py (Claude API 캡션)
  □ style_profiles/ 디렉토리 + 기본 프로필
  □ sns_poster.py → kol_style_engine 연결

Sprint 4 (Binance Square)
  □ binance_square_client.py (비공개 API 분석 선행)
  □ 봇 필터링 로직
  □ social_sentiment_spike 멀티소스 통합
```

---

## 실행 시나리오 (완성 후)

```
오전 9시, 스캐너 실행

1. gainers_momentum_rank() 
   → ["PONKEUSDT", "MEWUSDT", "TURBOUSDT", ...]  상위 10개

2. 각 심볼 OI 데이터 확인
   → MEWUSDT: OI 1h +18%, 가격 +0.8% → oi_price_lag_detect ✅
   → OI_PRESURGE_LONG Phase 1 진입

3. 30분 후, Twitter 확인
   → "cz_binance"가 MEWUSDT 언급
   → kol_mention_detect ✅ → Phase 2 SOCIAL_IGNITION 진입

4. 15분 후
   → 가격이 Phase 1 고점 돌파 + 거래량 2배
   → breakout_above_high + volume_spike ✅ → Phase 3 BREAKOUT_CONFIRM

5. 진입 신호 발화
   → POSITION_GUARD.can_enter("MEWUSDT") → True
   → FixedStopPolicy.summary(entry=0.0082, atr=0.0003)
     → stop: 0.0077, target: 0.0097, size: 400,000 MEW

6. 3시간 후, target 도달
   → pnl: +600 USDT
   → pnl_renderer → PNG 카드 생성
   → kol_style_engine → "MEWUSDT 3배 먹었다 🎯 OI 선취매..."
   → sns_poster → Twitter 자동 포스팅
   → POSITION_GUARD.close("MEWUSDT")
```

---

## 파일 목록 전체

```
engine/
├── building_blocks/confirmations/
│   └── oi_price_lag_detect.py          ✅ 완료
├── patterns/
│   ├── library.py                       ✅ OI_PRESURGE_LONG 등록
│   ├── risk_policy.py                   ✅ 완료
│   └── position_guard.py                ❌ Sprint 1
├── universe/
│   └── gainers.py                       ❌ Sprint 1
├── social/
│   ├── __init__.py                      ✅ 완료
│   ├── twitter_client.py                ✅ Stub
│   ├── blocks.py                        ❌ Sprint 2
│   └── binance_square_client.py         ❌ Sprint 4
├── branding/
│   ├── __init__.py                      ✅ 완료
│   ├── pnl_renderer.py                  ✅ 완료
│   ├── sns_poster.py                    ✅ 완료
│   ├── kol_style_engine.py              ❌ Sprint 3
│   └── style_profiles/
│       └── default.json                 ❌ Sprint 3
└── api/routes/
    └── dalkkak.py                       ❌ Sprint 1
```
