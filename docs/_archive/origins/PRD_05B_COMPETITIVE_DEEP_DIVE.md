# 05B — Competitive Analysis (Feature-Level Deep Dive)

**버전**: v1.0 (2026-04-25)
**상태**: canonical (supplements PRD_05)
**데이터 소스**: 웹 검색 2026-04-25 + 경쟁사 docs
**의도**: 경쟁사 제품을 기능 단위로 쪼개 분석해서 우리가 **어느 지점**에 꽂힐지 결정

---

## 0. 왜 이 문서가 필요한가

PRD_05는 큰 그림 (카테고리, positioning). 이 문서는 **기능 레벨 대차 대조표**. 실제 유저가 돈 내는 거는 "카테고리"가 아니라 구체적 기능이다.

P0 유저는 한 달에 $120-200을 **여러 서비스**에 쓴다:
- CoinGlass ($12) → 기본 data
- Hyblock ($50-100) → liquidation heatmap
- Velo ($free/premium) → CVD, basis, options
- TradingView ($60) → charting
- Coinalyze / Laevitas → 보조 지표
- Telegram bot subscription ($20-50) → alert

그래서 우리는 **어떤 기능으로 저 예산을 대체 또는 덧붙이나**를 정확히 알아야 한다.

---

## 1. 경쟁사 카테고리 맵

```
┌─────────────────────────────────────────────────────────────┐
│ LAYER 1: DATA AGGREGATION                                    │
│  CoinGlass, Velo, Coinalyze, Laevitas                        │
│  → raw 지표 제공, 해석 안 함                                 │
├─────────────────────────────────────────────────────────────┤
│ LAYER 2: ADVANCED VISUALIZATION                              │
│  Hyblock Capital, CoinGlass Prime                            │
│  → heatmap, density, clustering                              │
├─────────────────────────────────────────────────────────────┤
│ LAYER 3: CHARTING                                            │
│  TradingView, Velo (chart), TrendSpider                      │
│  → 그리기 도구 + 기술적 분석                                 │
├─────────────────────────────────────────────────────────────┤
│ LAYER 4: AI RESEARCH                                         │
│  Surf.ai, ChatGPT (general)                                  │
│  → 요약, 설명, Q&A                                           │
├─────────────────────────────────────────────────────────────┤
│ LAYER 5: PATTERN / ALERT                                     │
│  TrendSpider (stock), Telegram bots, TradeIdeas              │
│  → 사전 정의된 패턴 스캔                                     │
├─────────────────────────────────────────────────────────────┤
│ LAYER 6: PATTERN RESEARCH OS ← Cogochi                       │
│  → 저장 · 검색 · 판정 · 학습 루프                           │
└─────────────────────────────────────────────────────────────┘
```

Layers 1-3는 성숙한 시장. Layer 4는 급성장. Layer 5는 stock에만 존재. **Layer 6이 비어 있다**.

---

## 2. Velo.xyz (Velo Data) — 심층

### 2.1 실체

- `velo.xyz` / `velodata.app` — 둘 다 같은 회사
- 대부분 **무료** (일부 Pro tier)
- TradingView library 기반 charting
- API도 제공 (Python/Node.js)
- Real-time 데이터 10회/초 업데이트

### 2.2 제공 기능 (구체적 지표 list)

**Futures (Velo가 가장 강한 곳)**:
- BTC / ETH Volume
- **BTC Open Interest Snapshot** (여러 거래소 합산)
- **BTC Funding Rate** (모든 거래소 비교)
- BTC Price
- **BTC CVD Dollars** (Cumulative Volume Delta, 달러 단위)
- **BTC 3-Month Annualized Basis** (futures/spot basis, 핵심 지표)
- BTC Cumulative Return By Session
- BTC 1m Average Return By Hour
- BTC Liquidations

**Options**:
- BTC / ETH Volatility (DVOL)
- Options Volume
- Deribit 기반

**Spot Taker CVD**:
- `buy_dollar_volume - sell_dollar_volume` cumulative
- 여러 exchange aggregation (Coinbase, Binance, Bybit-spot 등)
- 90-day rolling available

**Market**:
- CME 데이터 지원
- 거래소별 netflow

### 2.3 Velo의 강점

1. **무료**. 경쟁력 있는 가격
2. **데이터 granularity**: 10Hz, 1m resolution
3. **API + Python/Node SDK** — 퀀트 유저 친화
4. **Cross-exchange aggregation** — Binance + Bybit + Coinbase + OKX 한 번에
5. **3-month annualized basis** — 이걸 깔끔하게 주는 곳 드묾
6. **customizable chart** (TradingView 기반)

### 2.4 Velo의 약점

1. **해석 없음** — 순수 raw data만
2. **검색 없음** — "OI spike 있는 심볼" 같은 screener 약함
3. **alert 약함** — 기본 TV alert만
4. **저장/ledger 없음**
5. **UI가 pro-oriented** — 복잡, 학습 곡선 있음
6. **pattern 개념 없음**
7. **모바일 약함**

### 2.5 Velo vs Cogochi

| 축 | Velo | Cogochi |
|---|---|---|
| Primary value | Raw 지표 제공 | Pattern 저장/검색 |
| Who uses | Quant + advanced trader | Discretionary pattern trader |
| Output | Data, chart | Verdict, similar cases |
| Price | $0 + API tier | $29+ |
| Overlap | **Feature snapshot의 입력 데이터** | — |

Cogochi는 Velo를 **대체하지 않는다**. Velo가 제공하는 metric들(CVD, OI, funding, basis)을 **소비해서 pattern으로 조립**한다. P0 유저는 둘 다 쓸 가능성 높음.

### 2.6 우리가 배울 점

- **API + SDK 필수** (P2 유저 유입)
- **Cross-exchange aggregation** — 우리도 Binance + Bybit + OKX 지원 필요
- **Basis (annualized) 지표** — 우리 feature set에 추가 고려
- **Real-time resolution** — 15m scan cycle 지켜야 함

---

## 3. CoinGlass — 기능 단위 분석

### 3.1 Free Tier 실제로 뭐가 있나

- Funding rate (all exchanges)
- Open Interest (all exchanges)
- Long/Short ratio
- Liquidation 데이터 (basic)
- ETF flows
- Order book depth (aggregated)
- Fear & Greed Index
- Cycle models (AHR999, S2F)
- Exchange balance changes
- Whale alerts

### 3.2 Premium $12/mo (Prime)

- **Enhanced Liquidation Heatmap** (Model 1, 2, 3)
- Automatic data refresh
- All coins 접근 (free는 제한)
- 6-month, 12-month, 24-month+ time ranges
- Historical data 확장

### 3.3 API Tiers

- Hobbyist: 제한적, daily data
- Standard: commercial use 가능
- Professional: hourly data 720 days back, chat support
- Enterprise: tick-level

각 tier는 대략 $29-599/mo range [estimate based on competitor reports]

### 3.4 CoinGlass의 unique 기능들

- **Liquidation Heatmap (signature)** — 레버리지 position 클러스터 시각화
- **Options Max Pain** — options 만기 가격
- **BTC Dominance**
- **Bitcoin vs M2 Growth** — macro indicator
- **ETF net inflow / AUM history** (BTC, ETH)
- **Hyperliquid whale positions** (350k+ addresses)
- **Proof-of-Reserves (PoR) analysis**
- **Large on-chain transfers** (Whale Alert)
- **Footprint charts** (tick-level)
- **Cumulative Volume Delta (CVD / Aggregated CVD)**
- **L2/L3 Order Book snapshots**

### 3.5 CoinGlass가 **안 하는** 것

- Pattern 저장
- 패턴 이름 붙이기
- Similar pattern 검색
- User verdict / judgment
- Sequence 추적
- Personal customization beyond watchlist

### 3.6 대응

CoinGlass의 **데이터는 소비**. 우리는 그 데이터 위에 pattern layer.

실제로 P0 유저는:
- CoinGlass/Velo에서 "지금 funding 과열이네"
- Cogochi에서 "이거 TRADOOR 패턴 진행 중 → 유사 사례 검색 → 판정"

두 제품이 동시에 열려 있을 가능성 높음.

---

## 4. Hyblock Capital — 기능 단위 분석

### 4.1 Tiers

- **Basic** (free with trading volume requirement)
- **Advanced** ($1M/mo trading volume → free, otherwise ~$50-80/mo)
- **Professional** ($6M/mo trading volume → free, otherwise ~$100-200/mo)

Trading volume 기준으로 free access 제공하는 독특한 모델.

### 4.2 기능 (pro tier 기준)

**Liquidation 관련 (signature)**:
- **Liquidation Heatmap** (2-year lookback)
- **Liquidation Levels** — 레버리지 정확한 청산 가격 예측
- **Liquidity Heatmap** — bid/ask density
- **Liquidation Map** — magnetic zones

**Sentiment**:
- **Long/Short ratio** (retail vs pro)
- **Smart money** (일부 exchange에서 상위 trader position)
- **COT-like data** (commercial vs speculative)

**Order flow**:
- **Orderbook imbalance**
- **Sentiment bars**

**Screener**:
- Coin screener
- Condition 기반 filtering
- Alert 구성 가능

**Backtester**:
- 기본 backtest (limited)
- Custom indicator rule

### 4.3 TradingView integration

- Pine Script indicator로 hyblock 지표 임베드 가능
- 별도 terminal 있지만 TV 사용자 대응

### 4.4 Hyblock의 unique

- **Liquidation level precision** — 다른 데보다 세밀
- **Exchange-specific filter** (Binance, Bybit, Bitmex 별도 view)
- **2-year historical lookback** (Advanced tier)
- **Discord community**
- **Custom dashboards** (components arrangement)

### 4.5 Hyblock이 **안 하는** 것

- Pattern object 개념
- Sequence tracking
- Verdict ledger
- AI layer (거의 없음)
- Natural language query
- Team workspace
- Pattern search

### 4.6 우리 vs Hyblock

| 축 | Hyblock | Cogochi |
|---|---|---|
| Core value | 정확한 청산 레벨 | Pattern 검색 + 판정 |
| User type | Pro scalper | Pattern researcher |
| Time horizon | 초단기 (분 단위) | 중기 (시간-일 단위) |
| Data ownership | 본인이 order flow 수집 | External + derived |
| Price | $50-200 | $29-199 |

직접 경쟁 아님. 보완재. Hyblock 유저 중 "복기"하는 subset이 Cogochi의 Primary candidate.

---

## 5. Coinalyze — 보조 경쟁사

### 5.1 포지션

- "Crypto futures screener" 슬로건
- 무료 tier 강력
- 간단한 UI

### 5.2 기능

- Funding rate heatmap
- Open interest changes
- Long/short ratio
- Volume + OI delta
- Basic backtesting
- Exchange comparison

### 5.3 Pricing (추정 [estimate])

- Free tier: 기본 screener
- Premium: $20-30/mo 추정 (historical + alert)

### 5.4 대응

- 빠른 screener + 저가형 — 우리 taret이 아님
- P0 유저가 Coinalyze → Cogochi로 upgrade할 수 있음

---

## 6. Laevitas — Options 전문

### 6.1 포지션

- Options analytics 특화
- Deribit 데이터 중심
- Institutional-leaning

### 6.2 기능

- Options volume / OI
- IV (implied vol) surfaces
- Greeks aggregation
- Put/call ratio
- Skew
- Block trades

### 6.3 Pricing

- Free + Pro tier ($100-200/mo) [estimate]

### 6.4 대응

- Options 전문 — Cogochi는 perp 중심이라 직접 경쟁 아님
- Phase 3에서 options signal 추가 시 참조

---

## 7. Surf.ai — Re-deep dive

### 7.1 실제 기능 list

- **Chat interface** (primary)
- **Multi-agent research**
  - Social sentiment agent
  - Search agent
  - On-chain data agent
- **Proprietary model** (Cyber AI, fine-tuned on crypto)
- **Structured reports** with sources
- **90+ endpoints** via surf CLI
  - Market (price, indicators, fear&greed, liquidation)
  - Exchange (order book, candles, funding, L/S)
  - Wallet (balances, DeFi positions, net worth)
  - Social (Twitter profiles, sentiment, mindshare)
  - Token (holders, DEX trades, unlocks)
  - Project (DeFi TVL, protocol metrics)
  - Prediction markets (Polymarket, Kalshi)
  - On-chain SQL queries
  - News & web fetch

### 7.2 Execution beta

- **Natural language trade execution**
- "Swap 1.5 ETH for [token] on Base via Uniswap"
- Human-in-the-loop confirmation
- DEX only (CEX 연결 없음 알려진 바 없음)

### 7.3 Tiers

- Free: 하루 몇 queries 제한
- Paid: $15 / $49 / $99 / $399 tiers [details not public]
- Enterprise: dedicated infra + security

### 7.4 Surf vs Cogochi — detailed diff

| 기능 | Surf | Cogochi |
|---|---|---|
| Chart save | ❌ | ✅ core |
| Pattern object | ❌ | ✅ core |
| Sequence matching | ❌ | ✅ moat |
| Similar past cases | Basic (from research) | ✅ core |
| Verdict ledger | ❌ | ✅ moat |
| Personal variants | ❌ | ✅ |
| Natural language Q&A | ✅ strong | Partial (via parser) |
| On-chain data | ✅ broad | Limited |
| Social sentiment | ✅ | ❌ |
| Trade execution | ✅ (DEX) | ❌ (out of scope) |
| Market research reports | ✅ | ❌ |
| API | ✅ | P2 |
| Team workspace | ❌ | P1 |
| Derivatives deep dive | Limited | ✅ core |
| Phase tracking | ❌ | ✅ core |
| OI/funding structural analysis | Basic | ✅ core |

### 7.5 중첩 구간 (조심)

- Surf도 "crypto insights" 탭에서 비슷한 코인 제안
- 하지만 **feature vector similarity 기반**, sequence 아님
- 우리 sequence matcher가 작동하는 순간 차별화 선명해짐

### 7.6 기회

Surf는 "chat"이 주. 많은 P0가 **pattern workflow**를 chat으로 풀 수 없음을 곧 인식. 그때 Cogochi가 대안.

---

## 8. TradingView — 심층 (보완재)

### 8.1 경쟁 아닌 이유

- Charting tool — 우리는 chart 위에 pattern layer
- 90%의 P0 유저가 TV 이미 사용
- 월 $15-60, 별도 budget

### 8.2 우리가 배울 것

- **Pine Script ecosystem** — indicator 공유 문화
- **Alert system** 성숙
- **Social layer** — idea 공유, 하지만 quality 낮음
- **Watchlist** UI 표준

### 8.3 TV와의 integration 전략

- TV Lightweight Charts를 base로 사용 (이미 design에 포함)
- Pine Script export (P2): 우리 pattern → Pine code
- TV deep-link: 우리 capture → TV chart open
- Pine Script custom indicator: 우리 signal을 TV에서 볼 수 있게 (marketing)

---

## 9. TrendSpider — crypto 측면

### 9.1 Crypto 커버리지 범위

- Bitcoin, Ethereum, major altcoins (~30 coins)
- **Perp 지원 약함** — spot focused
- Backtesting: 가능하지만 crypto-specific feature 없음
- AI Strategy Lab: model 학습 가능 (generic)

### 9.2 crypto에 부족한 것

- OI / funding / liquidation 지표 없음
- Exchange-specific data 약함
- Derivatives-specific pattern library 없음

### 9.3 결론

TrendSpider는 stock-first. Crypto는 addendum. P0는 주 타겟 아님.

---

## 10. Telegram Bot Signals

### 10.1 실제 형태

- 개인 trader가 Telegram channel로 alert 배포
- Python/Go scraper → threshold rule → post
- $20-100/mo 구독, 채널마다 다름
- 예: "BTC RSI 80+ on 1h", "OI spike +15% in 15m"

### 10.2 왜 인기 있나

- **저비용** ($20-50)
- **Crypto native 감성** (Telegram이 영토)
- **Personalization** — 운영자와 직접 대화
- **Community** — 같은 패턴 보는 동료

### 10.3 약점

- **Accountability 없음** — hit rate 조작 가능
- **검색 없음** — 과거 alert 찾기 힘듦
- **Reproducibility 없음** — rule이 운영자 머릿속
- **Trust issue** — 계정 먹튀 빈번

### 10.4 Cogochi와 관계

- **대체하지 않음** — 우리는 Telegram으로 alert 내보낼 수 있음
- P0 유저는 Cogochi에서 personal variant 만들고, Telegram으로 팀에 공유
- Telegram bot 운영자들을 Cogochi의 **power user**로 끌어오는 게 전략

---

## 11. 전체 기능 대차 대조표

| 기능 | CoinGlass | Hyblock | Velo | TrendSpider | Surf | Cogochi |
|---|---|---|---|---|---|---|
| **DATA** |
| OI (cross-exchange) | ★★★★★ | ★★★★ | ★★★★★ | ★★ | ★★★ | ★★★ (consume) |
| Funding rate | ★★★★★ | ★★★★ | ★★★★★ | ★ | ★★★ | ★★★ (consume) |
| Liquidation heatmap | ★★★★★ | ★★★★★ | ★★ | ❌ | ★★ | ★★ (consume) |
| CVD | ★★★ | ★★★ | ★★★★★ | ❌ | ★★ | ★★ (consume) |
| L2/L3 orderbook | ★★★★ | ★★★★ | ★★★ | ❌ | ❌ | ❌ |
| Basis (annualized) | ★★★ | ★★ | ★★★★★ | ❌ | ★★ | ★★ |
| Options data | ★★★★ | ★★ | ★★★★ | ★★ (stock) | ★★★ | ❌ |
| On-chain | ★★★★ | ★ | ★ | ❌ | ★★★★★ | ❌ |
| ETF flows | ★★★★ | ❌ | ★★ | ❌ | ★★ | ❌ |
| **VISUALIZATION** |
| Charting | ★★★ | ★★★★ | ★★★★★ | ★★★★★ | ★★ | ★★★★ |
| Custom dashboard | ★★ | ★★★★★ | ★★★ | ★★★★ | ❌ | ★★★ |
| Multi-pane | ★★★ | ★★★★ | ★★★★ | ★★★★★ | ❌ | ★★★★★ |
| Phase overlay | ❌ | ❌ | ❌ | ❌ | ❌ | ★★★★★ |
| **SCAN/SEARCH** |
| Basic screener | ★★★ | ★★★★ | ★★ | ★★★★★ | ★★★ | ★★★★ |
| Pattern library | ❌ | ❌ | ❌ | ★★★★ (stock) | ★ | ★★★★★ |
| Sequence search | ❌ | ❌ | ❌ | ❌ | ❌ | ★★★★★ |
| Similar-to-capture | ❌ | ❌ | ❌ | ❌ | ★★ | ★★★★★ |
| **WORKFLOW** |
| Save/recall setup | ❌ | ❌ | ★★ (chart layouts) | ★★ (watchlist) | ❌ | ★★★★★ |
| Verdict ledger | ❌ | ❌ | ❌ | ❌ | ❌ | ★★★★★ |
| Personal threshold | ❌ | ❌ | ❌ | ★★★ | ❌ | ★★★★★ |
| Pattern candidate review | ❌ | ❌ | ❌ | ❌ | ❌ | ★★★★★ |
| **AI** |
| Natural lang query | ❌ | ❌ | ❌ | ★★★ (Sidekick) | ★★★★★ | ★★★ (parser) |
| LLM explanation | ❌ | ❌ | ❌ | ★★★ | ★★★★ | ★★★ |
| Auto-discovery | ❌ | ❌ | ❌ | ★★ | ★★ | P2 |
| **ALERTS** |
| Threshold alert | ★★★★ | ★★★★ | ★★ | ★★★★★ | ★★ | ★★★★ |
| Pattern transition alert | ❌ | ❌ | ❌ | ★★★ | ❌ | ★★★★★ |
| Telegram push | ★★★ | ★★ | ❌ | ❌ | ★★ | ★★★★ |
| **TEAM** |
| Workspace | ❌ | ❌ | ❌ | ❌ | ❌ | ★★★★ (P1) |
| Shared library | ❌ | ❌ | ❌ | ❌ | ❌ | ★★★★ (P1) |
| **API** |
| Public API | ★★★★★ | ★★ | ★★★★★ | ★★★ | ★★★★★ | P2 |
| SDK (Py/JS) | ★★ | ❌ | ★★★★★ | ❌ | ★★★★ | P2 |
| **PRICING** (monthly) |
| Free tier | Strong | Volume-based | Strong | ❌ | Weak | Strong |
| Entry paid | $12 | $50 | $0 (API $29+) | $89 | $15 | $29 |
| Pro | $29 (API) | $100 | $99 | $149 | $99 | $49 |
| Top | $599 | $200+ | Custom | $197 | $399 | $199 (team) |

---

## 12. 우리의 고유 4가지 (타사 0-1 ★만 있는 곳)

위 표에서 **우리만 5★이거나 경쟁사 ≤2★** 인 기능:

1. **Phase overlay on chart** — 아무도 안 함
2. **Sequence-based similar search** — 아무도 안 함
3. **Verdict ledger** — 아무도 안 함
4. **Personal variant with threshold override** — TrendSpider 일부만

이 4가지가 **moat의 기술적 기반**.

나머지 (chart, data, screener, alert)는 commodity — 경쟁사 수준으로만 맞추면 됨.

---

## 13. P0 유저의 stack — 예상 시나리오

### 13.1 현재 (Cogochi 출시 전)

```
$12  CoinGlass Premium   → funding, OI, liquidation, ETF
$50  Hyblock Advanced    → liquidation heatmap 정밀
$0   Velo free           → CVD, basis, cross-exchange agg
$60  TradingView Pro+    → charting, alert
$30  Telegram bot 1      → morning signal push
$20  Telegram bot 2      → OI alert
───────────────
$172/mo total
```

### 13.2 Cogochi 출시 후 (ideal)

```
$12  CoinGlass            → data (유지)
$50  Hyblock              → liq heatmap (유지, 단 P0 중 일부만)
$0   Velo                 → CVD/basis (유지)
$60  TradingView          → charting (유지)
$29  Cogochi Pro          → pattern memory + search + verdict
── 대체: Telegram bot 2개 (−$50)
───────────────
$151/mo total (−$21)
```

**핵심 제안**: "Telegram bot 끊고 Cogochi 써" 아니라 "spread 줄이고 verdict ledger 얻어".

### 13.3 Power user (Pro Plus)

```
... 위 + Cogochi Pro Plus ($79)
  - personal LoRA adapter
  - API access
  - 무제한 search
  - priority alert
```

---

## 14. Feature Gap Analysis — 우리가 **따라잡아야** 하는 것

P0 유저가 "기대하는 baseline"이지만 우리가 약한 부분.

| 기능 | Target parity | 누구만큼 | Priority |
|---|---|---|---|
| Cross-exchange OI aggregation | Binance + Bybit + OKX | Velo | **P0** |
| Basis (annualized) 계산 | 3m, 6m | Velo | **P0** |
| Liquidation level display | 기본 | Hyblock Basic | **P1** |
| Funding rate heatmap table | Top 30 symbols | CoinGlass | **P1** |
| Options data 지표 | IV, skew | Laevitas/Velo | **P2** |
| Pine Script export | 기본 | — | **P2** |
| Mobile app | iOS, Android | TradingView | **P2** (PWA 먼저) |
| Chart drawing tools | Basic lines, fibs | TradingView | **P1** |
| ETF flow 표시 | BTC, ETH ETF | CoinGlass | **P2** |
| On-chain 기본 지표 | exchange netflow | CoinGlass | **P2** |

---

## 15. Feature Gap — 우리가 **추격하지 않을** 것

| 기능 | 왜 추격 안 하나 |
|---|---|
| Liquidation heatmap precision | Hyblock의 moat, 복제 ROI 낮음 |
| On-chain deep dive | Surf/Nansen 영역 |
| Options analytics 깊이 | Laevitas 영역 |
| Social sentiment | Surf 영역 |
| News aggregation | The Block/CoinDesk 영역 |
| Max pain / Greeks | Laevitas 영역 |
| DEX execution | Surf 영역, regulatory risk |
| Tick-level order book | CoinGlass API 영역 |

소비하되 복제 안 함. API/integration으로 해결.

---

## 16. Pricing Arbitrage

P0 유저 지출 structure 분석:

```
Pain: 여러 서비스 합 $170+/mo, 서로 연결 안 됨
Gain if Cogochi: 
  - single source for pattern workflow ($29)
  - 기존 데이터 서비스는 유지 (필요한 것만)
  - Telegram bot 1-2개 대체 가능 (−$40)
```

순증 지출: $29 − $40 = **−$11/mo net savings**.

이게 왜 중요한가: Cogochi 가입이 **새 지출이 아니라 소폭 savings**로 felt 됨. 심리적 진입 장벽 낮음.

단, Cogochi 가치가 증명되면 Pro Plus ($79)로 upgrade → 순증 지출 발생.

---

## 17. Killer Comparison Statements

마케팅 메시지로 바로 쓸 수 있는 차별점 문장:

- "**CoinGlass shows you the data. Cogochi remembers what you did with it.**"
- "**Hyblock tells you where liquidation happens. Cogochi tells you if that liquidation was part of a pattern that worked.**"
- "**Velo gives you 90-day CVD. Cogochi gives you 90-day CVD + every time you said 'this setup matters' + whether it actually worked.**"
- "**TradingView is where you draw. Cogochi is where you remember what you drew.**"
- "**Surf answers 'what's happening now.' Cogochi answers 'have I seen this before?'**"
- "**Telegram bots send you signals. Cogochi lets you prove if they're signals or noise.**"

---

## 18. Defense Strategy — Per Competitor

### CoinGlass adds pattern library
- **Probability**: Low (institutional focus)
- **Timeline**: 24+ months
- **Response**: We consume CoinGlass data. They add a thin pattern layer, we have deep verdict moat.

### Hyblock adds AI + memory
- **Probability**: Medium
- **Timeline**: 12-18 months
- **Response**: Our sequence matcher is 18 months ahead. Verdict ledger headstart.

### Velo adds pattern workflow
- **Probability**: Low (data-focused team)
- **Timeline**: 24+ months
- **Response**: API integration, not replacement. Keep as data source.

### Surf adds pattern workflow
- **Probability**: **High** (they have funding + team)
- **Timeline**: 6-12 months
- **Response**: Our derivatives depth + team workspace. Chat ≠ pattern workflow UX.

### TrendSpider doubles down on crypto
- **Probability**: Low-medium
- **Timeline**: 12+ months
- **Response**: Perp/derivatives specialization. Stock codebase is liability for crypto UX.

### New YC startup direct-clones Cogochi
- **Probability**: **High** (6-12 months)
- **Timeline**: fast
- **Response**: First 200 P0 users locked in via team/shared library. 6-month discount contracts. Data moat = time.

---

## 19. Strategic Integrations (partners, not competitors)

### 19.1 데이터 in-source

- **Velo API** — CVD, basis, cross-exchange 빠른 확보
- **CoinGlass API** — liquidation, ETF, on-chain macro
- **Binance API** — perp raw data (free)
- **Bybit / OKX API** — multi-exchange (free)

### 19.2 알림 out-route

- **Telegram Bot API** — P1 마케팅 기회
- **Discord webhook** — community
- **Slack integration** (team tier)
- **Zapier / Make** (P2 power user)

### 19.3 Chart library

- **TradingView Lightweight Charts** — 이미 채택
- **Chart.js / D3** — panels

### 19.4 ML

- **Anthropic Claude** (parser)
- **OpenAI GPT-4** (fallback)
- **LightGBM** (ranker, self-hosted)

### 19.5 Infra

- **Stripe** (payment)
- **PostgreSQL** (core)
- **ClickHouse** (feature history, optional)
- **Vercel** (app-web)

---

## 20. 한 줄 결론

> **Velo/CoinGlass/Hyblock은 데이터. Surf은 chat. TrendSpider는 stock AI. 우리는 Pattern Research OS.**
>
> **P0 유저의 기존 stack을 **대체**하지 않고 **덧붙이는** 포지션. 기존 $170 지출에 $29 추가하되, Telegram bot 대체로 net savings.**
>
> **고유 4가지 moat: Phase overlay · Sequence search · Verdict ledger · Personal variant. 이 4가지가 아닌 곳에서는 parity만 맞춘다.**
