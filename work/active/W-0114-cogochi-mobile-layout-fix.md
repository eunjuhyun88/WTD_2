# W-0114: Cogochi Mobile Layout Fix

**Owner**: app
**Branch**: claude/w-0114-mobile-state-persistence
**Change Type**: fix + polish
**Primary Files**: `AppShell.svelte`, `TradeMode.svelte`

---

## Context

모바일/PC 레이아웃 1차 구현 완료 (commit 954935e). DOM 검증 결과 구조는 정상이나 실사용 UX 버그 6개 발견.

### 현재 레이아웃 측정값 (375×812 기준)

```
MobileTopBar    y=0–44     44px
ChartSection    y=44–392  348px
  chart-toolbar            45px  ← TF 드롭다운 (MobileTopBar와 중복)
  chart-header--tv         53px  ← Candles/Save Setup/CAPTURE (모바일 불필요)
  chart-stack             249px  ← 실제 캔버스 (너무 좁음)
TabStrip        y=392–420  28px
Panel           y=420–788 368px
MobileFooter    y=788–812  24px  ← DOM에 존재, screenshot 도구가 캡처 못할 뿐
```

---

## 수정 목록

### P0 — 기능 불가

#### Fix 1: ChartBoard 툴바 98px 제거
- **원인**: `chart-toolbar` 45px + `chart-header--tv` 53px = 98px 점유
  - `chart-toolbar`: TF 드롭다운 → MobileTopBar에 이미 있어서 **중복**
  - `chart-header--tv`: PERP/Candles/Line/Save Setup/CAPTURE → 모바일 불필요
- **효과**: 차트 캔버스 249px → 347px (+39%)
- **방법**: `TradeMode.svelte` `<style>` 에 `:global()` 오버라이드
  ```css
  /* mobile-chart-section 안에서 ChartBoard 데스크탑 툴바 숨김 */
  :global(.mobile-chart-section .chart-toolbar) { display: none; }
  :global(.mobile-chart-section .chart-header--tv) { display: none; }
  ```

#### Fix 2: ANL 탭 데이터 미표시
- **원인**: `{#if analyzeData}` 가드 — `analyzeData`는 API 응답 객체, 없으면 `null`
- **PC 동작**: `evidenceItems`, `proposal` 파생값이 API 없을 때도 하드코딩 폴백 반환
- **수정**: `{#if analyzeData}` 가드 제거, `evidenceItems` / `proposal` 직접 렌더링
  - `analyzeData === null` 일 때는 패널 하단에 작은 힌트 텍스트만 추가
  ```svelte
  {#if mobileView === 'analyze'}
    <div class="narrative">...</div>
    <div class="evidence-grid">{#each evidenceItems as item}...{/each}</div>
    <div class="proposal-label">PROPOSAL</div>
    {#each proposal as p}...{/each}
    {#if !analyzeData}
      <div class="mobile-analyze-hint">/ analyze 실행 시 실시간 데이터로 업데이트</div>
    {/if}
  ```

#### Fix 3: TF 변경 불작동
- **원인**: `AppShell`에서 `timeframe="4h"` 하드코딩 → MobileTopBar TF 변경이 TradeMode에 전달 안 됨
- **수정**: `AppShell`에 로컬 상태 추가
  ```ts
  let mobileTF = $state('4h');
  let mobileSymbol = $state('BTCUSDT');
  ```
  MobileTopBar에 `onTFChange={(tf) => mobileTF = tf}` 연결
  TradeMode에 `timeframe={mobileTF}` 전달

#### Fix 4: Symbol 변경 불작동
- **원인**: `symbol="BTCUSDT"` 하드코딩, `onSymbolChange` 콜백 미연결
- **수정**: Fix 3와 동일 패턴, `mobileSymbol` 상태로 관리
  - onSymbolChange: 심볼 피커 없는 경우 일단 토스트 또는 스킵

---

### P1 — UX 결함

#### Fix 5: iOS Safe Area 미처리
- **원인**: `100dvh` 사용 중, 홈 인디케이터 영역(~34px) 미처리
- **수정**: AppShell `.app-shell` 에 safe area 패딩
  ```css
  .app-shell {
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  ```

#### Fix 6: AI 바텀시트 닫기 UX
- **원인**: 닫으려면 MobileTopBar AI 버튼 재클릭만 가능, sheet 자체에 X 없음
- **수정**: `.mobile-ai-sheet` 헤더 행에 `[X]` 버튼 추가
  ```svelte
  <div class="sheet-header">
    <div class="sheet-handle"></div>
    <button class="sheet-close" onclick={() => shellStore.toggleAI()}>×</button>
  </div>
  ```

#### Fix 7: TABLET layoutMode D 미강제
- **원인**: `$effect`에서 sidebar/AI는 꺼주지만 layoutMode 변경 없음
- **수정**: 동일 `$effect` 내에 추가
  ```ts
  if ($viewportTier.tier !== 'DESKTOP') {
    shellStore.update(s => ({ ...s, sidebarVisible: false, aiVisible: false }));
    shellStore.updateTabState(s => ({ ...s, layoutMode: 'D' }));
  }
  ```

---

## 수정 파일

| 파일 | Fix |
|------|-----|
| `AppShell.svelte` | Fix 3, 4, 5, 6, 7 |
| `TradeMode.svelte` | Fix 1 (`:global()` CSS), Fix 2 (ANL 가드 제거) |

---

## Exit Criteria

- [ ] ANL 탭 → evidence chips + proposal 표시 (API 없어도)
- [ ] TF 버튼 탭 → 4h→1d 등 차트 TF 변경 반영
- [ ] 차트 캔버스 ≥ 330px (툴바 숨김 후)
- [ ] iOS Safari: MobileFooter 홈 인디케이터 뒤 안 가려짐
- [ ] TABLET(768-1279px) 로드 시 Layout D 강제
- [ ] AI 버튼 → 바텀시트, 시트 내 X 버튼으로 닫기 가능
