# W-0140 — Analyze Tab Consolidation

## Goal

하단 `ANALYZE` 탭을 오른쪽 sidebar summary HUD와 역할이 명확히 다르게 보이도록, `상세 workspace` 구조로 재구성한다.

## Owner

app

## Primary Change Type

Product surface change

## Scope

- `TradeMode.svelte` 의 bottom `ANALYZE` tab layout 재구성
- `summary vs detail` 정보 구조를 시각적으로 명확히 분리
- `LIVE / OPTIONS / VENUE / EVIDENCE / EXECUTION` 섹션화

## Non-Goals

- indicator 데이터/API 추가
- mobile analyze panel 재설계
- scan/judge 정보 구조 변경

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0140-analyze-tab-consolidation.md`
- `app/src/lib/cogochi/modes/TradeMode.svelte`

## Facts

- `W-0137`은 오른쪽 sidebar를 summary HUD로 줄였지만, 하단 `ANALYZE` 탭 자체의 시각 구조는 크게 바뀌지 않았다.
- 현재 하단 `ANALYZE`는 정보는 상세하지만, 사용자가 한눈에 `상세 workspace`로 인식할 만큼 section hierarchy가 강하지 않다.
- 오른쪽 sidebar와 하단 tab의 차이는 역할로만 존재하고, 레이아웃 언어로는 아직 충분히 드러나지 않는다.

## Assumptions

- 하단 `ANALYZE`에는 summary 재복제보다 sectioned detail workspace가 더 적합하다.

## Open Questions

- 없음.

## Decisions

- 하단 `ANALYZE`는 `detail workspace`로 명시한다.
- 섹션 헤더와 overview rail을 추가해 상세 패널의 역할을 명확히 드러낸다.
- execution 관련 CTA는 하단 panel에서 `SCAN`/`JUDGE`로 점프 가능하게 둔다.

## Next Steps

1. 하단 `ANALYZE` 탭에 overview rail과 sectioned workspace 구조를 추가한다.
2. CSS를 업데이트해 sidebar HUD와 다른 시각 언어를 만든다.
3. `npm run check` 후 최신 서버로 확인한다.

## Exit Criteria

- 사용자가 하단 `ANALYZE`를 오른쪽 sidebar와 다른 `상세 패널`로 인식할 수 있다.
- `LIVE / OPTIONS / VENUE / EVIDENCE / EXECUTION` 구조가 명확하다.
- `npm run check`가 0 error로 통과한다.

## Handoff Checklist

- active work item: `work/active/W-0140-analyze-tab-consolidation.md`
- branch: `codex/w-0140-analyze-tab-consolidation`
- verification: `npm run check`
- blockers: 없음
