# W-0093 Checkpoint — 2026-04-18 Session 3

## Session Summary

Fixed W-0092 CI failures (App CI + Contract CI), repaired main CI after premature merge, then applied full Tier 2+3 Vercel optimization.

## Commits (main, since session 2)

| hash | description |
|------|-------------|
| `b799872` | Merge PR #83 (W-0092 user overlay — live signal display + verdict capture) |
| `e6acda4` | fix(app): repair App CI and Contract CI after W-0092 merge |
| `80d4e74` | chore(vercel): optimize deployment config for monorepo + production reliability |
| `3f25519` | perf(vercel): per-route function splitting (Tier 2 optimization) |
| `edc414c` | perf(vercel): Tier 3 — ISR + prerender + light-route downgrade |

## CI Fixes Applied (e6acda4)

### App CI — 3 root causes
1. `buildTerminalBootstrapTasks` test missing `loadLiveSignals: noop` arg → added; expected array extended to `[120,220,320,420,520,620]`
2. `TerminalLeftRail.svelte` 10 svelte-check errors: `onSelect`, `createSymbolSelection`, `createTerminalSelection` undeclared → added imports + prop
3. `engine-openapi.d.ts` stale (missing /live-signals + /verdict routes) → regenerated via `npm run contract:sync:engine-types`

## Vercel Optimizations Applied (80d4e74 → edc414c)

### Tier 2 — Function Splitting
- `app/vercel.json` created (root vercel.json was ignored; Vercel rootDirectory=app)
- Per-route `export const config` on 8 route groups:
  - `cogochi/terminal/message`: 1769MB, 300s (streaming AI)
  - `api/engine/[...path]`: 1024MB, 90s
  - `api/wallet/intel`, `api/terminal/intel-policy`: 1024MB, 30s
  - `healthz`, `robots.txt`, `sitemap.xml`: 128MB, 5s

### Tier 3 — ISR + Prerender
- Prerender: `/`, `/passport`, `/settings` → static HTML at build time
  - CRITICAL FIX: `hooks.server.ts` moved `assertAppServerRuntimeSecurity` into `handle()` and guarded by `if (!building)` — prerender calls handle() at build time where env vars aren't present
- ISR: new `/api/live-signals/+server.ts` with `isr: { expiration: 60 }` (60s CDN cache)
- New `/api/live-signals/verdict/+server.ts` (mutation route, no ISR)
- `terminalDataOrchestrator.ts` rewired: `/api/engine/live-signals` → `/api/live-signals`

## Verified (before push)
- `npm run check`: 0 errors
- `npm run test:run`: 112 tests pass
- Prerender static files generated for `/`, `/passport`, `/settings`
- ISR config present: `.vercel/output/functions/api/live-signals.prerender-config.json`

## Key Decisions
- Edge runtime rolled back (10+ server modules use `node:crypto` — not edge-compatible)
- ISR only on `/api/live-signals` (60s expiration, not verdict which is a mutation)
- `capture_kind = "manual_hypothesis"` for app-initiated captures (no phase/transition in app)

## Next — W-0088 Phase A
- `createPatternCapture` → engine POST dual-write (engine first, then app DB)
- `listPatternCaptures` → engine GET read-through with app DB fallback
- Engine changes: make `pattern_slug` and `phase` optional with defaults in `CaptureCreateBody`
