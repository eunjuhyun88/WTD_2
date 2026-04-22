# W-0100 Checkpoint — 2026-04-19 Home+Nav+Terminal UX Session

## Session Summary

gracious-diffie 브랜치: 홈페이지 WebGL 디자인 복원, 네비게이션 IA 정리, 터미널 UX 전면 폴리시. 전부 main 머지 완료.

## Commits Merged (gracious-diffie → main, 7f40181)

| hash | description |
|------|-------------|
| `833eb45` | fix(home/nav): revert to HomeHero, fix mobile nav grid, add 2-tier site footer |
| `a570209` | fix(nav/home): semantic HTML + mobile nav IA + footer cleanup |
| `e7cf17b` | feat(terminal): UX polish — larger text hierarchy, stronger verdict hero, better spacing |

## Changes Shipped

### 홈페이지 복원 (833eb45 + a570209)
- `showAnimatedBackground = $state(true)` — WebGL 배경 즉시 표시 (이전엔 false)
- `HomeHero` 전 뷰포트 표시 — mobile guard 제거 (`viewportTier` 분기 삭제)
- `SiteFooter.svelte` 신규 생성 — TradingView 스타일 2티어 푸터
  - Tier 1: COGOCHI 브랜드 + Product(Terminal/Lab/Dashboard/Patterns) + Account(Sign In/Settings)
  - Tier 2: 저작권 only (Privacy/Terms 링크 없음 — 페이지 미존재)
- `HomeFinalCta.svelte`: `<footer>` → `<section>` 시맨틱 수정
- `+layout.svelte`: BottomBar 완전 제거 (thermo polling 포함), MobileBottomNav만 유지

### 모바일 네비게이션 IA (833eb45)
- `MobileBottomNav.svelte`: 3-column grid → 4-column grid (4번째 탭 오버플로우 버그 수정)
- `appSurfaces.ts MOBILE_NAV_SURFACES`: Passport → Lab 교체
  - 변경 전: [Home, Terminal, Dashboard, Passport]
  - 변경 후: [Home, Terminal, Lab, Dashboard]

### 터미널 UX 폴리시 (e7cf17b)
**TerminalContextPanel.svelte**
- verdict-hero direction (BULLISH/BEARISH): `11px → 20px`, 그라디언트 배경 강화
- ML Score value: `16px → 22px`
- section labels: `8px → 10px`
- flow-row span (label): `7px → 9px`
- flow-row strong/small: `8-9px → 10px`
- entry-cell span: `7px → 9px`, strong: `10px → 12px`
- panel body: `padding:5px; gap:5px` → `padding:10px; gap:8px`
- tab-btn: `9px → 10px`, padding 증가
- recall-row, risk-item: `8px → 10px`
- news-title: `10px → 11px`

**TerminalBottomDock.svelte**
- dock-pills: `9px → 10px`, padding `2px 8px → 4px 11px`, hover 강화
- dock-send/attach: `28px → 30px`
- dock-response-text: `11px → 12px`
- dock-sep, dock-pills padding 증가

**terminal/+page.svelte**
- rail-header: `8px → 10px`, padding `8px 10px → 10px 12px`, min-height `40px → 44px`
- rail-sym: `11px → 13px`
- rail-badge: `8px → 9px`, padding 증가
- scan-card: padding `5px 6px → 8px 10px`
- sc-sym: `10px → 12px`, sc-venue: `8px → 9px`
- sc-reason: `9px → 10px`
- lab-cta-banner: pill-style 링크 (Dashboard=초록, Lab=파랑), `.lab-cta-link--dash` CSS 추가
- board-empty/loading: 약간 크게

## Test Count

UX-only 변경 (CSS/template), engine tests 불변

---

# W-0101 설계문서 — 다음에 할 UI/UX 작업

## 우선순위 맵

| 순위 | 코드 | 작업 | 이유 |
|------|------|------|------|
| P0 | W-0101-A | Dashboard UX — Verdict Inbox | W-0088 플라이휠 완료했으나 UI 미존재 |
| P1 | W-0101-B | Terminal ↔ Dashboard ↔ Lab 연결 강화 | 현재 저장 후 이동 동선 끊김 |
| P2 | W-0101-C | 홈페이지 proof-of-concept 섹션 실데이터 연결 | proofRows 현재 하드코딩 |
| P3 | W-0101-D | Terminal 모바일 MobileShell UX | JudgeMode/ScanMode 폴리시 |

---

## P0: W-0101-A — Dashboard Verdict Inbox

### 목표
패턴 캡처 저장 후 `Dashboard → /dashboard` 에서 verdict 대기 중인 capture를 볼 수 있어야 함.
현재 Dashboard는 거의 비어있거나 기본 상태.

### 필요한 것
1. `GET /captures?status=outcome_ready` 로 verdict 대기 목록 fetch
2. 각 row: symbol / timeframe / captured_at / outcome (hit/miss?) / "Label →" CTA
3. Label CTA → `POST /captures/{id}/verdict` 호출 (valid/invalid/missed)
4. 필터: outcome_ready | verdict_ready | all

### 디자인 방향
- TradingView 스타일 인박스 테이블 (compact rows)
- 각 row에 bias 색상 (bull=녹, bear=적)
- 상단: "X setups awaiting verdict" 카운터
- 빈 상태: "Nothing to label yet — save setups in Terminal"

---

## P1: W-0101-B — Terminal ↔ Dashboard ↔ Lab 연결 강화

### 현재 문제
- Lab CTA는 capture 저장 직후 15초 노출 — 이후 동선 없음
- Dashboard 링크는 추가했지만 Dashboard에 내용 없음 (P0 해결하면 자동 해결)
- Terminal에서 이전 capture recall이 있지만 Lab으로 보내는 버튼 없음

### 필요한 것
1. Terminal 우측 레일 하단: "View in Lab →" 상시 링크 (현재 symbol의 lab URL)
2. Lab 상단: "← Terminal" 뒤로 버튼 (심볼 컨텍스트 유지)
3. Dashboard Verdict Inbox에서 "View in Terminal →" 링크

---

## P2: W-0101-C — 홈페이지 proof-of-concept 실데이터

### 현재 상태
`HOME_PROOF_ROWS`가 `app/src/lib/home/homeLanding.ts`에 하드코딩됨.
실제 엔진 데이터(최근 promote된 패턴, KOMA 라이브 신호 등)를 보여줄 수 있으면 훨씬 강력.

### 필요한 것
- `GET /api/cogochi/home/proof` endpoint — promote된 패턴 최근 3개 + 마지막 live signal
- 홈페이지 onMount에서 fetch, proofRows를 동적으로 업데이트
- fallback: 기존 하드코딩 값 그대로

---

## P3: W-0101-D — Terminal 모바일 UX 폴리시

### 현재 상태
MobileShell → ModeRouter 구조 존재하지만 ScanMode / JudgeMode UI가 기능은 있어도 디자인이 거칠음.

### 개선 포인트
- ScanMode 시장 리스트: 가격/변화율 표시 더 크게
- JudgeMode alert row: 방향 배지 더 명확하게
- AnalysisMode (verdict 표시): verdict-hero와 동일한 20px 방향 레이블 적용
- MobileCommandDock placeholder 텍스트 개선

---

## Non-Goals (이번 세션 범위 외)

- 완전 새 디자인 시스템 (기존 --tv-*, --sc-* 변수 유지)
- 다크/라이트 테마 전환
- 온보딩 플로우
- 실시간 WebSocket price feed (현재 polling 유지)
