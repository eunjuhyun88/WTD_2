# W-0125 — Engine Perf Hotpath Measurement

## Goal

현재 엔진/앱 경계에서 가장 느린 endpoint 후보를 좁히고, 최소 계측 포인트와 1순위 병목 패치 순서를 고정한다.

## Scope

- `app/src/routes/api/patterns/stats/+server.ts`
- `app/src/routes/api/patterns/[slug]/stats/+server.ts`
- `app/src/routes/api/refinement/*`
- `engine/api/routes/patterns.py`
- `engine/api/routes/patterns_thread.py`
- `engine/api/routes/refinement.py`
- `engine/ledger/store.py`
- `app/src/lib/server/scanEngine.ts`

## Non-Goals

- 전체 tracing stack 도입
- load test 스크립트 재작성
- `scanEngine.ts` 대규모 분해 리팩토링

## Canonical Files

- `work/active/W-0125-engine-perf-hotpath-measurement.md`
- `app/src/routes/api/patterns/stats/+server.ts`
- `engine/api/routes/patterns_thread.py`
- `engine/ledger/store.py`
- `engine/api/routes/refinement.py`
- `app/src/lib/server/scanEngine.ts`

## Facts

1. 앱 bulk stats route는 `/patterns/library`를 읽은 뒤 slug별 `/patterns/{slug}/stats`를 병렬 fan-out한다.
2. `get_stats_sync()`는 slug 하나에 대해 `compute_stats()`, `list_all()`, `compute_family_stats()`, `LEDGER_RECORD_STORE.list(... limit=1)`를 조합 호출한다.
3. `LedgerStore.list_all()`과 `LedgerRecordStore.list()`는 디렉터리의 `*.json`을 매번 다시 읽는다.
4. refinement routes도 패턴 전체에 대해 `compute_stats()`를 반복 호출한다.
5. `scanEngine.ts`는 단일 scan 요청에서 core 2개 + 외부 15개 upstream read를 fan-out한다.

## Assumptions

1. 현재 가장 느린 사용자-facing endpoint 후보는 `/api/patterns/stats`다.
2. 가장 큰 구조 병목은 file-backed ledger stats 재계산이다.

## Open Questions

1. 실제 운영 p95 기준으로 `/api/patterns/stats`와 `/api/refinement/leaderboard` 중 어느 쪽이 더 느린가?
2. `scanEngine` fan-out latency가 stats path보다 사용자 체감에 더 큰가?

## Decisions

- 첫 계측 대상은 stats/refinement family와 scan family 두 축으로 제한한다.
- 1순위 패치는 new storage migration이 아니라 `stats summary reuse + repeated scans 제거`다.
- dirty worktree 충돌 위험 때문에 우선은 measurement plan만 고정하고, 실제 코드 패치는 별도 슬라이스로 진행한다.
- 완료: app bulk stats route는 `/patterns/stats/all`로 전환해 app-side N+1 fan-out을 제거했다.
- 완료: `patterns_thread.get_stats_sync()`는 record family/latest record 조회를 단일 `LEDGER_RECORD_STORE.list(slug)` scan으로 통합했다.
- 완료: refinement endpoints는 30초 TTL snapshot을 공유해 `/stats`, `/leaderboard`, `/suggestions`, `/stats/{slug}` 간 중복 `compute_stats()`를 제거했다.

## Measurement Points

1. App ingress
   - `GET /api/patterns/stats`
   - `GET /api/patterns/[slug]/stats`
   - `GET /api/refinement/stats`
   - `GET /api/refinement/leaderboard`
   - `GET /api/refinement/suggestions`
2. Engine route layer
   - `GET /patterns/stats/all`
   - `GET /patterns/{slug}/stats`
   - `GET /refinement/stats`
   - `GET /refinement/leaderboard`
   - `GET /refinement/suggestions`
3. Engine internals
   - `patterns_thread.get_all_stats_sync`
   - `patterns_thread.get_stats_sync`
   - `LedgerStore.list_all`
   - `LedgerStore.compute_stats`
   - `LedgerRecordStore.list`
   - `LedgerRecordStore.compute_family_stats`
4. Scan hot path
   - `_runServerScanInternal` total duration
   - Phase 1 core data (`readRaw` klines + ticker)
   - Phase 2 external fan-out block (15 upstream sources)
   - per-source slowest 3 upstreams

## Patch Order

1. Patch A — stats path measurement
   - route-level timers for app and engine stats/refinement endpoints
   - internal timers around `list_all`, `compute_stats`, `record list`
2. Patch B — biggest bottleneck removal
   - make bulk callers reuse a single per-slug stats materialization instead of recomputing `list_all()` and record scans
   - prefer `/patterns/stats/all` bulk endpoint everywhere instead of app-side N+1 slug fan-out
3. Patch C — refinement dedupe
   - reuse the same bulk stats snapshot for `/refinement/stats`, `/leaderboard`, `/suggestions`
4. Patch D — scan fan-out guard
   - instrument source timings, then cache or demote the slowest upstreams

## Progress

- [x] App `/api/patterns/stats` now uses engine bulk stats endpoint
- [x] Engine `get_stats_sync()` record scan count reduced from 3 to 1 per slug
- [x] Refinement routes now share one cached stats snapshot per TTL window
- [ ] Explicit route/function timing instrumentation still pending

## Exit Criteria

- 측정 포인트가 endpoint/function 단위로 명시돼 있다.
- 1순위 병목 패치가 stats path로 합의돼 있다.
- 다음 구현 슬라이스가 measurement → dedupe → reuse 순서로 바로 시작 가능하다.

## Handoff Checklist

- 가장 느린 endpoint 후보: `/api/patterns/stats`
- 가장 큰 구조 병목: ledger JSON 재스캔
- 다음 패치 순서: app bulk stats fan-out 제거 → engine stats reuse → refinement reuse
