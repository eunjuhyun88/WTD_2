# W-0148 — CTO Data Engine Reset

## Goal

현재 `app`/`engine`/local state/fallback storage 에 흩어진 시장 데이터, 패턴 상태, 연구 코퍼스 경계를 다시 정의하고, `engine` 중심의 canonical data engine 으로 수렴시키는 실행 가능한 reset plan 과 첫 refactor slice 를 실제 코드에 반영한다.

## Owner

engine

## Primary Change Type

Engine logic change

## Scope

- 현재 데이터 수집/정규화/저장/서빙 경로 inventory 작성
- 문서상 target plane 과 실제 코드 간 불일치 정리
- merge / split / park 기준을 CTO queue 로 재정렬
- target architecture 문서화
- 첫 bounded fact-plane refactor slice 구현

## Non-Goals

- 이번 슬라이스에서 모든 legacy app market route 를 제거
- 모든 local SQLite / JSON / CSV store 를 shared Postgres 로 즉시 이전
- 모든 parked branch 를 한 번에 머지 완료

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0148-cto-data-engine-reset.md`
- `work/active/W-0146-lane-cleanup-and-merge-governance.md`
- `work/active/W-0141-market-data-plane.md`
- `work/active/W-0122-free-indicator-stack.md`
- `work/active/W-0145-operational-seed-search-corpus.md`
- `docs/decisions/0003-infra-chart-architecture-2026-04-21.md`
- `engine/api/main.py`
- `engine/api/routes/ctx.py`
- `engine/scanner/scheduler.py`
- `engine/data_cache/loader.py`
- `engine/capture/store.py`
- `engine/patterns/state_store.py`
- `engine/research/state_store.py`
- `app/src/lib/server/marketSnapshotService.ts`
- `app/src/lib/server/marketDataService.ts`
- `app/src/lib/server/marketFeedService.ts`
- `app/src/routes/api/market`

## Facts

1. 실제 checkout 기준으로 market fact assembly 는 여전히 `app/src/routes/api/market/*` + `marketSnapshotService.ts` 가 많이 소유하고 있고, 이는 `engine is the only backend truth` 와 충돌한다.
2. `engine`의 durable state 는 capture/runtime/research/ledger 가 각각 SQLite, JSON/file, Supabase mirror, CSV cache 로 나뉘어 있어 운영 truth 가 분산돼 있다.
3. `CURRENT.md` 와 active work item 문서는 fact/search/surface plane 을 정의하지만, `seed_search`, `market_corpus`, `reference-stack`, `chain-intel` 등 일부 lane 은 현재 checkout 에서 파일/route 가 비어 있거나 다른 형태다.
4. `worker-control` / scheduler 는 이미 존재하지만, 현재 job set 은 scan/alert/outcome 중심이며 always-on corpus accumulation 과 normalized fact refresh 중심으로 재편되지 않았다.
5. local branch landscape 에는 clean lane 과 parking lane 이 공존하고 있어, merge 는 기능보다 plane purity 기준으로 다시 분류해야 한다.
6. first refactor slice now exists as `docs/decisions/0004-cto-data-engine-reset-2026-04-23.md` plus engine `GET /ctx/fact`, which opens an engine-owned bounded fact landing zone without widening app fan-out further.

## Assumptions

1. 첫 refactor slice 는 전체 이전이 아니라 canonical boundary 를 코드로 여는 bounded engine read model 부터 시작한다.
2. app surface 는 당분간 legacy route 를 유지하더라도, 새 소비 경로는 engine-owned read model 로 수렴해야 한다.

## Open Questions

- `W-0122` 문서상 fact-plane files 중 현재 checkout 에 없는 lane 은 다른 clean branch 에서 extraction 할지, 현재 branch 에서 재구현할지 결정이 필요하다.
- shared Postgres canonical schema 를 `Supabase` 단일 plane 으로 고정할지, app DB 와 engine DB 를 장기적으로 분리할지 최종 결정이 필요하다.

## Decisions

- 이번 lane 은 기존 `W-0141` UI/workspace data plane 보다 상위의 CTO reset lane 으로 다룬다.
- merge / split / park 판단은 branch 이름이 아니라 `fact`, `search`, `surface`, `docs-only` plane purity 로 내린다.
- canonical target 은 `engine-owned fact plane + search plane + runtime state`, `app-owned surface plane` 이다.
- 첫 code slice 는 app-side raw provider fan-out 을 당장 다 없애는 대신, engine 에 bounded fact-context route 를 열어 이후 migration 의 landing zone 을 만든다.
- `codex/parking-20260423-mixed-lanes` 에 있는 `W-0142`, `W-0143`, `W-0144` commits 는 direct merge 금지이며 clean main-based extraction 대상이다.

## Next Steps

1. `W-0122` 후속에서 app market read paths 를 `GET /ctx/fact` 또는 후속 engine fact read models 로 수렴시킨다.
2. `W-0145` 를 clean branch 로 extraction 해 scheduler-driven corpus accumulation 을 shared search plane 으로 올린다.
3. engine local SQLite/file state 의 shared-state migration order를 별도 storage cutover lane 으로 연다.

## Exit Criteria

- current-state vs target-state architecture 가 문서로 명확히 정리된다.
- merge / split / defer queue 가 branch/action 수준으로 정리된다.
- engine 에 app migration 이 가능한 첫 bounded fact read model 이 실제로 존재한다.
- scoped verification 이 통과한다.

## Handoff Checklist

- active work item: `work/active/W-0148-cto-data-engine-reset.md`
- branch: `codex/w-0148-data-engine-reset`
- verification:
  - `uv run --directory engine python -m pytest tests/test_ctx_fact_route.py -q`
  - `uv run --directory engine python -m pytest tests/test_engine_runtime_roles.py -q`
- remaining blockers: shared-state migrations, legacy app market route cutover, and search-plane corpus implementation remain follow-up slices
