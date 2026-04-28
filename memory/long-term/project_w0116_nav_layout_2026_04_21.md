---
name: W-0116 Unified Nav Layout 완료 (2026-04-21)
description: AppNavRail + AppTopBar + MobileBottomNav 신규 + layout.svelte 3-context 재설계. PR #123/#125 머지.
type: project
originSessionId: ada55ec7-cf29-4fae-a625-aed1be159e60
---
## 완료된 작업 (PR #123, #125 — 2026-04-21)

### 신규 파일
- `app/src/components/layout/AppNavRail.svelte` — 52px 고정 좌측 아이콘 레일 (모든 앱 페이지, 모바일 숨김)
- `app/src/components/layout/AppTopBar.svelte` — 44px 상단 바 (비-터미널 앱 페이지, breadcrumb + 지갑)
- `app/src/routes/market/+page.svelte` — Market 라우트 스캐폴드

### 수정 파일
- `app/src/routes/+layout.svelte` — 3-context 레이아웃: home / terminal / app
- `app/src/components/layout/MobileBottomNav.svelte` — 5탭 SVG 아이콘 (Home/Terminal/Dashboard/Lab/Market)
- `app/src/lib/navigation/appSurfaces.ts` — terminal href → `/cogochi`, agent/market/analyze surface 추가

### 레이아웃 규칙
- Home (`/`): marketing Header만, NavRail 없음
- Terminal (`/cogochi`, `/terminal`): NavRail ✓, TopBar 없음 (terminal-mode padding-left: 52px)
- App pages: NavRail ✓ + TopBar ✓ (app-mode padding: 44px top, 52px left)
- Mobile ≤768px: NavRail 숨김, MobileBottomNav 표시

### 핵심 결정
- `/cogochi` = canonical terminal URL, `/terminal`은 redirect
- cogochi AppShell은 NavRail과 공존 (full-screen이 아님)
- warm dark palette 적용 (`--sc-*` 토큰)

**Why:** GTM 동선 개선 + 일관된 앱 네비게이션
**How to apply:** 새 앱 라우트 추가 시 appSurfaces.ts에 surface 등록, NavRail 아이콘 추가

---

## COGOTCHI 리브랜드 + Dashboard 정비 (PR #126 — 2026-04-21)

### 변경 내용
- UI 텍스트 `COGOCHI` → `COGOTCHI` 8개 파일 전면 교체
  - HomeHero, SiteFooter, Header, AppTopBar, MobileOnboardingOverlay, CommandBar, TradeMode, Dashboard title
- Dashboard workbar padding `12px 16px` → `16px 20px`
- challenge-grid gap `14px` → `16px`
- `--home-ref-border-strong` (home 전용 토큰) → `rgba(249, 216, 194, 0.2)`
- Dashboard CTA `goto('/terminal')` → `goto('/cogochi')`

### 브랜드 규칙
- 공식 브랜드명: **COGOTCHI** (오기 COGOCHI 아님)
- 코드 주석/문서(30+ 파일)의 COGOCHI는 이번 스코프 밖 — 추후 별도 정비
