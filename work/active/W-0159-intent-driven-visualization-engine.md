# W-0159 — Intent-Driven Visualization Engine

## Goal

유저 질문을 그대로 데이터 뷰어에 흘려보내지 않고, `query -> intent -> template -> highlight -> chart config` 흐름으로 해석해서 질문 목적에 맞는 차트 구성을 자동 생성하는 surface-side visualization engine scaffold를 연다.

## Owner

contract

## Primary Change Type

Contract change

## Scope

- intent / template / highlight / chart-config 계약 정의
- pure planner 모듈(`intent classifier`, `template selector`, `highlight planner`, `chart config builder`) 추가
- chart-engine 기존 contract 와 충돌하지 않는 high-level config scaffold 추가
- targeted vitest 추가

## Non-Goals

- `ChartBoard.svelte` 전체 렌더러 교체
- LLM 기반 자연어 intent 모델 도입
- engine backend route 추가
- full compare/grid/execution UI shipping

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0141-market-data-plane.md`
- `work/active/W-0159-intent-driven-visualization-engine.md`
- `docs/domains/terminal-html-backend-parity.md`
- `app/src/lib/chart-engine/contracts/chartViewSpec.ts`
- `app/src/lib/chart-engine/contracts/primitives.ts`
- `app/src/lib/chart-engine/app.ts`
- `app/src/lib/chart-engine/index.ts`
- `app/src/components/terminal/workspace/ChartBoard.svelte`

## Facts

1. current terminal chart surface already uses `lightweight-charts` and has a dedicated `app/src/lib/chart-engine/*` contract/runtime layer.
2. current chart system can render price/flow blocks, but there is no canonical `query -> intent -> template -> chart config` planner contract yet.
3. `W-0141` already established that chart / analyze / AI should consume shared contracts instead of each surface recomputing its own meaning.
4. the user requirement is not “show requested fields” but “select one visualization shape that matches the user’s question”.
5. by AGENTS rule, engine remains the owner of phase/features/context truth; query-intent orchestration and chart template selection belong on the app/contract boundary.
6. current local cut adds a new high-level `intentDrivenChart` contract plus pure `classifyIntent`, `templateSelector`, `highlightPlanner`, and `chartConfigBuilder` modules under `app/src/lib/chart-engine/intent`.
7. current local cut keeps renderer migration out of scope and only exports the planner entrypoints through `chart-engine/app.ts` and `chart-engine/index.ts`.

## Assumptions

1. the first useful slice can stay heuristic and deterministic; no model-based classifier is needed yet.
2. a high-level config can sit above the current `ChartViewSpec` without forcing immediate renderer migration.

## Open Questions

- whether the first UI consumer should be terminal command flow, right-side HUD, or compare workspace.
- whether the high-level config should later compile directly into `ChartViewSpec` or remain a separate orchestration contract.

## Decisions

- keep engine truth and visualization orchestration split: engine provides pattern context, app chooses chart template/highlights.
- define six initial intents only: `why`, `state`, `compare`, `search`, `flow`, `execution`.
- enforce one template per request and one primary highlight per chart config.
- start with pure planners and tests before wiring any Svelte component.

## Next Steps

1. choose the first UI consumer for this planner: terminal command flow, right HUD, or compare workspace.
2. add a translator from `IntentDrivenChartConfig` into the existing renderer/runtime shape instead of wiring Svelte components directly.
3. keep renderer hookup and query plumbing as a follow-up lane.

## Exit Criteria

- a deterministic planner can turn a user query plus pattern context into an intent-driven chart config.
- tests cover intent classification, template selection, highlight planning, and config building.
- no existing chart renderer contract regresses.

## Handoff Checklist

- active work item: `work/active/W-0159-intent-driven-visualization-engine.md`
- branch: `codex/w-0159-intent-visualization-engine`
- baseline branch: `codex/w-0157-similar-live-feature-ranking`
- baseline commit: `a3a8f2c0`
- verification:
  - `npm --prefix app run prepare`
  - `npm --prefix app run test -- src/lib/chart-engine/intent/visualizationPlanner.test.ts`
  - `npm --prefix app run check`
- remaining blockers: renderer hookup, terminal query plumbing, and engine-backed pattern-context adapter remain future slices
