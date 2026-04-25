  
**COGOCHI**

System Architecture Design Document

**Pattern Engine v2.0 \+ LightGBM Integration**

Version 1.0  ·  April 2026

Holo Studio Co., Ltd.

Classification: Internal / Confidential

**Core Thesis**

The moat is not the AI model. Models are commoditized.

The moat is the cumulative judgment ledger: pattern definitions, phase transitions,  
hit/miss records, and user-specific refinements that cannot be replicated.

# **1\. 제품 정의 및 핵심 원칙**

Cogochi는 AI 트레이딩 앱이 아니다. 크립토 선물 트레이더가 발견한 실제 거래 패턴을 구조화하고, 전체 시장을 24시간 감시하여 유사 셋업이 나타날 때 알림을 보내고, 결과를 검증해 개인 판단 자산으로 축적하는 시스템이다.

## **1.1 한 줄 정의**

**내가 차트에서 발견한 패턴을 AI가 기억하고, 24시간 전체 시장을 스캔하여 패턴이 나타나면 알림을 보내고, 결과를 검증해 개인 판단 자산으로 쌓는다.**

## **1.2 시스템 레이어 구조**

| 레이어 | 담당 기능 | 예시 | 핵심 질문 |
| :---- | :---- | :---- | :---- |
| Pattern Object | 거래 인사이트를 다중 Phase 시퀀스로 구조화 | TRADOOR OI-reversal \= 5 phases | 이 패턴이 뭔가? |
| State Machine | 모든 심볼의 현재 Phase를 실시간 추적 | PTBUSDT가 3시간 전 ACCUMULATION 진입 | 지금 어느 단계인가? |
| LightGBM | Phase 전환 시점에 P(win) 확률 계산 | 이 ACCUMULATION → BREAKOUT 확률 0.72 | 이게 실제로 먹힐까? |
| Verdict Ledger | 결과를 기록해 패턴 신뢰도 누적 | OI-reversal: uptrend 시 68% hit rate | 실제로 먹혔나? |
| User Refinement | 트레이더별 threshold 개인화 | 내 버전은 OI \> 18% (기본값 10%) | 내 기준에 맞나? |

## **1.3 Non-Goals (절대 하지 않는 것)**

* 검증 이력 없는 신호 서비스 또는 트레이딩 알림

* 자율 매매 실행 또는 봇 통합

* 범용 AI 차트 분석 (쉽게 복제 가능한 commodity 기능)

* 소셜/카피트레이딩 플랫폼

* 뉴스 집계 또는 독립 감성 분석 제품

# **2\. 전체 시스템 아키텍처**

## **2.1 데이터 흐름 — End-to-End**

전체 시스템은 다음 5단계 파이프라인으로 동작한다:

\[Binance FAPI\] → 실시간 OHLCV, OI, Funding, Volume

      ↓

\[Feature Calc\] → 92개 feature 계산 (심볼 × 15분마다)

      ↓

\[Building Blocks 29+5개\] → Phase 조건 True/False 평가

      ↓

\[State Machine\] → Phase 전환 감지 및 이벤트 발화

      ↓ (Phase 전환 발생 시)

\[LightGBM\] → P(win) 확률 계산

      ├─ P(win) ≥ 0.55 → 알림 발송 (Terminal \+ Telegram)

      └─ P(win) \< 0.55 → 무시 (false positive 필터)

      ↓

\[Verdict Ledger\] → 72h 후 HIT/MISS/EXPIRED 자동 판정

      ↓

\[LightGBM 재학습\] → Ledger 50개+ 누적 시 자동 트리거

## **2.2 컴포넌트 구조**

| 컴포넌트 | 위치 | 역할 | 상태 |
| :---- | :---- | :---- | :---- |
| feature\_calc.py | WTD/cogochi-autoresearch/ | 92개 feature 계산 | ✅ 완료 (28 core \+ 64 extended) |
| building\_blocks/ (34개) | WTD/cogochi-autoresearch/ | Phase 조건 평가 블록 | ✅ 완료 (29 기존 \+ 5 신규) |
| state\_machine.py | WTD/cogochi-autoresearch/ | Phase 전환 감지 및 추적 | 🔨 구현 필요 |
| lgbm\_scorer.py | WTD/cogochi-autoresearch/ | P(win) 확률 계산 | 🔨 구현 필요 |
| verdict\_ledger.py | WTD/cogochi-autoresearch/ | 결과 기록 및 통계 집계 | 🔨 구현 필요 |
| scanner\_scheduler.py | WTD/cogochi-autoresearch/ | APScheduler 15분 주기 스캔 | 🔨 구현 필요 |
| /terminal (SvelteKit) | crazy-beaver/app/ | 차트 \+ challenge 저장 \+ 알림 | 🔨 Bloomberg UI 구현 중 |
| /lab (SvelteKit) | crazy-beaver/app/ | challenge 실행 \+ 결과 확인 | 🔨 구현 중 |

## **2.3 레포 구조**

WTD\_2/                                    ← 실제 엔진 레포

  cogochi-autoresearch/

    building\_blocks/                       ← 34개 블록 (✅ 완료)

      triggers/

      confirmations/

      entries/

      disqualifiers/

      oi\_reversal/                        ← 5개 신규 블록

    data\_cache/                            ← Binance 데이터 캐시

    scanner/                               ← 🔨 구현 필요

      feature\_calc.py                     ← ✅ 완료

      state\_machine.py                    ← 🔨

      lgbm\_scorer.py                      ← 🔨

      scheduler.py                        ← 🔨

    ledger/                                ← 🔨 구현 필요

      verdict\_ledger.py

      refinement\_engine.py

    mcp/                                   ← 🔨 Phase 2

      server.py

    challenges/pattern-hunting/            ← ✅ 동작 중

      \<slug\>/

        answers.yaml

        match.py

        output/instances.jsonl

crazy-beaver/                              ← SvelteKit 프론트엔드

  app/src/routes/

    terminal/                              ← 🔨 Bloomberg UI

    lab/                                   ← 🔨

    dashboard/                             ← 🔨

# **3\. Pattern Engine — 5-Phase State Machine**

## **3.1 TRADOOR OI-Reversal 패턴 — 기준 예시**

모든 패턴은 실제 거래 다이어리에서 출발한다. TRADOOR/PTB 거래 기록은 이 시스템의 설계 원형이다.

| Phase | Name | 진입 조건 | Action | 지속 | 핵심 신호 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 0 | FAKE\_DUMP | price\_change\_1h \< \-5%, oi\_change\_1h \< 5%, funding \< \-0.001, volume \< 2x | AVOID | 1\~4h | OI 거의 안 움직임 |
| 1 | ARCH\_ZONE | sideways\_compression \= true, bb\_width narrowing, OI slowly decreasing | WAIT | 4\~24h | 번지 구간 형성 |
| 2 | REAL\_DUMP | price \< \-5%, oi\_change\_1h \> \+15%, volume \> 3x, funding \< \-0.002 | WATCH | 1\~4h | OI \+ Volume 동시 폭발 |
| 3 | ACCUMULATION | higher\_lows \>= 3, funding flip neg→pos, OI hold, price range \< 3% | ENTER ★ | 12\~48h | 진입 구간 |
| 4 | BREAKOUT | OI spike \+10%+ in 4h, price breaks Phase1 high, volume explosion | LATE | 4\~12h | 숏 스퀴즈 \+ 신규 롱 |

## **3.2 Phase 0 vs Phase 2 — 핵심 구분**

두 Phase 모두 차트에서는 급락으로 보인다. 차이는 오직 파생상품 데이터에서 나온다.

| 지표 | Phase 0 (Fake Dump) | Phase 2 (Real Dump) |
| :---- | :---- | :---- |
| Price drop | 유사 (≥5%) | 유사 (≥5%) |
| OI change | 작음 (\<5%) | ★ 큼 (\>15%) |
| Volume | 평균 이하 | ★ 3x+ 폭발 |
| Funding | 음수 | ★ 극단적 음수 |
| 의미 | 리테일 패닉, 실제 포지션 없음 | 마켓메이커 대규모 숏 진입 |
| 이후 전개 | Arch 구간 → 추가 하락 가능 | Accumulation → 반전 가능성 |

이것이 순수 가격 분석 툴이 이 시스템을 복제할 수 없는 이유다. 신호는 파생상품 레이어(OI \+ Funding \+ Volume 컨플루언스)에 있지 캔들스틱 모양에 있지 않다.

## **3.3 State Machine 런타임 로직**

15분 주기 스캔 사이클:

for symbol in dynamic\_universe:  \# \~300 Binance USDT-M 심볼

  features \= feature\_calc(symbol, timeframe='1h')

  for pattern in active\_patterns:

    current\_phase \= state\_store\[symbol\]\[pattern\]

    next\_conditions \= pattern.phases\[current\_phase \+ 1\]

    if all(eval\_block(cond, features) for cond in next\_conditions.required):

      if not any(eval\_block(d, features) for d in next\_conditions.disqualifiers):

        transition(symbol, pattern, current\_phase → next\_phase)

        p\_win \= lgbm\_scorer.predict(features)  \# LightGBM 호출

        if p\_win \>= 0.55:

          fire\_alert(symbol, pattern, current\_phase, p\_win)

        ledger.record\_entry(symbol, pattern, features, p\_win)

    if current\_phase.timeout\_exceeded:

      expire(symbol, pattern)  \# Phase 0으로 리셋

## **3.4 Phase Timeout 정책**

| Phase | Timeout | 1h TF 기준 | 만료 처리 |
| :---- | :---- | :---- | :---- |
| FAKE\_DUMP | 24 candles | 24시간 | idle 리셋 |
| ARCH\_ZONE | 48 candles | 48시간 | idle 리셋 |
| REAL\_DUMP | 24 candles | 24시간 | idle 리셋 |
| ACCUMULATION | 72 candles | 72시간 | EXPIRED 기록 |
| BREAKOUT | 12 candles | 12시간 | HIT/MISS 판정 |

# **4\. LightGBM 통합 설계**

## **4.1 역할 분리 원칙**

LightGBM은 State Machine이 할 수 없는 한 가지를 담당한다: Phase 전환이 실제로 성공할 확률.

| 레이어 | 질문 | 출력 |
| :---- | :---- | :---- |
| Building Blocks | 이 조건이 충족됐나? | True / False |
| State Machine | 지금 어느 Phase인가? | Phase Index \+ 전환 이벤트 |
| ★ LightGBM | 이게 실제로 먹힐 확률은? | P(win) 0.0 \~ 1.0 |
| Verdict Ledger | 실제로 맞았나? | HIT / MISS / EXPIRED |

## **4.2 입력 Feature 설계**

ACCUMULATION 진입 시점의 feature snapshot을 입력으로 사용한다.

핵심 feature 그룹:

* Phase 이력: candles\_in\_prev\_phase, phase\_sequence\_duration

* OI 지표: oi\_change\_1h, oi\_change\_4h, oi\_hold\_after\_spike

* Volume 지표: volume\_ratio\_1h, taker\_buy\_ratio\_1h, cvd\_state

* Funding 지표: funding\_rate, funding\_flip, funding\_trend\_4h

* 가격 구조: higher\_lows\_count, price\_range\_4h, bb\_width, atr\_pct

* 거시 환경: regime (risk\_on / risk\_off / chop), btc\_trend

* 시간 컨텍스트: hour\_of\_day, day\_of\_week

## **4.3 학습 데이터 구조**

Verdict Ledger에서 자동으로 생성된다:

\# train\_data.py

X \= features\_at\_accumulation\_entry   \# 92 columns

y \= 1 if verdict \== 'HIT' else 0     \# Ledger에서 자동 생성

\# 학습 트리거

if len(ledger.records) \>= 50:

    train\_lgbm(X, y)                  \# 첫 학습

if len(ledger.records) % 20 \== 0:

    retrain\_lgbm(X, y)                \# 20개 누적마다 재학습

## **4.4 배포 게이트**

| 조건 | Threshold | 결과 | 비고 |
| :---- | :---- | :---- | :---- |
| 최소 학습 데이터 | 50개 이상 | 학습 가능 | 50개 미만 \= 무조건 알림 모드 |
| AUC 최소치 | ≥ 0.58 | 배포 허용 | 미달 시 임계값 조정 |
| Alert threshold | P(win) ≥ 0.55 | 알림 발송 | 초기값, Ledger로 튜닝 |
| Walk-forward 검증 | OOS 필수 | 배포 전 검증 | 과거 데이터에만 맞는 모델 즉시 폐기 |

## **4.5 LightGBM이 없을 때 Fallback**

Ledger 50개 미만 또는 AUC 미달 시: State Machine Phase 전환만으로 무조건 알림 발송. 모든 ACCUMULATION 진입 \= 알림. Ledger 누적이 목표.

# **5\. Building Blocks — 조건 라이브러리**

## **5.1 신규 5개 블록 (OI-Reversal 전용)**

| Block | 로직 | 필요 Features |
| :---- | :---- | :---- |
| oi\_spike\_with\_dump | price\_change \< threshold AND oi\_change \> oi\_threshold AND volume\_ratio \> vol\_threshold (동일 캔들 또는 2캔들 이내) | price\_change\_1h, oi\_change\_1h, volume\_ratio\_1h |
| higher\_lows\_sequence | N개 연속 스윙 로우가 각각 이전보다 높음. 스윙 로우 \= lookback 윈도우 내 로컬 최솟값 | close prices over lookback period |
| funding\_flip | 이전 N 캔들 funding \< 0, 현재 캔들 funding \> 0\. Lookback 기본값 8 | funding\_rate time series |
| oi\_hold\_after\_spike | OI spike 이벤트가 최근 N 캔들 내 발생 AND 현재 OI가 spike 레벨의 X% 이상 유지 | oi\_change\_1h (historical), current OI |
| sideways\_compression | Price range \< threshold% AND Bollinger bandwidth decreasing. Bungee/Arch 구간 감지 | high, low, bb\_width over window |

## **5.2 Block 평가 컨텍스트**

각 블록은 순수 함수다. 데이터를 직접 조회하지 않고 Context 객체를 받는다.

class Context:

    features: pd.DataFrame   \# 92 columns, 1 row per candle

    params: dict              \# block-specific thresholds

def oi\_spike\_with\_dump(ctx: Context) \-\> pd.Series:

    price\_drop \= ctx.features\['price\_change\_1h'\] \< ctx.params.get('price\_threshold', \-0.05)

    oi\_spike   \= ctx.features\['oi\_change\_1h'\]    \> ctx.params.get('oi\_threshold', 0.10)

    vol\_surge  \= ctx.features\['volume\_ratio\_1h'\] \> ctx.params.get('vol\_threshold', 3.0)

    return price\_drop & oi\_spike & vol\_surge

## **5.3 Dynamic Universe**

스캐너는 전체 Binance USDT-M 영구계약 유니버스를 커버한다. 많은 실행 가능한 패턴(PTB, TRADOOR 등)은 중소형 영구계약에서 발생한다.

| Tier | 기준 | 스캔 주기 | 예상 수량 | LightGBM 적용 | 우선순위 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| Core | 시가총액 상위 30 | 15분 | 30개 | 항상 | ★★★ |
| Active | 24h 거래량 \> $5M | 30분 | \~100개 | P(win) ≥ 0.55 | ★★ |
| Watchlist | 24h 거래량 \> $1M | 1시간 | \~200개 | P(win) ≥ 0.60 | ★ |
| Cold | $1M 미만 | 스캔 안 함 | \~100개+ | \- | \- |

# **6\. Verdict Ledger — 판단 자산 데이터베이스**

## **6.1 Ledger가 핵심 해자인 이유**

누구나 OI 감지나 Phase 추적을 만들 수 있다. 하지만 당신의 Ledger는 아무도 가질 수 없다. 6개월 후: 500개+ 기록, 심볼별 통계, BTC 레짐 분석, 유저 오버라이드. 이것은 기능을 복사해서 복제할 수 없는 누적 데이터다.

## **6.2 VerdictRecord 스키마**

| 필드 | 타입 | 설명 |
| :---- | :---- | :---- |
| record\_id | UUID | 고유 식별자 |
| pattern\_id | str | 어떤 패턴이 매칭됐나 |
| symbol | str | 어떤 심볼 |
| entry\_phase | int | 기록 생성 시 Phase (보통 ACCUMULATION=3) |
| entry\_timestamp | datetime | 진입 Phase 도달 시각 |
| entry\_price | float | 진입 시 가격 |
| peak\_return\_pct | float | 진입 후 최대 유리 이동 |
| exit\_return\_pct | float | 평가 윈도우 종료 시 수익률 |
| verdict | enum | HIT / MISS / EXPIRED |
| btc\_trend | enum | UPTREND / SIDEWAYS / DOWNTREND |
| user\_override | enum | VALID / INVALID / null |
| features\_at\_entry | JSON | 재현성을 위한 92개 feature 전체 스냅샷 |
| p\_win\_at\_entry | float | LightGBM이 예측한 P(win) (있을 경우) |

## **6.3 Verdict 판정 로직**

평가 윈도우: ACCUMULATION 진입 후 72시간

HIT:     peak\_return\_pct \>= \+15%   (패턴이 작동함)

MISS:    exit\_return\_pct  \<= \-10%   (손절됨)

EXPIRED: 두 임계값 모두 미달         (불확정)

유저는 자동 판정을 오버라이드할 수 있다. 동일 셋업이라도 트레이더마다 결과가 다를 수 있기 때문이다 (+20%에 익절한 사람 vs 홀드 후 손절한 사람). 유저 오버라이드가 개인화 데이터셋을 만든다.

## **6.4 집계 통계**

| 지표 | 공식 | 용도 |
| :---- | :---- | :---- |
| Hit rate | count(HIT) / count(HIT+MISS) | 핵심 신뢰도 지표 |
| Avg return | mean(exit\_return\_pct) for HIT | 진입당 기대 수익 |
| Expected value | hit\_rate × avg\_return \+ miss\_rate × avg\_loss | 이 패턴이 \+EV인가? |
| BTC-conditional hit rate | btc\_trend 필터링된 hit rate | 상승장에서만 작동하나? |
| Decay analysis | 30일 롤링 윈도우 hit rate | 패턴 엣지가 사라지고 있나? |

# **7\. User Refinement — 개인화 패턴 변형**

## **7.1 개인화 흐름**

트레이더마다 동일한 패턴을 다르게 읽는다. OI spike 20%를 요구하는 트레이더(보수적)와 8%를 허용하는 트레이더(공격적). Refinement 시스템은 기본 패턴을 파편화하지 않고 유저별 변형을 허용한다.

정제 프로세스:

* 1\. 유저가 기본 패턴(tradoor\_oi\_reversal\_v1)을 2주+ 실행

* 2\. 결과를 VALID/INVALID로 표시

* 3\. 10개+ 판단 누적 시 시스템이 오버라이드 분포 분석

* 4\. 임계값 변경 제안: 'VALID 적중 평균 OI spike \= 18%. 10% → 15% 상향?'

* 5\. 수락 시 개인 변형 생성: tradoor\_oi\_reversal\_v1\_\[user\_id\]

* 6\. 개인 변형은 독립된 Ledger 보유

## **7.2 RefinementRecord 스키마**

| 필드 | 타입 | 설명 |
| :---- | :---- | :---- |
| base\_pattern\_id | str | 원본 패턴 |
| user\_id | str | 유저 식별자 |
| changes | JSON | 변경된 threshold 딕셔너리 |
| source\_records | UUID\[\] | 이 변경의 근거가 된 VerdictRecord ID 목록 |
| reason | str | 자동 생성 또는 유저 메모 |

# **8\. MCP 인터페이스 (Phase 2\)**

## **8.1 설계 원칙**

MCP는 패턴 엔진의 신규 제품이 아니다. 기존 엔진 위에 에이전트가 Cogochi를 조작할 수 있게 노출하는 얇은 adapter 레이어다.

User / Agent

   ↓

MCP Tool Call

   ↓

Cogochi MCP Server (얇은 adapter)

   ↓

Pattern Engine APIs / State Machine / Ledger

## **8.2 v1 Tool 명세**

| Tool | 입력 | 출력 | 연결 엔진 |
| :---- | :---- | :---- | :---- |
| save\_setup | symbol, timeframe, timestamp, note, tags\[\] | seed\_id | PatternSeed 생성 |
| analyze\_setup | seed\_id | pattern\_draft, phase\_candidates, similar\_cases | AutoResearch |
| scan\_pattern | pattern\_id, tier, timeframe | matches\[\], phase, score | State Machine Scanner |
| record\_verdict | match\_id, verdict, note | verdict\_id | Verdict Ledger |

## **8.3 구현 순서**

* Phase 1: save\_setup, analyze\_setup, scan\_pattern, record\_verdict

* Phase 2: activate\_pattern, refine\_pattern

* Phase 3: Resources (pattern://, scanner://live, user://library)

* Phase 4: Prompts (반복 워크플로 슬래시 커맨드)

# **9\. 구현 로드맵**

## **9.1 Phase 우선순위**

| Phase | 기간 | 목표 | 완료 기준 |
| :---- | :---- | :---- | :---- |
| P0 — MCL | 지금 \~ 2주 | State Machine 구현, ACCUMULATION 감지 시 무조건 알림, Verdict 기록 시작 | 루프 1회 완전 동작 |
| P1 — LightGBM | Ledger 50개+ | 첫 LightGBM 학습, P(win) threshold 적용, false positive 감소 | AUC ≥ 0.58 |
| P2 — Refinement | Ledger 100개+ | 유저별 패턴 변형, 개인 Ledger 분리 | 유저 오버라이드 10회 처리 |
| P3 — MCP | 제품 안정화 후 | 에이전트용 tool 4개 노출 | save→scan→verdict 에이전트 동작 |

## **9.2 Kill Criteria**

| 리스크 | Kill 기준 | 대응 |
| :---- | :---- | :---- |
| LightGBM 과적합 | OOS AUC \< 0.55 | Walk-forward validation 필수. OOS 검증 없이 배포 금지. |
| 하락장 레짐 | BTC downtrend | Regime Filter: 하락장 판정 시 LONG 패턴 신호 전면 차단 |
| MCL 미동작 | W2까지 루프 미완성 | 기술 문제 아닌 설계 재검토 신호. 전제부터 다시. |
| Ledger 누적 실패 | 2주 내 50개 미만 | 스캐너 정밀도 또는 패턴 정의 재검토 |

## **9.3 지금 당장 빼야 할 것**

아래는 현재 시점에 손대면 안 되는 것들이다:

* KTO / LoRA per-user finetuning (Phase 2 이후)

* DOUNI 캐릭터 / Archetype / Stage 시스템

* Wallet Intel Mode / /battle / /passport / /world

* MCP 서버 (State Machine \+ Ledger가 먼저)

* Graph / Memory Wiki / RAG 레이어

## **9.4 최소 완결 루프 (MCL)**

이 5개가 돌아가면 제품이다:

| 순서 | 단계 | 내용 |
| :---- | :---- | :---- |
| 1 | Save Setup | 유저가 차트에서 의미 있는 구간 저장 |
| 2 | Pattern Object | 저장된 구간 → 구조화된 Phase 패턴으로 변환 |
| 3 | Scanner | 패턴을 시장 전체에서 다시 찾기 (30개 심볼이라도) |
| 4 | Phase / State | 현재 후보가 어느 Phase인지 표시 |
| 5 | Verdict | 결과 기록 — HIT / MISS / EXPIRED |

# **Appendix. 주요 데이터 계약**

## **A1. features DataFrame (28 core columns)**

| 컬럼 | 타입 | 설명 |
| :---- | :---- | :---- |
| ema20\_slope | float | 20 EMA 기울기 — 단기 추세 방향 |
| rsi14 | float | RSI 14기간 |
| atr\_pct | float | ATR% — 현재 변동성 |
| vol\_ratio\_3 | float | 3기간 볼륨 vs 평균 배수 |
| funding\_rate | float | 펀딩비 (perp) |
| oi\_change\_1h | float | 1시간 OI 변화율 |
| cvd\_state | str | 'buying' / 'selling' / 'neutral' |
| regime | str | 'risk\_on' / 'risk\_off' / 'chop' |
| htf\_structure | str | 'uptrend' / 'downtrend' / 'range' |

## **A2. Challenge 디렉토리 형식**

WTD/challenges/pattern-hunting/\<slug\>/

  answers.yaml      \# 패턴 정의 (블록 \+ 파라미터)

  match.py          \# 자동 생성된 매칭 코드

  prepare.py        \# 평가 실행 (수정 금지)

  output/

    instances.jsonl \# 평가 결과 (1줄 \= 1 매치)

## **A3. PhaseTransition 이벤트**

symbol:           str

pattern\_id:       str

from\_phase:       int

to\_phase:         int

timestamp:        datetime

features\_snapshot: dict  \# 92개 feature 전체

candles\_in\_phase: int

p\_win:            float  \# LightGBM 예측값 (있을 경우)