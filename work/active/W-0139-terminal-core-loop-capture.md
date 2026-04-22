# W-0139 — Terminal Core Loop Capture Closure

## Goal

최신 `origin/main` 기준으로 `/terminal` 의 Day-1 core loop entry
`review -> select range -> Save Setup` 을 CTO / AI research 기준에 맞게 정렬한다.

구체적으로는:

- 데스크톱 capture surface 를 single owner 로 정리
- selected range + indicator slice + phase + note 가 같은 규칙으로 저장되게 만들고
- Save Setup write path 의 duplicate engine write 를 제거해 성능/정합성을 맞춘다

## Owner

app

## Primary Change Type

Product surface change

## Scope

- 데스크톱 `/terminal` range selection save flow
- `SaveStrip` single-owner 정리
- selected viewport 기반 payload / similarity draft helper
- `/api/terminal/pattern-captures` write path 중복 제거
- focused app tests / work item 갱신

## Non-Goals

- `/lab` 전체 evaluation UX 재설계
- engine pattern transition producer 신규 구현
- mobile `SaveSetupModal` 전면 재작성
- pattern discovery / related coin search 신규 backend 설계

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0139-terminal-core-loop-capture.md`
- `docs/product/core-loop.md`
- `docs/product/pages/02-terminal.md`
- `docs/product/core-loop-agent-execution-blueprint.md`
- `app/src/components/terminal/workspace/SaveStrip.svelte`
- `app/src/components/terminal/workspace/ChartBoard.svelte`
- `app/src/components/terminal/peek/CenterPanel.svelte`
- `app/src/lib/terminal/rangeSelectionCapture.ts`
- `app/src/lib/stores/chartSaveMode.ts`
- `app/src/routes/api/terminal/pattern-captures/+server.ts`

## Facts

1. Day-1 product spec 는 `/terminal` 의 primary job 을 `inspect -> select range -> Save Setup` 으로 고정한다.
2. 최신 `main` 기준 데스크톱 `SaveStrip` 은 단순 note/save strip 이고, `CenterPanel` 과 `ChartBoard` 에 중복 렌더링되어 capture owner 가 모호하다.
3. 최신 `main` 기준 `chartSaveMode.save()` 는 selected viewport 를 저장하지만 `reason` 을 `GENERAL` 로 고정해 phase 라벨링을 회수하지 못한다.
4. 최신 `main` 기준 `app/src/lib/server/terminalPersistence.ts` 의 `createPatternCapture()` 는 이미 engine canonical capture write 를 선행 수행한다.
5. 그런데 `/api/terminal/pattern-captures/+server.ts` 는 같은 요청에서 `engineFetch('/captures')` 를 fire-and-forget 으로 한 번 더 호출해 duplicate engine write 를 만든다.

## Assumptions

1. 이번 슬라이스의 최소 성공 조건은 "데스크톱 capture-first loop closure + duplicate write removal" 이다.
2. related-coin discovery 와 capture projection 은 후속 contract/research work item 으로 분리하는 편이 현재 mainline velocity 에 맞다.

## Open Questions

- save success 시 `/lab` autorun 을 default 로 붙일지 product rule 결정 필요.
- pattern transition context producer 가 들어오면 `SaveStrip` default phase/evidenceHash 를 어디서 주입할지 follow-up 필요.

## Decisions

- 데스크톱 코어 루프의 single capture owner 는 inline `SaveStrip` 으로 둔다.
- selected viewport / payload / similarity draft 생성은 helper 로 공통화한다.
- save 직전 UI 는 phase 선택, exact range stats, similar capture preview 를 포함해 AI research handoff 를 visible 하게 만든다.
- Save Setup engine write authority 는 `createPatternCapture()` 하나만 갖고, route-level fire-and-forget duplicate write 는 제거한다.
- 최신 `origin/main` 기준 clean worktree/branch 에서만 W-0139 patch 를 재구성한다.

## Next Steps

1. authenticated browser session 에서 desktop range selection -> save -> lab handoff manual QA 를 확인한다.
2. save success 시 autorun default 여부를 product rule 로 고정한다.
3. pattern transition context producer 가 생기면 `SaveStrip` default phase / evidenceHash 연결을 추가한다.

## Exit Criteria

- 데스크톱 `/terminal` 에서 선택 구간이 없으면 save 가 비활성 또는 명시적 오류 상태를 보인다.
- 선택 구간 저장 시 viewport candles + indicator slices + selected phase + note 가 canonical capture payload 로 기록된다.
- save surface 는 한 곳에서만 렌더링되고, similar capture preview 와 lab handoff 가 보인다.
- Save Setup 요청당 engine write 는 한 번만 일어난다.
- 관련 app tests/check 가 통과한다.

## Handoff Checklist

- active work item: `work/active/W-0139-terminal-core-loop-capture.md`
- branch: `codex/w-0139-terminal-core-loop-capture-mainline`
- verification:
  - `npm --prefix app run test -- src/lib/terminal/rangeSelectionCapture.test.ts`
  - `npm --prefix app run test -- src/routes/api/terminal/pattern-captures/pattern-captures.test.ts`
  - `npm --prefix app run check` (`0 errors`, pre-existing warnings only)
  - `npm run dev -- --host 127.0.0.1 --port 4174` + `curl -I /` = `200`, `curl -I /terminal` = `303 /?auth=required`
- remaining blockers: authenticated manual browser QA, autorun rule, pattern transition context producer
