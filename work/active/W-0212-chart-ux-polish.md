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

## Facts

- W-0211 (PR #308) 머지로 multi-pane chart + KPI strip 도입 완료.
- crosshair는 lightweight-charts 네이티브 지원이지만 PaneInfoBar 연동 미구현.
- PaneInfoBar는 정적 OHLCV만 표시 (crosshair 위치 추적 X).

## Assumptions

- lightweight-charts crosshair event subscription으로 PaneInfoBar 업데이트 가능.
- 서브패인 y축 레이블은 chart options로 정렬 가능.
- 신규 의존성 없이 기존 `MultiPaneChart.svelte` 내부 수정만으로 해결.

## Open Questions

- crosshair 동기화 시 성능 영향 (60fps 유지 가능?)
- 이전 바와 현재 바 값 동시 표시 필요 여부?

## Decisions

- (pending) crosshair subscription 패턴 (signal vs callback).

## Next Steps

1. `MultiPaneChart.svelte`에 `chart.subscribeCrosshairMove()` 추가
2. 이동된 위치의 bar data를 PaneInfoBar로 props 전달
3. 서브패인 y축 레이블 right alignment
4. 60fps 성능 확인

## Exit Criteria

- [ ] crosshair 이동 시 PaneInfoBar 실시간 업데이트
- [ ] 서브패인 y축 레이블 정렬
- [ ] 성능 회귀 없음 (60fps 유지)
- [ ] App CI ✓

## Handoff Checklist

- [ ] W-0213 (Phase 3-4) 머지 대기 중이면 wait
- [ ] `./tools/claim.sh "app/src/components/terminal/chart/"`
- [ ] `feat/w-0212-chart-ux-polish` 브랜치 생성
