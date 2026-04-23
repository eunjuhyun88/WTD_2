# W-0142 — Manual Hypothesis Research Context Contract

## Goal

`manual_hypothesis` capture 가 텔레그램 복기, 차트 이미지, phase annotation, benchmark-pack seed 정보를 구조적으로 담을 수 있게 `engine` canonical capture contract 와 `app` request/response schema 를 확장한다.

## Owner

contract

## Primary Change Type

Contract change

## Scope

- engine `CaptureRecord` / `/captures` / `/captures/bulk_import` 에 `research_context` JSON field 추가
- app `PatternCapture*` Zod schema 에 founder research context shape 추가
- app → engine bridge 가 `research_context` 를 전달하도록 정렬
- targeted engine/app schema tests 추가

## Non-Goals

- founder note 를 benchmark pack 으로 자동 변환하는 search pipeline 구현
- `manual_hypothesis` 전용 UI 작성
- pattern search scoring / variant generation 로직 변경

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0142-manual-hypothesis-research-context.md`
- `engine/capture/types.py`
- `engine/capture/store.py`
- `engine/api/routes/captures.py`
- `engine/tests/test_capture_routes.py`
- `app/src/lib/contracts/terminalPersistence.ts`
- `app/src/lib/contracts/terminalPersistence.test.ts`
- `app/src/lib/server/terminalPersistence.ts`

## Facts

1. engine canonical capture store 는 이제 `research_context` JSON field 를 top-level 로 저장하고 route / bulk import 에서 optional nested schema 검증을 수행한다.
2. app `PatternCaptureCreateRequestSchema` / `PatternCaptureRecordSchema` 는 `researchContext` 를 파싱하고 engine snake_case payload 로 번역한다.
3. `manual_hypothesis` 는 기존처럼 `pending_outcome` 상태로 resolver pipeline 에 들어가며, 이번 slice 는 그 lifecycle 을 바꾸지 않는다.
4. app capture 조회는 engine read-through 를 우선 사용하므로, engine canonical field 가 추가되면 browser-facing list path 에서도 즉시 노출된다.

## Assumptions

1. 이번 슬라이스에서는 `research_context` 를 optional JSON contract 로 추가하는 것만으로 충분하다.
2. app DB fallback path 는 이번 단계에서 `research_context` 를 영구 저장하지 않아도 된다. engine canonical storage 가 truth 이다.

## Open Questions

- founder note 를 benchmark pack 으로 자동 생성할 때 어떤 negative / near-miss 탐색 규칙을 기본값으로 둘지 추후 결정 필요.

## Decisions

- `research_context` 는 `chart_context` 내부에 중첩하지 않고 `CaptureRecord` top-level field 로 추가한다.
- engine route 검증은 최소 shape validation 만 수행하고, 패턴별 semantic validation 은 후속 research lane 으로 남긴다.
- app DB fallback path 는 migration 없이 유지하고, `researchContext` 는 engine canonical store 와 immediate POST response 에서만 보장한다.
- branch reuse: 현재 세션은 `codex/w-0139-terminal-core-loop-capture` 위에서 진행 중이므로 이번 contract-only slice 는 branch split 없이 같은 작업 브랜치에서 처리한다.

## Next Steps

1. app DB fallback path 에도 `researchContext` 를 저장할지 migration 비용과 함께 결정한다.
2. pattern search variants 에 `15m accumulation`, `second dump`, `oi re-expansion breakout` 축을 연결한다.
3. app surface 에 seed-search submission flow 를 연결한다.

## Exit Criteria

- `POST /captures` 와 `POST /captures/bulk_import` 가 optional `research_context` payload 를 받아 저장한다.
- app `PatternCaptureCreateRequestSchema` / `PatternCaptureRecordSchema` 가 `researchContext` 를 파싱한다.
- engine/app targeted tests 가 통과한다.

## Handoff Checklist

- active work item: `work/active/W-0142-manual-hypothesis-research-context.md`
- branch: `codex/w-0139-terminal-core-loop-capture`
- verification:
  - `uv run pytest engine/tests/test_capture_routes.py -q`
  - `npm --prefix app run test -- src/lib/contracts/terminalPersistence.test.ts`
- remaining blockers: benchmark-pack auto generation and research UI are out of scope for this slice
