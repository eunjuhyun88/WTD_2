# Cogochi Terminal — Mobile + PC Layout 설계

## Context

현재 AppShell은 데스크탑 전용 3-패널 레이아웃 (Sidebar | Canvas | AIPanel) 이다. 모바일에서는 레이아웃이 깨지고, `viewportTier` / `mobileMode` 스토어가 존재하지만 cogochi에서 전혀 사용하지 않는다.

**목표**: 뷰포트 3단계(DESKTOP / TABLET / MOBILE)별로 최적화된 레이아웃 구현.

---

## Wireframes

### DESKTOP (≥ 1280px) — 현재 유지

```
┌──────────────────────────────────────────────────────────────────┐
│ COGOCHI │ ◆ session  ⌘P         │              RANGE  AI ⌘L      │  34px CommandBar
├──────────────────────────────────────────────────────────────────┤
│ ◧ │ ◆ BTC·4H ×  ◆ ETH·1H ×  + │                                │  30px TabBar
├─────────────┬──────────────────────────────────┬─────────────────┤
│  Sidebar    │   Canvas (TradeMode Layout D)    │   AI Panel      │
│  220px      │   flex:1                         │   280px         │
│ Library     │  ┌──────────────────────────┐   │  Chat           │
│ Verdicts    │  │  ChartBoard (LWC)        │   │  Apply Setup    │
│ Rules       │  └──────────────────────────┘   │                 │
│             │  02 ANALYZE · 03 SCAN ▸          │                 │
├─────────────┴──────────────────────────────────┴─────────────────┤
│ TRADE TRAIN FLY │ ● live 300sym │ ⌘B ⌘K ⌘T │           14:32:11 │  24px StatusBar
└──────────────────────────────────────────────────────────────────┘
```

변경: Layout strip (A/B/C/D) — DESKTOP에서만 표시 (TABLET에서 Layout D 강제)

---

### TABLET (768px – 1279px) — CSS 조정만

```
┌─────────────────────────────────────────┐
│ COGOCHI  [session-chip 숨김]   RANGE AI │  34px CommandBar
├─────────────────────────────────────────┤
│ ◆ BTC·4H ×  ◆ ETH·1H ×  +            │  30px TabBar
├─────────────────────────────────────────┤
│         Canvas (Layout D 강제)          │  Sidebar/AI 자동 닫힘
│  ┌───────────────────────────────────┐  │
│  │  ChartBoard                       │  │
│  └───────────────────────────────────┘  │
│  02 ANALYZE · 03 SCAN · 04 JUDGE ▸    │
├─────────────────────────────────────────┤
│ TRADE TRAIN │ ● live │      14:32:11   │  24px StatusBar (⌘B ⌘K ⌘T 숨김)
└─────────────────────────────────────────┘
```

---

### MOBILE (< 768px) — 상하 분할 + 인라인 탭 패널

```
┌──────────────────────────────────┐
│ COGOCHI  [BTCUSDT▾] [4H▾]  [AI] │  44px MobileTopBar (new)
├──────────────────────────────────┤
│                                  │
│   ChartBoard (LWC)               │  flex: ~1 (위 절반, 항상 고정)
│                                  │
├──────────────────────────────────┤
│  [ANL] [SCAN] [JUDGE]           │  28px 인라인 탭 바
├──────────────────────────────────┤
│   [활성 탭 콘텐츠, 스크롤]       │  flex: ~1 (아래 절반)
│                                  │
│  ANL:   evidence chips + plan    │
│  SCAN:  scan cards               │
│  JUDGE: act A+B+C stacked        │
│                                  │
│  데이터 없으면 → CTA 메시지     │
├──────────────────────────────────┤
│  ● live · 300 sym ·   14:32:11  │  24px 푸터 (new, 간단 상태)
└──────────────────────────────────┘

AI 바텀 시트 (AI 버튼 탭 시 위로 슬라이드):
┌──────────────────────────────────┐
│    ChartBoard (위에 계속 보임)   │
├──────────────────────────────────┤  ← drag handle
│ AI ─────────────────────── [X]  │
│                                  │
│  채팅 내용 (스크롤)              │  ~50% 화면
│                                  │
│  [입력창                    →]  │
└──────────────────────────────────┘
```

---

## 구현 계획

### Phase 1 — CSS-only 태블릿 조정 (위험도 0)

**`CommandBar.svelte`**
```css
@media (max-width: 900px) {
  .session-chip { display: none; }
  .kbd { display: none; }
}
```

**`StatusBar.svelte`**
- 단축키 hints 3개를 `.shortcuts` 래퍼로 감싸기
```css
@media (max-width: 1279px) {
  .shortcuts, .shortcuts + .divider { display: none; }
}
```

---

### Phase 2 — AppShell 뷰포트 반응형

**`AppShell.svelte`** 변경:
1. `viewportTier` 스토어 import
2. `$effect` — TABLET/MOBILE 진입 시 자동 collapse:
   ```ts
   $effect(() => {
     if ($viewportTier.tier !== 'DESKTOP') {
       shellStore.update(s => ({ ...s, sidebarVisible: false, aiVisible: false }));
     }
   });
   ```
3. TABLET: `layoutMode` → `'D'` 강제
4. Layout A/B/C/D strip: DESKTOP에서만 표시, 나머지 `display:none`

---

### Phase 3 — 새 컴포넌트 생성

#### `MobileTopBar.svelte` (new)

```
height: 44px  flex-shrink: 0
background: var(--g1)  border-bottom: 1px solid var(--g5)
padding: 0 12px  gap: 8px
```

구성 (좌→우):
- `COGOCHI` 로고 텍스트
- `|` 구분자
- 심볼 버튼 (BTCUSDT▾) — var(--g2) bg, JetBrains Mono 13px
- TF 버튼 (4H▾) — 탭 시 `['15m','1h','4h','1d','1w']` 순환
- spacer flex:1
- AI 버튼 (active: var(--brand) 색상)

Props: `symbol`, `timeframe`, `aiVisible`, `toggleAI`, `onSymbolChange?`, `onTFChange?`

#### `MobileFooter.svelte` (new)

```
height: 24px  flex-shrink: 0
background: var(--g1)  border-top: 1px solid var(--g5)
padding: 0 10px
font: JetBrains Mono 9px
```

내용: `● scanner live · {symCount} sym · {currentTime HH:MM}`

Props: `symCount: number`, `live: boolean`

#### AI 바텀 시트 — `AppShell.svelte` 내 인라인

별도 컴포넌트 불필요. AppShell 내:
```svelte
{#if $shellStore.aiVisible && $viewportTier.tier === 'MOBILE'}
  <div class="mobile-ai-sheet">
    <div class="sheet-handle" />
    <AIPanel ... />
  </div>
{/if}
```

```css
.mobile-ai-sheet {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  height: 52%;   /* 반화면 */
  z-index: 200;
  background: var(--g1);
  border-top: 1px solid var(--g5);
  border-radius: 8px 8px 0 0;
  display: flex;
  flex-direction: column;
  animation: sheetSlideUp 0.2s ease;
}
.sheet-handle {
  width: 36px; height: 4px;
  background: var(--g5);
  border-radius: 2px;
  margin: 8px auto 4px;
  flex-shrink: 0;
}
```

---

### Phase 4 — TradeMode mobile 뷰 추가

**`TradeMode.svelte`** props에 추가:
```ts
let { mobileView = undefined }: { mobileView?: 'analyze' | 'scan' | 'judge' | undefined } = $props();
```

기존 레이아웃 전체를 `{#if !mobileView}` 블록으로 래핑.

모바일 브랜치 (기존 derived state 재사용):
```svelte
{#if mobileView !== undefined}
  <!-- 상단 차트 -->
  <div class="mobile-chart-section">
    <ChartBoard {symbol} {tf} {initialData} {verdictLevels} ... />
  </div>

  <!-- 인라인 탭 바 -->
  <div class="mobile-tab-strip">
    {#each ['analyze','scan','judge'] as t}
      <button class="mts-tab" class:active={mobileView === t}
        onclick={() => setMobileView(t)}>
        {t === 'analyze' ? '02 ANL' : t === 'scan' ? '03 SCAN' : '04 JUDGE'}
      </button>
    {/each}
  </div>

  <!-- 하단 패널 -->
  <div class="mobile-panel">
    {#if mobileView === 'analyze'}
      {#if analyzeData}
        <!-- evidence chips + proposal rows (single col) -->
      {:else}
        <div class="mobile-empty">
          <span>/ analyze 를 입력하거나</span>
          <span>차트에서 RANGE 선택 후 실행</span>
        </div>
      {/if}
    {:else if mobileView === 'scan'}
      <!-- scan cards, scanState === 'idle' 이면 CTA -->
    {:else if mobileView === 'judge'}
      <!-- act A+B+C stacked vertically -->
    {/if}
  </div>
{:else}
  <!-- 기존 desktop Layout A/B/C/D — 변경 없음 -->
{/if}
```

`mobileView`를 AppShell에서 `mobileMode` 스토어 값으로 주입.
`setMobileView` = `mobileMode.setActive` (AppShell에서 콜백으로 전달).

CSS:
```css
.mobile-chart-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.mobile-tab-strip {
  height: 28px;
  flex-shrink: 0;
  display: flex;
  background: var(--g2);
  border-top: 1px solid var(--g4);
  border-bottom: 1px solid var(--g4);
}
.mts-tab {
  flex: 1;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  letter-spacing: 0.06em;
  color: var(--g6);
  border-right: 1px solid var(--g4);
}
.mts-tab.active {
  color: var(--brand);
  background: var(--g1);
  border-top: 1.5px solid var(--brand);
}
.mobile-panel {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
```

---

### Phase 5 — AppShell 모바일 브랜치 연결

```svelte
{#if $viewportTier.tier === 'MOBILE'}
  <MobileTopBar
    symbol={currentSymbol}
    timeframe={currentTF}
    aiVisible={$shellStore.aiVisible}
    toggleAI={() => shellStore.toggleAI()}
  />
  <div class="mobile-canvas">
    <TradeMode
      ...existingProps
      mobileView={$mobileMode.active === 'chart' ? 'analyze' : $mobileMode.active}
    />
  </div>
  <MobileFooter symCount={300} live={true} />

  <!-- AI 바텀 시트 -->
  {#if $shellStore.aiVisible}
    <div class="mobile-ai-sheet">
      <div class="sheet-handle" />
      <AIPanel ... />
    </div>
  {/if}
{:else}
  <!-- 기존 CommandBar + TabBar + main-row + StatusBar -->
{/if}
```

`mobileMode.active` 매핑: `'chart'` → analyze 패널 기본 표시 (차트는 항상 위에 있으므로).

```css
/* AppShell 추가 */
.mobile-canvas {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
@keyframes sheetSlideUp {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
```

---

## 데이터 플로우

```
mobileMode store (.active: 'chart'|'detail'|'scan'|'judge')
          ↓ AppShell
TradeMode (mobileView: 'analyze'|'scan'|'judge')
          ↓
기존 derived state 그대로 사용:
  analyzeData   → ANALYZE 패널
  chartPayload  → ChartBoard (항상 위에)
  scanCandidates → SCAN 패널
  judgeVerdict  → JUDGE 패널
```

symbol/tf: `mobileMode.lastSymbolContext` 로 탭 전환 시 유지.

---

## 수정 파일 목록

| 파일 | 변경 유형 |
|------|-----------|
| `app/src/lib/cogochi/AppShell.svelte` | 뷰포트 분기 + 모바일 브랜치 + AI 바텀 시트 |
| `app/src/lib/cogochi/modes/TradeMode.svelte` | `mobileView` prop + 상하 분할 레이아웃 + 3탭 패널 |
| `app/src/lib/cogochi/CommandBar.svelte` | CSS-only: session-chip hide at <900px |
| `app/src/lib/cogochi/StatusBar.svelte` | CSS-only: shortcuts hide at <1279px |
| `app/src/lib/cogochi/MobileTopBar.svelte` | **신규**: 44px 압축 헤더 |
| `app/src/lib/cogochi/MobileFooter.svelte` | **신규**: 24px 상태 푸터 |

---

## 검증

1. DevTools → 375px (iPhone): MobileTopBar + 차트 + 3탭 + 푸터 확인
2. 768–1279px (태블릿): Sidebar/AI 자동 숨김, Layout D 강제, 단축키 힌트 숨김
3. ≥ 1280px: 현재 동작과 동일 (regression 없음)
4. 탭 전환 시 URL `?m=` 변경 확인
5. AI 버튼 탭 → 바텀 시트 슬라이드업, 차트 위에 반화면으로 보임 확인
6. 데이터 없는 상태에서 ANALYZE 탭 → CTA 텍스트 표시 확인
