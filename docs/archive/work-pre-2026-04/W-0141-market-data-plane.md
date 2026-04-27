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
- Claude-like panel layout 을 위한 `dock / reorder / collapse / AI handoff` 레이아웃 계약 정의
- Claude-like compare shelf 를 위한 `pin / unpin / compare AI handoff` 계약 정의
- app contract scaffold 추가 (`StudySnapshot`, `WorkspaceSection`, `AIContextPack`)
- Phase 1 producer 구현: 기존 `analyze/chart/pillar fetches` 를 `CogochiWorkspaceEnvelope` 로 묶는 pure adapter 추가
- Phase 1 consumer 구현: `TradeMode` 의 sidebar summary / AI detail handoff 가 `CogochiWorkspaceEnvelope` 를 소비하도록 연결
- Phase 2 producer 구현: `workspace-bundle` 에 실데이터 기반 `verified` study 를 포함
- DEX / on-chain / volatility 지표를 `core / verified / experimental / deferred` trust tier 로 구분
- DEX 중심 Top 지표를 bottom ANALYZE 에 실제 카드로 승격

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
- `app/src/lib/contracts/cogochiPanelLayout.ts`
- `app/src/routes/api/cogochi/workspace-bundle/+server.ts`
- `app/src/lib/cogochi/workspaceDataPlane.ts`
- `app/src/lib/api/terminalBackend.ts`
- `app/src/components/terminal/workspace/ChartBoard.svelte`
- `app/src/lib/cogochi/modes/TradeMode.svelte`
- `app/src/lib/cogochi/shell.store.ts`

## Facts

1. `ChartBoard.svelte` 는 chart/feed/pane 의 단일 owner 로 정리됐지만, 그 pane state 를 하단 `ANALYZE`나 AI 가 직접 소비하는 공통 계약은 아직 없다.
2. 현재 `TradeMode.svelte` 는 `AnalyzeEnvelope`, `ChartSeriesPayload`, `indicatorValues`, `proposal`, `evidenceItems` 를 app 레벨에서 다시 조합해 하단 workspace 를 만든다.
3. `W-0137`, `W-0140` 으로 오른쪽 HUD와 하단 ANALYZE의 역할은 분리됐지만, 데이터 흐름은 여전히 `summary/detail duplicated derivation` 상태다.
4. `W-0122` 문서와 `ADR-008` 은 pane-scoped feed ownership 과 indicator registry 는 정의했지만, `workspace composition contract` 는 정의하지 않았다.
5. 현재 backend source 는 engine route, app route, provider shim 이 섞여 있어 source-of-truth 경계가 사용자에게도, 코드에도 충분히 명확하지 않다.
6. repo 안에는 이미 `/api/onchain/cryptoquant`, `/api/market/stablecoin-ssr`, `/api/market/rv-cone`, `/api/market/funding-flip`, `DexScreener` route 들이 있어 실데이터 기반 study 승격이 가능하다.
7. `DefiLlama` client 도 이미 repo 안에 있어 DEX pair-level liquidity 를 `chain TVL / total DeFi TVL` backdrop 과 함께 보여줄 수 있다.
8. 현재 하단 ANALYZE detail surface 는 고정 순서의 markup 로 렌더되고 있어, 패널 이동/도킹/비교 같은 Claude-style workspace interaction 을 지원하지 못한다.
9. 현재 `AI DETAIL` 은 단일 panel 또는 전체 analyze context 는 설명할 수 있지만, 사용자가 고른 panel subset 을 compare 대상으로 다루는 persisted shelf 는 없다.

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
- 첫 구현은 신규 backend route 를 열지 않고 app-side pure producer 로 시작한다. 다만 producer 가 backend ownership 메타를 반드시 포함해야 이후 engine producer 로 대체 가능하다.
- Phase 1.5 로 `/api/cogochi/workspace-bundle` route 를 추가해 `TradeMode` 초기 로드와 fast refresh 가 analyze/confluence/venue/liq/options 를 단일 bundle 로 받도록 한다.
- Top 지표 전체를 한 번에 노출하지 않고, `Tier 0 core → Tier 1 verified → Tier 2 experimental/deferred` 순으로 surface 를 늘린다.
- `Tier 0 core` = price/funding/OI/CVD/options/liquidity/confluence/execution.
- `Tier 1 verified` = SSR, realized volatility cone, funding flip, on-chain cycle proxy(MVRV/NUPL), DEX liquidity/volume backdrop.
- `Tier 2 experimental/deferred` = labeled exchange reserve/netflow, SOPR exact, NUPL exact, DEX fees/unique swappers, Arkham netflow/whales.
- DEX 중심 지표는 `search/symbol mapping ambiguity` 가 있으므로 trust tier 와 coverage note 를 반드시 노출한다.
- DEX 카드의 canonical 최소 메트릭은 `24H Volume / Liquidity / Volume-to-Liquidity / Avg Trade Size / Chain TVL backdrop` 으로 둔다.
- 하단 ANALYZE 는 backdrop card 에서 멈추지 않고 `DEX MARKET STRUCTURE / ON-CHAIN CYCLE DETAIL` detail surface 를 같은 payload로 렌더한다.
- Claude-like panel UX 의 첫 구현은 자유형 drag/drop 전체가 아니라 `analyze panel identity + dock zone(main/side) + persistent order + collapse` 부터 넣는다.
- compare canvas 의 0단계는 자유형 canvas 가 아니라 `persisted compare shelf` 로 둔다. 즉, 사용자가 고른 panel subset 을 고정하고 AI compare handoff 를 걸 수 있어야 한다.
- Right HUD 는 의사결정 summary 전용으로 유지하고, panel 이동의 1차 대상은 하단 ANALYZE 내부의 `main column <-> side dock` 으로 한정한다.
- 패널 이동은 `compare canvas` 의 선행 계약이며, 패널이 이동해도 데이터 source 는 동일한 `StudySnapshot` / workspace payload 를 재사용해야 한다.
- `compare shelf` 는 추가 fetch 없이 현재 tab 의 canonical workspace payload 만 재사용한다. 비용/latency 최적화의 기본 원칙이다.

## Next Steps

1. persisted compare shelf(`pin / unpin / compare AI handoff`)를 panel layout contract 옆에 추가한다.
2. 하단 ANALYZE 상단에 compare shelf 를 렌더하고, pinned panel subset 을 한 번에 AI compare 로 넘긴다.
3. Tier 2 DEX 지표(`fees / unique swappers / DEX-vs-CEX ratio`)를 source availability 기준으로 순차 승격한다.

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
