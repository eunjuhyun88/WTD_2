# W-0212 — Chart UX Polish

## Goal

crosshair 동기화 PaneInfoBar live value 표시 + 차트 UX 세부 완성.

## Owner

미할당

## Scope

- `MultiPaneChart.svelte` — crosshair 이동 시 PaneInfoBar 값 실시간 업데이트
- `PaneInfoBar.svelte` — 현재 바 값 오버레이 (OHLCV + 지표값)
- 서브패인 y축 레이블 정렬

## Non-Goals

- 신규 패인 추가
- Pine Script 엔진 확장

## Canonical Files

- `work/active/W-0212-chart-ux-polish.md`
- `app/src/components/terminal/chart/MultiPaneChart.svelte`
- `app/src/components/terminal/chart/PaneInfoBar.svelte`
