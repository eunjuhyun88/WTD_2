# W-0118 · Cogochi 반응형 UX 전면 재설계

> Status: 설계 확정 · 미구현  
> Scope: Mobile / Tablet / Desktop 전 breakpoint 동선 재설계  
> Depends on: W-0117 (mobile CHART tab + nav footer — merged #135)

---

## 0. 왜 지금인가 — GTM 관점

Cogochi는 **모바일에서 첫 판단**이 이루어지는 제품이다. 모바일로 차트를 보다가 진입 신호를 발견하고, 그 순간 AGREE/DISAGREE를 남기는 것이 핵심 루프다. 현재 상태:

| 행동 | PC | 모바일 |
|------|----|----|
| 심볼 바꾸기 | SymbolPicker 완전 동작 | 탭해도 아무 반응 없음 (dead) |
| 차트 보기 | 레이아웃 4종 선택 | 탭 1개로 접근 (W-0117 완료) |
| 스캔 후 심볼 진입 | ↗ 버튼으로 새 탭 | 탭해도 선택만 됨, 이동 없음 |
| 모드 전환 (TrainMode 등) | StatusBar 클릭 | **진입 방법 없음** |
| AI 닫기 | 버튼 또는 외부 클릭 | 버튼만, 스와이프 없음 |
| COGOCHI로 돌아오기 | 항상 거기 있음 | footer에 링크 없음 |
| 태블릿 패널 복원 | 리사이즈해도 숨겨진 채 | 수동으로 다시 열어야 함 |

GTM critical path: **첫 모바일 사용자가 진입 → 스캔 → 판단 → 저장** 루프를 막힘 없이 돌아야 한다.

---

## 1. 현행 구조 — 감사 요약

### Breakpoints (JS store 기준)
```
MOBILE   < 768px    → 완전히 별도 DOM 트리 렌더
TABLET   768–1279px → Desktop Chrome 렌더 (패널 초기 숨김)
DESKTOP  ≥ 1280px   → Full shell 렌더
```

### 알려진 Dead-ends & 버그
1. **Symbol chip (mobile)** — 탭 시 동일 심볼 재전달, picker 없음
2. **TrainMode / Flywheel (mobile)** — 도달 방법 없음
3. **COGOCHI 복귀 링크** — MobileFooter에 없음
4. **Scan row → chart 이동 (mobile)** — tap이 로컬 선택만 함
5. **AI sheet 스와이프** — 닫기 제스처 없음
6. **Tablet 상태 복원** — DESKTOP으로 리사이즈 시 패널 숨긴 채 유지
7. **Touch splitter** — 마우스 이벤트만, touch 없음
8. **Empty canvas gate** — analyzed === false이면 레이아웃 선택 불가 (PC)
9. **TabBar 신규 탭** — 빈 canvas로 시작, 진입 힌트가 약함

---

## 2. 설계 원칙

1. **컨텍스트 보존** — 모바일에서 심볼을 바꿔도, 탭을 이동해도 차트 위치/TF 유지
2. **단방향 탐색** — 어느 화면에서든 ← 뒤로 가거나 홈으로 나가는 경로 존재
3. **터치 우선** — 스와이프, 탭, 드래그 모두 터치 이벤트 기반
4. **점진적 공개** — 모바일은 1가지 핵심 행동, 태블릿은 2-column, PC는 풀 인터페이스
5. **피처 패리티 명시** — 모바일에서 막히는 기능은 "PC에서 열기" 게이트로 명시

---

## 3. Mobile 재설계 (< 768px)

### 3-A. 레이아웃 구조

```
┌─────────────────────────────────────┐  44px  top bar
│ COGOCHI │  BTC/USDT ▾  │  4h ▾  │  AI  │
├─────────────────────────────────────┤
│                                     │
│   CHART  (42vh normal / 100% CHART tab)
│                                     │
├─────────────────────────────────────┤  28px  tab strip
│  01 CHART │ 02 ANL │ 03 SCAN │ 04 JUDGE │
├─────────────────────────────────────┤
│                                     │
│   Panel content (flex: 1, scroll)   │
│                                     │
├─────────────────────────────────────┤  44px  footer nav
│  ◉ COGOCHI │ HOME │ LAB │ DASH  │ 05:43 │
└─────────────────────────────────────┘
```

### 3-B. Symbol Picker 수정 (버그 수정)

**현재**: `MobileTopBar`에서 `onSymbolChange={(s) => (mobileSymbol = s)}` 로 같은 값 전달 → dead.

**수정**: `AppShell`에 `symbolPickerOpen` state 추가. MobileTopBar의 symbol chip tap → `symbolPickerOpen = true` → SymbolPickerSheet (bottom drawer) 렌더.

```
MobileTopBar
  symbol chip tap
    ↓
AppShell: symbolPickerOpen = true
    ↓
SymbolPickerSheet (fixed overlay, height 70vh)
  - 검색 input (autofocus)
  - 최근 심볼 리스트
  - 전체 universe 스크롤
  - 선택 → mobileSymbol 업데이트 → sheet 닫힘
```

파일: `app/src/lib/cogochi/SymbolPickerSheet.svelte` (신규 ~60줄)  
수정: `AppShell.svelte` — symbolPickerOpen state + SymbolPickerSheet import

### 3-C. Scan Row → Chart 이동

**현재**: scan row tap → `scanSelected = x.id` (local state). 아무것도 일어나지 않음.

**수정**: tap 시 `mobileSymbol = x.symbol` 업데이트 + `mobileMode.setActive('chart')` 호출.

```svelte
<!-- TradeMode.svelte mobile scan tab -->
<button class="scan-row" onclick={() => {
  setMobileSymbol?.(x.symbol);  // ← 신규 prop
  setMobileView?.('chart');      // ← 차트 탭으로 이동
}}>
```

수정: 
- `TradeMode.svelte`: `setMobileSymbol?: (sym: string) => void` prop 추가
- `AppShell.svelte`: `setMobileSymbol={(s) => (mobileSymbol = s)}` 바인딩

### 3-D. AI Sheet 스와이프 닫기

**현재**: close 버튼만.

**수정**: `mobile-ai-sheet`에 touch event 추가. 시트 상단 20% 영역 아래방향 swipe (> 60px) → 닫힘.

```svelte
<!-- AppShell.svelte mobile-ai-sheet -->
let touchStartY = 0;
function onTouchStart(e: TouchEvent) { touchStartY = e.touches[0].clientY; }
function onTouchEnd(e: TouchEvent) {
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (dy > 60) shellStore.update(s => ({ ...s, aiVisible: false }));
}
```

### 3-E. Footer nav에 COGOCHI 추가

**현재**: HOME / LAB / DASH — Cogochi 복귀 링크 없음.

**수정**: `MobileFooter.svelte`에 COGOCHI 링크 추가 (현재 페이지면 active 강조).

```
◉ COGOCHI(active) │ HOME │ LAB │ DASH │ • 300sym 05:43
```

5개 항목이 좁으면 COGOCHI → ◉ 아이콘으로 축약.

### 3-F. Mode 접근 (TrainMode 등)

**현재**: 도달 방법 없음.

**수정**: MobileTopBar에 "···" 메뉴 버튼 추가 → `ModeSheet` bottom drawer (60vh)

```
ModeSheet
  ◆ TRADE  (현재 active)
  ◈ TRAIN  → "PC에서 전체 기능 이용 가능"  ← Phase 1에서는 잠금 표시
  ◉ FLYWHEEL → 동일
  ──────────────────
  ⚙ Settings
```

Phase 1: TRAIN/FLYWHEEL는 잠금(lock icon) + "PC 권장" 배지만 표시. 실제 진입은 Phase 2.

---

## 4. Tablet 재설계 (768–1279px)

### 4-A. 현재 문제

- Desktop chrome 렌더 (CommandBar + TabBar + StatusBar) — OK
- 패널(Sidebar, AIPanel)이 `$effect`로 강제 숨김 → 태블릿에서 완전히 없는 것처럼 보임
- DESKTOP으로 리사이즈 시 패널 복원 안 됨
- Touch splitter 없음

### 4-B. 수정 방향

**Sidebar / AI 패널 상태 복원**:
```typescript
// AppShell.svelte $effect
$effect(() => {
  if ($viewportTier.tier === 'MOBILE') {
    shellStore.update(s => ({ ...s, sidebarVisible: false, aiVisible: false, layoutMode: 'D' }));
  } else if ($viewportTier.tier === 'DESKTOP') {
    // localStorage 값을 복원 (현재는 이 케이스가 없어서 숨긴 채로 남음)
    const saved = loadFromStorage();
    shellStore.update(s => ({
      ...s,
      sidebarVisible: saved?.sidebarVisible ?? true,
      aiVisible: saved?.aiVisible ?? true,
    }));
  }
  // TABLET: 강제 숨김 제거 — 사용자가 직접 열 수 있게만 함
});
```

**Touch Splitter**:
`Splitter.svelte`에 `touchstart/touchmove/touchend` 추가. pointer events API로 통합하면 mouse/touch 동시 처리 가능.

```svelte
<!-- Splitter.svelte -->
function onPointerDown(e: PointerEvent) {
  e.currentTarget.setPointerCapture(e.pointerId);
  dragging = true;
  startPos = orientation === 'vertical' ? e.clientX : e.clientY;
}
```

### 4-C. 태블릿 레이아웃 정책

| 너비 | Sidebar | AIPanel | 레이아웃 기본 |
|------|---------|---------|--------------|
| 768–899px | 숨김 (toggle 가능) | 숨김 | D |
| 900–1079px | 숨김 (toggle 가능) | 가능 (240px) | B or D |
| 1080–1279px | 가능 (180px) | 가능 (240px) | B or D |

---

## 5. Desktop 재설계 (≥ 1280px)

### 5-A. Empty Canvas 게이트 제거

**현재**: `analyzed === false`이면 empty canvas 표시 + 레이아웃 선택 불가.

**문제**: 사용자가 처음 들어오면 차트도 없고 패널도 없고 빈 화면만 봄.

**수정**: empty canvas 상태에서도 레이아웃 선택 + 차트는 즉시 표시. Panel 영역만 "empty state" 안내.

```
기존: !analyzed → full empty canvas 표시
수정: 항상 레이아웃 A/B/C/D 렌더
      analyzed === false → panel 영역에 empty state (hint 카드)
      차트 영역: 즉시 ChartBoard 표시 (loading spinner if 데이터 미도착)
```

이렇게 하면:
1. 진입하자마자 차트가 보임 → 즉각적 가치
2. AI/범위선택 CTA가 실제 차트 위에 오버레이됨 → 컨텍스트 명확

### 5-B. Layout D 기본값 개선

레이아웃 D는 "peek bar"라는 개념이 직관적이지 않다. 첫 진입 시 peek bar에 "▸ 02 ANALYZE" 라벨만 보이고 왜 누르는지 모름.

**수정**: 신규 탭은 Layout B(Drawer)가 기본, 탭별로 레이아웃 기억.

이유:
- Layout B는 차트 + 항상-열린 하단 패널 → 즉각 정보 보임
- Layout D는 파워유저용 (공간 효율 최대화) → 직접 전환

### 5-C. Tab 이름 자동 업데이트

현재 새 탭 제목이 "new session"으로 고정. AI RUN 후에만 제목이 바뀜.

**수정**: 심볼 + TF로 자동 제목: `BTC · 4H`, 이후 AI 프롬프트 실행 시 `BTC · OI 급증`으로 업데이트.

---

## 6. 전체 동선 지도 (cross-breakpoint)

```
┌──────────────────────────────────────────────────────────────────┐
│  HOME (/)                                                        │
│    ↓ Start in Terminal                                           │
├──────────────────────────────────────────────────────────────────┤
│  COGOCHI (/cogochi)                                              │
│                                                                  │
│  [MOBILE]                  [TABLET]           [DESKTOP]          │
│  TopBar: sym ▾ · TF · AI  CommandBar         CommandBar         │
│  4-tab: CHART ANL SCAN     TabBar             TabBar             │
│  JUDGE                     layout B/D         layout A/B/C/D    │
│  Footer: ◉ HOME LAB DASH   Sidebar (toggle)   Sidebar + AIPanel │
│                                                                  │
│  Mobile flows:                                                   │
│  ① CHART → 차트 풀스크린 (현재 구현)                              │
│  ② ANL  → 42vh chart + evidence + proposal                      │
│  ③ SCAN → scan rows → tap → symbol 변경 + CHART tab 이동 [NEW] │
│  ④ JUDGE→ agree/disagree + outcome                              │
│  ⑤ AI button → bottom sheet (swipe down to dismiss) [NEW]      │
│  ⑥ Symbol chip → SymbolPickerSheet [NEW]                        │
│  ⑦ ··· → ModeSheet (TRAIN/FLYWHEEL 잠금) [NEW]                 │
│    ↓ back / footer nav                                           │
├──────────────────────────────────────────────────────────────────┤
│  DASHBOARD (/dashboard)   ←→   LAB (/lab)                       │
└──────────────────────────────────────────────────────────────────┘
```

### 사용자별 핵심 경로

**신규 모바일 유저:**
```
HOME → Start in Terminal → /cogochi
→ 차트 자동 표시 (01 CHART active)
→ AI 버튼 → "BTC 지금 OI 급증하고 있어" 입력
→ 02 ANL → evidence 확인
→ 04 JUDGE → AGREE 탭
→ 완료 → DASH로 가서 결과 확인
```

**파워 트레이더 (PC):**
```
/cogochi 진입 → 즉시 차트 표시 (Layout B 기본)
→ CommandBar SELECT RANGE → 차트 구간 드래그
→ AI 패널 자동 포커스 → 패턴 설명
→ SCAN 탭 → 유사 셋업 확인 → ↗ 새 탭 open
→ JUDGE 탭 → entry/stop/target 입력
→ Tab 관리 → 여러 심볼 동시 작업
```

**GTM 기준 최소 완성 조건 (성공 지표):**
- 모바일 첫 접속 → 30초 이내 차트 + 첫 판단 가능
- 심볼 변경 → 3탭 이내 완료
- 스캔에서 심볼 진입 → 1탭으로 이동

---

## 7. 구현 순서 (Phase)

### Phase 1 — Critical Path (이번 W-0118)
| # | 작업 | 파일 | 예상 LOC |
|---|------|------|---------|
| 1 | Symbol chip dead 수정 + SymbolPickerSheet | AppShell + 신규 | ~80 |
| 2 | Scan row tap → chart 이동 | TradeMode + AppShell | ~20 |
| 3 | MobileFooter에 COGOCHI 추가 | MobileFooter | ~10 |
| 4 | AI sheet 스와이프 닫기 | AppShell | ~20 |
| 5 | Empty canvas 제거 (항상 ChartBoard 표시) | TradeMode | ~30 |
| 6 | Layout B를 신규 탭 기본값으로 | shell.store.ts | ~5 |

### Phase 2 — Tablet + Mode Access
| # | 작업 | 파일 |
|---|------|------|
| 7 | Touch Splitter (pointer events) | Splitter.svelte |
| 8 | Tablet 상태 복원 (DESKTOP 리사이즈) | AppShell |
| 9 | ModeSheet (··· 메뉴 + 잠금 배지) | MobileTopBar + 신규 |
| 10 | Tab 자동 제목 (BTC · 4H) | shell.store.ts |

### Phase 3 — Polish
| # | 작업 |
|---|------|
| 11 | Peek drawer touch resize (touchstart/move) |
| 12 | TRAIN/FLYWHEEL 모바일 실제 진입 |
| 13 | Sidebar mobile 슬라이드-인 (≥ 768px) |

---

## 8. Non-Goals (이번 W-0118)

- TrainMode/Flywheel 모바일 실제 구현 → Phase 3
- 새 라우트 생성 → 없음
- 새 API 엔드포인트 → 없음
- i18n / 다국어 → 없음

---

## 9. Exit Criteria

- [ ] 모바일 375px: symbol chip tap → SymbolPickerSheet 열림 + 선택 후 차트 업데이트
- [ ] 모바일: 03 SCAN의 심볼 행 tap → 01 CHART 탭으로 이동 + 해당 심볼 표시
- [ ] 모바일 footer: HOME / LAB / DASH / COGOCHI(active) 4개 링크 + 현재 페이지 active
- [ ] 모바일: AI sheet 상단에서 아래로 스와이프 → 시트 닫힘
- [ ] PC: 새 탭 생성 즉시 차트 표시 (empty canvas 없음), Layout B 기본
- [ ] Tablet 1280px 리사이즈: sidebar/AI 이전 상태 복원
- [ ] TypeScript check pass
