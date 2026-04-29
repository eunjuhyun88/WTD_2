# Network Page UX/UI Redesign Plan

## Context

현재 Network 페이지는 전통적인 대시보드 레이아웃(배너 + 캔버스 왼쪽 + 사이드바 오른쪽)으로, 정보 밀도가 높고 시각적 계층이 부족하다. Google Material 3의 여유 있는 카드 레이아웃과 Claude UI의 따뜻하고 미니멀한 감성을 결합하여 완전히 새롭게 개편한다.

**선택된 방향:** Light Minimal + Floating Glass Panel

## Design Concept: "Breathable Dashboard"

### Before vs After 핵심 변화

| 요소 | 현재 | 개편 |
|------|------|------|
| 레이아웃 | `grid: 1fr 340px` 고정 | 캔버스 확장 + 플로팅 글래스 패널 |
| HUD 배너 | 7+개 메트릭 한 줄에 밀집 | 개별 메트릭 카드 + 여유 있는 간격 |
| 사이드 패널 | border-left 고정 사이드바 | 둥근 글래스 카드, 캔버스 위 떠있음 |
| 탭 바 | 작은 텍스트 버튼 6개 | Material 3 세그먼트 컨트롤 스타일 |
| 배경 | 밝은 #FAF9F7 + 캔버스 별도 | 캔버스가 더 넓은 공간 차지, 라이트 톤 유지 |
| 타이포그래피 | 작은 폰트, 일관성 부족 | 명확한 계층: 큰 숫자 + 작은 라벨 |

### Visual Layout (Desktop >860px)

```
┌──────────────────────────────────────────────────────────────┐
│  ● Compute Mesh                                              │
│                                                              │
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌──────┐    [Fixture] │
│  │4,231│  │  8  │  │ 12  │  │  5  │  │98.2% │    [Live   ] │
│  │nodes│  │ GPU │  │wkrs │  │flows│  │verify│    [Runtime] │
│  └─────┘  └─────┘  └─────┘  └─────┘  └──────┘              │
├──────────────────────────────────────────────────────────────┤
│                                       ┌─ Glass Panel ──────┐│
│                                       │  [GPU][Bond][Jobs]  ││
│     [WebGL Canvas - full width]       │  [Notary][Swarm][F] ││
│                                       │                     ││
│                                       │  Tab content        ││
│                                       │  ...                ││
│                                       │                     ││
│                                       └─────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

### Visual Layout (Mobile ≤600px)

```
┌────────────────────┐
│ ● Compute Mesh     │
│ 4,231  8  12  5    │
├────────────────────┤
│  [Canvas - 30vh]   │
├────────────────────┤
│ ┌─ Bottom Sheet ─┐ │
│ │ [Segment tabs]  │ │
│ │ Tab content     │ │
│ │ ...             │ │
│ └─────────────────┘ │
└────────────────────┘
```

---

## Implementation Plan

### Step 1: NetworkView.svelte — 레이아웃 구조 변경

**파일:** `src-svelte/lib/pages/NetworkView.svelte`

**변경 내용:**
- 기존 `grid: 1fr 340px` → **상대 포지셔닝 기반 레이아웃**
- 캔버스가 전체 `content` 영역을 차지
- 사이드 패널은 `position: absolute` 또는 CSS Grid overlay로 캔버스 위에 플로팅
- 캔버스 영역에 subtle vignette overlay 추가

```
구조:
.network (flex column, 라이트 배경 유지)
├── NetworkHUD (새 디자인)
└── .content (position: relative)
    ├── .canvas-area (전체 영역 차지)
    └── .panel-float (position: absolute, right: 16px, top: 0, bottom: 16px)
        └── NetworkSidePanel (glass card)
```

**핵심 CSS 변경:**
```css
.content {
  flex: 1;
  position: relative;
  min-height: 0;
}
.canvas-area {
  position: absolute;
  inset: 0;
}
.panel-float {
  position: absolute;
  top: 12px;
  right: 12px;
  bottom: 12px;
  width: 380px;
  z-index: 5;
}
```

**반응형:**
- Tablet (≤860px): 패널이 하단 50%로 이동
- Mobile (≤600px): 패널이 bottom-sheet 스타일로 화면 하단 60%

---

### Step 2: NetworkHUD.svelte — 메트릭 카드 시스템

**파일:** `src-svelte/lib/components/NetworkHUD.svelte`

**디자인 컨셉:** Google Material 3의 `Metric Card` 패턴

**변경 내용:**
- 기존 한 줄 stats-banner → **2행 구조**
  - 상단 행: 타이틀 (●  LIVE + "Compute Mesh") + 모드 스위처
  - 하단 행: 5개 메트릭 카드 (카드형 칩, 각각 큰 숫자 + 작은 라벨)
- 메트릭 카드:
  - `border-radius: 12px`
  - `background: var(--surface)` with subtle border
  - 숫자: `font-size: 1.2rem`, `font-weight: 800`, mono
  - 라벨: `font-size: 0.62rem`, uppercase, muted
  - hover시 subtle elevation 변화
- GPU 상태 뱃지가 있으면 타이틀 옆에 pill 형태로 표시
- 모드 스위처: pill 안에 3개 옵션이 들어간 세그먼트 컨트롤

**레이아웃:**
```css
.hud {
  padding: 16px 20px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--surface, #fff);
  border-bottom: 1px solid var(--border-subtle);
}
.hud-top { display: flex; align-items: center; justify-content: space-between; }
.hud-metrics { display: flex; gap: 8px; overflow-x: auto; }
.metric-card {
  min-width: 90px;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  background: var(--page-bg);
  text-align: center;
}
```

---

### Step 3: NetworkSidePanel.svelte — 플로팅 글래스 카드

**파일:** `src-svelte/lib/pages/network/NetworkSidePanel.svelte`

**디자인 컨셉:** Claude UI의 미니멀 카드 + glassmorphism

**변경 내용:**
- `background: rgba(255,255,255,0.88)`, `backdrop-filter: blur(20px) saturate(180%)`
- `border-radius: 20px`
- `border: 1px solid rgba(0,0,0,0.06)`
- `box-shadow: 0 8px 40px rgba(0,0,0,0.08)`
- 탭 바: Material 3 `SegmentedButton` 스타일
  - 전체를 감싸는 pill 컨테이너
  - 활성 탭에 background slide 애니메이션
  - 아이콘은 없음 (텍스트만, 간결하게)
- GPU onboard prompt: 더 여유 있는 패딩, 큰 아이콘
- my-node-card: 패널 상단에 그대로 유지, 스타일 정리
- panel-body: 내부 스크롤 유지

**탭 바 CSS:**
```css
.panel-tabs {
  display: flex;
  background: var(--border-subtle, #EDEAE5);
  border-radius: 12px;
  padding: 3px;
  gap: 2px;
  margin: 0 14px;
}
.ptab {
  flex: 1;
  padding: 8px 4px;
  border-radius: 10px;
  font-size: 0.72rem;
  font-weight: 600;
  text-align: center;
  background: transparent;
  transition: all 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
.ptab.active {
  background: var(--surface, #fff);
  box-shadow: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06);
  color: var(--text-primary);
}
```

---

### Step 4: 탭 내부 컴포넌트 스타일 통일

**파일들:**
- `src-svelte/lib/pages/network/NetworkGpuTab.svelte`
- `src-svelte/lib/pages/network/NetworkBondTrustTab.svelte`
- `src-svelte/lib/pages/network/NetworkSwarmsTab.svelte`

**변경 내용:**
- `.psection` padding을 `16px 18px`로 통일
- `.slabel` 스타일을 더 가독성 있게: `font-size: 0.68rem`, `letter-spacing: 0.06em`
- 카드/그리드 아이템: `border-radius: 12px`, `padding: 12px`로 통일
- 숫자 표시: `font-size: 1.1rem → 1.2rem`, 더 볼드하게
- 버튼 스타일: Material 3 tonal button 스타일 (filled-tonal)
  - `border-radius: 12px`, `padding: 10px 20px`
  - Hover시 subtle tint 변화
- Results row: pill 형태 뱃지, 더 여유 있는 패딩

---

## Files to Modify (in order)

1. **`src-svelte/lib/pages/NetworkView.svelte`** — 레이아웃 구조 + CSS
2. **`src-svelte/lib/components/NetworkHUD.svelte`** — 전면 재설계
3. **`src-svelte/lib/pages/network/NetworkSidePanel.svelte`** — 글래스 카드 + 세그먼트 탭
4. **`src-svelte/lib/pages/network/NetworkGpuTab.svelte`** — 스타일 정리
5. **`src-svelte/lib/pages/network/NetworkBondTrustTab.svelte`** — 스타일 정리
6. **`src-svelte/lib/pages/network/NetworkSwarmsTab.svelte`** — 스타일 정리

**수정하지 않는 파일:**
- `MeshCanvas.svelte` — WebGL 로직 유지
- `config.ts`, `types.ts` — 데이터 모델 유지
- `tokens.css` — 기존 디자인 토큰 활용 (새 토큰 불필요)
- 모든 stores, API, utils — 비즈니스 로직 무변경

## Verification

1. `npm run dev`로 로컬 서버 실행
2. `http://localhost:5215/#/network` 접속
3. Preview 도구로 확인:
   - 캔버스가 전체 content 영역 차지하는지
   - 글래스 패널이 오른쪽에 떠있는지
   - HUD 메트릭 카드가 정상 표시되는지
   - 6개 탭 전환이 정상 작동하는지
   - 모바일 (375px) 반응형 확인
   - 탭 전환 애니메이션 확인
4. 콘솔 에러 확인
