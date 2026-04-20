# Terminal Attention Workspace

## Goal

Define the terminal as a chart-first quant workspace where:

- `LEFT` selects what to inspect.
- `CENTER` remains a persistent chart workspace for observing structure.
- `RIGHT` presents ranked conclusions, risks, catalysts, and source confidence.
- AI adjusts emphasis and detail depth without constantly changing the layout itself.

## Product Principle

The terminal is not a dashboard of cards. It is a chart workspace with an attached interpretation engine.

Core rules:

- The chart is always visible first.
- The center board must remain the largest surface.
- Left rail is a compact selector, not a result surface.
- Right rail is the primary result surface, not a secondary sidebar.
- Information density should be progressive: compact at rest, detailed on demand.
- The system should avoid creating many hard UI modes; instead, it should change emphasis and ranking within a stable layout.

## Layout Roles

### Left Rail

Purpose:

- Choose subject, cohort, or trigger quickly.

Allowed content:

- Watchlist rows
- Scanner alerts
- Anomalies
- Presets / saved queries
- Minimal badges or compact metrics

Disallowed content:

- Long explanations
- Large result cards
- Detailed risk narratives
- Source provenance detail

Recommended width:

- Ideal: `180px` to `220px`
- Minimum: `180px`

### Center Board

Purpose:

- Observe market structure directly.

Always-on structure:

1. Thin header meta strip
2. Main price chart
3. Indicator pane stack
4. Compact evidence strip
5. Compact microstructure summary

Center board should never be replaced by a large summary slab. Density should be expressed via overlays, panes, markers, and compact strips.

Recommended width:

- Minimum: `720px`
- Preferred: `55%` to `62%` of available desktop width

### Right Rail

Purpose:

- Read the conclusions derived from the current subject and current evidence.

Persistent block set:

- Verdict
- Action
- Risk
- Catalyst
- Sources / Freshness

These blocks remain present, but their order and expansion state can change based on attention.

Recommended width:

- Ideal: `320px` to `420px`
- Minimum: `320px`

## Width Specification

| Panel | Default | Minimum | Ratio |
|---|---:|---:|---:|
| Left Rail | `220px` | `180px` | `14–18%` |
| Center Board | `1fr` | `720px` | `54–62%` |
| Right Rail | `380px` | `320px` | `24–30%` |

## Responsive Rules

- Narrow desktop: keep `LEFT = 180px`, `RIGHT = 320px`, preserve center width first.
- Tablet: collapse left rail to icon rail, move right rail toward drawer behavior, preserve center workspace first.
- Mobile: center becomes the single primary view; left and right surfaces move to sheet/drawer patterns.

## Stable Layout, Dynamic Emphasis

The product should not depend on many hard presentation modes like `focus`, `alert`, `event`, or `scan`.

Instead:

- The layout remains stable.
- The active subject changes.
- The visible panes change.
- The ranking of right-rail blocks changes.
- Expanded detail panels open when needed.

This makes the workspace more legible, more predictable, and easier for AI to control.

## Selection Model

The entire workspace should key off a single selection state.

```ts
interface TerminalSelectionState {
  activeSubject: {
    kind: 'symbol' | 'alert' | 'anomaly' | 'preset' | 'compare';
    symbol?: string;
    symbols?: string[];
    source?: string;
    reason?: string;
    timestamp?: number;
  };
  timeframe: string;
}
```

Selection sources:

- Left rail row click
- Prompt-driven subject changes
- Chart marker / evidence click
- Default app state

## Left Click State Transitions

| Left Action | `activeSubject.kind` | Center Change | Right Change |
|---|---|---|---|
| Watchlist symbol click | `symbol` | Load that symbol chart and pane state | Load that symbol verdict/result |
| Scanner alert click | `alert` | Chart + alert marker + trigger context | Emphasize risk/catalyst around that alert |
| Anomaly click | `anomaly` | Chart + event marker + stronger flow emphasis | Emphasize anomaly interpretation and catalyst |
| Preset click | `preset` | Update selected universe / compare context | Show top candidate summary or grouped result |
| Chart evidence click | unchanged | Open or focus detail panel | Focus related right-rail block |

Rule:

- Left-rail selection always updates both center and right.
- Center updates the observed market structure.
- Right updates the interpreted conclusion.

## Attention Model

AI should act as an attention allocator rather than a mode router.

```ts
interface TerminalAttentionState {
  centerPaneWeights: {
    price: number;
    oi: number;
    funding: number;
    flow: number;
    onchain: number;
    microstructure: number;
  };
  rightBlockWeights: {
    verdict: number;
    action: number;
    risk: number;
    catalyst: number;
    sources: number;
  };
  expandedDetail: null | 'evidence' | 'orderbook' | 'liquidity' | 'sources';
}
```

The system uses these weights to:

- decide which panes are visible or visually emphasized in the center
- rank right-rail blocks
- determine which detail tray or panel opens

## Attention Update Rules

| Trigger | Center Weight Change | Right Weight Change | Subject Change |
|---|---|---|---|
| Symbol selection | `price = 1.0`, default `oi/funding` | `verdict/action` favored | Yes |
| Alert / anomaly selection | increase `flow` and marker emphasis | favor `risk/catalyst` | Yes |
| Prompt: `OI랑 funding 같이 봐` | increase `oi`, `funding` | unchanged | No |
| Prompt: `왜 bearish야?` | unchanged | increase `verdict/risk` explanation weight | No |
| Prompt: `ETH랑 비교해` | enable compare overlays / pane emphasis | favor comparison summary | Yes |
| Evidence chip click | expand matching detail | focus related block | No |

## Prompt Influence

Prompts do not need many hard branches. They should primarily influence:

- subject
- chart emphasis
- explanation emphasis

Useful prompt effects:

- `BTC 보여줘`
  - update selected subject
- `OI랑 funding 같이 봐`
  - increase `oi` and `funding` pane weights
- `왜 bearish야?`
  - increase `risk`, `catalyst`, or `verdict` explanation emphasis
- `ETH랑 비교해`
  - update selected subject to comparison set

The layout remains the same while emphasis changes.

## Prompt Intent Vector

Prompt processing should stay shallow and update emphasis rather than create hard UI modes.

```ts
interface IntentVector {
  subjectShift: number;
  chartShift: number;
  explanationShift: number;
  comparisonShift: number;
  urgencyShift: number;
}
```

Examples:

| Prompt | Primary Effect |
|---|---|
| `BTC 보여줘` | `subjectShift` up |
| `OI랑 funding 같이 봐` | `chartShift` up |
| `왜 bearish야?` | `explanationShift` up |
| `ETH랑 비교해` | `subjectShift` + `comparisonShift` up |
| `지금 리스크 뭐야?` | `urgencyShift` + `explanationShift` up |

## Center Board Specification

### 1. Header Meta Strip

Compact inline meta only:

- Symbol
- Timeframe
- Last price
- 24h change
- OI delta
- Funding
- Freshness

This strip should feel closer to Binance than to a dashboard card deck.

### 2. Main Price Chart

Persistent, dominant surface.

Should support:

- Price candles
- Pattern labels
- Entry / stop / target overlays
- Liquidation bands
- Event markers
- Key levels

### 3. Pane Stack

Pane stack should support:

- OI
- Funding / CVD
- Flow
- On-chain

Not all panes must be visible at once. Pane visibility is controlled by attention and user choice.

## Pane Specification

| Pane | Default | Meaning | Data Source |
|---|---|---|---|
| Price | Always on | Primary market structure | OHLCV, levels, patterns, markers |
| OI | Default on | Leverage expansion / contraction | Open interest delta |
| Funding / CVD | Default on | Positioning / execution flow | Funding, CVD, taker flow |
| Flow | Optional | Exchange flow context | Exchange inflow / outflow / netflow |
| On-chain | Optional | CryptoQuant / Glassnode context | Reserve, stablecoin reserve, SOPR, NUPL, related metrics |
| Compare | On demand | Two-subject comparative view | Selected symbols |

## Overlay Specification

- Pattern labels
- Entry / stop / target levels
- Liquidation bands
- Event markers
- VWAP / EMA
- Session ranges

## Platform Borrowing Rules

| Platform | What to Borrow |
|---|---|
| TradingView | Chart-first structure, overlays, drawings, pane separation, timeframe UX |
| Binance | Inline market meta, high-density market structure summaries, immediate read of price/funding/OI/volume |
| CryptoQuant / Glassnode | Meaningful on-chain / exchange-flow metrics, comparable timeseries, contextual research signals |

### 4. Evidence Strip

Compact evidence chips only.

Examples:

- `OI expanding`
- `Funding negative`
- `Aggressive buys`
- `Exchange outflow building`

Clicking a chip should open an expanded detail panel or shift focus to the right rail.

### 5. Microstructure Summary

Compact summaries only:

- Orderbook: spread / imbalance / taker ratio
- Liquidity: long / short clusters, nearest levels

Detailed ladder or liquidation table should open on demand.

## Right Rail Specification

The right rail is the main result surface.

Persistent blocks:

1. Verdict
2. Action
3. Risk
4. Catalyst
5. Sources / Freshness

Block ranking changes according to attention. Examples:

- strong pattern setup:
  - `Verdict`, `Action` ranked highest
- anomaly or crowding risk:
  - `Risk`, `Catalyst` ranked highest
- uncertain data quality:
  - `Sources / Freshness` ranked higher

## Right Rail Block Priority Examples

| Situation | Suggested Priority |
|---|---|
| Strong pattern setup | `Verdict -> Action -> Risk -> Catalyst -> Sources` |
| Alert / anomaly selected | `Risk -> Catalyst -> Verdict -> Action -> Sources` |
| Data confidence weak | `Sources -> Catalyst -> Risk -> Verdict -> Action` |
| Interpretation-heavy prompt | `Verdict -> Risk -> Catalyst -> Action -> Sources` |

## Progressive Disclosure Rules

Compact at rest:

- small badges
- short chips
- one-line summaries

Expanded on demand:

- evidence detail
- orderbook detail
- liquidity detail
- source detail

The center should remain clean until the user clicks or asks for more.

## Disclosure Triggers

- Evidence chip click -> `EvidenceDetailPanel`
- Orderbook summary click -> `OrderbookDetailPanel`
- Liquidity summary click -> `LiquidityDetailPanel`
- Source badge click -> `Sources` detail + freshness
- Right-rail block click -> expand that block in place

## Data Engine Layers

### Market Structure Engine

Fast cadence.

Includes:

- OHLCV
- OI
- Funding
- CVD / taker
- Orderbook / depth
- Liquidation clusters

Feeds primarily into the center board.

### On-Chain / Flow Context Engine

Slower cadence.

Includes:

- Exchange inflow / outflow / netflow
- Exchange reserve
- Stablecoin reserve
- Entity-adjusted activity
- SOPR / holder behavior

Feeds catalyst and optional lower panes.

### Decision Engine

Produces:

- verdict
- action
- invalidation
- confidence
- risk
- catalyst summary

Feeds the right rail.

### Attention Engine

Consumes:

- selection
- prompt intent
- current market state

Produces:

- pane emphasis
- right-rail block ranking
- expanded detail target

## Recommended File Architecture

State and models:

- `app/src/lib/terminal/terminalSelectionState.ts`
- `app/src/lib/terminal/terminalAttentionModel.ts`
- `app/src/lib/terminal/terminalHeaderModel.ts`
- `app/src/lib/terminal/terminalChartWorkspaceModel.ts`
- `app/src/lib/terminal/terminalBoardModel.ts`
- `app/src/lib/terminal/terminalRailModel.ts`
- `app/src/lib/terminal/terminalPromptIntent.ts`

Primary components:

- `app/src/components/terminal/workspace/TerminalLeftRail.svelte`
- `app/src/components/terminal/workspace/TerminalHeaderMeta.svelte`
- `app/src/components/terminal/workspace/TerminalCenterBoard.svelte`
- `app/src/components/terminal/workspace/CenterChartPane.svelte`
- `app/src/components/terminal/workspace/CenterPaneStack.svelte`
- `app/src/components/terminal/workspace/EvidenceStrip.svelte`
- `app/src/components/terminal/workspace/MicrostructureSummary.svelte`
- `app/src/components/terminal/workspace/TerminalRightRail.svelte`
- `app/src/components/terminal/workspace/RightVerdictBlock.svelte`
- `app/src/components/terminal/workspace/RightActionBlock.svelte`
- `app/src/components/terminal/workspace/RightRiskBlock.svelte`
- `app/src/components/terminal/workspace/RightCatalystBlock.svelte`
- `app/src/components/terminal/workspace/RightSourcesBlock.svelte`

Expanded detail components:

- `app/src/components/terminal/workspace/EvidenceDetailPanel.svelte`
- `app/src/components/terminal/workspace/OrderbookDetailPanel.svelte`
- `app/src/components/terminal/workspace/LiquidityDetailPanel.svelte`

## Implementation Phases

### Phase 1

- Add `TerminalHeaderMeta`
- Introduce `terminalSelectionState`
- Keep chart-first layout intact

### Phase 2

- Introduce `terminalRailModel`
- Rebuild right rail as ranked result blocks

### Phase 3

- Introduce `terminalAttentionModel`
- Use attention to rank right rail and show/hide panes

### Phase 4

- Add progressive detail panels for evidence, orderbook, and liquidity

### Phase 5

- Add optional flow / on-chain pane integration

## File-by-File Implementation Order

| Phase | File(s) | Goal |
|---|---|---|
| 1 | `terminalSelectionState.ts` | Normalize all subject changes into one selection state |
| 2 | `terminalPromptIntent.ts` | Parse prompts into shallow intent vectors |
| 3 | `terminalAttentionModel.ts` | Convert selection + prompt + market state into weights |
| 4 | `terminalHeaderModel.ts` | Keep header meta compact and slab-free |
| 5 | `terminalChartWorkspaceModel.ts` | Manage panes, overlays, and markers around the chart |
| 6 | `terminalRailModel.ts` | Rank and shape right-rail result blocks |
| 7 | `TerminalHeaderMeta.svelte` | Render compact inline meta |
| 8 | `TerminalCenterBoard.svelte` | Render persistent chart workspace with pane stack |
| 9 | `TerminalRightRail.svelte` | Render ranked result blocks |
| 10 | `TerminalLeftRail.svelte` | Emit normalized selection payloads |
| 11 | `app/src/routes/terminal/+page.svelte` | Reduce to model orchestration only |

## Success Criteria

- The user always sees a chart immediately on entering the terminal.
- Left rail remains narrow and selection-oriented.
- Right rail becomes the clear destination for verdict, action, risk, and catalyst reading.
- New prompts can change emphasis without causing disruptive layout shifts.
- The design remains stable even as new data sources are added.

---

## Implementation Status (2026-04-21)

> 아래 섹션은 설계 north star와 실제 구현 사이의 현재 상태를 기록한다.
> 설계 원칙은 여전히 유효하며, 구현이 수렴해야 할 방향이다.

### 실제 구현 구조: Cogochi Shell

3-rail 레이아웃 대신 **IDE-style Cogochi AppShell** 로 구현됨.

```
DESKTOP (≥1280px)
  CommandBar (top)
  TabBar
  ┌─────────────┬──────────────────────┬───────────┐
  │  Sidebar    │  TradeMode           │  AIPanel  │
  │  (240px,    │  (flex: 1)           │  (380px,  │
  │  toggle)    │                      │  toggle)  │
  └─────────────┴──────────────────────┴───────────┘
  StatusBar (bottom)

MOBILE (<768px)
  MobileTopBar (symbol / TF / AI toggle)
  mobile-canvas → TradeMode (mobileView prop)
    chart-section (ChartBoard)
    tab-strip (02 ANL / 03 SCAN / 04 JUDGE)
    scrollable panel
  MobileFooter (ticker strip)
  AI bottom sheet (52%, slide-up animation)

TABLET (768-1279px)
  Same as desktop shell, but layoutMode forced to 'D', sidebar/AI hidden
```

### TradeMode Layout Modes (데스크탑)

| Mode | 설명 | 구현 상태 |
|------|------|-----------|
| A (PEEK) | 차트 상단 + 3탭 드로어 (ANALYZE/SCAN/JUDGE) | ✅ |
| B | 차트 + 우측 패널 | ✅ |
| C | 풀스크린 차트 | ✅ |
| D | 기본 (모바일·태블릿 강제) | ✅ |

### ChartBoard 실제 구현

- LightweightCharts 기반, 500-bar 캔들
- 인디케이터 pane: OI, CVD/Volume, 추가 지표 스택 (IndicatorPaneStack)
- 데스크탑 툴바 (ChartToolbar): TF 선택, Save Setup 진입점
- 모바일: chart-toolbar + chart-header--tv 숨김 (`:global()` CSS override)
- 라이브 데이터: Redis kline cache → Binance WS fallback

### 설계 대비 미구현

| 설계 항목 | 상태 |
|-----------|------|
| Attention weights (pane/right-rail 동적 강조) | ❌ 미구현 |
| Right Rail 블록 랭킹 변동 | ❌ 미구현 |
| terminalSelectionState.ts canonical store | ❌ 미구현 |
| terminalAttentionModel.ts | ❌ 미구현 |
| Progressive disclosure (chip click → detail panel) | ❌ 미구현 |

### 실제 파일 위치

| 역할 | 실제 파일 |
|------|-----------|
| Shell orchestration | `app/src/lib/cogochi/AppShell.svelte` |
| Store | `app/src/lib/cogochi/shell.store.ts` |
| Trade view (desktop+mobile) | `app/src/lib/cogochi/modes/TradeMode.svelte` |
| Chart board | `app/src/components/terminal/workspace/ChartBoard.svelte` |
| Mobile top bar | `app/src/lib/cogochi/MobileTopBar.svelte` |
| AI panel | `app/src/lib/cogochi/AIPanel.svelte` |
| Viewport tier | `app/src/lib/stores/viewportTier.ts` |
