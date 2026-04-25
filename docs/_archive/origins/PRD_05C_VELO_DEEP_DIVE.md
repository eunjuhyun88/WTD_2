# 05C — Velo.xyz Deep Dive

**버전**: v1.0 (2026-04-25)
**상태**: canonical (supplements PRD_05B)
**데이터 소스**: docs.velo.xyz (live fetch 2026-04-25)
**의도**: Velo가 단순 데이터 사이트가 아니라 빠르게 풀스택 trading terminal로 진화 중. 정확히 뭘 갖고 있는지 파악해 우리 포지셔닝 방어선 재설정

---

## 0. 핵심 발견 (2026-04-25 기준)

이전 분석(PRD_05B)에서 Velo를 "free + API only data site"로 봤다. **틀렸다**. Velo는 지난 6-12개월 사이 4가지를 추가했다:

1. **유료 Trading 기능** — Bybit USDT perp 직접 주문, Hyperliquid 통합
2. **VeloAI** — 자연어 query interface (beta)
3. **HyperEVM Borrow/Lend** — DeFi lending 직접 연결 (Felix, Hyperlend, Hyperdrive)
4. **News API** — $129/mo 별도 tier, 실시간 WebSocket stream

가격 구조도 명확해졌다:
- **Web app 기본**: 무료 (대부분 features)
- **Data API**: **$199/mo** (3개월 history) 또는 **연간 결제** (full history)
- **News API**: **$129/mo** 별도 또는 data API 포함

이건 우리 포지셔닝에 영향을 준다. 자세한 분석 아래.

---

## 1. Velo 제품 구조 (정확)

### 1.1 사이트 구조

```
velo.xyz (web app)
├── /chart          → TradingView 기반 charting + table
├── /futures        → futures 전용 데이터 페이지
├── /options        → options 데이터 + Greek
├── /market         → 시장 전체 view (cross-coin)
├── /tradfi         → CME 데이터
├── /veloai         → 자연어 query (beta)
├── /trading        → Bybit/Hyperliquid 직접 거래
├── /borrow         → HyperEVM 대출 (Felix/Hyperlend/Hyperdrive)
└── /subscription   → API 키 발급 + 결제

docs.velo.xyz       → API 문서 (Python/Node.js/HTTP)
api.velo.xyz        → REST API endpoints
```

### 1.2 가격 구조 (확정)

| Tier | 가격 | 포함 |
|---|---|---|
| Free Web App | $0 | 모든 chart/table/market/options/tradfi/VeloAI |
| Data API (월간) | $199/mo | API 접근 + CSV download, **3개월 history** |
| Data API (연간) | (할인) | API + CSV, **full history (2021+)** |
| News API | $129/mo 별도 | News WebSocket stream + REST |
| Trading | (?) [unknown] | Bybit/Hyperliquid 직접 거래 |
| Borrow/Lend | (?) [unknown] | HyperEVM lending |

Trading + Borrow는 가격 명시 안 됨. 무료 가능성 (수수료 모델일 수도).

---

## 2. Web App 무료 기능 — 정확한 list

### 2.1 /chart 페이지

- **TradingView library 기반**
- 데이터 update: real-time, **5x per second**
- **최대 4 layout** 저장 (브라우저 sessions에 persist)
- Full screen 모드
- Symbol/timeframe seamless switching

**Table view** (chart 옆):
- Live price (Binance USDT perp default, Bybit USDT perp fallback)
- 24h / 1h / 10m / 7d 가격 변화 column
- Coin favorite/unfavorite
- **Watchlist 생성** (cross-device 저장)
- 정렬 + 필터

### 2.2 /futures 페이지 (코인별)

각 metric은 **per-exchange breakdown** 가능:

- **24h Volume** (dollar)
- **Open Interest Snapshot** (dollar, current)
- **Funding** (per 8h or annualized, historical)
- **Open Interest** (historical, dollar)
- **Price** (Binance USDT perp last)
- **Basis** (annualized, BTC/ETH coin-margined만)
- **Liquidations** (long/short, 시각적 분리)
- **Volume** (historical)
- **CVD** (dollar 또는 OI-normalized)
- **Average Return By Hour** (UTC)
- **Average Return By Day** (UTC)
- **Cumulative Return By Session** (US/EU/APAC, 8am-6pm 현지시간 기준)

### 2.3 /options 페이지 (Deribit 데이터)

**Main chart**: TradingView with DVOL + price overlay + volume

**6 Side panels**:

| Panel | 내용 |
|---|---|
| ATM Implied Volatility | 1w / 1m / 3m / 6m, 240s moving avg |
| 25 Delta Skew | (25Δ put IV − 25Δ call IV) / ATM IV, 표준화 |
| Active Options | 24h 가장 거래량 많은 6 contracts |
| Put/Call | Volume / OI (contracts) / OI Premium (USD) |
| Term Structure | 만기별 ATM IV + forward ATM IV |
| Spot-Vol Correlation | DVOL ↔ price 변화율의 trailing correlation |
| Term Structure Slope | 1m ATM IV − 6m ATM IV spread |

이건 **Laevitas 수준**의 options analytics 무료 제공.

### 2.4 /market 페이지 (cross-coin)

- **Price Changes** (cumulative %, multi-coin)
- **OI-Normalized CVD** (CVD ÷ aggregated OI, 각 코인 무비교 가능)
- **Funding Heatmap** (OI-weighted average across exchanges, 시간 evolution)
- **Liquidations Heatmap** (period별 liquidation count)
- **Open Interest Changes** (cumulative %)
- **Return Buckets** (히스토그램, 각 bucket에 어떤 코인 있는지 hover)
- **Market Volume** (전체 합산, exchange-grouped)
- **Total Open Interest** (전체 합산, exchange-grouped)
- **Watchlist filter** 가능 (custom 그룹)

이건 **Coinalyze와 CoinGlass 수준의 screener**를 제공한다.

### 2.5 /tradfi 페이지 (CME 데이터)

10:30pm ET에 daily update:

- **Open Interest** (futures + options, coin/dollar terms)
- **Volume** (futures + options)
- **Basis** (annualized, next-month CME futures vs Coinbase spot)

CME 데이터를 정리해서 보여주는 곳은 의외로 적음.

### 2.6 /veloai (자연어 interface, beta)

Example prompts:
- "What are the top performing coins this week?"
- "Which coins have a negative funding rate and a positive return today?"
- "Show me BTC open interest YTD"
- "Show me ARB and OP price"
- "Which coins have the most long liquidations this month?"
- "Which coins are up the most since BTC's low today?"
- "What are ETH IVs right now?"
- "Which coins have a market cap over $5B?"

특징:
- **Beta**, free
- UTC만 지원
- **No memory between messages** (매번 full query 필요)
- `!help [question]` 으로 misinterpretation 신고 가능

이건 **Surf의 chat interface와 유사 컨셉**. 다만 surf보다 narrow scope (Velo 자체 데이터 within).

---

## 3. Data API 상세 ($199/mo)

### 3.1 접근 방법

- **Python SDK** (`pip install velodata`)
- **NodeJS SDK** (`npm install velo-node`)
- **HTTP/curl** (REST)
- WebSocket (news stream만)

### 3.2 Endpoints

```
GET  /status                    → API 키 status
GET  /futures                   → 지원 futures list (no auth)
GET  /options                   → 지원 options list (no auth)
GET  /spot                      → 지원 spot pairs (no auth)
GET  /caps?coins=BTC,ETH        → market cap data
GET  /rows                      → 실제 시계열 데이터
```

`/rows` 파라미터:
- `type`: 'futures', 'options', 'spot'
- `exchanges, products, coins, columns`: comma separated
- `begin, end`: millisecond timestamp
- `resolution`: minutes (1, 5, 10, 60, ...) or string

**제한**: HTTP request당 22,500 values max.

### 3.3 Resolution

- **>= 1 minute**
- **Real-time updates 1x/sec** (where applicable)
- TradingView library를 사용하므로 internally smoothed

### 3.4 Columns (실제 사용 가능 데이터)

**Futures (30 columns)**:
```
open_price, high_price, low_price, close_price
coin_volume, dollar_volume
buy_trades, sell_trades, total_trades
buy_coin_volume, sell_coin_volume
buy_dollar_volume, sell_dollar_volume
coin_open_interest_high/low/close
dollar_open_interest_high/low/close
funding_rate, funding_rate_avg
premium
buy_liquidations, sell_liquidations
buy_liquidations_coin_volume, sell_liquidations_coin_volume
liquidations_coin_volume
buy_liquidations_dollar_volume, sell_liquidations_dollar_volume
liquidations_dollar_volume
```

**+ Special**: `3m_basis_ann` (BTC/ETH only, exchange/product 명시 없이 호출)

**Options (28 columns)**:
```
iv_1w, iv_1m, iv_3m, iv_6m
skew_1w, skew_1m, skew_3m, skew_6m
vega_coins, vega_dollars
call_delta_coins, call_delta_dollars
put_delta_coins, put_delta_dollars
gamma_coins, gamma_dollars
call_volume, call_premium, call_notional
put_volume, put_premium, put_notional
dollar_volume
dvol_open/high/low/close
index_price
```

**Spot (12 columns)**:
```
open_price, high_price, low_price, close_price
coin_volume, dollar_volume
buy_trades, sell_trades, total_trades
buy_coin_volume, sell_coin_volume
buy_dollar_volume, sell_dollar_volume
```

### 3.5 Exchanges 지원

확인된 것:
- `binance-futures`
- `bybit`
- `okex-swap` (OKX perp)
- `coinbase`
- `binance` (spot)
- `bybit-spot`
- `deribit` (options)
- CME (TradFi page)

### 3.6 History 한계

- 월간 결제: **3개월** lookback
- 연간 결제: **2021년부터 full history**
- 무료 web app: **2023년부터** (web에서 시각화 가능)

**핵심**: full history 원하면 **연간 결제** 강제. 이게 sticky factor.

### 3.7 News API ($129/mo 별도)

News object schema:
```json
{
  "id": 55,
  "time": 1704085200000,
  "effectiveTime": 1704085200000,
  "headline": "Hello world",
  "source": "Velo",
  "priority": 2,
  "coins": ["BTC"],
  "summary": "# Hello world",
  "link": "https://velodata.app"
}
```

특징:
- **WebSocket stream** (real-time)
- **Edit / Delete events** 지원 (correction 가능)
- **Priority 1 / 2** (긴급 vs 일반)
- Coin tagging
- Markdown summary

별도 service. data API 키와 함께 또는 단독 구매 가능.

---

## 4. Trading 기능 (유료, 가격 미공개)

### 4.1 지원 거래소

- **Bybit USDT perp futures** (실제 거래)
- **Hyperliquid** (manual API connection 필요)

### 4.2 Order types

확인된 것:
- Market
- Limit
- **TWAP** (Time-Weighted Average Price)
- **Limit Chase** (가격 따라가는 limit)
- Post-only
- Reduce-only
- TP/SL (take profit / stop loss)

### 4.3 기능

- **Multiple accounts** 추가 (계정 split)
- Sounds / notifications toggle
- Chart markers (자기 주문 표시)
- **Privacy mode** (잔고 가림)
- **Order Settings dropdown** — 모든 옵션 한 번에
- Buy/sell 버튼에 **expected execution price** (orderbook depth 고려)
- TWAP/limit chase의 max/min price 설정

### 4.4 미지원

- Hedge mode
- Portfolio margin

### 4.5 Hyperliquid manual connection

API wallet 생성 → main wallet 자금 분리 → Velo에서 거래
- 주요 보안 design — main wallet 자금 노출 안 함
- API wallet은 trading만 권한, withdrawal 불가

---

## 5. HyperEVM Borrow/Lend (NEW)

### 5.1 지원 protocols

| Protocol | 기반 | 특이사항 |
|---|---|---|
| **Felix Vanilla Markets** | Morpho Blue | Isolated positions, collateral yield 없음 |
| **Hyperlend** | Aave V3 fork | Shared collateral/borrow, supply yield 있음 |
| **Hyperdrive** | Custom (audited, not open-source) | Isolated, health factor 100-1000 scale |

### 5.2 Workflow

1. Hyperliquid 계정 추가
2. Wallet connect
3. Velo terminal에서 직접 borrow

### 5.3 이게 의미하는 것

Velo는 **데이터 사이트 → trading terminal → DeFi 통합 플랫폼**으로 진화 중.

Hyperliquid + HyperEVM 생태계에 깊이 연결. 이건 큰 베팅이고, 우리도 주시해야 함.

---

## 6. Velo의 강점 — 정확히 어디인가

### 6.1 데이터 강점

1. **Cross-exchange aggregation 깊이** — Binance + Bybit + OKX + Coinbase + Deribit 한 번에
2. **Options data 무료 제공** (DVOL, Greeks, IV surface, skew, term structure) — Laevitas는 유료
3. **CME 데이터 정리** — 흔치 않음
4. **OI-Normalized CVD** — 차별화 지표 (CVD를 OI로 정규화)
5. **Funding Heatmap (OI-weighted)** — heatmap 시간 evolution
6. **3-Month Annualized Basis** — BTC/ETH 자동 계산
7. **Cumulative Return By Session** (US/EU/APAC) — regime analysis 가능

### 6.2 UX 강점

1. **5Hz update** (chart)
2. **TradingView library** (익숙함)
3. **Watchlist + custom layout** (cross-device persist)
4. **VeloAI 자연어 interface** (free)
5. **CSV export** (API 사용자)

### 6.3 Trading 강점

1. **Multi-account 지원** (Bybit + Hyperliquid)
2. **Advanced order types** (TWAP, limit chase, post-only, reduce-only)
3. **DeFi 직접 통합** (HyperEVM borrow/lend)
4. **Privacy mode**

### 6.4 API 강점

1. **Python + NodeJS SDK** 정식 제공
2. **WebSocket news stream**
3. **Real-time + historical** 동일 endpoint
4. **CSV download** via webapp

---

## 7. Velo의 약점 — 우리가 파고들 지점

### 7.1 검색/저장 없음

- ❌ Pattern object 개념 없음
- ❌ "Save this setup" 같은 capture flow 없음
- ❌ Verdict ledger 없음
- ❌ Sequence-based search 없음
- ❌ "비슷한 case 찾아줘" 없음
- ❌ Personal threshold variant 없음

### 7.2 AI 한계

- VeloAI는 단순 자연어 → SQL/screener 변환
- **Memory 없음** (매 query 독립)
- **Pattern reasoning 없음**
- 자기 user history 학습 안 함
- "이 패턴 자주 본다" 같은 personalization 없음

### 7.3 워크플로 약점

- 차트 위에 phase overlay 없음
- 알림은 TradingView alert level (basic)
- Telegram/Discord push out 없음 (확인된 바)
- 팀 워크스페이스 없음
- Shared library 없음

### 7.4 가격 entry barrier

- Free tier 강력하지만 **API는 갑자기 $199/mo**
- Mid-tier 없음 — power user에게 부담
- **연간 결제 강제** (full history 원할 시)
- News API 별도 ($129) — bundle 약함

### 7.5 Asset coverage

- Spot 데이터는 BTC/ETH/major altcoin (~30-50)
- Long-tail coin coverage 제한적 [estimate]
- 신규 listing 즉각 cover X (확인 필요)

---

## 8. Velo vs Cogochi 정확 차이

| 축 | Velo | Cogochi |
|---|---|---|
| **Primary value** | Multi-exchange data + trading + DeFi | Pattern 저장/검색/판정 |
| **Data layer** | First-party aggregation | Consumer (CoinGlass/Velo/exchanges) |
| **Trading** | Bybit + Hyperliquid 직접 | ❌ (out of scope) |
| **AI** | VeloAI (NL → query) | Parser (NL → PatternDraft) |
| **Memory** | 4 chart layouts | Capture + verdict ledger |
| **Personalization** | Watchlist | Personal variants + verdict |
| **Sequence search** | ❌ | ✅ moat |
| **Pattern library** | ❌ | ✅ |
| **Team workspace** | ❌ | ✅ (P1) |
| **Price** | $0 web / $199 API | $29 Pro / $199 Team |
| **Target user** | Quant + active trader | Pattern researcher + team |
| **DeFi integration** | HyperEVM lending | ❌ (out of scope) |

---

## 9. 위협 평가 (재조정)

이전 PRD_05B에서 Velo를 **"low threat, partner"**로 봤다. **재평가** 필요.

### 9.1 단기 (6개월)

- Velo가 pattern workflow 추가? **확률 Low**
- 이유: Velo는 trading + DeFi에 베팅 중. Workflow ≠ trading focus

### 9.2 중기 (12-18개월)

- Velo가 자체 verdict / pattern library 추가? **확률 Medium-low**
- 이유: VeloAI를 확장하면 "save this query"는 자연스러운 다음 step
- 우리 대응: sequence matcher 6개월 내 ship → 18개월 lead

### 9.3 장기 (24+개월)

- Velo가 trading-centric pattern engine? **확률 Medium**
- 시나리오: Hyperliquid 트레이더 → Velo로 거래 → "이런 setup 다시 찾아줘" 요구 → Velo가 답
- 우리 대응: P0 lock-in (verdict ledger 데이터 moat), team plan으로 segment 나누기

### 9.4 가장 큰 위험

Velo가 **"trading 직접 가능 + 데이터 + AI"** 풀스택을 만들고, 우리가 **trading 안 함** 으로 attribution이 약해질 수 있음.

대응:
- **Trading은 분명히 out of scope** (regulatory + focus)
- 대신 **"Cogochi에서 분석 → Velo/Bybit/Binance에서 실행"** 명확한 메시지
- Save Setup → Velo trading deeplink (P2 integration)

---

## 10. 우리 위치 재정의

### 10.1 Velo 기준 차별화 statement

> **"Velo gives you 30 data columns and direct order execution. Cogochi gives you pattern memory across all your trades — what worked, what didn't, and what you might see again."**

### 10.2 Stack 재구성 (P0 유저)

이상적 stack:

```
┌─────────────────────────────────┐
│  Cogochi ($29-49)              │
│  - Pattern capture + search    │ ← 우리 영역
│  - Verdict ledger              │
│  - Personal variants           │
└─────────────────────────────────┘
              ↓ (deeplink)
┌─────────────────────────────────┐
│  Velo (free or $199)           │
│  - Multi-exchange data         │ ← 우리가 소비
│  - Options analytics           │
│  - Trading execution           │ ← 우리가 deeplink
└─────────────────────────────────┘
              ↓
┌─────────────────────────────────┐
│  Binance / Bybit / Hyperliquid │
│  - 실제 포지션 보유            │
└─────────────────────────────────┘
```

각 레이어가 **자기 강점**만 한다.

### 10.3 Cogochi → Velo Deeplink (P2 idea)

Save Setup 후 "Open in Velo" 버튼:
```
https://velo.xyz/chart?symbol=PTBUSDT&tf=15m&t=2026-04-25T10:00Z
```

이런 integration은 양방향 가치 (Velo 유저도 Cogochi 알게 됨).

---

## 11. Velo로부터 배울 것 (우리 product에 적용)

### 11.1 가져올 것

1. **Multi-exchange aggregation 깊이** — Binance/Bybit/OKX 모두 cover
2. **Options Greeks 무료** — VC pitch에 강한 facade
3. **OI-Normalized CVD** — 차별화 derived feature
4. **Funding Heatmap (OI-weighted)** — 우리도 visualization 가능
5. **Cumulative Return By Session** — regime feature
6. **WebSocket news stream** — 우리 alert pipeline에 도움
7. **Privacy mode** — small but elegant UX
8. **CSV export** — power user retention

### 11.2 가져오지 않을 것

1. ❌ 자체 trading execution — regulatory + scope
2. ❌ DeFi lending — totally different product
3. ❌ Multi-account portfolio management — 별도 product line
4. ❌ TradingView library 전체 의존 — Lightweight Charts로 더 가볍게
5. ❌ $199 entry — 우리는 $29-49 mid-tier로 broad reach

---

## 12. 가격 전략 영향

### 12.1 Velo의 $199 API tier가 의미하는 것

- Quant + power user가 그 가격 지불
- 즉 **$200/mo crypto data spend**가 검증된 시장
- Cogochi Pro Plus ($79-99) 또는 Team ($199-499)도 viable

### 12.2 우리 가격 anchoring

- $0 (free) ← Velo web app
- $29 (Cogochi Pro) ← 새 가치 (pattern memory)
- $79 (Cogochi Pro Plus) ← Velo API 절반 가격 + pattern 가치
- $199 (Cogochi Team) ← Velo API와 동가, 팀 가치 추가
- $199 (Velo API)
- $400+ (Surf top tier)

우리가 anchor 잘 잡으면 **$29-79 sweet spot** 확보 가능.

### 12.3 Bundle 가능성

P3 idea:
- Cogochi Pro + Velo Data API bundle
- 단 협상 필요. Velo가 reseller 허용해야 함

---

## 13. 기술 인사이트 — 우리가 차용 가능

### 13.1 Data resolution

- Velo는 1m resolution 표준
- 우리도 1m + 5m + 15m + 1h + 4h tier (current spec과 일치)

### 13.2 OI-Normalized CVD 공식

```
oi_normalized_cvd = sum(buy_dollar_volume - sell_dollar_volume) / aggregated_oi
```

이걸 우리 feature에 추가:
```python
features['oi_normalized_cvd'] = (
    features['cvd_dollars'] / features['oi_aggregated_dollars']
)
```

이건 **세력 진입의 leverage 강도**를 표현. Pattern engine에 유용.

### 13.3 Cumulative Return By Session

Asian/EU/US session split — regime conditioning에 직접 활용:

```python
session_us  = bar.timestamp.between(8am, 6pm, NewYork)
session_eu  = bar.timestamp.between(8am, 6pm, Brussels)
session_apac = bar.timestamp.between(8am, 6pm, Seoul)

cumulative_return_us = ...
```

Pattern object에 `preferred_session` 필드 추가 가능.

### 13.4 News API integration (P1)

우리도 News WebSocket consumer:
- `news.priority == 1` → 모든 active pattern_runtime_state pause
- News + pattern 동시 발생 → confidence boost or invalidation
- News tagged coin → 그 코인의 phase reset

---

## 14. 경쟁 시나리오 재구성

### 14.1 Velo가 Pattern Workflow 추가 (재평가)

| Phase | 우리 대응 |
|---|---|
| 6개월 | sequence matcher GA, verdict ledger 500+ verdict |
| 12개월 | Team plan launch, design partner desks 확보 |
| 18개월 | personal variant + private library lock-in |
| 24개월 | Velo가 본격 진입해도 **데이터 moat 확보 완료** |

### 14.2 Cogochi가 Velo 영역 침범하지 않을 것

- Trading execution → ❌
- DeFi lending → ❌
- Multi-exchange data aggregation 1차 source → ❌ (consume only)
- Options analytics → ❌ (perp focus)

### 14.3 Coexistence 시나리오

P0 유저 stack:
```
Velo (free or $199)  → 데이터 + 거래
Cogochi ($29-79)     → 패턴 메모리 + 검색
Total: $29-298/mo
```

기존 stack ($170)과 비교:
- $29 추가 → 거의 동일 (CoinGlass + Hyblock + TradingView 일부 대체)
- $79 추가 → 약간 증가 (개인 variant + API)
- $298 → 증가 (둘 다 power user)

---

## 15. 한 줄 결론

> **Velo는 단순 데이터 사이트가 아니다. Multi-exchange 데이터 + options + AI + trading + DeFi의 풀스택 terminal로 진화 중. $199/mo API tier가 검증된 시장.**
>
> **우리는 Velo와 직접 경쟁하지 않는다. 우리는 Velo가 절대 만들 수 없는 것 — pattern 저장, sequence 검색, verdict ledger — 에 집중한다.**
>
> **이상적 P0 stack: Velo (free/data) + Cogochi (pattern memory) + Exchange (execution). 3-layer architecture.**

---

## 16. 즉시 적용 액션

### Design 측면

- [ ] Feature set에 `oi_normalized_cvd` 추가
- [ ] Feature set에 `session_us/eu/apac` 추가
- [ ] News WebSocket consumer architecture 검토 (P1)
- [ ] CSV export 기능 (P0 power user)

### Product 측면

- [ ] Cogochi → Velo deeplink 가능성 검토 (P2)
- [ ] "Cogochi for analysis, Velo for execution" messaging 추가
- [ ] Bundle 협상 가능성 (P2-P3)

### Marketing 측면

- [ ] "Velo gives you data. Cogochi gives you pattern memory." 메시지 라인
- [ ] Velo 사용자 대상 content (Velo 사용자가 Cogochi 어떻게 쓰는지)
- [ ] Velo와 직접 비교 페이지 (/compare/velo)

### 모니터링

- [ ] Velo의 다음 feature release 추적 (특히 pattern/save/AI 진화)
- [ ] VeloAI capability 변화 monthly check
- [ ] Velo Trading 가격 공개 시점
- [ ] Velo 신규 fundraising / hire 동향
