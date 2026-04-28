---
name: W-0211 차트 리팩토링 + KPI Strip 완료
description: W-0211 native multi-pane chart + KPI strip + Pine Script engine 완료. main=87f44b0b. OI/Funding/Liq 기본 ON.
type: project
---

W-0211 완료 (PR #298 + #302, 2026-04-26). main=87f44b0b.

**완료 내용:**
- `MultiPaneChart.svelte` — 단일 createChart() 인스턴스, CVD/OI/Funding/Liq 서브패인, 크로스헤어 자동 동기화 (lightweight-charts v5.1 native multi-pane)
- `KpiStrip.svelte` + `KpiCard.svelte` — CryptoQuant 스타일 KPI 바 (스파크라인 + delta + tone)
- `PaneInfoBar.svelte` — 패인별 현재값 오버레이 (TradingView × Santiment 스타일)
- `lib/chart/kpiStrip.ts` + `paneIndicators.ts` + `paneCurrentValues.ts` — 순수 계산 레이어
- `lib/server/pine/` — Template-First Pine Script 엔진 (10개 템플릿, 자연어 → Pine v6)
- OI/Funding/Liq 기본값 ON (storage key v2로 bump, PR #302)

**버그 수정:**
- `chartSeriesService.ts` — 중복 getChartSeries export 제거 (esbuild 에러)
- `TradeMode.svelte` — narrativeDir/narrativeBias $derived 미선언 hydration 크래시 수정
- 충돌 해결: chartIndicators.ts에 `comparison` 타입 추가 (W-0210 main과 머지)

**Why:** Velo/CryptoQuant 스타일 서브패인 UX — 기존 7개 별도 IChartApi 인스턴스 → 1개로 통합, 크로스헤어 동기화 해결.

**How to apply:** 다음 차트 작업 시 `MultiPaneChart.svelte`가 단일 진입점. 패인 추가는 `mountIndicatorPane(kind, paneIndex, payload)` 패턴 사용.
