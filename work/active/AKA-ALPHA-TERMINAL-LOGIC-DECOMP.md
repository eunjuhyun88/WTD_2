# 아카 Alpha Terminal v3.0 — 전체 로직 완전 분해

> 원본: `/Users/ej/Desktop/나혼자매매 Alpha Flow_by 아카.html`
> 추출일: 2026-04-19
> 이 문서는 JS 소스코드에서 직접 추출한 **정확한 수치**만 기록.
> 해석/의견 없음. WTD 구현 시 이 문서를 원본 스펙으로 사용.

---

## 시스템 개요

### 데이터 소스 (per symbol)
```
Binance FAPI:
  - 4H 캔들 150봉  (/fapi/v1/klines?interval=4h&limit=150)
  - 1H 캔들 100봉  (/fapi/v1/klines?interval=1h&limit=100)
  - 1D 캔들 100봉  (/fapi/v1/klines?interval=1d&limit=100)
  - premiumIndex    (/fapi/v1/premiumIndex) → fundingRate, markPrice
  - OI History      (/futures/data/openInterestHist?period=4h&limit=6)
  - L/S Ratio       (/futures/data/globalLongShortAccountRatio?period=4h&limit=4)
  - Taker Ratio     (/futures/data/takerlongshortRatio?period=4h&limit=6)
  - Order Book      (/fapi/v1/depth?limit=20) → top 15 levels 사용
  - Force Orders    (/fapi/v1/forceOrders?limit=50) → 최근 1H 필터

글로벌 데이터 (모든 심볼 공통):
  - Fear & Greed    (api.alternative.me/fng)
  - USD/KRW         (CoinGecko USDT→KRW)
  - BTC On-chain    (api.blockchain.info/stats)
  - Mempool         (mempool.space/api/mempool)
  - Mempool Fees    (mempool.space/api/v1/fees/recommended)
  - Upbit KRW       (api.upbit.com/v1/ticker)
  - Bithumb KRW     (api.bithumb.com/public/ticker/ALL_KRW)
```

### 캔들 데이터 필드
```
o: open, h: high, l: low, c: close, v: volume (base)
buyVol: taker_buy_base_volume (klines[9])
quoteVol: quote_asset_volume (klines[7])
```

### Alpha Score 범위
- 최소: -100, 최대: +100 (clamp)
- **STRONG BULL**: ≥ 60 (코드 기준) / UI 라벨은 ≥ 55로 표시 (불일치 주의)
- **BULL BIAS**: ≥ 25
- **NEUTRAL**: -24 ~ 24 (코드: >-25 and <25)
- **BEAR BIAS**: ≤ -25
- **STRONG BEAR**: ≤ -60

---

## Layer별 로직 완전 분해

---

### L1 — Wyckoff v3 멀티 윈도우 스캐닝
**Score 범위: -28 ~ +28**
**입력 데이터: 4H 캔들 150봉**

#### 윈도우 조합 (6개 시도, best score 채택)
```
{R:30, T:40}, {R:35, T:50}, {R:40, T:55},
{R:45, T:60}, {R:50, T:70}, {R:55, T:75}

R = 레인지 구간 (최근 R봉)
T = 추세 구간 (레인지 앞 T봉)
최소 데이터: R + T + 5봉 필요
```

#### 추세 감지 (중위값 방식)
```
t1 = T구간 앞쪽 35%봉들의 종가 중위값
t2 = T구간 뒤쪽 35%봉들의 종가 중위값
tPct = (t2 - t1) / t1

ACCUMULATION: tPct < -0.05 (5% 하락)
DISTRIBUTION: tPct > +0.05 (5% 상승)
그 외: null 반환 (구조 없음)
```

#### 레인지 유효성 체크
```
rH = R구간 최고가
rL = R구간 최저가
rPct = (rH - rL) / rL

조건: 0.015 ≤ rPct ≤ 0.38 (1.5% ~ 38%)
벗어나면 null 반환
```

#### 클라이맥스 감지 (SC / BC) — R구간 앞 70% 탐색
```
각 봉 effort 계산:
  body = |close - open| / open
  wick = (high - low) / low
  vSpike = bar.volume / avgVol (R구간 평균 볼륨)
  posQ = ACCUMULATION: max(0, 1 - pos×2.5)   (저점일수록 가중)
         DISTRIBUTION: max(0, (pos-0.45)×2.2) (고점일수록 가중)
  pos = (close - rL) / (rH - rL)
  effort = vSpike × (body + wick×0.4) × (1 + posQ×0.5)

클라이맥스 조건: vSpike ≥ 1.2 AND effort > 이전 best
```

#### Secondary Test (ST) 카운팅
```
클라이맥스 이후 구간에서 탐색
클라이맥스 레벨 ±8% 내 진입하면 ST 카운트
ST 거래량 < 클라이맥스 거래량 × 0.75 이면 "저거래량 ST" (품질 좋음)
최대 7개 카운트
최소 간격: 2봉
```

#### Spring / UTAD (최근 25봉 탐색)
```
Spring (ACCUMULATION만):
  조건: c.low < rL × 0.9975   (지지선 0.25% 이탈)
        AND c.close > rL × 0.994 (0.6% 이내 복귀)
  SpringLowV: c.volume < 클라이맥스 볼륨 × 0.82

UTAD (DISTRIBUTION만):
  조건: c.high > rH × 1.0025   (저항선 0.25% 돌파)
        AND c.close < rH × 1.006 (0.6% 이내 복귀)
  UtadLowV: c.volume < 클라이맥스 볼륨 × 0.82
```

#### SOS / SOW (최근 7봉)
```
SOS (ACCUMULATION만):
  조건: c.close > rH × 1.004   (레인지 고점 0.4% 돌파)
        AND c.close > c.open    (상승봉)
        AND c.volume > avgVol × 1.1 (평균 볼륨 10% 초과)

SOW (DISTRIBUTION만):
  조건: c.close < rL × 0.996   (레인지 저점 0.4% 이탈)
        AND c.close < c.open    (하락봉)
        AND c.volume > avgVol × 1.1
```

#### 거래량 감소 체크
```
vol1 = R구간 앞절반 평균 거래량
vol2 = R구간 뒷절반 평균 거래량
volDec = vol2 < vol1 × 0.82
```

#### Phase 판정 (ACCUMULATION)
```
Phase D — SOS ✦:  sos AND (spring OR stCount≥2)
Phase D — SOS:    sos only
Phase C — Spring ★: spring AND stCount≥2
Phase C — Spring ★: spring only
Phase B — ST×N:   stCount≥3 or stCount≥1
Phase A — SC/AR:  climaxVolRel≥1.5
Phase A (SC 미확인): 그 외
```

#### Phase 판정 (DISTRIBUTION) — 대칭
```
Phase D — SOW ✦:  sow AND (utad OR stCount≥2)
Phase D — SOW:    sow only
Phase C — UTAD ★: utad AND stCount≥2
Phase C — UTAD ★: utad only
Phase B — UT×N:   stCount≥3 or stCount≥1
Phase A — BC/AR:  climaxVolRel≥1.5
```

#### 점수 산출
```
기본 구조: ACCUMULATION = +12, DISTRIBUTION = -12

클라이맥스 품질 (climaxVolRel 기준):
  ≥3.5: ±10
  ≥2.0: ±7
  ≥1.2: ±4

ST 점수: min(8, stCount×2 + stVolQ×2)
  ACCUMULATION: +stPts, DISTRIBUTION: -stPts

Spring: +6, SpringLowV: +9 (저거래량이면 더 강한 신호)
UTAD:   +6, UtadLowV:  +9 (위와 동일)

SOS: +6, SOW: -6

거래량 감소 (volDec): ACCUMULATION +4, DISTRIBUTION -4

추세 강도 보너스: min(5, round(|tPct|×25))
  ACCUMULATION: +bonus, DISTRIBUTION: -bonus

최종: clamp(-28, +28)
최소 rawScore 12 미만이면 null (구조 없음 처리)

목표가 (Wyckoff cause-effect):
  targetBull = rH + (rH - rL) [상방 목표]
  targetBear = rL - (rH - rL) [하방 목표]
  stopBull   = rL × 0.97
  stopBear   = rH × 1.03
```

---

### L2 — Flow (FR + OI + L/S + Taker)
**Score 범위: -55 ~ +55 (가장 넓은 레이어)**
**입력 데이터: premiumIndex, OI History(4H 6봉), L/S Ratio(4H 4봉), Taker(4H 6봉)**

#### ① 펀딩비 (FR) — % 단위 (소수점 아님)
```
< -0.07%:  +24  "FR 극단 음수 — 숏 스퀴즈 대기 ⚡"
< -0.025%: +15  "FR 음수 — 숏 우세"
< -0.005%: +6   "FR 약한 음수"
< +0.005%:  0   "FR 중립"
< +0.04%:  -10  "FR 양수 — 롱 우세"
< +0.08%:  -18  "FR 높음 — 롱 과열"
≥ +0.08%:  -24  "FR 극단 양수 — 롱 청산 위험 ⚡"

※ 원본 JS: fr = parseFloat(lastFundingRate) * 100
   즉 원본 API는 소수 (0.0001 = 0.01%), 코드는 %로 변환 후 비교
   비교 기준: 0.07% = 0.0007 소수, 0.025% = 0.00025 소수 등
```

#### ② OI + 가격 (oiPct = 최신OI/최초OI - 1 × 100%, pricePct = 24H 가격변화%)
```
OI > +3% AND 가격 > +0.5%:  +15  롱 진입 (강세 포지셔닝)
OI > +3% AND 가격 < -0.5%:  -15  숏 진입 (약세 포지셔닝)
OI < -3% AND 가격 < -0.5%:  +8   롱 청산 → 반등 가능
OI < -3% AND 가격 > +0.5%:  +5   숏 청산
그 외: 0

OI 계산: ((oiVals[마지막] - oiVals[0]) / oiVals[0]) × 100
기간: 최근 6봉 (4H × 6 = 24H)
```

#### ③ L/S Ratio (globalLongShortAccountRatio, 마지막 값 사용)
```
> 2.2:  -14  "L/S 극단 롱 → 역발상 매도"
> 1.6:  -7   "L/S 롱 과다"
< 0.6:  +13  "L/S 극단 숏 → 역발상 매수"
< 0.9:  +6   "L/S 숏 우세"
나머지: 0   "균형"
```

#### ④ Taker Buy/Sell Ratio (takerlongshortRatio, 6봉 평균)
```
> 1.25: +10  "공격 매수"
> 1.08: +5   "매수 우세"
< 0.75: -10  "공격 매도"
< 0.92: -5   "매도 우세"
나머지: 0
```

---

### L3 — V-Surge (Volume Surge)
**Score 범위: -15 ~ +15**
**입력 데이터: 4H 캔들 150봉**

```
avgVol = candles[-30:-5]의 평균 거래량 (25봉 평균, 최근 5봉 제외)
recVol = candles[-5:]의 평균 거래량 (최근 5봉)
sf = recVol / avgVol  (surge factor)

dir = candles[-1].close - candles[-5].open  (5봉 방향성)
  dir > 0: 상방, dir < 0: 하방

sf > 5.0:  ±15  "EXTREME SURGE"
sf > 3.0:  ±10  "STRONG SURGE"
sf > 1.8:  ±6   "SURGE"
sf > 1.3:  ±3   "MODERATE"
sf < 0.35: +3   "ULTRA LOW VOL" (방향 무관, 수축 신호)
sf < 0.60: +2   "LOW VOL"

부호: dir>0이면 양수, dir<0이면 음수
```

---

### L4 — Order Book Imbalance
**Score 범위: -12 ~ +12**
**입력 데이터: /depth?limit=20 → top 15 levels 사용**

```
bidVol = Σ(price × qty) for top 15 bid levels  [달러 기준]
askVol = Σ(price × qty) for top 15 ask levels  [달러 기준]
ratio = bidVol / askVol

ratio > 3.5:  +12  "EXTREME BID"
ratio > 2.0:  +8   "STRONG BID"
ratio > 1.3:  +4   "BID LEAN"
ratio > 0.8:  0    "BALANCED"
ratio > 0.5:  -4   "ASK LEAN"
ratio > 0.3:  -8   "STRONG ASK"
ratio ≤ 0.3:  -12  "EXTREME ASK"
```

---

### L5 — Liquidation Estimate (청산 추정)
**Score 범위: -12 ~ +12**
**입력 데이터: FR(%), OI 변화율(%), 현재가**

```
FR > +0.08% AND OI > +4%:  -12  "롱 과밀 — 하방 강제청산 위험"
FR > +0.05% AND OI > +2%:  -8   "롱 포지션 축적 — 하락시 청산 가속"
FR < -0.08% AND OI > +4%:  +12  "숏 과밀 — 상방 스퀴즈 대기"
FR < -0.05% AND OI > +2%:  +8   "숏 포지션 축적 — 상승시 스퀴즈"
FR > +0.03%:               -4   "롱 우세"
FR < -0.03%:               +4   "숏 우세"
그 외: 0

청산 레벨 추정 (10× 레버리지 가정):
  liqLong  = currentPrice × 0.90  (롱 청산 예상)
  liqShort = currentPrice × 1.10  (숏 청산 예상)
```

---

### L6 — BTC On-chain + Mempool
**Score 범위: -10 ~ +10**
**입력 데이터: blockchain.info/stats, mempool.space**

```
① BTC 네트워크 활동 (24H 트랜잭션 수)
  > 450,000: +4  "매우 활발"
  > 300,000: +2  "활발"
  < 150,000: -3  "침체"

② 평균 트랜잭션 크기 (avgTxV = total_btc_sent / n_tx)
  > 3.0 BTC: -4  "고래 대규모 이동 (거래소 입금 가능)"
  > 1.5 BTC: -2  "고래 활동 증가"
  > 0.5 BTC:  0  "일반 수준"
  > 0.0 BTC: +2  "소액 거래 주도 (개인 축적)"

③ 멤풀 대기 트랜잭션 수
  > 100,000: +4  "극도 혼잡 — 수요 폭증"
  > 50,000:  +2  "혼잡 — 수요 증가"
  > 20,000:   0  "보통"
  > 0:       -1  "여유 — 수요 낮음"

④ 수수료 (fastest fee, sat/vB)
  > 100: +3  "급등"
  > 50:  +2  "높음"
  > 20:   0  "보통"
  > 0:   -1  "낮음"
```

---

### L7 — Fear & Greed Index
**Score 범위: -8 ~ +8**
**입력 데이터: alternative.me/fng**

```
≤ 15: +8   "극단 공포 — 역발상 매수 ★"
≤ 30: +5   "공포 — 매수 기회"
≤ 45: +2   "다소 공포"
≤ 55:  0   "중립"
≤ 70: -3   "탐욕 — 주의"
≤ 85: -5   "과탐욕 — 조정 가능"
> 85: -8   "극단 탐욕 — 하락 경보 ★"
```

---

### L8 — Kimchi Premium (김치 프리미엄)
**Score 범위: -10 ~ +10**
**입력 데이터: 업비트 + 빗썸 KRW가격, USD/KRW 환율**

```
계산:
  binanceKrw = markPrice × usdKrw
  upbitPrem   = (upbitPrice / binanceKrw - 1) × 100
  bithumbPrem = (bithumbPrice / binanceKrw - 1) × 100
  prem = (upbit + bithumb 평균) %

> +5%:   -10  "극과열 ⚠"
> +3%:   -7   "과열"
> +1.5%: -4
> +0.5%: -2
> -0.5%:  0   "중립"
> -2%:   +2   "디스카운트"
> -4%:   +5   "역발상 매수"
≤ -4%:  +8   "강한 역발상 ★"
```

---

### L9 — 실제 강제청산 데이터
**Score 범위: -12 ~ +12**
**입력 데이터: /fapi/v1/forceOrders (최근 50건) → 1H 필터**

```
필터: now - order.time < 3,600,000ms (1시간)

BUY 측 = 숏 포지션 강제청산 (shortLiqUSD) → 상방 압력
SELL 측 = 롱 포지션 강제청산 (longLiqUSD) → 하방 압력

shortLiqUSD > $500,000 AND > longLiqUSD×2:  +10  "숏 스퀴즈 진행 중 ⚡"
shortLiqUSD > $100,000 AND > longLiqUSD×1.5: +6  "숏 청산 우세"
longLiqUSD  > $500,000 AND > shortLiqUSD×2:  -10  "롱 청산 가속 ⚠"
longLiqUSD  > $100,000 AND > shortLiqUSD×1.5: -6  "롱 청산 우세"
```

---

### L10 — MTF Confluence (멀티 타임프레임)
**Score 범위: -20 ~ +20**
**입력 데이터: 1H, 4H, 1D 캔들 각각에 L1_wyckoff 적용**

```
L1_wyckoff를 1H / 4H / 1D 각각에 독립 실행
accCount = ACCUMULATION 판정된 TF 수
distCount = DISTRIBUTION 판정된 TF 수

accCount=3:              +18  "1H+4H+1D 모두 ACC ★★★"
accCount=2, distCount=0: +10  "2개 TF ACC"
distCount=3:             -18  "1H+4H+1D 모두 DIST ★★★"
distCount=2, accCount=0: -10  "2개 TF DIST"
accCount=1, distCount=1:  0   "MTF 충돌"
accCount>0 only:          +5
distCount>0 only:         -5
```

---

### L11 — CVD (Cumulative Volume Delta)
**Score 범위: -12 ~ +12**
**입력 데이터: 4H 캔들 buyVol (taker buy base volume)**

```
CVD delta 계산:
  buyVol 있으면: delta = buyVol×2 - totalVol  [정확한 방식]
  buyVol 없으면: 근사
    bullish (c≥o): delta = vol × (|c-o| / (h-l))
    bearish (c<o): delta = -vol × (|c-o| / (h-l))

누적 CVD: cvd[t] = Σ delta[0..t]

분석 구간: 최근 20봉
  cvdStart = cvd[-20]
  cvdEnd   = cvd[-1]
  cvdTrend = cvdEnd - cvdStart
  priceChange = (close[-1] - close[-20]) / close[-20]

신호 판정:
  priceChange > +0.5% AND cvdTrend > 0:  +8  "실제 매수 주도 상승 (진짜 수요)"
  priceChange > +0.5% AND cvdTrend < 0:  -6  "가격↑ + CVD↓ → 신뢰도 낮음"
  priceChange < -0.5% AND cvdTrend < 0:  -8  "실제 매도 주도 하락"
  priceChange < -0.5% AND cvdTrend > 0:  +6  "하락 중 매수 흡수 (반등 가능)"

흡수(Absorption) 추가 감지:
  조건: |priceChange| < 0.8% AND |cvdTrend| > |cvdStart| × 0.3
  cvdTrend > 0이면 +4, < 0이면 -4 추가
```

---

### L12 — 섹터 분류 + 자금 흐름
**Score 범위: -10 ~ +10**
**입력 데이터: 하드코딩 섹터맵 + 스캔 중 누적 평균**

```
섹터별 평균 Alpha Score 계산 (스캔 완료 후)
  sectorScore = 해당 섹터 심볼들의 alphaScore 평균

≥ +15: +8   "자금 유입 강함"
≥ +5:  +4   "약한 자금 유입"
≤ -15: -8   "자금 이탈 강함"
≤ -5:  -4   "약한 자금 이탈"
그 외:  0

※ 첫 번째 스캔에서는 sectorScore=0 (누적 전)
```

---

### L13 — 7일/30일 고저가 돌파
**Score 범위: -12 ~ +12**
**입력 데이터: 4H 캔들 (7D = 42봉, 30D = 180봉)**

```
c7  = 최근 42봉 (7일 × 6봉/일)
c30 = 최근 180봉 (30일 × 6봉/일)

h7, l7   = 7일 최고가, 최저가
h30, l30 = 30일 최고가, 최저가

cp = 현재가 (마지막 봉 종가)

근접 기준: "near" = 96% 이상 (cp > h × 0.96)

판정 (순서대로):
  cp > h30:             +12  "30일 신고가 돌파 ★"
  cp > h7:              +8   "7일 신고가 돌파"
  cp > h30 × 0.96:      +6   "30일 고점 근접"
  cp > h7 × 0.96:       +4   "7일 고점 근접"
  cp < l30 × 1.04:      -8   "30일 저점 근접"
  cp < l7 × 1.04:       -4   "7일 저점 근접"
  그 외: 0

레인지 내 위치:
  pos7  = (cp - l7)  / (h7  - l7)  × 100 %
  pos30 = (cp - l30) / (h30 - l30) × 100 %
```

---

### L14 — Bollinger Band Squeeze
**Score 범위: -10 ~ +10**
**입력 데이터: 4H 캔들, period=20, mult=2.0**

```
BB 계산 (각 시점):
  SMA(n) = 최근 n봉 종가 평균
  STD(n) = 최근 n봉 종가 표준편차
  upper = SMA + mult × STD
  lower = SMA - mult × STD
  bw    = (4 × mult × STD) / SMA  [밴드폭 비율]

세 시점 계산:
  bbNow   = 현재 (마지막 20봉)
  bb20ago = 20봉 전 시점 (slicing으로 20봉 이전 데이터로 계산)
  bb50ago = 50봉 전 시점 (데이터 충분할 때만)

조건 판정:
  squeeze    = bbNow.bw < bb20ago.bw × 0.65  [35% 이상 수축]
  bigSqueeze = bbNow.bw < bb50ago.bw × 0.50  [50% 이상 수축]
  expanding  = bbNow.bw > bb20ago.bw × 1.30  [30% 이상 확장]

현재가 위치:
  bbPos = (cp - lower) / (upper - lower) × 100 %

점수:
  bigSqueeze AND cp > SMA:  +8   "대형 스퀴즈 — 에너지 압축 ★"
  bigSqueeze AND cp ≤ SMA:  +4
  squeeze AND cp > SMA:     +5   "스퀴즈 중"
  squeeze AND cp ≤ SMA:     +2
  expanding AND cp > upper: +8   "상단 돌파 + 확장"
  expanding AND cp < lower: -8   "하단 돌파 + 확장"
  bbPos > 85%:              -3   "과매수 주의"
  bbPos < 15%:              +3   "과매도 가능"
```

---

### L15 — ATR 변동성 + 손절 자동 계산
**Score 범위: -6 ~ +6**
**입력 데이터: 4H 캔들, period=14**

```
ATR 계산:
  TR[t] = max(high-low, |high-prev.close|, |low-prev.close|)
  atrRecent = 최근 14봉 TR 평균
  atrOld    = -(14×3)~-(14×2) 구간 TR 평균  [28~42봉 전 시점]
              (데이터 부족 시 atrOld = atrRecent)

atrPct = atrRecent / currentPrice × 100 %

변동성 상태:
  atrRecent < atrOld × 0.60: "ULTRA_LOW"  (40% 이상 감소)
  atrRecent < atrOld × 0.80: "LOW"        (20% 이상 감소)
  atrRecent > atrOld × 1.80: "EXTREME"    (80% 이상 증가)
  atrRecent > atrOld × 1.30: "HIGH"       (30% 이상 증가)
  그 외: "NORMAL"

점수:
  ULTRA_LOW: +5   "폭발 직전 에너지 응축"
  LOW:       +3   "방향성 움직임 임박"
  EXTREME:   -4   "극高 변동성 — 고위험"
  HIGH:      -2   "변동성 높음"

자동 손절/목표가 계산:
  stopLong  = currentPrice - atrRecent × 1.5
  stopShort = currentPrice + atrRecent × 1.5
  tp1Long   = currentPrice + atrRecent × 2.0  (R:R = 1.33)
  tp2Long   = currentPrice + atrRecent × 3.0  (R:R = 2.0)
```

---

## Alpha Score 합산 공식

```javascript
raw = L1(wk) + L2(fl) + L3(vs) + L4(ob)
    + L5(lq) + L6(oc) + L7(fg) + L8(km)
    + L9(rl) + L10(mtf) + L11(cvd)
    + L12(sec) + L13(brk) + L14(bb) + L15(atr)

alpha = clamp(-100, +100, round(raw))
```

### 이론적 최대 점수 (각 레이어 max 합산)
```
L1:  28
L2:  55 ← 가장 큰 가중치
L3:  15
L4:  12
L5:  12
L6:  10
L7:   8
L8:  10
L9:  12
L10: 20
L11: 12
L12: 10
L13: 12
L14: 10
L15:  6
합계: 232 → 100으로 clamp
```

### Verdict 임계값
```
≥ +60: ⚡ STRONG BULL
≥ +25: ▲ BULL BIAS
> -25: ◆ NEUTRAL
> -60: ▼ BEAR BIAS
≤ -60: ⚡ STRONG BEAR

극단 FR 추가 표시: |FR| > 0.07%
MTF 트리플 추가: accCount=3
BB 대형 스퀴즈 추가: bigSqueeze=true
```

---

## 추가 메타 신호

### Extreme FR Alert (UI 표시용)
```
|fr| > 0.07% → 경보
  fr < 0: "숏 스퀴즈 경보"
  fr > 0: "롱 청산 경보"
```

### BTC On-chain 고래 추정 (참고용)
```
avgTxV > 2.0 BTC: "WHALE_MOVE" (대규모 이동)
avgTxV > 1.5 BTC: "HIGH" whale signal
avgTxV > 0.5 BTC: "MED"
그 외: "LOW"
```

---

## 데이터 수집 설정 (스캔 파라미터)

```
Top N 모드: 상위 N개 심볼 (거래대금 기준, USDT 쌍만, 최소 $500K)
  옵션: 30, 50(기본), 80, 100

OI / L·S 기간: 1H, 4H(기본), 1D

Alpha Score 필터:
  전체(-100), ≥+25 Bull(기본), ≥+55 Strong Bull, ≤-25 Bear

병렬 처리: 8개 동시, 간격 80ms 이상
타임아웃: 10초 per request
```

---

## 주요 발견 — UI vs 코드 불일치

| 항목 | UI 라벨 | 코드 실제값 |
|---|---|---|
| Strong Bull 임계 | ≥ 55 | ≥ 60 |
| Bull 임계 | 25 ~ 54 | ≥ 25 |
| Bear 임계 | -25 ~ -54 | ≤ -25 |
| Strong Bear 임계 | ≤ -55 | ≤ -60 |
| Extreme FR alert | \|FR\| > 0.07% | 코드와 일치 |

**→ 코드 기준이 실제 동작값. UI 라벨은 표시상 오차 있음.**

---

## WTD 구현 상태 요약

| Layer | WTD 구현 상태 |
|---|---|
| L1 Wyckoff | ✅ `sideways_compression`, `higher_lows_sequence`, `volume_spike_down` 부분 |
| L2 FR | ✅ `funding_extreme` (threshold 불일치: 0.0010 vs 아카 0.0007/0.00025) |
| L2 OI | ✅ `oi_change` (threshold 다름: WTD 10% vs 아카 3%/2%) |
| L2 L/S | ✅ `ls_ratio_recovery` (로직 다름: WTD는 회복률, 아카는 절대값) |
| L2 Taker | ✅ `delta_flip_positive`, `absorption_signal` |
| L3 V-Surge | ✅ `volume_surge_bull/bear` (window 다름: WTD 3/24봉 vs 아카 5/25봉) |
| L4 OB | ❌ `orderbook_imbalance_ratio` 설계완료, 피처 파이프라인 미구현 |
| L5 Liq Estimate | ⚠️ `liq_zone_squeeze_setup` 부분 (OI threshold 다름) |
| L6 On-chain | ❌ 외부 API 별도 W |
| L7 F&G | ❌ 외부 API 별도 W |
| L8 Kimchi | ❌ KRW API 별도 W |
| L9 Real Liq | ❌ forceOrders API 별도 W |
| L10 MTF | ⚠️ 다중 TF Context 아키텍처 미지원 |
| L11 CVD | ✅ `cvd_state_eq`, `absorption_signal`, `delta_flip_positive` |
| L11 CVD divergence | ✅ `cvd_price_divergence` (W-0108 신규) |
| L12 Sector | ❌ 하드코딩 맵만, 동적 점수 없음 |
| L13 Breakout | ⚠️ `breakout_above_high` (lookback 20봉 vs 아카 42봉) |
| L14 BB Squeeze | ⚠️ `bollinger_squeeze` (단계 불일치: WTD 단일, 아카 2단계) |
| L14 BB 대형 | ❌ 50봉 기준 50% 수축 미구현 |
| L15 ATR | ⚠️ `atr_ultra_low` (계산법 다름: WTD ATR14/ATR50, 아카 최근 vs 28~42봉전) |
| Alpha 합산 | ❌ 15레이어 합산 스코어링 미구현 |
