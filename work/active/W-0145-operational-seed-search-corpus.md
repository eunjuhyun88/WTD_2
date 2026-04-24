# W-0145 — Operational Seed Search Corpus Pipeline

## Goal

`worker-control` 가 시장/파생 시그니처를 주기적으로 수집해 durable corpus 로 누적 저장하고, 실제 프로덕트 surface 가 canonical `/search/*` plane 을 바로 소비해 최근/히스토리 유사 후보를 찾을 수 있게 한다.

## Owner

engine

## Primary Change Type

Engine logic change

## Scope

- seed-search 용 compact market corpus store 추가
- scheduler / jobs 에 corpus refresh lane 추가
- seed-search recent/historical retrieval 이 corpus 우선 read path 를 사용하도록 연결
- corpus signature 가 price/volume 뿐 아니라 cached perp(OI/funding/LS bias) 를 포함하도록 확장
- terminal seed-scout product route 가 canonical engine search plane 을 실제로 사용하도록 컷오버
- targeted engine/app tests 추가

## Non-Goals

- 모든 raw OHLCV/perp/onchain 틱 데이터를 장기 보관하는 데이터 레이크 구현
- BREAKOUT rule redesign 자체 구현
- Arkham / wallet / event enrichment 전체 상시 수집
- runtime plane 전체(authoritative captures/setups/pins/ledger) 완성

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0145-operational-seed-search-corpus.md`
- `docs/domains/multi-timeframe-autoresearch-search.md`
- `engine/search/*.py`
- `engine/api/routes/search.py`
- `engine/api/schemas_search.py`
- `engine/scanner/jobs/search_corpus.py`
- `engine/scanner/scheduler.py`
- `engine/api/routes/jobs.py`
- `app/src/routes/api/terminal/pattern-seed/match/+server.ts`
- `app/src/components/terminal/workspace/PatternSeedScoutPanel.svelte`
- `app/src/lib/contracts/search/*.ts`
- `app/src/lib/server/enginePlanes/search.ts`
- `engine/tests/test_search_corpus.py`
- `engine/tests/test_scheduler.py`
- `engine/tests/test_jobs_routes.py`
- `app/src/routes/api/terminal/pattern-seed/match/match.test.ts`
- `app/src/lib/server/enginePlanes/planeClients.test.ts`

## Facts

1. `origin/main` already contains canonical `engine/search`, `/search/*` routes, durable corpus tables, and scheduler/job wiring from PR #203.
2. terminal product surface `app/src/routes/api/terminal/pattern-seed/match/+server.ts` now uses canonical `/search/seed` behind a compatibility adapter, so the existing UI reads real corpus-backed search results.
3. app-side search contracts under `app/src/lib/contracts/search/*.ts` are aligned to current engine `/search/*` payloads for catalog/seed/scan.
4. the user requirement is operational: data must keep accumulating and be immediately searchable during live usage, not only fetched ad hoc per request.
5. `worker-control`/scheduler builds corpus windows without reopening the public engine API, so search accumulation stays behind offline cache truth.
6. the corpus/search baseline now persists OI/funding/long-short cues from cached perp frames, and the `15m` lane can warm missing sub-hour kline cache during corpus refresh.

## Assumptions

1. first slice can store compact rolling-window signatures plus window boundaries instead of full raw bars.
2. existing kline/perp caches remain the raw-source truth for replay; the new corpus is an index/search plane.
3. terminal seed-scout can keep its current response shape while internally adapting canonical search candidates into UI-friendly rows.

## Open Questions

- whether long-horizon corpus retention should later move from SQLite state files to shared Postgres/Supabase.

## Decisions

- first slice stores compact window signatures in an engine-local durable store and reuses cached raw market frames for replay.
- `engine/search` is the canonical package boundary; `engine/research/pattern_search.py` remains a legacy replay/benchmark adapter until later search route cuts.
- corpus refresh runs only in `worker-control` / scheduler lanes.
- corpus refresh must read cached `perp` alongside `klines` so search signatures carry OI/funding/long-short state without adding new live provider fan-out.
- sub-hour search support uses native cached bars; `15m` miss is warmed inside corpus refresh so founder-style lower-timeframe search can accumulate operationally.
- terminal seed-scout keeps its existing UI payload shape, but its server route must call canonical `/search/seed` and adapt the response instead of running its own heuristic scan path.
- app-side search contracts should be aligned to the engine route payloads before more consumers are cut over.

## Next Steps

1. add operational retention/monitoring around corpus refresh so scheduler-built search inventory is observable in production.
2. cut additional app/agent consumers over to canonical `/api/search/*` so product search no longer depends on legacy route-local assembly.
3. extend lower-timeframe support beyond `15m` and add replay bridge so founder structures can search across both corpus and exact benchmark windows.

## Exit Criteria

- a scheduler/job path exists that persists seed-search market corpus windows on an interval.
- the corpus accumulates window signatures durably across runs.
- terminal seed-scout uses canonical `/search/seed` results instead of the old heuristic-only scan path.
- app search contracts match the current engine `/search/*` payload shapes.
- targeted engine/app tests pass.

## Handoff Checklist

- active work item: `work/active/W-0145-operational-seed-search-corpus.md`
- branch: `codex/w-0145-operational-pipeline`
- worktree: `/private/tmp/wtd-v2-w0145-operational-pipeline`
- verification:
  - `npm --prefix app run test -- src/routes/api/terminal/pattern-seed/match/match.test.ts src/lib/server/enginePlanes/planeClients.test.ts`
  - `npm --prefix app run contract:check:engine-types`
  - `npm --prefix app run check` (`0 errors`, pre-existing `111 warnings`)
- `uv run --directory engine python -m pytest tests/test_search_routes.py tests/test_search_corpus.py tests/test_scheduler.py tests/test_jobs_routes.py -q` (`19 passed`)
- remaining blockers: runtime plane authority, richer onchain/event lanes, lower-timeframe corpus/replay breadth, and full app cutover remain future slices
