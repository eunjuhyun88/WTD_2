# Apple UX 전체 반응형 + 구조 정비

## Context

전체 페이지 간격/구조 불일치 + 반응형 깨짐. 감사 결과 13개 이슈 발견. 브레이크포인트 8개(380/600/640/700/860/980/1024/1440)가 파일마다 다름. 터치 타겟 44px 미달, 하드코딩 간격 12종.

## 핵심 원칙 (Apple HIG)

1. **브레이크포인트 3개만**: 600px(mobile) / 860px(tablet) / 1440px(large)
2. **간격은 토큰만 사용**: --space-2(8) / --space-3(12) / --space-4(16) / --space-6(24)
3. **터치 타겟 ≥44px** 전역
4. **safe-area-inset** 모든 페이지 하단에

## 변경 파일 + 작업

### 1. tokens.css — 토큰 표준화
- 브레이크포인트 CSS custom property (주석으로만 — media query에서 변수 사용 불가)
- `--agent-panel-width: 300px`
- `--sidebar-width: 320px`
- `--nav-width: 72px` (desktop rail)
- `--touch-min: 44px`
- 하드코딩된 border-radius → `--radius-sm: 8px` / `--radius-md: 12px` / `--radius-lg: 16px`

### 2. App.svelte — 셸 정비
- 300px → `var(--agent-panel-width)`
- 360px → `var(--agent-panel-width-lg)` (>1440)
- 980px → 860px 통일
- ai-toggle 크기: desktop 40px→44px
- padding 하드코딩 → 토큰

### 3. NavBar.svelte — 네비게이션 정비
- 981px → 860px 통일
- mobile-menu-toggle: 40px → 44px
- mobile-brand-icon: 36px → 40px
- padding 하드코딩 → 토큰
- mobile-nav-item min-height: 44px 추가

### 4. MagnetStudioPage.svelte (Setup 탭)
- .creator-body max-width: 720px 유지
- .input-card padding: 하드코딩 → --space-6
- .atmo-title clamp() 유지 (이미 반응형)
- .type-pills gap: 하드코딩 → --space-3
- 모바일: safe-area-bottom 추가

### 5. ResearchRunning.svelte (Training)
- gap: 6px → --space-2 (8px)
- padding: 8px → --space-2
- .branches-feed-row 700px → 860px 통일
- .converge-tile min-height: 200px → clamp(160px, 25vh, 280px)
- mobile safe-area-bottom 추가
- 380px 브레이크포인트 제거 (600px에 통합)

### 6. ModelsPage.svelte
- 860px 브레이크포인트 유지
- 600px → 1-col grid
- safe-area-bottom 추가
- card min-height: 44px 터치 타겟

### 7. NetworkView.svelte
- 300px hardcoded → var(--sidebar-width)
- 1024px → 860px 통일
- safe-area-bottom 추가

### 8. EconomicsPage.svelte (Earn)
- metrics-strip padding: 24px→6px 스윙 수정 → 24px→12px
- research-grid: 5col→3col(860px)→2col(600px) 중간 브레이크포인트 추가
- safe-area-bottom 추가

### 9. GenkidamaPage.svelte (Testing)
- 320px sidebar hardcoded → var(--sidebar-width)
- safe-area-bottom 추가

### 10. StudioPublish.svelte
- button min-height: 44px 전역 (640px 조건 제거)
- 640px → 600px 통일
- safe-area-bottom 추가

### 11. AIAssistantPanel.svelte
- 980px → 860px 통일
- 모바일: overlay z-index 확인

## 구현 순서

Phase A: tokens.css 토큰 추가 (5분)
Phase B: App.svelte + NavBar.svelte 셸 정비 (10분)
Phase C: 각 페이지 반응형 정비 (20분)
Phase D: 전체 빌드 + 브라우저 3bp 검증

## 검증

1. `npm run build` 통과
2. Desktop (>860px): Nav rail + Content + AI panel (선택)
3. Tablet (601-860px): Top bar + Content + AI overlay
4. Mobile (≤600px): Top bar + Content + AI 전체화면 overlay
5. 모든 버튼 ≥44px 터치 타겟
6. safe-area-inset 모든 페이지 하단
