# W-0131 — Tablet PeekDrawer (768–1023px)

## Goal

768–1023px 뷰포트에서 차트 capture annotation 클릭 시 `CenterPanel` 의 `PeekDrawer` review slot 안에서 `CaptureReviewDrawer` 를 inline 형태로 연다.

## Owner

app

## Scope

- `app/src/components/terminal/peek/CenterPanel.svelte`
- `app/src/components/terminal/peek/PeekDrawer.svelte`
- `app/src/components/terminal/workspace/ChartBoard.svelte`
- `app/src/components/terminal/chart/CaptureReviewDrawer.svelte`
- `app/src/components/terminal/chart/CaptureAnnotationLayer.svelte`
- `app/src/lib/stores/captureAnnotationsStore.ts`

## Non-Goals

- desktop(≥1024px) side drawer UX 재설계
- mobile(<768px) bottom sheet UX 재설계
- capture verdict logic 변경

## Canonical Files

- `work/active/CURRENT.md`
- `work/active/W-0131-tablet-peek-drawer.md`
- `app/src/components/terminal/peek/CenterPanel.svelte`
- `app/src/components/terminal/peek/PeekDrawer.svelte`
- `app/src/components/terminal/workspace/ChartBoard.svelte`
- `app/src/components/terminal/chart/CaptureReviewDrawer.svelte`
- `app/src/components/terminal/chart/CaptureAnnotationLayer.svelte`
- `app/src/lib/stores/captureAnnotationsStore.ts`

## Facts

- `fix/binance-conflict-markers` 브랜치의 고유 기능 커밋 `9467fab7` 이 tablet review slot 구현을 담고 있다.
- `origin/main` 에는 이 기능이 아직 없고, 대신 unrelated dirty 변경이 많은 브랜치에서만 존재한다.
- `binanceConnector.ts` conflict-marker 정리는 `origin/main` 기준 이미 해결되어 있고 이번 work item 범위와 무관하다.
- safest path 는 `main` 기반 clean branch 에서 `9467fab7` 만 cherry-pick 하는 것이다.
- `codex/w-0131-tablet-peek-drawer` clean worktree 에서 `9467fab7` cherry-pick 이 충돌 없이 적용됐다.
- `npm run check` 결과는 `0 errors / 101 warnings` 로, W-0131 범위에서 신규 오류는 없다.
- W-0131 전용 dev smoke 에서 `CaptureAnnotationLayer.svelte` 의 unsubscribe 초기화 순서와 `ChartBoard.svelte` 의 marker API 사용이 런타임 에러를 발생시켰다.
- anonymous dev 환경에서는 `/api/captures/chart-annotations` 가 route-level auth 를 요구하므로 실제 annotation 클릭 smoke 는 세션 없이는 불가능하다.
- 2026-04-22 dev smoke 에서 두 런타임 blocker 를 수정한 뒤 `desktop / tablet / mobile` shell 렌더는 모두 정상으로 복구됐다.
- click-path smoke 는 browser route interception 으로 `/api/captures/chart-annotations` 만 대체해 검증했고, tablet inline slot / mobile review sheet / desktop review open 모두 확인했다.

## Assumptions

- cherry-pick 충돌이 나더라도 W-0131 범위 4파일 안에서 해결 가능하다.

## Open Questions

- none

## Decisions

- dirty branch 에서 직접 rebase 하지 않는다.
- `codex/w-0131-tablet-peek-drawer` 를 유일한 execution branch 로 사용한다.
- `binanceConnector.ts` 는 `main` 버전을 authority 로 간주하고 이번 lane 에서 건드리지 않는다.
- W-0131 완료 기준의 선행 조건은 tablet slot 자체보다 먼저 chart/capture runtime blockers 제거다.
- auth-protected capture feed 는 product contract 를 바꾸지 않고, verification 단계에서만 route interception 으로 click-path 를 재현한다.

## Next Steps

1. work item / CURRENT 상태를 verification 결과로 갱신한다.
2. W-0131 변경만 커밋하고 push 상태를 정리한다.
3. PR 생성 후 merge-ready 범위로 넘긴다.

## Exit Criteria

- [x] 768–1023px 에서 annotation 클릭 시 PeekDrawer review slot 이 열린다.
- [x] ≥1024px 기존 side drawer regression 이 없다.
- [x] <768px 기존 bottom sheet regression 이 없다.
- [x] `npm run check` 또는 동등한 scoped validation 을 통과한다.

## Handoff Checklist

- active work item: `work/active/W-0131-tablet-peek-drawer.md`
- branch: `codex/w-0131-tablet-peek-drawer`
- source commit: `9467fab7`
- excluded unrelated fix: `binanceConnector.ts`
- current verification: runtime blocker fix + desktop/tablet/mobile smoke complete, PR creation pending
