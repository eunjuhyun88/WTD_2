# W-0402 — Terminal UX 전면 재설계 (TradingView-grade Layout)

> Wave: 7 | Priority: P0 | Effort: L
> Charter: In-Scope (Frozen 전면 해제 — 2026-05-01)
> Status: 🟡 Design Draft (2026-05-04 전면 개정)
> Created: 2026-05-04
> Issue: #1058
> Owner: Sonnet (구현)

---

## Goal

TradingView 급 차트 UX + Bloomberg 급 정보 위계로 Terminal Hub를 전면 재설계한다.
기능을 새로 만들지 않는다 — 이미 있는 60+ 컴포넌트를 올바른 zone에 재배치하고, 중복·분산된 UI를 통합한다.

**사용자가 얻는 것:**
- 차트 최대화 (좌우 패널 자유롭게 접기)
- 드래그 → AI 판정 → 저장까지 한 흐름으로
- 정보가 분산(푸터/오버레이/모달)되지 않고 우측 AI 패널 한 곳에

---

## 1. 레이아웃 골조

### 1.1 CSS Grid (현재 flex → grid 전환)

```css
.app-shell {
  display: grid;
  grid-template-rows: 40px auto 1fr 28px;
  /* topbar | newsflash | body | statusbar */
  grid-template-columns:
    var(--watch-w, 200px)   /* WatchlistRail */
    40px                    /* DrawingRail — 항상 고정 */
    1fr                     /* ChartArea */
    var(--ai-w, 320px);     /* AIAgentPanel */
  grid-template-areas:
    "topbar   topbar topbar topbar"
    "news     news   news   news"
    "watchlist draw   chart  ai"
    "statusbar statusbar statusbar statusbar";
  height: 100dvh;
  overflow: hidden;
}

/* Fold/expand 상태 */
.app-shell[data-watch="folded"]  { --watch-w: 20px; }
.app-shell[data-ai="folded"]     { --ai-w: 20px; }
.app-shell[data-ai="wide"]       { --ai-w: 480px; }
```

### 1.2 전체 와이어프레임 (1280px+)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ TOPBAR (40px) grid-area: topbar                                              │
│ [BTC/USDT ▾] │ 95,650 +1.2% │ H 96,200 L 94,900 Vol $1.2B │ OI FR │ [TRADE|TRAIN|FLY] │
├──────────────────────────────────────────────────────────────────────────────┤
│ NEWSFLASHBAR (22px auto, 뉴스 있을 때만) grid-area: news                     │
│ FR +0.081% — BTC whale flow 420M ...                               [× dismiss]│
├──────────────┬──────┬──────────────────────────────────────┬────────────────┤
│ WATCHLIST    │ DRAW │ CHART AREA                           │ AI AGENT       │
│ 200px        │ 40px │ flex:1                               │ 320px          │
│ (→ 20px)     │ (고정│                                      │ (→480px / 20px)│
│              │)     │ ChartToolbar (36px)                  │                │
│ WATCH [+ ][←]│  ☐   │ [1m][3m][5m][15m][30m][1h][4h][1D] │ [DEC][PAT][VER]│
│ ─────────── │  ╱   │  | [Candle▾] | [+Ind] [Draw] [Snap] │ [RES][JDG]     │
│ ★BTC 95,650 │  ─   │  | flex-gap  | [⚙] [Save]           │ ─────────────  │
│  +1.2%      │  ▭   │ ──────────────────────────────────── │ 🔍 AI search.. │
│  ▁▂▄▆█▆▄▂  │  Φ   │                                      │ ─────────────  │
│ ─────────── │  ╱╱  │ ChartCanvas (flex:1)                 │ [active tab    │
│ ○ETH  3,200 │  A   │  z:0  Chart series (lc)              │  inline content│
│  +0.8%      │  📝  │  z:10 AI Overlay (lines/boxes)       │  scrollable]   │
│  ▁▃▅▆██     │ ─── │  z:20 DrawingCanvas                  │                │
│             │  ↩   │  z:50 PaneInfoBar (per pane)         │                │
│ ─────────── │  ↪   │                                      │  [→ 더 보기]   │
│ WHALES [▾]  │  🗑  │ IndicatorPaneStack (per indicator)   │  Drawer slide  │
│ (접힌 상태)  │      │  └ RSI(14) 65.4  [⚙][✕]            │  out (320px)   │
│             │      │  └ OI 4h  +2.1%  [⚙][✕]            │                │
│             │      │ ──────────────────────────────────── │  [⟨] fold      │
│             │      │ ★ Drag-to-save wizard (steps 1-4)   │  [⤢] wide      │
│    [>]      │      │   (chart 하단 overlay, 4-step)       │                │
├──────────────┴──────┴──────────────────────────────────────┴────────────────┤
│ STATUSBAR (28px) grid-area: statusbar                                        │
│ F60 ▓▓▓▓░ 0.73 │ ↻ 12s │ ● WAIT │ ─────── │ scanner 380sym · 14s │ ●●●● 09:27 │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 양측 접힘 상태

```
┌──────┬────┬───────────────────────────────────────────────┬────┐
│TOPBAR│    │ TOPBAR cont.                                  │    │
├──────┴────┴───────────────────────────────────────────────┴────┤
│                      NEWSFLASHBAR                              │
├──┬────┬────────────────────────────────────────────────────┬──┤
│W │ D  │         CHART (100% 폭, 양측 20px strip 제외)      │ A │
│ │RAW │                                                    │ I │
│[>│    │         차트 최대화, 인디케이터 full                │[<│
│]  │    │                                                    │] │
├──┴────┴────────────────────────────────────────────────────┴──┤
│                         STATUSBAR                              │
└────────────────────────────────────────────────────────────────┘
단축키: [ = Watchlist toggle | ] = AI Panel toggle | ⌘0 = 양측 reset
```

### 1.4 모바일 (≤768px)

```
┌─────────────────────────────┐
│ MobileTopBar (44px)         │
│ ☰  BTC/USDT  +1.2%  [Mode] │
├─────────────────────────────┤
│ NewsFlash (22px, 있을 때만) │
├─────────────────────────────┤
│ ChartCanvas (~55vh)         │
│ 단일 price pane             │
│ touch pan + pinch zoom      │
├─────────────────────────────┤
│ ChartToolbar (36px, 가로    │
│ 스크롤 가능)                 │
│ [1m][3m][5m][15m][30m][1h]→ │
├─────────────────────────────┤
│ IndicatorPaneStack (자동)   │
├─────────────────────────────┤
│ Verdict 요약 카드 (56px)    │
│ ● LONG 68%  [↑ 패널 열기]  │
├─────────────────────────────┤
│ MobileBottomNav (56px)      │
│ 🏠  📊  🎯  🧪  ⚙         │
└─────────────────────────────┘

↑ 패널 열기 탭 시 → Bottom Sheet (90vh):
┌─────────────────────────────┐
│ ▬▬▬ drag handle             │
│ [DEC][PAT][VER][RES][JDG]  │
├─────────────────────────────┤
│ (탭 내용, 스크롤)            │
└─────────────────────────────┘
```

---

## 2. Zone별 상세 설계

### 2.1 TOPBAR (40px, grid-area: topbar)

**레이아웃 (좌→우):**

| 요소 | 너비 | 숨김 | 비고 |
|---|---|---|---|
| Symbol button `[BTC/USDT ▾]` | 80px | 없음 | 클릭 → SymbolPicker |
| vdivider | 1px | 없음 | |
| Price block `95,650 +1.2%` | auto | 없음 | color-coded |
| OHLC strip `H 96,200 L 94,900 Vol $1.2B` | auto | `≤1024px` | |
| vdivider | 1px | `≤1024px` | |
| L2 quant `OI $12.4B ↑2.1% FR +0.012% Kim +0.34%` | auto | `≤1024px` | |
| flex-gap | flex:1 | - | |
| Mode strip `[TRADE][TRAIN][FLY]` | auto | 없음 | 활성 = amber border |

**완료:** TF strip 제거 ✅, IND/Settings 버튼 제거 ✅

**남은 작업:** L2 quant를 별도 row(현재)에서 TopBar 한 줄 안으로 통합

---

### 2.2 NEWSFLASHBAR (22px auto)

- 뉴스 없으면 `display:none` → grid row auto = 0px
- 뉴스 있으면 22px 높이로 나타남
- 우측 `[×]` dismiss
- 새 뉴스 오면 자동 재등장 (쿨다운 5분)

---

### 2.3 WATCHLIST RAIL (200px → 20px, grid-area: watchlist)

#### 펼친 상태 (200px):

```
┌──────────────────────┐
│ WATCH          [+][←]│  28px 헤더
├──────────────────────┤
│ ★ BTC/USDT    +1.2% │  44px per item
│    95,650            │
│    ▁▂▄▆█▆▄▂  spark  │
├──────────────────────┤
│ ○ ETH/USDT    +0.8% │
│    3,200             │
│    ▁▃▅▆██            │
├──────────────────────┤
│  ...                 │
├──────────────────────┤
│ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│ WHALES        [▾]   │  고래 섹션 헤더
│ BTC 1.2K move 14:32 │  (접힘 상태가 기본)
└──────────────────────┘
```

**각 아이템 (44px):**
- Row 1: 심볼명 (bold 10px) + 변화율 (우측, color-coded)
- Row 2: 현재 가격 (mono 11px)
- Row 3: 미니 sparkline (36px × 16px)
- 클릭 → `shellStore.setSymbol(s)`
- 활성 아이템: 좌측 2px amber 바

**고래 섹션:**
- 기본 collapsed (헤더 클릭으로 expand)
- expand 시 알림 카드 3~5개

#### 접힌 상태 (20px strip):
```
[>]  중앙 하나, 클릭하면 200px
```

**collapse 버튼:** 패널 오른쪽 엣지, hover 시만 표시 (기존 `.panel-collapse-btn` 패턴)
**단축키:** `[`
**persist:** `terminal:layout:v1` → `{ watchVisible: bool, aiVisible: bool, aiWidth: number }`

---

### 2.4 DRAWING RAIL (40px 고정, grid-area: draw)

항상 visible. Fold 없음. 아이콘만.

```
┌────┐
│ ☐  │ cursor / select  (V)
│ ╱  │ trend line       (T)
│ ─  │ horizontal line  (H)
│ ▭  │ rectangle        (R)
│ Φ  │ fibonacci        (F)
│ ╱╱ │ pitchfork        (P)
│ A  │ text label
│ 📝 │ note (sticky)
│────│ separator
│ ↩  │ undo  (⌘Z)
│ ↪  │ redo  (⌘⇧Z)
│ 🗑  │ 전체 삭제
└────┘
```

- 각 아이콘 버튼: 36×36px
- 활성 tool: amber 배경 + 1px amber border
- `DrawingRail.svelte` 이미 존재 → 위치만 독립 grid column으로 분리
- 현재 `sidebar-pane` 내부에 있음 → 수정 필요

---

### 2.5 CHART AREA (flex:1, grid-area: chart)

내부 구조 (flex column):

```
ChartArea
├── ChartToolbar (36px)       ← L1/ChartToolbar.svelte
├── TabBar (32px, 탭≥2 시만)  ← TabBar.svelte
└── ChartCanvas wrapper (flex:1, position:relative)
    ├── z:0   Chart series (lightweight-charts)
    ├── z:10  AIOverlay (lines, boxes, arrows, annotations)
    ├── z:20  DrawingCanvas overlay
    ├── z:30  PaneInfoBar (각 pane 좌상단, position:absolute)
    └── Drag-to-save Wizard (차트 하단 고정 overlay, z:100)
```

#### 2.5.1 ChartToolbar (36px)

```
[1m][3m][5m][15m][30m][1h][4h][1D] │ [Candle▾] │ [+Indicator] [Draw] [Snap] ─── [⚙] [Save]
```

| 요소 | 동작 |
|---|---|
| TF 8개 버튼 | `shellStore.setTimeframe(t)`, 활성 = amber underline + bold |
| vdivider | |
| Chart type `[Candle▾]` | 드롭다운: Candle / HA / Bar / Line / Area |
| vdivider | |
| `+Indicator` | `indicatorLibraryOpen = true` |
| `Draw` | drawing mode toggle (DrawingRail 활성화) |
| `Snap` | screenshot (후속 구현) |
| flex-gap | |
| `⚙` | IndicatorSettingsSheet |
| `Save` (amber) | drag-to-save wizard Step 1 진입 |

**이미 완료:** TF strip 추가 ✅, Chart type dropdown 있음 ✅

#### 2.5.2 PaneInfoBar (각 pane 좌상단 overlay)

**Price pane:**
```
BTC/USDT 1h   O 95,200  H 95,800  L 94,900  C 95,650
```
크로스헤어 이동 시 OHLCV 값 갱신.

**Indicator sub-pane:**
```
RSI(14)  65.4   [⚙][✕]
```
- `[⚙]` → IndicatorSettingsSheet
- `[✕]` → pane 제거 (price pane은 ✕ 없음)

#### 2.5.3 TabBar (32px, 탭 1개면 hidden)

탭 수 1 → `display:none`으로 32px 절약.

---

### 2.6 DRAG-TO-SAVE — 4-Step Bottom Wizard

현재 문제: ResearchPanel(좌 슬라이드) + RangeSelectionPanel(하단 도크)가 동시에 나타남.
해결: **단일 하단 wizard로 통합. 한 번에 하나의 스텝만.**

Wizard는 ChartCanvas 하단에 `position:absolute; bottom:0; left:0; right:0` (차트 overlap).

#### Step Indicator (wizard 상단 8px):
```
● ──── ● ──── ○ ──── ○      STEP 2/4 · 구간 확인
```
완료 = `●` filled, 현재 = `●` amber, 미래 = `○` dim.

---

#### Step 1 — 구간 선택 (48px)

```
┌─────────────────────────────────────────────────────────────────┐
│ ○ ──── ○ ──── ○ ──── ○     STEP 1/4 · 구간 선택               │
│ [✕ 취소]    앵커 A를 클릭하세요 → 앵커 B를 클릭하세요          │
└─────────────────────────────────────────────────────────────────┘
```
- 앵커 A 클릭 → 텍스트 "앵커 B를 클릭하세요"로 변경
- 앵커 B 클릭 → 자동 Step 2 이동 (별도 "다음" 버튼 없음)
- 차트 위: 파란 반투명 선택 rect 표시

**현재 `range-hint` div 제거** → 여기로 통합.

---

#### Step 2 — 구간 확인 (80px)

```
┌─────────────────────────────────────────────────────────────────┐
│ ● ──── ○ ──── ○ ──── ○     STEP 2/4 · 구간 확인               │
│ BTC/USDT · 1h · May 4  14:00 ~ 15:30 · 90봉                  │
│ O 95,200  H 95,800  L 94,900  C 95,650  +0.47%  Vol 1.2K      │
│ [← 다시 선택]                                      [다음 →]   │
└─────────────────────────────────────────────────────────────────┘
```
- `[← 다시 선택]` → Step 1으로 리셋
- `[다음 →]` → Step 3

---

#### Step 3 — AI 판정 (120px, 판정 후 더 커짐)

**판정 전:**
```
┌─────────────────────────────────────────────────────────────────┐
│ ● ──── ● ──── ○ ──── ○     STEP 3/4 · AI 판정                 │
│ RSI 65.4   vol_z 1.2   ATR% 0.8   MACD +12.4   BB_w 0.024     │
│                                                                  │
│                    [  판정 실행  ]                               │
│ [← 다시]                              [건너뛰기 →]             │
└─────────────────────────────────────────────────────────────────┘
```

**판정 중:**
```
│                    [  ⏳ 판정 중...  ]                           │
```

**판정 후:**
```
┌─────────────────────────────────────────────────────────────────┐
│ ● ──── ● ──── ● ──── ○     STEP 3/4 · 판정 완료               │
│ RSI 65.4   vol_z 1.2   ATR% 0.8                                │
│ ─────────────────────────────────────────────────────────────── │
│ ● LONG   68%   Entry 95,400   Stop 94,800   Target 96,800   RR 2.3x │
│ "저항선 돌파 시도 중, 볼륨 지지 있음"                           │
│ [← 다시]              [건너뛰기]              [다음 →]         │
└─────────────────────────────────────────────────────────────────┘
```
- `[건너뛰기]` = 판정 없이 Step 4
- `[다음 →]` = 판정 결과 포함해서 저장

---

#### Step 4 — 저장 (96px)

```
┌─────────────────────────────────────────────────────────────────┐
│ ● ──── ● ──── ● ──── ○     STEP 4/4 · 저장                    │
│ 라벨 (선택)   [____________ 패턴 이름 입력... ___________]       │
│                                                                  │
│ [✕ 취소]                                    [✓ 저장 완료]      │
└─────────────────────────────────────────────────────────────────┘
```
저장 완료 시:
1. Wizard 닫힘
2. AI Panel → Pattern 탭 자동 선택
3. 새 카드 최상단 추가 + 하이라이트 (amber, 2초 fade out)

**ResearchPanel overlay 제거:** `research-overlay` div 삭제. Research는 AI Panel → Research 탭으로만.

---

### 2.7 AI AGENT PANEL (320px → 480px → 20px, grid-area: ai)

#### 펼친 상태 구조:

```
┌──────────────────────────────────┐
│ [DEC][PAT][VER][RES][JDG]  [⤢][⟨]│  40px 탭바 + 우측 제어 버튼
├──────────────────────────────────┤
│ 🔍  AI search... (⌘L)           │  32px sticky
├──────────────────────────────────┤
│                                  │
│  [활성 탭 컨텐츠]                │
│  (스크롤 가능)                   │
│                                  │
│  인라인 카드 요약                │
│  [→ 더 보기] → Drawer           │
│                                  │
└──────────────────────────────────┘
```

탭 라벨 (320px 기준 64px/탭):
`[DEC] [PAT] [VER] [RES] [JDG]`

제어 버튼:
- `[⤢]` → 480px (wide mode)
- `[⟨]` → 20px (접힘) or `[⟩]` (접힌 상태에서 열기)

**단축키:** `]` = 접기/펼치기 토글

#### 2.7.1 Decision 탭 (DEC)

**인라인 (L1):**
```
● LONG   67%
─────────────────────────
[RSI 과매도] [지지선 반등] [볼륨 증가]   ← SourcePill × 3
─────────────────────────
[→ 분석 전체 보기]
```
- Direction badge: LONG=green, SHORT=red, AVOID=amber
- Top 3 evidence pills

**Drawer (L3, → 더 보기):**
- EvidenceGrid 전체
- WhyPanel
- StructureExplainViz
- F60GateBar 상세

#### 2.7.2 Pattern 탭 (PAT)

**현재 PatternLibraryPanelAdapter (전체화면 모달) → 여기로 통합.**

**인라인 (L1):**
```
Pattern Library
[🔍 심볼 / 라벨 검색...]
─────────────────────────
최근 저장 (12)
┌──────────────────────┐
│ ★ BTC/USDT 1h  May4 │  ← 방금 저장된 것 상단 + amber border
│   LONG 68%  +0.47%  │
└──────────────────────┘
┌──────────────────────┐
│   ETH/USDT 4h  May3 │
│   SHORT —  -1.2%    │
└──────────────────────┘
─────────────────────────
[전체 필터 →]
```

**Drawer (L3, 전체 필터):**
```
← Pattern Library  전체 (12)
─────────────────────────
심볼     [____________]
타임프레임 [4h ▾]
판정     [LONG ▾]
─────────────────────────
[결과 9개]
... 카드 목록 스크롤 ...
```

#### 2.7.3 Verdict 탭 (VER)

**인라인 (L1):**
```
최근 알림 (10)
─────────────────────────
• BTC whale move  14:32  [VIEW]
• ETH liq cluster 13:01  [VIEW]
• SOL pattern hit 12:45  [VIEW]
...
```

**Drawer (L3):**
- VerdictCard 전체
- Outcome history

#### 2.7.4 Research 탭 (RES)

**현재 `research-overlay` div → 여기로 통합.**

**인라인 (L1):**
```
[분석 질문 입력...  →]
─────────────────────────
마지막: 14:12
"BTC는 현재 저항선 96,000 근처에서
볼륨이 지지되는 형태..."
[3줄 요약]
[→ 전체 대화 보기]
```

**Drawer (L3):**
- ResearchPanel full chat UI

#### 2.7.5 Judge 탭 (JDG)

**인라인 (L1):**
```
진입 승률   68%
회피 적중   72%
최근 7일
─────────────────────────
[→ 전체 기록]
```

**Drawer (L3):**
- JudgePanel full
- Outcome history 테이블

#### 2.7.6 Drawer Slide-out 패턴

```
AI Panel (320px) + [Drawer (320px, slide from right)]
총 640px (또는 wide mode에서 480 + 320 = 800px, 오버레이로)
```

- `[→ 더 보기]` / `[→ 전체 보기]` 클릭 → Drawer 슬라이드
- Esc / 외부 클릭 / `[✕]` → Drawer 닫힘
- Drawer는 AI Panel 위에 `position:absolute; right:0` (패널 밖으로 나가지 않음)
- width: 320px (AI Panel 폭과 동일)

---

### 2.8 STATUSBAR (28px, grid-area: statusbar)

```
F60 ▓▓▓▓░ 0.73  │  ↻ 12s  │  ● WAIT  │ ─────── │  scanner 380sym · 14s  │  ●●●● 09:27
```

| 요소 | 위치 | 현재 상태 |
|---|---|---|
| F60 gate mini | 좌 | 있음 |
| Freshness `↻ 12s` | 좌 | 있음 |
| **mini Verdict `● WAIT`** | 좌 | **추가 필요** |
| flex-gap | - | - |
| Scanner live | 우 | 있음 |
| System health `●●●●` | 우 | 있음 |
| 시간 | 우 | 있음 |

---

## 3. Z-index 계층 전체

```
z:300  CommandPalette (⌘K), SymbolPicker modal
z:200  Drawer slide-out (AI Panel 내부)
z:190  — (예약)
z:100  Drag-to-save Wizard
z:90   Panel collapse/open strip 버튼
z:50   PaneInfoBar (각 pane 좌상단)
z:40   Crosshair (lc 내장)
z:30   DrawingCanvas
z:20   AI Overlay (lines, boxes, arrows, annotations)
z:10   Range selection highlight (drag-to-save 파란 rect)
z:0    Chart canvas (lc)
```

---

## 4. 컴포넌트 처리 요약

| 컴포넌트 | 현재 위치 | 이동/처리 |
|---|---|---|
| `TopBar.svelte` | app-shell 상단 | L2 quant 한 줄 통합 |
| `NewsFlashBar` | TopBar 아래 별도 row | grid-area: news (auto height) |
| `WatchlistRail` | sidebar-pane 안 | 독립 grid-area: watchlist |
| `DrawingRail` | sidebar-pane 안 | **독립** grid-area: draw (40px) |
| `ChartToolbar` (L1) | canvas-col 안 | grid-area: chart 상단 유지 |
| `ChartBoardHeader` | ChartBoard 안 | **삭제** — 기능 TopBar/ChartToolbar로 흡수됨 |
| `RangeSelectionPanel` | range-selection-dock | **재작성** → 4-step wizard |
| `ResearchPanel` (overlay) | research-overlay div | **제거** → AI Panel Research 탭 |
| `PatternLibraryPanelAdapter` | global overlay (position:fixed) | **제거** → AI Panel Pattern 탭 |
| `AIAgentPanel` | ai-pane | 5탭 + Drawer 구조로 확장 |
| `StatusBar` | app-shell 하단 | mini-verdict 추가 |
| `TerminalBottomDock` | (이미 없거나 제거됨) | 삭제 확인 |

---

## 5. 스토어 상태 (shell.store 추가 필드)

```typescript
// 현재 있는 필드 위에 추가
interface ShellState {
  // Layout
  sidebarVisible: boolean;   // WatchlistRail (기존)
  aiVisible: boolean;        // AIAgentPanel (기존)
  aiWidth: number;           // 320 | 480 (기존)
  aiWide: boolean;           // NEW: 480px wide mode

  // AI Panel
  rightPanelTab: 'decision' | 'pattern' | 'verdict' | 'research' | 'judge'; // 기존

  // Drag-to-save wizard
  wizardStep: 0 | 1 | 2 | 3 | 4;  // NEW: 0=inactive
  wizardJudgeVerdict: JudgeVerdict | null;  // NEW
  wizardLabel: string;  // NEW

  // StatusBar
  miniVerdict: 'long' | 'short' | 'avoid' | 'wait' | null;  // NEW
}
```

persist key: `terminal:layout:v1` (기존 `cogochi_shell_v12` 유지, 신규 필드만 추가)

---

## 6. Scope

**포함:**
- CSS Grid 4-column 전환 (현재 flex)
- WatchlistRail / DrawingRail 독립 grid column 분리
- AI Panel 3상태 (320 / 480 / 20px)
- Drag-to-save 4-step wizard (RangeSelectionPanel 재작성)
- Pattern Library → AI Panel Pattern 탭 (PatternLibraryPanelAdapter 모달 제거)
- ResearchPanel overlay 제거 → Research 탭으로
- StatusBar mini-verdict 추가
- TabBar 1탭 시 hidden
- TopBar L2 quant 단일 row 통합
- ChartBoardHeader 중복 컨트롤 정리 (TF / Indicator 중복 제거)
- 모바일 분기 (MobileTopBar + bottom sheet)
- Design tokens 일관성 (home palette)

**제외:**
- ChartBoard.svelte 2720L 내부 분해 (회귀 격리)
- 새 indicator 알고리즘
- 새 AI 백엔드
- Copy trading / 자동매매 (Frozen)

---

## 7. Non-Goals

- ChartBoard 분해 → 별도 W-0403
- 새 데이터 소스
- Replay 기능 (후속)
- Drawing 영구 DB 저장 (localStorage MVP)

---

## 8. Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| CSS Grid 전환 시 chart resize 미호출 | 높음 | 높음 | ResizeObserver → `chart.resize()` 필수 |
| Wizard Step 4 저장 후 AI Panel 자동 열림 (사용자 거슬림) | 낮음 | 낮음 | 이미 열려 있으면 tab만 전환 |
| PatternLibrary 모달 제거 → 진입점 소실 | 높음 | 높음 | AI Panel PAT 탭에 반드시 검색 + 전체 필터 |
| DrawingRail 분리 후 차트 pointer-events 충돌 | 중 | 중 | grid column 명확히 분리 (겹침 없음) |
| wizard가 차트 인터랙션을 막음 | 중 | 중 | wizard가 chart 하단 overlap만 (상단은 자유) |
| `terminal:layout:v1` 기존 `cogochi_shell_v12` 충돌 | 낮음 | 낮음 | 신규 필드만 추가, 기존 파싱 유지 |

---

## 9. PR 분해 계획

> 각 PR은 독립 배포 가능. shell → data → polish 순서.

### PR 1 — CSS Grid 골조 + 패널 분리 (M, 6-8 파일)

**목적**: flex → CSS Grid 4-column 전환. WatchlistRail/DrawingRail 독립 column. 패널 3상태.
**검증**: 토글 동작 / chart.resize() 자동 호출 / DrawingRail 위치 분리

파일:
- `TerminalHub.svelte` — grid 전환, WatchlistRail/DrawingRail 분리
- `TopBar.svelte` — L2 quant 단일 row 통합
- `StatusBar.svelte` — mini-verdict 추가
- `shell.store.ts` — aiWide, wizardStep, miniVerdict 필드 추가
- CSS: `--watch-w` / `--ai-w` CSS variable 기반 fold

Exit Criteria:
- [ ] AC1-1: CSS Grid 4-column 렌더링 (≥1280px)
- [ ] AC1-2: `[` / `]` / `⌘0` 단축키 동작
- [ ] AC1-3: DrawingRail 독립 40px column
- [ ] AC1-4: AI Panel 3상태 (320 / 480 / 20px) 전환
- [ ] AC1-5: chart.resize() 패널 크기 변경 시 자동 호출
- [ ] AC1-6: localStorage persist / restore
- [ ] CI green

### PR 2 — ChartToolbar + ChartBoardHeader 정리 (S, 4-5 파일)

**목적**: ChartBoardHeader 중복 컨트롤 제거. TabBar 1탭 시 hidden. 중복 TF/IND 정리.
**검증**: ChartBoardHeader 내 TF strip 없음. 탭 1개 시 TabBar 32px 사라짐.

파일:
- `workspace/ChartBoardHeader.svelte` — 중복 TF/indicator 컨트롤 제거
- `TabBar.svelte` — 탭 1개 시 `display:none`
- `L1/ChartToolbar.svelte` — Draw / Snap 버튼 추가

Exit Criteria:
- [ ] AC2-1: ChartBoardHeader에 TF strip 없음 (L1/ChartToolbar에만)
- [ ] AC2-2: 탭 1개 시 TabBar 숨김 (32px 공간 확보)
- [ ] AC2-3: `+Indicator` / `Draw` / `Snap` 버튼 기능
- [ ] CI green

### PR 3 — AI Agent Panel 5탭 + Pattern Library 통합 (M, 8-10 파일)

**목적**: AIAgentPanel 5탭 Drawer 구조. PatternLibrary → PAT 탭. ResearchPanel overlay 제거.
**검증**: 모달 없음. 모든 정보 탭 내에서 접근 가능.

파일:
- `panels/AIAgentPanel/AIAgentPanel.svelte` — 5탭 + Drawer slot
- `panels/AIAgentPanel/tabs/PatternTab.svelte` (신규) — 인라인 + Drawer
- `panels/AIAgentPanel/tabs/ResearchTab.svelte` (신규) — ResearchPanel wrap
- `PatternLibraryPanelAdapter.svelte` — 모달 트리거 로직 제거
- `TerminalHub.svelte` — `research-overlay` div 제거

Exit Criteria:
- [ ] AC3-1: PatternLibraryPanelAdapter 모달 미표시
- [ ] AC3-2: AI Panel PAT 탭 → 인라인 목록 + Drawer 필터 동작
- [ ] AC3-3: `research-overlay` div 제거. Research → AI Panel RES 탭
- [ ] AC3-4: Drawer slide-out 200ms ease-out 애니메이션
- [ ] CI green

### PR 4 — Drag-to-save 4-Step Wizard (M, 5-6 파일)

**목적**: RangeSelectionPanel을 4-step wizard로 재작성. ResearchPanel 분리 완전 제거.
**검증**: 4단계 순서대로 동작. 저장 후 PAT 탭 카드 추가.

파일:
- `shared/chart/overlays/RangeSelectionPanel.svelte` — 4-step wizard 재작성
- `TerminalHub.svelte` — range-hint / research-overlay 완전 제거
- `lib/stores/chartSaveMode.ts` — wizard step 상태 추가

Exit Criteria:
- [ ] AC4-1: Step 1 앵커 A→B 클릭 시 Step 2 자동 이동
- [ ] AC4-2: Step 3 판정 실행 → verdict 결과 표시
- [ ] AC4-3: Step 3 [건너뛰기] → Step 4 이동
- [ ] AC4-4: Step 4 저장 완료 → wizard 닫힘 + PAT 탭 카드 추가 + amber highlight
- [ ] AC4-5: [✕ 취소] 모든 스텝에서 wizard 즉시 종료
- [ ] CI green

### PR 5 — Design Tokens + Mobile (S, 4-5 파일)

**목적**: home 디자인 토큰 terminal 적용. 모바일 bottom sheet 5탭.
**검증**: visual diff 첨부. 768px 이하 bottom sheet 동작.

Exit Criteria:
- [ ] AC5-1: rose/peach palette 토큰 terminal 적용
- [ ] AC5-2: 모바일 ≤768px: MobileTopBar + bottom sheet 5탭
- [ ] AC5-3: bottom sheet open 시 chart pointer-events:none
- [ ] CI green

### PR 6 — Telemetry (S, 2-3 파일)

**목적**: 패널 토글·탭 사용 측정.

이벤트:
- `terminal_panel_toggle` `{ side: 'left'|'right', state: 'expanded'|'collapsed' }`
- `terminal_agent_tab_select` `{ tab: 'decision'|'pattern'|'verdict'|'research'|'judge' }`
- `terminal_wizard_step` `{ step: 1|2|3|4, action: 'next'|'back'|'skip'|'cancel'|'save' }`
- `terminal_chart_focus_duration` `{ ms: number }`

Exit Criteria:
- [ ] AC6-1: vitest 6케이스 PASS (schema valid/invalid)
- [ ] AC6-2: 0 PII
- [ ] CI green

---

## 10. 전체 Exit Criteria

- [ ] PR1~PR6 모두 merged
- [ ] CSS Grid 4-column 렌더링 (1280px+)
- [ ] 패널 3상태 (fold/default/wide) 동작 + localStorage persist
- [ ] 4-step wizard 전체 흐름 동작
- [ ] PatternLibrary 모달 제거 완료 (grep 확인)
- [ ] ResearchPanel overlay 제거 완료
- [ ] AI Panel 5탭 + Drawer 동작
- [ ] StatusBar mini-verdict 표시
- [ ] 모바일 bottom sheet 동작
- [ ] vitest CI green
- [ ] svelte-check 0 errors
- [ ] CURRENT.md main SHA 업데이트
