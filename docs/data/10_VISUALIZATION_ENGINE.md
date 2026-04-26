# 10 — Visualization Engine 정본

**Status:** Reference · 2026-04-27 (사용자 dump 보존)
**Source:** 2026-04-27 세션 (CTO + 사용자 협업)
**Replaces / extends:** `docs/live/indicator-visual-design.md`, `docs/live/indicator-registry.md`

---

## 0. 한 줄 결론

> ❌ "유저가 검색한 데이터 → 그냥 보여준다" (= 데이터 뷰어)
> ✅ **"유저의 질문 의도를 기반으로, 적절한 시각화 템플릿을 선택하고, 핵심 신호만 강조해서 차트를 생성한다"** (= 자동 시각화 엔진)

---

## 1. 핵심 구조

```
User Query
→ Intent Classification
→ Pattern Context Resolver
→ Visualization Template Selector
→ Highlight Planner
→ Chart Config Builder
→ Renderer
```

핵심 두 가지:
- 유저가 뭘 궁금해하는지 먼저 알아낸다.
- 그 질문에 맞는 템플릿 **하나만** 고른다.

---

## 2. Intent 분류 (6개)

유저 질문은 6개로 자른다.

### A. WHY (이벤트 설명형)
- "왜 떨어졌냐"
- "왜 여기서 반응했냐"
- "뭐가 원인이냐"

### B. STATE (현재 phase 상태형)
- "지금 뭐 하는 자리냐"
- "지금 매집이냐"
- "지금 breakout 직전이냐"

### C. COMPARE (좌우 비교형)
- "TRADOOR랑 비슷하냐"
- "PTB랑 뭐가 다르냐"
- "이전 성공 케이스랑 비교해줘"

### D. SEARCH (grid scan형)
- "비슷한 거 찾아줘"
- "이런 패턴 종목 뭐 있냐"
- "지금 유사 케이스 몇 개냐"

### E. FLOW (자금 흐름형)
- "세력 들어왔냐"
- "OI/funding/liquidation 어떻게 보이냐"
- "돈 흐름이 어때"

### F. EXECUTION (진입/손절 판단형)
- "어디서 진입하냐"
- "손절 어디냐"
- "지금 트레이드 가능한가"

---

## 3. Intent → Template 매핑

```python
INTENT_TO_TEMPLATE = {
    "why":       "event_focus",
    "state":     "state_view",
    "compare":   "compare_view",
    "search":    "scan_grid",
    "flow":      "flow_view",
    "execution": "execution_view",
}
```

---

## 4. 템플릿 정의 (6개)

### 4.1 event_focus (WHY용)

**보여줄 것**:
- 가격 메인 패널
- 해당 캔들 강조
- OI spike / funding flip / volume spike marker
- 원형 annotation
- 짧은 causal label

**숨길 것**:
- 비교 패널
- execution board
- 불필요한 서브패널 다수

**메시지**: "왜 여기서 움직였는가"

### 4.2 state_view (STATE용)

**보여줄 것**:
- price panel
- phase zone overlay (FAKE_DUMP/REAL_DUMP/ACCUMULATION/BREAKOUT)
- higher lows / range / breakout line
- OI panel
- volume panel
- top 3 evidence

**메시지**: "지금 어느 phase인가"

### 4.3 compare_view (COMPARE용)

**보여줄 것**:
- 좌: 현재 심볼
- 우: reference pattern
- 아래: phase path diff / feature diff
- similarity score

**메시지**: "얼마나 비슷하고 뭐가 다른가"

### 4.4 scan_grid (SEARCH용)

**보여줄 것**:
- 6~12개 미니차트
- similarity score
- current phase badge
- key signal 1줄
- sort by confidence / similarity / breakout proximity

**메시지**: "어떤 종목이 후보인가"

### 4.5 flow_view (FLOW용)

**보여줄 것**:
- price panel 최소화
- OI 강조 패널
- funding histogram
- liquidation density strip
- CVD optional
- one strong highlight only

**메시지**: "포지션 흐름이 어떻게 쌓였는가"

→ liquidation map / market flow 스타일과 가장 맞다.

### 4.6 execution_view (EXECUTION용)

**보여줄 것**:
- price panel
- entry / stop / TP
- invalidation level
- risk-reward box
- breakout confirmation line
- 최소 근거 3개

**메시지**: "지금 실행 가능한가"

**주의**: 기본 화면에선 이걸 강하게 띄우면 안 된다.

---

## 5. Pattern Context Resolver

질문만 보고 차트 고르면 안 되고, 지금 pattern runtime 상태도 같이 본다.

**입력**:
- symbol
- timeframe
- latest feature window
- current phase
- phase path
- reference pattern if any

**예**:
```
current_phase = accumulation
phase_path = [fake_dump, arch_zone, real_dump, accumulation]
oi_hold_flag = true
funding_flip_flag = true
```

→ state_view 선택 시 자동으로:
- accumulation zone 색칠
- real_dump marker 표시
- breakout threshold line 표시

즉, 시각화는 시장 데이터만 보는 게 아니라, **Pattern Object + State Machine 결과를 함께 반영**한다.

---

## 6. Highlight Planner

같은 템플릿이라도 무엇을 강조할지가 달라진다.

**규칙**: 한 화면에 강조는 **1개**, 보조는 **2개**까지만.

```python
def plan_highlights(intent: str, features: dict) -> dict:
    if intent == "why":
        return {
            "primary": "price_event",
            "secondary": ["oi_spike", "funding_extreme", "volume_spike"],
        }
    if intent == "state":
        return {
            "primary": "phase_zone",
            "secondary": ["higher_lows", "oi_hold", "breakout_line"],
        }
    if intent == "flow":
        return {
            "primary": "open_interest",
            "secondary": ["funding_rate", "liq_density"],
        }
    if intent == "execution":
        return {
            "primary": "entry_stop_target",
            "secondary": ["breakout_strength", "risk_warning"],
        }
    return {"primary": "price", "secondary": []}
```

### 강조 룰
- 룰 1: 하나의 요청 = 하나의 시각화
- 룰 2: 강조는 항상 1개만
- 룰 3: 나머지는 흐리게
- 룰 4: 숫자는 숨기고 구조만 보여라

---

## 7. Chart Config Builder

renderer에 넘길 최종 config.

```python
from dataclasses import dataclass, field

@dataclass
class ChartPanelConfig:
    panel_type: str  # price / oi / funding / cvd / volume / compare
    visible: bool = True
    emphasis: str = "normal"  # primary / secondary / muted
    overlays: list[dict] = field(default_factory=list)
    markers: list[dict] = field(default_factory=list)

@dataclass
class ChartViewConfig:
    template: str
    title: str
    symbol: str
    timeframe: str
    layout: str  # single / split / grid
    panels: list[ChartPanelConfig]
    annotations: list[dict] = field(default_factory=list)
    side_summary: dict = field(default_factory=dict)
```

---

## 8. 예시

### 예시 1: "왜 떨어졌냐"

```python
config = ChartViewConfig(
    template="event_focus",
    title="Why did BTCUSDT dump here?",
    symbol="BTCUSDT",
    timeframe="15m",
    layout="single",
    panels=[
        ChartPanelConfig(
            panel_type="price",
            emphasis="primary",
            markers=[
                {"type": "circle", "event": "dump_candle", "ts": "..."},
                {"type": "label", "text": "price dump", "ts": "..."},
            ],
        ),
        ChartPanelConfig(
            panel_type="oi",
            emphasis="secondary",
            markers=[{"type": "dot", "event": "oi_spike", "ts": "..."}],
        ),
        ChartPanelConfig(
            panel_type="funding",
            emphasis="muted",
            markers=[{"type": "dot", "event": "funding_extreme_short", "ts": "..."}],
        ),
    ],
)
```

### 예시 2: "지금 매집이냐"

```python
config = ChartViewConfig(
    template="state_view",
    title="Current state: accumulation check",
    symbol="TRADOORUSDT",
    timeframe="15m",
    layout="single",
    panels=[
        ChartPanelConfig(
            panel_type="price",
            emphasis="primary",
            overlays=[
                {"type": "zone", "phase": "accumulation", "start": "...", "end": "..."},
                {"type": "line", "name": "range_high", "price": 1.95},
            ],
            markers=[{"type": "label", "text": "higher lows", "ts": "..."}],
        ),
        ChartPanelConfig(panel_type="oi", emphasis="secondary"),
        ChartPanelConfig(panel_type="volume", emphasis="muted"),
    ],
    side_summary={
        "phase": "ACCUMULATION",
        "confidence": 0.78,
        "top_evidence": [
            "higher lows 3",
            "oi hold after spike",
            "funding flip confirmed",
        ],
    },
)
```

### 예시 3: "트라도어랑 비슷한 거"

```python
config = ChartViewConfig(
    template="compare_view",
    title="Current vs TRADOOR reference",
    symbol="PTBUSDT",
    timeframe="15m",
    layout="split",
    panels=[
        ChartPanelConfig(panel_type="price", emphasis="primary"),
        ChartPanelConfig(panel_type="compare_price", emphasis="primary"),
        ChartPanelConfig(panel_type="feature_diff", emphasis="secondary"),
    ],
    side_summary={
        "similarity": 0.84,
        "phase_match": "real_dump -> accumulation",
        "main_diff": "breakout not confirmed",
    },
)
```

---

## 9. UI 연결

이 구조를 UI에 붙이면:

- **차트 영역**: `ChartViewConfig.panels` 기반 렌더
- **오른쪽 HUD**: `side_summary`만 표시
- **하단 workspace**: 현재 template에 따라 다른 섹션 자동 노출
  - `event_focus` → event explanation / evidence only
  - `state_view` → phase timeline / evidence table
  - `compare_view` → feature diff / similarity / reference ledger
  - `scan_grid` → candidate grid
  - `execution_view` → entry/stop/target

**즉, 유저 질문이 하단 패널 구조까지 바꾼다.**

---

## 10. 차트 자체 구조 (트뷰 vs 거래소 vs 우리)

```
❌ 트뷰처럼 "모든 걸 다 넣는" 차트 만들면 망한다
❌ 거래소처럼 "너무 단순한" 차트도 부족하다
✅ 트뷰 기반 + 엔진 전용 레이어만 추가한 하이브리드
```

차트 = State Machine의 증거를 보여주는 장치.

```
차트 = 가격 + 포지션 흐름 (OI/funding/CVD)
       + 패턴 상태 (phase) + 진입/실패 포인트
```

### 패널 구조

```
🟦 메인 (Price Panel) — TradingView 수준
   Candles / MA / VWAP / Range / Support / Resistance / Entry-Stop-TP / Phase Marker

🟨 서브 1: OI (TRADOOR 패턴 핵심, 필수)
   OI line / OI change histogram / spike marker

🟩 서브 2: Funding
   funding rate histogram / +/- 구분 / extreme zone

🟪 서브 3: CVD / Orderflow
   CVD line / divergence / absorption (옵션)

🟥 서브 4: Volume
   volume bars / spike / dry-up

🟫 서브 5 (옵션): Liquidation / Heatmap
```

### 패턴 레이어 (필수, 일반 차트와 차이)

- **Phase Overlay**: FAKE_DUMP/REAL_DUMP/ACCUMULATION/BREAKOUT을 영역으로 색칠
- **Event Marker**: OI spike 🔴 / funding flip 🟢 / breakout attempt 🟡
- **Structure Overlay**: higher lows / higher highs / compression box / parabolic arc

### 설계 기준

- 가격 위에 indicator 겹치지 마라 (RSI를 price panel에 ❌)
- 패널은 3~4개가 최대
- 기본 ON: Price/OI/Volume / 기본 OFF: Funding/CVD/Liquidation
- 정보는 layer로 분리: Layer 1 Price / 2 Indicator / 3 Pattern / 4 Trade

---

## 11. 최소 구현 순서

1. `intent_classifier.py` — why/state/compare/search/flow/execution
2. `template_selector.py` — intent + pattern context → template
3. `highlight_planner.py` — template + features → 강조 대상
4. `chart_config_builder.py` — 최종 ChartViewConfig 생성

---

## 12. 가장 중요한 최종 룰

유저가 요청한 데이터를 **그대로 다 그리면 안 된다**.

정답: 유저가 요청한 **"질문의 목적"**에 맞는 시각화를 그린다.

- "OI 보여줘" → 틀릴 수 있음
- "세력 들어왔냐" → 맞는 질문

엔진은 **데이터가 아니라 의도와 상태**를 기준으로 차트를 생성한다.

---

## 13. 출처 / 관련

- 사용자 원문: 2026-04-27 세션
- [13_UI_HIERARCHY.md](13_UI_HIERARCHY.md) — 3-mode + HUD + IDE split-pane
- [11_AI_ROLES.md](11_AI_ROLES.md) — Parser가 query → intent classification
- [12_SEARCH_ENGINE_4TIER.md](12_SEARCH_ENGINE_4TIER.md) — scan_grid template과 4-tier 검색 연결
- [00_PIPELINE.md](00_PIPELINE.md) §6 — Read Path 화면별 데이터 출처

---

*v1.0 · 2026-04-27 · 사용자 dump 보존*
