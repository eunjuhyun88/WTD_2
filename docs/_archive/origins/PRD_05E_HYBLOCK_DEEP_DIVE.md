# 05E — Hyblock Capital Deep Dive

**버전**: v1.0 (2026-04-25)
**상태**: canonical (supplements PRD_05B)
**데이터 소스**: hyblockcapital.com, academy.hyblockcapital.com, docs.hyblockcapital.com (live fetch 2026-04-25)
**의도**: Hyblock의 실제 indicator 구조와 가격 모델 파악, "trading volume 기반 free" 모델의 의미 이해

---

## 0. 핵심 발견

Hyblock은 **CoinGlass와 다른 길**을 갔다.

- **3-tier**: Basic (free) / Advanced / Professional
- **Volume-based free access** (Bybit referral 트래픽 통해 free 가능)
- **400+ tickers, 100+ real-time indicators**
- **Liquidation Levels** — 단순 heatmap이 아니라 **predictive levels** (3-tier granularity)
- **Hyblock Terminal v2.0** — 자체 customizable dashboard
- **Bybit partnership** — 거래소 referral revenue로 무료 access 제공
- **Hyblock x TTC** — 미공개 product line

이 회사는 **"liquidation levels의 1인자"**로 자리잡으려 함. 우리와 직접 경쟁 영역 좁음.

---

## 1. 제품 구조

### 1.1 사이트 구조

```
hyblockcapital.com (web app)
├── /                       → 마케팅
├── /pricing                → 3-tier
├── /features               → terminal 기능
├── /supported-products     → 지원 indicators + coins
├── /faq                    → FAQ
├── /api-explorer           → API 시각 explorer
├── /signup                 → 가입
├── /terminal               → Terminal app entry
└── /hyblock-x-ttc          → 미공개 별도 product

Hyblock Terminal v2.0       → 메인 web app (별도)
academy.hyblockcapital.com  → indicator 교육
docs.hyblockcapital.com     → API 문서
```

### 1.2 Pricing Tiers

확정된 정보 + 추정:

| Tier | 가격 [estimate] | Volume threshold | 주요 기능 |
|---|---|---|---|
| **Basic (Free)** | $0 | — | 기본 indicators, 제한된 lookback |
| **Advanced** | $50-100/mo [estimate] | $1M Bybit/mo → free | 모든 indicator + 1년 lookback |
| **Professional** | $100-200/mo [estimate] | $6M Bybit/mo → free | 2년 lookback + premium features |

15% off referral code 존재 ("NH4U28") — 즉 표시 가격에서 할인 가능.

### 1.3 Volume-Based Free Access (unique 모델)

Bybit referral partnership 통해:

```
Basic → Advanced (월간):
  $1M trading volume on Bybit (via referral)

Basic → Professional (월간):
  $6M trading volume on Bybit (via referral)

Advanced → Professional (월간):
  $4M trading volume on Bybit (via referral)
```

**의미**:
- Active trader는 사실상 무료
- 거래소 referral revenue로 cost 회수
- $1M monthly volume = 일평균 ~$33K, leverage 5x → notional ~$6.6K position 회전 (현실적)
- 즉 "프로 트레이더는 free, 캐주얼은 유료" 역구조

이 모델은 **CoinGlass와 정반대**. CoinGlass는 institutional + retail. Hyblock은 active retail trader 중심.

---

## 2. Hyblock Terminal v2.0 — 메인 product

### 2.1 Customizable Dashboard

- 사용자가 components 배치 가능
- 400+ tickers 지원
- 100+ real-time indicators

### 2.2 TradingView Integration

- TradingView Charting Application 사용
- Indicators → Orderbook (Beta)
- Pine Script 인디케이터 임베드

---

## 3. Indicator 구조 (academy 정확한 list)

Hyblock의 indicator는 5개 카테고리로 분류:

### 3.1 Orderflow & Open Interest

- **Kline** (OHLCV)
- **Buy volume / Sell volume / Volume delta**
- **Volume ratio**
- **Anchored CVD** (anchor point 기반)
- **Bot Tracker** — 알고리즘 거래 탐지
- **Slippage** — 실제 vs expected price
- **Transfer Of Contracts** — OI 변화 vs volume
- **Participation Ratio** — 참여 비율
- **Market Order Count / Average Size**
- **Limit Order Count / Average Size**
- **Buy Sell Trade Count Ratio**
- **Limit Order Count Ratio**
- **Market Order Count Ratio**
- **Previous Day / Week / Month Level**
- **Funding Rate**

### 3.2 Liquidity Indicators (signature)

- **Liquidation Heatmap** (cluster 시각화)
- **Liquidation Map** (magnetic zones)
- **Liquidity Heatmap** (bid/ask density)
- **Liquidation Levels** ⭐ (가장 unique, 아래 §5 참조)

### 3.3 Longs & Shorts Indicators

- **Top Trader Accounts** (거래소별 top trader 데이터)
- **Top Trader Positions**
- **Anchored Top Trader Accounts/Positions** (anchor 기반)
- **Global Accounts** — 글로벌 long/short
- **Anchored Global Accounts**
- **Net Long Short**
- **Net Long Short Delta**
- **Whale Retail Delta** — 큰 손 vs 개미 차이
- **True Retail Long Short**
- **Whale Position Dominance**
- **Trader Sentiment Gap**

### 3.4 Sentiment

- (academy 페이지 언급, 구체 indicator [unknown])

### 3.5 Orderbook

- **Bids & Asks** — 6 depth filter (Quote/1%/2%/5%/10%/20%/full)
- **Bid & Ask Ratio**
- **Global Bid & Ask** — 1100+ coin 통합 spot orderbook
- **Combined Books**
- **Bid Ask Spread** (Average + Max)
- **Bid & Ask Cumulative Delta**
- **Best Bid & Ask**
- **Bids & Asks Delta**

---

## 4. Bid/Ask Filter (powerful 기능)

Hyblock의 Bids & Asks는 **6 depth filter** 제공:

| Filter | 의미 |
|---|---|
| **Quote** | Best bid/ask only (스푸핑 가능성 최저) |
| **1%** | Current price ±1% |
| **2%** | ±2% |
| **5%** | ±5% |
| **10%** | ±10% |
| **20%** | ±20% |
| **Full** | 전체 orderbook |

**의미**:
- 시장 maker activity 분리 가능 (Quote level)
- 스푸핑 노이즈 제거 가능
- 진짜 supply/demand 분석

---

## 5. Liquidation Levels (signature 기능)

이게 Hyblock의 **진짜 moat**다. CoinGlass의 heatmap과 다른 차원.

### 5.1 What is it

청산 가격 **클러스터**가 어디에 있을지 **예측**:
- 고레버리지 (100x, 50x, 25x) 기반
- Long & Short 양방향
- Time-evolving (chart 위에 시간축)

### 5.2 3-Tier Granularity

| Tier | 표시 levels | 정확도 |
|---|---|---|
| **Tier 1** | 가장 많은 levels | 낮음 (noisy) |
| **Tier 2** | 중간 | 중간 |
| **Tier 3** | 적은 levels | 높음 (덜 noisy) |

User가 선택. Tier 3가 큰 position 기반이라 더 정확함.

### 5.3 3-Chart Display

1. **Price chart + liquidation levels overlay**
2. **Liquidation Levels Profile** (오른쪽) — 모든 open liquidation levels
3. **Cumulative Liquidation Levels Delta** (아래) — long vs short 차이의 누적 합

### 5.4 활용법 (academy 가르치는 use cases)

- **Magnetic zones** — 가격이 청산 cluster로 끌려감
- **Stop hunting / liquidation hunting** — 의도적 청산 유도
- **High Risk-Reward Reversal** — cluster hit 후 반등
- **Continuation indication** — short squeeze cascade

이건 **Cogochi의 phase model과 결합 가능**. 예: real_dump phase에서 Tier 3 short liquidation cluster 도달이 confirmation signal.

### 5.5 거래소 + Granularity

- Binance Futures (USDT perp): 70+ alt coins + BTC, ETH, YFI
- 다른 거래소 별도 view 가능 (Bybit, Bitmex, OKX)

---

## 6. Hyblock의 unique 기능 (다른 곳 약함)

### 6.1 Top Trader Tracking

- 거래소가 공개하는 top trader position을 모아서 시각화
- **Whale Retail Delta** — 큰 손과 개미의 sentiment 차이
- **Whale Position Dominance**

### 6.2 Bot Tracker

- 알고리즘 거래 detection
- Pattern: 정확한 size, 정기적 timing

### 6.3 Slippage Indicator

- 실제 평균 체결가 vs orderbook 기대가
- 시장 stress 측정

### 6.4 Anchored CVD / Position

- User가 specific anchor point 설정
- "여기서부터 누적 시작" 사용자 정의

### 6.5 Global Bid & Ask (1100+ coins)

- Vantage Crypto data source
- Spot orderbook 전체 우주
- Cross-coin sentiment 측정

---

## 7. Hyblock이 **안 하는** 것 (우리 진입 지점)

### 7.1 검색/저장/판정 없음

- ❌ Pattern object 개념 없음
- ❌ "Save this setup" 없음
- ❌ Verdict ledger 없음
- ❌ Sequence-based search 없음
- ❌ Personal threshold variant 없음

### 7.2 AI layer 거의 없음

- AI research 없음
- 자연어 query 없음
- LLM-based explanation 없음

### 7.3 Workflow 약점

- 차트 위에 phase/event overlay 없음
- 사용자별 capture history 없음
- Telegram/Discord push 약함
- 팀 워크스페이스 없음

### 7.4 시간축 분석 약함

- Indicator는 풍부하지만 **"이 indicator가 trigger됐을 때 historically 어떻게 됐나"** 같은 backtest 약함
- Sequence pattern 추적 없음

---

## 8. Hyblock vs Cogochi 정확 차이

| 축 | Hyblock | Cogochi |
|---|---|---|
| **Primary value** | Liquidation levels + orderbook | Pattern 저장/검색/판정 |
| **Signature feature** | Liquidation Levels (3-tier predictive) | Sequence matcher |
| **Data layer** | First-party orderbook + scraping | Consumer (Hyblock 일부 포함 가능) |
| **AI** | 없음 | Parser (NL → PatternDraft) |
| **Memory** | 없음 (watchlist만) | Capture + verdict ledger |
| **Personalization** | Dashboard layout | Personal variants |
| **Sequence search** | ❌ | ✅ moat |
| **Pattern library** | ❌ | ✅ |
| **Team workspace** | ❌ | ✅ (P1) |
| **Free tier** | Limited (또는 volume free) | Limited (5 captures) |
| **Pro entry** | $50-100 (Advanced) | $29 |
| **Top tier** | $100-200 (Professional) | $199 (Team) |
| **Asset coverage** | 400+ tickers, 70+ alt perp | Top 200-300 perp |
| **Target user** | Active scalper / pro trader | Pattern researcher |
| **Bybit partnership** | ✅ (volume → free) | ❌ |
| **Liquidation levels** | ✅ Signature | ❌ (consume 가능) |
| **Top trader tracking** | ✅ | ❌ |
| **Time horizon** | 단기 scalping | 중기 (시간-일) |

---

## 9. 위협 시나리오

### 9.1 단기 (6개월)

- Hyblock이 pattern engine 추가? **확률 매우 낮음**
- 이유: liquidation 전문성에 집중. UI 이미 복잡

### 9.2 중기 (12-18개월)

- Hyblock이 AI layer 추가? **확률 medium**
- "Hyblock x TTC" 미공개 product line이 AI 가능성 [unknown]
- 우리 대응: 6개월 내 sequence matcher GA

### 9.3 장기 (24+개월)

- Hyblock이 verdict / memory 기능 추가? **확률 medium**
- 데스크/팀 user base 있음 (institutional 일부 사용)
- 우리 대응: team plan으로 차별화

### 9.4 가장 큰 위험

Bybit partnership으로 Hyblock이 사실상 **active trader에게 무료**. 우리 paid tier가 "왜 따로 돈 내냐"는 질문에 답해야 함.

대응:
- **다른 카테고리 메시지**: "Hyblock for liquidation, Cogochi for memory"
- **stack 강조**: 같이 쓰는 게 정상 (대체재 아님)
- Liquidation level overlay 옵션 (P2-P3) — Hyblock data 소비

---

## 10. Hyblock 활용 전략 (우리 입장)

### 10.1 Data 소비 path

**A. Hyblock API 사용**
- docs.hyblockcapital.com 존재
- 가격 [unknown], 추정 $200-500/mo
- 결정: 검토 가치, 단 우선순위 낮음

**B. Liquidation level은 자체 계산**
- 우리가 raw OI + funding으로 계산 가능
- 정확도는 Hyblock보다 떨어짐
- 결정: P1, baseline 자체 구현

**C. Hyblock과 partnership**
- Hyblock의 liquidation level을 우리 차트에 overlay
- "Powered by Hyblock" 표기
- [unknown] Hyblock 측 의향
- 결정: M6+ 검토

### 10.2 Multi-source aggregation

```
liquidation level data sources:
  1. CoinGlass API (Standard $299)
  2. Hyblock API ([unknown] price)
  3. 자체 계산 (baseline)

추천: launch 시 자체 계산 → M6+ Hyblock or CoinGlass 통합
```

---

## 11. Killer Comparison Statements

Hyblock 대비 마케팅 메시지:

- **"Hyblock predicts liquidation levels. Cogochi remembers if those liquidations triggered patterns that worked."**
- **"100+ indicators is impressive. But how many of them did you act on, and what happened? Cogochi answers that."**
- **"Hyblock helps you see the next 5 minutes. Cogochi helps you remember the last 5 months."**
- **"Free Hyblock if you trade $1M/mo on Bybit. Free Cogochi forever for capture-and-search loop."**

---

## 12. 우리가 차용할 것

### 12.1 가져올 것

1. **Liquidation level overlay** — chart 옵션 (P2)
2. **Bid/ask depth filter** (Quote, 1%, 5%, 10%) — orderbook view에
3. **Top trader tracking** chip — "지금 whales는 long/short" (Phase 3)
4. **Whale Retail Delta** 개념 — feature engineering
5. **Anchored CVD** — phase 진입 시점 anchor 가능
6. **Bot Tracker** — alert 신뢰도 지표 (Phase 3)

### 12.2 가져오지 않을 것

1. ❌ Liquidation level prediction algorithm (Hyblock moat, 정확도 따라가기 어려움)
2. ❌ 100+ indicators 백화점식 — 우리는 selective
3. ❌ TradingView 전체 의존
4. ❌ Volume-based free model (사업 모델 다름)
5. ❌ 1100+ coin spot orderbook (perp focus)

---

## 13. Bybit Partnership 모델 분석

Hyblock의 Bybit partnership은 흥미로운 GTM 사례:

### 13.1 작동 원리

- 사용자가 Hyblock referral로 Bybit 가입
- Bybit가 거래 수수료의 일부를 Hyblock에 지급
- Hyblock이 그 수익으로 free access 제공
- Win-win-win: 사용자 (free), Hyblock (revenue), Bybit (volume)

### 13.2 우리도 가능한가?

가능성 검토:
- Bybit / OKX와 referral partnership
- 사용자가 Cogochi 통해 가입 → 일부 fee back
- Cogochi가 그 revenue로 discount or feature unlock 제공

장애:
- Cogochi는 거래 추천 도구가 아님 (regulatory)
- Brand confusion 가능성
- P0 페르소나가 이미 거래소 계정 보유

결정: **Phase 3+ 검토**. M12까지는 organic + 구독 모델.

대안:
- Velo, Hyblock 같은 거래소 referral partner와 **secondary** partnership
- "Cogochi에서 분석 → Velo/Bybit 거래소로 이동" deeplink

---

## 14. 추적 우선순위 (monthly check)

Hyblock 변화 monitor:

- [ ] **Hyblock x TTC** product 정체 파악
- [ ] AI layer 추가 시점
- [ ] Pattern memory 기능 추가 시점
- [ ] 가격 tier 변경
- [ ] Bybit 외 거래소 partnership 추가
- [ ] API public 가격 공개

---

## 15. 즉시 적용 액션

### Design 측면

- [ ] Liquidation level overlay feature P2 → P1 검토 가능
- [ ] Bid/ask depth filter 패턴 우리 orderbook view에 적용
- [ ] Anchored CVD feature 추가 (P0 power user)
- [ ] Whale Retail Delta 비슷한 feature engineering 검토

### Product 측면

- [ ] Hyblock 사용자 대상 onboarding 컨텐츠
- [ ] Comparison page (/compare/hyblock)
- [ ] Hyblock과 deeplink 가능성 [unknown]

### Marketing 측면

- [ ] "Hyblock for liquidation, Cogochi for memory" 메시지
- [ ] Active scalper segment (Hyblock heavy user) 대상 mid-term retention 전략
- [ ] Bybit referral 사용 trader segment 분석

---

## 16. 한 줄 결론

> **Hyblock = Liquidation Levels의 1인자. 100+ indicators, Bybit partnership으로 active trader 사실상 free. Pro tier $100-200.**
>
> **우리와 카테고리 다름**: Hyblock = 단기 scalping data. Cogochi = 중기 pattern memory.
>
> **stack 정상**: P0 일부는 Hyblock + Cogochi 동시 사용. 차별화 포인트 = sequence matcher + verdict ledger + team workspace.
