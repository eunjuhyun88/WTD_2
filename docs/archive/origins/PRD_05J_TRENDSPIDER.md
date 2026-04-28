# 05J — TrendSpider Deep Dive (Crypto module 기준)

**버전**: v1.0 (2026-04-25)
**상태**: canonical (supplements PRD_05B)
**데이터 소스**: trendspider.com, StockBrokers/PropFirmShop/AI Trading Camp reviews 2026-Q1
**의도**: TrendSpider의 crypto module 정확 위치 파악. Stock-first 회사라 crypto는 secondary. 직접 위협 낮음 확인

---

## 0. 결론 먼저

TrendSpider는 **stock + ETF + futures + forex 우선, crypto는 add-on**이다.

핵심 fact:
- **2016년 설립**, 시카고. CEO Dan Ushman, CTO Ruslan Lagutin
- **20,000+ 트레이더** 사용 (자칭)
- **65,000+ assets** (US stocks, ETFs, forex, futures, crypto, indices)
- **190+ 기술 지표, 150+ 캔들 패턴**, **2,000 trendlines per chart 자동 감지**
- **50년 historical data** for backtesting

**Cogochi와의 관계**: 거의 위협 없음.

이유:
1. **Crypto coverage가 narrow** — major coins만, derivatives 데이터 약함
2. **OI / funding / liquidation / CVD 같은 derivatives 핵심 지표 약함**
3. **Stock-first codebase** — crypto-specific UX/feature 가속 어려움
4. **가격이 상대적으로 비쌈** ($59-149/mo annually)

다만 시사점:
- AI Strategy Lab의 ML 모델 학습은 우리 P3 reranker 영감
- Sidekick AI assistant은 우리 parser 컨셉과 비교
- "Pattern Recognition + Backtest + Bot" 풀 워크플로 모델 참고

---

## 1. 가격 구조

**4 tier** (yearly billing 기준):

| Plan | Yearly | Monthly | Workspaces | Alerts | AI bots | Backtest |
|---|---|---|---|---|---|---|
| **Standard** | **$59/mo** ($708/yr) | $89/mo | 5 | 10 (30-day) | 5 | Standard granularity |
| **Premium** | **$99/mo** ($1,188/yr) | $149/mo | 10 | 50 (90-day) | (more) | 1-minute |
| **Enhanced** | (?)/mo | (?) | 15 | 100 (180-day) | 50 | 1-minute |
| **Advanced** | (?)/mo | (?) | 20 | Maximum | Maximum | Maximum |

추가:
- **14-day full-access trial** at $19
- 30% discount codes 흔함 (LST30, PROP30 등)
- 1-on-1 training sessions (1-52 회, plan별)

**시사**: $59-99 annual은 **active trader 진심 가격**. 우리 $29 Pro의 ~2배.

---

## 2. AI 기능 3가지

### 2.1 AI-Powered Pattern Recognition

- 자동 trendline 감지 (chart당 최대 2,000개)
- Support/resistance levels
- Fibonacci retracements
- Multi-timeframe simultaneously
- 150+ candlestick pattern 인식
- **Subjectivity 제거** — algorithmic precision

### 2.2 Sidekick AI (LLM)

- TrendSpider 자체 데이터 학습
- 차트 분석, SEC 파일링 review, options flow 해석
- **Plain English query** → 결과
- 예: "stocks near their 200-day moving average"
- AI Coding Assistant: 자연어 → JavaScript indicator 코드 생성

### 2.3 AI Strategy Lab

- 사용자가 ML 모델 학습 (no-code)
- 4 모델 지원: **Naive Bayes, Logistic Regression, K-Nearest Neighbors, Random Forest**
- Variable selection: indicators, fundamentals, custom formulas
- 학습 후 backtest, alert, scan에 사용
- 깊은 ML 사용 — 우리 reranker design과 결이 비슷

---

## 3. 다른 핵심 기능

### 3.1 Charting

- **Raindrop Charts** (proprietary) — 가격 + volume distribution 결합
- Multi-timeframe layered overlay
- 220+ indicators (공식 자료에 따라 190+ 또는 220+)
- Auto support/resistance/Fibonacci

### 3.2 Backtesting

- **No-code engine**
- **50 years historical data** (stock 중심)
- 1-minute granularity (Premium+)
- Custom condition + multi-leg testing

### 3.3 Market Scanner

- Natural language query
- Real-time + historical
- "stocks near 200-day MA" 같은 plain English
- Watchlist 기반 batch scan (200+ symbols)

### 3.4 Trading Bots

- AI bot 생성 (no code)
- **SignalStack** broker bridge로 자동 주문
- 지원 broker: Interactive Brokers, E*TRADE, Robinhood, TradeStation, Tradovate, cTrader
- **Crypto broker integration 약함** [확인 필요]

### 3.5 Custom Indicators

- JavaScript 기반
- AI Coding Assistant로 자동 생성 가능
- Charts/scanners/backtests/bots에서 사용

---

## 4. Crypto Module — 정확 평가

### 4.1 지원 자산

- **Major cryptocurrencies** (Bitcoin, Ethereum, top altcoins)
- 정확한 ticker count는 **65,000 total assets 중 일부**
- [estimate: 30-100 crypto pairs]

### 4.2 Crypto에 부족한 것

- ❌ **Open Interest** (perp derivatives 핵심)
- ❌ **Funding rate**
- ❌ **Liquidation 데이터**
- ❌ **CVD (Cumulative Volume Delta)**
- ❌ **Long/Short ratio**
- ❌ **Cross-exchange aggregation** (CoinGlass/Velo가 강함)
- ❌ **Hyperliquid, BloFin 같은 crypto-native venue 약함**
- ❌ **DEX execution**

### 4.3 Crypto에 강한 것

- ✅ Spot 가격 차트 분석 (TradingView 수준)
- ✅ Pattern recognition + trendline (stock과 동일하게 적용)
- ✅ Backtesting (long/short 가능)
- ✅ AI Strategy Lab으로 crypto 모델 학습 가능
- ✅ 50년 데이터 — 다만 crypto 자체는 짧음 (BTC 2009-)

### 4.4 결론

TrendSpider crypto = **"stock 분석 도구로 crypto도 본다"** 수준. **Derivatives trader에게 부족**.

---

## 5. Cogochi vs TrendSpider

| 축 | TrendSpider | Cogochi |
|---|---|---|
| **Asset focus** | Stock + ETF + futures + forex (+crypto) | Crypto perp derivatives only |
| **Pattern library** | 150+ candlestick + auto trendline | OI/funding/liquidation/sequence pattern |
| **Pattern object** | Algorithmic detection (subjective trendline 자동화) | Save Setup + verdict |
| **Sequence search** | Backtest (history match) | ✅ moat (sequence-based similar) |
| **Verdict ledger** | ❌ | ✅ moat |
| **Personal variant** | Custom indicator | ✅ threshold override |
| **AI** | Sidekick + AI Strategy Lab + Coding Assistant | Parser + reranker (no chat) |
| **Backtest** | 50 years historical | Pattern verdict (different) |
| **Trade execution** | SignalStack bridge (stock broker) | ❌ |
| **Crypto derivatives data** | **약함** | **강함** (P0 focus) |
| **Price** | $59-99/mo | $29-79/mo |
| **Target user** | Stock systematic + swing trader | Crypto perp pattern researcher |

---

## 6. 위협 평가

### 6.1 TrendSpider crypto 강화?

**확률**: Low.

이유:
- Stock-first 9년 codebase
- US 주식 trader 전형 customer
- Crypto-native venue (Hyperliquid, BloFin) 통합 어려움
- Derivatives 데이터 (OI, funding) 추가 = 별도 인프라 + 데이터 계약 + UX

### 6.2 TrendSpider이 perp pattern engine 추가?

**확률**: Very low.
- Stock TA가 핵심 자산
- Crypto TA (price action)에 집중하면 그건 stock과 같음
- Perp-specific signal (OI 정규화, funding 변화율 등) = 새 영역

### 6.3 그럼에도 우리에게 미치는 영향

- **AI Strategy Lab** 같은 ML model 학습은 우리도 P3+에서 검토
- **Sidekick AI** 같은 chart-aware AI는 우리도 P2 features
- **Custom indicator JavaScript** UX는 우리 P3 idea (custom signal builder)
- **Trading bot bridge** 모델은 우리는 안 함 (out of scope)

---

## 7. 배울 점 / 차용 가능

### 7.1 ML model 4종 (P3+)

TrendSpider AI Strategy Lab 모델 list가 우리 reranker 옵션과 비교:

| 모델 | TrendSpider | Cogochi 후보 |
|---|---|---|
| Naive Bayes | ✅ | (sparse, 검토 가능) |
| Logistic Regression | ✅ | (baseline 후보) |
| K-Nearest Neighbors | ✅ | (sequence 비교 적용 가능) |
| Random Forest | ✅ | (P3+ 후보) |
| LightGBM | ❌ | ✅ (현재 design) |
| XGBoost | ❌ | (대안) |

**시사**: 우리가 LightGBM 골랐는데 TrendSpider는 더 단순 모델만. P3에서 우리가 "advanced ML로 차별화" 가능.

### 7.2 Raindrop Charts (proprietary)

- Volume + price 결합 새 chart type
- **Cogochi P2 idea**: Phase + price 결합 새 chart type ("Phase Chart")
  - 가격 위에 phase zone overlay
  - Phase transition을 마커로
  - 우리 unique 시각화

### 7.3 Natural language scanner

- "stocks near 200-day MA"
- **Cogochi 동일**: "BTC funding flip in last 24h" 같은 NL query
- 이미 우리 design에 parser 있음. P0에서 NL → search 적용 가능

### 7.4 14-day trial at $19

- 무료 trial 대신 **paid trial**
- "진심 사용자"만 통과
- Cogochi 채택 검토 가능 (Closed Beta에서 $14.50 같은 paid beta)

### 7.5 1-on-1 training sessions

- High-tier plan에 포함
- High-touch onboarding
- **Cogochi Pro Plus ($79+)** 차별화 가능 (1-on-1 setup call)

---

## 8. 기능 차용 우선순위

| Feature | TrendSpider | Cogochi 적용 | Priority |
|---|---|---|---|
| Auto trendline detection | ✅ | ❌ (perp focus와 다름) | Skip |
| AI Strategy Lab (ML) | ✅ | 우리도 reranker | P3+ enhance |
| Sidekick chart-aware AI | ✅ | Parser + visualizer | P2 |
| Natural language scan | ✅ | 우리 parser와 일치 | P0 (already) |
| Custom indicator (JS) | ✅ | Custom signal builder | P3 |
| Raindrop chart (proprietary) | ✅ | Phase chart (proprietary) | P2 (이미 design) |
| Multi-timeframe simultaneous | ✅ | Sequence analysis | P0 (already) |
| Pattern recognition (auto) | ✅ | Pattern catalog | P1+ |
| Backtest engine | ✅ | Verdict ledger (different) | Already covered |
| Trading bot | ✅ | ❌ out of scope | Skip |
| 1-on-1 training | ✅ | Pro Plus tier feature | P1 |
| Paid trial ($19) | ✅ | Closed Beta pricing | M3 |

---

## 9. 한 줄 결론

> **TrendSpider = stock-first AI 차트 분석 도구. Crypto는 secondary, derivatives 데이터 약함.**
>
> **위협 등급: Low. 확률 낮음 (stock codebase + retail US trader 전형).**
>
> **차용 가치: AI Strategy Lab의 ML model 다양성, Raindrop Charts 같은 proprietary 시각화 개념, 14-day paid trial 모델, 1-on-1 training upsell.**
>
> **결론: monitor 정도. 우리는 derivatives perp 영역 narrow vertical로 더 깊이 파면 됨.**
