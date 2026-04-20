# W-0114 — 딸깍 전략: Social Signal + OI Presurge + Risk Policy + Branding

## Goal

딸깍 전략 4개 레이어를 WTD v2 engine에 통합한다.

- Layer 1: GAME SDK Twitter로 KOL 멘션 + 심볼 감성 신호 수집
- Layer 2: OI 선취매 패턴 (`OI_PRESURGE_LONG`) 신규 추가
- Layer 3: 200 USDT 고정 손절 risk policy plane 추가
- Layer 4: P&L 카드 자동 생성 + Twitter 자동 포스팅 (branding)

## Scope

- `engine/social/` — 신규 모듈 (Twitter 클라이언트 + 블록 2개)
- `engine/patterns/library.py` — `OI_PRESURGE_LONG` 패턴 등록
- `engine/patterns/risk_policy.py` — 신규 파일
- `engine/branding/` — 신규 모듈 (P&L renderer + SNS poster)
- `engine/scoring/block_evaluator.py` — 신규 블록 3개 등록
- `engine/api/routes/social.py` — 신규 라우트

## Non-Goals

- 자동 주문 집행 (포지션 사이징 계산만, 실제 주문 X)
- Binance Square 크롤링 (Twitter만, 추후 확장)
- ML 모델 학습 (rule-first 블록만, Phase 2에서 ML화)

## Canonical Files

```
engine/social/__init__.py
engine/social/twitter_client.py        # GAME SDK 래퍼
engine/social/blocks.py                # social_sentiment_spike, kol_mention_detect
engine/patterns/risk_policy.py         # FixedStopPolicy
engine/branding/__init__.py
engine/branding/pnl_renderer.py        # Pillow P&L 카드 생성
engine/branding/sns_poster.py          # Twitter 자동 포스팅
engine/api/routes/social.py            # /social/sentiment, /social/kol_mentions
```

## Facts

1. GAME SDK Twitter 패키지: `pip install twitter_plugin_gamesdk` (virtuals_tweepy 포크)
2. Rate limit: 35 calls/5분 (GAME API key 기준, X API Basic 불필요)
3. API key 발급 완료: `apt-95928da8b0d22f90f583f2cd50f94b81` (env: `GAME_API_KEY`)
4. 인증: `twitter-plugin-gamesdk auth -k $GAME_API_KEY` → `GAME_TWITTER_ACCESS_TOKEN` 발급
5. 기존 `total_oi_spike` 블록 재활용 → `oi_price_lag_detect`로 확장

## Assumptions

1. Twitter 검색은 최근 7일 이내 트윗만 (v2 free 제한)
2. KOL 화이트리스트는 초기 하드코딩, 추후 DB화
3. P&L 카드는 Pillow로 PNG 생성, 별도 디자인 에셋 없이 텍스트 기반

## Open Questions

1. GAME_TWITTER_ACCESS_TOKEN auth 커맨드 후 토큰이 어디에 저장되는가? → `.env` 직접 확인 필요
2. `search_recent_tweets` 봇 필터링 기준: 팔로워 < 500 OR 계정 나이 < 30일 중 어느 쪽이 더 노이즈 제거에 효과적?

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    딸깍 전략 신호 흐름                        │
│                                                             │
│  [engine/social/]                                           │
│  twitter_client.py                                          │
│    search_recent_tweets(query, symbol)                      │
│    get_kol_mentions(kol_whitelist, symbol)                  │
│    post_tweet_with_media(text, image_path)   ←── branding   │
│           │                                                 │
│           ▼                                                 │
│  blocks.py                                                  │
│    social_sentiment_spike  → Z-score > 2σ (1h rolling)     │
│    kol_mention_detect      → 화이트리스트 계정이 언급 시      │
│           │                                                 │
│           ▼                                                 │
│  [engine/patterns/]                                         │
│  OI_PRESURGE_LONG 패턴                                      │
│    Phase 1: QUIET_ACCUMULATION                              │
│      required: oi_price_lag_detect                          │
│      optional: social_sentiment_spike (weak)                │
│    Phase 2: SOCIAL_IGNITION                                 │
│      required: kol_mention_detect OR social_sentiment_spike  │
│      gate: price still within 3% of Phase 1 zone           │
│    Phase 3: BREAKOUT_CONFIRM                                │
│      required: price > phase1_high, volume > 2x avg        │
│    Phase 4: TARGET / STOP                                   │
│      target: range_height × 3                              │
│      stop: risk_policy.get_stop_price() [max 200 USDT]      │
│           │                                                 │
│           ▼                                                 │
│  [engine/branding/]                                         │
│  pnl_renderer.py  → PNG 카드 생성                            │
│  sns_poster.py    → Twitter 자동 포스팅                      │
└─────────────────────────────────────────────────────────────┘
```

## Slices

### Slice A — 환경 세팅 + Twitter 클라이언트 (0.5일)

```bash
# 1. 패키지 설치
cd engine && pip install twitter_plugin_gamesdk

# 2. 인증
twitter-plugin-gamesdk auth -k apt-95928da8b0d22f90f583f2cd50f94b81
# → GAME_TWITTER_ACCESS_TOKEN 생성됨 → .env에 저장

# 3. .env 추가 항목
GAME_API_KEY=apt-95928da8b0d22f90f583f2cd50f94b81
GAME_TWITTER_ACCESS_TOKEN=<auth 후 생성된 토큰>
```

```python
# engine/social/twitter_client.py
import os
from twitter_plugin_gamesdk.twitter_plugin import TwitterPlugin

class WTDTwitterClient:
    """GAME SDK Twitter 래퍼 — 딸깍 전략 소셜 레이어"""

    KOL_WHITELIST = {
        "cz_binance":   "902926941413453824",
        "binance":      "877807935493033984",
        # 추가 KOL 계정 ID
    }

    def __init__(self):
        self.plugin = TwitterPlugin({
            "game_twitter_access_token": os.environ["GAME_TWITTER_ACCESS_TOKEN"]
        })

    def search_symbol_mentions(self, symbol: str, hours: int = 1) -> list[dict]:
        """심볼 관련 최근 트윗 검색 (봇 필터 적용)"""
        query = f"${symbol} OR #{symbol} -is:retweet lang:en"
        result = self.plugin.search_recent_tweets(
            query=query,
            max_results=100,
            tweet_fields=["public_metrics", "author_id", "created_at"],
            user_fields=["public_metrics"],
            expansions=["author_id"]
        )
        return self._filter_bots(result)

    def get_kol_mentions(self, symbol: str) -> list[dict]:
        """KOL 화이트리스트 계정의 심볼 언급 감지"""
        hits = []
        for name, user_id in self.KOL_WHITELIST.items():
            mentions = self.plugin.get_users_mentions(
                id=user_id,
                max_results=10,
                tweet_fields=["created_at", "public_metrics"]
            )
            for tweet in (mentions.get("data") or []):
                if symbol.upper() in tweet["text"].upper():
                    hits.append({"kol": name, "tweet": tweet})
        return hits

    def post_pnl_card(self, text: str, image_path: str) -> dict:
        """P&L 카드 이미지 + 텍스트 포스팅"""
        media = self.plugin.upload_media(image_path)
        return self.plugin.create_tweet(text=text, media_ids=[media["media_id"]])

    def _filter_bots(self, result: dict) -> list[dict]:
        """팔로워 < 500 AND 계정 나이 < 30일 제외"""
        users = {u["id"]: u for u in result.get("includes", {}).get("users", [])}
        filtered = []
        for tweet in (result.get("data") or []):
            user = users.get(tweet.get("author_id"), {})
            metrics = user.get("public_metrics", {})
            if metrics.get("followers_count", 0) >= 500:
                filtered.append(tweet)
        return filtered
```

### Slice B — 신규 Building Blocks (0.5일)

```python
# engine/social/blocks.py

from dataclasses import dataclass
from engine.social.twitter_client import WTDTwitterClient

@dataclass
class SocialSentimentSpikeBlock:
    """
    심볼 언급량이 1h rolling Z-score > 2σ 일 때 True
    딸깍 Phase 1 optional / Phase 2 required_any
    """
    window_minutes: int = 60
    zscore_threshold: float = 2.0

    def evaluate(self, symbol: str, client: WTDTwitterClient) -> dict:
        tweets = client.search_symbol_mentions(symbol, hours=1)
        count = len(tweets)
        # Z-score는 redis에 rolling baseline 저장 필요 (Slice C에서 구현)
        return {
            "block": "social_sentiment_spike",
            "signal": count > 20,   # 임시 threshold, 추후 Z-score화
            "tweet_count": count,
            "raw": tweets[:5]
        }


@dataclass
class KolMentionDetectBlock:
    """
    KOL 화이트리스트 계정이 해당 심볼 언급 시 즉시 True
    딸깍 Phase 2 required_any
    """
    def evaluate(self, symbol: str, client: WTDTwitterClient) -> dict:
        hits = client.get_kol_mentions(symbol)
        return {
            "block": "kol_mention_detect",
            "signal": len(hits) > 0,
            "kol_hits": hits,
            "mention_strength": "strong" if len(hits) >= 2 else "weak"
        }
```

### Slice C — OI_PRESURGE_LONG 패턴 + oi_price_lag_detect 블록 (1일)

```python
# engine/patterns/library.py 에 추가

OI_PRESURGE_LONG = PatternObject(
    slug="oi-presurge-long-v1",
    name="OI Presurge Long",
    direction="long",
    description="OI 선취매: OI↑ + price flat → social ignition → breakout",
    phases=[
        PatternPhase(
            name="QUIET_ACCUMULATION",
            required=["oi_price_lag_detect"],
            optional=["social_sentiment_spike"],
            min_bars=3,
            max_bars=48,  # 최대 4h (5m 봉 기준)
        ),
        PatternPhase(
            name="SOCIAL_IGNITION",
            required_any=["kol_mention_detect", "social_sentiment_spike"],
            gate="price_within_3pct_of_entry_zone",
            min_bars=1,
            max_bars=12,
        ),
        PatternPhase(
            name="BREAKOUT_CONFIRM",
            required=["breakout_above_high", "volume_surge"],
            min_bars=1,
            max_bars=6,
        ),
        PatternPhase(
            name="TARGET",
            target_multiplier=3.0,  # 3:1 R/R
            stop_policy="fixed_200_usdt",
        ),
    ]
)
```

```python
# engine/scoring/block_evaluator.py 에 추가
# oi_price_lag_detect 블록

def evaluate_oi_price_lag(symbol: str, klines: list, oi_data: dict) -> dict:
    """
    OI 1h 변화율 > +15% AND 가격 변화율 < +2%
    → 포지션 쌓이는데 가격 반응 없는 선취매 구간
    """
    oi_change_1h = _calc_oi_change(oi_data, hours=1)
    price_change_1h = _calc_price_change(klines, hours=1)

    signal = (oi_change_1h > 0.15) and (abs(price_change_1h) < 0.02)
    return {
        "block": "oi_price_lag_detect",
        "signal": signal,
        "oi_change_1h": oi_change_1h,
        "price_change_1h": price_change_1h,
        "lag_score": oi_change_1h / max(abs(price_change_1h), 0.001)
    }
```

### Slice D — Risk Policy Plane (0.5일)

```python
# engine/patterns/risk_policy.py  (신규)

class FixedStopPolicy:
    """
    딸깍 원칙: 포지션 크기와 무관하게 200 USDT 고정 손절
    감정 완전 배제 — 계산만 하고, 실제 주문 집행은 별도 레이어
    """
    STOP_LOSS_USDT = 200.0

    def get_stop_price(self, entry: float, atr: float) -> float:
        """ATR 기반 stop, 단 200 USDT 초과 시 강제 조정"""
        atr_stop_dist = 1.5 * atr
        max_stop_dist = self.STOP_LOSS_USDT / self.get_position_size(entry, entry - atr_stop_dist)
        stop_dist = min(atr_stop_dist, max_stop_dist)
        return entry - stop_dist

    def get_position_size(self, entry: float, stop: float) -> float:
        """200 USDT 손실에 해당하는 포지션 크기 역산 (USDT 계약 기준)"""
        risk_per_unit = abs(entry - stop)
        if risk_per_unit == 0:
            return 0.0
        return self.STOP_LOSS_USDT / risk_per_unit

    def get_target_price(self, entry: float, stop: float, rr: float = 3.0) -> float:
        """R:R = 3:1 기본값"""
        risk = abs(entry - stop)
        return entry + (risk * rr)

    def summary(self, entry: float, stop: float) -> dict:
        size = self.get_position_size(entry, stop)
        target = self.get_target_price(entry, stop)
        return {
            "entry": entry,
            "stop": stop,
            "target": target,
            "position_size_usdt": size * entry,
            "max_loss_usdt": self.STOP_LOSS_USDT,
            "potential_gain_usdt": self.STOP_LOSS_USDT * 3.0,
            "rr_ratio": 3.0,
        }
```

### Slice E — Branding Engine (1일)

```python
# engine/branding/pnl_renderer.py

from PIL import Image, ImageDraw, ImageFont
import io

def render_pnl_card(
    symbol: str,
    entry: float,
    exit_price: float,
    pnl_usdt: float,
    pattern_slug: str,
    hit: bool,
) -> bytes:
    """
    P&L 카드 PNG 생성
    
    출력 예시:
    ┌─────────────────────────┐
    │  BTCUSDT  +24.3%  ✓   │
    │  Entry: 94,200          │
    │  Exit:  117,100         │
    │  P&L: +483 USDT         │
    │  Stop: 200 USDT max     │
    │  OI_PRESURGE_LONG       │
    └─────────────────────────┘
    """
    img = Image.new("RGB", (600, 300), color="#0d1117")
    draw = ImageDraw.Draw(img)

    status = "✓ HIT" if hit else "✗ STOP"
    pct = ((exit_price - entry) / entry) * 100

    draw.text((30, 30),  f"{symbol}  {pct:+.1f}%  {status}", fill="#00ff88", font=_font(28))
    draw.text((30, 80),  f"Entry:  {entry:,.0f}", fill="#ffffff", font=_font(20))
    draw.text((30, 110), f"Exit:   {exit_price:,.0f}", fill="#ffffff", font=_font(20))
    draw.text((30, 150), f"P&L:   {pnl_usdt:+.0f} USDT", fill="#00ff88" if pnl_usdt > 0 else "#ff4444", font=_font(24))
    draw.text((30, 190), f"Max Stop: 200 USDT", fill="#888888", font=_font(16))
    draw.text((30, 220), pattern_slug, fill="#4488ff", font=_font(16))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()

def _font(size: int):
    try:
        return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", size)
    except:
        return ImageFont.load_default()
```

```python
# engine/branding/sns_poster.py

from engine.social.twitter_client import WTDTwitterClient
from engine.branding.pnl_renderer import render_pnl_card
import tempfile, os

class SNSPoster:
    def __init__(self):
        self.twitter = WTDTwitterClient()

    def post_trade_result(
        self,
        symbol: str,
        entry: float,
        exit_price: float,
        pnl_usdt: float,
        pattern_slug: str,
        hit: bool,
    ):
        """P&L 카드 생성 → Twitter 자동 포스팅"""
        card_bytes = render_pnl_card(symbol, entry, exit_price, pnl_usdt, pattern_slug, hit)

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            f.write(card_bytes)
            tmp_path = f.name

        text = self._generate_caption(symbol, pnl_usdt, hit)

        try:
            return self.twitter.post_pnl_card(text=text, image_path=tmp_path)
        finally:
            os.unlink(tmp_path)

    def _generate_caption(self, symbol: str, pnl_usdt: float, hit: bool) -> str:
        if hit:
            return f"${symbol} +{pnl_usdt:.0f} USDT 💰\nOI 선취매 패턴 적중\nMax risk: 200 USDT → {pnl_usdt:.0f} USDT\n#crypto #trading"
        else:
            return f"${symbol} -200 USDT 손절 ✂️\nRule 지켰다. 다음 셋업 대기.\n#crypto #trading"
```

## 신청/설정 절차

1. **GAME API Key** — 이미 발급됨 (`apt-95928da8b0d22f90f583f2cd50f94b81`)

2. **Twitter Access Token 발급**
   ```bash
   cd engine
   pip install twitter_plugin_gamesdk
   twitter-plugin-gamesdk auth -k apt-95928da8b0d22f90f583f2cd50f94b81
   # 브라우저 열림 → X 계정 로그인 → 권한 허용
   # → GAME_TWITTER_ACCESS_TOKEN 출력됨
   ```

3. **`.env` 추가**
   ```
   GAME_API_KEY=apt-95928da8b0d22f90f583f2cd50f94b81
   GAME_TWITTER_ACCESS_TOKEN=<위에서 발급된 토큰>
   ```

4. **Pillow 설치** (branding 모듈용)
   ```bash
   pip install Pillow
   ```

## Decisions

- GAME SDK Twitter 선택 이유: X API Basic($100/월) 없이 35 calls/5분 무료 사용 가능
- 봇 필터 기준: 팔로워 < 500 (계정 나이 API 호출 비용 대비 팔로워 기준이 효율적)
- `kol_mention_detect`가 Phase 2의 primary trigger (social_sentiment_spike는 secondary)
- P&L 카드는 Pillow 텍스트 기반 (디자인 에셋 의존성 제거)

## Next Steps

1. Slice A: `pip install twitter_plugin_gamesdk` → auth 커맨드 실행 → `.env` 저장
2. Slice B: `engine/social/` 모듈 신규 생성 + 기존 block_evaluator에 3개 블록 등록
3. Slice C: `OI_PRESURGE_LONG` 패턴 library.py 등록 + 테스트 작성
4. Slice D: `risk_policy.py` 신규 + PatternObject exit_conditions wiring
5. Slice E: branding 모듈 + sns_poster 통합 테스트

## Exit Criteria

- [ ] `twitter_client.py` 인증 성공 + `search_symbol_mentions("BTC")` 결과 반환
- [ ] `oi_price_lag_detect` 블록 테스트 통과
- [ ] `OI_PRESURGE_LONG` 패턴 Phase 1→2→3→4 전이 테스트 통과
- [ ] `FixedStopPolicy.summary()` 단위 테스트 통과
- [ ] `render_pnl_card()` PNG 파일 생성 확인
- [ ] 전체 테스트 스위트 green (기존 테스트 regression 없음)

## Handoff Checklist

- [ ] `GAME_API_KEY` + `GAME_TWITTER_ACCESS_TOKEN` `.env` 등록
- [ ] `engine/requirements.txt`에 `twitter_plugin_gamesdk`, `Pillow` 추가
- [ ] `engine/social/` 신규 모듈 생성
- [ ] `engine/branding/` 신규 모듈 생성
- [ ] `engine/patterns/risk_policy.py` 신규 생성
- [ ] library.py에 `OI_PRESURGE_LONG` 등록
- [ ] block_evaluator.py에 3개 블록 등록
