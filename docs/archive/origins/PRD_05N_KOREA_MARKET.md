# 05N — 한국 시장 특화 도구 분석

**버전**: v1.0 (2026-04-25)
**상태**: canonical (supplements PRD_05B)
**데이터 소스**: cryptoquant.com, kimp.co.kr, upbit.com, scolkg.com, BeinCrypto KR, Pebblous 2026-Q1
**의도**: 한국이 우리 P0 우선 시장. 현지 도구 + 사용자 행태 + 진입 전략 결정

---

## 0. 결론 먼저

한국 시장은 Cogochi의 **우선 진입 시장**:

1. **CryptoQuant (한국 회사)** — 1M+ users, 150+ institutions, CME DataMine 등재. **가장 큰 토착 데이터 분석 회사**.
2. **김프 (Kimchi Premium) culture** — 한국 트레이더의 특수 관심사. 우리도 데이터 포인트로 추가 가능.
3. **Upbit/Bithumb** — 양대 국내 거래소. 원화 기반.
4. **TradingView 의존도 높음** — 거의 모든 한국 사이트가 TV chart 사용
5. **복기 문화 강함** — Telegram, Naver blog, Twitter에서 traded setup 공유 활발

**Cogochi 한국 진입 전략**:
- **CryptoQuant 데이터 통합** (또는 협력) — 한국에서 신뢰도 높음
- **김프/김치 프리미엄 indicator** 우리 feature에 추가
- **한국어 UI**부터 출시 (영어 먼저 X)
- **Naver/Telegram 커뮤니티** 진입

---

## 1. CryptoQuant — 가장 중요한 한국 회사

### 1.1 회사 정보

- **설립**: 2018-2019, Seoul
- **창업자**: Ki Young Ju (POSTECH 동문)
- **펀딩**: Hashed, SK Inc., Mirae Asset Capital — Seed round (대략 $10M 미만 [estimate])
- **언어**: **English + Korean** 동시 지원
- **타겟**: Global market (영어 위주)

### 1.2 Metrics

| Metric | Value |
|---|---|
| Individual users | **1M+** (자칭) |
| Institutional clients | **150+** |
| Monthly media citations | **10,000+** (Bloomberg, Forbes, Nasdaq) |
| Setup year | 2018-2019 |
| Notable: CME DataMine listing | **2022-07** (first/only on-chain provider) |

### 1.3 가격 구조 (확정)

| Tier | 가격 | 핵심 |
|---|---|---|
| **Free** | $0 | 일부 차트 |
| **Advanced** | ~$29/mo (annual) [estimate] | 더 많은 metrics |
| **Pro / Professional** | ~$99/mo [estimate] | full historical, alerts |
| **Enterprise** | Custom | API + dedicated |

[정확한 tier price 미공개; pricing 페이지 SPA로 fetch 어려움. 일반적 estimation]

### 1.4 핵심 기능 (7 categories)

1. **Exchange** — 거래소 reserves, 입출금 flow (signature feature)
2. **Miner** — 채굴자 활동, hash rate, 채굴자 wallet flow
3. **On-Chain Indicators** — wallet balances, realized cap, spent output, holder behavior
4. **Derivatives** — funding rate, OI, leverage, futures positioning
5. **Sentiment** — Coinbase Premium, **Korea Premium (Kimchi Premium)**, taker buy/sell
6. **Network** — hash rate, issuance, network activity
7. **Quicktake** — community 분석가 글 (verified authors)

### 1.5 Signature 강점

#### 1.5.1 Exchange Reserve Thesis

> "거래소 잔고 줄어들면 보유자가 cold storage로 이동 → bullish"
> "거래소 잔고 늘어나면 매도 압력 → bearish"

이 framework가 on-chain 분석의 표준. CryptoQuant이 brand로 만듦.

#### 1.5.2 Korea Premium (김치 프리미엄)

한국 거래소(Upbit, Bithumb) 가격이 글로벌 가격보다 얼마나 비싼지 측정.
- 평소 1-3%
- FOMO 시기 5-15%+
- **한국 retail FOMO indicator**로 글로벌에서도 사용됨

CryptoQuant이 이걸 **standardize한 metric**으로 만듦.

#### 1.5.3 Track record

- **Terra-Luna 붕괴 사전 경고** (2022)
- **FTX implosion 사전 경고** (2022)
- → "crypto의 early-warning system" 명성

### 1.6 약점 (우리 관점)

- ❌ Pattern object 개념 없음
- ❌ Sequence search 없음
- ❌ Verdict ledger 없음
- ❌ Personal variant 없음
- ❌ Phase tracking 없음
- ❌ Chart 위 overlay 약함 (data table 위주)
- ❌ Derivatives 영역은 secondary (on-chain이 primary)

### 1.7 Cogochi와의 관계

**카테고리 다름**:
- CryptoQuant = on-chain data analytics (Bloomberg of crypto)
- Cogochi = pattern memory OS for derivatives

**가능한 관계**:

#### Option A: 데이터 partner

- CryptoQuant API → Cogochi 백엔드
- On-chain feature 추가 (exchange flow, whale movement)
- 한국 시장 distribution 협력

#### Option B: Co-market

- "CryptoQuant for data + Cogochi for pattern memory"
- 한국 트레이더에게 함께 마케팅
- Bundle 가능성

#### Option C: 그냥 보완재

- 사용자가 둘 다 사용
- 직접 협력 없이 자연스러운 stack

**추천**: **Option C → A** 진화. M3-M6 트랙션 후 CryptoQuant에 partnership 제안.

---

## 2. 김프 (Kimchi Premium) Culture

### 2.1 김프란?

```
김프 = (한국 거래소 가격 / 글로벌 거래소 가격 - 1) × 100%
```

- 평시: 1-3%
- 강세장 FOMO: 5-15%
- 약세장 패닉: -3% to -5%

### 2.2 왜 중요한가

- **한국 retail sentiment indicator**
- 김프 spike → 한국 retail 진입 정점 (역지표)
- 김프 negative → 한국 매도 압력
- **derivatives에 직접 영향**: 글로벌 OI 증가 + 김프 양수 = 한국 retail까지 들어옴

### 2.3 김프 전용 사이트

| 사이트 | 특징 |
|---|---|
| **kimp.co.kr** | 김치프리미엄 전문 |
| **scolkg.com (Cryprice)** | 김프 + 글로벌 가격 비교, Telegram alert |
| **CryptoQuant Korea Premium chart** | 정식 metric |

이 모두 무료. **단순 가격 비교**.

### 2.4 Cogochi에서 김프 활용

**Feature 추가 (M3-M6)**:
- `kimp_pct`: 김치 프리미엄 (실시간)
- `kimp_pct_change_24h`: 김프 변화율
- Pattern signal에 `kimp_extreme_flag` 추가
  - +5% 이상 = retail FOMO peak
  - -3% 이하 = retail panic

**Pattern catalog**:
- "Kimp Reversal Pattern": 김프가 +10% spike 후 OI peak → 가격 reversal
- "Korea Squeeze": 김프가 글로벌 funding보다 빠르게 빠질 때 short opportunity

이건 **글로벌 도구에 없는 unique feature** + **한국 P0에 강력한 hook**.

---

## 3. Upbit / Bithumb — 국내 거래소 양대

### 3.1 시장 점유

- **Upbit** — 국내 거래량 1위, **원화 거래** 위주
- **Bithumb** — 2위, 원화 + USDT 일부

### 3.2 한국 거래소 특징

- **현물 (spot) 위주** — 원화 입금
- **퍼프 미지원** — 한국 규제로 derivatives 제한
- **API 제공** (제한적)
- **김프 측정 source**

### 3.3 한국 P0 트레이더 행동

```
Phase 1: 원화로 Upbit/Bithumb 매수 (현물)
Phase 2: 일부를 Binance/Bybit으로 transfer (USDT 변환)
Phase 3: 글로벌 거래소에서 derivatives trading
Phase 4: 김프 + 글로벌 데이터 동시 모니터
```

Cogochi 적용:
- **글로벌 거래소 (Binance, Bybit, OKX) primary**
- **김프 데이터 추가** (Upbit/Bithumb spot)
- 한국 P0의 "현물 + 글로벌 perp" workflow 통합

---

## 4. 한국 트레이더 커뮤니티

### 4.1 주요 plattform

| Platform | 사용 |
|---|---|
| **Telegram** | Signal channel, 분석 공유 (가장 활발) |
| **Naver blog** | 차트 분석 글 (TradingView 캡처 + 해설) |
| **Naver cafe** | 커뮤니티 토론 (Daum cafe 일부) |
| **Twitter/X** | 영어권 진출한 한국 트레이더 |
| **Discord** | 일부 그룹, Telegram만큼 활발하진 않음 |
| **YouTube** | "코인 차트 분석" 채널 다수 |

### 4.2 복기 문화

한국 트레이더의 **특이한 패턴**:
- **포지션 복기 글** 자주 (Naver blog, Telegram channel)
- **Win/loss 공개 인증** (스크린샷)
- **차트 + 코멘트** 결합 형식
- 영어권보다 **detailed reflection** 빈도 높음

이게 **Cogochi P0 페르소나의 source**.

### 4.3 Cogochi 마케팅 채널

**Phase 0-1 (M0-M3)**:
- Telegram 한국 채널 5-10개 ambassador 섭외
- Naver blog 인플루언서 4-8명 (블로그 제휴)
- Twitter @cogochi 한국어 + 영어 동시 운영
- 카카오톡 오픈채팅방 (alpha 사용자 그룹)

**Phase 1-2 (M3-M6)**:
- Naver blog SEO 콘텐츠 (한국어)
- YouTube 협업 (코인 차트 분석 채널)
- 한국 트레이딩 컨퍼런스 (KBW 등)

**Phase 2+ (M6+)**:
- KBW (Korea Blockchain Week) 부스
- 한국 거래소 (Upbit, Bithumb) 파트너십 검토
- 한국 VC pitch (Hashed, Mirae)

---

## 5. 글로벌 사이트 한국어 지원 vs 토착 사이트

### 5.1 한국어 지원 글로벌 사이트

| 사이트 | 한국어 | 비고 |
|---|---|---|
| TradingView | ✅ kr.tradingview.com | full localization |
| CoinGecko | ✅ | 한국어 menu |
| CoinMarketCap | ✅ | 한국어 menu |
| Investing.com | ✅ kr.investing.com | full localization |
| CryptoQuant | ✅ Korean | 한국 회사이므로 |
| Hyperliquid | ❌ | 한국어 미지원 |
| Velo | ❌ | 영어만 |
| CoinGlass | ✅ Chinese mostly | 한국어 partial |
| Surf | ❌ | 영어만 |

**시사**: Cogochi 한국어 우선 출시 시 **Hyperliquid, Velo, Surf와 차별화**.

### 5.2 토착 사이트

| 사이트 | 카테고리 | 평가 |
|---|---|---|
| kimp.co.kr | 김프 전문 | 무료, 단순 |
| scolkg.com (Cryprice) | 김프 + 가격 비교 | 무료, Telegram alert |
| CryptoQuant | On-chain data | premium, global |
| BeinCrypto Korea | 미디어 | 한국어 콘텐츠 |
| Bloomingbit | 미디어 (영어) | 한국발 글로벌 |

**Pattern memory OS**는 **없음**. → Cogochi가 이 영역 first mover.

---

## 6. 한국 P0 페르소나 보강

### 6.1 Jae 한국 버전

```
Jae (33), Seoul
- 본업: IT 회사 시니어 개발자
- 부수입: 코인 derivatives trading (3년차)
- 원화 자산: 5천만원-1억
- 거래 패턴:
  * 평일: 글로벌 perp (Binance/Bybit) 1-2 포지션
  * 주말: Naver blog에 복기 글 작성
- 사용 도구:
  * Upbit (원화 → USDT)
  * TradingView Pro ($60/mo)
  * CoinGlass Premium ($12/mo)
  * CryptoQuant Free tier
  * Telegram signal channel 1개 ($30/mo)
  * 김프 사이트 (kimp.co.kr) - 무료
- Total: ~$102/mo 도구 비용
```

### 6.2 Jae가 Cogochi에 끌릴 이유

1. **한국어 UI** — 다른 도구보다 편함
2. **김프 indicator 통합** — 따로 봐야 했던 데이터
3. **복기 자동화** — Naver blog 작성 시간 줄임
4. **CryptoQuant 데이터 같이** (협력 시) — 익숙한 데이터 source
5. **개인 패턴 라이브러리** — Naver blog는 souvenir, Cogochi는 검색 가능

### 6.3 Jae가 망설일 이유

1. **새 서비스 신뢰도** (한국 retail은 안전 선호)
2. **TradingView 같은 대기업 익숙** (대체 X, but 추가 도구로 인식)
3. **가격 부담** ($29/mo = 약 38,000원) — Naver blog 무료
4. **한국 카드 결제 지원?** (Stripe vs 토스/카카오 페이 등)

→ **대응**: 한국 결제 수단 (토스, 카카오 페이) M6+ 추가, 첫 결제 무료 trial.

---

## 7. 한국 시장 가격 전략

### 7.1 통화

- **Primary**: KRW + USD 동시 표시
- **결제**: USD (Stripe), 한국 카드 + 토스 + 카카오 페이 (M6+)

### 7.2 가격 환산 ($1 = 약 1,300 KRW [estimate, 2026])

| Tier | USD | KRW | 한국 retail 인식 |
|---|---|---|---|
| Free | $0 | 0원 | 진입 부담 없음 |
| Pro | $29 | 약 38,000원 | "월간 넷플릭스 + 약간" 수준 |
| Pro Plus | $79 | 약 103,000원 | "프리미엄 도구" — power user |
| Team | $199 | 약 259,000원 | "회사 자산 도구" |

**참고**: Naver Premium ($5), 카카오 멤버십 ($10), TradingView Pro+ ($60) — Cogochi $29는 **mid-range** 위치.

### 7.3 한국 specific promotion

- **첫 1개월 50% 할인** (Closed Beta)
- **연간 결제 25% 할인** (annual = $249, vs monthly $348)
- **친구 추천 1개월 무료** (양방)
- **KBW 참가자 할인 코드**

---

## 8. 위협 / 기회 평가

### 8.1 CryptoQuant이 pattern memory 추가?

**확률**: Low.
- CryptoQuant은 **data layer**에 집중
- Pattern engine은 vertical 다름
- 하지만 가능성 0 아님 → monitor

### 8.2 Bithumb/Upbit이 자체 분석 layer?

**확률**: Low.
- 거래소는 fee 위주
- Trading view 통합으로 충분 인식
- 하지만 **Bithumb이 작년 글로벌 market intelligence 개선 발표** → 주시

### 8.3 한국 startup이 Cogochi clone?

**확률**: Medium.
- 우리 traction 보이면 빠르게 따라올 수 있음
- 한국 VC (Hashed, Strong, etc.) funding 가능
- 대응: **first mover advantage + 한국어 brand awareness 빠르게 확보**

### 8.4 기회

- **CryptoQuant + Cogochi co-market** — 한국 시장 dominance
- **김프 + on-chain + perp pattern 통합** — unique offering
- **한국 거래소 파트너십** (M9+) — Upbit Pro 사용자에게 cross-promotion

---

## 9. 실행 우선순위 (한국 시장)

### Phase 0 (M0-M3): 한국 PMF 검증

1. **한국 P0 인터뷰 5-10명** (Telegram 추천)
2. **한국어 UI** mockup 동시 개발
3. **김프 데이터 통합** P0 feature에 추가
4. **CryptoQuant API trial** 신청
5. **Naver blog/Telegram ambassador 3-5명** 사전 섭외

### Phase 1 (M3-M6): 한국 Closed Beta

1. **한국 alpha user 30-50명** (전체 200 중 절반)
2. **한국어 marketing site**
3. **한국 결제 수단** 추가 (토스, 카카오 페이)
4. **김프 pattern catalog** 출시 (한국 unique)
5. **Twitter/X 한국어 운영**

### Phase 2 (M6-M9): 한국 Open Beta

1. **KBW 참가** (스폰서 또는 부스)
2. **한국 YouTube 협업**
3. **CryptoQuant partnership** 본격화
4. **Naver blog SEO** content 시리즈

### Phase 3 (M9+): 한국 GA

1. **한국 거래소 파트너십** 시도
2. **한국어 educational content**
3. **한국 quant fund/desk pitch**
4. **한국 VC pitch (Hashed, Mirae 등)**

---

## 10. 한 줄 결론

> **한국 시장은 Cogochi의 우선 진입 지역. CryptoQuant (가장 큰 토착) + 김프 culture + Telegram 복기 문화 = 우리 P0 페르소나의 source.**
>
> **결정**:
> - **한국어 UI 동시 출시**
> - **김프 indicator + CryptoQuant 데이터 통합**
> - **Naver/Telegram ambassador 마케팅**
> - **M9+ KBW 참가, 한국 거래소 파트너십, 한국 VC pitch**
>
> **목표**: 한국에서 **first 200 paying users + reference customer base** 확보 → 글로벌 expansion 발판.
