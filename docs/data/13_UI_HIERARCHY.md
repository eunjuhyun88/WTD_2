# 13 — UI Hierarchy & Workspace 정본

**Status:** Reference · 2026-04-27 (사용자 dump 보존)
**Source:** 2026-04-27 세션 (CTO + 사용자 협업)
**Replaces / extends:** `docs/live/cogochi-protocol-extension-architecture.md`, `docs/live/multi-agent-execution-control-plane.md`

---

## 0. 한 줄 결론

> 지금 화면은 **정보가 많은 게 문제가 아니라, 정보 위계가 무너져서 다 같은 세기로 보이는 게 문제**다.
>
> 해결: **한 화면에 3단계만 남겨라** — 차트 관측 / 판단 요약 / 검증 작업대.

---

## 1. 차트의 역할 (먼저 정의)

### ❌ 단순 시각화 아님
### ❌ 기술적 분석 툴도 아님
### ✅ **"State Machine의 증거를 보여주는 장치"**

```
차트 = 가격
       + 포지션 흐름 (OI/funding/CVD)
       + 패턴 상태 (phase)
       + 진입/실패 포인트
```

---

## 2. 차트 구조 (필수 분리)

### 🟦 메인 패널 (Price Panel)
TradingView 수준 유지.

포함:
- Candles
- MA (3~4개)
- VWAP (옵션)
- Range High / Low
- Support / Resistance
- Entry / Stop / Target
- Phase Marker

### 🟨 서브 1: OI (TRADOOR 패턴 핵심, 필수)
- OI line
- OI change histogram (옵션)
- OI spike marker

### 🟩 서브 2: Funding
- funding rate histogram
- positive / negative 구분
- extreme zone 표시

### 🟪 서브 3: CVD / Orderflow
- CVD line
- divergence 표시
- absorption 표시 (옵션)

### 🟥 서브 4: Volume
- volume bars
- spike detection
- dry-up 표시

### 🟫 서브 5 (선택): Liquidation / Heatmap
- liq density
- liquidation cluster
- 기본 OFF

---

## 3. 패턴 레이어 (★ 일반 차트와 차이)

### Phase Overlay (필수)
차트 위에 영역으로 색칠:
```
[FAKE_DUMP]    옅은 회색
[ARCH_ZONE]    노란 영역
[REAL_DUMP]    붉은 영역
[ACCUMULATION] 노란 영역
[BREAKOUT]     초록 영역
```

→ 이게 없으면 그냥 트뷰 복붙이다.

### Event Marker
차트 위에 점:
- 🔴 OI spike
- 🟢 funding flip
- 🟡 breakout attempt

### Structure Overlay
자동 표시:
- higher lows
- higher highs
- compression zone (박스)
- parabolic arc

---

## 4. 설계 기준 (이거 틀리면 망함)

### 기준 1
👉 가격 위에 indicator 겹치지 마라
- ❌ RSI를 price panel에 → 절대 금지

### 기준 2
👉 패널은 3~4개가 최대
- 욕심내면 끝난다

### 기준 3
👉 기본 ON / OFF 개념
- **기본 ON**: Price / OI / Volume
- **기본 OFF**: Funding / CVD / Liquidation

### 기준 4
👉 정보는 겹치지 말고 **layer**로 분리
```
Layer 1: Price
Layer 2: Indicator (OI/funding/CVD)
Layer 3: Pattern (phase/event)
Layer 4: Trade (entry/stop)
```

---

## 5. 3-Mode 운영 (★ 핵심)

지금은 한 화면에 research + scan + execution + judgment가 다 섞여 있다. **3 모드로 분리**.

### Mode 1. Observe
- 차트 중심
- 오른쪽 HUD 최소
- 하단 접힘
- 언제: 빠르게 여러 종목 훑을 때

### Mode 2. Analyze (★ 기본)
- 차트 + 오른쪽 HUD + 하단 workspace 오픈
- 언제: 한 종목 깊게 볼 때

### Mode 3. Execute
- 차트 + 실행 보드 강화
- 나머지 evidence 축약
- 언제: 진짜 진입/손절/타겟 결정할 때

---

## 6. 정보 위계 (CTO 룰)

### 1순위
차트 + 현재 phase

### 2순위
왜 그렇게 보는지 top evidence 3

### 3순위
실제 raw feature table

### 4순위
비슷한 사례 / 결과 ledger

### 5순위
실행 보드

→ 지금 화면은 3, 4, 5가 너무 앞에 나와 있다. 위계 무너짐.

---

## 7. 영역별 정보 분배

### 차트에 둘 것
- 가격과 같은 축을 쓰는 것
- 시간축이 중요해서 시각적으로 봐야 하는 것
- 패턴 단계가 눈으로 확인되는 것

예: range / breakout line / entry-stop / candles / OI-funding-CVD pane / phase markers

### 오른쪽에 둘 것
- 지금 당장 행동에 필요한 것
- 숫자보다 결론
- 긴 표 대신 요약

예: phase / confidence / action / top evidence / risk / next step

### 하단에 둘 것
- 근거 검증
- 비교
- 결과 회고
- refinement
- 실험/연구 작업

예: feature raw / pass-fail table / sequence compare / near-miss / ledger / user judgments

### AI에 둘 것
- 설명 / 비교 요약 / 서사화 / 반론 / 리서치 문서화

---

## 8. 오른쪽 HUD 상세 (4 카드 max)

오른쪽은 **2초 의사결정 패널**.

### 카드 1. Pattern Status
```
Pattern: tradoor_v2
Phase: ACCUMULATION
Confidence: 0.78
Bias: BEAR
Symbol/timeframe: BTCUSDT 4h
```

### 카드 2. Top Evidence (3 max)
```
✔ OI hold after spike
✔ Higher lows 3
✔ Funding flip confirmed
```

### 카드 3. Risk
```
⚠ Breakout 미확정
⚠ Real-dump retest risk
⚠ BTC macro headwind
```

### 카드 4. Actions
```
[ Save Setup ]
[ Compare ]
[ Explain in AI ]
```

**raw 수치 표는 빼라** — 하단으로.

---

## 9. 하단 Workspace 5 섹션

탭만 쓰면 비교 불편 → 가능하면 동시에 보이게.

### 섹션 1. Phase Timeline
```
FAKE → ARCH → REAL → ACCUMULATION → BREAKOUT
                       ↑ 현재
```

### 섹션 2. Evidence Table
```
Feature        | Value | Threshold | Status | Why it matters
OI zscore      | 2.7   | >2.0      | PASS   | real_dump 핵심
Funding flip   | yes   | yes       | PASS   | accumulation 전환
Breakout str   | 0.004 | >0.01     | FAIL   | 아직 breakout 아님
```

### 섹션 3. Sequence Compare
- current vs seed pattern
- current vs PTB / TRADOOR
- current vs near-miss

### 섹션 4. Ledger
- 최근 20건
- success rate
- avg forward return
- regime별 성과

### 섹션 5. Judgment (5-cat)
```
[ Valid ] [ Invalid ] [ Missed ] [ Too Late ] [ Unclear ]
```

---

## 10. 와이어프레임

```
┌──────────────────────────────────────────────┬────────────────────┐
│                 MAIN CHART                   │   DECISION HUD     │
│  candles / MA / OI / funding / CVD panes    │ phase              │
│  major levels / phase markers               │ confidence         │
│                                              │ top evidence 3     │
│                                              │ risk               │
│                                              │ actions            │
├──────────────────────────────────────────────┴────────────────────┤
│ PHASE TIMELINE | EVIDENCE TABLE | COMPARE | LEDGER | JUDGMENT    │
└───────────────────────────────────────────────────────────────────┘
```

비율: **차트 70% / HUD 20% / Workspace 30%** (workspace 접으면 차트 100%).

---

## 11. IDE-Style Resizable Split-Pane (Claude Code 스타일)

### 11.1 목적
멀티 패널 환경에서 사용자가 각 영역의 크기를 **드래그로 자유롭게 조절** (Claude Code / VSCode 스타일).

### 11.2 레이아웃 구조
- Root: Flex 또는 Grid 컨테이너
- Panel: 콘텐츠 영역
- Divider (Splitter): 패널 사이 draggable

```
[ Panel A ] | [ Panel B ] | [ Panel C ]
```

### 11.3 핵심 요구사항

#### 패널 리사이즈
- Divider 드래그하여 인접 패널 크기 변경
- 방향: 수평 (좌우) / 수직 (상하)

#### Min/Max 제한
```typescript
type PaneState = {
  size: number
  min: number       // px or %
  max?: number
}
```
예: 좌측 사이드바 min 240px / 메인 min 400px

#### 비율 기반 초기값
```
defaultSizes: [20, 60, 20]  // %
```

#### 상태 유지 (필수)
- localStorage or store
- 새로고침 시 이전 레이아웃 유지

#### 더블클릭 리셋
- Divider 더블클릭 → 초기 비율로 복원

#### 커서 UX
- horizontal: `col-resize`
- vertical: `row-resize`

### 11.4 인터랙션 흐름

```
1. mousedown on divider
2. mousemove → delta 계산
3. 양쪽 패널 사이즈 업데이트
4. mouseup → 종료
```

### 11.5 사이즈 계산
```typescript
delta = currentMouse - startMouse
panelA = clamp(initialSize + delta, minA, maxA)
panelB = clamp(initialSize - delta, minB, maxB)
```

### 11.6 컴포넌트 구조 (Svelte)

```svelte
<SplitPane direction="horizontal">
  <Pane min={200} default={300}>
    ...
  </Pane>

  <Divider />

  <Pane min={300}>
    ...
  </Pane>
</SplitPane>
```

### 11.7 상태 모델

```typescript
type SplitState = {
  direction: 'horizontal' | 'vertical'
  panes: PaneState[]
}
```

### 11.8 스타일 가이드

#### Divider
- width: 4~8px
- hit-area는 8px (UX 중요, 투명 영역 넓게)
- hover 시 강조

```css
.hit-area {
  width: 8px;
  cursor: col-resize;
}
```

#### Color 규칙
- 가격 상승: teal
- 가격 하락: red
- OI: cyan
- funding +: green / -: red
- CVD: white / light blue

#### 라인 두께
- price: 2px
- indicator: 1px
- grid: 0.5px

#### Background
- ❌ 완전 검정
- ✅ 아주 어두운 네이비/그레이

### 11.9 반응형

#### Mobile
- drag 비활성화 가능
- 대신: collapse 버튼 / full-screen toggle

### 11.10 고급 기능 (선택)

#### Collapse / Expand
- 사이드바 접기 + 이전 크기 기억

#### Snap
- 특정 breakpoint에서 멈춤

#### Nested Split
```
좌우 split 안에 → 상하 split
```

### 11.11 성능

- drag 중 `requestAnimationFrame` 사용
- layout thrashing 방지
- transform 대신 width/height 변경 최소화

### 11.12 추천 라이브러리

#### Svelte
- `svelte-splitpanes`
- `svelte-resizable-panels`

#### React (참고)
- `react-resizable-panels` (Vercel/VSCode 느낌)

### 11.13 한 줄 요구사항

> "IDE처럼 패널 간 divider를 드래그해서 크기 조절 가능한 resizable multi-pane layout. 각 패널은 최소 크기를 가지며, 레이아웃 상태는 유지된다."

---

## 12. 단일 확대 ↔ 비교 모드

### 단일 확대
- workspace tab 1개를 풀화면

### 2-pane 비교 (split-2)
- 같은 stage에 2개 tab 동시 렌더
- divider로 비율 조정

### 4-pane grid (grid-4)
- 같은 stage에 4개 tab 동시 렌더
- 2x2 layout

### 상태
```typescript
type CenterStageMode = 'single' | 'split-2' | 'grid-4'
type CenterStageState = {
  mode: CenterStageMode
  paneAssignments: TabId[]   // length: 1 / 2 / 4
  dividerRatios: number[]    // 비율
}
```

→ 기존 좌우 shell splitter는 그대로 유지.

---

## 13. 지금 화면의 진짜 문제

스크린샷 기준:

### 문제 1
👉 차트가 메인인데 메인처럼 안 보임
- 오른쪽 패널과 하단 패널이 너무 진해서 차트 집중력 ↓
- 분석 카드 외곽선 / 빨간 점수 카드 / 작은 박스들이 차트보다 먼저 눈에 들어옴

### 문제 2
👉 같은 정보가 다른 곳에서 반복
- 오른쪽 analyze 요약 + 하단 analyze + evidence card + detail/open CTA
- "정보가 많다"보다 **"중복된 UI가 많다"**

### 문제 3
👉 모든 카드가 다 중요해 보임
- 같은 크기, 같은 채도, 같은 선 굵기
- 전부 1순위처럼 보임

### 문제 4
👉 하단 패널이 "워크스페이스"가 아니라 "작은 카드 모음"

---

## 14. 즉시 수술해야 할 것

### 약하게
- 붉은 점수 카드 강조 ↓
- Leader 카드 ↓
- 여러 metric 카드 경계선 ↓
- 하단 카드 외곽선 ↓

### 없애기
- 오른쪽 DETAIL PANEL / AI DETAIL 두 개 동시 노출
- 오른쪽 + 하단 둘 다 같은 요약 있는 부분
- Analyze 내부에서 proposal과 evidence를 같은 레벨로 배치

### 유지
- 차트 자체
- indicator chip
- Save Setup
- 하단 timeline/evidence/compare 구조 기반

---

## 15. UX 룰 (이거 안 지키면 다시 망함)

### 룰 1
👉 "숫자 = 하단" / "판단 = 오른쪽"

### 룰 2
👉 같은 데이터 두 번 보여주지 마라

### 룰 3
👉 카드 많아지면 무조건 잘못된 설계

### 룰 4
👉 Execute는 별도 모드

---

## 16. Save Setup 흐름

Save Setup 누르면 **모달**이 떠야 한다. (단순 저장 X)

### Save Setup Modal 필드
- Pattern family
- Symbol / timeframe
- Current phase
- Chart snapshot (자동 attach)
- Feature snapshot (자동 attach)
- User note
- Thesis tags
- Validity assumption
- Entry / stop / target
- 예상되는 다음 phase

→ 저장되는 것: 이미지 + feature + phase + note + context = pattern object / evidence asset.

---

## 17. Judge 흐름

5 cat 버튼:
```
[ Valid ] [ Invalid ] [ Missed ] [ Too Late ] [ Unclear ]
```

optional comment: "why?"

자동 같이 저장:
- current phase
- phase path
- feature snapshot
- chart snapshot
- ledger ref

→ refinement 엔진으로 간다.

---

## 18. Compare UX

Compare는 **최소 3개** 지원:
- current vs seed
- current vs saved case
- current vs failure case

보여줄 것:
- phase path diff
- feature diff
- outcome diff
- AI summary

**단순히 두 차트 나란히 두는 게 아니라 패턴 객체 수준 비교.**

---

## 19. 한 줄 결론

UI를 기능별로 나누면 안 되고, **엔진 산출물의 성격별로 나눈다**.

```
raw observation              → 차트
current decision state       → 오른쪽
verification / comparison /
   refinement                → 하단
interpretation / narrative   → AI
```

---

## 20. 출처 / 관련

- 사용자 원문: 2026-04-27 세션 (스크린샷 분석 + IDE split-pane 명세서)
- [10_VISUALIZATION_ENGINE.md](10_VISUALIZATION_ENGINE.md) — query → intent → template (template이 panel 구조 결정)
- [12_SEARCH_ENGINE_4TIER.md](12_SEARCH_ENGINE_4TIER.md) — Compare 비교는 Layer B sequence matching 사용
- 현재 UI: `app/src/routes/cogochi/`, `app/src/components/dashboard/`

---

*v1.0 · 2026-04-27 · 사용자 dump 보존*
