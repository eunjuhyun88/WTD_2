# W-0119 Project Audit Report

## Executive Summary

The project has solid intent around boundary setting and some recent hardening, but several production-critical gaps remain. The most urgent issue is that `app` publicly exposes whole API prefixes that include mutating and cost-bearing routes, which allows anonymous callers to hit server-side LLM and training paths. The second urgent issue is exchange credential encryption silently falling back to a hardcoded default key. Performance-wise, the biggest scaling risks are the file-backed pattern ledger stats path, repeated fan-out fetch patterns, and large monolithic orchestration files that mix I/O, policy, and scoring.

## Critical Findings

### AUDIT-001 — Public API prefix exposes anonymous LLM/tool execution and write paths
- Severity: Critical
- Location:
  - `app/src/hooks.server.ts`
  - `app/src/routes/api/cogochi/terminal/message/+server.ts`
  - `app/src/routes/api/cogochi/outcome/+server.ts`
  - `app/src/routes/api/patterns/scan/+server.ts`
  - `app/src/routes/api/patterns/[slug]/capture/+server.ts`
  - `app/src/routes/api/patterns/[slug]/verdict/+server.ts`
- Evidence:
  - `hooks.server.ts` marks `/api/cogochi/` and `/api/patterns/` as public prefixes.
  - `terminal/message` has no auth check and can call `callLLMStreamWithTools(...)` plus `executeTool(...)`.
  - `cogochi/outcome` accepts writes and falls back to `userId = 'anon'`.
  - `patterns/scan`, `patterns/[slug]/capture`, and `patterns/[slug]/verdict` proxy mutating engine calls with only per-IP in-memory limiting.
- Impact:
  - Anonymous users can spend server LLM budget, trigger tool fan-out, poison outcome/training data, and mutate pattern capture/verdict state without authentication.
- Fix:
  - Replace broad public prefix allowlists with explicit per-route allowlists.
  - Require authenticated session for all mutating `cogochi` and `patterns` routes.
  - Move anonymous-safe read routes into a narrower public list.

### AUDIT-002 — Exchange secrets can be encrypted with a hardcoded default key
- Severity: Critical
- Location:
  - `app/src/lib/server/exchange/binanceConnector.ts`
  - `app/src/routes/api/exchange/connect/+server.ts`
  - `app/src/routes/api/exchange/import/+server.ts`
- Evidence:
  - `binanceConnector.ts` uses `process.env.EXCHANGE_ENCRYPTION_KEY ?? 'default-dev-key-change-in-production!!'`.
  - `connect` and `import` routes call this crypto path directly.
- Impact:
  - If the env var is absent in any deployed environment, exchange API keys are encrypted with a known static secret and are effectively recoverable.
- Fix:
  - Remove the fallback entirely and fail closed when the encryption key is missing.
  - Migrate this code to the existing `secretCrypto.ts` abstraction with versioned ciphertexts.

## High Findings

### AUDIT-003 — Engine runtime security assertion is a no-op
- Severity: High
- Location:
  - `engine/security_runtime.py`
  - `engine/api/main.py`
- Evidence:
  - `main.py` calls `assert_public_runtime_security()`.
  - `security_runtime.py` defines `assert_public_runtime_security()` as `return None`.
- Impact:
  - Intended production validation for docs exposure, allowed hosts, and origin settings is never enforced at startup.
  - If `engine-api` is internet reachable, the current FastAPI surface relies entirely on deployment assumptions.
- Fix:
  - Make `assert_public_runtime_security()` raise on `get_public_runtime_security_errors()`.
  - Keep warnings separate from hard failures.

### AUDIT-004 — User-supplied LLM API keys are persisted in `localStorage`
- Severity: High
- Location:
  - `app/src/lib/stores/douniRuntime.ts`
- Evidence:
  - `APIKEY_STORAGE = 'douni_api_key'`
  - `localStorage.setItem(APIKEY_STORAGE, apiKey)`
- Impact:
  - Any XSS in the app can exfiltrate third-party API keys immediately.
  - Browser storage also makes secret lifecycle and revocation harder to reason about.
- Fix:
  - Prefer session-scoped memory only, or store encrypted server-side per user.
  - If browser persistence is unavoidable, document it as insecure-by-design and gate it behind explicit opt-in.

## Medium Findings

### AUDIT-005 — Pattern stats path does repeated full-directory scans and N+1 engine fetches
- Severity: Medium
- Location:
  - `app/src/routes/api/patterns/stats/+server.ts`
  - `engine/api/routes/patterns_thread.py`
  - `engine/ledger/store.py`
- Evidence:
  - `patterns/stats` fetches `/patterns/library`, then per-slug stats in parallel.
  - `get_stats_sync()` calls `ledger.compute_stats(slug)`, `ledger.list_all(slug)`, `LEDGER_RECORD_STORE.compute_family_stats(slug)`, and extra record lookups.
  - `LedgerStore.list_all()` and `LedgerRecordStore.list()` re-read all JSON files via `glob("*.json")` + `json.load(...)`.
- Impact:
  - Stats fan-out scales with both pattern count and ledger file count, causing disk-heavy bursts and slow dashboard/pattern views as data grows.
- Fix:
  - Add aggregated stats/materialized summaries or move ledger storage to a queryable store.
  - Avoid recomputing `list_all()` multiple times inside a single request.

### AUDIT-006 — Trade import writes one row per query in a serial loop
- Severity: Medium
- Location:
  - `app/src/lib/server/exchange/binanceConnector.ts`
- Evidence:
  - `saveImportedTrades()` loops over trades and runs `await query(...)` per item.
- Impact:
  - Large imports incur one DB round-trip per trade, making imports slow and increasing connection pressure.
- Fix:
  - Batch inserts in chunks or use a single multi-row insert/upsert per import page.

### AUDIT-007 — Metrics keying uses raw request paths, creating high-cardinality memory growth
- Severity: Medium
- Location:
  - `engine/api/main.py`
  - `engine/observability/metrics.py`
- Evidence:
  - `observe_ms(f"http.route.{request.url.path}", duration_ms)` uses the literal path.
  - Metrics storage caps samples per key, but not the number of keys.
- Impact:
  - Paths containing slugs, symbols, or IDs create unbounded metric names and memory growth over time.
- Fix:
  - Record templated route names or a bounded route label, not raw request paths.

## Refactor Hotspots

### HOTSPOT-001 — `scanEngine.ts` is a single-file orchestration monolith
- Location: `app/src/lib/server/scanEngine.ts`
- Why it matters:
  - One file owns fan-out fetch, fallback/cache policy, feature derivation, eight-agent scoring, and response assembly.
  - This makes correctness review, latency tuning, and source-specific caching changes unnecessarily risky.

### HOTSPOT-002 — `patterns.py` contains duplicate route definitions
- Location: `engine/api/routes/patterns.py`
- Why it matters:
  - `/{slug}/train-model` and `/{slug}/promote-model` are declared twice.
  - The later handlers are effectively dead or ambiguous, which raises maintenance risk and makes behavior harder to reason about.

### HOTSPOT-003 — `toolExecutor.ts` reimplements pattern stats fan-out logic
- Location: `app/src/lib/server/douni/toolExecutor.ts`
- Why it matters:
  - The DOUNI tool path duplicates engine fetch orchestration already present elsewhere.
  - This increases drift risk and compounds upstream load.

## Verification Run

- `uv run pytest tests/test_pattern_candidate_routes.py -q` → passed (`9 passed`)
- `npm run check` in `app/` → failed
  - Current blocking errors are in:
    - `app/src/components/terminal/mobile/BottomTabBar.svelte`
    - `app/src/components/terminal/mobile/ModeRouter.svelte`
  - The app also has many pre-existing Svelte warnings unrelated to this audit.

## Rebase Review Addendum

- User-requested `fetch + rebase + full review` was executed in clean worktree `/tmp/wtd-v2-review-w0119` to avoid disturbing the dirty primary worktree.
- Rebased branch `codex/w0119-review-rebase` is now `2` commits ahead of `origin/main`, `0` behind.
- Post-rebase diff narrowed to `app/src/lib/cogochi/modes/TradeMode.svelte` only.
- Additional regression findings on that rebased diff:
  - `JUDGE` auto-save uses a broad `$effect` and can replay POSTs on symbol/timeframe/analyze refresh, duplicating or misattributing outcome records.
  - `SCAN` maps Alpha phases as `HOT/WARM/COLD/COMPLETE`, but engine returns `SCREENING_GATE` / `ACCUMULATION_ZONE` / `SQUEEZE_TRIGGER`, so live candidates collapse to default ordering/scores.

## Recommended Order

1. Lock down public API exposure in `hooks.server.ts` and require auth on mutating/cost-bearing routes.
2. Remove the exchange encryption fallback key and migrate to shared secret crypto.
3. Re-enable real engine runtime security assertions.
4. Eliminate repeated file scans in pattern stats and batch the trade import path.
5. Split `scanEngine.ts` and remove duplicate route definitions in `engine/api/routes/patterns.py`.
