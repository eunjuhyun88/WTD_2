# Plan: Indicator Visualization System 완전 수리 + C/D 레이아웃 병합

## Context

감사 결과, W-0123이 "완료"로 메모리에 기록되어 있지만 실제로는:
- Archetype G/H/I/J 컴포넌트가 없음
- AI 탭 인디케이터 검색 미연결
- Sub-pane 시스템이 `<slot>` 플레이스홀더만 있음
- 레이아웃 탭 C SIDEBAR와 D PEEK가 중복 역할 → 하나로 합쳐야 함
- Shell store에 visibleIndicators 필드 없음

사용자가 요청: "C와 D 두 탭을 하나로 합쳐야 한다", "모든 걸 CTO 관점에서 임팩트 높은 순서로 완료"

---

## 우선순위 실행 순서 (CTO 판단)

```
P1 → C+D 레이아웃 병합       (즉시 보이는 UX 개선)
P2 → AI 탭 인디케이터 검색   (가장 자주 클릭되는 broken 기능)
P3 → 인디케이터 토글 UI      (pill 클릭으로 on/off)
P4 → G/H/I/J archetype       (타입 확장 + 4개 컴포넌트)
P5 → Mobile 반응형 보완      (sidebar → peek 자동 전환)
```

---

## P1: C+D 레이아웃 병합 (4탭 → 3탭)

### 의도
- 현재: A STACK | B DRAWER | C SIDEBAR | D PEEK (new)
- 변경: A STACK | B DRAWER | C (sidebar + peek 통합)
- C = 차트 왼쪽 + 우측 사이드바 + 하단 PEEK bar
- 모바일에서는 사이드바 자동 숨김, peek만 표시

### 변경 파일

**① `app/src/lib/cogochi/shell.store.ts`**
```ts
// line 15: 타입 축소
layoutMode: 'A' | 'B' | 'C';  // D 제거

// line 54: 기본값 변경
layoutMode: 'C',  // 'B' → 'C'
```

**② `app/src/lib/cogochi/AppShell.svelte`**
```ts
// line 48: 모바일 기본값 변경
shellStore.updateTabState(s => ({ ...s, layoutMode: 'C' }));  // 'D' → 'C'
```

**③ `app/src/lib/cogochi/modes/TradeMode.svelte`**

**3-a. 기본값 + 타입 (lines 232-233)**
```ts
const layoutMode = $derived(tabState.layoutMode ?? 'C');  // 'D' → 'C'
function setLayoutMode(m: 'A' | 'B' | 'C') {             // 'D' 제거
```

**3-b. 레이아웃 strip (lines 665-670)**
```svelte
<!-- D 항목 제거, C 설명 업데이트 -->
{ id: 'A', label: 'STACK',   desc: '세로 3단' },
{ id: 'B', label: 'DRAWER',  desc: '차트 + 하단 탭' },
{ id: 'C', label: 'SIDEBAR', desc: '사이드 + peek' },
```

**3-c. C 블록 구조 교체 (lines 1018-1582)**

기존 C (1018-1137) + 기존 D (1138-1582)를 하나의 `{:else}` 블록으로:

```svelte
{:else}
<!-- ═══ LAYOUT C · Chart + peek bar + sidebar ═══════════════════ -->
<div class="layout-c">
  <!-- 왼쪽: chart-section (D의 전체 구조 그대로 재사용) -->
  <div class="chart-section">
    <div class="chart-header">
      <!-- D 헤더 기반: symbol + price + funding chip -->
      <span class="symbol">{symbol}</span>
      <span class="timeframe">...</span>
      <span class="pattern">Tradoor v2</span>
      <span class="hd-sep"></span>
      <span class="hd-price">{fmtPrice}</span>
      {#if analyzeData?.snapshot?.funding_rate != null}
        <span class="hd-chip" ...>FUND {fmtFunding}</span>
      {/if}
      <!-- INDICATORS 라벨 추가 (C에서 가져옴) -->
      <div class="ind-toggles">
        <span class="ind-label-hdr">INDICATORS</span>
        {#each OI/Funding/CVD toggles ...}
      </div>
      <span class="spacer"></span>
      <div class="evidence-badge">...</div>
      <div class="conf-inline">...</div>
    </div>
    <div class="chart-body"><ChartBoard .../></div>
    <!-- D의 PEEK bar 그대로 -->
    <div class="peek-bar">...</div>
    {#if peekOpen}
      <div class="peek-overlay">...</div>  <!-- D drawer 전체 -->
    {/if}
  </div>

  <!-- 오른쪽: C의 사이드바 그대로 -->
  <div class="lc-sidebar">
    ANALYZE / SCAN / JUDGE 섹션
  </div>
</div>
{/if}
```

**3-d. CSS 추가 (styles 섹션)**
```css
/* 병합 레이아웃에서 chart-section이 sidebar에 붙도록 */
.layout-c .chart-section {
  margin: 6px 0 6px 6px;      /* 오른쪽 margin 제거 */
  border-radius: 6px 0 0 6px; /* 오른쪽 radius 제거 */
}
.layout-c .lc-sidebar {
  margin: 6px 6px 6px 0;       /* 왼쪽 margin 제거 */
  border-left: none;            /* chart-section border와 합체 */
  border: 0.5px solid var(--g4);
  border-left: none;
  border-radius: 0 6px 6px 0;
}
/* 모바일에서 사이드바 숨김 */
@media (max-width: 860px) {
  .layout-c .lc-sidebar { display: none; }
}
```

---

## P2: AI 탭 인디케이터 검색 연결

### 의도
"funding 보여줘" → AIPanel이 intent 감지 → 해당 indicator pill 강조 + 자동 활성화

### 새 파일: `app/src/lib/indicators/search.ts`
```ts
import { INDICATOR_REGISTRY } from './registry';

export function searchIndicators(query: string): string[] {
  const q = query.toLowerCase();
  const keywords: Record<string, string[]> = {
    'oi_change_1h':       ['oi', '미결', 'open interest'],
    'funding_rate':       ['funding', '펀딩', '자금'],
    'cvd_state':          ['cvd', 'cumulative delta', '누적'],
    'liq_heatmap':        ['liq', 'liquidation', '청산'],
    'volume_ratio':       ['volume', '거래량'],
    'options_skew_25d':   ['skew', 'options', '옵션'],
    'exchange_netflow':   ['netflow', 'flow', '유출'],
    // ... 나머지 18개
  };
  return Object.entries(keywords)
    .filter(([, kws]) => kws.some(k => q.includes(k)))
    .map(([id]) => id);
}
```

### `app/src/lib/cogochi/AIPanel.svelte` 수정
- `convertPromptToSetup()` 내에 `searchIndicators(prompt)` 호출 추가
- 결과가 있으면 `dispatch('focus_indicator', { ids })`
- TradeMode에서 이 이벤트를 받아 해당 indicator pill `data-indicator-id` scrollIntoView + 2초 pulse 클래스

---

## P3: 인디케이터 토글 pill UI 개선

### 현재 상태
- C/D 헤더에 OI/Funding/CVD 버튼이 이미 있음 (`showOI`, `showFunding`, `showCVD` state)
- 문제: pill이 하드코딩된 3개, 나머지 15개 인디케이터는 토글 불가

### 변경
- 상단 `ind-toggles` 영역에 `+ 더보기` 버튼 추가
- 클릭 → `IndicatorSettingsSheet.svelte` (새 컴포넌트) 열림
- Sheet 안에서 registry 기반으로 전체 인디케이터 토글
- shell.store TabState에 `visibleIndicators: string[]` 필드 추가

### `app/src/lib/cogochi/shell.store.ts` 추가
```ts
interface TabState {
  // ... 기존 필드 ...
  visibleIndicators: string[];  // 기본: ['oi_change_1h', 'funding_rate', 'cvd_state']
}
```

### 새 파일: `app/src/lib/components/indicators/IndicatorSettingsSheet.svelte`
- Svelte `<dialog>` 기반 바텀시트
- INDICATOR_REGISTRY 순회, 각 항목 toggle checkbox
- 저장 → `updateTabState(s => ({...s, visibleIndicators: selected}))`

---

## P4: Archetype G/H/I/J 4개 컴포넌트

### `app/src/lib/indicators/types.ts`
```ts
// line 43: 타입 확장
export type IndicatorArchetype = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J';
```

### 새 컴포넌트 4개 (app/src/lib/components/indicators/)

**G: `IndicatorCurve.svelte`** — Term-Structure Curve (Laevitas IV tenor 스타일)
- SVG path로 tenor curve (1W/2W/1M/3M/6M x axis)
- 현재 값 점 강조
- Props: `def: IndicatorDef, value: IndicatorValue`

**H: `IndicatorSankey.svelte`** — Flow Sankey (Arkham netflow 스타일)
- 거래소 → 지갑 방향 플로우
- 단순 bar-based sankey (SVG)
- Props: 위와 동일

**I: `IndicatorHistogram.svelte`** — Distribution Histogram (Coinglass OI-by-strike 스타일)
- 가격 레벨별 수평 bar
- 현재가 라인 표시

**J: `IndicatorTimeline.svelte`** — Event Timeline (Arkham activity feed 스타일)
- 시계열 이벤트 목록
- 아이콘 + 시간 + 설명 행

### `IndicatorRenderer.svelte` 수정
- G/H/I/J 케이스 추가 (lines 28 이후 else-if 체인에 추가)

### `registry.ts` 수정
- G: `iv_term_structure` 등록
- H: `exchange_netflow` archetype F→H 변경 (sankey가 더 적합)
- I: 향후 strike-level OI 데이터용 예비 등록
- J: 이벤트 피드 예비 등록

---

## P5: Mobile 반응형 보완

### 현재
- `AppShell.svelte`에서 MOBILE 감지 시 `layoutMode: 'C'` (P1 후 변경)
- C 레이아웃에서 사이드바는 `@media (max-width: 860px) { display: none }`

### 추가
```svelte
<!-- TradeMode.svelte mobile 섹션 - indicator pane 개선 -->
<!-- line 499-505: IndicatorPane이 이미 렌더됨, 문제는 크기 -->
```
- `.mobile-panel`에서 indicator card가 가로 스크롤 없이 보이도록 CSS 조정
- `IndicatorPane` layout prop을 mobile에서 `'stack'`으로 강제

---

## 변경 파일 목록

| 파일 | 변경 규모 | 내용 |
|---|---|---|
| `app/src/lib/cogochi/shell.store.ts` | 소 | layoutMode 타입 + 기본값 + visibleIndicators 필드 |
| `app/src/lib/cogochi/AppShell.svelte` | 미세 | 모바일 기본 'D'→'C' |
| `app/src/lib/cogochi/modes/TradeMode.svelte` | 대 | C+D 블록 병합, 레이아웃 strip, CSS |
| `app/src/lib/indicators/types.ts` | 미세 | archetype 타입 G-J 추가 |
| `app/src/lib/indicators/registry.ts` | 소 | 7개 미등록 인디케이터 추가 |
| `app/src/lib/indicators/search.ts` | 신규 | fuzzy search 함수 |
| `app/src/lib/components/indicators/IndicatorRenderer.svelte` | 소 | G-J 케이스 추가 |
| `app/src/lib/components/indicators/IndicatorCurve.svelte` | 신규 | G archetype |
| `app/src/lib/components/indicators/IndicatorSankey.svelte` | 신규 | H archetype |
| `app/src/lib/components/indicators/IndicatorHistogram.svelte` | 신규 | I archetype |
| `app/src/lib/components/indicators/IndicatorTimeline.svelte` | 신규 | J archetype |
| `app/src/lib/components/indicators/IndicatorSettingsSheet.svelte` | 신규 | 토글 sheet |
| `app/src/lib/cogochi/AIPanel.svelte` | 소 | searchIndicators 연결 |

---

## 구현 순서 (커밋 단위)

```
commit 1: P1 레이아웃 병합 (shell.store + AppShell + TradeMode)
commit 2: P2 AI 탭 search.ts + AIPanel 연결
commit 3: P3 IndicatorSettingsSheet + shell.store visibleIndicators
commit 4: P4 types + G/H/I/J 컴포넌트 4개 + IndicatorRenderer 업데이트
commit 5: P5 mobile CSS 보완
```

---

## 검증 방법

1. **P1 레이아웃 병합**: 앱 로드 후 레이아웃 탭이 3개(A/B/C)만 보이는지 확인. C 선택 시 오른쪽 사이드바 + 하단 peek bar 동시에 보이는지 확인. 860px 이하에서 사이드바 숨김 확인.

2. **P2 AI 탭**: AIPanel에 "funding 보여줘" 입력 → `funding_rate` pill이 pulse 애니메이션 + 자동 활성화 확인.

3. **P3 토글 UI**: `+ 더보기` 클릭 → sheet 열림 → 토글 → 적용 후 indicator pane 변경 확인.

4. **P4 G-J**: registry에 `iv_term_structure` 등록 후 IndicatorPane에서 G archetype 렌더 확인.

5. **P5 Mobile**: 860px 이하 viewport에서 사이드바 숨김, indicator card 정상 표시 확인.

---

## Non-Goals

- Drag-to-reorder panes → W-0124
- Workspace presets → W-0125
- 실 데이터 (Deribit IV tenor, Arkham flow) → W-0122 Phase 4
- G/H/I/J를 실제 데이터에 연결 (이번엔 mock/stub 데이터로만 렌더 확인)
