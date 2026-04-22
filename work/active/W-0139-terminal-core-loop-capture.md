# W-0139 — Terminal Core Loop Capture Closure

## Goal

`/terminal` 에서 Day-1 코어 루프의 canonical entry인 `review -> select range -> Save Setup` 이 데스크톱 기준으로 실제 작동하게 만들고, 저장 직전/직후의 research handoff 가 사용자에게 보이도록 정렬한다.

## Owner

app

## Primary Change Type

Product surface change

## Scope

- 데스크톱 `/terminal` range selection save path 정렬
- `SaveStrip` 을 single inline capture surface 로 정리
- range-selected viewport 기반 payload / similar preview helper 도입
- Save Setup -> engine capture flywheel 연결 감사 및 중복 write 정리
- 관련 app tests 및 active work item 문서 갱신

## Non-Goals

- `/lab` evaluation activation flow 전체 재설계
- engine pattern runtime/context producer 신규 구현 및 user pattern DSL 확정
- mobile `SaveSetupModal` 전면 재작성

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
- `app/src/lib/stores/chartSaveMode.ts`
- `app/src/lib/contracts/terminalPersistence.ts`
- `app/src/routes/api/terminal/pattern-captures/+server.ts`
- `engine/api/routes/captures.py`
- `engine/api/routes/patterns.py`
- `engine/patterns/scanner.py`
- `engine/api/routes/challenge.py`

## Facts

1. 제품 문서는 `/terminal` 의 primary job 을 `inspect -> select range -> Save Setup` 으로 고정하고, 선택 구간 저장이 코어 루프의 진입 이벤트라고 명시한다.
2. 데스크톱 `SaveStrip` 은 single inline capture surface 로 정리되었고, selected viewport + indicator slice + phase reason + note 를 저장 payload 로 만든다.
3. engine 에는 canonical `/captures`, `CaptureStore`, outcome resolver, pattern state scanner, pattern registry, challenge similarity scan 이 이미 존재한다.
4. 감사 결과 `/api/terminal/pattern-captures` route 와 `createPatternCapture()` 가 모두 `/captures` 에 쓰는 중복 engine write 경로가 있었다.
5. 아직 닫히지 않은 핵심 gap 은 capture -> challenge/pattern projection -> related-symbol discovery -> watch activation 의 canonical contract 이다.

## Assumptions

1. 이번 슬라이스의 최소 성공 조건은 "데스크톱 capture-first loop closure" 이고, mobile parity 는 follow-up 으로 남겨도 된다.
2. engine projection/discovery 는 별도 engine/contract work item 으로 분리하고, 이번 브랜치는 Save Setup write path 를 안정화하는 선에서 멈춘다.

## Open Questions

- capture 를 challenge/pattern draft 로 투영하는 canonical endpoint 를 `/challenge/create` 재사용으로 둘지, `/lab/challenges/project` 로 새로 둘지 결정 필요.
- related coin discovery 를 challenge vector scan 으로 먼저 닫을지, PatternObject phase scanner 로 바로 정규화할지 결정 필요.
- save success 시 autorun 까지 default 로 붙일지 product rule 결정 필요.

## Decisions

- 데스크톱 코어 루프의 single capture owner 는 inline `SaveStrip` 으로 두고, 중복 렌더링은 제거한다.
- 저장 payload 생성은 shared helper 로 묶어 selected viewport, sliced indicators, phase reason, note 가 같은 규칙으로 저장되게 한다.
- 저장 직전 UI 는 phase 선택, exact range stats, similar capture preview 를 보여줘 AI research handoff 가 visible 하게 한다.
- lab deep link 는 현재 `/lab` route 가 읽는 `captureId` query param 을 canonical 로 따른다.
- Save Setup 의 engine write 는 `createPatternCapture()` 에서만 수행하고, route-level fire-and-forget `/captures` 중복 write 는 제거한다.
- branch split reason: 기존 작업트리에 W-0126/W-0138 관련 dirty changes 가 있어도 본 슬라이스는 별도 work item / branch 이름으로 격리한다.

## Next Steps

1. backend audit 결과를 바탕으로 capture -> challenge/pattern projection 의 contract work item 을 분리한다.
2. dev server 기준 manual browser QA 로 desktop range selection -> save -> lab handoff UX 를 확인한다.
3. pattern transition context producer 가 생기면 `SaveStrip` default phase / evidenceHash 연결을 추가한다.

## Exit Criteria

- 데스크톱 `/terminal` 에서 선택 구간이 없으면 save 가 비활성 또는 명시적 오류 상태를 보인다.
- 선택 구간 저장 시 viewport candles + indicator slices + selected phase + note 가 canonical capture payload 로 기록된다.
- save surface 는 한 곳에서만 렌더링되며, similar capture preview 와 lab handoff 가 보인다.
- 관련 app tests/check 가 통과한다.

## Handoff Checklist

- active work item: `work/active/W-0139-terminal-core-loop-capture.md`
- branch: `codex/w-0139-terminal-core-loop-capture`
- verification:
  - `npm --prefix app run test -- src/lib/terminal/rangeSelectionCapture.test.ts`
  - `npm --prefix app run test -- src/routes/api/terminal/pattern-captures/pattern-captures.test.ts`
  - `npm --prefix app run check` (`0 errors`, pre-existing warnings only)
- remaining blockers: engine-side pattern transition context producer, manual browser QA, lab autorun rule
