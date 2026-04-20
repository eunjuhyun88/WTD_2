# W-0114 · Cogochi Port Gap Analysis
## `/tmp/handoff2/cogochi/project/src/` → `app/src/lib/cogochi/`

**Updated**: 2026-04-20 (Session 3)
**Branch**: claude/w-0114-mobile-state-persistence
**Status**: ~80% complete — shell/chart/train done, Layout C + topology pending

---

## 1. 프로토타입 파일 목록 (4541 lines total)

| 파일 | 줄수 | 설명 |
|------|------|------|
| `shell.jsx` | 425 | CommandBar, CommandPalette, Sidebar, TabBar, StatusBar |
| `app.jsx` | 315 | App root, state mgmt |
| `mode_trade.jsx` | 460 | TradeMode + 4 layouts (A/B/C/D) + PeekBar + EmptyCanvas |
| `mode_train.jsx` | 396 | TrainMode |
| `trade_scan.jsx` | 345 | ScanPanel, WideGridView, 5 view modes |
| `trade_act.jsx` | 237 | ActPanel (3-col horizontal: Plan/Judge/AfterResult) |
| `trade_analysis.jsx` | 105 | AnalysisPanel |
| `chart.jsx` | 226 | Chart SVG (candles + phase bands + OI/Funding/CVD strips) |
| `ai_chat.jsx` | 220 | AI Chat panel |
| `topology_radial.jsx` | 187 | RadialTopology (FLYWHEEL radial view) |
| `topology_inbox.jsx` | 120 | Inbox topology |
| `topology_linear.jsx` | 794 | Linear topology |
| `splitter.jsx` | 59 | Drag resize splitter |
| `flywheel.jsx` | 97 | Flywheel mode |
| `data.jsx` | 59 | Static data / CAPTURES |
| `tweaks.jsx` | 63 | CSS tweaks / dev overlay |
| `mode_trade_v1.jsx` | 433 | 이전 버전 (무시) |

---

## 2. 이식 현황 (Session 3 업데이트)

### ✅ 완료

| 프로토타입 | Svelte 파일 |
|---|---|
| `shell.jsx` → CommandBar | `cogochi/CommandBar.svelte` |
| `shell.jsx` → CommandPalette | `cogochi/CommandPalette.svelte` |
| `shell.jsx` → Sidebar | `cogochi/Sidebar.svelte` |
| `shell.jsx` → TabBar | `cogochi/TabBar.svelte` |
| `shell.jsx` → StatusBar | `cogochi/StatusBar.svelte` |
| `app.jsx` | `cogochi/shell.store.ts` |
| `splitter.jsx` | `cogochi/Splitter.svelte` |
| `topology_radial.jsx` | `cogochi/modes/RadialTopology.svelte` |
| `chart.jsx` | `cogochi/PhaseChart.svelte` ✨ Static SVG |
| AppShell | `cogochi/AppShell.svelte` |
| Sections | `cogochi/sections/` (Library/Verdicts/Rules) |
| Navigation redirect | `appSurfaces.ts` terminal.href → `/cogochi` |
| Global header on cogochi | `+layout.svelte` showGlobalChrome fix |
| Border visibility | `--g3` → `--g4` 전체 적용 ✨ NEW Session 3 |
| Text contrast | `--g5` → `--g6` 전체 적용 ✨ NEW Session 3 |
| Sidebar resize | `width: 100%` store-driven ✨ NEW Session 3 |
| NotificationTray 억제 | `+layout.svelte` `{#if !$isCogochi}` ✨ NEW Session 3 |
| CgChart integration | TradeMode.svelte 실시간 klines ✨ NEW Session 3 |
| `mode_train.jsx` | `cogochi/modes/TrainMode.svelte` ✨ NEW Session 3 |

### ⚠️ 부분 이식

| 프로토타입 | Svelte 파일 | 누락 항목 |
|---|---|---|
| `mode_trade.jsx` | `TradeMode.svelte` (926줄) | Layout A/B/C stub. D(PEEK) 동작. |
| `trade_scan.jsx` | `peek/ScanGrid.svelte` | WideGridView(5열), TableView(6열), StripView 미구현 |
| `trade_act.jsx` | `peek/JudgePanel.svelte` | 3열 수평(Plan\|Judge\|AfterResult) 미구현 — 수직스택으로 이식됨 |
| `trade_analysis.jsx` | TradeMode.svelte 인라인 | 독립 컴포넌트 없음 — analyzeBody snippet에 하드코딩 |
| `ai_chat.jsx` | `cogochi/AIPanel.svelte` | quick-pick 폴리시, setup token 카드 렌더링 미구현 |

### ❌ 미이식

| 프로토타입 | 우선순위 |
|---|---|
| `topology_linear.jsx` (794줄) | P2 |
| `topology_inbox.jsx` | P2 |
| TweaksPanel (개발용) | P3 |

---

## 3. 시각적 버그 & 개선 필요 항목

### ✅ 완료

- ChartSvg → PhaseChart 이식 (캔들 + 페이즈밴드 + OI/Funding/CVD 스트립)
- CgChart 실시간 데이터 연결 (BTC/ETH klines, 4H 기본)
- Layout A/B/C/D 전환 동작 (D=PEEK 완전 동작)
- EmptyCanvas 구현
- 패널 border `1px solid var(--g4)` 전체 적용
- 텍스트 대비 `var(--g6/g7)` 전체 적용
- Sidebar `width: 100%` 오버플로우 수정
- appSurfaces.ts terminal → `/cogochi` 리디렉션
- `/cogochi` 글로벌 WTD 헤더 표시
- NotificationTray cogochi 모드에서 억제
- TrainMode 5-탭 전체 구현 (Library/Active/Rules/Rejudge/Model)

### P0 · 미해결

| 항목 | 현상 | 수정 방향 |
|---|---|---|
| **Layout A/B** | stub (EmptyCanvas) | Layout A = Chart only, Layout B = Chart+AI 2분할 구현 |
| **Layout C** | stub | chart + AI sidebar 완전 구현 |
| **JudgePanel 3열** | 수직 스택 | flex row로 Plan\|Judge\|AfterResult 나란히 |
| **Scan 다중뷰** | grid만 있음 | WideGridView, TableView, StripView 추가 |

### P1 · 개선 필요

| 항목 | 설명 |
|---|---|
| PeekDrawer 애니메이션 | 프로토타입: `@keyframes peekSlide` — 현재: transition 없음 |
| Evidence/Proposal 동적 바인딩 | TradeMode hardcoded array → 실제 백엔드 데이터 |
| 패널별 리사이즈 | Chart↕Peek 사이 Splitter 필요 (현재 Sidebar/AI만 리사이즈 가능) |

### P2 · 백로그

- topology_linear.jsx 794줄 이식
- topology_inbox.jsx 이식
- AIPanel quick-pick + setup token 카드

---

## 4. 파일 경계

```
app/src/lib/cogochi/
  AppShell.svelte           — 최상위 orchestrator
  shell.store.ts            — 전역 상태
  CommandBar.svelte         — 상단 슬림바 ✅
  CommandPalette.svelte     — ⌘P 팔레트 ✅
  TabBar.svelte             — 탭 ✅
  Sidebar.svelte            — 왼쪽 라이브러리 ✅
  AIPanel.svelte            — 오른쪽 AI ⚠️ 부분
  Splitter.svelte           — 드래그 리사이저 ✅
  StatusBar.svelte          — 하단 ✅
  PhaseChart.svelte         — SVG 정적 차트 ✅
  modes/
    TradeMode.svelte        — Layout A/B/C stub, D(PEEK) ✅, CgChart ✅
    TrainMode.svelte        — ✅ 5탭 전체 구현 NEW
    RadialTopology.svelte   — ✅

app/src/components/terminal/peek/
  PeekDrawer.svelte         — ⚠️ 탭 shell
  ScanGrid.svelte           — ⚠️ grid만
  JudgePanel.svelte         — ⚠️ 수직스택
```

---

## 5. 다음 구현 우선순위

1. **P0** JudgePanel 3열 수평 (Plan|Judge|AfterResult side-by-side)
2. **P0** Layout A/B 구현 (Chart-only / Chart+AI 2분할)
3. **P0** Layout C 완성 (chart + AI info sidebar)
4. **P1** PeekDrawer transition 애니메이션
5. **P1** ScanGrid WideGridView/TableView 추가
6. **P2** topology_linear.jsx 이식
