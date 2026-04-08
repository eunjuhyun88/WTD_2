# Cogochi UIUX Architecture — v3 User Journey 기준

> **정본 설계서** | 2026-03-22
> v3 유저저니 (`cogochi_user_journey_v3.html`) 기준 전체 페이지 구조 설계

---

## 1. 전체 구조 개요

### 1.1 페르소나별 주 동선

```
BUILDER (트레이너)
  / → /onboard?path=builder → /dashboard → /terminal(선택) → /lab★★★ → /battle → /agent/[id] → /market

COPIER (임차인)
  / → /market → /copy → (선택: /onboard → agent 만들기)

RESEARCHER (연구자)
  / → /terminal → /lab/autorun → /battle/tournament → /market
```

### 1.2 매일 루프 (BUILDER 기준)

```
/dashboard → /terminal(선택) → /lab★★★(핵심, 가장 오래 머무는 곳)
  → /battle(일 5판) → battle/result(ERA REVEAL + 메모리카드)
  → /agent/[id](선택) → Lab 귀환 → Run Again
```

### 1.3 Surface 우선순위

| 순위 | Surface | 체류 시간 | 역할 |
|------|---------|----------|------|
| ★★★ | `/lab` | 최장 | 백테스트, 버전 비교, Run Again |
| ★★ | `/battle` | 중 | Lab 결과 증명, ERA 배틀 |
| ★ | `/terminal` | 선택적 | 차트 분석, Zone, 아이디어 발굴 |
| ★ | `/agent/[id]` | 선택적 | Doctrine 편집, 메모리 관리 |
| - | `/dashboard` | 짧음 | 진입점, 일일 상태 |
| - | `/market` | Phase 2 | 에이전트 마켓플레이스 |
| - | `/copy` | Phase 2 | 카피트레이딩 |

---

## 2. 네비게이션 구조

### 2.1 Header (Desktop ≥1024px)

```
┌─────────────────────────────────────────────────────────────┐
│ [Cogochi]  │  BTC/USDT $43,250  │  LAB  BATTLE  TERMINAL  AGENT  │  [SCORE 1,250]  [⚙]  [CONNECT] │
└─────────────────────────────────────────────────────────────┘
```

- **LAB**이 네비 첫 번째 (★★★ 메인 화면)
- 로고 클릭 → `/dashboard` (로그인 상태) 또는 `/` (비로그인)
- 티커: 현재 선택 페어 + 실시간 가격 (priceStore)

### 2.2 Header (Tablet 769-1024px)

```
┌────────────────────────────────────────┐
│ [Cogochi]  LAB  BATTLE  TERM  AGNT  [CONNECT] │
└────────────────────────────────────────┘
```

- 티커, 스코어 숨김
- 탭 레이블 축약

### 2.3 Bottom Nav (Mobile ≤768px)

```
┌───────────────────────────────┐
│ ⌂  ⚗LAB  ⚔BATTLE  ~TERM  @AGENT │
└───────────────────────────────┘
```

- Header: 로고 + 가격 + [CONNECT] 만 남김
- 탭은 전부 Bottom Nav로 이동
- LAB 아이콘 강조 (accent color)

### 2.4 페이지 전환 트랜지션

```
crossfade(200ms) — 같은 depth 이동 (Lab→Battle)
slide-right(250ms) — depth 증가 (목록→상세: /agent→/agent/[id])
slide-left(250ms) — depth 감소 (상세→목록: /agent/[id]→/agent)
fade(150ms) — 모달/오버레이
```

---

## 3. 페이지별 UIUX 설계

### 3.1 `/` — 랜딩 (비로그인)

**목적**: 두 ICP(BUILDER/COPIER)를 빠르게 분기

**레이아웃**:
```
┌─────────────────────────────────┐
│         [COGOCHI]               │  ← eyebrow
│   내가 만든 AI 에이전트가          │  ← Bebas Neue display
│   역사적 시장에서 싸운다           │  ← accent em
│                                 │
│   전략을 가르치고...              │  ← body text
│                                 │
│   [AI 만들기 →]  [마켓 둘러보기]    │  ← dual CTA
├─────────────────────────────────┤
│   ┌──────────── DEMO ─────────┐ │  ← 자동 재생 배틀 데모
│   │ BTC/USDT 4H   ERA:???    │ │
│   │ ████ ██ ███ █████ ██████ │ │  ← 캔들차트 + 스캔 애니메이션
│   │      [LONG +4.2%]         │ │  ← 결과 오버레이
│   │ HP ██████  CONF ████████  │ │
│   └───────────────────────────┘ │
├─────────────────────────────────┤
│   START                         │
│   두 가지 경로                    │
│   ┌──BUILDER──┐ ┌──COPIER───┐  │  ← 2-col 카드
│   │ 내 전략     │ │ 검증된 AI  │  │
│   │ AI 만들기   │ │ 구독하기   │  │
│   └────────→──┘ └────────→──┘  │
├─────────────────────────────────┤
│   CORE LOOP                     │
│   ◎Term → ◆Agent → ⬡Lab★★★    │  ← 5노드 플로우
│            → ▲Battle → ●Market  │
│          ↩ Run Again             │
└─────────────────────────────────┘
```

**데이터**: 없음 (정적 페이지, mock 캔들만)
**기존 코드 활용**: `+page.svelte` 전면 교체

### 3.2 `/onboard` — 온보딩

**목적**: 에이전트 생성 → 첫 배틀 → 감각 획득

**5-Step 플로우**:
```
Step 1: CHOOSE PATH
  ┌─────────────────────────────────┐
  │ 에이전트를 만들 방법을 선택하세요   │
  │                                 │
  │ ┌──API 연결──┐  or  ┌──Doctrine──┐│
  │ │ 🔗 거래소    │     │ 📝 직접작성  ││
  │ │ API 연결    │     │ 아키타입 선택 ││
  │ └────────────┘     └────────────┘│
  └─────────────────────────────────┘

Step 2a: API CONNECT (선택 A)
  ┌─────────────────────────────────┐
  │ 거래소 선택                       │
  │ [Binance] [OKX] [Bybit]         │
  │ API Key: [____________]          │
  │ Secret:  [____________]          │
  │                                 │
  │ [연결하기] or [건너뛰기]           │
  └─────────────────────────────────┘

Step 2b: ARCHETYPE SELECT (선택 B 또는 API 후)
  ┌─────────────────────────────────┐
  │ 아키타입을 선택하세요              │
  │                                 │
  │ ┌──ORACLE──┐ ┌──CRUSHER─┐ ┌──GUARDIAN─┐│
  │ │ 🔮        │ │ ⚡        │ │ 🛡️        ││
  │ │ 역추세    │ │ 모멘텀    │ │ 리스크    ││
  │ │ CVD/Zone  │ │ Vol/OI   │ │ ATR/R:R   ││
  │ └──────────┘ └──────────┘ └──────────┘│
  │                                 │
  │ [튜토리얼 배틀 시작 →]              │
  └─────────────────────────────────┘

Step 3: TUTORIAL BATTLE (5 bar)
  ┌─────────────────────────────────┐
  │ 튜토리얼 배틀                     │
  │                                 │
  │ ┌── 캔들차트 (5 bar) ──────────┐ │
  │ │  █  ██  █  ███  ████         │ │  ← WIN 보장
  │ │  1   2   3   4    5          │ │
  │ └──────────────────────────────┘ │
  │ HP ████████████  Bar 3/5         │
  │                                 │
  │ [LONG] [SHORT] [SKIP]           │  ← 유저 액션 (자동 WIN)
  └─────────────────────────────────┘

Step 4: ERA REVEAL
  ┌─────────────────────────────────┐
  │        ✨ ERA REVEAL ✨          │
  │                                 │
  │     2020 Black Thursday          │  ← 드라마틱 리빌
  │                                 │
  │   BTC -50% 하루 만에 폭락         │
  │   "이게 그때였다" 감각             │
  │                                 │
  │ ┌── 첫 메모리 카드 ──────────┐   │
  │ │ 🃏 Black Thursday Survivor │   │
  │ │ 극단적 공포 속 침착한 판단   │   │
  │ └──────────────────────────┘   │
  │                                 │
  │ [대시보드로 이동 →]               │
  └─────────────────────────────────┘

Step 5: COMPLETE → redirect /dashboard
```

**데이터 플로우**:
- Step 2a: `POST /api/exchange/connect` → 거래소 API 연결
- Step 2b: `POST /api/doctrine` → 초기 Doctrine 생성
- Step 3: 클라이언트 mock (서버 호출 없음, WIN 보장)
- Step 4: 클라이언트 연출 (ERA 데이터는 하드코딩)
- Step 5: `PATCH /api/profile` → onboarding_complete = true

**기존 코드 활용**: `onboard/+page.svelte` 리디자인 (구조는 유지, UX 보강)

### 3.3 `/dashboard` — 대시보드

**목적**: 로그인 후 매일 첫 진입점. 오늘 할 일을 한눈에.

**레이아웃**:
```
┌─────────────────────────────────┐
│ ┌──에이전트 상태───────────────┐ │
│ │ [아바타]  Oracle Lv.12       │ │
│ │ Doctrine: CVD Reversal v3    │ │
│ │ Stage: SILVER ██████░░ 72%   │ │
│ │ Memory: 47 cards             │ │
│ └──────────────────────────────┘ │
│                                 │
│ ┌──오늘 배틀──┐ ┌──Lab 성과──┐  │
│ │ 🎯 2 / 5    │ │ Win 68%    │  │
│ │ 3판 남음     │ │ Δ +2.1%   │  │
│ │ [배틀 시작]  │ │ [Lab 열기] │  │
│ └─────────────┘ └────────────┘  │
│                                 │
│ ┌──최근 활동────────────────────┐│
│ │ 14:30 Battle WIN +1.8%       ││
│ │ 13:15 Lab Run v3 → v4       ││
│ │ 12:00 Memory card 획득       ││
│ └──────────────────────────────┘│
│                                 │
│ ┌──임대 수익 (Phase 2)──────────┐│
│ │ 이번 주: $0.00               ││
│ │ [마켓 등록하기]               ││
│ └──────────────────────────────┘│
└─────────────────────────────────┘
```

**데이터 플로우**:
- `GET /api/profile` → 에이전트 상태
- `GET /api/battle?today=true` → 오늘 배틀 수/결과
- `GET /api/memory/[agentId]?limit=3` → 최근 메모리
- `matchHistoryStore` → 최근 활동

**기존 코드 활용**: `dashboard/+page.svelte` 전면 교체 (현재 스텁)

### 3.4 `/terminal` — 차트 터미널 (기존 유지, 확장)

**목적**: 차트 분석 + Zone 식별 + Doctrine 아이디어 발굴

**레이아웃** (기존 3패널 구조 유지):
```
┌────────────────────────────────────────────────┐
│ ┌──WarRoom──┐ │ ┌──Chart──────────┐ │ ┌──Intel──┐│
│ │ 채팅      │ │ │ TradingView     │ │ │ 분석    ││
│ │ 스캔요청   │ │ │ + Zone 오버레이  │ │ │ 시그널   ││
│ │ 시그널    │ │ │ + CVD/OI/Fund   │ │ │ 뉴스    ││
│ │           │ │ │                 │ │ │         ││
│ │           │ │ │ NEW: Doctrine   │ │ │         ││
│ │           │ │ │ idea 추출 버튼   │ │ │         ││
│ └───────────┘ │ └─────────────────┘ │ └─────────┘│
│ <──200-450──> │ <───flex 1────────> │ <─220-500─>│
└────────────────────────────────────────────────┘
```

**추가할 것**:
- Zone 오버레이 (ACCUMULATION / DISTRIBUTION / REACCUMULATION / REDISTRIBUTION)
- "Doctrine에 추가" 버튼 — 분석 결과를 `/agent/[id]` Doctrine으로 전달
- Terminal→Lab 빠른 전환 CTA

**기존 코드 활용**: `terminal/+page.svelte` (3453줄) 거의 그대로 유지
- `terminalLayoutController.ts` 이미 분리됨
- IntelPanel, WarRoom, ChartPanel 재사용

### 3.5 `/lab` ★★★ — 트레이딩 랩 (메인 화면)

**목적**: 에이전트 백테스트, 버전 비교, Run Again. 가장 오래 머무는 곳.

**레이아웃**:
```
┌─────────────────────────────────────────────────┐
│ ┌──Agent 선택 바──────────────────────────────┐  │
│ │ [Oracle v3] ▼  │  Win 68%  │  12 runs  │  Lv.12 │
│ └─────────────────────────────────────────────┘  │
│                                                  │
│ ┌──벤치마크 팩 선택─────────────────────────────┐ │
│ │ [2020 Black Thursday] [2021 Bull] [2022 Bear]│ │
│ │ [2023 Recovery] [2024 Rally] [Custom Range]  │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ ┌──백테스트 결과 ─────────────────────────────┐  │
│ │                                             │  │
│ │  ┌──BEFORE (v3)──┐  ┌──AFTER (v4)──────┐   │  │
│ │  │ Win: 64%      │  │ Win: 71% (+7%)   │   │  │
│ │  │ PnL: +8.2%    │  │ PnL: +12.4% (+4%)│   │  │
│ │  │ MaxDD: -4.1%  │  │ MaxDD: -3.2%     │   │  │
│ │  │ Sharpe: 1.2   │  │ Sharpe: 1.6      │   │  │
│ │  └───────────────┘  └──────────────────┘   │  │
│ │                                             │  │
│ │  ┌── Delta Chart ────────────────────────┐  │  │
│ │  │ ████░░░░░░░░████████░░░░████████████  │  │  │
│ │  │  v1    v2      v3          v4         │  │  │
│ │  └──────────────────────────────────────┘  │  │
│ │                                             │  │
│ └─────────────────────────────────────────────┘  │
│                                                  │
│ ┌──액션 바──────────────────────────────────────┐│
│ │ [Doctrine 수정] [Run Again ★] [Battle로 증명] ││
│ └──────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

**핵심 인터랙션**:
1. 벤치마크팩 선택 → 자동 백테스트 실행
2. Before/After delta 비교 (이전 버전 vs 현재)
3. **Run Again** → Doctrine 미세 조정 → 재실행 (핵심 루프)
4. "Battle로 증명" → `/battle` 이동 (Lab 결과 기반)

**데이터 플로우**:
- `GET /api/doctrine?agentId=X` → 현재 Doctrine
- `POST /api/battle` (action: 'backtest') → 백테스트 실행
- `GET /api/memory/[agentId]?kind=MATCH_SUMMARY` → 과거 버전 비교
- `arenaWarStore` 또는 새 `labStore` → 백테스트 상태 관리

**기존 코드 활용**:
- `lab/+page.svelte` (794줄) — 이미 에이전트 목록 + Doctrine 뷰가 있음
- `arena/+page.svelte` (4236줄)의 분석/가설 로직 일부 추출
- `v2BattleEngine` → 백테스트 엔진으로 활용 가능
- `indicators.ts` → 그대로 사용

### 3.6 `/agent` — 에이전트 목록

**목적**: 내 에이전트 목록 + 신규 생성 진입점

**레이아웃**:
```
┌─────────────────────────────────┐
│ MY AGENTS                       │
│                                 │
│ ┌──Agent Card──────────────┐   │
│ │ [아바타] Oracle Lv.12    │   │
│ │ Win 68% │ 47 memories    │   │
│ │ Stage: SILVER            │   │
│ │ [관리] [Lab에서 훈련]     │   │
│ └──────────────────────────┘   │
│                                 │
│ ┌──Agent Card──────────────┐   │
│ │ [아바타] Crusher Lv.5    │   │
│ │ Win 52% │ 12 memories    │   │
│ │ Stage: BRONZE            │   │
│ │ [관리] [Lab에서 훈련]     │   │
│ └──────────────────────────┘   │
│                                 │
│ ┌─── + 새 에이전트 ─────────┐  │
│ │      + Create Agent       │  │
│ └───────────────────────────┘  │
└─────────────────────────────────┘
```

**기존 코드 활용**: `agents/+page.svelte` (746줄) + `agent/+page.svelte` (256줄)

### 3.7 `/agent/[id]` — 에이전트 HQ

**목적**: Doctrine 편집, 메모리 카드 관리, 버전 히스토리

**레이아웃**:
```
┌─────────────────────────────────────────────┐
│ ← AGENTS   Oracle Lv.12   SILVER ██████░░   │  ← breadcrumb + 상태
│                                              │
│ ┌──TAB: [Doctrine] [Memory] [History] [Record]│
│ │                                            │
│ │ === Doctrine 탭 ===                        │
│ │ ┌──가중치 슬라이더────────────────────────┐│
│ │ │ CVD Divergence  ████████░░░░  72%       ││
│ │ │ MVRV Zone       ██████░░░░░░  58%       ││
│ │ │ Funding Flip    █████░░░░░░░  45%       ││
│ │ │ Volume Spike    ████████████  90%       ││
│ │ │ BB Squeeze      ██████████░░  82%       ││
│ │ │ OI Surge        ███████░░░░░  65%       ││
│ │ └─────────────────────────────────────────┘│
│ │                                            │
│ │ ┌──현재 설정 요약──────────────────────────┐│
│ │ │ Style: 역추세 + 변동성 필터              ││
│ │ │ R:R Minimum: 1.5                        ││
│ │ │ Max Position: 3%                        ││
│ │ └─────────────────────────────────────────┘│
│ │                                            │
│ │ [저장] [Lab에서 테스트]                      │
│ │                                            │
│ │ === Memory 탭 ===                          │
│ │ ┌──Memory Card Grid──────────────────────┐│
│ │ │ 🃏 Black Thursday │ 🃏 Bull Trap        ││
│ │ │ 🃏 Funding Flip   │ 🃏 Range Break      ││
│ │ │ 🃏 Vol Expansion  │ 🃏 MVRV Reset       ││
│ │ └─────────────────────────────────────────┘│
│ │ Showing 6 of 47 cards                      │
│ │                                            │
│ │ === History 탭 ===                         │
│ │ v4 — Win 71%, PnL +12.4%  (current)       │
│ │ v3 — Win 64%, PnL +8.2%   2일 전           │
│ │ v2 — Win 58%, PnL +5.1%   5일 전           │
│ │ v1 — Win 42%, PnL -2.3%   7일 전           │
│ │                                            │
│ │ === Record 탭 ===                          │
│ │ 최근 10 배틀 결과                            │
│ │ ● WIN +2.1%  ERA: 2021 Bull   14:30       │
│ │ ● WIN +0.8%  ERA: 2022 Bear   13:15       │
│ │ ○ LOSS -1.2% ERA: 2020 Crash  12:00       │
│ └────────────────────────────────────────────┘│
└──────────────────────────────────────────────┘
```

**데이터 플로우**:
- `GET /api/doctrine?agentId=X` → Doctrine 가중치
- `PATCH /api/doctrine` → 가중치 수정
- `GET /api/memory/[agentId]` → 메모리 카드 목록
- `GET /api/battle?agentId=X` → 배틀 기록

**기존 코드 활용**:
- `passport/+page.svelte` (2688줄)의 Agents 탭 → Doctrine/Memory 탭으로 변환
- `agentData` store → 에이전트 상태
- `matchHistoryStore` → 배틀 기록

### 3.8 `/battle` — 배틀 아레나

**목적**: Lab에서 훈련한 결과를 역사 데이터로 증명. 일 5판 제한.

**레이아웃**:
```
┌──────────────────────────────────────────────┐
│ ┌──Battle HUD──────────────────────────────┐ │
│ │ ERA: ???  │  Bar 7/30  │  HP ████████░░  │ │
│ │ SL: -2%  │  TP: +4%   │  R:R 2.0       │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ ┌──캔들차트 (Canvas) ──────────────────────┐ │
│ │                                          │ │
│ │  ████ ██ ███ █████ ██████ ████ ██ ███   │ │
│ │                                          │ │
│ │  ── CVD ────────────────────────────     │ │
│ │  ── Volume ─────────────────────────     │ │
│ │                                          │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ ┌──Agent 판단 패널─────────────────────────┐ │
│ │ AI: "CVD divergence detected. Zone..."   │ │
│ │ Confidence: 78%                          │ │
│ │ Suggested: LONG                          │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ ┌──유저 액션─────────────────────────────┐   │
│ │  [LONG]    [SHORT]    [SKIP]           │   │
│ └────────────────────────────────────────┘   │
│                                              │
│ === 배틀 종료 시 ===                          │
│ ┌──Result Overlay────────────────────────┐  │
│ │ ✨ ERA REVEAL: 2021 Bull Run           │  │
│ │ Result: WIN +3.2%                      │  │
│ │ 🃏 New Memory Card: "Bull Accumulation" │  │
│ │ HP: 78% → 82%                          │  │
│ │ [다음 배틀] [Lab으로] [에이전트 확인]    │  │
│ └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

**핵심 인터랙션**:
1. 캔들 1개씩 공개 → 유저 LONG/SHORT/SKIP
2. 에이전트도 동시 판단 (AI vs Human 비교)
3. 30 bar 후 결과 → ERA REVEAL → 메모리 카드 획득
4. HP 시스템: 틀리면 감소, 0이면 배틀 종료
5. 일 5판 제한 → 남은 횟수 표시

**데이터 플로우**:
- `POST /api/battle` (action: 'start') → 배틀 시작 (서버에서 ERA 결정)
- `POST /api/battle/tick` → 매 캔들 판단 제출
- `GET /api/memory/[agentId]` → AI 판단용 메모리 검색 (L2 Search)
- engine/v4/battleStateMachine → 클라이언트 상태 관리
- server/memory/ → L0/L1/L2 메모리 시스템

**기존 코드 활용**:
- `arena-war/` 7-phase 컴포넌트 → 배틀 UI로 변환
- `arenaWarStore` → battleStore로 리네임/리팩터
- `engine/v4/battleStateMachine.ts` (sweet-ardinghelli) → 그대로 사용
- `server/memory/` (sweet-ardinghelli) → 그대로 사용
- `BattleCanvas.svelte` (539줄) → 캔들차트 렌더링 활용
- `HumanCallPhase.svelte` (921줄) → LONG/SHORT/SKIP UI 활용

### 3.9 `/market` — 마켓플레이스 (Phase 2)

**목적**: 증명된 에이전트 탐색 + 구독

**레이아웃**:
```
┌─────────────────────────────────┐
│ MARKETPLACE                     │
│ ┌──필터바───────────────────┐   │
│ │ [승률 ▼] [낙폭 ▼] [가격 ▼]│   │
│ └───────────────────────────┘   │
│                                 │
│ ┌──Agent Card List──────────┐  │
│ │ Oracle_김  Win72% MDD-3%  │  │
│ │ Crusher_박 Win65% MDD-5%  │  │
│ │ Guardian_이 Win80% MDD-1% │  │
│ └───────────────────────────┘  │
│                                 │
│ 각 카드 클릭 → 상세 + [구독] CTA│
└─────────────────────────────────┘
```

**기존 코드 활용**: `signals/+page.svelte` (983줄) → 마켓 UI로 변환

### 3.10 `/copy` — 카피트레이딩 (Phase 2)

**목적**: 구독 에이전트의 실시간 포지션 + 손익 추적

**기존 코드 활용**: `copyTradeStore`, `/api/copy-trades/*`

### 3.11 `/passport` — Passport (Phase 2)

**목적**: ERC-8004 온체인 트랙레코드

---

## 4. 공유 컴포넌트 체계

### 4.1 기존 유지 (재사용)
| 컴포넌트 | 위치 | 사용처 |
|---------|------|-------|
| Header | layout/ | 전역 |
| BottomBar | layout/ | 전역 (desktop) |
| MobileBottomNav | layout/ | 전역 (mobile) |
| WalletModal | modals/ | 전역 |
| NotificationTray | shared/ | 전역 |
| ToastStack | shared/ | 전역 |
| P0Banner | shared/ | 전역 |
| TokenDropdown | shared/ | terminal, lab |
| ContextBanner | shared/ | lab, dashboard |

### 4.2 새로 만들 컴포넌트
| 컴포넌트 | 위치 | 사용처 |
|---------|------|-------|
| AgentCard | shared/ | dashboard, agent목록, lab |
| MemoryCard | shared/ | agent/[id], battle결과 |
| DoctrineEditor | agent/ | agent/[id], onboard |
| BenchmarkPicker | lab/ | lab |
| DeltaChart | lab/ | lab |
| CandleBattle | battle/ | battle, onboard튜토리얼 |
| EraReveal | battle/ | battle결과, onboard |
| PathCard | home/ | 랜딩 |
| StepProgress | onboard/ | 온보딩 |

### 4.3 기존 → 변환 컴포넌트
| 기존 | 새 역할 | 변환 방법 |
|------|--------|----------|
| arena-war/HumanCallPhase | battle/BattleDecision | LONG/SHORT/SKIP UI 추출 |
| arena-war/BattleCanvas | battle/CandleBattle | 캔들 렌더링 추출 |
| arena-war/ResultPhase | battle/BattleResult | ERA REVEAL + 결과 |
| passport/AgentsTab | agent/AgentDetail | Doctrine + Memory 탭 |

---

## 5. 스토어 체계

### 5.1 기존 유지
| 스토어 | 역할 | 소비처 |
|--------|------|-------|
| priceStore | 실시간 가격 | Header, terminal, lab |
| walletStore | 지갑 연결 | Header, onboard |
| gameState | 전역 상태 (pair, score) | Header, 전역 |
| notificationStore | 알림 | 전역 |
| agentData | 에이전트 스탯 | agent, lab, dashboard |
| matchHistoryStore | 매치 기록 | agent, dashboard |
| quickTradeStore | 퀵트레이드 | terminal |

### 5.2 새로 만들 스토어
| 스토어 | 역할 | 소비처 |
|--------|------|-------|
| labStore | 백테스트 상태, 벤치마크팩, delta | lab |
| battleStore | 배틀 상태 (HP, bar, ERA) | battle |
| doctrineStore | Doctrine CRUD | agent/[id], lab, onboard |
| onboardStore | 온보딩 진행 상태 | onboard |

### 5.3 삭제/archive 후보
| 스토어 | 이유 |
|--------|------|
| arenaWarStore | → battleStore로 대체 |
| arenaV2State | → 사용 안 함 |
| warRoomStore | terminal에서만 사용, 축소 |
| predictStore | Polymarket → Phase 2 |
| battleFeedStore | → battleStore에 통합 |

---

## 6. API 매핑

### 6.1 기존 API 재사용
| API | 역할 | 소비처 |
|-----|------|-------|
| `/api/auth/*` | 인증 | onboard, 전역 |
| `/api/profile` | 유저 프로필 | dashboard |
| `/api/agents/stats` | 에이전트 스탯 | agent, lab |
| `/api/terminal/scan` | 터미널 스캔 | terminal |
| `/api/arena-war/rag` | RAG 검색/저장 | battle |
| `/api/market/*` | 시장 데이터 | terminal |
| `/api/quick-trades/*` | 퀵트레이드 | terminal |

### 6.2 새 API (sweet-ardinghelli에서 작업)
| API | 역할 | 소비처 |
|-----|------|-------|
| `/api/battle` | 배틀 시작/결과 | battle |
| `/api/battle/tick` | 매 캔들 판단 | battle |
| `/api/doctrine` | Doctrine CRUD | agent/[id], onboard |
| `/api/exchange/connect` | 거래소 연결 | onboard |
| `/api/memory/[agentId]` | 메모리 카드 | agent/[id], battle |
| `/api/marketplace/*` | 마켓플레이스 | market (Phase 2) |

---

## 7. 구현 순서 (v3 우선순위)

| Sprint | 페이지 | 의존성 | 기간 |
|--------|--------|--------|------|
| **1** | `/` + `/onboard` | 없음 | 1일 |
| **2** | `/agent/[id]` + `/agent` | `/api/doctrine`, `/api/memory` | 2일 |
| **3** | `/lab` ★★★ | `/api/battle`(backtest), `labStore`, DoctrineEditor | 3일 |
| **4** | `/battle` | `battleStore`, engine/v4, CandleBattle | 3일 |
| **5** | `/dashboard` | 모든 API가 있어야 의미 있음 | 1일 |
| **6** | `/market` + `/copy` | Phase 2 | 추후 |

### Sprint 1-2: 프론트엔드 에이전트 (이 세션)
### Sprint 2-4: 백엔드 에이전트 (sweet-ardinghelli) — API 구현
### Sprint 3-5: 프론트엔드 에이전트 — Lab + Battle UI

---

## 8. 삭제/Archive 대상

| 대상 | 이유 | 처리 |
|------|------|------|
| `/arena` (4236줄) | → `/lab`으로 대체 | archive 후 삭제 |
| `/arena-v2` (262줄) | → 사용 안 함 | 삭제 |
| `/arena-war` (67줄) | → `/battle`로 대체 | 컴포넌트만 재사용 |
| `/signals` (983줄) | → `/market`로 대체 | archive 후 변환 |
| `/oracle` (37줄) | → 리다이렉트만 | 삭제 |
| `/holdings` (10줄) | → 리다이렉트만 | 삭제 |
| components/arena/ | ChartPanel만 추출 후 삭제 |
| components/arena-v2/ | BattleScreen 일부 참고 후 삭제 |
