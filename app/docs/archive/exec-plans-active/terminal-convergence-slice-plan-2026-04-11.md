# Terminal Convergence Slice Plan

Date: 2026-04-11
Status: active (scaffold + sequencing)
Owner slice: `claude/objective-vaughan`
Depends on: `chatbattle-repo-wide-refactor-design-2026-04-11.md` (W4), `three-pipeline-integration-design-2026-04-11.md` (Phase 4)

## Purpose

Three route shells currently implement overlapping terminal experiences:

| Route | Current LOC | Role today |
|---|---:|---|
| `/terminal` | 1660 | Canonical conversational terminal (LLM greeting, scan scroll, deep-dive widgets). Actively touched on main; freshest UX. |
| `/terminal-legacy` | 3453 | Earlier monolithic dashboard terminal. Retained as reference; no active feature work. |
| `/cogochi/scanner` | 1634 | Branded "scanner" surface. Duplicates scan + analyze plumbing with its own presentation. |

Total: ~6,747 LOC of tangled orchestration + presentation across three shells. Each shell runs its own `fetch('/api/cogochi/...')` blocks, duplicates `MessageType` / `Widget` / `SSEEvent` interfaces, and owns route-local state for the same domain.

The goal of this workstream is to converge all three onto ONE controller stack so that:

1. Alpha Flow density work stops forking between routes.
2. NL router (three-pipeline Phase 5) has one integration point.
3. The harness engine-spec contract IDs (`feat.*`, `event.*`, `state.*`, `verdict.*`) flow through one path.
4. Future surface reduction (W6) can retire `/terminal-legacy` without tracing inline fetches.

## Non-negotiables

1. **Do not rewrite.** The 6.7k LOC stay working throughout the migration. Each slice is additive or substitutive with green `npm run check` and a live smoke test.
2. **Shared types first.** Nothing else in this workstream lands before `src/lib/features/terminal/types.ts` is the single source of truth for the three shells.
3. **`/terminal` is the canonical target.** It has the freshest UX (LLM greeting from `db71d47`, friendly error handling from `db71d47`) and the lowest LOC of the three shells. `/terminal-legacy` becomes migration-only, `/cogochi/scanner` becomes a branded wrapper.
4. **Controllers receive `eventFetch: typeof fetch` as first arg.** SSR + client + server-run controllers share one code path.
5. **Every controller goes through `readRaw()` (Phase 1 A-P0)** for any raw source it needs. Inline HTTP calls to binance / coingecko / alternative.me are forbidden inside controllers.

## Scaffold landed in this slice

This document is committed together with the following scaffolding changes — they are additive, compile-clean, and introduce the feature boundary with ZERO route-shell edits.

### `src/lib/features/terminal/types.ts`

Single source of truth for:
- `TerminalMessage`
- `TerminalWidget` + `TerminalMetricItem` + `TerminalLayerItem`
- `TerminalFeedEntry`
- `TerminalSSEEvent`

These are the types that all three shells duplicate inline today. Subsequent slices migrate the shells to import from here.

### `src/lib/features/terminal/index.ts`

Public barrel. Consumers import from `$lib/features/terminal`, not from sub-paths.

### `src/lib/features/terminal/controllers/index.ts`

Empty barrel + rule statement. This is the intended home for every async orchestration function the terminal needs. Currently empty; future controllers land here in the extraction slice.

### No route-shell changes in this slice

`/terminal`, `/terminal-legacy`, `/cogochi/scanner` are untouched. The scaffolding is invisible at runtime; this commit is pure preparation.

## Slice sequence after this scaffold

### D2 — Consolidate type duplication

- Migrate `/terminal` to import `TerminalMessage` / `TerminalWidget` / `TerminalFeedEntry` / `TerminalSSEEvent` from `$lib/features/terminal`.
- Delete the inline copies in the route shell.
- Delete any types that are no longer referenced.
- Target: `/terminal/+page.svelte` from 1660 LOC → ~1580 LOC.
- No behavior change. Verified by type check + dev server smoke.

### D3 — Extract `sendMessageController`

- Create `src/lib/features/terminal/controllers/sendMessage.ts`.
- Take the SSE handshake + event loop out of `handleSend` in `/terminal/+page.svelte`.
- Controller signature:
  `sendMessage(eventFetch, { query, context }) → AsyncIterable<TerminalFeedEntry>`.
- Route shell becomes a thin consumer that pushes yielded entries to `$state`.
- Target: `/terminal/+page.svelte` from ~1580 LOC → ~1350 LOC.

### D4 — Extract `runScanController` and `previewSymbolController`

- Create `controllers/runScan.ts` and `controllers/previewSymbol.ts`.
- Take `handleQuickScan`, `handleQuickPreview`, `handleQuickAnalyze` out of the route shell.
- All three controllers share the same `TerminalFeedEntry` emission pattern.
- Target: `/terminal/+page.svelte` from ~1350 LOC → ~1100 LOC.

### D5 — Migrate `/terminal-legacy` to the same controllers

- `/terminal-legacy` imports from `$lib/features/terminal/controllers`.
- Inline fetches are deleted.
- Types consolidated against `types.ts`.
- Target: `/terminal-legacy/+page.svelte` from 3453 → ~2900 LOC first cut, further reduction in later W2 slices.

### D6 — Convert `/cogochi/scanner` to a branded wrapper

- `/cogochi/scanner/+page.svelte` becomes a thin wrapper that reuses the same controller stack but with cogochi branding hooks.
- If the product decision is that cogochi branding is no longer needed, the route becomes a redirect to `/terminal`.
- This is the first W6 (surface reduction) win this workstream produces.

### D7 — Delete shell duplication

- Audit every inline type + fetch in the three shells.
- Delete any that have equivalents in `$lib/features/terminal`.
- Warning budget recheck.

### D8 — Connect Phase 3 verdict_block

- Once the controllers are the single entry point, wire `verdict_block` (three-pipeline Phase 3 output) through `TerminalSSEEvent` so the UI reads the schema directly instead of reconstructing a verdict shape in the browser.
- This is the join point between the terminal convergence workstream and the three-pipeline integration design.

## Why this slice is small

D1 (this commit) is deliberately scaffold-only because:

1. W4 in the repo-wide refactor design is sequenced AFTER W2 (route-shell decomposition) and W3 (state authority repair) in Phase 2 of that doc's execution order. Starting W4 implementation today jumps ahead of its own preconditions.
2. The three-pipeline integration design places terminal+cogochi convergence as a Phase 4 concern (after scanEngine decomposition in Phase 3). The contract-first principle says: do not rewrite controllers that will have to change shape again when Phase 3 lands.
3. The 6.7k LOC across three shells cannot be refactored in one reviewable commit. D2–D7 each stand on their own and each can be merged independently.

## Exit criteria for this slice (D1)

| Gate | Result |
|---|---|
| `src/lib/features/terminal/types.ts` committed | ✅ |
| `src/lib/features/terminal/index.ts` committed | ✅ |
| `src/lib/features/terminal/controllers/index.ts` committed (empty barrel) | ✅ |
| This plan document committed | ✅ |
| `npm run check` green | ✅ |
| `npm run build` green | ✅ |
| Route shells untouched in this commit | ✅ |

## Non-claims

This slice does NOT:
- Migrate any route shell.
- Reduce any file's LOC.
- Define the controller function signatures beyond a naming sketch.
- Commit to a timeline for D2–D8.
- Decide whether `/cogochi/scanner` becomes a wrapper or a redirect.

Those decisions live in the subsequent D slices, each of which opens its own plan section as it starts.
