# UIUX 정비 — COGOTCHI 리브랜드 + 레이아웃 통일

## Context

NavRail + TopBar 신규 도입(PR #123/#125) 이후 전체 앱 페이지를 통일된 디자인 언어로 정비해야 함.
브랜드명 오기("COGOCHI") 수정, 각 페이지 간격/타이포 통일, Dashboard를 앱의 메인 허브로 다듬기.

---

## Scope

### 1. COGOCHI → COGOTCHI 전면 교체 (7개 UI 파일)

UI 텍스트만 교체. 코드 주석(30+ 파일)은 이번 스코프 밖.

| 파일 | 위치 |
|------|------|
| `components/home/HomeHero.svelte` | L45, L158 (brand-name + CSS content) |
| `components/home/SiteFooter.svelte` | L34 (brand-mark) |
| `components/layout/Header.svelte` | L26 (nav-logo-main) |
| `components/layout/AppTopBar.svelte` | L43 (topbar-logo + aria-label) |
| `components/terminal/mobile/MobileOnboardingOverlay.svelte` | L46 (app-mark) |
| `lib/cogochi/modes/TradeMode.svelte` | ec-logo |
| `lib/cogochi/CommandBar.svelte` | L23 (logo span) |
| `routes/dashboard/+page.svelte` | `<title>` 태그 |

### 2. AppTopBar 브레드크럼 수정

현재: `COGOCHI / PATTERNS`
변경: `COGOTCHI / PATTERNS`

→ AppTopBar.svelte L43의 href text만 수정하면 자동 반영.

### 3. Dashboard 레이아웃 정비

**현재 문제:**
- `padding-top: 44px, padding-left: 52px` 에 맞게 내부 workbar 상단 여백 중복 여부 확인
- `--home-ref-border-strong` 토큰이 대시보드에 섞여있음 (home 전용 토큰)
- 인라인 하드코딩 색상 `rgba(0, 188, 139)`, `rgba(239, 83, 80)` → `--sc-pos`, `--sc-neg` 토큰으로 교체
- 모바일에서 Workbar 버튼들 wrapping 안 되는 문제

**변경:**
- Dashboard Workbar: `padding: 16px 20px` (현재 `12px 16px`)로 여유 확보
- 카드 그리드 gap: `14px` → `16px` 통일
- 하드코딩 색상 → CSS 토큰 교체
- `<title>Dashboard — Cogotchi</title>`

### 4. 앱 전역 간격 규칙 (AppTopBar / NavRail / content)

**현재 값 (정상):**
- NavRail: `width: 52px`, 고정 좌측
- AppTopBar: `height: 44px`, `left: 52px`
- app-mode content: `padding-top: 44px, padding-left: 52px` ✓
- terminal-mode content: `padding-top: 0, padding-left: 52px` ✓

**문제점:**
- AppTopBar `left: 52px` 인데 모바일(≤768px)에서 `left: 0` 처리 되어있음 → ✓ 이미 처리됨
- 각 페이지 내부 컨테이너가 별도 `padding: 0 16px` 추가해서 총 여백 불균일

**규칙 정의:**
- 앱 페이지 내부 최상위 컨테이너: `padding: 20px 20px` (desktop), `padding: 16px 16px` (mobile)
- 섹션 간 gap: `24px`
- 카드 내부 padding: `16px`

---

## 파일별 변경 목록

### 수정 파일 (8개 — COGOTCHI 텍스트)
- `app/src/components/home/HomeHero.svelte`
- `app/src/components/home/SiteFooter.svelte`
- `app/src/components/layout/Header.svelte`
- `app/src/components/layout/AppTopBar.svelte`
- `app/src/components/terminal/mobile/MobileOnboardingOverlay.svelte`
- `app/src/lib/cogochi/modes/TradeMode.svelte`
- `app/src/lib/cogochi/CommandBar.svelte`
- `app/src/routes/dashboard/+page.svelte`

### 수정 파일 (1개 — Dashboard 정비)
- `app/src/routes/dashboard/+page.svelte`

---

## 실행 순서

1. **COGOTCHI 텍스트 교체** — 8개 파일 일괄 (10분)
2. **Dashboard 여백/토큰 정비** — +page.svelte (20분)
3. **브라우저 확인** — /dashboard, /patterns, /cogochi 세 페이지 스크린샷

---

## 검증

- `localhost:5173/dashboard` — COGOTCHI 로고, 여백 정상
- `localhost:5173/cogochi` — CommandBar에 COGOTCHI, NavRail 52px 정상
- `localhost:5173/patterns` — TopBar breadcrumb "COGOTCHI / PATTERNS"
- 모바일(375px) — TopBar left:0, 바텀탭 정상
