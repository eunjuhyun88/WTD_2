---
name: Terminal UX Overhaul v1 완료
description: Cogochi LIS terminal full redesign — mobile shell, design tokens, compact layout, personalization skeleton. Tag: terminal-ux-overhaul-v1
type: project
---

2026-04-18 완료. main 머지 + 태그 `terminal-ux-overhaul-v1`.

**Why:** 트레이딩뷰 기능 유지하면서 모바일 퍼스트 전면개편, Terminal Brutalism 디자인 적용.

**How to apply:** 이 세션의 UX 작업은 main에 머지됨. 후속 작업은 이 태그를 기준점으로 사용.

## 완료된 작업

### Design System
- `app/src/lib/styles/tokens.css` — `--sc-*` 토큰 전체 재설계: 유체 타이포그래피(`--sc-fs-9`~`--sc-fs-display`), 반경(`--sc-radius-0/1/2/3/full`), 모션(`--sc-dur-fast/dur/dur-slow`), 엘리베이션(`--sc-elev-1/2/3`)
- `app/src/app.css` — IBM Plex Mono + IBM Plex Sans Google Fonts
- 폰트 스택: `--sc-font-mono` (IBM Plex Mono + JetBrains Mono), `--sc-font-display`, `--sc-font-body`

### Desktop Shell
- `ChartBoard.svelte` — 4행 → 2행 컴팩트 헤더 (80-100px 확보)
- `TerminalCommandBar.svelte` — 2개 대형 카드 → 2개 인라인 칩

### Mobile Shell (W-0087)
- `MobileShell.svelte` — MobileSymbolStrip + ModeRouter + BottomTabBar 조립
- `TerminalShell.svelte` — MOBILE/TABLET/DESKTOP 티어 분기
- `ChartMode.svelte` — activePairStore 연동 + PhaseBadge/RangeModeToast 오버레이 + OnboardingOverlay
- `DetailMode.svelte`, `ScanMode.svelte`, `JudgeMode.svelte` — MobileEmptyState 적용
- `MobileOnboardingOverlay.svelte` — 최초 진입 가이드 (localStorage one-shot)
- `MobileEmptyState.svelte` — 재사용 빈 상태 컴포넌트

### UI Primitives
- `Icon.svelte` / `Icon.ts` — 인라인 SVG 아이콘 12종
- `Tooltip.svelte` — CSS-only 툴팁 (hover + long-press)

### Chart Layer (W-0086)
- `PhaseBadge.svelte` — Tooltip + 페이즈별 컬러 틴트
- `RangeModeToast.svelte` — 한국어 카피
- `phaseInfo.ts` — PHASE_META (5 페이즈 메타데이터 + 거래규칙)

### Personalization Skeleton (H1-gated)
- `personalization.ts` — ADAPTER_MODE, 플레이스홀더 fixture
- `AdapterDiffPanel.svelte` — 3열 버전 테이블
- `AdapterFingerprint.svelte` — 어댑터 메타 + 가중치 바
- `CompareWithBaselineToggle.svelte` — A/B 응답 토글 (잠금)
- `KillSwitchToggle.svelte` — 베이스라인 모델 전환 (H1 미완료시 잠금)

### 삭제된 파일 (deprecated stubs)
- `CollectedMetricsDock.svelte`, `StructureExplainViz.svelte`, `EvidenceStrip.svelte`
- `PatternStatusBar.svelte`, `MobileActiveBoard.svelte`, `MobileDetailSheet.svelte`

## 후속 작업
- H1 Parallel Verification Plan (`work/active/H1_PARALLEL_VERIFICATION_PLAN (1).md`) — LoRA 어댑터 리프트 게이트
- COGOCHI_REAL_PERSONALIZATION_UX.md — H1 완료 후 플레이스홀더 → 라이브 전환
- Mobile ChartMode 캔버스 미렌더링 버그 (사전 존재 이슈)
