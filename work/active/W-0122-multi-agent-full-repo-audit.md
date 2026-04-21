# W-0122 Multi-Agent Full Repo Audit

## Goal

Use the repo-wide audit as the master sequential remediation plan, then land the remaining slices in order without relying on chat history.

## Owner

app

## Scope

- keep `Phase 1` and `Phase 2` closure intact after the `origin/main` rebase
- preserve the landed `Phase 3A` shared scan helpers
- execute the next `Phase 3B` hot-path slice on record-family read paths only

## Non-Goals

- reopening already-set `Phase 1` / `Phase 2` sequencing
- mixing scan refactors with DOUNI structural decomposition
- redesigning `scanEngine.ts` wholesale in this slice

## Canonical Files

- `work/active/W-0122-multi-agent-full-repo-audit.md`
- `work/completed/W-0122-multi-agent-full-repo-audit.md`
- `docs/domains/pattern-engine-runtime.md`
- `app/src/lib/server/scanner.ts`
- `app/src/lib/server/douni/toolExecutor.ts`

## Facts

- The branch has been rebased onto `origin/main` and the rebase conflicts were resolved and revalidated.
- `Phase 1` and the first `Phase 2` contract-convergence slice still pass targeted app and engine tests after the rebase.
- `app/src/lib/server/scan/normalize.ts` now owns the shared snapshot-input normalization path for `MarketContext`, `ExtendedMarketData`, OI delta, ticker folding, force-order mapping, and series shaping.
- `app/src/lib/server/scan/concurrency.ts` now owns the bounded fan-out helper for multi-symbol scan execution.
- `scanner.ts` and `douni/toolExecutor.ts` consume the shared helpers, and targeted verification passes after the extraction.

## Assumptions

- The rebase-induced `work/active -> work/completed` movement is not itself part of this slice and should remain untouched outside this work item restore.

## Open Questions

- None.

## Decisions

- Treat `work/completed/W-0122-multi-agent-full-repo-audit.md` as the archived master design and this file as the active execution cursor.
- Keep `Phase 3A` surgical: shared normalization helpers first, consumer migration second, no `scanEngine.ts` rewrites yet.
- Treat the `Phase 3A` helper extraction and bounded fan-out change as complete on this branch.
- Verify the rebase result before continuing feature work, then keep the next slice limited to app-side scan internals.
- Scope `Phase 3B` to record-family consumers first:
  - `engine/api/routes/patterns_thread.py` should stop re-reading full record families just to compute counts and latest training/model records
  - `engine/api/routes/observability.py` should stop iterating every ledger record file for global KPI counts
- Defer `pattern_outcomes` materialization or `SupabaseLedgerStore.compute_stats()` SQL aggregation to a follow-up slice because it changes the outcome-plane more deeply than this pass.

## Current Status

- Rebase onto `origin/main` is complete.
- Rebase conflict resolutions for app contract routes and engine auth/runtime files passed targeted verification:
  - `npm --prefix app run test -- 'src/routes/api/engine/[...path]/engine-proxy.test.ts' 'src/routes/api/market/snapshot/snapshot.test.ts' 'src/routes/api/captures/[id]/verdict/verdict-route.test.ts' 'src/routes/api/patterns/[slug]/verdict/verdict-shim.test.ts'`
  - `uv run pytest engine/tests/test_security_runtime.py engine/tests/test_internal_auth_middleware.py engine/tests/test_jobs_routes.py`
- `Phase 3A` 1차 shared scan normalization slice is now implemented:
  - shared helper module added at `app/src/lib/server/scan/normalize.ts`
  - `scanner.ts` now uses the shared bundle builder for base snapshot inputs
  - `douni/toolExecutor.ts` now uses the same shared bundle builder and shared mapping helpers
  - new unit coverage added at `app/src/lib/server/scan/normalize.test.ts`
- `Phase 3A` 2차 fan-out control slice is now implemented:
  - shared concurrency helper added at `app/src/lib/server/scan/concurrency.ts`
  - `scanMarket` no longer uses naked `Promise.allSettled(symbols.map(...))`
  - per-request parallelism is now capped by `SCAN_MARKET_MAX_PARALLEL_SYMBOLS`
  - unit coverage added at `app/src/lib/server/scan/concurrency.test.ts`
- Verification for the `Phase 3A` slice:
  - `npm --prefix app run test -- 'src/lib/server/scan/normalize.test.ts' 'src/lib/server/scan/concurrency.test.ts'`
  - `npm --prefix app run check` completed with `0 errors` and existing warnings only
  - `UV_CACHE_DIR=/tmp/wtd-v2-uv-cache uv run --directory engine python -m pytest tests/test_patterns_scanner.py tests/test_worker_research_jobs.py tests/test_ledger_store.py -q`
- `Phase 3B` target has been narrowed before implementation:
  - add record-store summary/count helpers that concrete stores can optimize
  - migrate `patterns_thread` and `observability` to those helpers
  - keep route contracts unchanged while reducing repeated ledger scans
- `Phase 3B` record-family hot-path slice is now implemented:
  - `engine/ledger/store.py` exposes `summarize_family(...)` and `count_records(...)` on the file-backed record store
  - `engine/ledger/supabase_record_store.py` exposes the same helpers with count/latest-query implementations
  - `engine/api/routes/patterns_thread.py` now prefers `summarize_family(...)` over re-reading full record families inside the route helper
  - `engine/api/routes/observability.py` now prefers `count_records(...)` over iterating every ledger record file for KPI counts
- Verification for the `Phase 3B` record-family slice:
  - `UV_CACHE_DIR=/tmp/wtd-v2-uv-cache uv run --directory engine python -m pytest tests/test_ledger_store.py tests/test_pattern_candidate_routes.py tests/test_observability_flywheel.py -q`
  - `UV_CACHE_DIR=/tmp/wtd-v2-uv-cache uv run --directory engine python -m pytest tests/test_refinement_routes.py tests/test_patterns_scanner.py tests/test_worker_research_jobs.py -q`
  - `python3 -m compileall engine/api/routes/patterns_thread.py engine/api/routes/observability.py engine/ledger/store.py engine/ledger/supabase_record_store.py`
- `Pattern outcomes batch fetch` slice (W-0122/W-0125) is now implemented:
  - `SupabaseLedgerStore.batch_list_all()` — single SELECT on `pattern_outcomes`, Python-side group-by-slug
  - `get_all_stats_sync()` in `patterns_thread.py` — 1 batch roundtrip instead of 2N per-slug queries; timing log added
  - `_build_refinement_snapshot()` in `refinement.py` — same batch path + timing log
  - `get_stats_sync()` — accepts pre-fetched `outcomes` to avoid double list_all call
- Verification:
  - `UV_CACHE_DIR=/tmp/wtd-v2-uv-cache uv run --directory engine python -m pytest tests/test_refinement_routes.py tests/test_pattern_candidate_routes.py tests/test_ledger_store.py tests/test_patterns_scanner.py tests/test_worker_research_jobs.py tests/test_observability_flywheel.py -q` — 56 passed

## Next Steps

1. Phase 4 structural decomposition (deferred): DOUNI executor split into dispatcher/handlers/engine-client.
2. Legacy shim removal after all callers migrate to named app routes.
3. `scanEngine.ts` stays untouched until further redesign is warranted.

## Exit Criteria

- `scanner.ts` and `douni/toolExecutor.ts` no longer hand-build duplicate base snapshot inputs.
- The shared helper set lives under `app/src/lib/server/scan/`.
- Rebase-resolved `Phase 1` / `Phase 2` behavior remains green after the `Phase 3A` change.
- `patterns_thread` no longer computes record-family counts by scanning `LEDGER_RECORD_STORE.list(slug)`.
- `observability` no longer walks every ledger record file to compute flywheel KPIs.

## Handoff Checklist

- Active branch: `claude/w-0126-ledgerstore-supabase`
- Verification status:
  - rebase conflict tests passed for app routes and engine auth/jobs
  - `Phase 3A` normalization + concurrency helper tests passed
  - `npm --prefix app run check` passed with warnings only
  - `tests/test_ledger_store.py`, `tests/test_pattern_candidate_routes.py`, and `tests/test_observability_flywheel.py` passed with `/tmp` uv cache
  - `tests/test_refinement_routes.py`, `tests/test_patterns_scanner.py`, and `tests/test_worker_research_jobs.py` passed with `/tmp` uv cache
- Known blockers:
  - `scanEngine.ts` already has local in-flight decomposition and should stay out of the first shared-core slice
  - `pattern_outcomes` aggregate stats are still computed by full outcome reads, so refinement and `/patterns/stats/all` are not yet fully de-risked
