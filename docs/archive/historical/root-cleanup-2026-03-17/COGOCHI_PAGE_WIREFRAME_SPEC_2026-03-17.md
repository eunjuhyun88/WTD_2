# COGOCHI 페이지 와이어프레임 스펙

목적:
- 통합 IA를 실제 화면 설계 수준으로 내린다.
- 각 주요 페이지의 데스크탑/모바일 구조, 섹션 순서, CTA, 상태, 전환을 확정한다.
- 디자인, 프론트엔드, PM이 같은 화면 언어를 쓰도록 만든다.

관련 문서:
- [COGOCHI_UNIFIED_FLOW_AND_IA_2026-03-17.md](/Users/ej/Downloads/maxidoge-clones/frontend/docs/archive/historical/root-cleanup-2026-03-17/COGOCHI_UNIFIED_FLOW_AND_IA_2026-03-17.md)
- [COGOCHI_MENU_IA_STORYBOARD_SPEC_2026-03-17.md](/Users/ej/Downloads/maxidoge-clones/frontend/docs/archive/historical/root-cleanup-2026-03-17/COGOCHI_MENU_IA_STORYBOARD_SPEC_2026-03-17.md)

---

## 0. 공통 와이어프레임 규칙

### 0.1 공통 상단 구조

모든 주요 페이지는 공통적으로 다음을 가진다.

```text
[Logo] [Main Nav] [Market Status] [Notifications] [Wallet] [Profile]
```

모바일:

```text
[Logo] [Page Title] [Notifications] [Wallet/Profile]
```

### 0.2 공통 하단 구조

모바일 하단 바:

```text
Home | Terminal | Arena | Market | Passport
```

고정 FAB:
- 기본: `Run Scan`
- 페이지별 override 가능

### 0.3 상태 규칙

모든 페이지는 최소한 아래 상태를 가진다.

1. Loading
2. Empty
3. Error
4. Restricted / Gated
5. Success / Updated

### 0.4 컴포넌트 배치 규칙

1. 판단과 액션은 같은 스크린 안에 두되, 결과와 기록은 분리한다.
2. 메인 CTA는 한 화면에 하나만 강조한다.
3. 서브 CTA는 2개를 넘기지 않는다.
4. 모바일에서는 수평 3분할 구조를 금지하고 세로 우선 구조를 쓴다.

---

## 1. Home

## 1.1 페이지 목적

- 유저가 10초 안에 “이게 뭔지”, 30초 안에 “어디로 가야 하는지” 이해하게 한다.

## 1.2 데스크탑 와이어프레임

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Global Header                                                       │
├──────────────────────────────────────────────────────────────────────┤
│ HERO                                                                │
│ Headline | Subcopy | [Open Terminal] [Try Arena] [Browse Market]   │
├───────────────────────┬──────────────────────────────────────────────┤
│ Creator Proof         │ Follower Proof                              │
│ agent income story    │ trust / proof / verification story          │
├──────────────────────────────────────────────────────────────────────┤
│ Live Snapshot Strip: market cards / top agent / active battle       │
├──────────────────────────────────────────────────────────────────────┤
│ Use Case Split                                                      │
│ [I want to trade] [I want to train] [I want to follow]              │
├──────────────────────────────────────────────────────────────────────┤
│ Footer CTA                                                          │
└──────────────────────────────────────────────────────────────────────┘
```

## 1.3 모바일 와이어프레임

```text
┌───────────────────────────────┐
│ Header                        │
├───────────────────────────────┤
│ Hero                          │
│ Headline                      │
│ Subcopy                       │
│ [Open Terminal]               │
│ [Try Arena]                   │
│ [Browse Market]               │
├───────────────────────────────┤
│ Live Snapshot Cards           │
├───────────────────────────────┤
│ Creator Proof Card            │
├───────────────────────────────┤
│ Follower Proof Card           │
├───────────────────────────────┤
│ Role Split Cards              │
├───────────────────────────────┤
│ Bottom Nav                    │
└───────────────────────────────┘
```

## 1.4 섹션 순서

1. Hero
2. CTA
3. Live Snapshot
4. Creator Proof
5. Follower Proof
6. Role Split
7. Footer CTA

## 1.5 CTA 규칙

- Primary: `Open Terminal`
- Secondary: `Try Arena`
- Tertiary: `Browse Market`

## 1.6 상태

- Empty: Live snapshot 데이터 없음 -> skeleton + “Live market loading”
- Gated: 없음
- Error: proof card 데이터 실패 시 static fallback 노출

---

## 2. Terminal

## 2.1 페이지 목적

- 분석, 판단, 추적, 실행, doctrine 저장을 한 번에 수행하는 작업면이다.

## 2.2 데스크탑 와이어프레임

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Global Header + Pair / Timeframe / Scan Controls                           │
├───────────────┬──────────────────────────────────┬─────────────────────────┤
│ War Room      │ Main Chart Workspace             │ Intel Panel             │
│ Session list  │ Chart                            │ Summary                 │
│ Agent cards   │ Overlay                          │ Chat                    │
│ Decision feed │ Drawing / trade plan             │ News / Onchain / Deriv  │
├───────────────┴──────────────────────────────────┴─────────────────────────┤
│ Decision Banner | Track | Quick Trade | Copy Trade | Save Doctrine         │
└────────────────────────────────────────────────────────────────────────────┘
```

## 2.3 모바일 와이어프레임

```text
┌───────────────────────────────┐
│ Header + Pair/TF              │
├───────────────────────────────┤
│ Main Chart                    │
├───────────────────────────────┤
│ Verdict Banner                │
├───────────────────────────────┤
│ Tab Switcher                  │
│ [War Room] [Intel] [Action]   │
├───────────────────────────────┤
│ Active Tab Content            │
├───────────────────────────────┤
│ Sticky Action Bar             │
│ Track / Copy / Save Doctrine  │
├───────────────────────────────┤
│ Bottom Nav                    │
└───────────────────────────────┘
```

## 2.4 핵심 섹션

1. Market control header
2. War Room
3. Chart workspace
4. Intel tabs
5. Decision banner
6. Action bar

## 2.5 핵심 상태

- Scanning
- Partial result
- Consensus
- Dissent
- Trade ready
- Saved to doctrine

## 2.6 주요 CTA

- `Run Scan`
- `Save Doctrine`
- `Track`
- `Quick Trade`
- `Copy Trade`
- `Share to Market`

## 2.7 전환 규칙

- `Save Doctrine` -> `Lab > Doctrine`
- `Quick Trade / Copy Trade` -> local modal -> 결과는 `Passport > Positions`
- `Share to Market` -> post submit 후 `Market > Feed`

---

## 3. Arena

## 3.1 페이지 목적

- 사용자의 판단과 에이전트를 게임형 대결로 검증한다.

## 3.2 데스크탑 와이어프레임

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Header + Arena Phase Bar                                                  │
├────────────────────────────────────────────────────────────────────────────┤
│ Scenario Header / Match Meta / Agent Loadout Summary                      │
├───────────────┬──────────────────────────────────────────┬───────────────┤
│ Team / Agents │ Battle Stage / World / Chart Battlefield│ Enemy / Goal  │
│ left rail     │ main canvas                              │ right rail    │
├───────────────┴──────────────────────────────────────────┴───────────────┤
│ Intervention Tray | Battle Log | Result CTA strip                        │
└────────────────────────────────────────────────────────────────────────────┘
```

## 3.3 모바일 와이어프레임

```text
┌───────────────────────────────┐
│ Header + Phase Bar            │
├───────────────────────────────┤
│ Scenario Summary              │
├───────────────────────────────┤
│ Battle Stage Canvas           │
├───────────────────────────────┤
│ Team Mini Rail                │
├───────────────────────────────┤
│ Intervention Tray             │
├───────────────────────────────┤
│ Battle Log Sheet Trigger      │
├───────────────────────────────┤
│ Result / Continue CTA         │
└───────────────────────────────┘
```

## 3.4 내부 뷰 구조

Arena는 탑레벨 페이지지만 내부 뷰를 가진다.

```text
Lobby -> World -> Draft -> Battle -> Result -> Replay
```

## 3.5 뷰별 필수 구성요소

### Lobby
- today’s challenge
- recent results
- start battle CTA

### World
- scenario path
- encounter marker
- current era/market segment

### Draft
- selected agents
- scenario modifiers
- ready CTA

### Battle
- main stage
- agent HUD
- intervention cards
- timer / pressure / HP

### Result
- win/lose summary
- rewards
- next action

### Replay
- timeline scrub
- key turning points
- send to lab CTA

## 3.6 전환 규칙

- Result -> `Passport` 기록
- Result -> `Lab` 개선 루프
- Replay -> `Lab > Versions` 또는 `Doctrine`

---

## 4. Lab

## 4.1 페이지 목적

- 생성, 훈련, 검증, 승격을 담당하는 창작 워크스테이션이다.

## 4.2 데스크탑 와이어프레임

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Header + Agent Summary + Publish Readiness                                │
├────────────────────────────────────────────────────────────────────────────┤
│ Tab Bar: Agents | Doctrine | Training | Backtest | Versions               │
├────────────────────────────────────────────────────────────────────────────┤
│ Active Tab Content                                                        │
│                                                                            │
│ Agents: grid / list                                                       │
│ Doctrine: editor + sliders + rules                                        │
│ Training: queue + jobs + dataset                                          │
│ Backtest: config + report                                                 │
│ Versions: compare table                                                   │
└────────────────────────────────────────────────────────────────────────────┘
```

## 4.3 모바일 와이어프레임

```text
┌───────────────────────────────┐
│ Header                        │
├───────────────────────────────┤
│ Agent Summary Card            │
├───────────────────────────────┤
│ Horizontal Tab Scroll         │
├───────────────────────────────┤
│ Active Tab Content            │
├───────────────────────────────┤
│ Sticky Primary CTA            │
│ Save / Train / Run Backtest   │
└───────────────────────────────┘
```

## 4.4 탭별 레이아웃

### Agents

```text
Summary rail
-> filter row
-> agent grid
-> selected agent side panel or bottom sheet
```

### Doctrine

```text
Core belief
-> signal weights
-> risk rules
-> doctrine preview
-> save CTA
```

### Training

```text
Queue summary
-> current jobs
-> dataset health
-> failed jobs
-> train CTA
```

### Backtest

```text
config panel
-> run CTA
-> key metrics cards
-> detailed report
-> promote CTA
```

### Versions

```text
version selector
-> comparison table
-> active version badge
-> archive / activate CTA
```

## 4.5 주요 상태

- Draft doctrine unsaved
- Training queued
- Training running
- Backtest failed
- Publish ready

---

## 5. Market

## 5.1 페이지 목적

- 신뢰와 거래가 만나는 곳이다.

## 5.2 데스크탑 와이어프레임

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Header + Market Summary                                                   │
├────────────────────────────────────────────────────────────────────────────┤
│ Tab Bar: Feed | Agents | Leaderboard | Subscriptions                      │
├────────────────────────────────────────────────────────────────────────────┤
│ Active Tab Content                                                        │
│                                                                            │
│ Feed: post list + context sidebar                                         │
│ Agents: filter sidebar + grid                                             │
│ Leaderboard: ranking table + right detail preview                         │
│ Subscriptions: active cards + delivered value summary                     │
└────────────────────────────────────────────────────────────────────────────┘
```

## 5.3 모바일 와이어프레임

```text
┌───────────────────────────────┐
│ Header                        │
├───────────────────────────────┤
│ Tab Pills                     │
├───────────────────────────────┤
│ Feed / Agent / Rank cards     │
├───────────────────────────────┤
│ Sticky CTA by tab             │
│ Subscribe / Publish / Open    │
└───────────────────────────────┘
```

## 5.4 탭별 레이아웃

### Feed
- context banner
- feed filters
- post list
- action row

### Agents
- filters
- sort row
- agent cards
- proof badges

### Leaderboard
- period switcher
- ranking table
- detail preview

### Subscriptions
- active subscription cards
- recent signals delivered
- renewal status

## 5.5 CTA 규칙

- Feed primary CTA: `Open in Terminal`
- Agents primary CTA: `Subscribe`
- Leaderboard primary CTA: `View Detail`
- Subscriptions primary CTA: `Renew` 또는 `Open Performance`

---

## 6. Passport

## 6.1 페이지 목적

- 유저의 누적된 결과와 상태를 보여주는 기록면이다.

## 6.2 데스크탑 와이어프레임

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Header + Identity + Tier + Wallet Stamp                                   │
├────────────────────────────────────────────────────────────────────────────┤
│ Performance Summary Tiles + Focus Insights                                │
├────────────────────────────────────────────────────────────────────────────┤
│ Tab Bar: Overview | Positions | Wallet | Records                          │
├────────────────────────────────────────────────────────────────────────────┤
│ Active Tab Content                                                        │
└────────────────────────────────────────────────────────────────────────────┘
```

## 6.3 모바일 와이어프레임

```text
┌───────────────────────────────┐
│ Header / Identity             │
├───────────────────────────────┤
│ Summary Tiles                 │
├───────────────────────────────┤
│ Focus Insight Cards           │
├───────────────────────────────┤
│ Tab Scroll                    │
├───────────────────────────────┤
│ Active Tab Content            │
└───────────────────────────────┘
```

## 6.4 탭별 레이아웃

### Overview
- identity card
- top KPIs
- focus insight
- next recommended action

### Positions
- open positions
- closed positions
- tracked signals

### Wallet
- wallet state
- holdings list
- sync status

### Records
- battle history
- judgment history
- creator revenue / subscription results

## 6.5 CTA 규칙

- Overview primary CTA: context-sensitive return action
  - `Go to Terminal`
  - `Improve in Lab`
  - `Retry in Arena`

Passport 자체에서 새 작업을 생성하지 않는다.

---

## 7. Settings

## 7.1 페이지 목적

- 환경설정만 담당한다.

## 7.2 데스크탑 와이어프레임

```text
┌──────────────────────────────────────────────────┐
│ Header                                           │
├──────────────────────────────────────────────────┤
│ General                                          │
├──────────────────────────────────────────────────┤
│ Notifications                                    │
├──────────────────────────────────────────────────┤
│ Data & Display                                   │
├──────────────────────────────────────────────────┤
│ Account / Danger Zone                            │
└──────────────────────────────────────────────────┘
```

## 7.3 모바일 와이어프레임

```text
┌───────────────────────────────┐
│ Header                        │
├───────────────────────────────┤
│ Accordion Sections            │
│ General                       │
│ Notifications                 │
│ Data & Display                │
│ Account                       │
└───────────────────────────────┘
```

---

## 8. 공통 오버레이 / 모달 스펙

공통 모달은 페이지를 대체하지 않는다. 반드시 원래 흐름을 보조해야 한다.

### 필수 모달

1. Wallet Connect Modal
2. Copy Trade Modal
3. Save Doctrine Modal
4. Publish Agent Modal
5. Subscribe Agent Modal
6. Notification Center Sheet
7. Global Search Sheet

### 원칙

- 모달에서 장문의 운영 작업을 끝내지 않는다.
- 3단계를 넘는 작업은 전용 페이지로 보낸다.

---

## 9. 페이지 간 우선순위

### 정보 우선순위

| 페이지 | 1순위 | 2순위 | 3순위 |
| --- | --- | --- | --- |
| Home | 가치 이해 | 진입 선택 | 신뢰 |
| Terminal | 판단 | 액션 | 기록 연결 |
| Arena | 검증 | 결과 | 학습 연결 |
| Lab | 생성 | 훈련 | 승격 |
| Market | 신뢰 | 거래 | 커뮤니티 |
| Passport | 기록 | 상태 | 다음 액션 |
| Settings | 환경설정 | 동기화 상태 | 리셋 |

---

## 10. 구현 우선순위

### Phase 1

- Home
- Terminal
- Arena
- Passport

이유:
- 첫 가치 루프 형성에 필요

### Phase 2

- Lab
- Market
- Agent Detail
- Creator Detail

이유:
- creator economy와 장기 retention의 핵심

### Phase 3

- deep publish flows
- richer subscription management
- advanced replay / compare views

---

## 11. 최종 요약

각 페이지는 아래 한 문장으로 설명 가능해야 한다.

- Home: “왜 들어와야 하는지 설명한다.”
- Terminal: “무엇을 생각해야 하는지 보여준다.”
- Arena: “그 생각이 맞는지 시험한다.”
- Lab: “그 생각을 에이전트로 만든다.”
- Market: “검증된 결과를 거래한다.”
- Passport: “무슨 결과가 쌓였는지 보여준다.”
- Settings: “환경만 바꾼다.”

이 문장보다 많은 역할을 가진 페이지는 다시 쪼개야 한다.
