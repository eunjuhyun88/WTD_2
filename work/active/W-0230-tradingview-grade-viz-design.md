# W-0230 — TradingView-Grade Visualization System Design

> **Design-first** (per feedback memory). 10+ UI/UX 문서 + 코드 실측 통합. 사용자 검토 후 commit/구현.
> **Lens**: TradingView UI/UX 디자이너 + GTM 엔지니어 + AI Researcher
> **Quality bar**: Goraetracker 스크린샷 (정교 + 시계열 정렬 + 비교분석)

## Goal

**자연어 프롬프트 → Goraetracker 수준의 composite 차트 자동 생성**.

> "BTC 4h 매집 중이냐" → AI가 Intent(STATE) → Template(state_view) → Highlight Planner(primary=1) → archetype 합성 → 정렬된 multi-panel 차트 자동 렌더 + Decision HUD 5카드.

이게 작동하면 **Cogochi = "Pattern OS for crypto perp"** 정체성이 시장에서 즉시 인식됨.

## Owner

contract (설계) → app + engine (구현, phase별 분할)

## Primary Change Type

Process / coordination + Product surface (multi-phase)

## Background — 10+ 문서 + 코드 실측 합집합

### 핵심 발견 (sub-agent A1 보고서)

1. **Archetype 시스템 코드가 문서보다 앞섬** — 코드 10개(A-J), 문서 6개(A-F). 문서 갱신 필요.
2. **Intent → Template → Highlight → Config 4단 파이프라인 모두 미구현** — Goraetracker quality 도달의 핵심 갭.
3. **Pane 5개 한도 + p50 무색 + primary=1 룰** — Cogochi 시각 정체성 (TV와 가장 다른 점).
4. **W-0102 Slice 1+2+3** = AI 프롬프트→차트 unblocking 경로 (구현 진행 중).
5. **Whale identity layer 미구현** — Goraetracker quality bar 미달의 큰 부분.

### 문서별 권한

| 문서 | 권한 |
|---|---|
| `docs/_archive/origins/05_VISUALIZATION_ENGINE.md` (522L) | **6 Intent × 6 Template 정의** ← archive 매장, 부활 필요 |
| `docs/live/indicator-visual-design.md` (450L) | **시각 계약** — p50 무색, 시선 200ms |
| `docs/live/indicator-registry.md` | **Indicator metadata schema** — 80+ block 등록 단위 |
| `work/completed/W-0102-prompt-agent-chart-control.md` | **AI 프롬프트 → tool calling → chart_action SSE** |
| `docs/_archive/split_prd/core-loop-surface-wireframes.md` | **Wireframes** (드래그 range, SaveStrip inline) |
| `docs/_archive/superseded_domains/pages/02-terminal.md` | **Terminal cockpit** — review→inspect→select→Save |
| `docs/_archive/superseded_domains/pages/04-dashboard.md` | **Dashboard 4 section** (Signal Alerts/Watching/Saved/Adapters) |
| `docs/_archive/superseded_domains/verdict-inbox-ux.md` | **Verdict UX** — 3-button (5-button F-02 후) |
| `work/completed/W-0210-terminal-data-visualization-layers.md` | **4 viz layer** ($0 추가 비용) — Wyckoff/CVD/whale/news |

## Scope (본 PR — 설계만)

본 PR이 **만드는 것** (코드 변경 0):

| # | 파일 | 용도 |
|---|---|---|
| 1 | `work/active/W-0230-*.md` (this) | 통합 설계 (TradingView + GTM lens) |
| 2 | `docs/live/W-0220-status-checklist.md` | TradingView-grade 항목 체크리스트 추가 |
| 3 | `docs/live/visualization-engine.md` | `05_VISUALIZATION_ENGINE.md` archive → live 부활 (별도 PR로 분리 가능) |

본 PR이 **만들지 않는 것**:
- 실제 Intent Classifier / Template Router / HighlightPlanner 코드 (Phase 2~)
- Wave 2 UI 4개 (W-0226-W-0229 별도, A028이 등록)
- Whale identity layer (별도 work item)
- charter / PRIORITIES 변경 (정합성만 확인)

## Non-Goals (영구 또는 후순위)

- ❌ TradingView Pine Script 호환 (별도 라이브러리, 비경쟁)
- ❌ 사용자가 indicator 수식 직접 편집 (Registry Phase 4 이후)
- ❌ Drawing tools (TV 호환) — Cogochi는 Pattern memory 기반, drawing은 Non-Goal
- ❌ Real-time streaming > 1 Hz (의도적 제한)
- ❌ Screenshot-to-chart vision recognition (Phase 3+)
- ❌ Whale paid API (Binance/Bybit) — 무료 source만 (Hyperliquid)

## Canonical Files

- `work/active/W-0230-tradingview-grade-viz-design.md` (this)
- `docs/live/visualization-engine.md` (NEW, archive 부활 대상)
- `docs/live/indicator-visual-design.md`
- `docs/live/indicator-registry.md`
- `app/src/lib/components/indicators/IndicatorRenderer.svelte` (10 archetype dispatcher)
- `app/src/lib/indicators/registry.ts` (20 entries — 80+ 목표)
- `app/src/lib/server/douni/tools.ts` (chart_control tool)
- `app/src/components/terminal/workspace/ChartBoard.svelte` (sub-pane host)
- `docs/live/W-0220-status-checklist.md`

## Facts

1. main = `365341eb` (Wave 1 engine 4개 PR 모두 머지 완료 — F-02/A-03-eng/A-04-eng/D-03-eng).
2. 10 Archetype 렌더러 코드 존재 (A-J), 문서는 A-F 6개만 명시.
3. Indicator Registry 20개 등록 (목표 80+).
4. `IndicatorRenderer.svelte` archetype 디스패처 + `shellStore.archetypePrefs` 사용자 override 작동.
5. LLM tool calling framework (`llmService.ts`) + `chart_control` tool (`douni/tools.ts`) 구현됨.
6. Intent classifier(`intentClassifier.ts`)는 chart_ctrl 분류만, 6 intent 분류 미구현.
7. SSE 4-round tool loop 작동.
8. 5 sub-pane 예약 슬롯 (vol/rsi/macd/oi/cvd) ChartBoard 정의됨.
9. Goraetracker 스크린샷 ≈ flow_view template (OI primary + funding bars + L/S segments).
10. Wave 2 work items A028 등록됨 (W-0226 AI Parser UI / W-0227 Chart Drag UI / W-0228 Watch UI / W-0229 F-60 Gate).

## Assumptions

1. `05_VISUALIZATION_ENGINE.md` archive를 live로 부활시 charter 위반 아님 (기존 spec 활성화, 신규 OS 빌드 X).
2. 6 Intent × 6 Template은 Pattern OS 차별점. TV/Coinglass 모두 Intent-aware 없음.
3. Highlight Planner는 deterministic engine 권한, LLM 권한 X (안전장치).
4. Pane 5개 한도는 product 정체성 (감정적 부하 차단).
5. AI Parser engine (#365 PR #371)와 동일 ContextAssembler 재사용 가능 (코드 중복 방지).

## Open Questions

1. **6 Intent classifier 구현 위치**: 별도 LLM call vs Parser 통합? 권고: Parser와 동일 LLM call에 intent 필드 추가 (latency 1번에 끝).
2. **6 Template Svelte 파일 위치**: `app/src/lib/viz/templates/` (NEW dir)? 권고: `app/src/lib/viz/` (재사용 layer).
3. **Highlight Planner 위치**: TS (frontend)? Python (engine)? 권고: TS frontend (LLM 응답 후 즉시 계산).
4. **Whale identity layer**: 본 PR scope X. 별도 W-0231로 추적.
5. **Goraetracker 스크린샷 라이선스**: 참고용 quality bar로만 사용. 직접 복제 X.

## Decisions

- **D-W-0230-1**: 본 PR = 설계 통합만. 구현은 5 phase 별도 PR.
- **D-W-0230-2**: `05_VISUALIZATION_ENGINE.md` archive → `docs/live/visualization-engine.md` 부활 (별도 PR).
- **D-W-0230-3**: 6 Intent classifier = AI Parser와 동일 LLM call (latency 통합).
- **D-W-0230-4**: 6 Template = `app/src/lib/viz/templates/` 재사용 layer.
- **D-W-0230-5**: Highlight Planner = TS frontend (deterministic post-processor).
- **D-W-0230-6**: Pane 5 한도 + p50 무색 + primary=1 룰은 **불변식**, charter 수정 시까지 변경 금지.
- **D-W-0230-7**: Whale identity layer는 W-0231 별도.
- **D-W-0230-8**: Goraetracker는 quality bar reference only, 직접 복제 X.

---

# §System Architecture — TradingView-Grade Pipeline

## 5단 파이프라인

```
[1] User Prompt
     "BTC 4h 매집 중이냐"
        ↓
[2] Intent + Symbol Parser (LLM 1 call)
     {intent: "STATE", symbol: "BTC", tf: "4h", focus: "accumulation"}
        ↓
[3] Template Router (deterministic)
     intent=STATE → template="state_view"
     panels: [Price (primary), OI, Volume]
     hud_cards: 5 (Pattern Status / Top Evidence / Risk / Next Transition / Actions)
        ↓
[4] Highlight Planner (deterministic, p50 무색 룰)
     primary=1 ("accumulation phase zone")
     secondary=2 ("higher_lows", "funding_flip_pos")
     muted=N (rest)
        ↓
[5] Chart Config Builder
     {
       template: "state_view",
       panels: [...],
       hud: [{card: "pattern_status", primary: true}, ...],
       archetypes: [{indicator: "oi_change_4h", archetype: "A"}, ...]
     }
        ↓
[6] Render (Svelte components)
     <StateViewTemplate config={...}/>
       <PricePanel/> <SubPane/> <DecisionHUD/>
       <IndicatorGauge def={oi_change_4h}/>  ← 기존 archetype 재사용
       <IndicatorVenueStrip def={funding_per_venue}/>
```

## 핵심 컴포넌트 매핑

| 단계 | 코드 위치 | 상태 | 우선순위 |
|---|---|---|---|
| [1] Prompt 입력 | URL `?q=` + BottomDock | 🟡 부분 (W-0102 Slice 1) | P0 |
| [2] Intent + Parser | `engine/api/routes/patterns.py` `/parse` (#365) + 새 intent 필드 | 🟡 Parser only, intent 추가 필요 | P0 |
| [3] Template Router | `app/src/lib/viz/TemplateRouter.svelte` (NEW) | ❌ 미구현 | P0 |
| [4] Highlight Planner | `app/src/lib/viz/HighlightPlanner.ts` (NEW) | ❌ 미구현 | P0 |
| [5] Chart Config Builder | `app/src/lib/viz/ChartConfigBuilder.ts` (NEW) | ❌ 미구현 | P0 |
| [6] Render | `IndicatorRenderer.svelte` 10 archetype | ✅ 구현 완료 | — |

→ **Phase 1**: [1]-[5] 인프라 빌드 (W-0102 Slice 통합).
→ **Phase 2**: 6 Template 컴포넌트 6개.
→ **Phase 3**: Indicator Registry backfill (20→80).
→ **Phase 4**: Whale identity layer (W-0231).

---

# §6 Intent × 6 Template — 사용처 매핑

| Intent | 자연어 예시 | Template | 핵심 panel | Archetype |
|---|---|---|---|---|
| **WHY** | "왜 떨어졌냐" | event_focus | Price (target candle 강조) + OI/Funding muted | A, E |
| **STATE** | "지금 뭐냐" | state_view | Price + OI + HUD 5카드 | A, E, F |
| **COMPARE** | "TRADOOR랑 비슷?" | compare_view | split: current vs reference | A, D, F |
| **SEARCH** | "비슷한 거 찾아" | scan_grid | 6-12 mini chart grid | A per tile |
| **FLOW** | "세력 들어왔냐" | flow_view | Price 30% + OI primary + Funding/Liq | A, B, C, F |
| **EXECUTION** | "진입 어디?" | execution_view | Price + entry/stop/target lines | E + 명시 모드만 |

## Goraetracker 스크린샷 = flow_view template

```
flow_view template 구성:
┌──────────────────────────────────────────────────────────┐
│ [REGIME BANNER] FLOW · BTC · 4h                  78,050 │  ← Archetype E
├──────────────────────────────────────────────────────────┤
│ Price (top 30%, minimized) ─── 14D Price/CVD/OI overlay │  ← Archetype B
│                                                          │
│ Liquidation Map (primary, large)        | HL clusters   │  ← Archetype C
│ ▁▁▁▁▂▃▅▇█  $90K $85K $80K $75K $70K     | $21.8M / 279BTC│
│ Whale avg ─────────────                  | $17.7M / 227BTC│
│                                                          │
│ Funding histogram (right mid)            | Long/Short    │  ← Archetype A + D
│ ▁▂▃▅▇█ -0.0001%                          | TOP 0.79      │
│                                          | RETAIL 0.75   │
│ Whale/Top/Retail/Global segment bars                     │  ← Archetype B (stratified)
│ 83/20  44/56  43/57  43/57                               │
└──────────────────────────────────────────────────────────┘
```

→ **flow_view 1개 Template = Goraetracker 스크린샷 90% 매핑**. 빠진 것:
- Whale identity layer (Goraetracker는 지갑 별 history) — W-0231
- Cumulative whale curve (Archetype G "Curve" 코드 있음, 데이터 미연결)

---

# §TradingView 차별점 — Cogochi 정체성

| 차원 | TradingView | Cogochi |
|---|---|---|
| **메타포** | 캔버스 (사용자 직접 구성) | OS (자동 추론 + 기억) |
| **Intent-aware layout** | ❌ 사용자가 매번 구성 | ✅ 6 Intent → Template 자동 |
| **Highlight 자동 강조** | 모든 indicator 동일 위계 | ✅ primary=1 / secondary≤2 룰 |
| **p50 무색 룰** | 모든 값에 색 (시각 피로) | ✅ 극단만 색 |
| **Venue Divergence 자동** | 거래소별 데이터 나열 | ✅ Archetype F leader 자동 표시 |
| **Pattern memory** | 차트 자체에 없음 | ✅ Save Setup → Pattern flywheel |
| **Verdict feedback loop** | 없음 | ✅ 5-cat verdict → ML 학습 |
| **AI prompt → chart** | 없음 (수동 클릭) | ✅ 자연어 → tool calling → chart_action |
| **Phase zone overlay** | 사용자 그리기 | ✅ engine 자동 (Wyckoff/accumulation/breakout) |
| **Drag range → Save** | 없음 (drawing tool뿐) | ✅ SaveStrip inline → capture → flywheel |
| **Whale/cohort segmentation** | 없음 | 🟡 Archetype B (코드 있음, 데이터 미연결) |
| **Cumulative whale curve** | 없음 | 🟡 Archetype G (코드 있음, 데이터 미연결) |

**TV는 캔버스, Cogochi는 OS**. 차트 위에서 결정 + 메모리 + 학습 loop가 코어.

---

# §GTM Engineer Lens — 누가, 왜, 얼마

## Persona 매핑 (PRD v2.2 기준)

**P0 = Jin** (28-38, 크립토 perp 전업/반전업, 자기 패턴 1-2개 이미 앎, WTP $29-79/mo).

Jin이 W-0230 시스템을 사용하는 시나리오:

```
[일과]
1. 아침 7시 — Telegram 알림: "BTCUSDT ACCUMULATION 진입 후보"
2. Cogochi 열음 → URL ?q=btc 자동 설정
3. 첫 화면: state_view template (Price + OI + HUD 5카드)
4. HUD primary card "Pattern Status: ACCUMULATION 92% confidence"
5. "왜 92%인가?" 클릭 → workspace에 Top Evidence 3개 표시
   - higher_lows_sequence (3 occurrences in last 4h)
   - funding_flip_pos (-0.05% → +0.001%)
   - smart_money_accumulation (cohort entry)
6. "비슷한 거 찾아" → SEARCH intent → scan_grid 6 tile (W-0145 corpus)
7. 그 중 1개 BREAKOUT 성공 사례 클릭 → compare_view (current vs reference)
8. "OK 매집 맞다" → Save Setup → drag range → SaveStrip → capture
9. 72h 후 outcome resolver → Verdict Inbox에 "+15% TP" 라벨 후보
10. Jin 5-cat verdict 클릭 → ML 학습 라벨 → Hill Climbing 재실행
11. 1주일 후 Jin's PersonalVariant 자동 생성 (threshold 미세 조정)
```

## Value Proposition (한 줄)

> **"트레이더가 손으로 가리키거나 자연어로 말하면, 시스템이 패턴을 외화하고 시장 전체에서 매칭·검증·학습을 자동으로 한다."**

## Pricing 시그널 (PRD §1.4 + Stripe 통합 P1)

| Tier | 가격 | 무엇을 받는가 |
|---|---|---|
| Free | $0 | scan_grid 1일 5회, AI Parser 1일 3회, Pattern 5개 저장 |
| **Pro** | **$29/mo** | 전부 무제한, PersonalVariant, Telegram 알림 |
| Team | $99/seat/mo | 팀 공용 pattern library, shared verdict |
| (F-60 후) Marketplace | revenue share | 검증된 PatternObject 카피시그널 |

## 차별 메시지 (마케팅 카피)

- ❌ "TradingView 대안" — 메타포 충돌, 가격 압박
- ❌ "AI 차트 분석" — 한국 시장 saturation
- ❌ "카피트레이딩" — 신뢰 회복 어려움 (Frozen)
- ✅ **"Pattern OS for crypto perp — 당신의 감각을 외화하는 엔진"**
- ✅ **"AI에게 말하면 차트가 그려진다"** (Demo: state_view 자동 생성)
- ✅ **"당신의 매매 패턴이 자산이 된다"** (PersonalVariant + verdict ledger)

## 활성화 funnel (Onboarding)

```
[Day 0] 가입 → /terminal?q=btc 자동 (state_view 자동 렌더, "와 자연어로 차트가 만들어지네")
[Day 1] HUD primary "ACCUMULATION 92%" → Evidence 3개 ("이게 왜 매집인지 명확함")
[Day 2] "Save Setup" 클릭 → drag range → capture ("내 패턴이 저장됐네")
[Day 3-4] 알림: "BTC 매집 중 (당신 패턴 78% 매치)" ("내 감각이 시스템화됨")
[Day 5] 첫 Verdict 5-cat 클릭 → "+15% TP, valid" 라벨 (피드백 loop 닫힘)
[Day 7] PersonalVariant 자동 생성 ("당신만의 OI Reversal v2") (lock-in)
[Day 14] Pro 결제 ($29) — Free 한도 도달
```

→ **TTV (Time to Value) ≤ 5분** (state_view 자동 렌더링).
→ **Activation = first verdict (Day 5)**.
→ **Retention = PersonalVariant (Day 7+)**.

---

# §Implementation Roadmap — 5 Phase

## Phase 1: AI Prompt → Chart Pipeline 골격 (P0, 2-3주)

**Goal**: 자연어 프롬프트가 차트를 그릴 수 있는 첫 end-to-end 경로.

### Phase 1.1 — W-0102 Slice 1+2 마무리 (S, 1-2일)
- URL `?q=` 파싱 + BottomDock auto-submit
- `chart_action` SSE event handler (frontend)

### Phase 1.2 — Intent 6분류 추가 (M, 3-4일)
- `engine/api/routes/patterns.py` `/parse` 응답에 `intent` 필드 추가
- 6 enum: WHY / STATE / COMPARE / SEARCH / FLOW / EXECUTION
- default fallback = STATE

### Phase 1.3 — `app/src/lib/viz/` 디렉토리 + 기본 layer (M, 3-4일)
- `TemplateRouter.svelte` — intent → template 매핑
- `HighlightPlanner.ts` — primary=1 / secondary≤2 deterministic 룰
- `ChartConfigBuilder.ts` — Template + Highlight → ChartViewConfig

## Phase 2: 6 Template 컴포넌트 (P1, 3-4주)

| Template | Priority | Effort |
|---|---|---|
| `StateViewTemplate.svelte` | P0 (default fallback) | M |
| `FlowViewTemplate.svelte` | P0 (Goraetracker quality bar) | L |
| `EventFocusTemplate.svelte` | P1 | M |
| `CompareViewTemplate.svelte` | P1 | M |
| `ScanGridTemplate.svelte` | P1 (W-0145 corpus 연동) | M |
| `ExecutionViewTemplate.svelte` | P2 (명시 모드만) | M |

## Phase 3: Indicator Registry Backfill (P1, 2-3주)
- 현재 20 → 80+ entries
- 우선: 사용자 visible 빈도 (OI, funding, CVD, liq, smart money cohort)
- 코드 변경 없음 (Registry 추가만)

## Phase 4: Decision HUD 5 카드 정형화 (P1, 1-2주)
- `RightRailPanel.svelte` 확장
- 5 cards: Pattern Status / Top Evidence (3) / Risk (2-3) / Next Transition / Actions

## Phase 5: Whale Identity Layer (P2, 별도 W-0231)
- Hyperliquid public leaderboard → 지갑 ID persistence
- Cumulative whale curve (Archetype G 활용)
- Whale alert subscribe pattern
- (Binance/Bybit는 paid API — Non-Goal 또는 Pro tier)

---

# §Wave 매핑

| Wave | 작업 |
|---|---|
| **Wave 2** (현재 진행 중) | A028 W-0226-W-0229 (AI Parser UI / Chart Drag UI / Watch UI / F-60 Gate) — **본 PR과 독립** |
| **Wave 2.5** | F-02-app (Verdict 5-button UI), W-0102 Slice 1+2 마무리 |
| **Wave 3** (P0) | Phase 1.2 Intent 6분류, Phase 1.3 viz/ 디렉토리 |
| **Wave 4** (P1) | Phase 2 6 Template, Phase 3 Registry backfill, Phase 4 HUD 5카드 |
| **Wave 5** (P2) | Phase 5 Whale identity (W-0231) |

→ 본 PR(W-0230)은 **Wave 3 시작 전 설계 합의** 단계.

---

# §Success Metrics

## 시각 품질 bar

| Metric | Target | 측정 |
|---|---|---|
| Goraetracker 스크린샷 매핑률 | ≥ 90% (flow_view) | screenshot diff 수동 |
| 시선 이동 < 200ms | usability test 80% pass | A/B 테스트 (n=20) |
| primary highlight = 1 | 100% (CI invariant) | linter on `ChartConfigBuilder` |
| pane 5개 한도 | 100% (CI invariant) | linter |
| p50 무색 룰 | 100% (compute-time) | unit test on `HighlightPlanner` |

## 활성화 metrics (GTM)

| Metric | Target |
|---|---|
| TTV (signup → 첫 차트 자동 렌더) | ≤ 5분 |
| Day 5 활성화 (첫 verdict 제출) | 30%+ |
| Day 7 retention (PersonalVariant 생성) | 15%+ |
| Day 14 결제 conversion | 5%+ (Free → Pro) |
| MAU per Pro user | 15+ verdicts/month |

## 기술 metrics

| Metric | Target |
|---|---|
| LLM call latency (Parser + Intent 통합) | p95 ≤ 4초 |
| Tool call loop max | 4 round (hard limit) |
| Schema validation pass rate (LLM 출력) | ≥ 98% |
| Highlight Planner deterministic | 100% (same input → same output) |

---

# §Charter 준수 검증

| Charter 규칙 | 본 설계 |
|---|---|
| L3-L7 코어 갭 채움 | ✅ Visualization Engine = L7 surface |
| 메타 도구 동결 (신규 OS) | ✅ 위반 X (기존 archetype + Registry 활용) |
| Frozen Copy Trading | ✅ 위반 X (whale은 publicly available data) |
| Frozen Chart UX polish (W-0212) | ⚠ **회색지대** — Visualization Engine은 polish가 아니라 **새 capability**. 사용자 confirm 필요 |
| Coordination (Issue mutex) | ✅ §Coordination Allowed 사용 |

→ Frozen 회색지대는 **사용자 명시 confirm 필요**.

---

## Next Steps

1. ✅ 본 설계 작성 완료
2. **사용자 검토 + 승인** ← 여기서 멈춤
3. (Optional) `05_VISUALIZATION_ENGINE.md` archive → `docs/live/visualization-engine.md` 부활 (별도 작은 PR)
4. 본 PR 머지 (설계 기록만)
5. Phase 1.1 W-0102 Slice 1+2 마무리 (별도 PR)
6. Phase 1.2 Intent 6분류 (별도 PR + Wave 3)
7. Phase 1.3 viz/ 디렉토리 + Layer 3개 (별도 PR)

---

## Exit Criteria

- [ ] 본 설계 사용자 승인
- [ ] charter Frozen 회색지대 (Chart UX polish vs new capability) 사용자 confirm
- [ ] `docs/live/W-0220-status-checklist.md` Wave 3-5 항목 추가
- [ ] PR 머지 + main SHA 갱신
- [ ] mk.log_event 기록
- [ ] (선택) `05_VISUALIZATION_ENGINE.md` 부활 별도 PR

## Handoff Checklist

다음 에이전트 (Phase 1 시작):
- 본 PR 머지 후 main 동기화
- Phase 1.1 = `feat/W-0230-phase1-prompt-pipeline-mop-up` 브랜치
- W-0102 Slice 1 (URL `?q=`) + Slice 2 (`chart_action` SSE handler) 마무리
- Phase 1.2 = `feat/W-0230-phase1-2-intent-6class` (Wave 3 진입 후)
- Issue 등록은 Phase 시작 전 (사용자 또는 contract owner)
- 1:1:1:1 invariant 준수 (Issue ↔ branch ↔ PR ↔ 체크리스트)

## Risks

| 위험 | 완화 |
|---|---|
| LLM Intent 분류 오작동 | default = STATE fallback + reply text로 분류 결과 노출 |
| 6 Template 6개 동시 빌드 부하 | StateView/FlowView 우선 (P0), 나머지 점진적 |
| Goraetracker 스크린샷 라이선스 | 직접 복제 X, quality bar reference만 |
| Charter Frozen 회색지대 위반 | 사용자 confirm 단계 명시 |
| Pane 5 한도 vs 사용자 요구 충돌 | hard limit 유지, 추가 요구 시 swap UI 제공 |
| Highlight Planner 결정성 깨짐 | unit test 100% coverage 강제 |
| Indicator Registry backfill 너무 큼 (60+ 추가) | 점진적 (사용 빈도 우선), 미등록은 fallback renderer |
