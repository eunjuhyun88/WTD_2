# COGOCHI 메뉴 구조 · IA · 스토리보드 상세 설계

목적:
- `Cogochi + wtd` 통합 방향을 실제 제품 설계 수준으로 구체화한다.
- 메뉴 구조, 메뉴별 기능, IA, 대표 유저 스토리보드, 페이지 구성요소를 한 문서에서 정의한다.
- 앞으로의 화면 설계와 라우트 개편의 기준점으로 사용한다.

관련 상위 문서:
- [COGOCHI_UNIFIED_FLOW_AND_IA_2026-03-17.md](/Users/ej/Downloads/wtd-clones/frontend/docs/archive/historical/root-cleanup-2026-03-17/COGOCHI_UNIFIED_FLOW_AND_IA_2026-03-17.md)

---

## 0. 설계 원칙

### 0.1 제품 한 줄 정의

COGOCHI는 사용자가 시장을 해석하고, 그 해석을 에이전트로 만들고, 배틀로 검증하고, 마켓에서 거래하고, 패스포트에 기록을 누적하는 AI 트레이딩 게임 플랫폼이다.

### 0.2 반드시 지킬 원칙

1. 페이지 하나의 목적은 하나여야 한다.
2. 상위 메뉴는 6개를 넘기지 않는다.
3. 만들기 흐름과 쓰기 흐름은 분리하되 단절시키지 않는다.
4. `Terminal -> Lab -> Arena -> Market -> Passport`가 메인 가치 사슬이다.
5. `Signals`, `Oracle`, `Dashboard`, `Backtest`는 독립 탑레벨이 아니라 통합 구조 안에서 재배치한다.
6. 모바일과 데스크탑은 내비 위치는 달라도 정보 구조는 같아야 한다.

---

## 1. 전체 메뉴 구조

## 1.1 글로벌 메뉴 구조

### 메인 내비

```text
1. Home
2. Terminal
3. Arena
4. Lab
5. Market
6. Passport
```

### 유틸리티 메뉴

```text
- Notifications
- Wallet
- Global Search
- Profile / Account
- Settings
```

### 퀵 액션

```text
- Run Scan
- Start Battle
- Save Doctrine
- Publish Agent
```

퀵 액션은 화면 어디에서나 열 수 있지만, 각 액션은 반드시 원래의 정식 페이지로 이동해서 완료되어야 한다.

---

## 1.2 데스크탑 메뉴 구조

### 상단 글로벌 바

포함 요소:
- 로고
- 메인 메뉴 6개
- 현재 시장 상태 요약
- 알림 아이콘
- 지갑 상태
- 프로필 드롭다운

### 페이지별 서브내비

각 탑메뉴 안에서만 보인다.

- `Terminal`: Pair / Timeframe / Scan History / Saved Sessions
- `Arena`: Lobby / World / Battle / Result / Replay
- `Lab`: Agents / Doctrine / Training / Backtest / Versions
- `Market`: Feed / Agents / Leaderboard / Subscriptions
- `Passport`: Overview / Positions / Wallet / Records

---

## 1.3 모바일 메뉴 구조

### 하단 탭 바

```text
Home | Terminal | Arena | Market | Passport
```

### 오버플로 메뉴

`Lab`과 `Settings`는 하단 고정 탭 대신 오버플로 메뉴로 들어간다.

이유:
- 모바일에서 `Lab`은 고빈도 진입이 아니다.
- `Terminal`, `Arena`, `Market`, `Passport`가 반복 사용 빈도가 더 높다.

### 모바일 공통 FAB

고정 플로팅 버튼:
- 기본값: `Run Scan`
- 화면별 변형:
  - Arena: `Start Battle`
  - Lab: `Train`
  - Market: `Subscribe` 또는 `Publish`

---

## 2. IA 설계

## 2.1 최상위 IA

```text
/
├── /
├── /terminal
├── /arena
├── /lab
├── /market
├── /passport
├── /settings
├── /agent/[id]
└── /creator/[id]
```

## 2.2 상세 IA

```text
/
├── Home
│   ├── Hero
│   ├── Product Proof
│   ├── Use Case Split
│   ├── Live Market Snapshot
│   └── CTA Rail
│
├── Terminal
│   ├── Chart Workspace
│   ├── War Room
│   ├── Intel Panel
│   ├── Scan History
│   └── Doctrine Save Flow
│
├── Arena
│   ├── Lobby
│   ├── World View
│   ├── Draft
│   ├── Battle
│   ├── Result
│   └── Replay
│
├── Lab
│   ├── Agents
│   ├── Doctrine
│   ├── Training
│   ├── Backtest
│   └── Versions
│
├── Market
│   ├── Feed
│   ├── Agents
│   ├── Leaderboard
│   └── Subscriptions
│
├── Passport
│   ├── Overview
│   ├── Positions
│   ├── Wallet
│   └── Records
│
├── Settings
│   ├── General
│   ├── Notifications
│   ├── Data & Display
│   └── Account
│
├── Agent Detail
│   ├── Identity
│   ├── Doctrine Summary
│   ├── Training History
│   ├── Battle Record
│   └── Publish Status
│
└── Creator Detail
    ├── Public Profile
    ├── Public Performance
    ├── Published Agents
    └── Subscription CTA
```

---

## 3. 메뉴별 기능 명세

## 3.1 Home

### 페이지 목적

- 신규 유저에게 제품 가치를 이해시키고 첫 행동으로 보낸다.

### 핵심 사용자

- 신규 유입
- 공유 링크 방문자
- 아직 어떤 모드로 들어갈지 결정하지 않은 유저

### 하위 섹션

| 섹션 | 목적 | 핵심 기능 |
| --- | --- | --- |
| Hero | 제품 한 줄 이해 | 주요 CTA 3개 |
| Creator Proof | “이걸로 돈 벌 수 있나?” 답변 | 에이전트 성과/임대 수익 예시 |
| Follower Proof | “이걸 믿을 수 있나?” 답변 | 검증 방식, 온체인/기록 구조 |
| Live Snapshot | 살아있는 제품 느낌 제공 | 실시간 시장 카드, 현재 인기 에이전트 |
| Entry Split | 경로 선택 | Terminal / Arena / Market |

### 기능 명세

| 기능 | 설명 | 액션 결과 |
| --- | --- | --- |
| Open Terminal | 빠른 분석 진입 | `/terminal` 이동 |
| Try Arena | 게임형 첫 경험 | `/arena` 이동 |
| Browse Market | 검증된 에이전트/시그널 탐색 | `/market` 이동 |
| View Agent Proof | 대표 에이전트 사례 확인 | `/agent/[id]` 이동 |
| Connect Wallet | 선택적 | 지갑 모달 오픈 |

### 페이지 구성요소

1. Top Navigation
2. Hero Copy
3. CTA Button Group
4. Live Market Strip
5. Featured Agent Card
6. Verification Explainer
7. Dual Role Section
8. Footer CTA

---

## 3.2 Terminal

### 페이지 목적

- 시장을 읽고 판단을 만든다.

### 하위 구조

| 영역 | 역할 |
| --- | --- |
| Chart Workspace | 차트, 오버레이, 포지션 플랜 |
| War Room | 에이전트별 판단 카드, 세션 상태 |
| Intel Panel | 요약, 뉴스, 온체인, 파생, 채팅 |
| Control Bar | Pair, TF, Scan, Compare, Save |
| Action Rail | Track, Copy, Save Doctrine, Share |

### 서브 기능

| 기능 그룹 | 기능 | 설명 |
| --- | --- | --- |
| Analysis | Run Scan | 선택 자산 분석 실행 |
| Analysis | Compare Scan | 이전 세션과 차이 비교 |
| Analysis | Ask Chat | 자연어 질문 |
| Action | Track Signal | 판단을 추적 기록 |
| Action | Quick Trade | 즉시 포지션 생성 |
| Action | Copy Trade | 파라미터 자동 채움 |
| Creation | Save Doctrine | 현재 판단 패턴을 doctrine 후보로 저장 |
| Creation | Save Scenario | 배틀용 시나리오 저장 |
| Social | Share to Market | 시그널 공유 |

### 반드시 보여야 하는 상태

- Live / Cached / Simulated 구분
- 최신 스캔 완료 시점
- 에이전트 합의/이견
- 리스크 경고
- 저장 가능 여부

### 페이지 구성요소

1. Market Header
2. Pair Selector
3. Timeframe Selector
4. Terminal Ticker
5. War Room Panel
6. Main Chart Panel
7. Intel Tabs
8. Decision Summary Banner
9. Action Footer
10. Copy Trade Modal
11. Share Modal
12. Save Doctrine Modal

---

## 3.3 Arena

### 페이지 목적

- 사용자의 판단과 에이전트의 판단을 배틀 형식으로 검증한다.

### 내부 단계

| 단계 | 목적 |
| --- | --- |
| Lobby | 진입 전 준비 |
| World | 시나리오 선택과 탐험 |
| Draft | 배틀 구성 확정 |
| Battle | 핵심 대결 |
| Result | 승패와 보상 |
| Reflection | 왜 이겼고 왜 졌는지 학습 |
| Replay | 같은 시나리오 재도전 |

### 핵심 기능

| 기능 | 설명 |
| --- | --- |
| Start Battle | 시나리오 진입 |
| Select Squad / Agent | 배틀 참가 구성 선택 |
| Override / Boost / Skip | 전투 개입 카드 |
| Watch Agent Behavior | 에이전트별 행동 확인 |
| Review Reflection | 실패 원인/성공 원인 확인 |
| Save Battle Outcome | 패스포트 및 학습 데이터로 기록 |
| Promote to Lab | 배틀 결과를 개선 루프로 보냄 |

### 페이지 구성요소

1. Arena Phase Bar
2. Scenario Header
3. Agent Sidebar
4. Battle Stage Surface
5. HP / Pressure / Zone HUD
6. Intervention Card Tray
7. Battle Log
8. Result Overlay
9. Reflection Card
10. Replay CTA
11. Send to Lab CTA
12. Record to Passport CTA

---

## 3.4 Lab

### 페이지 목적

- 에이전트를 만들고 훈련시키고 검증 가능한 버전으로 관리한다.

### 탭 구조

| 탭 | 목적 |
| --- | --- |
| Agents | 보유 에이전트 목록과 상태 |
| Doctrine | 전략 규칙 작성/편집 |
| Training | AutoResearch, 학습 큐, 작업 상태 |
| Backtest | Walk-forward 결과 검증 |
| Versions | v0/v1/v2 비교 및 승급 |

### 탭별 기능 명세

#### Agents

| 기능 | 설명 |
| --- | --- |
| Create Agent | 새 에이전트 생성 |
| View Loadout | 아키타입, Stage, 데이터 범위 확인 |
| Open Agent Detail | 세부 페이지 진입 |
| Check Publish Readiness | 마켓 게시 가능 상태 확인 |

#### Doctrine

| 기능 | 설명 |
| --- | --- |
| Edit Core Belief | 핵심 전략 문장 편집 |
| Set Weights | 신호 중요도 조절 |
| Set Risk Rules | 리스크 룰 정의 |
| Save Doctrine | 버전 저장 |

#### Training

| 기능 | 설명 |
| --- | --- |
| Queue AutoResearch | overnight 실험 대기열 등록 |
| Monitor Training Jobs | 학습 상태 추적 |
| Inspect Dataset | 데이터셋 생성 결과 확인 |
| Retry Failed Job | 실패 작업 재시도 |

#### Backtest

| 기능 | 설명 |
| --- | --- |
| Run Backtest | 시뮬레이션 실행 |
| Compare In/Out Sample | 과적합 검토 |
| View Report | 성과 지표 요약 |
| Promote Candidate | 게시 후보로 승격 |

#### Versions

| 기능 | 설명 |
| --- | --- |
| Compare Versions | 버전별 성과 비교 |
| Select Active Version | 현재 운영 버전 선택 |
| Archive Old Version | 구버전 보관 |

### 페이지 구성요소

1. Lab Header
2. Agent Summary Rail
3. Tab Bar
4. Agent Grid
5. Doctrine Builder
6. Weight Sliders
7. Training Job Table
8. Backtest Report Cards
9. Version Compare Table
10. Publish Candidate Banner

---

## 3.5 Market

### 페이지 목적

- 신뢰 가능한 에이전트와 시그널을 발견하고, 구독/공유/구매/판매를 수행한다.

### 탭 구조

| 탭 | 목적 |
| --- | --- |
| Feed | 커뮤니티 시그널과 활동 탐색 |
| Agents | 에이전트 마켓플레이스 |
| Leaderboard | AI/Creator 성과 랭킹 |
| Subscriptions | 내가 빌린 에이전트와 구독 상태 |

### Feed 기능

| 기능 | 설명 |
| --- | --- |
| React | 반응/좋아요 |
| Comment | 댓글 |
| Track | 추적 |
| Copy to Terminal | 터미널로 핸드오프 |
| Open Creator | 작성자 공개 프로필 보기 |

### Agents 기능

| 기능 | 설명 |
| --- | --- |
| Filter Agents | 아키타입, 수익률, 낙폭, 가격, Stage 필터 |
| View Proof | 기록/검증 요약 확인 |
| Open Agent Detail | 상세 진입 |
| Subscribe | 임대/구독 실행 |
| Publish Agent | 내 에이전트 게시 |

### Leaderboard 기능

| 기능 | 설명 |
| --- | --- |
| View Rank | 기간별 랭킹 |
| Toggle AI / Creator | 랭킹 범주 전환 |
| Open Detail | 에이전트/크리에이터 상세 이동 |

### Subscriptions 기능

| 기능 | 설명 |
| --- | --- |
| View Active Rentals | 현재 구독 목록 |
| Renew / Cancel | 갱신/해지 |
| View Delivered Signals | 실제 받은 시그널 성과 확인 |

### 페이지 구성요소

1. Market Header
2. Tab Switcher
3. Feed Card List
4. Agent Market Grid
5. Filter Sidebar
6. Leaderboard Table
7. Subscription Status Cards
8. Publish CTA Card
9. Verification Explainer Strip

---

## 3.6 Passport

### 페이지 목적

- 사용자의 성과, 포지션, 지갑, 기록을 누적 관리한다.

### 탭 구조

| 탭 | 목적 |
| --- | --- |
| Overview | 한눈에 보는 상태 |
| Positions | 오픈/클로즈드 포지션 |
| Wallet | 자산/연동 상태 |
| Records | 배틀, 판단, 실적 기록 |

### 기능 명세

#### Overview

| 기능 | 설명 |
| --- | --- |
| View Tier | 티어/배지 확인 |
| View Performance Summary | 승률, PnL, 정확도 |
| View Focus Insight | 약점과 다음 행동 제안 |

#### Positions

| 기능 | 설명 |
| --- | --- |
| Open Positions | 현재 포지션 상태 |
| Closed Positions | 종료 포지션 성과 |
| Tracked Signals | 추적 중 시그널 |

#### Wallet

| 기능 | 설명 |
| --- | --- |
| Connect Wallet | 지갑 연동 |
| View Holdings | 자산 보기 |
| Sync Holdings | 수동 동기화 |

#### Records

| 기능 | 설명 |
| --- | --- |
| Battle History | 배틀 히스토리 |
| Judgment History | 판단 히스토리 |
| Creator Revenue | 임대 수익 기록 |
| Export Proof | 외부 공유용 요약 |

### 페이지 구성요소

1. Passport Header
2. Identity Card
3. Performance Summary Tiles
4. Focus Insight Cards
5. Tab Navigation
6. Position Tables
7. Holdings Panel
8. Record Timeline
9. Export / Share Block

---

## 3.7 Settings

### 페이지 목적

- 개인 환경설정만 관리한다.

### 섹션 구조

| 섹션 | 기능 |
| --- | --- |
| General | 언어, 기본 페어, 기본 타임프레임 |
| Notifications | 알림 채널, 푸시 허용, 신호 알림 |
| Data & Display | 데이터 소스, 밀도, 테마, SFX |
| Account | 계정 상태, 데이터 리셋 |

### 페이지 구성요소

1. Settings Header
2. Sync Status
3. General Form
4. Notification Toggles
5. Display Form
6. Danger Zone

---

## 4. 공통 드릴다운 페이지

## 4.1 Agent Detail

### 목적

- 개별 에이전트의 정체성, 성과, 훈련 상태, 배틀 이력을 통합해서 보여준다.

### 섹션

| 섹션 | 내용 |
| --- | --- |
| Identity | 이름, 아키타입, Stage, 역할 |
| Doctrine Snapshot | 핵심 규칙 요약 |
| Training Status | 최근 학습 상태 |
| Battle Record | 승패, 패턴, 리플레이 |
| Publish Status | 공개/비공개, 구독 수, 가격 |

### 주요 CTA

- Edit in Lab
- Run Battle
- Publish / Unpublish
- Share Agent

## 4.2 Creator Detail

### 목적

- 크리에이터의 공개 프로필과 공개 성과를 보여준다.

### 섹션

| 섹션 | 내용 |
| --- | --- |
| Profile Header | 닉네임, 티어, 소개 |
| Public Stats | 공개 성과 |
| Published Agents | 게시 중 에이전트 |
| Recent Signals | 최근 활동 |

### 주요 CTA

- Subscribe
- Open Agent
- Copy to Terminal

---

## 5. 스토리보드

## 5.1 스토리보드 A — 신규 트레이더

| 컷 | 페이지 | 유저 행동 | 시스템 반응 | 다음 CTA |
| --- | --- | --- | --- | --- |
| 1 | Home | 헤드라인 확인 | Terminal/Arena/Market 3개 경로 제시 | Open Terminal |
| 2 | Terminal | BTC 스캔 실행 | War Room + Intel + Chart 오버레이 표시 | Save Doctrine |
| 3 | Terminal | 판단 저장 | doctrine draft 생성 | Go to Lab |
| 4 | Lab | doctrine 확인/조정 | 훈련 준비 완료 | Train Agent |
| 5 | Lab | 학습 큐 등록 | 작업 상태 노출 | Validate in Arena |
| 6 | Arena | 배틀 시작 | 시나리오 기반 대결 진행 | Review Result |
| 7 | Arena | 결과 확인 | Reflection + 개선 포인트 제공 | Record to Passport |
| 8 | Passport | 성과 확인 | 기록 누적 및 다음 액션 추천 | Return to Lab |

## 5.2 스토리보드 B — 크리에이터

| 컷 | 페이지 | 유저 행동 | 시스템 반응 | 다음 CTA |
| --- | --- | --- | --- | --- |
| 1 | Home or Agent Share | 수익화 사례 확인 | 대표 에이전트 수익 예시 노출 | Browse Market |
| 2 | Market | 에이전트 사례 탐색 | 검증 구조와 가격 구조 확인 | Open Agent Detail |
| 3 | Agent Detail | 세부 성과 확인 | 공개 기록, 배틀 기록 표시 | Create My Agent |
| 4 | Lab | 새 에이전트 생성 | 아키타입/데이터/리스크 입력 | Train |
| 5 | Arena | 배틀 검증 | 승/패와 학습 포인트 제시 | Publish Candidate |
| 6 | Market | 게시 실행 | 가격, 공개 범위, 소개 입력 | Publish |
| 7 | Passport | 수익/구독자 확인 | Creator 성과 누적 | Improve Agent |

## 5.3 스토리보드 C — 임차인 / 팔로워

| 컷 | 페이지 | 유저 행동 | 시스템 반응 | 다음 CTA |
| --- | --- | --- | --- | --- |
| 1 | Market | 에이전트 필터링 | 가격/낙폭/승률 기준 목록 정렬 | View Proof |
| 2 | Agent Detail | 검증 확인 | 공개 성과와 신뢰 구조 표시 | Subscribe |
| 3 | Market | 구독 실행 | 구독 상태 생성 | Open in Terminal |
| 4 | Terminal | 시그널 수신 후 검토 | 카피트레이드/추적 가능 | Execute |
| 5 | Passport | 포지션 성과 확인 | 손익, 히스토리, 알림 확인 | Renew or Cancel |

---

## 6. 페이지별 핵심 구성요소 목록

## 6.1 공통 글로벌 컴포넌트

모든 주요 페이지에서 재사용:

1. GlobalHeader
2. GlobalSearch
3. NotificationTray
4. WalletStatusChip
5. ProfileDropdown
6. QuickActionLauncher
7. MobileBottomNav
8. ToastStack
9. EmptyState
10. ErrorState

## 6.2 Home 컴포넌트

1. HeroSection
2. EntrySplitRail
3. LiveMarketStrip
4. FeaturedCreatorCard
5. FeaturedAgentCard
6. VerificationExplainCard
7. CTAFooter

## 6.3 Terminal 컴포넌트

1. TerminalControlBar
2. TerminalTicker
3. WarRoomPanel
4. AgentDecisionCard
5. IntelPanel
6. TerminalChartViewport
7. VerdictBanner
8. CopyTradeModal
9. ShareSignalModal
10. SaveDoctrineModal

## 6.4 Arena 컴포넌트

1. ArenaPhaseBar
2. ArenaLobby
3. ArenaWorldView
4. ArenaDraftPanel
5. ArenaBattleStage
6. AgentSprite
7. InterventionTray
8. BattleLog
9. ResultOverlay
10. ReflectionPanel

## 6.5 Lab 컴포넌트

1. AgentGrid
2. AgentCard
3. DoctrineEditor
4. WeightSliderGroup
5. RiskRuleBuilder
6. TrainingQueueTable
7. JobStatusCard
8. BacktestReportCard
9. VersionComparePanel
10. PublishReadinessBanner

## 6.6 Market 컴포넌트

1. FeedCard
2. CommentSection
3. MarketAgentCard
4. FilterPanel
5. LeaderboardTable
6. SubscriptionCard
7. PublishPromptCard
8. CreatorMiniCard

## 6.7 Passport 컴포넌트

1. PassportHeader
2. TierBadge
3. PerformanceTiles
4. FocusInsightCard
5. PositionTable
6. HoldingsPanel
7. RecordTimeline
8. ExportProofCard

---

## 7. 상태 설계

## 7.1 유저 상태

| 상태 | 정의 | 주요 분기 |
| --- | --- | --- |
| Visitor | 비로그인/비연결 | Home, Terminal, Market 접근 가능 |
| Explorer | 첫 사용 중 | Arena 체험, 제한적 Terminal 기능 |
| Creator | 에이전트 생성 경험 있음 | Lab 중심 |
| Renter | 구독 경험 있음 | Market, Passport 중심 |
| Power User | Creator + Renter 모두 사용 | 전체 메뉴 사용 |

## 7.2 게이팅 규칙

| 기능 | 무료 | 연결 필요 | 구독 필요 |
| --- | --- | --- | --- |
| Home 열람 | O | X | X |
| Terminal 스캔 | O | X | X |
| Doctrine 저장 | O | O | X |
| Agent Training | X | O | O |
| Arena 기본 체험 | O | X | X |
| Publish Agent | X | O | O |
| Subscribe Agent | X | O | O |
| Passport 기록 저장 | X | O | O |

---

## 8. 크로스페이지 전환 규칙

1. Terminal에서 `Save Doctrine`을 누르면 무조건 `Lab` 문맥으로 이어져야 한다.
2. Arena 결과는 무조건 `Passport`와 `Lab` 중 하나 이상으로 이어져야 한다.
3. Market의 Copy/Track/Subscribe는 각기 다른 목적이다. 하나의 버튼으로 합치지 않는다.
4. Passport는 분석 실행을 직접 하지 않는다. 항상 `Terminal`, `Arena`, `Lab`로 되돌리는 CTA를 가져야 한다.
5. Settings는 어떤 페이지의 메인 CTA를 가로채면 안 된다.

---

## 9. 현재 프론트엔드에 대한 적용안

| 현재 | 목표 | 처리 |
| --- | --- | --- |
| `/signals` | `/market` | 개념 변경 후 라우트 이전 또는 alias |
| `/agents` | `Lab > Agents` | 탑메뉴 제거 후보 |
| `/oracle` | `Market > Leaderboard` | redirect only |
| `/arena-war`, `/arena-v2` | Arena 내부 모드 | 메인 내비 제외 |
| `/passport` 내부 학습 탭 | Lab로 이동 | 역할 분리 |

---

## 10. 최종 결정 문장

메뉴 구조는 다음 문장 하나로 정렬되어야 한다.

`Home에서 들어오고, Terminal에서 판단하고, Lab에서 에이전트를 만들고, Arena에서 검증하고, Market에서 거래하고, Passport에서 기억한다.`

이 흐름에 맞지 않는 메뉴나 페이지는 통합하거나 제거한다.
