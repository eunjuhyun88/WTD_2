# 05D — CoinGlass Deep Dive

**버전**: v1.0 (2026-04-25)
**상태**: canonical (supplements PRD_05B)
**데이터 소스**: coinglass.com + reviews 2026-04-25

---

## 0. 핵심 정의

CoinGlass는 **derivatives data aggregator**다. Free tier가 압도적으로 강하고, 유료는 **Liquidation Heatmap의 정밀도와 lookback**을 위해 존재한다. Cogochi는 이걸 **데이터 소스**로 쓰지 **경쟁자**로 보지 않는다.

---

## 1. 가격 구조

| Tier | 가격 | 핵심 차이 |
|---|---|---|
| Free | $0 | 모든 기본 dashboard, 일부 lookback 제한 |
| **Prime** | $12/mo | Liquidation Heatmap (Model 1/2/3) + auto-refresh + 6/12/24m+ lookback |
| Plus | ~$29/mo [estimate] | 추가 advanced indicator |
| API Standard | ~$29/mo | Commercial API access, daily data |
| API Professional | ~$99/mo [estimate] | Hourly data, 720d lookback |
| API Enterprise | ~$599+/mo [estimate] | Tick-level, custom |

공식 pricing은 Prime $12만 명시. 다른 tier 가격은 SaaS reviews 기반 [estimate].

---

## 2. Free Tier 실제 기능 list

다음은 **돈 안 내고** 쓸 수 있는 것들. 광범위.

### 2.1 Futures (signature)

- **Open Interest** (cross-exchange aggregation, all coins)
- **Funding rate** (live + historical)
- **Long/Short Ratio** (per exchange: Binance, OKX, Bybit)
- **Liquidation data** (basic, by time + exchange + asset)
- **Liquidation Heatmap** (제한적 lookback, manual refresh)
- **24h Liquidation ticker** (실시간 large liquidations)

### 2.2 Premium Index / Basis

- **Premium Index** (per exchange — Binance, Coinbase, etc)
- **Basis** (futures vs spot, per exchange)
- **Cryptocurrency Futures Basis page**

### 2.3 Options

- **Max Pain** (BTC, ETH)
- **Put/Call Ratio**
- **Open Interest by Strike**
- **Options Volume**

### 2.4 ETF

- **BTC ETF flows** (daily inflows/outflows)
- **ETH ETF flows**
- **ETF Premium/Discount** (NAV vs price)
- **Total ETF AUM**

### 2.5 On-chain / Macro

- **Bitcoin indicators**: MVRV, NUPL, SOPR, Stock-to-Flow
- **Bitcoin vs M2 Growth**
- **Fear & Greed Index**
- **AHR999** (cycle model)
- **Exchange balance changes**
- **Whale Alerts** (large transfers)
- **Hyperliquid whale positions** (350k+ addresses tracked)
- **Proof-of-Reserves analysis**

### 2.6 Order Book

- **L2/L3 order book snapshots**
- **Order book depth aggregated**
- **Footprint charts** (tick-level on chart)
- **Aggregated CVD** (cross-exchange)

### 2.7 Tools

- **Funding rate heatmap** (top coins)
- **Coin screener** (basic filters)
- **Alert system** (basic threshold)
- **Crypto chart** (자체 charting)

이 정도 무료 제공이면 우리 P0 유저는 거의 모두 사용 중이라고 봐야 한다.

---

## 3. Prime ($12) 정확한 차이

### 3.1 강화되는 것

오직 **Liquidation Heatmap**:

- **Model 1, 2, 3** 전체 접근 (free는 Model 1만)
- **Automatic data refresh** (free는 manual reload 필요)
- **6-month, 12-month, 24-month+** 시간 범위
- **All coins** (free는 BTC/ETH 위주)

### 3.2 안 강화되는 것

대부분의 다른 기능은 free와 동일. Prime은 **liquidation analytics specialist tier**.

### 3.3 Cogochi 시사점

P0 유저 중 **scalping/short-term** 비중이 높은 사람만 Prime 가입. 우리는 직접 경쟁 안 함.

---

## 4. API Tiers

### 4.1 Hobbyist (free or low)

- Daily resolution
- 제한적 endpoints
- Personal use only

### 4.2 Standard (~$29/mo)

- Commercial use
- Hourly data
- 더 많은 endpoints
- Rate limit 완화

### 4.3 Professional (~$99/mo)

- **720 days historical**
- Hourly resolution
- Chat support
- 모든 endpoints
- Higher rate limit

### 4.4 Enterprise (~$599+)

- **Tick-level data**
- Real-time WebSocket
- Custom data delivery
- SLA
- Direct support

### 4.5 Cogochi 시사점

Slice 6 (search engine) 구현 시 **Standard tier 충분**. 향후 backfill을 위해 Professional 일시 구매 가능. Enterprise는 필요 없음.

---

## 5. 30+ Exchange 지원

CoinGlass의 진짜 강점.

### 5.1 Confirmed exchanges

- Binance / Binance Futures
- Bybit
- OKX / OKX Swap
- Bitget
- Kraken / Kraken Futures
- Coinbase
- Kucoin
- Gate.io
- BitMEX
- Deribit (options)
- dYdX
- CME (BTC futures)
- Hyperliquid (whale tracking)
- MEXC, HTX, Bitfinex 등

### 5.2 Cogochi 시사점

우리는 **Binance perp 우선**, Bybit/OKX 보조. CoinGlass의 30+ exchange를 모두 cover할 필요 없음 — 그건 commodity. 우리 가치는 **그 데이터 위에 무엇을 하는가**.

---

## 6. CoinGlass의 약점

### 6.1 Pattern memory 없음

- ❌ Save Setup 기능
- ❌ Pattern object 개념
- ❌ 사용자 verdict
- ❌ Sequence 추적
- ❌ "비슷한 거 찾아줘"

### 6.2 Personalization 약함

- Watchlist 정도가 끝
- 개인 threshold 설정 없음
- 학습 안 함

### 6.3 AI/NL interface 없음

- Surf, VeloAI 같은 자연어 query 없음
- Static dashboard 중심

### 6.4 Workflow 단편

- Alert → 행동 사이 연결 약함
- 복기 도구 0
- 팀 기능 없음

### 6.5 UI 복잡

- 페이지가 너무 많음
- 새 유저 onboarding 어려움
- Pro tier도 dashboard 자체가 복잡

---

## 7. CoinGlass 누가 쓰나

### 7.1 사용자 prof [estimate]

- **Active perpetual traders** (가장 큰 그룹)
- **Quants / researchers** (API tier)
- **Fund managers** (institutional API)
- **Crypto media / analysts** (publication 데이터 source)
- **Retail traders** (free tier만)

### 7.2 Brand trust

- Binance, Reuters, Fidelity International 같은 기관이 데이터 의존
- 7년+ 운영 (origin Bybt)
- Industry standard reference

---

## 8. CoinGlass vs Cogochi

| 축 | CoinGlass | Cogochi |
|---|---|---|
| **Primary purpose** | Data terminal | Pattern memory OS |
| **What you do here** | "지금 시장이 어때?" 확인 | "본 패턴 다시 찾기" |
| **Data ownership** | First-party aggregator | Consumer (CoinGlass + others) |
| **Liquidation analytics** | ★★★★★ (signature) | ★★ (consume) |
| **OI/Funding/L/S** | ★★★★★ | ★★★ |
| **ETF / On-chain** | ★★★★★ | ❌ (out of scope) |
| **Pattern object** | ❌ | ★★★★★ |
| **Sequence search** | ❌ | ★★★★★ |
| **Verdict ledger** | ❌ | ★★★★★ |
| **Personal variant** | ❌ | ★★★★★ |
| **AI NL interface** | ❌ | ★★★ (parser) |
| **Team workspace** | ❌ | ★★★★ (P1) |
| **Price** | $0 / $12 / $29-599 | $0 / $29-199 |
| **Target user** | Active trader | Pattern researcher |

---

## 9. 위협 분석

### 9.1 CoinGlass가 pattern engine 추가 확률

- 확률: **Low** (~15%, 24+ months) [estimate]
- 이유:
  - Institutional data 사업이 본업
  - UI 이미 복잡 → pattern workflow 추가는 redesign 필요
  - Engineering 우선순위가 데이터 확장
- 시그널 모니터링: 새 dashboard 출시, "save" 류 기능 등장

### 9.2 만일 추가하면

- Cogochi 대응:
  - Sequence matcher의 정밀도 차이 강조 (24+ months 학습 데이터)
  - Verdict ledger 데이터 moat
  - Team workspace 차별화

---

## 10. 협력 가능성

CoinGlass는 우리에게 **경쟁 아니라 데이터 source**다.

### 10.1 가능한 integration

- **API consumer** (Standard tier $29 → Slice 6 시작 시 가입)
- **Affiliate program** 가능성 (CoinGlass 트래픽 → Cogochi)
- **Data licensing** (uncertain, 보통 일방향)
- **Co-marketing** (uncertain)

### 10.2 Direct integration (P2)

- Cogochi capture → "Open in CoinGlass" deeplink
- CoinGlass alert → Cogochi capture (P2)

### 10.3 Risk

- API 가격 인상 가능성 → 자체 데이터 수집 백업 필요
- API rate limit → caching layer 중요

---

## 11. P0 유저의 CoinGlass 사용 방식

### 11.1 일반적 use case

- 매일 morning 체크: liquidation heatmap, OI changes
- 큰 movement 시: liquidation ticker
- ETF flow daily check (BTC/ETH 거래 시)
- Alt screener: funding rate extremes

### 11.2 Cogochi와 함께 쓰는 방식

```
07:00  CoinGlass에서 BTC liquidation heatmap → "$X 레벨이 magnet"
08:00  Cogochi에서 "BTC 비슷한 setup 과거 사례" → search
08:15  Cogochi state_view → 현재 phase + evidence
09:00  진입 결정
12:00  CoinGlass에서 liquidation 다시 체크
21:00  Cogochi verdict 입력
```

각 도구가 자기 강점만 활용.

---

## 12. 가격 anchoring 시사점

CoinGlass가 **$12 entry, $29 standard, $99 pro** 구조를 만든 게 시장 standard.

Cogochi 가격 비교:
- $0 free (CoinGlass와 동일)
- $29 Pro (CoinGlass Plus 수준, **가치 다름**)
- $79 Pro Plus (CoinGlass Pro 수준)
- $199 Team (CoinGlass enterprise 절반)

P0 유저 reaction 예상:
- $29: "CoinGlass 정도 가격" 친숙함
- $79: "Pro tool 정도" 합리적
- $199: "Team plan" 결정 필요

---

## 13. CoinGlass에서 차용할 것

### 13.1 Watchlist persistence

CoinGlass의 watchlist는 cross-device 저장. 우리도 같은 수준 구현 (이미 spec에 포함).

### 13.2 Funding rate heatmap

CoinGlass의 시각화는 표준. 우리도 채택 (`05_VISUALIZATION_ENGINE.md` flow_view).

### 13.3 Premium Index

각 거래소별 premium 모니터링 → 우리 feature에 추가:
```
features['binance_premium']
features['coinbase_premium']
features['cross_exchange_spread']
```

### 13.4 Bitcoin macro indicators

MVRV, NUPL 같은 cycle 지표를 우리 regime classifier에 입력 가능 (Phase 2).

---

## 14. 차용하지 않을 것

- ❌ ETF / On-chain dashboard (out of scope)
- ❌ Options analytics (perp focus)
- ❌ 30+ exchange 모두 cover (Binance + Bybit + OKX 충분)
- ❌ Tick-level data (resolution 1m+ 충분)
- ❌ Bitcoin macro indicators 직접 표시 (consume only, regime input)

---

## 15. 한 줄 결론

> **CoinGlass는 데이터의 표준. 우리는 데이터를 소비하고 그 위에 pattern memory를 만든다.**
> **위협 등급: Low. 협력 등급: High (API consumer).**
> **P0 유저는 CoinGlass + Cogochi 둘 다 쓴다. 두 도구가 자기 영역에서 잘하면 된다.**

---

## 16. 즉시 액션

### 16.1 데이터 source 확보

- [ ] CoinGlass API Standard tier 가입 ($29) — Slice 6 시작 전
- [ ] Backup: 직접 거래소 API (Binance, Bybit, OKX) — primary
- [ ] CoinGlass는 cross-exchange aggregation + ETF + on-chain only

### 16.2 Marketing positioning

- [ ] "Cogochi works alongside CoinGlass, not instead of"
- [ ] CoinGlass user 대상 onboarding 별도 (이미 익숙함 가정)

### 16.3 모니터링

- [ ] CoinGlass 신규 기능 monthly check
- [ ] Pattern/save 류 feature 등장 시 alert
- [ ] Prime tier 변경 (가격, 기능)
