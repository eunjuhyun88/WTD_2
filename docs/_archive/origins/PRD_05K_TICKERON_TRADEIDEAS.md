# 05K — Tickeron + Trade Ideas (Stock Pattern AI 참고)

**버전**: v1.0 (2026-04-25)
**상태**: canonical (supplements PRD_05B)
**데이터 소스**: tickeron.com, trade-ideas.com, WallStreetZen/AI Trading Camp/PropFirmShop reviews 2026-Q1
**의도**: Stock pattern AI의 mature reference. 우리(crypto perp)에 없는 워크플로/UX 발견. 직접 위협 평가 포함.

---

## 0. 결론 먼저

**Tickeron**과 **Trade Ideas**는 stock pattern AI의 mature 참고.

핵심 차이:
- **Tickeron** = AI 패턴 자동 감지 + AI Robots (자동 매매) + 폭넓은 자산 (stocks/ETF/forex/crypto). 신규 **$35/mo crypto bot 패키지** 출시 (2026 초)
- **Trade Ideas** = Holly Grail engine 중심, **$228/mo** stock 전용 — premium price reference

**Cogochi 위협**:
- **Tickeron 위협**: Medium-low. Crypto pattern 진입 시작했지만 spot 가격 패턴 위주, derivatives 데이터 약함
- **Trade Ideas 위협**: Very low. Stock 전용, crypto X

**시사점**:
- Tickeron의 **"signal + confidence score" pattern UX**는 우리 verdict와 비교 가치
- **AI Robots virtual account** 모델은 우리 P3+ paper trading 모델 참고
- $35-228 가격 spread = AI pattern 시장 가격 anchor

---

## 1. Tickeron 상세

### 1.1 기본

- **2017+ 운영**
- **9,000+ stocks/ETFs daily** scan
- **150+ patterns** 실시간 감지
- **4.4/5 Google Play** rating
- **Asset coverage**: stocks, ETFs, forex, **crypto, mutual funds**
- **API 제공** (signal stream)

### 1.2 가격 구조

| Tier | 가격 | 특징 |
|---|---|---|
| **Free / Member** | $0 | 기본 access |
| **Daily Trade Signal Feed** | $5/mo or $60/yr | 일일 buy/sell signal |
| **Real-Time Patterns (RTP)** | **$20/mo** | 14d trial, 분 단위 scan, 다중 timeframe |
| **Trend Prediction Engine (TPE)** | **$30/mo** | 주/월 단위 방향성 예측 |
| **Pattern Search Engine (PSE)** | **$30/mo** | daily chart pattern + breakout/target |
| **Crypto AI Bot Package** | **$35/mo** (NEW) | AI Crypto Trading Robots + RTP 결합 |
| **Beginner / Intermediate / Expert** | **$60-210/mo** annually | Bundle tiers |

[모듈러 가격: 일부 기능별 separate 결제, 일부 bundle]

### 1.3 핵심 모듈

#### 1.3.1 Pattern Search Engine (PSE)

- **150+ candlestick patterns** 자동 감지
- 차트 검색: 사용자 조건 입력 → matching pattern 찾기
- 각 pattern에:
  - **Success probability** score
  - **Certainty/confidence** score
  - **Breakout price**
  - **Target price**
- 9,000+ stocks 매일 분석
- Backtesting 지원

이건 우리 **pattern catalog + verdict 결합**과 유사 컨셉. 다만:
- Tickeron = **algorithm 자동**
- Cogochi = **사용자 verdict 누적**

#### 1.3.2 Real-Time Patterns (RTP)

- **분 단위 scan**
- Multi-timeframe: 5m, 15m, 30m, 1h, 1d
- 패턴 발생 시 즉시 알림
- $20/mo

#### 1.3.3 Trend Prediction Engine (TPE)

- **AI 방향 예측**: stock이 1주 또는 1개월 내 오를/내릴 확률
- 78% bullish 같은 likeliness score
- Backtested
- $30/mo

#### 1.3.4 AI Robots (signature)

- **자동 매매 bot** — pattern 기반
- **Financial Learning Models (FLMs)** — 자칭 proprietary AI
- 3 generation:
  1. **Signal Agents** — entry-level, fixed amount
  2. **Virtual Agents (VAs)** — money/risk management
  3. **Brokerage Agents** — 실제 brokerage 연결, tick-level execution
- Performance 자랑: "Swing Trader AI Robot 4.51% return for Cloudflare in 1 week", "5-min strategy 210% annualized"
- [marketing 자칭, 검증 데이터 unverified]

#### 1.3.5 Marketplace + Academy

- Robot marketplace: 다른 사용자의 AI bot 구독
- Tickeron Academy: 무료 educational content
- Community-driven filters

### 1.4 Crypto Module (NEW 2026)

**$35/mo 패키지** (14d trial):
- AI Crypto Trading Robots
- Real-Time Patterns (RTP)
- 암호화폐 위주

**500+ cryptocurrencies** paper trading 지원.

**한계**:
- ❌ Open Interest, Funding rate, Liquidation 같은 derivatives 핵심 X
- ❌ Cross-exchange aggregation 약함
- ❌ Hyperliquid/BloFin 같은 perp venue X
- ❌ Spot 차트 패턴 위주

### 1.5 Tickeron 강점

1. **AI Robot ecosystem** — 사용자가 bot 만들고 marketplace에서 판매
2. **Confidence score** 명시 (success probability + certainty)
3. **Backtest** 통합
4. **Brokerage integration**
5. **Multi-asset** (stocks, ETF, forex, crypto, mutual funds)

### 1.6 Tickeron 약점 (우리 관점)

- ❌ **Derivatives 데이터 약함**
- ❌ **Sequence-based search** 없음
- ❌ **Verdict ledger** (사용자 검증 history) 없음
- ❌ **Phase concept** 없음 (스냅샷 기반)
- ❌ Algorithm-driven, 사용자 의도 반영 약함
- ❌ Performance 자랑이 marketing 위주, 외부 검증 약함

---

## 2. Trade Ideas 상세

### 2.1 기본

- **2002 설립**, 가장 오래된 AI stock scanner
- **Stock 전용** (no crypto)
- **Holly Grail engine** (signature)
- **8,000+ stocks** overnight 분석

### 2.2 가격 구조

| Tier | 가격 | 특징 |
|---|---|---|
| **Standard** | $84/mo or $999/yr | Real-time scanner |
| **Premium** | **$228/mo** or $2,268/yr | Holly Grail + simulator + API |

가장 비싼 retail trading platform 중 하나.

### 2.3 핵심 기능

#### 2.3.1 Holly Grail Engine

- **밤사이 8,000+ stock 분석**
- 다음날 trader에게 success-filtered alert 전달
- **AI 기반 strategy backtest**
- "Holly Neo" — 최신 AI 모델

#### 2.3.2 Real-Time Scanner

- 가격, 뉴스, technical pattern, volume anomaly 기반 alert
- Custom filter
- Sliding chart panel

#### 2.3.3 Simulator (paper trading)

- Live data로 실시간 paper trade
- Performance tracking

#### 2.3.4 Brokerage Plus (NEW)

- 자동 매매 — Interactive Brokers, E*Trade 등 연결

### 2.4 Trade Ideas 강점

1. **Holly engine 신뢰** — 20+ year 운영, retail trader 사이 명성
2. **Premium tier 가격 검증** — $228/mo 시장 — pro stock trader가 지불
3. **Real-time alert speed** 강함

### 2.5 Cogochi 관점에서

- ❌ Crypto X
- ❌ 위협 거의 없음
- ✅ 가격 anchor: $228/mo는 우리 Pro Plus ($79) 또는 Team ($199) 영역과 겹침

---

## 3. Cogochi vs Tickeron vs Trade Ideas

| 축 | Tickeron | Trade Ideas | Cogochi |
|---|---|---|---|
| **Asset** | Multi (stock/ETF/forex/crypto) | Stock 전용 | Crypto perp 전용 |
| **Pattern detection** | Algorithmic (150+ pattern) | Algorithmic (Holly) | User capture + algorithmic |
| **Confidence score** | ✅ Success prob + certainty | ✅ Backtest result | ✅ verdict (user + ledger) |
| **Sequence search** | ❌ | ❌ | ✅ moat |
| **Verdict ledger** | ❌ (algorithmic only) | ❌ | ✅ moat |
| **Personal variant** | Custom filter | Custom filter | ✅ threshold override |
| **AI Bot / Auto-trade** | ✅ AI Robots | ✅ Brokerage Plus | ❌ out of scope |
| **Marketplace** | ✅ Robot marketplace | ❌ | ❌ (P3+ idea) |
| **Crypto derivatives** | Spot only, weak | ❌ | ✅ deep |
| **Price** | $5-210/mo | $84-228/mo | $29-79/mo |
| **API** | ✅ | ✅ Premium | P2 |
| **Target user** | Retail trader (multi-asset) | Pro stock trader | Crypto perp pattern researcher |

---

## 4. 위협 평가

### 4.1 Tickeron이 crypto perp 진입?

**확률**: Low-Medium.

이유 against:
- Stock 9년 codebase, retail multi-asset 포지션
- Crypto derivatives = 별도 인프라 + 데이터 계약
- $35 crypto package는 spot + price action 위주, perp 전환 어려움

이유 for:
- Crypto 시장 진입 의지 명확 (2026 초 패키지 출시)
- AI Robot ecosystem이 perp으로 확장 가능
- Marketplace 모델은 derivatives bot으로 적용 가능

**우리 대응**: Sequence search + verdict ledger의 algorithmic depth로 차별화. Tickeron이 algorithm-only이고 사용자 검증 history 없음.

### 4.2 Trade Ideas가 crypto 진입?

**확률**: Very low.
- 24년 stock 전용 운영
- 새로 crypto 진출하면 brand confusion
- Holly engine은 stock-specific feature

### 4.3 새 startup이 Tickeron의 crypto 버전?

**확률**: High.
- "Tickeron for Crypto" — clear positioning
- VC 투자 유입 가능
- 이미 Surf 같은 회사가 비슷한 경로
- **6-12개월 모니터링 필수**

---

## 5. 차용 가능 (Cogochi에 적용)

### 5.1 Confidence score 명시

Tickeron의 "success probability + certainty" 분리는 좋은 UX 패턴.

**Cogochi 적용**:
- Pattern Detection Result에:
  - `historical_success_rate`: 0.62 (전체 ledger 기준)
  - `current_match_confidence`: 0.78 (이번 인스턴스의 sequence similarity)
  - `personal_success_rate`: 0.55 (사용자 본인 verdict 기준, 5+ verdicts 필요)
- 3개 점수 분리 표시 → 신뢰도 더 명확

### 5.2 AI Robot Marketplace 모델 (P3+)

Tickeron의 robot marketplace = 사용자가 bot 만들어 판매.

**Cogochi 적용 (P3+)**:
- 사용자가 **personal variant**를 marketplace에 publish
- 다른 사용자가 구독해서 사용
- Revenue share (creator 70%, Cogochi 30%)
- 단, derivatives는 regulatory risk 큼 → 신중

대안: **Cogochi Studio** (Surf Studio 스타일):
- Pattern + variant + alert 묶어 "Strategy Pack" 만들기
- 공유 (free 또는 paid)
- 단순 share, 자동 매매 X

### 5.3 Multi-tier modular pricing

Tickeron의 **모듈러 가격** ($5 daily signal, $20 RTP, $30 TPE):
- 사용자가 필요한 것만 구매
- Bundle도 제공

**Cogochi 적용 검토**:
- 현재 plan: Free / Pro $29 / Pro Plus $79 / Team $199 (단순 tier)
- 대안: Add-on 모델
  - Pro $29 base
  - + Telegram alerts $9
  - + News API integration $9
  - + Personal variant 무제한 $19
  - + API access $19

**판단**: P0/P1에서는 단순 tier가 좋음. P2+에서 add-on 도입 검토.

### 5.4 Paper trading / Virtual Account

Tickeron VA, Trade Ideas Simulator = paper trading.

**Cogochi P3+ idea**:
- "Verdict mode without real position"
- 사용자가 hypothetical entry → 72h 후 outcome → verdict
- Real position 없이 ledger 누적
- 학습 + 검증 사이클 활성화

### 5.5 14-day trial reference

Tickeron PSE/TPE/RTP, Trade Ideas — 모두 14d trial.

**Cogochi 적용**:
- Closed Beta에서 14d trial 패턴 검토
- Free tier vs trial — 우리는 Free tier 영구. 다만 Pro upgrade에 14d trial 추가 가능

---

## 6. 가격 anchoring 갱신

이번 분석으로 stock pattern AI 가격 anchor 추가:

| 가격대 | 도구 |
|---|---|
| $0-20/mo | Tickeron Member, Free tier |
| $20-50/mo | Tickeron RTP/TPE/PSE, Tickeron Crypto $35 |
| $50-100/mo | Trade Ideas Standard $84, Tickeron Beginner $60 |
| $100-250/mo | Tickeron Intermediate $120-210, Trade Ideas Premium $228 |
| **Cogochi 위치** | $29 Pro / $79 Pro Plus / $199 Team |

우리 $79 Pro Plus는 Trade Ideas Premium ($228)의 35%. **상대적으로 저렴**.

이게 의미하는 것:
- Cogochi는 **mid-tier sweet spot**
- Stock 시장 (성숙)에서 $228 paying users 있음 → crypto 시장에서도 same level WTP 가능
- 미래 Cogochi Premium ($149-199 individual) tier 추가 검토 가능

---

## 7. Crypto pattern AI 시장의 mature 시그널

Tickeron + Trade Ideas는 **stock에서 mature**한 카테고리. 우리에게 시사:

### 7.1 시장이 존재한다는 증거

- Stock pattern AI는 20+ 년 시장
- AI Robots, Holly engine 같은 product 안정 운영
- Retail 사이 brand awareness 있음
- $228/mo 가격 paying user 존재

### 7.2 Crypto pattern AI는 아직 nascent

- Tickeron이 2026 초 진입 (아직 perp X)
- TrendSpider crypto는 spot 위주
- **Cogochi는 crypto perp pattern OS의 first mover 가능**

### 7.3 우리가 만들 차별

Stock pattern AI에 없는 것 = **derivatives data structure 활용**:

- Funding regime
- OI flux
- Liquidation cascade
- CVD divergence
- Funding × OI sequence
- Cross-exchange basis arbitrage

이건 stock에 없는 **derivatives-native pattern**. Cogochi의 진짜 unique value.

---

## 8. 한 줄 결론

> **Tickeron + Trade Ideas = stock pattern AI mature reference. Stock 시장에서 $228/mo paying user 존재 증명.**
>
> **Tickeron crypto $35 패키지 launch했지만 spot pattern only — derivatives perp X. 위협 Medium-low.**
>
> **시사점: Confidence score 분리, paper trading, modular pricing, marketplace 모델 = 우리 P2-P3+ 차용 가능.**
>
> **결정적 차별: Cogochi는 derivatives-native pattern (funding × OI × liquidation × CVD sequence). Stock pattern AI가 못 만든다.**
>
> **우리는 "Tickeron for crypto perp"가 아니라 "Pattern Research OS for crypto derivatives" — 카테고리 자체가 새로움.**
