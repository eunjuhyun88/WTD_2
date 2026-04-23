# W-0145 — Operational Seed Search Corpus Pipeline

## Goal

`worker-control` 가 시장/파생 시그니처를 주기적으로 수집해 durable corpus 로 누적 저장하고, `seed_search` 가 요청 시 그 코퍼스를 우선 사용해 즉시 최근/히스토리 유사 후보를 찾을 수 있게 한다.

## Owner

engine

## Primary Change Type

Engine logic change

## Scope

- seed-search 용 compact market corpus store 추가
- scheduler / jobs 에 corpus refresh lane 추가
- seed-search recent/historical retrieval 이 corpus 우선 read path 를 사용하도록 연결
- targeted engine tests 추가

## Non-Goals

- 모든 raw OHLCV/perp/onchain 틱 데이터를 장기 보관하는 데이터 레이크 구현
- app surface / compare UI 작성
- BREAKOUT rule redesign 자체 구현
- Arkham / wallet / event enrichment 전체 상시 수집

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0145-operational-seed-search-corpus.md`
- `docs/domains/query-by-example-pattern-search.md`
- `docs/domains/multi-timeframe-autoresearch-search.md`
- `engine/search/*.py`
- `engine/api/routes/search.py`
- `engine/api/schemas_search.py`
- `engine/scanner/jobs/search_corpus.py`
- `engine/scanner/scheduler.py`
- `engine/api/routes/jobs.py`
- `engine/tests/test_search_corpus.py`
- `engine/tests/test_scheduler.py`
- `engine/tests/test_jobs_routes.py`

## Facts

1. current checkout has no `engine/research/seed_search.py`; active search code lives in replay benchmark/search modules, while product seed-search still lacks a canonical engine search package.
2. `worker-control` runtime and scheduler lane already exist, so continuous background collection can be added without reopening public `engine-api`.
3. Alpha observer jobs already prove a `cold/warm` background observation pattern, but that path is pattern-specific and not reusable as canonical seed-search corpus storage.
4. the user requirement is operational: data must keep accumulating and be immediately searchable during live usage, not only fetched ad hoc per request.
5. the terminal AI agent should not trigger broad historical/provider fan-out on every message; wide retrieval must move behind a scheduler-built corpus.

## Assumptions

1. first slice can store compact rolling-window signatures plus window boundaries instead of full raw bars.
2. existing kline/perp caches remain the raw-source truth for replay; the new corpus is an index/search plane.

## Open Questions

- whether long-horizon corpus retention should later move from SQLite state files to shared Postgres/Supabase.

## Decisions

- first slice stores compact window signatures in an engine-local durable store and reuses cached raw market frames for replay.
- first W-0145 commit creates `engine/search` as the canonical package boundary; `engine/research/pattern_search.py` remains a legacy replay/benchmark adapter until later search route cuts.
- first W-0145 commit persists only compact corpus windows and initializes the future `search_seed_*` / `search_scan_*` tables; public app integration waits for canonical `/search/*` routes.
- corpus refresh runs only in `worker-control` / scheduler lanes.
- seed-search uses corpus-first retrieval with fallback to the existing cached-frame scan so rollout stays reversible.
- corpus is the search-plane boundary: terminal AI / app surfaces consume ranked results and compact context, not the raw historical scan itself.

## Next Steps

1. add seed/scan route skeleton and run persistence.
2. wire seed-search retrieval to corpus-first reads with fallback to replay/cache scan.
3. add app `/api/search/*` consumer only after engine seed/scan payloads are stable.

## Exit Criteria

- a scheduler/job path exists that persists seed-search market corpus windows on an interval.
- the corpus accumulates window signatures durably across runs.
- seed-search market/historical retrieval can use the stored corpus without recomputing the whole universe on every request.
- targeted engine tests pass.

## Handoff Checklist

- active work item: `work/active/W-0145-operational-seed-search-corpus.md`
- branch: `codex/w-0145-corpus-plane`
- worktree: `/private/tmp/wtd-v2-w0145-corpus-plane`
- verification: engine targeted `pytest tests/test_search_routes.py tests/test_search_corpus.py tests/test_scheduler.py tests/test_jobs_routes.py -q` = `15 passed`; `npm --prefix app run contract:check:engine-types` = passed; `npm --prefix app run check` = `0 errors`, pre-existing `111 warnings`
- remaining blockers: shared-state migration, richer onchain/event lanes, and sub-hour replay breadth remain future slices
