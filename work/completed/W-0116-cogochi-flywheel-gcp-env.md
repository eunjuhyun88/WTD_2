# W-0116 Checkpoint: Cogochi Flywheel Wiring + GCP Env Config

**Branch**: `claude/w-0116-alpha-agent`
**Merged to main**: 2026-04-22
**HEAD after merge**: `9db3ac29`

## Completed

### 1. Fix: Svelte 5 `state_unsafe_mutation` infinite loop — `TradeMode.svelte`
- **Root cause**: `klineWs` was `$state<WebSocket | null>(null)`. The WS `$effect` both read it (`klineWs?.close()`) and synchronously mutated it (`klineWs = new WebSocket(wsUrl)`), creating an infinite reactive cycle (compiled lines 649, 684).
- **Fix**: Changed to `let klineWs: WebSocket | null = null` — plain variable, not reactive state. Template never reads it, so no Svelte tracking needed.
- **Rule**: Never use `$state` for non-template variables inside effects that both read and write them synchronously.

### 2. Feat: JUDGE tab → flywheel save
- Added `$effect` at line ~217 that auto-POSTs to `/api/cogochi/outcome` when `judgeOutcome` changes.
- Deferred via `Promise.resolve().then(...)` to avoid `state_unsafe_mutation`.

### 3. Feat: SCAN tab → live world model data
- `$effect` on mount + 5min interval polls `/api/cogochi/alpha/world-model`.
- Replaced hardcoded mock data with live engine response.

### 4. GCP Cloud Run ENGINE_URL config
- Added `ENGINE_URL=https://wtd-2-3u7pi6ndna-uk.a.run.app` to `app/.env.local`.
- Added `ENGINE_URL` to Vercel production env via `vercel env add`.
- Engine verified: `GET /readyz` → `{"status":"ready","version":"0.2.0","engine_mode":"full","degraded":false}`.

### 5. Infra: `cloudbuild.yaml` + `.gitignore`
- `cloudbuild.yaml`: region `us-east4` → `asia-southeast1`, `_APP_ORIGIN` = `https://app.cogotchi.dev`, `ENGINE_ALLOWED_HOSTS` added, `--set-env-vars` → `--update-env-vars`.
- `.gitignore`: broadened ledger_records patterns to cover all JSON artifacts under any subdirectory.

## Non-Goals
- Engine is on GCP Cloud Run (`asia-southeast1`), not localhost. Do not restart local Python engine.
- `.env.local` is gitignored — Vercel env vars are the production source.

## Exit Criteria (all met)
- [x] SCAN tab loads live data (no hardcoded mock)
- [x] JUDGE outcome saves to flywheel endpoint
- [x] No `state_unsafe_mutation` or `effect_update_depth_exceeded` errors
- [x] ENGINE_URL points to GCP Cloud Run in both local and Vercel envs
- [x] Merged to main, pushed
