# UI/UX 전면 개편 — 상세 설계

## Context
17개 라우트 중 릴리즈 서피스는 5개. 라우트 과다, Agent HQ 분산, Create 4단계 이탈, Terminal 과밀, Arena 혼란, Readiness 불가시 문제를 7단계로 해결.

---

## 전체 유저 저니 (개편 후)

```
[첫 방문 유저]
Home ──(Start Mission)──> Create (2단계)
  Step 1: 리드 선택 + 이름
  Step 2: 성장 방향 (Brain 자동)
  ──(Activate)──> 완료 화면 ──(Enter Terminal)──>

Terminal ──(Readiness 3/3 달성)──> Arena 진입 가능
  화면 상단: "Arena Readiness: 2/3" 표시
  우측 패널 처음엔 접힘 (INTEL 라벨만 보임)
  F키: 포커스 모드 (차트만)

Arena ──(배틀 완료)──> 결과 화면 ──(Review)──>
  로비: 첫 유저는 "Quick Start" 버튼
  뷰: Chart War / Mission Control (2개만 기본)
  첫 세션: PhaseGuide 오버레이

Agent HQ ──(탭 전환)──> Overview / Train / Record
  Train = 기존 /lab 내용 흡수
  Record = 기존 /passport 내용 흡수
```

---

## Phase 1: 라우트 통합

### 유저가 보는 변화
- `/lab` 접속 → `/agent?tab=train`으로 자동 이동 (화면 깜빡임 없음)
- `/passport` 접속 → `/agent?tab=record`로 자동 이동
- `/agents`, `/world`, `/arena-war`, `/arena-v2` → 각각 적절한 메인 라우트로 이동
- 네비게이션 바에서 레거시 라우트 링크 제거

### Agent HQ 탭 내부 동작

**Train 탭 (기존 /lab 흡수)**
현재 `/agent?tab=train`에 이미 있는 것:
- StrategyVariantWorkbench (전체폭 카드)
- Brain setup 카드 (모델/독트린/메모리/학습레벨)
- Readiness gates 카드 (3개 체크박스 + Open Terminal/Open World 버튼)
- Growth focus drill 카드 (3개 드릴)
- Next loop queue 카드 (3개 액션)

추가할 것 (/lab에서 가져올 것):
- 에이전트 셀렉터 (리드 + 크루 전환)
- Doctrine/Memory/Release 워크벤치 카드
→ `LabView.svelte` 컴포넌트로 추출하여 기존 Train 탭 콘텐츠 아래에 배치

**Record 탭 (기존 /passport 흡수)**
현재 `/agent?tab=record`에 이미 있는 것:
- Proof ledger 카드 (매치수/승률/연승/PnL)
- Recent proof 카드 (최근 4개 매치)
- Release readiness 카드 (4개 게이트 + wallet 버튼)

추가할 것 (/passport에서 가져올 것):
- Holdings 패널 (라이브 가격 동기화 + PnL 계산)
- Positions 패널 (오픈/클로즈드 트레이드)
- Profile 패널 (유저 스탯/뱃지/티어)
- Arena stats 패널 (매치 히스토리 + 승률 분석)
- AI Learning 패널 (학습 상태/데이터셋/평가)
→ `RecordView.svelte`로 추출, 서브탭 형태로 구성:
  - [Proof] 기존 record 탭 내용
  - [Holdings] 홀딩스 + 포지션
  - [Profile] 프로필 + 뱃지
  - [Learning] AI 학습 파이프라인

### 수정 파일
| 파일 | 변경 내용 |
|------|----------|
| `src/routes/lab/+page.svelte` | 전체 → `onMount(() => goto('/agent?tab=train', { replaceState: true }))` |
| `src/routes/passport/+page.svelte` | 전체 → `onMount(() => goto('/agent?tab=record', { replaceState: true }))` |
| `src/routes/agents/+page.svelte` | 전체 → `goto('/agent')` 리다이렉트 |
| `src/routes/world/+page.svelte` | 전체 → `goto('/terminal')` 리다이렉트 |
| `src/routes/arena-war/+page.svelte` | 전체 → `goto('/arena')` 리다이렉트 |
| `src/routes/arena-v2/+page.svelte` | 전체 → `goto('/arena')` 리다이렉트 |
| **신규** `src/components/agent/LabView.svelte` | /lab 콘텐츠 추출 |
| **신규** `src/components/agent/RecordView.svelte` | /passport 콘텐츠 추출 (서브탭 포함) |
| `src/routes/agent/+page.svelte` | Train 탭에 LabView 임포트, Record 탭에 RecordView 임포트 |
| `src/lib/navigation/appSurfaces.ts` | activePatterns 정리 |
| `src/routes/+layout.svelte` | isFixedViewportRoute 조건 정리 |

---

## Phase 2: Create 플로우 단순화

### 현재 4단계 → 개편 후 2단계

**현재 (4단계)**:
```
[Step 0: Crew] 핀된 크루에서 리드 선택 → shell-grid 3장 카드
[Step 1: Identity] 에이전트 이름 입력 → 인풋 + identity-card
[Step 2: Growth] 성장 방향 3개 중 택1 → option-grid 3장
[Step 3: Brain] 모델소스 3개 + 독트린 3개 + 지갑(옵션) → 6장 카드 + wallet-card
```

**개편 후 (2단계)**:
```
[Step 1: "리드 선택"]
┌─────────────────────────────────────────────┐
│ 01 리드선택 (active)  │  02 경로설정         │  ← 스텝 스트립 (2칸)
├─────────────────────────────────────────────┤
│ STEP 1                                      │
│ Choose the lead and name it                 │
│                                             │
│ ┌────────┐ ┌────────┐ ┌────────┐           │  ← 핀된 크루 셸 카드
│ │ DuckeeG│ │ DuckeeB│ │ HootOw│           │     (현재 Step 0과 동일)
│ │  LEAD  │ │ Bench  │ │ Bench  │           │
│ └────────┘ └────────┘ └────────┘           │
│                                             │
│ Agent Name: [___New Agent___] 3/24          │  ← 이름 인풋 (현재 Step 1)
│                                             │
│ [Back to Home]              [Next →]        │
└─────────────────────────────────────────────┘

진행 조건: shellId 선택 + 이름 2자 이상
```

```
[Step 2: "경로 설정"]
┌─────────────────────────────────────────────┐
│ 01 리드선택 (done)  │  02 경로설정 (active)  │
├─────────────────────────────────────────────┤
│ STEP 2                                      │
│ Choose how this companion should grow       │
│                                             │
│ ┌──────────────┐ ┌──────────────┐ ┌────────│  ← 성장 방향 3장
│ │ Signal Hunter│ │ Risk Keeper  │ │ Memory │     (현재 Step 2와 동일)
│ │  ✓ selected  │ │              │ │ Garden │
│ └──────────────┘ └──────────────┘ └────────│
│                                             │
│ Training consequence: Sharpen direction...  │  ← activation-card
│                                             │
│ ▸ Advanced settings                         │  ← 접힌 섹션 (토글)
│   ┌─ Starter brain ─────────────────────┐  │     펼치면:
│   │ [OpenAI✓] [HOOT] [Custom]           │  │     - 모델소스 3장
│   └─────────────────────────────────────┘  │     - 독트린 3장
│   ┌─ Mission temperament ───────────────┐  │     (현재 Step 3 내용)
│   │ [Balanced✓] [Aggressive] [Defensive]│  │
│   └─────────────────────────────────────┘  │
│                                             │
│ [← Back]              [Activate Agent]      │  ← 바로 활성화
└─────────────────────────────────────────────┘

진행 조건: growthFocus 선택
기본값: modelSource='openai', doctrineId='balanced' (자동 세팅)
Advanced 안 열어도 활성화 가능
```

**활성화 후 완료 화면** (현재와 동일):
```
┌──────────────────────┐ ┌──────────────┐
│ Activation Complete  │ │  Lead card   │
│ {agentName}          │ │  [sprite]    │
│ Terminal unlocked... │ │  {name}      │
│ [Enter Terminal]     │ │  {growth}    │
│ [Open Agent HQ]      │ │  {crew pills}│
│ [Start Over]         │ │              │
└──────────────────────┘ └──────────────┘
```

### 코드 변경 상세

`src/routes/create/+page.svelte`:
- `stepTitles` 배열: `['Crew', 'Identity', 'Growth', 'Brain']` → `['Lead', 'Path']`
- `.step-strip` CSS: `grid-template-columns: repeat(4, ...)` → `repeat(2, ...)`
- Step 0 렌더링: 기존 Step 0 (crew selection) + Step 1 (name input) 합침
  - crew-banner + shell-grid 그대로
  - 아래에 field-card (이름 인풋) 추가
- Step 1 렌더링: 기존 Step 2 (growth) + Step 3 (brain) 합침
  - option-grid (성장 방향) 그대로
  - activation-card 그대로
  - **새로 추가**: `<details>` 태그로 "Advanced settings" 접힘 섹션
    - 내부: 기존 모델소스 option-grid + 독트린 option-grid
    - wallet-card는 제거 (헤더의 지갑 연결로 충분)
- `canAdvance` 로직:
  - Step 0: `Boolean(shellId) && agentName.trim().length >= 2`
  - Step 1: `Boolean(growthFocus)` (modelSource/doctrineId는 기본값 있으므로 항상 true)
- 마지막 스텝 버튼: "Activate Agent" (현재와 동일)
- `goNext()`: `currentStep >= 1` 이면 return (2단계이므로)

`src/lib/stores/agentJourneyStore.ts`:
- `setDraft()` 호출 시 modelSource/doctrineId 기본값 보장

### 플로우 연결
- 활성화 후 "Enter Terminal" → `buildTerminalLink({ entry: 'create', agent: journey.agentName })`
- 활성화 후 "Open Agent HQ" → `buildAgentLink({ source: 'create' })`
- "Start Over" → `agentJourneyStore.reset()` + 로컬 상태 초기화

---

## Phase 3: Terminal UX 개선

### 현재 동작
- 데스크탑: 3패널 (WarRoom | Chart | Intel) 모두 열림
- 태블릿: 좌측+하단 분할
- 모바일: 탭 전환 (warroom/chart/intel)

### 개편 후 동작

**3A. 첫 방문 시 우측 패널 접힘**
```
[처음 Terminal 진입 시]
┌──────────────┬─────────────────────────┬────┐
│              │                         │INTE│ ← 세로 라벨 (28px)
│  WAR ROOM    │     CHART PANEL         │ L  │    클릭하면 Intel 펼침
│  (열림)      │     (넓게)              │    │
│              │                         │    │
└──────────────┴─────────────────────────┴────┘

[Intel 라벨 클릭 후]
┌──────────────┬────────────────┬─────────────┐
│              │                │             │
│  WAR ROOM    │  CHART PANEL   │ INTEL PANEL │
│  (열림)      │  (축소)        │ (열림)      │
│              │                │             │
└──────────────┴────────────────┴─────────────┘
```

구현:
- `src/routes/terminal/+page.svelte` 내 `rightCollapsed` 초기값 변경
- localStorage에 `sc_terminal_visited` 키 확인 → 없으면 `rightCollapsed = true`
- 첫 수동 토글 시 `sc_terminal_visited = 'true'` 저장

**3B. 접힌 패널 디스커버리 라벨**
```
접힌 상태:
┌────┐
│ W  │ ← 28px 너비, writing-mode: vertical-rl
│ A  │    배경: rgba(173,202,124,0.06)
│ R  │    테두리: 좌측 2px solid accent
│    │    hover: 배경 밝아짐
│ R  │    클릭: toggleLeft() / toggleRight()
│ O  │
│ O  │
│ M  │
└────┘
```

구현: 기존 collapse 토글 버튼 영역을 세로 라벨 스트립으로 교체
- 현재: 버튼 하나 (≪ / ≫)
- 개편: 28px 세로 스트립 + 텍스트 "WAR ROOM" / "INTEL"

**3C. 포커스 모드**
```
[일반 모드]
MissionFlowShell (Create→Train→Arena 진행바)
┌──────┬────────────────────┬──────┐
│ WAR  │      CHART         │INTEL │
│ ROOM │                    │      │
└──────┴────────────────────┴──────┘

[포커스 모드 (F키 또는 버튼)]
┌──────────────────────────────────┐
│                                  │
│           CHART ONLY             │  ← 전체 뷰포트
│                                  │
│    [Exit Focus: F]  ← 좌상단    │
└──────────────────────────────────┘
```

구현:
- `let focusMode = $state(false)` 추가
- `keydown` 이벤트에서 `F` 키 감지 → `toggleFocusMode()`
- `focusMode === true`: leftCollapsed=true, rightCollapsed=true, MissionFlowShell 숨김
- 차트 영역 위에 작은 "Exit Focus (F)" 버튼 오버레이

**3D. Readiness 표시 (Phase 5와 연결)**
```
MissionFlowShell 영역에 메트릭 추가:
┌──────────────────────────────────────────────┐
│ 01 Create ✓  │ 02 Train (active) │ 03 Arena │
│ Mission > Train the lead                     │
│ Readiness: 2/3  │  Gates: Model ✓ Doctrine ✓ Validation ✗  │
└──────────────────────────────────────────────┘
```

현재 MissionFlowShell에 이미 `metrics` prop이 있음. 사용:
```ts
<MissionFlowShell
  step="train"
  title="..."
  summary="..."
  metrics={[
    { label: 'Readiness', value: `${readinessCount}/3` },
    { label: 'Model', value: journey.readiness.modelLinked ? '✓' : '—' },
    { label: 'Doctrine', value: journey.readiness.doctrineSet ? '✓' : '—' },
    { label: 'Validation', value: journey.readiness.firstValidationRun ? '✓' : '—' },
  ]}
/>
```

### 수정 파일
| 파일 | 변경 |
|------|------|
| `src/routes/terminal/+page.svelte` | 첫방문 패널접힘, 세로라벨, 포커스모드, readiness metrics |
| `src/lib/stores/storageKeys.ts` | `TERMINAL_VISITED` 키 추가 |
| **신규** `src/lib/utils/breakpoints.ts` | 공유 브레이크포인트 |

---

## Phase 4: Arena 플로우 정리

### 현재 Lobby 동작
- PVE/PVP/Tournament 모드 선택
- SquadConfig (리스크/타임프레임/레버리지)
- ViewPicker: Chart War / Agent Arena / Mission Control / Card Duel (4개)
- 최근 매치 3개 표시

### 개편 후 Lobby

**첫 유저 (matchN === 0)**:
```
┌──────────────────────────────────────────────┐
│                ARENA LOBBY                    │
│                                              │
│  Ready to prove your agent?                  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  ⚡ QUICK START                        │  │  ← 큰 버튼
│  │  PVE mode · Default squad · 5min      │  │     클릭 → 즉시 DRAFT 진입
│  │  Start your first proof run now        │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  or customize your match setup ▸             │  ← 텍스트 링크
│  (클릭하면 기존 풀 로비 펼침)               │
└──────────────────────────────────────────────┘
```

**리턴 유저 (matchN > 0)**:
```
┌──────────────────────────────────────────────┐
│  MODE: [PVE ✓] [PVP 🔒10] [TOURNAMENT 🔒]  │
│                                              │
│  VIEW: [Chart War ✓] [Mission Control]       │  ← 2개만 기본
│         [▸ Show all views]                   │     토글하면 4개
│                                              │
│  Recent: Match #5 WIN +12LP │ #4 LOSS -8LP  │
│                                              │
│  [Start Match]                               │
└──────────────────────────────────────────────┘
```

### ViewPicker 동작
- 기본 2개: Chart War, Mission Control
- "Show all views" 토글 → Agent Arena, Card Duel 추가 노출
- 성장 방향별 기본 뷰 자동 선택:
  - signalHunter → Chart War (차트 중심 분석)
  - riskKeeper → Mission Control (리스크 관리 대시보드)
  - memoryGardener → Chart War (패턴 인식)

### 첫 세션 PhaseGuide
```
[첫 Arena 세션 시]
┌──────────────────────────────────────────┐
│ 📋 PHASE GUIDE (첫 세션용 오버레이)       │
│                                          │
│ Phase 1: DRAFT                           │
│ → Select your squad for this match       │
│                                          │
│ Phase 2: ANALYSIS                        │
│ → Agents scan the market for signals     │
│                                          │
│ Phase 3: HYPOTHESIS                      │
│ → Submit your direction call (LONG/SHORT)│
│                                          │
│ Phase 4: BATTLE                          │
│ → Watch price action + agent reactions   │
│                                          │
│ Phase 5: RESULT                          │
│ → See your LP gain/loss                  │
│                                          │
│ [Got it, start the match]                │
└──────────────────────────────────────────┘
```

- `localStorage sc_arena_first_session` 키로 첫 세션 판별
- 첫 세션: PhaseGuide를 모달 오버레이로 표시 (닫으면 localStorage에 저장)
- 이후: PhaseGuide는 화면 우하단 작은 아이콘으로 축소

### 수정 파일
| 파일 | 변경 |
|------|------|
| `src/components/arena/Lobby.svelte` | Quick Start 버튼, 첫유저/리턴유저 분기 |
| `src/components/arena/ViewPicker.svelte` | 2개 기본 + "Show all" 토글 |
| `src/routes/arena/+page.svelte` | 성장방향별 기본 뷰, PhaseGuide 첫세션 로직 |
| `src/components/arena/PhaseGuide.svelte` | 오버레이 모드 추가 |
| `src/lib/stores/storageKeys.ts` | `ARENA_FIRST_SESSION` 키 추가 |

---

## Phase 5: Readiness & 진행도 가시성

### Home 상태 인식 CTA

현재 Home CTA:
```
[Start Mission / Continue Mission] [Resume Training] [Enter Arena]
→ 항상 3개 버튼 고정 노출
```

개편 후 — 상태별 동적 CTA:

**상태 A: 에이전트 없음 (journey.minted === false)**
```
┌──────────────────────────────────────────┐
│ Draft the crew. Raise the lead.          │
│                                          │
│ ┌─ JOURNEY STATUS ─────────────────────┐ │
│ │ Step 1 of 3: Create your first agent │ │  ← 새로 추가되는 진행 표시
│ └──────────────────────────────────────┘ │
│                                          │
│ [Start Mission →]                        │  ← 프라이머리 1개만
│  Create your first AI companion          │
└──────────────────────────────────────────┘
```

**상태 B: 생성 완료, Readiness 미달 (minted && !terminalReady)**
```
│ ┌─ JOURNEY STATUS ─────────────────────┐ │
│ │ Step 2 of 3: Train in Terminal       │ │
│ │ Arena Readiness: 1/3                 │ │
│ │ ☐ Model ✓  ☐ Doctrine ✓  ☐ Valid ✗ │ │  ← 게이트 상태 인라인
│ └──────────────────────────────────────┘ │
│                                          │
│ [Resume Training →]                      │  ← 프라이머리
│  Complete 1 more gate to unlock Arena    │
│ [Enter Arena 🔒]                         │  ← 비활성 (회색)
```

**상태 C: Readiness 완료 (terminalReady && matchN === 0)**
```
│ ┌─ JOURNEY STATUS ─────────────────────┐ │
│ │ Step 3 of 3: Prove in Arena          │ │
│ │ Arena Readiness: 3/3 ✓               │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ [Enter Arena →]                          │  ← 프라이머리
│  Your first proof run is waiting         │
│ [Open Terminal]                          │  ← 세컨더리
```

**상태 D: 증명 완료 (matchN > 0)**
```
│ ┌─ JOURNEY STATUS ─────────────────────┐ │
│ │ Mission active · {winRate}% win rate │ │
│ │ Last: Match #{matchN} {WIN/LOSS}     │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ [Continue Mission →]                     │  ← 프라이머리 (상황별 링크)
│ [Open Agent HQ]  [Enter Arena]           │  ← 세컨더리 + 터셔리
```

### 구현 상세
`src/routes/+page.svelte`:
- `agentJourneyStore`, `readinessProgress`, `hasMintedAgent` 임포트 (현재도 있음)
- `matchHistoryStore`, `winRate` 임포트 추가
- `journeyState` derived 변수 추가:
  ```ts
  const journeyState = $derived(
    !journey.minted ? 'no-agent'
    : !journey.terminalReady ? 'training'
    : records.length === 0 ? 'arena-ready'
    : 'active'
  );
  ```
- CTA 영역을 `{#if journeyState === 'no-agent'}` ... `{:else if}` 분기
- JOURNEY STATUS 카드: `.journey-status` 클래스, 기존 `.live-line` 스타일 활용

### 네비게이션 인디케이터

**MobileBottomNav 도트**:
```
[Home] [Mission •] [Agent] [Market]
                 ↑
          녹색: arena ready
          주황: training 중
          없음: 에이전트 없음
```

`src/components/layout/MobileBottomNav.svelte`:
- `agentJourneyStore` 임포트
- Mission 탭 아이템에 조건부 도트 렌더링
- 기존 badge 시스템(openPositions 카운트)과 별도로 상태 도트 추가

**Header 데스크탑 인디케이터**:
```
[Mission ──] [Agent] [Market]
         ↑
    탭 하단 2px 바: 녹/주황/없음
```

`src/components/layout/Header.svelte`:
- Mission 탭에 `readinessIndicator` 색상 바 추가 (CSS `::after` pseudo)

### 수정 파일
| 파일 | 변경 |
|------|------|
| `src/routes/+page.svelte` | journeyState 분기 CTA + JOURNEY STATUS 카드 |
| `src/components/layout/MobileBottomNav.svelte` | Mission 탭 상태 도트 |
| `src/components/layout/Header.svelte` | Mission 탭 인디케이터 바 |

---

## Phase 6: 네비게이션/레이아웃 오버홀

### Header 간소화

현재:
```
[Logo] [Ticker: BTC $84,230] [Mission] [Agent] [Market] [Score: 42] [⚙] [👤 0x12..]
```

개편:
```
[Logo] [Mission •] [Agent] [Market] [👤 0x12..]
```

변경:
- `score-badge` 제거 (스코어는 Terminal/Arena 내부에서 표시)
- `settings-btn` 제거 (프로필 드롭다운에서 Settings 링크)
- Ticker 제거 (Terminal 페이지 내부로 이동)
- 항상 light header (조건 분기 제거)

프로필 드롭다운 확장:
```
┌──────────────┐
│ Agent HQ     │ → /agent
│ Terminal     │ → /terminal
│ Arena        │ → /arena
│ Signals      │ → /signals
│ Settings     │ → /settings
│ ──────────── │
│ Connect Wallet│
│ Disconnect   │
└──────────────┘
```

### BottomBar 제거

`src/routes/+layout.svelte`에서:
- `BottomBar` 임포트 제거
- `showBottomBar` 조건 제거
- BottomBar가 보여주던 정보의 새 위치:
  - LP/Match/Wins → Agent HQ Overview 카드 (이미 있음)
  - Open positions/Tracked signals → Terminal WarRoom (이미 있음)
  - Live price → Terminal ChartPanel 헤더 (이미 있음)

### 수정 파일
| 파일 | 변경 |
|------|------|
| `src/components/layout/Header.svelte` | score-badge, settings-btn, ticker 제거, 드롭다운 확장 |
| `src/routes/+layout.svelte` | BottomBar 제거, 조건 정리 |

---

## Phase 7: 모바일 UX 통합

### 공유 패널 레이아웃

`src/lib/utils/panelLayout.ts` 신규:
```ts
export const BREAKPOINTS = { mobile: 768, tablet: 1024, desktop: 1280 };
export function getLayoutMode(w: number): 'mobile' | 'tablet' | 'desktop';
export function getSwipeDirection(dx: number, dy: number, threshold?: number): 'left' | 'right' | null;
export const PANEL_ANIMATION_MS = 200;
export const TOUCH_TARGET_MIN = 44;
```

### Terminal 모바일 스와이프
```
[차트 보는 중]
← 왼쪽 스와이프 → Intel 패널 열림
→ 오른쪽 스와이프 → WarRoom 패널 열림

스와이프 임계값: 60px 수평 이동
차트 패닝과 충돌 방지: 차트 영역 바깥(상단 헤더/하단 바)에서만 스와이프 인식
```

### Arena 모바일 일관성
- ViewPicker 전환 애니메이션: 200ms ease (Terminal 탭 전환과 동일)
- Phase 컨트롤 터치 타겟: 최소 44px

### 수정 파일
| 파일 | 변경 |
|------|------|
| **신규** `src/lib/utils/breakpoints.ts` | 브레이크포인트 상수 |
| **신규** `src/lib/utils/panelLayout.ts` | 스와이프/패널 유틸 |
| `src/routes/terminal/+page.svelte` | 스와이프 제스처, 터치 타겟 |
| `src/routes/arena/+page.svelte` | 공유 브레이크포인트 적용 |

---

## 실행 순서

```
Phase 1 (라우트 통합) — 리스크 중, 가치 높
  ├→ Phase 2 (Create 단순화) — 리스크 낮, 가치 높
  ├→ Phase 3 (Terminal UX) — 리스크 중
  │     └→ Phase 4 (Arena 정리) — 리스크 높
  └→ Phase 5 (Readiness) — 리스크 낮, 가치 높
        └→ Phase 6 (Nav 오버홀) — 리스크 중
              └→ Phase 7 (모바일 통합) — 리스크 높
```

**권장: 1 → 2 → 3 → 5 → 4 → 6 → 7**

## 검증 방법
- 매 Phase 완료 시: `npm run check && npm run build`
- Phase 1: 모든 레거시 URL 리다이렉트 확인
- Phase 2: 2단계 Create 플로우 E2E 테스트
- Phase 3: 3개 반응형 모드 (모바일/태블릿/데스크탑) 수동 검증
- Phase 4: Arena 5개 Phase 전체 순환 테스트
- Phase 5: 4가지 journeyState별 Home CTA 확인
- Phase 6: Header/Nav에서 모든 서피스 접근 가능 확인
- Phase 7: 모바일 디바이스에서 스와이프/터치 테스트
