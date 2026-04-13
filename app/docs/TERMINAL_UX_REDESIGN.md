# Terminal UX Redesign — CPO/UX Spec

> **Version:** 1.0 — 2026-04-13
> **Author:** CPO / UX
> **Status:** Design spec → implementation pending
> **Based on:** COGOCHI_ARCHITECTURE_V2.md, COGOCHI.md §8.1, screenshot audit

---

## 문제 진단 (Current State Audit)

### 스크린샷에서 발견한 구조적 문제

| 문제 | 현재 | 아키텍처 의도 |
|------|------|-------------|
| 차트 없음 | VerdictCard(AI 분석 + Evidence 17개)가 전체 화면 차지 | `/terminal` = 차트 중심 Capture 화면 |
| Capture 액션 부재 | Save Setup 버튼 찾기 어려움 | Capture가 7-step flow의 시작점 |
| Evidence 카드 과부하 | 17개 미니차트가 동시 노출 | 클릭해서 볼 수 있어야 함 (Progressive disclosure) |
| 레벨 정보 분산 | Stop/TP가 태그 안에 묻힘 | Entry / Stop / TP1 명확하게 분리 노출 |
| Pattern Phase 미노출 | PatternStatusBar 위치 불명확 | 현재 어느 Phase인지 차트에 직접 표시 |
| 차트 ↔ 분석 단절 | 차트와 AI 분석이 별도 뷰 | 차트에 AI 레벨 오버레이, 한 화면에서 판단 |

---

## 설계 원칙 (Design Principles)

1. **Chart-First** — 캔들차트가 항상 중심. 모든 분석은 차트 위 또는 옆에 붙음
2. **Capture Pathway Visible** — Save Setup / CAPTURE CTA가 항상 보임
3. **Verdict as Annotation** — AI 버딕트는 차트를 대체하지 않고 주석을 붙임
4. **Progressive Disclosure** — 기본은 심플, 클릭/탭하면 깊어짐
5. **Pattern Phase as Context** — 현재 phase를 차트 아래에 항상 표시
6. **Answer First** — WHY(이유)가 WHAT(지표값)보다 먼저 보임

---

## 새 레이아웃 (New Layout)

### Desktop (1280px+)

```
┌── CommandBar (40px) ──────────────────────────────────────────────────────────┐
│  [BTC/USDT▾] [15m · 1H · 4H · 1D] [● BULLISH]  [Focus|Hero3|2×2]  [⚡CAPTURE]│
├── LeftRail (240px fixed) ──┬─── ChartZone (flex) ──────────┬── RightPanel ────┤
│                             │                               │  (360px fixed)   │
│  ╔═ PATTERN ENGINE ═══════╗ │  ╔══ ChartBoard ════════════╗ │                  │
│  ║ ● TRADOOR               ║ │  ║                          ║ │  ┌─ VERDICT ──┐  │
│  ║   ACCUMULATION phase   ║ │  ║   Candlestick + overlays ║ │  │ ● BULLISH   │  │
│  ║   BTC · ETH · BNB      ║ │  ║   BB / EMA / ATR bands   ║ │  │ Confidence │  │
│  ╚═══════════════════════╝ │  ║   ── price level lines ── ║ │  │ High       │  │
│                             │  ║   entry · stop · TP       ║ │  └────────────┘  │
│  ─── QUICK ──────────────── │  ╠══════════════════════════╣ │                  │
│  Buy Candidates             │  ║   Volume sub-panel (20%) ║ │  WHY             │
│  What's Wrong               │  ╠══════════════════════════╣ │  Wyckoff +24     │
│  High OI                    │  ║   OI sub-panel    (15%) ║ │  MTF Conf +24    │
│  Breakout Watch             │  ╚══════════════════════════╝ │  OI Squeeze +12  │
│  Short Squeeze              │                               │                  │
│                             │  ┌─ PatternStatusBar ───────┐ │  AGAINST         │
│  ─── SCANNER ─────────────  │  │ TRADOOR · ACCUM · 3d in  │ │  vol_below_avg   │
│  No alerts yet              │  └──────────────────────────┘ │                  │
│  scanner runs every 15m     │                               │  ── LEVELS ────  │
│                             │  ┌─ Evidence Strip ─────────┐ │  Entry  70,750   │
│  ─── TOP MOVERS ──────────  │  │ ▶ WYCK+24 MTF+24 OI+12  │ │  Stop   72,272   │
│  BTC  +2.1%                 │  │   [▾ show 14 more]        │ │  TP1    72,267   │
│  ETH  +1.8%                 │  └──────────────────────────┘ │                  │
│  SOL  +3.4%                 │                               │  ── EVIDENCE ──  │
│                             │                               │  [탭: 17 미니차트] │
├─────────────────────────────┴───────────────────────────────┴────────────────  ┤
│  BottomDock: [BTC/USDT 4H · Binance Spot●LIVE · Market Engine●]  [Ask... ▷]   │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 핵심 변경사항

| 영역 | 이전 | 이후 |
|------|------|------|
| **메인 보드 (Focus mode)** | VerdictCard (분석 + 17 mini-charts) | ChartBoard (캔들 + 보조지표) |
| **AI 분석 위치** | 메인 보드 전체 점유 | 우측 패널 (RightPanel) |
| **Evidence 카드** | 17개 동시 노출 | Evidence Strip (점수만) + 확장 시 차트 |
| **CAPTURE 버튼** | BottomDock 안에 숨김 | CommandBar 우측 항상 노출 |
| **PatternStatusBar** | 위치 불명확 | ChartBoard 바로 아래 |
| **Price levels** | 버딕트 태그에 묻힘 | RightPanel LEVELS 섹션 분리 |
| **Left Rail** | Quick Queries 위주 | Pattern Engine 섹션 최상단 추가 |

---

## 컴포넌트별 설계

### 1. CommandBar (변경)

```
[Symbol Picker ▾]  [TF: 15m · 1H · 4H · 1D]  [● BULLISH]  [Focus|Hero3|2×2]  [⚡ CAPTURE]
```

- `⚡ CAPTURE` 버튼: 항상 우측에 노출. 클릭 → SaveSetupModal open
- Flow Bias 배지: BULLISH / BEARISH / NEUTRAL (색상 dot)
- Layout 스위처: Focus 기본

### 2. ChartZone (새 컨셉, WorkspaceGrid 대체)

Focus mode에서:
```svelte
<!-- 차트가 메인, 분석은 우측 패널 -->
<ChartBoard
  symbol={activePair}
  tf={activeTf}
  levels={chartLevels}        ← entry/stop/TP price lines
  phaseAnnotations={patternPhases}  ← phase 진입 시점 vertical line
  onSaveSetup={handleCapture}
/>
<PatternStatusBar
  symbol={activePair}
  states={patternStates}
/>
<EvidenceStrip
  verdict={activeVerdict}
  onExpand={() => rightPanelTab = 'evidence'}
/>
```

Hero+3 / 2×2 mode에서:
- 기존 AssetInsightCard 그리드 유지 (다중 심볼 비교)
- 우측 패널에 선택된 심볼 분석 표시

### 3. RightPanel — Verdict Intelligence Panel

5개 탭 → 3섹션 + 2탭으로 재구성:

**기본 노출 (항상 보임, 탭 아님)**
```
┌─ VERDICT ──────────────────────┐
│  ● BULLISH  · Confidence: High │
│  BTC/USDT · 4H                 │
└────────────────────────────────┘

WHY (Answer-first)
  Wyckoff 매집 완료 — Spring+SOS 확인 (Phase D)
  [1H] Phase D (SOS) score=+24
  OI 단체 과잠재 OI/Vol 8.13× (+12)

AGAINST
  volume_below_average

LEVELS
  Entry   70,749
  Stop    72,272    (Invalidation)
  TP1     72,267
  TP2     —
```

**탭 1: EVIDENCE** (17 mini-charts 그리드)
- 기존 VerdictCard의 evidence 그리드 그대로
- 우측 패널 탭으로 이동

**탭 2: MTF** (Multi-timeframe alignment)
```
15m  ↑ BULLISH
1H   ↑ BULLISH  ← active
4H   → NEUTRAL
1D   ↑ BULLISH
Confluence: 3/4
```

**탭 3: ENTRY** (기존 Entry tab)
- EntryZoneCard / StopLossCard / TakeProfitCard / RRCard

**탭 4: CATALYSTS** (news + events)

**탭 5: METRICS** (OI / Funding / CVD panels)

### 4. EvidenceStrip (새 컴포넌트)

ChartBoard 아래 1줄짜리 요약 바:

```
[ WYCK +24 ] [ MTF +24 ] [ OI +12 ] [ ATR +3 ] [ F/G +8 ] [ ON-CHAIN +6 ]  [+11 more ▾]
```

- 점수 양수: green, 음수: red, 0: muted
- `[+11 more ▾]` 클릭: 우측 패널 EVIDENCE 탭으로 포커스
- 개별 배지 클릭: 해당 지표 mini-chart 팝업

### 5. PatternStatusBar (강화)

```
┌─ PATTERN ENGINE ──────────────────────────────────────────────────────────┐
│  TRADOOR  ·  ● ACCUMULATION phase  ·  entered 3 days ago                 │
│  BTC  ETH  BNB   +2 more  [View all →]                                   │
└───────────────────────────────────────────────────────────────────────────┘
```

- `[View all →]` → `/patterns` 페이지로 이동
- 현재 심볼이 어느 패턴/phase에 있으면 강조

### 6. LeftRail (섹션 재배치)

```
PATTERN ENGINE    ← 최상단 (신규)
  ● TRADOOR
    ACCUMULATION · BTC ETH BNB

QUICK QUERIES
  Buy Candidates
  What's Wrong
  High OI
  Breakout Watch
  Short Squeeze

SCANNER ALERTS
  (alerts or empty state)

TOP MOVERS
  BTC +2.1%
  ETH +1.8%
  SOL +3.4%
```

---

## Capture (Save Setup) 플로우

```
사용자가 차트에서 구간 발견
        ↓
CommandBar의 [⚡ CAPTURE] 클릭
또는 ChartBoard 내 "Save this setup" 컨텍스트 메뉴
        ↓
SaveSetupModal 열림
  - Symbol (auto-filled)
  - TF (auto-filled)
  - Phase label selector: FAKE_DUMP / ARCH_ZONE / REAL_DUMP / ACCUMULATION / BREAKOUT / GENERAL
  - Note (textarea)
  - [Save as PatternSeed]
        ↓
POST /api/engine/capture/seed
        ↓
AutoResearch 큐에 등록 (SSE 스트림)
        ↓
PatternProposalCard 표시 (RightPanel 하단 또는 모달)
  - best_match_slug: "tradoor-oi-reversal-v1"
  - match_score: 0.87
  - proposed_phases: [...]
  - similar_cases: Top 3
  - [Confirm → PatternObject 생성] | [Edit] | [Discard]
```

---

## 데이터 흐름 (Data Flow)

```
activePair + activeTf
        ↓
/api/cogochi/analyze → analysisData
  ├─ deep.verdict → BiasCard
  ├─ deep.atr_levels → chartLevels (price lines on chart)
  ├─ deep.layers → EvidenceStrip + Evidence tab
  └─ deep.score_summary → WHY / AGAINST

/api/chart/klines → ChartBoard (candles + volume)

/api/patterns/states → PatternStatusBar (phase per symbol)

/api/market/ohlcv → ChartBoard OI subpanel

/api/market/trending → LeftRail TopMovers

/api/cogochi/alerts → LeftRail ScannerAlerts
```

---

## 구현 순서 (Implementation Order)

### Phase 1 — 차트 중심 재배치 (이번 sprint)
1. `+page.svelte`: Focus mode에서 `ChartBoard`를 메인으로 렌더
2. `WorkspaceGrid`: focus layout에 ChartBoard + PatternStatusBar + EvidenceStrip 배치
3. `RightPanel` (`TerminalContextPanel`): Verdict summary 섹션 (WHY/AGAINST/LEVELS) 추가
4. `EvidenceStrip.svelte`: 신규 컴포넌트 (1줄 score 배지들)
5. `CommandBar`: CAPTURE 버튼 추가

### Phase 2 — AutoResearch 연동 (Sprint 3)
6. `PatternProposalCard.svelte`: AutoResearch 결과 표시
7. `engine/autoresearch/` 파이프라인 구현
8. SSE 스트림 연동

### Phase 3 — Evidence 고도화
9. 개별 Evidence mini-chart 팝업
10. MTF alignment 탭
11. Liquidation map 연동

---

## 불변 규칙 (Design Invariants)

1. Focus mode에서 차트는 항상 보임 (Evidence 카드가 차트를 덮지 않음)
2. CAPTURE 버튼은 항상 1-click 거리
3. Verdict는 차트를 대체하지 않고 우측에 붙음
4. PatternStatusBar는 차트 바로 아래 항상 표시
5. Evidence는 EvidenceStrip(기본)과 탭(확장)으로 2단계 노출
6. 모바일: mode-switching (차트 모드 → 분석 모드 → 캡처 모드)

---

## 화면별 레이아웃 토큰

```css
--terminal-left-w:   240px;
--terminal-right-w:  360px;
--terminal-cmd-h:     40px;
--terminal-dock-h:    56px;
--chart-main-ratio:    60%;   /* of ChartZone height */
--chart-vol-ratio:     20%;
--chart-oi-ratio:      20%;
--evidence-strip-h:    36px;
--pattern-bar-h:       44px;
```
