# W-0112-C · Core Loop Port 현황

Branch: `claude/w-0112-c-indicators`
Reference: `/tmp/handoff2/cogochi/project/` (Core Loop.html + 17 JSX files)

---

## ✅ 완료된 포팅

| 항목 | 참조 파일 | Svelte 위치 |
|------|----------|------------|
| 팔레트 (dark blue-gray) | Core Loop.html | `+page.svelte` |
| AppShell 4-구조 (CommandBar/Tabs/Sidebar/StatusBar) | shell.jsx | AppShell.svelte |
| Layout D — PEEK (chart hero + peekBar + overlay drawer) | mode_trade.jsx LayoutD | TradeMode.svelte |
| ANALYZE drawer (narrative + evidence grid + proposal) | trade_analysis.jsx | TradeMode.svelte |
| SCAN drawer (5-col grid + MiniChart SVG + PastSamplesStrip) | trade_scan.jsx | TradeMode.svelte |
| JUDGE drawer — ActPanel A/B/C (plan + judge + after result) | trade_act.jsx | TradeMode.svelte |
| AIPanel (welcome / 빠른선택 / 메시지 / 셋업토큰 / RUN→) | ai_chat.jsx | AIPanel.svelte |
| EmptyCanvas → 차트 전환 (analyzed state) | app.jsx | TradeMode.svelte |
| AI RUN → tradePrompt 와이어링 + 탭 리타이틀 | app.jsx | AppShell.svelte |
| AI 채팅 localStorage 영속성 | app.jsx | shell.store.ts |
| Splitter (sidebar/AI 패널 리사이즈) | splitter.jsx | Splitter.svelte |
| **CommandBar 로고**: JetBrains Mono 11px 0.14em weight-600 | shell.jsx | CommandBar.svelte |
| **StatusBar mode pills**: JetBrains Mono, active bg=`--g0`, border color-mix opacity, padding 2×10 | shell.jsx | StatusBar.svelte |
| **StatusBar hints**: `--g5` color (⌘B/⌘K/⌘T) + `--g4` dot separator | shell.jsx | StatusBar.svelte |
| **TabBar**: sidebar-toggle active=`--g8` inactive=`--g5`, all borders `--g4` | shell.jsx | TabBar.svelte |
| **Sidebar**: all borders `--g4` (right/section/footer) | shell.jsx | Sidebar.svelte |
| **LibrarySection**: `/` in `--pos`, tag in `--g8` | shell.jsx | LibrarySection.svelte |
| **OI/Funding/CVD 서브페인 리사이즈** | (없음) | ChartCanvas.svelte |

---

## ❌ 미완료 / 남은 작업

### 1. 미포팅 파일들 (MEDIUM~LOW)

| 파일 | 내용 | 우선순위 |
|------|------|---------|
| `tweaks.jsx` | 글로벌 CSS 트윅, 스크롤바, 선택 스타일 | LOW |
| `mode_train.jsx` | Train 인박스 전체 (verdict 리스트, 상세) | MEDIUM |
| `topology_radial.jsx` | Flywheel 방사형 토폴로지 뷰 | LOW |
| `topology_inbox.jsx` | Flywheel 인박스 뷰 | LOW |
| `topology_linear.jsx` | Flywheel 선형 뷰 | LOW |
| `data.jsx` | INBOX/CAPTURES mock data 레이어 | LOW |
| `chart.jsx` | 참조 차트 컴포넌트 (이미 ChartCanvas로 대체됨) | N/A |

---

## 🔧 남은 작업 (우선순위순)

### P1 — 다음

1. **tweaks.jsx 글로벌 CSS** — 스크롤바 스타일, 선택 색, 전역 `::selection`
2. **AIPanel border** — AI 패널 왼쪽 경계 `--g4`로 명시 (현재 Splitter만 있음)
3. **TradeMode 텍스트 세부 조정** — `ph-label` `scan-meta` `ev-note` `past-sim` 색상 참조와 일치 확인

### P2 — 나중에

4. **mode_train.jsx 포팅** (Train 인박스 전체)
5. **Flywheel topology** 3개 뷰 (topology_radial.jsx / topology_inbox.jsx / topology_linear.jsx)

---

## 현재 동작 확인된 기능

- ✅ EmptyCanvas → AI quick pick → SEND → RUN → → 차트 + PEEK 전환
- ✅ 탭 리타이틀 (setup text)
- ✅ PEEK 드로어 3탭 (ANALYZE/SCAN/JUDGE)
- ✅ PEEK 높이 드래그 리사이즈
- ✅ 사이드바/AI 패널 수평 드래그 리사이즈
- ✅ localStorage 상태 영속성
- ✅ ⌘B sidebar / ⌘L AI 토글
- ✅ 탭 열기/닫기/전환
- ✅ JUDGE: Y/N 판정, outcome, rejudge, bias box
