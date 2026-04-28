# 05 — Visualization Engine (Intent → Template → Chart Config)

**Owner:** Product / Frontend
**Depends on:** `04_AI_AGENT_LAYER.md`

## 0. 핵심 원칙

> **유저 질문의 목적에 맞는 템플릿을 선택하고, 핵심 신호만 강조해서 차트를 생성한다.**

- ❌ 모든 데이터를 항상 그린다
- ❌ "OI 보여줘" 처럼 데이터 지향 명령에 맞춘다
- ✅ "세력 들어왔냐" 처럼 질문 의도에 맞춘다

---

## 1. 현재 화면 문제 (진단)

스크린샷 기준 실제 결함:
1. 차트가 메인이어야 하는데 주변 카드들이 더 진해서 집중력 분산
2. 같은 정보가 오른쪽 패널과 하단 패널에 중복
3. Analyze / Execute / Summary / Evidence가 동일 위계로 소리침
4. `Proposal / Entry / Stop / Target`이 analyze 단계에 노출 (순서 꼬임)
5. Indicator raw 값이 "판단 UI처럼" 카드화됨
6. Free-form floating canvas (최근 시도)는 목표였던 IDE split-pane과 다른 방향

---

## 2. 6 Intent

| Intent | 자연어 예시 | 검색 유발 | Primary Template |
|---|---|---|---|
| WHY | "왜 떨어졌냐", "여기 원인이 뭐냐" | No | event_focus |
| STATE | "지금 뭐냐", "매집 중이냐" | No | state_view |
| COMPARE | "TRADOOR랑 비슷?", "PTB 비교" | Yes | compare_view |
| SEARCH | "비슷한 거 찾아줘" | Yes | scan_grid |
| FLOW | "세력 들어왔냐", "OI 흐름?" | Maybe | flow_view |
| EXECUTION | "진입 어디?", "손절 어디?" | No | execution_view |

분류기는 § 03 §2 / § 04 §2의 Parser가 처리. 실패 시 default = STATE.

---

## 3. 6 Template

### 3.1 event_focus (WHY)

**목적**: 특정 이벤트 원인 설명

**Layout**: single panel, full-width chart

**Panels**:
- Price (primary, emphasized on target candle)
- OI (secondary)
- Funding (muted)
- Volume (muted)

**Overlays**:
- Red circle on event candle
- Label callout with causal reason
- OI spike marker
- Funding flip dot (if relevant)

**Hidden**: execution board, compare split, grid

### 3.2 state_view (STATE)

**목적**: 현재 phase 상태

**Layout**: single panel, HUD on right

**Panels**:
- Price (primary)
- OI (secondary)
- Volume (muted)

**Overlays**:
- Phase zones colored (fake_dump: gray, real_dump: red, accumulation: yellow, breakout: green)
- Higher lows markers
- Breakout line
- Current phase badge

**HUD Cards**:
1. Current pattern + phase + confidence
2. Top 3 evidence
3. Risk (2-3 items)
4. Next transition condition
5. Actions (Save Setup, Compare, Explain)

### 3.3 compare_view (COMPARE)

**목적**: 현재 vs 레퍼런스

**Layout**: split pane (left: current, right: reference)

**Panels each**:
- Price
- OI (inline)

**Bottom panel**:
- Phase path diff table
- Feature diff table (current vs ref)
- Similarity score breakdown

### 3.4 scan_grid (SEARCH)

**목적**: 여러 후보 탐색

**Layout**: 6-12 mini chart grid

**Per tile**:
- Small price chart
- Phase badge
- Similarity score
- One-line key signal

**Sort options**: confidence / similarity / breakout proximity

**Actions per tile**:
- Expand → opens state_view
- Save
- Compare with query

### 3.5 flow_view (FLOW)

**목적**: 포지션/자금 흐름

**Layout**: single panel, OI prominent

**Panels**:
- Price (minimized, top 30%)
- OI (primary, large)
- Funding histogram
- Liquidation density strip
- CVD (optional)

**Overlays**:
- OI spike markers
- Funding extreme zones
- Liquidation cluster highlights

### 3.6 execution_view (EXECUTION)

**목적**: 실제 진입 판단

**Layout**: price panel + execution board

**Overlays**:
- Entry line (bold green)
- Stop line (red)
- Target lines (1R, 2R, 3R)
- Invalidation level
- Risk-reward box

**Bottom**:
- Minimum 3 evidence required
- Breakout confirmation checklist

⚠️ **기본 화면에서 이걸 강하게 띄우면 안 된다.** 유저가 명시적으로 "진입하자" 모드 진입 시만.

---

## 4. Highlight Planner

같은 template이라도 intent 세부에 따라 강조 대상이 바뀐다.

```python
def plan_highlights(intent: Intent, pattern_context: PatternContext) -> HighlightPlan:
    """
    Rule 1: primary = 1 only
    Rule 2: secondary ≤ 2
    Rule 3: rest is muted
    """
    if intent == "WHY" and pattern_context.event_type == "dump":
        return HighlightPlan(
            primary="price_dump_candle",
            secondary=["oi_spike", "funding_extreme"],
            muted=["volume", "cvd"],
        )
    if intent == "STATE" and pattern_context.phase == "accumulation":
        return HighlightPlan(
            primary="accumulation_zone",
            secondary=["higher_lows", "oi_hold"],
            muted=["funding", "liquidation"],
        )
    if intent == "FLOW":
        return HighlightPlan(
            primary="open_interest",
            secondary=["funding_rate", "liq_density"],
            muted=["cvd"],
        )
    # ...
```

---

## 5. Chart Config Builder

### 5.1 데이터 구조

```python
@dataclass
class ChartPanelConfig:
    panel_type: Literal["price", "oi", "funding", "cvd", "volume", "compare_price", "feature_diff", "liquidation"]
    visible: bool = True
    emphasis: Literal["primary", "secondary", "muted"] = "secondary"
    overlays: list[dict] = field(default_factory=list)
    markers: list[dict] = field(default_factory=list)

@dataclass
class ChartViewConfig:
    template: str                          # "event_focus" etc
    title: str
    symbol: str
    timeframe: str
    layout: Literal["single", "split", "grid"]
    panels: list[ChartPanelConfig]
    annotations: list[dict] = field(default_factory=list)
    hud_summary: dict = field(default_factory=dict)
    workspace_sections: list[str] = field(default_factory=list)
```

### 5.2 Builder

```python
def build_chart_config(
    intent: IntentClassification,
    pattern_context: PatternContext,
    user_preferences: UserPrefs,
) -> ChartViewConfig:
    template = INTENT_TO_TEMPLATE[intent.intent]
    highlights = plan_highlights(intent, pattern_context)
    panels = build_panels_for_template(template, pattern_context, highlights)
    
    return ChartViewConfig(
        template=template,
        title=render_title(intent, pattern_context),
        symbol=pattern_context.symbol,
        timeframe=pattern_context.timeframe,
        layout=LAYOUT_FOR_TEMPLATE[template],
        panels=panels,
        hud_summary=build_hud_summary(pattern_context, highlights),
        workspace_sections=WORKSPACE_FOR_TEMPLATE[template],
    )

WORKSPACE_FOR_TEMPLATE = {
    "event_focus": ["event_explanation", "evidence"],
    "state_view":  ["phase_timeline", "evidence_table", "ledger"],
    "compare_view": ["feature_diff", "similarity_breakdown", "reference_ledger"],
    "scan_grid":   ["candidate_list", "similarity_histogram"],
    "flow_view":   ["flow_timeline", "liquidation_heatmap"],
    "execution_view": ["entry_checklist", "risk_calculator"],
}
```

---

## 6. Layout Rule — IDE-style Split Pane

### 6.1 목표 레이아웃

```
┌────────────────────────────────────────────┬──────────────────┐
│                                            │                  │
│         MAIN CHART (70%)                   │   DECISION HUD   │
│  candles + OI pane + funding pane + ...   │   (20% fixed)    │
│                                            │                  │
├────────────────────────────────────────────┴──────────────────┤
│                                                                │
│          ANALYZE WORKSPACE (bottom 30%, resizable)            │
│  Phase Timeline | Evidence | Compare | Ledger | Judgment     │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 6.2 Resizable 규칙 (Claude Code / VSCode style)

- **Divider drag**: 좌우 또는 상하
- **Min size**: sidebar 240px, main 400px
- **Double-click divider**: reset to default ratio
- **Persistence**: localStorage + user profile (cross-device)
- **Mobile**: split disabled, collapse buttons 대신

### 6.3 3 Mode 분리

현재 Observe/Analyze/Execute가 한 화면에 섞여서 복잡해짐. 분리해야 함.

**Observe Mode** (빠른 스캔)
- 차트 중심, HUD 최소, workspace 접힘

**Analyze Mode** (한 심볼 깊게, default)
- 차트 + HUD + workspace 열림

**Execute Mode** (진입/손절 결정)
- execution_view template
- 나머지 evidence는 축약

모드 전환은 top bar toggle. 각 모드의 pane ratio는 독립 저장.

---

## 7. Decision HUD (오른쪽)

**절대 5카드 초과 금지**:

1. **Pattern Status**
   - `Pattern: oi_reversal_v1`
   - `Phase: ACCUMULATION`
   - `Confidence: 0.78`

2. **Top Evidence (3)**
   - Higher lows 3
   - OI hold after spike
   - Funding flip confirmed

3. **Risk (2-3)**
   - Breakout not confirmed
   - Real-dump retest possible
   - BTC macro headwind

4. **Next Transition**
   - `If breakout_strength > 0.01 AND oi_reexpansion → BREAKOUT`
   - `If fresh_low_break → INVALIDATION`

5. **Actions**
   - Save Setup
   - Compare
   - Explain (AI)

**금지**: raw feature table, P&L, indicator chip, settings.

---

## 8. Analyze Workspace (하단)

탭이 아니라 **섹션**. 동시 보기 가능.

### 8.1 Sections

1. **Phase Timeline**
   ```
   FAKE → ARCH → REAL → ACCUM → BREAKOUT
                          ↑ 현재
   ```
   Horizontal chain, current phase highlighted, past phases with duration badge.

2. **Evidence Table**
   | Feature | Current | Threshold | Status | Matters |
   |---|---|---|---|---|
   | oi_zscore | 2.7 | >2.0 | ✓ | real_dump 핵심 |
   | funding_flip | yes | yes | ✓ | accumulation 전환 |
   | breakout_strength | 0.004 | >0.01 | ✗ | 아직 breakout 아님 |

3. **Compare**
   Three tabs: seed pattern / saved case / near-miss

4. **Ledger**
   Recent 20 outcomes + rolling stats (hit_rate, avg_return, EV)

5. **Judgment**
   Buttons: Valid / Invalid / Near Miss / Too Early / Too Late + optional comment

### 8.2 Sections are collapsible

유저가 원하는 섹션만 펼침. 기본 열림: Phase Timeline + Evidence Table.

---

## 9. Color System

```
가격 상승   : teal #26a69a
가격 하락   : red #ef5350
OI         : cyan #22d3ee
Funding +  : green
Funding -  : red
CVD        : white / light blue
Phase: fake_dump   : gray translucent
Phase: arch_zone   : light purple
Phase: real_dump   : red translucent
Phase: accumulation: amber translucent
Phase: breakout    : green translucent
```

### 9.1 Neutral p50 rule

Percentile value가 p40-p60 사이면 **무색 (g9)**. Extreme만 색 강조.
- Warn tier (p27-p72 이탈): amber mild 35%
- Extreme (p8-p92 이탈): amber strong 75%
- Historical (p2-p98 이탈): amber solid + 2s pulse

참조: `indicator-visual-design.md` Archetype A.

### 9.2 선/레이어 굵기

- Price line: 2px
- Indicator line: 1px
- Grid: 0.5px (거의 안 보이게)
- Phase zone fill: 8% opacity
- Highlight circle: 1.5px stroke, no fill

---

## 10. Component Library (Svelte)

```
app/src/lib/viz/
  templates/
    EventFocusTemplate.svelte
    StateViewTemplate.svelte
    CompareViewTemplate.svelte
    ScanGridTemplate.svelte
    FlowViewTemplate.svelte
    ExecutionViewTemplate.svelte
  panels/
    PricePanel.svelte
    OIPanel.svelte
    FundingPanel.svelte
    CVDPanel.svelte
    VolumePanel.svelte
  hud/
    DecisionHUD.svelte
    PatternStatusCard.svelte
    EvidenceCard.svelte
    RiskCard.svelte
    NextTransitionCard.svelte
    ActionsCard.svelte
  workspace/
    PhaseTimeline.svelte
    EvidenceTable.svelte
    CompareSection.svelte
    LedgerSection.svelte
    JudgmentSection.svelte
  engine/
    IntentClassifier.ts
    HighlightPlanner.ts
    ChartConfigBuilder.ts
    TemplateRouter.svelte
  layout/
    SplitPane.svelte           # resizable divider
    ModeSwitcher.svelte        # Observe/Analyze/Execute
```

---

## 11. 화면 모드 스펙 (모바일 vs 데스크탑)

| Feature | Desktop | Mobile |
|---|---|---|
| Split pane | Full resizable | Disabled, collapse buttons |
| HUD | Right fixed 20% | Bottom sheet overlay |
| Workspace | Bottom 30% resizable | Full-screen tab |
| Mini-grid | 6-12 tiles | Max 4 tiles |
| Hover preview | Yes | No (tap only) |

---

## 12. Data Flow

```
user input (natural language or capture range)
  │
  ▼
Parser (§04) → PatternDraft
  │
  ▼
IntentClassifier → Intent
  │
  ▼
Pattern Context Resolver (load engine state for current symbol)
  │
  ▼
Template Selector → template string
  │
  ▼
Highlight Planner → HighlightPlan
  │
  ▼
ChartConfigBuilder → ChartViewConfig
  │
  ▼
TemplateRouter (Svelte) → render specific template component
```

---

## 13. Performance

| Operation | Target | Limit |
|---|---|---|
| Intent classification | 200ms | 1s |
| Chart config build | 50ms | 200ms |
| Chart render (Lightweight Charts) | 100ms | 500ms |
| Panel switch (mode) | 50ms | 200ms |
| HUD update on phase change | 100ms | 500ms |

---

## 14. Non-Goals

- Heavy 3D visualizations
- Animated transitions between templates (distracting)
- User-editable template JSON (scope creep)
- Real-time streaming > 1 update/second
- Drawing tools (comp with TradingView, don't compete there)
- Screenshot-to-AI for drawing interpretation (Phase 3)

---

## 15. Validation Checklist (UX 리뷰 시)

```
[ ] 한 화면에 primary highlight = 1
[ ] Secondary ≤ 2
[ ] Raw numeric 은 workspace 하단에만
[ ] 동일 정보 중복 없음 (HUD vs workspace)
[ ] Execution board는 execute mode에서만 강하게
[ ] Color p50 무색 rule 준수
[ ] Mobile split 비활성화 확인
[ ] Divider double-click reset 작동
[ ] Pane ratio localStorage 저장
[ ] Phase timeline은 state_view에 항상 있음
```
