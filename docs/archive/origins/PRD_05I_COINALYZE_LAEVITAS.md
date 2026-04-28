# 05I — Coinalyze + Laevitas Deep Dive (니치 전문 도구)

**버전**: v1.0 (2026-04-25)
**상태**: canonical (supplements PRD_05B)
**데이터 소스**: coinalyze.net, laevitas.ch + docs.laevitas.ch (live fetch 2026-04-25), Crunchbase, SaaS reviews
**의도**: 두 니치 전문 도구. 직접 경쟁 아니지만 **데이터 source 파트너 + 가격 anchor + 영역 분리** 결정 근거

---

## 0. 결론 먼저

두 도구 모두 **우리 직접 경쟁 아님**. 영역 분리:

- **Coinalyze** = "TradingView for derivatives" — 무료/저가 derivatives screener + custom metrics. 우리는 데이터 consumer 가능
- **Laevitas** = institutional options analytics 전문 — Greeks/IV/skew/term structure 깊이. 우리 perp focus와 영역 다름

다만 두 도구가 **시사하는 가격 anchor**:

| 도구 | Free | Premium | Enterprise |
|---|---|---|---|
| Coinalyze | 핵심 무료 | (premium 일부) | API |
| Laevitas | 시도용 free | **$50/mo** | **$500/mo** |
| Cogochi 목표 | Free (5 captures) | **$29 Pro** | **$199 Team** |

Laevitas의 $50/$500은 **institutional spec 가격**. 우리 $29/$199는 그 사이 sweet spot.

---

## 1. Coinalyze — 분석

### 1.1 정체성

- **출시**: 2017
- **포지션**: "TradingView for crypto derivatives screener"
- **자체 설명**: "professional traders analytics platform"

### 1.2 가격 구조

- **Free tier**: 핵심 기능 무료
- **API**: ~10 free endpoints, key 발급
- **Premium**: 일부 기능 유료 ([estimate, exact tier 미공개])
- **No login required** for basic data

### 1.3 핵심 기능

**Coverage**:
- **300+ tickers** (Bitcoin, Ethereum, Solana, Ordinals, Pepe, Bonk, 더 많음)
- **40+ exchanges** aggregated
- **Spot + Perp + Futures**

**Indicators (TradingView 기반)**:
- Open Interest (aggregated 또는 per-exchange)
- Funding Rate (현재 + 예측)
- Liquidations
- Volume + OI delta
- CVD
- Long/Short ratio
- Buy vs Sell Volume / Count (커스텀 indicator)
- 52-week high/low, average price

**Custom metrics** (signature feature):
- 사용자가 데이터 stream 결합 → 자기 공식 만듦
- 예: `(OI_change + funding_rate) * volume`
- 차트로 시각화

**Global Charts**:
- 모든 코인 합산 OI / Funding / Liquidation / CVD
- 매크로 ecosystem trend 분석

**Free indicators that TradingView paid only**:
- VPVR (Volume Profile Visible Range)

### 1.4 API

- **10 endpoints**
- **무료** (key 발급 필요)
- Rate limit [unknown 정확한 수치]
- 주요 endpoint: prices, OI, funding, liquidations, candles

### 1.5 Coinalyze가 **안** 하는 것

- ❌ Pattern object / save
- ❌ Verdict ledger
- ❌ Sequence search
- ❌ Personal variant
- ❌ AI layer
- ❌ News / social
- ❌ Options Greeks (Laevitas 영역)
- ❌ On-chain (Surf 영역)
- ❌ Trading execution

### 1.6 Cogochi와 관계

**관계**: 데이터 source 후보. 직접 경쟁 아님.

**시사점**:
- Coinalyze의 free + 광범위 ticker coverage가 모범
- Custom metric creation은 우리 P3 idea로 차용 가능
- TradingView library 기반은 우리 design (Lightweight Charts)와 일관

**활용 가능성**:
- Coinalyze API → Cogochi 백엔드 보조 데이터 source
- 단, primary는 직접 거래소 API + Velo. Coinalyze는 fallback

---

## 2. Laevitas — 분석

### 2.1 정체성

- **출시**: 2020
- **본사**: Singapore
- **펀딩**: Seed (Crunchbase, [exact amount unknown])
- **포지션**: "Institutional-grade derivatives data without the spread"
- **타겟**: trading desks, analysts, institutions

### 2.2 가격 구조 (확정)

| Tier | 가격 | 포함 |
|---|---|---|
| **Free** | $0 | core features try (limited) |
| **Premium** | **$50/mo** | More features, broader coverage |
| **Enterprise** | **$500/mo** | Advanced + priority support |

추가:
- **Pay-per-call API** via x402 (USDC) — no key, micropayments

### 2.3 Coverage

- **15+ exchanges**
- **1000+ assets**
- **Options** (signature): Deribit, Bybit, OKX, Coincall, Binance, Gate
- **Perpetual + Dated Futures**
- **Order books** (historical snapshots)
- **Recent**: WTI crude oil + gold options (Gate Options 통합 2026-04 기준)

### 2.4 핵심 기능 (Options 영역, 압도적)

**Option Chain**:
- Overview, Screener, Time and Sales
- Volume & OI, Flows
- Instrument Details
- Strategies builder

**Volatility (signature)**:
- ATM Implied Volatility (1w/1m/3m/6m, more granular)
- 25 Delta Skew + 10 Delta variants
- Risk Reversal (RR)
- Butterfly Spread (25Δ, 10Δ)
- IV Term Structure
- IV Term Structure Slope
- Volatility Smile
- Volatility Surface (3D)
- Realized vs Implied
- Volatility Cones

**Vol Monitor / Vol Run**:
- Real-time IV monitoring across coins
- IV regime change alerts

**GEX (Gamma Exposure)**:
- Dealer positioning estimation
- Strike clustering

**Tools**:
- **Backtester** — strangle/straddle 등 전략 backtest
- **Calculator** — theoretical value, Greeks, breakeven
- **Spread Analysis** — multi-leg strategy 평가
- **Model IV** — IV 모델링

### 2.5 Perp/Futures 영역 (보조)

- Funding rates
- Liquidations
- Basis (annualized)
- OI across venues
- Term structure
- Custom Dashboard
- Liquidations Heatmap

### 2.6 API + MCP (NEW 2026)

**REST/WebSocket API**:
- OHLCVT candles
- Funding rates, OI, liquidations
- Options Greeks
- 5 exchanges (Binance, Deribit, OKX, Bybit, Hyperliquid)

**MCP Server (signature)**:
- **20+ tools** for futures, perpetuals, options
- Claude / ChatGPT / any MCP client 직접 query
- "AI-native" 강조

**x402 USDC pay-per-call**:
- API key 없음
- Stablecoin micropayment 결제
- HTTP 402 protocol
- "pay only for what you use"

### 2.7 Laevitas가 **안** 하는 것

- ❌ Pattern object
- ❌ Verdict ledger
- ❌ Sequence search
- ❌ Personal variant
- ❌ Chat AI (MCP는 있지만 자체 chat 없음)
- ❌ Social / news
- ❌ Trading execution
- ❌ Mass-market UX (institutional-leaning)

### 2.8 Cogochi와 관계

**관계**: 영역 분리 명확. **Options 영역**만 깊이.

**Cogochi P0**: perp derivatives pattern (sparse options)
**Laevitas**: options analytics (sparse perp)

겹침 거의 없음.

**시사점**:
- $50 / $500 가격 anchor는 institutional-grade tools의 표준
- MCP server는 우리도 P3에서 차용 가능 (Cogochi MCP for AI agents)
- x402 pay-per-call은 흥미로운 distribution 방식 — Cogochi P3+ 검토

**활용 가능성**:
- Phase 3에서 options signal 추가 시 Laevitas API consumer
- 단 우리 P0 perp focus 유지하므로 P3 이전엔 skip

---

## 3. Coinalyze + Laevitas vs Cogochi (정확 비교)

| 축 | Coinalyze | Laevitas | Cogochi |
|---|---|---|---|
| **카테고리** | Free derivatives screener | Institutional options analytics | Pattern memory OS |
| **Asset focus** | Spot + Perp + Futures (broad) | Options (deep) + Perp | Perp derivatives only |
| **Tickers** | 300+ | 1000+ | 50-200 (P0 focus) |
| **Exchanges** | 40+ | 15+ | 3-5 (Binance, Bybit, OKX) |
| **Pattern library** | ❌ | ❌ | ✅ moat |
| **Sequence search** | ❌ | ❌ | ✅ moat |
| **Verdict ledger** | ❌ | ❌ | ✅ moat |
| **Custom metric** | ✅ (formula) | ❌ | P2 idea |
| **AI / Chat** | ❌ | MCP server only | parser (P0) |
| **Backtest** | Limited | Strategy backtester | Pattern verdict (different) |
| **Greeks / Options** | ❌ | ✅ deep | ❌ (P3+) |
| **Free tier** | 핵심 무료 | Try only | 5 captures, 20 searches/d |
| **Entry paid** | (unclear) | $50 | $29 |
| **Top tier** | API key | $500 | $199 (team) |
| **Target user** | Retail derivatives trader | Institutional options desk | Pattern researcher |

---

## 4. 위협 평가

### 4.1 Coinalyze가 pattern memory 추가?

**확률**: Low.
- 8년 derivatives screener focus
- TradingView library 기반 — pattern engine 추가 어려움
- Custom metric은 사용자가 만드는 것, 우리 sequence matcher와 다름

### 4.2 Laevitas가 perp pattern memory?

**확률**: Very low.
- Options 영역 깊이가 강점
- Institutional 타겟 — retail pattern memory와 다른 시장
- MCP 방향이 우리와 다름 (AI agent에 데이터 제공, 우리는 pattern memory)

### 4.3 둘이 합쳐서 위협?

❌ 카테고리 다름. 둘이 합쳐도 우리 영역 안 침범.

---

## 5. 배울 점

### 5.1 Custom metric creation (Coinalyze)

- 사용자가 데이터 stream 결합 → 자기 공식
- Cogochi P3 idea: "Custom signal" — 사용자가 phase enter condition 자체 정의
- 단, 학습 곡선 가파를 수 있음. P0에서는 hardcoded 기본 패턴만

### 5.2 Pay-per-call (Laevitas x402)

- API key 없음 + USDC micropayment
- "Pay only for what you use"
- Crypto-native 결제 — 우리 P0/P1엔 비효율 (구독 model 표준)
- **단 P3+ Cogochi API monetization 옵션으로 흥미로움**

### 5.3 MCP server

- Laevitas MCP = 20+ tools, AI agent client 직접 query
- Surf도 동일 (Surf Skill)
- **Cogochi MCP idea**: P3에서 우리 pattern engine을 AI agent에 노출
  - "Show me similar setups" tool
  - "What's the verdict on this pattern" tool
  - "Find OI reversals in BTC" tool

### 5.4 Granular tier (Laevitas Free / $50 / $500)

- 10x 차이 of pricing tier
- Free → Premium → Enterprise 전형
- **Cogochi 적용**: $0 / $29 / $199 (7x 차이) — 더 좁음

P0/P1 segment 명확하면 narrow tier가 좋음. Laevitas가 enterprise 타겟이라 wide tier 필요.

### 5.5 Volatility surface 시각화

- Laevitas 3D vol surface는 인상적
- Cogochi P3+ idea: phase progression의 3D 시각화 (time × symbol × confidence)

---

## 6. P0 유저 stack 재구성 (이 두 도구 추가)

```
Layer 1: Cogochi ($29-79)         ← Pattern memory + search
Layer 2: Surf ($19-49) [optional] ← Research
Layer 3: 데이터
   - Velo (free)                   ← Multi-exchange + CME
   - CoinGlass ($12)               ← Liquidation heatmap
   - Coinalyze (free)              ← Custom metric, broad screener
   - [Laevitas $50, options만]      ← Options Greeks (P0는 skip)
Layer 4: Insilico Terminal (free) ← Execution
   또는 Velo Trading
   또는 Exchange native
```

**P0 평균 monthly**: $29 (Cogochi) + $19 (Surf optional) + $12 (CG) = **$60/mo**.

Laevitas는 options trader만 (P0 small subset).

---

## 7. 영역 분리 명확화

이 분석으로 **Cogochi가 추격 안 하는 영역** 확정:

### 7.1 Coinalyze가 더 잘하는 것 (skip)

- 300+ ticker broad coverage
- Custom metric formula 생성
- 무료 + TradingView 통합

→ Cogochi P0/P1에서 추격 안 함. Coinalyze API consumer 가능.

### 7.2 Laevitas가 더 잘하는 것 (skip)

- Options Greeks 깊이
- IV surface / term structure / skew analysis
- GEX (gamma exposure)
- Strategy backtester (options multi-leg)
- Block trade analytics

→ Cogochi 영원히 추격 안 함. P3+에서 Laevitas API consumer 가능 시 데이터만 가져옴.

### 7.3 Cogochi만 하는 것 (focus)

- **Pattern object** (반복 가능한 setup의 명확한 정의)
- **Sequence-based similar search** (phase path 비교)
- **Verdict ledger** (사용자별 검증 history)
- **Personal variants** (threshold override)
- **Phase overlay on chart** (시각화 차별)

---

## 8. 한 줄 결론

> **Coinalyze = free derivatives screener (broad, custom metrics). Laevitas = institutional options analytics (deep Greeks, IV).**
>
> **둘 다 우리 직접 경쟁 아님. Coinalyze는 P3 데이터 fallback 후보. Laevitas는 우리가 perp focus 유지하므로 영역 분리.**
>
> **시사점: Laevitas $50/$500 = institutional spec 가격 anchor. Cogochi $29/$199 = retail/team spec 가격 anchor. 우리 가격 sweet spot.**
>
> **P3+ idea: Coinalyze custom metric + Laevitas MCP server pattern을 우리도 차용 (Cogochi MCP, custom signal builder).**
