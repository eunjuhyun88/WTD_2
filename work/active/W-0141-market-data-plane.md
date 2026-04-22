# W-0141 — Cogochi Market Data Plane

## Goal

`ChartBoard`, 하단 `ANALYZE`, 오른쪽 HUD, AI panel 이 각각 따로 가공한 데이터를 쓰는 현재 구조를 중단하고,
**수집 → 정규화 → study snapshot → workspace composition → AI interpretation** 까지를 하나의 계약으로 재정의한다.

## Owner

contract

## Primary Change Type

Contract change

## Scope

- Cogochi/Terminal 의 시장 데이터 흐름을 end-to-end 로 문서화
- backend ingress source, freshness, ownership, fallback 규칙 정의
- `ChartBoard -> StudySnapshot[] -> Bottom Workspace / AI` 공통 계약 정의
- compare canvas 전환을 위한 `pin / detach / compare` 데이터 모델 정의
- app contract scaffold 추가 (`StudySnapshot`, `WorkspaceSection`, `AIContextPack`)

## Non-Goals

- Arkham / Deribit WS 실데이터 ingestion 자체 구현
- compare canvas UI 전체 구현
- W-0139 capture flow 재작성
- 기존 app pane 렌더러 전면 교체

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0141-market-data-plane.md`
- `docs/decisions/ADR-008-chartboard-single-ws-ownership.md`
- `docs/domains/indicator-registry.md`
- `docs/domains/cogochi-market-data-plane.md`
- `app/src/lib/contracts/terminalBackend.ts`
- `app/src/lib/contracts/cogochiDataPlane.ts`
- `app/src/lib/api/terminalBackend.ts`
- `app/src/components/terminal/workspace/ChartBoard.svelte`
- `app/src/lib/cogochi/modes/TradeMode.svelte`

## Facts

1. `ChartBoard.svelte` 는 chart/feed/pane 의 단일 owner 로 정리됐지만, 그 pane state 를 하단 `ANALYZE`나 AI 가 직접 소비하는 공통 계약은 아직 없다.
2. 현재 `TradeMode.svelte` 는 `AnalyzeEnvelope`, `ChartSeriesPayload`, `indicatorValues`, `proposal`, `evidenceItems` 를 app 레벨에서 다시 조합해 하단 workspace 를 만든다.
3. `W-0137`, `W-0140` 으로 오른쪽 HUD와 하단 ANALYZE의 역할은 분리됐지만, 데이터 흐름은 여전히 `summary/detail duplicated derivation` 상태다.
4. `W-0122` 문서와 `ADR-008` 은 pane-scoped feed ownership 과 indicator registry 는 정의했지만, `workspace composition contract` 는 정의하지 않았다.
5. 현재 backend source 는 engine route, app route, provider shim 이 섞여 있어 source-of-truth 경계가 사용자에게도, 코드에도 충분히 명확하지 않다.

## Assumptions

1. 단기적으로 app route proxy 는 유지되더라도, canonical market truth 는 engine/provider normalization 결과로 수렴해야 한다.
2. compare canvas 는 한 번에 완성하지 않고, 우선 `StudySnapshot[]` 계약과 pin model 을 도입한 뒤 UI 를 단계적으로 바꾼다.

## Open Questions

1. 일부 public market source 를 계속 app proxy 에 둘지, 전부 engine ingress 로 이동시킬지는 비용/latency 실측 후 결정한다.
2. `StudySnapshot.payload` 를 fully typed family-specific union 으로 갈지, 공통 header + typed payload map 구조로 갈지는 phase 2 에서 좁힌다.

## Decisions

- Chart-first 터미널 기준으로 고정 입력은 오른쪽 AI panel 에 둔다.
- 데이터는 한 surface 에 몰지 않고 `Summary HUD / Detail Workspace / AI Interpreter` 3 view 로 나눈다.
- chart 와 analyze 는 서로 다른 값을 다시 계산하면 안 되고, 같은 `StudySnapshot` 을 다른 surface 에서 재사용해야 한다.
- `ChartBoard` 는 live series owner 이고, `TradeMode` 는 study/workspace composition owner 여야 한다.
- compare 는 탭 전환이 아니라 `pin / detach / compare` 모델로 간다.

## Next Steps

1. `W-0141` 도메인 문서에 ingress/source/contract/layout 배치 원칙을 기록한다.
2. `StudySnapshot / WorkspaceSection / AIContextPack` 타입 초안을 추가한다.
3. 이후 lane 에서 `fetchTerminalBundle` 또는 신규 workspace bundle 이 이 계약을 반환하도록 producer scope 를 연다.

## Exit Criteria

- 수집 source, freshness, fallback, owner 가 문서로 정리된다.
- chart / bottom analyze / AI 가 공유할 canonical contract 가 문서와 타입 양쪽에 존재한다.
- compare canvas 전환 전 필요한 pin/detach/selection 모델이 정의된다.
- 후속 구현 lane 이 이 문서만 읽고도 producer/consumer 를 이어서 작업할 수 있다.

## Handoff Checklist

- active work item: `work/active/W-0141-market-data-plane.md`
- branch: `codex/w-0141-market-data-plane`
- verification:
  - `npm --prefix app run check`
- blockers:
  - source ownership (app proxy vs engine ingress) 최종 수렴 필요
