# WTD — User Journey & Lifecycle v1.0

> **유저가 경험하는 전체 여정 — 첫 접속부터 마스터까지**
> 2026-02-22

---

## 목차

1. [전체 라이프사이클 개요](#1-전체-라이프사이클-개요)
2. [P0 — AWARENESS: 외부 유입 → 가입](#2-p0--awareness)
3. [P1 — ONBOARDING: 가입 → 첫 판](#3-p1--onboarding)
4. [P2 — FIRST LOOP: 첫 판 → 10판, 습관 형성](#4-p2--first-loop)
5. [P3 — PROGRESSION: Bronze→Silver→Gold](#5-p3--progression)
6. [P4 — COMPETITION: Gold→Diamond](#6-p4--competition)
7. [P5 — MASTERY: Diamond→Master](#7-p5--mastery)
8. [3 Loop 구조 — 반복 행동 패턴](#8-3-loop-구조)
9. [에이전트 드래프트 경험 — 매치 한 판의 여정](#9-에이전트-드래프트-경험)
10. [감정 지도 — Phase별 유저 심리](#10-감정-지도)
11. [이탈 방지 메커니즘](#11-이탈-방지-메커니즘)
12. [해금 타임라인 — 뭐가 언제 열리는가](#12-해금-타임라인)

---

## 1. 전체 라이프사이클 개요

```
시간 →

  P0           P1           P2            P3              P4              P5
AWARENESS → ONBOARDING → FIRST LOOP → PROGRESSION → COMPETITION → MASTERY
  │             │            │             │               │             │
  외부유입      가입→첫판     1~10판        10~100판        100~200판     200판+
  30초 판단     5분 이내      습관 형성      전략 심화        대회/팀매치   소셜 루프
  │             │            │             │               │             │
  LP: 없음      LP: 0        LP: 0→200     LP: 200→1200    LP: 1200→2200 LP: 2200+
  티어: 없음    Bronze 입장   Bronze        Silver→Gold     Gold→Diamond  Diamond→Master
```

### 6 Phase × 에이전트 해금 연동

| Phase | LP | 티어 | 에이전트 풀 | Spec 해금 | 핵심 기능 |
|-------|----|------|-----------|----------|---------|
| **P0** | - | - | - | - | 랜딩 + 가입 |
| **P1** | 0 | Bronze | 8개 풀 (Base만) | Base only | 데모 판, 드래프트 튜토리얼 |
| **P2** | 0→200 | Bronze | 8개 전체 | 10전 후 A/B 해금 | Loop B + C 시작 |
| **P3** | 200→1200 | Silver→Gold | 통계 화면 | 30전 후 C 해금 | Oracle + Challenge + Loop D |
| **P4** | 1200→2200 | Gold→Diamond | Oracle 전체 | 전체 접근 | LIVE 관전, Season 랭킹, 팀 매치 |
| **P5** | 2200+ | Diamond→Master | RAG 리뷰 | 크로스 분석 | Strategy NFT, Coach, LIVE 스트리밍 |

---

## 2. P0 — AWARENESS

> **외부 유입 → 가입 완료 · 30초 내 납득이 전부**

### 여정 흐름

```
P0-1: 노출
└── 트위터/X · Telegram · 추천링크 · 광고

P0-2: 랜딩 스캔 (30초)
├── 헤드라인: "내 판단 먼저, AI와 비교"
└── 즉시 비교표: "기존 AI 시그널 봇 vs WTD"

P0-3: 차별화 납득 ⚡
├── 인터랙티브 미니 데모
│   유저가 방향 선택 → 즉시 합의율 시뮬레이션
└── "이건 좀 다르다" 라는 인식 획득

P0-4: 가입
├── 이메일 + 닉네임만 (지갑 연결 없음)
└── → P1으로 전환
```

### 감정 흐름

| 행동 | 생각 | 감정 | 위험 | 대응 |
|------|------|------|------|------|
| 광고 스캔 | "또 다른 AI 봇?" | 의심 50% / 호기심 50% | 차이 불명확 | 비교표 즉시 노출 |
| 랜딩 체류 | "내 판단을 먼저 입력한다는 게 다르긴" | 호기심 상승 | 텍스트만이면 신뢰 부족 | 인터랙티브 데모 |
| 가입 결정 | "써볼 만한 것 같다" | 의지 | 지갑/KYC 강요 시 이탈 | 이메일만 요구 |

### 이탈 위험

```
🔴 지갑 연결 강요 → 즉시 이탈
🔴 차별화 불명확 (30초 내) → 이탈
🟡 가입 폼 3단계 초과 → 이탈율 급증
```

---

## 3. P1 — ONBOARDING

> **가입 완료 → 첫 실제 판 진입 · 5분 이내 목표**

### 여정 흐름

```
OB-1: Why Different (30초 애니, 스킵 불가)
└── "에이전트 먼저 보면 판단이 오염된다"
    → 독립 판단 원칙을 첫 30초에 각인

OB-2: 데모 판 ⚡ (핵심)
├── BTC 실제 차트, mock 에이전트 3개
├── 유저가 3 에이전트 드래프트 (가이드 표시)
├── 가설 입력 → 에이전트 분석 → 비교
├── CONSENSUS 1회 + DISSENT 1회 반드시 노출
│   ⚠️ CONSENSUS만 보여주면 실제 판에서
│      DISSENT가 버그로 인식됨
└── "이겼다!" 또는 "에이전트가 달랐지만 그래도 ok"

OB-3: 에이전트 풀 소개 (스킵 가능)
├── 8개 에이전트 이름 + 1줄 설명
├── OFFENSE / DEFENSE / CONTEXT 분류 표시
└── "시장 상황에 따라 조합을 바꾸세요"

OB-4: 알림 권한
├── Push 허용 요청
└── 거부 시 인앱 배지 대체

OB-5: SCANNER 대기 ⚠️
├── 첫 실제 신호 대기
├── 2분 후 수동 탐색 버튼 자동 노출
└── → 첫 실제 판 진입
```

### 감정 흐름

| 단계 | 감정 | 대응 |
|------|------|------|
| OB-1 | "설명은 지루한데..." | 30초만, 핵심만 |
| OB-2 (데모) | "오 이거 재밌다!" | 실제 차트로 몰입감 |
| OB-2 (DISSENT) | "에이전트가 나와 다르네?" | "에이전트가 항상 맞지 않음" 학습 |
| OB-5 (대기) | "언제 신호 오지...?" | 2분 후 수동 버튼 |

---

## 4. P2 — FIRST LOOP

> **첫 실제 판 → 10판 완료 · Bronze 안착 · 습관 형성 · LP 0→200**

### 에이전트 시스템 경험

```
P2에서 유저가 처음 경험하는 것:

1. 드래프트 — "8개 중 3개 골라야 해? 뭘 고르지?"
   ├── 처음엔 아무거나 고름
   ├── STRUCTURE + DERIV + SENTI 같은 직감적 조합
   └── 아직 Spec은 Base만 사용 가능

2. 분석 결과 — "DERIV가 SHORT라는데 STRUCTURE는 LONG이네?"
   ├── 에이전트 간 의견 충돌 첫 경험
   └── 가중치의 의미를 처음 체감

3. 결과 — "DERIV가 맞았다! 다음엔 DERIV 가중치 높이자"
   ├── 에이전트 선호도 형성 시작
   └── "이 장에서는 이 에이전트가 좋구나" 학습

4. 10전 후 Spec 해금! — "Squeeze Hunter? 뭐가 달라지지?"
   ├── 첫 Spec 해금 알림
   └── 같은 DERIV인데 다른 성격 선택 가능
```

### Loop B (이벤트 루프) — P2부터 시작

```
SCANNER 이상 신호 감지
  ↓ Push 발송 (코인명 + 강도만, 방향 절대 없음)
유저 앱 진입 → 클린 차트
  ↓
[내 분석 먼저] → 에이전트 3개 드래프트 (60초)
  ↓
가설 입력 (방향 + 신뢰도 + 근거 태그)
  ↓ SUBMIT → 에이전트 3개 병렬 분석
결과 비교: 내 가설 ↔ 에이전트 합의
  ↓
APPROVE → [Loop C 진입]  ·  REJECT → 대기 복귀
  ↓ APPROVE 시
Passport 기록 + LP 획득 → 루프 반복
```

### 판정별 유저 경험

| 판정 | 빈도 | 유저 감정 | 이탈 위험 | 설계 대응 |
|------|------|---------|---------|---------|
| 🟢 **CONSENSUS 3/3** | 낮음 | 강한 성취감 | 없음 | +LP 애니, Perfect Read 배지 |
| 🟡 **PARTIAL 2/3** | 높음 | 애매함 | 낮음 | '2/3 합의' 명확, 이견 에이전트 강조 |
| 🔴 **DISSENT** | 중간 | 당황 | **높음 (P2)** | "에이전트가 항상 맞지 않음" + 이견 보기 |
| ⚫ **OVERRIDE** | 낮음 | 혼란 | 중간 | 사유 한 줄 필수 |

### P2 핵심 지표

```
LP: 0 → 200 (Bronze 유지)
목표: 10판 완료, Loop B 습관 형성
Spec: 10전 후 첫 A/B Spec 해금
RAG: 10건 기억 축적 → "에이전트가 뭔가 기억하는 느낌"
```

---

## 5. P3 — PROGRESSION

> **Bronze → Silver → Gold · LP 200→1200 · 전략 심화 + 멀티 포지션**

### 새로 열리는 것

```
✅ Oracle 리더보드 열람 (에이전트+Spec별 적중률)
   → "DERIV [Squeeze Hunter]가 최근 30일 72%!" 발견
   → 드래프트에 전략적 판단 가능

✅ Challenge 가능 (Gold 이상)
   → "FLOW [Whale Follower]가 SHORT인데 나는 LONG이야"
   → 에이전트에 도전 → H값 후 자동 판정

✅ Spec C 해금 가능 (30전)
   → "DERIV [Contrarian]이 열렸다!"
   → 역발상 성격 → 시장에 따라 유불리

✅ Loop D (일배치) 시작
   → 매일 00:05 UTC: 어제 결과 + 오늘 후보 + Oracle 갱신
   → 재방문 트리거
```

### 유저 성장 패턴

```
P3 초반: "Oracle 보니까 FLOW가 요즘 잘 맞네"
  → Oracle 기반 드래프트 시작

P3 중반: "상승장에서는 STRUCTURE+MACRO, 횡보에서는 VPA+ICT"
  → 시장 레짐별 조합 전략 형성

P3 후반: "DERIV [Contrarian] 써봤는데 과열장에서 대박이다"
  → Spec 선택이 전략에 포함됨

Gold 도달: "Challenge로 SENTI [Crowd Reader] 이겨서 +7 LP!"
  → Challenge가 LP 획득 수단
```

### 감정 흐름

```
P3 진입: "아 이제 좀 알겠다" (자신감)
Silver 달성: "오 실버다! 계속 가자" (성취감)
10연승: "나 좀 잘하는 건가?" (과잉 자신감 주의)
Gold 달성: "드디어 골드!" (열망 → Diamond을 향해)
5연패: "뭐지... 조합이 안 맞나" (좌절 → 조합 재고)
```

---

## 6. P4 — COMPETITION

> **Gold → Diamond · LP 1200→2200 · Season 랭킹 + 팀 매치 + LIVE**

### 새로 열리는 것

```
✅ LIVE 관전 공개 (Diamond+)
   → 내 매치를 팔로워에게 실시간 공개
   → SSE 스트리밍: 가설 → 분석 → 결과
   → 팔로워 리액션 (🔥🧊🤔⚡💀)

✅ Season 랭킹
   → 시즌별 LP 경쟁
   → TOP10 배지

✅ 팀 매치 (Arena)
   → 1 Captain + 2 Supports 구조
   → 팀원 간 드래프트 분담 가능

✅ Creator 프로필 전환
   → Passport에 캘리브레이션 추가 공개
   → 팔로워가 나의 판단 이력 열람 가능
```

### LIVE 관전 경험 (Creator 시점)

```
나 (Diamond II, @CryptoKim):

1. BTC 신호 수신 → 드래프트:
   DERIV [Squeeze Hunter] 40% + STRUCTURE [Trend Rider] 35% + MACRO 25%

2. SUBMIT → LIVE 시작 (47명 관전)

3. 에이전트 분석 중...
   팔로워 화면: "📊 DERIV 완료 · STRUCTURE 분석 중 · MACRO 대기"
   ⚠️ 에이전트 방향은 아직 미공개

4. 전체 분석 완료: "합의 2/3 · Entry Score 74"
   나: APPROVE

5. 포지션 진행: +1.24%
   팔로워 리액션: 🔥🔥🔥⚡

6. 결과: WIN! +11 LP
   이제 에이전트 방향 공개:
   "DERIV: SHORT ✅ · STRUCTURE: LONG ❌ · MACRO: SHORT ✅"
   댓글 활성화
```

### LIVE 관전 경험 (팔로워 시점)

```
팔로워 (@TraderJoe, Silver):

1. "CryptoKim이 LIVE 시작!" 알림 → 관전 진입

2. 타임라인:
   14:32 📊 가설 제출: ▲ LONG — 신뢰도 4/5
   14:32 🤖 에이전트 분석 시작...
   14:33 ✅ 분석 완료: Entry Score 74
   14:33 📋 APPROVE
   14:35 📈 포지션 오픈: $96,420
   14:48 ⚡ +1.2% (나는 🔥 리액션)
   15:10 🏁 WIN! +2.3%

3. 판 종료 후 댓글 활성화
   "Squeeze Hunter 선택이 핵심이었네!"

⚠️ 나는 읽기 전용. Creator에게 영향 주는 행동 금지.
   에이전트 방향도 Creator 결과 후에만 보임.
```

---

## 7. P5 — MASTERY

> **Diamond → Master · LP 2200+ · 소셜 루프 + 콘텐츠 생산**

### 새로 열리는 것

```
✅ RAG 기억 리뷰 화면
   → 내 에이전트별 기억 열람
   → "이건 더 이상 유효하지 않다" → 기억 삭제 가능
   → 기억 큐레이션 = 메타 전략

✅ Strategy NFT
   → 내 드래프트 조합 + Spec 세팅을 NFT로 발행
   → 다른 유저가 참조 가능

✅ Coach Review
   → 하위 티어 유저의 매치 리뷰 제공
   → "이 장에서는 이 조합이 더 나았을 거예요"

✅ LIVE 스트리밍 (고급)
   → 실시간 해설 모드
   → 드래프트 선택 이유 텍스트 공유
```

### Master 유저의 일상

```
06:00 (00:05 UTC 일배치 확인)
├── Loop D: 어제 결과 확인
│   "DERIV [Squeeze Hunter] 어제 3전 2승"
├── Oracle 갱신 확인
│   "FLOW [Smart Money]가 90일 최고 적중률"
└── 오늘 SCANNER 후보 확인
    "BTC 고래 유입 + ETH OI 급증"

09:00 (SCANNER 신호)
├── 알림: "BTC — HIGH (방향 없음)"
├── 내 드래프트:
│   DERIV [Contrarian] 40% + FLOW [Smart Money] 35% + VPA [Climax Detector] 25%
│   (과열 역이용 + 스마트머니 추적 + 볼륨 클라이맥스)
├── LIVE 시작 (120명 관전)
└── 가설 입력 → SHORT

12:00
├── 포지션 진행 중 +0.8%
├── Loop C: 중간 업데이트
│   "DERIV: OI 감소 시작 — 청산 진행 중"
├── 팔로워 리액션: 🔥🔥⚡
└── HOLD 결정

18:00
├── 결과: WIN! +2.1% → +18 LP (클러치)
├── RAG 기억 자동 저장
│   "OI 과열 + 고래 유입 멈춤 → 하락 패턴"
├── Challenge 결과: SENTI에 도전 → WIN +7 LP
└── 일일 LP: +25

21:00
├── 다른 Master의 LIVE 관전
├── "이 사람은 MACRO [Event Trader] 쓰네... FOMC 전이니까"
├── 아이디어 획득 → 내일 조합에 반영
└── Coach Review 1건 작성
    "@TraderJoe님, P3에서 이 장은 STRUCTURE 대신 VPA가 더 나아요"
```

---

## 8. 3 Loop 구조

### Loop B — 이벤트 (SCANNER 트리거)

```
┌─ SCANNER/Daemon 이상 신호 감지 ──────────────────────┐
│  ↓ Push (코인명+강도만, 방향 절대 없음)               │
│  유저 앱 진입 → 클린 차트                             │
│  ↓                                                    │
│  에이전트 3개 드래프트 (60초)                          │
│  ↓                                                    │
│  가설 입력 (방향 + 신뢰도 + 근거 태그)                │
│  ↓ SUBMIT                                             │
│  에이전트 3개 병렬 분석 (RAG 기억 포함)               │
│  ↓                                                    │
│  결과 비교: 내 가설 ↔ 에이전트 합의                   │
│  ↓                                                    │
│  APPROVE → Loop C 진입  ·  REJECT → 대기              │
│  ↓ APPROVE 시                                         │
│  Passport 기록 + LP + 에이전트 progress               │
└─ 루프 반복 ──────────────────────────────────────────┘

발생: 비정기 (SCANNER 신호 기반)
시작: P1부터 상시 동작
```

### Loop C — 포지션 (APPROVE 후)

```
┌─ APPROVE → 포지션 오픈 ─────────────────────────────┐
│  ↓                                                    │
│  실시간 PnL 추적                                      │
│  ↓                                                    │
│  중간 업데이트 (에이전트 재분석 트리거):               │
│  ├── 가격 Entry 대비 ±3% 이동                        │
│  ├── 에이전트 관련 지표 급변 (OI 급등 등)             │
│  ├── SL/TP 근접 (5% 이내)                            │
│  └── GUARDIAN Override 발동                           │
│  ↓                                                    │
│  유저 재판단: HOLD / 청산                              │
│  ↓                                                    │
│  SL/TP 도달 또는 수동 종료                            │
│  ↓                                                    │
│  결과 확정 → DS/RE/CI/FBS 계산                        │
│  → LP 보상/차감                                       │
│  → RAG 기억 저장                                      │
│  → Passport 갱신                                      │
│  → Spec 해금 체크                                     │
└──────────────────────────────────────────────────────┘

발생: APPROVE할 때마다
시작: P2부터
```

### Loop D — 일배치 (매일 00:05 UTC)

```
┌─ 00:05 UTC 배치 실행 ────────────────────────────────┐
│  ↓                                                    │
│  어제 판 결과 공개 (H값 확정된 것들)                   │
│  ↓                                                    │
│  Oracle 리더보드 갱신                                  │
│  ├── 에이전트+Spec별 적중률 재계산                    │
│  └── Wilson Score 보정                               │
│  ↓                                                    │
│  오늘 SCANNER 후보 확인                               │
│  ↓                                                    │
│  Passport 파생 지표 재계산                            │
│  (승률, 방향 정확도, IDS, 캘리브레이션)               │
│  ↓                                                    │
│  유저: "오늘은 뭘로 싸울까" → Loop B 대기             │
└──────────────────────────────────────────────────────┘

발생: 매일 1회
시작: P3부터 핵심 재방문 트리거
```

---

## 9. 에이전트 드래프트 경험 — 매치 한 판의 여정

### 유저 시점으로 본 한 판

```
━━━━━━━━━━ SCANNER 알림 수신 ━━━━━━━━━━

📱 "BTC — HIGH" (방향 없음)
   → 앱 진입

━━━━━━━━━━ PHASE 1: DRAFT (60초) ━━━━━━━━━━

화면: 8개 에이전트 풀 + 내 해금 상태

  ⚔️ OFFENSE           🛡️ DEFENSE          🌐 CONTEXT
  📊 STRUCTURE ★★      💰 DERIV ★★★       🧠 SENTI ★
  📈 VPA ★             💎 VALUATION ★      🌍 MACRO ★★
  ⚡ ICT ★             🐋 FLOW ★★

  ★ = Base만 | ★★ = Spec A/B 해금 | ★★★ = Spec C 해금

나의 선택:
  [1] DERIV [Squeeze Hunter] — 40%
      "OI 과열 감지했으니 청산 캐스케이드 전문가로"

  [2] STRUCTURE [Trend Rider] — 35%
      "기본적인 추세 확인용"

  [3] MACRO [Risk On/Off] — 25%
      "DXY 떨어지고 있으니 매크로 환경 체크"

가중치 슬라이더로 배분 완료 → 제출

━━━━━━━━━━ VS SCREEN (2초) ━━━━━━━━━━

  ⚡ @CryptoKim    VS    @TraderJoe 🐋

━━━━━━━━━━ PHASE 2: ANALYSIS (~5초) ━━━━━━━━━━

에이전트 분석 진행 중...

  💰 DERIV [Squeeze Hunter] .......... ✅ 완료
     "OI 13.2B↑ + FR 0.041% 과열 + 롱 청산 임박"
     → SHORT 78%

  📊 STRUCTURE [Trend Rider] .......... ✅ 완료
     "EMA 정배열 + RSI 상승 추세 + MTF 정렬"
     → LONG 65%

  🌍 MACRO [Risk On/Off] .............. ✅ 완료
     "DXY 하락 + S&P 강세 + Risk On 환경"
     → LONG 55%

  🧠 RAG 기억:
     "DERIV: 유사 상황 5건 중 3건 SHORT 성공"
     "STRUCTURE: 이 패턴에서 2/3 추세 지속"

  가중 합산:
  SHORT: DERIV 78% × 40% = 31.2
  LONG:  STRUCTURE 65% × 35% + MACRO 55% × 25% = 36.5
  → 약한 LONG, confidence 52%

  ⚠️ DERIV와 STRUCTURE/MACRO가 충돌!

━━━━━━━━━━ PHASE 3: HYPOTHESIS (30초) ━━━━━━━━━━

에이전트 합의: LONG 52% (2/3 LONG, 1/3 SHORT)
근데 나는 DERIV의 OI 과열이 더 신뢰감 있어...

  나의 선택: ▼ SHORT (에이전트 override!)
  신뢰도: ●●●○○ (3/5)
  근거 태그: [DERIVATIVES] [LIQUIDATION]

  → SUBMIT

  ⚠️ 이건 DISSENT! (에이전트 합의와 반대)
     맞으면: IDS 점수 상승 + DISSENT WIN 배지 + 보너스 LP
     틀리면: 그냥 패배

━━━━━━━━━━ PHASE 4: BATTLE (60초) ━━━━━━━━━━

  BTC/USDT LIVE
  Entry: $96,420
  현재: $96,180 (-0.25%)

  DS: 72  RE: 65  CI: 81
  ─────────── FBS ───────────
  [  ████████░░░░ 68 vs 64  ]

  ⏱ DECISION WINDOW (10초)
  [BUY] [SELL] [HOLD]
  → HOLD

  ... 40초 후 ...
  현재: $95,200 (-1.27%)
  → 청산 캐스케이드 시작!

━━━━━━━━━━ PHASE 5: RESULT ━━━━━━━━━━

  🏆 YOU WIN!
  BTC -2.3% in 24h

  에이전트 breakdown:
  💰 DERIV [Squeeze Hunter]: SHORT ✅ (맞음!)
  📊 STRUCTURE [Trend Rider]: LONG ❌ (틀림)
  🌍 MACRO [Risk On/Off]: LONG ❌ (틀림)

  → DERIV가 맞았다! Squeeze Hunter의 청산 캐스케이드 감지 정확

  당신의 판단: SHORT ✅
  에이전트 합의: LONG ❌
  → ⚡ DISSENT WIN! 독립 판단 성공!

  LP: +11 (일반 승리) + 5 (DISSENT WIN) = +16 LP

  Passport 갱신:
  ├── 승률: 68% → 69%
  ├── IDS: 61% → 63% (DISSENT WIN 반영)
  ├── DERIV: 49전 29승 (59%)
  └── RAG: DERIV 기억 +1건 저장

  💡 "DERIV [Squeeze Hunter] Spec C [Contrarian] 해금까지 1전!"
```

---

## 10. 감정 지도 — Phase별 유저 심리

### 전체 감정 곡선

```
감정 ↑
 기쁨  │          ★ 첫 승리      ★ Gold 달성   ★ LIVE 100명
      │         /              /              /
      │   ★ 데모/            /              /
      │  /     \  ★ 10판   /    ★ 시즌    /
      │ /       \/    \   /    TOP10    /
      ├─────────────────/──────────────/───────────→
      │          \   /        \      /
      │    ★ 첫   \ /          \  /
      │   DISSENT  ★ 3연패      ★ 5연패
      │   당황
 슬픔 │
      P0    P1    P2     P3      P4      P5
```

### 핵심 감정 전환점

| 시점 | 감정 | 트리거 | 설계 대응 |
|------|------|--------|---------|
| P1 데모 | 흥미 | 첫 드래프트 | 가이드 표시 |
| P2 첫 DISSENT | 당황 | 에이전트가 나와 반대 | "항상 맞지 않음" 메시지 |
| P2 첫 승리 | 성취 | 에이전트와 함께 맞음 | LP 애니 + Perfect Read 배지 |
| P2 3연패 | 좌절 | 잘못된 조합 | 조합 변경 제안 |
| P3 Oracle 발견 | 전략적 흥분 | "이 에이전트가 잘 맞네" | 드래프트 전략 형성 |
| P3 Spec C 해금 | 탐구 | 새로운 성격 | "이 Spec은 이런 장에서 강해요" |
| P4 LIVE 시작 | 긴장 + 자부심 | 100명 관전 | 리액션으로 피드백 |
| P4 시즌 TOP10 | 최고조 | 시즌 종료 | 배지 + 특별 보상 |
| P5 Strategy NFT | 성숙 | 전략이 자산됨 | 다른 유저가 참조 |

---

## 11. 이탈 방지 메커니즘

### Phase별 이탈 방지

| Phase | 최대 이탈 위험 | 방지 메커니즘 |
|-------|-------------|------------|
| P0 | 차별화 불명확 | 인터랙티브 데모, 비교표 즉시 |
| P1 | 첫 대기 중 알림 없음 | 2분 후 수동 버튼 |
| P2 | 첫 DISSENT + 손실 | "에이전트가 항상 맞지 않음" |
| P2 | 에이전트도 나도 틀림 | "다른 조합이면 달랐을 수 있음" |
| P3 | 승급 정체 | Challenge로 LP 획득 수단 다양화 |
| P4 | 시즌 후 동기 부족 | 다음 시즌 준비 + LIVE 콘텐츠 |

### 연패 방지

```
3연패: "잠시 쉬어가세요" 알림 + 최근 분석 요약
5연패: 에이전트 추천 조합 변경 제안
       "이 시장 레짐에서 이 조합이 더 나을 수 있습니다"
       + 유저의 드래프트 패턴 분석
7연패: 강제 휴식 없음 (유저 자율)
       LP 감소 완화 (-8 → -5)
```

### 재방문 트리거

```
Loop B: SCANNER 신호 Push → 즉각 재진입
Loop D: 매일 00:05 UTC → "어제 결과 나왔어요"
배지 진행: "PERFECT READ 3/5 — 2번 더!"
Spec 해금 임박: "DERIV Spec C까지 2전!"
Season 종료: "시즌 종료까지 3일 — 현재 15위"
```

---

## 12. 해금 타임라인 — 뭐가 언제 열리는가

### 매치 수 기반 해금

```
판 수    해금 이벤트
──────  ────────────────────────────────
  1판   첫 실제 매치 완료 → Loop B 학습
  5판   드래프트 패턴 제안 시작
 10판   에이전트별 Spec A/B 해금 가능 ⭐
        + 에이전트 통계 화면 해금
 20판   Oracle 리더보드 열람 가능
 30판   에이전트별 Spec C 해금 가능 ⭐
        + Challenge 가능 (Gold+)
 50판   LIVE 관전 공개 가능 (Diamond+)
 100판  100판 달성 배지
        + Coach Review 가능
 200판  Strategy NFT 발행 가능
        + RAG 기억 리뷰 화면
```

### LP 기반 해금 (티어)

```
LP       티어          핵심 해금
──────  ──────────    ─────────────────────────
  0     Bronze        8 에이전트 풀 (Base), Loop B
 200    Silver        멀티 포지션, Loop D
 600    Gold          Oracle, Challenge, Spec C
1,200   Diamond I     LIVE, Season 랭킹, 팀 매치
1,600   Diamond II    Creator 프로필
2,000   Diamond III   Coach Review
2,200   Master        Strategy NFT, RAG 리뷰, 전체 해금
```

### 시각화

```
[Bronze]─────[Silver]─────[Gold]─────[Diamond I]─[II]─[III]─[Master]
  0LP          200LP       600LP      1200LP              2200LP+
  │              │           │           │                   │
  Base Spec    멀티포지션  Oracle     LIVE              NFT+Coach
  Loop B       Loop D     Challenge  Season            RAG 리뷰
  8풀 접근     통계 열람   Spec C    팀 매치           전체 해금
```

---

## 부록: Passport 기록 트리거 요약

### SUBMIT 시점

| 이벤트 | 갱신 | 방식 |
|--------|------|------|
| 가설 제출 | total_hypotheses | +1 |
| 방향 제출 | direction_total | +1 |
| 신뢰도 입력 | confidence_avg | 가중 평균 |
| 드래프트 정보 | draft_history | JSONB append |

### APPROVE/REJECT 시점

| 이벤트 | 갱신 | 방식 |
|--------|------|------|
| APPROVE | total_approved | +1 |
| REJECT | total_rejected | +1 (이후 갱신 없음) |
| 합의 (3/3) | consensus_count | +1 |
| 이견 (2/3 이하) | dissent_count | +1 |
| Override | override_count | +1 |

### 포지션 종료 시점

| 이벤트 | 갱신 | 방식 |
|--------|------|------|
| 수익 마감 | win_count + total_pnl | +1 / 누적 |
| 손실 마감 | loss_count + total_pnl | +1 / 누적 |
| 방향 정확 | direction_correct | +1 |
| DISSENT + WIN | dissent_win_count | +1 |
| 에이전트별 | user_agent_progress | wins +1, matches +1 |
| Spec 해금 체크 | unlocked_specs | 조건 충족 시 추가 |
| RAG 기억 저장 | match_memories | INSERT |
| LP 변동 | lp_transactions | INSERT |

### 일배치 (00:05 UTC)

| 이벤트 | 갱신 | 방식 |
|--------|------|------|
| Oracle 갱신 | agent_accuracy_stats | 전체 재계산 |
| Passport 갱신 | win_rate, calibration 등 | 파생 지표 재계산 |

---

> **End of User Journey v1.0**
