# W-0137 — Analyze Right-Dock Collapse

## Goal

C-only Cogochi 레이아웃에서 `02 ANALYZE`를 현재의 본문 접기/펼치기 방식이 아니라, 오른쪽으로 접히는 slim dock 방식으로 바꾼다.

## Owner

app

## Primary Change Type

Product surface change

## Scope

- `TradeMode.svelte` 의 C sidebar `02 ANALYZE` 상호작용 변경
- open 상태: 현재 full sidebar 유지
- collapsed 상태: 오른쪽 slim rail + left-pointing reopen handle
- `SCAN` / `JUDGE` 섹션은 collapsed 시 숨김
- 오른쪽 `ANALYZE`와 하단 peek `ANALYZE`의 역할을 재분리
  - 오른쪽 sidebar = chart-adjacent decision HUD / summary
  - 하단 peek analyze = detailed indicator + proposal workspace

## Non-Goals

- mobile 레이아웃 변경
- peek drawer 구조 변경
- indicator 데이터 / API 변경
- 새로운 indicator 추가

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0137-analyze-right-dock-collapse.md`
- `app/src/lib/cogochi/modes/TradeMode.svelte`

## Facts

- `W-0136`에서 C-only 레이아웃은 main에 이미 머지됐다.
- 현재 `02 ANALYZE`는 section body만 숨기는 vertical collapse다.
- 사용자 스크린샷은 full panel이 오른쪽으로 접히고, slim rail에서 다시 여는 interaction을 요구한다.
- 현재 C layout에서는 오른쪽 `ANALYZE`와 하단 `ANALYZE`가 `LIVE / OPTIONS / VENUE / evidence`를 중복 노출한다.

## Assumptions

- collapsed 상태에서는 `SCAN`/`JUDGE`도 함께 숨겨도 된다.
- 오른쪽 sidebar는 summary만 남기고, 상세 지표·heatmap·proposal은 하단 analyze로 집중하는 편이 사용성이 좋다.

## Open Questions

- 없음. collapse 방향 요구가 명확하다.

## Decisions

- 이번 change는 `W-0136` 후속 UX fix로 분리한다.
- branch split reason: 이미 merge된 `W-0136` lane과 독립 PR scope를 유지하기 위해 새 브랜치로 분리한다.
- collapsed 상태는 per-tab local UI state로 두고 persistence는 이번 범위에서 다루지 않는다.
- 정보 구조는 `persistent summary vs on-demand detail`로 나눈다.
- 오른쪽 sidebar는 `Confluence / confidence / narrative / quick intel / detail-open CTA` 중심으로 축약한다.
- 하단 analyze tab은 `LIVE / OPTIONS / VENUE / evidence / liq / proposal`의 canonical 상세 패널로 유지한다.

## Next Steps

1. C sidebar를 open/collapsed right-dock 두 상태로 나눈다.
2. 오른쪽 sidebar를 summary HUD로 축약하고 하단 analyze와의 중복을 제거한다.
3. collapsed rail UI를 스크린샷과 유사한 two-cell handle로 구성한다.
4. `npm run check`로 app compile을 확인한다.

## Exit Criteria

- `02 ANALYZE` 클릭 시 본문 hide가 아니라 sidebar 전체가 오른쪽 slim rail로 접힌다.
- slim rail에서 다시 열 수 있다.
- 오른쪽 sidebar와 하단 analyze의 중복 지표가 제거되고 역할이 분리된다.
- `npm run check`가 0 error로 통과한다.

## Handoff Checklist

- active work item: `work/active/W-0137-analyze-right-dock-collapse.md`
- branch: `codex/w-0137-analyze-right-dock-collapse`
- verification: `npm run check`
- blockers: 없음
