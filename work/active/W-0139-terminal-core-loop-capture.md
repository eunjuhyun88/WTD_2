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
- 관련 app tests 및 active work item 문서 갱신

## Non-Goals

- `/lab` evaluation activation flow 전체 재설계
- engine pattern runtime/context producer 신규 구현
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

## Facts

1. 제품 문서는 `/terminal` 의 primary job 을 `inspect -> select range -> Save Setup` 으로 고정하고, 선택 구간 저장이 코어 루프의 진입 이벤트라고 명시한다.
2. 현재 데스크톱 `SaveStrip` 은 note + save 만 제공하고, phase 선택/유사 캡처 프리뷰/next-step legibility 가 mobile modal 대비 부족하다.
3. `ChartBoard.svelte` 와 `CenterPanel.svelte` 에 `SaveStrip` 이 중복 렌더링되어 있어 inline save surface ownership 이 모호하다.
4. 현재 `chartSaveMode.save()` 는 selected viewport 를 저장하지만 `reason` 을 항상 `GENERAL` 로 고정해 core-loop phase 라벨링을 데스크톱에서 회수하지 못한다.
5. similarity route 와 local ranking code 는 이미 존재하므로, 저장 전 preview 는 새 backend 없이 app wiring 으로 닫을 수 있다.

## Assumptions

1. 이번 슬라이스의 최소 성공 조건은 "데스크톱 capture-first loop closure" 이고, mobile parity 는 follow-up 으로 남겨도 된다.
2. pattern-transition context producer 가 아직 비어 있어도 manual capture + similarity preview + lab handoff 만으로 Day-1 core loop 는 닫을 수 있다.

## Open Questions

- engine pattern transition context 를 `SaveStrip` 에 언제 연결할지 별도 work item 으로 분리할지 결정 필요.
- save success 시 autorun 까지 default 로 붙일지 product rule 결정 필요.

## Decisions

- 데스크톱 코어 루프의 single capture owner 는 inline `SaveStrip` 으로 두고, 중복 렌더링은 제거한다.
- 저장 payload 생성은 shared helper 로 묶어 selected viewport, sliced indicators, phase reason, note 가 같은 규칙으로 저장되게 한다.
- 저장 직전 UI 는 phase 선택, exact range stats, similar capture preview 를 보여줘 AI research handoff 가 visible 하게 한다.
- lab deep link 는 현재 `/lab` route 가 읽는 `captureId` query param 을 canonical 로 따른다.
- branch split reason: 기존 작업트리에 W-0126/W-0138 관련 dirty changes 가 있어도 본 슬라이스는 별도 work item / branch 이름으로 격리한다.

## Next Steps

1. dev server 기준 manual browser QA 로 desktop range selection -> save -> lab handoff UX 를 확인한다.
2. pattern transition context producer 가 생기면 `SaveStrip` default phase / evidenceHash 연결을 추가한다.
3. autorun 여부를 포함한 lab handoff CTA copy 를 product 기준으로 고정한다.

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
  - `npm --prefix app run check` (`0 errors`, pre-existing warnings only)
- remaining blockers: engine-side pattern transition context producer, manual browser QA, lab autorun rule
