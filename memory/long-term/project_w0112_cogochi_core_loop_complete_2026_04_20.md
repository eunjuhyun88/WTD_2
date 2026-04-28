---
name: W-0112 Cogochi Core Loop 완료 (2026-04-20)
description: Cogochi Core Loop 전체 구현 완료 — PEEK 레이아웃 + 17개 Svelte 컴포넌트 + 터미널 통합
type: project
originSessionId: 2da3cf7c-0b06-4a81-b3bb-82e292972d35
---
## 완료 상태 (2026-04-20)

**W-0112 전체 완료**: Cogochi Core Loop (Cursor-style IDE shell) 전체 구현
- 커밋: 6129d9d (PEEK drawer layout), 064852c (terminal 통합)
- 브랜치: claude/w-0113-terminal-ui-sync

## 핵심 구현

### 1. Shell 아키텍처
- **AppShell.svelte**: 전체 레이아웃 오케스트레이션
  - CommandBar (⌘P palette, range toggle, AI toggle)
  - TabBar (멀티 탭, 타이틀 표시)
  - Sidebar (Library/Verdicts/Rules 섹션)
  - 3가지 모드 캔버스: Trade/Train/Flywheel
  - AIPanel (오른쪽 AI 챗)
  - StatusBar (mode pills, verdict count, model delta, 시계)

### 2. State Management
- **shell.store.ts**: 중앙 상태 관리
  - Svelte store + derived stores
  - `localStorage('cogochi_shell_v3')` 자동 저장
  - 타입: ShellState, Tab, TabState
  - 메서드: openTab, closeTab, switchMode, toggleSidebar, toggleAI, resizable pane handlers
  - activeTab, activeMode, activeTabState, verdictCount, modelDelta 파생 상태

### 3. Core Components (17개)
- **CommandBar.svelte**: 로고, 세션칩, 명령 팔레트 트리거, range/AI 토글
- **CommandPalette.svelte**: 8개 명령, Escape/Enter/필터링
- **TabBar.svelte**: 활성 탭 하이라이트, 닫기 버튼, 새 탭 추가
- **StatusBar.svelte**: 모드 선택기, scanner 상태, verdict 카운트, model delta, 시계
- **Sidebar.svelte**: 3탭 섹션 (Library/Verdicts/Rules)
  - LibrarySection: 4개 pattern template (match count)
  - VerdictsSection: 5개 recent verdicts (Y/N indicator, PnL)
  - RulesSection: 4개 rules (confidence bar, live indicator)
- **SectionHeader.svelte**: 재사용 헤더 (label + hint + action button)
- **AIPanel.svelte**: 메시지 스트림, 아바타, textarea input, ⌘Enter send
- **Splitter.svelte**: 수평/수직 리사이저, hover 색상 변화, drag callback

### 4. TradeMode — PEEK Layout (Layout D)
**구조:**
```
Chart Hero (flex: 1)
├─ Header: symbol · timeframe · pattern · [spacer] · INDICATORS [OI, Funding, CVD, VWAP]
└─ Body: ChartBoard integration ready

PEEK Bar (always visible)
├─ Tabs: ANALYZE (pos) | SCAN (blue) | JUDGE (amb)
│  └─ Color-coded underline, font size 8/11, desc text
├─ Confidence meter: label + 60px bar + value "82"
└─ Toggle button: ▴/▾ OPEN/CLOSE

PEEK Drawer (expandable, 20-82% height, peekOpen=true)
├─ Resizer (drag to resize, hover shows gray)
├─ Content flex layout
└─ Tab content:
   ├─ ANALYZE: 분석 text + inline styles (color:pos, 코드 배경)
   ├─ SCAN: ScanGrid component (live alerts + similar patterns)
   └─ JUDGE: JudgePanel component (verdict entry + recent judgments)
```

**상태:**
- `peekOpen`: 드로어 열림/닫힘
- `peekHeight`: %로 저장 (clamped 20-82)
- `drawerTab`: 'analyze' | 'scan' | 'judge'
- `onResizerDown`: 드래그 시작, mousemove/mouseup 리스너

**Styles:**
- Inline color tokens: `--tab-color` for active underline
- 모든 색상 var(--g0-9), var(--pos/neg/amb) 사용
- Font: JetBrains Mono 8-11px, Geist for body text
- Gap: 6px (container), 10px (bar), 14px (drawer content)
- Border-radius: 6px (chart/drawer), 10px (pills), 2px (small)

### 5. 다른 모드
- **TrainMode.svelte**: "TRAIN MODE · Inbox" placeholder
- **RadialTopology.svelte**: SVG flywheel (center + 6 nodes + lines)

### 6. 전역 스타일 (/cogochi route)
- CSS variables: --g0-9, --pos/neg/amb with variants
- Fonts: Geist + JetBrains Mono via Google Fonts
- Reset: scrollbar, button, input
- 색상 체계: 다크 모드 (g0=#050608 → g9=#e8eaec)

## 키보드 단축키
- **⌘B**: sidebar toggle
- **⌘L**: AI panel toggle
- **⌘P**: command palette open
- **⌘T**: new tab
- **⌘W**: close tab (if >1 tab)

## 파일 구조
```
app/src/
├─ lib/cogochi/
│  ├─ shell.store.ts (중앙 상태)
│  ├─ AppShell.svelte (레이아웃 오케스트레이션)
│  ├─ CommandBar.svelte
│  ├─ CommandPalette.svelte
│  ├─ TabBar.svelte
│  ├─ StatusBar.svelte
│  ├─ Sidebar.svelte
│  ├─ AIPanel.svelte
│  ├─ Splitter.svelte
│  ├─ SectionHeader.svelte
│  ├─ sections/
│  │  ├─ LibrarySection.svelte
│  │  ├─ VerdictsSection.svelte
│  │  └─ RulesSection.svelte
│  └─ modes/
│     ├─ TradeMode.svelte (PEEK layout)
│     ├─ TrainMode.svelte
│     └─ RadialTopology.svelte
└─ routes/cogochi/
   └─ +page.svelte (entry point + global styles)
```

## 다음 단계
1. **TrainMode 구현**: Inbox topology (Verdict Inbox UI)
2. **RadialTopology 완성**: Flywheel visualize (animated nodes/connections)
3. **ChartBoard 통합**: TradeMode chart hero에 실제 차트 렌더링
4. **브라우저 테스트**: 전체 layout, keyboard shortcuts, mode switching, drag resize
5. **PR #116 생성**: main 머지

## 기술 메모
- Svelte 5 runes ($state, $derived, $effect, $props) 사용
- TypeScript strict mode 준수
- localStorage key: 'cogochi_shell_v3' (v2 이전 사용 중이므로 v3로 신규)
- CustomEvent 패턴: window.dispatchEvent('cogochi:cmd', detail)
- 모든 색상 CSS variables 사용 (테마 전환 가능)
- 리사이저 drag state 관리: mousedown → mousemove/mouseup listeners
- 다른 branch (W-0110-C UI Dedup)와 독립적 진행

## 테스트 대기
- [ ] /cogochi 로드 시 layout 표시
- [ ] Command palette (⌘P) 실행 및 명령 선택
- [ ] Tab 전환 및 세션 독립성
- [ ] Sidebar toggle (⌘B)
- [ ] AI panel toggle (⌘L)
- [ ] PEEK drawer 확장/축소 + resizer drag
- [ ] ANALYZE/SCAN/JUDGE 탭 전환
- [ ] ScanGrid + JudgePanel 렌더링
- [ ] localStorage persistence 확인
